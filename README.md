# Visual Arena

A medieval pixel-art viewer for the [`/arena` skill](https://github.com/Jakeschincariol/arena-skill):
Claude mascots fight out the tournament in a colosseum you can watch live or come back to later.

- `docs/DESIGN.md`: how the skill works, what can be visualised accurately, the proposed app
- `design/preview.html`: style preview (builds, colours, weapons, a real match replayed)
- `design/sprites.js`: the pixel sprite library
- `tools/make_fixture.py`: generate a real `.arena/` run with stand-in agents, no tokens spent
- `tools/export_match.py`: export one match as viewer events
