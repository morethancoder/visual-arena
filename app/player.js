'use strict';
// ================================================================ the colosseum, playing a real run
const INTRO = 4500;
class RunPlayer extends Engine {
  constructor(canvas, overlay, statusEl, feedEl) {
    super(canvas, 400, 250, 3);
    this.overlay = overlay; this.statusEl = statusEl; this.feedEl = feedEl;
    this.variant = 'oval'; this.buildMode = 'sonnet'; this.names = false;
    this.alwaysStep = true; // keep reading files while scrolled away: the fight view depends on it
    this.vol = .45;
    const oval = ovalBackground(400, 250);
    Object.assign(oval, {
      centre() { return { x: this.cx, y: this.cy }; },
      bench() { return { x: this.cx - this.rx + 22, y: this.cy + 16 }; },
    });
    const pano = panoramaBackground(400, 250, { floor: 128, tierH: 30, tiers: 3, top: 26, archW: 16, gateX: [30, 370] });
    Object.assign(pano, {
      inside(x, y) { return y > 144 && y < 242 && x > 12 && x < 388; },
      centre() { return { x: 200, y: 192 }; },
      gates() { return [{ x: 30, y: 136 }, { x: 370, y: 136 }]; },
      stand(x) { return { x: Math.max(10, Math.min(390, x)), y: 26 + 3 * 30 - 4 }; },
      bench() { return { x: 46, y: 150 }; },
    });
    this.maps = { oval, pano };
    this.judges = []; this.flights = [];
    canvas.addEventListener('click', e => this.click(e));
    canvas.addEventListener('mousemove', e => this.hover(e));
    canvas.addEventListener('mouseleave', () => hideTip());
  }
  get map() { return this.maps[this.variant]; }
  background() { return this.map.frames[Math.floor(this.time / 450) % 2]; }

  // ---------------------------------------------------------------- loading, modes, seeking
  /** Open a run. A run still going opens a few seconds behind live, so the latest files animate;
      a finished run opens at the end, ready to replay. */
  load(run) {
    this.run = run;
    this.matchById = {};
    run.rounds.forEach(rd => rd.matches.forEach(m => { m.round = rd.n; m.chain = null; this.matchById[m.id] = m; }));
    this.realAt = {}; this.timeline = [];
    this.appendEvents(run.events);
    return this.seek(run.done ? this.duration : Math.max(0, this.liveHead - 8000));
  }
  appendEvents(events) {
    const known = new Set(this.timeline.map(t => this.key(t.ev)));
    let last = this.timeline[this.timeline.length - 1];
    for (const e of events) {
      const k = this.key(e);
      if (known.has(k)) continue;
      const rt = last ? last.rt + Math.min(2200, Math.max(70, (e[0] - last.ev[0]) * 45)) : INTRO;
      last = { rt, ev: e }; this.timeline.push(last); known.add(k); this.realAt[k] = e[0];
    }
    this.duration = (last ? last.rt : INTRO) + 1500;
    this.liveHead = this.duration;
  }
  /** Merge a newer export of the same run: new rounds, verdict data and files. */
  extend(run) {
    const cur = this.run;
    Object.assign(cur.agents, run.agents);
    run.rounds.forEach(rd => {
      let ex = cur.rounds[rd.n - 1];
      if (!ex) { ex = { n: rd.n, bye: rd.bye, matches: [] }; cur.rounds.push(ex); }
      ex.bye = rd.bye;
      rd.matches.forEach(m => {
        const em = this.matchById[m.id];
        if (em) Object.assign(em, m, { chain: em.chain, spot: em.spot, round: em.round });
        else { m.round = rd.n; m.chain = null; ex.matches.push(m); this.matchById[m.id] = m; }
      });
    });
    for (const k of ['final', 'champion', 'champion_solution', 'done', 'task', 'has_baseline']) cur[k] = run[k];
    const wasAtLive = this.atLive;
    this.appendEvents(run.events);
    if (wasAtLive && this.evClock >= this.liveHead - 1600) this.evClock = Math.min(this.evClock, this.liveHead);
  }
  key(e) { return e[1] === 'spawn' ? 'spawn:' + e[2] : e[1] === 'final' ? 'final' : e.slice(1).join(':'); }
  has(k) { return !!this.seen && this.seen.has(k); }
  goLive() { this.seek(this.liveHead); }
  get live() { return this.run && !this.run.done && !this.run.stopped; }
  get roundsTotal() { let a = this.run.n, r = 0; while (a > 1) { a = Math.floor(a / 2) + (a % 2); r++; } return r; }
  /** Following the run: opened live or sent back to live, and not rewound since. */
  get atLive() { return this.live && this.following; }
  fighter(id) { return this.byId[id]; }
  setup() {
    const run = this.run, ids = Object.keys(run.agents).sort();
    this.byId = {};
    this.crates = gridSpots(this.map, ids.length, 4, 1).map(p => Object.assign({}, p, { taken: false }));
    const gates = this.map.gates();
    ids.forEach((id, i) => {
      const card = run.agents[id];
      const f = {
        id, card, build: this.buildMode === 'mixed' ? BUILD_IDS[strHash(id) % 4] : this.buildMode, color: COLOURS[card.card[0]],
        x: gates[i % 2].x, y: gates[i % 2].y + (i % 5) - 2, dir: i % 2 ? -1 : 1, anim: 'loot', animT: (i * 137) % 900,
        alive: true, busy: true, hp: 100, pips: 0, weapon: null, spawned: false, crate: this.crates[i], match: null, idleUntil: 0,
      };
      this.byId[id] = f; this.fighters.push(f);
    });
  }
  async seek(T) {
    T = Math.max(0, Math.min(T, this.liveHead));
    this.following = T >= this.liveHead - 9000;
    this.clear(); this.overlay.innerHTML = ''; hideTip(); logClear(this.feedEl); this.cleared = 0;
    this.run.rounds.forEach(rd => rd.matches.forEach(m => { m.chain = null; }));
    this.judges = []; this.flights = []; this.openRound = 0; this.evIdx = 0; this.evClock = 0;
    this.finished = false; this.ghost = null; this.champion = null; this.lastStatus = ''; this.finalOpen = false; this.finalChain = null; this.blocked = false;
    this.counts = {}; this.seen = new Set();
    this.seeking = true; this.instant = true;
    const gen = this.gen;
    this.setup();
    if (T < INTRO) {
      this.instant = false;
      this.banner('The gates open');
      logRow(this.feedEl, `<time>${clock(0)}</time>${tag('ROUND', 'START')} ${this.run.n} competitors enter the arena. Task: ${q(this.run.task.split('\n')[0])}`, 'sys');
      this.fighters.forEach((f, i) => {
        f.anim = 'walk';
        this.wait(i * Math.min(60, 3000 / this.fighters.length)).then(() =>
          this.moveTo(f, f.crate.x - 6, f.crate.y, 48, 'walk').then(() => { f.dir = 1; f.atCrate = true; if (f.spawned) this.equip(f); else this.setAnim(f, 'loot', true); }));
      });
    } else {
      logRow(this.feedEl, `<time>${clock(0)}</time>${tag('ROUND', 'START')} ${this.run.n} competitors enter the arena. Task: ${q(this.run.task.split('\n')[0])}`, 'sys');
      for (const f of this.fighters) { f.x = f.crate.x - 6; f.y = f.crate.y; f.dir = 1; f.atCrate = true; }
      while (this.evIdx < this.timeline.length && this.timeline[this.evIdx].rt <= T) {
        await this.dispatch(this.timeline[this.evIdx++].ev);
        if (gen !== this.gen) return;
      }
      if (this.evIdx >= this.timeline.length && this.run.done) this.crown(true);
    }
    this.evClock = T; this.instant = false; this.seeking = false;
    this.feedEl.scrollTop = this.feedEl.scrollHeight;
    this.status(this.describe());
    if (this.onClock) this.onClock();
  }

  // ---------------------------------------------------------------- the event clock
  tick(dt) {
    if (!this.run) return;
    if (!this.seeking && !this.blocked) {
      this.evClock = Math.min(this.liveHead, this.evClock + dt);
      while (this.evIdx < this.timeline.length && this.timeline[this.evIdx].rt <= this.evClock) {
        const ev = this.timeline[this.evIdx].ev, m = this.matchById[ev[2]];
        if (m && ev[1] !== 'spawn' && m.round > this.openRound) {
          this.blocked = true; const gen = this.gen;
          this.openRoundN(m.round).then(() => { if (gen === this.gen) this.blocked = false; });
          break;
        }
        if (ev[1] === 'final' && !this.finalOpen) {
          this.blocked = true; const gen = this.gen;
          this.openFinal().then(() => { if (gen === this.gen) this.blocked = false; });
          break;
        }
        this.evIdx++;
        this.dispatch(ev);
      }
      if (this.evIdx >= this.timeline.length && !this.finished && this.run.done) {
        this.finished = true; const gen = this.gen;
        Promise.all(this.allChains()).then(() => gen === this.gen && this.crown(false));
      }
    }
    for (const f of this.fighters) {
      if (!f.alive || f.move) continue;
      if (f.match && f.inFight && f.anim === 'idle' && Math.random() < dt / 2500) this.setAnim(f, 'think', true, 1400);
      if (f.busy || this.time < f.idleUntil) continue;
      if (Math.random() < .4) { this.setAnim(f, 'think', true); f.idleUntil = this.time + rand(1200, 2800); }
      else {
        let p = null;
        for (let k = 0; k < 8 && !p; k++) { const r = { x: f.x + rand(-30, 30), y: f.y + rand(-18, 18) }; if (this.map.inside(r.x, r.y)) p = r; }
        if (p) this.moveTo(f, p.x, p.y, rand(14, 22), 'walk');
        f.idleUntil = this.time + rand(300, 900);
      }
    }
    for (const w of this.extras) if (w.carry) { w.carry.x = w.x - w.dir * 7; w.carry.y = w.y + 1; w.anim = w.move ? 'walk' : 'idle'; }
    this.judges = this.judges.filter(j => j.until > this.time);
    this.flights = this.flights.filter(fl => this.time < fl.t0 + fl.dur);
    if (!this.seeking && Math.floor(this.time / 250) !== this.lastUi) { this.lastUi = Math.floor(this.time / 250); this.status(this.describe()); if (this.onClock) this.onClock(); }
  }
  allChains() { return this.run.rounds.flatMap(rd => rd.matches.map(m => m.chain || Promise.resolve())).concat(this.finalChain || []); }
  realTime() { const i = this.evIdx - 1; return i < 0 ? 0 : this.timeline[i].ev[0]; }
  describe() {
    const c = this.counts || {}, run = this.run;
    if (this.champion) return `Champion: ${this.champion.id} after ${run.rounds.length} rounds. ${run.n} agents in, 1 left.` + (run.final ? ` Against the rejected answer, ${run.final.better === 'champion' ? 'the champion' : 'the old answer'} scored higher: ${run.final.champion_total} to ${run.final.baseline_total}.` : '');
    const waiting = this.atLive && this.evClock >= this.liveHead - 100 ? ' Waiting for the next file…' : '';
    if (!this.openRound) return `Spawn: ${c.spawn || 0} of ${run.n} first solutions written.` + waiting;
    const rd = run.rounds[this.openRound - 1], M = rd.matches.length, k = this.openRound;
    const a = c['attack' + k] || 0, d = c['defend' + k] || 0, j = c['judge' + k] || 0;
    const alive = this.fighters.filter(f => f.alive && !f.ghost).length;
    const phase = j ? `judging: ${j} of ${M} verdicts in` : d ? `defending: ${d} of ${2 * M} defenses in` : `attacking: ${a} of ${2 * M} attack files in`;
    return `Round ${k} of ${this.roundsTotal} · ${alive} alive · ${phase}.` + (rd.bye ? ` ${rd.bye} has a bye.` : '') + waiting;
  }
  status(t) { if (t !== this.lastStatus) { this.statusEl.textContent = t; this.lastStatus = t; } }
  banner(text, red) {
    if (this.instant) return;
    const b = document.createElement('div'); b.className = 'banner' + (red ? ' red' : ''); b.textContent = text;
    b.style.animationDuration = 2.2 / this.speed + 's'; this.overlay.append(b); setTimeout(() => b.remove(), 2300 / this.speed);
  }
  who(id) { const f = this.fighter(id); return `<span class="who"><i class="sw" style="background:${f ? f.color : '#ece6d8'}"></i>${esc(id)}</span>`; }
  feed(ev, html, cls, m) {
    logRow(this.feedEl, `<time>${clock(ev[0])}</time>${html}`, cls, m ? () => openFight(m) : null);
  }

  go(f, x, y, speed, anim = 'walk') { if (this.instant) { f.x = x; f.y = y; f.move = null; return Promise.resolve(); } return this.moveTo(f, x, y, speed, anim); }

  // ---------------------------------------------------------------- events
  dispatch(e) {
    const type = e[1], m = this.matchById[e[2]];
    if (m && m.round > this.openRound) return this.openRoundN(m.round).then(() => this.dispatch(e)); // only while seeking
    const ck = type === 'spawn' ? 'spawn' : type + (m ? m.round : '');
    this.counts[ck] = (this.counts[ck] || 0) + 1;
    this.seen.add(this.key(e));
    if (type === 'spawn') {
      this.feed(e, `${tag('SPAWN')}${this.who(e[2])} wrote its first solution and grabs its gear`, 'dim');
      return this.onSpawn(this.fighter(e[2]));
    }
    if (type === 'final') {
      const fin = this.run.final;
      this.feed(e, `${tag('JUDGE', 'FINAL')} The final check: ${fin.better === 'champion' ? 'the champion' : 'the rejected answer'} scores higher, ${fin.champion_total} to ${fin.baseline_total}. ${esc(fin.reason)}`, 'sys');
      if (this.instant) return this.openFinal().then(() => this.onFinal());
      this.finalChain = this.onFinal(); return Promise.resolve();
    }
    if (type === 'attack') {
      const list = m.atk[e[3]] || [], opp = e[3] === m.a ? m.b : m.a;
      const fatal = list.filter(a => a.tier === 'FATAL').length;
      this.feed(e, `${this.who(e[3])} attacks ${this.who(opp)}: ${list.length ? `${list.length} attack${list.length > 1 ? 's' : ''}${fatal ? `, ${fatal} ${tag('FATAL')}` : ''}` : 'finds nothing to attack'}`, '', m);
    } else if (type === 'defend') {
      const d = m.def[e[3]] || [], r = d.filter(x => x.stance === 'REBUT').length, c = d.length - r;
      this.feed(e, `${this.who(e[3])} defends: ${d.length ? [r ? tag('REBUT', r + ' BLOCKED') : '', c ? tag('CONCEDE', c + ' FIXED') : ''].join('') : 'nothing to answer'}`, '', m);
    } else {
      this.feed(e, `${tag('JUDGE')}The judge of ${m.id} picks ${this.who(m.winner)}, ${m.totals[m.winner]} to ${m.totals[m.loser]}. ${this.who(m.loser)} falls${m.fatal[m.loser] ? ' with a verified fatal flaw' : ''}.`, 'sys', m);
    }
    const job = () => type === 'attack' ? this.onAttack(m, e[3]) : type === 'defend' ? this.onDefend(m, e[3]) : this.onJudge(m);
    if (this.instant) return job();
    const gen = this.gen;
    m.chain = (m.chain || Promise.resolve()).then(() => gen === this.gen && job());
    return Promise.resolve();
  }
  onSpawn(f) { f.spawned = true; if (this.instant || f.atCrate) this.equip(f); return Promise.resolve(); }
  equip(f) {
    f.weapon = STARTERS[strHash(f.id) % STARTERS.length]; f.crate.taken = true;
    if (!this.instant) { this.burst(f.crate.x, f.crate.y - 4, C.gold, 6, 30, 400); this.setAnim(f, 'idle', true); this.snd('coin', { v: .4, gap: 120 }); } else f.anim = 'idle';
    f.busy = false; f.idleUntil = this.time + rand(200, 900);
  }
  /** A place at the edge of the sand for the k-th body, away from where the fights happen. */
  edgeSpot(k) {
    const map = this.map;
    if (this.variant === 'oval') {
      const per = 44, ring = Math.floor(k / per), i = k % per;
      const a = Math.PI / 2 + (i + .5 + (ring % 2) * .5) / per * Math.PI * 2, e = .9 - ring * .07;
      return { x: map.cx + map.rx * e * Math.cos(a) * .97, y: map.cy + map.ry * e * Math.sin(a) + 4 };
    }
    const per = 27, row = Math.floor(k / per), i = k % per;
    return { x: 22 + i * 13.5 + (row % 2) * 6, y: [150, 240, 157, 233][row % 4] };
  }
  /** Between rounds, attendants walk out and drag the fallen to the edge of the sand. */
  async clearBodies() {
    const bodies = this.fighters.filter(f => !f.alive && !f.ghost && !f.cleared);
    if (!bodies.length) return;
    if (this.instant) {
      for (const b of bodies) { const p = this.edgeSpot(this.cleared++); b.x = p.x; b.y = p.y; b.cleared = true; }
      return;
    }
    const gen = this.gen, gates = this.map.gates();
    logRow(this.feedEl, `<time>${clock(this.realTime())}</time>${tag('ROUND', 'CLEANUP')} Attendants carry ${bodies.length} fallen to the edge of the sand`, 'dim');
    await Promise.all(bodies.map((b, i) => (async () => {
      const spot = this.edgeSpot(this.cleared++), g = gates[i % 2];
      const w = { x: g.x, y: g.y + (i % 3) * 2, dir: 1, anim: 'walk', animT: i * 50, skin: SKIN[i % 5], hair: HAIR[i % HAIR.length], tunic: ['#7a5a3a', '#6b6f4a', '#8a6a4a'][i % 3] };
      await this.wait(i * 120); if (gen !== this.gen) return;
      this.extras.push(w);
      await this.moveTo(w, b.x + 7, b.y, 70, 'walk'); if (gen !== this.gen) return;
      w.carry = b; b.hidden = true;
      await this.moveTo(w, spot.x + 7, spot.y, 45, 'walk'); if (gen !== this.gen) return;
      b.x = spot.x; b.y = spot.y; b.hidden = false; b.cleared = true; w.carry = null;
      await this.moveTo(w, g.x, g.y, 80, 'walk'); if (gen !== this.gen) return;
      this.extras.splice(this.extras.indexOf(w), 1);
    })()));
  }
  async openRoundN(n) {
    const rd = this.run.rounds[n - 1];
    if (!this.instant && n > 1) { await Promise.all(this.run.rounds[n - 2].matches.map(m => m.chain || Promise.resolve())); await this.wait(400); }
    await this.clearBodies();
    this.openRound = n;
    this.banner(`Round ${n}`); this.snd('horn', { v: 1.6, gap: 1000 });
    const first = this.timeline.find(t => this.matchById[t.ev[2]] && this.matchById[t.ev[2]].round === n);
    logRow(this.feedEl, `<time>${clock(first ? first.ev[0] : 0)}</time>${tag('ROUND', 'ROUND ' + n)} ${rd.matches.length * 2 + (rd.bye ? 1 : 0)} fighters, ${rd.matches.length} fights${rd.bye ? `, ${esc(rd.bye)} has a bye` : ''}`, 'sys');
    const spots = gridSpots(this.map, rd.matches.length, 12, n + 7);
    for (const f of this.fighters) if (f.alive) { f.bye = false; f.laurel = false; }
    if (rd.bye) {
      const f = this.fighter(rd.bye), b = this.map.bench();
      f.bye = true; f.busy = true; f.match = null;
      this.go(f, b.x, b.y, 30).then(() => { if (!this.instant) this.setAnim(f, 'think', true); else f.anim = 'think'; });
    }
    rd.matches.forEach((m, i) => {
      const A = this.fighter(m.a), B = this.fighter(m.b), s = spots[i];
      m.spot = s; A.match = B.match = m;
      if (!A.spawned) this.equip(A); if (!B.spawned) this.equip(B);
      A.busy = B.busy = true; A.hp = B.hp = 100;
      A.home = { x: s.x - 11, y: s.y }; B.home = { x: s.x + 11, y: s.y };
      m.chain = Promise.all([this.go(A, A.home.x, A.home.y, 40), this.go(B, B.home.x, B.home.y, 40)])
        .then(() => { A.dir = 1; B.dir = -1; A.inFight = B.inFight = true; if (this.instant) A.anim = B.anim = 'idle'; });
    });
    if (!this.instant) { await this.wait(1200); if (this.onRoundOpen) this.onRoundOpen(n); }
  }
  async onAttack(m, X) {
    const A = this.fighter(X), D = this.fighter(X === m.a ? m.b : m.a), list = m.atk[X] || [];
    if (this.instant) { D.hp = Math.max(4, D.hp - list.reduce((s, a) => s + DMG[a.tier], 0)); return; }
    const gen = this.gen, live = () => gen === this.gen;
    if (!list.length) { this.setAnim(A, 'think', true, 900); await this.wait(900); return; }
    for (let i = 0; i < list.length; i++) {
      await this.strike(A, D, list[i], pickWeaponFor(list[i].tier, m.id + X + i)); if (!live()) return;
      await this.wait(160); if (!live()) return;
    }
  }
  async strike(A, D, atk, wp) {
    const gen = this.gen, live = () => gen === this.gen;
    A.atkW = wp; A.dir = D.x > A.x ? 1 : -1;
    if (wp.kind === 'melee') {
      const reach = (BUILDS[A.build].w + BUILDS[D.build].w) / 2 + 3, d = A.dir;
      await this.moveTo(A, D.x - A.dir * reach, D.y, 85, 'charge'); if (!live()) return;
      this.setAnim(A, 'swing', true, 360); this.snd('whoosh', { v: .6 }); await this.wait(120); if (!live()) return;
      this.hit(D, A, atk, wp);
      await this.wait(240); if (!live()) return;
      await this.moveTo(A, A.home.x, A.home.y, 55, 'walk', false); A.dir = d;
    } else {
      this.setAnim(A, 'throw', true, 300); this.snd(wp.name === 'fireball' ? 'fire' : 'whoosh', { v: .5 }); await this.wait(150); if (!live()) return;
      await this.throwAt(A, D, wp); if (!live()) return;
      this.hit(D, A, atk, wp);
    }
  }
  hit(D, A, atk, wp) {
    D.dir = A.x > D.x ? 1 : -1;
    this.snd('hit', { tier: atk.tier, kind: wp ? woundKind(wp) : 'cut' });
    this.setAnim(D, 'hurt', true, 300); D.hp = Math.max(4, D.hp - DMG[atk.tier]);
    this.burst(D.x, D.y - heightOf(D) / 2, TIERC[atk.tier], atk.tier === 'FATAL' ? 16 : 7, 55, 450);
    if (atk.tier === 'FATAL') this.shake = 240;
  }
  async onDefend(m, Y) {
    const f = this.fighter(Y), opp = Y === m.a ? m.b : m.a, took = m.atk[opp] || [], def = m.def[Y] || [];
    if (this.instant) { f.hp = Math.min(100, f.hp + took.reduce((s, a) => s + DMG[a.tier], 0)); return; }
    const gen = this.gen, live = () => gen === this.gen;
    for (let i = 0; i < took.length; i++) {
      const st = (def[i] || {}).stance || 'CONCEDE';
      if (st === 'REBUT') { this.setAnim(f, 'block', true, 420); this.snd('clang', { v: .7 }); this.burst(f.x + f.dir * 7, f.y - heightOf(f) / 2, C.spark, 6, 45, 300); }
      else { this.setAnim(f, 'heal', true, 600); this.snd('heal', { v: .7 }); this.burst(f.x, f.y - heightOf(f), C.heal, 4, 25, 400, -20); }
      f.hp = Math.min(100, f.hp + DMG[took[i].tier]);
      await this.wait(st === 'REBUT' ? 460 : 640); if (!live()) return;
    }
  }
  async onJudge(m) {
    const W = this.fighter(m.winner), L = this.fighter(m.loser), cause = { m, killer: W.id };
    if (this.instant) {
      L.alive = false; L.inFight = false; L.anim = 'dead'; L.animT = 0; L.cause = cause; L.busy = true; L.skull = m.fatal[L.id];
      W.pips += Math.max(1, m.survived.length); W.hp = 100; W.inFight = false; W.match = null; W.busy = false; W.laurel = true;
      W.x = L.x - 10; W.y = L.y; W.anim = 'idle';
      return;
    }
    const gen = this.gen, live = () => gen === this.gen;
    const st = this.map.stand(m.spot.x, m.spot.y);
    const judge = { x: Math.round(st.x), y: Math.round(st.y), until: this.time + 4200, look: JUDGE_LOOK(strHash(m.id)), sign: null };
    this.judges.push(judge); this.snd('crowd', { v: .7, gap: 400 });
    await this.wait(450); if (!live()) return;
    for (const f of [this.fighter(m.a), this.fighter(m.b)]) for (const title of (m.standing[f.id] || [])) {
      this.setAnim(f, 'hurt', true, 300); f.hp = Math.max(4, f.hp - DMG[tierOf(m, f.id, title)]);
      this.burst(f.x, f.y - heightOf(f) / 2, '#e0483c', 8, 50, 400);
      await this.wait(380); if (!live()) return;
    }
    judge.sign = W.color;
    await this.wait(700); if (!live()) return;
    this.flights.push({ x0: judge.x + 5, y0: judge.y - 32, f: W, t0: this.time, dur: 800 });
    await this.wait(800); if (!live()) return;
    W.laurel = true; this.burst(W.x, W.y - heightOf(W) - 3, C.leaf, 8, 30, 400); this.snd('chime', { v: .7 });
    await this.wait(500); if (!live()) return;
    W.atkW = bigWeapon(m.id);
    const d = W.dir;
    await this.moveTo(W, L.x - W.dir * 10, L.y, 95, 'charge'); if (!live()) return;
    this.setAnim(W, 'swing', true, 400); await this.wait(125); if (!live()) return;
    L.alive = false; L.inFight = false; L.cause = cause; L.skull = m.fatal[L.id]; this.setAnim(L, 'dead', true); this.snd('death');
    this.burst(L.x, L.y - 5, '#e0483c', 14, 60, 600); this.shake = 220;
    await this.wait(450); if (!live()) return;
    await this.moveTo(W, L.x - d * 10, L.y, 26, 'walk'); if (!live()) return;
    W.dir = L.x > W.x ? 1 : -1;
    this.setAnim(W, 'loot', true); await this.wait(800); if (!live()) return;
    W.pips += Math.max(1, m.survived.length); this.burst(W.x, W.y - 14, C.gold, 8, 35, 500); this.snd('coin', { v: .8 });
    W.inFight = false; W.match = null; W.hp = 100; this.setAnim(W, 'idle'); W.busy = false; W.idleUntil = this.time + 400;
  }
  async openFinal() {
    this.finalOpen = true;
    if (!this.instant) { await Promise.all(this.allChains()); await this.wait(600); }
    const champ = this.fighters.find(f => f.alive), gates = this.map.gates(), c = this.map.centre();
    this.ghost = { id: 'the rejected answer', build: champ.build, color: '#ece6d8', ghost: true, x: gates[1].x, y: gates[1].y, dir: -1, anim: 'walk', animT: 0, alive: true, busy: true, hp: 100, pips: 0 };
    this.fighters.push(this.ghost);
    champ.busy = true; champ.laurel = false;
    this.banner('The final check'); this.snd('horn', { v: 1.6, gap: 1000 });
    await Promise.all([this.go(champ, c.x - 12, c.y, 40), this.go(this.ghost, c.x + 12, c.y, 30)]);
    champ.dir = 1; this.ghost.dir = -1; champ.inFight = this.ghost.inFight = true;
  }
  async onFinal() {
    const fin = this.run.final, champ = this.fighters.find(f => f.alive && !f.ghost), G = this.ghost;
    if (!fin || !G) return;
    const champWins = fin.better === 'champion';
    G.final = fin;
    if (this.instant) { G.anim = champWins ? 'dead' : 'victory'; G.alive = !champWins; if (!champWins) G.laurel = true; else champ.laurel = true; return; }
    const gen = this.gen, live = () => gen === this.gen, c = this.map.centre(), st = this.map.stand(c.x, c.y);
    const judge = { x: Math.round(st.x), y: Math.round(st.y), until: this.time + 4500, look: JUDGE_LOOK(7), sign: null };
    this.judges.push(judge);
    await this.wait(900); if (!live()) return;
    const W = champWins ? champ : G;
    judge.sign = W.color;
    this.flights.push({ x0: judge.x + 5, y0: judge.y - 32, f: W, t0: this.time, dur: 800 });
    await this.wait(900); if (!live()) return;
    W.laurel = true;
    if (champWins) { G.alive = false; this.setAnim(G, 'dead', true); this.burst(G.x, G.y - 6, C.white, 14, 50, 600); }
    else { this.setAnim(G, 'victory', true); this.banner('The old answer scored higher', true); }
  }
  crown(instant) {
    const champ = this.fighters.find(f => f.alive && !f.ghost);
    if (!champ) return;
    this.champion = champ; champ.busy = true; champ.inFight = false;
    if (instant) { champ.anim = 'victory'; return; }
    this.banner(`${champ.id} is champion`); this.snd('fanfare', { v: 1.8 }); setTimeout(() => this.snd('cheer', { v: 1.8 }), 600);
    this.setAnim(champ, 'victory', true);
    for (let i = 0; i < 5; i++) this.wait(i * 600).then(() => this.burst(champ.x, champ.y - 14, pickOf([C.gold, C.white, '#c2453d', '#5b7fbf']), 10, 60, 900, 40));
  }

  // ---------------------------------------------------------------- drawing
  drawUnder() {
    for (const c of this.crates || []) if (!c.taken) {
      this.R(c.x - 3, c.y - 5, 7, 5, C.wood); this.R(c.x - 3, c.y - 5, 7, 1, '#a8744a');
      this.R(c.x - 3, c.y - 1, 7, 1, C.woodD); this.R(c.x, c.y - 5, 1, 5, C.woodD);
    }
  }
  drawOver() {
    const R = (x, y, w, h, c) => this.R(x, y, w, h, c), g = this.ctx, S = this.S;
    for (const f of this.fighters) {
      const top = f.y - heightOf(f) - BUILDS[f.build].top - 2;
      if (!f.alive) {
        if (f.skull) { const x = f.x + 6, y = f.y - 6; R(x, y, 3, 2, C.white); R(x, y + 2, 1, 1, C.white); R(x + 2, y + 2, 1, 1, C.white); R(x, y + 1, 1, 1, C.ink); R(x + 2, y + 1, 1, 1, C.ink); }
        continue;
      }
      if (f.laurel) laurelOn(R, f);
      if (f.inFight) {
        R(f.x - 5, top - 2, 10, 2, '#000');
        R(f.x - 5, top - 2, Math.max(1, Math.round(f.hp / 10)), 2, f.hp > 50 ? C.heal : f.hp > 25 ? '#e0c04a' : '#e0483c');
      }
      for (let i = 0; i < Math.min(6, f.pips); i++) R(f.x - 5 + i * 2, top - (f.inFight ? 4 : 1), 1, 1, C.gold);
      if (this.champion === f) { const y = top - 6; R(f.x - 3, y, 7, 2, C.gold); R(f.x - 3, y - 2, 1, 2, C.gold); R(f.x, y - 2, 1, 2, C.gold); R(f.x + 3, y - 2, 1, 2, C.gold); }
    }
    for (const j of this.judges) paintHuman(R, j.x, j.y, Object.assign({}, j.look, { arm: !!j.sign, sign: j.sign }));
    for (const fl of this.flights) {
      const k = Math.min(1, (this.time - fl.t0) / fl.dur), tx = fl.f.x, ty = fl.f.y - heightOf(fl.f) - BUILDS[fl.f.build].top;
      paintLaurel(R, Math.round(fl.x0 + (tx - fl.x0) * k), Math.round(fl.y0 + (ty - fl.y0) * k - Math.sin(k * Math.PI) * 18));
    }
    if (this.names) {
      g.font = '700 12px "Atkinson Hyperlegible", system-ui'; g.textAlign = 'center'; g.textBaseline = 'bottom';
      for (const f of this.fighters) {
        if (f.ghost) continue;
        const x = f.x * S, y = (f.alive ? f.y - heightOf(f) - BUILDS[f.build].top - 6 : f.y - 6) * S, w = g.measureText(f.id).width + 8;
        g.fillStyle = 'rgba(10,8,12,.82)'; g.fillRect(x - w / 2, y - 15, w, 16);
        g.fillStyle = f.alive ? '#f4ecd8' : '#8d8478'; g.fillText(f.id, x, y);
      }
      g.textAlign = 'start'; g.textBaseline = 'alphabetic';
    }
  }

  // ---------------------------------------------------------------- pointer
  toWorld(e) { const r = this.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * this.W, y: (e.clientY - r.top) / r.height * this.H }; }
  nearest(p) { return this.fighters.map(f => ({ f, d: Math.hypot(f.x - p.x, f.y - 5 - p.y) })).sort((a, b) => a.d - b.d)[0]; }
  click(e) {
    const n = this.nearest(this.toWorld(e));
    if (!n || n.d > 12 || n.f.ghost) return;
    const m = n.f.alive ? n.f.match : n.f.cause && n.f.cause.m;
    if (m) openFight(m);
  }
  hover(e) {
    const n = this.nearest(this.toWorld(e));
    if (!n || n.d > 10) return hideTip();
    const f = n.f;
    if (f.ghost) {
      const fin = f.final;
      return showTip(e, `<h4>The rejected answer</h4>The answer you turned down, judged blind against the champion.` + (fin ? `<div style="margin-top:6px">${fin.better === 'champion' ? 'The champion' : 'The old answer'} scored higher: ${fin.champion_total} to ${fin.baseline_total}.<br><b>Why:</b> ${esc(fin.reason)}</div>` : ''));
    }
    const card = `${f.card.names[0]} · ${f.card.names[1]} · ${f.card.names[2]}`;
    if (!f.alive) {
      const m = f.cause.m, st = m.standing[f.id] || [];
      return showTip(e, `<h4>Here lies ${f.id}</h4>${card}
        <div style="margin-top:6px">Fell in round ${m.round} (${m.id}) to <b>${m.winner}</b>, ${m.totals[f.id]} to ${m.totals[m.winner]}.</div>
        ${m.fatal[f.id] ? '<div style="color:#a3322a"><b>Verified fatal flaw.</b></div>' : ''}
        <div style="margin-top:6px"><b>What killed it:</b><ul>${st.map(s => `<li>${esc(s)}, still standing</li>`).join('') || '<li>outscored, nothing left standing</li>'}</ul></div>
        <div style="margin-top:6px"><b>Judge:</b> ${esc(m.reason || '')}</div><div style="margin-top:4px;color:#6b5e4f">Click to replay this fight.</div>`);
    }
    const doing = this.champion === f ? 'Champion.' : f.bye ? 'Has a bye this round.' : f.match ? `Fighting ${f.match.a === f.id ? f.match.b : f.match.a} in ${f.match.id}. Click to watch.` : f.spawned ? 'Waiting for the next round.' : 'Writing its first solution.';
    showTip(e, `<h4 style="color:#7a5a12">${f.id}</h4>${card}<div style="margin-top:6px">${doing}</div>${f.pips ? `<div>${f.pips} fixes looted from the fallen.</div>` : ''}`);
  }
}

