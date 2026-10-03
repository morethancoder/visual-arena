'use strict';
/* The Arena app: lobby, run screen, live polling, results.
   Data comes from viewer.py (/api/...). Without a server, the demo run and run files still work. */

// ================================================================ tooltip (used by the game screens)
const tip = document.getElementById('tip');
function showTip(e, html) {
  tip.innerHTML = html; tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.max(8, Math.min(e.clientX - w / 2, document.documentElement.clientWidth - w - 8)) + 'px';
  tip.style.top = Math.max(8, e.clientY - h - 16) + 'px';
}
function hideTip() { tip.hidden = true; }

// ================================================================ small helpers
const $ = id => document.getElementById(id);
function seg(id, items, current, onPick) {
  const el = $(id);
  el.innerHTML = '';
  for (const [val, label] of items) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-pressed', String(val === current));
    b.onclick = () => { el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); onPick(val); };
    el.append(b);
  }
}
const store = {
  get(k, d) { try { const v = localStorage.getItem('arena.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('arena.' + k, JSON.stringify(v)); } catch { /* private window */ } },
};
/** Rounds, matches, sub-agent calls and waves, the same arithmetic as `bracket.py plan`. */
function plan(n, wave = 10) {
  let alive = n, rounds = 0, calls = n, waves = Math.ceil(n / wave);
  while (alive > 1) { const m = Math.floor(alive / 2); rounds++; calls += 5 * m; waves += 2 * Math.ceil(2 * m / wave) + Math.ceil(m / wave); alive = m + (alive % 2); }
  return { rounds, calls, waves };
}
function ago(created) {
  if (!created) return '';
  const t = Date.parse(created.replace(' ', 'T'));
  if (isNaN(t)) return created;
  const s = (Date.now() - t) / 1000;
  return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : new Date(t).toLocaleDateString();
}

// ================================================================ data sources
const api = { ok: false, config: null };
async function getJSON(url, opts) { const r = await fetch(url, Object.assign({ cache: 'no-store' }, opts)); if (!r.ok) throw new Error(r.status + ' ' + url); return r.json(); }

/** Follows one run on the server, merging each change into the player. */
class ServerSource {
  constructor(id) { this.id = id; this.etag = null; this.stopped = false; }
  async first() {
    const r = await fetch('api/run?id=' + encodeURIComponent(this.id), { cache: 'no-store' });
    if (!r.ok) throw new Error('This run is not in the watched folder.');
    this.etag = r.headers.get('ETag');
    return r.json();
  }
  follow(onRun) {
    const loop = async () => {
      while (!this.stopped) {
        await new Promise(res => setTimeout(res, 1500));
        if (this.stopped) return;
        try {
          const r = await fetch('api/run?id=' + encodeURIComponent(this.id), { cache: 'no-store', headers: this.etag ? { 'If-None-Match': this.etag } : {} });
          if (r.status === 200) { this.etag = r.headers.get('ETag'); const run = await r.json(); onRun(run); if (run.done) return; }
          setConn(true);
        } catch { setConn(false); }
      }
    };
    loop();
  }
  stop() { this.stopped = true; }
}
/** Replays a complete run as if it were happening now: files are revealed at 20x their real pace. */
class SimulatedLive {
  constructor(full) { this.full = full; this.stopped = false; this.t = 0; }
  /** The run as viewer.py would export it at time t: only files written by then, only rounds opened by then. */
  cut(t) {
    const run = JSON.parse(JSON.stringify(this.full));
    run.events = run.events.filter(e => e[0] <= t);
    run.done = run.events.length === this.full.events.length;
    const judged = new Set(run.events.filter(e => e[1] === 'judge').map(e => e[2]));
    const spawned = run.events.filter(e => e[1] === 'spawn').length === run.n;
    run.rounds = run.rounds.filter((rd, i) => i === 0 ? spawned || run.events.some(e => e[1] !== 'spawn') : run.rounds[i - 1].matches.every(m => judged.has(m.id)));
    for (const rd of run.rounds) for (const m of rd.matches) if (!judged.has(m.id)) Object.assign(m, { winner: null, loser: null, reason: null, totals: {}, survived: [], standing: {}, fatal: {} });
    if (!run.done) { run.champion = null; run.champion_solution = null; run.final = null; }
    return run;
  }
  async first() { this.t = this.full.events.length ? this.full.events[Math.min(this.full.events.length - 1, Math.floor(this.full.n * .9))][0] : 0; return this.cut(this.t); }
  follow(onRun) {
    const loop = async () => {
      while (!this.stopped) {
        await new Promise(res => setTimeout(res, 1000));
        if (this.stopped) return;
        this.t += 20;
        const run = this.cut(this.t);
        onRun(run);
        if (run.done) return;
      }
    };
    loop();
  }
  stop() { this.stopped = true; }
}
/** A finished run file: nothing to follow. */
class StaticSource {
  constructor(run) { this.run = run; }
  async first() { return this.run; }
  follow() {}
  stop() {}
}

// ================================================================ the game screens
const player = new RunPlayer($('arena'), $('arenaOverlay'), $('arenaStatus'), $('feed'));
const duel = new Duel($('duel'), $('duelOverlay'), $('duelStatus'), player);
player.paused = true; duel.paused = true;
player.onRoundOpen = () => { if (duelAuto && player.live && (!duel.m || duel.finished)) openFight(pickFight(), false); };
duel.onDone = () => {
  duel.finished = true; if (duelAuto && player.live) setTimeout(() => { if (duelAuto && player.live) openFight(pickFight(), false); }, 3500); };

function lookOf(id) {
  const f = player.fighter(id), run = player.run;
  return { build: f ? f.build : player.buildMode, color: COLOURS[run.agents[id].card[0]], card: run.agents[id] };
}
let duelAuto = true;
function openFight(m, scroll = true) {
  if (scroll) duelAuto = false;
  if (!m) {
    duel.m = null; duel.clear();
    $('duelId').textContent = '';
    $('duelStatus').textContent = 'No fights yet: the competitors are still writing their first solutions. The first fight opens here when round 1 starts.';
    return;
  }
  duel.load(m, lookOf(m.a), lookOf(m.b));
  if (scroll) $('duelBench').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function interestingMatch(matches) {
  const score = m => {
    const st = Object.values(m.def).flat().map(d => d.stance);
    return (st.includes('REBUT') ? 2 : 0) + (st.includes('CONCEDE') ? 2 : 0) + ((m.standing[m.loser] || []).length ? 2 : 0)
      + ((m.survived || []).length ? 1 : 0) + (Object.values(m.atk).flat().some(a => a.tier === 'FATAL') ? 1 : 0) - Math.abs(st.length - 5) * .3;
  };
  return matches.slice().sort((a, b) => score(b) - score(a))[0];
}
/** Live: a fight still going in the open round. Finished: the last fight of the tournament. */
function pickFight() {
  const run = player.run;
  if (!run || !run.rounds.length) return null;
  if (!run.done && !player.openRound) return null;
  if (!run.done && player.openRound) {
    const rd = run.rounds[player.openRound - 1];
    const going = rd.matches.filter(m => !player.has('judge:' + m.id));
    if (going.length) return interestingMatch(going);
    return interestingMatch(rd.matches);
  }
  const last = run.rounds[run.rounds.length - 1];
  return last.matches[0] || interestingMatch(run.rounds[0].matches);
}

// controls
const scrub = $('scrub'), clockEl = $('clock'), liveChip = $('liveChip'), toEnd = $('toEnd'), playBtn = $('playBtn');
let dragging = false;
player.onClock = () => {
  scrub.max = Math.round(player.liveHead);
  if (!dragging) scrub.value = Math.round(player.evClock);
  clockEl.textContent = clock(player.realTime()) + ' into the run';
  const kind = player.live ? (player.atLive ? 'live' : 'behind') : 'replay';
  liveChip.className = 'chip-live ' + kind;
  liveChip.textContent = kind === 'live' ? 'LIVE' : kind === 'behind' ? 'BEHIND LIVE' : 'REPLAY';
  toEnd.textContent = player.live ? 'Go live' : 'Skip to the end';
  if (player.run && player.run.done && player.champion) showResults();
};
scrub.addEventListener('pointerdown', () => { dragging = true; });
scrub.addEventListener('input', () => { dragging = true; });
scrub.addEventListener('change', () => { dragging = false; player.seek(+scrub.value); });
toEnd.onclick = () => player.goLive();
$('restart').onclick = () => player.seek(0);
playBtn.onclick = () => { player.paused = !player.paused; playBtn.textContent = player.paused ? 'Play' : 'Pause'; };
const duelPlay = $('duelPlay');
duelPlay.onclick = () => { duel.paused = !duel.paused; duelPlay.textContent = duel.paused ? 'Play' : 'Pause'; };
$('duelReplay').onclick = () => { duel.paused = false; duelPlay.textContent = 'Pause'; duel.run(true); };

player.variant = store.get('view', 'oval');
player.names = store.get('names', false);
seg('mapSeg', [['oval', 'Top-down'], ['pano', 'Side']], player.variant, v => { player.variant = v; store.set('view', v); player.seek(player.evClock); });
seg('namesSeg', [[false, 'Off'], [true, 'On']], player.names, v => { player.names = v; store.set('names', v); });
seg('speedSeg', [[1, '1x'], [2, '2x'], [4, '4x'], [8, '8x']], 1, v => { player.speed = v; });
seg('duelSpeed', [[.5, '0.5x'], [1, '1x'], [2, '2x'], [4, '4x']], 1, v => { duel.speed = v; });
function setBuildSeg() {
  seg('buildSeg', BUILD_IDS.map(b => [b, BUILDS[b].name]), player.buildMode, v => {
    player.buildMode = v; store.set('model', v); if (player.run) store.set('look:' + player.run.run, v);
    player.seek(player.evClock).then(() => duel.m && openFight(duel.m, false));
  });
}

// ================================================================ results
let resultsShownFor = null;
function showResults() {
  const run = player.run, champ = run.champion;
  if (!champ || resultsShownFor === run.run + champ) return;
  resultsShownFor = run.run + champ;
  const card = run.agents[champ], wins = run.rounds.flatMap(rd => rd.matches.filter(m => m.winner === champ));
  const fin = run.final;
  $('resultsSummary').textContent = `Result: ${champ} is champion after ${run.rounds.length} rounds`;
  $('resultsBody').innerHTML = `
    <div class="champ"><i class="sw" style="background:${COLOURS[card.card[0]]}"></i><b>${esc(champ)}</b>
      <span class="note">${esc(card.names.join(' · '))}</span></div>
    <h3>The path</h3>
    <ul>${wins.map(m => `<li>Round ${m.round}: beat ${esc(m.loser)}, ${m.totals[m.winner]} to ${m.totals[m.loser]}${(m.survived || []).length ? `, survived ${m.survived.map(esc).join('; ')}` : ''}</li>`).join('')}</ul>
    ${fin ? `<h3>Against the answer you rejected</h3><div class="final ${fin.better === 'champion' ? '' : 'lost'}">${fin.better === 'champion' ? 'The champion' : '<b>The old answer</b>'} scored higher, ${fin.champion_total} to ${fin.baseline_total}. ${esc(fin.reason || '')}</div>` : ''}
    <h3>The winning answer</h3>
    ${run.champion_solution ? `<pre>${esc(run.champion_solution)}</pre><div class="actions"><button type="button" id="copyAnswer">Copy the answer</button></div>` : '<p class="note">Open this run through viewer.py to read the winning answer.</p>'}`;
  $('results').hidden = false;
  const cp = $('copyAnswer');
  if (cp) cp.onclick = () => copyText(run.champion_solution, cp);
}
function copyText(text, btn) {
  const done = ok => { const t = btn.textContent; btn.textContent = ok ? 'Copied' : 'Select and copy it'; setTimeout(() => { btn.textContent = t; }, 1500); };
  try { navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); } catch { done(false); }
}

// ================================================================ opening a run
let source = null;
async function openRun(src, title) {
  if (source) source.stop();
  source = src;
  show('arenaScreen');
  $('results').hidden = true; resultsShownFor = null;
  $('arenaStatus').textContent = 'Loading the run…';
  let run;
  try { run = await src.first(); } catch (e) { $('arenaStatus').textContent = e.message; return; }
  if (source !== src) return;
  player.buildMode = store.get('look:' + run.run, null) || store.get('model', api.config ? api.config.model : 'sonnet');
  lookChosen = !!store.get('look:' + run.run, null);
  setBuildSeg();
  run.stopped = false;
  resetRunPanels();
  $('runTitle').textContent = title || run.run;
  $('runTask').textContent = run.task;
  $('crumb').textContent = `${run.run} · ${run.n} agents`;
  player.paused = false; duel.paused = false; playBtn.textContent = 'Pause'; duelPlay.textContent = 'Pause';
  duelAuto = true;
  await player.load(run);
  openFight(pickFight(), false);
  src.follow(r => { if (source === src) player.extend(r); });
  if (src instanceof ServerSource) followUsage(run.run, src);
}
async function openDemo(live) {
  const full = window.DEMO_RUN || await getJSON('demo-run.json');
  return openRun(live ? new SimulatedLive(full) : new StaticSource(full), window.DEMO_TITLE || (live ? 'Demo run, live' : 'Demo run'));
}

// ================================================================ lobby
let agents = store.get('agents', 16);
function lobbyCommand() {
  const skill = $('plugin').checked ? 'arena-skill:arena' : (api.config ? api.config.skill : 'arena');
  const seed = $('seed').value.trim();
  const task = $('task').value.trim() || '<your task>';
  return `/${skill} --agents ${agents}${seed ? ' --seed ' + seed : ''} ${task}`;
}
function refreshLobby() {
  const p = plan(agents);
  renderModels();
  $('cost').innerHTML = `<b>${agents}</b> competitors · <b>${p.rounds}</b> rounds · <b>${p.calls + ($('baseline').value.trim() ? 1 : 0)}</b> sub-agent calls · <b>${p.waves}</b> waves of 10. Every call reads the task and one or two answers, so a bigger task costs more.`;
  const mm = modelInfo(launchModel);
  $('cmd').textContent = (api.ok && api.config.launch ? '' : `First switch Claude Code to ${mm.name}: /model ${mm.id}\nThen: `) + lobbyCommand() + ($('baseline').value.trim() ? '\n\n(with the answer to beat pasted after it)' : '');
}
// ---------------------------------------------------------------- the model every agent runs on
const DEFAULT_MODELS = [
  { build: 'fable', id: 'claude-fable-5-1', name: 'Claude Fable 5.1', in: 10, out: 50, read: .25 },
  { build: 'opus', id: 'claude-opus-5-5', name: 'Claude Opus 5.5', in: 4, out: 20, read: .2 },
  { build: 'sonnet', id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', in: 2, out: 10, read: .2 },
  { build: 'haiku', id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', in: 1, out: 5, read: .1 },
];
const modelList = () => (api.config && api.config.models) || DEFAULT_MODELS;
const modelInfo = id => modelList().find(m => m.id === id) || modelList()[2];
let launchModel = store.get('launchModel', 'claude-sonnet-5-5');
function renderModels() {
  const box = $('models');
  if (box.dataset.n === String(modelList().length) && box.dataset.sel === launchModel) return;
  box.dataset.n = modelList().length; box.dataset.sel = launchModel;
  box.innerHTML = '';
  for (const m of modelList()) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'model';
    b.setAttribute('aria-pressed', String(m.id === launchModel));
    b.innerHTML = `<canvas width="72" height="56" aria-hidden="true"></canvas><b>${esc(m.name.replace('Claude ', ''))}</b><span>$${m.in} in · $${m.out} out</span>`;
    const g = b.querySelector('canvas').getContext('2d');
    paintFighter(g, { build: m.build, color: COLOURS['first-principles'], dir: 1, weapon: 'sword' }, 36 / 4, 13, 4, 'idle', 0);
    b.onclick = () => { launchModel = m.id; store.set('launchModel', m.id); refreshLobby(); };
    box.append(b);
  }
}
seg('agentsSeg', [[8, '8'], [16, '16'], [32, '32'], [64, '64'], [100, '100']], agents, v => { agents = v; $('agentsCustom').value = ''; store.set('agents', v); refreshLobby(); });
$('agentsCustom').addEventListener('input', e => {
  const v = parseInt(e.target.value, 10);
  if (v >= 2 && v <= 2160) { agents = v; $('agentsSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', 'false')); refreshLobby(); }
});
for (const id of ['task', 'seed', 'baseline', 'plugin']) $(id).addEventListener('input', refreshLobby);
$('task').value = store.get('draft', '');
$('task').addEventListener('input', () => store.set('draft', $('task').value));
$('copyCmd').onclick = () => {
  let text = lobbyCommand();
  if ($('baseline').value.trim()) text += '\n\nThe answer I rejected, which the arena has to beat:\n\n' + $('baseline').value.trim();
  copyText(text, $('copyCmd'));
  if (api.ok) waitForNewRun('Paste it into Claude Code in ' + api.config.root + '. This page opens the run as soon as it starts.');
};
$('newRun').addEventListener('submit', async e => {
  e.preventDefault();
  if (!$('task').value.trim()) { $('task').focus(); return; }
  if (!api.ok || !api.config.launch) return;
  $('startBtn').disabled = true;
  try {
    const r = await fetch('api/launch', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Arena-Token': api.config.token },
      body: JSON.stringify({ agents, task: $('task').value, seed: $('seed').value, baseline: $('baseline').value, model: launchModel }),
    });
    const res = await r.json();
    if (!r.ok) throw new Error(res.error || 'could not start');
    waitForNewRun('Claude Code is starting the arena. This page opens the run as soon as it appears.', true);
  } catch (err) {
    $('launchNote').textContent = err.message;
  } finally { $('startBtn').disabled = false; }
});
let waitTimer = null;
function waitForNewRun(text, showLog) {
  const since = Date.now() / 1000 - 5;
  $('launchNote').textContent = text;
  clearInterval(waitTimer);
  waitTimer = setInterval(async () => {
    try {
      const runs = await getJSON('api/runs');
      if (showLog) { const l = await getJSON('api/launch-log'); $('launchLog').hidden = !l.log; $('launchLog').textContent = l.log; $('launchLog').scrollTop = 1e9; }
      const fresh = runs.find(r => r.mtime >= since && !r.champion);
      if (fresh && !location.hash.startsWith('#/run/') && !$('lobby').hidden) { clearInterval(waitTimer); location.hash = '#/run/' + encodeURIComponent(fresh.id); }
    } catch { /* keep waiting */ }
  }, 2000);
}
async function refreshRuns() {
  const ol = $('runs');
  if (!api.ok) {
    $('runsNote').innerHTML = 'Not connected to <code>viewer.py</code>, so there are no runs to list. Start it in the project where you run <code>/arena</code>: <code>python3 viewer.py</code>. You can still watch the demo or open a run file.';
    ol.innerHTML = '';
    return;
  }
  let runs = [];
  try { runs = await getJSON('api/runs'); } catch { /* server went away */ }
  $('runsNote').textContent = runs.length ? `In ${api.config.root}/.arena` : `No runs yet in ${api.config.root}/.arena. Start one on the left.`;
  ol.innerHTML = '';
  for (const r of runs) {
    const li = document.createElement('li'); li.tabIndex = 0;
    const state = r.champion ? 'done' : 'live';
    li.innerHTML = `<span class="rid">${esc(r.id)} · ${r.n} agents · ${esc(ago(r.created))}</span>
      <span class="rstate ${state}">${r.champion ? 'Champion ' + esc(r.champion) : `Live · round ${Math.min(r.rounds_played + 1, r.rounds_total)} of ${r.rounds_total}`}</span>
      <span class="rtask">${esc(r.task.split('\n')[0])}</span>`;
    const go = () => { location.hash = '#/run/' + encodeURIComponent(r.id); };
    li.onclick = go; li.onkeydown = e => { if (e.key === 'Enter') go(); };
    ol.append(li);
  }
}
$('demoBtn').onclick = () => { location.hash = '#/demo'; };
let fileRun = null;
$('fileIn').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try { fileRun = JSON.parse(await f.text()); if (!fileRun.events || !fileRun.agents) throw new Error(); location.hash = '#/file'; }
  catch { $('runsNote').textContent = 'That file is not a run export. Make one with: python3 viewer.py --export .arena/<run> > run.json'; }
});

// ================================================================ routing
function show(id) {
  for (const s of ['lobby', 'arenaScreen']) $(s).hidden = s !== id;
  if (id !== 'arenaScreen') { player.paused = true; duel.paused = true; }
}
function setConn(on) {
  const c = $('conn');
  c.className = 'conn ' + (on ? 'on' : 'off');
  c.textContent = on ? 'viewer.py · ' + (api.config ? api.config.root : '') : 'offline';
}
let runsTimer = null;
async function route() {
  clearInterval(runsTimer);
  const h = decodeURIComponent(location.hash || '#/');
  if (h.startsWith('#/run/')) return openRun(new ServerSource(h.slice(6)));
  if (h === '#/demo') return openDemo(false);
  if (h === '#/demo-live') return openDemo(true);
  if (h === '#/file' && fileRun) return openRun(new StaticSource(fileRun), fileRun.run);
  if (window.AUTO_OPEN && !location.hash) return openDemo(false);
  if (source) { source.stop(); source = null; }
  show('lobby');
  $('crumb').textContent = 'Lobby';
  const canLaunch = api.ok && api.config.launch && api.config.claude;
  $('startBtn').hidden = !canLaunch;
  $('launchNote').textContent = canLaunch ? '' : api.ok
    ? (api.config.launch ? '`claude` is not on PATH here, so copy the command into Claude Code instead.' : 'Copy the command into Claude Code in this folder. To start runs from here, run viewer.py with --allow-launch.')
    : 'Copy the command into Claude Code.';
  refreshLobby();
  refreshRuns();
  if (api.ok) runsTimer = setInterval(refreshRuns, 4000);
}

(async function boot() {
  try { api.config = await getJSON('api/config'); api.ok = true; } catch { api.ok = false; }
  setConn(api.ok);
  if (!api.ok) $('demoBtn').insertAdjacentHTML('afterend', '<button type="button" id="demoLive">Watch it as live</button>');
  else $('demoBtn').insertAdjacentHTML('afterend', '<button type="button" id="demoLive">Demo as live</button>');
  $('demoLive').onclick = () => { location.hash = '#/demo-live'; };
  window.addEventListener('hashchange', route);
  route();
})();

// ================================================================ tokens, cost, stop, and the Claude Code log
const fmtTok = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k' : String(n);
let lookChosen = false, usageTimer = null, claudeTimer = null, claudeKey = '', claudeShown = 0;
function resetRunPanels() {
  clearInterval(usageTimer); clearInterval(claudeTimer);
  $('usage').hidden = true; $('stopBtn').hidden = true;
  logClear($('claudeLog')); claudeKey = ''; claudeShown = 0;
  $('claudeLog').dataset.empty = api.ok ? 'Waiting for Claude Code\'s session transcript…' : 'The Claude Code log needs viewer.py: it reads the session transcripts Claude Code writes on your machine.';
  renderClaudeEmpty();
}
function renderClaudeEmpty() {
  const ol = $('claudeLog');
  if (!ol.children.length) logRow(ol, `<span class="note">${esc(ol.dataset.empty || '')}</span>`, 'dim empty');
}
function renderUsage(u) {
  const box = $('usage');
  box.hidden = false;
  if (!u.found) {
    box.innerHTML = `<b>Tokens:</b> none counted yet. They're read from Claude Code's own session transcripts (in <code>~/.claude/projects</code>) once the run's session has written them.`;
    return;
  }
  const t = u.tokens, cw = t.cache_write_5m + t.cache_write_1h;
  const models = u.models.map(m => `${esc(m.name)} ($${m.price ? m.price.in : '?'} in / $${m.price ? m.price.out : '?'} out per M)`).join(', ');
  box.innerHTML = `<span class="cost-big">$${u.cost.toFixed(2)}</span> at API prices
    <span class="tok">input <b>${fmtTok(t.input)}</b> · output <b>${fmtTok(t.output)}</b> · cache read <b>${fmtTok(t.cache_read)}</b> · cache write <b>${fmtTok(cw)}</b></span>
    <span class="note">${models}${u.agents ? ` · ${u.agents} sub-agent transcripts` : ''}. What these tokens would cost on the Anthropic API; on a Claude plan you aren't billed per token.</span>`;
}
async function pollUsage(id) {
  try {
    const u = await getJSON('api/usage?id=' + encodeURIComponent(id));
    if (!player.run || player.run.run !== id) return;
    renderUsage(u);
    $('stopBtn').hidden = !u.stoppable;
    if (u.stopped && !player.run.stopped) { player.run.stopped = true; player.status('This contest was stopped.'); }
    if (u.build && !lookChosen && u.build !== player.buildMode) {
      lookChosen = true; player.buildMode = u.build; setBuildSeg();
      player.seek(player.evClock).then(() => duel.m && openFight(duel.m, false));
    }
    if (player.run.done || u.stopped) clearInterval(usageTimer);
  } catch { /* the server may be busy; try again */ }
}
function renderClaude(entries) {
  const ol = $('claudeLog');
  const key = entries.length ? entries[0].t + entries[0].text : '';
  if (key !== claudeKey) { logClear(ol); claudeKey = key; claudeShown = 0; }
  const tagFor = e => e.kind === 'say' ? tag('SAY', 'CLAUDE') : e.kind === 'user' ? tag('USER', 'YOU')
    : e.kind === 'tool' ? tag('TOOL', esc(e.tool || 'TOOL').toUpperCase()) : tag(e.error ? 'ERR' : 'RES', e.error ? 'ERROR' : 'RESULT');
  for (const e of entries.slice(claudeShown)) {
    const t = e.t ? new Date(e.t).toLocaleTimeString([], { hour12: false }) : '';
    logRow(ol, `<time>${t}</time>${tagFor(e)}${esc(e.text)}`, e.kind === 'result' ? 'dim' : e.kind === 'say' ? 'sys' : '');
  }
  claudeShown = entries.length;
  if (!entries.length) renderClaudeEmpty();
}
async function pollClaude(id) {
  try {
    const r = await getJSON('api/claude?id=' + encodeURIComponent(id));
    if (!player.run || player.run.run !== id) return;
    if (r.found) renderClaude(r.entries);
    else { $('claudeLog').dataset.empty = 'No Claude Code session for this run found yet. The log appears once its transcript exists in ~/.claude/projects.'; }
    if (player.run.done || player.run.stopped) clearInterval(claudeTimer);
  } catch { /* try again */ }
}
function followUsage(id) {
  pollUsage(id); pollClaude(id);
  usageTimer = setInterval(() => pollUsage(id), 4000);
  claudeTimer = setInterval(() => pollClaude(id), 2500);
}
let stopArmed = 0;
$('stopBtn').onclick = async () => {
  const b = $('stopBtn');
  if (Date.now() - stopArmed > 4000) { stopArmed = Date.now(); b.textContent = 'Click again to stop it'; setTimeout(() => { b.textContent = 'Stop the contest'; }, 4000); return; }
  b.disabled = true;
  try {
    const r = await fetch('api/stop', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Arena-Token': api.config.token }, body: '{}' });
    const res = await r.json();
    if (!r.ok) throw new Error(res.error);
    player.run.stopped = true; b.hidden = true;
    player.status('Contest stopped. Claude Code and its sub-agents were ended; the files written so far stay in .arena/.');
  } catch (e) { player.status(e.message); }
  b.disabled = false; b.textContent = 'Stop the contest';
};
// feed tabs
for (const t of document.querySelectorAll('.tabs [data-tab]')) t.onclick = () => {
  for (const o of document.querySelectorAll('.tabs [data-tab]')) { o.setAttribute('aria-selected', String(o === t)); $(o.dataset.tab).closest('.logbox').hidden = o !== t; }
};
setupLog($('feed')); setupLog($('claudeLog'));
$('claudeLog').closest('.logbox').hidden = true; $('claudeLog').hidden = false;
setupLog(document.querySelector('#fcA .log')); setupLog(document.querySelector('#fcB .log'));

// ================================================================ full screen
/** Size each game canvas to fill its stage when the stage is full screen (letterboxed). */
function fitStages() {
  for (const [stageId, canvasId] of [['arenaStage', 'arena'], ['duelStage', 'duel']]) {
    const st = $(stageId), cv = $(canvasId);
    const full = document.fullscreenElement === st || st.classList.contains('immersive');
    st.classList.toggle('full', full);
    if (full) {
      const k = Math.min(st.clientWidth / cv.width, st.clientHeight / cv.height);
      cv.style.width = Math.floor(cv.width * k) + 'px'; cv.style.height = Math.floor(cv.height * k) + 'px';
    } else { cv.style.width = ''; cv.style.height = ''; }
  }
}
function toggleFullscreen(id) {
  const el = $(id);
  if (document.fullscreenElement) { document.exitFullscreen(); return; }
  if (el.requestFullscreen) el.requestFullscreen().catch(() => { el.classList.toggle('immersive'); fitStages(); });
  else { el.classList.toggle('immersive'); fitStages(); }
}
for (const b of document.querySelectorAll('.fsbtn')) b.onclick = () => toggleFullscreen(b.dataset.fs);
document.addEventListener('fullscreenchange', () => requestAnimationFrame(fitStages));
window.addEventListener('resize', fitStages);
document.addEventListener('keydown', e => { if (e.key === 'Escape') for (const id of ['arenaStage', 'duelStage']) if ($(id).classList.contains('immersive') && !$(id).closest('#game')) { $(id).classList.remove('immersive'); fitStages(); } });
