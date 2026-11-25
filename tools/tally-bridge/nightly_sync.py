#!/usr/bin/env python3
"""Nabiad Bridge: nightly runner + helpers used by the setup window (setup_gui.pyw).

Run by Windows Task Scheduler (default 00:30, stops by 06:00):  py nightly_sync.py --until 06:00
First full history load on a new PC:                              py nightly_sync.py --backfill

What it does, in this order, for every company in config.json:
  1. check that Tally answers on its port (waits and retries until the end time, a crashed Tally is never hammered);
  2. check that the company is loaded in Tally (a company that is not loaded is skipped, never replaced by another one);
  3. run bridge.py for that company (read-only from Tally, upsert into Supabase);
  4. a company that fails 3 times is skipped and written to tally_sync_runs and nightly_status.json.
The bridge password is stored encrypted for THIS Windows user only (Windows DPAPI) in bridge_secret.json.
Nothing here ever writes to Tally.
"""
import argparse, base64, datetime as dt, json, os, subprocess, sys, time, urllib.parse
import xml.etree.ElementTree as ET

if sys.stdout is None:  # started by pythonw (no console window): keep print() harmless, the log file has everything
    sys.stdout = open(os.devnull, "w")
if sys.stderr is None:
    sys.stderr = sys.stdout

FROZEN = bool(getattr(sys, "frozen", False))  # packaged with PyInstaller: one exe runs the app, the engine (--engine) and bridge.py (--bridge)
HERE = os.path.dirname(os.path.abspath(sys.executable if FROZEN else __file__))
CONFIG = os.path.join(HERE, "config.json")
SECRET = os.path.join(HERE, "bridge_secret.json")
LOG = os.path.join(HERE, "nightly_log.txt")
STATUS = os.path.join(HERE, "nightly_status.json")
LOCK = os.path.join(HERE, "nightly.lock")
STOP_FLAG = os.path.join(HERE, "nightly_stop.flag")
SCHEDULE_STATE = os.path.join(HERE, "schedule_state.json")
SCHEDULE_REVISION = 2  # raise when the way the task is created changes; the app then asks for one click on "Install schedule"
TASK_NAME = "NabiadBridgeNightly"
CREATE_NO_WINDOW = 0x08000000


# ---------------------------------------------------------------- logging
def log(msg):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + str(msg)
    print(line, flush=True)
    try:
        if os.path.exists(LOG) and os.path.getsize(LOG) > 3_000_000:  # keep the log small: drop the older half
            with open(LOG, "rb") as f:
                data = f.read()
            with open(LOG, "wb") as f:
                f.write(data[len(data) // 2:])
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


# ---------------------------------------------------------------- one job at a time (released by Windows even if the program crashes)
_lock_handle = None


def acquire_lock():
    """True if this process now owns the job lock. Manual runs, the scheduled task and the GUI all share it."""
    global _lock_handle
    f = open(LOCK, "a+")
    try:
        if os.name == "nt":
            import msvcrt
            f.seek(0)
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        f.close()
        return False
    _lock_handle = f
    return True


def lock_is_free():
    f = open(LOCK, "a+")
    try:
        if os.name == "nt":
            import msvcrt
            f.seek(0)
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
            f.seek(0)
            msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            fcntl.flock(f, fcntl.LOCK_UN)
        return True
    except OSError:
        return False
    finally:
        f.close()


def nap(seconds):
    """Sleep in 1 second steps so a Stop request is noticed quickly."""
    end = time.time() + seconds
    while time.time() < end and not stop_requested():
        time.sleep(min(1, max(0, end - time.time())))


def stop_requested():
    return os.path.exists(STOP_FLAG)


# ---------------------------------------------------------------- password storage (Windows DPAPI, current user only)
def _dpapi():
    import ctypes
    from ctypes import wintypes

    class Blob(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.c_void_p)]

    crypt32, kernel32 = ctypes.windll.crypt32, ctypes.windll.kernel32
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p
    return ctypes, Blob, crypt32, kernel32


def dpapi_encrypt(text):
    if os.name != "nt":
        raise RuntimeError("Password encryption needs Windows.")
    ctypes, Blob, crypt32, kernel32 = _dpapi()
    raw = text.encode("utf-8")
    buf = ctypes.create_string_buffer(raw, len(raw))
    inb, out = Blob(len(raw), ctypes.cast(buf, ctypes.c_void_p)), Blob()
    if not crypt32.CryptProtectData(ctypes.byref(inb), "NabiadBridge", None, None, None, 0, ctypes.byref(out)):
        raise ctypes.WinError()
    try:
        return base64.b64encode(ctypes.string_at(out.pbData, out.cbData)).decode("ascii")
    finally:
        kernel32.LocalFree(out.pbData)


def dpapi_decrypt(b64):
    if os.name != "nt":
        raise RuntimeError("Password decryption needs Windows.")
    ctypes, Blob, crypt32, kernel32 = _dpapi()
    raw = base64.b64decode(b64)
    buf = ctypes.create_string_buffer(raw, len(raw))
    inb, out = Blob(len(raw), ctypes.cast(buf, ctypes.c_void_p)), Blob()
    if not crypt32.CryptUnprotectData(ctypes.byref(inb), None, None, None, None, 0, ctypes.byref(out)):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(out.pbData, out.cbData).decode("utf-8")
    finally:
        kernel32.LocalFree(out.pbData)


def save_secret(email, password):
    with open(SECRET, "w", encoding="utf-8") as f:
        json.dump({"email": email, "password_enc": dpapi_encrypt(password)}, f)


def load_secret():
    """(email, password) or (None, None). Fails if the file belongs to another Windows user or PC."""
    if not os.path.exists(SECRET):
        return None, None
    d = json.load(open(SECRET, encoding="utf-8"))
    return d["email"], dpapi_decrypt(d["password_enc"])


def have_secret():
    return os.path.exists(SECRET)


# ---------------------------------------------------------------- config
def load_cfg():
    with open(CONFIG, encoding="utf-8") as f:
        return json.load(f)


def write_config(companies, start_dates, tally_url, supabase_url, anon_key, default_start="2023-01-01"):
    """Create or update config.json from the setup window. Existing keys (e.g. intercompany_ledgers) are kept."""
    cfg = load_cfg() if os.path.exists(CONFIG) else {}
    cfg.update({"tally_url": tally_url, "supabase_url": supabase_url.rstrip("/"), "supabase_anon_key": anon_key,
                "companies": list(companies), "use_selected_company": []})
    for k, v in {"start_date": default_start, "window_days": 60, "deep_days": 150, "batch_days": 30,
                 "ledgers_every_days": 7, "pause_seconds": 0.4}.items():
        cfg.setdefault(k, v)
    ic = cfg.setdefault("intercompany_ledgers", {})
    for c in companies:
        ic.setdefault(c, c)  # a ledger named exactly like another company marks an inter-company entry
    cfg["company_start_dates"] = {c: d for c, d in start_dates.items() if c in companies and d and d != default_start}
    with open(CONFIG, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    return cfg


# ---------------------------------------------------------------- Tally (read-only, standard reports only)
def tally_port(url):
    p = urllib.parse.urlparse(url)
    return p.hostname or "localhost", p.port or 9000


def port_open(url, timeout=3):
    import socket
    host, port = tally_port(url)
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def list_companies(url):
    """Names of the companies Tally has loaded right now (standard 'List of Companies' collection, read-only)."""
    import bridge
    xml = ("<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE>"
           "<ID>List of Companies</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML"
           "</SVEXPORTFORMAT></STATICVARIABLES></DESC></BODY></ENVELOPE>")
    text = bridge.tally_post(url, xml)
    names = []
    for el in bridge.parse_root(text).iter():
        if bridge.local(el.tag) != "COMPANY":
            continue
        n = el.get("NAME") or bridge.child_text(el, "NAME") or bridge.child_text(el, "BASICCOMPANYNAME")
        if n and n.strip() and n.strip() not in names:
            names.append(n.strip())
    return names


def company_loaded(cfg, company):
    """True if Tally answers for this company by name. A company that is not loaded gives a LINEERROR."""
    import bridge
    d = dt.date.today().strftime("%d-%b-%Y")
    text = bridge.tally_post(cfg["tally_url"], bridge.request_xml(
        "Day Book", company, {"SVCURRENTDATE": d, "SVFROMDATE": d, "SVTODATE": d}))
    return "LINEERROR" not in text.upper()


def test_company(cfg, company, days_back=3):
    """Read a few recent days by name. Returns (ok, message). Nothing is uploaded."""
    import bridge
    if not company_loaded(cfg, company):
        return False, "not loaded in Tally (or the name differs)"
    total, today = 0, dt.date.today()
    for i in range(days_back):
        total += len(bridge.fetch_day(cfg, company, today - dt.timedelta(days=i), lambda m: None))
    return True, f"ok, {total} vouchers in the last {days_back} days"


def test_login(cfg, email, password):
    import bridge
    os.environ["TALLY_BRIDGE_EMAIL"], os.environ["TALLY_BRIDGE_PASSWORD"] = email, password
    bridge._RELOGIN["cfg"] = cfg
    hdr = bridge.sb_login(cfg)
    rows = bridge.http_json("GET", cfg["supabase_url"] + "/rest/v1/tally_sync_runs?select=id&limit=1", hdr)
    return rows is not None


def fetch_runs(cfg, limit=300):
    """Recent rows of tally_sync_runs using the saved login. Raises on any problem."""
    import bridge
    email, password = load_secret()
    if not email:
        raise RuntimeError("login not saved")
    os.environ["TALLY_BRIDGE_EMAIL"], os.environ["TALLY_BRIDGE_PASSWORD"] = email, password
    bridge._RELOGIN["cfg"] = cfg
    hdr = bridge.sb_login(cfg)
    q = f"/rest/v1/tally_sync_runs?select=company,kind,started_at,finished_at,ok,vouchers,ledgers,error&order=started_at.desc&limit={limit}"
    return bridge.http_json("GET", cfg["supabase_url"] + q, hdr) or []


# ---------------------------------------------------------------- Windows Task Scheduler
def _hhmm(s):
    h, m = s.split(":")
    return int(h), int(m)


def _duration(start, until):
    (h1, m1), (h2, m2) = _hhmm(start), _hhmm(until)
    mins = (h2 * 60 + m2 - h1 * 60 - m1) % (24 * 60) or 24 * 60
    return mins


def write_run_bat(until):
    py = sys.executable
    if py.lower().endswith("pythonw.exe"):
        py = py[:-len("pythonw.exe")] + "python.exe"
    path = os.path.join(HERE, "run_nightly.bat")
    with open(path, "w", encoding="ascii", newline="\r\n") as f:
        run = f'"{py}" --engine' if FROZEN else f'"{py}" nightly_sync.py'
        f.write(f'@echo off\ncd /d "{HERE}"\n{run} --until {until} >> nightly_console.txt 2>&1\n')
    return path


def _write_schedule_state(start, until):
    try:
        with open(SCHEDULE_STATE, "w", encoding="utf-8") as f:
            json.dump({"revision": SCHEDULE_REVISION, "start": start, "until": until, "installed": dt.datetime.now().isoformat(timespec="seconds")}, f)
    except OSError:
        pass


def schedule_revision_installed():
    """Revision of the app that created the installed task (0 = unknown / created before revisions existed)."""
    try:
        return int(json.load(open(SCHEDULE_STATE, encoding="utf-8")).get("revision", 0))
    except (OSError, ValueError, TypeError):
        return 0


def schedule_needs_refresh():
    return schedule_revision_installed() < SCHEDULE_REVISION


def install_schedule(start="00:30", until="06:00"):
    """Daily task for the current Windows user. Tries a full XML task (wake PC, run late if it was off), else plain."""
    bat = write_run_bat(until)  # kept for running by hand
    pyw = sys.executable
    if pyw.lower().endswith("python.exe"):
        pyw = pyw[:-len("python.exe")] + "pythonw.exe"
    script_args = lambda until: f"--engine --until {until}" if FROZEN else f"nightly_sync.py --until {until}"
    mins = _duration(start, until)
    user = os.environ.get("USERDOMAIN", "") + "\\" + os.environ.get("USERNAME", "")
    first = dt.date.today().isoformat() + f"T{start}:00"
    xml = f"""<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Nabiad Bridge: read-only Tally to Supabase mirror (nightly)</Description></RegistrationInfo>
  <Triggers><CalendarTrigger><StartBoundary>{first}</StartBoundary><Enabled>true</Enabled>
    <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger></Triggers>
  <Principals><Principal id="Author"><UserId>{user}</UserId><LogonType>InteractiveToken</LogonType>
    <RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable><WakeToRun>true</WakeToRun>
    <ExecutionTimeLimit>PT{mins // 60}H{mins % 60}M</ExecutionTimeLimit><Enabled>true</Enabled></Settings>
  <Actions Context="Author"><Exec><Command>{pyw}</Command><Arguments>{script_args(until)}</Arguments><WorkingDirectory>{HERE}</WorkingDirectory></Exec></Actions>
</Task>"""
    xml_path = os.path.join(HERE, "nightly_task.xml")
    with open(xml_path, "w", encoding="utf-16") as f:
        f.write(xml)
    r = subprocess.run(["schtasks", "/Create", "/TN", TASK_NAME, "/XML", xml_path, "/F"], capture_output=True, text=True,
                       creationflags=CREATE_NO_WINDOW if os.name == "nt" else 0)
    if r.returncode == 0:
        _write_schedule_state(start, until)
        return True, f"Scheduled daily at {start} (stops by {until}), wakes the PC, runs late if the PC was off."
    r2 = subprocess.run(["schtasks", "/Create", "/TN", TASK_NAME, "/TR", f'"{pyw}" ' + (f"--engine --until {until}" if FROZEN else f'"{os.path.join(HERE, "nightly_sync.py")}" --until {until}'), "/SC", "DAILY", "/ST", start, "/F"],
                        capture_output=True, text=True, creationflags=CREATE_NO_WINDOW if os.name == "nt" else 0)
    if r2.returncode == 0:
        _write_schedule_state(start, until)
        return True, f"Scheduled daily at {start} (basic mode: the PC must be on and you signed in). {r.stderr.strip()[:120]}"
    return False, (r.stderr or r.stdout or r2.stderr or r2.stdout).strip()[:300]


def query_schedule():
    r = subprocess.run(["schtasks", "/Query", "/TN", TASK_NAME, "/FO", "LIST", "/V"], capture_output=True, text=True,
                       creationflags=CREATE_NO_WINDOW if os.name == "nt" else 0)
    if r.returncode != 0:
        return None
    keep = ("Next Run Time", "Last Run Time", "Last Result", "Status")
    return "\n".join(l.strip() for l in r.stdout.splitlines() if l.split(":")[0].strip() in keep)


def remove_schedule():
    r = subprocess.run(["schtasks", "/Delete", "/TN", TASK_NAME, "/F"], capture_output=True, text=True,
                       creationflags=CREATE_NO_WINDOW if os.name == "nt" else 0)
    if r.returncode == 0:
        try:
            os.remove(SCHEDULE_STATE)
        except OSError:
            pass
    return r.returncode == 0


def run_schedule_now():
    r = subprocess.run(["schtasks", "/Run", "/TN", TASK_NAME], capture_output=True, text=True,
                       creationflags=CREATE_NO_WINDOW if os.name == "nt" else 0)
    return r.returncode == 0, (r.stderr or r.stdout).strip()[:200]


# ---------------------------------------------------------------- the nightly run
def run_bridge(company, env, minutes, backfill, pause, dry_run):
    py = sys.executable
    if py.lower().endswith("pythonw.exe"):
        py = py[:-len("pythonw.exe")] + "python.exe"
    cmd = ([sys.executable, "--bridge"] if FROZEN else [py, os.path.join(HERE, "bridge.py")]) + [
        "--config", CONFIG, "--company", company, "--confirm-live", "--pause", str(pause)]
    if not dry_run:
        cmd.append("--upload")
    if backfill:
        cmd += ["--deep-days", "5000"]
    elif minutes is not None:
        cmd += ["--max-minutes", str(max(1, int(minutes)))]
    p = subprocess.Popen(cmd, cwd=HERE, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                         encoding="utf-8", errors="replace", creationflags=CREATE_NO_WINDOW if os.name == "nt" else 0)
    last = ""
    for line in p.stdout:
        if stop_requested():
            p.terminate()  # progress is saved after every batch; uploads are idempotent
        line = line.rstrip()
        if line and ("days read" in line or "STOP" in line or "warning" in line or "Error" in line or "error" in line):
            log("   " + line)
        if line:
            last = line
    return p.wait(), last


def record_failure(cfg, env, company, message):
    """Write a failed night into tally_sync_runs so the app can show it. Never raises."""
    try:
        import bridge
        os.environ["TALLY_BRIDGE_EMAIL"], os.environ["TALLY_BRIDGE_PASSWORD"] = env["TALLY_BRIDGE_EMAIL"], env["TALLY_BRIDGE_PASSWORD"]
        bridge._RELOGIN["cfg"] = cfg
        hdr = bridge.sb_login(cfg)
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        bridge.sb_log_run(cfg, hdr, {"company": company, "kind": "daybook", "started_at": now, "finished_at": now,
                                     "ok": False, "error": message[:500], "bridge_version": bridge.VERSION})
    except BaseException as e:  # noqa
        log(f"   could not record the failure online: {e}")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--until", default="06:00", help="stop starting new work at this time (HH:MM)")
    ap.add_argument("--backfill", action="store_true", help="first full history load (no time limit)")
    ap.add_argument("--company", action="append", help="only this company (can repeat)")
    ap.add_argument("--pause", type=float, default=0.4)
    ap.add_argument("--retry-wait", type=int, default=300, help="seconds to wait when Tally is not answering")
    ap.add_argument("--dry-run", action="store_true", help="read from Tally, upload nothing")
    a = ap.parse_args(argv)

    if not acquire_lock():
        log("Another sync is already running (manual, scheduled or from the app). This run does nothing.")
        return 4
    try:
        os.remove(STOP_FLAG)
    except OSError:
        pass
    cfg = load_cfg()
    import bridge  # noqa: F401  (makes sure bridge.py is next to this file)
    email, password = load_secret()
    if not email and not a.dry_run:
        log("STOP: no bridge login saved. Open the Bridge app, Connections page, and save the login first.")
        return 5
    env = dict(os.environ, TALLY_BRIDGE_EMAIL=email or "", TALLY_BRIDGE_PASSWORD=password or "")
    now = dt.datetime.now()
    if a.backfill:
        deadline = now + dt.timedelta(days=3)
    else:
        h, m = _hhmm(a.until)
        deadline = now.replace(hour=h, minute=m, second=0, microsecond=0)
        if deadline <= now:
            deadline = now + dt.timedelta(minutes=330)
    todo = [c for c in cfg["companies"] if not a.company or c in a.company]
    log(f"=== nightly run start. companies={len(todo)} until={deadline:%H:%M} backfill={a.backfill} dry_run={a.dry_run}")
    attempts, status = {c: 0 for c in todo}, {c: "pending" for c in todo}
    while todo and dt.datetime.now() < deadline and not stop_requested():
        if not port_open(cfg["tally_url"]):
            log("Tally is not answering. Waiting...")
            nap(min(a.retry_wait, max(1, (deadline - dt.datetime.now()).total_seconds())))
            continue
        progressed = False
        for company in list(todo):
            if stop_requested():
                break
            left = (deadline - dt.datetime.now()).total_seconds() / 60
            if left < 2:
                break
            try:
                loaded = company_loaded(cfg, company)
            except Exception as e:  # Tally went away
                log(f"{company}: Tally did not answer ({e})")
                break
            if not loaded:
                status[company] = "not loaded in Tally"
                log(f"{company}: NOT LOADED in Tally, skipped for now")
                continue
            log(f"{company}: start")
            rc, last = run_bridge(company, env, None if a.backfill else left, a.backfill, a.pause, a.dry_run)
            progressed = True
            if rc == 0:
                status[company] = "ok"
                todo.remove(company)
            elif rc == 3:
                status[company] = "data check failed (wrong company data); nothing uploaded"
                log(f"{company}: {status[company]}")
                todo.remove(company)
                if not a.dry_run:
                    record_failure(cfg, env, company, status[company] + " " + last)
            else:
                attempts[company] += 1
                status[company] = f"failed (code {rc}), try {attempts[company]}/3: {last[:120]}"
                log(f"{company}: {status[company]}")
                if attempts[company] >= 3 or rc == 5:
                    todo.remove(company)
                    if not a.dry_run:
                        record_failure(cfg, env, company, status[company])
                elif rc == 2:
                    break  # Tally down: go back to the port check
        if todo:
            nap(min(a.retry_wait if not progressed else 20, max(1, (deadline - dt.datetime.now()).total_seconds())))
    for c in todo:
        if status[c] == "pending" or status[c].startswith("not loaded"):
            if status[c] == "pending":
                status[c] = "stopped by user" if stop_requested() else "not reached before the end time"
            if not a.dry_run and not stop_requested():
                record_failure(cfg, env, c, status[c])
    summary = {"finished_at": dt.datetime.now().isoformat(timespec="seconds"), "companies": status}
    with open(STATUS, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=1)
    bad = [c for c, s in status.items() if s != "ok"]
    log(f"=== nightly run end. ok={len(status) - len(bad)} problems={len(bad)} " + (", ".join(f"{c}: {status[c]}" for c in bad)))
    return 0 if not bad else 1


if __name__ == "__main__":
    sys.exit(main())
