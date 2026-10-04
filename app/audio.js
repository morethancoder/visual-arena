'use strict';
/* Sound for The Arena, all synthesised with the Web Audio API (no audio files).

   sfx(name, {v, tier, kind})  plays one effect; names: whoosh, hit, clang, heal, fire, stab,
                               thud, death, crowd, cheer, horn, fanfare, chime, coin, quill, click
   music.play('throne'|'battle'|null)
   soundSettings               { sfx, sfxVol, music, musicVol, track }, saved in localStorage

   Browsers only allow sound after the person interacts with the page, so the audio context is
   created on the first click or key press. */

const soundSettings = (() => {
  const d = { sfx: true, sfxVol: .7, music: true, musicVol: .35, track: 'auto' };
  try { return Object.assign(d, JSON.parse(localStorage.getItem('arena.sound') || '{}')); } catch { return d; }
})();
function saveSound() { try { localStorage.setItem('arena.sound', JSON.stringify(soundSettings)); } catch { /* private window */ } }

const audio = (() => {
  let ctx = null, master, sfxBus, musicBus, noiseBuf, comp;
  function init() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = 1;
    sfxBus = ctx.createGain(); musicBus = ctx.createGain();
    sfxBus.connect(comp); musicBus.connect(comp); comp.connect(master); master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    apply();
    return ctx;
  }
  function apply() {
    if (!ctx) return;
    sfxBus.gain.setTargetAtTime(soundSettings.sfx ? soundSettings.sfxVol : 0, ctx.currentTime, .05);
    musicBus.gain.setTargetAtTime(soundSettings.music ? soundSettings.musicVol * .6 : 0, ctx.currentTime, .2);
  }
  const unlock = () => { init(); if (ctx && ctx.state === 'suspended') ctx.resume(); music.kick(); };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('visibilitychange', () => { if (ctx) document.hidden ? ctx.suspend() : ctx.resume(); });
  return { init, apply, get ctx() { return ctx; }, get sfx() { return sfxBus; }, get music() { return musicBus; }, get noise() { return noiseBuf; } };
})();

// ---------------------------------------------------------------- building blocks
function env(g, t, a, peak, d, sustain = 0) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, .0002), t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(sustain, .0001), t + a + d);
}
function tone(out, t, { type = 'sine', f = 440, f2 = null, a = .005, d = .3, v = .3, detune = 0 }) {
  const c = audio.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  env(g, t, a, v, d);
  o.connect(g); g.connect(out); o.start(t); o.stop(t + a + d + .05);
  return g;
}
function noise(out, t, { type = 'bandpass', f = 1000, f2 = null, q = 1, a = .005, d = .2, v = .3 }) {
  const c = audio.ctx, s = c.createBufferSource(), bq = c.createBiquadFilter(), g = c.createGain();
  s.buffer = audio.noise; s.loop = true;
  bq.type = type; bq.frequency.setValueAtTime(f, t); bq.Q.value = q;
  if (f2) bq.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  env(g, t, a, v, d);
  s.connect(bq); bq.connect(g); g.connect(out);
  s.start(t, Math.random() * 1.5); s.stop(t + a + d + .05);
  return g;
}
function metal(out, t, partials, v, d) { for (const [f, k] of partials) tone(out, t, { type: 'sine', f, a: .002, d: d * (0.6 + k * .5), v: v * k }); }

// ---------------------------------------------------------------- effects
const SFX = {
  whoosh(o, t, v) { noise(o, t, { f: 500, f2: 2600, q: 1.4, a: .03, d: .16, v: .35 * v }); },
  stab(o, t, v) { tone(o, t, { type: 'triangle', f: 220, f2: 90, d: .09, v: .4 * v }); noise(o, t, { type: 'highpass', f: 2500, d: .05, v: .15 * v }); },
  clash(o, t, v) {
    noise(o, t, { type: 'highpass', f: 3500, d: .12, v: .35 * v });
    metal(o, t, [[1870, 1], [2650, .7], [3340, .5], [4410, .35]], .12 * v, .35);
  },
  thud(o, t, v) { tone(o, t, { f: 150, f2: 45, d: .22, v: .7 * v }); noise(o, t, { type: 'lowpass', f: 400, d: .12, v: .35 * v }); },
  hit(o, t, v, opts) {
    const tier = opts.tier || 'MAJOR', kind = opts.kind || 'cut';
    if (kind === 'bruise') SFX.thud(o, t, v * (tier === 'MINOR' ? .6 : 1));
    else if (kind === 'knife' || kind === 'javelin') SFX.stab(o, t, v);
    else if (kind === 'scorch') SFX.fire(o, t, v * .8);
    else SFX.clash(o, t, v * (tier === 'MINOR' ? .6 : 1));
    if (tier === 'FATAL') { tone(o, t, { f: 90, f2: 35, d: .45, v: .7 * v }); noise(o, t, { type: 'lowpass', f: 700, d: .35, v: .3 * v }); }
  },
  clang(o, t, v) { metal(o, t, [[612, 1], [943, .8], [1357, .6], [2031, .4], [2988, .25]], .13 * v, .7); noise(o, t, { type: 'highpass', f: 2000, d: .06, v: .2 * v }); },
  heal(o, t, v) { [660, 880, 1320, 1760].forEach((f, i) => tone(o, t + i * .07, { type: 'sine', f, d: .35, v: .11 * v })); noise(o, t, { type: 'highpass', f: 6000, a: .05, d: .5, v: .05 * v }); },
  fire(o, t, v) { noise(o, t, { type: 'lowpass', f: 300, f2: 1800, a: .08, d: .45, v: .45 * v }); for (let i = 0; i < 5; i++) noise(o, t + .05 + Math.random() * .35, { type: 'highpass', f: 3000, d: .02, v: .12 * v }); },
  death(o, t, v) { SFX.thud(o, t, v * 1.2); tone(o, t + .05, { type: 'sawtooth', f: 220, f2: 70, a: .01, d: .7, v: .12 * v }); },
  crowd(o, t, v) { // a murmur that swells
    for (let i = 0; i < 3; i++) noise(o, t + i * .08, { f: 500 + i * 300, q: .8, a: .4, d: 1.2, v: .1 * v });
  },
  cheer(o, t, v) {
    for (let i = 0; i < 4; i++) noise(o, t + i * .05, { f: 900 + i * 400, f2: 1400 + i * 300, q: 1.2, a: .15, d: 1.6, v: .12 * v });
    for (let i = 0; i < 6; i++) noise(o, t + .1 + Math.random() * .9, { type: 'highpass', f: 2500, d: .03, v: .08 * v });
  },
  horn(o, t, v) { hornNote(o, t, 146.8, .55, .22 * v); hornNote(o, t + .5, 220, .8, .22 * v); },
  fanfare(o, t, v) { [[293.7, .18], [293.7, .12], [440, .25], [587.3, .7]].reduce((tt, [f, d]) => { hornNote(o, tt, f, d, .2 * v); return tt + d * .9; }, t); },
  chime(o, t, v) { metal(o, t, [[1318, 1], [1976, .6], [2637, .4]], .1 * v, 1.1); },
  coin(o, t, v) { tone(o, t, { type: 'square', f: 988, d: .06, v: .06 * v }); tone(o, t + .07, { type: 'square', f: 1318, d: .12, v: .06 * v }); },
  quill(o, t, v) { noise(o, t, { type: 'highpass', f: 3500 + Math.random() * 2000, a: .01, d: .04, v: .05 * v }); },
  click(o, t, v) { tone(o, t, { type: 'triangle', f: 1200, d: .03, v: .05 * v }); },
};
function hornNote(o, t, f, d, v) {
  const c = audio.ctx, osc = c.createOscillator(), osc2 = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
  osc.type = 'sawtooth'; osc2.type = 'square'; osc.frequency.value = f; osc2.frequency.value = f * 1.002;
  lfo.frequency.value = 5.5; lg.gain.value = f * .006; lfo.connect(lg); lg.connect(osc.frequency);
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(600, t); lp.frequency.linearRampToValueAtTime(2200, t + .06); lp.Q.value = 2;
  g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .05); g.gain.setValueAtTime(v, t + d * .8); g.gain.exponentialRampToValueAtTime(.0001, t + d + .12);
  osc.connect(lp); osc2.connect(lp); lp.connect(g); g.connect(o);
  for (const x of [osc, osc2, lfo]) { x.start(t); x.stop(t + d + .2); }
}

const sfxLast = {};
let voices = 0;
/** Play one sound effect. Rate-limited per name so a crowded arena doesn't turn into noise. */
function sfx(name, opts = {}) {
  if (!soundSettings.sfx || !audio.ctx || audio.ctx.state !== 'running') return;
  const now = performance.now(), gap = opts.gap || 45;
  if (now - (sfxLast[name] || 0) < gap || voices > 14) return;
  sfxLast[name] = now;
  const fn = name === 'hit' ? SFX.hit : SFX[name];
  if (!fn) return;
  voices++; setTimeout(() => { voices--; }, 600);
  fn(audio.sfx, audio.ctx.currentTime + .01, opts.v == null ? 1 : opts.v, opts);
}

// ---------------------------------------------------------------- music
// Two loops in D dorian: a slow lute tune over a drone for the throne room, and a quicker one
// with a frame drum for the fights. Notes are scale steps (0 = D); null is a rest.
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const stepHz = (s, base = 146.83) => base * Math.pow(2, (DORIAN[((s % 7) + 7) % 7] + 12 * Math.floor(s / 7)) / 12);
const TRACKS = {
  throne: {
    bpm: 76, len: 32,
    melody: [7, null, 9, 8, 7, null, 5, null, 4, null, 5, 7, 6, null, null, null, 7, null, 9, 10, 11, null, 9, null, 8, 7, 5, 4, 3, null, null, null,
             4, null, 5, 7, 8, null, 7, 5, 4, null, 3, null, 2, null, null, null, 4, 5, 7, null, 6, 5, 4, null, 3, 2, 1, null, 0, null, null, null],
    bass: [0, null, null, null, null, null, null, null, -3, null, null, null, null, null, null, null, -2, null, null, null, null, null, null, null, -3, null, null, null, -4, null, null, null],
    drum: [], shaker: false,
  },
  battle: {
    bpm: 132, len: 32,
    melody: [7, 7, 9, 7, 6, 4, 5, 6, 7, null, 7, 9, 10, 9, 7, null, 4, 4, 5, 4, 3, 2, 3, 4, 5, null, 4, 3, 2, null, 0, null,
             7, 9, 10, 11, 10, 9, 7, 9, 10, null, 9, 7, 6, 7, 9, null, 4, 5, 7, 5, 4, 3, 2, 3, 4, null, 3, 2, 1, null, 0, null],
    bass: [0, null, 0, null, -3, null, 0, null, -2, null, -2, null, -3, null, -4, null, 0, null, 0, null, -3, null, 0, null, -4, null, -3, null, -2, null, -3, null],
    drum: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0], shaker: true,
  },
};
const music = (() => {
  let current = null, step = 0, nextT = 0, timer = null, drone = null;
  function pluck(t, f, v, d) {
    const c = audio.ctx, o1 = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    o1.type = 'triangle'; o2.type = 'sawtooth'; o1.frequency.value = f; o2.frequency.value = f; o2.detune.value = 7;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 6, t); lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + d); lp.Q.value = 3;
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(audio.music);
    for (const o of [o1, o2]) { o.start(t); o.stop(t + d + .05); }
  }
  function drum(t, v) { tone(audio.music, t, { f: 120, f2: 52, d: .25, v: .5 * v }); noise(audio.music, t, { type: 'lowpass', f: 300, d: .08, v: .12 * v }); }
  function shake(t, v) { noise(audio.music, t, { type: 'highpass', f: 6500, d: .04, v: .05 * v }); }
  function startDrone() {
    stopDrone();
    const c = audio.ctx, g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420; g.gain.value = 0; g.gain.setTargetAtTime(.06, c.currentTime, 1.5);
    const os = [73.4, 110, 146.8].map((f, i) => { const o = c.createOscillator(); o.type = i ? 'sawtooth' : 'triangle'; o.frequency.value = f; o.detune.value = (i - 1) * 4; o.connect(lp); o.start(); return o; });
    lp.connect(g); g.connect(audio.music);
    drone = { g, os };
  }
  function stopDrone() {
    if (!drone) return;
    const d = drone, c = audio.ctx; drone = null;
    d.g.gain.setTargetAtTime(0, c.currentTime, .4);
    setTimeout(() => d.os.forEach(o => o.stop()), 2000);
  }
  function schedule() {
    const c = audio.ctx, tr = TRACKS[current];
    if (!tr) return;
    const spb = 60 / tr.bpm / 2; // eighth notes
    while (nextT < c.currentTime + .2) {
      const i = step % tr.melody.length, n = tr.melody[i];
      if (n != null) pluck(nextT, stepHz(n), .16, spb * (current === 'throne' ? 3.5 : 2.2));
      if (i % 2 === 0) { const b = tr.bass[(i / 2) % tr.bass.length]; if (b != null) pluck(nextT, stepHz(b, 73.42), .2, spb * 6); }
      if (tr.drum.length && tr.drum[i % tr.drum.length]) drum(nextT, 1);
      if (tr.shaker && i % 2 === 1) shake(nextT, 1);
      nextT += spb; step++;
    }
  }
  /** Play a track ('throne', 'battle') or stop (null). Starts once audio is unlocked. */
  function play(name) {
    const want = soundSettings.music ? (soundSettings.track !== 'auto' ? soundSettings.track : name) : null;
    if (!audio.ctx || audio.ctx.state !== 'running') { music.wanted = name; return; }
    music.wanted = name;
    if (want === current) return;
    clearInterval(timer); timer = null;
    current = want;
    if (!current) { stopDrone(); return; }
    step = 0; nextT = audio.ctx.currentTime + .15;
    startDrone();
    timer = setInterval(schedule, 40);
  }
  return {
    wanted: null, play,
    /** Called on every click or key press: starts the wanted track once audio is unlocked. */
    kick() {
      if (!audio.ctx) return;
      if (audio.ctx.state === 'running') play(music.wanted);
      else audio.ctx.resume().then(() => play(music.wanted));
    },
    get current() { return current; },
  };
})();
