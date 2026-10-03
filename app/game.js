'use strict';
/* Game mode: The Arena as a game, full screen.
   The throne scene is the lobby: the emperor's box over the sand, one fighter on the sand per
   competitor (they walk in and out as the count changes), the decree to write the task on, and
   the model banners. Sealing the decree starts the contest; the arena and the fight then play
   full screen inside the game. Leaving full screen returns to the normal page. */

class ThroneScene extends Engine {
  constructor(canvas) {
    super(canvas, 320, 180, 4);
    this.bg = panoramaBackground(320, 180, { floor: 98, tierH: 24, tiers: 3, top: 14, archW: 16, gateX: [34, 286] });
    this.king = { x: 160, y: 86, arm: false };
    this.build = 'sonnet'; this.target = 16; this.made = 0; this.paused = true;
  }
  background() { return this.bg.frames[Math.floor(this.time / 450) % 2]; }
  spot() { return { x: rand(20, 300), y: rand(110, 172) }; }
  gate(x) { return x < 160 ? { x: 34, y: 104 } : { x: 286, y: 104 }; }
  /** Walk fighters in or out until the sand holds as many as the decree asks for (drawn up to 100). */
  sync() {
    const want = Math.min(100, this.target);
    const here = this.fighters.filter(f => !f.leaving);
    for (let i = here.length; i < want; i++) {
      const k = this.made++, g = k % 2 ? { x: 286, y: 104 } : { x: 34, y: 104 };
      const f = { id: 'n' + k, build: this.build, color: CLIST[k % CLIST.length], x: g.x, y: g.y + rand(-2, 2), dir: k % 2 ? -1 : 1,
        anim: 'walk', animT: rand(0, 500), alive: true, busy: true, weapon: STARTERS[k % 4], idleUntil: 0 };
      this.fighters.push(f);
      const p = this.spot();
      this.wait(Math.max(0, i - here.length) * 60).then(() => this.moveTo(f, p.x, p.y, rand(40, 60), 'walk').then(() => { f.busy = false; }));
    }
    for (let i = here.length - 1; i >= want; i--) {
      const f = here[i], g = this.gate(f.x);
      f.leaving = true; f.busy = true;
      this.burst(f.x, f.y - 6, C.dust, 4, 20, 300);
      this.moveTo(f, g.x, g.y, 70, 'walk').then(() => { const j = this.fighters.indexOf(f); if (j >= 0) this.fighters.splice(j, 1); });
    }
  }
  setBuild(b) { this.build = b; for (const f of this.fighters) f.build = b; }
  tick(dt) {
    for (const f of this.fighters) {
      if (f.busy || f.move || this.time < f.idleUntil) continue;
      if (Math.random() < .45) { this.setAnim(f, 'think', true); f.idleUntil = this.time + rand(1200, 3000); }
      else {
        const p = { x: Math.max(16, Math.min(304, f.x + rand(-30, 30))), y: Math.max(108, Math.min(174, f.y + rand(-14, 14))) };
        this.moveTo(f, p.x, p.y, rand(14, 22), 'walk'); f.idleUntil = this.time + rand(300, 900);
      }
    }
  }
  drawOver() {
    const R = (x, y, w, h, c) => this.R(x, y, w, h, c), k = this.king;
    paintHuman(R, k.x, k.y, { skin: SKIN[1], hair: HAIR[0], tunic: '#6a2c7a', sash: C.gold, arm: k.arm });
    R(k.x - 3, k.y - 19, 7, 2, C.gold); R(k.x - 3, k.y - 21, 1, 2, C.gold); R(k.x, k.y - 21, 1, 2, C.gold); R(k.x + 3, k.y - 21, 1, 2, C.gold);
    R(k.x, k.y - 19, 1, 1, C.red);
    if (k.arm) { R(k.x + 4, k.y - 22, 4, 6, C.white); R(k.x + 4, k.y - 22, 4, 1, C.goldD); R(k.x + 4, k.y - 17, 4, 1, C.goldD); R(k.x + 5, k.y - 20, 2, 2, C.red); }
  }
  async celebrate() {
    this.king.arm = true;
    for (const f of this.fighters) { f.busy = true; f.move = null; this.setAnim(f, 'victory', true); }
    for (let i = 0; i < 6; i++) this.wait(i * 250).then(() => this.burst(rand(40, 280), rand(40, 80), pickOf([C.gold, C.white, '#c2453d', '#5b7fbf', C.leaf]), 14, 50, 1200, 30));
    await this.wait(1800);
    for (const f of this.fighters) { const p = { x: 160 + rand(-60, 60), y: rand(120, 160) }; this.moveTo(f, p.x, p.y, 80, 'charge').then(() => this.setAnim(f, 'think', true)); }
    await this.wait(1200);
    this.king.arm = false;
    for (const f of this.fighters) f.busy = false;
  }
}

const game = (() => {
  const G = $('game'), throneCv = $('throne');
  const scene = new ThroneScene(throneCv);
  const homes = {};
  let on = false, waitTimer = null;

  function fitThrone() {
    if (!on) return;
    const k = Math.min(G.clientWidth / throneCv.width, G.clientHeight / throneCv.height);
    throneCv.style.width = Math.floor(throneCv.width * k) + 'px'; throneCv.style.height = Math.floor(throneCv.height * k) + 'px';
  }
  function park(id) { const el = $(id); if (!homes[id]) homes[id] = { parent: el.parentNode, next: el.nextSibling }; return el; }
  function unpark(id) {
    const h = homes[id], el = $(id); if (!h) return;
    h.parent.insertBefore(el, h.next); el.classList.remove('immersive'); el.hidden = false; delete homes[id];
  }

  // ---------------------------------------------------------------- the roster scroll
  function renderRoster() {
    $('gCount').textContent = agents;
    const p = plan(agents), m = modelInfo(launchModel);
    $('gCost').innerHTML = `${agents} fighters · ${p.rounds} rounds · ${p.calls} sub-agent calls.<br>${esc(m.name)}: $${m.in} per million tokens in, $${m.out} out.`;
    $('gPresets').innerHTML = '';
    for (const n of [8, 16, 32, 64, 100]) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = n; b.setAttribute('aria-pressed', String(n === agents));
      b.onclick = () => setCount(n); $('gPresets').append(b);
    }
    const box = $('gModels');
    box.innerHTML = '';
    for (const mm of modelList()) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'banner-btn'; b.setAttribute('aria-pressed', String(mm.id === launchModel));
      b.innerHTML = `<canvas width="64" height="52" aria-hidden="true"></canvas><b>${esc(mm.name.replace('Claude ', ''))}</b>`;
      paintFighter(b.querySelector('canvas').getContext('2d'), { build: mm.build, color: COLOURS['first-principles'], dir: 1, weapon: 'sword' }, 8, 12, 4, 'idle', 0);
      b.onclick = () => { launchModel = mm.id; store.set('launchModel', mm.id); scene.setBuild(mm.build); renderRoster(); };
      box.append(b);
    }
  }
  function setCount(n) {
    agents = Math.max(2, Math.min(2160, n)); store.set('agents', agents);
    scene.target = agents; scene.sync(); renderRoster();
  }
  async function renderPast() {
    const ol = $('gRuns'); ol.innerHTML = '';
    if (!api.ok) { ol.innerHTML = '<li class="none">Start viewer.py to see past games.</li>'; return; }
    let runs = [];
    try { runs = await getJSON('api/runs'); } catch { /* offline */ }
    if (!runs.length) ol.innerHTML = '<li class="none">No games yet.</li>';
    for (const r of runs.slice(0, 6)) {
      const li = document.createElement('li'); li.tabIndex = 0;
      li.textContent = `${r.champion ? 'Won by ' + r.champion : r.stopped ? 'Stopped' : 'Live'} · ${r.n} fighters · ${r.task.split('\n')[0]}`;
      li.onclick = () => watch('#/run/' + encodeURIComponent(r.id));
      ol.append(li);
    }
  }

  // ---------------------------------------------------------------- views
  function showThrone() {
    $('gThrone').hidden = false; $('gRun').hidden = true;
    for (const id of ['arenaStage', 'duelStage']) unpark(id);
    fitStages();
    scene.paused = false;
    $('gTask').value = $('task').value; $('gBaseline').value = $('baseline').value;
    $('decree').classList.remove('sealed'); $('gHerald').hidden = true; $('gNote').textContent = '';
    scene.setBuild(modelInfo(launchModel).build); scene.target = agents; scene.sync();
    renderRoster(); renderPast();
    requestAnimationFrame(fitThrone);
  }
  function showRun(which = 'arena') {
    scene.paused = true;
    $('gThrone').hidden = true; $('gRun').hidden = false;
    for (const id of ['arenaStage', 'duelStage']) { const el = park(id); $('gSlot').append(el); el.classList.add('immersive'); }
    $('arenaStage').hidden = which !== 'arena'; $('duelStage').hidden = which !== 'fight';
    $('gArena').setAttribute('aria-pressed', String(which === 'arena')); $('gFight').setAttribute('aria-pressed', String(which === 'fight'));
    requestAnimationFrame(fitStages);
  }
  function watch(hash) { location.hash = hash; showRun('arena'); }

  // ---------------------------------------------------------------- enter and leave
  function enter() {
    if (on) return;
    on = true; G.hidden = false; document.body.classList.add('in-game');
    if (G.requestFullscreen) G.requestFullscreen().catch(() => {});
    if (location.hash.startsWith('#/run/') || location.hash.startsWith('#/demo')) showRun('arena'); else showThrone();
    requestAnimationFrame(fitThrone);
  }
  function exit() {
    if (!on) return;
    on = false; clearInterval(waitTimer);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    for (const id of ['arenaStage', 'duelStage']) unpark(id);
    scene.paused = true; G.hidden = true; document.body.classList.remove('in-game');
    fitStages();
  }

  // ---------------------------------------------------------------- sealing the decree
  function herald(html) { const h = $('gHerald'); h.innerHTML = html; h.hidden = false; return h; }
  async function seal() {
    const task = $('gTask').value.trim();
    if (!task) { $('gNote').textContent = 'The decree is blank. Write the task first.'; $('gTask').focus(); return; }
    $('task').value = $('gTask').value; $('baseline').value = $('gBaseline').value; store.set('draft', $('gTask').value);
    $('decree').classList.add('sealed');
    herald('<p class="cry">Let the games begin!</p>');
    await scene.celebrate();
    const canLaunch = api.ok && api.config.launch && api.config.claude;
    if (canLaunch) {
      herald('<p class="cry small">The herald runs to Claude Code…</p>');
      try {
        const r = await fetch('api/launch', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Arena-Token': api.config.token },
          body: JSON.stringify({ agents, task, baseline: $('gBaseline').value, model: launchModel }),
        });
        const res = await r.json();
        if (!r.ok) throw new Error(res.error || 'could not start');
        waitForRun('<p class="cry small">The gates open as soon as Claude Code writes the first file…</p>');
      } catch (e) {
        herald(`<p class="cry small">The herald came back: ${esc(e.message)}</p><button type="button" class="seal" id="gRetry">Back to the decree</button>`);
        $('gRetry').onclick = showThrone;
      }
      return;
    }
    const mm = modelInfo(launchModel), cmd = lobbyCommand();
    const h = herald(`<p class="cry small">The herald needs your hand.</p>
      <p>In Claude Code${api.ok ? ' in <code>' + esc(api.config.root) + '</code>' : ''}, switch to ${esc(mm.name)} with <code>/model ${esc(mm.id)}</code>, then paste:</p>
      <pre>${esc(cmd)}</pre>
      <button type="button" class="seal" id="gCopy">Copy the command</button>
      ${api.ok ? '<p>The gates open as soon as the run starts.</p>' : '<p>Start <code>viewer.py</code> in that project to watch it here.</p>'}
      <button type="button" class="plain" id="gRetry">Back to the decree</button>`);
    $('gCopy').onclick = () => copyText(cmd + ($('gBaseline').value.trim() ? '\n\nThe answer I rejected, which the arena has to beat:\n\n' + $('gBaseline').value.trim() : ''), $('gCopy'));
    $('gRetry').onclick = () => { clearInterval(waitTimer); showThrone(); };
    if (api.ok) waitForRun(null);
    void h;
  }
  function waitForRun(msg) {
    if (msg) herald(msg);
    const since = Date.now() / 1000 - 5;
    clearInterval(waitTimer);
    waitTimer = setInterval(async () => {
      try {
        const runs = await getJSON('api/runs');
        const fresh = runs.find(r => r.mtime >= since && !r.champion);
        if (fresh && on) { clearInterval(waitTimer); watch('#/run/' + encodeURIComponent(fresh.id)); }
      } catch { /* keep waiting */ }
    }, 1500);
  }

  // ---------------------------------------------------------------- wiring
  $('enterGame').onclick = enter;
  $('enterGame2').onclick = e => { e.preventDefault(); enter(); };
  $('gExit').onclick = exit; $('gExit2').onclick = exit;
  $('gBack').onclick = showThrone;
  $('gArena').onclick = () => showRun('arena');
  $('gFight').onclick = () => showRun('fight');
  $('gDemo').onclick = () => watch('#/demo-live');
  $('gSeal').onclick = seal;
  $('gLess').onclick = () => setCount(agents - 1);
  $('gMore').onclick = () => setCount(agents + 1);
  $('gTask').addEventListener('input', () => { $('task').value = $('gTask').value; store.set('draft', $('gTask').value); });
  document.addEventListener('fullscreenchange', () => { if (on && !document.fullscreenElement) exit(); requestAnimationFrame(() => { fitThrone(); fitStages(); }); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && on && !document.fullscreenElement) exit(); });
  window.addEventListener('resize', fitThrone);
  return { enter, exit, showRun, showThrone, get on() { return on; } };
})();
