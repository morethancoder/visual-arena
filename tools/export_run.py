#!/usr/bin/env python3
"""Export a whole .arena run folder as the event log the game plays back.

    python3 tools/export_run.py fixtures/quick/.arena/<run> > run.json

The log has three parts:
- agents: every competitor's card.
- rounds: every match with the attacks each side actually wrote (tier, title), the
  defender's stance and answer per attack, the verdict (totals, fatal, standing,
  survived, reason, winner) and the bye.
- events: when each file landed, in seconds from the start of the run, taken from the
  file mtimes. This is the same signal a live viewer gets by watching the folder.
"""
import json
import os
import re
import sys

ATTACK = re.compile(r"^ATTACK (\d+) \[(FATAL|MAJOR|MINOR)\] (.+)$", re.M)
DEFENSE = re.compile(r"^ATTACK (\d+): (CONCEDE|REBUT)\. ?(.*)$", re.M)


def read(path):
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8", errors="replace") as fh:
        return fh.read()


def mtime(path):
    return os.path.getmtime(path) if os.path.exists(path) else None


def export(d):
    st = json.load(open(os.path.join(d, "arena.json")))
    events = []
    agents = {}
    for aid, a in sorted(st["agents"].items()):
        c = a["card"]
        agents[aid] = {"card": [c["reasoning"]["id"], c["workflow"]["id"], c["strategy"]["id"]],
                       "names": [c["reasoning"]["name"], c["workflow"]["name"], c["strategy"]["name"]]}
        t = mtime(os.path.join(d, "r0", aid + ".md"))
        if t:
            events.append([t, "spawn", aid])

    rounds = []
    for rd in st["rounds"]:
        n = rd["n"]
        rdir = os.path.join(d, "r%d" % n)
        matches = []
        for m in rd["matches"]:
            mid, a, b = m["id"], m["a"], m["b"]
            atk, dfn, verdict = {}, {}, {}
            for me in (a, b):
                p = os.path.join(rdir, "%s.%s.attack.md" % (mid, me))
                text = read(p)
                if text is not None:
                    atk[me] = [{"tier": tier, "title": title.strip()} for _, tier, title in ATTACK.findall(text)]
                    events.append([mtime(p), "attack", mid, me])
            for me, opp in ((a, b), (b, a)):
                p = os.path.join(rdir, "%s.%s.defense.md" % (mid, me))
                text = read(p)
                if text is not None:
                    answers = {int(k): (s, why.strip()) for k, s, why in DEFENSE.findall(text)}
                    dfn[me] = [{"stance": answers.get(i + 1, ("CONCEDE", ""))[0],
                                "answer": answers.get(i + 1, ("", ""))[1]}
                               for i in range(len(atk.get(opp, [])))]
                    events.append([mtime(p), "defend", mid, me])
            p = os.path.join(rdir, "%s.verdict.json" % mid)
            text = read(p)
            if text is not None:
                try:
                    verdict = json.loads(text[text.find("{"):text.rfind("}") + 1])
                except ValueError:
                    verdict = {}
                events.append([mtime(p), "judge", mid])
            scores = verdict.get("scores") or {}
            matches.append({
                "id": mid, "a": a, "b": b, "atk": atk, "def": dfn,
                "winner": m["winner"], "loser": m["loser"], "reason": m["reason"],
                "totals": m["scores"], "survived": m.get("survived") or [],
                "fatal": {k: bool((scores.get(k) or {}).get("fatal")) for k in (a, b)},
                "standing": verdict.get("standing") or {},
            })
        rounds.append({"n": n, "bye": rd["bye"], "matches": matches})

    final = None
    if st.get("final") and st["final"].get("result"):
        p = os.path.join(d, "final.verdict.json")
        final = dict(st["final"]["result"])
        if os.path.exists(p):
            events.append([mtime(p), "final"])

    events.sort(key=lambda e: e[0])
    t0 = events[0][0] - 60 if events else 0
    for e in events:
        e[0] = round(e[0] - t0, 1)
    task = read(os.path.join(d, "task.md")) or ""
    return {"run": os.path.basename(d), "n": st["agents_n"], "seed": st["seed"], "task": task.strip(),
            "champion": st["champion"], "agents": agents, "rounds": rounds, "final": final, "events": events}


if __name__ == "__main__":
    json.dump(export(sys.argv[1]), sys.stdout, separators=(",", ":"))
