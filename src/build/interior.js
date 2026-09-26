// Интерьеры: перекрытия, колонны, стены, мебель и свет — всё из ZONES / CORES.
import * as THREE from 'three';
import { Batch, Instancer, P, sx, sy, sz, mtx, rng, slabGeo, rectPts } from '../lib/geom.js';
import {
  SIZE, LEVELS, SLAB, GRID, ATRIUM, ATRIUM_STAIRS, CORES, ROOF_Z, CLUSTER_COLORS, SKYLIGHT,
} from '../data/building.js';
import * as F from './furniture.js';
import { railing } from './shell.js';
import { ATLAS_CELLS } from '../lib/materials.js';

const E = 0.6;                // отступ внутренней грани витража от оси здания
const IN0 = 0.3, IN1 = SIZE - 0.3;
const lvl = (id) => LEVELS.find((l) => l.id === id);
const nextZ = (id) => {
  if (id === 'L3') return ROOF_Z;
  if (id === 'M') return lvl('L3').z;
  if (id === 'L1') return lvl('L2').z;
  const i = LEVELS.findIndex((l) => l.id === id);
  const nxt = LEVELS.slice(i + 1).find((l) => !l.partial);
  return nxt ? nxt.z : ROOF_Z;
};

const FLOOR_BY_TYPE = {
  cluster: 'floorCluster', lobby: 'floorTile', corridor: 'floorTile', gallery: 'floorCluster', lounge: 'floorWood',
  platform: 'floorTile', kitchen: 'floorCluster', meeting: 'carpetBlue', conference: 'carpetBlue', game: 'carpetDark',
  pingpong: 'floorGray', server: 'floorGray', library: 'floorTileWarm', office: 'floorCluster', tech: 'floorGray',
  storage: 'floorGray', wardrobe: 'floorTile', turnstiles: 'floorTile', photozone: 'floorTile', wc: 'floorTile',
};
const WALL_BY_TYPE = {
  kitchen: 'wallWhite', meeting: 'glass', conference: 'wallWhite', game: 'wallWhite', pingpong: 'wallWhite',
  server: 'glass', library: 'wallWhite', office: 'wallWhite', tech: 'wallWhite', storage: 'wallWhite', wardrobe: 'wallWhite',
  wc: 'wallWhite',
};
// где у помещения не ставим стену (сторона к фасаду — там витраж)
const onFacade = (a) => a <= E + 0.05 || a >= SIZE - E - 0.05;

export function buildInterior(mats, zones) {
  const out = {};
  const pick = [];
  for (const L of LEVELS) {
    out[L.id] = buildLevel(mats, L, zones.filter((z) => z.level === L.id), zones, pick);
  }
  return { levels: out, pick };
}

function buildLevel(mats, L, zones, allZones, pick) {
  const root = new THREE.Group(); root.name = `level-${L.id}`;
  const ceilingGroup = new THREE.Group(); ceilingGroup.name = `ceiling-${L.id}`;
  const b = new Batch(mats);          // основное
  const cb = new Batch(mats);         // потолки (прячем в разрезе)
  const lights = new Batch(mats);     // светильники (остаются видны)
  const inst = {};                    // инстансеры по ключу
  const I = (key, geoFn, matKey) => (inst[key] ??= new Instancer(geoFn(), mats.get(matKey), `${L.id}:${key}`));
  const z = L.z;
  const zc = nextZ(L.id) - SLAB;      // низ перекрытия над уровнем
  const R = rng(L.z * 100 + 7);

  // ── Перекрытие ───────────────────────────────────────────────────────────
  if (L.id === 'M') {
    const [u0, v0, u1, v1] = [ATRIUM.u0, ATRIUM.v0, ATRIUM.u1, ATRIUM.v1];
    b.add('concrete', slabGeo(rectPts(u0, v0, u1, v1), [], z - SLAB, SLAB));
  } else {
    const holes = [];
    for (const zn of zones) if (zn.type === 'void' || zn.type === 'amphitheater') holes.push(rectPts(...zn.rect));
    b.add(L.basement ? 'concrete' : 'concrete', slabGeo(rectPts(IN0, IN0, IN1, IN1), holes, z - SLAB, SLAB));
  }
  // подвалы: наружные стены (ниже земли)
  if (L.basement) {
    const t = 0.4;
    b.box('concrete', IN0, IN0, z, IN1, IN0 + t, zc);
    b.box('concrete', IN0, IN1 - t, z, IN1, IN1, zc);
    b.box('concrete', IN0, IN0, z, IN0 + t, IN1, zc);
    b.box('concrete', IN1 - t, IN0, z, IN1, IN1, zc);
  }

  // ── Отделка пола по зонам (+ базовое покрытие) ──────────────────────────
  const baseFloor = L.id === 'L1' || L.id === 'M' ? 'floorTile' : L.basement ? 'floorGray' : 'floorCluster';
  if (L.id !== 'M') {
    const holes = zones.filter((zn) => ['void', 'amphitheater'].includes(zn.type)).map((zn) => rectPts(...zn.rect));
    b.add(baseFloor, slabGeo(rectPts(IN0 + 0.05, IN0 + 0.05, IN1 - 0.05, IN1 - 0.05), holes, z, 0.008));
  }
  for (const zn of zones) {
    const key = zn.type === 'corridor' && L.id !== 'L1' ? 'floorCluster' : FLOOR_BY_TYPE[zn.type];
    if (!key || key === baseFloor || ['void', 'amphitheater', 'lounge', 'grandstair'].includes(zn.type)) continue;
    const [u0, v0, u1, v1] = zn.rect;
    b.box(key, u0 + 0.02, v0 + 0.02, z + 0.008, u1 - 0.02, v1 - 0.02, z + 0.016);
  }

  // ── Потолок (низ плиты над уровнем) ──────────────────────────────────────
  if (!L.basement && L.id !== 'M') {
    const holes = [];
    if (L.id === 'L1') holes.push(rectPts(ATRIUM.u0, ATRIUM.v0, ATRIUM.u1, ATRIUM.v1));
    if (L.id === 'L2') holes.push(rectPts(ATRIUM.u0, ATRIUM.v0, ATRIUM.u1, ATRIUM.v1));
    if (L.id === 'L3') holes.push(rectPts(SKYLIGHT.u0, SKYLIGHT.v0, SKYLIGHT.u1, SKYLIGHT.v1));
    cb.add('ceilingBlack', slabGeo(rectPts(IN0, IN0, IN1, IN1), holes, zc - 0.02, 0.02));
  }
  if (L.id === 'M') cb.add('ceilingWhite', slabGeo(rectPts(ATRIUM.u0, ATRIUM.v0, ATRIUM.u1, ATRIUM.v1), [], nextZ('M') - SLAB - 0.02, 0.02));

  // ── Колонны по сетке ─────────────────────────────────────────────────────
  const inRect = (u, v, r, m = 0) => u > r[0] - m && u < r[2] + m && v > r[1] - m && v < r[3] + m;
  const coreRects = CORES.filter((c) => c.levels.includes(L.id)).map((c) => c.rect);
  const colH0 = z, colH1 = zc;
  const cs = GRID.column / 2;
  for (const u of GRID.u) for (const v of GRID.v) {
    if (coreRects.some((r) => inRect(u, v, r, -0.01))) continue;
    const inAtrium = inRect(u, v, [ATRIUM.u0, ATRIUM.v0, ATRIUM.u1, ATRIUM.v1], 0.01);
    const strictlyInside = inRect(u, v, [ATRIUM.u0, ATRIUM.v0, ATRIUM.u1, ATRIUM.v1], -0.01);
    if (L.id === 'M') {
      if (!inAtrium) continue;
      addColumn(b, 'columnBlack', u, v, strictlyInside ? z : lvl('L1').z, zc, cs, true);
      continue;
    }
    if (L.id === 'L2' && inAtrium) continue;           // в атриуме колонны идут от площадки
    if (L.id === 'L1' && inAtrium) continue;           // по контуру атриума — чёрные колонны площадки
    const amph = zones.find((zn) => zn.type === 'amphitheater');
    if (amph && inRect(u, v, amph.rect, -0.01)) continue;
    const zn = zones.find((q) => q.type !== 'void' && inRect(u, v, q.rect, 0.01));
    if (L.id === 'L3' && inRect(u, v, [ATRIUM.u0, ATRIUM.v0, ATRIUM.u1, ATRIUM.v1], -0.01)) continue;
    if (zn && zn.type === 'cluster') addColumn(b, `col:${zn.cluster}`, u, v, z, zc, cs + 0.05, true);
    else addColumn(b, 'columnWhite', u, v, z, zc, cs, false, L.basement ? null : 'ceilingBlack', cb);
  }

  // ── Ядра: лестницы, лифты, санузлы ───────────────────────────────────────
  for (const core of CORES.filter((c) => c.levels.includes(L.id))) {
    const [u0, v0, u1, v1] = core.rect;
    roomWalls(b, core.rect, z, zc, core.type === 'lift' ? 'acpGray' : 'wallWhite', { door: core.type === 'lift' ? null : 'auto' });
    if (core.type === 'stair') stairCore(b, core.rect, z, nextZ(L.id), L.id === 'L3');
    if (core.type === 'lift') {
      const n = 2, w = (u1 - u0) / n;
      for (let k = 0; k < n; k++) {
        b.box('stainless', u0 + k * w + 0.4, v1 - 0.14, z, u0 + (k + 1) * w - 0.4, v1 + 0.02, z + 2.2);
        b.box('frameBlack', u0 + k * w + 0.36, v1 - 0.16, z + 2.2, u0 + (k + 1) * w - 0.36, v1 + 0.03, z + 2.32);
      }
    }
    if (core.type === 'wc') {
      for (let u = u0 + 1.0; u < u1 - 0.8; u += 1.2) b.box('acpGray', u, v0 + 0.2, z, u + 0.04, v0 + 1.6, z + 2.0);
    }
    if (!L.basement) pickBox(pick, mats, root, { ...core, level: L.id }, z);
  }

  // ── Зоны ─────────────────────────────────────────────────────────────────
  for (const zn of zones) {
    const [u0, v0, u1, v1] = zn.rect;
    const w = u1 - u0, d = v1 - v0;
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    const wallMat = WALL_BY_TYPE[zn.type];
    const wTop = zn.props?.wallTop ?? zc;
    if (wallMat === 'glass') glassWalls(b, zn.rect, z, wTop);
    else if (wallMat) roomWalls(b, zn.rect, z, wTop, wallMat, { door: 'auto' });

    switch (zn.type) {
      case 'cluster': clusterDesks(zn, z, I, b, R); ceilingLights(lights, zn.rect, zc - 0.55, 'led', 2.8); break;
      case 'lobby': {
        if (zn.props?.sofas) lobbySofas(zn, z, I, R);
        if (zn.props?.easels) easels(zn, z, I, R, zn.props.easels);
        ceilingLights(lights, zn.rect, zc - 0.6, 'led', 3.2, 0.3);
        // озеленение вдоль витража
        if (onFacade(u1) || onFacade(v0)) planterRow(b, I, zn, z);
        break;
      }
      case 'corridor':
        if (zn.props?.easels) easels(zn, z, I, R, zn.props.easels);
        ceilingLights(lights, zn.rect, zc - 0.6, 'led', 3.5);
        break;
      case 'turnstiles': turnstiles(zn, z, I, b); break;
      case 'server': serverRoom(zn, z, b); break;
      case 'photozone': photoZone(zn, z, b, I); break;
      case 'amphitheater': amphitheater(zn, z, zc, b, lights, I); break;
      case 'grandstair': grandStair(zn, b); break;
      case 'platform': platform(zn, z, zc, b, lights, I, mats); break;
      case 'void': voidEdge(zn, z, b, I); break;
      case 'gallery': ceilingLights(lights, zn.rect, zc - 0.6, 'led', 3.0, 0, [ATRIUM.u0, ATRIUM.v0, ATRIUM.u1, ATRIUM.v1]); break;
      case 'lounge': lounge(zn, z, b, I, R); break;
      case 'kitchen': kitchen(zn, z, b, I, R); ceilingLights(lights, zn.rect, zc - 0.6, 'led', 2.6); break;
      case 'meeting': meeting(zn, z, b, I); starLights(lights, zn.rect, zc - 0.5, 2.6); break;
      case 'conference': conference(zn, z, b, I); starLights(lights, [u0 + 2, v0 + 2, u1 - 2, v1 - 2], zc - 0.7, 3.2); break;
      case 'game': game(zn, z, b, I, R); break;
      case 'pingpong': pingpong(zn, z, b, I); ceilingLights(lights, zn.rect, zc - 0.5, 'led', 2.4); break;
      case 'library': library(zn, z, zc, b, I, L.basement); break;
      case 'office': office(zn, z, I); ceilingLights(lights, zn.rect, zc - 0.5, 'led', 2.8); break;
      case 'wardrobe': wardrobe(zn, z, b); break;
    }
    if (!['void'].includes(zn.type)) pickBox(pick, mats, root, zn, zn.type === 'amphitheater' ? (zn.props?.stageZ ?? z) : z);
  }

  // лестницы атриума живут на уровне площадки
  if (L.id === 'M') for (const s of ATRIUM_STAIRS) atriumStair(s, b);

  root.add(b.build(`L-${L.id}`));
  const lg = lights.build(`lights-${L.id}`, { castShadow: false, receiveShadow: false });
  lg.name = `lights-${L.id}`;
  root.add(lg);
  for (const k of Object.keys(inst)) { const m = inst[k].build(); if (m) root.add(m); }
  ceilingGroup.add(cb.build(`C-${L.id}`, { castShadow: false }));
  root.add(ceilingGroup);
  root.userData = { level: L.id, ceiling: ceilingGroup, lights: lg };
  return root;
}

// ─── Детали ────────────────────────────────────────────────────────────────

function addColumn(b, key, u, v, z0, z1, h, labelled, capKey, capBatch) {
  if (labelled) {
    // стандартная коробка: подпись на каждой грани целиком
    const g = new THREE.BoxGeometry(h * 2, z1 - z0, h * 2);
    g.translate(sx(u), sy((z0 + z1) / 2), sz(v));
    b.add(key, g);
  } else {
    // верх колонны «уходит» в чёрный потолок (как на фото) — эта часть прячется в разрезе
    b.box(key, u - h, v - h, z0, u + h, v + h, z1 - (capKey ? 0.7 : 0));
    if (capKey) (capBatch || b).box(capKey, u - h - 0.01, v - h - 0.01, z1 - 0.7, u + h + 0.01, v + h + 0.01, z1);
  }
}

// Стены помещения (внутри прямоугольника, чтобы соседние стены не совпадали)
function roomWalls(b, rect, z0, z1, mat, { door = 'auto', t = 0.12 } = {}) {
  const [u0, v0, u1, v1] = rect;
  const cu = SIZE / 2, cv = SIZE / 2;
  // дверь — на стороне, обращённой к центру здания
  const sides = [
    { k: 'v0', dist: Math.abs(v0 - cv) }, { k: 'v1', dist: Math.abs(v1 - cv) },
    { k: 'u0', dist: Math.abs(u0 - cu) }, { k: 'u1', dist: Math.abs(u1 - cu) },
  ].sort((a, c) => a.dist - c.dist);
  const doorSide = door === 'auto' ? sides[0].k : door;
  const dw = 1.1;
  const seg = (k, a0, a1) => {
    if (a1 - a0 < 0.05) return;
    if (k === 'v0' && !onFacade(v0)) b.box(mat, a0, v0, z0, a1, v0 + t, z1);
    if (k === 'v1' && !onFacade(v1)) b.box(mat, a0, v1 - t, z0, a1, v1, z1);
    if (k === 'u0' && !onFacade(u0)) b.box(mat, u0, a0, z0, u0 + t, a1, z1);
    if (k === 'u1' && !onFacade(u1)) b.box(mat, u1 - t, a0, z0, u1, a1, z1);
  };
  for (const k of ['v0', 'v1', 'u0', 'u1']) {
    const along = k[0] === 'v' ? [u0, u1] : [v0, v1];
    if (k === doorSide) {
      const mid = (along[0] + along[1]) / 2;
      seg(k, along[0], mid - dw / 2);
      seg(k, mid + dw / 2, along[1]);
      // перемычка над дверью
      const hz = z0 + 2.3;
      if (hz < z1) {
        if (k === 'v0' && !onFacade(v0)) b.box(mat, mid - dw / 2, v0, hz, mid + dw / 2, v0 + t, z1);
        if (k === 'v1' && !onFacade(v1)) b.box(mat, mid - dw / 2, v1 - t, hz, mid + dw / 2, v1, z1);
        if (k === 'u0' && !onFacade(u0)) b.box(mat, u0, mid - dw / 2, hz, u0 + t, mid + dw / 2, z1);
        if (k === 'u1' && !onFacade(u1)) b.box(mat, u1 - t, mid - dw / 2, hz, u1, mid + dw / 2, z1);
      }
    } else seg(k, along[0], along[1]);
  }
}

// Стеклянные перегородки в чёрных рамах
function glassWalls(b, rect, z0, z1) {
  const [u0, v0, u1, v1] = rect;
  const t = 0.05;
  const run = (k, a0, a1) => {
    const fixed = k[0] === 'v' ? (k === 'v0' ? v0 : v1) : (k === 'u0' ? u0 : u1);
    if (onFacade(fixed)) return;
    const box = (key, a, c, za, zb, th) => {
      if (k === 'v0') b.box(key, a, v0, za, c, v0 + th, zb);
      if (k === 'v1') b.box(key, a, v1 - th, za, c, v1, zb);
      if (k === 'u0') b.box(key, u0, a, za, u0 + th, c, zb);
      if (k === 'u1') b.box(key, u1 - th, a, za, u1, c, zb);
    };
    box('partitionGlass', a0, a1, z0, z1, t * 0.4);
    const n = Math.max(1, Math.round((a1 - a0) / 1.2));
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; box('frameBlack', a - 0.025, a + 0.025, z0, z1, t); }
    box('frameBlack', a0, a1, z0, z0 + 0.06, t);
    box('frameBlack', a0, a1, z0 + 2.4, z0 + 2.46, t);
    box('frameBlack', a0, a1, z1 - 0.06, z1, t);
  };
  run('v0', u0, u1); run('v1', u0, u1); run('u0', v0, v1); run('u1', v0, v1);
}

// Двухмаршевая лестница в ядре
function stairCore(b, rect, z0, z1, top) {
  const [u0, v0, u1, v1] = rect;
  const w = u1 - u0, d = v1 - v0;
  const alongV = d >= w;
  const h = z1 - z0;
  const n = Math.max(8, Math.round(h / 0.155));
  const half = Math.ceil(n / 2);
  const rise = h / n;
  const land = 1.4;
  const runLen = (alongV ? d : w) - 2 * land;
  const tread = runLen / half;
  const flightW = ((alongV ? w : d) - 0.3) / 2;
  for (let i = 0; i < n; i++) {
    const firstFlight = i < half;
    const k = firstFlight ? i : i - half;
    const zz = z0 + rise * (i + 1);
    if (alongV) {
      const a = firstFlight ? u0 + 0.1 : u1 - 0.1 - flightW;
      const s0 = firstFlight ? v0 + land + k * tread : v1 - land - (k + 1) * tread;
      b.box('graniteStep', a, s0, zz - rise, a + flightW, s0 + tread, zz);
    } else {
      const a = firstFlight ? v0 + 0.1 : v1 - 0.1 - flightW;
      const s0 = firstFlight ? u0 + land + k * tread : u1 - land - (k + 1) * tread;
      b.box('graniteStep', s0, a, zz - rise, s0 + tread, a + flightW, zz);
    }
  }
  // промежуточная площадка
  const zm = z0 + rise * half;
  if (alongV) b.box('concrete', u0 + 0.1, v1 - land, zm - 0.2, u1 - 0.1, v1 - 0.1, zm);
  else b.box('concrete', u1 - land, v0 + 0.1, zm - 0.2, u1 - 0.1, v1 - 0.1, zm);
}

// ── Кластер: ряды столов ────────────────────────────────────────────────────
function clusterDesks(zn, z, I, b, R) {
  const [u0, v0, u1, v1] = zn.rect;
  const rows = zn.props?.rows ?? 7;
  const facing = zn.props?.facing ?? '-v';
  const alongV = facing.endsWith('v') ? true : false;   // длинная ось столов
  const span = alongV ? u1 - u0 : v1 - v0;               // по этой оси раскладываем ряды
  const depth = alongV ? v1 - v0 : u1 - u0;
  const pitch = Math.min(2.9, (span - 2) / rows);
  const startA = (alongV ? u0 : v0) + (span - pitch * (rows - 1)) / 2;
  const deskLen = Math.min(6.0, depth - 3.0);
  const seats = Math.max(2, Math.round(deskLen / 1.2));
  // стол ближе к окну (к фасаду), оставляем проход с другой стороны
  const winSide = facing.startsWith('-') ? 0 : 1;
  const b0 = alongV ? v0 : u0, b1 = alongV ? v1 : u1;
  const cB = winSide === 0 ? b0 + 1.6 + deskLen / 2 : b1 - 1.6 - deskLen / 2;
  const endMat = `deskEnd:${zn.cluster}`;
  for (let r = 0; r < rows; r++) {
    const a = startA + r * pitch;
    const du = alongV ? 1.5 : deskLen, dv = alongV ? deskLen : 1.5;
    const cu = alongV ? a : cB, cv = alongV ? cB : a;
    // столешница и перегородка
    b.box('deskTop', cu - du / 2, cv - dv / 2, z + 0.72, cu + du / 2, cv + dv / 2, z + 0.755);
    if (alongV) b.box('deskLeg', cu - 0.02, cv - dv / 2 + 0.1, z + 0.755, cu + 0.02, cv + dv / 2 - 0.1, z + 0.9);
    else b.box('deskLeg', cu - du / 2 + 0.1, cv - 0.02, z + 0.755, cu + du / 2 - 0.1, cv + 0.02, z + 0.9);
    // цветные торцы с буквой ряда (атлас текстур)
    for (const end of [-1, 1]) {
      const g = new THREE.BoxGeometry(1.5, 0.72, 0.06);
      const uv = g.attributes.uv;
      const cell = r % ATLAS_CELLS;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (cell + uv.getX(i)) / ATLAS_CELLS);
      const eu = alongV ? cu : cu + end * (du / 2 - 0.03), ev = alongV ? cv + end * (dv / 2 - 0.03) : cv;
      if (alongV && end === 1) g.rotateY(Math.PI);
      if (!alongV) g.rotateY(end === 1 ? Math.PI / 2 : -Math.PI / 2);
      g.translate(sx(eu), sy(z + 0.36), sz(ev));
      b.add(endMat, g);
    }
    // рабочие места: мониторы и кресла с двух сторон
    for (let s = 0; s < seats; s++) {
      const t = -deskLen / 2 + 0.6 + s * (deskLen - 1.2) / Math.max(1, seats - 1);
      for (const side of [-1, 1]) {
        const mu = alongV ? cu + side * 0.38 : cu + t, mv = alongV ? cv + t : cv + side * 0.38;
        // монитор смотрит наружу от оси стола
        const rot = alongV ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? 0 : Math.PI);
        I('monitor', F.monitorGeo, 'monitor').push(mtx(mu, mv, z, rot));
        I('screen', F.screenGeo, 'screenOff').push(mtx(mu, mv, z, rot));
        const chu = alongV ? cu + side * 1.2 : cu + t, chv = alongV ? cv + t : cv + side * 1.2;
        const jitter = (R() - 0.5) * 0.5;
        I('chair', F.chairGeo, 'chairBlack').push(mtx(chu + (alongV ? (R() - 0.5) * 0.15 : 0), chv + (alongV ? 0 : (R() - 0.5) * 0.15), z, rot + Math.PI + jitter));
      }
    }
  }
}

// Ряды линейных светильников под потолком
function ceilingLights(batch, rect, y, key = 'led', pitch = 3.0, angle = 0, avoid = null) {
  const [u0, v0, u1, v1] = rect;
  const alongU = (u1 - u0) >= (v1 - v0);
  const L = 2.8;
  for (let a = (alongU ? v0 : u0) + pitch / 2; a < (alongU ? v1 : u1); a += pitch) {
    for (let s = (alongU ? u0 : v0) + 0.8; s + L < (alongU ? u1 : v1) - 0.3; s += L + 0.9) {
      const [cu, cv] = alongU ? [s + L / 2, a] : [a, s + L / 2];
      if (avoid && cu > avoid[0] && cu < avoid[2] && cv > avoid[1] && cv < avoid[3]) continue;
      const g = F.linearGeo(L);
      if (!alongU) g.rotateY(Math.PI / 2);
      g.translate(sx(cu), sy(y), sz(cv));
      batch.add(key, g);
    }
  }
}

function starLights(batch, rect, y, step = 2.6) {
  for (const [a, c, e, f] of F.starField(rect[0], rect[1], rect[2], rect[3], step)) {
    batch.add('ledCool', F.stripGeo(sx(a), sz(c), sx(e), sz(f), sy(y)));
  }
}

function planterRow(b, I, zn, z) {
  const [u0, v0, u1, v1] = zn.rect;
  if (v0 <= E + 0.05) {
    b.box('planterWood', u0 + 0.8, v0 + 0.3, z, u1 - 0.8, v0 + 1.0, z + 0.55);
    for (let u = u0 + 1.3; u < u1 - 1; u += 1.1) I('plant', () => F.plantGeo(0.9), 'leaf').push(mtx(u, v0 + 0.65, z + 0.2));
  }
  if (u1 >= SIZE - E - 0.05) {
    b.box('planterWood', u1 - 1.0, v0 + 0.8, z, u1 - 0.3, v1 - 0.8, z + 0.55);
    for (let v = v0 + 1.3; v < v1 - 1; v += 1.1) I('plant', () => F.plantGeo(0.9), 'leaf').push(mtx(u1 - 0.65, v, z + 0.2));
  }
}

function lobbySofas(zn, z, I, R) {
  const [u0, v0, u1, v1] = zn.rect;
  const cols = ['#e8641c', '#5cae54', '#8f5bb5', '#e8641c', '#2d9fa6'];
  let k = 0;
  for (let u = u0 + 3; u < u1 - 3; u += 7) for (let v = v0 + 3; v < v1 - 3; v += 6.5) {
    if (u > 45.5 && u < 53.6 && v > 21.6 && v < 28.6) continue; // серверная
    I('sofa', () => F.sofaGeo(2.2), 'fabric').push(mtx(u, v, z, 0.5), '#9a9ea3');
    I('sofa', () => F.sofaGeo(2.2), 'fabric').push(mtx(u + 1.9, v + 1.2, z, -0.6), '#9a9ea3');
    for (let i = 0; i < 3; i++) I('pouf', F.poufGeo, 'fabric').push(mtx(u + 0.4 + i * 0.8, v + 1.6 + (R() - 0.5) * 0.4, z, R()), cols[(k++) % cols.length]);
  }
}

function easels(zn, z, I, R, edge) {
  const [u0, v0, u1, v1] = zn.rect;
  const pts = [];
  if (edge === 'v1') for (let u = u0 + 1.5; u < u1 - 1; u += 2.6) pts.push([u, v1 - 0.9, 0]);
  if (edge === 'u0') for (let v = v0 + 1.2; v < v1 - 1; v += 2.4) pts.push([u0 + 0.9, v, Math.PI / 2]);
  const prints = ['#d9d2c5', '#9fb7c9', '#c9a98f', '#b0c49a', '#c4b3d9'];
  pts.forEach(([u, v, r], i) => {
    I('easel', F.easelGeo, 'easelWood').push(mtx(u, v, z, r));
    I('print', F.printGeo, 'plastic').push(mtx(u, v, z, r), prints[i % prints.length]);
  });
}

function turnstiles(zn, z, I, b) {
  const [u0, v0, u1] = zn.rect;
  const n = 5;
  const step = (u1 - u0) / n;
  for (let i = 0; i < n; i++) {
    const u = u0 + step * (i + 0.5);
    I('turn', F.turnstileGeo, 'stainless').push(mtx(u, v0 + 0.5, z));
    I('turnGlass', F.turnstileGlassGeo, 'partitionGlass').push(mtx(u, v0 + 0.5, z));
  }
  // стойка охраны
  b.box('tableWhite', u1 + 0.3, v0 - 1.2, z, u1 + 1.1, v0 + 0.8, z + 1.1);
}

function serverRoom(zn, z, b) {
  const [u0, v0, u1, v1] = zn.rect;
  for (let row = 0; row < 2; row++) {
    const v = v0 + 1.4 + row * 2.2;
    for (let u = u0 + 0.8; u < u1 - 0.8; u += 0.7) b.box('rack', u, v, z, u + 0.62, v + 1.0, z + 2.1);
  }
  b.box('serverGlass', u0 + 0.05, v0 + 0.05, z + 2.5, u1 - 0.05, v1 - 0.05, z + 2.55);
}

function photoZone(zn, z, b, I) {
  const [u0, v0, u1, v1] = zn.rect;
  b.box('girih', u0, v0, z, u1, v1, z + 3.6);
  // чёрные пирамиды и «21»
  for (const [u, s] of [[u0 + 1.4, 1.6], [u0 + 3.0, 1.1], [u1 - 1.6, 1.4]]) {
    const g = new THREE.ConeGeometry(s * 0.75, s * 1.4, 4);
    g.rotateY(Math.PI / 4);
    g.translate(sx(u), sy(z + s * 0.7), sz(v0 - 1.1));
    b.add('black', g);
  }
  const cell = 0.22;
  const two = ['XXXX.', '....X', '..XX.', '.X...', 'XXXXX'];
  two.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === 'X') b.box('black', u0 + 4.4 + c * cell, v0 - 1.4, z + (5 - r) * cell, u0 + 4.4 + (c + 1) * cell, v0 - 1.0, z + (6 - r) * cell); }));
  for (let r = 0; r < 5; r++) b.box('black', u0 + 5.8, v0 - 1.4, z + r * cell + cell, u0 + 6.0, v0 - 1.0, z + (r + 1) * cell + cell);
}

// ── Лекторий-амфитеатр ──────────────────────────────────────────────────────
function amphitheater(zn, z, zc, b, lights, I) {
  const [u0, v0, u1, v1] = zn.rect;
  const stage = zn.props?.stageZ ?? -2.7;
  const tiers = zn.props?.tiers ?? 5;
  const cu = u1 - 0.6, cv = v0 + 0.6;          // «фокус» веера — угол сцены
  const r0 = 4.4, step = 0.9, th = (z - stage) / (tiers + 1);
  // пол сцены
  b.box('floorTile', u0, v0, stage - 0.3, u1, v1, stage);
  const sector = (ra, rb, zTop, key, a0 = Math.PI / 2, a1 = Math.PI, zBot = stage) => {
    const pts = [];
    const N = 40;
    const clamp = ([u, v]) => [Math.max(u0, Math.min(u1, u)), Math.max(v0, Math.min(v1, v))];
    for (let i = 0; i <= N; i++) { const a = a0 + ((a1 - a0) * i) / N; pts.push(clamp([cu + Math.cos(a) * rb, cv + Math.sin(a) * rb])); }
    for (let i = N; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / N; pts.push(clamp([cu + Math.cos(a) * ra, cv + Math.sin(a) * ra])); }
    const shape = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(sx(u), -sz(v))));
    const g = new THREE.ExtrudeGeometry(shape, { depth: zTop - zBot, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, sy(zBot), 0);
    b.add(key, g);
  };
  for (let k = 0; k < tiers; k++) {
    const ra = r0 + k * step, zt = stage + th * (k + 1);
    sector(ra, ra + step, zt, 'tier');
    // зелёный ковролин на проходе яруса и серые подушки
    sector(ra + 0.45, ra + step - 0.02, zt + 0.01, 'carpetGreen', Math.PI / 2, Math.PI, zt);
    sector(ra + 0.03, ra + 0.5, zt + 0.1, 'cushion', Math.PI / 2 + 0.08, Math.PI * 0.64, zt);
    sector(ra + 0.03, ra + 0.5, zt + 0.1, 'cushion', Math.PI * 0.7, Math.PI * 0.86, zt);
    sector(ra + 0.03, ra + 0.5, zt + 0.1, 'cushion', Math.PI * 0.92, Math.PI - 0.06, zt);
  }
  // галерея на отметке 1 этажа за последним ярусом
  const rg = r0 + tiers * step;
  sector(rg, 40, z, 'floorTile');
  // белые ступени-проходы (радиальные)
  for (const a of [Math.PI * 0.67, Math.PI * 0.89]) {
    for (let k = 0; k <= tiers; k++) {
      const ra = r0 + (k - 1) * step, zt = stage + th * k;
      const g = new THREE.BoxGeometry(1.1, 0.02, step);
      const rr = ra + step * 0.5;
      g.rotateY(a + Math.PI / 2);
      g.translate(sx(cu + Math.cos(a) * rr), sy(zt + th * 0.5 + 0.01), sz(cv + Math.sin(a) * rr));
      if (k > 0) b.add('aisle', g);
      const st = new THREE.BoxGeometry(1.1, th * 0.5, step * 0.5);
      st.rotateY(a + Math.PI / 2);
      st.translate(sx(cu + Math.cos(a) * (ra + step * 0.25)), sy(zt + th * 0.25), sz(cv + Math.sin(a) * (ra + step * 0.25)));
      if (k > 0) b.add('aisle', st);
    }
  }
  // мятный парапет по краю галереи
  const N = 28;
  for (let i = 0; i < N; i++) {
    const a = Math.PI / 2 + (Math.PI / 2) * (i + 0.5) / N;
    if (Math.abs(a - Math.PI * 0.67) < 0.05 || Math.abs(a - Math.PI * 0.89) < 0.05) continue;
    const rr = rg + 0.1, seg = (Math.PI / 2) * rg / N;
    const pu = cu + Math.cos(a) * rr, pv = cv + Math.sin(a) * rr;
    if (pu < u0 || pv > v1) continue;
    const g = new THREE.BoxGeometry(seg + 0.02, 1.0, 0.14);
    g.rotateY(a + Math.PI / 2);
    g.translate(sx(pu), sy(z + 0.5), sz(pv));
    b.add('railMint', g);
  }
  // розовые стены вокруг, белый короб поверху
  const wz1 = zc;
  b.box('wallPink', u0, v0, stage, u1, v0 + 0.15, wz1 - 0.7);   // ЮВ — экранная стена
  b.box('wallPink', u1 - 0.15, v0, stage, u1, v1, wz1 - 0.7);   // СВ
  b.box('wallPink', u0, v1 - 0.15, stage, u1, v1, z + 1.9);     // СЗ — под площадкой
  b.box('wallWhite', u0, v0, wz1 - 0.7, u1, v0 + 0.5, wz1);
  b.box('wallWhite', u1 - 0.5, v0, wz1 - 0.7, u1, v1, wz1);
  // экран, трибуна, колонки
  b.box('slide', u1 - 7.8, v0 + 0.16, stage + 1.6, u1 - 3.6, v0 + 0.2, stage + 4.0);
  b.box('black', u1 - 3.2, v0 + 0.16, stage + 1.9, u1 - 2.95, v0 + 0.34, stage + 3.1);
  b.box('black', u1 - 8.45, v0 + 0.16, stage + 1.9, u1 - 8.2, v0 + 0.34, stage + 3.1);
  b.box('black', u1 - 2.4, v0 + 1.8, stage, u1 - 1.8, v0 + 2.3, stage + 1.1);
  // кольцевые светильники
  const ring = F.ringGeo(0.45);
  for (const [du, dv] of [[-3, 2.5], [-6, 2.5], [-9, 3.2], [-3, 5.5], [-6, 6], [-9, 7], [-11.5, 4.5], [-4.5, 8.8]]) {
    const g = ring.clone();
    g.translate(sx(u1 + du), sy(zc - 0.9), sz(v0 + dv));
    lights.add('led', g);
  }
}

// Сиреневая парадная лестница 1 эт. → парящая площадка
function grandStair(zn, b) {
  const [u0, v0, u1, v1] = zn.rect;
  const from = zn.props?.from ?? 0, to = zn.props?.to ?? 2.25;
  const n = Math.round((to - from) / 0.15);
  const run = (v1 - v0) / n;
  for (let i = 0; i < n; i++) {
    b.box('graniteStep', u0 + 0.25, v0 + i * run, from, u1 - 0.25, v0 + (i + 1) * run + 0.02, from + (to - from) * (i + 1) / n);
  }
  // сплошные сиреневые парапеты с поручнем
  for (const u of [u0, u1 - 0.25]) {
    const g = new THREE.BoxGeometry(0.25, 1.1, v1 - v0);
    const ang = Math.atan2(to - from, v1 - v0);
    g.rotateX(ang);
    g.translate(sx(u + 0.125), sy((from + to) / 2 + 0.55), sz((v0 + v1) / 2));
    b.add('railLilac', g);
    b.box('railLilac', u, v0 - 0.6, from, u + 0.25, v0 + 0.05, from + 1.1);
    railing(b, [u + 0.125, v0, from + 1.15], [u + 0.125, v1, to + 1.15], { step: 1.0 });
  }
}

// Парящая площадка: портреты, статуя, мешки, звёзды, парапеты галереи
function platform(zn, z, zc, b, lights, I, mats) {
  const [u0, v0, u1, v1] = zn.rect;
  const galleryZ = 4.5;
  // стены по периметру (под галереей 2 этажа) + сиреневый пояс-парапет
  const t = 0.18;
  const edges = [
    ['v0', u0, v0, u1, v0 + t], ['v1', u0, v1 - t, u1, v1],
    ['u0', u0, v0, u0 + t, v1], ['u1', u1 - t, v0, u1, v1],
  ];
  for (const [k, a, c, e, f] of edges) {
    if (k === 'v0') {
      // сторона к амфитеатру: стеклянное ограждение (проём — под сиреневую лестницу)
      const gap = 4.2;
      b.box('partitionGlass', a + gap, c - 0.05, z, e, f - 0.1, z + 1.1);
      b.box('stainless', a + gap, c - 0.07, z + 1.08, e, f - 0.08, z + 1.13);
    } else {
      b.box('wallWhite', a, c, z, e, f, galleryZ - 0.35);
    }
    b.box('railLilac', a, c, galleryZ - 0.35, e, f, galleryZ);
  }
  // проём сиреневой лестницы с 1 этажа
  // портреты учёных на стенах
  let k = 0;
  for (let u = u0 + 1.2; u < u1 - 1.5; u += 2.6) {
    b.box(`portrait:${k++ % 8}`, u, v1 - t - 0.04, z + 1.1, u + 1.6, v1 - t - 0.01, z + 2.1);
  }
  for (let v = v0 + 2.5; v < v1 - 1.5; v += 2.6) {
    const g1 = new THREE.BoxGeometry(0.03, 1.0, 1.6); g1.translate(sx(u0 + t + 0.02), sy(z + 1.6), sz(v + 0.8));
    b.add(`portrait:${k++ % 8}`, g1);
    const g2 = new THREE.BoxGeometry(0.03, 1.0, 1.6); g2.rotateY(Math.PI); g2.translate(sx(u1 - t - 0.02), sy(z + 1.6), sz(v + 0.8));
    b.add(`portrait:${k++ % 8}`, g2);
  }
  // статуя
  I('statue', F.statueGeo, 'marble').push(mtx((u0 + u1) / 2 + 3.2, v1 - 1.4, z, Math.PI));
  // кресла-мешки
  const cols = ['#f08bb8', '#63b84e', '#f2d64b', '#2f6fd1', '#23a39a', '#8ad0f0'];
  const r = rng(99);
  for (let i = 0; i < 22; i++) {
    const cu = u0 + 3 + r() * (u1 - u0 - 6), cv = v0 + 5 + r() * (v1 - v0 - 9);
    if (Math.abs(cu - 21.6) < 1.5 && cv > 30) continue;
    I('beanbag', F.beanbagGeo, 'fabric').push(mtx(cu, cv, z, r() * 6.28), cols[i % cols.length]);
  }
  // мольберты с фото старой библиотеки
  I('easel', F.easelGeo, 'easelWood').push(mtx(u0 + 1.6, v0 + 1.8, z, 0.6));
  I('print', F.printGeo, 'plastic').push(mtx(u0 + 1.6, v0 + 1.8, z, 0.6), '#8a5a3a');
  // поле светильников-звёзд
  starLights(lights, [u0 + 0.5, v0 + 0.5, u1 - 0.5, v1 - 0.5], zc - 1.1, 2.55);
  // подвесы звёзд
  for (let u = u0 + 2; u < u1; u += 4) for (let v = v0 + 2; v < v1; v += 4) lights.add('black', new THREE.CylinderGeometry(0.004, 0.004, 1.1, 3).translate(sx(u), sy(zc - 0.55), sz(v)));
}

// Кромка второго света на 2 этаже: сиреневый парапет + синие банкетки
function voidEdge(zn, z, b, I) {
  const [u0, v0, u1, v1] = zn.rect;
  const cols = '#1d63b8';
  const stairs = ATRIUM_STAIRS;
  for (const [k, a, c] of [['v0', u0, u1], ['v1', u0, u1], ['u0', v0, v1], ['u1', v0, v1]]) {
    // проёмы для маршей на площадку
    const gaps = k === 'v1' ? stairs.map((s) => [s.u0, s.u1]) : [];
    let cur = a;
    const pieces = [];
    for (const [g0, g1] of gaps.sort((p, q) => p[0] - q[0])) { pieces.push([cur, g0]); cur = g1; }
    pieces.push([cur, c]);
    for (const [p0, p1] of pieces) {
      if (p1 - p0 < 0.1) continue;
      if (k === 'v0') { b.box('railLilac', p0, v0 - 0.2, z, p1, v0, z + 1.0); railing(b, [p0, v0 - 0.1, z + 1.05], [p1, v0 - 0.1, z + 1.05], { step: 2 }); }
      if (k === 'v1') { b.box('railLilac', p0, v1, z, p1, v1 + 0.2, z + 1.0); railing(b, [p0, v1 + 0.1, z + 1.05], [p1, v1 + 0.1, z + 1.05], { step: 2 }); }
      if (k === 'u0') { b.box('railLilac', u0 - 0.2, p0, z, u0, p1, z + 1.0); railing(b, [u0 - 0.1, p0, z + 1.05], [u0 - 0.1, p1, z + 1.05], { step: 2 }); }
      if (k === 'u1') { b.box('railLilac', u1, p0, z, u1 + 0.2, p1, z + 1.0); railing(b, [u1 + 0.1, p0, z + 1.05], [u1 + 0.1, p1, z + 1.05], { step: 2 }); }
    }
  }
  // синие банкетки вдоль парапета
  for (let u = u0 + 1.5; u < u1 - 2; u += 3.4) {
    I('bench', () => F.benchGeo(2.4, 0.6), 'fabric').push(mtx(u + 1.2, v0 - 0.6, z), cols);
  }
  for (let v = v0 + 1.5; v < v1 - 2; v += 3.4) {
    I('bench', () => F.benchGeo(2.4, 0.6), 'fabric').push(mtx(u1 + 0.6, v + 1.2, z, Math.PI / 2), cols);
    I('bench', () => F.benchGeo(2.4, 0.6), 'fabric').push(mtx(u0 - 0.6, v + 1.2, z, Math.PI / 2), cols);
  }
}

// Марш с галереи на площадку (сиреневые щёки, как на фото)
function atriumStair(s, b) {
  const n = Math.round((s.zTop - s.zBottom) / 0.15);
  const run = (s.vTop - s.vBottom) / n;
  for (let i = 0; i < n; i++) {
    const va = s.vBottom + i * run;
    b.box('graniteStep', s.u0, va, s.zBottom, s.u1, va + run + 0.02, s.zBottom + (s.zTop - s.zBottom) * ((i + 1) / n));
  }
  const ang = Math.atan2(s.zTop - s.zBottom, s.vTop - s.vBottom);
  for (const u of [s.u0 - 0.2, s.u1]) {
    const g = new THREE.BoxGeometry(0.2, 1.1, s.vTop - s.vBottom);
    g.rotateX(ang);
    g.translate(sx(u + 0.1), sy((s.zTop + s.zBottom) / 2 + 0.55), sz((s.vTop + s.vBottom) / 2));
    b.add('railLilac', g);
    railing(b, [u + 0.1, s.vBottom, s.zBottom + 1.15], [u + 0.1, s.vTop, s.zTop + 1.15], { step: 1.2 });
  }
}

// ── Лаунж под пирамидой (3 этаж) ────────────────────────────────────────────
function lounge(zn, z, b, I, R) {
  const [u0, v0, u1, v1] = zn.rect;
  const pod = zn.props?.podium ?? 0.45;
  // подиум со ступенями по периметру
  for (let s = 0; s < 3; s++) {
    const inset = s * 0.4;
    b.box('floorWood', u0 + inset, v0 + inset, z, u1 - inset, v1 - inset, z + pod * (s + 1) / 3);
  }
  b.box('graniteStep', u0 - 0.02, v0 - 0.02, z, u1 + 0.02, v0 + 0.02, z + pod / 3);
  // деревянные кашпо с зеленью по периметру подиума
  const top = z + pod;
  const plant = () => F.plantGeo(0.8);
  const planter = (a, c, e, f) => {
    b.box('planterWood', a, c, top, e, f, top + 0.9);
    const long = (e - a) > (f - c);
    const n = Math.floor((long ? e - a : f - c) / 0.7);
    for (let i = 0; i < n; i++) {
      const pu = long ? a + 0.35 + i * 0.7 : (a + e) / 2, pv = long ? (c + f) / 2 : c + 0.35 + i * 0.7;
      I('plantL', plant, i % 3 ? 'leaf' : 'leafDark').push(mtx(pu, pv, top + 0.6, R() * 6));
    }
  };
  planter(u0 + 1.4, v1 - 2.2, u0 + 7.4, v1 - 1.4);
  planter(u1 - 7.4, v1 - 2.2, u1 - 1.4, v1 - 1.4);
  planter(u0 + 1.4, v0 + 1.4, u0 + 2.2, v0 + 7.4);
  planter(u1 - 2.2, v0 + 1.4, u1 - 1.4, v0 + 7.4);
  planter(u0 + 1.4, v1 - 7.4, u0 + 2.2, v1 - 2.6);
  planter(u1 - 2.2, v1 - 7.4, u1 - 1.4, v1 - 2.6);
  planter((u0 + u1) / 2 - 3, (v0 + v1) / 2 + 1.2, (u0 + u1) / 2 + 3, (v0 + v1) / 2 + 2.0);
  // модульные диваны и белые ступенчатые столики
  const cols = ['#8e9296', '#b3263a', '#1f5e4a', '#8e9296', '#2a8f8f', '#e8641c', '#8e9296'];
  let k = 0;
  for (let u = u0 + 4; u < u1 - 3; u += 5.2) for (let v = v0 + 4; v < v1 - 4; v += 5.0) {
    if (Math.abs(u - (u0 + u1) / 2) < 3.5 && Math.abs(v - ((v0 + v1) / 2 + 1.6)) < 1.8) continue;
    I('sofaL', () => F.sofaGeo(2.0), 'fabric').push(mtx(u, v, top, 0), cols[k++ % cols.length]);
    I('sofaL', () => F.sofaGeo(2.0), 'fabric').push(mtx(u + 1.4, v + 1.5, top, Math.PI / 2), cols[k++ % cols.length]);
    b.box('tableWhite', u - 0.4, v + 0.8, top, u + 0.9, v + 1.9, top + 0.38);
    b.box('tableWhite', u - 0.1, v + 1.1, top + 0.38, u + 0.6, v + 1.6, top + 0.62);
  }
}

function kitchen(zn, z, b, I, R) {
  const [u0, v0, u1, v1] = zn.rect;
  // кухонная линия вдоль внутренней стены
  const inner = onFacade(u1) ? 'u0' : 'u1';
  const cu = inner === 'u0' ? u0 + 0.8 : u1 - 0.8;
  b.box('tableWhite', cu - 0.35, v0 + 1.2, z, cu + 0.35, v1 - 1.6, z + 0.9);
  b.box('graniteStep', cu - 0.36, v0 + 1.2, z + 0.9, cu + 0.36, v1 - 1.6, z + 0.94);
  for (let v = v1 - 1.5; v < v1 - 0.2; v += 0.75) b.box('stainless', cu - 0.35, v, z, cu + 0.35, v + 0.7, z + 1.95);
  // мурал на стене
  const muralU = inner === 'u0' ? u0 + 0.13 : u1 - 0.13;
  const g = new THREE.BoxGeometry(0.02, 2.2, Math.min(8, v1 - v0 - 2));
  g.translate(sx(muralU), sy(z + 2.2), sz((v0 + v1) / 2));
  b.add('ceramicMural', g);
  // столы с белыми стульями
  const tu0 = inner === 'u0' ? u0 + 2.2 : u0 + 1.2, tu1 = inner === 'u0' ? u1 - 1.2 : u1 - 2.2;
  for (let u = tu0 + 0.8; u < tu1 - 0.8; u += 2.4) for (let v = v0 + 1.4; v < v1 - 1.2; v += 2.2) {
    b.box('tableOrange', u - 0.7, v - 0.4, z + 0.72, u + 0.7, v + 0.4, z + 0.76);
    b.box('deskLeg', u - 0.03, v - 0.03, z, u + 0.03, v + 0.03, z + 0.72);
    for (const [du, dv, r] of [[-0.35, -0.7, 0], [0.35, -0.7, 0], [-0.35, 0.7, Math.PI], [0.35, 0.7, Math.PI]]) {
      I('pchair', F.plasticChairGeo, 'chairWhite').push(mtx(u + du, v + dv, z, r + (R() - 0.5) * 0.3));
    }
  }
  // кулер
  b.box('tableWhite', cu - 0.2, v0 + 0.5, z, cu + 0.2, v0 + 0.85, z + 1.0);
  b.box('glassSlot', cu - 0.16, v0 + 0.52, z + 1.0, cu + 0.16, v0 + 0.83, z + 1.45);
}

function meeting(zn, z, b, I) {
  const [u0, v0, u1, v1] = zn.rect;
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  const alongU = (u1 - u0) >= (v1 - v0);
  const L = Math.max(1.6, Math.min(4.2, (alongU ? u1 - u0 : v1 - v0) - 2.2));
  const du = alongU ? L : 1.1, dv = alongU ? 1.1 : L;
  b.box('tableWhite', cu - du / 2, cv - dv / 2, z + 0.73, cu + du / 2, cv + dv / 2, z + 0.77);
  b.box('deskLeg', cu - du / 2 + 0.2, cv - 0.05, z, cu - du / 2 + 0.3, cv + 0.05, z + 0.73);
  b.box('deskLeg', cu + du / 2 - 0.3, cv - 0.05, z, cu + du / 2 - 0.2, cv + 0.05, z + 0.73);
  const n = Math.max(1, Math.floor(L / 0.9));
  for (let i = 0; i < n; i++) {
    const t = -L / 2 + 0.45 + (i * (L - 0.9)) / Math.max(1, n - 1);
    for (const s of [-1, 1]) {
      const [pu, pv] = alongU ? [cu + t, cv + s * 0.85] : [cu + s * 0.85, cv + t];
      const rot = alongU ? (s > 0 ? Math.PI : 0) : (s > 0 ? Math.PI / 2 : -Math.PI / 2);
      I('chair', F.chairGeo, 'chairBlack').push(mtx(pu, pv, z, rot));
    }
  }
}

function conference(zn, z, b, I) {
  const [u0, v0, u1, v1] = zn.rect;
  // сцена и экран у дальней стены (v1)
  b.box('slide', (u0 + u1) / 2 - 3.5, v1 - 0.2, z + 0.9, (u0 + u1) / 2 + 3.5, v1 - 0.16, z + 4.0);
  b.box('tvScreen', u0 + 2.5, v1 - 0.22, z + 2.0, u0 + 4.5, v1 - 0.16, z + 3.1);
  b.box('tvScreen', u1 - 4.5, v1 - 0.22, z + 2.0, u1 - 2.5, v1 - 0.16, z + 3.1);
  b.box('pixelMural', u1 - 0.16, v0 + 1, z, u1 - 0.12, v1 - 1, z + 3.8);
  b.box('black', (u0 + u1) / 2 + 4.4, v1 - 2.2, z, (u0 + u1) / 2 + 5.0, v1 - 1.7, z + 1.15);
  for (let v = v1 - 4.2; v > v0 + 1.5; v -= 1.0) for (let u = u0 + 2; u < u1 - 2; u += 0.62) {
    if (Math.abs(u - (u0 + u1) / 2) < 0.9) continue;
    I('pchair', F.plasticChairGeo, 'chairWhite').push(mtx(u, v, z, 0));
  }
}

function game(zn, z, b, I, R) {
  const [u0, v0, u1, v1] = zn.rect;
  b.box('pixelMural', u0 + 0.13, v0 + 0.5, z + 0.3, u0 + 0.17, v1 - 0.5, z + 3.2);
  b.box('tableWhite', u0 + 0.4, v0 + 1.5, z, u0 + 0.9, v1 - 1.5, z + 0.45);
  b.box('tvScreen', u0 + 0.5, (v0 + v1) / 2 - 1.1, z + 0.9, u0 + 0.56, (v0 + v1) / 2 + 1.1, z + 2.15);
  const cols = ['#2fa84f', '#1f63d1', '#2fa84f', '#1f63d1'];
  for (let i = 0; i < 4; i++) I('beanbag', F.beanbagGeo, 'fabric').push(mtx(u0 + 3 + (i % 2) * 1.2, v0 + 2 + i * 1.2, z, -Math.PI / 2 + (R() - 0.5)), cols[i]);
}

function pingpong(zn, z, b, I) {
  const [u0, v0, u1, v1] = zn.rect;
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  b.box('pingpong', cu - 1.37, cv - 0.76, z + 0.72, cu + 1.37, cv + 0.76, z + 0.76);
  b.box('tableWhite', cu - 1.37, cv - 0.01, z + 0.76, cu + 1.37, cv + 0.01, z + 0.765);
  b.box('tableWhite', cu - 0.01, cv - 0.8, z + 0.76, cu + 0.01, cv + 0.8, z + 0.92);
  for (const [du, dv] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) b.box('deskLeg', cu + du - 0.03, cv + dv - 0.03, z, cu + du + 0.03, cv + dv + 0.03, z + 0.72);
  // салатовые стеновые панели
  const wallU = onFacade(u0) ? u1 - 0.14 : u0 + 0.12;
  b.box('wallLime', wallU, v0 + 0.6, z, wallU + 0.02, v1 - 0.6, z + 2.4);
  const cols = ['#f08bb8', '#2f6fd1', '#63b84e'];
  cols.forEach((c, i) => I('beanbag', F.beanbagGeo, 'fabric').push(mtx(wallU + (onFacade(u0) ? -0.9 : 0.9), v0 + 2 + i * 1.3, z, Math.PI / 2), c));
}

function library(zn, z, zc, b, I, basement) {
  const [u0, v0, u1, v1] = zn.rect;
  const pitch = basement ? 1.6 : 2.4;
  for (let v = v0 + 1.2; v < v1 - 1.2; v += pitch) {
    for (let u = u0 + 1.5; u < u1 - 1.5; u += 5.4) {
      b.box('books', u, v, z, u + 4.8, v + 0.4, z + (basement ? 2.4 : 2.0));
      b.box('shelf', u - 0.03, v - 0.03, z + (basement ? 2.4 : 2.0), u + 4.83, v + 0.43, z + (basement ? 2.44 : 2.05));
    }
  }
  if (!basement) for (let u = u0 + 3; u < u1 - 3; u += 6) b.box('tableWhite', u, v1 - 3.6, z + 0.74, u + 2.4, v1 - 2.6, z + 0.78);
}

function office(zn, z, I) {
  const [u0, v0, u1, v1] = zn.rect;
  for (let u = u0 + 1.5; u < u1 - 1.5; u += 3.0) for (let v = v0 + 1.5; v < v1 - 1.5; v += 3.2) {
    I('odesk', () => new THREE.BoxGeometry(1.6, 0.04, 0.8).translate(0, 0.74, 0), 'tableWhite').push(mtx(u, v, z));
    I('monitor', F.monitorGeo, 'monitor').push(mtx(u, v - 0.1, z, 0));
    I('chair', F.chairGeo, 'chairBlack').push(mtx(u, v + 0.7, z, Math.PI));
  }
}

function wardrobe(zn, z, b) {
  const [u0, v0, u1, v1] = zn.rect;
  for (let v = v0 + 1.2; v < v1 - 1; v += 1.6) {
    b.box('frameBlack', u0 + 0.8, v, z + 1.7, u1 - 0.8, v + 0.05, z + 1.76);
    for (let u = u0 + 0.8; u <= u1 - 0.8; u += (u1 - u0 - 1.6) / 3) b.box('frameBlack', u - 0.03, v - 0.25, z, u + 0.03, v + 0.3, z + 1.8);
  }
}

// Невидимая плашка для выбора зоны кликом
const pickMat = new THREE.MeshBasicMaterial({ color: 0x19c2a6, transparent: true, opacity: 0.0, depthWrite: false });
function pickBox(pick, mats, root, zn, z) {
  const [u0, v0, u1, v1] = zn.rect;
  const g = new THREE.BoxGeometry(u1 - u0 - 0.1, 0.06, v1 - v0 - 0.1);
  g.translate(sx((u0 + u1) / 2), sy(z + 0.04), sz((v0 + v1) / 2));
  const m = new THREE.Mesh(g, pickMat.clone());
  m.name = `pick:${zn.id}`;
  m.userData.zone = zn.id;
  m.userData.confidence = zn.confidence;
  m.renderOrder = 5;
  root.add(m);
  pick.push(m);
}
