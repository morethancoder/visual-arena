#!/usr/bin/env python3
"""Export one match of a run folder as the event list the viewer animates.

    python3 tools/export_match.py fixtures/quick/.arena/<run> r2-m01 > design/sample-match.js
"""
import json, os, re, sys

ATTACK = re.compile(r"^ATTACK (\d+) \[(FATAL|MAJOR|MINOR)\] (.+)$", re.M)
DEFENSE = re.compile(r"^ATTACK (\d+): (CONCEDE|REBUT)\. (.+)$", re.M)


def read(p):
    return open(p, encoding="utf-8").read() if os.path.exists(p) else ""


def side(d, rnd, mid, me, opp, card):
    atk = read(os.path.join(d, "r%d" % rnd, "%s.%s.attack.md" % (mid, opp)))     # attacks me
    dfn = read(os.path.join(d, "r%d" % rnd, "%s.%s.defense.md" % (mid, me)))
    answers = {n: (s, why) for n, s, why in DEFENSE.findall(dfn)}
    return {"id": me, "card": {k: card[k]["id"] for k in card},
            "cardNames": {k: card[k]["name"] for k in card},
            "taken": [{"n": int(n), "tier": t, "title": title,
                       "stance": answers.get(n, ("CONCEDE", ""))[0],
                       "answer": answers.get(n, ("", ""))[1]} for n, t, title in ATTACK.findall(atk)]}


def main(d, mid):
    st = json.load(open(os.path.join(d, "arena.json")))
    rnd = int(mid.split("-")[0][1:])
    m = next(x for x in st["rounds"][rnd - 1]["matches"] if x["id"] == mid)
    v = json.loads(read(os.path.join(d, "r%d" % rnd, "%s.verdict.json" % mid)))
    a, b = m["a"], m["b"]
    out = {"match": mid, "round": rnd,
           "a": side(d, rnd, mid, a, b, st["agents"][a]["card"]),
           "b": side(d, rnd, mid, b, a, st["agents"][b]["card"]),
           "winner": m["winner"], "loser": m["loser"], "reason": m["reason"],
           "totals": m["scores"], "scores": v["scores"], "standing": v.get("standing", {})}
    print("window.SAMPLE_MATCH = " + json.dumps(out, indent=1) + ";")


if __name__ == "__main__":
    main(*sys.argv[1:3])
