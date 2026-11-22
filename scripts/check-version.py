#!/usr/bin/env python3
"""index.html ?v= query strings must all equal sw.js VERSION (otherwise phones keep old code)."""
import os, re, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html = open(os.path.join(root, "index.html"), encoding="utf-8").read()
sw = open(os.path.join(root, "sw.js"), encoding="utf-8").read()
m = re.search(r'const VERSION = "([^"]+)"', sw)
if not m: sys.exit("VERSION not found in sw.js")
versions = set(re.findall(r"\?v=([^\"']+)", html))
if versions != {m.group(1)}:
    print(f"FAIL: sw.js VERSION={m.group(1)} but index.html has {sorted(versions)}"); sys.exit(1)
print(f"ok: version {m.group(1)} consistent")
