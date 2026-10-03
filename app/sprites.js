'use strict';
/* Sprites for The Arena: palette, fighters, weapons, the painter, and the crowd and judges.
   Everything is drawn from rectangles, so colours and builds swap at run time. */

// ================================================================ palette
const C = {
  ink: '#1b1b1f', white: '#f4ecd8', steel: '#cfd6dc', steelD: '#7a858f', gold: '#e8c14a', goldD: '#a8842a',
  red: '#c2453d', redD: '#7e2a24', wood: '#8a5a33', woodD: '#5a3a22', leaf: '#7cc95e', leafD: '#3f7f3a',
  hood: '#3b3150', hoodD: '#272036', glow: '#8fe3ff', heal: '#6fd08c', spark: '#fff3b0', flame: '#f2a33a',
  flameC: '#f7e08a', dust: '#e9d3a6',
};
const COLOURS = {
  'first-principles': '#d97757', 'inversion': '#c2453d', 'analogy': '#e0a93b', 'adversarial': '#8e3b46',
  'constraint-first': '#5b7fbf', 'worked-example': '#4fa07a', 'socratic': '#9b6bc7', 'contrarian': '#3fa7b5',
  'systems-thinking': '#6e8b3d', 'decomposition': '#d46fa0', 'working-backwards': '#a0785a', 'probabilistic': '#7a8ca3',
  'dialectical': '#e3c27a', 'evidence-first': '#3e5c8a', 'expert-panel': '#b9b4a8',
};
const CLIST = Object.values(COLOURS);
const TIERC = { MINOR: '#cfd6dc', MAJOR: '#f2a33a', FATAL: '#e0483c' };
const DMG = { MINOR: 8, MAJOR: 16, FATAL: 26 };
const shadeCache = {};
function shade(hex, f) {
  const k = hex + f; if (shadeCache[k]) return shadeCache[k];
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f))));
  return (shadeCache[k] = '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''));
}
function hash(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const rand = (a, b) => a + Math.random() * (b - a);
const pickOf = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ================================================================ fighters
// w,h: body; legs: leg columns; eyes: eye columns; eyeY / armY: rows from the top of the body.
const BUILDS = {
  haiku:  { name: 'Haiku',  w: 8,  h: 5, legH: 2, legs: [0, 2, 5, 7],  eyes: [2, 5], eyeY: 1, armY: 2, top: 3 },
  sonnet: { name: 'Sonnet', w: 10, h: 6, legH: 2, legs: [1, 3, 6, 8],  eyes: [2, 7], eyeY: 1, armY: 3, top: 2 },
  opus:   { name: 'Opus',   w: 12, h: 7, legH: 3, legs: [1, 4, 7, 10], eyes: [3, 8], eyeY: 2, armY: 4, top: 2, eyesMode: 'glow' },
  fable:  { name: 'Fable',  w: 12, h: 8, legH: 3, legs: [1, 4, 7, 10], eyes: [3, 8], eyeY: 2, armY: 4, top: 3 },
};
const BUILD_IDS = Object.keys(BUILDS);
const heightOf = F => BUILDS[F.build].h + BUILDS[F.build].legH;

const ANIMS = {
  idle: { frames: 2, ms: 480 }, walk: { frames: 4, ms: 130 }, charge: { frames: 4, ms: 75 },
  swing: { frames: 3, ms: 120, once: true }, throw: { frames: 2, ms: 150, once: true },
  hurt: { frames: 2, ms: 130, once: true }, block: { frames: 2, ms: 200, once: true },
  heal: { frames: 4, ms: 150 }, think: { frames: 4, ms: 320 }, loot: { frames: 2, ms: 280 },
  victory: { frames: 2, ms: 220 }, dead: { frames: 1, ms: 1000 },
};

// Accessories. pre: drawn behind the body; post: in front. G is the body geometry.
const ACC = {
  haiku: {
    pre(R, B, o, G, t) { for (let i = 0; i < 4; i++) R(G.x0 - 1 - i, G.y0 + 3 + Math.round(Math.sin(t / 90 + i * 1.4) * .7 + (i > 1 ? .5 : 0)), 1, 1, C.white); },
    post(R, B, o, G, t) {
      R(G.x0, G.y0 + 3, B.w, 1, C.white);
      const cx = G.x0 + (B.w >> 1) + o.lean, s = Math.round(Math.sin(t / 260));
      R(cx - 1, G.y0 - 2, 1, 2, C.leafD); R(cx + s, G.y0 - 3, 2, 1, C.leaf); R(cx - 3 + s, G.y0 - 2, 2, 1, C.leaf);
    },
    drop(R, x) { R(x, -1, 1, 1, C.leafD); R(x + 1, -2, 2, 1, C.leaf); R(x + 3, -1, 3, 1, C.white); },
  },
  sonnet: {
    post(R, B, o, G) {
      const L = o.lean;
      R(G.x0 + 1 + L, G.y0 - 3, B.w - 2, 1, C.steel); R(G.x0 + L, G.y0 - 2, B.w, 2, C.steel);
      R(G.x0 - 1 + L, G.y0, B.w + 2, 1, C.steelD); R(G.x0 + 2 + L, G.y0 - 2, 1, 1, C.white);
    },
    drop(R, x) { R(x, -2, 6, 2, C.steel); R(x - 1, -1, 8, 1, C.steelD); },
  },
  opus: {
    pre(R, B, o, G) { R(G.x0 - 1, G.y0 + 3, 1, B.h - 2, C.hoodD); },
    post(R, B, o, G) {
      const L = o.lean, cx = G.x0 + (B.w >> 1) + L;
      R(G.x0 - 1 + L, G.y0 - 1, B.w + 2, 2, C.hood); R(G.x0 + 1 + L, G.y0 - 2, B.w - 2, 1, C.hood); R(cx - 1, G.y0 - 3, 2, 1, C.hood);
      R(G.x0 - 1 + L, G.y0 + 1, 1, 3, C.hood); R(G.x0 + B.w + L, G.y0 + 1, 1, 3, C.hood);
      R(G.x0, G.legTop, B.w, 1, C.hoodD); R(G.x0 + (B.w >> 1) - 1, G.legTop - 2, 2, 1, C.gold);
    },
    staff(R, B, o, G, t) { const x = G.hx; R(x, G.y0 - 5, 1, B.h + B.legH + 5, C.wood); R(x - 1, G.y0 - 7, 2, 2, (Math.floor(t / 300) % 2) ? C.glow : '#c9f3ff'); },
    drop(R, x) { R(x, -1, 9, 1, C.wood); R(x + 9, -2, 2, 2, C.glow); },
  },
  fable: {
    pre(R, B, o, G, t) {
      R(G.x0 - 2, G.y0 + 2, 2, B.h + B.legH - 3, C.red);
      R(G.x0 - 3 - (Math.floor(t / 160) % 2), G.y0 + B.h + B.legH - 3, 1, 2, C.redD);
    },
    post(R, B, o, G) {
      const L = o.lean, cx = G.x0 + (B.w >> 1) + L;
      R(G.x0 + 2 + L, G.y0 - 1, B.w - 4, 1, C.gold); R(G.x0 + 2 + L, G.y0 - 2, 1, 1, C.gold); R(G.x0 + B.w - 3 + L, G.y0 - 2, 1, 1, C.gold);
      R(cx - 1, G.y0 - 3, 2, 2, C.gold); R(cx - 1, G.y0 - 1, 2, 1, C.red);
      R(G.x0 - 2, G.ay - 1, 3, 2, C.gold); R(G.x0 + B.w - 1, G.ay - 1, 3, 2, C.goldD);
    },
    drop(R, x) { R(x, -1, 6, 1, C.gold); R(x + 1, -2, 1, 1, C.gold); R(x + 4, -2, 1, 1, C.gold); R(x - 6, -1, 5, 1, C.red); },
  },
};

// ---------------------------------------------------------------- weapons, drawn pointing right from the grip
const WCOL = { H: C.woodD, W: C.wood, Y: C.gold, M: C.steel, D: C.steelD, F: C.flame, P: C.flameC, K: C.ink };
const WEAPONS = {
  dagger:        { tier: 'MINOR', kind: 'melee', grip: 1, g: ['.Y...', 'HYMMM', '.Y...'] },
  'throwing knife': { tier: 'MINOR', kind: 'throw', grip: 0, g: ['HMMM'] },
  sword:         { tier: 'MAJOR', kind: 'melee', grip: 1, g: ['..Y......', 'HHYMMMMMM', '..Y......'] },
  axe:           { tier: 'MAJOR', kind: 'melee', grip: 1, g: ['.....MM.', 'WWWWWDMM', '.....MM.'] },
  mace:          { tier: 'MAJOR', kind: 'melee', grip: 1, g: ['.....DMD', 'HHHHHMMM', '.....DMD'] },
  javelin:       { tier: 'MAJOR', kind: 'throw', grip: 1, g: ['.........M.', 'WWWWWWWWWMM', '.........M.'] },
  warhammer:     { tier: 'FATAL', kind: 'melee', grip: 2, g: ['......DDDD', '......MMMM', 'WWWWWWMMMM', '......MMMM', '......DDDD'] },
  greatsword:    { tier: 'FATAL', kind: 'melee', grip: 1, g: ['...Y..........', 'HHHYMMMMMMMMMM', 'HHHYDDDDDDDDDD', '...Y..........'] },
  flail:         { tier: 'FATAL', kind: 'melee', grip: 1, g: ['.........DMD', 'HHHHD.D.DMMM', '.........DMD'] },
  fireball:      { tier: 'FATAL', kind: 'throw', grip: 1, g: ['...FF.', 'FFPPPF', '...FF.'] },
};
const byTier = t => Object.entries(WEAPONS).filter(([, w]) => w.tier === t);
function pickWeapon(tier) { const [name, w] = pickOf(byTier(tier)); return Object.assign({ name }, w); }
const STARTERS = ['dagger', 'sword', 'axe', 'mace'];

function paintWeapon(R, wp, hx, hy, ang) {
  const g = wp.g;
  for (let py = 0; py < g.length; py++) for (let px = 0; px < g[py].length; px++) {
    const ch = g[py][px]; if (ch === '.') continue;
    const gy = py - wp.grip; let X, Y;
    if (ang === 'fwd') { X = px; Y = gy; }
    else if (ang === 'up') { X = gy; Y = -px; }
    else if (ang === 'diag') { X = px; Y = gy - px; }
    else if (ang === 'down') { X = px; Y = gy + px; }
    else { X = gy - (px >> 1); Y = -px; } // back, over the shoulder
    R(hx + X, hy + Y, 1, 1, WCOL[ch]);
  }
}

// ---------------------------------------------------------------- the painter
function eyes(R, mode, ex, ey, flash) {
  const k = flash ? C.ink : C.ink;
  switch (mode) {
    case 'up': R(ex, ey - 1, 1, 2, k); break;
    case 'glow': R(ex, ey, 1, 2, C.glow); break;
    case 'happy': R(ex - 1, ey + 1, 1, 1, k); R(ex, ey, 1, 1, k); R(ex + 1, ey + 1, 1, 1, k); break;
    case 'squintL': R(ex - 1, ey, 1, 1, k); R(ex, ey + 1, 1, 1, k); R(ex - 1, ey + 2, 1, 1, k); break;
    case 'squintR': R(ex + 1, ey, 1, 1, k); R(ex, ey + 1, 1, 1, k); R(ex + 1, ey + 2, 1, 1, k); break;
    case 'x': R(ex - 1, ey, 1, 1, k); R(ex + 1, ey, 1, 1, k); R(ex, ey + 1, 1, 1, k); R(ex - 1, ey + 2, 1, 1, k); R(ex + 1, ey + 2, 1, 1, k); break;
    default: R(ex, ey, 1, 2, k);
  }
}

function paintBody(R, F, B, o, t, drawAcc = true) {
  const col = F.color, main = o.flash || col, sh = o.flash || shade(col, .7);
  const x0 = -(B.w >> 1), legTop = -B.legH + o.bob, y0 = legTop - B.h, ay = y0 + B.armY;
  const G = { x0, y0, legTop, ay, hx: x0 + B.w + 1 + o.armF, hy: ay + o.armFy };
  const acc = ACC[F.build];
  if (drawAcc && acc.pre) acc.pre(R, B, o, G, t);
  B.legs.forEach((c, i) => { const lift = o.lift ? o.lift[i] : 0; R(x0 + c, legTop, 1, Math.max(1, -legTop - lift), sh); });
  const half = B.h >> 1;
  R(x0 + o.lean, y0, B.w, half, main);
  R(x0, y0 + half, B.w, B.h - half, main);
  R(x0, y0 + B.h - 1, B.w, 1, sh);
  R(x0 - 1 - o.armB, ay, 1 + o.armB, 2, main);
  R(x0 + B.w, ay + o.armFy, 1 + o.armF, 2, main);
  const mode = o.eyes || B.eyesMode || 'n';
  B.eyes.forEach((e, i) => {
    const m = mode === 'squint' ? (i ? 'squintR' : 'squintL') : mode;
    eyes(R, m, x0 + e + o.look + (B.eyeY < half ? o.lean : 0), y0 + B.eyeY, o.flash);
  });
  if (drawAcc && acc.post) acc.post(R, B, o, G, t);
  return G;
}

function paintFighter(ctx, F, x, y, S, anim, t) {
  const B = BUILDS[F.build], A = ANIMS[anim] || ANIMS.idle;
  const f = A.once ? Math.min(A.frames - 1, Math.floor(t / A.ms)) : Math.floor(t / A.ms) % A.frames;
  ctx.save();
  ctx.translate(Math.round(x * S), Math.round(y * S));
  ctx.scale(S * (F.dir || 1), S);
  const R = (a, b, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(a, b, w, h); };
  const x0 = -(B.w >> 1);
  R(x0 - 1, 0, B.w + 2, 1, 'rgba(0,0,0,.28)');
  if (anim === 'dead') {
    ctx.save(); ctx.scale(1, -1); ctx.translate(0, B.h + B.legH);
    paintBody(R, Object.assign({}, F, { color: shade(F.color, .85) }), B, { bob: 0, lean: 0, look: 0, armF: 0, armFy: 0, armB: 0, eyes: 'x', lift: null }, t, false);
    ctx.restore();
    ACC[F.build].drop(R, x0 + B.w + 2);
    ctx.restore();
    return;
  }
  const o = { bob: 0, lean: 0, look: 0, armF: 0, armFy: 0, armB: 0, eyes: null, lift: null, flash: null };
  let w = F.weapon ? WEAPONS[F.weapon] : null, wa = 'up', extra = null, dx = 0, air = 0;
  switch (anim) {
    case 'idle': o.bob = f; break;
    case 'walk': o.look = 1; o.lift = f === 1 ? [1, 0, 1, 0] : f === 3 ? [0, 1, 0, 1] : null; break;
    case 'charge': o.look = 1; o.lean = 1; o.lift = f % 2 ? [1, 0, 1, 0] : [0, 1, 0, 1]; wa = 'fwd'; extra = 'dust'; break;
    case 'swing':
      w = F.atkW || w; o.look = 1;
      if (f === 0) { o.lean = -1; dx = -1; wa = 'back'; }
      else if (f === 1) { o.lean = 1; dx = 2; o.armF = 1; wa = 'fwd'; extra = 'swoosh'; }
      else { o.lean = 1; dx = 1; wa = 'down'; }
      break;
    case 'throw': w = F.atkW || w; o.look = 1; if (f === 0) { dx = -1; wa = 'back'; } else { o.armF = 2; w = null; } break;
    case 'hurt': o.eyes = 'squint'; dx = f === 0 ? -2 : -1; if (f === 0) o.flash = '#ffffff'; break;
    case 'block': o.look = 1; extra = 'shield'; o.bob = f === 0 ? 1 : 0; w = null; break;
    case 'heal': o.eyes = 'happy'; o.bob = f % 2; extra = 'heal'; if (f % 2) o.flash = shade(F.color, 1.22); break;
    case 'think': o.eyes = 'up'; o.bob = (f >> 1) % 2; extra = 'think'; break;
    case 'loot': o.bob = 1; o.armF = 1; o.armFy = 1; o.eyes = f ? 'happy' : null; extra = 'glint'; w = null; break;
    case 'victory': o.eyes = 'happy'; air = f ? -3 : 0; o.lift = f ? [1, 1, 1, 1] : null; break;
  }
  ctx.translate(dx, air);
  const G = paintBody(R, F, B, o, t);
  if (w) paintWeapon(R, w, G.hx, G.hy, wa);
  else if (F.build === 'opus' && !F.weapon && !['throw', 'block', 'loot'].includes(anim)) ACC.opus.staff(R, B, o, G, t);
  if (extra === 'dust') { R(x0 - 3 - f, -1, 1, 1, C.dust); R(x0 - 5 - (f % 2), -2, 1, 1, C.dust); }
  else if (extra === 'swoosh') { for (let i = 0; i < 5; i++) R(G.hx + 4 + i, G.y0 - 3 + i * 2, 1, 2, 'rgba(255,255,255,.75)'); }
  else if (extra === 'shield') {
    const sx = x0 + B.w + 1, sy = G.y0 - 1;
    R(sx, sy, 4, B.h + 2, C.gold); R(sx + 1, sy + 1, 2, B.h, shade(F.color, .55)); R(sx + 1, sy + (B.h >> 1), 2, 2, C.gold);
    if (f === 1) { R(sx + 5, sy + 1, 1, 1, C.spark); R(sx + 6, sy + 3, 2, 1, C.spark); R(sx + 5, sy + 5, 1, 1, C.spark); }
  } else if (extra === 'heal') {
    [0, B.w - 1, B.w >> 1].forEach((px, k) => {
      const py = G.y0 - (Math.floor(t / 9 + k * 6) % 14);
      R(x0 + px, py - 1, 1, 3, C.heal); R(x0 + px - 1, py, 3, 1, C.heal);
    });
  } else if (extra === 'think') {
    for (let i = 0; i < f; i++) R(x0 + B.w - 1 + i * 2, G.y0 - 4 - i - B.top + 2, 1, 1, C.white);
  } else if (extra === 'glint') {
    const gy = G.y0 - 5 - f;
    R(0, gy - 1, 1, 3, C.spark); R(-1, gy, 3, 1, C.spark);
  }
  ctx.restore();
}

// ================================================================ people: crowd, judges, the verdict
const LAUREL = ['.L.l.L.', 'l.....l', 'L.....L', '.l...l.', '..LlL..'];
function paintLaurel(R, cx, cy) {
  LAUREL.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') R(cx - 3 + x, cy - 2 + y, 1, 1, ch === 'L' ? C.leaf : C.leafD); }));
}
/** The judge's placard: a board on a pole with a little mascot in the winner's colour. (cx, by) is the bottom of the board. */
function paintPlacard(R, cx, by, color) {
  R(cx, by, 1, 6, C.wood);
  R(cx - 8, by - 12, 17, 12, '#000'); R(cx - 7, by - 11, 15, 10, C.white);
  const sh = shade(color, .7);
  R(cx - 4, by - 9, 9, 4, color); R(cx - 5, by - 7, 1, 2, color); R(cx + 5, by - 7, 1, 2, color);
  R(cx - 2, by - 8, 1, 2, C.ink); R(cx + 2, by - 8, 1, 2, C.ink);
  R(cx - 4, by - 5, 9, 1, sh); [-3, -1, 1, 3].forEach(d => R(cx + d, by - 4, 1, 2, sh));
  paintLaurel(R, cx, by - 11);
}
/** A spectator, front view, 9 wide and 17 tall. (x, y) is the middle of the feet. h.sign: the winner's colour, held up high. */
function paintHuman(R, x, y, h) {
  const L = x - 4, skin = h.skin, ink = C.ink;
  R(L + 2, y - 3, 2, 2, skin); R(L + 5, y - 3, 2, 2, skin); R(L + 2, y - 1, 2, 1, C.woodD); R(L + 5, y - 1, 2, 1, C.woodD);
  R(L + 1, y - 10, 7, 7, h.tunic); R(L + 2, y - 11, 5, 1, h.tunic);
  if (h.sash) for (let i = 0; i < 6; i++) R(L + 2 + i, y - 10 + i, 1, 1, h.sash);
  R(L, y - 10, 1, 4, skin);
  if (h.arm) { R(L + 8, y - 11, 1, 1, skin); R(L + 9, y - 15, 1, 4, skin); }
  else R(L + 8, y - 10, 1, 4, skin);
  R(L + 3, y - 12, 3, 1, skin);
  R(L + 2, y - 16, 5, 4, skin);
  R(L + 1, y - 17, 7, 2, h.hair); R(L + 1, y - 15, 1, 2, h.hair); R(L + 7, y - 15, 1, 2, h.hair);
  R(L + 3, y - 14, 1, 1, ink); R(L + 5, y - 14, 1, 1, ink); R(L + 4, y - 13, 1, 1, shade(skin, .7));
  if (h.laurel) { R(L + 1, y - 17, 1, 1, C.leaf); R(L + 3, y - 18, 1, 1, C.leaf); R(L + 5, y - 18, 1, 1, C.leaf); R(L + 7, y - 17, 1, 1, C.leaf); }
  if (h.sign) paintPlacard(R, L + 9, y - 21, h.sign);
}
const JUDGE_LOOK = i => ({ skin: SKIN[i % 5], hair: HAIR[(i * 3) % HAIR.length], tunic: C.white, sash: '#7a3a8a', laurel: true });
function laurelOn(R, f) {
  const B = BUILDS[f.build], top = f.y - heightOf(f) - B.top;
  for (let i = 0; i < B.w; i += 2) R(f.x - (B.w >> 1) + i, top + 1, 1, 1, C.leaf);
  for (let i = 1; i < B.w; i += 2) R(f.x - (B.w >> 1) + i, top, 1, 1, C.leafD);
}


/** An arena attendant who clears the sand: a small figure in a brown tunic, side view, walking. */
function paintWorker(R, w, t) {
  const f = w.anim === 'walk' ? Math.floor(t / 140) % 2 : 0, skin = w.skin || SKIN[1];
  R(-2, -9, 4, 1, w.hair || HAIR[0]); R(-2, -8, 4, 2, skin); R(1, -8, 1, 1, C.ink);
  R(-2, -6, 4, 4, w.tunic || '#7a5a3a'); R(-2, -3, 4, 1, shade(w.tunic || '#7a5a3a', .7));
  R(2, -5, 2, 1, skin);
  if (f) { R(-2, -2, 1, 2, skin); R(1, -2, 1, 2, skin); } else { R(-1, -2, 1, 2, skin); R(0, -2, 1, 2, skin); }
  R(-2, 0, 5, 1, 'rgba(0,0,0,.25)');
}
