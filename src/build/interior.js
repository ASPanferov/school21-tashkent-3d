// Интерьеры v4: всё строится из данных building.js — перекрытия с проёмами, стены с
// дверями, колонны, ядра (лестницы и лифты), открытые марши атриума, лекторий-амфитеатр,
// парящая площадка, лаунж под пирамидой и мебель по зонам.
import * as THREE from 'three';
import { Batch, Instancer, boxGeo, sx, sy, sz, mtx, rng, slabGeo, rectPts } from '../lib/geom.js';
import * as B from '../data/building.js';
import * as F from './furniture.js';
import { ATLAS_CELLS } from '../lib/materials.js';

const { SIZE, LEVELS, SLAB, GRID, ATRIUM, CORES, SKYLIGHT, AMPHI, PLATFORM, LOUNGE3 } = B;
const IN0 = 0.3, IN1 = SIZE - 0.3;
const lvl = (id) => LEVELS.find((l) => l.id === id);
const inRect = (u, v, r, m = 0) => u > r[0] - m && u < r[2] + m && v > r[1] - m && v < r[3] + m;
const onFacadeLine = (a, b) => (Math.abs(a[0] - b[0]) < 0.01 && (a[0] < 0.7 || a[0] > SIZE - 0.7)) || (Math.abs(a[1] - b[1]) < 0.01 && (a[1] < 0.7 || a[1] > SIZE - 0.7));
const ATR = [ATRIUM.u0, ATRIUM.v0, ATRIUM.u1, ATRIUM.v1];
const PORCH = B.ENTRANCE.porch ? [B.ENTRANCE.porch.u0, 0.3, SIZE - 0.3, B.ENTRANCE.porch.v1] : null;

export function buildInterior(mats, zones) {
  const levels = {};
  const pick = [];
  for (const L of LEVELS) levels[L.id] = buildLevel(mats, L, zones.filter((z) => z.level === L.id), pick);
  return { levels, pick };
}

function buildLevel(mats, L, zones, pick) {
  const root = new THREE.Group(); root.name = `level-${L.id}`;
  const ceiling = new THREE.Group(); ceiling.name = `ceiling-${L.id}`;
  const b = new Batch(mats);          // основное
  const cb = new Batch(mats);         // потолок (прячется в разрезе)
  const lights = new Batch(mats);     // светильники уровня
  const clights = new Batch(mats);    // светильники, висящие на потолке (прячутся вместе с ним)
  const inst = {};
  const I = (key, geoFn, matKey) => (inst[key] ??= new Instancer(geoFn(), mats.get(matKey), `${L.id}:${key}`));
  const ctx = { L, z: L.z, top: L.top, b, cb, lights, clights, I, R: rng(Math.round((L.z + 10) * 131)), mats, zones };

  floors(ctx);
  ceilings(ctx);
  columns(ctx);
  walls(ctx);
  cores(ctx);
  for (const s of B.STAIRS.filter((q) => q.level === L.id)) flight(ctx, s);
  for (const l of B.LANDINGS.filter((q) => q.level === L.id)) landing(ctx, l);
  if (L.id === 'B1') { amphitheater(ctx); atriumLounge(ctx); }
  if (L.id === 'M') platform(ctx);
  for (const zn of zones) {
    zoneContents(ctx, zn);
    if (!zn.closed) pickBox(pick, root, zn, zn.type === 'amphitheater' ? AMPHI.stageZ : zn.type === 'atrium' ? AMPHI.floorZ : L.z);
  }
  for (const c of CORES.filter((q) => q.levels.includes(L.id))) pickBox(pick, root, { ...c, level: L.id }, L.z);

  root.add(b.build(`L-${L.id}`));
  const lg = lights.build(`lights-${L.id}`, { castShadow: false, receiveShadow: false });
  lg.name = `lights-${L.id}`;
  root.add(lg);
  for (const k of Object.keys(inst)) { const m = inst[k].build(); if (m) root.add(m); }
  ceiling.add(cb.build(`C-${L.id}`, { castShadow: false }));
  const cl = clights.build(`lights-c-${L.id}`, { castShadow: false, receiveShadow: false });
  cl.name = `lights-c-${L.id}`;
  ceiling.add(cl);
  root.add(ceiling);
  root.userData = { level: L.id, ceiling, lights: lg };
  return root;
}

// ─── Геометрия ─────────────────────────────────────────────────────────────

// Коробка вдоль отрезка a→c (в плане), толщина t, высота z0..z1, сдвиг off по левой нормали
function segBox(b, key, a, c, t, z0, z1, off = 0, ext = 0) {
  const du = c[0] - a[0], dv = c[1] - a[1];
  const len = Math.hypot(du, dv);
  if (len < 0.01 || z1 - z0 < 0.004) return;
  const g = boxGeo(len + ext * 2, z1 - z0, t);
  g.rotateY(Math.atan2(dv, du));
  const nu = -dv / len, nv = du / len;
  const cu = (a[0] + c[0]) / 2 + nu * off, cv = (a[1] + c[1]) / 2 + nv * off;
  g.translate(sx(cu), sy((z0 + z1) / 2), sz(cv));
  b.add(key, g);
}
const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  let t = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};
// Отсечение многоугольника полуплоскостью a·u + b·v + c ≥ 0 (Сазерленд — Ходжман)
function clipPoly(poly, a, b, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length];
    const fp = a * P[0] + b * P[1] + c, fq = a * Q[0] + b * Q[1] + c;
    if (fp >= 0) out.push(P);
    if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
  }
  return out;
}
const clipAll = (poly, planes) => planes.reduce((p, pl) => (p.length >= 3 ? clipPoly(p, ...pl) : p), poly);
// Кольцевой сектор (углы в градусах от +u к +v)
function sector(c, r0, r1, a0, a1, N = 56) {
  const pts = [];
  if (a1 - a0 >= 359.9 && r0 <= 0.001) {
    for (let i = 0; i < N * 2; i++) { const a = (i / (N * 2)) * Math.PI * 2; pts.push([c[0] + Math.cos(a) * r1, c[1] + Math.sin(a) * r1]); }
    return pts;
  }
  for (let i = 0; i <= N; i++) { const a = ((a0 + ((a1 - a0) * i) / N) * Math.PI) / 180; pts.push([c[0] + Math.cos(a) * r1, c[1] + Math.sin(a) * r1]); }
  if (r0 <= 0.001) pts.push([c[0], c[1]]);
  else for (let i = N; i >= 0; i--) { const a = ((a0 + ((a1 - a0) * i) / N) * Math.PI) / 180; pts.push([c[0] + Math.cos(a) * r0, c[1] + Math.sin(a) * r0]); }
  return pts;
}
const prism = (b, key, poly, z0, z1) => { if (poly.length >= 3 && z1 - z0 > 0.001) b.add(key, slabGeo(poly, [], z0, z1 - z0)); };
// Криволинейная стена по дуге (центр c, радиусы r0..r1, углы a0..a1 в градусах) с UV в метрах
function arcWall(b, key, c, r0, r1, a0, a1, z0, z1) {
  const N = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 3));
  const pos = [], uv = [], rm = (r0 + r1) / 2;
  const P = (r, a, z) => [sx(c[0] + Math.cos(a) * r), sy(z), sz(c[1] + Math.sin(a) * r)];
  const quad = (p0, p1, p2, p3, t0, t1, t2, t3) => { pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3); uv.push(...t0, ...t1, ...t2, ...t0, ...t2, ...t3); };
  for (let i = 0; i < N; i++) {
    const aa = ((a0 + ((a1 - a0) * i) / N) * Math.PI) / 180, ab = ((a0 + ((a1 - a0) * (i + 1)) / N) * Math.PI) / 180;
    const sa = rm * aa, sb = rm * ab;
    // внешняя грань (по часовой — наружу), внутренняя, верх
    quad(P(r1, aa, z0), P(r1, ab, z0), P(r1, ab, z1), P(r1, aa, z1), [sa, z0], [sb, z0], [sb, z1], [sa, z1]);
    quad(P(r0, ab, z0), P(r0, aa, z0), P(r0, aa, z1), P(r0, ab, z1), [sb, z0], [sa, z0], [sa, z1], [sb, z1]);
    quad(P(r0, aa, z1), P(r1, aa, z1), P(r1, ab, z1), P(r0, ab, z1), [sa, r0], [sa, r1], [sb, r1], [sb, r0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  b.add(key, g);
}
// Угловой диапазон дуги радиуса r, попадающий в отсечение веера (u ≥ clip.u, v ≥ clip.v)
function arcRange(c, r, a0, a1) {
  const lo = (Math.asin(Math.max(-1, Math.min(1, (AMPHI.clip.v - c[1]) / r))) * 180) / Math.PI;
  const hi = (Math.acos(Math.max(-1, Math.min(1, (AMPHI.clip.u - c[0]) / r))) * 180) / Math.PI;
  return [Math.max(a0, lo), Math.min(a1, hi)];
}
// Панель с текстурой целиком (UV 0..1) вдоль A→C; off > 0 — на левой стороне (смотрит влево)
function uvPanel(b, key, A, C, z0, z1, off) {
  const du = C[0] - A[0], dv = C[1] - A[1], len = Math.hypot(du, dv);
  if (len < 0.05) return;
  const g = new THREE.PlaneGeometry(len, z1 - z0);
  g.rotateY(Math.atan2(dv, du) + (off > 0 ? Math.PI : 0));
  const nu = -dv / len, nv = du / len;
  g.translate(sx((A[0] + C[0]) / 2 + nu * off), sy((z0 + z1) / 2), sz((A[1] + C[1]) / 2 + nv * off));
  b.add(key, g);
}

// ─── Перекрытия и потолки ──────────────────────────────────────────────────

// Колодец лестницы в ядре: вся клетка, кроме этажной площадки у двери
function coreWell(c) {
  const [u0, v0, u1, v1] = c.rect, d = 1.4, m = 0.13;
  if (c.entry === 'v1') return [u0 + m, v0 + m, u1 - m, v1 - d];
  if (c.entry === 'v0') return [u0 + m, v0 + d, u1 - m, v1 - m];
  if (c.entry === 'u1') return [u0 + m, v0 + m, u1 - d, v1 - m];
  return [u0 + d, v0 + m, u1 - m, v1 - m];
}
function levelHoles(id) {
  const holes = [...(B.SLAB_HOLES[id] || [])];
  for (const c of CORES) if (c.type === 'stair' && c.levels.indexOf(id) > 0) holes.push(coreWell(c));
  return holes;
}
const FLOOR_BY_TYPE = {
  conference: 'carpetConf', porch: 'stepGranite', wc: 'tileDark', game: 'carpetDark', booths: 'carpetBlue',
  server: 'floorGray', pingpong: 'floorGray', meeting: 'carpetBlue', office: 'floorCluster',
};
function floors(ctx) {
  const { L, b } = ctx;
  if (L.id === 'B1') {
    b.add('concrete', slabGeo(rectPts(...ATR), [], AMPHI.floorZ - 0.35, 0.35));
    b.add('terrazzo', slabGeo(rectPts(ATR[0] + 0.15, ATR[1] + 0.15, ATR[2] - 0.15, ATR[3] - 0.15), [], AMPHI.floorZ, 0.01));
    return;
  }
  if (L.id === 'M') {
    const r = PLATFORM.rect;
    b.add('concrete', slabGeo(rectPts(...r), [], L.z - SLAB, SLAB));
    b.add('floorTile', slabGeo(rectPts(r[0] + 0.15, r[1] + 0.15, r[2], r[3]), [], L.z, 0.008));
    return;
  }
  const holes = levelHoles(L.id).map((r) => rectPts(...r));
  b.add('concrete', slabGeo(rectPts(IN0, IN0, IN1, IN1), holes, L.z - SLAB, SLAB));
  const base = L.id === 'L1' ? 'floorTile' : 'floorCluster';
  b.add(base, slabGeo(rectPts(IN0 + 0.05, IN0 + 0.05, IN1 - 0.05, IN1 - 0.05), holes, L.z, 0.008));
  if (L.id === 'L1' && PORCH) {
    // портик: плита доходит до фасадной линии и бокового края
    b.box('concrete', PORCH[0], -0.02, L.z - SLAB, SIZE, IN0 + 0.02, L.z);
    b.box('concrete', IN1 - 0.02, IN0, L.z - SLAB, SIZE, PORCH[3], L.z);
    b.box('stepGranite', PORCH[0], -0.02, L.z, SIZE, PORCH[3], L.z + 0.012);
  }
  for (const zn of ctx.zones) {
    const key = FLOOR_BY_TYPE[zn.type];
    if (!key || key === base || zn.type === 'porch') continue;
    if (zn.type === 'meeting' && L.id === 'L1') continue;
    const [u0, v0, u1, v1] = zn.rect;
    b.box(key, u0 + 0.04, v0 + 0.04, L.z + 0.008, u1 - 0.04, v1 - 0.04, L.z + 0.014);
  }
}
const overlapsAtrium = (r) => r[0] >= ATR[0] - 0.01 && r[2] <= ATR[2] + 0.01 && r[1] >= ATR[1] - 0.01 && r[3] <= ATR[3] + 0.01;
function ceilings(ctx) {
  const { L, cb, clights } = ctx;
  if (L.id === 'B1') {
    // потолок лектория = низ парящей площадки; кольцевые светильники
    const r = PLATFORM.rect;
    cb.add('ceilingGray', slabGeo(rectPts(r[0] + 0.15, r[1] + 0.15, r[2], r[3]), [], PLATFORM.z - SLAB - 0.02, 0.02));
    const ring = F.ringGeo(0.42);
    const [cu, cv] = AMPHI.c;
    for (const [rr, a0, a1, n] of [[4.2, -20, 115, 4], [6.2, -25, 118, 6], [8.3, -18, 122, 8]]) {
      for (let i = 0; i < n; i++) {
        const a = ((a0 + ((a1 - a0) * (i + 0.5)) / n) * Math.PI) / 180;
        const u = cu + Math.cos(a) * rr, v = cv + Math.sin(a) * rr;
        if (!inRect(u, v, r, -0.6)) continue;
        const g = ring.clone(); g.translate(sx(u), sy(PLATFORM.z - SLAB - 0.75), sz(v));
        clights.add('led', g);
        clights.add('black', new THREE.CylinderGeometry(0.004, 0.004, 0.72, 3).translate(sx(u), sy(PLATFORM.z - SLAB - 0.39), sz(v)));
      }
    }
    return;
  }
  if (L.id === 'M') {
    // потолок атриума = низ плиты лаунжа 3 этажа (5 световых колодцев) + звёзды-светильники
    const zc = lvl('L3').z - SLAB;
    cb.add('ceilingWhite', slabGeo(rectPts(...ATR), LOUNGE3.wells.map((w) => rectPts(...w)), zc - 0.02, 0.02));
    for (const [a, c, e, f] of F.starField(ATR[0] + 0.6, ATR[1] + 0.6, ATR[2] - 0.6, ATR[3] - 0.6, 3.0)) {
      const mu = (a + e) / 2, mv = (c + f) / 2;
      if (LOUNGE3.wells.some((w) => inRect(mu, mv, w, 0.2))) continue;
      clights.add('ledCool', F.stripGeo(sx(a), sz(c), sx(e), sz(f), sy(zc - 0.7)));
    }
    for (let u = ATR[0] + 2; u < ATR[2]; u += 4) for (let v = ATR[1] + 2; v < ATR[3]; v += 4) {
      if (LOUNGE3.wells.some((w) => inRect(u, v, w, 0.3))) continue;
      clights.add('black', new THREE.CylinderGeometry(0.004, 0.004, 0.7, 3).translate(sx(u), sy(zc - 0.35), sz(v)));
    }
    return;
  }
  const holes = [];
  if (L.id === 'L3') holes.push([SKYLIGHT.u0, SKYLIGHT.v0, SKYLIGHT.u1, SKYLIGHT.v1]);
  else holes.push(ATR);
  const next = LEVELS.find((l) => !l.partial && l.z > L.z);
  if (next) for (const r of levelHoles(next.id)) if (!overlapsAtrium(r)) holes.push(r);
  let outer = rectPts(IN0, IN0, IN1, IN1);
  if (L.id === 'L1' && PORCH) {
    outer = [[IN0, IN0], [PORCH[0], IN0], [PORCH[0], PORCH[3]], [IN1, PORCH[3]], [IN1, IN1], [IN0, IN1]];
    cb.box('glossWhite', PORCH[0], -0.02, L.top - 0.07, SIZE, PORCH[3], L.top - 0.05);
    for (let u = PORCH[0] + 1.5; u < SIZE - 0.5; u += 2.4) for (let v = 1.4; v < PORCH[3]; v += 2.4) {
      cb.add('ledDown', new THREE.CylinderGeometry(0.09, 0.09, 0.02, 12).translate(sx(u), sy(L.top - 0.08), sz(v)));
    }
  }
  cb.add('ceilingBlack', slabGeo(outer, holes.map((r) => rectPts(...r)), L.top - 0.02, 0.02));
}

// ─── Колонны ───────────────────────────────────────────────────────────────
function columns(ctx) {
  const { L, b, cb } = ctx;
  const h = GRID.column / 2;
  if (L.id === 'M') {
    const z1 = lvl('L3').z - SLAB;
    for (const [u, v] of PLATFORM.columns) {
      const g = new THREE.BoxGeometry(0.62, z1 - L.z, 0.62);
      g.translate(sx(u), sy((L.z + z1) / 2), sz(v));
      b.add('columnBlack', g);
    }
    return;
  }
  if (L.id === 'B1') return;
  const cores = CORES.filter((c) => c.levels.includes(L.id)).map((c) => c.rect);
  const closed = ctx.zones.filter((z) => z.closed).map((z) => z.rect);
  for (const u of GRID.u) for (const v of GRID.v) {
    if (inRect(u, v, ATR, -0.01)) continue;
    if (cores.some((r) => inRect(u, v, r, -0.01))) continue;
    if (closed.some((r) => inRect(u, v, r, -0.4))) continue;
    const cl = ctx.zones.find((z) => z.type === 'cluster' && inRect(u, v, z.rect, 0.05));
    if (cl) {
      const g = new THREE.BoxGeometry(h * 2 + 0.1, L.top - L.z, h * 2 + 0.1);
      g.translate(sx(u), sy((L.z + L.top) / 2), sz(v));
      b.add(`col:${cl.cluster}`, g);
      continue;
    }
    // в конференц-зале колонны чёрные целиком (панорама RQJ)
    if (ctx.zones.some((z) => z.type === 'conference' && inRect(u, v, z.rect, 0.05))) {
      b.box('black', u - h, v - h, L.z, u + h, v + h, L.top);
      continue;
    }
    const porch = PORCH && L.id === 'L1' && inRect(u, v, PORCH, 0.4);
    // колонны по контуру атриума стоят в стенах площадки — без чёрного оголовка
    const rim = inRect(u, v, ATR, 0.05);
    b.box('columnWhite', u - h, v - h, L.z, u + h, v + h, L.top - (porch ? 0.07 : rim ? 0 : 0.7));
    if (!porch && !rim) cb.box('ceilingBlack', u - h - 0.01, v - h - 0.01, L.top - 0.7, u + h + 0.01, v + h + 0.01, L.top);
  }
}

// ─── Стены и проёмы ────────────────────────────────────────────────────────
const KIND = {
  w: { mat: 'wallWhite', t: 0.12 }, c: { mat: 'wallWhite', t: 0.25 }, lib: { mat: 'wallWhite', t: 0.3 },
  pink: { mat: 'wallPink', t: 0.3 }, lift: { mat: 'acpGray', t: 0.25 },
  mint: { mat: 'railMint', t: 0.16, parapet: 1.05 }, lilac: { mat: 'railLilac', t: 0.16, parapet: 1.05 },
  glassrail: { glass: true, parapet: 1.05 }, g: { glass: true }, deco: { deco: true },
};
const FACE = { girih: 'girihLilac', pixel: 'desWall', lime: 'wallLime', navy: 'girih' };
function wallList(L) {
  const list = B.WALLS.filter((w) => w.level === L.id);
  for (const c of CORES) {
    if (!c.levels.includes(L.id)) continue;
    const [u0, v0, u1, v1] = c.rect;
    const k = c.type === 'lift' ? 'lift' : 'c';
    for (const [a, e] of [[[u0, v0], [u1, v0]], [[u1, v0], [u1, v1]], [[u1, v1], [u0, v1]], [[u0, v1], [u0, v0]]]) list.push({ level: L.id, a, b: e, k, core: c });
  }
  return list;
}
function walls(ctx) {
  const { L, b } = ctx;
  const doors = B.DOORS.filter((d) => d.level === L.id);
  for (const w of wallList(L)) {
    if (onFacadeLine(w.a, w.b)) continue;
    const K = KIND[w.k] || KIND.w;
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (len < 0.05) continue;
    const t = w.t ?? K.t ?? 0.12;
    const z0 = w.z0 ?? L.z;
    const z1 = K.parapet ? z0 + K.parapet : (w.z1 ?? L.top);
    const dir = [(w.b[0] - w.a[0]) / len, (w.b[1] - w.a[1]) / len];
    const at = (s) => [w.a[0] + dir[0] * s, w.a[1] + dir[1] * s];
    // проёмы на этой стене
    const ops = doors.filter((d) => segDist(d.at, w.a, w.b) < 0.16).map((d) => {
      const s = (d.at[0] - w.a[0]) * dir[0] + (d.at[1] - w.a[1]) * dir[1];
      return { s0: Math.max(0, s - d.w / 2), s1: Math.min(len, s + d.w / 2), d };
    }).sort((p, q) => p.s0 - q.s0);
    const pieces = [];
    let cur = 0;
    for (const o of ops) { if (o.s0 > cur) pieces.push([cur, o.s0]); cur = Math.max(cur, o.s1); }
    if (cur < len) pieces.push([cur, len]);
    if (K.deco) { decoWall(ctx, w, len, at, t, z0, z1); continue; }
    const mat = w.f === 'mint' ? 'wallMint' : w.f === 'black' ? 'wallBlack' : K.mat;
    for (const [p0, p1] of pieces) {
      if (p1 - p0 < 0.02) continue;
      const A = at(p0), C = at(p1);
      if (K.glass && !K.parapet) glassPane(b, A, C, z0, z1);
      else if (K.glass) glassRail(b, A, C, z0);
      else {
        segBox(b, mat, A, C, t, z0, z1);
        if (K.parapet) segBox(b, 'stainless', A, C, 0.06, z1, z1 + 0.05, 0, 0.02);
        const face = FACE[w.f];
        if (face) facePanels(b, face, w, A, C, t, z0, z1);
        if (w.f === 'play') uvPanel(b, 'playWall', A, C, z0 + 0.25, z0 + 3.25, (w.side || 1) * (t / 2 + 0.01));
      }
    }
    // перемычки над дверями и дверные коробки
    for (const o of ops) {
      if (o.d.kind === 'open' || K.parapet) continue;
      const A = at(o.s0), C = at(o.s1), hz = z0 + 2.3;
      if (hz < z1 - 0.02) {
        if (K.glass) { segBox(b, 'partitionGlass', A, C, 0.02, hz, z1); segBox(b, 'frameBlack', A, C, 0.06, hz - 0.05, hz); }
        else segBox(b, mat, A, C, t, hz, z1);
      }
      const jam = o.d.kind === 'glass' || K.glass ? 'frameBlack' : 'doorWhite';
      segBox(b, jam, A, at(o.s0 + 0.05), t + 0.03, z0, Math.min(z1, hz));
      segBox(b, jam, at(o.s1 - 0.05), C, t + 0.03, z0, Math.min(z1, hz));
      if (hz < z1) segBox(b, jam, A, C, t + 0.03, hz - 0.05, hz);
    }
  }
}
// Облицовка лицевой стороны стены (side: 1 — слева от a→b, −1 — справа, иначе обе)
function facePanels(b, key, w, A, C, t, z0, z1) {
  const sides = w.side ? [w.side] : [1, -1];
  const top = w.f === 'lime' ? Math.min(z1, z0 + 2.4) : z1;
  for (const s of sides) segBox(b, key, A, C, 0.012, z0 + (w.f === 'lime' ? 0.1 : 0), top, s * (t / 2 + 0.007));
  // надпись «21 DIGITAL ENGINEERING SCHOOL» на длинном куске стены фонда
  if (w.f === 'pixel' && Math.hypot(C[0] - A[0], C[1] - A[1]) > 12) {
    const len = Math.hypot(C[0] - A[0], C[1] - A[1]), d = [(C[0] - A[0]) / len, (C[1] - A[1]) / len];
    const m = len * 0.42;
    const P = [A[0] + d[0] * (m - 5), A[1] + d[1] * (m - 5)], Q = [A[0] + d[0] * (m + 5), A[1] + d[1] * (m + 5)];
    for (const s of sides) uvPanel(b, 'desText', P, Q, z0 + 1.7, z0 + 2.95, s * (t / 2 + 0.016));
  }
}
// Стекло в чёрных рамах (перегородки переговорных и т. п.)
function glassPane(b, A, C, z0, z1) {
  segBox(b, 'partitionGlass', A, C, 0.02, z0, z1);
  const len = Math.hypot(C[0] - A[0], C[1] - A[1]);
  const n = Math.max(1, Math.round(len / 1.2));
  for (let i = 0; i <= n; i++) {
    const t = i / n, P = [A[0] + (C[0] - A[0]) * t, A[1] + (C[1] - A[1]) * t];
    const d = [(C[0] - A[0]) / len * 0.025, (C[1] - A[1]) / len * 0.025];
    segBox(b, 'frameBlack', [P[0] - d[0], P[1] - d[1]], [P[0] + d[0], P[1] + d[1]], 0.06, z0, z1);
  }
  segBox(b, 'frameBlack', A, C, 0.06, z0, z0 + 0.06);
  if (z1 - z0 > 2.8) segBox(b, 'frameBlack', A, C, 0.06, z0 + 2.4, z0 + 2.46);
  segBox(b, 'frameBlack', A, C, 0.06, z1 - 0.06, z1);
}
function glassRail(b, A, C, z0) {
  segBox(b, 'partitionGlass', A, C, 0.02, z0 + 0.08, z0 + 1.0);
  segBox(b, 'stainless', A, C, 0.05, z0 + 1.0, z0 + 1.05, 0, 0.02);
  const len = Math.hypot(C[0] - A[0], C[1] - A[1]);
  const n = Math.max(1, Math.round(len / 1.5));
  for (let i = 0; i <= n; i++) {
    const t = i / n, P = [A[0] + (C[0] - A[0]) * t, A[1] + (C[1] - A[1]) * t];
    b.box('stainless', P[0] - 0.02, P[1] - 0.02, z0, P[0] + 0.02, P[1] + 0.02, z0 + 1.0);
  }
}
// Стенды «Великие учёные» на стенах парящей площадки: печать под акрилом 1,8 × 0,9 м
// на хромированных дистанционных держателях (по панорамам тура)
function decoWall(ctx, w, len, at, t, z0) {
  const { b } = ctx;
  const d = [(w.b[0] - w.a[0]) / len, (w.b[1] - w.a[1]) / len];
  const s = w.side || 1;
  let k = w.a[0] > 13 ? 3 : 0;
  const PW = 1.8, PH = 0.9;
  // облицовка в толщину колонн: стена площадки гладкая, пилястры не выступают
  const face = Math.max(t / 2, GRID.column / 2 + 0.005), nrm = [-d[1] * s, d[0] * s];
  const lin = (face - t / 2) / 2 + t / 2;
  segBox(b, 'wallWhite', [w.a[0] + nrm[0] * lin, w.a[1] + nrm[1] * lin], [w.b[0] + nrm[0] * lin, w.b[1] + nrm[1] * lin], face - t / 2, z0, z0 + 2.25);
  t = face * 2;
  for (let p = 1.3; p + PW < len - 0.5; p += 2.75) {
    const g = boxGeo(PW, PH, 0.012);
    const uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 1 - (pos.getX(i) + PW / 2) / PW, (pos.getY(i) + PH / 2) / PH);
    g.rotateY(Math.atan2(d[1], d[0]) + (s > 0 ? 0 : Math.PI));
    const P = at(p + PW / 2), off = s * (t / 2 + 0.032);
    g.translate(sx(P[0] - d[1] * off), sy(z0 + 1.55), sz(P[1] + d[0] * off));
    b.add(`portrait:${k++ % 8}`, g);
    // держатели по углам
    for (const [du, dz] of [[-PW / 2 + 0.06, PH / 2 - 0.06], [PW / 2 - 0.06, PH / 2 - 0.06], [-PW / 2 + 0.06, -PH / 2 + 0.06], [PW / 2 - 0.06, -PH / 2 + 0.06]]) {
      const Q = at(p + PW / 2 + du), o2 = s * (t / 2 + 0.018);
      const c = new THREE.CylinderGeometry(0.011, 0.011, 0.036, 10);
      c.rotateX(Math.PI / 2); c.rotateY(Math.atan2(d[1], d[0]));
      c.translate(sx(Q[0] - d[1] * o2), sy(z0 + 1.55 + dz), sz(Q[1] + d[0] * o2));
      b.add('stainless', c);
    }
  }
}

// ─── Ядра: лестницы и лифты ───────────────────────────────────────────────
function cores(ctx) {
  const { L, b } = ctx;
  for (const c of CORES) {
    const i = c.levels.indexOf(L.id);
    if (i < 0) continue;
    if (c.type === 'lift') { liftFronts(ctx, c); continue; }
    const next = c.levels[i + 1];
    if (next) coreStair(ctx, c, L.z, lvl(next).z);
    else {
      // верхний этаж: ограждение колодца над первым маршем
      const f = frame(c), W = f.W;
      const P = f.pt(1.4, 0.12), Q = f.pt(1.4, W / 2);
      segBox(b, 'wallWhite', P, Q, 0.1, L.z, L.z + 1.05);
      segBox(b, 'stainless', P, Q, 0.06, L.z + 1.05, L.z + 1.1);
    }
  }
}
// Локальная система клетки: s — от двери вглубь, q — поперёк
function frame(c) {
  const [u0, v0, u1, v1] = c.rect;
  switch (c.entry) {
    case 'v1': return { D: v1 - v0, W: u1 - u0, pt: (s, q) => [u0 + q, v1 - s] };
    case 'v0': return { D: v1 - v0, W: u1 - u0, pt: (s, q) => [u1 - q, v0 + s] };
    case 'u1': return { D: u1 - u0, W: v1 - v0, pt: (s, q) => [u1 - s, v1 - q] };
    default: return { D: u1 - u0, W: v1 - v0, pt: (s, q) => [u0 + s, v0 + q] };
  }
}
function coreStair(ctx, c, z0, z1) {
  const { b } = ctx;
  const f = frame(c);
  const Ld = 1.4, Lm = 1.15, run = f.D - Ld - Lm - 0.12, zm = (z0 + z1) / 2;
  const half = f.W / 2;
  const n = Math.round((zm - z0) / 0.162);
  // марш 1: от площадки у двери вглубь (левая половина), марш 2: обратно (правая половина)
  runSteps(b, f, Ld, Ld + run, 0.13, half - 0.07, z0, zm, n, 'graniteStep', 'concrete');
  runSteps(b, f, Ld + run, Ld, half + 0.07, f.W - 0.13, zm, z1, n, 'graniteStep', 'concrete');
  // промежуточная площадка
  const A = f.pt(Ld + run, 0.13), C = f.pt(f.D - 0.13, f.W - 0.13);
  b.box('concrete', Math.min(A[0], C[0]), Math.min(A[1], C[1]), zm - 0.2, Math.max(A[0], C[0]), Math.max(A[1], C[1]), zm);
  // стенка между маршами
  segBox(b, 'wallWhite', f.pt(Ld, half), f.pt(Ld + run, half), 0.14, z0, z1 + 1.05);
}
// Ступени марша между s0 и s1 (в сторону роста s или обратно), q0..q1 поперёк
function runSteps(b, f, s0, s1, q0, q1, za, zb, n, stepKey, soffitKey) {
  const rise = (zb - za) / n, len = Math.abs(s1 - s0), tread = len / n, sg = Math.sign(s1 - s0);
  for (let i = 0; i < n; i++) {
    const sa = s0 + sg * i * tread, sb = s0 + sg * ((i + 1) * tread + 0.02);
    const P = f.pt(sa, q0), Q = f.pt(sb, q1), top = za + (i + 1) * rise;
    b.box(stepKey, Math.min(P[0], Q[0]), Math.min(P[1], Q[1]), top - rise - 0.06, Math.max(P[0], Q[0]), Math.max(P[1], Q[1]), top);
  }
  // наклонная плита под ступенями
  const mid = (s0 + s1) / 2, qm = (q0 + q1) / 2;
  const A = f.pt(s0, qm), C = f.pt(s1, qm);
  shearBox(b, soffitKey, A, C, za - 0.3, za - 0.12, zb - 0.3, zb - 0.12, Math.abs(q1 - q0));
  void mid;
}
// Наклонная коробка: от точки A (отм. za) до C (отм. zb), толщина по вертикали h, ширина w
function slopedBox(b, key, A, C, za, zb, h, w, off = 0) {
  const du = C[0] - A[0], dv = C[1] - A[1], L = Math.hypot(du, dv);
  if (L < 0.01) return;
  const H = zb - za, Ls = Math.hypot(L, H);
  const g = boxGeo(Ls, h, w);
  g.rotateZ(Math.atan2(H, L));
  g.rotateY(Math.atan2(dv, du));
  const nu = -dv / L, nv = du / L;
  g.translate(sx((A[0] + C[0]) / 2 + nu * off), sy((za + zb) / 2 - h / 2), sz((A[1] + C[1]) / 2 + nv * off));
  b.add(key, g);
}
// Наклонная призма с вертикальными торцами (щёки, поручни, плиты маршей): от точки A
// (низ zaB, верх zaT) до C (zbB, zbT), толщина w поперёк оси, смещение off влево от A→C.
// В отличие от повёрнутой коробки торцы не «заваливаются» и чисто сходятся с парапетами.
function shearBox(b, key, A, C, zaB, zaT, zbB, zbT, w, off = 0) {
  const du = C[0] - A[0], dv = C[1] - A[1], L = Math.hypot(du, dv);
  if (L < 0.01) return;
  const nu = -dv / L, nv = du / L;
  const V = (P, s, z) => [sx(P[0] + nu * (off + s * w / 2)), sy(z), sz(P[1] + nv * (off + s * w / 2))];
  const a0 = V(A, -1, zaB), a1 = V(A, -1, zaT), a2 = V(A, 1, zaT), a3 = V(A, 1, zaB);
  const c0 = V(C, -1, zbB), c1 = V(C, -1, zbT), c2 = V(C, 1, zbT), c3 = V(C, 1, zbB);
  // грани: [вершины по кругу, как считать UV: 'along' — вдоль марша × высота, 'plan' — вдоль × поперёк, 'end' — поперёк × высота]
  const faces = [[[a0, a1, a2, a3], 'end'], [[c3, c2, c1, c0], 'end'], [[a0, c0, c1, a1], 'along'], [[a3, a2, c2, c3], 'along'],
    [[a1, c1, c2, a2], 'plan'], [[a0, a3, c3, c0], 'plan']];
  const cx = [a0, a2, c0, c2].reduce((m, p) => [m[0] + p[0] / 4, m[1] + p[1] / 4, m[2] + p[2] / 4], [0, 0, 0]);
  const pos = [], uv = [];
  const Hs = Math.hypot(L, (zbT - zaT));
  const uvOf = (p, mode) => {
    const along = ((p[0] - a0[0]) * du + (-(p[2] - a0[2])) * dv) / L;       // сцена: Z = −v
    const across = (p[0] - a0[0]) * nu + (-(p[2] - a0[2])) * nv;
    if (mode === 'end') return [across, p[1]];
    if (mode === 'plan') return [along * Hs / L, across];
    return [along * Hs / L, p[1] - along * (zbT - zaT) / L];
  };
  for (const [q, mode] of faces) {
    for (const tri of [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]) {
      const e1 = tri[1].map((v, i) => v - tri[0][i]), e2 = tri[2].map((v, i) => v - tri[0][i]);
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const fc = [0, 1, 2].map((i) => (tri[0][i] + tri[1][i] + tri[2][i]) / 3 - cx[i]);
      const t = n[0] * fc[0] + n[1] * fc[1] + n[2] * fc[2] < 0 ? [tri[0], tri[2], tri[1]] : tri;
      for (const p of t) { pos.push(...p); uv.push(...uvOf(p, mode)); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  b.add(key, g);
}
function liftFronts(ctx, c) {
  const { L, b } = ctx;
  const [u0, v0, u1, v1] = c.rect;
  for (const [a, e] of c.cars || []) {
    b.box('stainless', a + 0.25, v1 + 0.12, L.z, e - 0.25, v1 + 0.15, L.z + 2.2);
    b.box('frameBlack', (a + e) / 2 - 0.006, v1 + 0.15, L.z + 0.02, (a + e) / 2 + 0.006, v1 + 0.155, L.z + 2.18);
    b.box('stainless', a + 0.15, v1 + 0.12, L.z, a + 0.25, v1 + 0.17, L.z + 2.3);
    b.box('stainless', e - 0.25, v1 + 0.12, L.z, e - 0.15, v1 + 0.17, L.z + 2.3);
    b.box('stainless', a + 0.15, v1 + 0.12, L.z + 2.2, e - 0.15, v1 + 0.17, L.z + 2.3);
    b.box('frameBlack', e + 0.05, v1 + 0.12, L.z + 1.05, e + 0.15, v1 + 0.16, L.z + 1.35);
  }
  void u0; void v0; void u1;
}

// ─── Открытые марши ───────────────────────────────────────────────────────
const DIRV = { '+u': [1, 0], '-u': [-1, 0], '+v': [0, 1], '-v': [0, -1] };
function flight(ctx, s) {
  const { b } = ctx;
  const d = DIRV[s.dir], p = [-d[1], d[0]];            // p — влево от направления подъёма
  const at = (along, across) => [s.a[0] + d[0] * along + p[0] * across, s.a[1] + d[1] * along + p[1] * across];
  const rise = (s.z1 - s.z0) / s.n, tread = s.len / s.n, hw = s.w / 2;
  for (let i = 0; i < s.n; i++) {
    const P = at(i * tread, -hw), Q = at((i + 1) * tread + 0.02, hw), top = s.z0 + (i + 1) * rise;
    const bot = s.style === 'none' ? s.z0 : top - rise - 0.06;
    b.box('graniteStep', Math.min(P[0], Q[0]), Math.min(P[1], Q[1]), bot, Math.max(P[0], Q[0]), Math.max(P[1], Q[1]), top);
  }
  if (s.style === 'none') return;
  const soffit = s.style === 'mint' ? 'stringerMint' : 'stringerLilac';
  const cheek = s.style === 'mint' ? 'railMint' : 'railLilac';
  const A = at(0, 0), C = at(s.len, 0);
  // плита марша снизу
  shearBox(b, soffit, A, C, s.z0 - 0.29, s.z0 - 0.05, s.z1 - 0.29, s.z1 - 0.05, s.w + 0.3);
  // сплошные щёки с поручнем: торцы вертикальные, по высоте совпадают с парапетами (+1,05)
  for (const side of [-1, 1]) {
    const off = side * (hw + 0.08);
    shearBox(b, cheek, A, C, s.z0 - 0.3, s.z0 + 1.05, s.z1 - 0.45, s.z1 + 1.05, 0.14, off);
    shearBox(b, 'stainless', A, C, s.z0 + 1.05, s.z0 + 1.1, s.z1 + 1.05, s.z1 + 1.1, 0.06, off);
  }
}
function landing(ctx, l) {
  const { b } = ctx;
  const [u0, v0, u1, v1] = l.rect;
  b.box('concrete', u0, v0, l.z - 0.24, u1, v1, l.z - 0.01);
  b.box('graniteStep', u0, v0, l.z - 0.01, u1, v1, l.z);
  // ограждение на площадке: перемычка между ближайшими щёками марша «вверх» и марша «дальше»
  const fl = B.STAIRS.filter((s) => s.level === l.level && s.style !== 'none');
  const inR = (P) => P[0] > u0 - 0.3 && P[0] < u1 + 0.3 && P[1] > v0 - 0.3 && P[1] < v1 + 0.3;
  const ends = [];
  for (const s of fl) {
    const d = DIRV[s.dir], p = [-d[1], d[0]], hw = s.w / 2 + 0.08;
    const E = Math.abs(s.z1 - l.z) < 0.01 ? [s.a[0] + d[0] * s.len, s.a[1] + d[1] * s.len] : Math.abs(s.z0 - l.z) < 0.01 ? s.a : null;
    if (!E || !inR(E)) continue;
    ends.push({ s, pts: [-1, 1].map((sg) => [E[0] + p[0] * sg * hw, E[1] + p[1] * sg * hw]) });
  }
  if (ends.length < 2) return;
  let best = null;
  for (const P of ends[0].pts) for (const Q of ends[1].pts) { const dd = Math.hypot(P[0] - Q[0], P[1] - Q[1]); if (!best || dd < best.d) best = { P, Q, d: dd }; }
  const key = ends[0].s.style === 'mint' ? 'railMint' : 'railLilac';
  const dir = [(best.Q[0] - best.P[0]) / best.d, (best.Q[1] - best.P[1]) / best.d];
  const P = [best.P[0] - dir[0] * 0.07, best.P[1] - dir[1] * 0.07], Q = [best.Q[0] + dir[0] * 0.07, best.Q[1] + dir[1] * 0.07];
  shearBox(b, key, P, Q, l.z - 0.45, l.z + 1.05, l.z - 0.45, l.z + 1.05, 0.14);
  shearBox(b, 'stainless', P, Q, l.z + 1.05, l.z + 1.1, l.z + 1.05, l.z + 1.1, 0.06);
}

// ─── Лекторий-амфитеатр (дно атриума) ─────────────────────────────────────
function amphiPlanes() {
  const A = AMPHI;
  const [[x0, y0], [x1, y1]] = A.screen;
  const na = y1 - y0, nb = x0 - x1;                     // нормаль к экранной стене (в сторону зала)
  const sgn = Math.sign(na * (A.c[0] - x0) + nb * (A.c[1] - y0)) || 1;
  return [[1, 0, -A.clip.u], [0, 1, -A.clip.v], [sgn * na, sgn * nb, -sgn * (na * x0 + nb * y0)]];
}
function amphitheater(ctx) {
  const { b, I } = ctx;
  const A = AMPHI, C = A.c;
  const planes = amphiPlanes();
  const [au, av] = A.aisles;
  const pieces = [
    [[-1, 0, au.from]],                                  // до вертикального прохода
    [[1, 0, -au.to], [0, 1, -av.to]],                    // между проходами
    [[0, -1, av.from]],                                  // после горизонтального прохода
  ];
  // основание сцены (весь веер)
  prism(b, 'floorTile', clipAll(sector(C, 0, A.walk[1], -180, 180), planes), A.floorZ, A.stageZ);
  // ряды
  const r = A.rows;
  for (let k = 0; k < r.length - 1; k++) {
    const zt = A.stageZ + A.rowRise * (k + 1);
    for (const pc of pieces) {
      const poly = clipAll(sector(C, r[k], r[k + 1], A.rowAngles[0], A.rowAngles[1]), [...planes, ...pc]);
      if (poly.length < 3) continue;
      prism(b, 'tier', poly, A.floorZ, zt);
      // ковролин и подушки
      prism(b, 'carpetGreen', clipAll(sector(C, r[k] + 0.55, r[k + 1] - 0.02, A.rowAngles[0], A.rowAngles[1]), [...planes, ...pc]), zt, zt + 0.012);
      prism(b, 'cushion', clipAll(sector(C, r[k] + 0.06, r[k] + 0.52, A.rowAngles[0] + 1.5, A.rowAngles[1] - 1.5), [...planes, ...pc]), zt, zt + 0.11);
    }
  }
  // кольцевой проход −1.80: внутренняя полоса разрезана проходами, внешняя — сплошная
  const w0 = A.walk[0], wm = w0 + 0.5, w1 = A.walk[1];
  // внутренняя полоса: тёмный подступенок за последним рядом (как на панораме Jfv), сверху плитка
  for (const pc of pieces) {
    const poly = clipAll(sector(C, w0, wm, A.walkAngles[0], A.walkAngles[1]), [...planes, ...pc]);
    prism(b, 'tier', poly, A.floorZ, A.walkZ - 0.02);
    prism(b, 'floorTile', poly, A.walkZ - 0.02, A.walkZ);
  }
  prism(b, 'floorTile', clipAll(sector(C, wm, w1, A.walkAngles[0], A.walkAngles[1]), planes), A.floorZ, A.walkZ);
  // ступени проходов: по две на ряд, ещё две — на кольцо
  const steps = [];
  for (let k = 0; k <= r.length - 1; k++) {
    const ra = r[k], rb = k < r.length - 1 ? r[k + 1] : wm, zt = A.stageZ + A.rowRise * (k + 1);
    steps.push([ra, (ra + rb) / 2, zt - A.rowRise / 2], [(ra + rb) / 2, rb, zt]);
  }
  for (const [ra, rb, zt] of steps) {
    b.box('aisle', au.from, C[1] + ra, A.floorZ, au.to, C[1] + rb + 0.02, zt);
    b.box('aisle', C[0] + ra, av.from, A.floorZ, C[0] + rb + 0.02, av.to, zt);
  }
  // наружная стена-дуга (розовый туф) и мятный парапет на кольце (с проёмами у маршей)
  const gaps = B.STAIRS.filter((s) => s.style === 'mint' && s.z1 === 0 && s.z0 === A.walkZ).map((s) => {
    const ang = (Math.atan2(s.a[1] - C[1], s.a[0] - C[0]) * 180) / Math.PI;
    const dw = ((s.w / 2 + 0.1) / A.walk[1]) * (180 / Math.PI);
    return [ang - dw, ang + dw];
  }).sort((p, q) => p[0] - q[0]);
  { const [ra0, ra1] = arcRange(C, w1 + 0.12, A.walkAngles[0], A.walkAngles[1]); arcWall(b, 'wallPink', C, w1, w1 + 0.25, ra0, ra1, A.floorZ, A.walkZ - 0.4); }
  prism(b, 'wallWhite', clipAll(sector(C, w1 - 0.02, w1 + 0.27, A.walkAngles[0], A.walkAngles[1]), planes), A.walkZ - 0.4, A.walkZ);
  let a0 = A.walkAngles[0];
  const spans = [];
  for (const [g0, g1] of gaps) { spans.push([a0, g0]); a0 = g1; }
  spans.push([a0, A.walkAngles[1]]);
  for (const [s0, s1] of spans) {
    if (s1 - s0 < 0.5) continue;
    prism(b, 'railMint', clipAll(sector(C, w1 - 0.14, w1 + 0.02, s0, s1, 40), planes), A.walkZ, A.walkZ + 1.05);
    prism(b, 'stainless', clipAll(sector(C, w1 - 0.1, w1 - 0.03, s0, s1, 40), planes), A.walkZ + 1.05, A.walkZ + 1.1);
  }
  // стена вдоль ЮВ края (v = clip.v) от экрана до кольца, с выходом со сцены
  const vS = A.clip.v, ex = A.exit;
  const uScreen = uAtV(vS), uEnd = C[0] + Math.sqrt(Math.max(0, (w1 + 0.25) ** 2 - (C[1] - vS) ** 2));
  const hAt = (u) => {                                     // высота верха стены над точкой (ряды/кольцо)
    const rr = Math.hypot(u - C[0], vS - C[1]);
    if (rr >= w0) return A.walkZ + 1.05;
    let z = A.stageZ;
    for (let k = 0; k < r.length - 1; k++) if (rr >= r[k]) z = A.stageZ + A.rowRise * (k + 1);
    return z + 0.9;
  };
  for (const [p0, p1] of [[uScreen, ex.u0], [ex.u1, uEnd]]) {
    for (let u = p0; u < p1 - 0.01; u += 0.5) {
      const u2 = Math.min(p1, u + 0.5);
      b.box('wallPink', u, vS - 0.25, A.floorZ, u2, vS, hAt((u + u2) / 2));
    }
  }
  // экранная стена по диагонали, экран и колонки
  const [[x0, y0], [x1, y1]] = A.screen;
  segBox(b, 'wallPink', [x0, y0], [x1, y1], 0.3, A.floorZ, PLATFORM.z - SLAB);
  const mu = (x0 + x1) / 2, mv = (y0 + y1) / 2, L = Math.hypot(x1 - x0, y1 - y0);
  const dx = (x1 - x0) / L, dy = (y1 - y0) / L;
  const nrm = [-dy, dx];                                   // сторона зала
  const P = [mu - dx * 2.2, mv - dy * 2.2], Q = [mu + dx * 2.2, mv + dy * 2.2];
  uvPanel(b, 'slide', P, Q, A.stageZ + 0.95, A.stageZ + 3.35, 0.17 * Math.sign(nrm[0] * (C[0] - mu) + nrm[1] * (C[1] - mv)));
  // закулисье за экраном — сплошной объём до низа площадки
  prism(b, 'concrete', [[ATR[0] + 0.15, ATR[1] + 0.15], [x1, y1 + 0.15], [x0 + 0.15, y0]], A.floorZ, PLATFORM.z - SLAB);
  // трибуна
  I('lectern', () => new THREE.BoxGeometry(0.6, 1.1, 0.45).translate(0, 0.55, 0), 'black').push(mtx(mu + nrm[0] * 2.4 + dx * 1.2, mv + nrm[1] * 2.4 + dy * 1.2, A.stageZ, 0.8));
}
// точка экранной стены на заданной v
function uAtV(v) {
  const [[x0, y0], [x1, y1]] = AMPHI.screen;
  return x0 + ((v - y0) * (x1 - x0)) / (y1 - y0);
}
// Лаунж на дне атриума: модульные диваны, столики, фикусы в полумесяце вокруг лектория
function atriumLounge(ctx) {
  const { I, R } = ctx;
  const A = AMPHI, C = A.c, z = A.floorZ;
  const far = (u, v) => Math.hypot(u - C[0], v - C[1]) > A.walk[1] + 1.4;
  const stairs = B.STAIRS.filter((s) => s.level === 'B1' || s.level === 'M');
  const underFlight = (u, v) => stairs.some((s) => {
    const d = DIRV[s.dir], e = [s.a[0] + d[0] * s.len, s.a[1] + d[1] * s.len];
    const r = [Math.min(s.a[0], e[0]) - s.w / 2 - 0.6, Math.min(s.a[1], e[1]) - s.w / 2 - 0.6, Math.max(s.a[0], e[0]) + s.w / 2 + 0.6, Math.max(s.a[1], e[1]) + s.w / 2 + 0.6];
    return inRect(u, v, r);
  });
  // модульные диваны спинками к туфовым стенам, перед ними круглые белые столики и пуфы;
  // середина полумесяца — свободный проход от сцены вокруг лектория (панорама 0fA)
  const cols = ['#8c8f93', '#b8573a', '#3c3f44', '#8c8f93', '#b8573a', '#c9c6c0'];
  let k = 0;
  const groups = [
    ...[25.6, 29.0, 32.4].map((v) => ({ u: ATR[2] - 0.65, v, rot: Math.PI / 2, tu: ATR[2] - 1.85, tv: v })),
    ...[22.8, 26.0].map((u) => ({ u, v: ATR[3] - 0.65, rot: Math.PI, tu: u, tv: ATR[3] - 1.85 })),
  ];
  for (const g of groups) {
    if (!far(g.u, g.v) || underFlight(g.u, g.v)) continue;
    const along = g.rot === Math.PI ? [1, 0] : [0, 1];
    for (const s of [-0.55, 0.55]) I('sofaB', () => F.sofaGeo(1.1), 'fabric').push(mtx(g.u + along[0] * s, g.v + along[1] * s, z, g.rot), cols[k++ % cols.length]);
    I('rtable', () => new THREE.CylinderGeometry(0.4, 0.4, 0.04, 24).translate(0, 0.45, 0), 'tableWhite').push(mtx(g.tu, g.tv, z));
    I('rtableLeg', () => new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8).translate(0, 0.225, 0), 'deskLeg').push(mtx(g.tu, g.tv, z));
    I('pouf1', F.poufGeo, 'fabric').push(mtx(g.tu + along[0] * 0.95, g.tv + along[1] * 0.95, z, R()), cols[(k + 2) % cols.length]);
  }
  // высокие фикусы в графитовых кадках между группами
  for (const [u, v] of [[29.9, 27.3], [29.9, 30.7], [29.9, 35.9], [24.4, 35.95], [21.4, 35.95], [29.8, 21.0]]) {
    I('potB', F.potGeo, 'plastic').push(mtx(u, v, z, 0, [1.3, 1.1, 1.3]), '#45484d');
    I('plantB', () => F.plantGeo(1.9), 'leaf').push(mtx(u, v, z + 0.5, R() * 6, [0.9, 1.45, 0.9]));
  }
  // линейные светильники на стенах из туфа
  for (const [u0, v0, u1, v1] of [[30.4, 22, 30.4, 35], [14, 36.4, 29, 36.4]]) {
    ctx.lights.box('led', Math.min(u0, u1) - 0.02, Math.min(v0, v1) - 0.02, z + 2.6, Math.max(u0, u1) + 0.02, Math.max(v0, v1) + 0.02, z + 2.64);
  }
}

// ─── Парящая площадка ─────────────────────────────────────────────────────
function platform(ctx) {
  const { I, R } = ctx;
  const [u0, v0, u1, v1] = PLATFORM.rect, z = PLATFORM.z;
  const [su, sv] = PLATFORM.statue;
  I('statue', F.statueGeo, 'marble').push(mtx(su, sv, z, -Math.PI / 2));
  // кресла-мешки из нейлона: два ряда вдоль ЮВ стены под стендами (панорама Zly)
  const cols = ['#2257d6', '#f27ab8', '#f5d63d', '#3dbf5f', '#8ab8ec', '#1b3fbf', '#f27ab8', '#2257d6'];
  let k = 0;
  for (const [dv, du0, step] of [[0.75, 1.1, 0.88], [1.5, 1.5, 0.95]]) {
    for (let u = u0 + du0; u < u0 + 11.4; u += step) {
      const sc = 0.9 + R() * 0.25;
      I('beanbag', F.beanbagGeo, 'nylon').push(mtx(u + (R() - 0.5) * 0.25, v0 + dv + (R() - 0.5) * 0.2, z, (R() - 0.5) * 0.9, [sc, sc, sc]), cols[k++ % cols.length]);
    }
  }
  // скамеек у стен на панорамах нет — стена со стендами свободна
  // мольберты с фото старой библиотеки и флипчарт
  easelRow({ ...ctx, z }, [[25.2, 29.6, 1.9], [25.3, 21.2, 1.3]]);
  // арековые пальмы в белых кашпо
  for (const [u, v] of [[u0 + 0.8, v1 - 0.8], [u0 + 0.8, v0 + 0.8], [u1 - 0.8, v0 + 0.8], [u0 + 5.9, v1 - 0.7]]) {
    I('pot', F.potGeo, 'plastic').push(mtx(u, v, z));
    I('palm', () => F.palmGeo(2.0), 'leaf').push(mtx(u, v, z + 0.46, R() * 6));
  }
}

// ─── Мебель по зонам ──────────────────────────────────────────────────────
function zoneContents(ctx, zn) {
  const { L, z, top } = ctx;
  switch (zn.type) {
    case 'cluster': clusterRows(ctx, zn); ceilingLights(ctx.lights, zn.rect, top - 0.55, 'led', 2.8); break;
    case 'hall': hall(ctx, zn); ceilingLights(ctx.lights, zn.rect, top - 0.6, 'led', 3.2); break;
    case 'lobby': case 'foyer': lobby(ctx, zn); ceilingLights(ctx.lights, zn.rect, top - 0.6, 'led', 3.2, [ATR]); break;
    case 'corridor': case 'gallery': corridor(ctx, zn); ceilingLights(ctx.lights, zn.rect, top - 0.6, 'led', 3.4, [ATR, ...(L.id === 'L3' ? [[SKYLIGHT.u0, SKYLIGHT.v0, SKYLIGHT.u1, SKYLIGHT.v1]] : [])]); break;
    case 'turnstiles': turnstiles(ctx, zn); break;
    case 'server': serverRoom(ctx, zn); break;
    case 'photozone': photoZone(ctx, zn); break;
    case 'conference': conference(ctx, zn); break;
    case 'lounge': lounge(ctx, zn); ceilingLights(ctx.lights, zn.rect, top - 0.6, 'led', 3.0); break;
    case 'lounge3': lounge3(ctx, zn); break;
    case 'kitchen': kitchen(ctx, zn); ceilingLights(ctx.lights, zn.rect, top - 0.6, 'led', 2.6); break;
    case 'meeting': meeting(ctx, zn); starLights(ctx.lights, zn.rect, top - 0.5, 2.4); break;
    case 'game': game(ctx, zn); break;
    case 'pingpong': pingpong(ctx, zn); ceilingLights(ctx.lights, zn.rect, top - 0.5, 'led', 2.4); break;
    case 'office': case 'cowork': office(ctx, zn); ceilingLights(ctx.lights, zn.rect, top - 0.55, 'led', 2.8); break;
    case 'wardrobe': wardrobe(ctx, zn); ceilingLights(ctx.lights, zn.rect, top - 0.6, 'led', 3.0); break;
    case 'wc': wc(ctx, zn); break;
    case 'booths': booths(ctx, zn); break;
    case 'porch': break;
  }
  void z;
}

// Ряды столов кластера (по данным DESKS): двусторонний стол, мониторы, кресла, цветные торцы
function clusterRows(ctx, zn) {
  const { b, I, R, z } = ctx;
  let r = 0;
  for (const d of B.DESKS.filter((q) => q.level === zn.level && q.cluster === zn.cluster)) {
    const alongV = d.axis === 'v';
    const a0 = Math.min(d.from, d.to), a1 = Math.max(d.from, d.to), len = a1 - a0, mid = (a0 + a1) / 2;
    const cu = alongV ? d.at : mid, cv = alongV ? mid : d.at;
    const du = alongV ? 1.4 : len, dv = alongV ? len : 1.4;
    b.box('deskTop', cu - du / 2, cv - dv / 2, z + 0.72, cu + du / 2, cv + dv / 2, z + 0.755);
    if (alongV) b.box('deskLeg', cu - 0.02, cv - dv / 2 + 0.1, z + 0.755, cu + 0.02, cv + dv / 2 - 0.1, z + 0.9);
    else b.box('deskLeg', cu - du / 2 + 0.1, cv - 0.02, z + 0.755, cu + du / 2 - 0.1, cv + 0.02, z + 0.9);
    for (const end of [-1, 1]) {
      const g = new THREE.BoxGeometry(1.4, 0.72, 0.06);
      const uv = g.attributes.uv, cell = r % ATLAS_CELLS;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (cell + uv.getX(i)) / ATLAS_CELLS);
      const eu = alongV ? cu : cu + end * (du / 2 - 0.03), ev = alongV ? cv + end * (dv / 2 - 0.03) : cv;
      if (alongV && end === -1) g.rotateY(Math.PI);
      if (!alongV) g.rotateY(end === 1 ? Math.PI / 2 : -Math.PI / 2);
      g.translate(sx(eu), sy(z + 0.36), sz(ev));
      b.add(`deskEnd:${zn.cluster}`, g);
    }
    const seats = Math.max(1, Math.round((len - 0.6) / 1.2));
    for (let s = 0; s < seats; s++) {
      const t = -len / 2 + 0.3 + (s + 0.5) * ((len - 0.6) / seats);
      for (const side of [-1, 1]) {
        const mu = alongV ? cu + side * 0.36 : cu + t, mv = alongV ? cv + t : cv + side * 0.36;
        const rot = alongV ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? 0 : Math.PI);
        I('monitor', F.monitorGeo, 'monitor').push(mtx(mu, mv, z, rot));
        I('screen', F.screenGeo, 'screenOff').push(mtx(mu, mv, z, rot));
        const chu = alongV ? cu + side * 1.15 : cu + t, chv = alongV ? cv + t : cv + side * 1.15;
        I('chair', F.chairGeo, 'chairBlack').push(mtx(chu, chv, z, rot + Math.PI + (R() - 0.5) * 0.5));
      }
    }
    r++;
  }
}
function ceilingLights(batch, rect, y, key = 'led', pitch = 3.0, avoid = []) {
  const [u0, v0, u1, v1] = rect;
  const alongU = (u1 - u0) >= (v1 - v0);
  const L = 2.8;
  for (let a = (alongU ? v0 : u0) + pitch / 2; a < (alongU ? v1 : u1); a += pitch) {
    for (let s = (alongU ? u0 : v0) + 0.8; s + L < (alongU ? u1 : v1) - 0.3; s += L + 0.9) {
      const [cu, cv] = alongU ? [s + L / 2, a] : [a, s + L / 2];
      if (avoid.some((r) => inRect(cu, cv, r, 1.6))) continue;
      const g = F.linearGeo(L);
      if (!alongU) g.rotateY(Math.PI / 2);
      g.translate(sx(cu), sy(y), sz(cv));
      batch.add(key, g);
    }
  }
}
function starLights(batch, rect, y, step = 2.6) {
  for (const [a, c, e, f] of F.starField(rect[0] + 0.3, rect[1] + 0.3, rect[2] - 0.3, rect[3] - 0.3, step)) batch.add('ledCool', F.stripGeo(sx(a), sz(c), sx(e), sz(f), sy(y)));
}
// Мольберты с фото-холстами. r — поворот: холст смотрит в сторону (−sin r, cos r) по (u, v).
let photoSeq = 0;
function easelRow(ctx, pts) {
  const { I } = ctx;
  pts.forEach(([u, v, r]) => {
    const k = photoSeq++ % 6;
    I('easel', F.easelGeo, 'easelWood').push(mtx(u, v, ctx.z, r));
    I(`canvas${k}`, () => F.canvasGeo(0.9, 0.7), `canvasPhoto:${k}`).push(mtx(u, v, ctx.z, r));
  });
}
function hall(ctx, zn) {
  const { I, z, R } = ctx;
  const [u0, v0, u1, v1] = zn.rect;
  // мольберты вдоль стены гардероба
  const pts = [];
  for (let v = v0 + 1.6; v < v1 - 1.2; v += 2.2) pts.push([u0 + 0.9, v, -Math.PI / 2 + 0.12]);
  easelRow(ctx, pts);
  // у окон СВ фасада: островные диваны из серого велюра, кубические пуфы вокруг белых
  // журнальных столиков (панорама холла), у торца — высокий стол с зелёными стульями
  const pc = ['#8f3fbf', '#3fae4f', '#2f5fd1', '#e8761c', '#c23aa8', '#3fae4f'];
  let k = 0;
  for (const [u, v, r] of [[49.4, 10.4, 0.55], [53.1, 12.3, -0.25], [49.6, 15.6, -0.45]]) I('sofaIsland', () => F.islandSofaGeo(2.6, 1.05), 'fabric').push(mtx(u, v, z, r), '#b9bcc1');
  for (const [u, v] of [[51.6, 9.0], [52.0, 15.0]]) {
    I('ctable', () => new THREE.CylinderGeometry(0.36, 0.36, 0.035, 28).translate(0, 0.4, 0), 'tableWhite').push(mtx(u, v, z));
    I('ctableBase', () => new THREE.CylinderGeometry(0.2, 0.26, 0.38, 20).translate(0, 0.19, 0), 'tableWhite').push(mtx(u, v, z));
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + 0.4 + R() * 0.3;
      I('poufCube', F.cubePoufGeo, 'fabric').push(mtx(u + Math.cos(a) * 0.72, v + Math.sin(a) * 0.72, z, R()), pc[k++ % pc.length]);
    }
  }
  for (const [u, v] of [[53.2, 17.6]]) {
    I('rtable', () => new THREE.CylinderGeometry(0.5, 0.5, 0.04, 24).translate(0, 0.74, 0), 'tableWhite').push(mtx(u, v, z));
    I('rtableLeg', () => new THREE.CylinderGeometry(0.03, 0.03, 0.74, 8).translate(0, 0.37, 0), 'deskLeg').push(mtx(u, v, z));
    for (let i = 0; i < 4; i++) I('pchair', F.plasticChairGeo, 'chairWhite').push(mtx(u + Math.cos(i * 1.57) * 0.8, v + Math.sin(i * 1.57) * 0.8, z, -i * 1.57 - Math.PI / 2));
  }
  // ролл-ап «SCHOOL 21» у турникетов и экран-заставка на колонне
  I('rollup', F.rollupGeo, 'monitor').push(mtx(49.1, 18.7, z, Math.PI));
  I('rollupPrint', F.rollupPrintGeo, 'rollup').push(mtx(49.1, 18.7, z, Math.PI));
  ctx.b.box('black', 47.98, 18.215, z + 2.26, 49.22, 18.25, z + 2.96);
  uvPanel(ctx.b, 'lobbyScreen', [49.15, 18.25], [48.05, 18.25], z + 2.3, z + 2.92, 0.04);
  // кашпо с монстерами у стеклянной стены входа
  for (const u of [43.4, 49.2, 53.8]) {
    I('pot', F.potGeo, 'plastic').push(mtx(u, v0 + 0.7, z));
    I('plant', () => F.plantGeo(1.4), 'leaf').push(mtx(u, v0 + 0.7, z + 0.45, R() * 6));
  }
}
function lobby(ctx, zn) {
  const { I, z, R, b } = ctx;
  const [u0, v0, u1, v1] = zn.rect;
  if (zn.id === 'l1-lobby-n' || zn.id === 'l1-lobby') {
    // серые скамьи с кашпо (по плану — у оси 7 между атриумом и мятной лестницей)
    for (const v of zn.id === 'l1-lobby' ? [28.6] : [31.3, 34.0]) {
      I('lbench', () => F.benchGeo(2.2, 0.6), 'fabric').push(mtx(34.2, v, z, Math.PI / 2), '#9a9ea3');
      b.box('planterWood', 35.0, v - 1.0, z, 35.5, v + 1.0, z + 0.55);
      I('plantL', () => F.plantGeo(0.9), 'leaf').push(mtx(35.25, v, z + 0.4, R() * 6));
    }
  }
  if (zn.id === 'l1-foyer') {
    // модульные скамьи и мольберты
    for (const [u, v, r] of [[31.8, 11.2, Math.PI / 2], [33.6, 8.2, 0.3]]) I('lbench', () => F.benchGeo(2.2, 0.6), 'fabric').push(mtx(u, v, z, r), '#9a9ea3');
    easelRow(ctx, [[35.6, 10.0, Math.PI / 2 - 0.1], [35.6, 12.6, Math.PI / 2 + 0.1]]);
  }
  if (zn.id === 'l1-lobby') {
    for (const [u, v] of [[43.2, 26.2], [47.9, 27.6], [37.2, 24.2]]) {
      I('pot', F.potGeo, 'plastic').push(mtx(u, v, z));
      I('plant', () => F.plantGeo(1.5), 'leaf').push(mtx(u, v, z + 0.45, R() * 6));
    }
  }
  void u0; void v0; void u1; void v1;
}
function corridor(ctx, zn) {
  const { I, z, R } = ctx;
  if (zn.id === 'l1-foyer-s') {
    // у окон главного фасада: серые скамьи и растения, как в белом фойе
    for (const u of [33.0, 35.7]) I('lbench', () => F.benchGeo(2.2, 0.6), 'fabric').push(mtx(u, 1.6, z), '#9a9ea3');
    for (const u of [31.4, 36.6]) {
      I('pot', F.potGeo, 'plastic').push(mtx(u, 5.9, z));
      I('plant', () => F.plantGeo(1.4), 'leaf').push(mtx(u, 5.9, z + 0.45, R() * 6));
    }
  }
  if (zn.id === 'l1-conf-corr') easelRow(ctx, [15.5, 18.5, 21.5, 24.5, 27.5].map((u) => [u, 18.0, Math.PI]));
  if (zn.type === 'gallery' && zn.level === 'L2') {
    // фиолетовые банкетки и пуфы вдоль сиреневого парапета
    const pc = ['#2fae4f', '#1f63d1', '#e8641c'];
    let k = 0;
    for (const u of [15.2, 21.0, 27.4]) I('gbench', () => F.benchGeo(2.2, 0.6), 'fabric').push(mtx(u, 37.3, z), '#8a2aa0');
    for (const u of [14.8, 21.8, 27.0]) I('gbench', () => F.benchGeo(2.2, 0.6), 'fabric').push(mtx(u, 17.9, z), '#8a2aa0');
    for (const v of [21.0, 26.0, 33.0]) I('gbench', () => F.benchGeo(2.2, 0.6), 'fabric').push(mtx(11.9, v, z, Math.PI / 2), '#8a2aa0');
    for (const v of [27.5, 32.0]) I('gbench', () => F.benchGeo(2.2, 0.6), 'fabric').push(mtx(31.3, v, z, Math.PI / 2), '#8a2aa0');
    for (const [u, v] of [[18.4, 37.4], [24.2, 37.3], [12.2, 29.4], [31.2, 20.0], [18.2, 17.8]]) I('gpouf', F.poufGeo, 'fabric').push(mtx(u, v, z, R()), pc[k++ % pc.length]);
  }
  if (zn.id === 'l1-corr-nw') {
    for (const u of [28.5, 33.0]) {
      I('pot', F.potGeo, 'plastic').push(mtx(u, 38.3, z));
      I('plant', () => F.plantGeo(1.3), 'leaf').push(mtx(u, 38.3, z + 0.45, R() * 6));
    }
  }
}
function lounge(ctx, zn) {
  const { I, z, R, b } = ctx;
  const [u0, v0, u1, v1] = zn.rect;
  const cols = ['#9a9ea3', '#6c7075', '#9a9ea3'];
  let k = 0;
  // диваны и кресла у окон, шестигранные столы дальше; вдоль внутренней стены — проход
  const along = (u1 - u0) < (v1 - v0) ? 'v' : 'u';
  const sofaU = zn.id === 'l1-lounge-s' ? [u0 + 1.6, u0 + 4.6] : [u0 + 1.8, u1 - 2.2];
  for (const su of sofaU) for (let v = v0 + 1.6; v < v1 - 1.6; v += 3.2) {
    I('sofaL', () => F.sofaGeo(2.0), 'fabric').push(mtx(su, v, z, Math.PI / 2), cols[k++ % cols.length]);
    b.box('tableWhite', su + 0.7, v - 0.5, z, su + 1.5, v + 0.5, z + 0.42);
  }
  if (zn.id === 'l1-lounge-s') for (let v = v0 + 2.0; v < v1 - 1.2; v += 4.0) {
    const u = u0 + 8.6;
    I('htable', () => new THREE.CylinderGeometry(0.55, 0.55, 0.04, 6).translate(0, 0.74, 0), 'tableWhite').push(mtx(u, v, z));
    I('rtableLeg', () => new THREE.CylinderGeometry(0.03, 0.03, 0.74, 8).translate(0, 0.37, 0), 'deskLeg').push(mtx(u, v, z));
    for (let i = 0; i < 5; i++) I('pchair', F.plasticChairGeo, 'chairWhite').push(mtx(u + Math.cos(i * 1.257) * 0.85, v + Math.sin(i * 1.257) * 0.85, z, -i * 1.257 - Math.PI / 2));
  }
  for (const [u, v] of [[u0 + 0.9, v1 - 0.9], [u0 + 0.9, v0 + 0.9]]) {
    I('pot', F.potGeo, 'plastic').push(mtx(u, v, z));
    I('plant', () => F.plantGeo(1.4), 'leaf').push(mtx(u, v, z + 0.45, R() * 6));
  }
  void along;
}
// Лаунж 3 этажа: деревянный подиум с 5 световыми колодцами, кашпо, ступени, диваны
function lounge3(ctx, zn) {
  const { b, I, R, z } = ctx;
  const P = LOUNGE3, [u0, v0, u1, v1] = P.rect, top = z + P.podium;
  // тело подиума — белые панели (панорама puH), сверху паркет
  b.add('tableWhite', slabGeo(rectPts(u0, v0, u1, v1), P.wells.map((w) => rectPts(...w)), z + 0.008, P.podium - 0.04));
  b.add('floorWood', slabGeo(rectPts(u0, v0, u1, v1), P.wells.map((w) => rectPts(...w)), z + P.podium - 0.032, 0.032));
  // кашпо по периметру подиума (кроме ступеней) и вокруг колодцев
  const gapsOf = (side) => P.steps.filter((s) => s.side === side).map((s) => [s.from, s.to]);
  const edge = (side, a0, a1, fixed) => {
    let cur = a0;
    const segs = [];
    for (const [g0, g1] of gapsOf(side).sort((p, q) => p[0] - q[0])) { segs.push([cur, g0]); cur = g1; }
    segs.push([cur, a1]);
    for (const [s0, s1] of segs) {
      if (s1 - s0 < 0.4) continue;
      if (side === 'v0' || side === 'v1') planter(ctx, s0, fixed - 0.3, s1, fixed + 0.3, top);
      else planter(ctx, fixed - 0.3, s0, fixed + 0.3, s1, top);
    }
  };
  edge('v0', u0 + 0.3, u1 - 0.3, v0 + 0.35); edge('v1', u0 + 0.3, u1 - 0.3, v1 - 0.35);
  edge('u0', v0 + 0.9, v1 - 0.9, u0 + 0.35); edge('u1', v0 + 0.9, v1 - 0.9, u1 - 0.35);
  for (const [a, c, e, f] of P.wells) {
    planter(ctx, a - 0.55, c - 0.55, e + 0.55, c, top); planter(ctx, a - 0.55, f, e + 0.55, f + 0.55, top);
    planter(ctx, a - 0.55, c, a, f, top); planter(ctx, e, c, e + 0.55, f, top);
  }
  // ступени с кольца на подиум (серый камень, как на панораме 63w)
  const n = P.stepCount ?? 3;
  for (const s of P.steps) {
    for (let i = 0; i < n; i++) {
      const h = z + (P.podium * (i + 1)) / n, d = 0.3 * (n - i);
      if (s.side === 'v1') b.box('stepStone', s.from, v1, z, s.to, v1 + d, h);
      if (s.side === 'v0') b.box('stepStone', s.from, v0 - d, z, s.to, v0, h);
      if (s.side === 'u0') b.box('stepStone', u0 - d, s.from, z, u0, s.to, h);
      if (s.side === 'u1') b.box('stepStone', u1, s.from, z, u1 + d, s.to, h);
    }
  }
  // модульные диваны спинками к кашпо колодцев, лицом в «крест» проходов, на свободном конце — белый
  // ступенчатый столик (панорамы тура bv0, oo5, qis, FYL). Середина креста и подходы от ступеней свободны.
  const cols = ['#1f4d3f', '#a3202e', '#8e9296', '#e8641c', '#b0574a', '#1f4d3f', '#8e9296', '#2b2b2b'];
  const PL = 0.55, MOD = 1.1, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  let k = 0;
  // сторона кашпо: axis 'u' — грань на u = fixed вдоль v (s0..s1), n — куда смотрят диваны; tail — где столик
  const side = (axis, fixed, n, s0, s1, tail) => {
    const L = s1 - s0, m = Math.min(2, Math.floor((L - 1.0) / MOD));
    if (m < 1) return;
    const d = fixed + n * 0.47;
    const a = tail > 0 ? s0 : s1 - m * MOD;
    for (let i = 0; i < m; i++) {
      const s = a + MOD * (i + 0.5);
      const rot = axis === 'u' ? (n > 0 ? -Math.PI / 2 : Math.PI / 2) : (n > 0 ? 0 : Math.PI);
      I('sofaL3', () => F.sofaGeo(MOD), 'fabric').push(axis === 'u' ? mtx(d, s, top, rot) : mtx(s, d, top, rot), cols[k++ % cols.length]);
    }
    const t0 = tail > 0 ? a + m * MOD + 0.1 : a - 1.0, t1 = t0 + 0.9;
    const f0 = fixed + n * 0.05, f1 = fixed + n * 0.85, g0 = fixed + n * 0.25, g1 = fixed + n * 0.65;
    if (axis === 'u') {
      b.box('tableWhite', Math.min(f0, f1), t0, top, Math.max(f0, f1), t1, top + 0.3);
      b.box('tableWhite', Math.min(g0, g1), t0 + 0.2, top + 0.3, Math.max(g0, g1), t1 - 0.2, top + 0.55);
    } else {
      b.box('tableWhite', t0, Math.min(f0, f1), top, t1, Math.max(f0, f1), top + 0.3);
      b.box('tableWhite', t0 + 0.2, Math.min(g0, g1), top + 0.3, t1 - 0.2, Math.max(g0, g1), top + 0.55);
    }
  };
  P.wells.forEach((w, i) => {
    const [a, c, e, f] = [w[0] - PL, w[1] - PL, w[2] + PL, w[3] + PL];
    const wu = (a + e) / 2, wv = (c + f) / 2, center = i === P.wells.length - 1;
    // угловые колодцы: только грани, смотрящие в крест; у края подиума оставляем 1,1 м на подход от ступеней
    const nu = center ? [-1, 1] : [Math.sign(cu - wu)], nv = center ? [-1, 1] : [Math.sign(cv - wv)];
    for (const n of nu) {
      const out = Math.sign(wv - cv) || 1;
      const s0 = c + (center ? 0.4 : out < 0 ? 1.1 : 0.3), s1 = f - (center ? 0.4 : out > 0 ? 1.1 : 0.3);
      side('u', n > 0 ? e : a, n, s0, s1, center ? n : out);
    }
    for (const n of nv) {
      const out = Math.sign(wu - cu) || 1;
      const s0 = a + (center ? 0.4 : out < 0 ? 1.1 : 0.3), s1 = e - (center ? 0.4 : out > 0 ? 1.1 : 0.3);
      side('v', n > 0 ? f : c, n, s0, s1, center ? -n : out);
    }
  });
}
function planter(ctx, a, c, e, f, top) {
  const { b, I, R } = ctx;
  if (e - a < 0.2 || f - c < 0.2) return;
  // деревянный короб ~0,95 м (реечная обшивка, как на панорамах), сверху грунт и зелень
  b.box('planterWood', a, c, top, e, f, top + 0.93);
  b.box('tileDark', a + 0.05, c + 0.05, top + 0.93, e - 0.05, f - 0.05, top + 0.95);
  const long = (e - a) > (f - c);
  // густо, как на фото: куст каждые ~0,45 м, разного размера
  const n = Math.max(1, Math.floor((long ? e - a : f - c) / 0.45));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const pu = long ? a + (e - a) * t : (a + e) / 2, pv = long ? (c + f) / 2 : c + (f - c) * t;
    const k = 1.0 + R() * 0.4;
    I('plantL', () => F.plantGeo(0.8), 'leaf').push(mtx(pu, pv, top + 0.9, R() * 6, [k, k, k]));
  }
}
function turnstiles(ctx, zn) {
  const { b, z } = ctx;
  const [u0, v0, u1, v1] = zn.rect;
  const n = zn.props?.lanes ?? 5, step = (u1 - u0) / n, cv = (v0 + v1) / 2;
  // тумбы — обычной геометрией (для коллизий прогулки), проходы вдоль v по 0,7 м
  for (let i = 0; i <= n; i++) {
    const u = u0 + step * i, w = i === 0 || i === n ? 0.09 : 0.2;
    const a = i === 0 ? u : i === n ? u - w : u - w / 2;
    b.box('stainless', a, cv - 0.7, z, a + w, cv + 0.7, z + 1.0);
    b.box('black', a, cv - 0.71, z + 1.0, a + w, cv + 0.71, z + 1.02);
    // высокие стеклянные створки (0,35–1,6 м), индикатор на торце, Face ID на стойке у входа
    b.box('partitionGlass', a + w / 2 - 0.01, cv - 0.22, z + 0.35, a + w / 2 + 0.01, cv + 0.22, z + 1.6);
    ctx.lights.box('faceScreen', a + w / 2 - 0.03, cv - 0.715, z + 0.9, a + w / 2 + 0.03, cv - 0.71, z + 0.96);
    if (i < n) {
      ctx.I('faceId', F.faceIdGeo, 'monitor').push(mtx(a + w / 2, cv - 0.55, z + 1.02, Math.PI));
      ctx.I('faceScreen', F.faceScreenGeo, 'faceScreen').push(mtx(a + w / 2, cv - 0.55, z + 1.02, Math.PI));
      // голубые светодиодные линии на полу в проходах
      const lu = a + w + (step - w) / 2 - (i === 0 ? 0.045 : 0);
      for (const dv of [-1.5, -1.1, 1.1, 1.5]) ctx.lights.box('ledBlue', lu - 0.18, cv + dv - 0.012, z + 0.002, lu + 0.18, cv + dv + 0.012, z + 0.006);
    }
  }
}
function serverRoom(ctx, zn) {
  const { b, z } = ctx;
  const [u0, v0, u1, v1] = zn.rect;
  for (let row = 0; row < 2; row++) {
    const v = v0 + 1.3 + row * 2.1;
    for (let u = u0 + 0.6; u < u1 - 0.6; u += 0.68) b.box('rack', u, v, z, u + 0.62, v + 1.0, z + 2.1);
  }
  b.box('serverGlass', u0 + 0.05, v0 + 0.05, z + 2.6, u1 - 0.05, v1 - 0.05, z + 2.64);
}
function photoZone(ctx, zn) {
  const { b, I, z } = ctx;
  // перед наклонной стеной-гирих: чёрный 12-гранник, зеркальные пирамиды, пиксельные «21 SCHOOL»
  const disc = new THREE.CylinderGeometry(0.9, 0.9, 0.12, 12);
  disc.rotateX(Math.PI / 2); disc.rotateY(-0.33);
  disc.translate(sx(52.6), sy(z + 1.9), sz(20.35));
  b.add('black', disc);
  for (const [u, v, s] of [[49.8, 21.8, 1.3], [53.8, 20.4, 1.0]]) {
    const g = new THREE.ConeGeometry(s * 0.7, s * 1.3, 4);
    g.rotateY(Math.PI / 4); g.translate(sx(u), sy(z + s * 0.65), sz(v));
    b.add('black', g);
  }
  b.box('graniteStep', 50.6, 21.0, z, 52.2, 21.9, z + 0.35);
  const cell = 0.16;
  ['XXXX.', '....X', '..XX.', '.X...', 'XXXXX'].forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch === 'X') b.box('led', 50.8 + c * cell, 21.4, z + 0.35 + (5 - r) * cell, 50.8 + (c + 1) * cell - 0.02, 21.5, z + 0.35 + (6 - r) * cell - 0.02);
  }));
  for (let r = 0; r < 5; r++) b.box('led', 51.7, 21.4, z + 0.35 + (r + 1) * cell, 51.84, 21.5, z + 0.35 + (r + 2) * cell - 0.02);
  for (const [u, v] of [[51.9, 22.4], [52.9, 22.3]]) I('pchair', F.plasticChairGeo, 'chairWhite').push(mtx(u, v, z, Math.PI));
  void zn;
}
function conference(ctx, zn) {
  const { b, I, z, top, lights } = ctx;
  const [u0, v0, u1, v1] = zn.rect;
  // ЮЗ стена графитовая со ступенчатыми ромбами, на ней LED-экран ~5 × 2,6 м без сцены (панорама RQJ);
  // мурал «цифровой город» на СВ стене
  // фальш-стена стоит перед колоннами оси (на панораме колонн у экрана не видно)
  b.box('confWall', u0 + 0.31, 3.4, z, u0 + 0.34, 13.4, top - 0.05);
  b.box('black', u0 + 0.34, 5.7, z + 0.5, u0 + 0.38, 10.9, z + 3.25);
  uvPanel(b, 'slide', [u0, 10.8], [u0, 5.8], z + 0.6, z + 3.15, 0.39);
  b.box('pixelMural', u1 - 0.14, v0 + 2.8, z + 0.2, u1 - 0.1, v1 - 3.0, z + 3.9);
  // телевизоры-дублёры на первых колоннах, смотрят в зал (панорама 2vh)
  for (const v of [6.6, 12.6]) {
    const fu = 18.6 + GRID.column / 2;
    b.box('black', fu, v - 0.62, z + 2.25, fu + 0.05, v + 0.62, z + 3.0);
    uvPanel(b, 'slide', [fu, v + 0.56], [fu, v - 0.56], z + 2.3, z + 2.95, 0.055);
  }
  // ряды белых стульев лицом к экрану (первый ряд ~5 м от экрана)
  for (let u = u0 + 5.0; u < u1 - 2.1; u += 0.95) for (let v = v0 + 1.6; v < v1 - 2.0; v += 0.55) {
    if (Math.abs(v - 8.3) < 0.55) continue;
    I('pchair', F.plasticChairGeo, 'chairWhite').push(mtx(u, v, z, Math.PI / 2));
  }
  starLights(lights, [u0 + 1.5, v0 + 1.5, u1 - 1.5, v1 - 1.5], top - 0.8, 3.4);
}
function kitchen(ctx, zn) {
  const { b, I, R, z, L } = ctx;
  const [u0, v0, u1, v1] = zn.rect;
  // кухонная линия: на 2 этаже — островом по плану, на 3 — вдоль стены санузлов
  const line = L.id === 'L2' ? [u0 + 3.7, v0 + 6.0, u0 + 4.5, v1 - 0.6] : [u0 + 0.6, v1 - 0.75, u0 + 6.4, v1 - 0.15];
  b.box('black', line[0], line[1], z, line[2], line[3], z + 0.9);
  b.box('graniteStep', line[0] - 0.01, line[1] - 0.01, z + 0.9, line[2] + 0.01, line[3] + 0.01, z + 0.94);
  const alongV = line[3] - line[1] > line[2] - line[0];
  for (let a = (alongV ? line[1] : line[0]) + 0.2; a < (alongV ? line[3] : line[2]) - 0.6; a += 1.5) {
    if (alongV) b.box('stainless', line[0] + 0.1, a, z + 0.94, line[2] - 0.1, a + 0.5, z + 1.24);
    else b.box('stainless', a, line[1] + 0.1, z + 0.94, a + 0.5, line[3] - 0.1, z + 1.24);
  }
  if (alongV) b.box('black', line[0], line[3] - 1.4, z, line[2], line[3], z + 2.0);
  else b.box('black', line[2] - 1.4, line[1], z, line[2], line[3], z + 2.0);
  // мурал с гранатами во всю высоту стены (панорама кухни)
  uvPanel(b, 'kitchenMural', [u1 - 0.9, v1], [u0 + 0.9, v1], z + 0.95, z + 3.35, 0.17);
  // оранжевые столы с белыми стульями
  const cols = L.id === 'L2' ? [u0 + 1.9, u0 + 6.1, u0 + 8.1] : [u0 + 1.9, u0 + 4.6, u0 + 7.3];
  for (const u of cols) for (let v = v0 + 1.4; v < (L.id === 'L3' ? v1 - 1.9 : v1 - 1.0); v += 2.25) {
    if (inRect(u, v, line, 0.9)) continue;
    b.box('tableOrange', u - 0.75, v - 0.42, z + 0.72, u + 0.75, v + 0.42, z + 0.76);
    b.box('deskLeg', u - 0.03, v - 0.03, z, u + 0.03, v + 0.03, z + 0.72);
    for (const [du, dv, r] of [[-0.38, -0.72, 0], [0.38, -0.72, 0], [-0.38, 0.72, Math.PI], [0.38, 0.72, Math.PI]]) {
      I('pchair', F.plasticChairGeo, 'chairWhite').push(mtx(u + du, v + dv, z, r + (R() - 0.5) * 0.3));
    }
  }
}
function meeting(ctx, zn) {
  const { b, I, z } = ctx;
  const [u0, v0, u1, v1] = zn.rect;
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  const alongU = (u1 - u0) >= (v1 - v0);
  const seats = zn.props?.seats ?? 6;
  const L = Math.max(1.2, Math.min((alongU ? u1 - u0 : v1 - v0) - 2.0, (seats / 2) * 0.75));
  const du = alongU ? L : 1.1, dv = alongU ? 1.1 : L;
  b.box('tableWhite', cu - du / 2, cv - dv / 2, z + 0.73, cu + du / 2, cv + dv / 2, z + 0.77);
  b.box('deskLeg', cu - 0.05, cv - 0.05, z, cu + 0.05, cv + 0.05, z + 0.73);
  const n = Math.max(1, Math.round(seats / 2));
  for (let i = 0; i < n; i++) {
    const t = -L / 2 + L * (i + 0.5) / n;
    for (const s of [-1, 1]) {
      const [pu, pv] = alongU ? [cu + t, cv + s * 0.85] : [cu + s * 0.85, cv + t];
      const rot = alongU ? (s > 0 ? Math.PI : 0) : (s > 0 ? Math.PI / 2 : -Math.PI / 2);
      I('chair', F.chairGeo, 'chairBlack').push(mtx(pu, pv, z, rot));
    }
  }
}
function game(ctx, zn) {
  const { b, I, R, z } = ctx;
  const [u0, v0, u1, v1] = zn.rect;
  b.box('tableWhite', (u0 + u1) / 2 - 1.4, v0 + 0.3, z, (u0 + u1) / 2 + 1.4, v0 + 0.75, z + 0.42);
  b.box('tvScreen', (u0 + u1) / 2 - 0.9, v1 - 0.18, z + 1.0, (u0 + u1) / 2 + 0.9, v1 - 0.12, z + 2.05);
  const cols = ['#f08bb8', '#2fa84f', '#1f63d1', '#f08bb8', '#2fa84f'];
  for (let i = 0; i < 5; i++) I('beanbag', F.beanbagGeo, 'nylon').push(mtx(u0 + 1.0 + i * 1.05, v0 + 1.6 + (R() - 0.5) * 0.3, z, R() * 6), cols[i]);
}
function pingpong(ctx, zn) {
  const { b, I, z } = ctx;
  const [u0, v0, u1, v1] = zn.rect;
  const n = zn.props?.tables ?? 1;
  for (let i = 0; i < n; i++) {
    const cu = (u0 + u1) / 2 - 0.8, cv = v0 + ((v1 - v0) * (i + 0.5)) / n;
    b.box('pingpong', cu - 1.37, cv - 0.76, z + 0.72, cu + 1.37, cv + 0.76, z + 0.76);
    b.box('tableWhite', cu - 1.37, cv - 0.01, z + 0.76, cu + 1.37, cv + 0.01, z + 0.765);
    b.box('tableWhite', cu - 0.01, cv - 0.8, z + 0.76, cu + 0.01, cv + 0.8, z + 0.92);
    for (const [du, dv] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) b.box('deskLeg', cu + du - 0.03, cv + dv - 0.03, z, cu + du + 0.03, cv + dv + 0.03, z + 0.72);
  }
  const cols = ['#f08bb8', '#2f6fd1', '#63b84e'];
  cols.forEach((c, i) => I('beanbag', F.beanbagGeo, 'nylon').push(mtx(u0 + 1.0, v1 - 1.4 - i * 1.3, z, Math.PI / 2), c));
}
function office(ctx, zn) {
  const { I, z } = ctx;
  const [u0, v0, u1, v1] = zn.rect;
  for (let u = u0 + 1.6; u < u1 - 1.4; u += 3.2) for (let v = v0 + 1.6; v < v1 - 1.4; v += 3.0) {
    I('odesk', () => new THREE.BoxGeometry(1.6, 0.04, 0.8).translate(0, 0.74, 0), 'tableWhite').push(mtx(u, v, z));
    I('odeskLeg', () => new THREE.BoxGeometry(1.5, 0.72, 0.04).translate(0, 0.36, 0.3), 'deskLeg').push(mtx(u, v, z));
    I('monitor', F.monitorGeo, 'monitor').push(mtx(u, v - 0.1, z, 0));
    I('chair', F.chairGeo, 'chairBlack').push(mtx(u, v + 0.75, z, Math.PI));
  }
}
function wardrobe(ctx, zn) {
  const { b, I, R, z } = ctx;
  const [u0, v0, u1, v1] = zn.rect;
  if (zn.id === 'l1-lockers') {
    // по плану: два ряда шкафчиков поперёк, у лифтов — кресла-мешки, у двери в холл — столики
    for (const v of [12.9, 15.5]) b.box('lockerGray', u0 + 0.9, v, z, u1 - 0.9, v + 0.5, z + 1.9);
    const cols = ['#f08bb8', '#2f6fd1', '#63b84e', '#f2d64b'];
    cols.forEach((c, i) => I('beanbag', F.beanbagGeo, 'nylon').push(mtx(u0 + 1.3 + i * 1.3, v1 - 1.2, z, R() * 6), c));
    for (const [u, v] of [[38.3, 10.4], [40.9, 10.4]]) {
      I('rtable', () => new THREE.CylinderGeometry(0.5, 0.5, 0.04, 24).translate(0, 0.74, 0), 'tableWhite').push(mtx(u, v, z));
      I('rtableLeg', () => new THREE.CylinderGeometry(0.03, 0.03, 0.74, 8).translate(0, 0.37, 0), 'deskLeg').push(mtx(u, v, z));
    }
    return;
  }
  const alongU = (u1 - u0) >= (v1 - v0);
  if (alongU) for (let v = v0 + 1.1; v < v1 - 0.9; v += 2.0) b.box('lockerGray', u0 + 1.4, v, z, u1 - 1.4, v + 0.5, z + 1.9);
  else for (let u = u0 + 1.2; u < u1 - 1.0; u += 1.8) b.box('lockerGray', u, v0 + 1.4, z, u + 0.5, v1 - 1.4, z + 1.9);
}
function wc(ctx, zn) {
  const { b, z } = ctx;
  const [u0, v0, u1, v1] = zn.rect;
  b.box('tileDark', u0 + 0.1, v0 + 0.1, z, u0 + 0.14, v1 - 0.1, z + 2.6);
  for (let v = v0 + 0.9; v < v1 - 0.8; v += 1.2) b.box('acpGray', u0 + 0.2, v, z, u0 + 1.7, v + 0.04, z + 2.0);
  b.box('graniteStep', u1 - 0.8, v0 + 0.8, z + 0.82, u1 - 0.2, v1 - 0.8, z + 0.86);
}
function booths(ctx, zn) {
  const { b, z } = ctx;
  const [u0, v0, u1, v1] = zn.rect;
  const n = zn.props?.n ?? 3, h = (v1 - v0) / n;
  for (let i = 0; i < n; i++) {
    const a = v0 + i * h + 0.05, c = v0 + (i + 1) * h - 0.05;
    b.box('acpGray', u0 + 0.1, a, z, u1 - 0.1, a + 0.05, z + 2.3);
    b.box('acpGray', u0 + 0.1, a, z + 2.25, u1 - 0.1, c, z + 2.3);
    b.box('tableWhite', u0 + 0.2, a + 0.2, z + 0.72, u1 - 0.3, c - 0.2, z + 0.75);
  }
}

// Невидимая плашка для выбора зоны кликом
const pickMat = new THREE.MeshBasicMaterial({ color: 0x19c2a6, transparent: true, opacity: 0.0, depthWrite: false });
function pickBox(pick, root, zn, z) {
  const [u0, v0, u1, v1] = zn.rect;
  const g = new THREE.BoxGeometry(Math.max(0.2, u1 - u0 - 0.1), 0.06, Math.max(0.2, v1 - v0 - 0.1));
  g.translate(sx((u0 + u1) / 2), sy(z + 0.04), sz((v0 + v1) / 2));
  const m = new THREE.Mesh(g, pickMat.clone());
  m.name = `pick:${zn.id}`;
  m.userData.zone = zn.id;
  m.userData.confidence = zn.confidence;
  m.renderOrder = 5;
  root.add(m);
  pick.push(m);
}
