"""Tests for the in-app updater (updater.py). Standard library only: a local web server plays the update server."""
import hashlib, importlib.util, json, os, shutil, subprocess, sys, tempfile, threading, unittest
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import nightly_sync as ns  # noqa: E402
import updater as U  # noqa: E402

APP_TMPL = 'import os\nAPP_VERSION = "{v}"\nprint("app", {v!r})\n'


def sha(b):
    return hashlib.sha256(b).hexdigest()


class Quiet(SimpleHTTPRequestHandler):
    hits = []

    def log_message(self, *a):
        pass

    def do_GET(self):
        Quiet.hits.append(self.path)
        super().do_GET()


class Server:
    """Serves a folder on 127.0.0.1; .base is its URL (with trailing slash)."""
    def __init__(self, root):
        Quiet.hits = []
        self.srv = HTTPServer(("127.0.0.1", 0), partial(Quiet, directory=root))
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.base = f"http://127.0.0.1:{self.srv.server_address[1]}/"

    def close(self):
        self.srv.shutdown(); self.srv.server_close()


def make_remote(root, version="1.1.0", extra=None, tamper=None, syntax_error=False, app_version=None):
    """Write the 'remote' repo folder and return its manifest dict."""
    os.makedirs(root, exist_ok=True)
    files = {"nabiad_bridge_app.pyw": APP_TMPL.format(v=app_version or version).encode(), "ui_kit.py": b"X = 1\n", "bridge.py": b"B = 'same'\n"}
    files.update(extra or {})
    if syntax_error:
        files["ui_kit.py"] = b"def broken(:\n"
    manifest = {"version": version, "notes_en": "n en", "notes_bn": "n bn", "files": {n: sha(b) for n, b in files.items()}}
    for n, b in files.items():
        open(os.path.join(root, n), "wb").write(b"TAMPERED\n" if tamper == n else b)
    json.dump(manifest, open(os.path.join(root, U.MANIFEST_NAME), "w"))
    return manifest


def make_local(here, version="1.0.0"):
    open(os.path.join(here, "nabiad_bridge_app.pyw"), "w").write(APP_TMPL.format(v=version))
    open(os.path.join(here, "ui_kit.py"), "w").write("X = 0\n")
    open(os.path.join(here, "bridge.py"), "wb").write(b"B = 'same'\n")  # identical to the remote one: must not be downloaded
    open(os.path.join(here, "config.json"), "w").write('{"keep": true}')


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(); self.here = os.path.join(self.tmp, "app"); self.remote = os.path.join(self.tmp, "remote")
        os.makedirs(self.here); make_local(self.here)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def serve(self, **kw):
        m = make_remote(self.remote, **kw); self.s = Server(self.remote); self.addCleanup(self.s.close); return m


class Versions(unittest.TestCase):
    def test_compare(self):
        self.assertTrue(U.is_newer("1.1.0", "1.0.0")); self.assertTrue(U.is_newer("1.10", "1.9.9")); self.assertTrue(U.is_newer("2.0", "1.9.9.9"))
        self.assertFalse(U.is_newer("1.0.0", "1.0")); self.assertFalse(U.is_newer("1.0.0", "1.0.1"))
        for bad in ("", "v1.0", "1", "1.x", None, "1.0; rm"):
            with self.assertRaises(U.UpdateError):
                U.parse_version(bad)


class Manifest(Base):
    def test_valid_and_check(self):
        self.serve()
        r = U.check("1.0.0", base=self.s.base)
        self.assertEqual((r["status"], r["version"], r["mode"]), ("available", "1.1.0", "source"))
        self.assertEqual(U.check("1.1.0", base=self.s.base)["status"], "uptodate")
        self.assertEqual(U.check("1.2.0", base=self.s.base)["status"], "uptodate")  # never "downgrade"

    def test_rejects_bad_manifests(self):
        good = {"version": "1.1.0", "files": {"nabiad_bridge_app.pyw": "a" * 64}}
        U.validate_manifest(dict(good))
        for mut in ({"version": "x"}, {"files": {}}, {"files": {"ui_kit.py": "a" * 64}},  # no app file
                    {"files": {"nabiad_bridge_app.pyw": "a" * 64, "../evil.py": "a" * 64}}, {"files": {"nabiad_bridge_app.pyw": "a" * 64, "sub/x.py": "a" * 64}},
                    {"files": {"nabiad_bridge_app.pyw": "a" * 64, "run.bat": "a" * 64}}, {"files": {"nabiad_bridge_app.pyw": "xyz"}}):
            bad = dict(good); bad.update(mut)
            with self.assertRaises(U.UpdateError, msg=str(mut)):
                U.validate_manifest(bad)

    def test_server_errors_are_plain_messages(self):
        self.serve(); os.remove(os.path.join(self.remote, U.MANIFEST_NAME))
        with self.assertRaises(U.UpdateError) as c:
            U.check("1.0.0", base=self.s.base)
        self.assertIn("404", str(c.exception))
        with self.assertRaises(U.UpdateError) as c:
            U.check("1.0.0", base="http://127.0.0.1:9/")
        self.assertIn("No connection", str(c.exception))


class ApplySource(Base):
    def test_happy_path_downloads_only_changed_files_and_backs_up(self):
        m = self.serve()
        prog = []
        res = U.apply_source_update(m, self.here, base=self.s.base, progress=lambda *a: prog.append(a))
        self.assertEqual(sorted(res["updated"]), ["nabiad_bridge_app.pyw", "ui_kit.py"])  # bridge.py already identical
        self.assertNotIn("/bridge.py", Quiet.hits)
        self.assertEqual(U.installed_version(self.here), "1.1.0"); self.assertEqual(open(os.path.join(self.here, "ui_kit.py")).read(), "X = 1\n")
        self.assertEqual(open(os.path.join(res["backup"], "ui_kit.py")).read(), "X = 0\n")  # old file kept
        self.assertEqual(open(os.path.join(self.here, "config.json")).read(), '{"keep": true}')  # settings untouched
        self.assertFalse(os.path.exists(os.path.join(self.here, U.TMP_DIR)))
        self.assertEqual(len(prog), 2)
        with self.assertRaises(U.UpdateError):  # second run: nothing to do
            U.apply_source_update(m, self.here, base=self.s.base)

    def _untouched(self):
        self.assertEqual(U.installed_version(self.here), "1.0.0"); self.assertEqual(open(os.path.join(self.here, "ui_kit.py")).read(), "X = 0\n")
        self.assertFalse(os.path.exists(os.path.join(self.here, U.TMP_DIR))); self.assertFalse(U.has_backup(self.here))

    def test_checksum_mismatch_installs_nothing(self):
        m = self.serve(tamper="ui_kit.py")
        with self.assertRaises(U.UpdateError) as c:
            U.apply_source_update(m, self.here, base=self.s.base)
        self.assertIn("checksum", str(c.exception)); self._untouched()

    def test_python_error_in_new_file_installs_nothing(self):
        m = self.serve(syntax_error=True)
        with self.assertRaises(U.UpdateError) as c:
            U.apply_source_update(m, self.here, base=self.s.base)
        self.assertIn("Python error", str(c.exception)); self._untouched()

    def test_version_must_match_the_app_file(self):
        m = self.serve(version="1.1.0", app_version="1.0.5")
        with self.assertRaises(U.UpdateError) as c:
            U.apply_source_update(m, self.here, base=self.s.base)
        self.assertIn("version", str(c.exception)); self._untouched()

    def test_failure_while_replacing_restores_everything(self):
        m = self.serve(extra={"extra_mod.py": b"Y = 1\n"})
        real = os.replace; calls = []
        def flaky(a, b):
            if os.path.basename(a) in ("_files.json",):
                return real(a, b)
            calls.append(os.path.basename(a))
            if len(calls) == 2:
                raise PermissionError("locked")
            return real(a, b)
        with mock.patch("updater.os.replace", flaky):
            with self.assertRaises(U.UpdateError) as c:
                U.apply_source_update(m, self.here, base=self.s.base)
        self.assertIn("put back", str(c.exception))
        self.assertEqual(U.installed_version(self.here), "1.0.0"); self.assertEqual(open(os.path.join(self.here, "ui_kit.py")).read(), "X = 0\n")
        self.assertFalse(os.path.exists(os.path.join(self.here, "extra_mod.py")))

    def test_rollback_restores_and_removes_new_files_then_steps_further_back(self):
        m = self.serve(extra={"extra_mod.py": b"Y = 1\n"})
        U.apply_source_update(m, self.here, base=self.s.base)
        self.assertTrue(os.path.exists(os.path.join(self.here, "extra_mod.py"))); self.assertEqual(U.last_backup_version(self.here), "1.0.0")
        r = U.rollback(self.here)
        self.assertEqual(r["version"], "1.0.0"); self.assertEqual(U.installed_version(self.here), "1.0.0")
        self.assertEqual(open(os.path.join(self.here, "ui_kit.py")).read(), "X = 0\n"); self.assertFalse(os.path.exists(os.path.join(self.here, "extra_mod.py")))
        self.assertFalse(U.has_backup(self.here))
        with self.assertRaises(U.UpdateError):
            U.rollback(self.here)

    def test_only_three_backups_are_kept(self):
        for i in range(2, 7):
            shutil.rmtree(self.remote, ignore_errors=True)
            m = make_remote(self.remote, version=f"1.{i}.0", extra={"ui_kit.py": f"X = {i}\n".encode()})
            m["files"]["ui_kit.py"] = sha(f"X = {i}\n".encode())
            s = Server(self.remote)
            try:
                U.apply_source_update(m, self.here, base=s.base)
            finally:
                s.close()
        self.assertEqual(len(U._backups(self.here)), U.KEEP_BACKUPS)
        self.assertEqual(U.last_backup_version(self.here), "1.5.0")


class PackagedMode(Base):
    def _releases(self, installer=b"MZ-installer", digest=True, extra_rel=None):
        os.makedirs(os.path.join(self.remote, "dl"), exist_ok=True)
        open(os.path.join(self.remote, "dl", "NabiadDataBridge-Setup-1.2.0.exe"), "wb").write(installer)
        self.srv_holder = Server(self.remote); self.addCleanup(self.srv_holder.close); base = self.srv_holder.base
        asset = {"name": "NabiadDataBridge-Setup-1.2.0.exe", "browser_download_url": base + "dl/NabiadDataBridge-Setup-1.2.0.exe", "size": len(installer)}
        if digest:
            asset["digest"] = "sha256:" + sha(b"MZ-installer")
        else:
            open(os.path.join(self.remote, "dl", "SHA256SUMS.txt"), "w").write(f"{sha(b'MZ-installer').upper()}  NabiadDataBridge-Setup-1.2.0.exe\n")
        rels = [{"tag_name": "v9.9.9", "assets": []}, {"tag_name": "bridge-v1.3.0", "prerelease": True, "assets": [asset]}, {"tag_name": "bridge-v1.2.0", "body": "notes", "assets": [asset] + ([] if digest else [{"name": "SHA256SUMS.txt", "browser_download_url": base + "dl/SHA256SUMS.txt"}])},
                {"tag_name": "bridge-v1.1.0", "draft": True, "assets": [asset]}] + (extra_rel or [])
        json.dump(rels, open(os.path.join(self.remote, "releases.json"), "w"))
        return base

    def test_picks_newest_real_release_and_checks_digest(self):
        base = self._releases()
        r = U.check("1.1.0", frozen=True, releases_url=base + "releases.json", installer_prefix=base)
        self.assertEqual((r["status"], r["version"], r["mode"]), ("available", "1.2.0", "installer")); self.assertEqual(r["sha256"], sha(b"MZ-installer"))
        self.assertEqual(U.check("1.2.0", frozen=True, releases_url=base + "releases.json", installer_prefix=base)["status"], "uptodate")
        path = U.download_installer(r, os.path.join(self.tmp, "dl"))
        self.assertEqual(open(path, "rb").read(), b"MZ-installer")

    def test_checksum_from_sums_file(self):
        base = self._releases(digest=False)
        r = U.check("1.1.0", frozen=True, releases_url=base + "releases.json", installer_prefix=base)
        self.assertEqual(r["sha256"], sha(b"MZ-installer"))

    def test_tampered_installer_is_deleted_and_not_run(self):
        base = self._releases()
        r = U.check("1.1.0", frozen=True, releases_url=base + "releases.json", installer_prefix=base)
        open(os.path.join(self.remote, "dl", "NabiadDataBridge-Setup-1.2.0.exe"), "wb").write(b"EVIL")
        with self.assertRaises(U.UpdateError):
            U.download_installer(r, os.path.join(self.tmp, "dl"))
        self.assertFalse(os.path.exists(os.path.join(self.tmp, "dl", "NabiadDataBridge-Setup-1.2.0.exe")))

    def test_release_without_checksum_is_refused_and_foreign_host_ignored(self):
        base = self._releases(digest=False); os.remove(os.path.join(self.remote, "dl", "SHA256SUMS.txt"))
        rels = json.load(open(os.path.join(self.remote, "releases.json")))
        rels[2]["assets"] = [a for a in rels[2]["assets"] if a["name"] != "SHA256SUMS.txt"]; json.dump(rels, open(os.path.join(self.remote, "releases.json"), "w"))
        with self.assertRaises(U.UpdateError) as c:
            U.check("1.1.0", frozen=True, releases_url=base + "releases.json", installer_prefix=base)
        self.assertIn("checksum", str(c.exception))
        r = U.check("1.1.0", frozen=True, releases_url=base + "releases.json", installer_prefix="https://github.com/ruhulaminrevens/nabiad/releases/download/")
        self.assertEqual(r["status"], "uptodate")  # the asset URL is on another host: ignored

    def test_restart_command(self):
        self.assertEqual(U.restart_command(self.here, frozen=True, extra=("--after-update",))[1:], ["--after-update"])
        c = U.restart_command(self.here)
        self.assertTrue(c[1].endswith("nabiad_bridge_app.pyw")); self.assertEqual(c[-1], "--after-update")


class ScheduleRevision(Base):
    def test_old_or_missing_state_needs_refresh(self):
        with mock.patch.object(ns, "SCHEDULE_STATE", os.path.join(self.tmp, "schedule_state.json")):
            self.assertTrue(ns.schedule_needs_refresh())  # a task made by an older version has no state file
            ns._write_schedule_state("00:30", "06:00")
            self.assertEqual(ns.schedule_revision_installed(), ns.SCHEDULE_REVISION); self.assertFalse(ns.schedule_needs_refresh())
            open(ns.SCHEDULE_STATE, "w").write("{broken")
            self.assertTrue(ns.schedule_needs_refresh())


class Repository(unittest.TestCase):
    def test_committed_manifest_matches_the_files(self):
        r = subprocess.run([sys.executable, os.path.join(HERE, "packaging", "make_manifest.py"), "--check"], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        m = json.load(open(os.path.join(HERE, U.MANIFEST_NAME), encoding="utf-8")); U.validate_manifest(m)
        for name, digest in m["files"].items():
            self.assertEqual(sha(open(os.path.join(HERE, name), "rb").read()), digest, name)


if __name__ == "__main__":
    unittest.main()
