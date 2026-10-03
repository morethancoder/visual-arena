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
$('duelReplay').onclick = () => { duel.paused = false; duelPlay.textContent = 'Pause'; duel.run(); };

player.variant = store.get('view', 'oval');
player.names = store.get('names', false);
seg('mapSeg', [['oval', 'Top-down'], ['pano', 'Side']], player.variant, v => { player.variant = v; store.set('view', v); player.seek(player.evClock); });
seg('namesSeg', [[false, 'Off'], [true, 'On']], player.names, v => { player.names = v; store.set('names', v); });
seg('speedSeg', [[1, '1x'], [2, '2x'], [4, '4x'], [8, '8x']], 1, v => { player.speed = v; });
seg('duelSpeed', [[.5, '0.5x'], [1, '1x'], [2, '2x'], [4, '4x']], 1, v => { duel.speed = v; });
function setBuildSeg() {
  seg('buildSeg', BUILD_IDS.map(b => [b, BUILDS[b].name]), player.buildMode, v => {
    player.buildMode = v; store.set('model', v); player.seek(player.evClock).then(() => duel.m && openFight(duel.m, false));
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
  player.buildMode = store.get('model', api.config ? api.config.model : 'sonnet');
  setBuildSeg();
  $('runTitle').textContent = title || run.run;
  $('runTask').textContent = run.task;
  $('crumb').textContent = `${run.run} · ${run.n} agents`;
  player.paused = false; duel.paused = false; playBtn.textContent = 'Pause'; duelPlay.textContent = 'Pause';
  duelAuto = true;
  await player.load(run);
  openFight(pickFight(), false);
  src.follow(r => { if (source === src) player.extend(r); });
}
async function openDemo(live) {
  const full = window.DEMO_RUN || await getJSON('demo-run.json');
  return openRun(live ? new SimulatedLive(full) : new StaticSource(full), live ? 'Demo run, live' : 'Demo run');
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
  $('cost').innerHTML = `<b>${agents}</b> competitors · <b>${p.rounds}</b> rounds · <b>${p.calls + ($('baseline').value.trim() ? 1 : 0)}</b> sub-agent calls · <b>${p.waves}</b> waves of 10. Every call reads the task and one or two answers, so a bigger task costs more.`;
  $('cmd').textContent = lobbyCommand() + ($('baseline').value.trim() ? '\n\n(with the answer to beat pasted after it)' : '');
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
      body: JSON.stringify({ agents, task: $('task').value, seed: $('seed').value, baseline: $('baseline').value }),
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
