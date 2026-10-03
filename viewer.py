#!/usr/bin/env python3
"""The Arena: a game viewer for the /arena Claude Code skill.

Run it in (or point it at) the project where you run /arena:

    python3 viewer.py                      # watch ./.arena on http://127.0.0.1:8765
    python3 viewer.py --root ~/my-project  # watch another project's .arena
    python3 viewer.py --model opus         # draw the fighters as Opus
    python3 viewer.py --allow-launch       # let the lobby start runs with Claude Code

Standard library only. It never writes into .arena: it reads the files the skill leaves there.
With --allow-launch, the lobby's Start button runs Claude Code headless in --root
(see LAUNCH below); without it, the lobby gives you the command to paste instead.
"""
import argparse
import hashlib
import http.server
import json
import mimetypes
import os
import secrets
import signal
import shutil
import socketserver
import subprocess
import sys
import threading
import time
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "tools"))
import export_run  # noqa: E402
import transcripts  # noqa: E402

APP = os.path.join(HERE, "app")
MODELS = ("haiku", "sonnet", "opus", "fable")

# What the Start button runs. {prompt} is the /arena command built in the lobby.
# acceptEdits lets the skill write into .arena/ without a prompt per file, and the allowed
# tools cover what the skill runs (python3 bracket.py) and what its sub-agents use.
# Sub-agents inherit both. Edit to taste.
LAUNCH = ["claude", "-p", "{prompt}", "--permission-mode", "acceptEdits",
          "--allowedTools", "Bash(python3 *),Read,Write,Edit,Glob,Grep,Agent,Skill"]


class State:
    def __init__(self, root, model, allow_launch, skill):
        self.root = os.path.abspath(root)
        self.arena = os.path.join(self.root, ".arena")
        self.model = model
        self.allow_launch = allow_launch
        self.skill = skill
        self.token = secrets.token_urlsafe(24)
        self.cache = {}
        self.lock = threading.Lock()
        self.proc = None
        self.launch = None  # {"started", "model", "run"} for the run started from the lobby
        self.log_path = os.path.join(self.root, ".arena-viewer-launch.log")
        self.meta_path = os.path.join(self.root, ".arena-viewer-runs.json")
        self.usage_cache = {}

    # what the viewer remembers about runs it started: model, stopped
    def meta(self):
        try:
            with open(self.meta_path, encoding="utf-8") as fh:
                return json.load(fh)
        except (OSError, ValueError):
            return {}

    def set_meta(self, run_id, **kv):
        m = self.meta()
        m.setdefault(run_id, {}).update(kv)
        with open(self.meta_path, "w", encoding="utf-8") as fh:
            json.dump(m, fh, indent=1)

    def claim_launched_run(self):
        """Tie the run the lobby started to its folder once that folder appears."""
        L = self.launch
        if not L or L.get("run"):
            return
        for d in self.run_dirs():
            if os.path.getmtime(os.path.join(d, "arena.json")) >= L["started"] - 2:
                L["run"] = os.path.basename(d)
                self.set_meta(L["run"], model=L["model"], launched=True)
                return

    def created(self, d):
        try:
            st = json.load(open(os.path.join(d, "arena.json"), encoding="utf-8"))
            return time.mktime(time.strptime(st.get("created", ""), "%Y-%m-%d %H:%M:%S"))
        except (OSError, ValueError, OverflowError):
            return os.path.getmtime(d)

    def usage(self, d):
        run_id = os.path.basename(d)
        hit = self.usage_cache.get(run_id)
        if hit and time.time() - hit[0] < 4:
            return hit[1]
        self.claim_launched_run()
        u = transcripts.usage(self.root, run_id, since=self.created(d) - 3600)
        meta = self.meta().get(run_id, {})
        L = self.launch
        u["stoppable"] = bool(L and L.get("run") == run_id and self.launching())
        u["stopped"] = bool(meta.get("stopped"))
        u["launch_model"] = meta.get("model")
        if not u.get("model") and meta.get("model"):
            u["model"], u["build"] = meta["model"], transcripts.build_for(meta["model"])
        self.usage_cache[run_id] = (time.time(), u)
        return u

    def run_dirs(self):
        if not os.path.isdir(self.arena):
            return []
        out = []
        for name in os.listdir(self.arena):
            d = os.path.join(self.arena, name)
            if os.path.isfile(os.path.join(d, "arena.json")):
                out.append(d)
        return out

    def run_dir(self, run_id):
        for d in self.run_dirs():
            if os.path.basename(d) == run_id:
                return d
        return None

    def signature(self, d):
        """Changes whenever any file the export reads is added or rewritten."""
        h = hashlib.sha1()
        for base, dirs, files in os.walk(d):
            dirs[:] = [x for x in dirs if x not in ("prompts", "scratch")]
            for f in sorted(files):
                try:
                    s = os.stat(os.path.join(base, f))
                except OSError:
                    continue
                h.update(("%s/%s:%d:%d;" % (base, f, s.st_mtime_ns, s.st_size)).encode())
        return h.hexdigest()[:20]

    def export(self, d):
        sig = self.signature(d)
        with self.lock:
            hit = self.cache.get(d)
            if hit and hit[0] == sig:
                return sig, hit[1]
        body = json.dumps(export_run.export(d), separators=(",", ":")).encode()
        with self.lock:
            self.cache[d] = (sig, body)
        return sig, body

    def summary(self, d):
        try:
            st = json.load(open(os.path.join(d, "arena.json"), encoding="utf-8"))
        except (OSError, ValueError):
            return None
        task = ""
        try:
            task = open(os.path.join(d, "task.md"), encoding="utf-8").read().strip()
        except OSError:
            pass
        alive = sum(1 for a in st["agents"].values() if a["alive"])
        closed = sum(1 for r in st["rounds"] if r["closed"])
        meta = self.meta().get(os.path.basename(d), {})
        return {"id": os.path.basename(d), "n": st["agents_n"], "stopped": bool(meta.get("stopped")), "model": meta.get("model"), "created": st.get("created"), "seed": st["seed"],
                "champion": st.get("champion"), "alive": alive, "rounds_played": closed,
                "rounds_total": len(B_sizes(st["agents_n"])) - 1, "task": task[:300],
                "mtime": max((os.path.getmtime(os.path.join(d, "arena.json")),
                              os.path.getmtime(d))), "has_baseline": bool(st.get("has_baseline"))}

    def launching(self):
        return self.proc is not None and self.proc.poll() is None


def B_sizes(n):
    return export_run.B.bracket_sizes(n)


def build_prompt(skill, agents, task, seed, baseline):
    parts = ["/%s --agents %d" % (skill, agents)]
    if seed:
        parts.append("--seed %d" % seed)
    parts.append(task.strip())
    prompt = " ".join(parts)
    if baseline.strip():
        prompt += "\n\nThe answer I rejected, which the arena has to beat:\n\n" + baseline.strip()
    return prompt


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "ArenaViewer/1"

    def log_message(self, fmt, *args):
        if os.environ.get("ARENA_VIEWER_VERBOSE"):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    @property
    def S(self):
        return self.server.state

    def send(self, code, body=b"", ctype="application/json", headers=None):
        if isinstance(body, (dict, list)):
            body = json.dumps(body).encode()
        elif isinstance(body, str):
            body = body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        qs = parse_qs(url.query)
        path = url.path
        if path == "/api/config":
            return self.send(200, {"root": self.S.root, "model": self.S.model, "launch": self.S.allow_launch,
                                   "skill": self.S.skill, "token": self.S.token, "claude": bool(shutil.which("claude")),
                                   "launching": self.S.launching(),
                                   "models": [dict(c, **transcripts.PRICES[c["id"]]) for c in transcripts.CHOICES]})
        if path == "/api/runs":
            runs = [s for s in (self.S.summary(d) for d in self.S.run_dirs()) if s]
            runs.sort(key=lambda r: r["mtime"], reverse=True)
            return self.send(200, runs)
        if path == "/api/run":
            d = self.S.run_dir((qs.get("id") or [""])[0])
            if not d:
                return self.send(404, {"error": "no such run"})
            try:
                sig, body = self.S.export(d)
            except (OSError, ValueError, KeyError) as e:
                return self.send(503, {"error": "run is being written, try again: %s" % e})
            if self.headers.get("If-None-Match") == sig:
                return self.send(304, b"", headers={"ETag": sig})
            return self.send(200, body, headers={"ETag": sig})
        if path in ("/api/usage", "/api/claude"):
            d = self.S.run_dir((qs.get("id") or [""])[0])
            if not d:
                return self.send(404, {"error": "no such run"})
            if path == "/api/usage":
                return self.send(200, self.S.usage(d))
            return self.send(200, transcripts.claude_log(self.S.root, os.path.basename(d), since=self.S.created(d) - 3600))
        if path == "/api/launch-log":
            try:
                with open(self.S.log_path, encoding="utf-8", errors="replace") as fh:
                    text = fh.read()[-6000:]
            except OSError:
                text = ""
            return self.send(200, {"running": self.S.launching(), "log": text})
        return self.static(path)

    def do_HEAD(self):
        self.do_GET()

    def static(self, path):
        if path in ("", "/"):
            path = "/index.html"
        full = os.path.normpath(os.path.join(APP, path.lstrip("/")))
        if not full.startswith(APP + os.sep) or not os.path.isfile(full):
            return self.send(404, {"error": "not found"})
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        with open(full, "rb") as fh:
            return self.send(200, fh.read(), ctype)

    def do_POST(self):
        url = urlparse(self.path)
        if url.path not in ("/api/launch", "/api/stop"):
            return self.send(404, {"error": "not found"})
        if not self.S.allow_launch:
            return self.send(403, {"error": "start the viewer with --allow-launch to start runs from here"})
        host = self.headers.get("Host", "")
        origin = self.headers.get("Origin", "")
        if origin and urlparse(origin).netloc != host:
            return self.send(403, {"error": "cross-origin request refused"})
        if self.headers.get("X-Arena-Token") != self.S.token:
            return self.send(403, {"error": "bad token"})
        if url.path == "/api/stop":
            return self.stop()
        if self.S.launching():
            return self.send(409, {"error": "a run started from here is still going"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            req = json.loads(self.rfile.read(min(n, 200000)) or b"{}")
            agents = int(req.get("agents", 16))
            task = str(req.get("task", ""))
            seed = int(req["seed"]) if str(req.get("seed", "")).strip() else None
            baseline = str(req.get("baseline", ""))
            model = str(req.get("model") or "")
        except (ValueError, TypeError) as e:
            return self.send(400, {"error": "bad request: %s" % e})
        if not task.strip():
            return self.send(400, {"error": "the task is empty"})
        if not 2 <= agents <= 2160:
            return self.send(400, {"error": "competitors must be between 2 and 2160"})
        exe = shutil.which(LAUNCH[0])
        if not exe:
            return self.send(400, {"error": "`claude` is not on PATH; paste the command into Claude Code instead"})
        if model and model not in [c["id"] for c in transcripts.CHOICES]:
            return self.send(400, {"error": "unknown model %s" % model})
        prompt = build_prompt(self.S.skill, agents, task, seed, baseline)
        cmd = [exe] + [a.replace("{prompt}", prompt) for a in LAUNCH[1:]] + (["--model", model] if model else [])
        log = open(self.S.log_path, "w", encoding="utf-8")
        log.write("$ %s\n\n" % " ".join(c if c != prompt else repr(prompt[:120] + "…") for c in cmd))
        log.flush()
        self.S.launch = {"started": time.time(), "model": model or None, "run": None}
        self.S.proc = subprocess.Popen(cmd, cwd=self.S.root, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
                                       start_new_session=True)
        return self.send(200, {"ok": True, "pid": self.S.proc.pid, "prompt": prompt, "started": self.S.launch["started"]})

    def stop(self):
        """End the Claude Code run the lobby started, with every sub-agent it spawned."""
        S = self.S
        S.claim_launched_run()
        if not S.launching():
            return self.send(409, {"error": "nothing started from here is running. A run you started yourself stops from Claude Code (press Esc)"})
        try:
            os.killpg(S.proc.pid, signal.SIGTERM)
        except OSError:
            pass
        proc = S.proc

        def finish():
            try:
                proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except OSError:
                    pass
        threading.Thread(target=finish, daemon=True).start()
        if S.launch and S.launch.get("run"):
            S.set_meta(S.launch["run"], stopped=True)
            S.usage_cache.pop(S.launch["run"], None)
        with open(S.log_path, "a", encoding="utf-8") as fh:
            fh.write("\n[stopped from the viewer at %s]\n" % time.strftime("%H:%M:%S"))
        return self.send(200, {"ok": True, "run": S.launch and S.launch.get("run")})


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    p = argparse.ArgumentParser(description="The Arena: a game viewer for the /arena Claude Code skill.")
    p.add_argument("--root", default=".", help="project folder that holds .arena/ (default: here)")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--model", choices=MODELS, default="sonnet", help="how to draw the fighters (the run's model)")
    p.add_argument("--skill", default="arena", help="skill command name, e.g. arena-skill:arena when installed as a plugin")
    p.add_argument("--allow-launch", action="store_true", help="let the lobby start runs with `claude -p`")
    p.add_argument("--export", metavar="RUN_DIR", help="print one run's event log as JSON and exit")
    a = p.parse_args()
    if a.export:
        json.dump(export_run.export(a.export), sys.stdout, separators=(",", ":"))
        return
    state = State(a.root, a.model, a.allow_launch, a.skill)
    srv = Server((a.host, a.port), Handler)
    srv.state = state
    print("The Arena is open on http://%s:%d" % (a.host, a.port))
    print("Watching %s" % state.arena)
    if a.allow_launch:
        print("Runs can be started from the lobby (they run `claude -p` in %s)" % state.root)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
