import json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(__file__))
import bridge, mock_tally


def run(cfg_extra, args, crash_after=None):
    srv, h = mock_tally.start()
    h.crash_after = crash_after
    out = tempfile.mkdtemp()
    cfg = {"tally_url": f"http://127.0.0.1:{srv.server_address[1]}", "companies": ["Co A", "Co B"], "start_date": "2026-11-01",
           "chunk_days": 1, "pause_seconds": 0, "supabase_url": "x", "supabase_anon_key": "x", **cfg_extra}
    cpath = os.path.join(out, "c.json")
    with open(cpath, "w") as f:
        json.dump(cfg, f)
    code = bridge.main(["--config", cpath, "--out", out, "--from", "2026-11-01", "--to", "2026-11-14", *args])
    srv.shutdown()
    return code, out, h


class T(unittest.TestCase):
    def test_dry_run_parses_and_dedupes(self):
        code, out, h = run({"intercompany_ledgers": {"Test Factory Ltd.": "Co B"}}, ["--company", "Co A"])
        self.assertEqual(code, 0)
        d = json.load(open(os.path.join(out, "Co_A.json")))
        self.assertEqual([l["name"] for l in d["ledgers"]], ["Cash", "Test Party & Co", "Test Factory Ltd."])
        self.assertEqual(len(d["vouchers"]), 3)
        v = {x["guid"]: x for x in d["vouchers"]}
        self.assertEqual(v["g-1"]["amount"], 1500.0)
        self.assertIn("Collection", v["g-1"]["narration"])          # control char removed, text kept
        self.assertEqual(v["g-2"]["counter_company"], "Co B")        # inter-company flag
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
        code, out, h = run({}, [], crash_after=1)   # ledgers ok, first day-book request: connection closed
        self.assertEqual(code, 2)
        self.assertEqual(len(h.log), 2)             # never retried, second company never contacted
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


if __name__ == "__main__":
    unittest.main()
