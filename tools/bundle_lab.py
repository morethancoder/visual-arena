#!/usr/bin/env python3
"""Build design/asset-lab.html from design/asset-lab.src.html with three real runs inlined.

    python3 tools/bundle_lab.py

Generates the runs with make_fixture.py if they are missing (16, 32 and 100 agents; the
100-agent run includes the final check against a rejected answer), exports each with
export_run.py, and replaces the /*RUNS*/ marker in the page.
"""
import glob
import json
import os
import subprocess
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, os.path.join(ROOT, "tools"))
import export_run  # noqa: E402

RUNS = {"16": ("quick", ["--agents", "16", "--seed", "7"]),
        "32": ("mid", ["--agents", "32", "--seed", "11"]),
        "100": ("full", ["--agents", "100", "--seed", "3", "--baseline"])}

runs = {}
for key, (name, args) in RUNS.items():
    out = os.path.join(ROOT, "fixtures", name)
    found = glob.glob(os.path.join(out, ".arena", "run-*"))
    if not found:
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", "make_fixture.py"), *args, "--out", out], check=True)
        found = glob.glob(os.path.join(out, ".arena", "run-*"))
    runs[key] = export_run.export(sorted(found)[-1])

src = open(os.path.join(ROOT, "design", "asset-lab.src.html"), encoding="utf-8").read()
page = src.replace("/*RUNS*/", "window.RUNS = " + json.dumps(runs, separators=(",", ":")).replace("</", "<\\/") + ";")
with open(os.path.join(ROOT, "design", "asset-lab.html"), "w", encoding="utf-8") as fh:
    fh.write(page)
print("wrote design/asset-lab.html (%d KB)" % (len(page) // 1024))
