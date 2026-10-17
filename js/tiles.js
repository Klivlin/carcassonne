// Определения тайлов базовой игры «Каркассон» (72 тайла).
// Края: 0=N, 1=E, 2=S, 3=W.
// Порты полей (половинки краёв, по часовой): 0=Nw 1=Ne 2=En 3=Es 4=Se 5=Sw 6=Ws 7=Wn.
// Точки p — место фишки в координатах тайла 0..1 (без поворота).

const city = (e, p, shield = false) => ({ t: 'city', e, p, shield });
const road = (e, p) => ({ t: 'road', e, p });
const field = (e, p, adj = []) => ({ t: 'field', e, p, adj });
const monastery = () => ({ t: 'monastery', e: [], p: [0.5, 0.5] });

export const TILES = {
  A: { n: 2, f: [monastery(), road([2], [0.5, 0.86]), field([0, 1, 2, 3, 4, 5, 6, 7], [0.18, 0.2])] },
  B: { n: 4, f: [monastery(), field([0, 1, 2, 3, 4, 5, 6, 7], [0.18, 0.2])] },
  C: { n: 1, f: [city([0, 1, 2, 3], [0.5, 0.5], true)] },
  D: { n: 4, f: [city([0], [0.5, 0.13]), road([1, 3], [0.5, 0.5]), field([2, 7], [0.15, 0.36], [0]), field([3, 4, 5, 6], [0.5, 0.8])] },
  E: { n: 5, f: [city([0], [0.5, 0.13]), field([2, 3, 4, 5, 6, 7], [0.5, 0.7], [0])] },
  F: { n: 2, f: [city([1, 3], [0.5, 0.5], true), field([0, 1], [0.5, 0.12], [0]), field([4, 5], [0.5, 0.88], [0])] },
  G: { n: 1, f: [city([0, 2], [0.5, 0.5]), field([2, 3], [0.88, 0.5], [0]), field([6, 7], [0.12, 0.5], [0])] },
  H: { n: 3, f: [city([1], [0.87, 0.5]), city([3], [0.13, 0.5]), field([0, 1, 4, 5], [0.5, 0.5], [0, 1])] },
  I: { n: 2, f: [city([0], [0.5, 0.13]), city([1], [0.87, 0.5]), field([4, 5, 6, 7], [0.35, 0.65], [0, 1])] },
  J: { n: 3, f: [city([0], [0.5, 0.13]), road([1, 2], [0.68, 0.68]), field([3, 4], [0.86, 0.86]), field([2, 5, 6, 7], [0.28, 0.6], [0])] },
  K: { n: 3, f: [city([0], [0.5, 0.13]), road([2, 3], [0.32, 0.68]), field([5, 6], [0.14, 0.86]), field([2, 3, 4, 7], [0.72, 0.6], [0])] },
  L: { n: 3, f: [city([0], [0.5, 0.13]), road([1], [0.8, 0.5]), road([2], [0.5, 0.8]), road([3], [0.2, 0.5]),
    field([3, 4], [0.82, 0.82]), field([5, 6], [0.18, 0.82]), field([7, 2], [0.28, 0.36], [0])] },
  M: { n: 2, f: [city([0, 3], [0.27, 0.27], true), field([2, 3, 4, 5], [0.8, 0.8], [0])] },
  N: { n: 3, f: [city([0, 3], [0.27, 0.27]), field([2, 3, 4, 5], [0.8, 0.8], [0])] },
  O: { n: 2, f: [city([0, 3], [0.27, 0.27], true), road([1, 2], [0.68, 0.68]), field([3, 4], [0.86, 0.86]), field([2, 5], [0.88, 0.36], [0])] },
  P: { n: 3, f: [city([0, 3], [0.27, 0.27]), road([1, 2], [0.68, 0.68]), field([3, 4], [0.86, 0.86]), field([2, 5], [0.88, 0.36], [0])] },
  Q: { n: 1, f: [city([0, 1, 3], [0.5, 0.35], true), field([4, 5], [0.5, 0.87], [0])] },
  R: { n: 3, f: [city([0, 1, 3], [0.5, 0.35]), field([4, 5], [0.5, 0.87], [0])] },
  S: { n: 2, f: [city([0, 1, 3], [0.5, 0.32], true), road([2], [0.5, 0.86]), field([4], [0.75, 0.88], [0]), field([5], [0.25, 0.88], [0])] },
  T: { n: 1, f: [city([0, 1, 3], [0.5, 0.32]), road([2], [0.5, 0.86]), field([4], [0.75, 0.88], [0]), field([5], [0.25, 0.88], [0])] },
  U: { n: 8, f: [road([0, 2], [0.5, 0.5]), field([1, 2, 3, 4], [0.8, 0.5]), field([5, 6, 7, 0], [0.2, 0.5])] },
  V: { n: 9, f: [road([2, 3], [0.32, 0.68]), field([5, 6], [0.14, 0.86]), field([7, 0, 1, 2, 3, 4], [0.7, 0.3])] },
  W: { n: 4, f: [road([1], [0.8, 0.5]), road([2], [0.5, 0.8]), road([3], [0.2, 0.5]),
    field([7, 0, 1, 2], [0.5, 0.2]), field([3, 4], [0.82, 0.82]), field([5, 6], [0.18, 0.82])] },
  X: { n: 1, f: [road([0], [0.5, 0.2]), road([1], [0.8, 0.5]), road([2], [0.5, 0.8]), road([3], [0.2, 0.5]),
    field([1, 2], [0.82, 0.18]), field([3, 4], [0.82, 0.82]), field([5, 6], [0.18, 0.82]), field([7, 0], [0.18, 0.18])] },
};

// ---------- Дополнения ----------
const river = e => ({ t: 'river', e, p: null });
// Копия базового тайла с доп. свойствами у признака fi (трактир, собор, товары…).
const variant = (base, n, set, fi, flags) => ({
  n, set, f: TILES[base].f.map((f, i) => (i === fi ? { ...f, ...flags } : f)),
});
const ALL = [0, 1, 2, 3, 4, 5, 6, 7];

// Река: тайлы выкладываются первыми, исток — стартовый тайл, озеро — последний.
Object.assign(TILES, {
  r1: { n: 1, set: 'river', spring: true, f: [river([2]), field(ALL, [0.2, 0.2])] },
  r2: { n: 1, set: 'river', lake: true, f: [river([0]), field(ALL, [0.15, 0.85])] },
  r3: { n: 2, set: 'river', f: [river([0, 2]), field([1, 2, 3, 4], [0.8, 0.5]), field([5, 6, 7, 0], [0.2, 0.5])] },
  r4: { n: 3, set: 'river', f: [river([2, 3]), field([5, 6], [0.14, 0.86]), field([7, 0, 1, 2, 3, 4], [0.7, 0.3])] },
  r5: { n: 1, set: 'river', f: [city([0], [0.5, 0.13]), river([1, 3]), field([2, 7], [0.15, 0.36], [0]), field([3, 4, 5, 6], [0.5, 0.8])] },
  r6: { n: 1, set: 'river', f: [river([0, 2]), road([1, 3], [0.25, 0.5]),
    field([1, 2], [0.8, 0.2]), field([3, 4], [0.8, 0.8]), field([5, 6], [0.2, 0.8]), field([7, 0], [0.2, 0.2])] },
  r7: { n: 1, set: 'river', f: [city([0, 1], [0.73, 0.27]), river([2, 3]), field([5, 6], [0.14, 0.86]), field([4, 7], [0.3, 0.47], [0])] },
  r8: { n: 1, set: 'river', f: [city([1], [0.87, 0.5]), city([3], [0.13, 0.5]), river([0, 2]),
    field([1, 4], [0.68, 0.12], [0]), field([0, 5], [0.32, 0.88], [1])] },
  r9: { n: 1, set: 'river', f: [river([0, 3]), road([1, 2], [0.68, 0.68]),
    field([7, 0], [0.14, 0.14]), field([3, 4], [0.86, 0.86]), field([1, 2, 5, 6], [0.5, 0.5])] },
});

// Трактиры и соборы.
Object.assign(TILES, {
  i1: variant('U', 2, 'inns', 0, { inn: true, mp: [0.75, 0.3] }),
  i2: variant('V', 1, 'inns', 0, { inn: true, mp: [0.65, 0.35] }),
  i3: variant('D', 1, 'inns', 1, { inn: true, mp: [0.75, 0.35] }),
  i4: variant('K', 1, 'inns', 1, { inn: true, mp: [0.82, 0.4] }),
  i5: variant('C', 2, 'inns', 0, { cathedral: true, shield: false, p: [0.25, 0.75] }),
  i6: { n: 1, set: 'inns', f: [city([0], [0.5, 0.13]), city([1], [0.87, 0.5]), city([3], [0.13, 0.5]), field([4, 5], [0.5, 0.8], [0, 1, 2])] },
  i7: { n: 1, set: 'inns', f: [monastery(), road([1], [0.84, 0.5]), road([3], [0.16, 0.5]),
    field([7, 0, 1, 2], [0.18, 0.2]), field([3, 4, 5, 6], [0.2, 0.85])] },
});

// Купцы и строители: города с товарами.
Object.assign(TILES, {
  t1: variant('E', 2, 'traders', 0, { goods: 'wine', mp: [0.25, 0.1] }),
  t2: variant('G', 1, 'traders', 0, { goods: 'grain', mp: [0.5, 0.75] }),
  t3: variant('N', 1, 'traders', 0, { goods: 'cloth', mp: [0.6, 0.15] }),
  t4: variant('R', 1, 'traders', 0, { goods: 'grain', mp: [0.2, 0.2] }),
  t5: variant('T', 1, 'traders', 0, { goods: 'wine', mp: [0.2, 0.2] }),
  t6: variant('J', 1, 'traders', 0, { goods: 'cloth', mp: [0.25, 0.1] }),
  t7: variant('L', 1, 'traders', 0, { goods: 'grain', mp: [0.25, 0.1] }),
  t8: variant('P', 1, 'traders', 0, { goods: 'wine', mp: [0.6, 0.15] }),
  t9: variant('F', 1, 'traders', 0, { goods: 'cloth', shield: false, mp: [0.8, 0.5] }),
  t10: variant('H', 1, 'traders', 0, { goods: 'wine', mp: [0.9, 0.25] }),
  t11: variant('C', 1, 'traders', 0, { goods: 'cloth', shield: false, mp: [0.3, 0.3] }),
});

// Принцесса и дракон: вулканы, тайлы с драконом, порталы и принцессы.
const tileVariant = (base, n, set, flags) => ({ ...TILES[base], n, set, ...flags });
Object.assign(TILES, {
  v1: { n: 2, set: 'dragon', volcano: true, f: [field(ALL, [0.18, 0.2])] },
  v2: { n: 1, set: 'dragon', volcano: true, f: [city([0], [0.5, 0.13]), field([2, 3, 4, 5, 6, 7], [0.2, 0.8], [0])] },
  v3: { n: 1, set: 'dragon', volcano: true, f: [road([2], [0.5, 0.88]), field(ALL, [0.18, 0.2])] },
  d1: tileVariant('U', 2, 'dragon', { dragon: true }),
  d2: tileVariant('V', 2, 'dragon', { dragon: true }),
  d3: tileVariant('E', 1, 'dragon', { dragon: true }),
  d4: tileVariant('B', 1, 'dragon', { dragon: true }),
  d5: tileVariant('N', 1, 'dragon', { dragon: true }),
  g1: { n: 2, set: 'dragon', portal: true, pp: [0.5, 0.5], f: [field(ALL, [0.18, 0.2])] },
  g2: tileVariant('U', 1, 'dragon', { portal: true, pp: [0.78, 0.22] }),
  q1: variant('E', 2, 'dragon', 0, { princess: true, mp: [0.25, 0.1] }),
  q2: variant('R', 1, 'dragon', 0, { princess: true, mp: [0.2, 0.2] }),
  q3: variant('N', 1, 'dragon', 0, { princess: true, mp: [0.6, 0.15] }),
  q4: variant('G', 1, 'dragon', 0, { princess: true, mp: [0.5, 0.75] }),
});

export const GOODS = { wine: 'вино', grain: 'зерно', cloth: 'ткань' };

// Возвращает признаки тайла с учётом поворота (rot — число четвертей по часовой).
const rotCache = new Map();
export function features(type, rot) {
  const key = type + ':' + rot;
  let r = rotCache.get(key);
  if (r) return r;
  r = TILES[type].f.map(f => ({
    ...f,
    e: f.e.map(x => f.t === 'field' ? (x + 2 * rot) % 8 : (x + rot) % 4),
    p: f.p && rotPoint(f.p, rot),
  }));
  rotCache.set(key, r);
  return r;
}

export function rotPoint([x, y], rot) {
  for (let i = 0; i < rot; i++) [x, y] = [1 - y, x];
  return [x, y];
}

// Тип края: 'C' город, 'R' дорога, 'W' река, 'F' поле.
export function edgeType(type, rot, edge) {
  for (const f of features(type, rot)) {
    if (!f.e.includes(edge) || f.t === 'field') continue;
    if (f.t === 'city') return 'C';
    if (f.t === 'road') return 'R';
    if (f.t === 'river') return 'W';
  }
  return 'F';
}

export const isRiver = type => TILES[type].set === 'river';

function shuffle(a, rand) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const startTile = opts => (opts.river ? 'r1' : 'D');

// Колода: тайлы берутся с конца массива.
export function buildDeck(opts = {}, rand = Math.random) {
  const sets = new Set(['base']);
  if (opts.inns) sets.add('inns');
  if (opts.traders) sets.add('traders');
  if (opts.dragon) sets.add('dragon');
  const start = startTile(opts);
  let deck = [];
  for (const [k, t] of Object.entries(TILES)) {
    if (!sets.has(t.set || 'base')) continue;
    const n = k === start ? t.n - 1 : t.n;
    for (let i = 0; i < n; i++) deck.push(k);
  }
  shuffle(deck, rand);
  if (opts.quick) deck = deck.slice(0, Math.ceil(deck.length / 2));
  if (opts.river) {
    const rivers = [];
    for (const [k, t] of Object.entries(TILES)) {
      if (t.set !== 'river' || t.spring || t.lake) continue;
      for (let i = 0; i < t.n; i++) rivers.push(k);
    }
    deck.push('r2', ...shuffle(rivers, rand));
  }
  return deck;
}
