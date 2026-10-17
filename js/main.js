import { TILES, features } from './tiles.js?v=7';
import {
  newGame, placements, canPlace, applyTurn, applyDragon, skipTurn, figureKinds, portalTargets,
  princessTargets, dragonOptions, describe, key, unkey, COLORS, MODES,
} from './game.js?v=7';
import { drawTile, drawFigure, drawDragon, hitFeature } from './render.js?v=7';
import * as net from './net.js?v=7';

const $ = s => document.querySelector(s);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } },
};
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = s => JSON.parse(JSON.stringify(s));
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isTouch = matchMedia('(pointer: coarse)').matches;

const app = {
  mode: 'menu',          // menu | lobby | game
  kind: null,            // online | local
  code: null,
  myKey: store.get('carc-key') || uid(),
  lobby: null,           // { owner, players, opts, started }
  seen: {},              // key -> когда игрок последний раз был в сети
  state: null,
  broker: null,          // последнее состояние, пришедшее с сервера
  conn: null,
  view: { x: 0.5, y: 0.5, z: 1 },
  rot: 0,
  tent: null,            // { x, y, r, f, kind, at, princess } — тайл, который игрок примеряет
  hover: null,           // клетка под курсором { x, y }
  ghost: null,           // что сейчас делает соперник
  hint: null,            // подсказка очков { k, f, d, sx, sy, sticky }
  anim: null,            // анимация начисления очков { events, t0 }
  chat: [],
  finalShown: false,
  opts: store.get('carc-opts') || {},
};
store.set('carc-key', app.myKey);
// Для отладки на локальном сервере.
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') window.__app = app;

// ---------- Тема ----------
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  for (const b of document.querySelectorAll('.theme-toggle')) b.textContent = t === 'dark' ? '☀️' : '🌙';
  draw();
}
let theme = store.get('carc-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
for (const b of document.querySelectorAll('.theme-toggle')) {
  b.onclick = () => { theme = theme === 'dark' ? 'light' : 'dark'; store.set('carc-theme', theme); applyTheme(theme); };
}

// ---------- Экраны ----------
function show(mode) {
  app.mode = mode;
  for (const id of ['menu', 'lobby', 'game']) $('#' + id).classList.toggle('hidden', id !== mode);
  if (mode === 'game') { layout(); fitView(); }
}

function myName() {
  const n = $('#name').value.trim();
  if (n) store.set('carc-name', n);
  return n || store.get('carc-name') || '';
}

function initMenu() {
  $('#name').value = store.get('carc-name') || '';
  renderModes($('#modes'), true, app.opts, o => { app.opts = o; store.set('carc-opts', o); });
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
  const last = store.get('carc-last-room');
  const lastSaved = last && store.get('carc-room-' + last);
  if (lastSaved && lastSaved.state && lastSaved.state.phase !== 'end') {
    const b = document.createElement('button');
    b.textContent = `Вернуться в онлайн-игру (комната ${last})`;
    b.onclick = () => { if (myName()) startOnline(last, false); else menuMsg('Введите имя'); };
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
    startOnline(net.randomCode(), true);
  };
  $('#btn-join').onclick = () => {
    const code = $('#code').value.trim().toUpperCase();
    if (!myName()) return menuMsg('Введите имя');
    if (code.length !== 5) return menuMsg('Код комнаты — 5 символов');
    startOnline(code, false);
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

// Переключатели дополнений.
function renderModes(box, editable, opts, onChange) {
  box.replaceChildren(...Object.entries(MODES).map(([id, m]) => {
    const label = document.createElement('label');
    label.className = 'mode' + (opts[id] ? ' on' : '');
    label.innerHTML = `<input type="checkbox"><span class="mi"></span><span><b></b><small></small></span>`;
    const cb = label.querySelector('input');
    cb.checked = !!opts[id];
    cb.disabled = !editable;
    label.querySelector('.mi').textContent = m.icon;
    label.querySelector('b').textContent = m.name;
    label.querySelector('small').textContent = m.desc;
    cb.onchange = () => onChange({ ...opts, [id]: cb.checked });
    return label;
  }));
}

const modesText = opts => Object.entries(MODES).filter(([id]) => opts && opts[id]).map(([, m]) => m.icon + ' ' + m.name).join(' · ');
const menuMsg = t => { $('#menu-msg').textContent = t; };
function pubLobby(l) {
  l.v = (l.v || 0) + 1;
  app.conn.lobby(l);
}

// Заметная плашка о проблемах со связью поверх поля.
function netBanner(t) {
  const b = $('#net-banner');
  b.textContent = t ? '⚠️ ' + t : '';
  b.classList.toggle('hidden', !t);
}
const lobbyMsg = t => { $('#lobby-msg').textContent = t; };
const gameMsg = t => { $('#game-msg').textContent = t; };

// ---------- Игра на одном устройстве ----------
function startLocal(state) {
  app.kind = 'local';
  app.state = state;
  app.finalShown = false;
  save();
  show('game');
  update();
}

// ---------- Онлайн без хоста ----------
// Состояние лежит на сервере; каждый ход публикует тот, кто его сделал.
const newer = (a, b) => !b || (a.gid !== b.gid ? a.born > b.born : a.seq > b.seq);
// Кого ещё не слышали, первые секунды после подключения считаем в сети.
const isOnline = k => app.kind === 'local' || k === app.myKey ||
  Date.now() - (app.seen[k] || app.joinedAt) < net.TIMEOUT;

function startOnline(code, creating) {
  app.kind = 'online';
  app.code = code;
  app.joinedAt = Date.now();
  const saved = store.get('carc-room-' + code);
  app.state = saved ? saved.state : null;
  app.lobby = saved ? saved.lobby : null;
  if (creating) app.lobby = { owner: app.myKey, players: [{ name: myName(), key: app.myKey }], opts: app.opts, started: false };
  app.chat = store.get('carc-chat-' + code) || [];
  app.finalShown = !!(app.state && app.state.phase === 'end');
  store.set('carc-last-room', code);
  history.replaceState(null, '', '?room=' + code);
  lobbyMsg(creating ? 'Создаю комнату…' : 'Подключение…');
  app.conn = net.room(code, app.myKey, myName(), {
    onStatus: t => { lobbyMsg(t); netBanner(t); },
    onReady() {
      if (app.lobby && app.lobby.owner === app.myKey && !app.lobby.started && !app.state) pubLobby(app.lobby);
      // После переподключения заново показываем соперникам, что примеряем.
      lastLive = '';
      sendLive();
      // Если на сервере нет состояния новее нашего — восстанавливаем его из своей копии.
      setTimeout(() => {
        if (app.state && newer(app.state, app.broker)) app.conn.state(app.state);
        if (!app.lobby && !app.state) lobbyMsg('Комната не найдена. Проверьте код.');
      }, 3000);
    },
    onLobby(l) {
      // Сообщения идут через два брокера — более старую копию лобби пропускаем.
      if (app.lobby && (l.v || 0) < (app.lobby.v || 0)) return;
      app.lobby = l;
      save();
      update();
    },
    onState(s) {
      if (!app.broker || newer(s, app.broker)) app.broker = s;
      if (newer(s, app.state)) setState(s);
      else if (newer(app.state, s)) app.conn.state(app.state);
    },
    onPing(k, name) {
      const was = isOnline(k);
      // Новичку сразу отвечаем, чтобы он увидел нас в сети.
      if (!app.seen[k]) app.conn.ping();
      app.seen[k] = Date.now();
      // Создатель комнаты добавляет новичков в лобби.
      const l = app.lobby;
      if (l && l.owner === app.myKey && !l.started && !app.state && !l.players.some(p => p.key === k)) {
        // Тот же человек с другого устройства занимает своё место, иначе — новый игрок.
        const same = l.players.find(p => p.name === name && p.key !== app.myKey && !isOnline(p.key));
        if (same) same.key = k;
        else if (l.players.length < 6) l.players.push({ name, key: k });
        pubLobby(l);
      }
      if (!was) update();
    },
    onChat: addChat,
    onLive(msg) {
      if (app.ghost && app.ghost.key === msg.key && (msg.t || 0) < (app.ghost.t || 0)) return;
      app.ghost = msg;
      drawPreview();
      draw();
    },
  });
  show(app.state ? 'game' : 'lobby');
  renderChat();
  update();
}

function save() {
  if (app.kind === 'local') store.set('carc-local', app.state);
  else if (app.kind === 'online') store.set('carc-room-' + app.code, { state: app.state, lobby: app.lobby });
}

// Новое состояние партии (своё или пришедшее по сети).
function setState(s) {
  const prev = app.state;
  app.state = s;
  if (!prev || prev.seq !== s.seq || prev.gid !== s.gid) {
    app.tent = null;
    app.hint = null;
    if (prev && prev.gid === s.gid) startAnim(s.events);
    if (prev && prev.gid !== s.gid) app.finalShown = false;
  }
  save();
  if (app.mode !== 'game') show('game');
  update();
}

// Применить действие к копии состояния и опубликовать результат.
function commit(fn) {
  const next = clone(app.state);
  try { fn(next); } catch (e) { gameMsg(e.message); return; }
  next.log = next.log.slice(-60);
  gameMsg('');
  setState(next);
  if (app.kind === 'online') {
    app.conn.state(next);
    if (!app.conn.connected()) gameMsg('Нет связи с сервером — ход отправится, как только связь вернётся.');
  }
}

function leave() {
  if (app.conn) app.conn.destroy();
  history.replaceState(null, '', location.pathname);
  location.reload();
}

// ---------- Чат и реакции ----------
const REACTS = ['👍', '😂', '😮', '😡', '😭', '🎉'];

function sendChat(text, react = false) {
  text = text.trim();
  if (!text || app.kind !== 'online') return;
  const m = { id: uid(), key: app.myKey, name: myName(), text: text.slice(0, 200), react, ts: Date.now() };
  addChat(m);
  app.conn.chat(m, app.chat.slice(-20));
}

function addChat(m) {
  if (!m || !m.id || app.chat.some(c => c.id === m.id)) return;
  app.chat.push(m);
  app.chat.sort((a, b) => a.ts - b.ts);
  app.chat = app.chat.slice(-100);
  store.set('carc-chat-' + app.code, app.chat);
  renderChat();
  if (m.react) floatReaction(m);
}

const colorOf = k => {
  const ps = (app.state && app.state.players) || (app.lobby && app.lobby.players) || [];
  const i = ps.findIndex(p => p.key === k);
  return i < 0 ? '#888' : ps[i].color || COLORS[i];
};

function renderChat() {
  const list = $('#chat-list');
  list.replaceChildren(...app.chat.slice(-50).map(m => {
    const li = document.createElement('li');
    li.innerHTML = `<b></b> <span></span>`;
    li.querySelector('b').textContent = m.name + ':';
    li.querySelector('b').style.color = colorOf(m.key);
    li.querySelector('span').textContent = m.text;
    if (m.react) li.classList.add('react');
    return li;
  }));
  list.scrollTop = list.scrollHeight;
}

function floatReaction(m) {
  if (Date.now() - m.ts > 15000) return;
  const el = document.createElement('div');
  el.className = 'react-float';
  el.innerHTML = `<span></span><small></small>`;
  el.querySelector('span').textContent = m.text;
  el.querySelector('small').textContent = m.name;
  el.querySelector('small').style.background = colorOf(m.key);
  const r = cv.getBoundingClientRect();
  el.style.left = (r.left + r.width * (0.2 + Math.random() * 0.6)) + 'px';
  el.style.top = (r.top + r.height * 0.75) + 'px';
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
}

function initChat() {
  $('#reacts').replaceChildren(...REACTS.map(e => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = e;
    b.onclick = () => sendChat(e, true);
    return b;
  }));
  $('#chat-form').onsubmit = ev => {
    ev.preventDefault();
    sendChat($('#chat-input').value);
    $('#chat-input').value = '';
  };
}

// ---------- Живой показ хода ----------
// Не чаще раза в 120 мс: при движении мыши уходит только последнее положение.
let lastLive = '', liveTimer = null, liveAt = 0;
function sendLive() {
  if (app.kind !== 'online' || !app.conn || !canPlaceTile()) return;
  const msg = { seq: app.state.seq, gid: app.state.gid, tent: app.tent, hover: app.tent ? null : app.hover, rot: app.rot };
  const str = JSON.stringify(msg);
  if (str === lastLive) return;
  lastLive = str;
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => { liveAt = Date.now(); app.conn.live({ ...msg, t: liveAt }); }, Math.max(0, 120 - (Date.now() - liveAt)));
}

// ---------- Ход ----------
const iAm = i => app.kind === 'local' || (app.state.players[i] && app.state.players[i].key === app.myKey);
const canPlaceTile = () => app.state && app.state.phase === 'play' && !app.state.dragonMove && iAm(app.state.turn);
const canMoveDragon = () => app.state && app.state.phase === 'play' && app.state.dragonMove && iAm(app.state.dragonMove.player);
const actor = s => (s.dragonMove ? s.dragonMove.player : s.turn);

const cache = new Map();
function cached(name, id, fn) {
  const c = cache.get(name);
  if (c && c.id === id) return c.v;
  const v = fn();
  cache.set(name, { id, v });
  return v;
}

const validSpots = () => cached('spots', app.state.gid + app.state.seq, () => placements(app.state.board, app.state.current, app.state.riverLast));
const rotationsAt = (x, y) => [0, 1, 2, 3].filter(r => canPlace(app.state.board, app.state.current, r, x, y, app.state.riverLast));

function tentBoard() {
  const b = { ...app.state.board };
  const t = app.tent;
  b[key(t.x, t.y)] = { t: app.state.current, r: t.r, m: null };
  return b;
}
const tentId = () => app.state.gid + app.state.seq + JSON.stringify([app.tent.x, app.tent.y, app.tent.r]);

// Какие фигуры можно поставить на каждый признак тайла-кандидата: { fi: [kinds] }.
function tentKinds() {
  if (!app.tent) return {};
  return cached('kinds', tentId(), () => {
    const b = tentBoard(), s = app.state, res = {};
    features(s.current, app.tent.r).forEach((f, i) => {
      const ks = figureKinds(s, b, app.tent.x, app.tent.y, i, s.turn);
      if (ks.length) res[i] = ks;
    });
    return res;
  });
}
const portalOpts = () => (app.tent && TILES[app.state.current].portal
  ? cached('portal', tentId(), () => portalTargets(app.state, tentBoard(), key(app.tent.x, app.tent.y))) : []);
const princessOpts = () => (app.tent ? cached('princess', tentId(), () => princessTargets(tentBoard(), app.tent.x, app.tent.y)) : []);
const portalKinds = () => {
  const p = app.state.players[app.state.turn];
  return [p.meeples > 0 && 'meeple', p.big > 0 && 'big'].filter(Boolean);
};

function rotate() {
  if (!canPlaceTile()) return;
  if (app.tent) {
    const rs = rotationsAt(app.tent.x, app.tent.y);
    app.tent = { ...app.tent, r: rs[(rs.indexOf(app.tent.r) + 1) % rs.length], f: null, kind: null, at: null, princess: null };
    app.rot = app.tent.r;
  } else app.rot = (app.rot + 1) % 4;
  update();
}

function endTurn() {
  if (!canPlaceTile() || !app.tent) return;
  const move = { ...app.tent };
  commit(s => applyTurn(s, s.turn, move));
}

// Перебор фигур по повторным нажатиям: фишка → большая → строитель → свинья → ничего.
function cycle(kinds, f, at) {
  const t = app.tent;
  t.princess = null;
  if (t.f !== f || (t.at || null) !== (at || null)) { t.f = f; t.at = at; t.kind = kinds[0]; return; }
  const next = kinds[kinds.indexOf(t.kind) + 1];
  if (next) t.kind = next;
  else { t.f = null; t.at = null; t.kind = null; }
}

function clickCell(wx, wy) {
  const s = app.state;
  if (!s) return;
  const gx = Math.floor(wx), gy = Math.floor(wy), k = key(gx, gy);
  const fx = wx - gx, fy = wy - gy;
  const hitR = Math.max(0.17, 24 / S());

  if (canMoveDragon()) {
    if (dragonOptions(s).includes(k)) { commit(n => applyDragon(n, n.dragonMove.player, k)); return; }
  } else if (canPlaceTile()) {
    const t = app.tent;
    if (t) {
      // Портал и принцесса — нажатие на чужие тайлы.
      for (const p of portalOpts()) {
        const tile = s.board[p.k];
        const pt = features(tile.t, tile.r)[p.f].p;
        const [px, py] = unkey(p.k);
        if (Math.hypot(px + pt[0] - wx, py + pt[1] - wy) < hitR) { cycle(portalKinds(), p.f, p.k); update(); return; }
      }
      for (const p of princessOpts()) {
        const tile = s.board[p.k];
        const pt = features(tile.t, tile.r)[p.f].p;
        const [px, py] = unkey(p.k);
        if (Math.hypot(px + pt[0] - wx, py + pt[1] - wy) < hitR) {
          const same = t.princess && t.princess.k === p.k && t.princess.f === p.f;
          Object.assign(t, { princess: same ? null : p, f: null, kind: null, at: null });
          update();
          return;
        }
      }
    }
    if (t && t.x === gx && t.y === gy) {
      const fs = features(s.current, t.r);
      const kinds = tentKinds();
      let best = null, bd = hitR;
      for (const i of Object.keys(kinds).map(Number)) {
        const d = Math.hypot(fs[i].p[0] - fx, fs[i].p[1] - fy);
        if (d < bd) { bd = d; best = i; }
      }
      if (best != null) cycle(kinds[best], best, null);
      else rotate();
      update();
      return;
    }
    const rs = rotationsAt(gx, gy);
    if (rs.length) {
      app.tent = { x: gx, y: gy, r: rs.includes(app.rot) ? app.rot : rs[0], f: null, kind: null, at: null, princess: null };
      app.rot = app.tent.r;
      app.hint = null;
      update();
      return;
    }
  }
  // Нажатие на выложенный тайл — подсказка очков.
  const h = hintAt(wx, wy);
  app.hint = h && !(app.hint && app.hint.sticky && app.hint.id === h.id) ? { ...h, sticky: true } : null;
  if (app.hint) { const [sx, sy] = toScreen(wx, wy); app.hint.sx = sx; app.hint.sy = sy; }
  showTip();
  draw();
}

// ---------- Подсказка очков ----------
// prev — прошлая подсказка: если курсор на том же объекте, не пересчитываем его.
function hintAt(wx, wy, prev = null) {
  const s = app.state;
  const gx = Math.floor(wx), gy = Math.floor(wy), k = key(gx, gy);
  const tile = s.board[k];
  if (!tile) return null;
  const f = hitFeature(tile.t, tile.r, wx - gx, wy - gy);
  if (f < 0 || features(tile.t, tile.r)[f].t === 'river') return null;
  if (prev && prev.k === k && prev.f === f) return prev;
  const d = describe(s, gx, gy, f);
  return { id: d.id, k, f, d };
}

function hintHtml(d) {
  const s = app.state;
  const cnt = {};
  for (const m of d.meeples) cnt[m.p] = (cnt[m.p] || 0) + (m.big ? 2 : 1);
  const figs = Object.entries(cnt).map(([p, c]) => `<b style="color:${s.players[p].color}">${esc(s.players[p].name)}</b> ${c}`).join(', ');
  const lead = d.leaders.map(i => `<b style="color:${s.players[i].color}">${esc(s.players[i].name)}</b>`).join(', ');
  let title = '', info = '', pts = '';
  if (d.t === 'city') {
    title = '🏰 Город' + (d.cathedral ? ' с собором' : '');
    info = `${d.tiles} тайл. · щитов: ${d.shields}`;
  } else if (d.t === 'road') {
    title = '🛤️ Дорога' + (d.inn ? ' с таверной' : '');
    info = `${d.tiles} тайл.`;
  } else if (d.t === 'monastery') {
    title = '⛪ Монастырь';
    info = `вокруг ${d.tiles} из 9 тайлов`;
  } else {
    title = '🌾 Поле';
    info = `рядом завершённых городов: ${d.cities}`;
  }
  if (d.t === 'field') pts = `В конце игры: <b>${d.now}</b> очк.`;
  else if (!d.open) pts = 'Завершён ✓';
  else pts = `Сейчас (если не достроят): <b>${d.now}</b> · Завершённый: <b>${d.done}</b>`;
  return `<div class="tip-t">${title}</div><div>${info}</div><div>${pts}</div>` +
    (figs ? `<div>Фигуры: ${figs}</div><div>Лидер: ${lead}</div>` : '<div class="muted">Никем не занят</div>');
}

function showTip() {
  const tip = $('#tip');
  const h = app.hint;
  if (!h || !app.state) { tip.classList.add('hidden'); return; }
  tip.innerHTML = hintHtml(h.d);
  tip.classList.remove('hidden');
  const r = cv.getBoundingClientRect();
  const x = Math.min(r.left + h.sx + 14, r.right - tip.offsetWidth - 8);
  const y = h.sy + 14 + tip.offsetHeight > r.height ? r.top + h.sy - tip.offsetHeight - 10 : r.top + h.sy + 14;
  tip.style.left = Math.max(8, x) + 'px';
  tip.style.top = Math.max(8, y) + 'px';
}

// ---------- Анимация очков ----------
const ANIM_MS = 2200;
function startAnim(events) {
  if (!events || !events.length) return;
  app.anim = { events, t0: performance.now() };
  const loop = () => {
    if (!app.anim) return;
    draw();
    if (performance.now() - app.anim.t0 < ANIM_MS) requestAnimationFrame(loop);
    else { app.anim = null; draw(); }
  };
  requestAnimationFrame(loop);
}

function drawAnim(sz) {
  const a = app.anim;
  if (!a) return;
  const p = Math.min(1, (performance.now() - a.t0) / ANIM_MS);
  const s = app.state;
  for (const ev of a.events) {
    const dragon = ev.t === 'dragon';
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.fillStyle = dragon ? '#ff3b1f55' : '#ffe06655';
    ctx.strokeStyle = dragon ? '#ff3b1f' : '#ffd84a';
    ctx.lineWidth = 4;
    let cx = 0, cy = 0;
    for (const k of ev.tiles) {
      const [x, y] = unkey(k);
      const [px, py] = toScreen(x, y);
      ctx.fillRect(px, py, sz, sz);
      ctx.strokeRect(px + 2, py + 2, sz - 4, sz - 4);
      cx += px + sz / 2; cy += py + sz / 2;
    }
    cx /= ev.tiles.length; cy /= ev.tiles.length;
    if (ev.pts > 0 && ev.players.length) {
      ctx.globalAlpha = p < 0.8 ? 1 : (1 - p) * 5;
      ctx.font = `bold ${Math.max(18, sz * 0.4)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ev.players.forEach((pi, j) => {
        const ty = cy - p * sz * 0.9 + j * sz * 0.4;
        ctx.lineWidth = 5; ctx.strokeStyle = '#fff';
        ctx.strokeText('+' + ev.pts, cx, ty);
        ctx.fillStyle = s.players[pi].color;
        ctx.fillText('+' + ev.pts, cx, ty);
      });
    }
    ctx.restore();
  }
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

// На телефоне поле занимает место над панелью.
function layout() {
  const mobile = innerWidth <= 720;
  $('#game').style.setProperty('--panel-h', mobile ? $('#panel').offsetHeight + 'px' : '0px');
  resize();
}
window.addEventListener('resize', layout);
new ResizeObserver(() => { if (app.mode === 'game') layout(); }).observe($('#panel'));

const S = () => BASE * app.view.z;
const toScreen = (wx, wy) => [W / 2 + (wx - app.view.x) * S(), H / 2 + (wy - app.view.y) * S()];
const toWorld = (sx, sy) => [(sx - W / 2) / S() + app.view.x, (sy - H / 2) / S() + app.view.y];

function fitView() {
  if (!app.state) return;
  const ks = Object.keys(app.state.board).map(unkey);
  const xs = ks.map(k => k[0]), ys = ks.map(k => k[1]);
  const x0 = Math.min(...xs) - 1, x1 = Math.max(...xs) + 2, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 2;
  requestAnimationFrame(() => {
    layout();
    app.view.x = (x0 + x1) / 2; app.view.y = (y0 + y1) / 2;
    app.view.z = Math.max(0.25, Math.min(1.4, W / BASE / (x1 - x0), H / BASE / (y1 - y0)));
    draw();
  });
}

function figureAt(ctx2, s, k, f, kind, color, sz, dx = 0, dy = 0) {
  const tile = s.board[k];
  const ft = features(tile.t, tile.r)[f];
  const [x, y] = unkey(k);
  const [px, py] = toScreen(x + ft.p[0] + dx, y + ft.p[1] + dy);
  drawFigure(ctx2, kind, px, py, sz * 0.26, color, ft.t === 'field' && kind !== 'pig');
}

function circle(x, y, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

function draw() {
  if (!app.state || !W) return;
  const s = app.state, sz = S();
  const css = getComputedStyle(document.documentElement);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = css.getPropertyValue('--board').trim() || '#2b3a2a';
  ctx.fillRect(0, 0, W, H);
  const circleR = Math.max(isTouch ? 11 : 7, sz * 0.075);

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
  // Подсветка объекта из подсказки.
  if (app.hint) {
    ctx.fillStyle = '#ffffff30';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    for (const k of new Set(app.hint.d.members.map(m => m.k))) {
      const [x, y] = unkey(k);
      const [px, py] = toScreen(x, y);
      ctx.fillRect(px, py, sz, sz);
      ctx.strokeRect(px + 1, py + 1, sz - 2, sz - 2);
    }
  }
  // Доступные места.
  if (canPlaceTile()) {
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
  // Фигуры.
  const tentPr = app.tent && canPlaceTile() && app.tent.princess;
  for (const [k, t] of Object.entries(s.board)) {
    if (t.m) {
      figureAt(ctx, s, k, t.m.f, t.m.big ? 'big' : 'meeple', s.players[t.m.p].color, sz);
      if (tentPr && tentPr.k === k) {
        const ft = features(t.t, t.r)[t.m.f];
        const [x, y] = unkey(k);
        const [px, py] = toScreen(x + ft.p[0], y + ft.p[1]);
        ctx.save();
        ctx.strokeStyle = '#ff2d6f'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        const r = sz * 0.13;
        ctx.beginPath(); ctx.moveTo(px - r, py - r); ctx.lineTo(px + r, py + r); ctx.moveTo(px + r, py - r); ctx.lineTo(px - r, py + r); ctx.stroke();
        ctx.restore();
      }
    }
    if (t.b) figureAt(ctx, s, k, t.b.f, 'builder', s.players[t.b.p].color, sz, 0.16, 0.05);
    if (t.pg) figureAt(ctx, s, k, t.pg.f, 'pig', s.players[t.pg.p].color, sz, -0.16, 0.05);
  }
  // Дракон и куда он может полететь.
  if (s.dragon) {
    const [x, y] = unkey(s.dragon);
    const [px, py] = toScreen(x + 0.5, y + 0.5);
    if (s.dragonMove) {
      for (const k of s.dragonMove.visited) {
        const [vx, vy] = unkey(k);
        const [qx, qy] = toScreen(vx, vy);
        ctx.fillStyle = '#ff3b1f22';
        ctx.fillRect(qx, qy, sz, sz);
      }
      if (canMoveDragon()) {
        for (const k of dragonOptions(s)) {
          const [ox, oy] = unkey(k);
          const [qx, qy] = toScreen(ox, oy);
          ctx.strokeStyle = '#ff3b1f';
          ctx.lineWidth = 4;
          ctx.setLineDash([8, 5]);
          ctx.strokeRect(qx + 3, qy + 3, sz - 6, sz - 6);
          ctx.setLineDash([]);
        }
      }
    }
    drawDragon(ctx, px, py, sz);
  }
  // Что сейчас делает соперник.
  const g = app.ghost;
  if (g && !canPlaceTile() && s.phase === 'play' && !s.dragonMove && g.seq === s.seq && g.gid === s.gid && g.key === s.players[s.turn].key) {
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
        const ghostBoard = { ...s, board: { ...s.board, [key(g.tent.x, g.tent.y)]: { t: s.current, r: g.tent.r } } };
        figureAt(ctx, ghostBoard, g.tent.at || key(g.tent.x, g.tent.y), g.tent.f, g.tent.kind || 'meeple', color, sz);
      }
    } else if (g.hover) {
      const [px, py] = toScreen(g.hover.x, g.hover.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(px + 2, py + 2, sz - 4, sz - 4);
    }
  }
  // Предварительно положенный тайл.
  if (app.tent && canPlaceTile()) {
    const t = app.tent;
    const [px, py] = toScreen(t.x, t.y);
    drawTile(ctx, s.current, t.r, px, py, sz);
    ctx.strokeStyle = '#ffd84a';
    ctx.lineWidth = 3;
    ctx.strokeRect(px, py, sz, sz);
    const fs = features(s.current, t.r);
    const color = s.players[s.turn].color;
    for (const i of Object.keys(tentKinds()).map(Number)) {
      if (t.f === i && !t.at) continue;
      const [mx, my] = toScreen(t.x + fs[i].p[0], t.y + fs[i].p[1]);
      circle(mx, my, circleR, '#ffffffaa', color);
    }
    for (const p of portalOpts()) {
      if (t.at === p.k && t.f === p.f) continue;
      const tile = s.board[p.k];
      const pt = features(tile.t, tile.r)[p.f].p;
      const [x, y] = unkey(p.k);
      const [mx, my] = toScreen(x + pt[0], y + pt[1]);
      circle(mx, my, circleR * 0.85, '#d6b3ffcc', '#7a3fd0');
    }
    for (const p of princessOpts()) {
      const tile = s.board[p.k];
      const pt = features(tile.t, tile.r)[p.f].p;
      const [x, y] = unkey(p.k);
      const [mx, my] = toScreen(x + pt[0], y + pt[1]);
      ctx.beginPath();
      ctx.arc(mx, my, sz * 0.17, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff2d6f';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    if (t.f != null) {
      const b = { ...s, board: tentBoard() };
      figureAt(ctx, b, t.at || key(t.x, t.y), t.f, t.kind || 'meeple', color, sz);
    }
  }
  drawAnim(sz);
}

const pctx = $('#preview').getContext('2d');
function drawPreview() {
  pctx.clearRect(0, 0, 200, 200);
  const s = app.state;
  if (!s || !s.current) return;
  const g = app.ghost;
  let r = app.tent ? app.tent.r : app.rot;
  if (!canPlaceTile() && g && g.seq === s.seq) r = g.tent ? g.tent.r : (g.rot || 0);
  drawTile(pctx, s.current, r, 0, 0, 200);
}

// ---------- Панель ----------
function figuresText(p, s) {
  const o = s.opts || {};
  let t = `<span title="Фишки">♟${p.meeples}</span>`;
  if (o.inns) t += ` <span title="Большая фишка">♜${p.big}</span>`;
  if (o.traders) t += ` <span title="Строитель">🔨${p.builder}</span> <span title="Свинья">🐷${p.pig}</span>` +
    ` <span title="Вино, зерно, ткань">🍷${p.goods.wine} 🌾${p.goods.grain} 🧵${p.goods.cloth}</span>`;
  return t;
}

function playerRow(p, i, s) {
  const li = document.createElement('li');
  if (s && s.phase === 'play' && actor(s) === i) li.classList.add('turn');
  li.innerHTML = `<span class="dot"></span><span class="nm"></span>` +
    (s ? `<span class="mp">${figuresText(p, s)}</span><span class="score">${p.score}</span>` : '');
  li.querySelector('.dot').style.background = p.color || COLORS[i];
  li.querySelector('.nm').textContent = p.name + (p.key === app.myKey && app.kind !== 'local' ? ' (вы)' : '') +
    (app.lobby && p.key === app.lobby.owner && !s ? ' 👑' : '');
  if (!isOnline(p.key)) { li.querySelector('.nm').classList.add('off'); li.title = 'Не в сети'; }
  // Создатель комнаты может убрать игрока из лобби.
  if (!s && app.lobby && app.lobby.owner === app.myKey && p.key !== app.myKey) {
    const x = document.createElement('button');
    x.className = 'icon kick';
    x.title = 'Убрать из комнаты';
    x.textContent = '✕';
    x.onclick = () => {
      app.lobby.players = app.lobby.players.filter(q => q.key !== p.key);
      pubLobby(app.lobby);
      update();
    };
    li.append(x);
  }
  return li;
}

function hintText(s) {
  if (canMoveDragon()) return `🐉 Ведите дракона: нажмите на тайл с красной рамкой. Осталось ходов: ${s.dragonMove.left}. Он съест все фигуры на своём пути.`;
  if (!canPlaceTile()) return '';
  if (!app.tent) return isTouch
    ? 'Нажмите на подсвеченную клетку, чтобы положить тайл. Нажатие на выложенный тайл покажет, сколько стоит объект.'
    : 'Нажмите на подсвеченную клетку, чтобы положить тайл. Наведите курсор на поле — увидите, сколько стоит объект.';
  const o = s.opts || {};
  const parts = ['Нажмите на тайл, чтобы повернуть. Кружки — куда можно поставить фигуру'];
  if (o.inns || o.traders) parts.push('повторное нажатие меняет фигуру (обычная → большая → строитель → свинья)');
  if (portalOpts().length) parts.push('🌀 фиолетовые кружки — через портал в любое место');
  if (princessOpts().length) parts.push('👸 розовые кольца — выгнать рыцаря принцессой');
  return parts.join('; ') + '. Затем «Завершить ход».';
}

function update() {
  // Лобби.
  if (app.kind === 'online') {
    const l = app.lobby;
    $('#lobby-code').textContent = app.code;
    $('#invite').value = location.origin + location.pathname + '?room=' + app.code;
    $('#lobby-players').replaceChildren(...(l ? l.players : []).map((p, i) => playerRow(p, i, null)));
    const owner = l && l.owner === app.myKey;
    const ownerAway = l && !isOnline(l.owner);
    renderModes($('#lobby-modes'), owner && !app.state, (l && l.opts) || {}, o => {
      app.lobby.opts = o;
      pubLobby(app.lobby);
      update();
    });
    const btn = $('#btn-start');
    btn.classList.toggle('hidden', !l || !(owner || ownerAway));
    btn.disabled = !l || l.players.length < 2;
    btn.textContent = !l || l.players.length < 2 ? 'Ждём хотя бы ещё одного игрока…' : `Начать игру (${l.players.length} игр.)`;
    $('#lobby-wait').textContent = l && !owner && !ownerAway ? 'Ждём, когда создатель комнаты начнёт игру…' : '';
  }
  const s = app.state;
  if (!s) return;
  $('#room-info').innerHTML = app.kind === 'local' ? 'Игра на одном устройстве' : `Комната <b class="code">${app.code}</b>`;
  $('#modes-info').textContent = modesText(s.opts);
  $('#players').replaceChildren(...s.players.map((p, i) => playerRow(p, i, s)));
  const cur = s.players[actor(s)];
  const mine = canPlaceTile() || canMoveDragon();
  const who = app.kind === 'local' ? cur.name : mine ? 'Вы' : cur.name;
  $('#turn-info').textContent = s.phase === 'end' ? 'Игра окончена' :
    s.dragonMove ? `🐉 ${who === 'Вы' ? 'Вы ведёте' : who + ' ведёт'} дракона (${s.dragonMove.left})` :
      (app.kind === 'local' ? `Ходит ${cur.name}` : mine ? 'Ваш ход!' : `Ходит ${cur.name}`) + (s.bonus ? ' (доп. ход 🔨)' : '');
  $('#deck-info').textContent = `Осталось тайлов: ${s.deck.length + (s.current ? 1 : 0)}`;
  $('#btn-rotate').disabled = !canPlaceTile();
  $('#btn-end').disabled = !canPlaceTile() || !app.tent;
  $('#hint').textContent = hintText(s);
  // Пропуск хода игрока, который вышел.
  const away = app.kind === 'online' && s.phase === 'play' && !iAm(actor(s)) && !isOnline(cur.key) &&
    s.players.some(p => p.key === app.myKey);
  $('#btn-skip').classList.toggle('hidden', !away);
  $('#btn-skip').textContent = `⏭ ${cur.name} не в сети — пропустить ход`;
  $('#chat').classList.toggle('hidden', app.kind !== 'online');
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
    $('#final').classList.remove('hidden');
  }
  if (s.phase !== 'end') $('#final').classList.add('hidden');
  drawPreview();
  draw();
  showTip();
  sendLive();
}
setInterval(() => { if (app.kind === 'online') { claimSeat(); update(); } }, 5000);

// Зашли с другого устройства или очистили браузер: занимаем место игрока с тем же именем,
// если он давно не в сети.
function claimSeat() {
  const s = app.state;
  if (!s || s.phase !== 'play' || s.players.some(p => p.key === app.myKey)) return;
  const i = s.players.findIndex(p => p.name === myName() && !isOnline(p.key));
  if (i < 0) return;
  commit(n => {
    n.players[i].key = app.myKey;
    n.log.push(`${n.players[i].name} вернулся в игру`);
    n.events = [];
    n.seq++;
  });
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
    if (e.pointerType !== 'mouse' || !app.state) return;
    const [wx, wy] = toWorld(e.offsetX, e.offsetY);
    if (canPlaceTile()) {
      const h = { x: Math.floor(wx), y: Math.floor(wy) };
      if (!app.hover || h.x !== app.hover.x || h.y !== app.hover.y) { app.hover = h; sendLive(); }
    }
    // Подсказка при наведении.
    if (app.hint && app.hint.sticky) return;
    const h = hintAt(wx, wy, app.hint);
    const changed = (h && h.id) !== (app.hint && app.hint.id);
    app.hint = h ? { ...h, sx: e.offsetX, sy: e.offsetY } : null;
    showTip();
    if (changed) draw();
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
      if (app.hint) { app.hint = null; showTip(); }
      draw();
    }
  }
});
cv.addEventListener('pointerleave', () => { if (app.hint && !app.hint.sticky) { app.hint = null; showTip(); draw(); } });
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
  else if (e.key === 'Escape') { app.tent = null; app.hint = null; update(); }
});

$('#btn-rotate').onclick = rotate;
$('#btn-end').onclick = endTurn;
$('#btn-skip').onclick = () => {
  if (confirm('Пропустить ход игрока, который не в сети? Тайл достанется следующему.')) commit(s => skipTurn(s));
};
$('#btn-menu').onclick = () => { if (confirm('Выйти в меню? Игру можно будет продолжить.')) leave(); };
$('#btn-leave').onclick = leave;
$('#btn-copy').onclick = () => {
  $('#invite').select();
  navigator.clipboard?.writeText($('#invite').value);
  $('#btn-copy').textContent = 'Скопировано!';
};
$('#btn-start').onclick = () => {
  const l = app.lobby;
  if (!l || l.players.length < 2) return;
  l.started = true;
  pubLobby(l);
  const s = newGame(l.players, l.opts || {});
  setState(s);
  app.conn.state(s);
};
$('#btn-again').onclick = () => {
  const s = app.state;
  const next = newGame(s.players.map(p => ({ name: p.name, key: p.key })), s.opts || {});
  app.finalShown = false;
  setState(next);
  if (app.kind === 'online') app.conn.state(next);
  fitView();
};
$('#btn-close-final').onclick = () => $('#final').classList.add('hidden');
$('#panel-toggle').onclick = () => { $('#panel').classList.toggle('collapsed'); };

applyTheme(theme);
initMenu();
initChat();
const room = new URLSearchParams(location.search).get('room');
if (room && store.get('carc-name')) startOnline(room.toUpperCase(), false);
