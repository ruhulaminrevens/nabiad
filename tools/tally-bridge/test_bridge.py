import datetime as dt, json, os, re, sys, tempfile, threading, unittest, urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
sys.path.insert(0, os.path.dirname(__file__))
import bridge, mock_tally


def write_cfg(out, srv, extra=None):
    cfg = {"tally_url": f"http://127.0.0.1:{srv.server_address[1]}", "companies": ["Co A", "Co B"], "start_date": "2026-11-01",
           "pause_seconds": 0, "supabase_url": "x", "supabase_anon_key": "x", **(extra or {})}
    cpath = os.path.join(out, "c.json")
    with open(cpath, "w") as f:
        json.dump(cfg, f)
    return cpath


def run(cfg_extra, args, crash_after=None, ignore_dates=False):
    srv, h = mock_tally.start()
    h.crash_after = crash_after
    h.ignore_dates = ignore_dates
    out = tempfile.mkdtemp()
    cpath = write_cfg(out, srv, cfg_extra)
    code = bridge.main(["--config", cpath, "--out", out, "--from", "2026-11-01", "--to", "2026-11-14", *args])
    srv.shutdown(); srv.server_close()
    return code, out, h


class FakeSupabase(BaseHTTPRequestHandler):
    """Just enough PostgREST for the bridge: token, upsert, select, patch, insert."""
    tables = {}
    runs = []

    def _json(self, obj, code=200):
        data = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Length", str(len(data))); self.end_headers(); self.wfile.write(data)

    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n)) if n else None

    def do_POST(self):
        u = urllib.parse.urlparse(self.path); body = self._body()
        if u.path.startswith("/auth/v1/token"):
            return self._json({"access_token": "tok"})
        table = u.path.rsplit("/", 1)[-1]
        if table == "tally_sync_runs":
            FakeSupabase.runs.append(body); return self._json(None)
        key = {"tally_ledgers": ("company", "name"), "tally_vouchers": ("company", "guid")}[table]
        t = FakeSupabase.tables.setdefault(table, {})
        for r in body:
            k = tuple(r[c] for c in key)
            t[k] = {**t.get(k, {}), **r}
        return self._json(None)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(u.query)
        rows = list(FakeSupabase.tables.get("tally_vouchers", {}).values())
        rows = [r for r in rows if r["company"] == q["company"][0][3:] and not (q.get("deleted") and q["deleted"][0] == "eq.false" and r.get("deleted"))]
        for f in q.get("vdate", []):
            op, val = f.split(".", 1)
            rows = [r for r in rows if (r["vdate"] >= val if op == "gte" else r["vdate"] <= val)]
        self._json([{"guid": r["guid"], "vdate": r["vdate"]} for r in rows])

    def do_PATCH(self):
        u = urllib.parse.urlparse(self.path); q = urllib.parse.parse_qs(u.query); body = self._body()
        ids = q["guid"][0][4:-1].split(",")
        for r in FakeSupabase.tables["tally_vouchers"].values():
            if r["guid"] in ids:
                r.update(body)
        self._json(None)

    def log_message(self, *a): pass


class T(unittest.TestCase):
    def test_dry_run_parses_and_dedupes(self):
        code, out, h = run({"intercompany_ledgers": {"Test Factory Ltd.": "Co B"}}, ["--company", "Co A"])
        self.assertEqual(code, 0)
        with open(os.path.join(out, "Co_A.json")) as f:
            d = json.load(f)
        self.assertEqual([l["name"] for l in d["ledgers"]], ["Cash", "Test Party & Co", "Test Factory Ltd."])
        self.assertEqual(len(d["vouchers"]), 3)
        v = {x["guid"]: x for x in d["vouchers"]}
        self.assertEqual(v["g-1"]["amount"], 1500.0)
        self.assertIn("Collection", v["g-1"]["narration"])
        self.assertEqual(v["g-2"]["counter_company"], "Co B")
        self.assertIsNone(v["g-1"]["counter_company"])
        self.assertTrue(v["g-3"]["cancelled"])
        self.assertEqual(v["g-1"]["vdate"], "2026-11-02")

    def test_only_standard_export_requests(self):
        _, _, h = run({}, ["--company", "Co A"])
        self.assertTrue(all("<TALLYREQUEST>Export</TALLYREQUEST>" in b and "<TYPE>Data</TYPE>" in b for b in h.log))
        self.assertFalse(any("TDL" in b or "Import" in b for b in h.log))
        self.assertEqual(len(h.log), 1 + 14)  # ledgers + one request per day

    def test_company_not_in_config_is_refused(self):
        with self.assertRaises(SystemExit):
            run({}, ["--company", "Other Co"])

    def test_stops_at_first_failure(self):
        code, out, h = run({}, [], crash_after=1)
        self.assertEqual(code, 2)
        self.assertEqual(len(h.log), 2)
        self.assertFalse(os.path.exists(os.path.join(out, "Co_A.json")))

    def test_wrong_date_from_tally_stops_without_output(self):
        code, out, h = run({}, ["--company", "Co A"], ignore_dates=True)
        self.assertEqual(code, 3)
        self.assertFalse(os.path.exists(os.path.join(out, "Co_A.json")))

    def test_live_port_needs_flag(self):
        cfg = tempfile.mktemp(suffix=".json")
        with open(cfg, "w") as f:
            json.dump({"tally_url": "http://localhost:9000", "companies": ["x"], "start_date": "2026-01-01"}, f)
        with self.assertRaises(SystemExit):
            bridge.main(["--config", cfg])

    def test_utf16_and_escaping(self):
        self.assertIn("<A/>", bridge.decode("<A/>".encode("utf-16")))
        self.assertIn("&amp;", bridge.request_xml("Day Book", "A & B"))

    def test_plan_days_window_and_wrapping_history(self):
        cfg = {"start_date": "2026-11-01", "window_days": 3, "deep_days": 4}
        today = dt.date(2026, 11, 14)
        segs, cur = bridge.plan_days(cfg, {}, today)
        self.assertEqual([str(d) for d in segs[0]], ["2026-11-12", "2026-11-13", "2026-11-14"])
        self.assertEqual([str(d) for d in segs[1]], ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"])
        self.assertEqual(str(cur), "2026-11-05")
        segs, cur = bridge.plan_days(cfg, {"deep_cursor": "2026-11-09"}, today)
        self.assertEqual([str(d) for d in segs[1]], ["2026-11-09", "2026-11-10", "2026-11-11"])
        self.assertEqual(str(cur), "2026-11-01")   # reached the window: wraps to the start
        segs, _ = bridge.plan_days({"start_date": "2026-11-12", "window_days": 3}, {}, today)
        self.assertEqual(len(segs), 1)             # short history: nothing older than the window

    def test_missing_guids(self):
        self.assertEqual(bridge.missing_guids([{"guid": "a"}, {"guid": "b"}, {"guid": "c"}], {"a", "c"}), ["b"])

    def _upload(self, srv_url, tally, out, extra, args):
        cpath = write_cfg(out, tally, {"supabase_url": srv_url, "supabase_anon_key": "k", **extra})
        os.environ["TALLY_BRIDGE_EMAIL"] = "b@x"; os.environ["TALLY_BRIDGE_PASSWORD"] = "p"
        return bridge.main(["--config", cpath, "--out", out, "--upload", "--state", os.path.join(out, "st.json"), "--company", "Co A", *args])

    def test_upload_marks_deleted_and_undeletes(self):
        sb = HTTPServer(("127.0.0.1", 0), FakeSupabase); FakeSupabase.tables = {}; FakeSupabase.runs = []
        threading.Thread(target=sb.serve_forever, daemon=True).start()
        tally, h = mock_tally.start(); out = tempfile.mkdtemp(); url = f"http://127.0.0.1:{sb.server_address[1]}"
        try:
            rng = ["--from", "2026-11-01", "--to", "2026-11-14"]
            self.assertEqual(self._upload(url, tally, out, {}, rng), 0)
            vs = FakeSupabase.tables["tally_vouchers"]
            self.assertEqual(sorted(k[1] for k in vs), ["g-1", "g-2", "g-3"])
            self.assertFalse(any(r["deleted"] for r in vs.values()))
            self.assertEqual(len(FakeSupabase.tables["tally_ledgers"]), 3)
            h.drop = {"g-2"}                                   # voucher deleted in Tally
            self.assertEqual(self._upload(url, tally, out, {}, rng + ["--skip-ledgers"]), 0)
            self.assertTrue(vs[("Co A", "g-2")]["deleted"])
            self.assertFalse(vs[("Co A", "g-1")]["deleted"])
            h.drop = set()                                     # it comes back (or was restored)
            self.assertEqual(self._upload(url, tally, out, {}, rng + ["--skip-ledgers"]), 0)
            self.assertFalse(vs[("Co A", "g-2")]["deleted"])
            self.assertTrue(all(r["ok"] for r in FakeSupabase.runs))
        finally:
            sb.shutdown(); sb.server_close(); tally.shutdown(); tally.server_close()

    def test_mass_missing_is_not_marked_deleted(self):
        sb = HTTPServer(("127.0.0.1", 0), FakeSupabase); FakeSupabase.tables = {}; FakeSupabase.runs = []
        threading.Thread(target=sb.serve_forever, daemon=True).start()
        tally, h = mock_tally.start(); out = tempfile.mkdtemp(); url = f"http://127.0.0.1:{sb.server_address[1]}"
        try:
            rng = ["--from", "2026-11-01", "--to", "2026-11-14", "--skip-ledgers"]
            self._upload(url, tally, out, {}, rng)
            h.drop = {"g-1", "g-2", "g-3"}                     # company not loaded: Tally returns nothing
            self.assertEqual(self._upload(url, tally, out, {}, rng), 0)
            self.assertFalse(any(r["deleted"] for r in FakeSupabase.tables["tally_vouchers"].values()))
        finally:
            sb.shutdown(); sb.server_close(); tally.shutdown(); tally.server_close()

    def test_nightly_mode_walks_history_and_saves_progress(self):
        sb = HTTPServer(("127.0.0.1", 0), FakeSupabase); FakeSupabase.tables = {}; FakeSupabase.runs = []
        threading.Thread(target=sb.serve_forever, daemon=True).start()
        tally, h = mock_tally.start(); out = tempfile.mkdtemp(); url = f"http://127.0.0.1:{sb.server_address[1]}"
        extra = {"window_days": 3, "deep_days": 4, "batch_days": 2}
        try:
            self.assertEqual(self._upload(url, tally, out, extra, ["--today", "2026-11-14", "--skip-ledgers"]), 0)
            self.assertEqual(sorted(k[1] for k in FakeSupabase.tables["tally_vouchers"]), ["g-1", "g-2"])   # days 1-4 found
            with open(os.path.join(out, "st.json")) as f:
                self.assertEqual(json.load(f)["Co A"]["deep_cursor"], "2026-11-05")
            self._upload(url, tally, out, extra, ["--today", "2026-11-14", "--skip-ledgers"])    # days 5-8
            self._upload(url, tally, out, extra, ["--today", "2026-11-14", "--skip-ledgers"])    # days 9-11
            self.assertEqual(sorted(k[1] for k in FakeSupabase.tables["tally_vouchers"]), ["g-1", "g-2", "g-3"])
            with open(os.path.join(out, "st.json")) as f:
                self.assertEqual(json.load(f)["Co A"]["deep_cursor"], "2026-11-01")                 # wrapped
        finally:
            sb.shutdown(); sb.server_close(); tally.shutdown(); tally.server_close()


if __name__ == "__main__":
    unittest.main()
