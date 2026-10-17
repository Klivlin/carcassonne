// Правила игры. Состояние — простой JSON, чтобы его можно было пересылать по сети.
import { TILES, features, edgeType, buildDeck, startTile, isRiver, GOODS } from './tiles.js?v=4';

export const COLORS = ['#d33c3c', '#2f6fd6', '#e0b419', '#2fa34a', '#222222', '#c561d6'];
export const MEEPLES = 7;
export const DRAGON_STEPS = 6;

export const MODES = {
  river: { icon: '🌊', name: 'Река', desc: 'Партия начинается с 12 тайлов реки — они выкладываются первыми, от истока до озера. Два поворота в одну сторону подряд нельзя.' },
  inns: { icon: '🍺', name: 'Трактиры и соборы', desc: 'Трактир удваивает очки дороги, собор даёт 3 очка за тайл города — но если к концу игры они не достроены, то 0. У каждого есть большая фишка, она считается за две.' },
  traders: { icon: '🔨', name: 'Купцы и строители', desc: 'В городах есть товары: вино, зерно, ткань. Их забирает тот, кто завершил город, а в конце за большинство каждого товара +10. Строитель даёт доп. ход, когда вы снова достраиваете его дорогу или город. Свинья на поле с вашим крестьянином даёт 4 очка за город вместо 3.' },
  dragon: { icon: '🐉', name: 'Принцесса и дракон', desc: 'Из вулкана появляется дракон: тайл с драконом заставляет его пролететь 6 клеток и съесть все фигуры на пути. Через портал можно поставить фишку на любой свободный объект поля, а принцесса выгоняет рыцаря из города.' },
  quick: { icon: '⚡', name: 'Быстрая партия', desc: 'Колода вдвое меньше — партия минут на 15.' },
};

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const key = (x, y) => x + ',' + y;
const unkey = k => k.split(',').map(Number);
const oppEdge = e => (e + 2) % 4;
const oppPort = p => ((p >> 1) % 2 === 0 ? (13 - p) : (9 - p)) % 8;
const uid = () => Math.random().toString(36).slice(2, 10);

export function newGame(players, opts = {}) {
  const board = {};
  board[key(0, 0)] = { t: startTile(opts), r: 0, m: null };
  const state = {
    gid: uid(),
    born: Date.now(),
    phase: 'play',
    opts,
    players: players.map((p, i) => ({
      name: p.name, key: p.key, color: COLORS[i], score: 0, meeples: MEEPLES,
      big: opts.inns ? 1 : 0,
      builder: opts.traders ? 1 : 0,
      pig: opts.traders ? 1 : 0,
      goods: { wine: 0, grain: 0, cloth: 0 },
    })),
    board,
    deck: buildDeck(opts),
    current: null,
    turn: 0,
    bonus: false,
    dragon: null,       // клетка, где стоит дракон
    dragonMove: null,   // { left, visited, player, extra } — дракон летит
    riverLast: null,    // направление последнего поворота реки: 'L' | 'R'
    events: [],         // что начислено последним ходом (для анимации)
    log: ['Игра началась!'],
    last: key(0, 0),
    seq: 0,
  };
  drawTile(state);
  return state;
}

// Поворот реки на этом тайле относительно направления течения: 'L', 'R' или null.
export function riverTurn(board, type, rot, x, y) {
  if (!isRiver(type)) return null;
  const edges = [0, 1, 2, 3].filter(e => edgeType(type, rot, e) === 'W');
  const eIn = edges.find(e => board[key(x + DIRS[e][0], y + DIRS[e][1])]);
  const eOut = edges.find(e => e !== eIn);
  if (eIn == null || eOut == null) return null;
  const h = oppEdge(eIn);
  return eOut === (h + 1) % 4 ? 'R' : eOut === (h + 3) % 4 ? 'L' : null;
}

export function canPlace(board, type, rot, x, y, riverLast = null) {
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
    // Два поворота в одну сторону подряд запрещены.
    const turn = riverTurn(board, type, rot, x, y);
    if (turn && turn === riverLast) return false;
  }
  return hasNeighbor;
}

export function placements(board, type, riverLast = null) {
  const spots = new Set();
  for (const k of Object.keys(board)) {
    const [x, y] = unkey(k);
    for (const [dx, dy] of DIRS) if (!board[key(x + dx, y + dy)]) spots.add(key(x + dx, y + dy));
  }
  const res = [];
  for (const s of spots) {
    const [x, y] = unkey(s);
    for (let r = 0; r < 4; r++) if (canPlace(board, type, r, x, y, riverLast)) res.push({ x, y, r });
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
    return { t: 'monastery', id: key(x, y) + ':' + fi, members: [{ k: key(x, y), f: fi }], tiles: n, open: n < 9, meeples, builders: [], pigs: [], shields: 0, goods: {} };
  }
  const seen = new Set();
  const stack = [[x, y, fi]];
  const members = [], meeples = [], builders = [], pigs = [];
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
    if (tile.pg && tile.pg.f === cf) pigs.push({ k, ...tile.pg });
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
  return { t: f0.t, id, members, tiles: tiles.size, open, meeples, builders, pigs, shields, inn, cathedral, goods };
}

// Сколько очков объект принёс бы сейчас и кто в нём главный — для подсказки.
export function describe(state, x, y, fi) {
  const c = component(state.board, x, y, fi);
  let now = 0, done = null;
  if (c.t === 'field') {
    const cities = new Set();
    for (const m of c.members) {
      const tile = state.board[m.k];
      const [mx, my] = unkey(m.k);
      for (const ci of features(tile.t, tile.r)[m.f].adj) {
        const city = component(state.board, mx, my, ci);
        if (!city.open) cities.add(city.id);
      }
    }
    c.cities = cities.size;
    now = 3 * cities.size;
  } else {
    now = c.open ? scoreValue(c, false) : scoreValue(c, true);
    done = c.open ? (c.t === 'monastery' ? 9 : scoreValue({ ...c }, true)) : null;
  }
  return { ...c, now, done, leaders: majority(c.meeples) };
}

// Какие признаки только что положенного тайла можно занять фишкой.
export function meepleOptions(board, x, y) {
  const tile = board[key(x, y)];
  if (TILES[tile.t].volcano) return [];
  return features(tile.t, tile.r)
    .map((f, i) => i)
    .filter(i => features(tile.t, tile.r)[i].t !== 'river' && component(board, x, y, i).meeples.length === 0);
}

// Куда можно поставить строителя: дорога/город, где уже стоит своя фишка.
function builderOk(board, x, y, i, player) {
  const tile = board[key(x, y)];
  const f = features(tile.t, tile.r)[i];
  if (f.t !== 'road' && f.t !== 'city') return false;
  const c = component(board, x, y, i);
  return c.builders.length === 0 && c.meeples.some(m => m.p === player);
}

// Свинья: на поле, где уже стоит свой крестьянин.
function pigOk(board, x, y, i, player) {
  const tile = board[key(x, y)];
  if (features(tile.t, tile.r)[i].t !== 'field') return false;
  const c = component(board, x, y, i);
  return c.meeples.some(m => m.p === player) && !c.pigs.some(p => p.p === player);
}

// Какие фигуры игрок может поставить на признак fi положенного тайла (в порядке перебора).
export function figureKinds(state, board, x, y, fi, player) {
  const p = state.players[player];
  const kinds = [];
  if (TILES[board[key(x, y)].t].volcano) return kinds;
  if (meepleOptions(board, x, y).includes(fi)) {
    if (p.meeples > 0) kinds.push('meeple');
    if (p.big > 0) kinds.push('big');
  }
  if (p.builder > 0 && builderOk(board, x, y, fi, player)) kinds.push('builder');
  if (p.pig > 0 && pigOk(board, x, y, fi, player)) kinds.push('pig');
  return kinds;
}

// Портал: свободные незавершённые объекты на всём поле (кроме клетки с драконом).
export function portalTargets(state, board, placedKey) {
  const res = [];
  for (const [k, t] of Object.entries(board)) {
    // На тайле помещается одна фишка, поэтому тайлы с фишкой пропускаем.
    if (k === placedKey || k === state.dragon || TILES[t.t].volcano || t.m) continue;
    const [x, y] = unkey(k);
    features(t.t, t.r).forEach((f, i) => {
      if (f.t === 'river') return;
      const c = component(board, x, y, i);
      if (c.meeples.length || (!c.open && f.t !== 'field')) return;
      res.push({ k, f: i });
    });
  }
  return res;
}

// Принцесса: рыцари в городе с принцессой на положенном тайле, которых можно выгнать.
export function princessTargets(board, x, y) {
  const tile = board[key(x, y)];
  const res = [];
  features(tile.t, tile.r).forEach((f, i) => {
    if (f.t !== 'city' || !f.princess) return;
    for (const m of component(board, x, y, i).meeples) res.push({ k: m.k, f: m.f });
  });
  return res;
}

export function dragonOptions(state) {
  const dm = state.dragonMove;
  if (!dm || !state.dragon) return [];
  const [x, y] = unkey(state.dragon);
  return DIRS.map(([dx, dy]) => key(x + dx, y + dy))
    .filter(k => state.board[k] && !dm.visited.includes(k));
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
  pushEvent(state, comp, winners, pts, final);
}

function pushEvent(state, comp, winners, pts, final) {
  state.events.push({ t: comp.t, tiles: [...new Set(comp.members.map(m => m.k))], players: winners, pts, final });
}

function returnFigure(state, k, what) {
  const t = state.board[k];
  const fig = t[what];
  if (!fig) return;
  const P = state.players[fig.p];
  if (what === 'b') P.builder++;
  else if (what === 'pg') P.pig++;
  else if (fig.big) P.big++;
  else P.meeples++;
  t[what] = null;
}

function returnFigures(state, comp) {
  for (const m of comp.meeples) returnFigure(state, m.k, 'm');
  for (const b of comp.builders) returnFigure(state, b.k, 'b');
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

export function applyTurn(state, player, move) {
  const { x, y, r, f, kind = 'meeple', at, princess } = move;
  if (state.phase !== 'play') throw new Error('Игра не идёт');
  if (state.dragonMove) throw new Error('Сначала нужно передвинуть дракона');
  if (player !== state.turn) throw new Error('Сейчас не ваш ход');
  const type = state.current;
  const def = TILES[type];
  if (!canPlace(state.board, type, r, x, y, state.riverLast)) throw new Error('Сюда нельзя положить тайл');
  const k = key(x, y);
  const P = state.players[player];
  state.board[k] = { t: type, r, m: null };
  const fail = msg => { delete state.board[k]; throw new Error(msg); };
  const target = at && at !== k ? at : k;
  if (princess) {
    if (!princessTargets(state.board, x, y).some(t => t.k === princess.k && t.f === princess.f)) fail('Принцесса не может выгнать эту фишку');
  } else if (f != null) {
    if (target === k) {
      if (!figureKinds(state, state.board, x, y, f, player).includes(kind)) fail('Сюда нельзя поставить эту фигуру');
    } else {
      if (!def.portal) fail('Ставить фишку в другое место можно только через портал');
      if (!portalTargets(state, state.board, k).some(t => t.k === target && t.f === f)) fail('Через портал сюда нельзя');
      if (!(kind === 'meeple' && P.meeples > 0) && !(kind === 'big' && P.big > 0)) fail('Нет свободной фишки');
    }
  }
  const turn = riverTurn(state.board, type, r, x, y);
  if (turn) state.riverLast = turn;
  state.events = [];
  const fs = features(type, r);

  // Строитель: тайл продолжает дорогу/город, где стоит ваш строитель → доп. ход.
  let extra = false;
  if (!state.bonus) {
    fs.forEach((ft, i) => {
      if ((ft.t === 'road' || ft.t === 'city') && component(state.board, x, y, i).builders.some(b => b.p === player)) extra = true;
    });
  }

  state.last = k;
  state.log.push(`${P.name} кладёт тайл`);
  if (princess) {
    const victim = state.board[princess.k].m;
    returnFigure(state, princess.k, 'm');
    state.log.push(`👸 Принцесса выгоняет рыцаря игрока ${state.players[victim.p].name}`);
  } else if (f != null) {
    const T = state.board[target];
    if (kind === 'builder') { T.b = { f, p: player }; P.builder--; }
    else if (kind === 'pig') { T.pg = { f, p: player }; P.pig--; }
    else if (kind === 'big') { T.m = { f, p: player, big: true }; P.big--; }
    else { T.m = { f, p: player }; P.meeples--; }
    if (target !== k) state.log.push(`🌀 ${P.name} проходит через портал`);
  }

  // Подсчёт завершённых городов, дорог и монастырей (в т.ч. там, куда поставили через портал).
  scoreCompleted(state, x, y, fs, player);

  if (def.volcano) {
    state.dragon = k;
    state.log.push('🌋 Из вулкана появляется дракон!');
  }
  if (def.dragon && state.dragon && !def.volcano) {
    state.dragonMove = { left: DRAGON_STEPS, visited: [state.dragon], player, extra };
    state.log.push(`🐉 Дракон просыпается — ${P.name} ведёт его`);
    if (!dragonOptions(state).length) endDragon(state);
  } else nextTurn(state, extra);
  state.seq++;
}

function scoreCompleted(state, x, y, fs, player) {
  const P = state.players[player];
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
      if (c.open || !c.meeples.length) return;
      award(state, c, 9, false);
      returnFigures(state, c);
    });
  }
}

function nextTurn(state, extra) {
  if (extra) {
    state.bonus = true;
    state.log.push(`${state.players[state.turn].name}: строитель даёт дополнительный ход!`);
  } else {
    state.bonus = false;
    state.turn = (state.turn + 1) % state.players.length;
  }
  drawTile(state);
  if (!state.current) finalScoring(state);
}

// Ход дракона на соседнюю клетку: съедает все фигуры на ней.
export function applyDragon(state, player, to) {
  const dm = state.dragonMove;
  if (!dm) throw new Error('Дракон сейчас не летит');
  if (player !== dm.player) throw new Error('Дракона ведёт другой игрок');
  if (!dragonOptions(state).includes(to)) throw new Error('Дракон не может туда полететь');
  state.events = [];
  state.dragon = to;
  dm.visited.push(to);
  dm.left--;
  const t = state.board[to];
  const eaten = [];
  for (const what of ['m', 'b', 'pg']) {
    if (!t[what]) continue;
    eaten.push(state.players[t[what].p].name);
    returnFigure(state, to, what);
  }
  if (eaten.length) {
    state.log.push(`🐉 Дракон съедает фигуры: ${eaten.join(', ')}`);
    state.events.push({ t: 'dragon', tiles: [to], players: [], pts: 0 });
  }
  if (dm.left <= 0 || !dragonOptions(state).length) endDragon(state);
  state.seq++;
}

function endDragon(state) {
  const extra = state.dragonMove.extra;
  state.dragonMove = null;
  state.log.push('🐉 Дракон засыпает');
  nextTurn(state, extra);
}

// Пропуск хода игрока, который вышел из игры: тайл достанется следующему.
export function skipTurn(state) {
  if (state.phase !== 'play') return;
  const P = state.players[state.turn];
  state.events = [];
  if (state.dragonMove) {
    state.log.push(`${P.name} не в сети — дракон засыпает`);
    endDragon(state);
  } else {
    state.log.push(`${P.name} не в сети — ход пропущен`);
    state.bonus = false;
    state.turn = (state.turn + 1) % state.players.length;
  }
  state.seq++;
}

function drawTile(state) {
  state.current = null;
  while (state.deck.length) {
    const t = state.deck.pop();
    if (placements(state.board, t, state.riverLast).length) { state.current = t; return; }
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
  // Поля: 3 очка за каждый завершённый соседний город (4 со своей свиньёй).
  done.clear();
  for (const [k, t] of Object.entries(state.board)) {
    if (!t.m) continue;
    const [x, y] = unkey(k);
    const c = describe(state, x, y, t.m.f);
    if (c.t !== 'field' || done.has(c.id)) continue;
    done.add(c.id);
    for (const w of c.leaders) {
      const pts = (c.pigs.some(p => p.p === w) ? 4 : 3) * c.cities;
      state.players[w].score += pts;
      if (pts) state.log.push(`${state.players[w].name}: +${pts} за поле (${c.cities} гор.${pts / c.cities === 4 ? ', со свиньёй' : ''})`);
    }
    pushEvent(state, c, c.leaders, 3 * c.cities, true);
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
