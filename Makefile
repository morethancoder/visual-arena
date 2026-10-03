# The Arena. Run `make` to see every command.
#
# Settings you can override on the command line, e.g. `make serve ROOT=~/my-project PORT=9000`:
PY      ?= python3
ROOT    ?= .
PORT    ?= 8765
MODEL   ?= sonnet
SKILL   ?= arena
AGENTS  ?= 16
SEED    ?= 7
PACE    ?= 1.5
DEV     ?= .dev
RUN     ?=
VERSION ?=

SKILL_DIR ?= $(HOME)/.claude/skills/arena

.DEFAULT_GOAL := help
.PHONY: help dev serve launch demo-run fixture export build lab check install-skill release clean

help: ## Show this list
	@echo "The Arena: a game viewer for the /arena Claude Code skill"
	@echo
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  make %-14s %s\n", $$1, $$2}'
	@echo
	@echo "Settings: ROOT=$(ROOT) PORT=$(PORT) MODEL=$(MODEL) AGENTS=$(AGENTS) SEED=$(SEED) PACE=$(PACE)"

dev: ## Watch a fake run being written live (no tokens): edit app/ and refresh the page
	@rm -rf $(DEV)/live && mkdir -p $(DEV)/live
	@echo "Writing a $(AGENTS)-agent run in real time into $(DEV)/live (one wave every $(PACE)s)"
	@trap 'kill $$FIX 2>/dev/null' EXIT INT TERM; \
	$(PY) tools/make_fixture.py --agents $(AGENTS) --seed $(SEED) --live $(PACE) --out $(DEV)/live > $(DEV)/fixture.log 2>&1 & FIX=$$!; \
	$(PY) viewer.py --root $(DEV)/live --port $(PORT) --model $(MODEL)

serve: ## Watch the runs in ROOT/.arena (the project where you run /arena)
	$(PY) viewer.py --root $(ROOT) --port $(PORT) --model $(MODEL) --skill $(SKILL)

launch: ## Like serve, and let the lobby start runs with `claude -p` (spends tokens)
	$(PY) viewer.py --root $(ROOT) --port $(PORT) --model $(MODEL) --skill $(SKILL) --allow-launch

demo-run: ## Serve a finished fake run to replay (no tokens)
	@rm -rf $(DEV)/finished && mkdir -p $(DEV)/finished
	@$(PY) tools/make_fixture.py --agents $(AGENTS) --seed $(SEED) --out $(DEV)/finished
	$(PY) viewer.py --root $(DEV)/finished --port $(PORT) --model $(MODEL)

fixture: ## Generate a finished fake run into DEV/fixture (AGENTS, SEED)
	@mkdir -p $(DEV)/fixture
	$(PY) tools/make_fixture.py --agents $(AGENTS) --seed $(SEED) --out $(DEV)/fixture

export: ## Print a run's event log as JSON: make export RUN=.arena/run-... > run.json
	@test -n "$(RUN)" || { echo "Set RUN to a run folder, e.g. make export RUN=.arena/run-20261003-120000-s7" >&2; exit 2; }
	@$(PY) viewer.py --export $(RUN)

build: ## Build dist/the-arena.html, one page with the demo run built in
	$(PY) tools/bundle_app.py

lab: ## Rebuild the asset lab (design/asset-lab.html)
	$(PY) tools/bundle_lab.py

check: ## Compile the Python, play a fake tournament, export it, and parse the app's scripts
	$(PY) -m py_compile viewer.py tools/*.py
	@rm -rf $(DEV)/check && mkdir -p $(DEV)/check
	@$(PY) tools/make_fixture.py --agents 8 --seed 1 --out $(DEV)/check > /dev/null
	@$(PY) viewer.py --export "$$(ls -d $(DEV)/check/.arena/run-*)" > $(DEV)/check/run.json
	@$(PY) -c "import json,sys; d=json.load(open(sys.argv[1])); assert d['done'] and d['champion']; print('export ok: champion', d['champion'])" $(DEV)/check/run.json
	@if command -v node > /dev/null; then \
	  node -e "const fs=require('fs');const src=['sprites','engine','player','duel','main'].map(f=>fs.readFileSync('app/'+f+'.js','utf8')).join('\n');new Function(src);console.log('app scripts parse')"; \
	else echo "node not found: skipped the script parse check"; fi

install-skill: ## Copy the vendored /arena skill to ~/.claude/skills/arena (SKILL_DIR to change)
	@if [ -e "$(SKILL_DIR)" ]; then echo "$(SKILL_DIR) already exists; remove it first to reinstall" >&2; exit 1; fi
	@mkdir -p "$(SKILL_DIR)"
	cp third_party/arena-skill/SKILL.md third_party/arena-skill/bracket.py third_party/arena-skill/rubric.md third_party/arena-skill/strategies.json third_party/arena-skill/LICENSE "$(SKILL_DIR)/"
	@echo "Installed. In Claude Code, /arena is now available."

release: ## Tag and push a release: make release VERSION=v0.2.0 (add docs/releases/VERSION.md first)
	@test -n "$(VERSION)" || { echo "Set VERSION, e.g. make release VERSION=v0.2.0" >&2; exit 2; }
	@test -f docs/releases/$(VERSION).md || echo "Note: docs/releases/$(VERSION).md not found, the release will have no notes"
	git tag -a $(VERSION) -m "The Arena $(VERSION)"
	git push origin $(VERSION)
	@echo "GitHub Actions now builds and publishes the release."

clean: ## Remove generated runs and builds
	rm -rf $(DEV) dist fixtures
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
