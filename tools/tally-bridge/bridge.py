#!/usr/bin/env python3
"""Nabiad Bridge: read-only copy of TallyPrime data into Supabase (Phase 1).

Safety rules built in (Tally crashed once on a custom TDL query, 24-11-2026):
  * Only Tally's own standard reports ("List of Accounts", "Day Book"). No custom TDL, no import/write requests.
  * One request at a time, a pause between requests, date ranges in small chunks.
  * First connection error stops the whole run: a crashed Tally is never hammered.
  * Only companies listed in the config are touched.
  * Talking to the real Tally port 9000 needs --confirm-live. Default is a dry run: JSON files only, nothing uploaded.
Credentials come from the environment (TALLY_BRIDGE_EMAIL / TALLY_BRIDGE_PASSWORD), never from the repo or the config file.
"""
import argparse, datetime as dt, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ET

VERSION = "0.2.0"


class DataMismatch(Exception):
    """Tally answered for a different date than requested; the data cannot be trusted."""


class TallyDown(Exception):
    """Tally did not answer (closed, crashed or unreachable). The run must stop."""


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;"))


def request_xml(report, company, extra=None):
    """Standard export request. `extra` holds static variables such as SVFROMDATE."""
    sv = {"SVEXPORTFORMAT": "$$SysName:XML", "SVCURRENTCOMPANY": company, **(extra or {})}
    body = "".join(f"<{k}>{esc(v)}</{k}>" for k, v in sv.items())
    return ("<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Data</TYPE>"
            f"<ID>{esc(report)}</ID></HEADER><BODY><DESC><STATICVARIABLES>{body}</STATICVARIABLES></DESC></BODY></ENVELOPE>")


def tally_post(url, xml, timeout=120):
    req = urllib.request.Request(url, data=xml.encode("utf-8"), method="POST",
                                 headers={"Content-Type": "text/xml; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return decode(r.read())
    except (urllib.error.URLError, ConnectionError, TimeoutError, OSError) as e:
        raise TallyDown(f"Tally did not answer: {e}") from e


def decode(raw):
    if raw[:2] in (b"\xff\xfe", b"\xfe\xff") or b"\x00" in raw[:100]:
        return raw.decode("utf-16", errors="replace")
    return raw.decode("utf-8-sig", errors="replace")


_BAD_REF = re.compile(r"&#(?:x[0-9a-fA-F]+|\d+);")


def clean_xml(text):
    """Tally can emit control characters (for example &#4;) that XML parsers reject."""
    def keep(m):
        s = m.group(0)[2:-1]
        n = int(s[1:], 16) if s[:1] in "xX" else int(s)
        return m.group(0) if n in (9, 10, 13) or n >= 32 else ""
    text = _BAD_REF.sub(keep, text)
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)


def local(tag):
    return tag.rsplit("}", 1)[-1]


def parse_root(text):
    return ET.fromstring(clean_xml(text).encode("utf-8"))


def child_text(el, name):
    for c in el:
        if local(c.tag) == name:
            return (c.text or "").strip()
    return ""


def parse_ledgers(text, company):
    out, seen = [], set()
    for el in parse_root(text).iter():
        if local(el.tag) == "LEDGER" and el.get("NAME") and el.get("NAME") not in seen:
            seen.add(el.get("NAME"))
            out.append({"company": company, "name": el.get("NAME"), "parent": child_text(el, "PARENT") or None})
    return out


def num(s):
    try:
        return float(s.replace(",", ""))
    except (ValueError, AttributeError):
        return 0.0


def tally_date(s):
    return f"{s[0:4]}-{s[4:6]}-{s[6:8]}" if re.fullmatch(r"\d{8}", s or "") else None


def parse_vouchers(text, company, intercompany=None):
    ic = {k.strip().lower(): v for k, v in (intercompany or {}).items()}
    out = []
    for el in parse_root(text).iter():
        if local(el.tag) != "VOUCHER":
            continue
        vdate = tally_date(child_text(el, "DATE"))
        guid = child_text(el, "GUID") or el.get("REMOTEID") or ""
        if not vdate or not guid:
            continue  # cannot be identified safely; skipped, counted by the caller
        entries = []
        for c in el:
            if local(c.tag).startswith(("ALLLEDGERENTRIES", "LEDGERENTRIES")):
                name = child_text(c, "LEDGERNAME")
                if name:
                    entries.append({"ledger": name, "amount": num(child_text(c, "AMOUNT"))})
        counter = next((ic[e["ledger"].strip().lower()] for e in entries
                        if e["ledger"].strip().lower() in ic and ic[e["ledger"].strip().lower()] != company), None)
        out.append({
            "company": company, "guid": guid, "vdate": vdate,
            "vtype": child_text(el, "VOUCHERTYPENAME") or el.get("VCHTYPE"),
            "vno": child_text(el, "VOUCHERNUMBER") or None,
            "narration": child_text(el, "NARRATION") or None,
            "amount": round(sum(-e["amount"] for e in entries if e["amount"] < 0), 2),
            "entries": entries, "counter_company": counter,
            "alter_id": int(child_text(el, "ALTERID") or 0) or None,
            "cancelled": child_text(el, "ISCANCELLED").lower() == "yes",
            "deleted": False,
        })
    return out


def ymd(d):
    return d.strftime("%Y%m%d")


def daterange(d1, d2):
    d = d1
    while d <= d2:
        yield d
        d += dt.timedelta(days=1)


def plan_days(cfg, st, today):
    """Nightly plan as contiguous day segments: [recent window, next slice of history].
    The history slice moves forward a little each night and wraps around, so even a years-old edit
    is picked up within one cycle. Returns (segments, next_cursor)."""
    start = dt.date.fromisoformat(cfg.get("start_date", "2016-01-01"))
    win = max(1, int(cfg.get("window_days", 60)))
    win_start = today - dt.timedelta(days=win - 1)
    segments = [list(daterange(win_start, today))]
    hist_end = win_start - dt.timedelta(days=1)
    n = int(cfg.get("deep_days", 150))
    cur = dt.date.fromisoformat(st["deep_cursor"]) if st.get("deep_cursor") else start
    if cur < start or cur > hist_end:
        cur = start
    deep = []
    while len(deep) < n and cur <= hist_end:
        deep.append(cur)
        cur += dt.timedelta(days=1)
    nxt = start if cur > hist_end else cur
    if deep:
        segments.append(deep)
    return segments, nxt


def fetch_day(cfg, company, day, log, raw_dir=None):
    """One standard Day Book request. This Tally ignores SVFROMDATE/SVTODATE and follows SVCURRENTDATE
    (verified 24-11-2026), and keeps that value inside its XML session afterwards (the Gateway date is unaffected)."""
    time.sleep(cfg.get("pause_seconds", 2))
    label = day.strftime("%d-%b-%Y")
    text = tally_post(cfg["tally_url"], request_xml("Day Book", company, {"SVCURRENTDATE": label, "SVFROMDATE": label, "SVTODATE": label}))
    if raw_dir:
        save_raw(raw_dir, company, f"daybook_{ymd(day)}", text)
    got = parse_vouchers(text, company, cfg.get("intercompany_ledgers"))
    wrong = sorted({v["vdate"] for v in got if v["vdate"] != str(day)})
    if wrong:
        raise DataMismatch(f"asked for {day} but Tally returned {wrong}. Nothing more is written or uploaded.")
    log(f"{company}: {day} -> {len(got)} vouchers")
    return got


def fetch_ledgers(cfg, company, log, raw_dir=None):
    log(f"{company}: ledgers")
    text = tally_post(cfg["tally_url"], request_xml("List of Accounts", company, {"ACCOUNTTYPE": "Ledgers"}))
    if raw_dir:
        save_raw(raw_dir, company, "ledgers", text)
    return parse_ledgers(text, company)


def save_raw(raw_dir, company, label, text):
    os.makedirs(raw_dir, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9]+", "_", company).strip("_")
    with open(os.path.join(raw_dir, f"{safe}_{label}.xml"), "w", encoding="utf-8") as f:
        f.write(text)


# ---------- local state (progress of the history scan) ----------
def load_state(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_state(path, st):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f, indent=1)
    os.replace(tmp, path)


# ---------- Supabase (PostgREST) ----------
def http_json(method, url, headers, payload=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read()
        return json.loads(body) if body else None


def sb_login(cfg):
    email, pw = os.environ.get("TALLY_BRIDGE_EMAIL"), os.environ.get("TALLY_BRIDGE_PASSWORD")
    if not email or not pw:
        sys.exit("Set TALLY_BRIDGE_EMAIL and TALLY_BRIDGE_PASSWORD in the environment (never in files in the repo).")
    r = http_json("POST", cfg["supabase_url"] + "/auth/v1/token?grant_type=password",
                  {"apikey": cfg["supabase_anon_key"]}, {"email": email, "password": pw})
    return {"apikey": cfg["supabase_anon_key"], "Authorization": "Bearer " + r["access_token"]}


def sb_upsert(cfg, hdr, table, rows, conflict, batch=200):
    for i in range(0, len(rows), batch):
        http_json("POST", f"{cfg['supabase_url']}/rest/v1/{table}?on_conflict={conflict}",
                  {**hdr, "Prefer": "resolution=merge-duplicates,return=minimal"}, rows[i:i + batch])


def missing_guids(db_rows, fetched):
    """GUIDs the database holds as live for the re-read days that Tally no longer returned."""
    return sorted({r["guid"] for r in db_rows} - set(fetched))


def sb_mark_deleted(cfg, hdr, company, days, fetched_guids):
    """Soft-delete: vouchers removed in Tally stay in the database, flagged deleted=true (never hard-deleted)."""
    dayset = {str(d) for d in days}
    q = {"company": "eq." + company, "vdate": ["gte." + str(min(days)), "lte." + str(max(days))],
         "deleted": "eq.false", "select": "guid,vdate"}
    rows, off = [], 0
    while True:
        qs = urllib.parse.urlencode({**q, "limit": 1000, "offset": off}, doseq=True)
        page = http_json("GET", f"{cfg['supabase_url']}/rest/v1/tally_vouchers?{qs}", hdr) or []
        rows += [r for r in page if r["vdate"] in dayset]
        if len(page) < 1000:
            break
        off += 1000
    gone = missing_guids(rows, fetched_guids)
    # Safety: a company that is not loaded in Tally (or an odd answer) looks like "everything vanished".
    # Never flag a large share as deleted automatically; leave it for a manual --resync after a look.
    if len(gone) > max(2, len(rows) // 5):
        print(f"warning: {company}: {len(gone)} of {len(rows)} stored vouchers are missing from Tally for "
              f"{min(days)}..{max(days)}; NOT marking them deleted. Check the company is loaded in Tally.", flush=True)
        return 0
    for i in range(0, len(gone), 50):
        ids = ",".join(gone[i:i + 50])
        qs = urllib.parse.urlencode({"company": "eq." + company, "guid": f"in.({ids})"})
        http_json("PATCH", f"{cfg['supabase_url']}/rest/v1/tally_vouchers?{qs}", {**hdr, "Prefer": "return=minimal"},
                  {"deleted": True, "synced_at": dt.datetime.now(dt.timezone.utc).isoformat()})
    return len(gone)


def sb_log_run(cfg, hdr, row):
    try:
        http_json("POST", cfg["supabase_url"] + "/rest/v1/tally_sync_runs", {**hdr, "Prefer": "return=minimal"}, row)
    except Exception as e:  # logging must never hide the real result
        print("warning: could not write sync run log:", e, flush=True)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", required=True)
    ap.add_argument("--upload", action="store_true", help="write to Supabase (default: dry run, JSON files only)")
    ap.add_argument("--confirm-live", action="store_true", help="required to talk to the real Tally on port 9000")
    ap.add_argument("--company", help="only this company (must be in the config)")
    ap.add_argument("--from", dest="d_from", help="re-read this exact period (needs --from; --to defaults to today)")
    ap.add_argument("--to", dest="d_to")
    ap.add_argument("--window-days", type=int, help="nightly: re-read this many recent days (default config window_days=60)")
    ap.add_argument("--deep-days", type=int, help="nightly: history days re-read per run (default config deep_days=150); use a large number for the first backfill")
    ap.add_argument("--max-minutes", type=float, help="stop cleanly between batches after this long (progress is saved)")
    ap.add_argument("--state", default="bridge_state.json", help="progress file of the history scan (used with --upload)")
    ap.add_argument("--today", help=argparse.SUPPRESS)
    ap.add_argument("--out", default="bridge_out", help="folder for dry-run JSON and raw XML")
    ap.add_argument("--skip-ledgers", action="store_true", help="do not fetch the (large) ledger list")
    ap.add_argument("--save-raw", action="store_true", help="keep raw Tally XML (to check the real format)")
    a = ap.parse_args(argv)
    with open(a.config, encoding="utf-8") as f:
        cfg = json.load(f)
    if a.window_days is not None:
        cfg["window_days"] = a.window_days
    if a.deep_days is not None:
        cfg["deep_days"] = a.deep_days
    port = urllib.parse.urlparse(cfg["tally_url"]).port
    if port == 9000 and not a.confirm_live:
        sys.exit("This would talk to the real Tally (port 9000). Re-run with --confirm-live after a fresh Tally backup.")
    if a.d_to and not a.d_from:
        sys.exit("--to needs --from.")
    names = cfg["companies"]
    if a.company:
        if a.company not in names:
            sys.exit(f"{a.company!r} is not in the config companies list.")
        names = [a.company]
    log = lambda m: print(time.strftime("%H:%M:%S"), m, flush=True)
    hdr = sb_login(cfg) if a.upload else None
    today = dt.date.fromisoformat(a.today) if a.today else dt.date.today()
    raw_dir = os.path.join(a.out, "raw") if a.save_raw else None
    state = load_state(a.state) if a.upload else {}
    deadline = time.time() + a.max_minutes * 60 if a.max_minutes else None
    bsize = int(cfg.get("batch_days", 30))
    for company in names:
        st = state.setdefault(company, {})
        explicit = bool(a.d_from)
        if explicit:
            d1 = dt.date.fromisoformat(a.d_from)
            d2 = dt.date.fromisoformat(a.d_to) if a.d_to else today
            segments, next_cursor = [list(daterange(d1, d2))], None
        else:
            segments, next_cursor = plan_days(cfg, st, today)
        total_days = sum(len(x) for x in segments)
        log(f"{company}: {total_days} days to read ({'explicit period' if explicit else 'recent window + history slice'})")
        started = dt.datetime.now(dt.timezone.utc).isoformat()
        ledgers, all_vouchers, n_v, n_del, done_days = [], [], 0, 0, 0
        try:
            stale = not st.get("ledgers_at") or (today - dt.date.fromisoformat(st["ledgers_at"])).days >= int(cfg.get("ledgers_every_days", 7))
            if not a.skip_ledgers and (explicit or stale):
                ledgers = fetch_ledgers(cfg, company, log, raw_dir)
                if a.upload:
                    sb_upsert(cfg, hdr, "tally_ledgers", ledgers, "company,name")
                    st["ledgers_at"] = str(today)
                    save_state(a.state, state)
            for si, seg in enumerate(segments):
                for i in range(0, len(seg), bsize):
                    batch = seg[i:i + bsize]
                    got = {}
                    for day in batch:
                        for v in fetch_day(cfg, company, day, log, raw_dir):
                            got[v["guid"]] = v
                    rows = list(got.values())
                    n_v += len(rows)
                    done_days += len(batch)
                    if a.upload:
                        now = dt.datetime.now(dt.timezone.utc).isoformat()
                        for v in rows:
                            v["synced_at"] = now
                        sb_upsert(cfg, hdr, "tally_vouchers", rows, "company,guid")
                        n_del += sb_mark_deleted(cfg, hdr, company, batch, got.keys())
                        if not explicit and si == len(segments) - 1 and len(segments) > 1:
                            st["deep_cursor"] = str(batch[-1] + dt.timedelta(days=1)) if batch[-1] != seg[-1] else str(next_cursor)
                        save_state(a.state, state)
                    else:
                        all_vouchers += rows
                    if deadline and time.time() > deadline and not (si == len(segments) - 1 and i + bsize >= len(seg)):
                        log(f"{company}: time budget reached, stopping cleanly (progress saved)")
                        raise StopIteration
        except StopIteration:
            pass
        except TallyDown as e:
            log(f"STOP: {e}. Not contacting Tally again in this run.")
            if hdr:
                sb_log_run(cfg, hdr, {"company": company, "kind": "daybook", "started_at": started, "ok": False, "error": str(e)[:500], "bridge_version": VERSION})
            return 2
        except DataMismatch as e:
            log(f"STOP: {e}")
            if hdr:
                sb_log_run(cfg, hdr, {"company": company, "kind": "daybook", "started_at": started, "ok": False, "error": str(e)[:500], "bridge_version": VERSION})
            return 3
        log(f"{company}: {done_days} days read, {n_v} vouchers, {len(ledgers)} ledgers, {n_del} marked deleted")
        if a.upload:
            days_flat = [d for seg in segments for d in seg]
            sb_log_run(cfg, hdr, {"company": company, "kind": "daybook", "from_date": str(min(days_flat)), "to_date": str(max(days_flat)),
                                  "started_at": started, "finished_at": dt.datetime.now(dt.timezone.utc).isoformat(), "ok": True,
                                  "ledgers": len(ledgers), "vouchers": n_v, "bridge_version": VERSION})
        else:
            os.makedirs(a.out, exist_ok=True)
            safe = re.sub(r"[^A-Za-z0-9]+", "_", company).strip("_")
            days_flat = [d for seg in segments for d in seg]
            with open(os.path.join(a.out, safe + ".json"), "w", encoding="utf-8") as f:
                json.dump({"company": company, "from": str(min(days_flat)), "to": str(max(days_flat)), "ledgers": ledgers,
                           "vouchers": list({v["guid"]: v for v in all_vouchers}.values())}, f, ensure_ascii=False, indent=1)
            log(f"dry run: wrote {os.path.join(a.out, safe + '.json')} (nothing uploaded)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
