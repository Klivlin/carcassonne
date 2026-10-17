// Отрисовка тайлов и фишек на canvas.
import { TILES } from './tiles.js';

const CORNERS = [[[0, 0], [1, 0]], [[1, 0], [1, 1]], [[1, 1], [0, 1]], [[0, 1], [0, 0]]];
const MIDS = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
const inward = (e, d) => [MIDS[e][0] + (0.5 - MIDS[e][0]) * d * 2, MIDS[e][1] + (0.5 - MIDS[e][1]) * d * 2];

const C = {
  field: '#93b95a', fieldDark: '#7fa64a',
  city: '#d2ad74', cityEdge: '#7c5a2e', roof: '#b4553b',
  road: '#f1e8d2', roadEdge: '#6f5d40',
  shield: '#2c56b0',
};

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

  // Дороги.
  const roads = fs.filter(f => f.t === 'road');
  const pathRoad = f => {
    ctx.beginPath();
    const a = MIDS[f.e[0]];
    ctx.moveTo(a[0], a[1]);
    if (f.e.length === 2) {
      const b = MIDS[f.e[1]];
      const opp = Math.abs(f.e[0] - f.e[1]) === 2;
      // Для поворота дуга смещена к общему углу.
      const cx = opp ? 0.5 : 0.5 + (a[0] + b[0] - 1) * 0.24;
      const cy = opp ? 0.5 : 0.5 + (a[1] + b[1] - 1) * 0.24;
      ctx.quadraticCurveTo(cx, cy, b[0], b[1]);
    } else ctx.lineTo(0.5, 0.5);
  };
  for (const w of [[0.13, C.roadEdge], [0.09, C.road]]) {
    ctx.lineWidth = w[0];
    ctx.strokeStyle = w[1];
    roads.forEach(f => { pathRoad(f); ctx.stroke(); });
  }
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
    ctx.beginPath();
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
    ctx.fillStyle = C.city;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // Черепичные крыши.
    ctx.fillStyle = C.roof;
    for (let i = 0; i < 6; i++) {
      const hx = 0.12 + ((i * 41) % 76) / 100, hy = 0.12 + ((i * 29 + 13) % 76) / 100;
      ctx.fillRect(hx, hy, 0.07, 0.05);
    }
    ctx.restore();
    ctx.lineWidth = 0.035;
    ctx.strokeStyle = C.cityEdge;
    ctx.stroke();
    if (f.shield) drawShield(ctx, f.p[0] + 0.17, f.p[1] - 0.12);
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
