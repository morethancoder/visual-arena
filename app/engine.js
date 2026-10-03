'use strict';
/* The engine: a small animation loop with timers, movement, projectiles and particles,
   the two arena backgrounds, and helpers shared by the colosseum and the fight view. */

// ================================================================ engine
class Engine {
  constructor(canvas, W, H, S) {
    this.cv = canvas; this.W = W; this.H = H; this.S = S;
    canvas.width = W * S; canvas.height = H * S;
    this.ctx = canvas.getContext('2d'); this.ctx.imageSmoothingEnabled = false;
    this.speed = 1; this.gen = 0; this.visible = true; this.last = 0;
    new IntersectionObserver(es => { this.visible = es[0].isIntersecting; }).observe(canvas);
    this.clear();
    requestAnimationFrame(ts => this.frame(ts));
  }
  clear() { this.gen++; this.time = 0; this.timers = []; this.fighters = []; this.proj = []; this.parts = []; this.shake = 0; }
  wait(ms) { const gen = this.gen; return new Promise(res => this.timers.push({ at: this.time + ms, res, gen })); }
  setAnim(f, a, force, ms) { if (f.anim !== a || force) { f.anim = a; f.animT = 0; } f.animUntil = ms ? this.time + ms : 0; }
  moveTo(f, x, y, speed = 40, anim = 'walk', face = true) {
    return new Promise(res => { f.move = { x, y, speed, anim, res, face }; this.setAnim(f, anim); });
  }
  throwAt(from, to, wp) {
    return new Promise(res => this.proj.push({ x: from.x + from.dir * 6, y: from.y - heightOf(from) + 2, tx: to.x, ty: to.y - heightOf(to) / 2, wp, t: 0, res, dir: from.dir, speed: wp.name === 'fireball' ? 110 : 150 }));
  }
  burst(x, y, color, n = 8, spd = 40, life = 500, grav = 60) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = rand(.3, 1) * spd; this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * .4, life, max: life, color, grav }); }
  }
  step(dt) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt);
    const due = this.timers.filter(t => t.at <= this.time);
    this.timers = this.timers.filter(t => t.at > this.time);
    due.forEach(t => t.gen === this.gen && t.res());
    for (const f of this.fighters) {
      f.animT += dt;
      if (f.animUntil && this.time >= f.animUntil) this.setAnim(f, 'idle');
      const m = f.move;
      if (m) {
        const dx = m.x - f.x, dy = m.y - f.y, dist = Math.hypot(dx, dy), s = m.speed * dt / 1000;
        if (m.face && Math.abs(dx) > .5) f.dir = dx > 0 ? 1 : -1;
        if (dist <= s) { f.x = m.x; f.y = m.y; f.move = null; this.setAnim(f, 'idle'); m.res(); }
        else { f.x += dx / dist * s; f.y += dy / dist * s; }
      }
    }
    for (const p of this.proj) {
      p.t += dt;
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), s = p.speed * dt / 1000;
      if (d <= s) { p.done = true; p.res(); } else { p.x += dx / d * s; p.y += dy / d * s - Math.sin(p.t / 200) * 0; }
    }
    this.proj = this.proj.filter(p => !p.done);
    for (const p of this.parts) { p.life -= dt; p.x += p.vx * dt / 1000; p.y += p.vy * dt / 1000; p.vy += p.grav * dt / 1000; }
    this.parts = this.parts.filter(p => p.life > 0);
    if (this.tick) this.tick(dt);
  }
  frame(ts) {
    const dt = Math.min(50, ts - (this.last || ts)); this.last = ts;
    if (!this.paused && (this.visible || this.alwaysStep)) this.step(dt * this.speed);
    if (this.visible) this.draw();
    requestAnimationFrame(t => this.frame(t));
  }
  R(x, y, w, h, c) { const S = this.S; this.ctx.fillStyle = c; this.ctx.fillRect(Math.round(x * S), Math.round(y * S), w * S, h * S); }
  draw() {
    const g = this.ctx, S = this.S;
    g.save();
    if (this.shake > 0) g.translate(Math.round(rand(-1, 1)) * S, Math.round(rand(-1, 1)) * S);
    g.drawImage(this.background(), 0, 0, this.W * S, this.H * S);
    if (this.drawUnder) this.drawUnder();
    const fs = this.fighters.slice().sort((a, b) => (a.anim === 'dead' ? -1 : 0) - (b.anim === 'dead' ? -1 : 0) || a.y - b.y);
    for (const f of fs) { if (f.ghost) g.globalAlpha = .55; paintFighter(g, f, f.x, f.y, S, f.anim, f.animT); g.globalAlpha = 1; }
    if (this.drawOver) this.drawOver();
    for (const p of this.proj) {
      const angs = ['up', 'diag', 'fwd', 'down'];
      const spin = p.wp.name === 'throwing knife' ? angs[Math.floor(p.t / 60) % 4] : 'fwd';
      g.save(); g.translate(Math.round(p.x * S), Math.round(p.y * S)); g.scale(S * p.dir, S);
      const len = p.wp.g[0].length;
      paintWeapon((a, b, w, h, c) => { g.fillStyle = c; g.fillRect(a, b, w, h); }, p.wp, -(len >> 1), 0, spin);
      g.restore();
      if (p.wp.name === 'fireball' && Math.random() < .5) this.parts.push({ x: p.x - p.dir * 3, y: p.y + rand(-1, 1), vx: -p.dir * 10, vy: -8, life: 250, max: 250, color: C.flame, grav: 0 });
    }
    for (const p of this.parts) this.R(p.x, p.y, 1, 1, p.color);
    g.restore();
  }
}

// ================================================================ backgrounds
function crowdColour(i) { return ['#c2453d', '#5b7fbf', '#e0a93b', '#4fa07a', '#9b6bc7', '#f4ecd8', '#3fa7b5', '#d46fa0', '#a0785a'][i % 9]; }
const SKIN = ['#f1c9a0', '#d9a577', '#b07a4f', '#8a5a3a', '#f3d5b5'];
const HAIR = ['#2b1d14', '#5a3a22', '#8a5a33', '#c9a04a', '#1b1b1f', '#a33a2a', '#d8d0c0'];

function ovalBackground(W, H) {
  const cx = W / 2, cy = H / 2 + 12, rx = W * .37, ry = H * .32;
  const frames = [0, 1].map(fr => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); const img = g.createImageData(W, H); const d = img.data;
    const put = (x, y, hex) => { const i = (y * W + x) * 4, n = parseInt(hex.slice(1), 16); d[i] = n >> 16; d[i + 1] = (n >> 8) & 255; d[i + 2] = n & 255; d[i + 3] = 255; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry, e = Math.sqrt(nx * nx + ny * ny), n = hash(x, y);
      let c;
      if (e < 1) {
        c = n < .06 ? '#b98f57' : n > .97 ? '#ecd09a' : '#d8b27a';
        if (Math.abs(((e * 34) % 1) - .5) < .04 && n < .55) c = '#cba26a';
      } else if (e < 1.05) c = e < 1.012 ? '#6b5d4f' : (n < .5 ? '#4a3f37' : '#463b33');
      else {
        const k = (e - 1.05) / .07, tier = Math.floor(k), within = k - tier;
        c = within < .2 ? '#857360' : (tier % 2 ? '#5d5047' : '#54483f');
        if (y < cy - ry * 1.05) c = within < .2 ? '#93806b' : (tier % 2 ? '#665850' : '#5d5047');
      }
      put(x, y, c);
    }
    g.putImageData(img, 0, 0);
    // crowd
    for (let tier = 0; tier < 8; tier++) {
      const e = 1.05 + .07 * (tier + .62), steps = Math.floor(2 * Math.PI * Math.max(rx, ry) * e / 4.4);
      for (let s = 0; s < steps; s++) {
        const a = s / steps * Math.PI * 2, hx = Math.round(cx + rx * e * Math.cos(a)) - 1, hy = Math.round(cy + ry * e * Math.sin(a)) - 2;
        if (hx < 1 || hy < 2 || hx >= W - 4 || hy >= H - 4) continue;
        if (Math.abs(Math.sin(a)) < .12 && tier < 3) continue; // gates
        if (hash(s, tier, 7) < .14) continue;
        const up = fr && hash(s, tier, 3) < .3 ? 1 : 0, skin = SKIN[Math.floor(hash(s, tier, 2) * 5)];
        g.fillStyle = crowdColour(Math.floor(hash(s, tier, 1) * 9)); g.fillRect(hx, hy + 2 - up, 3, 2);
        g.fillStyle = skin; g.fillRect(hx, hy + 1 - up, 3, 1);
        g.fillStyle = HAIR[Math.floor(hash(s, tier, 4) * HAIR.length)]; g.fillRect(hx, hy - up, 3, 1);
        if (up) { g.fillStyle = skin; g.fillRect(hx - 1, hy - 1, 1, 2); g.fillRect(hx + 3, hy - 1, 1, 2); }
      }
    }
    // gates
    for (const sgn of [-1, 1]) {
      const gx = Math.round(cx + sgn * rx * 1.02) - 4, gy = Math.round(cy) - 9;
      g.fillStyle = '#6b5d4f'; g.fillRect(gx - 2, gy - 2, 12, 14);
      g.fillStyle = '#120e10'; g.fillRect(gx, gy, 8, 12);
      g.fillStyle = '#3a3036'; for (let i = 1; i < 8; i += 2) g.fillRect(gx + i, gy, 1, 12);
    }
    // emperor's box
    const bx = Math.round(cx) - 18, by = Math.round(cy - ry * 1.3) - 6;
    g.fillStyle = '#e8c14a'; g.fillRect(bx - 1, by - 1, 38, 14);
    g.fillStyle = '#7e2a24'; g.fillRect(bx, by, 36, 12);
    for (let i = 0; i < 36; i += 6) { g.fillStyle = '#c2453d'; g.fillRect(bx + i, by, 3, 4); }
    g.fillStyle = '#f4ecd8'; g.fillRect(bx + 16, by + 6, 4, 4); g.fillStyle = '#e8c14a'; g.fillRect(bx + 16, by + 4, 4, 1);
    return cv;
  });
  return {
    frames, cx, cy, rx, ry,
    inside(x, y, m = .86) { const nx = (x - cx) / rx, ny = (y - cy) / ry; return nx * nx + ny * ny < m * m; },
    random() { for (;;) { const x = rand(cx - rx, cx + rx), y = rand(cy - ry, cy + ry); if (this.inside(x, y, .8)) return { x, y }; } },
    gates() { return [{ x: cx - rx + 6, y: cy }, { x: cx + rx - 6, y: cy }]; },
    stand(x, y) { const a = Math.atan2((y - cy) / ry, (x - cx) / rx); return { x: cx + rx * 1.14 * Math.cos(a), y: cy + ry * 1.14 * Math.sin(a) }; },
  };
}

function panoramaBackground(W, H, o) {
  const floor = o.floor, tierH = o.tierH, nT = o.tiers, top = o.top, archW = o.archW;
  const frames = [0, 1].map(fr => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const sky = ['#2a2140', '#3d2b4e', '#5a3a58', '#80505e', '#a86a62'];
    for (let y = 0; y < top + 4; y++) R(0, y, W, 1, sky[Math.min(4, Math.floor(y / (top + 4) * 5 + (hash(0, y) < .3 ? 1 : 0)))]);
    for (let i = 0; i < W; i += 37) if (hash(i, 9) < .7) R(i + 3, Math.floor(hash(i, 2) * (top - 2)), 1, 1, '#f4ecd8');
    // facade tiers
    for (let t = 0; t < nT; t++) {
      const y0 = top + t * tierH;
      R(0, y0, W, tierH, t % 2 ? '#a08a6c' : '#958065');
      R(0, y0, W, 2, '#c3ad8a'); R(0, y0 + tierH - 1, W, 1, '#6f5e49');
      const aw = archW - 4, ah = tierH - 7, off = t % 2 ? archW >> 1 : 0;
      for (let x = -archW + off; x < W; x += archW) {
        const ax = x + 2, ay = y0 + 4;
        R(ax + 1, ay, aw - 2, 1, '#2a2026'); R(ax, ay + 1, aw, ah - 1, '#2a2026');
        R(ax - 2, ay, 1, ah, '#c3ad8a');
        for (let k = 0; k < 3; k++) {
          const hx = ax + 1 + k * 4, seed = Math.floor(x + t * 1000 + k);
          if (hx + 3 > ax + aw || hash(seed, t, 5) < .18) continue;
          const up = fr && hash(seed, t, 3) < .3 ? 1 : 0, skin = SKIN[Math.floor(hash(seed, t, 2) * 5)], by = ay + ah - 6 - up;
          R(hx, by, 3, 1, HAIR[Math.floor(hash(seed, t, 4) * HAIR.length)]);
          R(hx, by + 1, 3, 2, skin); R(hx, by + 1, 1, 1, HAIR[Math.floor(hash(seed, t, 4) * HAIR.length)]); R(hx + 1, by + 2, 1, 1, shade(skin, .55));
          R(hx, by + 3, 3, 3 + up, crowdColour(Math.floor(hash(seed, t, 1) * 9)));
          if (up) { R(hx - 1, by, 1, 2, skin); R(hx + 3, by, 1, 2, skin); }
        }
      }
    }
    // podium wall and emperor's box
    const py = top + nT * tierH;
    R(0, py, W, floor - py, '#4a3a33'); R(0, py, W, 1, '#e8c14a'); R(0, floor - 1, W, 1, '#2a201c');
    for (let x = 4; x < W; x += 16) R(x, py + 2, 10, floor - py - 4, '#55443b');
    const bx = (W >> 1) - 16;
    R(bx - 1, py - 12, 34, floor - py + 12, '#e8c14a'); R(bx, py - 11, 32, floor - py + 10, '#7e2a24');
    for (let i = 0; i < 32; i += 6) R(bx + i, py - 11, 3, 4, '#c2453d');
    R(bx + 14, py - 5, 4, 4, '#f4ecd8');
    // gates
    for (const gx of o.gateX) { R(gx - 6, py + 1, 12, floor - py - 1, '#120e10'); for (let i = 1; i < 12; i += 2) R(gx - 6 + i, py + 1, 1, floor - py - 1, '#3a3036'); }
    // sand
    for (let y = floor; y < H; y++) for (let x = 0; x < W; x++) {
      const n = hash(x, y), depth = (y - floor) / (H - floor);
      let c = depth < .08 ? '#a8804c' : n < .06 ? '#b98f57' : n > .97 ? '#ecd09a' : '#d8b27a';
      if (depth > .08 && depth < .2 && n < .35) c = '#c79f68';
      g.fillStyle = c; g.fillRect(x, y, 1, 1);
    }
    return cv;
  });
  return { frames, floor, top, tierH, nT, W, H, o };
}

// ================================================================ helpers for real runs
function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
function pickWeaponFor(tier, key) { const list = byTier(tier); const [name, w] = list[strHash(key) % list.length]; return Object.assign({ name }, w); }
function bigWeapon(key) { const n = ['warhammer', 'greatsword', 'flail'][strHash(key) % 3]; return Object.assign({ name: n }, WEAPONS[n]); }
function tierOf(m, defender, title) {
  const opp = defender === m.a ? m.b : m.a, a = (m.atk[opp] || []).find(x => x.title === title);
  return a ? a.tier : 'MAJOR';
}
function clock(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 3600) + ':' + String(Math.floor(sec / 60) % 60).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function seededShuffle(a, seed) { let x = (seed * 2654435761) >>> 0 || 1; for (let i = a.length - 1; i > 0; i--) { x = Math.imul(x ^ (x >>> 15), 2246822519) >>> 0; const j = x % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const tag = (t, label) => `<span class="tag ${t}">${label || t}</span>`;
const q = s => `<q>${esc(s)}</q>`;

/** Append a row to a streamer-style log; keeps the view pinned to the bottom unless the reader scrolled up. */
function logRow(ol, html, cls, onClick) {
  const pinned = ol.scrollHeight - ol.scrollTop - ol.clientHeight < 30;
  const li = document.createElement('li'); li.innerHTML = html; if (cls) li.className = cls;
  if (onClick) { li.classList.add('open'); li.onclick = onClick; }
  ol.append(li);
  while (ol.children.length > 500) ol.firstChild.remove();
  if (pinned) ol.scrollTop = ol.scrollHeight;
  return li;
}

function gridSpots(map, count, pairW, seed) {
  let dx = 46, dy = 30, pts = [];
  const c = map.centre();
  for (let tries = 0; tries < 40; tries++) {
    pts = [];
    for (let j = -12; j <= 12; j++) for (let i = -16; i <= 16; i++) {
      const x = c.x + i * dx + (j % 2 ? dx / 2 : 0), y = c.y + j * dy;
      if (map.inside(x - pairW, y) && map.inside(x + pairW, y)) pts.push({ x, y });
    }
    if (pts.length >= count) break;
    dx *= .92; dy *= .92;
  }
  pts.sort((p, r) => Math.hypot(p.x - c.x, (p.y - c.y) * 1.6) - Math.hypot(r.x - c.x, (r.y - c.y) * 1.6));
  return seededShuffle(pts.slice(0, count), seed);
}

