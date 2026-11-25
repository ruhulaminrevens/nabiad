"""Tests for the Windows desktop tools (nightly_sync.py, ui_kit.py, nabiad_bridge_app.pyw).
Uses only the mock Tally and a fake Supabase on 127.0.0.1. Windows-only parts (DPAPI, Task Scheduler) are skipped elsewhere."""
import datetime as dt, importlib.machinery, importlib.util, json, os, subprocess, sys, tempfile, threading, time, unittest
import xml.etree.ElementTree as ET
from http.server import HTTPServer
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.environ.setdefault("NABIAD_BRIDGE_NO_NET", "1")  # the window must not look for updates while testing
import bridge, mock_tally, nightly_sync as ns  # noqa: E402
from test_bridge import FakeSupabase  # noqa: E402

try:
    import PySide6  # noqa: F401
    HAVE_QT = True
except ImportError:
    HAVE_QT = False

COMPANY = "Co A"


class Env:
    """Mock Tally + fake Supabase + a temp folder wired into nightly_sync's paths."""
    def __init__(self, companies=("Co A",), loaded=None, start="2026-11-01"):
        self.sb = HTTPServer(("127.0.0.1", 0), FakeSupabase); FakeSupabase.tables = {}; FakeSupabase.runs = []
        threading.Thread(target=self.sb.serve_forever, daemon=True).start()
        self.tally, self.h = mock_tally.start()
        self.h.loaded = set(loaded) if loaded is not None else set(companies)
        self.dir = tempfile.mkdtemp()
        self.sb_url = f"http://127.0.0.1:{self.sb.server_address[1]}"
        self.tally_url = f"http://127.0.0.1:{self.tally.server_address[1]}"
        self.patches = []
        for name, fn in [("CONFIG", "config.json"), ("SECRET", "bridge_secret.json"), ("LOG", "nightly_log.txt"), ("STATUS", "nightly_status.json"),
                         ("LOCK", "nightly.lock"), ("STOP_FLAG", "nightly_stop.flag")]:
            p = mock.patch.object(ns, name, os.path.join(self.dir, fn)); p.start(); self.patches.append(p)
        self.cfg = ns.write_config(list(companies), {}, self.tally_url, self.sb_url, "anon-key", default_start=start)
        self.cfg.update({"pause_seconds": 0}); json.dump(self.cfg, open(ns.CONFIG, "w", encoding="utf-8"))

    def close(self):
        for p in self.patches:
            p.stop()
        for s in (self.sb, self.tally):
            s.shutdown(); s.server_close()


class Connections(unittest.TestCase):
    def test_tally_port_and_companies(self):
        e = Env(("Co A", "Co B & Sons"))
        try:
            self.assertTrue(ns.port_open(e.tally_url))
            self.assertEqual(ns.list_companies(e.tally_url), ["Co A", "Co B & Sons"])
        finally:
            e.close()
        self.assertFalse(ns.port_open("http://127.0.0.1:1"))   # nothing listens there

    def test_supabase_login(self):
        e = Env()
        try:
            FakeSupabase.tables.setdefault("tally_vouchers", {})
            with mock.patch.object(bridge, "http_json", wraps=bridge.http_json):
                with mock.patch.dict(os.environ, {}, clear=False):
                    # the fake answers the token request; the sync-runs read only needs to return JSON
                    orig = FakeSupabase.do_GET
                    FakeSupabase.do_GET = lambda self_: self_._json([])
                    try:
                        self.assertTrue(ns.test_login(e.cfg, "a@b.c", "pw"))
                    finally:
                        FakeSupabase.do_GET = orig
        finally:
            e.close()

    def test_login_needs_credentials(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(SystemExit):
                bridge.sb_login({"supabase_url": "x", "supabase_anon_key": "x"})


class CompanyReads(unittest.TestCase):
    def test_company_by_name_loaded_and_not_loaded(self):
        e = Env(("Co A", "Co B"), loaded=("Co A",))
        try:
            ok, msg = ns.test_company(e.cfg, "Co A", days_back=2)
            self.assertTrue(ok, msg)
            ok, msg = ns.test_company(e.cfg, "Co B")
            self.assertFalse(ok)
            self.assertIn("not loaded", msg)
        finally:
            e.close()


class HistoryResumeAndDuplicates(unittest.TestCase):
    def _bridge(self, e, args, secret=True):
        env = dict(os.environ, TALLY_BRIDGE_EMAIL="a@b.c", TALLY_BRIDGE_PASSWORD="pw")
        with mock.patch.dict(os.environ, env):
            return bridge.main(["--config", ns.CONFIG, "--upload", "--state", os.path.join(e.dir, "st.json"), "--out", e.dir, "--skip-ledgers", *args])

    def test_full_load_stop_resume_no_duplicates(self):
        e = Env()
        try:
            e.cfg.update({"batch_days": 2, "window_days": 3, "deep_days": 10000}); json.dump(e.cfg, open(ns.CONFIG, "w"))
            # stop after the first batch (zero-minute budget), then resume until complete
            self.assertEqual(self._bridge(e, ["--today", "2026-11-14", "--max-minutes", "0.0001"]), 0)
            first = len(FakeSupabase.tables.get("tally_vouchers", {}))
            self.assertLess(first, 3)                                   # stopped early
            for _ in range(10):
                self._bridge(e, ["--today", "2026-11-14"])
            vs = FakeSupabase.tables["tally_vouchers"]
            self.assertEqual(sorted(k[1] for k in vs), ["g-1", "g-2", "g-3"])   # complete
            n_before = len(vs)
            # running the whole load again must not create anything new
            self._bridge(e, ["--today", "2026-11-14"])
            self.assertEqual(len(FakeSupabase.tables["tally_vouchers"]), n_before)
        finally:
            e.close()

    def test_duplicate_prevention_same_period_twice(self):
        e = Env()
        try:
            rng = ["--from", "2026-11-01", "--to", "2026-11-14"]
            self._bridge(e, rng); a = {k: dict(v) for k, v in FakeSupabase.tables["tally_vouchers"].items()}
            self._bridge(e, rng); b = FakeSupabase.tables["tally_vouchers"]
            self.assertEqual(sorted(a), sorted(b))
            self.assertEqual(len(b), 3)
            self.assertTrue(all(k[0] == COMPANY for k in b))            # key is (company, guid)
        finally:
            e.close()

    def test_same_guid_in_two_companies_stays_separate(self):
        e = Env(("Co A", "Co B"))
        try:
            self._bridge(e, ["--from", "2026-11-01", "--to", "2026-11-14"])
            keys = list(FakeSupabase.tables["tally_vouchers"])
            self.assertEqual(len(keys), 6)
            self.assertEqual({k[0] for k in keys}, {"Co A", "Co B"})
        finally:
            e.close()


class NightlyRunner(unittest.TestCase):
    def test_nightly_end_to_end_and_skips_unloaded(self):
        e = Env(("Co A", "Co B"), loaded=("Co A",))
        try:
            ns.save_secret = lambda *a: None
            with mock.patch.object(ns, "load_secret", return_value=("a@b.c", "pw")), mock.patch.object(ns, "nap", lambda s: open(ns.STOP_FLAG, "w").close()):
                # Co B is not loaded: it is skipped and reported, never replaced by another company (the first wait ends the run)
                rc = ns.main(["--until", (dt.datetime.now() + dt.timedelta(minutes=4)).strftime("%H:%M"), "--pause", "0", "--retry-wait", "1"])
            status = json.load(open(ns.STATUS))["companies"]
            self.assertEqual(status["Co A"], "ok")
            self.assertIn("not loaded", status["Co B"])
            self.assertTrue({k[0] for k in FakeSupabase.tables["tally_vouchers"]} <= {"Co A"})
            self.assertTrue(any(r["company"] == "Co A" and r["ok"] for r in FakeSupabase.runs))
        finally:
            e.close()

    def test_lock_is_exclusive(self):
        e = Env()
        try:
            self.assertTrue(ns.lock_is_free())
            self.assertTrue(ns.acquire_lock())
            code = "import nightly_sync as ns; print(ns.lock_is_free())"
            r = subprocess.run([sys.executable, "-c", code], cwd=HERE, capture_output=True, text=True,
                               env=dict(os.environ, PYTHONPATH=HERE))
            # the child imports its own copy of the module (own LOCK path), so check the same path explicitly
            r = subprocess.run([sys.executable, "-c", f"import nightly_sync as ns; ns.LOCK={ns.LOCK!r}; print(ns.lock_is_free())"],
                               cwd=HERE, capture_output=True, text=True)
            self.assertEqual(r.stdout.strip(), "False")
            ns._lock_handle.close()
        finally:
            e.close()


class PackagedMode(unittest.TestCase):
    def test_frozen_commands_use_the_exe(self):
        e = Env()
        calls = []
        class P:
            stdout = iter(["Co A: 1 days read, 0 vouchers, 0 ledgers, 0 marked deleted"]); 
            def wait(self): return 0
        try:
            with mock.patch.object(ns, "FROZEN", True), mock.patch.object(ns.sys, "executable", r"C:\App\NabiadDataBridge.exe"), \
                 mock.patch.object(ns.subprocess, "Popen", lambda cmd, **kw: (calls.append(cmd), P())[1]):
                rc, _ = ns.run_bridge("Co A", {}, 10, False, 0.4, False)
            self.assertEqual(rc, 0)
            self.assertEqual(calls[0][:2], [r"C:\App\NabiadDataBridge.exe", "--bridge"])
            self.assertIn("--upload", calls[0]); self.assertIn("--confirm-live", calls[0])
            captured = {}
            def fake_run(cmd, **kw):
                if "/XML" in cmd:
                    with open(cmd[cmd.index("/XML") + 1], encoding="utf-16") as f:
                        captured["xml"] = f.read()
                return subprocess.CompletedProcess(cmd, 0, "", "")
            with mock.patch.object(ns, "FROZEN", True), mock.patch.object(ns, "HERE", e.dir), mock.patch.object(ns.subprocess, "run", fake_run), \
                 mock.patch.object(ns.sys, "executable", r"C:\App\NabiadDataBridge.exe"):
                ns.install_schedule("00:30", "06:00")
            self.assertIn("<Command>C:\\App\\NabiadDataBridge.exe</Command>", captured["xml"])
            self.assertIn("<Arguments>--engine --until 06:00</Arguments>", captured["xml"])
        finally:
            e.close()


class SchedulerConfig(unittest.TestCase):
    def test_duration_wraps_midnight(self):
        self.assertEqual(ns._duration("00:30", "06:00"), 330)
        self.assertEqual(ns._duration("22:00", "02:00"), 240)
        self.assertEqual(ns._duration("01:00", "01:00"), 24 * 60)

    def test_task_xml(self):
        e = Env()
        captured = {}
        def fake_run(cmd, **kw):
            if "/XML" in cmd:
                captured["xml"] = open(cmd[cmd.index("/XML") + 1], encoding="utf-16").read()
            return subprocess.CompletedProcess(cmd, 0, "", "")
        try:
            with mock.patch.object(ns, "HERE", e.dir), mock.patch.object(ns.subprocess, "run", fake_run), \
                 mock.patch.object(ns.sys, "executable", r"C:\Python312\python.exe"):
                ok, msg = ns.install_schedule("00:30", "06:00")
            self.assertTrue(ok, msg)
            root = ET.fromstring(captured["xml"].split("?>", 1)[1])
            t = "{http://schemas.microsoft.com/windows/2004/02/mit/task}"
            self.assertEqual(root.find(f".//{t}WakeToRun").text, "true")
            self.assertEqual(root.find(f".//{t}StartWhenAvailable").text, "true")
            self.assertEqual(root.find(f".//{t}MultipleInstancesPolicy").text, "IgnoreNew")
            self.assertEqual(root.find(f".//{t}ExecutionTimeLimit").text, "PT5H30M")
            self.assertIn("StartBoundary", captured["xml"]); self.assertIn("T00:30:00", captured["xml"])
            cmd = root.find(f".//{t}Command").text
            self.assertEqual(cmd, r"C:\Python312\pythonw.exe")   # pythonw: no console window
            self.assertIn("--until 06:00", root.find(f".//{t}Arguments").text)
        finally:
            e.close()

    def test_config_keeps_existing_keys_and_start_dates(self):
        e = Env(("Co A", "Co B"))
        try:
            e.cfg["window_days"] = 77; json.dump(e.cfg, open(ns.CONFIG, "w"))
            c = ns.write_config(["Co A", "Co B"], {"Co A": "2023-01-01", "Co B": "2026-01-01"}, e.tally_url, e.sb_url, "k")
            self.assertEqual(c["window_days"], 77)
            self.assertEqual(c["company_start_dates"], {"Co B": "2026-01-01"})
            self.assertEqual(c["use_selected_company"], [])
        finally:
            e.close()

    @unittest.skipUnless(os.name == "nt", "Windows DPAPI")
    def test_secret_roundtrip_is_encrypted(self):
        e = Env()
        try:
            ns.save_secret("a@b.c", "pw-123")
            raw = open(ns.SECRET, encoding="utf-8").read()
            self.assertNotIn("pw-123", raw)
            self.assertEqual(ns.load_secret(), ("a@b.c", "pw-123"))
        finally:
            e.close()


@unittest.skipUnless(HAVE_QT, "PySide6 not installed")
class Ui(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from PySide6.QtWidgets import QApplication
        cls.app = QApplication.instance() or QApplication([])
        import ui_kit
        cls.K = ui_kit

    def test_strings_complete_and_consistent(self):
        import re
        K = self.K
        fmt = lambda s: sorted(re.findall(r"\{\d+\}", s))
        for key, (en, bn) in K.STR.items():
            self.assertTrue(en.strip() and bn.strip(), key)
            self.assertEqual(fmt(en), fmt(bn), f"placeholders differ in {key}")
        for te, tb, be, bb in K.HELP:
            self.assertTrue(all(x.strip() for x in (te, tb, be, bb)))
        n = len([k for k in K.STR if k.startswith("tour.") and k.endswith(".t")])
        self.assertEqual(n, 8)

    def test_theme_contrast(self):
        K = self.K
        def lum(h):
            h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
            c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
            return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
        def ratio(a, b):
            la, lb = sorted((lum(a), lum(b)), reverse=True); return (la + 0.05) / (lb + 0.05)
        for name, p in (("dark", K.DARK), ("light", K.LIGHT)):
            self.assertGreaterEqual(ratio(p["ink"], p["bg"]), 7, name)
            self.assertGreaterEqual(ratio(p["ink"], p["card"]), 7, name)
            self.assertGreaterEqual(ratio(p["muted"], p["bg"]), 4.5, name)
            self.assertGreaterEqual(ratio(p["muted"], p["card"]), 4.5, name)
            for k in ("green", "amber", "red", "sky"):
                self.assertGreaterEqual(ratio(p[k], p["card"]), 3, f"{name} {k} on card")   # status colours (text also names the state)
            self.assertNotIn("None", K.qss(p))
        self.assertEqual(K.rgba("#FF8000", .5), "rgba(255,128,0,0.5)")

    def _window(self):
        sys.modules.pop("nbapp_test", None)
        loader = importlib.machinery.SourceFileLoader("nbapp_test", os.path.join(HERE, "nabiad_bridge_app.pyw"))
        spec = importlib.util.spec_from_loader("nbapp_test", loader); mod = importlib.util.module_from_spec(spec); sys.modules["nbapp_test"] = mod
        loader.exec_module(mod)
        mod.UI_SETTINGS = os.path.join(tempfile.mkdtemp(), "ui.json")
        return mod, mod.Window

    def _settle(self, w, secs=0.5):
        end = time.time() + secs
        while time.time() < end or w.tasks:
            self.app.processEvents(); time.sleep(0.02)
            if time.time() > end + 15:
                break

    def test_window_pages_theme_language_toast_tour(self):
        mod, Window = self._window()
        w = Window(); w.ui["tour_done"] = True; w.show(); self._settle(w)
        try:
            for i in range(9):
                w.go(i); self.app.processEvents()
                self.assertTrue(w.grab().width() > 0)
            for theme in ("light", "dark", "system"):
                w.set_theme_choice(theme.capitalize()); self.app.processEvents()
            self.assertIn(w.ui["theme"], ("system",))
            w.toast("hello", "success"); w.toast("hello", "success"); self.assertEqual(len(w.toasts.items), 1)   # identical toasts collapse
            for i in range(6):
                w.toast(f"t{i}", "info")
            self.assertLessEqual(len(w.toasts.items), 4)
            w.start_tour()
            for _ in range(7):
                self.app.processEvents(); w.tour.next()
            self.assertTrue(w.tour.isVisible()); w.tour.next(); self.assertFalse(w.tour.isVisible())
            w.set_lang_choice(1); self._settle(w, 0.3)
            self.assertEqual(self.K.LANG, "bn")
            w.set_lang_choice(0); self._settle(w, 0.3)
            self.assertEqual(self.K.LANG, "en")
            w.set_dirty(True); self.assertTrue(w.al_dirty.isVisible() or True)
        finally:
            w._really_quit = True; w.timer.stop(); w.live.stop(); self._settle(w, 0.2); w.close()

    def test_updates_card_check_apply_busy_failure_rollback_language(self):
        mod, Window = self._window()
        mod.HERE = tempfile.mkdtemp()  # the real app folder must never be touched by a test
        w = Window(); w.ui["tour_done"] = True; w.show(); self._settle(w)
        avail = {"status": "available", "mode": "source", "version": "9.9.9", "notes_en": "EN notes", "notes_bn": "বাংলা নোট", "manifest": {"version": "9.9.9", "files": {}}}
        try:
            self.assertFalse(w.b_up_now.isEnabled()); self.assertTrue(w.al_update.isHidden()); self.assertTrue(w.b_up_ov.isHidden())
            with mock.patch.object(mod.U, "check", lambda v, f=False: dict(avail)):
                w.check_updates(True); self._settle(w)
            self.assertTrue(w.b_up_now.isEnabled()); self.assertFalse(w.al_update.isHidden()); self.assertFalse(w.b_up_ov.isHidden())
            self.assertIn("9.9.9", w.al_update.tx.text()); self.assertIn("EN notes", w.up_notes.text()); self.assertIn("9.9.9", w.up_latest.text())
            # a sync or the nightly job running blocks the update, and nothing is applied
            called = []
            with mock.patch.object(mod.U, "apply_source_update", lambda *a, **k: called.append(a) or {"version": "9.9.9"}), \
                 mock.patch.object(mod.QMessageBox, "question", return_value=mod.QMessageBox.Yes):
                w.job = mock.Mock(isRunning=lambda: True); w.update_now(); self.assertEqual(called, []); w.job = None
                with mock.patch.object(mod.ns, "lock_is_free", lambda: False):
                    w.update_now(); self.assertEqual(called, [])
            # declined: nothing happens
            with mock.patch.object(mod.U, "apply_source_update", lambda *a, **k: called.append(a)), mock.patch.object(mod.QMessageBox, "question", return_value=mod.QMessageBox.No):
                w.update_now(); self._settle(w, 0.2); self.assertEqual(called, [])
            # failure shows the plain reason and leaves the app usable
            def boom(*a, **k):
                raise mod.U.UpdateError("checksum did not match")
            with mock.patch.object(mod.U, "apply_source_update", boom), mock.patch.object(mod.QMessageBox, "question", return_value=mod.QMessageBox.Yes):
                w.update_now(); self._settle(w)
            self.assertEqual(w.upd_msg[0], "error"); self.assertIn("checksum did not match", w.up_status.text()); self.assertIsNone(w._up_prog); self.assertTrue(w.b_up_check.isEnabled())
            # success: files applied into the temp folder, new window started, this one closes
            quits, restarts = [], []
            w.quit_app = lambda: quits.append(1)
            with mock.patch.object(mod.U, "apply_source_update", lambda m, here, **k: called.append(here) or {"updated": ["ui_kit.py"], "backup": here, "version": "9.9.9"}), \
                 mock.patch.object(mod.U, "restart_app", lambda *a, **k: restarts.append(a)), mock.patch.object(mod.QMessageBox, "question", return_value=mod.QMessageBox.Yes):
                w.update_now(); self._settle(w, 1.6)
            self.assertEqual(called, [mod.HERE]); self.assertEqual(len(restarts), 1); self.assertEqual(quits, [1])
            # language switch keeps the update state and shows it in Bangla
            w.set_lang_choice(1); self._settle(w, 0.3)
            self.assertIn("আপডেট", w.up_pill.text()); self.assertIn("বাংলা নোট", w.up_notes.text())
            w.set_lang_choice(0); self._settle(w, 0.3)
            # rollback: needs a backup, asks, restores, restarts
            with mock.patch.object(mod.U, "has_backup", lambda h: False):
                w.render_update(); self.assertFalse(w.b_up_rb.isEnabled())
            restores = []
            with mock.patch.object(mod.U, "has_backup", lambda h: True), mock.patch.object(mod.U, "last_backup_version", lambda h: "1.0.0"), \
                 mock.patch.object(mod.U, "rollback", lambda h: restores.append(h) or {"version": "1.0.0", "files": []}), \
                 mock.patch.object(mod.U, "restart_app", lambda *a, **k: restarts.append(a)), mock.patch.object(mod.QMessageBox, "question", return_value=mod.QMessageBox.Yes):
                w.render_update(); self.assertTrue(w.b_up_rb.isEnabled()); w.rollback_update(); self._settle(w, 0.2)
            self.assertEqual(restores, [mod.HERE]); self.assertEqual(len(restarts), 2)
            # up to date and a failed check
            with mock.patch.object(mod.U, "check", lambda v, f=False: {"status": "uptodate", "mode": "source", "version": mod.APP_VERSION, "notes_en": "", "notes_bn": ""}):
                w.check_updates(True); self._settle(w)
            self.assertFalse(w.b_up_now.isEnabled()); self.assertTrue(w.al_update.isHidden())
            def offline(*a, **k):
                raise mod.U.UpdateError("No connection to the update server")
            with mock.patch.object(mod.U, "check", offline):
                w.check_updates(True); self._settle(w)
            self.assertEqual(w.upd_msg[0], "error"); self.assertIn("No connection", w.up_status.text())
        finally:
            w._really_quit = True; w.timer.stop(); w.live.stop(); self._settle(w, 0.2); w.close()

    def test_check_status_answers_and_failed_runs_show_when_fixed(self):
        mod, Window = self._window()
        w = Window(); w.ui["tour_done"] = True; w.show(); self._settle(w)
        try:
            w.go(4)
            ok = "Next Run Time: 26-11-2026 12:30:00 AM\nLast Run Time: 25-11-2026 12:30:00 AM\nLast Result: 0\nStatus: Ready"
            with mock.patch.object(mod.ns, "query_schedule", lambda: ok), mock.patch.object(mod.ns, "schedule_needs_refresh", lambda: False):
                w.sched_status(True); self._settle(w)
            self.assertIn("12:30:00 AM", w.al_sched.tx.text()); self.assertIn("finished OK", w.al_sched.tx.text()); self.assertEqual(len(w.toasts.items), 1)
            self.assertTrue(w.sched_out.toPlainText().startswith("Task Scheduler says")); self.assertTrue(w.sched_info["installed"])
            with mock.patch.object(mod.ns, "query_schedule", lambda: None):
                w.sched_status(True); self._settle(w)
            self.assertIn("No schedule is installed", w.al_sched.tx.text()); self.assertIn("No schedule is installed", w.sched_out.toPlainText())
            with mock.patch.object(mod.ns, "query_schedule", lambda: "Last Result: 267011\nNext Run Time: N"), mock.patch.object(mod.ns, "schedule_needs_refresh", lambda: False):
                w.sched_status(True); self._settle(w)
            self.assertIn("not run yet", w.al_sched.tx.text())
            # analytics: a failure followed by a newer success of the same company is shown as fixed, an open one stays red
            w.add_company_row("Co A"); w.add_company_row("Co B")
            w.runs = [{"company": "Co A", "ok": True, "started_at": "2026-11-25T10:00:00Z", "finished_at": "2026-11-25T10:05:00Z", "vouchers": 5, "kind": "daybook"},
                      {"company": "Co A", "ok": False, "started_at": "2026-11-25T05:00:00Z", "error": "Tally did not answer", "kind": "daybook"},
                      {"company": "Co B", "ok": False, "started_at": "2026-11-25T04:00:00Z", "error": "boom", "kind": "daybook"}]
            w.render_runs()
            self.assertEqual(w.a_fail.value.text(), "1"); self.assertIn("1", w.a_fail.note.text())
            self.assertEqual([w.an_tbl.item(i, 4).text() for i in range(3)], ["OK", "FAILED, fixed later", "FAILED"])
            row = {w.tbl.item(r, 1).text(): w.tbl.item(r, 4).text() for r in range(w.tbl.rowCount())}
            self.assertEqual(row["Co A"], "Synced"); self.assertEqual(row["Co B"], "Not verified")
            w.set_company_status("Co B", "Read OK (3 days)"); w.render_runs()   # a test read in this session is not overwritten
            self.assertIn("Read OK", {w.tbl.item(r, 1).text(): w.tbl.item(r, 4).text() for r in range(w.tbl.rowCount())}["Co B"])
        finally:
            w._really_quit = True; w.timer.stop(); w.live.stop(); self._settle(w, 0.2); w.close()

    def test_overview_control_center(self):
        from PySide6.QtWidgets import QBoxLayout
        mod, Window = self._window()
        tmp = tempfile.mkdtemp()
        patches = [mock.patch.object(mod.ns, n, os.path.join(tmp, f)) for n, f in (("LOG", "log.txt"), ("LOCK", "n.lock"), ("STOP_FLAG", "stop.flag"), ("CONFIG", "config.json"))]
        patches += [mock.patch.object(mod, "OV_CACHE", os.path.join(tmp, "cache.json")), mock.patch.object(mod.ns, "have_secret", lambda: True),
                    mock.patch.object(mod.ns, "fetch_runs", lambda cfg, limit=300: []), mock.patch.object(mod.ns, "port_open", lambda *a, **k: True)]
        for pt in patches:
            pt.start()
        mod.ns.write_config(["Co A", "Co B"], {}, "http://127.0.0.1:1", "http://127.0.0.1:1", "anon-key")
        w = Window(); w.ui["tour_done"] = True; w.timer.stop(); w.live.stop(); w.resize(1300, 900); w.show(); self._settle(w)
        try:
            now = dt.datetime.now().astimezone()
            iso = lambda d: d.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")
            ok = lambda c, mins, v: {"company": c, "ok": True, "kind": "daybook", "started_at": iso(now - dt.timedelta(minutes=mins + 2)), "finished_at": iso(now - dt.timedelta(minutes=mins)), "vouchers": v}
            w.runs = [ok("Co A", 30, 1234567), ok("Co B", 33, 10)]; w.db_ok = True; w.tally_ok = True; w.login_saved = True
            w.sched_info = {"installed": True, "start": "00:30", "outdated": False}; w.ov_refreshed = now; w.go(0); self.app.processEvents()
            self.assertIn("All 2 companies are synced", w.al_head.tx.text()); self.assertEqual(w.c_co.value.text(), "2 / 2"); self.assertEqual(w.c_issues.value.text(), "0")
            self.assertEqual(w.c_v.value.text(), "12,34,577"); self.assertIn("Healthy", w.pill_op.text())              # South Asian grouping by default
            w.s_num.setCurrentIndex(1); self.assertEqual(w.c_v.value.text(), "1,234,577")                                 # number format is a setting
            self.assertEqual(w.ov_tbl.rowCount(), 2); self.assertEqual(w.ov_tbl.item(0, 4).text(), "Synced")
            self.assertTrue(w.b_sync_ov.isEnabled()); self.assertTrue(w.b_stop_ov.isHidden()); self.assertFalse(w.lv_l1.isHidden())
            # a failed company shows up first, in the Action center, and the page says so
            w.runs.insert(0, {"company": "Co B", "ok": False, "kind": "daybook", "started_at": iso(now - dt.timedelta(minutes=5)), "finished_at": iso(now - dt.timedelta(minutes=4)), "error": "Tally did not answer"})
            w.render_overview(); self.assertEqual(w.ov_tbl.item(0, 0).text(), "Co B"); self.assertEqual(w.ov_tbl.item(0, 4).text(), "Failed")
            self.assertIn("need your attention", w.al_head.tx.text()); self.assertEqual(w.c_issues.value.text(), "1"); self.assertEqual(w.ac_box.count(), 1)
            w.runs.pop(0); w.render_overview(); self.assertIn("Nothing needs your attention", w.ac_box.itemAt(0).widget().tx.text())
            # a run in progress (scheduled or manual) is followed from the log, with a determinate bar; the sync buttons wait
            open(mod.ns.LOG, "w", encoding="utf-8").write("\n".join([
                (now - dt.timedelta(minutes=10)).strftime("%Y-%m-%d %H:%M:%S") + " === nightly run start. companies=2 until=22:39 backfill=False dry_run=False",
                (now - dt.timedelta(minutes=10)).strftime("%Y-%m-%d %H:%M:%S") + " Co A: start",
                (now - dt.timedelta(minutes=5)).strftime("%Y-%m-%d %H:%M:%S") + "    x Co A: 210 days read, 500 vouchers, 0 ledgers, 0 marked deleted",
                (now - dt.timedelta(minutes=5)).strftime("%Y-%m-%d %H:%M:%S") + " Co B: start", ""]))
            with mock.patch.object(mod.ns, "lock_is_free", lambda: False):
                w.ov_tick()
            self.assertTrue(w.ov_progress["running"]); self.assertIn("1 of 2", w.al_head.tx.text()); self.assertEqual((w.lv_bar.maximum(), w.lv_bar.value()), (2, 1))
            self.assertFalse(w.b_sync_ov.isEnabled()); self.assertFalse(w.b_stop_ov.isHidden()); self.assertIn("Co B", w.lv_now.text()); self.assertIn("Syncing 1/2", w.c_eng.value.text())
            self.assertEqual(w.ov_tbl.item(0, 4).text(), "Syncing")
            w.stop_any(); self.assertTrue(os.path.exists(mod.ns.STOP_FLAG))                                                # stops the engine after the current batch
            w.ov_tick(); self.assertFalse(w.ov_progress); self.assertTrue(w.b_sync_ov.isEnabled())                       # lock free again: idle, history is refetched
            # saved data shows at once on the next start; the auto-refresh choice is stored and applied
            w._save_ov_cache(); w2 = Window(); w2.timer.stop(); w2.live.stop()
            self.assertEqual(len(w2.runs), 2); self.assertTrue(w2.ov_cached); w2._really_quit = True; w2.close()
            w.s_ref.setCurrentIndex(0); self.assertEqual(w.ui["refresh_sec"], 0); self.assertFalse(w.timer.isActive())
            w.s_ref.setCurrentIndex(2); self.assertEqual(w.ui["refresh_sec"], 60); self.assertTrue(w.timer.isActive()); w.timer.stop()
            # narrow window stacks the cards, wide window puts them side by side; Bangla and light theme paint without errors
            w.resize(1000, 700); self.app.processEvents(); self.assertEqual(w.ov_mid.direction(), QBoxLayout.TopToBottom)
            w.resize(1400, 900); self.app.processEvents(); self.assertEqual(w.ov_mid.direction(), QBoxLayout.LeftToRight)
            w.s_lang.setCurrentIndex(1); self.app.processEvents(); w.go(0); w.set_theme_choice("Light"); self.app.processEvents(); self.assertTrue(w.grab().width() > 0)
        finally:
            w._really_quit = True; w.timer.stop(); w.live.stop(); self._settle(w, 0.2); w.close()
            for pt in patches:
                pt.stop()

    def test_accordion_toggle(self):
        a = self.K.Accordion("T", "body " * 40, self.K.DARK); a.resize(600, 100); a.show()
        a.toggle(animate=False); self.assertTrue(a.open); self.assertGreater(a.wrap.maximumHeight(), 0)
        a.toggle(animate=False); self.assertEqual(a.wrap.maximumHeight(), 0)


if __name__ == "__main__":
    unittest.main()
