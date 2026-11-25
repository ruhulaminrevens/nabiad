"""Overview logic for NABIAD DATA BRIDGE: turns the sync history (tally_sync_runs rows), the nightly log and the connection
states into the few facts the Overview page shows. No Qt, no network, standard library only, so it is easy to test.

Inputs are plain data; the page (overview_ui.py) only paints what this module returns."""
import datetime as dt
import re

STALE_HOURS = 30          # a company is "stale" when its last successful sync is older than this (nightly sync = every 24 h)
SESSION_GAP_MIN = 30      # runs closer together than this belong to the same sync session


# ------------------------------------------------------------------ small helpers
def parse_iso(s):
    """ISO time from the database (UTC, 'Z' or +00:00) -> aware local datetime, or None."""
    if not s:
        return None
    try:
        d = dt.datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone.utc)
    return d.astimezone()


def fmt_num(n, style="in"):
    """1,23,456 (South Asian grouping, default) or 123,456."""
    try:
        n = int(n)
    except (TypeError, ValueError):
        return "-"
    if style != "in":
        return f"{n:,}"
    sign, s = ("-" if n < 0 else ""), str(abs(n))
    if len(s) <= 3:
        return sign + s
    head, tail = s[:-3], s[-3:]
    parts = []
    while len(head) > 2:
        parts.insert(0, head[-2:]); head = head[:-2]
    if head:
        parts.insert(0, head)
    return sign + ",".join(parts) + "," + tail


def minutes_between(a, b):
    return max(0, int((b - a).total_seconds() // 60))


def next_run(start_hhmm, now):
    """Next local datetime at HH:MM (today if still ahead, else tomorrow), or None for a bad value."""
    try:
        h, m = (int(x) for x in str(start_hhmm).split(":"))
        d = now.replace(hour=h, minute=m, second=0, microsecond=0)
    except (ValueError, AttributeError):
        return None
    return d if d > now else d + dt.timedelta(days=1)


# ------------------------------------------------------------------ the nightly log
_START = re.compile(r"=== nightly run start\. companies=(\d+)")
_STAMP = re.compile(r"^(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d) (.*)$")
_DONE = re.compile(r"^(?:\d\d:\d\d:\d\d )?\s*(.+?): (\d+) days read, (\d+) vouchers")


def log_progress(text):
    """What the last run in nightly_log.txt is doing. Returns None if the log has no run, else a dict:
    running, total, done, problems, current, vouchers, started (datetime), ended (datetime or None)."""
    lines = text.splitlines()
    idx = None
    for i in range(len(lines) - 1, -1, -1):
        if _START.search(lines[i]):
            idx = i; break
    if idx is None:
        return None
    m = _STAMP.match(lines[idx])
    started = dt.datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S") if m else None
    total = int(_START.search(lines[idx]).group(1))
    done, problems, vouchers, current, ended, finished = 0, 0, 0, "", None, False
    for ln in lines[idx + 1:]:
        m = _STAMP.match(ln)
        if not m:
            continue
        body = m.group(2)
        if "=== nightly run end" in body:
            finished = True; ended = dt.datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S"); current = ""
            continue
        d = _DONE.match(body.strip())
        if d:
            done += 1; vouchers += int(d.group(3)); current = ""
            continue
        if body.endswith(": start"):
            current = body[:-len(": start")]
        elif "NOT LOADED" in body or "data check failed" in body:
            done += 1; problems += 1; current = ""
        else:
            f = re.search(r": failed \(code (\d+)\), try (\d)/3", body)
            if f and (int(f.group(2)) >= 3 or f.group(1) == "5"):   # final failure; earlier tries are retried, not finished
                done += 1; problems += 1; current = ""
    return dict(running=not finished, total=total, done=min(done, total), problems=problems, current=current, vouchers=vouchers,
                started=started, ended=ended)


def eta_minutes(progress, now):
    """Rough minutes left, from the pace of the companies already done (None while nothing is done yet)."""
    if not progress or not progress.get("running") or not progress.get("started") or progress["done"] < 1:
        return None
    el = max(1, (now.replace(tzinfo=None) - progress["started"]).total_seconds())
    return max(0, int(round(el / progress["done"] * (progress["total"] - progress["done"]) / 60)))


# ------------------------------------------------------------------ the sync history
def latest_per_company(runs):
    """runs are newest first. -> {company: newest run}, {company: newest successful run}"""
    last, last_ok = {}, {}
    for r in runs:
        c = r.get("company")
        last.setdefault(c, r)
        if r.get("ok") and c not in last_ok:
            last_ok[c] = r
    return last, last_ok


def session_of(runs):
    """The newest sync session: consecutive runs less than SESSION_GAP_MIN apart. None when there are no runs."""
    rows = []
    for r in runs:
        s, f = parse_iso(r.get("started_at")), parse_iso(r.get("finished_at"))
        if s:
            rows.append((s, f or s, r))
    if not rows:
        return None
    rows.sort(key=lambda x: x[0], reverse=True)
    grp = [rows[0]]
    for row in rows[1:]:
        if (grp[-1][0] - row[1]).total_seconds() <= SESSION_GAP_MIN * 60:
            grp.append(row)
        else:
            break
    start, end = min(g[0] for g in grp), max(g[1] for g in grp)
    ok = sum(1 for g in grp if g[2].get("ok")); bad = sum(1 for g in grp if g[2].get("ok") is False)
    return dict(start=start, end=end, runs=len(grp), companies=len({g[2].get("company") for g in grp}), ok=ok, failed=bad,
                vouchers=sum(g[2].get("vouchers") or 0 for g in grp if g[2].get("ok")), minutes=max(1, minutes_between(start, end)))


def trend(runs, now, days=7):
    """Per local day, oldest first: successful and failed company syncs and vouchers read."""
    today = now.astimezone().date()
    out = {today - dt.timedelta(days=i): dict(ok=0, failed=0, vouchers=0) for i in range(days)}
    for r in runs:
        s = parse_iso(r.get("started_at"))
        if not s or s.date() not in out:
            continue
        d = out[s.date()]
        if r.get("ok"):
            d["ok"] += 1; d["vouchers"] += r.get("vouchers") or 0
        elif r.get("ok") is False:
            d["failed"] += 1
    return [dict(day=k, **v) for k, v in sorted(out.items())]


def summarize(runs, companies, now, *, running_company="", progress=None, tally_ok=None, db_ok=None, db_error="", login_saved=True,
              cfg_error=False, sched=None, stale_hours=STALE_HOURS):
    """Everything the Overview shows.
    runs: tally_sync_runs rows, newest first. companies: names selected in the Company Manager.
    sched: None (not asked yet) or dict(installed, start 'HH:MM', outdated).
    progress: result of log_progress() when a run is going on, else None."""
    last, last_ok = latest_per_company(runs)
    running_now = bool(progress and progress.get("running"))
    rows, counts = [], dict(synced=0, running=0, stale=0, failed=0, never=0)
    for c in companies:
        ok_run, new_run = last_ok.get(c), last.get(c)
        ok_at = parse_iso((ok_run or {}).get("finished_at") or (ok_run or {}).get("started_at"))
        age_h = (now - ok_at).total_seconds() / 3600 if ok_at else None
        if running_now and progress.get("current") == c:
            state = "running"
        elif not ok_run and not new_run:
            state = "never"
        elif new_run is not None and new_run.get("ok") is False:
            state = "failed"            # the newest run of this company failed (a later success would be the newest)
        elif not ok_run:
            state = "never"
        elif age_h is not None and age_h > stale_hours:
            state = "stale"
        else:
            state = "synced"
        counts[state] += 1
        rows.append(dict(company=c, state=state, last_ok=ok_at, age_h=age_h, vouchers=(ok_run or {}).get("vouchers"),
                         error=((new_run or {}).get("error") or "")[:160] if state == "failed" else ""))
    order = {"failed": 0, "never": 1, "stale": 2, "running": 3, "synced": 4}
    rows_sorted = sorted(rows, key=lambda r: order[r["state"]])   # stable: problems first, then configured order

    total = len(companies)
    sess = session_of(runs)
    last_sync = max((r["last_ok"] for r in rows if r["last_ok"]), default=None)
    pending = counts["stale"] + counts["never"] + counts["failed"]
    data_check = [r["company"] for r in rows if r["state"] == "failed" and "data check" in r["error"].lower()]

    # open issues (the update banner is separate: it is not a fault)
    issues = []
    if cfg_error:
        issues.append(dict(id="config", kind="error"))
    if not login_saved:
        issues.append(dict(id="login", kind="warn"))
    if db_ok is False:
        issues.append(dict(id="db", kind="error", arg=(db_error or "")[:80]))
    if tally_ok is False and not running_now:
        issues.append(dict(id="tally", kind="warn"))
    if sched is not None:
        if not sched.get("installed"):
            issues.append(dict(id="sched_none", kind="warn"))
        elif sched.get("outdated"):
            issues.append(dict(id="sched_old", kind="warn"))
    if counts["failed"]:
        issues.append(dict(id="failed", kind="error", arg=counts["failed"], names=[r["company"] for r in rows if r["state"] == "failed"]))
    if counts["never"]:
        issues.append(dict(id="never", kind="warn", arg=counts["never"], names=[r["company"] for r in rows if r["state"] == "never"]))
    if counts["stale"]:
        issues.append(dict(id="stale", kind="warn", arg=counts["stale"], names=[r["company"] for r in rows if r["state"] == "stale"]))
    if not companies:
        issues.append(dict(id="nocompany", kind="warn"))

    checks = [
        dict(id="coverage", ok=counts["never"] == 0 and total > 0, arg=counts["never"]),
        dict(id="fresh", ok=counts["stale"] == 0 and counts["never"] == 0 and total > 0, arg=counts["stale"] + counts["never"]),
        dict(id="nofail", ok=counts["failed"] == 0, arg=counts["failed"]),
        dict(id="data", ok=not data_check, arg=len(data_check)),
    ]
    if db_ok is None and not runs:
        for c in checks:
            c["ok"] = None   # nothing known yet

    # headline: one sentence for the whole page
    if running_now:
        head = dict(kind="info", id="running", done=progress["done"], total=progress["total"], current=progress.get("current", ""))
    elif not login_saved and not runs:
        head = dict(kind="warn", id="setup")
    elif not runs and db_ok is not True:
        head = dict(kind="info" if db_ok is None else "error", id="nodata" if db_ok is None else "dbdown")
    elif any(i["kind"] == "error" for i in issues):
        head = dict(kind="error", id="issues", n=len(issues))
    elif issues:
        head = dict(kind="warn", id="issues", n=len(issues))
    else:
        head = dict(kind="success", id="healthy", total=total)

    return dict(rows=rows_sorted, counts=counts, total=total, issues=issues, checks=checks, head=head, session=sess,
                last_sync=last_sync, pending=pending, running=running_now, progress=progress, trend=trend(runs, now),
                next=(next_run(sched.get("start"), now) if sched and sched.get("installed") else None))


def recent_activity(runs, limit=8):
    """Newest finished runs as (datetime, ok, company, vouchers, error)."""
    out = []
    for r in runs:
        f = parse_iso(r.get("finished_at") or r.get("started_at"))
        if f:
            out.append((f, r.get("ok"), r.get("company"), r.get("vouchers"), (r.get("error") or "")))
    out.sort(key=lambda x: x[0], reverse=True)
    return out[:limit]
