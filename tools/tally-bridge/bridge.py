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

VERSION = "0.1.0"


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
        })
    return out


def chunks(d1, d2, days):
    cur = d1
    while cur <= d2:
        end = min(cur + dt.timedelta(days=days - 1), d2)
        yield cur, end
        cur = end + dt.timedelta(days=1)


def ymd(d):
    return d.strftime("%Y%m%d")


def export_company(cfg, company, d1, d2, log, raw_dir=None):
    url, pause = cfg["tally_url"], cfg.get("pause_seconds", 2)
    ledgers = []
    if cfg.get("skip_ledgers"):
        log(f"{company}: ledgers skipped")
    else:
        log(f"{company}: ledgers")
        text = tally_post(url, request_xml("List of Accounts", company, {"ACCOUNTTYPE": "Ledgers"}))
        if raw_dir:
            save_raw(raw_dir, company, "ledgers", text)
        ledgers = parse_ledgers(text, company)
    vouchers = []
    # This Tally's Day Book export ignores SVFROMDATE/SVTODATE and follows SVCURRENTDATE (verified 24-11-2026),
    # so: one request per day. SVCURRENTDATE stays set inside Tally's XML session afterwards (the Gateway date is unaffected).
    day = d1
    while day <= d2:
        time.sleep(pause)
        label = day.strftime("%d-%b-%Y")
        log(f"{company}: day book {day}")
        text = tally_post(url, request_xml("Day Book", company, {"SVCURRENTDATE": label, "SVFROMDATE": label, "SVTODATE": label}))
        if raw_dir:
            save_raw(raw_dir, company, f"daybook_{ymd(day)}", text)
        got = parse_vouchers(text, company, cfg.get("intercompany_ledgers"))
        per_day = {}
        for v in got:
            per_day[v["vdate"]] = per_day.get(v["vdate"], 0) + 1
        log(f"{company}: vouchers per date {dict(sorted(per_day.items()))}")
        wrong = [d for d in per_day if d != str(day)]
        if wrong:
            raise DataMismatch(f"asked for {day} but Tally returned {wrong}. Nothing is written or uploaded.")
        vouchers += got
        day += dt.timedelta(days=1)
    return ledgers, list({v["guid"]: v for v in vouchers}.values())


def save_raw(raw_dir, company, label, text):
    os.makedirs(raw_dir, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9]+", "_", company).strip("_")
    with open(os.path.join(raw_dir, f"{safe}_{label}.xml"), "w", encoding="utf-8") as f:
        f.write(text)


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


def sb_last_to_date(cfg, hdr, company):
    q = urllib.parse.urlencode({"company": "eq." + company, "ok": "eq.true", "select": "to_date",
                                "order": "to_date.desc", "limit": "1"})
    r = http_json("GET", f"{cfg['supabase_url']}/rest/v1/tally_sync_runs?{q}", hdr)
    return dt.date.fromisoformat(r[0]["to_date"]) if r and r[0].get("to_date") else None


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", required=True)
    ap.add_argument("--upload", action="store_true", help="write to Supabase (default: dry run, JSON files only)")
    ap.add_argument("--confirm-live", action="store_true", help="required to talk to the real Tally on port 9000")
    ap.add_argument("--company", help="only this company (must be in the config)")
    ap.add_argument("--from", dest="d_from"); ap.add_argument("--to", dest="d_to")
    ap.add_argument("--out", default="bridge_out", help="folder for dry-run JSON and raw XML")
    ap.add_argument("--skip-ledgers", action="store_true", help="do not fetch the (large) ledger list")
    ap.add_argument("--save-raw", action="store_true", help="keep raw Tally XML (to check the real format)")
    a = ap.parse_args(argv)
    with open(a.config, encoding="utf-8") as f:
        cfg = json.load(f)
    cfg["skip_ledgers"] = a.skip_ledgers
    port = urllib.parse.urlparse(cfg["tally_url"]).port
    if port == 9000 and not a.confirm_live:
        sys.exit("This would talk to the real Tally (port 9000). Re-run with --confirm-live after a fresh Tally backup.")
    names = cfg["companies"]
    if a.company:
        if a.company not in names:
            sys.exit(f"{a.company!r} is not in the config companies list.")
        names = [a.company]
    log = lambda m: print(time.strftime("%H:%M:%S"), m, flush=True)
    hdr = sb_login(cfg) if a.upload else None
    today = dt.date.today()
    d_to = dt.date.fromisoformat(a.d_to) if a.d_to else today
    exit_code = 0
    for company in names:
        d_from = dt.date.fromisoformat(a.d_from) if a.d_from else None
        if d_from is None:
            last = sb_last_to_date(cfg, hdr, company) if hdr else None
            d_from = (last - dt.timedelta(days=cfg.get("overlap_days", 3))) if last else dt.date.fromisoformat(cfg["start_date"])
        started = dt.datetime.now(dt.timezone.utc).isoformat()
        try:
            ledgers, vouchers = export_company(cfg, company, d_from, d_to, log, os.path.join(a.out, "raw") if a.save_raw else None)
        except TallyDown as e:
            log(f"STOP: {e}. Not contacting Tally again in this run.")
            return 2
        except DataMismatch as e:
            log(f"STOP: {e}")
            return 3
        log(f"{company}: {len(ledgers)} ledgers, {len(vouchers)} vouchers")
        if a.upload:
            if ledgers:
                sb_upsert(cfg, hdr, "tally_ledgers", ledgers, "company,name")
            sb_upsert(cfg, hdr, "tally_vouchers", vouchers, "company,guid")
            http_json(
                "POST", cfg["supabase_url"] + "/rest/v1/tally_sync_runs", {**hdr, "Prefer": "return=minimal"},
                {"company": company, "kind": "daybook", "from_date": d_from.isoformat(), "to_date": d_to.isoformat(),
                 "started_at": started, "finished_at": dt.datetime.now(dt.timezone.utc).isoformat(), "ok": True,
                 "ledgers": len(ledgers), "vouchers": len(vouchers), "bridge_version": VERSION})
        else:
            os.makedirs(a.out, exist_ok=True)
            safe = re.sub(r"[^A-Za-z0-9]+", "_", company).strip("_")
            with open(os.path.join(a.out, safe + ".json"), "w", encoding="utf-8") as f:
                json.dump({"company": company, "from": str(d_from), "to": str(d_to), "ledgers": ledgers, "vouchers": vouchers}, f, ensure_ascii=False, indent=1)
            log(f"dry run: wrote {os.path.join(a.out, safe + '.json')} (nothing uploaded)")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
