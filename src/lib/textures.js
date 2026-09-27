// Процедурные текстуры на canvas — ничего не грузим по сети, всё рисуем сами.
// Каждая функция возвращает CanvasTexture, «размер» которой задан в метрах:
// UV у геометрии в метрах, поэтому repeat = 1 / метры.
// У многих поверхностей есть парные карты: texture.userData.normalMap / .roughnessMap
// (тот же размер в метрах) — их подхватывает materials.js.
import * as THREE from 'three';
import { rng } from './geom.js';

let MAX_ANISO = 8;
export function setMaxAniso(a) { MAX_ANISO = a; }
// Детальность процедурных карт: 1 — полная, 0.5 — телефоны (вдвое меньше пикселей)
let DETAIL = 1;
export function setTextureDetail(k) { DETAIL = k; }
export const textureDetail = () => DETAIL;
const P2 = (px) => Math.max(64, Math.round(px * DETAIL));

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

function tex(c, meters = [1, 1], { color = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  else t.colorSpace = THREE.NoColorSpace;
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

// ── Поля высот и шероховатости ──────────────────────────────────────────────
// Плавный «value noise» с периодом (бесшовный), значения 0..1
function valueNoise(w, h, cell, seed) {
  const r = rng(seed);
  const gw = Math.max(1, Math.round(w / cell)), gh = Math.max(1, Math.round(h / cell));
  const g = new Float32Array(gw * gh).map(() => r());
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = (y / h) * gh, y0 = Math.floor(fy), ty = fy - y0, sy_ = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * gw, x0 = Math.floor(fx), tx = fx - x0, sx_ = tx * tx * (3 - 2 * tx);
      const a = g[(y0 % gh) * gw + (x0 % gw)], b = g[(y0 % gh) * gw + ((x0 + 1) % gw)];
      const c = g[((y0 + 1) % gh) * gw + (x0 % gw)], d = g[((y0 + 1) % gh) * gw + ((x0 + 1) % gw)];
      out[y * w + x] = (a + (b - a) * sx_) * (1 - sy_) + (c + (d - c) * sx_) * sy_;
    }
  }
  return out;
}
function fbm(w, h, cell, seed, oct = 4) {
  const out = new Float32Array(w * h);
  let amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) {
    const n = valueNoise(w, h, Math.max(1, cell / 2 ** o), seed + o * 31);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}
function whiteNoise(w, h, seed) { const r = rng(seed); return new Float32Array(w * h).map(() => r()); }

// Карта нормалей из поля высот (0..1). strength — крутизна рельефа.
function normalFromHeight(hgt, w, h, strength, meters) {
  const [c, ctx] = canvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const xl = (x - 1 + w) % w, xr = (x + 1) % w, yu = (y - 1 + h) % h, yd = (y + 1) % h;
    const dx = (hgt[y * w + xr] - hgt[y * w + xl]) * strength;
    const dy = (hgt[yd * w + x] - hgt[yu * w + x]) * strength;
    // canvas: y вниз, текстура: v вверх (flipY) → знак по y обратный
    let nx = -dx, ny = dy, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, meters, { color: false });
}
// Карта шероховатости (канал G), значения 0..1
function roughFromField(f, w, h, meters) {
  const [c, ctx] = canvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < w * h; i++) { const v = Math.max(0, Math.min(255, f[i] * 255)); d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return tex(c, meters, { color: false });
}
function withMaps(t, hgt, rough, w, h, strength, meters) {
  if (hgt) t.userData.normalMap = normalFromHeight(hgt, w, h, strength, meters);
  if (rough) t.userData.roughnessMap = roughFromField(rough, w, h, meters);
  return t;
}
// Швы сетки в поле высот: углубление шириной jw пикселей
function carveGrid(hgt, w, h, nx, ny, jw, depth = 1) {
  const cw = w / nx, ch = h / ny;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dxl = Math.min(x % cw, cw - (x % cw)), dyl = Math.min(y % ch, ch - (y % ch));
    const dd = Math.min(dxl, dyl);
    if (dd < jw) hgt[y * w + x] -= depth * (1 - dd / jw) ** 0.5;
  }
}

// ── Полы ────────────────────────────────────────────────────────────────────
// Крупноформатная плитка (керамогранит 60×60 / 60×120): глянцевая, со швами
export function tiles({ base = '#e9e9e6', joint = '#cfcfca', tile = [0.6, 0.6], count = [4, 4], vary = 10, seed = 3, px = 512, gloss = 0.22 } = {}) {
  px = P2(px);
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = base; ctx.fillRect(0, 0, px, px);
  const r = rng(seed);
  const tw = px / count[0], th = px / count[1];
  const rough = new Float32Array(px * px);
  const tileR = [];
  for (let j = 0; j < count[1]; j++) for (let i = 0; i < count[0]; i++) {
    const k = (r() - 0.5) * vary;
    ctx.fillStyle = `rgba(${k > 0 ? 255 : 0},${k > 0 ? 255 : 0},${k > 0 ? 255 : 0},${Math.abs(k) / 100})`;
    ctx.fillRect(i * tw, j * th, tw, th);
    // лёгкий «камень» внутри плитки
    for (let s = 0; s < 18; s++) {
      ctx.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '120,118,112'},${0.02 + r() * 0.03})`;
      ctx.beginPath(); ctx.ellipse(i * tw + r() * tw, j * th + r() * th, 4 + r() * tw * 0.3, 2 + r() * th * 0.12, r() * 3, 0, 7); ctx.fill();
    }
    tileR.push(gloss * (0.85 + r() * 0.3));
  }
  noise(ctx, px, px, 8, seed);
  ctx.strokeStyle = joint; ctx.lineWidth = Math.max(1.5, px / 256);
  for (let i = 0; i <= count[0]; i++) { ctx.beginPath(); ctx.moveTo(i * tw, 0); ctx.lineTo(i * tw, px); ctx.stroke(); }
  for (let j = 0; j <= count[1]; j++) { ctx.beginPath(); ctx.moveTo(0, j * th); ctx.lineTo(px, j * th); ctx.stroke(); }
  const meters = [tile[0] * count[0], tile[1] * count[1]];
  const t = tex(c, meters);
  const n = fbm(px, px, px / 6, seed + 5, 3);
  const hgt = new Float32Array(px * px).map((_, i) => n[i] * 0.04);
  carveGrid(hgt, px, px, count[0], count[1], Math.max(1.5, px / 200), 0.9);
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const ti = Math.floor(y / th) * count[0] + Math.floor(x / tw);
    rough[y * px + x] = hgt[y * px + x] < -0.2 ? 0.85 : tileR[ti] + (n[y * px + x] - 0.5) * 0.08;
  }
  return withMaps(t, hgt, rough, px, px, 2.2, meters);
}

// Серый ПВХ/кварцвинил «под камень» в кластерах (сетка 60 см)
export function clusterFloor(seed = 7) {
  const px = P2(512);
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = '#8f8d88'; ctx.fillRect(0, 0, px, px);
  const r = rng(seed);
  for (let i = 0; i < 900; i++) {
    const g = 120 + r() * 40;
    ctx.fillStyle = `rgba(${g},${g - 2},${g - 6},${0.12 + r() * 0.18})`;
    ctx.beginPath(); ctx.ellipse(r() * px, r() * px, 6 + r() * 40, 3 + r() * 16, r() * 3, 0, 7); ctx.fill();
  }
  noise(ctx, px, px, 14, seed);
  ctx.strokeStyle = 'rgba(60,60,58,0.3)'; ctx.lineWidth = 1.5;
  for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(0, i * px / 4); ctx.lineTo(px, i * px / 4); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i * px / 4, 0); ctx.lineTo(i * px / 4, px); ctx.stroke(); }
  const t = tex(c, [2.4, 2.4]);
  const n = fbm(px, px, px / 8, seed + 3, 4);
  const hgt = n.map((v) => v * 0.05);
  carveGrid(hgt, px, px, 4, 4, 1.4, 0.5);
  const rough = n.map((v, i) => (hgt[i] < -0.15 ? 0.8 : 0.42 + (v - 0.5) * 0.2));
  return withMaps(t, hgt, rough, px, px, 2.0, [2.4, 2.4]);
}

// Ковролин «пиксели» (конференц-зал, переговорные)
export function pixelCarpet({ a = '#3d5a8a', b = '#8f98a6', c2 = '#5a79ad', seed = 11 } = {}) {
  const px = P2(512), n = 16;
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
  const t = tex(c, [8, 8]);
  // ворс: мелкий шум + сетка ковровых плиток 50 см
  const hgt = whiteNoise(px, px, seed + 9).map((v) => v * 0.5);
  carveGrid(hgt, px, px, 16, 16, 1.0, 0.4);
  return withMaps(t, hgt, null, px, px, 1.2, [8, 8]);
}

// Ковролин конференц-зала: синий с бежевыми ступенчатыми диагоналями (панорама RQJ)
export function stepCarpet({ a = '#323b5c', b = '#cdbf9f', seed = 29 } = {}) {
  const px = P2(512), n = 16;
  const [c, ctx] = canvas(px, px);
  const r = rng(seed);
  ctx.fillStyle = a; ctx.fillRect(0, 0, px, px);
  const cell = px / n;
  ctx.fillStyle = b;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const d = (i + j) % 8;
    if (d === 0 || (d === 1 && r() < 0.7) || (d === 4 && (i % 4 === 0) && r() < 0.8)) ctx.fillRect(i * cell, j * cell, cell, cell);
  }
  noise(ctx, px, px, 22, seed, 2);
  const t = tex(c, [8, 8]);
  const hgt = whiteNoise(px, px, seed + 9).map((v) => v * 0.5);
  carveGrid(hgt, px, px, 16, 16, 1.0, 0.4);
  return withMaps(t, hgt, null, px, px, 1.2, [8, 8]);
}

// Графитовая стена за LED-экраном: ступенчатые ромбы серым (узор ковра, панорама RQJ)
export function stepWall({ bg = '#2f3237', line = '#5d6168', meters = [2.4, 2.4] } = {}) {
  const px = P2(512), n = 24, s = px / n;
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = line;
  for (const [cx, cy] of [[0, 0], [12, 12], [24, 0], [0, 24], [24, 24]]) {
    for (const rad of [3, 7, 11]) {
      for (let k = -rad; k <= rad; k++) {
        const w = rad - Math.abs(k);
        ctx.fillRect((cx + w) * s, (cy + k) * s, s, s);
        ctx.fillRect((cx - w) * s, (cy + k) * s, s, s);
      }
    }
  }
  noise(ctx, px, px, 10, 5, 2);
  return tex(c, meters);
}

// Дерево (кашпо, пол лаунжа, столешницы): волокна + швы досок
export function wood({ base = '#8a5a33', dark = '#5e3a1f', seed = 5, planks = 6, meters = [2.4, 1.2], rough = 0.5 } = {}) {
  const px = P2(512);
  const [c, ctx] = canvas(px, px);
  const r = rng(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, px, px);
  const ph = px / planks;
  const hgt = new Float32Array(px * px);
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
    // торцевой стык доски
    const cut = r() * px;
    ctx.fillStyle = dark; ctx.globalAlpha = 0.35; ctx.fillRect(cut, p * ph, 1.5, ph); ctx.globalAlpha = 1;
    for (let y = Math.floor(p * ph); y < Math.min(px, Math.floor(p * ph + 2)); y++) for (let x = 0; x < px; x++) hgt[y * px + x] -= 0.6;
    for (let y = Math.floor(p * ph); y < Math.min(px, Math.floor((p + 1) * ph)); y++) for (let x = Math.floor(cut); x < Math.min(px, Math.floor(cut) + 2); x++) hgt[y * px + x] -= 0.4;
  }
  // волокна в поле высот (вдоль x)
  const grain = valueNoise(px, px, 3, seed + 3);
  const g2 = valueNoise(px, px, 48, seed + 7);
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const i = y * px + x;
    hgt[i] += grain[(y * px + Math.floor(x / 16) % px) % (px * px)] * 0.06 + g2[i] * 0.05;
  }
  const t = tex(c, meters);
  const rf = g2.map((v, i) => (hgt[i] < -0.3 ? 0.9 : rough + (v - 0.5) * 0.18));
  return withMaps(t, hgt, rf, px, px, 1.6, meters);
}

// Розовый «травертин» стен амфитеатра
export function pinkStone(seed = 13) {
  const px = P2(512);
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = '#dfbba5'; ctx.fillRect(0, 0, px, px);   // светлый персиковый туф (панорамы 0fA, Jfv)
  const r = rng(seed);
  const hgt = fbm(px, px, px / 6, seed, 4).map((v) => v * 0.15);
  for (let i = 0; i < 2600; i++) {
    const g = r();
    const x = r() * px, y = r() * px, rx = 1 + r() * 5, ry = 0.8 + r() * 3;
    ctx.fillStyle = g < 0.5 ? `rgba(245,222,205,${0.2 + r() * 0.3})` : `rgba(170,120,100,${0.06 + r() * 0.2})`;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, r() * 3, 0, 7); ctx.fill();
    // поры
    if (g >= 0.5) for (let yy = Math.max(0, Math.floor(y - ry)); yy < Math.min(px, y + ry); yy++) for (let xx = Math.max(0, Math.floor(x - rx)); xx < Math.min(px, x + rx); xx++) hgt[yy * px + xx] -= 0.25;
  }
  noise(ctx, px, px, 12, seed);
  // швы блоков 0.6 × 0.3 м со смещением
  ctx.strokeStyle = 'rgba(150,100,90,0.45)'; ctx.lineWidth = 2;
  const bw = px / 2, bh = px / 4;
  for (let j = 0; j < 4; j++) {
    ctx.beginPath(); ctx.moveTo(0, j * bh); ctx.lineTo(px, j * bh); ctx.stroke();
    const off = (j % 2) * bw / 2;
    for (let i = -1; i < 3; i++) { ctx.beginPath(); ctx.moveTo(off + i * bw, j * bh); ctx.lineTo(off + i * bw, (j + 1) * bh); ctx.stroke(); }
    for (let x = 0; x < px; x++) for (let y = Math.floor(j * bh); y < Math.floor(j * bh) + 2 && y < px; y++) hgt[y * px + x] -= 0.5;
    for (let i = -1; i < 3; i++) { const x0 = Math.floor(off + i * bw); if (x0 < 0 || x0 >= px - 2) continue; for (let y = Math.floor(j * bh); y < Math.floor((j + 1) * bh); y++) { hgt[y * px + x0] -= 0.5; hgt[y * px + x0 + 1] -= 0.5; } }
  }
  const t = tex(c, [1.2, 1.2]);
  const rf = hgt.map((v) => 0.75 + Math.min(0.2, -v * 0.3));
  return withMaps(t, hgt, rf, px, px, 2.5, [1.2, 1.2]);
}

// Гранит (цоколь, крыльцо): крапинки + швы; polished — полированный (гладкий)
export function granite({ base = '#9b6f5e', seed = 17, meters = [1.2, 1.2], joints = true, polished = true, flecks = 9000 } = {}) {
  const px = P2(512);
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = base; ctx.fillRect(0, 0, px, px);
  const r = rng(seed);
  const rough = new Float32Array(px * px).fill(polished ? 0.28 : 0.62);
  const nF = Math.round(flecks * DETAIL * DETAIL);
  for (let i = 0; i < nF; i++) {
    const t = r();
    ctx.fillStyle = t < 0.4 ? 'rgba(40,25,22,0.55)' : t < 0.75 ? 'rgba(210,170,150,0.5)' : 'rgba(120,70,60,0.5)';
    const s = (0.8 + r() * 2.6) * DETAIL;
    const x = r() * px, y = r() * px;
    ctx.fillRect(x, y, s, s);
    if (t < 0.4) { const k = Math.floor(y) * px + Math.floor(x); if (k < rough.length) rough[k] += 0.15; }
  }
  const hgt = whiteNoise(px, px, seed + 1).map((v) => v * (polished ? 0.03 : 0.3));
  if (joints) {
    ctx.strokeStyle = 'rgba(60,40,35,0.6)'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, px - 2, px - 2);
    ctx.beginPath(); ctx.moveTo(0, px / 2); ctx.lineTo(px, px / 2); ctx.stroke();
    carveGrid(hgt, px, px, 1, 2, 2, 0.8);
    for (let i = 0; i < hgt.length; i++) if (hgt[i] < -0.3) rough[i] = 0.9;
  }
  const t = tex(c, meters);
  return withMaps(t, hgt, rough, px, px, polished ? 2.5 : 3.0, meters);
}

// Белые алюминиевые композитные панели (облицовка фасада). Швы — геометрией (shell.js),
// в текстуре только лёгкая неоднородность покраски.
export function acp({ base = '#eceeed', seed = 19, panel = [1.2, 0.6], joints = false } = {}) {
  const px = P2(256);
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = base; ctx.fillRect(0, 0, px, px);
  noise(ctx, px, px, 4, seed);
  const g = ctx.createLinearGradient(0, 0, px, px);
  g.addColorStop(0, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.035)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, px, px);
  if (joints) { ctx.strokeStyle = 'rgba(120,125,125,0.55)'; ctx.lineWidth = 2; ctx.strokeRect(0, 0, px, px); }
  const t = tex(c, panel);
  const n = fbm(px, px, px / 2, seed + 2, 2);
  const hgt = n.map((v) => v * 0.2);
  const rf = n.map((v) => 0.32 + (v - 0.5) * 0.12);
  return withMaps(t, hgt, rf, px, px, 0.6, panel);
}

export function asphalt(seed = 23) {
  const px = P2(512);
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = '#56585b'; ctx.fillRect(0, 0, px, px);
  const r = rng(seed);
  for (let i = 0; i < 16000 * DETAIL * DETAIL; i++) {
    const g = 60 + r() * 70;
    ctx.fillStyle = `rgba(${g},${g},${g + 3},0.5)`;
    ctx.fillRect(r() * px, r() * px, 1.4, 1.4);
  }
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = `rgba(30,30,32,${0.05 + r() * 0.08})`;
    ctx.beginPath(); ctx.ellipse(r() * px, r() * px, 20 + r() * 90, 10 + r() * 40, r() * 3, 0, 7); ctx.fill();
  }
  const t = tex(c, [6, 6]);
  const hgt = whiteNoise(px, px, seed + 2).map((v) => v * 0.6);
  const n = fbm(px, px, px / 4, seed + 4, 3);
  const rf = n.map((v) => 0.82 + (v - 0.5) * 0.25);
  return withMaps(t, hgt, rf, px, px, 1.5, [6, 6]);
}

export function paving(seed = 29) {
  const px = P2(512);
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = '#b9b3a8'; ctx.fillRect(0, 0, px, px);
  const r = rng(seed);
  const bw = px / 8, bh = px / 16;
  const hgt = new Float32Array(px * px);
  for (let j = 0; j < 16; j++) for (let i = -1; i < 9; i++) {
    const off = (j % 2) * bw / 2;
    const k = 175 + (r() - 0.5) * 30;
    ctx.fillStyle = `rgb(${k},${k - 6},${k - 14})`;
    ctx.fillRect(off + i * bw + 1, j * bh + 1, bw - 2, bh - 2);
  }
  // швы — по разнице яркости с базой
  const img = ctx.getImageData(0, 0, px, px).data;
  for (let i = 0; i < px * px; i++) hgt[i] = Math.abs(img[i * 4] - 185) < 1 && Math.abs(img[i * 4 + 1] - 179) < 1 ? -0.6 : 0;
  noise(ctx, px, px, 14, seed);
  const t = tex(c, [2.4, 2.4]);
  const wn = whiteNoise(px, px, seed + 1);
  for (let i = 0; i < hgt.length; i++) hgt[i] += wn[i] * 0.1;
  return withMaps(t, hgt, hgt.map((v) => (v < -0.3 ? 0.95 : 0.8)), px, px, 2.0, [2.4, 2.4]);
}

export function grass(seed = 31) {
  const px = P2(512);
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = '#5b7a37'; ctx.fillRect(0, 0, px, px);
  const r = rng(seed);
  for (let i = 0; i < 20000 * DETAIL * DETAIL; i++) {
    const t = r();
    ctx.fillStyle = t < 0.5 ? `rgba(40,70,25,0.35)` : t < 0.85 ? `rgba(120,150,70,0.35)` : 'rgba(150,140,90,0.3)';
    ctx.fillRect(r() * px, r() * px, 1.5, 2.5);
  }
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(${r() < 0.5 ? '70,90,40' : '110,120,60'},${0.08 + r() * 0.1})`;
    ctx.beginPath(); ctx.ellipse(r() * px, r() * px, 30 + r() * 80, 20 + r() * 50, r() * 3, 0, 7); ctx.fill();
  }
  const t = tex(c, [8, 8]);
  const hgt = whiteNoise(px, px, seed + 3).map((v) => v * 0.8);
  return withMaps(t, hgt, null, px, px, 1.2, [8, 8]);
}

// Кровельная мембрана (красно-бордовая, как на спутнике) со швами полотен
export function roofMetal() {
  const px = P2(256);
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = '#8a3438'; ctx.fillRect(0, 0, px, px);
  noise(ctx, px, px, 10, 37);
  const hgt = fbm(px, px, px / 3, 37, 3).map((v) => v * 0.15);
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(i * px / 4);
    ctx.fillStyle = 'rgba(255,190,190,0.14)'; ctx.fillRect(x, 0, 3, px);
    ctx.fillStyle = 'rgba(40,0,0,0.22)'; ctx.fillRect(x + 3, 0, 2, px);
    for (let y = 0; y < px; y++) { hgt[y * px + x] += 0.5; hgt[y * px + x + 1] += 0.5; hgt[y * px + x + 2] += 0.3; }
  }
  const t = tex(c, [2.0, 2.0]);
  return withMaps(t, hgt, hgt.map((v) => 0.62 - v * 0.2), px, px, 2.0, [2.0, 2.0]);
}

// Бетон (перекрытия, подвалы, технические поверхности)
export function concrete({ base = '#b4b2ac', seed = 71, meters = [3, 3] } = {}) {
  const px = P2(256);
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = base; ctx.fillRect(0, 0, px, px);
  const n = fbm(px, px, px / 4, seed, 4);
  const img = ctx.getImageData(0, 0, px, px);
  for (let i = 0; i < px * px; i++) { const k = (n[i] - 0.5) * 34; img.data[i * 4] += k; img.data[i * 4 + 1] += k; img.data[i * 4 + 2] += k; }
  ctx.putImageData(img, 0, 0);
  noise(ctx, px, px, 10, seed);
  const t = tex(c, meters);
  const hgt = whiteNoise(px, px, seed + 1).map((v, i) => v * 0.2 + n[i] * 0.3);
  return withMaps(t, hgt, n.map((v) => 0.8 + (v - 0.5) * 0.2), px, px, 1.4, meters);
}

// Шахматная плитка 40×40 (заглублённая дорожка вдоль СВ фасада)
export function checker({ a = '#e9e7e2', b = '#2a2b2e', size = 0.4, seed = 73 } = {}) {
  const px = P2(256);
  const [c, ctx] = canvas(px, px);
  const n = 4, cs = px / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { ctx.fillStyle = (i + j) % 2 ? a : b; ctx.fillRect(i * cs, j * cs, cs, cs); }
  noise(ctx, px, px, 12, seed);
  ctx.strokeStyle = 'rgba(120,120,115,0.6)'; ctx.lineWidth = 1.5;
  for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(i * cs, 0); ctx.lineTo(i * cs, px); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * cs); ctx.lineTo(px, i * cs); ctx.stroke(); }
  const m = [size * n, size * n];
  const t = tex(c, m);
  const hgt = whiteNoise(px, px, seed).map((v) => v * 0.1);
  carveGrid(hgt, px, px, n, n, 1.5, 0.8);
  return withMaps(t, hgt, hgt.map((v) => (v < -0.3 ? 0.9 : 0.55)), px, px, 2.0, m);
}

// Грунт в цветниках: тёмная земля с мульчей
export function soil(seed = 79) {
  const px = P2(256);
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = '#3b2e24'; ctx.fillRect(0, 0, px, px);
  const r = rng(seed);
  for (let i = 0; i < 3000 * DETAIL; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(90,70,50,0.6)' : 'rgba(20,15,10,0.5)'; ctx.fillRect(r() * px, r() * px, 1 + r() * 3, 1 + r() * 2); }
  const t = tex(c, [1.5, 1.5]);
  return withMaps(t, whiteNoise(px, px, seed), null, px, px, 1.5, [1.5, 1.5]);
}

// Ткань: мелкое переплетение (только рельеф, цвет задаёт материал/инстанс)
export function fabricWeave(seed = 83) {
  const px = P2(128);
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, px, px);
  noise(ctx, px, px, 14, seed);
  const t = tex(c, [0.12, 0.12]);
  const hgt = new Float32Array(px * px);
  const k = 16;
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const a = Math.sin((x / px) * Math.PI * 2 * k), b = Math.sin((y / px) * Math.PI * 2 * k);
    hgt[y * px + x] = ((Math.floor(x / (px / k)) + Math.floor(y / (px / k))) % 2 ? a : b) * 0.5 + 0.5;
  }
  return withMaps(t, hgt, null, px, px, 1.2, [0.12, 0.12]);
}

// Сетка спинки офисного кресла (альфа-маска не нужна — тёмная ткань с ячейками)
export function meshFabric() {
  const px = P2(128);
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = '#3a3b3e'; ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = '#0c0c0e';
  const n = 16, s = px / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) ctx.fillRect(i * s + s * 0.2, j * s + s * 0.2, s * 0.6, s * 0.6);
  const t = tex(c, [0.08, 0.08]);
  const hgt = new Float32Array(px * px);
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const fx = (x % s) / s, fy = (y % s) / s;
    hgt[y * px + x] = fx > 0.2 && fx < 0.8 && fy > 0.2 && fy < 0.8 ? 0 : 1;
  }
  return withMaps(t, hgt, null, px, px, 1.5, [0.08, 0.08]);
}

// Гирих — синий узор со звёздами (фотозона, стены с орнаментом)
export function girih({ bg = '#0f2a6b', line = '#3f7fe0', glow = '#8fc3ff', px = 512, meters = [2.4, 2.4], weight = 1 } = {}) {
  px = P2(px);
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, px, px);
  const cell = px / 2;
  const sc = px / 512;
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
    ctx.lineWidth = 7 * sc * weight; ctx.strokeStyle = line; star(cx, cy, cell * 0.42, cell * 0.3); ctx.stroke();
    ctx.lineWidth = 2 * sc * weight; ctx.strokeStyle = glow; star(cx, cy, cell * 0.42, cell * 0.3); ctx.stroke();
    ctx.lineWidth = 4 * sc * weight; ctx.strokeStyle = line; star(cx, cy, cell * 0.2, cell * 0.14); ctx.stroke();
  }
  ctx.lineWidth = 4 * sc * weight; ctx.strokeStyle = line;
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
    const cx = i * cell + cell / 2, cy = j * cell + cell / 2;
    ctx.beginPath(); ctx.moveTo(cx - cell * 0.18, cy); ctx.lineTo(cx, cy - cell * 0.18); ctx.lineTo(cx + cell * 0.18, cy); ctx.lineTo(cx, cy + cell * 0.18); ctx.closePath(); ctx.stroke();
  }
  return tex(c, meters);
}

// Мурал «узбекская керамика» для кухонь
export function ceramicMural(seed = 41) {
  const px = P2(1024);
  const [c, ctx] = canvas(px, px / 2);
  const sc = px / 1024;
  ctx.fillStyle = '#eceef0'; ctx.fillRect(0, 0, px, px / 2);
  const r = rng(seed);
  const cols = ['#3a62b2', '#57b4c8', '#cf6a55', '#9a8dcc', '#e7a23b'];
  // пастельные ряды штрихов
  for (let y = 12 * sc; y < px / 2; y += 26 * sc) for (let x = 6 * sc; x < px; x += 18 * sc) { ctx.fillStyle = cols[Math.floor(r() * cols.length)]; ctx.globalAlpha = 0.18; ctx.fillRect(x, y, 10 * sc, 3 * sc); }
  for (let i = 0; i < 16; i++) {
    const x = r() * px, y = r() * px / 2, R = (40 + r() * 70) * sc;
    const col = cols[Math.floor(r() * cols.length)];
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#f7f7f5'; ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 5 * sc;
    ctx.beginPath(); ctx.arc(x, y, R, 0, 7); ctx.stroke();
    ctx.lineWidth = 3 * sc;
    ctx.beginPath(); ctx.arc(x, y, R * 0.72, 0, 7); ctx.stroke();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * R * 0.45, y + Math.sin(a) * R * 0.45, R * 0.18, R * 0.08, a, 0, 7); ctx.stroke();
    }
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, R * 0.12, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  return tex(c, [1, 1], { repeat: false });
}

// Мурал «цифровой дождь» (синие пиксельные столбцы)
export function pixelRain(seed = 43) {
  const px = P2(512);
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = '#16182a'; ctx.fillRect(0, 0, px, px);
  const r = rng(seed);
  const cell = Math.max(4, Math.round(8 * px / 512));
  for (let x = 0; x < px; x += cell) {
    const h = r() * px;
    for (let y = px - h; y < px; y += cell) {
      const v = r();
      ctx.fillStyle = v < 0.45 ? '#3a6fd8' : v < 0.75 ? '#6fd0f0' : v < 0.9 ? '#ffffff' : '#e890c0';
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

// Атлас экранов моноблоков: 4 варианта по горизонтали (редактор кода, терминал,
// платформа School 21, заставка). Вариант выбирается по номеру инстанса в шейдере.
export function screenAtlas(seed = 91) {
  const cw = P2(256), ch = Math.round(cw * 0.5625);
  const [c, ctx] = canvas(cw * 4, ch);
  const r = rng(seed);
  const sc = cw / 256;
  // 0 — тёмный редактор кода
  ctx.fillStyle = '#1e1f24'; ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = '#26272d'; ctx.fillRect(0, 0, 36 * sc, ch);
  ctx.fillStyle = '#2d2f36'; ctx.fillRect(0, 0, cw, 10 * sc);
  const syn = ['#c678dd', '#61afef', '#98c379', '#e5c07b', '#abb2bf', '#56b6c2', '#e06c75'];
  for (let y = 16 * sc, ln = 0; y < ch - 4; y += 6 * sc, ln++) {
    let x = 42 * sc + (r() < 0.6 ? Math.floor(r() * 3) * 8 * sc : 0);
    const n = 1 + Math.floor(r() * 5);
    for (let k = 0; k < n && x < cw - 10; k++) { const wd = (8 + r() * 36) * sc; ctx.fillStyle = syn[Math.floor(r() * syn.length)]; ctx.fillRect(x, y, wd, 2.6 * sc); x += wd + 4 * sc; }
    ctx.fillStyle = '#4b4e57'; ctx.fillRect(6 * sc, y, 12 * sc, 2.6 * sc);
  }
  // 1 — терминал
  ctx.fillStyle = '#0c0f0c'; ctx.fillRect(cw, 0, cw, ch);
  for (let y = 8 * sc; y < ch - 4; y += 7 * sc) { ctx.fillStyle = r() < 0.2 ? '#e5c07b' : '#4ec96f'; ctx.fillRect(cw + 6 * sc, y, (20 + r() * 150) * sc, 3 * sc); }
  // 2 — платформа (светлая тема с карточками)
  ctx.fillStyle = '#eef1f4'; ctx.fillRect(cw * 2, 0, cw, ch);
  ctx.fillStyle = '#10a37f'; ctx.fillRect(cw * 2, 0, cw, 14 * sc);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(cw * 2 + (10 + i * 60) * sc, (24 + j * 38) * sc, 52 * sc, 30 * sc);
    ctx.fillStyle = ['#6ee7b7', '#60a5fa', '#fbbf24', '#f472b6'][(i + j) % 4]; ctx.fillRect(cw * 2 + (14 + i * 60) * sc, (28 + j * 38) * sc, 14 * sc, 14 * sc);
  }
  // 3 — синяя заставка (экран блокировки)
  const g = ctx.createLinearGradient(cw * 3, 0, cw * 4, ch);
  g.addColorStop(0, '#0b3d91'); g.addColorStop(1, '#2a8fd6');
  ctx.fillStyle = g; ctx.fillRect(cw * 3, 0, cw, ch);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `600 ${Math.round(34 * sc)}px "Onest", system-ui, sans-serif`;
  ctx.fillText('21:07', cw * 3 + 16 * sc, ch - 26 * sc);
  const t = tex(c, [1, 1], { repeat: false });
  t.userData.cells = 4;
  return t;
}

// Надпись SCHOOL на ножке «1» логотипа: тёмные пиксельные буквы по вертикали на бирюзе
export function schoolPlate() {
  const w = 64, h = 384;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#16c6ae'; ctx.fillRect(0, 0, w, h);
  const F5 = {
    S: ['.XXX', 'X...', '.XX.', '...X', 'XXX.'], C: ['.XXX', 'X...', 'X...', 'X...', '.XXX'],
    H: ['X..X', 'X..X', 'XXXX', 'X..X', 'X..X'], O: ['.XX.', 'X..X', 'X..X', 'X..X', '.XX.'], L: ['X...', 'X...', 'X...', 'X...', 'XXXX'],
  };
  // буквы повёрнуты: читаются сверху вниз (как на фото)
  ctx.fillStyle = '#0f2e2a';
  const cell = 7, letters = 'SCHOOL';
  [...letters].forEach((ch, k) => {
    const g = F5[ch];
    const y0 = 18 + k * 60;
    g.forEach((row, ry) => [...row].forEach((v, rx) => {
      if (v !== 'X') return;
      // поворот на 90° по часовой: столбец → строка
      ctx.fillRect(w / 2 + 16 - ry * cell - cell, y0 + rx * cell, cell - 1, cell - 1);
    }));
  });
  return tex(c, [1, 1], { repeat: false });
}

// Флаг-«парус» (бирюзовый с «21»), с альфа-формой паруса
export function featherFlag() {
  const w = 128, h = 512;
  const [c, ctx] = canvas(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#12a893';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.quadraticCurveTo(w * 1.05, h * 0.02, w * 0.92, h * 0.35);
  ctx.lineTo(w * 0.8, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.save(); ctx.translate(w * 0.45, h * 0.42); ctx.rotate(Math.PI / 2);
  ctx.font = '700 70px "Unbounded", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('21', 0, 0); ctx.restore();
  ctx.font = '600 22px "Onest", system-ui, sans-serif'; ctx.save(); ctx.translate(w * 0.42, h * 0.72); ctx.rotate(Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('SCHOOL', 0, 0); ctx.restore();
  return tex(c, [1, 1], { repeat: false });
}

// Радиальное световое пятно (для «лужиц» света на полу, аддитивно)
export function lightPool() {
  const s = 128;
  const [c, ctx] = canvas(s, s);
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  return tex(c, [1, 1], { repeat: false, color: true });
}

// Листва для крон и кустов: много мелких листьев на прозрачном фоне (alphaTest)
export function leafCard({ seed = 101, hue = 'deciduous' } = {}) {
  const s = P2(256);
  const [c, ctx] = canvas(s, s);
  ctx.clearRect(0, 0, s, s);
  const r = rng(seed);
  const pal = hue === 'conifer' ? ['#1f3d26', '#2a4d2f', '#35593a', '#1a3322'] : hue === 'thuja' ? ['#2f5a2c', '#3f6c35', '#284c26', '#4c7a3c'] : ['#3d6b2f', '#4f7f38', '#5f8f3f', '#2f5626', '#6f9a45'];
  const n = Math.round((hue === 'conifer' ? 900 : 520) * (s / 256) ** 2);
  for (let i = 0; i < n; i++) {
    // плотнее к центру, рваный край
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * s * 0.47;
    const x = s / 2 + Math.cos(a) * d, y = s / 2 + Math.sin(a) * d;
    ctx.fillStyle = pal[Math.floor(r() * pal.length)];
    ctx.save(); ctx.translate(x, y); ctx.rotate(r() * Math.PI * 2);
    if (hue === 'conifer') { ctx.fillRect(-s * 0.02, -0.8, s * 0.04, 1.6); }
    else { ctx.beginPath(); ctx.ellipse(0, 0, s * (0.012 + r() * 0.014), s * (0.006 + r() * 0.006), 0, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  const t = tex(c, [1, 1], { repeat: false });
  return t;
}

// Кора
export function bark(seed = 107) {
  const px = P2(128);
  const [c, ctx] = canvas(px, px);
  ctx.fillStyle = '#5d4a3a'; ctx.fillRect(0, 0, px, px);
  const r = rng(seed);
  for (let i = 0; i < 160; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '30,22,16' : '120,100,80'},${0.2 + r() * 0.3})`; ctx.fillRect(r() * px, r() * px, 1 + r() * 2, 6 + r() * 24); }
  const t = tex(c, [0.6, 1.2]);
  const hgt = valueNoise(px, px, 4, seed).map((v, i) => v);
  return withMaps(t, hgt, null, px, px, 2.5, [0.6, 1.2]);
}

// Стенды с портретами учёных (выставочная зона)
export function portraitPanel(seed = 1) {
  const w = 512, h = 320;
  const [c, ctx] = canvas(w, h);
  const r = rng(seed);
  ctx.fillStyle = '#1d2330'; ctx.fillRect(0, 0, w, h);
  const px = 300, py = 24, pw = 188, ph = 272;
  const g = ctx.createLinearGradient(px, py, px, py + ph);
  g.addColorStop(0, '#b98c5c'); g.addColorStop(1, '#5a3b22');
  ctx.fillStyle = g; ctx.fillRect(px, py, pw, ph);
  ctx.fillStyle = '#efe6d6'; ctx.beginPath(); ctx.ellipse(px + pw / 2, py + 70, 56, 40, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#d6a47a'; ctx.beginPath(); ctx.ellipse(px + pw / 2, py + 130, 44, 56, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#6b4a36'; ctx.beginPath(); ctx.ellipse(px + pw / 2, py + 175, 40, 36, 0, 0, Math.PI); ctx.fill();
  ctx.fillStyle = '#3d2a1e'; ctx.fillRect(px + 30, py + 215, pw - 60, 57);
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
  ctx.fillStyle = '#1a2cff'; ctx.fillRect(2, 0, 3, h); ctx.fillRect(w - 5, 0, 3, h);
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

// ── v4: отделки по панорамам 360°-тура ───────────────────────────────────────

// Терраццо дна атриума: тёплая бежево-коричневая основа, крупная каменная крошка
// (серый, графит, кремовый, охра) и широкие зелёные полосы-«ручьи».
export function terrazzo(seed = 131) {
  const px = P2(1024);
  const [c, ctx] = canvas(px, px);
  const r = rng(seed);
  ctx.fillStyle = '#b8977a'; ctx.fillRect(0, 0, px, px);
  noise(ctx, px, px, 18, seed, 2);
  const sc = px / 1024;
  // зелёные полосы (текстура 4 × 4 м, две ломаные полосы по 0,35 м)
  ctx.fillStyle = '#6f9b72';
  const band = (pts) => {
    ctx.lineWidth = 90 * sc; ctx.strokeStyle = '#6f9b72'; ctx.lineJoin = 'miter';
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * px, y * px) : ctx.moveTo(x * px, y * px))); ctx.stroke();
  };
  band([[-0.1, 0.18], [0.32, 0.18], [0.58, 0.44], [1.1, 0.44]]);
  band([[0.72, -0.1], [0.72, 0.12], [0.9, 0.3], [0.9, 1.1]]);
  band([[-0.1, 0.78], [0.2, 0.78], [0.42, 1.0], [0.42, 1.1]]);
  noise(ctx, px, px, 10, seed + 1, 2);
  // крошка
  const cols = ['#8b8f93', '#2c2d30', '#ece3cf', '#d4ad5a', '#f3efe6', '#7b8898', '#a45a3c', '#5b5f63'];
  for (let i = 0; i < 1500; i++) {
    const x = r() * px, y = r() * px, R = (6 + r() * r() * 34) * sc;
    ctx.fillStyle = cols[Math.floor(r() * cols.length)];
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    const n = 4 + Math.floor(r() * 3), a0 = r() * 6.28;
    for (let k = 0; k < n; k++) { const a = a0 + (k / n) * 6.28 + (r() - 0.5) * 0.6, rr = R * (0.6 + r() * 0.5); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const t = tex(c, [4, 4]);
  const hgt = new Float32Array(px * px);
  const rough = new Float32Array(px * px).fill(0.18);
  return withMaps(t, hgt, rough, px, px, 0.3, [4, 4]);
}

// Стена фонда вдоль коридора 1 этажа: белая с рассыпанными квадратами (мятный, сиреневый, серый)
export function desWall(seed = 137) {
  const px = P2(512);
  const [c, ctx] = canvas(px, px);
  const r = rng(seed);
  ctx.fillStyle = '#f3f3f1'; ctx.fillRect(0, 0, px, px);
  const n = 16, cell = px / n;
  const cols = ['#9ed6c8', '#c9b7e0', '#cfd1d4', '#b7a4d6', '#8ccfbf'];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (r() < 0.45) continue;
    ctx.fillStyle = cols[Math.floor(r() * cols.length)];
    const s = cell * (0.42 + r() * 0.18);
    ctx.fillRect(i * cell + (cell - s) / 2, j * cell + (cell - s) / 2, s, s);
  }
  return tex(c, [3.2, 3.2]);
}

// Надпись на стене фонда: «21 DIGITAL ENGINEERING SCHOOL» пиксельным серым шрифтом
export function desText() {
  const w = 2048, h = 256;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#f3f3f1'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#6b6f76';
  ctx.font = '700 150px "JetBrains Mono", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('21', 40, h / 2);
  ctx.font = '600 92px "JetBrains Mono", monospace';
  ctx.fillText('DIGITAL ENGINEERING SCHOOL', 330, h / 2 + 6);
  return tex(c, [1, 1], { repeat: false });
}

// Стена игровой 2 этажа: тёмная с пиксельным «PLAY!»
export function playWall() {
  const w = 1536, h = 768;
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = '#1b1c22'; ctx.fillRect(0, 0, w, h);
  const glyph = {
    P: ['1110', '1001', '1110', '1000', '1000'], L: ['1000', '1000', '1000', '1000', '1111'],
    A: ['0110', '1001', '1111', '1001', '1001'], Y: ['1001', '1001', '0110', '0100', '0100'], '!': ['1', '1', '1', '0', '1'],
  };
  const cols = ['#f25c9b', '#8b5cf6', '#3fb4f0', '#f5c542', '#52d67a'];
  const cell = 46, r = rng(7);
  let x0 = 170;
  for (const ch of 'PLAY!') {
    const g = glyph[ch];
    g.forEach((row, j) => [...row].forEach((b, i) => {
      if (b !== '1') return;
      ctx.fillStyle = cols[Math.floor(r() * cols.length)];
      ctx.fillRect(x0 + i * cell + 3, 200 + j * cell + 3, cell - 6, cell - 6);
    }));
    x0 += (g[0].length + 1) * cell;
  }
  // рассыпанные «пиксели» вокруг
  for (let i = 0; i < 90; i++) { ctx.fillStyle = cols[Math.floor(r() * cols.length)]; ctx.globalAlpha = 0.35 + r() * 0.4; const s = 10 + r() * 22; ctx.fillRect(r() * w, r() * h, s, s); }
  ctx.globalAlpha = 1;
  return tex(c, [1, 1], { repeat: false });
}
