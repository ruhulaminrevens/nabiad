"""In-app updater for NABIAD DATA BRIDGE (standard library only, no Qt, so it can be tested anywhere).

Two modes, chosen by how the app was started:
  * source mode  (python + nabiad_bridge_app.pyw): reads update_manifest.json from this repository (main branch), downloads only the
    files whose SHA-256 differs, checks each download (SHA-256 + Python syntax + version agreement), keeps a backup of the old files,
    then replaces them. Anything that fails before the replace leaves the installation untouched; a failure during the replace
    puts the old files back.
  * packaged mode (NabiadDataBridge.exe): finds the newest "bridge-v*" GitHub release, downloads the installer, checks its SHA-256
    and runs it silently (the installer closes the app, keeps config.json / login / logs, and starts the app again).

Nothing here touches Tally or the database. Settings, the saved login and logs are never part of an update."""
import hashlib, json, os, re, shutil, subprocess, sys, time, urllib.error, urllib.request

REPO = "ruhulaminrevens/nabiad"
BRANCH = "main"
SUBDIR = "tools/tally-bridge"
RAW_BASE = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}/{SUBDIR}/"
RELEASES_URL = f"https://api.github.com/repos/{REPO}/releases?per_page=20"
INSTALLER_PREFIX = f"https://github.com/{REPO}/releases/download/"
MANIFEST_NAME = "update_manifest.json"
BACKUP_DIR = "update_backup"
TMP_DIR = "update_tmp"
KEEP_BACKUPS = 3
TIMEOUT = 20
MAX_MANIFEST = 256 * 1024
MAX_FILE = 5 * 1024 * 1024
MAX_INSTALLER = 400 * 1024 * 1024
NAME_RE = re.compile(r"^[A-Za-z0-9_]+\.(py|pyw)$")  # plain file names only: no folders, no other file types
VERSION_RE = re.compile(r"^\d+(\.\d+){1,3}$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
APP_FILE = "nabiad_bridge_app.pyw"
VERSION_LINE = re.compile(rb'^APP_VERSION = "([^"]+)"', re.M)


class UpdateError(Exception):
    """A readable reason an update did not happen (shown to the person as it is)."""


# ---------------------------------------------------------------- small helpers
def parse_version(s):
    if not isinstance(s, str) or not VERSION_RE.match(s.strip()):
        raise UpdateError(f"Not a version number: {s!r}")
    return tuple(int(x) for x in s.strip().split("."))


def is_newer(remote, local):
    a, b = parse_version(remote), parse_version(local)
    n = max(len(a), len(b))
    return a + (0,) * (n - len(a)) > b + (0,) * (n - len(b))


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def sha256_file(path):
    try:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


def _request(url, version="1"):
    return urllib.request.Request(url, headers={"User-Agent": f"NabiadDataBridge/{version}", "Accept": "*/*"})


def http_get(url, max_bytes=MAX_FILE, timeout=TIMEOUT):
    try:
        with urllib.request.urlopen(_request(url), timeout=timeout) as r:
            data = r.read(max_bytes + 1)
    except urllib.error.HTTPError as e:
        raise UpdateError(f"The update server answered {e.code} for {url.rsplit('/', 1)[-1]}")
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise UpdateError(f"No connection to the update server ({getattr(e, 'reason', e)})")
    if len(data) > max_bytes:
        raise UpdateError("The downloaded file is larger than expected")
    return data


def http_download(url, path, max_bytes=MAX_INSTALLER, progress=None, timeout=60):
    """Stream to a file (installer can be large). Returns the SHA-256 of what was written."""
    h = hashlib.sha256(); got = 0
    try:
        with urllib.request.urlopen(_request(url), timeout=timeout) as r, open(path, "wb") as out:
            total = int(r.headers.get("Content-Length") or 0)
            while True:
                chunk = r.read(1 << 18)
                if not chunk:
                    break
                got += len(chunk)
                if got > max_bytes:
                    raise UpdateError("The installer is larger than expected")
                h.update(chunk); out.write(chunk)
                if progress:
                    progress(got, total)
    except urllib.error.HTTPError as e:
        raise UpdateError(f"The update server answered {e.code}")
    except (urllib.error.URLError, OSError) as e:
        raise UpdateError(f"Download failed ({getattr(e, 'reason', e)})")
    return h.hexdigest()


def installed_version(here):
    """Version written in the app file on disk (what will run after a restart), or None."""
    try:
        m = VERSION_LINE.search(open(os.path.join(here, APP_FILE), "rb").read())
        return m.group(1).decode() if m else None
    except OSError:
        return None


# ---------------------------------------------------------------- manifest (source mode)
def validate_manifest(m):
    if not isinstance(m, dict):
        raise UpdateError("The update list is not valid")
    parse_version(m.get("version"))
    files = m.get("files")
    if not isinstance(files, dict) or APP_FILE not in files:
        raise UpdateError("The update list has no files")
    for name, sha in files.items():
        if not NAME_RE.match(name):
            raise UpdateError(f"The update list names a file that is not allowed: {name!r}")
        if not isinstance(sha, str) or not SHA_RE.match(sha):
            raise UpdateError(f"The update list has a bad checksum for {name}")
    for k in ("notes_en", "notes_bn"):
        m[k] = str(m.get(k) or "")[:800]
    return m


def fetch_manifest(base=None):
    raw = http_get((base or RAW_BASE) + MANIFEST_NAME, max_bytes=MAX_MANIFEST)
    try:
        return validate_manifest(json.loads(raw.decode("utf-8")))
    except (ValueError, UnicodeDecodeError):
        raise UpdateError("The update list could not be read")


# ---------------------------------------------------------------- check (both modes)
def _release_version(tag):
    m = re.match(r"^bridge-v(\d+(\.\d+){1,3})$", tag or "")
    return m.group(1) if m else None


def _pick_release(releases, installer_prefix):
    best = None
    for r in releases if isinstance(releases, list) else []:
        if r.get("draft") or r.get("prerelease"):
            continue
        ver = _release_version(r.get("tag_name"))
        if not ver:
            continue
        assets = {a.get("name"): a for a in r.get("assets", []) if isinstance(a, dict)}
        setup = next((a for n, a in assets.items() if n and re.match(r"^NabiadDataBridge-Setup-[\d.]+\.exe$", n)), None)
        if not setup or not str(setup.get("browser_download_url", "")).startswith(installer_prefix):
            continue
        if best is None or is_newer(ver, best[0]):
            best = (ver, r, setup, assets)
    return best


def _release_sha(setup, assets):
    d = str(setup.get("digest") or "")
    if d.startswith("sha256:") and SHA_RE.match(d[7:].lower()):
        return d[7:].lower()
    sums = assets.get("SHA256SUMS.txt")
    if sums and sums.get("browser_download_url"):
        text = http_get(sums["browser_download_url"], max_bytes=64 * 1024).decode("utf-8", "replace")
        for line in text.splitlines():
            parts = line.split()
            if len(parts) == 2 and parts[1].lstrip("*") == setup["name"] and SHA_RE.match(parts[0].lower()):
                return parts[0].lower()
    raise UpdateError("The release has no checksum for the installer, so it will not be run")


def check(local_version, frozen=False, base=None, releases_url=None, installer_prefix=None):
    """Returns {"status": "uptodate"|"available", "mode": "source"|"installer", "version", "notes_en", "notes_bn", ...}."""
    if not frozen:
        m = fetch_manifest(base)
        status = "available" if is_newer(m["version"], local_version) else "uptodate"
        return {"status": status, "mode": "source", "version": m["version"], "notes_en": m["notes_en"], "notes_bn": m["notes_bn"], "manifest": m}
    raw = http_get(releases_url or RELEASES_URL, max_bytes=2 * 1024 * 1024)
    try:
        rel = json.loads(raw.decode("utf-8"))
    except ValueError:
        raise UpdateError("The release list could not be read")
    best = _pick_release(rel, installer_prefix or INSTALLER_PREFIX)
    if best is None:
        return {"status": "uptodate", "mode": "installer", "version": local_version, "notes_en": "", "notes_bn": ""}
    ver, r, setup, assets = best
    out = {"status": "available" if is_newer(ver, local_version) else "uptodate", "mode": "installer", "version": ver,
           "notes_en": str(r.get("body") or "")[:800], "notes_bn": "", "name": setup["name"], "url": setup["browser_download_url"],
           "size": int(setup.get("size") or 0)}
    if out["status"] == "available":
        out["sha256"] = _release_sha(setup, assets)
    return out


# ---------------------------------------------------------------- apply (source mode)
def _restore(here, backup, names):
    for n in names:
        src = os.path.join(backup, n)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(here, n))


def apply_source_update(manifest, here, base=None, progress=None):
    """Download, verify, back up, replace. Returns {"updated": [...], "backup": path, "version": str}."""
    base = base or RAW_BASE
    manifest = validate_manifest(dict(manifest))
    todo = [n for n, sha in manifest["files"].items() if sha256_file(os.path.join(here, n)) != sha]
    if not todo:
        raise UpdateError("The files on this PC already match the new version")
    tmp = os.path.join(here, TMP_DIR)
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp)
    try:
        got = {}
        for i, n in enumerate(todo, 1):
            if progress:
                progress(i, len(todo), n)
            data = http_get(base + n)
            if sha256_bytes(data) != manifest["files"][n]:
                raise UpdateError(f"{n}: the downloaded file does not match its checksum (not installed)")
            if n.endswith((".py", ".pyw")):
                try:
                    compile(data, n, "exec")
                except SyntaxError as e:
                    raise UpdateError(f"{n}: the new file has a Python error at line {e.lineno} (not installed)")
            with open(os.path.join(tmp, n), "wb") as f:
                f.write(data)
            got[n] = data
        app = got.get(APP_FILE)
        if app is None:
            try:
                app = open(os.path.join(here, APP_FILE), "rb").read()
            except OSError:
                raise UpdateError("The app file is missing on this PC")
        m = VERSION_LINE.search(app)
        if not m or m.group(1).decode() != manifest["version"]:
            raise UpdateError("The app file does not carry the version the update list promises (not installed)")
        old = installed_version(here) or "unknown"
        backup = os.path.join(here, BACKUP_DIR, f"{old}_{time.strftime('%Y%m%d-%H%M%S')}")
        n_try = 1
        while os.path.exists(backup):  # two updates inside one second
            n_try += 1; backup = f"{backup.rsplit('_', 1)[0]}_{time.strftime('%Y%m%d-%H%M%S')}-{n_try}"
        os.makedirs(backup)
        had = [n for n in todo if os.path.exists(os.path.join(here, n))]
        for n in had:
            shutil.copy2(os.path.join(here, n), os.path.join(backup, n))
        with open(os.path.join(backup, "_files.json"), "w", encoding="utf-8") as f:
            json.dump({"from": old, "to": manifest["version"], "restore": had, "remove": [n for n in todo if n not in had]}, f)
        done = []
        try:
            for n in todo:
                os.replace(os.path.join(tmp, n), os.path.join(here, n))
                done.append(n)
        except Exception as e:
            _restore(here, backup, had)
            for n in done:
                if n not in had:
                    try:
                        os.remove(os.path.join(here, n))
                    except OSError:
                        pass
            raise UpdateError(f"Could not replace the files, the old version was put back ({e})")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    _prune(here)
    return {"updated": todo, "backup": backup, "version": manifest["version"]}


def _backups(here):
    d = os.path.join(here, BACKUP_DIR)
    try:
        names = [n for n in os.listdir(d) if os.path.isfile(os.path.join(d, n, "_files.json"))]
    except OSError:
        return []
    return sorted(names, key=lambda n: (n.rsplit("_", 1)[-1], n))  # oldest first, by the timestamp in the name


def _prune(here):
    names = _backups(here)
    for n in names[:-KEEP_BACKUPS]:
        shutil.rmtree(os.path.join(here, BACKUP_DIR, n), ignore_errors=True)


def has_backup(here):
    return bool(_backups(here))


def last_backup_version(here):
    names = _backups(here)
    if not names:
        return None
    try:
        return json.load(open(os.path.join(here, BACKUP_DIR, names[-1], "_files.json"), encoding="utf-8")).get("from")
    except (OSError, ValueError):
        return None


def rollback(here):
    """Put the files of the newest backup back. The used backup is retired so a second call goes one step further back."""
    names = _backups(here)
    if not names:
        raise UpdateError("There is no backup to restore")
    name = names[-1]
    d = os.path.join(here, BACKUP_DIR, name)
    info = json.load(open(os.path.join(d, "_files.json"), encoding="utf-8"))
    for n in info.get("restore", []):
        if not NAME_RE.match(n) or not os.path.exists(os.path.join(d, n)):
            raise UpdateError(f"The backup is incomplete ({n})")
    _restore(here, d, info.get("restore", []))
    for n in info.get("remove", []):
        if NAME_RE.match(n):
            try:
                os.remove(os.path.join(here, n))
            except OSError:
                pass
    os.replace(os.path.join(d, "_files.json"), os.path.join(d, "_used.json"))
    return {"version": info.get("from"), "files": info.get("restore", []) + info.get("remove", [])}


# ---------------------------------------------------------------- packaged mode
def download_installer(info, dest_dir, progress=None):
    os.makedirs(dest_dir, exist_ok=True)
    path = os.path.join(dest_dir, os.path.basename(info["name"]))
    sha = http_download(info["url"], path, progress=progress)
    if sha != info["sha256"]:
        try:
            os.remove(path)
        except OSError:
            pass
        raise UpdateError("The installer does not match its checksum (deleted, not run)")
    return path


def _detached_flags():
    return (0x00000008 | 0x00000200 | 0x08000000) if os.name == "nt" else 0  # DETACHED_PROCESS | NEW_PROCESS_GROUP | NO_WINDOW


def run_installer(path):
    subprocess.Popen([path, "/SILENT", "/SUPPRESSMSGBOXES", "/NOCANCEL", "/CLOSEAPPLICATIONS"], close_fds=True, creationflags=_detached_flags(),
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


# ---------------------------------------------------------------- restart
def gui_python():
    exe = sys.executable
    if os.name == "nt" and exe.lower().endswith("python.exe"):
        w = exe[:-len("python.exe")] + "pythonw.exe"
        if os.path.exists(w):
            return w
    return exe


def restart_command(here, frozen=False, extra=("--after-update",)):
    return ([sys.executable] if frozen else [gui_python(), os.path.join(here, APP_FILE)]) + list(extra)


def restart_app(here, frozen=False, extra=("--after-update",)):
    """Start the new window; it waits for this one to release the single-window lock."""
    subprocess.Popen(restart_command(here, frozen, extra), cwd=here, close_fds=True, creationflags=_detached_flags(),
                     stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
