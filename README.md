# The Arena

A game viewer for the [`/arena` Claude Code skill](https://github.com/Jakeschincariol/arena-skill).
`/arena` makes many copies of Claude compete over one task: each gets a different strategy card,
they attack each other's answers, defend and fix their own, and a judge eliminates one per match
until a single answer is left. The Arena turns the files that run leaves in `.arena/` into a
pixel-art colosseum you can watch live, leave, and come back to.

- **Lobby**: set up a run (competitors, task, an answer to beat), see what it will cost, then copy
  the `/arena` command or start it from the page.
- **Spawn**: competitors pour out of the gates and loot crates while they write their first answers.
- **Fights**: every attack, shield (rebuttal) and heal (conceded and fixed) plays when its file
  lands, with the attack's real FATAL / MAJOR / MINOR label and title.
- **Judgement**: a judge stands in the crowd, holds up the winner on a placard, and a laurel lands
  on the winner. The loser falls; the winner loots the fixes off the body.
- **Live or replay**: follow a run as it happens, rewind, jump back to live, or replay a finished
  run at up to 8x. Click any fight for the close-up with each fighter's log.
- **Results**: the champion's path, the final check against the answer you rejected, and the
  winning answer to copy.

## Quick start

```bash
make dev        # watch a fake run being written live, no Claude Code or tokens needed
make serve      # watch real runs: make serve ROOT=~/my-project
make            # list every command
```

| command | what it does |
| --- | --- |
| `make dev` | writes a fake run in real time into `.dev/live` and serves it on :8765. Edit `app/` and refresh. Ctrl-C stops both |
| `make serve` | watches `ROOT/.arena` (`ROOT=~/my-project`, `PORT=`, `MODEL=opus`, `SKILL=arena-skill:arena`) |
| `make launch` | same, and the lobby's Start button runs Claude Code for you (spends tokens) |
| `make demo-run` | serves a finished fake run to replay (`AGENTS=`, `SEED=`) |
| `make install-skill` | copies the vendored `/arena` skill to `~/.claude/skills/arena` |
| `make build` | builds `dist/the-arena.html`, one page with a demo run inside |
| `make check` | compiles the Python, plays a fake tournament, exports it, parses the app's scripts |
| `make export RUN=.arena/run-…` | prints a run's event log as JSON |
| `make release VERSION=v0.2.0` | tags and pushes; GitHub Actions publishes the release |
| `make clean` | removes generated runs and builds |

## Run it

Python 3.8+, nothing to install. In the project where you run `/arena`:

```bash
python3 /path/to/visual-arena/viewer.py
```

Open http://127.0.0.1:8765. Runs in `./.arena/` show up in the lobby. Use `--root` to watch another
folder.

| flag | what it does |
| --- | --- |
| `--root DIR` | the project that holds `.arena/` (default: current folder) |
| `--port N` | default 8765 |
| `--model haiku\|sonnet\|opus\|fable` | how the fighters are drawn by default (also switchable in the page) |
| `--skill NAME` | the skill's command name, e.g. `arena-skill:arena` when installed as a plugin |
| `--allow-launch` | let the lobby's **Start** button run Claude Code for you (see below) |
| `--export RUN_DIR` | print a run's event log as JSON, for sharing or opening without a server |

### Starting runs from the lobby

Without `--allow-launch`, the lobby gives you the `/arena` command to paste into Claude Code, then
opens the run as soon as its folder appears. With `--allow-launch`, **Start** runs this in `--root`:

```bash
claude -p "/arena --agents N <task>" --permission-mode acceptEdits \
  --allowedTools "Bash(python3 *),Read,Write,Edit,Glob,Grep,Agent,Skill"
```

That lets the skill run `bracket.py` and its sub-agents write into `.arena/` without a prompt per
file; sub-agents inherit the same mode and tools. The launch endpoint only listens on 127.0.0.1,
refuses cross-origin requests, and needs a per-session token. The command is the `LAUNCH` list at
the top of `viewer.py` if you want to change it. Runs cost real tokens: the lobby shows the number
of sub-agent calls before you start.

### Without a server

`python3 tools/bundle_app.py` (or `make build`) writes `dist/the-arena.html`, a single page with a demo run built in.
It can also open run files made with `viewer.py --export`.

## How it reads a run

Everything comes from files the skill writes; the viewer never writes into `.arena/`.

| file | on screen |
| --- | --- |
| `arena.json` | the agents and their cards, the pairings, byes, champion |
| `r0/aNNN.md` | the agent finishes looting and equips |
| `rN/<match>.<agent>.attack.md` | one attack per `ATTACK k [TIER] title`, weapon from that tier |
| `rN/<match>.<agent>.defense.md` | `REBUT` is a shield, `CONCEDE` is a heal |
| `rN/<match>.verdict.json` | the judge's pick (scored with the skill's own rules), the fall, the loot |
| `final.verdict.json` | the last bout against the ghost of the rejected answer |
| file times | the timeline: waves of sub-agents, rounds that open only when the last fight ends |

The model is not recorded in a run (every competitor uses the session's model), so the fighters'
look comes from `--model` or the Model switch.

## Repository

```
viewer.py                  the local server (standard library only)
app/                       the game: index.html, sprites, engine, colosseum, fight view, lobby
tools/export_run.py        .arena run folder -> event log (live-safe)
tools/make_fixture.py      generate a real run with stand-in agents, no tokens spent (--live to write in real time)
tools/bundle_app.py        single-file build with the demo run
third_party/arena-skill/   the skill, vendored (MIT) for its scoring rules and the fixtures
design/                    the asset lab and earlier style previews
docs/DESIGN.md             how the skill works and why the game looks the way it does
```

Try it without spending tokens:

```bash
python3 tools/make_fixture.py --agents 16 --live 1.5 --out /tmp/arena-demo &   # writes a run in real time
python3 viewer.py --root /tmp/arena-demo
```
