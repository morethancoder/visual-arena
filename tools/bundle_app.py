#!/usr/bin/env python3
"""Pack the app into one standalone HTML file with the demo run inlined.

    python3 tools/bundle_app.py              # writes dist/the-arena.html
    python3 tools/bundle_app.py --fragment   # page body only, for hosts that add their own <html> wrapper

The standalone page has no server, so it offers the demo run, the simulated live demo,
and opening run files exported with `python3 viewer.py --export`.
"""
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
APP = os.path.join(ROOT, "app")


def read(name):
    with open(os.path.join(APP, name), encoding="utf-8") as fh:
        return fh.read()


page = read("index.html")
page = re.sub(r'<link rel="stylesheet" href="([\w.-]+\.css)">', lambda m: "<style>\n" + read(m.group(1)) + "\n</style>", page)
demo = read("demo-run.json").replace("</", "<\\/")
page = page.replace('<script src="main.js"></script>', "<script>window.DEMO_RUN = " + demo + ";</script>\n<script src=\"main.js\"></script>")
page = re.sub(r'<script src="([\w.-]+\.js)"></script>', lambda m: "<script>\n" + read(m.group(1)).replace("</script", "<\\/script") + "\n</script>", page)
if "--fragment" in sys.argv:
    page = re.sub(r"<!doctype html>\s*|<html[^>]*>\s*|</html>\s*|<head>\s*|</head>\s*|<body>\s*|</body>\s*|<meta charset[^>]*>\s*|<meta name=\"viewport\"[^>]*>\s*", "", page, flags=re.I)
out = os.path.join(ROOT, "dist", "the-arena.html")
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w", encoding="utf-8") as fh:
    fh.write(page)
print("wrote %s (%d KB)" % (os.path.relpath(out, ROOT), len(page) // 1024))
