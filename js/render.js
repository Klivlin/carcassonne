// Отрисовка тайлов и фишек на canvas.
import { TILES, features, rotPoint } from './tiles.js?v=8';

const CORNERS = [[[0, 0], [1, 0]], [[1, 0], [1, 1]], [[1, 1], [0, 1]], [[0, 1], [0, 0]]];
const MIDS = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
const inward = (e, d) => [MIDS[e][0] + (0.5 - MIDS[e][0]) * d * 2, MIDS[e][1] + (0.5 - MIDS[e][1]) * d * 2];

const C = {
  field: '#93b95a', fieldDark: '#7fa64a',
  city: '#d2ad74', cityEdge: '#7c5a2e', roof: '#b4553b',
  road: '#f1e8d2', roadEdge: '#6f5d40',
  shield: '#2c56b0',
  water: '#3f8fd8', waterEdge: '#bfe0f7',
};

// Путь по краям e: две стороны — дуга через центр, одна — до центра.
function edgePath(e) {
  const ctx = new Path2D();
  const a = MIDS[e[0]];
  ctx.moveTo(a[0], a[1]);
  if (e.length === 2) {
    const b = MIDS[e[1]];
    const opp = Math.abs(e[0] - e[1]) === 2;
    // Для поворота дуга смещена к общему углу.
    const cx = opp ? 0.5 : 0.5 + (a[0] + b[0] - 1) * 0.24;
    const cy = opp ? 0.5 : 0.5 + (a[1] + b[1] - 1) * 0.24;
    ctx.quadraticCurveTo(cx, cy, b[0], b[1]);
  } else ctx.lineTo(0.5, 0.5);
  return ctx;
}

// Контур города (в координатах тайла без поворота).
function cityPath(f) {
  const ctx = new Path2D();
  if (f.e.length === 4) ctx.rect(0, 0, 1, 1);
  else if (f.e.length === 1) {
    const [a, b] = CORNERS[f.e[0]];
    const c = inward(f.e[0], 0.56);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    ctx.quadraticCurveTo(c[0], c[1], a[0], a[1]);
  } else {
    let first = true;
    const to = p => { first ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); first = false; };
    for (let e = 0; e < 4; e++) {
      if (f.e.includes(e)) { to(CORNERS[e][0]); to(CORNERS[e][1]); }
      else to(inward(e, 0.4));
    }
    ctx.closePath();
  }
  return ctx;
}

// Какой признак тайла под точкой (fx, fy) в координатах клетки 0..1 — для подсказки очков.
const hitCtx = document.createElement('canvas').getContext('2d');
export function hitFeature(type, rot, fx, fy) {
  const [ux, uy] = rotPoint([fx, fy], (4 - rot) % 4);
  const fs = TILES[type].f;
  hitCtx.setTransform(100, 0, 0, 100, 0, 0);
  const px = ux * 100, py = uy * 100;
  let i = fs.findIndex(f => f.t === 'monastery');
  if (i >= 0 && ux > 0.3 && ux < 0.7 && uy > 0.25 && uy < 0.7) return i;
  hitCtx.lineWidth = 0.15;
  i = fs.findIndex(f => f.t === 'road' && hitCtx.isPointInStroke(edgePath(f.e), px, py));
  if (i >= 0) return i;
  i = fs.findIndex(f => f.t === 'city' && hitCtx.isPointInPath(cityPath(f), px, py));
  if (i >= 0) return i;
  if (fs.some(f => f.t === 'river' && hitCtx.isPointInStroke(edgePath(f.e), px, py))) return -1;
  // Поле — ближайшее по точке фишки.
  let best = -1, bd = Infinity;
  features(type, 0).forEach((f, j) => {
    if (f.t !== 'field') return;
    const d = Math.hypot(f.p[0] - ux, f.p[1] - uy);
    if (d < bd) { bd = d; best = j; }
  });
  return best;
}

// Рисует тайл type с поворотом rot в квадрате (x, y, s).
export function drawTile(ctx, type, rot, x, y, s) {
  const fs = TILES[type].f;
  ctx.save();
  ctx.translate(x + s / 2, y + s / 2);
  ctx.rotate(rot * Math.PI / 2);
  ctx.translate(-s / 2, -s / 2);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.fillStyle = C.field;
  ctx.fillRect(0, 0, 1, 1);
  // Немного «травы».
  ctx.fillStyle = C.fieldDark;
  for (let i = 0; i < 9; i++) {
    const px = ((i * 37 + type.charCodeAt(0) * 13) % 89) / 89, py = ((i * 53 + 7) % 83) / 83;
    ctx.fillRect(px * 0.9 + 0.05, py * 0.9 + 0.05, 0.03, 0.012);
  }

  // Река.
  for (const f of fs.filter(f => f.t === 'river')) {
    for (const w of [[0.2, C.waterEdge], [0.14, C.water]]) {
      ctx.lineWidth = w[0];
      ctx.strokeStyle = w[1];
      ctx.stroke(edgePath(f.e));
    }
  }
  const tdef = TILES[type];
  if (tdef.spring || tdef.lake) {
    const r = tdef.lake ? 0.3 : 0.11;
    ctx.beginPath(); ctx.arc(0.5, 0.5, r + 0.03, 0, Math.PI * 2); ctx.fillStyle = C.waterEdge; ctx.fill();
    ctx.beginPath(); ctx.arc(0.5, 0.5, r, 0, Math.PI * 2); ctx.fillStyle = C.water; ctx.fill();
  }

  // Дороги.
  const roads = fs.filter(f => f.t === 'road');
  for (const w of [[0.13, C.roadEdge], [0.09, C.road]]) {
    ctx.lineWidth = w[0];
    ctx.strokeStyle = w[1];
    roads.forEach(f => ctx.stroke(edgePath(f.e)));
  }
  for (const f of roads) if (f.inn) drawInn(ctx, f.mp[0], f.mp[1]);
  const single = roads.filter(f => f.e.length === 1).length;
  if (single >= 3) {
    ctx.fillStyle = '#8b6b4a';
    ctx.strokeStyle = '#4a3820';
    ctx.lineWidth = 0.02;
    ctx.fillRect(0.4, 0.4, 0.2, 0.2);
    ctx.strokeRect(0.4, 0.4, 0.2, 0.2);
    ctx.fillStyle = C.roof;
    ctx.beginPath(); ctx.moveTo(0.38, 0.45); ctx.lineTo(0.5, 0.36); ctx.lineTo(0.62, 0.45); ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  // Города.
  for (const f of fs.filter(f => f.t === 'city')) {
    const path = cityPath(f);
    ctx.fillStyle = C.city;
    ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    // Черепичные крыши.
    ctx.fillStyle = C.roof;
    for (let i = 0; i < 6; i++) {
      const hx = 0.12 + ((i * 41) % 76) / 100, hy = 0.12 + ((i * 29 + 13) % 76) / 100;
      ctx.fillRect(hx, hy, 0.07, 0.05);
    }
    ctx.restore();
    ctx.lineWidth = 0.035;
    ctx.strokeStyle = C.cityEdge;
    ctx.stroke(path);
    if (f.shield) drawShield(ctx, f.p[0] + 0.17, f.p[1] - 0.12);
    if (f.cathedral) drawCathedral(ctx);
    if (f.goods) drawGoods(ctx, f.goods, f.mp[0], f.mp[1]);
  }

  // Монастырь.
  if (fs.some(f => f.t === 'monastery')) {
    ctx.fillStyle = '#efe3c8';
    ctx.strokeStyle = '#5a4630';
    ctx.lineWidth = 0.02;
    ctx.fillRect(0.33, 0.42, 0.34, 0.24);
    ctx.strokeRect(0.33, 0.42, 0.34, 0.24);
    ctx.fillStyle = C.roof;
    ctx.beginPath(); ctx.moveTo(0.29, 0.44); ctx.lineTo(0.5, 0.28); ctx.lineTo(0.71, 0.44); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillRect(0.46, 0.18, 0.08, 0.14);
    ctx.fillStyle = '#5a4630';
    ctx.fillRect(0.46, 0.54, 0.08, 0.12);
  }
  ctx.restore();
  drawTileIcons(ctx, type, rot, x, y, s);
}

// Значки «Принцессы и дракона» рисуются поверх и не поворачиваются вместе с тайлом.
function emoji(ctx, ch, x, y, size) {
  ctx.save();
  ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, x, y);
  ctx.restore();
}

function drawTileIcons(ctx, type, rot, x, y, s) {
  const d = TILES[type];
  const at = (p, ch, k) => { const [px, py] = rotPoint(p, rot); emoji(ctx, ch, x + px * s, y + py * s, s * k); };
  if (d.volcano) {
    const [px, py] = [x + s / 2, y + s / 2];
    ctx.save();
    ctx.fillStyle = '#6b4a35';
    ctx.beginPath(); ctx.moveTo(px - s * 0.22, py + s * 0.16); ctx.lineTo(px - s * 0.06, py - s * 0.12);
    ctx.lineTo(px + s * 0.06, py - s * 0.12); ctx.lineTo(px + s * 0.22, py + s * 0.16); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8501f';
    ctx.beginPath(); ctx.ellipse(px, py - s * 0.12, s * 0.07, s * 0.025, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(px - s * 0.05, py - s * 0.12); ctx.lineTo(px - s * 0.09, py + s * 0.02); ctx.lineTo(px - s * 0.02, py - s * 0.12); ctx.fill();
    ctx.restore();
  }
  if (d.dragon) {
    const [px, py] = rotPoint([0.85, 0.85], rot);
    ctx.beginPath(); ctx.arc(x + px * s, y + py * s, s * 0.11, 0, Math.PI * 2);
    ctx.fillStyle = '#b3201a'; ctx.fill();
    emoji(ctx, '🐉', x + px * s, y + py * s, s * 0.15);
  }
  if (d.portal) {
    const [px, py] = rotPoint(d.pp, rot);
    ctx.save();
    const g = ctx.createRadialGradient(x + px * s, y + py * s, 0, x + px * s, y + py * s, s * 0.17);
    g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#c58cff'); g.addColorStop(1, '#6a2fc000');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x + px * s, y + py * s, s * 0.17, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  for (const f of d.f) if (f.princess) at(f.mp, '👸', 0.18);
}

// Дракон на поле.
export function drawDragon(ctx, x, y, s) {
  ctx.save();
  ctx.shadowColor = '#000a'; ctx.shadowBlur = s * 0.12;
  ctx.beginPath(); ctx.arc(x, y, s * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = '#b3201a'; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(2, s * 0.035); ctx.strokeStyle = '#ffd84a'; ctx.stroke();
  emoji(ctx, '🐉', x, y + s * 0.02, s * 0.46);
  ctx.restore();
}

// Трактир: домик у пруда.
function drawInn(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath(); ctx.ellipse(0.04, 0.07, 0.08, 0.04, 0, 0, Math.PI * 2);
  ctx.fillStyle = C.water; ctx.fill();
  ctx.fillStyle = '#f3e3c3'; ctx.strokeStyle = '#4a3820'; ctx.lineWidth = 0.012;
  ctx.fillRect(-0.07, -0.05, 0.1, 0.08); ctx.strokeRect(-0.07, -0.05, 0.1, 0.08);
  ctx.beginPath(); ctx.moveTo(-0.09, -0.04); ctx.lineTo(-0.02, -0.1); ctx.lineTo(0.05, -0.04); ctx.closePath();
  ctx.fillStyle = C.roof; ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e8b400'; ctx.fillRect(-0.035, -0.02, 0.03, 0.03);
  ctx.restore();
}

// Собор в центре города.
function drawCathedral(ctx) {
  ctx.save();
  ctx.fillStyle = '#ece4d4'; ctx.strokeStyle = '#4a3820'; ctx.lineWidth = 0.015;
  ctx.fillRect(0.38, 0.4, 0.24, 0.2); ctx.strokeRect(0.38, 0.4, 0.24, 0.2);
  ctx.fillRect(0.45, 0.22, 0.1, 0.18); ctx.strokeRect(0.45, 0.22, 0.1, 0.18);
  ctx.beginPath(); ctx.moveTo(0.43, 0.23); ctx.lineTo(0.5, 0.12); ctx.lineTo(0.57, 0.23); ctx.closePath();
  ctx.fillStyle = '#6b6f9a'; ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#6b6f9a';
  ctx.beginPath(); ctx.arc(0.5, 0.6, 0.045, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#e8b400';
  ctx.beginPath(); ctx.arc(0.5, 0.3, 0.025, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Значок товара: вино, зерно, ткань.
export function drawGoods(ctx, g, x, y, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath(); ctx.arc(0, 0, 0.075, 0, Math.PI * 2);
  ctx.fillStyle = '#fff8e8'; ctx.fill();
  ctx.strokeStyle = '#4a3820'; ctx.lineWidth = 0.012; ctx.stroke();
  if (g === 'wine') {
    ctx.fillStyle = '#7b2d6b';
    for (const [dx, dy] of [[-0.022, -0.02], [0.022, -0.02], [0, 0.005], [-0.022, 0.03], [0.022, 0.03], [0, 0.05]]) {
      ctx.beginPath(); ctx.arc(dx, dy - 0.01, 0.017, 0, Math.PI * 2); ctx.fill();
    }
  } else if (g === 'grain') {
    ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 0.012;
    ctx.beginPath(); ctx.moveTo(0, 0.055); ctx.lineTo(0, -0.05); ctx.stroke();
    ctx.fillStyle = '#d9a514';
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(sx * 0.014, -0.04 + i * 0.022, 0.012, 0.007, sx * 0.6, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    ctx.fillStyle = '#3d6fb8';
    ctx.fillRect(-0.045, -0.04, 0.09, 0.08);
    ctx.strokeStyle = '#cfe0f5'; ctx.lineWidth = 0.01;
    for (const dy of [-0.015, 0.015]) { ctx.beginPath(); ctx.moveTo(-0.045, dy); ctx.lineTo(0.045, dy); ctx.stroke(); }
  }
  ctx.restore();
}

function drawShield(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(-0.06, -0.05); ctx.lineTo(0.06, -0.05); ctx.lineTo(0.06, 0.01);
  ctx.quadraticCurveTo(0.06, 0.06, 0, 0.08); ctx.quadraticCurveTo(-0.06, 0.06, -0.06, 0.01);
  ctx.closePath();
  ctx.fillStyle = C.shield; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.015; ctx.stroke();
  ctx.restore();
}

// Фишка-человечек с центром в (x, y), высотой h.
export function drawMeeple(ctx, x, y, h, color, lying = false) {
  ctx.save();
  ctx.translate(x, y);
  if (lying) ctx.rotate(-Math.PI / 2);
  ctx.scale(h, h);
  ctx.beginPath();
  ctx.arc(0, -0.32, 0.15, 0, Math.PI * 2);
  ctx.moveTo(-0.12, -0.2);
  ctx.lineTo(0.12, -0.2);
  ctx.lineTo(0.42, -0.06);
  ctx.lineTo(0.36, 0.06);
  ctx.lineTo(0.16, 0.0);
  ctx.lineTo(0.3, 0.45);
  ctx.lineTo(0.06, 0.45);
  ctx.lineTo(0, 0.25);
  ctx.lineTo(-0.06, 0.45);
  ctx.lineTo(-0.3, 0.45);
  ctx.lineTo(-0.16, 0.0);
  ctx.lineTo(-0.36, 0.06);
  ctx.lineTo(-0.42, -0.06);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 0.06;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.restore();
}

// Строитель: высокая фигурка-«пешка» с белым молоточком.
export function drawBuilder(ctx, x, y, h, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(h, h);
  ctx.beginPath();
  ctx.arc(0, -0.36, 0.13, 0, Math.PI * 2);
  ctx.moveTo(-0.1, -0.24);
  ctx.lineTo(0.1, -0.24);
  ctx.lineTo(0.2, 0.36);
  ctx.lineTo(0.3, 0.45);
  ctx.lineTo(-0.3, 0.45);
  ctx.lineTo(-0.2, 0.36);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 0.06;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 0.06;
  ctx.beginPath(); ctx.moveTo(-0.05, 0.25); ctx.lineTo(0.08, -0.05); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0.0, -0.07); ctx.lineTo(0.16, 0.0); ctx.stroke();
  ctx.restore();
}

// Любая фигура: обычная фишка, большая или строитель.
export function drawFigure(ctx, kind, x, y, h, color, lying) {
  if (kind === 'builder') drawBuilder(ctx, x, y, h * 1.05, color);
  else if (kind === 'pig') {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, h * 0.46, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = h * 0.08; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.restore();
    emoji(ctx, '🐷', x, y + h * 0.03, h * 0.62);
  }
  else drawMeeple(ctx, x, y, kind === 'big' ? h * 1.4 : h, color, lying);
}
