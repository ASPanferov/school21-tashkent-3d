// Процедурные текстуры на canvas — ничего не грузим по сети, всё рисуем сами.
// Каждая функция возвращает CanvasTexture, «размер» которой задан в метрах:
// UV у геометрии в метрах, поэтому repeat = 1 / метры.
import * as THREE from 'three';
import { rng } from './geom.js';

let MAX_ANISO = 8;
export function setMaxAniso(a) { MAX_ANISO = a; }

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, meters = [1, 1], { color = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / meters[0], 1 / meters[1]);
  }
  t.anisotropy = MAX_ANISO;
  t.needsUpdate = true;
  return t;
}

function noise(ctx, w, h, amount, seed = 1, size = 1) {
  const r = rng(seed);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y += size) for (let x = 0; x < w; x += size) {
    const n = (r() - 0.5) * amount;
    for (let yy = y; yy < Math.min(h, y + size); yy++) for (let xx = x; xx < Math.min(w, x + size); xx++) {
      const i = (yy * w + xx) * 4;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Крупноформатная плитка (керамогранит 60×60 / 60×120)
export function tiles({ base = '#e9e9e6', joint = '#cfcfca', tile = [0.6, 0.6], count = [4, 4], vary = 10, seed = 3, px = 512 } = {}) {
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = base; ctx.fillRect(0, 0, px, px);
  const r = rng(seed);
  const tw = px / count[0], th = px / count[1];
  for (let j = 0; j < count[1]; j++) for (let i = 0; i < count[0]; i++) {
    const k = (r() - 0.5) * vary;
    ctx.fillStyle = `rgba(${k > 0 ? 255 : 0},${k > 0 ? 255 : 0},${k > 0 ? 255 : 0},${Math.abs(k) / 100})`;
    ctx.fillRect(i * tw, j * th, tw, th);
  }
  noise(ctx, px, px, 10, seed);
  ctx.strokeStyle = joint; ctx.lineWidth = 2;
  for (let i = 0; i <= count[0]; i++) { ctx.beginPath(); ctx.moveTo(i * tw, 0); ctx.lineTo(i * tw, px); ctx.stroke(); }
  for (let j = 0; j <= count[1]; j++) { ctx.beginPath(); ctx.moveTo(0, j * th); ctx.lineTo(px, j * th); ctx.stroke(); }
  return tex(c, [tile[0] * count[0], tile[1] * count[1]]);
}

// Серый ПВХ/кварцвинил «под камень» в кластерах
export function clusterFloor(seed = 7) {
  const px = 512;
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = '#8f8d88'; ctx.fillRect(0, 0, px, px);
  const r = rng(seed);
  for (let i = 0; i < 900; i++) {
    const g = 120 + r() * 40;
    ctx.fillStyle = `rgba(${g},${g - 2},${g - 6},${0.12 + r() * 0.18})`;
    ctx.beginPath(); ctx.ellipse(r() * px, r() * px, 6 + r() * 40, 3 + r() * 16, r() * 3, 0, 7); ctx.fill();
  }
  noise(ctx, px, px, 14, seed);
  ctx.strokeStyle = 'rgba(60,60,58,0.25)'; ctx.lineWidth = 1.5;
  for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(0, i * px / 4); ctx.lineTo(px, i * px / 4); ctx.stroke(); }
  return tex(c, [4, 4]);
}

// Ковролин «пиксели» (конференц-зал, переговорные): синий с серыми блоками
export function pixelCarpet({ a = '#3d5a8a', b = '#8f98a6', c2 = '#5a79ad', seed = 11 } = {}) {
  const px = 512, n = 16;
  const [c, ctx] = canvas(px, px);
  const r = rng(seed);
  ctx.fillStyle = a; ctx.fillRect(0, 0, px, px);
  const cell = px / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = r();
    if (v < 0.28) { ctx.fillStyle = b; ctx.fillRect(i * cell, j * cell, cell, cell); }
    else if (v < 0.4) { ctx.fillStyle = c2; ctx.fillRect(i * cell, j * cell, cell, cell); }
  }
  noise(ctx, px, px, 26, seed, 2);
  return tex(c, [8, 8]);
}

// Дерево (кашпо, пол лаунжа, столешницы)
export function wood({ base = '#8a5a33', dark = '#5e3a1f', seed = 5, planks = 6, meters = [2.4, 1.2] } = {}) {
  const px = 512;
  const [c, ctx] = canvas(px, px);
  const r = rng(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, px, px);
  const ph = px / planks;
  for (let p = 0; p < planks; p++) {
    const tone = (r() - 0.5) * 30;
    ctx.fillStyle = `rgba(${tone > 0 ? 255 : 0},${tone > 0 ? 220 : 0},${tone > 0 ? 180 : 0},${Math.abs(tone) / 180})`;
    ctx.fillRect(0, p * ph, px, ph);
    for (let k = 0; k < 26; k++) {
      ctx.strokeStyle = `rgba(60,35,15,${0.08 + r() * 0.14})`;
      ctx.lineWidth = 0.6 + r() * 1.6;
      const y = p * ph + r() * ph;
      ctx.beginPath(); ctx.moveTo(0, y);
      for (let x = 0; x <= px; x += 32) ctx.lineTo(x, y + Math.sin(x / (40 + r() * 60) + k) * 2.5);
      ctx.stroke();
    }
    ctx.fillStyle = dark; ctx.globalAlpha = 0.5; ctx.fillRect(0, p * ph, px, 1.5); ctx.globalAlpha = 1;
  }
  return tex(c, meters);
}

// Розовый «травертин» стен амфитеатра
export function pinkStone(seed = 13) {
  const px = 512;
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = '#d9a99a'; ctx.fillRect(0, 0, px, px);
  const r = rng(seed);
  for (let i = 0; i < 2600; i++) {
    const g = r();
    ctx.fillStyle = g < 0.5 ? `rgba(245,215,200,${0.2 + r() * 0.3})` : `rgba(165,110,95,${0.1 + r() * 0.25})`;
    ctx.beginPath(); ctx.ellipse(r() * px, r() * px, 1 + r() * 5, 0.8 + r() * 3, r() * 3, 0, 7); ctx.fill();
  }
  noise(ctx, px, px, 12, seed);
  // швы блоков 0.6 × 0.3 м со смещением
  ctx.strokeStyle = 'rgba(150,100,90,0.45)'; ctx.lineWidth = 2;
  const bw = px / 2, bh = px / 4;
  for (let j = 0; j < 4; j++) {
    ctx.beginPath(); ctx.moveTo(0, j * bh); ctx.lineTo(px, j * bh); ctx.stroke();
    const off = (j % 2) * bw / 2;
    for (let i = -1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(off + i * bw, j * bh); ctx.lineTo(off + i * bw, (j + 1) * bh); ctx.stroke(); }
  }
  return tex(c, [1.2, 1.2]);
}

// Гранит цоколя и крыльца (розово-коричневый, «Капустинский»)
export function granite({ base = '#9b6f5e', seed = 17, meters = [1.2, 1.2], joints = true } = {}) {
  const px = 512;
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = base; ctx.fillRect(0, 0, px, px);
  const r = rng(seed);
  for (let i = 0; i < 9000; i++) {
    const t = r();
    ctx.fillStyle = t < 0.4 ? 'rgba(40,25,22,0.55)' : t < 0.75 ? 'rgba(210,170,150,0.5)' : 'rgba(120,70,60,0.5)';
    const s = 0.8 + r() * 2.6;
    ctx.fillRect(r() * px, r() * px, s, s);
  }
  if (joints) {
    ctx.strokeStyle = 'rgba(60,40,35,0.6)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, px - 2, px - 2);
    ctx.beginPath(); ctx.moveTo(0, px / 2); ctx.lineTo(px, px / 2); ctx.stroke();
  }
  return tex(c, meters);
}

// Белые алюминиевые композитные панели (облицовка фасада)
export function acp({ base = '#eceeed', seed = 19, panel = [1.2, 0.6] } = {}) {
  const px = 256;
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = base; ctx.fillRect(0, 0, px, px);
  noise(ctx, px, px, 5, seed);
  const g = ctx.createLinearGradient(0, 0, px, px);
  g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0.05)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, px, px);
  ctx.strokeStyle = 'rgba(120,125,125,0.55)'; ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, px, px);
  return tex(c, panel);
}

export function asphalt(seed = 23) {
  const px = 512;
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = '#54565a'; ctx.fillRect(0, 0, px, px);
  const r = rng(seed);
  for (let i = 0; i < 16000; i++) {
    const g = 60 + r() * 70;
    ctx.fillStyle = `rgba(${g},${g},${g + 3},0.5)`;
    ctx.fillRect(r() * px, r() * px, 1.4, 1.4);
  }
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = `rgba(30,30,32,${0.05 + r() * 0.08})`;
    ctx.beginPath(); ctx.ellipse(r() * px, r() * px, 20 + r() * 90, 10 + r() * 40, r() * 3, 0, 7); ctx.fill();
  }
  return tex(c, [6, 6]);
}

export function paving(seed = 29) {
  const px = 512;
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = '#b9b3a8'; ctx.fillRect(0, 0, px, px);
  const r = rng(seed);
  const bw = px / 8, bh = px / 16;
  for (let j = 0; j < 16; j++) for (let i = -1; i < 9; i++) {
    const off = (j % 2) * bw / 2;
    const k = 175 + (r() - 0.5) * 30;
    ctx.fillStyle = `rgb(${k},${k - 6},${k - 14})`;
    ctx.fillRect(off + i * bw + 1, j * bh + 1, bw - 2, bh - 2);
  }
  noise(ctx, px, px, 14, seed);
  return tex(c, [2.4, 2.4]);
}

export function grass(seed = 31) {
  const px = 512;
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = '#5f7f3a'; ctx.fillRect(0, 0, px, px);
  const r = rng(seed);
  for (let i = 0; i < 20000; i++) {
    const t = r();
    ctx.fillStyle = t < 0.5 ? `rgba(40,70,25,0.35)` : t < 0.85 ? `rgba(120,150,70,0.35)` : 'rgba(150,140,90,0.3)';
    ctx.fillRect(r() * px, r() * px, 1.5, 2.5);
  }
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(${r() < 0.5 ? '70,90,40' : '110,120,60'},${0.08 + r() * 0.1})`;
    ctx.beginPath(); ctx.ellipse(r() * px, r() * px, 30 + r() * 80, 20 + r() * 50, r() * 3, 0, 7); ctx.fill();
  }
  return tex(c, [8, 8]);
}

// Красный металлический фальц кровли
export function roofMetal() {
  const px = 256;
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = '#8f2f33'; ctx.fillRect(0, 0, px, px);
  noise(ctx, px, px, 10, 37);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = 'rgba(255,190,190,0.18)'; ctx.fillRect(i * px / 4, 0, 3, px);
    ctx.fillStyle = 'rgba(40,0,0,0.25)'; ctx.fillRect(i * px / 4 + 3, 0, 2, px);
  }
  return tex(c, [2.0, 2.0]);
}

// Гирих — синий узор со звёздами (фотозона, стены с орнаментом)
export function girih({ bg = '#0f2a6b', line = '#3f7fe0', glow = '#8fc3ff', px = 512, meters = [2.4, 2.4] } = {}) {
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, px, px);
  const cell = px / 2;
  const star = (cx, cy, R, rIn) => {
    ctx.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + Math.PI / 8;
      const rr = k % 2 ? rIn : R;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
  };
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    const cx = i * cell, cy = j * cell;
    ctx.lineWidth = 7; ctx.strokeStyle = line; star(cx, cy, cell * 0.42, cell * 0.3); ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = glow; star(cx, cy, cell * 0.42, cell * 0.3); ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = line; star(cx, cy, cell * 0.2, cell * 0.14); ctx.stroke();
  }
  ctx.lineWidth = 4; ctx.strokeStyle = line;
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    const cx = i * cell + cell / 2, cy = j * cell + cell / 2;
    ctx.beginPath(); ctx.moveTo(cx - cell * 0.18, cy); ctx.lineTo(cx, cy - cell * 0.18); ctx.lineTo(cx + cell * 0.18, cy); ctx.lineTo(cx, cy + cell * 0.18); ctx.closePath(); ctx.stroke();
  }
  return tex(c, meters);
}

// Мурал «узбекская керамика» для кухонь
export function ceramicMural(seed = 41) {
  const px = 1024;
  const [c, ctx] = canvas(px, px / 2);
  ctx.fillStyle = '#f4f6f8'; ctx.fillRect(0, 0, px, px / 2);
  const r = rng(seed);
  const cols = ['#3b6fb6', '#4aa3c7', '#d35d4a', '#e7a23b', '#7bb3e0'];
  for (let i = 0; i < 16; i++) {
    const x = r() * px, y = r() * px / 2, R = 40 + r() * 70;
    const col = cols[Math.floor(r() * cols.length)];
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = col; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, R * 0.72, 0, 7); ctx.stroke();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * R * 0.45, y + Math.sin(a) * R * 0.45, R * 0.18, R * 0.08, a, 0, 7); ctx.stroke();
    }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, R * 0.12, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const t = tex(c, [1, 1], { repeat: false });
  return t;
}

// Мурал «цифровой дождь» (синие пиксельные столбцы)
export function pixelRain(seed = 43) {
  const px = 512;
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = '#0b1a3a'; ctx.fillRect(0, 0, px, px);
  const r = rng(seed);
  const cell = 8;
  for (let x = 0; x < px; x += cell) {
    const h = r() * px;
    for (let y = px - h; y < px; y += cell) {
      const v = r();
      ctx.fillStyle = v < 0.5 ? '#2c6fd6' : v < 0.8 ? '#6aa8ff' : '#d8ecff';
      ctx.globalAlpha = 0.35 + (y - (px - h)) / h * 0.65 * r();
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    }
  }
  ctx.globalAlpha = 1;
  return tex(c, [3, 3]);
}

// Надписи для колонн кластеров: вертикальный текст на цветной полосе
const labelCache = new Map();
export function columnLabel(text, bg, fg = '#ffffff', { font = 'Unbounded', weight = 600 } = {}) {
  const key = [text, bg, fg].join('|');
  if (labelCache.has(key)) return labelCache.get(key);
  const w = 128, h = 1024;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 4, 3);
  ctx.save();
  ctx.translate(w * 0.62, h * 0.58);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = fg;
  ctx.font = `${weight} 78px ${font}, "Onest", system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 0);
  ctx.restore();
  const t = tex(c, [1, 1], { repeat: false });
  labelCache.set(key, t);
  return t;
}

// Торец стола кластера: буква ряда + номера мест
export function deskEnd(letter, bg, cluster) {
  const w = 256, h = 160;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 16px "JetBrains Mono", monospace';
  ctx.fillText(cluster.toUpperCase(), 14, 24);
  ctx.font = '700 84px "Onest", system-ui, sans-serif';
  ctx.fillText(letter, 22, 128);
  ctx.font = '600 15px "JetBrains Mono", monospace';
  const odd = ['9', '7', '5', '3', '1'], even = ['10', '8', '6', '4', '2'];
  odd.forEach((n, i) => ctx.fillText(n, 170, 52 + i * 21));
  even.forEach((n, i) => ctx.fillText(n, 200, 52 + i * 21));
  ctx.fillRect(193, 40, 2, 108);
  return tex(c, [1, 1], { repeat: false });
}

// Экран с «слайдом»
export function slide(title = 'SCHOOL 21', sub = 'это бесплатная школа цифровых технологий') {
  const w = 1024, h = 576;
  const [c, ctx] = canvas(w, h);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#1b2f8f'); g.addColorStop(0.55, '#3b36c9'); g.addColorStop(1, '#8a2bd1');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  for (let i = 0; i < 40; i++) ctx.fillRect(i * 26, 0, 1, h);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 86px "Unbounded", system-ui, sans-serif';
  ctx.fillText(title, 70, 190);
  ctx.font = '500 36px "Onest", system-ui, sans-serif';
  ctx.fillText(sub, 72, 262);
  const cards = ['Кампус 24/7/365', 'Цифровая платформа', 'Метод peer-to-peer', 'Обучение на практике'];
  cards.forEach((t, i) => {
    ctx.fillStyle = 'rgba(8,16,60,0.55)'; ctx.fillRect(70 + i * 225, 330, 205, 180);
    ctx.fillStyle = ['#6ee7b7', '#60a5fa', '#fbbf24', '#f472b6'][i]; ctx.fillRect(90 + i * 225, 350, 40, 40);
    ctx.fillStyle = '#fff'; ctx.font = '600 22px "Onest", sans-serif'; ctx.fillText(t, 90 + i * 225, 430);
  });
  return tex(c, [1, 1], { repeat: false });
}

// Стенды с портретами учёных (выставочная зона)
export function portraitPanel(seed = 1) {
  const w = 512, h = 320;
  const [c, ctx] = canvas(w, h);
  const r = rng(seed);
  ctx.fillStyle = '#1d2330'; ctx.fillRect(0, 0, w, h);
  // «портрет»
  const px = 300, py = 24, pw = 188, ph = 272;
  const g = ctx.createLinearGradient(px, py, px, py + ph);
  g.addColorStop(0, '#b98c5c'); g.addColorStop(1, '#5a3b22');
  ctx.fillStyle = g; ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = '#efe6d6'; ctx.beginPath(); ctx.ellipse(px + pw / 2, py + 70, 56, 40, 0, 0, 7); ctx.fill(); // чалма
  ctx.fillStyle = '#d6a47a'; ctx.beginPath(); ctx.ellipse(px + pw / 2, py + 130, 44, 56, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#6b4a36'; ctx.beginPath(); ctx.ellipse(px + pw / 2, py + 175, 40, 36, 0, 0, Math.PI); ctx.fill();
  ctx.fillStyle = '#3d2a1e'; ctx.fillRect(px + 30, py + 215, pw - 60, 57);
  // текст
  ctx.fillStyle = '#e8e8e8';
  ctx.font = '700 24px "Onest", sans-serif';
  const names = ['Al-Xorazmiy', 'Mirzo Ulug‘bek', 'Abu Rayhon Beruniy', 'Ibn Sino', 'Al-Farg‘oniy', 'Abu Nasr Forobiy', 'Ali Qushchi', 'Az-Zamaxshariy'];
  ctx.fillText(names[seed % names.length], 24, 52);
  ctx.fillStyle = 'rgba(232,232,232,0.55)';
  for (let i = 0; i < 9; i++) ctx.fillRect(24, 76 + i * 22, 180 + r() * 70, 8);
  return tex(c, [1, 1], { repeat: false });
}

// Надпись «21 SCHOOL» для чёрных колонн атриума
export function schoolColumn() {
  const w = 128, h = 1024;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#16181b'; ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w * 0.56, h * 0.5);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#f2f2f2';
  ctx.font = '700 70px "Unbounded", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('21 SCHOOL', 0, 0);
  ctx.restore();
  return tex(c, [1, 1], { repeat: false });
}

// Серверная стойка (фронт с индикаторами)
export function rackFront(seed = 51) {
  const w = 128, h = 512;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#0c0f16'; ctx.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let y = 8; y < h - 8; y += 18) {
    ctx.fillStyle = '#1a2130'; ctx.fillRect(8, y, w - 16, 14);
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = r() < 0.6 ? '#3fa9ff' : r() < 0.8 ? '#46e39a' : '#1b2a44';
      ctx.fillRect(14 + k * 8, y + 5, 4, 4);
    }
  }
  return tex(c, [1, 1], { repeat: false });
}

// Книжные полки
export function books(seed = 61) {
  const w = 512, h = 512;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#6e4a2c'; ctx.fillRect(0, 0, w, h);
  const r = rng(seed);
  const shelves = 5, sh = h / shelves;
  const cols = ['#7a2d2d', '#2d4a7a', '#2f6a4a', '#8a6a2a', '#3a3a3a', '#6a4a7a', '#a0522d', '#1f3b5c'];
  for (let s = 0; s < shelves; s++) {
    let x = 6;
    while (x < w - 10) {
      const bw = 6 + r() * 14, bh = sh * (0.6 + r() * 0.32);
      ctx.fillStyle = cols[Math.floor(r() * cols.length)];
      ctx.fillRect(x, s * sh + sh - bh - 6, bw, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + 1, s * sh + sh - bh, 1.2, bh - 10);
      x += bw + 1;
    }
    ctx.fillStyle = '#4a2f1a'; ctx.fillRect(0, s * sh + sh - 6, w, 6);
  }
  return tex(c, [1.8, 2.2]);
}
