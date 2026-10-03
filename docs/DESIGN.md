# Visual Arena: design notes

A web viewer that turns a `/arena` run into a medieval pixel-art battle you can watch live, leave, and
come back to. This file covers what the skill actually does, what of it can be shown honestly, and the
proposed design. The style preview is `design/preview.html` (open it in a browser).

## 1. Which skill

[Jakeschincariol/arena-skill](https://github.com/Jakeschincariol/arena-skill) (MIT). It is the one
the "100 Claudes fight to the death" posts point to and the one in the plugin directories. It is also
the most solid of the candidates: the tournament is a tested state machine (`bracket.py`) rather
than prose instructions. Other skills with similar names exist, e.g. `zhjai/agent-arena`, a
Codex-vs-Claude debate skill with a different shape. The vendored copy is in
`third_party/arena-skill/` at commit `df07b8e`.

## 2. How the skill works

1. **Spawn.** N sub-agents (default 100, `--quick` 16) get the identical task plus a unique
   *strategy card*: reasoning mode (15) x workflow (12) x strategy (12). Each writes a solution.
2. **Rounds**, single elimination, until one is left. Pairing avoids two agents with the same
   reasoning mode. An odd count gives one *bye*.
   - **Attack**: each side writes up to 7 attacks on the other's solution, each labelled
     `FATAL`, `MAJOR` or `MINOR`.
   - **Defend**: each side answers every attack it took with `CONCEDE` (and fixes it) or `REBUT`,
     then writes a revised solution.
   - **Judge**: a separate judge scores both revised solutions on 5 criteria (correctness 30,
     completeness 25, robustness 20, specificity 15, clarity 10) and marks verified `fatal` flaws.
     `bracket.py` applies the arithmetic: higher total wins, and fatal can't beat non-fatal.
3. **Final** (only if there was a rejected answer): a blind judge compares the champion with it.

100 agents means 7 rounds, 595 sub-agent calls and 70 waves of 10. A long run takes a while, which
is why being able to come back later matters.

## 3. The data contract: everything the viewer can read

Everything is on disk in `.arena/<run>/`, and `.arena/LATEST` points to the current run. The viewer
only reads files and never talks to Claude Code.

| file | contents | becomes |
| --- | --- | --- |
| `arena.json` | seed, N, every agent's card, `alive`, `eliminated_in`, `eliminated_by`, `byes`; every round's matches (`a`, `b`, `winner`, `loser`, `reason`, `survived`, totals) and `bye`; `champion`; `final` | the whole bracket, who's alive, who killed whom |
| `task.md`, `baseline.md` | the task; the rejected answer | the title scroll; the ghost |
| `r0/aNNN.md` | spawn solution | fighter enters |
| `rN/<match>.<agent>.attack.md` | `ATTACK k [TIER] title` / `Where:` / `Problem:` | one thrown weapon per attack, with the text |
| `rN/<match>.<agent>.defense.md` | `ATTACK k: CONCEDE\|REBUT. why` | parry, or take the hit and reforge |
| `rN/<match>.<agent>.solution.md` | revised solution | readable in the side panel |
| `rN/<match>.verdict.json` | per-criterion scores, `fatal`, `winner`, `reason`, `survived[]`, `standing{}` | score bars, skull, death, epitaph |
| `final.verdict.json` | champion vs rejected answer | the last bout |
| file **mtimes** | when each job finished | the timeline for replay and "what happened while I was gone" |

The phase that is running right now can be worked out from which files exist: the same logic as
`bracket.py next`, ported to JS.

### What is exact, and what is decoration

Exact (from the files): who fights whom, the order of phases, how many attacks, each attack's tier and
title, concede vs rebut per attack, the five scores, fatal, the winner, the reason, attacks still
standing, the bye, the champion, the final result.

Decoration (random within the rule): which weapon inside a tier, where on the body it sticks, small
idle and impact motion.

Not available, so not shown or only approximated:
- **The model per agent.** Every sub-agent runs on the session's model and `arena.json` doesn't
  record it, so the build is per run. It comes from a viewer setting or `--model` flag, or can be
  detected from Claude Code's sub-agent transcripts (`message.model`), which is optional and a
  later step. Mixed builds in one fight would need a fork of the skill that passes `model:` per
  Agent call. That's possible, but then the run differs from upstream.
- **Attack category** (WRONG / MISSING / BREAKS / VAGUE). The brief asks for it but the format does
  not label it. We could guess it from the text, but we won't show the guess as fact.
- **Which attack a `survived` entry refers to.** The judge writes free text, so `standing` is matched
  to attack titles by best effort, and when there's no match the text is shown on its own.
- **Live progress inside a single sub-agent.** Only finished files are visible, so a fighter "winds
  up" while its file is missing and acts when it appears.

## 4. Visual language (see the preview)

- **Look**: pixel art built from the Claude Code mascot grid, a stone colosseum with a sand floor and
  torches, parchment speech bubbles and tooltips. Fonts are *Jacquard 24* (blackletter) for titles,
  *Pixelify Sans* for UI and *VT323* for attack and defense text.
- **Build = model**: Haiku is small with a propeller cap, mismatched eyes and tongue out. Sonnet is
  the plain mascot. Opus is the nerd, with thick glasses and a cowlick. Fable is the muscle, with a
  headband, angry brows and flexed arms.
- **Body colour = reasoning mode** (15 colours, Claude orange = first principles).
- **Shield charge = strategy** (12 heraldic charges). Workflow is in the hover card only.
- **Weapon tier = attack label**: MINOR = dagger, arrow, sling stone. MAJOR = sword, axe, mace,
  crossbow bolt. FATAL = warhammer, flail, fireball, ballista bolt (with screen shake).
- **Defense**: REBUT = shield up, the weapon is knocked out in a spark. CONCEDE = the weapon is
  pulled out and the wound reforged in a blue anvil glow, because conceding and fixing is how the
  revised solution gets better.
- **Judge**: a herald's scroll above the arena. Score bars fill. Standing attacks come back stuck
  and glowing red. A verified fatal flaw puts a skull overhead.
- **Death**: the loser topples and becomes a gravestone in the graveyard ring. Hovering it shows the
  card, the round, the killer, the score, the fatal flag, the standing attacks and the judge's
  reason.
- **Bye**: in the stands with an ale. **Champion**: crown. **Final**: a bout against the pale ghost
  of the rejected answer, with the result shown even if the ghost wins.

## 5. Proposed app

**Views**
1. **Colosseum overview**: every alive fighter in its duel pit, the graveyard around the edge, the
   stands for byes, and a header with round, phase and progress (`round 3 of 7 · judging · 9 of 12
   verdicts`). At 100 agents round 1 is 50 small pits; later rounds get bigger pits.
2. **Duel view**: click a pit for the full animated match with speech bubbles (what the preview
   shows), plus a side panel with the full attack, defense and revised-solution text.
3. **Bracket**: a classic tree, with each node coloured as its fighter.
4. **Battle log**: a scrolling chronicle ("a017's ballista bolt: *Headline is 12 words* [FATAL]").

**Live vs later**: one timeline built from file mtimes. Opening it mid-run shows "N events since you
left" with *catch up* (fast replay) or *skip to now*. A finished run opens on the champion and
offers a full replay at 1x, 2x or 4x.

**Stack (proposal)**: a zero-dependency Python 3 server, `python3 viewer.py [path/to/.arena]`. It
serves the static app and a `/api/run` snapshot plus `/api/events` (Server-Sent Events from polling
the folder). That matches the skill's own "standard library only" ethos, so anyone who can run the
skill can run the viewer. The front end is plain JS with the SVG/DOM sprites from
`design/sprites.js`, or Canvas if 100 animated fighters prove heavy.

**Dev data**: `tools/make_fixture.py` plays real tournaments through the vendored `bracket.py`
with stand-in sub-agents, so there is no token cost, and `--live 0.5` writes in real time for
testing the live mode.

```bash
python3 tools/make_fixture.py --agents 16 --out fixtures/quick
python3 tools/make_fixture.py --agents 100 --baseline --out fixtures/full
python3 tools/make_fixture.py --agents 16 --live 0.5 --out fixtures/live
```

## 6. Open decisions

1. Run-wide build (honest to the skill) vs a fork that mixes models per agent.
2. Local `viewer.py` reading `.arena/` (recommended) vs a hosted page you upload a run folder to.
3. DOM/SVG sprites (simple, crisp, easy hover) vs Canvas/PixiJS (scales to more motion).
