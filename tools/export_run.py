#!/usr/bin/env python3
"""Export a .arena run folder as the event log the game plays back.

    python3 tools/export_run.py path/to/.arena/<run> > run.json

Safe to call on a run that is still going: it reads whatever files exist right now.

The log has these parts:
- agents: every competitor's card.
- rounds: every match with the attacks each side actually wrote (tier, title), the
  defender's stance and answer per attack, and the verdict (totals, fatal, standing,
  survived, reason, winner). A verdict counts as soon as its file is on disk: the winner
  is worked out with the skill's own rules (bracket.decide), not left until the
  orchestrator runs `collect`.
- final: the check against a rejected answer, when there is one and it has a verdict.
- events: when each file landed, in seconds from the start of the run, from file mtimes.
- done, champion, champion_solution.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "third_party", "arena-skill"))
import bracket as B  # noqa: E402  the skill's own scoring rules

ATTACK = re.compile(r"^ATTACK (\d+) \[(FATAL|MAJOR|MINOR)\] (.+)$", re.M)
DEFENSE = re.compile(r"^ATTACK (\d+): (CONCEDE|REBUT)\. ?(.*)$", re.M)


def read(path):
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8", errors="replace") as fh:
        return fh.read()


def mtime(path):
    try:
        return os.path.getmtime(path)
    except OSError:
        return None


def verdict_of(path):
    text = read(path)
    if not text or not text.strip() or text.strip() == "NO OUTPUT":
        return None
    v = B.extract_json(text)
    return v if isinstance(v, dict) else None


def strs(v, n=10):
    return [str(x) for x in v][:n] if isinstance(v, list) else []


def export(d):
    st = json.load(open(os.path.join(d, "arena.json"), encoding="utf-8"))
    events, agents = [], {}
    for aid, a in sorted(st["agents"].items()):
        c = a["card"]
        agents[aid] = {"card": [c["reasoning"]["id"], c["workflow"]["id"], c["strategy"]["id"]],
                       "names": [c["reasoning"]["name"], c["workflow"]["name"], c["strategy"]["name"]]}
        p = os.path.join(d, "r0", aid + ".md")
        if read(p):
            events.append([mtime(p), "spawn", aid])

    rounds = []
    for rd in st["rounds"]:
        n = rd["n"]
        rdir = os.path.join(d, "r%d" % n)
        matches = []
        for m in rd["matches"]:
            mid, a, b = m["id"], m["a"], m["b"]
            atk, dfn = {}, {}
            for me in (a, b):
                p = os.path.join(rdir, "%s.%s.attack.md" % (mid, me))
                text = read(p)
                if text is not None:
                    atk[me] = [{"tier": t, "title": title.strip()} for _, t, title in ATTACK.findall(text)]
                    events.append([mtime(p), "attack", mid, me])
            for me, opp in ((a, b), (b, a)):
                p = os.path.join(rdir, "%s.%s.defense.md" % (mid, me))
                text = read(p)
                if text is not None:
                    answers = {int(k): (s, why.strip()) for k, s, why in DEFENSE.findall(text)}
                    dfn[me] = [{"stance": answers.get(i + 1, ("CONCEDE", ""))[0], "answer": answers.get(i + 1, ("", ""))[1]}
                               for i in range(len(atk.get(opp, [])))]
                    events.append([mtime(p), "defend", mid, me])

            vpath = os.path.join(rdir, "%s.verdict.json" % mid)
            v = verdict_of(vpath)
            winner, totals, reason, survived = m["winner"], m["scores"], m["reason"], m.get("survived") or []
            if not winner and v:
                try:
                    winner, totals, _ = B.decide(v, a, b)
                    reason = str(v.get("reason") or "")[:400]
                    survived = strs(v.get("survived"))
                except B.ArenaError:
                    winner = None
            scores = {str(k).strip().lower(): s for k, s in (v.get("scores") or {}).items()} if v and isinstance(v.get("scores"), dict) else {}
            standing = {str(k).strip().lower(): strs(s) for k, s in (v.get("standing") or {}).items()} if v and isinstance(v.get("standing"), dict) else {}
            if winner:
                events.append([mtime(vpath) or mtime(os.path.join(d, "arena.json")), "judge", mid])
            matches.append({
                "id": mid, "a": a, "b": b, "atk": atk, "def": dfn,
                "winner": winner, "loser": (b if winner == a else a) if winner else None, "reason": reason,
                "totals": totals or {}, "survived": survived,
                "fatal": {k: B._truthy((scores.get(k) or {}).get("fatal")) for k in (a, b)},
                "standing": standing,
            })
        rounds.append({"n": n, "bye": rd["bye"], "matches": matches})

    final = None
    fin = st.get("final")
    if fin:
        fpath = os.path.join(d, "final.verdict.json")
        if fin.get("result"):
            final = dict(fin["result"])
        else:
            v = verdict_of(fpath)
            if v:
                try:
                    v = dict(v, scores={str(k).strip().lower(): s for k, s in (v.get("scores") or {}).items()})
                    w, t, _ = B.decide(v, "x", "y")
                    final = {"better": fin[w.upper()],
                             "champion_total": t["x" if fin["X"] == "champion" else "y"],
                             "baseline_total": t["x" if fin["X"] == "baseline" else "y"],
                             "reason": str(v.get("reason") or "")[:400], "fixed": strs(v.get("fixed"))}
                except (B.ArenaError, KeyError):
                    final = None
        if final:
            events.append([mtime(fpath) or mtime(os.path.join(d, "arena.json")), "final"])

    events = [e for e in events if e[0] is not None]
    events.sort(key=lambda e: e[0])
    created = mtime(os.path.join(d, "task.md")) or (events[0][0] if events else 0)
    t0 = min([created] + [e[0] for e in events[:1]])
    for e in events:
        e[0] = round(e[0] - t0, 1)

    champion = st.get("champion")
    solution = None
    if champion:
        solution = read(st["agents"][champion]["solution"]) or read(os.path.join(d, os.path.relpath(st["agents"][champion]["solution"], st["dir"])))
    done = bool(champion) and (not st.get("has_baseline") or final is not None)
    task = read(os.path.join(d, "task.md")) or ""
    return {"run": os.path.basename(d), "n": st["agents_n"], "seed": st["seed"], "created": st.get("created"),
            "task": task.strip(), "has_baseline": bool(st.get("has_baseline")), "champion": champion,
            "champion_solution": solution, "done": done, "agents": agents, "rounds": rounds,
            "final": final, "events": events}


if __name__ == "__main__":
    json.dump(export(sys.argv[1]), sys.stdout, separators=(",", ":"))
