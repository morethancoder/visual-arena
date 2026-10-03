#!/usr/bin/env python3
"""Inline the local <script src> files of design/preview.html into one standalone page.

    python3 tools/bundle_preview.py   # writes design/arena-preview.html
"""
import os
import re

HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "design")


def inline(m):
    with open(os.path.join(HERE, m.group(1)), encoding="utf-8") as fh:
        return "<script>\n" + fh.read().replace("</script", "<\\/script") + "\n</script>"


with open(os.path.join(HERE, "preview.html"), encoding="utf-8") as fh:
    page = fh.read()
page = re.sub(r'<script src="([^":]+\.js)"></script>', inline, page)
with open(os.path.join(HERE, "arena-preview.html"), "w", encoding="utf-8") as fh:
    fh.write(page)
print("wrote design/arena-preview.html")
