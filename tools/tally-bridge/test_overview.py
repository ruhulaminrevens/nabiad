"""Tests for overview_model.py (what the Overview page shows). Pure logic: no Qt, no network."""
import datetime as dt, os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import overview_model as M  # noqa: E402

NOW = dt.datetime(2026, 11, 25, 17, 30).astimezone()
COS = ["A", "B", "C"]


def iso(d):
    return d.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def run(company, ago_min, ok=True, vouchers=10, dur=2, error=None):
    s = NOW - dt.timedelta(minutes=ago_min)
    return dict(company=company, kind="incremental", started_at=iso(s), finished_at=iso(s + dt.timedelta(minutes=dur)), ok=ok, vouchers=vouchers if ok else None, error=error)


def summary(runs, companies=COS, **kw):
    kw.setdefault("sched", dict(installed=True, start="00:30", outdated=False))
    kw.setdefault("tally_ok", True); kw.setdefault("db_ok", True)
    return M.summarize(runs, companies, NOW, **kw)


class Numbers(unittest.TestCase):
    def test_south_asian_and_international_grouping(self):
        self.assertEqual([M.fmt_num(n) for n in (0, 999, 1000, 12345, 123456, 1234567, 31373973)], ["0", "999", "1,000", "12,345", "1,23,456", "12,34,567", "3,13,73,973"])
        self.assertEqual([M.fmt_num(n, "intl") for n in (999, 1000, 123456, 1234567)], ["999", "1,000", "123,456", "1,234,567"])
        self.assertEqual((M.fmt_num(-123456), M.fmt_num(None), M.fmt_num("x")), ("-1,23,456", "-", "-"))

    def test_next_run_is_today_when_still_ahead_else_tomorrow(self):
        a = M.next_run("22:00", NOW); b = M.next_run("00:30", NOW)
        self.assertEqual((a.day, a.hour, a.minute), (25, 22, 0)); self.assertEqual((b.day, b.hour, b.minute), (26, 0, 30))
        self.assertIsNone(M.next_run("nonsense", NOW))


class Log(unittest.TestCase):
    START = "2026-11-25 17:09:20 === nightly run start. companies=4 until=22:39 backfill=False dry_run=False"

    def test_running_run_counts_finished_companies(self):
        txt = "\n".join([self.START, "2026-11-25 17:09:20 A: start", "2026-11-25 17:12:50    17:12:50 A: 210 days read, 13314 vouchers, 0 ledgers, 0 marked deleted",
                         "2026-11-25 17:12:50 B: start"])
        p = M.log_progress(txt)
        self.assertTrue(p["running"]); self.assertEqual((p["total"], p["done"], p["problems"], p["current"], p["vouchers"]), (4, 1, 0, "B", 13314))
        self.assertEqual(M.eta_minutes(p, dt.datetime(2026, 11, 25, 17, 21).astimezone()), 35)    # ~11.7 min per company, 3 left

    def test_finished_run_and_only_the_last_run_counts(self):
        old = "2026-11-24 00:30:01 === nightly run start. companies=9 until=06:00 backfill=False dry_run=False\n2026-11-24 00:40:00 === nightly run end. ok=9 problems=0 "
        txt = old + "\n" + self.START + "\n2026-11-25 17:10:00 A: start"
        self.assertEqual(M.log_progress(old)["running"], False)
        p = M.log_progress(txt)
        self.assertTrue(p["running"]); self.assertEqual(p["total"], 4); self.assertEqual(p["current"], "A")
        end = txt + "\n2026-11-25 17:40:00 === nightly run end. ok=4 problems=0 "
        self.assertFalse(M.log_progress(end)["running"]); self.assertEqual(M.log_progress(end)["ended"].hour, 17)

    def test_retries_are_not_finished_but_final_failures_and_skips_are(self):
        txt = "\n".join([self.START, "2026-11-25 17:10:00 A: start", "2026-11-25 17:11:00 A: failed (code 2), try 1/3: Tally down", "2026-11-25 17:12:00 A: start",
                         "2026-11-25 17:13:00 A: failed (code 1), try 3/3: boom", "2026-11-25 17:13:01 B: NOT LOADED in Tally, skipped for now",
                         "2026-11-25 17:13:02 C: data check failed (wrong company data); nothing uploaded"])
        p = M.log_progress(txt)
        self.assertEqual((p["done"], p["problems"]), (3, 3))
        retry_only = "\n".join([self.START, "2026-11-25 17:11:00 A: failed (code 2), try 1/3: Tally down"])
        self.assertEqual(M.log_progress(retry_only)["done"], 0)

    def test_no_run_in_the_log(self):
        self.assertIsNone(M.log_progress("")); self.assertIsNone(M.log_progress("2026-11-25 10:00:00 Another sync is already running"))


class Summary(unittest.TestCase):
    def states(self, d):
        return {r["company"]: r["state"] for r in d["rows"]}

    def test_all_fresh_is_healthy(self):
        d = summary([run("A", 60), run("B", 58), run("C", 56)])
        self.assertEqual(self.states(d), {"A": "synced", "B": "synced", "C": "synced"})
        self.assertEqual((d["head"]["id"], d["head"]["kind"], d["issues"]), ("healthy", "success", []))
        self.assertTrue(all(c["ok"] for c in d["checks"])); self.assertEqual(d["pending"], 0)
        self.assertEqual(d["session"]["vouchers"], 30); self.assertEqual(d["session"]["ok"], 3)
        self.assertEqual(d["next"].hour, 0)

    def test_failed_then_fixed_is_not_an_open_failure_but_failed_last_is(self):
        fixed = summary([run("A", 10), run("A", 600, ok=False, error="x"), run("B", 60), run("C", 55)])
        self.assertEqual(self.states(fixed)["A"], "synced"); self.assertEqual(fixed["issues"], [])
        broken = summary([run("A", 10, ok=False, error="Tally did not answer"), run("A", 600), run("B", 60), run("C", 55)])
        self.assertEqual(self.states(broken)["A"], "failed")
        self.assertEqual([i["id"] for i in broken["issues"]], ["failed"]); self.assertEqual(broken["head"]["kind"], "error")
        self.assertEqual(broken["rows"][0]["company"], "A")                                    # problems come first
        self.assertFalse(next(c for c in broken["checks"] if c["id"] == "nofail")["ok"])

    def test_stale_never_and_data_check(self):
        d = summary([run("A", 40 * 60), run("B", 30)], COS)
        self.assertEqual(self.states(d), {"A": "stale", "B": "synced", "C": "never"})
        self.assertEqual({i["id"] for i in d["issues"]}, {"stale", "never"}); self.assertEqual(d["pending"], 2)
        dc = summary([run("A", 5, ok=False, error="data check failed (wrong company data); nothing uploaded"), run("B", 60), run("C", 60)])
        self.assertFalse(next(c for c in dc["checks"] if c["id"] == "data")["ok"])

    def test_running_company_and_headline(self):
        prog = dict(running=True, total=3, done=1, problems=0, current="B", vouchers=5, started=None, ended=None)
        d = summary([run("A", 5), run("B", 600), run("C", 600)], progress=prog)
        self.assertEqual(self.states(d)["B"], "running"); self.assertTrue(d["running"]); self.assertEqual(d["head"]["id"], "running")
        self.assertEqual(self.states(summary([run("A", 5)], ["A"], progress=prog))["A"], "synced")

    def test_connection_and_setup_problems_become_issues(self):
        d = summary([run("A", 5), run("B", 5), run("C", 5)], tally_ok=False, db_ok=False, db_error="timeout", sched=dict(installed=False))
        self.assertEqual({i["id"] for i in d["issues"]}, {"db", "tally", "sched_none"}); self.assertIsNone(d["next"])
        old = summary([run("A", 5), run("B", 5), run("C", 5)], sched=dict(installed=True, start="00:30", outdated=True))
        self.assertEqual([i["id"] for i in old["issues"]], ["sched_old"])
        none = summary([], [], sched=None, db_ok=True); self.assertIn("nocompany", [i["id"] for i in none["issues"]])
        setup = summary([], COS, login_saved=False, db_ok=None, tally_ok=None, sched=None)
        self.assertEqual(setup["head"]["id"], "setup"); self.assertEqual(setup["head"]["kind"], "warn")
        waiting = summary([], COS, db_ok=None, tally_ok=None, sched=None); self.assertEqual(waiting["head"]["id"], "nodata")
        self.assertIsNone(waiting["checks"][0]["ok"])
        down = summary([], COS, db_ok=False); self.assertEqual(down["head"]["id"], "dbdown")

    def test_tally_down_during_a_running_sync_is_not_reported(self):
        prog = dict(running=True, total=3, done=0, problems=0, current="", vouchers=0, started=None, ended=None)
        d = summary([run("A", 5), run("B", 5), run("C", 5)], tally_ok=False, progress=prog)
        self.assertNotIn("tally", [i["id"] for i in d["issues"]])


class History(unittest.TestCase):
    def test_session_groups_runs_that_follow_each_other(self):
        runs = [run("C", 20), run("B", 24), run("A", 28), run("C", 24 * 60), run("B", 24 * 60 + 4)]
        s = M.session_of(runs)
        self.assertEqual((s["runs"], s["companies"], s["ok"], s["failed"], s["vouchers"]), (3, 3, 3, 0, 30)); self.assertGreaterEqual(s["minutes"], 8)
        self.assertIsNone(M.session_of([]))

    def test_trend_has_seven_days_oldest_first(self):
        runs = [run("A", 10), run("B", 10, ok=False, error="x"), run("A", 24 * 60 * 3, vouchers=7)]
        tr = M.trend(runs, NOW)
        self.assertEqual(len(tr), 7); self.assertEqual(tr[-1]["ok"], 1); self.assertEqual(tr[-1]["failed"], 1); self.assertEqual(tr[-4]["vouchers"], 7)
        self.assertEqual([x["day"] for x in tr], sorted(x["day"] for x in tr))

    def test_recent_activity_newest_first(self):
        rec = M.recent_activity([run("A", 100), run("B", 5), run("C", 50, ok=False, error="e")], 2)
        self.assertEqual([r[2] for r in rec], ["B", "C"])


if __name__ == "__main__":
    unittest.main()
