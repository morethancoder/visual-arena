#!/usr/bin/env python3
"""Pack the app into one standalone HTML file with the demo run inlined.

    python3 tools/bundle_app.py              # writes dist/the-arena.html
    python3 tools/bundle_app.py --fragment   # page body only, for hosts that add their own <html> wrapper

The standalone page has no server, so it offers the demo run, the simulated live demo,
and opening run files exported with `python3 viewer.py --export`.
"""
import argparse
import json
import os
import re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
APP = os.path.join(ROOT, "app")


def read(name):
    with open(os.path.join(APP, name), encoding="utf-8") as fh:
        return fh.read()


ap = argparse.ArgumentParser()
ap.add_argument("--fragment", action="store_true", help="page body only, for hosts that add their own <html> wrapper")
ap.add_argument("--run", help="a run export (viewer.py --export) to use instead of the demo run")
ap.add_argument("--title", help="what to call that run on screen")
ap.add_argument("--open", action="store_true", help="open the run straight away instead of the lobby")
ap.add_argument("--out", default=os.path.join(ROOT, "dist", "the-arena.html"))
args = ap.parse_args()

page = read("index.html")
page = re.sub(r'<link rel="stylesheet" href="([\w.-]+\.css)">', lambda m: "<style>\n" + read(m.group(1)) + "\n</style>", page)
demo = (open(args.run, encoding="utf-8").read() if args.run else read("demo-run.json")).replace("</", "<\\/")
extra = "window.DEMO_RUN = %s;" % demo
if args.title:
    extra += " window.DEMO_TITLE = %s;" % json.dumps(args.title)
if args.open:
    extra += " window.AUTO_OPEN = true;"
page = page.replace('<script src="main.js"></script>', "<script>" + extra + "</script>\n<script src=\"main.js\"></script>")
page = re.sub(r'<script src="([\w.-]+\.js)"></script>', lambda m: "<script>\n" + read(m.group(1)).replace("</script", "<\\/script") + "\n</script>", page)
if args.fragment:
    page = re.sub(r"<!doctype html>\s*|<html[^>]*>\s*|</html>\s*|<head>\s*|</head>\s*|<body>\s*|</body>\s*|<meta charset[^>]*>\s*|<meta name=\"viewport\"[^>]*>\s*", "", page, flags=re.I)
out = args.out
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as fh:
    fh.write(page)
print("wrote %s (%d KB)" % (os.path.relpath(out, ROOT), len(page) // 1024))
