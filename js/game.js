// Правила игры. Состояние — простой JSON, чтобы его можно было пересылать по сети.
import { features, edgeType, buildDeck, startTile, isRiver, GOODS } from './tiles.js';

export const COLORS = ['#d33c3c', '#2f6fd6', '#e0b419', '#2fa34a', '#222222', '#c561d6'];
export const MEEPLES = 7;

export const MODES = {
  river: { icon: '🌊', name: 'Река', desc: 'Партия начинается с 12 тайлов реки — они выкладываются первыми, от истока до озера.' },
  inns: { icon: '🍺', name: 'Трактиры и соборы', desc: 'Трактир удваивает очки дороги, собор даёт 3 очка за тайл города — но если к концу игры они не достроены, то 0. У каждого есть большая фишка, она считается за две.' },
  traders: { icon: '🔨', name: 'Купцы и строители', desc: 'В городах есть товары: вино, зерно, ткань. Их забирает тот, кто завершил город, а в конце за большинство каждого товара +10. Строитель даёт доп. ход, когда вы снова достраиваете его дорогу или город.' },
  quick: { icon: '⚡', name: 'Быстрая партия', desc: 'Колода вдвое меньше — партия минут на 15.' },
};

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const key = (x, y) => x + ',' + y;
const unkey = k => k.split(',').map(Number);
const oppEdge = e => (e + 2) % 4;
const oppPort = p => ((p >> 1) % 2 === 0 ? (13 - p) : (9 - p)) % 8;

export function newGame(players, opts = {}) {
  const board = {};
  board[key(0, 0)] = { t: startTile(opts), r: 0, m: null };
  const state = {
    phase: 'play',
    opts,
    players: players.map((p, i) => ({
      name: p.name, key: p.key, color: COLORS[i], score: 0, meeples: MEEPLES,
      big: opts.inns ? 1 : 0,
      builder: opts.traders ? 1 : 0,
      goods: { wine: 0, grain: 0, cloth: 0 },
    })),
    board,
    deck: buildDeck(opts),
    current: null,
    turn: 0,
    bonus: false,
    log: ['Игра началась!'],
    last: key(0, 0),
    seq: 0,
  };
  drawTile(state);
  return state;
}

export function canPlace(board, type, rot, x, y) {
  if (board[key(x, y)]) return false;
  let hasNeighbor = false, riverLinked = false;
  for (let e = 0; e < 4; e++) {
    const n = board[key(x + DIRS[e][0], y + DIRS[e][1])];
    if (!n) continue;
    hasNeighbor = true;
    const mine = edgeType(type, rot, e);
    if (mine !== edgeType(n.t, n.r, oppEdge(e))) return false;
    if (mine === 'W') riverLinked = true;
  }
  if (isRiver(type)) {
    // Тайл реки обязан продолжать реку, а её свободный конец — смотреть на пустое место,
    // чтобы река не упёрлась сама в себя.
    if (!riverLinked) return false;
    for (let e = 0; e < 4; e++) {
      if (edgeType(type, rot, e) !== 'W') continue;
      const ox = x + DIRS[e][0], oy = y + DIRS[e][1];
      if (board[key(ox, oy)]) continue;
      for (const [dx, dy] of DIRS) {
        const nx = ox + dx, ny = oy + dy;
        if ((nx !== x || ny !== y) && board[key(nx, ny)]) return false;
      }
    }
  }
  return hasNeighbor;
}

export function placements(board, type) {
  const spots = new Set();
  for (const k of Object.keys(board)) {
    const [x, y] = unkey(k);
    for (const [dx, dy] of DIRS) if (!board[key(x + dx, y + dy)]) spots.add(key(x + dx, y + dy));
  }
  const res = [];
  for (const s of spots) {
    const [x, y] = unkey(s);
    for (let r = 0; r < 4; r++) if (canPlace(board, type, r, x, y)) res.push({ x, y, r });
  }
  return res;
}

// Связная область (город/дорога/поле/монастырь) начиная с признака fi тайла в (x,y).
export function component(board, x, y, fi) {
  const start = board[key(x, y)];
  const f0 = features(start.t, start.r)[fi];
  if (f0.t === 'monastery') {
    let n = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (board[key(x + dx, y + dy)]) n++;
    const meeples = start.m && start.m.f === fi ? [{ k: key(x, y), ...start.m }] : [];
    return { t: 'monastery', id: key(x, y) + ':' + fi, members: [{ k: key(x, y), f: fi }], tiles: n, open: n < 9, meeples, builders: [], shields: 0, goods: {} };
  }
  const seen = new Set();
  const stack = [[x, y, fi]];
  const members = [], meeples = [], builders = [];
  const tiles = new Set();
  const goods = {};
  let open = false, shields = 0, inn = false, cathedral = false;
  while (stack.length) {
    const [cx, cy, cf] = stack.pop();
    const id = key(cx, cy) + ':' + cf;
    if (seen.has(id)) continue;
    seen.add(id);
    const k = key(cx, cy);
    const tile = board[k];
    const f = features(tile.t, tile.r)[cf];
    members.push({ k, f: cf });
    tiles.add(k);
    if (f.shield) shields++;
    if (f.inn) inn = true;
    if (f.cathedral) cathedral = true;
    if (f.goods) goods[f.goods] = (goods[f.goods] || 0) + 1;
    if (tile.m && tile.m.f === cf) meeples.push({ k, ...tile.m });
    if (tile.b && tile.b.f === cf) builders.push({ k, ...tile.b });
    for (const port of f.e) {
      const edge = f.t === 'field' ? port >> 1 : port;
      const nx = cx + DIRS[edge][0], ny = cy + DIRS[edge][1];
      const n = board[key(nx, ny)];
      if (!n) { open = true; continue; }
      const want = f.t === 'field' ? oppPort(port) : oppEdge(port);
      const nfi = features(n.t, n.r).findIndex(g => g.t === f.t && g.e.includes(want));
      if (nfi >= 0) stack.push([nx, ny, nfi]);
    }
  }
  const id = members.map(m => m.k + ':' + m.f).sort()[0];
  return { t: f0.t, id, members, tiles: tiles.size, open, meeples, builders, shields, inn, cathedral, goods };
}

// Какие признаки только что положенного тайла можно занять фишкой.
export function meepleOptions(board, x, y) {
  const tile = board[key(x, y)];
  return features(tile.t, tile.r)
    .map((f, i) => i)
    .filter(i => features(tile.t, tile.r)[i].t !== 'river' && component(board, x, y, i).meeples.length === 0);
}

// Куда можно поставить строителя: дорога/город, где уже стоит своя фишка.
export function builderOptions(board, x, y, player) {
  const tile = board[key(x, y)];
  return features(tile.t, tile.r)
    .map((f, i) => i)
    .filter(i => {
      const f = features(tile.t, tile.r)[i];
      if (f.t !== 'road' && f.t !== 'city') return false;
      const c = component(board, x, y, i);
      return c.builders.length === 0 && c.meeples.some(m => m.p === player);
    });
}

// Какие фигуры игрок может поставить на признак fi положенного тайла (в порядке перебора).
export function figureKinds(state, board, x, y, fi, player) {
  const p = state.players[player];
  const kinds = [];
  if (meepleOptions(board, x, y).includes(fi)) {
    if (p.meeples > 0) kinds.push('meeple');
    if (p.big > 0) kinds.push('big');
  }
  if (p.builder > 0 && builderOptions(board, x, y, player).includes(fi)) kinds.push('builder');
  return kinds;
}

function majority(meeples) {
  const cnt = {};
  for (const m of meeples) cnt[m.p] = (cnt[m.p] || 0) + (m.big ? 2 : 1);
  const max = Math.max(0, ...Object.values(cnt));
  return Object.keys(cnt).filter(p => cnt[p] === max).map(Number);
}

const NAMES = { city: 'город', road: 'дорогу', monastery: 'монастырь', field: 'поле' };

function award(state, comp, pts, final) {
  const winners = majority(comp.meeples);
  for (const w of winners) state.players[w].score += pts;
  if (winners.length && pts > 0) {
    const who = winners.map(w => state.players[w].name).join(', ');
    const extra = comp.inn ? ' с трактиром' : comp.cathedral ? ' с собором' : '';
    state.log.push(`${who}: +${pts} за ${NAMES[comp.t]}${extra}${final ? ' (не закончен)' : ''}`);
  }
}

function returnFigures(state, comp) {
  for (const m of comp.meeples) {
    state.board[m.k].m = null;
    if (m.big) state.players[m.p].big++;
    else state.players[m.p].meeples++;
  }
  for (const b of comp.builders) {
    state.board[b.k].b = null;
    state.players[b.p].builder++;
  }
}

function scoreValue(comp, complete) {
  if (comp.t === 'city') {
    if (comp.cathedral) return complete ? 3 * (comp.tiles + comp.shields) : 0;
    return (complete ? 2 : 1) * (comp.tiles + comp.shields);
  }
  if (comp.t === 'road') return comp.inn ? (complete ? 2 * comp.tiles : 0) : comp.tiles;
  if (comp.t === 'monastery') return comp.tiles;
  return 0;
}

export function applyTurn(state, player, { x, y, r, f, kind = 'meeple' }) {
  if (state.phase !== 'play') throw new Error('Игра не идёт');
  if (player !== state.turn) throw new Error('Сейчас не ваш ход');
  const type = state.current;
  if (!canPlace(state.board, type, r, x, y)) throw new Error('Сюда нельзя положить тайл');
  const k = key(x, y);
  const P = state.players[player];
  state.board[k] = { t: type, r, m: null };
  if (f != null && !figureKinds(state, state.board, x, y, f, player).includes(kind)) {
    delete state.board[k];
    throw new Error('Сюда нельзя поставить эту фигуру');
  }
  const fs = features(type, r);

  // Строитель: тайл продолжает дорогу/город, где стоит ваш строитель → доп. ход.
  let extra = false;
  if (!state.bonus) {
    fs.forEach((ft, i) => {
      if ((ft.t === 'road' || ft.t === 'city') && component(state.board, x, y, i).builders.some(b => b.p === player)) extra = true;
    });
  }

  if (f != null) {
    if (kind === 'builder') { state.board[k].b = { f, p: player }; P.builder--; }
    else if (kind === 'big') { state.board[k].m = { f, p: player, big: true }; P.big--; }
    else { state.board[k].m = { f, p: player }; P.meeples--; }
  }
  state.last = k;
  state.log.push(`${P.name} кладёт тайл`);

  // Подсчёт завершённых городов, дорог и монастырей.
  const done = new Set();
  fs.forEach((ft, i) => {
    if (ft.t !== 'city' && ft.t !== 'road') return;
    const c = component(state.board, x, y, i);
    if (done.has(c.id) || c.open) return;
    done.add(c.id);
    award(state, c, scoreValue(c, true), false);
    const n = Object.values(c.goods).reduce((a, b) => a + b, 0);
    if (n) {
      for (const [g, cnt] of Object.entries(c.goods)) P.goods[g] += cnt;
      state.log.push(`${P.name} получает товары: ` + Object.entries(c.goods).map(([g, cnt]) => `${GOODS[g]} ×${cnt}`).join(', '));
    }
    returnFigures(state, c);
  });
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const t = state.board[key(x + dx, y + dy)];
    if (!t) continue;
    features(t.t, t.r).forEach((ft, i) => {
      if (ft.t !== 'monastery') return;
      const c = component(state.board, x + dx, y + dy, i);
      if (c.open) return;
      award(state, c, 9, false);
      returnFigures(state, c);
    });
  }

  if (extra) {
    state.bonus = true;
    state.log.push(`${P.name}: строитель даёт дополнительный ход!`);
  } else {
    state.bonus = false;
    state.turn = (state.turn + 1) % state.players.length;
  }
  drawTile(state);
  if (!state.current) finalScoring(state);
  state.seq++;
}

function drawTile(state) {
  state.current = null;
  while (state.deck.length) {
    const t = state.deck.pop();
    if (placements(state.board, t).length) { state.current = t; return; }
    state.log.push('Тайл некуда положить — он сброшен');
  }
}

function finalScoring(state) {
  state.phase = 'end';
  state.log.push('Тайлы закончились — финальный подсчёт');
  const done = new Set();
  // Незавершённые объекты.
  for (const [k, t] of Object.entries(state.board)) {
    if (!t.m) continue;
    const [x, y] = unkey(k);
    const c = component(state.board, x, y, t.m.f);
    if (done.has(c.id)) continue;
    done.add(c.id);
    if (c.t === 'field') continue;
    award(state, c, scoreValue(c, false), true);
  }
  // Поля: 3 очка за каждый завершённый соседний город.
  done.clear();
  for (const [k, t] of Object.entries(state.board)) {
    if (!t.m) continue;
    const [x, y] = unkey(k);
    const c = component(state.board, x, y, t.m.f);
    if (c.t !== 'field' || done.has(c.id)) continue;
    done.add(c.id);
    const cities = new Set();
    for (const m of c.members) {
      const tile = state.board[m.k];
      const [mx, my] = unkey(m.k);
      for (const ci of features(tile.t, tile.r)[m.f].adj) {
        const city = component(state.board, mx, my, ci);
        if (!city.open) cities.add(city.id);
      }
    }
    const pts = 3 * cities.size;
    const winners = majority(c.meeples);
    for (const w of winners) state.players[w].score += pts;
    if (winners.length && pts) state.log.push(`${winners.map(w => state.players[w].name).join(', ')}: +${pts} за поле (${cities.size} гор.)`);
  }
  // Товары: +10 за большинство каждого вида.
  if (state.opts && state.opts.traders) {
    for (const g of Object.keys(GOODS)) {
      const max = Math.max(...state.players.map(p => p.goods[g]));
      if (!max) continue;
      const ws = state.players.filter(p => p.goods[g] === max);
      for (const p of ws) p.score += 10;
      state.log.push(`${ws.map(p => p.name).join(', ')}: +10 за больше всего товара «${GOODS[g]}»`);
    }
  }
  const best = Math.max(...state.players.map(p => p.score));
  state.log.push('Победитель: ' + state.players.filter(p => p.score === best).map(p => p.name).join(', ') + '!');
}

export { key, unkey };
