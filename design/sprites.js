/* Arena sprites: pixel grids in the style of the Claude Code mascot.
 *
 * Every sprite is a list of equal-width strings, one char per pixel, '.' is empty.
 * Fighters are palette-swapped per agent: 'B' body, 'S' body shade (derived), the rest fixed.
 * Classic script (no modules) so the page also works from file://.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- palette

  const FIXED = {
    E: '#1b1b1f', // eyes
    K: '#1b1b1f', // outline / dark detail
    W: '#f4ecd8', // parchment white
    G: '#f4ecd8', // glasses frame
    T: '#e86a8a', // tongue
    R: '#c2453d', // headband red
    Y: '#e8c14a', // gold
    C: '#4a8fd6', // beanie blue
    M: '#cfd6dc', // bright steel
    D: '#6b7680', // dark steel
    H: '#5a3a22', // leather grip
    O: '#8a5a33', // wood
    F: '#f2a33a', // flame
    P: '#f7e08a', // flame core
    X: '#a33a2a', // ember / blood-free "wound" red
    N: '#8d8a82', // stone
    n: '#5f5c56', // stone shade
    L: '#c9c3b5', // stone light
    A: '#7fd1e8', // magic / reforge glow
  };

  // One body colour per reasoning mode (15). Opponents never share a reasoning mode
  // when the pairing can avoid it, so a duel is almost always two different colours.
  const REASONING_COLOURS = {
    'first-principles': '#d97757', // Claude orange
    'inversion': '#c2453d',
    'analogy': '#e0a93b',
    'adversarial': '#8e3b46',
    'constraint-first': '#5b7fbf',
    'worked-example': '#4fa07a',
    'socratic': '#9b6bc7',
    'contrarian': '#3fa7b5',
    'systems-thinking': '#6e8b3d',
    'decomposition': '#d46fa0',
    'working-backwards': '#a0785a',
    'probabilistic': '#7a8ca3',
    'dialectical': '#e3c27a',
    'evidence-first': '#3e5c8a',
    'expert-panel': '#b9b4a8',
  };

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f))));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }

  // ---------------------------------------------------------------- fighters
  // One build per model family. The arena runs N copies of one model, so a run
  // normally shows one build in 15 colours; mixed builds appear only if a run mixes models.

  const BUILDS = {
    // Sonnet: the mascot as is.
    sonnet: [
      '..BBBBBBBBBB..',
      '..BBBBBBBBBB..',
      '..BBEBBBBEBB..',
      '..BBEBBBBEBB..',
      'BBBBBBBBBBBBBB',
      'SBBBBBBBBBBBBS',
      '..BBBBBBBBBB..',
      '..SSSSSSSSSS..',
      '..S.S....S.S..',
      '..S.S....S.S..',
    ],
    // Haiku: small, propeller beanie, mismatched eyes, tongue out.
    haiku: [
      '...YY.CC....',
      '.....KK.....',
      '...CCCYYY...',
      '..BBBBBBBB..',
      '..BEEBBBBB..',
      '..BEEBBBEB..',
      'BBBBBBBBBBBB',
      '..BBBBTTBB..',
      '..SSSSTSSS..',
      '..S.S..S.S..',
    ],
    // Opus: the nerd. Thick glasses, cowlick.
    opus: [
      '.......S......',
      '......S.......',
      '..BBBBBBBBBB..',
      '..BGGGBBGGGB..',
      '..BGEGGGGEGB..',
      '..BGEGBBGEGB..',
      'BBBGGGBBGGGBBB',
      'SBBBBBBBBBBBBS',
      '..BBBBBBBBBB..',
      '..SSSSSSSSSS..',
      '..S.S....S.S..',
      '..S.S....S.S..',
    ],
    // Fable: the muscle. Headband, angry brows, flexed arms, thick legs.
    fable: [
      '....BBBBBBBBBB....',
      '....RRRRRRRRRRRR..',
      '....BKKBBBBKKB.RR.',
      '....BBEBBBBEBB....',
      'BB..BBEBBBBEBB..BB',
      'BBB.BBBBBBBBBB.BBB',
      'BBBBBBBBBBBBBBBBBB',
      'SSBBBBBBBBBBBBBBSS',
      '....BBBSBBSBBB....',
      '....BBBSBBSBBB....',
      '....SSSSSSSSSS....',
      '....SS.S..S.SS....',
      '....SS.S..S.SS....',
    ],
  };

  // The rejected answer, for the final check: a pale ghost of the plain build.
  const GHOST = [
    '..WWWWWWWWWW..',
    '..WWWWWWWWWW..',
    '..WWKWWWWKWW..',
    '..WWKWWWWKWW..',
    'WWWWWWWWWWWWWW',
    'LWWWWWWWWWWWWL',
    '..WWWWWWWWWW..',
    '..WWWWWWWWWW..',
    '..W.WW.WW.WW..',
    '...W..W..W.W..',
  ];

  // ---------------------------------------------------------------- weapons
  // All drawn pointing right. Tier is the attack's label from the attacker's file,
  // which is the only part of the visual that must be exact; the weapon inside a tier is random.

  const WEAPONS = {
    MINOR: {
      dagger: [
        '...Y.......',
        'HHHYMMMMMM.',
        'HHHYDDDDDDK',
        '...Y.......',
      ],
      arrow: [
        'O.O.........M.',
        '.OOOOOOOOOOMMM',
        'O.O.........M.',
      ],
      'sling stone': [
        '.nn.',
        'nLNn',
        'nNNn',
        '.nn.',
      ],
    },
    MAJOR: {
      sword: [
        '....Y.............',
        'HHHHYMMMMMMMMMMMM.',
        'HHHHYDDDDDDDDDDDDK',
        '....Y.............',
      ],
      axe: [
        '..........DMM.',
        '..........DMMM',
        'OOOOOOOOOODMMM',
        '..........DMMM',
        '..........DMM.',
      ],
      mace: [
        '..........K.K.',
        '.........DMMMD',
        'HHHHHHHHHDMMMK',
        '.........DMMMD',
        '..........K.K.',
      ],
      'crossbow bolt': [
        'D.........',
        'DOOOOOOMMK',
        'D.........',
      ],
    },
    FATAL: {
      warhammer: [
        '..........DDDDD',
        '..........DMMMD',
        'OOOOOOOOOODMMMD',
        '..........DMMMD',
        '..........DDDDD',
      ],
      flail: [
        '............K.K.',
        '...........DMMMD',
        'HHHHHD.D.D.MMMMK',
        '...........DMMMD',
        '............K.K.',
      ],
      fireball: [
        '......FF..',
        '..FFFFPPF.',
        'FFPPPPPPPF',
        '..FFFFPPF.',
        '......FF..',
      ],
      'ballista bolt': [
        'DD................',
        'DDOOOOOOOOOOOOOMM.',
        'DDOOOOOOOOOOOOODMK',
        'DD................',
      ],
    },
  };

  // ---------------------------------------------------------------- props and effects

  const PROPS = {
    // REBUT: the shield comes up and the hit glances off.
    shield: [
      '.YYYYYYYYY.',
      'YBBBBBBBBBY',
      'YBBBBBBBBBY',
      'YBBBBBBBBBY',
      'YBBBBBBBBBY',
      'YBBBBBBBBBY',
      'YBBBBBBBBBY',
      '.YBBBBBBBY.',
      '..YBBBBBY..',
      '...YBBBY...',
      '....YYY....',
    ],
    spark: [
      '...P...',
      '.P.P.P.',
      '..PYP..',
      'PPYWYPP',
      '..PYP..',
      '.P.P.P.',
      '...P...',
    ],
    // CONCEDE: the hit lands and sticks until the defender reforges at the anvil.
    stuck: [
      'M.....',
      '.MO...',
      '..OO..',
      '...OO.',
      '...O.O',
    ],
    anvil: [
      'DDDDDDDDDD..',
      '.DMMMMMMMDDD',
      '..DDDDDDDD..',
      '....DDDD....',
      '...DDDDDD...',
      '..DDDDDDDD..',
    ],
    glow: [
      '..A..A..',
      'A..AA..A',
      '.AA..AA.',
      '..A..A..',
    ],
    // The judge's verdict.
    crown: [
      'Y..Y..Y',
      'YY.Y.YY',
      'YYYYYYY',
      'YXYYYXY',
      'YYYYYYY',
    ],
    skull: [
      '.WWWWW.',
      'WWWWWWW',
      'WKWWWKW',
      'WKWWWKW',
      'WWWKWWW',
      '.WWWWW.',
      '.W.W.W.',
    ],
    // Eliminated: a gravestone in the yard, hover it for the cause of death.
    tombstone: [
      '...NNNNN...',
      '..NLLLLLN..',
      '.NLLNLLLNn.',
      '.NLNNNLLNn.',
      '.NLLNLLLNn.',
      '.NLLNLLLNn.',
      '.NLLLLLLNn.',
      '.NLLLLLLNn.',
      'nnnnnnnnnnn',
    ],
    // A bye: a round off with an ale.
    tankard: [
      '.WWWW..',
      'WWWWWW.',
      'YOOOOYY',
      'YOOOOY.Y',
      'YOOOOY.Y',
      'YOOOOYY',
      'YYYYYY.',
    ],
    scroll: [
      '.WWWWWWW.',
      'OWKKKKKWO',
      '.WWWWWWW.',
      '.WKKKKWW.',
      '.WWWWWWW.',
      'OWKKKWWWO',
      '.WWWWWWW.',
    ],
  };

  // Shield charges, one per strategy (5x5, painted in 'Y' over the body colour).
  const CHARGES = {
    'simplest': ['.....', '.....', '..Y..', '.....', '.....'],
    'maximal-rigour': ['Y.Y.Y', '.....', 'Y.Y.Y', '.....', 'Y.Y.Y'],
    'user-empathy': ['.Y.Y.', 'YYYYY', 'YYYYY', '.YYY.', '..Y..'],
    'edge-cases-first': ['YY.YY', 'Y...Y', '.....', 'Y...Y', 'YY.YY'],
    'speed': ['...YY', '..YY.', '.YYY.', '.YY..', 'YY...'],
    'defensive': ['Y.Y.Y', 'YYYYY', 'YY.YY', 'YY.YY', 'YYYYY'],
    'clarity': ['..Y..', '.YYY.', 'YYKYY', '.YYY.', '..Y..'],
    'completeness': ['.YYY.', 'Y...Y', 'Y.Y.Y', 'Y...Y', '.YYY.'],
    'fewest-moving-parts': ['.....', '.....', 'YYYYY', '.....', '.....'],
    'explicit-trade-offs': ['..Y..', 'YYYYY', 'Y.Y.Y', 'Y.Y.Y', '.YYY.'],
    'built-to-last': ['YYYYY', '.YYY.', '..Y..', '.YYY.', 'YYYYY'],
    'concrete-specifics': ['Y...Y', '.Y.Y.', '..Y..', '.Y.Y.', 'Y...Y'],
  };

  // ---------------------------------------------------------------- render

  /** Render a grid as an SVG string. body: hex for 'B'. flip: mirror horizontally. */
  function svg(grid, { px = 4, body = '#d97757', flip = false, overrides = {}, title = '' } = {}) {
    const w = Math.max(...grid.map(r => r.length));
    const h = grid.length;
    const pal = Object.assign({}, FIXED, { B: body, S: shade(body, 0.72) }, overrides);
    const rects = [];
    grid.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === '.' || ch === ' ') continue;
        const fill = pal[ch];
        if (!fill) continue;
        const gx = flip ? w - 1 - x : x;
        rects.push(`<rect x="${gx}" y="${y}" width="1.02" height="1.02" fill="${fill}"/>`);
      }
    });
    const t = title ? `<title>${title}</title>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * px}" height="${h * px}" shape-rendering="crispEdges">${t}${rects.join('')}</svg>`;
  }

  /** A shield in the agent's colour with its strategy charge on it. */
  function shieldFor(body, strategyId, px) {
    const g = PROPS.shield.map(r => r.split(''));
    const ch = CHARGES[strategyId] || CHARGES.simplest;
    ch.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.') g[y + 2][x + 3] = c; }));
    return svg(g.map(r => r.join('')), { px, body });
  }

  function pick(tier, rnd = Math.random) {
    const names = Object.keys(WEAPONS[tier]);
    const name = names[Math.floor(rnd() * names.length)];
    return { name, grid: WEAPONS[tier][name] };
  }

  root.ArenaSprites = { FIXED, REASONING_COLOURS, BUILDS, GHOST, WEAPONS, PROPS, CHARGES, shade, svg, shieldFor, pick };
})(typeof window !== 'undefined' ? window : globalThis);
