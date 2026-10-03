#!/usr/bin/env python3
"""Generate a realistic .arena/ run without spending any tokens.

Drives the real, vendored bracket.py through every phase (spawn, attack, defend,
judge, collect, advance, final) exactly like the /arena orchestrator does, but the
sub-agents are stand-ins that write plausible files in the formats SKILL.md asks for.

Every output file gets an mtime staggered the way waves of 10 would land, so the
viewer can rebuild a believable timeline from file times alone.

    python3 tools/make_fixture.py --agents 16 --seed 7 --out fixtures/quick
    python3 tools/make_fixture.py --agents 100 --baseline --out fixtures/full
    python3 tools/make_fixture.py --agents 16 --live 0.5 --out fixtures/live   # real time, 0.5 s per wave
"""
import argparse
import json
import os
import random
import re
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
BRACKET = os.path.join(HERE, "..", "third_party", "arena-skill", "bracket.py")

TASK = """Write the headline and the one-line subhead for the pricing page of Tallyho, a
time-tracking app for freelance designers. Three plans: Free, Pro ($9/mo), Studio ($29/mo).
The headline must be under 10 words. Tone: confident, a little playful, never cute.
"""
BASELINE = "Simple pricing for every designer.\nPick a plan and start tracking today.\n"

FLAWS = [
    ("MISSING", "Never mentions the three plans", "The task lists Free, Pro and Studio; the subhead names none."),
    ("WRONG", "Headline is 12 words", "The task says under 10 words. Counted: 12."),
    ("VAGUE", "Subhead promise is unmeasurable", "'Save hours' gives the reader nothing to check."),
    ("BREAKS", "Reads as cute, not playful", "'Tick-tock, pay less!' is exactly the cute tone the task rules out."),
    ("WRONG", "Claims a free trial that does not exist", "The task describes a Free plan, not a trial."),
    ("MISSING", "No audience signal", "Nothing says this is for freelance designers."),
    ("VAGUE", "Generic SaaS phrasing", "'Pricing that scales with you' fits any product on earth."),
    ("BREAKS", "Pun fails out loud", "'Time is money, honey' only works in writing, never in a demo."),
    ("WRONG", "Price math is off", "Says Studio is 'three times Pro'; $29 is not 3 x $9."),
    ("MISSING", "No call to action", "Nothing tells the reader what to click."),
]
SEVERITIES = ["FATAL"] * 1 + ["MAJOR"] * 4 + ["MINOR"] * 5
HEADLINES = [
    "Track the hours. Keep the money.", "Your time, finally billable.", "Every minute, on the invoice.",
    "Stop guessing what the logo cost.", "Billable hours, minus the busywork.", "Clock in. Get paid. Design more.",
    "Pricing as clean as your grid.", "Know your hourly. Charge it.",
]


class Clock:
    """Fake wall clock: each wave of sub-agents takes a while, jobs inside a wave finish close together."""

    def __init__(self, start, live):
        self.t = start
        self.live = live

    def wave(self, jobs, wave_size):
        stamps = []
        for i in range(0, len(jobs), wave_size):
            chunk = jobs[i:i + wave_size]
            base = self.t
            for _ in chunk:
                stamps.append(base + random.uniform(20, 90))
            self.t = max(stamps[-len(chunk):]) + random.uniform(2, 6)
            if self.live:
                yield chunk, None
                time.sleep(self.live)
            else:
                yield chunk, stamps[-len(chunk):]


def arena(*args):
    out = subprocess.run([sys.executable, BRACKET] + list(args), capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit("bracket.py %s failed:\n%s%s" % (" ".join(args), out.stdout, out.stderr))
    return out.stdout


def load_state():
    with open(os.path.join(".arena", "LATEST")) as fh:
        d = fh.read().strip()
    with open(os.path.join(d, "arena.json")) as fh:
        return json.load(fh)


def write(path, text, mtime):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
    if mtime:
        os.utime(path, (mtime, mtime))


def fake_solution(rng, aid, revised=False):
    h = rng.choice(HEADLINES)
    sub = "Free to start, $9 for Pro, $29 when the studio grows. Built for freelance designers."
    body = "# %s\n\n%s\n\n## Assumptions\n- The reader lands here from the homepage.\n" % (h, sub)
    if revised:
        body += "\n## Changes after review\n- Named all three plans.\n- Cut the headline to %d words.\n" % len(h.split())
    return body


def fake_attacks(rng):
    n = rng.choice([0, 1, 2, 2, 3, 3, 3, 4, 5, 7]) if rng.random() > 0.05 else 0
    picks = rng.sample(FLAWS, min(n, len(FLAWS)))
    lines = []
    for i, (kind, title, problem) in enumerate(picks, 1):
        sev = rng.choice(SEVERITIES)
        lines.append("ATTACK %d [%s] %s\nWhere: \"%s\"\nProblem: %s: %s\n"
                     % (i, sev, title, rng.choice(HEADLINES), kind, problem))
    return "\n".join(lines) if lines else ""


def parse_attacks(text):
    return re.findall(r"^ATTACK (\d+) \[(FATAL|MAJOR|MINOR)\] (.+)$", text, re.M)


def fake_defense(rng, attacks_text):
    attacks = parse_attacks(attacks_text)
    if not attacks:
        return "NO ATTACKS RECEIVED\n", []
    out, stances = [], []
    for num, sev, title in attacks:
        stance = "CONCEDE" if rng.random() < (0.7 if sev != "MINOR" else 0.45) else "REBUT"
        stances.append((num, sev, title, stance))
        why = ("Right. Fixed: %s." % title.lower()) if stance == "CONCEDE" else \
              "Wrong. The task never asks for that; see the second line of the task."
        out.append("ATTACK %s: %s. %s" % (num, stance, why))
    return "\n".join(out) + "\n", stances


def score(rng, stances):
    standing = [t for (_, sev, t, st) in stances if st == "REBUT" and rng.random() < 0.4]
    fatal = any(sev == "FATAL" and t in standing for (_, sev, t, _) in stances)
    base = rng.uniform(5, 9)
    s = {k: max(0, min(10, round(base + rng.uniform(-2, 2)))) for k in
         ("correctness", "completeness", "specificity", "robustness", "clarity")}
    s["robustness"] = max(0, s["robustness"] - 2 * len(standing))
    s["fatal"] = fatal
    return s, standing


def run(args):
    rng = random.Random(args.seed)
    random.seed(args.seed)
    os.makedirs(args.out, exist_ok=True)
    os.chdir(args.out)
    with open("task.md", "w") as fh:
        fh.write(TASK)
    init = ["init", "--agents", str(args.agents), "--seed", str(args.seed), "--task-file", "task.md"]
    if args.baseline:
        with open("baseline.md", "w") as fh:
            fh.write(BASELINE)
        init += ["--baseline-file", "baseline.md"]
    arena(*init)
    clock = Clock(time.time() - (0 if args.live else 3 * 3600), args.live)
    defenses = {}

    while True:
        st = load_state()
        out = arena("next")
        m = re.search(r"^NEXT: (\w+)\.|^(DONE)\.", out, re.M)
        phase = (m.group(1) or m.group(2)).lower()
        if phase == "done":
            break
        if phase in ("collect", "advance"):
            arena(phase)
            continue
        arena("prompts", phase)
        sys.path.insert(0, os.path.dirname(BRACKET))
        import bracket as B  # noqa: E402  (same module the CLI runs, for the job list only)
        jobs = B.missing_jobs(B.phase_jobs(st, phase))
        for chunk, stamps in clock.wave(jobs, st["wave"]):
            for i, j in enumerate(chunk):
                t = stamps[i] if stamps else None
                k = j["kind"]
                if k == "competitor":
                    write(j["outputs"][0], fake_solution(rng, j["agent"]), t)
                elif k == "attacker":
                    write(j["outputs"][0], fake_attacks(rng), t)
                elif k == "defender":
                    atk = B.attack_out(st["dir"], j["round"], j["match"], j["opponent"])
                    text = open(atk).read() if os.path.exists(atk) else ""
                    dtext, stances = fake_defense(rng, text)
                    defenses[(j["match"], j["agent"])] = stances
                    write(j["outputs"][0], dtext, t)
                    write(j["outputs"][1], fake_solution(rng, j["agent"], revised=True), t)
                elif k == "judge":
                    a, b = j["a"], j["b"]
                    sa, stand_a = score(rng, defenses.get((j["match"], a), []))
                    sb, stand_b = score(rng, defenses.get((j["match"], b), []))
                    ta, tb = B.weighted_total(sa), B.weighted_total(sb)
                    w = a if (sb["fatal"] and not sa["fatal"]) or (sa["fatal"] == sb["fatal"] and ta >= tb) else b
                    beaten = [t_ for (_, _, t_, st_) in defenses.get((j["match"], w), []) if st_ == "CONCEDE"]
                    verdict = {
                        "match": j["match"], "scores": {a: sa, b: sb}, "winner": w,
                        "reason": rng.choice([
                            "%s named all three plans and kept the headline under ten words." % w,
                            "%s fixed every attack it conceded; the other left a fatal miscount standing." % w,
                            "%s is the one a designer would actually click." % w,
                        ]),
                        "survived": beaten[:5],
                        "standing": {a: stand_a, b: stand_b},
                    }
                    write(j["outputs"][0], json.dumps(verdict, indent=2), t)
                elif k == "final":
                    v = {"scores": {"X": score(rng, [])[0], "Y": score(rng, [])[0]},
                         "winner": rng.choice(["X", "Y"]), "reason": "Names the plans and the audience.",
                         "fixed": ["names the three plans", "says who it is for"]}
                    write(j["outputs"][0], json.dumps(v, indent=2), t)
    st = load_state()
    print("fixture ready: %s (champion %s, %d rounds)"
          % (os.path.relpath(st["dir"], os.path.join(HERE, "..")), st["champion"], len(st["rounds"])))


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--agents", type=int, default=16)
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--baseline", action="store_true", help="also run the final check against a rejected answer")
    p.add_argument("--out", default="fixtures/quick")
    p.add_argument("--live", type=float, default=0, help="seconds to sleep per wave, writing in real time")
    run(p.parse_args())
