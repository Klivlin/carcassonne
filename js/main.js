import { features } from './tiles.js';
import { newGame, placements, canPlace, applyTurn, figureKinds, key, unkey, COLORS, MODES } from './game.js';
import { drawTile, drawFigure } from './render.js';
import * as net from './net.js';

const $ = s => document.querySelector(s);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};
const uid = () => Math.random().toString(36).slice(2, 10);

const app = {
  mode: 'menu',          // menu | lobby | game
  kind: null,            // host | guest | local
  code: null,
  myKey: store.get('carc-key') || uid(),
  lobby: [],
  online: new Set(),
  state: null,
  conn: null,
  view: { x: 0.5, y: 0.5, z: 1 },
  rot: 0,
  tent: null,            // { x, y, r, f }
  hover: null,           // клетка под курсором { x, y }
  ghost: null,           // что сейчас делает соперник: { key, seq, tent, hover }
  finalShown: false,
  opts: store.get('carc-opts') || {},  // включённые дополнения
};
store.set('carc-key', app.myKey);

// ---------- Экраны ----------
function show(mode) {
  app.mode = mode;
  for (const id of ['menu', 'lobby', 'game']) $('#' + id).classList.toggle('hidden', id !== mode);
  if (mode === 'game') resize();
}

function myName() {
  const n = $('#name').value.trim();
  store.set('carc-name', n);
  return n;
}

function initMenu() {
  $('#name').value = store.get('carc-name') || '';
  renderModes($('#modes'), true);
  const box = $('#local-names');
  const saved = store.get('carc-local-names') || ['', ''];
  for (let i = 0; i < 6; i++) {
    const inp = document.createElement('input');
    inp.placeholder = `Игрок ${i + 1}`;
    inp.value = saved[i] || '';
    inp.maxLength = 16;
    box.append(inp);
  }
  const room = new URLSearchParams(location.search).get('room');
  if (room) $('#code').value = room.toUpperCase();

  const resume = $('#resume');
  const h = store.get('carc-host');
  if (h && h.state && h.state.phase !== 'end') {
    const b = document.createElement('button');
    b.textContent = `Продолжить онлайн-игру (комната ${h.code})`;
    b.onclick = () => startHost(h);
    resume.append(b);
  }
  const l = store.get('carc-local');
  if (l && l.phase !== 'end') {
    const b = document.createElement('button');
    b.textContent = 'Продолжить игру на одном устройстве';
    b.onclick = () => startLocal(l);
    resume.append(b);
  }

  $('#btn-host').onclick = () => {
    if (!myName()) return menuMsg('Введите имя');
    startHost(null);
  };
  $('#btn-join').onclick = () => {
    const code = $('#code').value.trim().toUpperCase();
    if (!myName()) return menuMsg('Введите имя');
    if (code.length !== 5) return menuMsg('Код комнаты — 5 символов');
    startGuest(code);
  };
  $('#code').onkeydown = e => { if (e.key === 'Enter') $('#btn-join').click(); };
  $('#btn-local').onclick = () => {
    const names = [...box.querySelectorAll('input')].map(i => i.value.trim());
    store.set('carc-local-names', names);
    const ps = names.filter(Boolean);
    if (ps.length < 2) return menuMsg('Нужно минимум 2 игрока');
    startLocal(newGame(ps.map(name => ({ name, key: uid() })), app.opts));
  };
}
// Переключатели дополнений. editable=false — только просмотр (гость в лобби).
function renderModes(box, editable) {
  box.replaceChildren(...Object.entries(MODES).map(([id, m]) => {
    const label = document.createElement('label');
    label.className = 'mode' + (app.opts[id] ? ' on' : '');
    label.innerHTML = `<input type="checkbox"><span class="mi"></span><span><b></b><small></small></span>`;
    const cb = label.querySelector('input');
    cb.checked = !!app.opts[id];
    cb.disabled = !editable;
    label.querySelector('.mi').textContent = m.icon;
    label.querySelector('b').textContent = m.name;
    label.querySelector('small').textContent = m.desc;
    cb.onchange = () => {
      app.opts = { ...app.opts, [id]: cb.checked };
      store.set('carc-opts', app.opts);
      label.classList.toggle('on', cb.checked);
      if (app.kind === 'host' && !app.state) hostSync();
    };
    return label;
  }));
}

const modesText = opts => Object.entries(MODES).filter(([id]) => opts && opts[id]).map(([, m]) => m.icon + ' ' + m.name).join(' · ');

const menuMsg = t => { $('#menu-msg').textContent = t; };

// ---------- Режимы ----------
function startLocal(state) {
  app.kind = 'local';
  app.state = state;
  store.set('carc-local', state);
  app.finalShown = false;
  show('game');
  fitView();
  update();
}

function startHost(saved) {
  app.kind = 'host';
  app.code = saved ? saved.code : net.randomCode();
  app.lobby = saved ? saved.lobby : [{ name: myName(), key: app.myKey }];
  app.state = saved ? saved.state : null;
  app.finalShown = false;
  history.replaceState(null, '', '?room=' + app.code);
  app.conn = net.host(app.code, {
    onReady: () => { lobbyMsg(''); hostSync(); },
    onError: e => { lobbyMsg('Ошибка сети: ' + e.message); gameMsg('Ошибка сети: ' + e.message); },
    onLeave: () => hostSync(),
    onLive,
    onMessage: (k, msg) => {
      if (msg.type === 'hello') {
        const inGame = app.state && app.state.players.some(p => p.key === k);
        if (!app.state && !app.lobby.some(p => p.key === k)) {
          if (app.lobby.length >= 6) return app.conn.send(k, { type: 'error', msg: 'Комната заполнена (максимум 6 игроков)' });
          app.lobby.push({ name: msg.name, key: k });
        } else if (app.state && !inGame) {
          app.conn.send(k, { type: 'error', msg: 'Игра уже началась — вы смотрите как зритель' });
        }
        hostSync();
      } else if (msg.type === 'move') {
        const idx = app.state ? app.state.players.findIndex(p => p.key === k) : -1;
        try { applyTurn(app.state, idx, msg.move); hostSync(); }
        catch (e) { app.conn.send(k, { type: 'error', msg: e.message }); hostSync(); }
      }
    },
  });
  lobbyMsg('Создаю комнату…');
  if (app.state) { show('game'); fitView(); } else show('lobby');
  update();
}

function hostSync() {
  app.online = app.conn ? app.conn.online() : new Set();
  app.online.add(app.myKey);
  store.set('carc-host', { code: app.code, lobby: app.lobby, state: app.state });
  app.conn && app.conn.broadcast({ type: 'sync', lobby: app.lobby, opts: app.opts, state: app.state, online: [...app.online] });
  if (app.state && app.mode !== 'game') { show('game'); fitView(); }
  update();
}

function startGuest(code) {
  app.kind = 'guest';
  app.code = code;
  app.state = null;
  app.lobby = [];
  app.finalShown = false;
  history.replaceState(null, '', '?room=' + code);
  show('lobby');
  app.conn = net.join(code, app.myKey, myName(), {
    onStatus: t => { lobbyMsg(t); gameMsg(t); },
    onLive,
    onMessage: msg => {
      if (msg.type === 'sync') {
        const prevSeq = app.state ? app.state.seq : -1;
        app.lobby = msg.lobby;
        if (msg.opts) app.opts = msg.opts;
        app.state = msg.state;
        app.online = new Set(msg.online);
        if (app.state && app.mode !== 'game') { show('game'); fitView(); }
        if (app.state && app.state.seq !== prevSeq) app.tent = null;
        update();
      } else if (msg.type === 'error') { gameMsg(msg.msg); lobbyMsg(msg.msg); }
    },
  });
  update();
}

// ---------- Живой показ хода соперника ----------
function onLive(msg) {
  if (msg.key === app.myKey) return;
  app.ghost = msg;
  drawPreview();
  draw();
}

let lastLive = '';
function sendLive() {
  if (app.kind === 'local' || !app.conn || !isMyTurn()) return;
  const msg = { key: app.myKey, seq: app.state.seq, tent: app.tent, hover: app.tent ? null : app.hover, rot: app.rot };
  const str = JSON.stringify(msg);
  if (str === lastLive) return;
  lastLive = str;
  app.conn.live(msg);
}

const lobbyMsg = t => { $('#lobby-msg').textContent = t; };
const gameMsg = t => { $('#game-msg').textContent = t; };

function leave() {
  if (app.conn) app.conn.destroy();
  app.conn = null;
  history.replaceState(null, '', location.pathname);
  location.reload();
}

// ---------- Ход ----------
const isMyTurn = () => app.state && app.state.phase === 'play' &&
  (app.kind === 'local' || app.state.players[app.state.turn].key === app.myKey);

let spotsCache = { seq: -1, list: [] };
function validSpots() {
  const s = app.state;
  const id = s.seq + ':' + s.current;
  if (spotsCache.seq !== id) spotsCache = { seq: id, list: placements(s.board, s.current) };
  return spotsCache.list;
}

const rotationsAt = (x, y) => [0, 1, 2, 3].filter(r => canPlace(app.state.board, app.state.current, r, x, y));

function tentBoard() {
  const b = { ...app.state.board };
  const t = app.tent;
  b[key(t.x, t.y)] = { t: app.state.current, r: t.r, m: null };
  return b;
}

// Какие фигуры можно поставить на каждый признак тайла-кандидата: { fi: [kinds] }.
function tentKinds() {
  if (!app.tent) return {};
  const b = tentBoard(), s = app.state, res = {};
  features(s.current, app.tent.r).forEach((f, i) => {
    const ks = figureKinds(s, b, app.tent.x, app.tent.y, i, s.turn);
    if (ks.length) res[i] = ks;
  });
  return res;
}
const tentOptions = () => Object.keys(tentKinds()).map(Number);

function rotate() {
  if (!isMyTurn()) return;
  if (app.tent) {
    const rs = rotationsAt(app.tent.x, app.tent.y);
    app.tent.r = rs[(rs.indexOf(app.tent.r) + 1) % rs.length];
    app.tent.f = null;
    app.tent.kind = null;
    app.rot = app.tent.r;
  } else app.rot = (app.rot + 1) % 4;
  update();
}

function endTurn() {
  if (!isMyTurn() || !app.tent) return;
  const move = { ...app.tent };
  gameMsg('');
  if (app.kind === 'guest') {
    app.conn.send({ type: 'move', move });
    return;
  }
  try {
    applyTurn(app.state, app.state.turn, move);
    app.tent = null;
    if (app.kind === 'host') hostSync();
    else { store.set('carc-local', app.state); update(); }
  } catch (e) { gameMsg(e.message); }
}

function clickCell(wx, wy) {
  if (!isMyTurn()) return;
  const gx = Math.floor(wx), gy = Math.floor(wy);
  const fx = wx - gx, fy = wy - gy;
  if (app.tent && app.tent.x === gx && app.tent.y === gy) {
    const fs = features(app.state.current, app.tent.r);
    let best = null, bd = 0.16;
    for (const i of tentOptions()) {
      const d = Math.hypot(fs[i].p[0] - fx, fs[i].p[1] - fy);
      if (d < bd) { bd = d; best = i; }
    }
    if (best != null) {
      // Повторные нажатия перебирают фигуры: фишка → большая → строитель → ничего.
      const ks = tentKinds()[best];
      if (app.tent.f !== best) { app.tent.f = best; app.tent.kind = ks[0]; }
      else {
        const next = ks[ks.indexOf(app.tent.kind) + 1];
        if (next) app.tent.kind = next;
        else { app.tent.f = null; app.tent.kind = null; }
      }
    } else rotate();
    update();
    return;
  }
  const rs = rotationsAt(gx, gy);
  if (rs.length) {
    app.tent = { x: gx, y: gy, r: rs.includes(app.rot) ? app.rot : rs[0], f: null, kind: null };
    app.rot = app.tent.r;
  } else app.tent = null;
  update();
}

// ---------- Отрисовка ----------
const cv = $('#board');
const ctx = cv.getContext('2d');
const BASE = 90;
let W = 0, H = 0, DPR = 1;

function resize() {
  DPR = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  W = r.width; H = r.height;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  draw();
}
window.addEventListener('resize', resize);

const S = () => BASE * app.view.z;
const toScreen = (wx, wy) => [W / 2 + (wx - app.view.x) * S(), H / 2 + (wy - app.view.y) * S()];
const toWorld = (sx, sy) => [(sx - W / 2) / S() + app.view.x, (sy - H / 2) / S() + app.view.y];

function fitView() {
  if (!app.state) return;
  const ks = Object.keys(app.state.board).map(unkey);
  const xs = ks.map(k => k[0]), ys = ks.map(k => k[1]);
  const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 2, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 2;
  requestAnimationFrame(() => {
    resize();
    app.view.x = (x0 + x1) / 2; app.view.y = (y0 + y1) / 2;
    app.view.z = Math.max(0.25, Math.min(1.4, W / BASE / (x1 - x0), H / BASE / (y1 - y0)));
    draw();
  });
}

function draw() {
  if (!app.state || !W) return;
  const s = app.state, sz = S();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#2b3a2a';
  ctx.fillRect(0, 0, W, H);

  for (const [k, t] of Object.entries(s.board)) {
    const [x, y] = unkey(k);
    const [px, py] = toScreen(x, y);
    if (px > W || py > H || px + sz < 0 || py + sz < 0) continue;
    drawTile(ctx, t.t, t.r, px, py, sz);
  }
  // Последний положенный тайл.
  if (s.last && s.board[s.last]) {
    const [x, y] = unkey(s.last);
    const [px, py] = toScreen(x, y);
    ctx.strokeStyle = '#fff8';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(px + 1.5, py + 1.5, sz - 3, sz - 3);
    ctx.setLineDash([]);
  }
  // Доступные места.
  if (isMyTurn()) {
    const seen = new Set();
    for (const p of validSpots()) {
      const k = key(p.x, p.y);
      if (seen.has(k)) continue;
      seen.add(k);
      const [px, py] = toScreen(p.x, p.y);
      ctx.fillStyle = '#ffffff22';
      ctx.fillRect(px + 3, py + 3, sz - 6, sz - 6);
      ctx.strokeStyle = '#ffffff88';
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 3, py + 3, sz - 6, sz - 6);
    }
  }
  // Фишки и строители.
  for (const [k, t] of Object.entries(s.board)) {
    const [x, y] = unkey(k);
    const fs = features(t.t, t.r);
    if (t.m) {
      const f = fs[t.m.f];
      const [px, py] = toScreen(x + f.p[0], y + f.p[1]);
      drawFigure(ctx, t.m.big ? 'big' : 'meeple', px, py, sz * 0.26, s.players[t.m.p].color, f.t === 'field');
    }
    if (t.b) {
      const f = fs[t.b.f];
      const [px, py] = toScreen(x + f.p[0] + 0.16, y + f.p[1] + 0.05);
      drawFigure(ctx, 'builder', px, py, sz * 0.26, s.players[t.b.p].color);
    }
  }
  // Что сейчас делает соперник.
  const g = app.ghost;
  if (g && !isMyTurn() && s.phase === 'play' && g.seq === s.seq && g.key === s.players[s.turn].key) {
    const color = s.players[s.turn].color;
    if (g.tent) {
      const [px, py] = toScreen(g.tent.x, g.tent.y);
      ctx.globalAlpha = 0.85;
      drawTile(ctx, s.current, g.tent.r, px, py, sz);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 6]);
      ctx.strokeRect(px, py, sz, sz);
      ctx.setLineDash([]);
      if (g.tent.f != null) {
        const f = features(s.current, g.tent.r)[g.tent.f];
        const [mx, my] = toScreen(g.tent.x + f.p[0], g.tent.y + f.p[1]);
        drawFigure(ctx, g.tent.kind || 'meeple', mx, my, sz * 0.26, color, f.t === 'field');
      }
    } else if (g.hover) {
      const [px, py] = toScreen(g.hover.x, g.hover.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(px + 2, py + 2, sz - 4, sz - 4);
    }
  }
  // Предварительно положенный тайл.
  if (app.tent && isMyTurn()) {
    const t = app.tent;
    const [px, py] = toScreen(t.x, t.y);
    drawTile(ctx, s.current, t.r, px, py, sz);
    ctx.strokeStyle = '#ffd84a';
    ctx.lineWidth = 3;
    ctx.strokeRect(px, py, sz, sz);
    const fs = features(s.current, t.r);
    const color = s.players[s.turn].color;
    for (const i of tentOptions()) {
      const [mx, my] = toScreen(t.x + fs[i].p[0], t.y + fs[i].p[1]);
      if (t.f === i) continue;
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(6, sz * 0.07), 0, Math.PI * 2);
      ctx.fillStyle = '#ffffffaa';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (t.f != null) {
      const [mx, my] = toScreen(t.x + fs[t.f].p[0], t.y + fs[t.f].p[1]);
      drawFigure(ctx, t.kind || 'meeple', mx, my, sz * 0.26, color, fs[t.f].t === 'field');
    }
  }
}

const pctx = $('#preview').getContext('2d');
function drawPreview() {
  pctx.clearRect(0, 0, 200, 200);
  const s = app.state;
  if (!s || !s.current) return;
  const g = app.ghost;
  let r = app.tent ? app.tent.r : app.rot;
  if (!isMyTurn() && g && g.seq === s.seq) r = g.tent ? g.tent.r : (g.rot || 0);
  drawTile(pctx, s.current, r, 0, 0, 200);
}

// ---------- Панель ----------
function figuresText(p, s) {
  const o = s.opts || {};
  let t = `<span title="Фишки">♟${p.meeples}</span>`;
  if (o.inns) t += ` <span title="Большая фишка">♜${p.big}</span>`;
  if (o.traders) t += ` <span title="Строитель">🔨${p.builder}</span>` +
    ` <span title="Вино, зерно, ткань">🍷${p.goods.wine} 🌾${p.goods.grain} 🧵${p.goods.cloth}</span>`;
  return t;
}

function playerRow(p, i, s) {
  const li = document.createElement('li');
  if (s && s.phase === 'play' && s.turn === i) li.classList.add('turn');
  const online = app.kind === 'local' || app.online.has(p.key);
  li.innerHTML = `<span class="dot"></span><span class="nm"></span>` +
    (s ? `<span class="mp">${figuresText(p, s)}</span><span class="score">${p.score}</span>` : '');
  li.querySelector('.dot').style.background = p.color || COLORS[i];
  li.querySelector('.nm').textContent = p.name + (p.key === app.myKey && app.kind !== 'local' ? ' (вы)' : '');
  if (!online) li.querySelector('.nm').classList.add('off');
  return li;
}

function update() {
  // Лобби.
  if (app.kind === 'host' || app.kind === 'guest') {
    $('#lobby-code').textContent = app.code;
    $('#invite').value = location.origin + location.pathname + '?room=' + app.code;
    $('#lobby-players').replaceChildren(...app.lobby.map((p, i) => playerRow(p, i, null)));
    $('#btn-start').classList.toggle('hidden', app.kind !== 'host');
    $('#btn-start').disabled = app.lobby.length < 2;
    renderModes($('#lobby-modes'), app.kind === 'host' && !app.state);
    $('#btn-start').textContent = app.lobby.length < 2 ? 'Ждём хотя бы ещё одного игрока…' : `Начать игру (${app.lobby.length} игр.)`;
  }
  const s = app.state;
  if (!s) return;
  $('#room-info').innerHTML = app.kind === 'local' ? 'Игра на одном устройстве' : `Комната <b class="code">${app.code}</b>`;
  $('#modes-info').textContent = modesText(s.opts);
  $('#players').replaceChildren(...s.players.map((p, i) => playerRow(p, i, s)));
  const cur = s.players[s.turn];
  const mine = isMyTurn();
  $('#turn-info').textContent = s.phase === 'end' ? 'Игра окончена' :
    (mine ? (app.kind === 'local' ? `Ходит ${cur.name}` : 'Ваш ход!') : `Ходит ${cur.name}`) + (s.bonus ? ' (доп. ход 🔨)' : '');
  $('#deck-info').textContent = `Осталось тайлов: ${s.deck.length + (s.current ? 1 : 0)}`;
  $('#btn-rotate').disabled = !mine;
  $('#btn-end').disabled = !mine || !app.tent;
  $('#hint').textContent = !mine ? '' : !app.tent
    ? 'Нажмите на подсвеченную клетку, чтобы положить тайл.'
    : 'Нажмите на тайл, чтобы повернуть. Кружки — куда можно поставить фигуру; повторное нажатие на кружок меняет фигуру' +
      ((s.opts || {}).inns || (s.opts || {}).traders ? ' (обычная → большая → строитель → убрать)' : '') + '. Затем «Завершить ход».';
  $('#log').replaceChildren(...s.log.slice(-40).reverse().map(t => {
    const li = document.createElement('li'); li.textContent = t; return li;
  }));
  $('#log').setAttribute('reversed', '');
  $('#log').start = s.log.length;
  document.title = (mine && app.kind !== 'local' ? '▶ Ваш ход — ' : '') + 'Каркассон онлайн';

  if (s.phase === 'end' && !app.finalShown) {
    app.finalShown = true;
    const ranked = s.players.map((p, i) => [p, i]).sort((a, b) => b[0].score - a[0].score);
    $('#final-list').replaceChildren(...ranked.map(([p, i]) => playerRow(p, i, s)));
    $('#btn-again').classList.toggle('hidden', app.kind === 'guest');
    $('#final').classList.remove('hidden');
  }
  if (s.phase !== 'end') $('#final').classList.add('hidden');
  drawPreview();
  draw();
  sendLive();
}

// ---------- Ввод ----------
const pointers = new Map();
let drag = null, pinch = null;
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
  if (pointers.size === 1) drag = { sx: e.offsetX, sy: e.offsetY, vx: app.view.x, vy: app.view.y, moved: false };
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: app.view.z };
    drag = null;
  }
});
cv.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) {
    if (e.pointerType === 'mouse' && app.state && isMyTurn()) {
      const [wx, wy] = toWorld(e.offsetX, e.offsetY);
      const h = { x: Math.floor(wx), y: Math.floor(wy) };
      if (!app.hover || h.x !== app.hover.x || h.y !== app.hover.y) { app.hover = h; sendLive(); }
    }
    return;
  }
  pointers.set(e.pointerId, [e.offsetX, e.offsetY]);
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    app.view.z = clampZ(pinch.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d);
    draw();
  } else if (drag) {
    const dx = e.offsetX - drag.sx, dy = e.offsetY - drag.sy;
    if (Math.hypot(dx, dy) > 6) { drag.moved = true; cv.classList.add('drag'); }
    if (drag.moved) {
      app.view.x = drag.vx - dx / S();
      app.view.y = drag.vy - dy / S();
      draw();
    }
  }
});
const endPointer = e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  cv.classList.remove('drag');
  if (drag && !drag.moved && e.type === 'pointerup') clickCell(...toWorld(e.offsetX, e.offsetY));
  drag = null;
  if (pointers.size < 2) pinch = null;
};
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
const clampZ = z => Math.max(0.2, Math.min(3, z));
function zoomAt(f, sx = W / 2, sy = H / 2) {
  const [wx, wy] = toWorld(sx, sy);
  app.view.z = clampZ(app.view.z * f);
  const [wx2, wy2] = toWorld(sx, sy);
  app.view.x += wx - wx2; app.view.y += wy - wy2;
  draw();
}
cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY); }, { passive: false });
$('#zoom-in').onclick = () => zoomAt(1.25);
$('#zoom-out').onclick = () => zoomAt(0.8);
$('#zoom-fit').onclick = fitView;

window.addEventListener('keydown', e => {
  if (app.mode !== 'game' || e.target.tagName === 'INPUT') return;
  if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') rotate();
  else if (e.key === 'Enter') endTurn();
  else if (e.key === 'Escape') { app.tent = null; update(); }
});

$('#btn-rotate').onclick = rotate;
$('#btn-end').onclick = endTurn;
$('#btn-menu').onclick = () => { if (confirm('Выйти в меню? Игру можно будет продолжить.')) leave(); };
$('#btn-leave').onclick = leave;
$('#btn-copy').onclick = () => {
  $('#invite').select();
  navigator.clipboard?.writeText($('#invite').value);
  $('#btn-copy').textContent = 'Скопировано!';
};
$('#btn-start').onclick = () => {
  if (app.kind !== 'host' || app.lobby.length < 2) return;
  app.state = newGame(app.lobby, app.opts);
  hostSync();
  fitView();
};
$('#btn-again').onclick = () => {
  const players = app.state.players.map(p => ({ name: p.name, key: p.key }));
  app.state = newGame(players, app.state.opts || {});
  app.finalShown = false;
  app.tent = null;
  if (app.kind === 'host') hostSync();
  else { store.set('carc-local', app.state); update(); }
  fitView();
};
$('#btn-close-final').onclick = () => $('#final').classList.add('hidden');

initMenu();
if (new URLSearchParams(location.search).get('room')) {
  const h = store.get('carc-host');
  const room = new URLSearchParams(location.search).get('room').toUpperCase();
  // Хост, обновивший страницу, сразу возвращается в свою комнату.
  if (h && h.code === room) startHost(h);
  else if (store.get('carc-name')) startGuest(room);
}
