'use strict';
// ================================================================ the fight view, one real match, live or replay
class Duel extends Engine {
  constructor(canvas, overlay, status, source) {
    super(canvas, 200, 100, 5);
    this.overlay = overlay; this.statusEl = status; this.source = source;
    this.alwaysStep = true;
    this.bg = panoramaBackground(200, 100, { floor: 58, tierH: 22, tiers: 2, top: 4, archW: 14, gateX: [] });
    this.cards = { A: document.getElementById('fcA'), B: document.getElementById('fcB') };
    canvas.addEventListener('mousemove', e => this.hover(e));
    canvas.addEventListener('mouseleave', () => hideTip());
  }
  background() { return this.bg.frames[Math.floor(this.time / 450) % 2]; }
  load(m, fa, fb) {
    this.m = m; this.looks = { [m.a]: { build: fa.build, color: fa.color, card: fa.card }, [m.b]: { build: fb.build, color: fb.color, card: fb.card } };
    document.getElementById('duelId').textContent = `${m.id}, ${m.a} vs ${m.b}, round ${m.round}`;
    this.run();
  }
  has(k) { return this.source.has(k); }
  t(k) { const s = this.source.realAt[k]; return s == null ? '' : `<time>${clock(s)}</time>`; }
  log(f, html, cls, k) { logRow(f.logEl, (k ? this.t(k) : '') + html, cls); }
  both(html, cls, k) { this.log(this.A, html, cls, k); this.log(this.B, html, cls, k); }
  name(f) { return `<span class="who"><i class="sw" style="background:${f.color}"></i>${esc(f.id)}</span>`; }
  banner(text, red) { const b = document.createElement('div'); b.className = 'banner' + (red ? ' red' : ''); b.textContent = text; b.style.animationDuration = 2.2 / this.speed + 's'; this.overlay.append(b); setTimeout(() => b.remove(), 2300 / this.speed); }
  status(t) { this.statusEl.textContent = t; }
  chip(kind) { const c = document.getElementById('duelChip'); c.className = 'chip-live ' + kind; c.textContent = kind === 'live' ? 'LIVE' : 'REPLAY'; }
  state(f, s) { f.stateEl.textContent = s; f.stateEl.className = 'state' + (s === 'winner' ? ' winner' : s === 'fallen' ? ' fallen' : ''); }
  async waitFor(test, text) {
    const gen = this.gen;
    if (test()) return true;
    this.chip('live'); this.status('Live: ' + text);
    while (!test()) { await this.wait(300); if (gen !== this.gen) return false; }
    return true;
  }
  hover(e) {
    const r = this.cv.getBoundingClientRect(), p = { x: (e.clientX - r.left) / r.width * this.W, y: (e.clientY - r.top) / r.height * this.H };
    const L = this.fighters.find(f => f.anim === 'dead');
    if (!L || Math.hypot(L.x - p.x, L.y - 5 - p.y) > 12) return hideTip();
    const m = this.m, st = m.standing[L.id] || [];
    showTip(e, `<h4>Here lies ${L.id}</h4>${L.card.names.join(' · ')}
      <div style="margin-top:6px">Fell in round ${m.round} to <b>${m.winner}</b>, ${m.totals[L.id]} to ${m.totals[m.winner]}.</div>
      ${m.fatal[L.id] ? '<div style="color:#a3322a"><b>Verified fatal flaw.</b></div>' : ''}
      <div style="margin-top:6px"><b>What killed it:</b><ul>${st.map(s => `<li>${esc(s)}, still standing</li>`).join('') || '<li>outscored, nothing left standing</li>'}</ul></div>
      <div style="margin-top:6px"><b>Judge:</b> ${esc(m.reason || '')}</div>`);
  }
  drawOver() {
    const R = (x, y, w, h, c) => this.R(x, y, w, h, c), g = this.ctx, S = this.S;
    for (const f of [this.A, this.B]) {
      if (!f) continue;
      f.hpEl.style.width = Math.max(0, f.hp) + '%';
      f.hpEl.style.background = f.hp > 50 ? 'var(--heal)' : f.hp > 25 ? '#e0c04a' : 'var(--blood)';
      f.hpTxt.textContent = Math.round(Math.max(0, f.hp)) + ' / 100';
      for (const w of f.lodged) {
        if (w.state === 'gone') continue;
        const x = f.x + f.dir * w.ox, y = f.y - heightOf(f) + w.oy, dd = -f.dir;
        if (w.state === 'standing') R(x - 1, y - 1, 4, 4, 'rgba(224,72,60,.55)');
        R(x, y, 1, 1, C.steel); R(x + dd, y - 1, 1, 1, C.wood); R(x + 2 * dd, y - 2, 1, 1, C.wood);
      }
      if (f.laurel && f.alive) laurelOn(R, f);
    }
    if (this.judge) paintHuman(R, this.judge.x, 50, Object.assign({}, this.judge.look, { arm: !!this.judge.sign, sign: this.judge.sign }));
    if (this.flight) {
      const fl = this.flight, k = Math.min(1, (this.time - fl.t0) / fl.dur), tx = fl.f.x, ty = fl.f.y - heightOf(fl.f) - BUILDS[fl.f.build].top;
      if (k < 1) paintLaurel(R, Math.round(fl.x0 + (tx - fl.x0) * k), Math.round(fl.y0 + (ty - fl.y0) * k - Math.sin(k * Math.PI) * 14));
    }
    g.font = '700 22px "Atkinson Hyperlegible", system-ui'; g.textAlign = 'center'; g.textBaseline = 'bottom';
    for (const f of this.fighters) {
      const x = f.x * S, y = (f.alive ? f.y - heightOf(f) - BUILDS[f.build].top - 4 : f.y - 7) * S, w = g.measureText(f.id).width + 14;
      g.fillStyle = 'rgba(10,8,12,.85)'; g.fillRect(x - w / 2, y - 27, w, 28);
      g.fillStyle = f.color; g.fillRect(x - w / 2, y - 27, 4, 28);
      g.fillStyle = f.alive ? '#f4ecd8' : '#9a9184'; g.fillText(f.id, x + 2, y - 2);
    }
    g.textAlign = 'start'; g.textBaseline = 'alphabetic';
  }
  mk(id, x, el) {
    const L = this.looks[id];
    const f = { id, card: L.card, build: L.build, color: L.color, x, y: 88, dir: 1, anim: 'walk', animT: 0, hp: 100, weapon: STARTERS[strHash(id) % 4], alive: true, lodged: [] };
    el.querySelector('.sw').style.background = f.color;
    el.querySelector('.name').textContent = id;
    el.querySelector('.model').textContent = BUILDS[f.build].name + ' · ' + f.card.names[0];
    el.querySelector('.cardline').innerHTML = `Reasoning <b>${esc(f.card.names[0])}</b> · workflow <b>${esc(f.card.names[1])}</b> · strategy <b>${esc(f.card.names[2])}</b>`;
    f.hpEl = el.querySelector('.hpbar i'); f.hpTxt = el.querySelector('.hpbar span'); f.logEl = el.querySelector('.log'); f.stateEl = el.querySelector('.state');
    f.logEl.innerHTML = '';
    return f;
  }
  async run() {
    this.finished = false;
    this.clear(); this.overlay.querySelectorAll('.banner').forEach(n => n.remove()); this.judge = null; this.flight = null; hideTip();
    const gen = this.gen, live = () => gen === this.gen, m = this.m;
    const A = this.A = this.mk(m.a, -10, this.cards.A), B = this.B = this.mk(m.b, 210, this.cards.B);
    this.fighters.push(A, B);
    this.chip(this.has('judge:' + m.id) ? 'replay' : 'live');
    this.state(A, 'reading'); this.state(B, 'reading');
    this.banner(`Round ${m.round}`);
    this.both(`${tag('ROUND', 'ROUND ' + m.round)} ${m.id}: ${this.name(A)} vs ${this.name(B)}`, 'sys');
    this.status(`${m.id}: ${A.id} vs ${B.id}. Reading each other's solutions.`);
    await Promise.all([this.moveTo(A, 72, 88, 45), this.moveTo(B, 128, 88, 45)]); if (!live()) return;
    A.dir = 1; B.dir = -1; A.home = { x: 72, y: 88 }; B.home = { x: 128, y: 88 };
    this.setAnim(A, 'think', true, 1300); this.setAnim(B, 'think', true, 1300);
    await this.wait(1300); if (!live()) return;

    // attack files, in the order they landed
    const pend = [A, B];
    while (pend.length) {
      const ready = pend.find(f => this.has(`attack:${m.id}:${f.id}`));
      if (!ready) {
        pend.forEach(f => { if (f.anim === 'idle') this.setAnim(f, 'think', true, 1200); this.state(f, 'attacking'); });
        if (!await this.waitFor(() => pend.some(f => this.has(`attack:${m.id}:${f.id}`)), `${pend.map(f => f.id).join(' and ')} still writing attacks…`)) return;
        continue;
      }
      pend.splice(pend.indexOf(ready), 1);
      await this.volley(ready, ready === A ? B : A); if (!live()) return;
    }

    for (const f of [A, B]) this.state(f, 'defending');
    const pendD = [A, B];
    while (pendD.length) {
      const ready = pendD.find(f => this.has(`defend:${m.id}:${f.id}`));
      if (!ready) {
        if (!await this.waitFor(() => pendD.some(f => this.has(`defend:${m.id}:${f.id}`)), `${pendD.map(f => f.id).join(' and ')} still writing defenses…`)) return;
        continue;
      }
      pendD.splice(pendD.indexOf(ready), 1);
      await this.defend(ready, ready === A ? B : A); if (!live()) return;
    }

    for (const f of [A, B]) this.state(f, 'judged');
    if (!await this.waitFor(() => this.has('judge:' + m.id), `the judge of ${m.id} is still deciding…`)) return;
    this.chip('replay');
    const W = m.winner === A.id ? A : B, L = W === A ? B : A, jk = 'judge:' + m.id;
    this.judge = { x: 100, look: JUDGE_LOOK(strHash(m.id)), sign: null };
    this.both(`${tag('JUDGE')}The judge of ${m.id} stands and checks every attack`, 'sys', jk);
    this.status(`The judge of ${m.id} checks every attack.`);
    await this.wait(1200); if (!live()) return;
    for (const f of [A, B]) for (const t of (m.standing[f.id] || [])) {
      const opp = f === A ? m.b : m.a, idx = (m.atk[opp] || []).findIndex(x => x.title === t), tier = tierOf(m, f.id, t);
      if (idx >= 0 && f.lodged[idx]) f.lodged[idx].state = 'standing';
      this.log(f, `${tag('STANDING')}${q(t)} still stands: the rebuttal didn't hold`, '', jk);
      this.setAnim(f, 'hurt', true, 300); f.hp = Math.max(6, f.hp - DMG[tier] * 1.5);
      this.burst(f.x, f.y - 8, '#e0483c', 10, 50, 500); this.shake = 180;
      await this.wait(1500); if (!live()) return;
    }
    this.judge.sign = W.color;
    this.both(`${tag('JUDGE')}The judge picks ${this.name(W)}: ${m.totals[W.id]} to ${m.totals[L.id]}${m.fatal[L.id] ? `. ${this.name(L)} has a verified fatal flaw` : ''}. ${esc(m.reason || '')}`, 'sys', jk);
    this.status(`The judge picks ${W.id}, ${m.totals[W.id]} to ${m.totals[L.id]}.`);
    await this.wait(900); if (!live()) return;
    this.flight = { x0: 105, y0: 18, f: W, t0: this.time, dur: 900 };
    await this.wait(900); if (!live()) return;
    W.laurel = true; this.state(W, 'winner');
    this.banner(`${W.id} wins`);
    await this.wait(1800); if (!live()) return;
    this.banner('Finish him!', true);
    await this.wait(1200); if (!live()) return;
    W.atkW = bigWeapon(m.id);
    await this.moveTo(W, L.x - W.dir * 16, L.y, 110, 'charge'); if (!live()) return;
    this.setAnim(W, 'swing', true, 600); await this.wait(125); if (!live()) return;
    this.shake = 450; this.burst(L.x, L.y - 8, '#e0483c', 26, 80, 800); this.burst(L.x, L.y - 8, C.white, 10, 60, 300);
    L.hp = 0; L.alive = false; L.lodged = []; this.setAnim(L, 'dead', true); this.state(L, 'fallen');
    this.log(W, `${tag('FALL', 'FINISH')}finishes ${this.name(L)} with a ${W.atkW.name}`, '', jk);
    this.log(L, `${tag('FALL', 'FALLEN')}falls in round ${m.round}`, '', jk);
    await this.wait(1100); if (!live()) return;
    this.judge = null;
    this.status(`${W.id} loots the body: every attack it fixed makes it stronger.`);
    await this.moveTo(W, L.x - W.dir * 14, L.y, 30, 'walk'); if (!live()) return;
    W.dir = L.x > W.x ? 1 : -1;
    this.setAnim(W, 'loot', true);
    for (const s of (m.survived.length ? m.survived : ['the win itself'])) {
      this.log(W, `${tag('LOOT')}takes the fix for ${q(s)}`, '', jk); this.burst(L.x, L.y - 6, C.gold, 8, 30, 500);
      await this.wait(1100); if (!live()) return;
    }
    W.hp = 100; W.lodged = [];
    this.setAnim(W, 'victory', true); await this.wait(1300); if (!live()) return;
    this.status(`${W.id} wanders off to wait for round ${m.round + 1}. Hover the body to see what killed ${L.id}.`);
    await this.moveTo(W, W.x < 100 ? 26 : 174, 90, 18, 'walk'); if (!live()) return;
    this.setAnim(W, 'think', true);
    if (this.onDone) this.onDone(m);
  }
  async volley(att, def) {
    const gen = this.gen, live = () => gen === this.gen, m = this.m, k = `attack:${m.id}:${att.id}`, list = m.atk[att.id] || [];
    this.status(`${att.id} attacks ${def.id}'s solution.`);
    if (!list.length) { this.log(att, `${tag('HIT', 'NONE')}reads ${this.name(def)}'s solution and finds nothing to attack`, '', k); this.setAnim(att, 'think', true, 900); await this.wait(900); return; }
    for (let i = 0; i < list.length; i++) {
      const atk = list[i], wp = pickWeaponFor(atk.tier, m.id + att.id + i);
      this.log(att, `${tag(atk.tier)}${wp.kind === 'melee' ? 'swings a' : 'throws a'} ${wp.name} at ${this.name(def)}: ${q(atk.title)}`, '', k);
      await this.wait(250); if (!live()) return;
      await this.strike(att, def, atk, wp, i); if (!live()) return;
      this.log(def, `${tag('HIT')}hit by ${q(atk.title)}`, 'dim', k);
      await this.wait(650); if (!live()) return;
    }
  }
  async defend(f, opp) {
    const gen = this.gen, live = () => gen === this.gen, m = this.m, k = `defend:${m.id}:${f.id}`;
    const took = m.atk[opp.id] || [], def = m.def[f.id] || [];
    this.status(`${f.id} answers the attacks it took.`);
    if (!took.length) { this.log(f, `${tag('HIT', 'NONE')}wasn't attacked, resubmits its solution`, 'dim', k); return; }
    for (let i = 0; i < took.length; i++) {
      const d = def[i] || { stance: 'CONCEDE', answer: '' }, w = f.lodged[i];
      if (d.stance === 'REBUT') {
        this.setAnim(f, 'block', true, 700); this.burst(f.x + f.dir * 8, f.y - heightOf(f) / 2, C.spark, 10, 50, 350);
        this.log(f, `${tag('REBUT')}blocks ${q(took[i].title)}: ${esc(d.answer)}`, '', k);
      } else {
        this.setAnim(f, 'heal', true, 1200); this.burst(f.x, f.y - 12, C.heal, 8, 30, 500, -20);
        this.log(f, `${tag('CONCEDE')}fixes ${q(took[i].title)}: ${esc(d.answer)}`, '', k);
      }
      if (w) w.state = 'gone';
      f.hp = Math.min(100, f.hp + DMG[took[i].tier]);
      await this.wait(1300); if (!live()) return;
    }
  }
  async strike(att, def, atk, wp, i) {
    const gen = this.gen, live = () => gen === this.gen;
    att.atkW = wp;
    const lodge = () => {
      this.setAnim(def, 'hurt', true, 300); def.hp = Math.max(6, def.hp - DMG[atk.tier]);
      def.lodged[i] = { ox: 1 + (strHash(atk.title + i) % 5), oy: 1 + (strHash(atk.title) % Math.max(2, heightOf(def) - 4)), state: 'stuck' };
      this.burst(def.x, def.y - heightOf(def) / 2, TIERC[atk.tier], atk.tier === 'FATAL' ? 22 : 10, 60, 500);
      if (atk.tier === 'FATAL') this.shake = 300;
    };
    if (wp.kind === 'melee') {
      const reach = (BUILDS[att.build].w + BUILDS[def.build].w) / 2 + 4, d = att.dir;
      await this.moveTo(att, def.x - att.dir * reach, def.y, 95, 'charge'); if (!live()) return;
      this.setAnim(att, 'swing', true, 420); await this.wait(125); if (!live()) return;
      lodge();
      await this.wait(400); if (!live()) return;
      await this.moveTo(att, att.home.x, att.home.y, 55, 'walk', false); att.dir = d;
    } else {
      this.setAnim(att, 'throw', true, 340); await this.wait(150); if (!live()) return;
      await this.throwAt(att, def, wp); if (!live()) return;
      lodge();
    }
  }
}

