"""Write (or --check) update_manifest.json: the list of files an in-app update may install, with their SHA-256.

Run after any change to the app files:   python packaging/make_manifest.py
CI runs:                                  python packaging/make_manifest.py --check   (fails when the committed manifest is stale)
The version comes from APP_VERSION in nabiad_bridge_app.pyw; the release date and notes come from packaging/update_notes.json."""
import hashlib, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FILES = ["nabiad_bridge_app.pyw", "ui_kit.py", "nightly_sync.py", "bridge.py", "updater.py"]


def build():
    app = open(os.path.join(ROOT, "nabiad_bridge_app.pyw"), encoding="utf-8").read()
    ver = re.search(r'^APP_VERSION = "([^"]+)"', app, re.M).group(1)
    notes = json.load(open(os.path.join(HERE, "update_notes.json"), encoding="utf-8"))
    files = {n: hashlib.sha256(open(os.path.join(ROOT, n), "rb").read()).hexdigest() for n in FILES}
    return {"version": ver, "released": notes["released"], "notes_en": notes["notes_en"], "notes_bn": notes["notes_bn"], "files": files}


def render(m):
    return json.dumps(m, indent=1, ensure_ascii=False, sort_keys=True) + "\n"


def main(argv):
    path = os.path.join(ROOT, "update_manifest.json")
    want = render(build())
    if "--check" in argv:
        have = open(path, encoding="utf-8", newline="").read() if os.path.exists(path) else ""
        if have != want:
            print("update_manifest.json is out of date. Run: python packaging/make_manifest.py", file=sys.stderr)
            return 1
        print("update_manifest.json is up to date")
        return 0
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(want)
    print("wrote", path)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
