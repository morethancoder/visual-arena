#!/usr/bin/env python3
"""Read Claude Code's own session transcripts for an /arena run: token usage, cost, model, and
a live log of what the orchestrating Claude is doing.

Claude Code writes every session to ~/.claude/projects/<project path with non-alphanumerics as
'-'>/<session>.jsonl, and each sub-agent to <session>/subagents/agent-*.jsonl. Every assistant
message carries its model and usage. A run is matched by its folder name (run-...), which the
orchestrator's tool calls and every sub-agent's brief path contain.

    python3 tools/transcripts.py /path/to/project run-20261003-120000-s7
"""
import glob
import json
import os
import re
import sys

PROJECTS = os.path.join(os.path.expanduser("~"), ".claude", "projects")

# Anthropic API list prices, US$ per million tokens. Cache writes are 1.25x input (5-minute TTL)
# or 2x input (1-hour TTL); cache reads are listed per model.
PRICES = {
    "claude-fable-5-1": {"name": "Claude Fable 5.1", "in": 10.0, "out": 50.0, "read": 0.25},
    "claude-fable-5": {"name": "Claude Fable 5", "in": 10.0, "out": 50.0, "read": 1.0},
    "claude-opus-5-5": {"name": "Claude Opus 5.5", "in": 4.0, "out": 20.0, "read": 0.20},
    "claude-opus-5": {"name": "Claude Opus 5", "in": 5.0, "out": 25.0, "read": 0.50},
    "claude-opus-4": {"name": "Claude Opus 4.x", "in": 5.0, "out": 25.0, "read": 0.50},
    "claude-sonnet-5-5": {"name": "Claude Sonnet 5.5", "in": 2.0, "out": 10.0, "read": 0.20},
    "claude-sonnet-5": {"name": "Claude Sonnet 5", "in": 2.0, "out": 10.0, "read": 0.20},
    "claude-sonnet-4": {"name": "Claude Sonnet 4.x", "in": 3.0, "out": 15.0, "read": 0.30},
    "claude-haiku-4-5": {"name": "Claude Haiku 4.5", "in": 1.0, "out": 5.0, "read": 0.10},
}
# What the lobby offers, newest first in each family.
CHOICES = [
    {"build": "fable", "id": "claude-fable-5-1"},
    {"build": "opus", "id": "claude-opus-5-5"},
    {"build": "sonnet", "id": "claude-sonnet-5-5"},
    {"build": "haiku", "id": "claude-haiku-4-5"},
]


def price_for(model):
    model = (model or "").lower()
    for key in sorted(PRICES, key=len, reverse=True):
        if model.startswith(key):
            return key, PRICES[key]
    return None, None


def build_for(model):
    m = (model or "").lower()
    for b in ("fable", "mythos", "opus", "sonnet", "haiku"):
        if b in m:
            return "fable" if b == "mythos" else b
    return None


def project_dir(root):
    return os.path.join(PROJECTS, re.sub(r"[^A-Za-z0-9]", "-", os.path.abspath(root)))


def _lines(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                try:
                    yield json.loads(line)
                except ValueError:
                    continue
    except OSError:
        return


def find_sessions(root, run_id, since=0):
    """Session transcripts (main files) that mention this run."""
    dirs = [project_dir(root)]
    if not os.path.isdir(dirs[0]):
        dirs = [d for d in glob.glob(os.path.join(PROJECTS, "*")) if os.path.isdir(d)]
    out = []
    for d in dirs:
        for f in glob.glob(os.path.join(d, "*.jsonl")):
            try:
                if os.path.getmtime(f) < since:
                    continue
                with open(f, encoding="utf-8", errors="replace") as fh:
                    if run_id in fh.read():
                        out.append(f)
            except OSError:
                continue
    return out


def usage(root, run_id, since=0):
    """Tokens and cost for one run: the orchestrator from its first mention of the run, plus every
    sub-agent whose transcript mentions the run."""
    per_model, seen, agents = {}, set(), 0

    def add(msg):
        u = msg.get("usage") or {}
        mid = msg.get("id")
        if not u or (mid and mid in seen):
            return
        if mid:
            seen.add(mid)
        m = per_model.setdefault(msg.get("model") or "unknown",
                                 {"input": 0, "output": 0, "cache_read": 0, "cache_write_5m": 0, "cache_write_1h": 0, "messages": 0})
        m["input"] += u.get("input_tokens") or 0
        m["output"] += u.get("output_tokens") or 0
        m["cache_read"] += u.get("cache_read_input_tokens") or 0
        cc = u.get("cache_creation") or {}
        w5, w1 = cc.get("ephemeral_5m_input_tokens"), cc.get("ephemeral_1h_input_tokens")
        if w5 is None and w1 is None:
            w5, w1 = u.get("cache_creation_input_tokens") or 0, 0
        m["cache_write_5m"] += w5 or 0
        m["cache_write_1h"] += w1 or 0
        m["messages"] += 1

    sessions = find_sessions(root, run_id, since)
    for f in sessions:
        # the orchestrator's share: from the run's first mention to its last (plus that last turn)
        rows = list(_lines(f))
        hits = [i for i, d in enumerate(rows) if run_id in json.dumps(d)]
        if hits:
            last = hits[-1]
            while last + 1 < len(rows) and rows[last + 1].get("type") != "user":
                last += 1
            for d in rows[hits[0]:last + 1]:
                if d.get("type") == "assistant" and isinstance(d.get("message"), dict):
                    add(d["message"])
        for sub in glob.glob(os.path.join(f[:-6], "subagents", "*.jsonl")):
            try:
                with open(sub, encoding="utf-8", errors="replace") as fh:
                    if run_id not in fh.read():
                        continue
            except OSError:
                continue
            agents += 1
            for d in _lines(sub):
                if d.get("type") == "assistant" and isinstance(d.get("message"), dict):
                    add(d["message"])

    total, models = 0.0, []
    for model, m in sorted(per_model.items(), key=lambda kv: -kv[1]["output"]):
        key, p = price_for(model)
        cost = None
        if p:
            cost = (m["input"] * p["in"] + m["output"] * p["out"] + m["cache_read"] * p["read"]
                    + m["cache_write_5m"] * p["in"] * 1.25 + m["cache_write_1h"] * p["in"] * 2) / 1e6
            total += cost
        models.append(dict(m, model=model, name=p["name"] if p else model, cost=cost,
                           price=p and {"in": p["in"], "out": p["out"], "read": p["read"]}))
    sub_models = {}
    for model, m in per_model.items():
        sub_models[model] = sub_models.get(model, 0) + m["messages"]
    main_model = max(sub_models, key=sub_models.get) if sub_models else None
    return {"found": bool(sessions), "sessions": len(sessions), "agents": agents, "models": models,
            "cost": round(total, 4), "model": main_model, "build": build_for(main_model),
            "tokens": {k: sum(m[k] for m in per_model.values()) for k in ("input", "output", "cache_read", "cache_write_5m", "cache_write_1h")}}


def _short(text, n=220):
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    return text if len(text) <= n else text[:n - 1] + "…"


def claude_log(root, run_id, since=0, limit=400):
    """What the orchestrating Claude said and did: its words, each tool call, and the first line of
    each result. Starts a little before the run's first mention so the setup is visible."""
    sessions = find_sessions(root, run_id, since)
    if not sessions:
        return {"found": False, "entries": []}
    f = max(sessions, key=os.path.getmtime)
    entries, tools = [], {}
    for d in _lines(f):
        t, ts, msg = d.get("type"), d.get("timestamp"), d.get("message")
        if not isinstance(msg, dict):
            continue
        content = msg.get("content")
        if isinstance(content, str):
            content = [{"type": "text", "text": content}]
        for c in content or []:
            ct = c.get("type")
            if t == "assistant" and ct == "text" and c.get("text", "").strip():
                entries.append({"t": ts, "kind": "say", "text": _short(c["text"], 600)})
            elif t == "assistant" and ct == "tool_use":
                inp = c.get("input") or {}
                name = c.get("name")
                if name == "Bash":
                    text = inp.get("description") or ""
                    text = (text + ": " if text else "") + _short(inp.get("command"), 260)
                elif name in ("Agent", "Task"):
                    text = inp.get("description") or _short(inp.get("prompt"), 120)
                elif name in ("Write", "Edit", "Read"):
                    text = inp.get("file_path", "")
                else:
                    text = _short(json.dumps(inp), 200)
                tools[c.get("id")] = name
                entries.append({"t": ts, "kind": "tool", "tool": name, "text": text})
            elif t == "user" and ct == "tool_result":
                body = c.get("content")
                if isinstance(body, list):
                    body = " ".join(x.get("text", "") for x in body if isinstance(x, dict))
                first = next((ln for ln in str(body or "").splitlines() if ln.strip()), "")
                entries.append({"t": ts, "kind": "result", "tool": tools.get(c.get("tool_use_id")),
                                "text": _short(first, 260), "error": bool(c.get("is_error"))})
            elif t == "user" and ct == "text" and not d.get("isMeta") and c.get("text", "").strip() and not c["text"].startswith("<"):
                entries.append({"t": ts, "kind": "user", "text": _short(c["text"], 300)})
    first = next((i for i, e in enumerate(entries) if run_id in e["text"]), None)
    if first is not None:
        entries = entries[max(0, first - 12):]
    return {"found": True, "session": os.path.basename(f)[:-6], "entries": entries[-limit:]}


if __name__ == "__main__":
    print(json.dumps({"usage": usage(sys.argv[1], sys.argv[2]), "log": claude_log(sys.argv[1], sys.argv[2])["entries"][-8:]}, indent=1))
