// Правила игры. Состояние — простой JSON, чтобы его можно было пересылать по сети.
import { features, edgeType, buildDeck, START_TILE } from './tiles.js';

export const COLORS = ['#d33c3c', '#2f6fd6', '#e0b419', '#2fa34a', '#222222', '#c561d6'];
export const COLOR_NAMES = ['красный', 'синий', 'жёлтый', 'зелёный', 'чёрный', 'розовый'];
export const MEEPLES = 7;

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const key = (x, y) => x + ',' + y;
const unkey = k => k.split(',').map(Number);
const oppEdge = e => (e + 2) % 4;
const oppPort = p => ((p >> 1) % 2 === 0 ? (13 - p) : (9 - p)) % 8;

export function newGame(players) {
  const board = {};
  board[key(0, 0)] = { t: START_TILE, r: 0, m: null };
  const state = {
    phase: 'play',
    players: players.map((p, i) => ({ ...p, color: COLORS[i], score: 0, meeples: MEEPLES })),
    board,
    deck: buildDeck(),
    current: null,
    turn: 0,
    log: ['Игра началась!'],
    last: key(0, 0),
    seq: 0,
  };
  drawTile(state);
  return state;
}

export function canPlace(board, type, rot, x, y) {
  if (board[key(x, y)]) return false;
  let hasNeighbor = false;
  for (let e = 0; e < 4; e++) {
    const n = board[key(x + DIRS[e][0], y + DIRS[e][1])];
    if (!n) continue;
    hasNeighbor = true;
    if (edgeType(type, rot, e) !== edgeType(n.t, n.r, oppEdge(e))) return false;
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

// Связная область (город/дорога/поле) начиная с признака fi тайла в (x,y).
export function component(board, x, y, fi) {
  const start = board[key(x, y)];
  const f0 = features(start.t, start.r)[fi];
  if (f0.t === 'monastery') {
    let n = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (board[key(x + dx, y + dy)]) n++;
    const meeples = start.m && start.m.f === fi ? [{ k: key(x, y), f: fi, p: start.m.p }] : [];
    return { t: 'monastery', id: key(x, y) + ':' + fi, members: [{ k: key(x, y), f: fi }], tiles: n, open: n < 9, meeples, shields: 0 };
  }
  const seen = new Set();
  const stack = [[x, y, fi]];
  const members = [];
  const tiles = new Set();
  const meeples = [];
  let open = false, shields = 0;
  while (stack.length) {
    const [cx, cy, cf] = stack.pop();
    const id = key(cx, cy) + ':' + cf;
    if (seen.has(id)) continue;
    seen.add(id);
    const tile = board[key(cx, cy)];
    const f = features(tile.t, tile.r)[cf];
    members.push({ k: key(cx, cy), f: cf });
    tiles.add(key(cx, cy));
    if (f.shield) shields++;
    if (tile.m && tile.m.f === cf) meeples.push({ k: key(cx, cy), f: cf, p: tile.m.p });
    for (const port of f.e) {
      const edge = f.t === 'field' ? port >> 1 : port;
      const nx = cx + DIRS[edge][0], ny = cy + DIRS[edge][1];
      const n = board[key(nx, ny)];
      if (!n) { open = true; continue; }
      const want = f.t === 'field' ? oppPort(port) : oppEdge(port);
      const nfs = features(n.t, n.r);
      const nfi = nfs.findIndex(g => g.t === f.t && g.e.includes(want));
      if (nfi >= 0) stack.push([nx, ny, nfi]);
    }
  }
  const id = members.map(m => m.k + ':' + m.f).sort()[0];
  return { t: f0.t, id, members, tiles: tiles.size, open, meeples, shields };
}

// Какие признаки только что положенного тайла можно занять фишкой.
export function meepleOptions(board, x, y) {
  const tile = board[key(x, y)];
  return features(tile.t, tile.r)
    .map((f, i) => i)
    .filter(i => component(board, x, y, i).meeples.length === 0);
}

function majority(meeples) {
  const cnt = {};
  for (const m of meeples) cnt[m.p] = (cnt[m.p] || 0) + 1;
  const max = Math.max(0, ...Object.values(cnt));
  return Object.keys(cnt).filter(p => cnt[p] === max).map(Number);
}

const NAMES = { city: 'город', road: 'дорогу', monastery: 'монастырь', field: 'поле' };

function award(state, comp, pts, final) {
  const winners = majority(comp.meeples);
  for (const w of winners) state.players[w].score += pts;
  if (winners.length && pts > 0) {
    const who = winners.map(w => state.players[w].name).join(', ');
    state.log.push(`${who}: +${pts} за ${NAMES[comp.t]}${final ? ' (не закончен)' : ''}`);
  }
}

function returnMeeples(state, comp) {
  for (const m of comp.meeples) {
    state.board[m.k].m = null;
    state.players[m.p].meeples++;
  }
}

function scoreValue(comp, complete) {
  if (comp.t === 'city') return (complete ? 2 : 1) * (comp.tiles + comp.shields);
  if (comp.t === 'road') return comp.tiles;
  if (comp.t === 'monastery') return comp.tiles;
  return 0;
}

export function applyTurn(state, player, { x, y, r, f }) {
  if (state.phase !== 'play') throw new Error('Игра не идёт');
  if (player !== state.turn) throw new Error('Сейчас не ваш ход');
  const type = state.current;
  if (!canPlace(state.board, type, r, x, y)) throw new Error('Сюда нельзя положить тайл');
  const k = key(x, y);
  state.board[k] = { t: type, r, m: null };
  if (f != null) {
    if (state.players[player].meeples <= 0) throw new Error('Нет свободных фишек');
    if (!meepleOptions(state.board, x, y).includes(f)) { delete state.board[k]; throw new Error('Эта область уже занята'); }
    state.board[k].m = { f, p: player };
    state.players[player].meeples--;
  }
  state.last = k;
  state.log.push(`${state.players[player].name} кладёт тайл`);

  // Подсчёт завершённых городов, дорог и монастырей.
  const done = new Set();
  const fs = features(type, r);
  fs.forEach((ft, i) => {
    if (ft.t !== 'city' && ft.t !== 'road') return;
    const c = component(state.board, x, y, i);
    if (done.has(c.id) || c.open) return;
    done.add(c.id);
    award(state, c, scoreValue(c, true), false);
    returnMeeples(state, c);
  });
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const t = state.board[key(x + dx, y + dy)];
    if (!t) continue;
    features(t.t, t.r).forEach((ft, i) => {
      if (ft.t !== 'monastery') return;
      const c = component(state.board, x + dx, y + dy, i);
      if (c.open) return;
      award(state, c, 9, false);
      returnMeeples(state, c);
    });
  }

  state.turn = (state.turn + 1) % state.players.length;
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
  const cityDone = new Map();
  const isCityComplete = (k, fi) => {
    const [x, y] = unkey(k);
    const c = component(state.board, x, y, fi);
    cityDone.set(c.id, !c.open);
    return c.open ? null : c.id;
  };
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
      for (const ci of features(tile.t, tile.r)[m.f].adj) {
        const id = isCityComplete(m.k, ci);
        if (id) cities.add(id);
      }
    }
    const pts = 3 * cities.size;
    const winners = majority(c.meeples);
    for (const w of winners) state.players[w].score += pts;
    if (winners.length && pts) state.log.push(`${winners.map(w => state.players[w].name).join(', ')}: +${pts} за поле (${cities.size} гор.)`);
  }
  const best = Math.max(...state.players.map(p => p.score));
  state.log.push('Победитель: ' + state.players.filter(p => p.score === best).map(p => p.name).join(', ') + '!');
}

export { key, unkey };
