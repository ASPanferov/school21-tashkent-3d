// Изображения внутри здания: стенды с портретами учёных (парящая площадка),
// фото-холсты на мольбертах (холл, фойе, коридор), ролл-ап баннер, экраны.
// Всё рисуется на canvas по мотивам панорам 360°-тура, без загрузки картинок.
import * as THREE from 'three';
import { rng } from './geom.js';
import { textureDetail } from './textures.js';

function canvas(w, h) {
  const k = textureDetail() < 1 ? 0.5 : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const ctx = c.getContext('2d');
  ctx.scale(k, k);
  return [c, ctx];
}
function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
const ell = (ctx, x, y, rx, ry, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2); };
function shade(hex, k) {
  const c = new THREE.Color(hex);
  if (k > 0) c.lerp(new THREE.Color(1, 1, 1), k); else c.multiplyScalar(1 + k);
  return `#${c.getHexString()}`;
}
// Зерно и виньетка «фотографии»
function grain(ctx, w, h, amount, seed) {
  const r = rng(seed);
  const img = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}
function vignette(ctx, w, h, a = 0.35) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}
// Строки «текста»: слова-полоски
function textLines(ctx, x, y, w, n, lh, r, color = 'rgba(232,232,244,0.62)', hgt = 5) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    let cx = x;
    const end = x + (i === n - 1 ? w * (0.35 + r() * 0.4) : w - r() * 20);
    while (cx < end - 10) {
      const ww = Math.min(end - cx, 10 + r() * 46);
      ctx.fillRect(cx, y + i * lh, ww, hgt);
      cx += ww + 5 + r() * 3;
    }
  }
}

// ── Стенды «Великие учёные» ────────────────────────────────────────────────
// По панорамам: тёмно-синий фон с туманностью, зелёный заголовок «Имя (годы)»,
// колонки текста, миниатюры рукописей и написанный маслом портрет справа.
export const SCHOLARS = [
  { name: 'Muhammad al-Xorazmiy', years: '783–850', fact: 'Algebra fanining asoschisi', turban: '#f1ede2', robe: '#2f5d8a', trim: '#d9b45a', beard: '#2b211b', beardLen: 0.8, skin: '#c99a73', age: 0.3, diagram: 'algebra' },
  { name: "Ahmad al-Farg'oniy", years: '797–865', fact: 'Astronom, Qohiradagi Nilometr quruvchisi', turban: '#f3f1ea', robe: '#6b3d2a', trim: '#e2c27a', beard: '#3a2b20', beardLen: 0.9, skin: '#c28f68', age: 0.4, diagram: 'astrolabe' },
  { name: 'Abu Rayhon al-Beruniy', years: '973–1048', fact: "Qomusiy olim, Yer radiusini o'lchagan", turban: '#f4f1e8', robe: '#355e3b', trim: '#d8c07c', beard: '#6e6962', beardLen: 1.0, skin: '#c69670', age: 0.7, diagram: 'globe' },
  { name: 'Abu Ali ibn Sino', years: '980–1037', fact: '«Tib qonunlari» muallifi', turban: '#f5efe0', robe: '#7a2e2e', trim: '#e0bf6e', beard: '#2a211c', beardLen: 0.85, skin: '#cf9e76', age: 0.35, diagram: 'herbs' },
  { name: 'Shams al-Din al-Samarqandiy', years: '1250–1310', fact: "Geometriya va mantiq bo'yicha asarlar muallifi", turban: '#ebe6d8', robe: '#3c4f7a', trim: '#cfb46b', beard: '#a9a49b', beardLen: 1.0, skin: '#c8966e', age: 0.8, diagram: 'geometry' },
  { name: "Mirzo Ulug'bek", years: '1394–1449', fact: 'Samarqand rasadxonasi asoschisi', turban: '#e9c33b', robe: '#c9a13a', trim: '#8a2f2a', beard: '#1f1814', beardLen: 0.55, skin: '#d4a077', age: 0.25, diagram: 'sextant', plume: true },
  { name: 'Jamshid al-Koshiy', years: '1380–1429', fact: 'π sonini 16 xona aniqlikda hisoblagan', turban: '#f3f1ec', robe: '#e7e2d8', trim: '#9a2c2c', beard: '#d9d5ce', beardLen: 1.25, skin: '#c89a74', age: 0.95, diagram: 'circle' },
  { name: 'Ali Qushchi', years: '1403–1474', fact: "Ulug'bek rasadxonasi astronomi", turban: '#efebe0', robe: '#2d6b6b', trim: '#d6b566', beard: '#4a3a2e', beardLen: 0.9, skin: '#c4926b', age: 0.55, diagram: 'astrolabe' },
];

// Миниатюра рукописи: пергамент, строки арабского письма, иногда схема
function manuscript(ctx, x, y, w, h, r, kind) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#ecd9a4'); g.addColorStop(1, '#c9ae72');
  ctx.fillStyle = '#3a2a18'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(120,80,30,0.18)';
  for (let i = 0; i < 6; i++) { ell(ctx, x + r() * w, y + r() * h, 6 + r() * 16, 4 + r() * 10); ctx.fill(); }
  const pad = w * 0.1;
  const split = kind && r() < 0.8;
  const tw = split ? w * 0.5 : w - pad * 2;
  ctx.strokeStyle = 'rgba(60,35,15,0.8)'; ctx.lineWidth = 1.1;
  for (let yy = y + pad; yy < y + h - pad; yy += 6.5) {
    ctx.beginPath();
    let xx = x + pad;
    ctx.moveTo(xx, yy);
    while (xx < x + pad + tw) {
      xx += 2 + r() * 4;
      ctx.lineTo(xx, yy + (r() - 0.5) * 3);
      if (r() < 0.15) { ctx.moveTo(xx + 3, yy); xx += 3; }
    }
    ctx.stroke();
  }
  if (!split) return;
  const cx = x + w * 0.78, cy = y + h * 0.5, R = Math.min(w * 0.18, h * 0.38);
  ctx.strokeStyle = 'rgba(70,40,15,0.9)'; ctx.lineWidth = 1.3;
  if (kind === 'geometry' || kind === 'algebra') {
    ctx.beginPath(); ctx.moveTo(cx - R, cy + R * 0.8); ctx.lineTo(cx + R, cy + R * 0.8); ctx.lineTo(cx - R * 0.2, cy - R); ctx.closePath(); ctx.stroke();
    ell(ctx, cx, cy + R * 0.1, R * 0.55, R * 0.55); ctx.stroke();
  } else if (kind === 'herbs') {
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(cx, cy + R); ctx.quadraticCurveTo(cx + (i - 2) * R * 0.5, cy, cx + (i - 2) * R * 0.3, cy - R); ctx.stroke(); }
  } else {
    ell(ctx, cx, cy, R, R); ctx.stroke(); ell(ctx, cx, cy, R * 0.62, R * 0.62); ctx.stroke();
    for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(cx + Math.cos(t) * R * 0.62, cy + Math.sin(t) * R * 0.62); ctx.lineTo(cx + Math.cos(t) * R, cy + Math.sin(t) * R); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.stroke();
  }
}

// Портрет «маслом»: погрудное изображение в чалме
function paintScholar(ctx, x, y, w, h, s, r) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  // фон: ночное небо обсерватории
  const bg = ctx.createRadialGradient(x + w * 0.35, y + h * 0.3, 10, x + w * 0.5, y + h * 0.5, w);
  bg.addColorStop(0, '#3c4fa8'); bg.addColorStop(0.45, '#23286a'); bg.addColorStop(1, '#140f33');
  ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`;
    const sz = r() < 0.9 ? 1.2 : 2.4;
    ctx.fillRect(x + r() * w, y + r() * h * 0.7, sz, sz);
  }
  const neb = ctx.createRadialGradient(x + w * 0.8, y + h * 0.2, 5, x + w * 0.8, y + h * 0.2, w * 0.5);
  neb.addColorStop(0, 'rgba(190,120,220,0.45)'); neb.addColorStop(1, 'rgba(190,120,220,0)');
  ctx.fillStyle = neb; ctx.fillRect(x, y, w, h);
  const cx = x + w * 0.5, cy = y + h * 0.44, fw = w * 0.19, fh = h * 0.155;
  // плечи и халат
  const robe = ctx.createLinearGradient(x, y + h * 0.6, x + w, y + h);
  robe.addColorStop(0, shade(s.robe, 0.25)); robe.addColorStop(0.6, s.robe); robe.addColorStop(1, shade(s.robe, -0.45));
  ctx.fillStyle = robe;
  ctx.beginPath();
  ctx.moveTo(x - 5, y + h + 5);
  ctx.bezierCurveTo(x + w * 0.02, y + h * 0.78, x + w * 0.12, y + h * 0.68, cx - fw * 1.05, y + h * 0.66);
  ctx.lineTo(cx + fw * 1.05, y + h * 0.66);
  ctx.bezierCurveTo(x + w * 0.88, y + h * 0.68, x + w * 0.98, y + h * 0.78, x + w + 5, y + h + 5);
  ctx.closePath(); ctx.fill();
  // складки
  ctx.strokeStyle = shade(s.robe, -0.35); ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const fx = x + w * (0.12 + i * 0.15 + (r() - 0.5) * 0.05);
    ctx.beginPath(); ctx.moveTo(fx, y + h * 0.78 + r() * 20); ctx.quadraticCurveTo(fx + (r() - 0.5) * 30, y + h * 0.9, fx + (r() - 0.5) * 20, y + h + 4); ctx.stroke();
  }
  // ворот с каймой
  ctx.fillStyle = s.trim;
  ctx.beginPath(); ctx.moveTo(cx - fw * 0.95, y + h * 0.66); ctx.lineTo(cx, y + h * 0.9); ctx.lineTo(cx + fw * 0.95, y + h * 0.66); ctx.lineTo(cx + fw * 0.6, y + h * 0.66); ctx.lineTo(cx, y + h * 0.8); ctx.lineTo(cx - fw * 0.6, y + h * 0.66); ctx.closePath(); ctx.fill();
  // шея
  ctx.fillStyle = shade(s.skin, -0.25);
  ctx.fillRect(cx - fw * 0.45, cy + fh * 0.6, fw * 0.9, fh * 1.4);
  // лицо
  const face = ctx.createRadialGradient(cx - fw * 0.35, cy - fh * 0.3, 2, cx, cy, fw * 1.3);
  face.addColorStop(0, shade(s.skin, 0.25)); face.addColorStop(0.7, s.skin); face.addColorStop(1, shade(s.skin, -0.35));
  ctx.fillStyle = face; ell(ctx, cx, cy, fw, fh); ctx.fill();
  // уши
  ctx.fillStyle = shade(s.skin, -0.15);
  ell(ctx, cx - fw * 0.98, cy + fh * 0.05, fw * 0.14, fh * 0.2); ctx.fill();
  ell(ctx, cx + fw * 0.98, cy + fh * 0.05, fw * 0.14, fh * 0.2); ctx.fill();
  // борода и усы
  const bl = s.beardLen;
  const bd = ctx.createLinearGradient(cx, cy, cx, cy + fh * (1.2 + bl));
  bd.addColorStop(0, shade(s.beard, 0.1)); bd.addColorStop(1, shade(s.beard, -0.2));
  ctx.fillStyle = bd;
  ctx.beginPath();
  ctx.moveTo(cx - fw * 0.98, cy + fh * 0.05);
  ctx.bezierCurveTo(cx - fw * 1.0, cy + fh * (0.9 + bl * 0.4), cx - fw * 0.45, cy + fh * (1.1 + bl), cx, cy + fh * (1.25 + bl));
  ctx.bezierCurveTo(cx + fw * 0.45, cy + fh * (1.1 + bl), cx + fw * 1.0, cy + fh * (0.9 + bl * 0.4), cx + fw * 0.98, cy + fh * 0.05);
  ctx.quadraticCurveTo(cx + fw * 0.6, cy + fh * 0.55, cx, cy + fh * 0.5);
  ctx.quadraticCurveTo(cx - fw * 0.6, cy + fh * 0.55, cx - fw * 0.98, cy + fh * 0.05);
  ctx.fill();
  ctx.strokeStyle = shade(s.beard, s.age > 0.6 ? -0.25 : 0.3); ctx.lineWidth = 1.2;
  for (let i = 0; i < 26; i++) {
    const bx = cx + (r() - 0.5) * fw * 1.5;
    ctx.beginPath(); ctx.moveTo(bx, cy + fh * (0.5 + r() * 0.4)); ctx.quadraticCurveTo(bx + (r() - 0.5) * 8, cy + fh * (0.9 + bl * 0.5), bx * 0.3 + cx * 0.7, cy + fh * (1.0 + bl * r())); ctx.stroke();
  }
  ctx.fillStyle = shade(s.beard, -0.1);
  ctx.beginPath(); ctx.moveTo(cx - fw * 0.55, cy + fh * 0.42); ctx.quadraticCurveTo(cx, cy + fh * 0.22, cx + fw * 0.55, cy + fh * 0.42); ctx.quadraticCurveTo(cx, cy + fh * 0.36, cx - fw * 0.55, cy + fh * 0.42); ctx.fill();
  // рот
  ctx.strokeStyle = shade(s.skin, -0.5); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx - fw * 0.18, cy + fh * 0.5); ctx.lineTo(cx + fw * 0.18, cy + fh * 0.5); ctx.stroke();
  // нос
  ctx.strokeStyle = shade(s.skin, -0.3); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx + fw * 0.05, cy - fh * 0.12); ctx.quadraticCurveTo(cx + fw * 0.18, cy + fh * 0.2, cx - fw * 0.05, cy + fh * 0.26); ctx.stroke();
  // глаза и брови
  for (const sg of [-1, 1]) {
    const ex = cx + sg * fw * 0.4, ey = cy - fh * 0.12;
    ctx.fillStyle = '#f3ece2'; ell(ctx, ex, ey, fw * 0.17, fh * 0.07); ctx.fill();
    ctx.fillStyle = '#2a1a10'; ell(ctx, ex + fw * 0.03, ey, fw * 0.07, fh * 0.065); ctx.fill();
    ctx.strokeStyle = shade(s.beard, -0.2); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(ex - fw * 0.22, ey - fh * 0.14); ctx.quadraticCurveTo(ex, ey - fh * 0.24, ex + fw * 0.22, ey - fh * 0.16); ctx.stroke();
    if (s.age > 0.6) { ctx.strokeStyle = shade(s.skin, -0.3); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ex - fw * 0.15, ey + fh * 0.12); ctx.quadraticCurveTo(ex, ey + fh * 0.17, ex + fw * 0.15, ey + fh * 0.12); ctx.stroke(); }
  }
  // чалма: витки
  const tcy = cy - fh * 0.82;
  // купол чалмы, поверх — косые витки ткани
  const dome = ctx.createRadialGradient(cx - fw * 0.4, tcy - fh * 0.6, 2, cx, tcy - fh * 0.2, fw * 1.6);
  dome.addColorStop(0, shade(s.turban, 0.2)); dome.addColorStop(0.7, s.turban); dome.addColorStop(1, shade(s.turban, -0.4));
  ctx.fillStyle = dome; ell(ctx, cx, tcy - fh * 0.35, fw * 1.42, fh * 0.78); ctx.fill();
  for (let k = 0; k < 3; k++) {
    const g = ctx.createLinearGradient(cx - fw * 1.4, tcy, cx + fw * 1.4, tcy);
    g.addColorStop(0, shade(s.turban, -0.3)); g.addColorStop(0.45, shade(s.turban, 0.18)); g.addColorStop(1, shade(s.turban, -0.38));
    ctx.fillStyle = g;
    ell(ctx, cx + (k % 2 ? 5 : -5), tcy - k * fh * 0.28 + fh * 0.05, fw * (1.46 - k * 0.14), fh * 0.24, (k % 2 ? 0.16 : -0.16)); ctx.fill();
    ctx.strokeStyle = shade(s.turban, -0.35); ctx.lineWidth = 1.4; ctx.stroke();
  }
  if (s.plume) {
    ctx.fillStyle = '#b3262e'; ell(ctx, cx, tcy - fh * 0.3, fw * 0.12, fh * 0.1); ctx.fill();
    ctx.strokeStyle = '#f5f0e0'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx, tcy - fh * 0.35); ctx.quadraticCurveTo(cx + fw * 0.3, tcy - fh * 1.4, cx + fw * 0.7, tcy - fh * 1.8); ctx.stroke();
  }
  // мазки: лёгкая фактура холста
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`;
    ctx.fillRect(x + r() * w, y + r() * h, 2 + r() * 6, 1 + r() * 2);
  }
  ctx.restore();
}

export function scholarPanel(i) {
  const s = SCHOLARS[((i % SCHOLARS.length) + SCHOLARS.length) % SCHOLARS.length];
  const W = 1024, H = 512;
  const [c, ctx] = canvas(W, H);
  const r = rng(301 + i * 17);
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#171a3f'); bg.addColorStop(0.6, '#241b4d'); bg.addColorStop(1, '#3a2466');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // туманность за текстом
  for (let k = 0; k < 3; k++) {
    const gx = r() * W * 0.6, gy = r() * H, gr = 120 + r() * 160;
    const g = ctx.createRadialGradient(gx, gy, 5, gx, gy, gr);
    g.addColorStop(0, `rgba(${k % 2 ? '120,90,220' : '60,110,210'},0.22)`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  for (let k = 0; k < 120; k++) { ctx.fillStyle = `rgba(255,255,255,${0.1 + r() * 0.3})`; ctx.fillRect(r() * 620, r() * H, 1.3, 1.3); }
  // заголовок
  ctx.fillStyle = '#3ee07f';
  ctx.font = '700 34px "Onest", "Helvetica Neue", sans-serif';
  ctx.fillText(s.name, 34, 62);
  const nw = ctx.measureText(s.name).width;
  ctx.font = '600 20px "Onest", sans-serif';
  ctx.fillText(`(${s.years})`, 34 + nw + 12, 62);
  ctx.fillStyle = '#eef0fa';
  ctx.font = '500 21px "Onest", sans-serif';
  ctx.fillText(s.fact, 34, 100);
  // текст и рукописи
  const mA = [400, 128, 190, 124], mB = [34, 318, 150, 160], mC = [400, 330, 120, 140];
  textLines(ctx, 34, 130, 350, 7, 24, r);
  textLines(ctx, 200, 318 + 6, 184, 7, 24, r);
  textLines(ctx, 34, 300 - 12, 350, 1, 24, r);
  textLines(ctx, 536, 334, 80, 6, 24, r);
  manuscript(ctx, ...mA, r, s.diagram);
  manuscript(ctx, ...mB, r, null);
  manuscript(ctx, ...mC, r, s.diagram);
  // портрет
  paintScholar(ctx, 640, 20, 364, 472, s, r);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.strokeRect(640, 20, 364, 472);
  return tex(c);
}

// ── Фото-холсты на мольбертах ───────────────────────────────────────────────
const SKINS = ['#c89b7b', '#b98563', '#e0b393', '#a8745a', '#d6a585', '#c08a6a'];
const HAIR = ['#1b1512', '#2b1f18', '#3b2a1e', '#15110e', '#4a3526'];
// Человек по пояс/в рост: x — центр, y — уровень пояса, s — масштаб (радиус головы)
function person(ctx, x, y, s, r, { shirt, legs = false, pants = '#2c3a55', arms = null } = {}) {
  const skin = SKINS[Math.floor(r() * SKINS.length)], hair = HAIR[Math.floor(r() * HAIR.length)];
  shirt ??= ['#1f2d5a', '#f2f2f2', '#1a1a1a', '#8fb3d9', '#2f6b4f', '#d9d2c5'][Math.floor(r() * 6)];
  if (legs) {
    ctx.fillStyle = pants;
    rr(ctx, x - s * 1.0, y - s * 0.2, s * 0.9, s * 4.4, s * 0.3); ctx.fill();
    rr(ctx, x + s * 0.1, y - s * 0.2, s * 0.9, s * 4.4, s * 0.3); ctx.fill();
    ctx.fillStyle = '#e8e8e8'; rr(ctx, x - s * 1.1, y + s * 4.0, s * 1.0, s * 0.45, s * 0.2); ctx.fill(); rr(ctx, x + s * 0.1, y + s * 4.0, s * 1.0, s * 0.45, s * 0.2); ctx.fill();
  }
  const g = ctx.createLinearGradient(x - s * 1.4, 0, x + s * 1.4, 0);
  g.addColorStop(0, shade(shirt, 0.12)); g.addColorStop(1, shade(shirt, -0.3));
  ctx.fillStyle = g;
  rr(ctx, x - s * 1.35, y - s * 3.3, s * 2.7, s * 3.6, s * 0.9); ctx.fill();
  if (arms) {
    ctx.strokeStyle = shirt; ctx.lineWidth = s * 0.7; ctx.lineCap = 'round';
    for (const [ax, ay] of arms) { ctx.beginPath(); ctx.moveTo(x + Math.sign(ax) * s * 1.1, y - s * 2.8); ctx.lineTo(x + ax * s, y + ay * s); ctx.stroke(); }
    ctx.fillStyle = skin;
    for (const [ax, ay] of arms) { ell(ctx, x + ax * s, y + ay * s, s * 0.35, s * 0.35); ctx.fill(); }
  }
  ctx.fillStyle = shade(skin, -0.2); ctx.fillRect(x - s * 0.3, y - s * 3.8, s * 0.6, s * 0.6);
  const fg = ctx.createRadialGradient(x - s * 0.25, y - s * 4.25, 0.5, x, y - s * 4.0, s * 0.9);
  fg.addColorStop(0, shade(skin, 0.2)); fg.addColorStop(1, shade(skin, -0.2));
  ctx.fillStyle = fg; ell(ctx, x, y - s * 4.05, s * 0.72, s * 0.85); ctx.fill();
  ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(x, y - s * 4.35, s * 0.76, s * 0.6, 0, Math.PI, Math.PI * 2); ctx.fill();
}
function office(ctx, W, H, r) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#dfe3e6'); g.addColorStop(0.55, '#eef0f1'); g.addColorStop(1, '#c9cccf');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#2b2e33'; ctx.fillRect(0, 0, W, H * 0.16);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3;
  for (let k = 0; k < 4; k++) { const yy = H * (0.03 + k * 0.035); ctx.beginPath(); ctx.moveTo(W * (0.25 - k * 0.06), yy); ctx.lineTo(W * (0.75 + k * 0.06), yy); ctx.stroke(); }
}
export const PHOTO_COUNT = 6;
export function eventPhoto(k) {
  const W = 640, H = 500;
  const [c, ctx] = canvas(W, H);
  const r = rng(700 + k * 31);
  k = ((k % PHOTO_COUNT) + PHOTO_COUNT) % PHOTO_COUNT;
  if (k === 0) {
    // групповое фото у входа «21 PROGRAMMING SCHOOL»
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.6);
    g.addColorStop(0, '#cfc3ad'); g.addColorStop(1, '#bfb198');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#9d907a';
    for (let i = 0; i < 8; i++) ctx.fillRect(i * 84 + 10, 0, 6, H * 0.55);
    ctx.fillStyle = '#6f7f8f';
    for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) if (i !== 3) { ctx.fillRect(i * 88 + 22, 40 + j * 110, 48, 70); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(i * 88 + 22, 40 + j * 110, 16, 70); ctx.fillStyle = '#6f7f8f'; }
    ctx.fillStyle = '#e9e4da'; ctx.fillRect(W * 0.3, H * 0.12, W * 0.4, H * 0.2);
    ctx.fillStyle = '#1fc4e6'; ctx.font = '800 64px "Unbounded", "Onest", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('21', W * 0.5, H * 0.24);
    ctx.fillStyle = '#ffffff'; ctx.font = '700 20px "Onest", sans-serif';
    ctx.fillText('PROGRAMMING SCHOOL', W * 0.5, H * 0.3);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#7d705f'; ctx.fillRect(0, H * 0.58, W, H * 0.42);
    for (let row = 0; row < 3; row++) {
      const n = 11 - row, s = 12 + row * 3, yy = H * (0.62 + row * 0.14);
      for (let i = 0; i < n; i++) person(ctx, W * (0.04 + (i + 0.5 + (row % 2) * 0.3) * (0.92 / n)) + (r() - 0.5) * 10, yy + (r() - 0.5) * 6, s, r, { legs: row === 2, pants: '#27324a' });
    }
    ctx.fillStyle = '#4f7a3a'; ctx.fillRect(0, H * 0.94, W, H * 0.06);
  } else if (k === 1) {
    // студенты в кластере у мониторов
    office(ctx, W, H, r);
    ctx.fillStyle = '#f2c230'; ctx.fillRect(W * 0.06, H * 0.16, W * 0.1, H * 0.84);
    ctx.fillStyle = '#1d1d1d'; ctx.font = '700 22px "Onest", sans-serif';
    ctx.save(); ctx.translate(W * 0.13, H * 0.25); ctx.rotate(Math.PI / 2); ctx.fillText('Bukhara', 0, 0); ctx.restore();
    ctx.fillStyle = '#f7f7f7'; ctx.fillRect(W * 0.18, H * 0.47, W * 0.82, 12);
    for (let i = 0; i < 8; i++) {
      const dx = W * (0.24 + i * 0.1);
      ctx.fillStyle = '#1b1f26'; ctx.fillRect(dx - 22, H * 0.39, 44, 30);
      ctx.fillStyle = 'rgba(130,185,255,0.85)'; ctx.fillRect(dx - 20, H * 0.4, 40, 25);
      ctx.fillStyle = '#9aa0a8'; ctx.fillRect(dx - 3, H * 0.45, 6, 8);
    }
    const xs = [0.3, 0.44, 0.56, 0.7, 0.84].map((f) => W * f + (r() - 0.5) * 24);
    xs.forEach((px, i) => person(ctx, px, H * 0.6 + i % 2 * 12, 17 + r() * 4, r, { legs: true, pants: ['#3a4f73', '#2c3a55', '#6b7a8c'][i % 3], arms: i === 3 ? [[2.6, -1.2], [-1.4, 0.8]] : null }));
  } else if (k === 2) {
    // руки с браслетом-пропуском
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1f3a6b'); g.addColorStop(1, '#0f1d3a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 18;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(r() * W, 0); ctx.quadraticCurveTo(r() * W, H / 2, r() * W, H); ctx.stroke(); }
    const skin = '#d7a887';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#b8bcc4'; ctx.lineWidth = 120; ctx.beginPath(); ctx.moveTo(-40, H * 1.05); ctx.lineTo(W * 0.3, H * 0.62); ctx.stroke();
    ctx.strokeStyle = skin; ctx.lineWidth = 88; ctx.beginPath(); ctx.moveTo(W * 0.28, H * 0.64); ctx.lineTo(W * 0.62, H * 0.38); ctx.stroke();
    ctx.lineWidth = 80; ctx.strokeStyle = shade(skin, -0.08); ctx.beginPath(); ctx.moveTo(W * 1.1, H * 0.2); ctx.lineTo(W * 0.72, H * 0.44); ctx.stroke();
    ctx.fillStyle = shade(skin, 0.05); ell(ctx, W * 0.66, H * 0.36, 70, 48, -0.6); ctx.fill();
    ctx.strokeStyle = '#27b35a'; ctx.lineWidth = 26; ctx.beginPath(); ctx.moveTo(W * 0.46, H * 0.56); ctx.lineTo(W * 0.52, H * 0.44); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(W * 0.47, H * 0.47, 22, 12);
  } else if (k === 3) {
    // хакатон: толпа, фиолетовый свет
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a0f3a'); g.addColorStop(1, '#0b0a1a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) {
      const bx = r() * W, by = r() * H * 0.6, br = 8 + r() * 26;
      const bg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      const col = ['160,90,255', '90,140,255', '60,220,240', '255,120,220'][Math.floor(r() * 4)];
      bg.addColorStop(0, `rgba(${col},0.55)`); bg.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = bg; ctx.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    for (let row = 0; row < 3; row++) {
      const n = 7 + row * 2, s = 10 + row * 4;
      for (let i = 0; i < n; i++) {
        const up = r() < 0.4;
        person(ctx, W * ((i + 0.5) / n) + (r() - 0.5) * 20, H * (0.55 + row * 0.16), s, r, { shirt: ['#2a2350', '#3b2f6e', '#1c1c2e', '#5a3f8f'][Math.floor(r() * 4)], arms: up ? [[1.8, -6.5], [-1.9, -6.2]] : null });
      }
    }
    for (let i = 0; i < 140; i++) { ctx.fillStyle = ['#ff6fd8', '#6fe7ff', '#ffe16f', '#a78bff'][i % 4]; ctx.fillRect(r() * W, r() * H * 0.8, 3, 5); }
  } else if (k === 4) {
    // выпускной: сцена, большой экран «21», сертификаты
    ctx.fillStyle = '#12121c'; ctx.fillRect(0, 0, W, H);
    const sg = ctx.createLinearGradient(W * 0.2, 0, W * 0.8, H * 0.5);
    sg.addColorStop(0, '#5b2bd6'); sg.addColorStop(1, '#2a7bf0');
    ctx.fillStyle = sg; ctx.fillRect(W * 0.18, H * 0.06, W * 0.64, H * 0.36);
    ctx.fillStyle = '#ffffff'; ctx.font = '800 90px "Unbounded", "Onest", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('21', W * 0.5, H * 0.33); ctx.textAlign = 'left';
    ctx.fillStyle = '#2a2a36'; ctx.fillRect(0, H * 0.62, W, H * 0.06);
    for (let i = 0; i < 7; i++) {
      const px = W * (0.12 + i * 0.125);
      person(ctx, px, H * 0.6, 12, r, { legs: false, shirt: ['#1a1a1a', '#f2f2f2', '#23305c'][i % 3] });
      ctx.fillStyle = '#fafafa'; ctx.fillRect(px - 10, H * 0.47, 22, 16);
    }
    for (let i = 0; i < 12; i++) person(ctx, W * ((i + 0.3) / 12), H * 1.02, 22, r, { shirt: '#15151f' });
  } else {
    // код на экране за плечом студента
    ctx.fillStyle = '#0f1116'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#1b1f27'; ctx.fillRect(W * 0.12, H * 0.08, W * 0.8, H * 0.58);
    ctx.fillStyle = '#0d1117'; ctx.fillRect(W * 0.14, H * 0.1, W * 0.76, H * 0.54);
    const cols = ['#7ee787', '#79c0ff', '#ff7b72', '#d2a8ff', '#e6edf3', '#e6edf3'];
    for (let i = 0; i < 16; i++) {
      let x0 = W * 0.17 + (i % 5 === 0 ? 0 : 18 + (i % 3) * 14);
      const y0 = H * 0.13 + i * 17;
      while (x0 < W * (0.5 + r() * 0.35)) {
        const w = 12 + r() * 50; ctx.fillStyle = cols[Math.floor(r() * cols.length)]; ctx.fillRect(x0, y0, w, 6); x0 += w + 7;
      }
    }
    ctx.fillStyle = '#23262e'; ctx.fillRect(W * 0.2, H * 0.74, W * 0.6, H * 0.08);
    ctx.fillStyle = '#0a0a0e'; ell(ctx, W * 0.16, H * 0.82, 120, 160); ctx.fill();
    ctx.fillStyle = '#16161d'; ell(ctx, W * 0.18, H * 0.48, 62, 72); ctx.fill();
    const lg = ctx.createLinearGradient(W * 0.14, 0, W * 0.3, 0);
    lg.addColorStop(0, 'rgba(120,180,255,0)'); lg.addColorStop(1, 'rgba(120,180,255,0.25)');
    ctx.fillStyle = lg; ell(ctx, W * 0.2, H * 0.5, 50, 62); ctx.fill();
  }
  vignette(ctx, W, H, 0.3);
  grain(ctx, W, H, 14, 17 + k);
  return tex(c);
}

// Ролл-ап «SCHOOL 21» у турникетов (по панораме холла)
export function rollupBanner() {
  const W = 420, H = 1000;
  const [c, ctx] = canvas(W, H);
  const r = rng(907);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#1b2256'); g.addColorStop(1, '#2a1b52');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = '500 16px "Onest", sans-serif';
  ctx.fillText("RAQAMLI TEXNOLOGIYALAR MAKTABI", 28, 60);
  ctx.fillStyle = '#39d0f0'; ctx.font = '800 64px "Unbounded", "Onest", sans-serif';
  ctx.fillText('SCHOOL', 26, 136); ctx.fillText('21', 26, 206);
  ctx.fillStyle = '#ffffff'; ctx.font = '700 24px "Onest", sans-serif';
  ctx.fillText("BIZGA QO'SHILING!", 28, 270);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#39d0f0'; ctx.fillRect(28, 300 + i * 56, 10, 10);
    textLines(ctx, 48, 298 + i * 56, 330, 2, 18, r, 'rgba(255,255,255,0.8)', 6);
  }
  ctx.fillStyle = '#39d0f0'; ctx.font = '700 22px "Onest", sans-serif';
  ctx.fillText("BARCHA KERAKLI TILLAR", 28, 560);
  ctx.fillText("YO'NALISHLAR:", 28, 588);
  textLines(ctx, 28, 612, 350, 9, 22, r, 'rgba(255,255,255,0.72)', 5);
  // логотип и QR
  ctx.fillStyle = '#39d0f0'; rr(ctx, 28, 840, 120, 110, 16); ctx.fill();
  ctx.fillStyle = '#10163a'; ctx.font = '800 58px "Unbounded", "Onest", sans-serif'; ctx.fillText('21', 44, 918);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(270, 830, 124, 124);
  ctx.fillStyle = '#111111';
  for (let yy = 0; yy < 21; yy++) for (let xx = 0; xx < 21; xx++) if (r() < 0.48) ctx.fillRect(276 + xx * 5.4, 836 + yy * 5.4, 5.4, 5.4);
  for (const [qx, qy] of [[276, 836], [357, 836], [276, 917]]) { ctx.fillStyle = '#111'; ctx.fillRect(qx, qy, 32, 32); ctx.fillStyle = '#fff'; ctx.fillRect(qx + 5, qy + 5, 22, 22); ctx.fillStyle = '#111'; ctx.fillRect(qx + 10, qy + 10, 12, 12); }
  ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '500 15px "Onest", sans-serif';
  ctx.fillText('Toshkent, Ziyolilar ko‘chasi, 13', 28, 980);
  return tex(c);
}

// Экран на колонне у турникетов: фиолетовая заставка с «21»
export function lobbyScreen() {
  const W = 512, H = 288;
  const [c, ctx] = canvas(W, H);
  const r = rng(911);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#6c3bd9'); g.addColorStop(1, '#3a2a9a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 18; i++) { ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ell(ctx, W * 0.6 + r() * 60, H * 0.6, 20 + i * 12, 12 + i * 7); ctx.stroke(); }
  ctx.fillStyle = '#ffffff'; ctx.font = '700 22px "Onest", sans-serif';
  ctx.fillText('XUSH KELIBSIZ', 30, 52);
  textLines(ctx, 30, 70, 230, 2, 18, r, 'rgba(255,255,255,0.8)', 6);
  ctx.font = '800 64px "Unbounded", "Onest", sans-serif'; ctx.fillText('21', W - 120, 84);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 5; i++) { rr(ctx, 60 + i * 34, 150 + (i % 2) * 20, 26, 60, 8); ctx.fill(); }
  return tex(c);
}

// Мурал кухни: крупные гранаты (анор) с белым сюзане-орнаментом и пиксельные столбцы
// розово-сиреневых тонов на белой стене (панорама кухни 2 этажа)
function pomegranate(ctx, x, y, R, col, r) {
  const g = ctx.createRadialGradient(x - R * 0.35, y - R * 0.35, R * 0.1, x, y, R * 1.05);
  g.addColorStop(0, shade(col, 0.25)); g.addColorStop(0.75, col); g.addColorStop(1, shade(col, -0.25));
  ctx.fillStyle = g; ell(ctx, x, y, R, R * 0.96); ctx.fill();
  // корона-чашечка
  ctx.fillStyle = shade(col, -0.1);
  ctx.beginPath();
  const cy = y - R * 0.92;
  ctx.moveTo(x - R * 0.28, cy + R * 0.08);
  for (let k = 0; k <= 5; k++) { const px = x - R * 0.28 + k * R * 0.112; ctx.lineTo(px, cy - (k % 2 ? R * 0.05 : R * 0.2)); }
  ctx.lineTo(x + R * 0.28, cy + R * 0.08); ctx.closePath(); ctx.fill();
  // сюзане: розетка, лепестки, зёрна, завитки — белой линией
  ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = Math.max(2, R * 0.022);
  ell(ctx, x, y, R * 0.12, R * 0.12); ctx.stroke();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ctx.save(); ctx.translate(x + Math.cos(a) * R * 0.32, y + Math.sin(a) * R * 0.32); ctx.rotate(a);
    ell(ctx, 0, 0, R * 0.16, R * 0.07); ctx.stroke();
    ctx.restore();
  }
  ell(ctx, x, y, R * 0.55, R * 0.53); ctx.stroke();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + 0.2;
    ell(ctx, x + Math.cos(a) * R * 0.7, y + Math.sin(a) * R * 0.68, R * 0.045, R * 0.045); ctx.fill();
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + r();
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * R * 0.82, y + Math.sin(a) * R * 0.8, R * 0.09, a, a + Math.PI * 1.4);
    ctx.stroke();
  }
}
export function pomegranateMural() {
  const W = 1536, H = 512;
  const [c, ctx] = canvas(W, H);
  const r = rng(1201);
  ctx.fillStyle = '#f6f6f8'; ctx.fillRect(0, 0, W, H);
  // пиксельные столбцы: розовый → сиреневый → голубой
  const pal = ['#f4a7c4', '#e7a6d8', '#c9b3ec', '#a9c3ef', '#f7c0a8'];
  for (let x = 0; x < W; x += 14) {
    const band = Math.sin(x / W * Math.PI * 3 + 0.5);
    if (band < -0.2) continue;
    const top = H * (0.1 + r() * 0.5);
    for (let y = top; y < H; y += 14) {
      if (r() < 0.25) continue;
      ctx.globalAlpha = 0.25 + r() * 0.45;
      ctx.fillStyle = pal[Math.floor(((x / W) * 3 + r() * 0.8) % pal.length)];
      ctx.fillRect(x, y, 11, 11);
    }
  }
  ctx.globalAlpha = 1;
  const cols = ['#3f6fd8', '#f08a4b', '#3fb6c9', '#8f63c9', '#2f5fc4', '#f2a24a'];
  const spots = [[160, 250, 150], [420, 360, 120], [610, 170, 135], [860, 330, 165], [1110, 190, 125], [1330, 360, 150], [1480, 120, 90], [300, 90, 80]];
  spots.forEach(([x, y, R], i) => pomegranate(ctx, x, y, R, cols[i % cols.length], r));
  return tex(c);
}
