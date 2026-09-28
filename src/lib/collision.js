// Физический мир прогулки: вся статическая геометрия сцены → один BVH (three-mesh-bvh).
// Строится из того, что реально лежит в сцене (участок, фасады, этажи, любые новые группы),
// поэтому не привязан к конкретным комнатам: после правок в редакторе достаточно пересобрать.
//
// Контракт для тех, кто строит геометрию:
//  • userData.noCollide = true (на меше или любом предке) — объект не мешает ходить;
//  • userData.collide = true | 'mesh' | 'box' — принудительно сделать препятствием
//    ('box' — по габаритной коробке, для тяжёлых инстансов);
//  • всё, что есть в сцене (любые новые группы тоже), — препятствие, кроме: материалов led*, skyGlass,
//    glassDoor, невидимых плашек pick:*, групп lights-*, тросов/колец фонаря, неба и оверлеев;
//  • проёмы (двери, проходы) должны быть реальными дырами шириной ≥ 0,8 м: капсула игрока 0,56 м.
import * as THREE from 'three';

let MeshBVHClass = null;
async function loadBVH() {
  if (!MeshBVHClass) ({ MeshBVH: MeshBVHClass } = await import('three-mesh-bvh'));
  return MeshBVHClass;
}

const SKIP_MAT = /^(led|ledCool|ledWarm|skyGlass|glassDoor)$/;
const SKIP_NODE = /^(pick:|lights-|skylight-cables|skylight-rings|confidence-overlay)|^sky$/;
// инстансы-мелочь: стулья, мониторы, растения, створки турникетов, кроны деревьев…
const SKIP_INST = /(^|:)(chair|pchair|monitor|screen|keyboard|print|plant|plantL|plantB|palm|turnGlass|lavender|faceScreen|rollupPrint)$|^(tree-crown|car-glass|car-wheels)/;
const PROXY_TRIS = 48;                  // инстанс тяжелее — коллизия по габаритной коробке

const matName = (m) => (m?.name || '').split('@')[0];
const triCount = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3;

function colliderMode(o) {
  const force = o.userData.collide;
  if (force === 'box' || force === 'mesh') return force;
  if (force !== true) {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const solid = mats.some((m) => m && m.visible !== false && !m.userData?.noCollide && !SKIP_MAT.test(matName(m)) && !(m.transparent && m.opacity === 0));
    if (!solid) return null;
    if (o.isInstancedMesh && SKIP_INST.test(o.name || '')) return null;
  }
  if (o.isInstancedMesh) return triCount(o.geometry) > PROXY_TRIS ? 'box' : 'mesh';
  return 'mesh';
}

function visit(obj, fn) {
  if (obj.userData?.noCollide) return;
  if (SKIP_NODE.test(obj.name || '')) return;
  if (obj.isMesh && !obj.isSkinnedMesh) fn(obj);
  for (const c of obj.children) visit(c, fn);
}

// ── Сток треугольников: растущий Float32Array ─────────────────────────────────
class Sink {
  constructor(n = 1 << 18) { this.a = new Float32Array(n); this.n = 0; }
  need(k) {
    if (this.n + k <= this.a.length) return;
    const b = new Float32Array(Math.max(this.a.length * 2, this.n + k));
    b.set(this.a.subarray(0, this.n)); this.a = b;
  }
  tri(ax, ay, az, bx, by, bz, cx, cy, cz) {
    this.need(9);
    const a = this.a; let i = this.n;
    a[i++] = ax; a[i++] = ay; a[i++] = az; a[i++] = bx; a[i++] = by; a[i++] = bz; a[i++] = cx; a[i++] = cy; a[i++] = cz;
    this.n = i;
  }
  result() { return this.a.slice(0, this.n); }
}

// ── Вырезание коробки из треугольника (Сазерленд — Ходжман по 6 плоскостям) ──
function clipPoly(poly, ax, val, keepGreater) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const pin = keepGreater ? p[ax] >= val : p[ax] <= val;
    const qin = keepGreater ? q[ax] >= val : q[ax] <= val;
    if (pin) out.push(p);
    if (pin !== qin) {
      const t = (val - p[ax]) / (q[ax] - p[ax]);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
    }
  }
  return out;
}
// Части многоугольника снаружи коробки b = [x0,y0,z0,x1,y1,z1]
function subtractBox(poly, b) {
  const out = [];
  let rest = poly;
  const planes = [[0, b[0], false], [0, b[3], true], [1, b[1], false], [1, b[4], true], [2, b[2], false], [2, b[5], true]];
  for (const [ax, val, beyondIsGreater] of planes) {
    const outside = clipPoly(rest, ax, val, beyondIsGreater);
    if (outside.length >= 3) out.push(outside);
    rest = clipPoly(rest, ax, val, !beyondIsGreater);
    if (rest.length < 3) return out;
  }
  return out;
}
const polyHitsBox = (p, b) => {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const q of p) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; if (q[2] < z0) z0 = q[2]; if (q[2] > z1) z1 = q[2]; }
  return !(x1 <= b[0] || x0 >= b[3] || y1 <= b[1] || y0 >= b[4] || z1 <= b[2] || z0 >= b[5]);
};
const polyArea2 = (p) => {
  let x = 0, y = 0, z = 0;
  for (let i = 1; i + 1 < p.length; i++) {
    const ux = p[i][0] - p[0][0], uy = p[i][1] - p[0][1], uz = p[i][2] - p[0][2];
    const vx = p[i + 1][0] - p[0][0], vy = p[i + 1][1] - p[0][1], vz = p[i + 1][2] - p[0][2];
    x += uy * vz - uz * vy; y += uz * vx - ux * vz; z += ux * vy - uy * vx;
  }
  return Math.hypot(x, y, z);
};

// ── Сбор треугольников сцены ─────────────────────────────────────────────────
// cutouts: [{ box:[x0,y0,z0,x1,y1,z1], mat?:RegExp, keepInside?:[x0,z0,x1,z1], hits:0 }] —
// «проёмы», которые геометрия ещё не прорезала: треугольники внутри коробки выбрасываются.
function collect(roots, cutouts, stats) {
  const sink = new Sink();
  const m4 = new THREE.Matrix4(), im = new THREE.Matrix4();
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
  const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  const BOX_TRIS = [0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3];
  let active = null;   // проёмы, касающиеся текущего меша

  const emit = (a, b, c, name) => {
    if (active) {
      const minx = Math.min(a.x, b.x, c.x), maxx = Math.max(a.x, b.x, c.x);
      const miny = Math.min(a.y, b.y, c.y), maxy = Math.max(a.y, b.y, c.y);
      const minz = Math.min(a.z, b.z, c.z), maxz = Math.max(a.z, b.z, c.z);
      let polys = null;
      for (const cut of active) {
        const x = cut.box;
        if (maxx <= x[0] || minx >= x[3] || maxy <= x[1] || miny >= x[4] || maxz <= x[2] || minz >= x[5]) continue;
        if (cut.mat && !cut.mat.test(name)) continue;
        const k = cut.keepInside;
        if (k && minx >= k[0] - 0.05 && maxx <= k[2] + 0.05 && minz >= k[1] - 0.05 && maxz <= k[3] + 0.05) continue;
        polys ??= [[[a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z]]];
        const next = [];
        for (const p of polys) { if (polyHitsBox(p, x)) next.push(...subtractBox(p, x)); else next.push(p); }
        polys = next;
        cut.hits++;
      }
      if (polys) {
        for (const p of polys) {
          if (polyArea2(p) < 1e-7) continue;
          for (let i = 1; i + 1 < p.length; i++) sink.tri(...p[0], ...p[i], ...p[i + 1]);
        }
        return;
      }
    }
    sink.tri(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };

  const meshTris = (geo, mat, name) => {
    const pos = geo.attributes.position, idx = geo.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < n; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      va.fromBufferAttribute(pos, ia).applyMatrix4(mat);
      vb.fromBufferAttribute(pos, ib).applyMatrix4(mat);
      vc.fromBufferAttribute(pos, ic).applyMatrix4(mat);
      emit(va, vb, vc, name);
    }
  };
  const boxTris = (bb, mat, name) => {
    for (let i = 0; i < 8; i++) corners[i].set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(mat);
    for (let i = 0; i < BOX_TRIS.length; i += 3) emit(corners[BOX_TRIS[i]], corners[BOX_TRIS[i + 1]], corners[BOX_TRIS[i + 2]], name);
  };

  for (const root of roots) {
    if (!root) continue;
    root.updateMatrixWorld(true);
    visit(root, (o) => {
      const mode = colliderMode(o);
      if (!mode) { stats.skipped++; return; }
      const geo = o.geometry;
      if (!geo?.attributes?.position) return;
      const name = matName(Array.isArray(o.material) ? o.material[0] : o.material);
      if (!geo.boundingBox) geo.computeBoundingBox();
      // проёмы, которые могут задеть этот меш
      active = null;
      if (cutouts.length) {
        const wb = new THREE.Box3().copy(geo.boundingBox);
        if (o.isInstancedMesh) { o.computeBoundingBox?.(); if (o.boundingBox) wb.copy(o.boundingBox); }
        wb.applyMatrix4(o.matrixWorld);
        for (const cut of cutouts) {
          const x = cut.box;
          if (wb.max.x <= x[0] || wb.min.x >= x[3] || wb.max.y <= x[1] || wb.min.y >= x[4] || wb.max.z <= x[2] || wb.min.z >= x[5]) continue;
          (active ??= []).push(cut);
        }
      }
      if (o.isInstancedMesh) {
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, im);
          m4.multiplyMatrices(o.matrixWorld, im);
          if (mode === 'box') boxTris(geo.boundingBox, m4, name); else meshTris(geo, m4, name);
        }
        stats.instanced++;
      } else {
        meshTris(geo, o.matrixWorld, name);
        stats.meshes++;
      }
    });
  }
  active = null;
  return sink.result();
}

// Треугольники, задевающие прямоугольники rects [x0,z0,x1,z1] в плане
function pickTris(pos, rects) {
  const out = new Sink(1 << 14);
  for (let i = 0; i < pos.length; i += 9) {
    const minx = Math.min(pos[i], pos[i + 3], pos[i + 6]), maxx = Math.max(pos[i], pos[i + 3], pos[i + 6]);
    const minz = Math.min(pos[i + 2], pos[i + 5], pos[i + 8]), maxz = Math.max(pos[i + 2], pos[i + 5], pos[i + 8]);
    for (const r of rects) {
      if (maxx < r[0] || minx > r[2] || maxz < r[1] || minz > r[3]) continue;
      out.tri(pos[i], pos[i + 1], pos[i + 2], pos[i + 3], pos[i + 4], pos[i + 5], pos[i + 6], pos[i + 7], pos[i + 8]);
      break;
    }
  }
  return out.result();
}
// Применить вырезы к готовому массиву треугольников (без фильтра по материалу).
// Вырезы сгруппированы (по лестничным ядрам): сначала грубая проверка по габариту группы.
function cutArray(pos, cuts) {
  const groups = new Map();
  for (const c of cuts) {
    const key = c.keepInside ? c.keepInside.join(',') : 'free';
    let g = groups.get(key);
    if (!g) groups.set(key, g = { box: [...c.box], cuts: [] });
    const b = g.box;
    for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], c.box[k]); b[k + 3] = Math.max(b[k + 3], c.box[k + 3]); }
    g.cuts.push(c);
  }
  const G = [...groups.values()];
  const out = new Sink(pos.length + 4096);
  for (let i = 0; i < pos.length; i += 9) {
    const ax = pos[i], ay = pos[i + 1], az = pos[i + 2], bx = pos[i + 3], by = pos[i + 4], bz = pos[i + 5], cx = pos[i + 6], cy = pos[i + 7], cz = pos[i + 8];
    const minx = Math.min(ax, bx, cx), maxx = Math.max(ax, bx, cx), miny = Math.min(ay, by, cy), maxy = Math.max(ay, by, cy);
    const minz = Math.min(az, bz, cz), maxz = Math.max(az, bz, cz);
    let polys = null;
    for (const g of G) {
      const gb = g.box, k = g.cuts[0].keepInside;
      if (maxx <= gb[0] || minx >= gb[3] || maxy <= gb[1] || miny >= gb[4] || maxz <= gb[2] || minz >= gb[5]) continue;
      // сами ступени и площадки ядра не трогаем — только то, что выходит за его контур (перекрытия)
      if (k && minx >= k[0] - 0.05 && maxx <= k[2] + 0.05 && minz >= k[1] - 0.05 && maxz <= k[3] + 0.05) continue;
      for (const cut of g.cuts) {
        const x = cut.box;
        if (maxx <= x[0] || minx >= x[3] || maxy <= x[1] || miny >= x[4] || maxz <= x[2] || minz >= x[5]) continue;
        polys ??= [[[ax, ay, az], [bx, by, bz], [cx, cy, cz]]];
        const next = [];
        for (const p of polys) { if (polyHitsBox(p, x)) next.push(...subtractBox(p, x)); else next.push(p); }
        polys = next;
        cut.hits++;
      }
    }
    if (!polys) { out.tri(ax, ay, az, bx, by, bz, cx, cy, cz); continue; }
    for (const p of polys) {
      if (polyArea2(p) < 1e-7) continue;
      for (let j = 1; j + 1 < p.length; j++) out.tri(...p[0], ...p[j], ...p[j + 1]);
    }
  }
  return out.result();
}

// ── Запросы ──────────────────────────────────────────────────────────────────
const RING = [0, 0, 1, 0, 0.5, 0.866, -0.5, 0.866, -1, 0, -0.5, -0.866, 0.5, -0.866];   // центр + шестиугольник
const CROSS = [0, 0, 1, 0, 0, 1, -1, 0, 0, -1];
// рабочие буферы для обрезки треугольника по высоте
const AX = new Float64Array(8), AY = new Float64Array(8), AZ = new Float64Array(8);
const BX = new Float64Array(8), BY = new Float64Array(8), BZ = new Float64Array(8);
function clipY(ix, iy, iz, n, val, keepAbove, ox, oy, oz) {
  let m = 0;
  for (let i = 0; i < n; i++) {
    const j = i + 1 === n ? 0 : i + 1;
    const yi = iy[i], yj = iy[j];
    const a = keepAbove ? yi >= val : yi <= val;
    const b = keepAbove ? yj >= val : yj <= val;
    if (a) { ox[m] = ix[i]; oy[m] = yi; oz[m] = iz[i]; m++; }
    if (a !== b) {
      const t = (val - yi) / (yj - yi);
      ox[m] = ix[i] + (ix[j] - ix[i]) * t; oy[m] = val; oz[m] = iz[i] + (iz[j] - iz[i]) * t; m++;
    }
  }
  return m;
}

// Сдвиг, выталкивающий вертикальный цилиндр (ось в p.x/p.z, высоты y0..y1, радиус R)
// из треугольника abc по горизонтали. Пишет сдвиг в out, возвращает true при контакте.
const _tp = new THREE.Vector3();
function triPush(a, b, c, p, R, y0, y1, prevX, prevZ, out) {
  if (Math.max(a.y, b.y, c.y) <= y0 || Math.min(a.y, b.y, c.y) >= y1) return false;
  const e1x = b.x - a.x, e1y = b.y - a.y, e1z = b.z - a.z;
  const e2x = c.x - a.x, e2y = c.y - a.y, e2z = c.z - a.z;
  const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
  const nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-10 || Math.abs(ny / nl) > 0.7) return false;
  // треугольник → полоса высот [y0, y1] → многоугольник → проекция на пол
  AX[0] = a.x; AY[0] = a.y; AZ[0] = a.z; AX[1] = b.x; AY[1] = b.y; AZ[1] = b.z; AX[2] = c.x; AY[2] = c.y; AZ[2] = c.z;
  let n = clipY(AX, AY, AZ, 3, y0, true, BX, BY, BZ);
  if (n < 2) return false;
  n = clipY(BX, BY, BZ, n, y1, false, AX, AY, AZ);
  if (n < 2) return false;
  const px = p.x, pz = p.z;
  let best = Infinity, cx = 0, cz = 0, pos = 0, neg = 0;
  for (let i = 0; i < n; i++) {
    const j = i + 1 === n ? 0 : i + 1;
    const qx = AX[i], qz = AZ[i], dx = AX[j] - qx, dz = AZ[j] - qz;
    const L2 = dx * dx + dz * dz;
    let t = L2 > 1e-12 ? ((px - qx) * dx + (pz - qz) * dz) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const kx = qx + dx * t, kz = qz + dz * t;
    const d2 = (px - kx) ** 2 + (pz - kz) ** 2;
    if (d2 < best) { best = d2; cx = kx; cz = kz; }
    const cr = dx * (pz - qz) - dz * (px - qx);
    if (cr > 1e-9) pos++; else if (cr < -1e-9) neg++;
  }
  const inside = n >= 3 && (pos === 0 || neg === 0) && pos + neg >= 3;
  const d = Math.sqrt(best);
  if (!inside && d >= R) return false;
  let ux, uz, k;
  if (inside || d < 1e-5) {
    // ось цилиндра на самой грани / внутри наклонной грани — толкаем по нормали в «свою» сторону
    const hl = Math.hypot(nx, nz) || 1;
    ux = nx / hl; uz = nz / hl;
    if ((prevX - a.x) * ux + (prevZ - a.z) * uz < 0) { ux = -ux; uz = -uz; }
    k = R;
  } else {
    ux = (px - cx) / d; uz = (pz - cz) / d;
    k = R - d;
  }
  out.set(ux * k, 0, uz * k);
  return true;
}

export class Collider {
  constructor() {
    this.bvh = null;
    this.ready = false;
    this.stats = null;
    this.cutReport = [];
    this._ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    this._box = new THREE.Box3();
    this.prevX = 0; this.prevZ = 0;     // откуда пришли — чтобы выталкивать «в свою» сторону
  }

  // roots — корневые группы сцены; cutouts — проёмы (см. collect); shafts — вертикальные ядра
  // лестниц [{ rect:[x0,z0,x1,z1] (сцена), floors:[y верхних этажей] }]: если над маршем нет
  // дыры в перекрытии, прорезаем её в коллизии (по реальному зазору над ступенями).
  async build(roots, { cutouts = [], shafts = [], slab = 0.35, headroom = 2.05 } = {}) {
    const MeshBVH = await loadBVH();
    const t0 = performance.now();
    const stats = { meshes: 0, instanced: 0, skipped: 0 };
    cutouts = cutouts.map((c) => ({ ...c, hits: 0 }));
    let positions = collect(roots, cutouts, stats);
    const tCollect = performance.now() - t0;

    // Лестничные клетки: где над ступенью меньше headroom до низа перекрытия — вырезаем перекрытие.
    // Зазор меряем по маленькому BVH из треугольников самих ядер, резы применяем к собранному массиву.
    const shaftCuts = [];
    const tS = performance.now();
    let tSample = 0;
    if (shafts.length) {
      const local = pickTris(positions, shafts.map((sh) => sh.rect));
      if (local.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(local, 3));
        const mini = new MeshBVH(g, { maxLeafTris: 8 });
        for (const sh of shafts) {
          const [x0, z0, x1, z1] = sh.rect;
          for (const yf of sh.floors) {
            const yCeil = yf - slab - 0.03;               // чуть ниже потолка верхнего этажа
            for (const r of this._headroomCells(mini, x0, z0, x1, z1, yCeil, headroom)) {
              shaftCuts.push({ box: [r[0], yf - slab - 0.12, r[1], r[2], yf + 0.03, r[3]], keepInside: sh.rect, hits: 0 });
            }
          }
        }
        g.dispose();
      }
      tSample = performance.now() - tS;
      if (shaftCuts.length) positions = cutArray(positions, shaftCuts);
    }
    const tCut = performance.now() - tS - tSample;
    const t1 = performance.now();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const bvh = new MeshBVH(geo, { maxLeafTris: 8 });
    const tBvh = performance.now() - t1;
    const old = this.bvh;
    this.bvh = bvh;
    if (old && old !== bvh) old.geometry.dispose();
    this.ready = true;
    this.cutReport = [...cutouts.filter((c) => c.hits).map((c) => ({ id: c.id, tris: c.hits })),
      ...(shaftCuts.some((c) => c.hits) ? [{ id: 'stair-shafts', rects: shaftCuts.length, tris: shaftCuts.reduce((n, c) => n + c.hits, 0) }] : [])];
    this.stats = { ...stats, tris: positions.length / 9, collectMs: Math.round(tCollect), shaftMs: Math.round(tSample), cutMs: Math.round(tCut), bvhMs: Math.round(tBvh), totalMs: Math.round(performance.now() - t0) };
    return this.stats;
  }

  // Сетка 0,3 м внутри ядра: ячейки, где до ближайшей поверхности снизу меньше headroom
  _headroomCells(bvh, x0, z0, x1, z1, yCeil, headroom) {
    const step = 0.3;
    const nx = Math.max(1, Math.round((x1 - x0) / step)), nz = Math.max(1, Math.round((z1 - z0) / step));
    const sx = (x1 - x0) / nx, sz = (z1 - z0) / nz;
    const ray = this._ray;
    const mark = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      // есть ли под потолком ступень / площадка ближе headroom (крутые грани пропускаем)
      let y = yCeil, left = headroom;
      for (let k = 0; k < 4 && left > 0; k++) {
        ray.origin.set(x0 + (i + 0.5) * sx, y, z0 + (j + 0.5) * sz);
        ray.direction.set(0, -1, 0);
        const h = bvh.raycastFirst(ray, THREE.DoubleSide, 0, left);
        if (!h) break;
        if (Math.abs(h.face.normal.y) > 0.45) { mark[j * nx + i] = 1; break; }
        left -= y - h.point.y + 0.01; y = h.point.y - 0.01;
      }
    }
    // склеиваем ячейки в прямоугольники: полосы по x, затем одинаковые полосы по z
    const rects = [];
    let open = new Map();
    for (let j = 0; j <= nz; j++) {
      const runs = new Map();
      if (j < nz) {
        for (let i = 0; i < nx;) {
          if (!mark[j * nx + i]) { i++; continue; }
          let k = i; while (k < nx && mark[j * nx + k]) k++;
          runs.set(`${i}:${k}`, [i, k]); i = k;
        }
      }
      const next = new Map();
      for (const [key, r] of open) {
        if (runs.has(key)) { next.set(key, r); runs.delete(key); } else rects.push(r);
      }
      for (const [key, [i, k]] of runs) next.set(key, [x0 + i * sx, z0 + j * sz, x0 + k * sx, 0]);
      for (const [key, r] of next) r[3] = z0 + (j + 1) * sz;
      open = next;
    }
    // небольшой запас по краям, чтобы не оставалось «ступеньки» из недорезанной плиты
    const m = 0.02;
    return rects.map(([a, b, c, d]) => [a - m, b - m, c + m, d + m]);
  }

  // Самая высокая опора под «диском» ног: лучи вниз от yTop до yBot. −Infinity, если нет.
  groundAt(x, z, yTop, yBot, r = 0.2, pattern = RING) {
    if (!this.bvh) return -Infinity;
    const ray = this._ray, far = yTop - yBot;
    let best = -Infinity;
    for (let i = 0; i < pattern.length; i += 2) {
      ray.origin.set(x + pattern[i] * r, yTop, z + pattern[i + 1] * r);
      ray.direction.set(0, -1, 0);
      const h = this.bvh.raycastFirst(ray, THREE.DoubleSide, 0, far);
      if (h && Math.abs(h.face.normal.y) > 0.45 && h.point.y > best) best = h.point.y;
    }
    return best;
  }

  // Точка внутри сплошного объёма (лучи по сторонам упираются в изнанку граней) — для анализа проходимости
  insideAt(x, y, z, far = 6) {
    if (!this.bvh) return false;
    const ray = this._ray;
    let back = 0;
    for (let i = 0; i < CROSS.length; i += 2) {
      const dx = CROSS[i], dz = CROSS[i + 1];
      if (!dx && !dz) continue;
      ray.origin.set(x, y, z);
      ray.direction.set(dx, 0, dz).normalize();
      const h = this.bvh.raycastFirst(ray, THREE.DoubleSide, 0, far);
      if (h && h.face.normal.x * ray.direction.x + h.face.normal.z * ray.direction.z > 0.2) back++;
    }
    return back >= 3;
  }

  // Самый низкий потолок над головой: лучи вверх. +Infinity, если нет.
  ceilingAt(x, z, yBot, yTop, r = 0.14) {
    if (!this.bvh) return Infinity;
    const ray = this._ray, far = yTop - yBot;
    let best = Infinity;
    for (let i = 0; i < CROSS.length; i += 2) {
      ray.origin.set(x + CROSS[i] * r, yBot, z + CROSS[i + 1] * r);
      ray.direction.set(0, 1, 0);
      const h = this.bvh.raycastFirst(ray, THREE.DoubleSide, 0, far);
      if (h && h.point.y < best) best = h.point.y;
    }
    return best;
  }

  // Выталкивание вертикального цилиндра (радиус R, высоты y0..y1) из стен.
  // Полы и потолки (|n.y| > 0.7) здесь не участвуют — ими занимаются лучи.
  // Меняет p.x / p.z, в out кладёт суммарный сдвиг. Возвращает число контактов.
  pushOut(p, R, y0, y1, out) {
    out.set(0, 0, 0);
    if (!this.bvh) return 0;
    const box = this._box;
    box.min.set(p.x - R, y0, p.z - R); box.max.set(p.x + R, y1, p.z + R);
    const px = this.prevX, pz = this.prevZ;
    let hits = 0;
    this.bvh.shapecast({
      intersectsBounds: (b) => b.intersectsBox(box),
      intersectsTriangle: (tri) => {
        if (!triPush(tri.a, tri.b, tri.c, p, R, y0, y1, px, pz, _tp)) return false;
        p.x += _tp.x; p.z += _tp.z; out.x += _tp.x; out.z += _tp.z;
        box.min.x = p.x - R; box.max.x = p.x + R; box.min.z = p.z - R; box.max.z = p.z + R;
        hits++;
        return false;
      },
    });
    return hits;
  }

  // Отладка: какие треугольники мешают цилиндру в точке p (сцена)
  blockers(p, R, y0, y1, limit = 16) {
    const out = [];
    if (!this.bvh) return out;
    const box = new THREE.Box3(new THREE.Vector3(p.x - R, y0, p.z - R), new THREE.Vector3(p.x + R, y1, p.z + R));
    const push = new THREE.Vector3();
    const r = (v) => v.toArray().map((x) => +x.toFixed(3));
    this.bvh.shapecast({
      intersectsBounds: (b) => b.intersectsBox(box),
      intersectsTriangle: (tri) => {
        if (triPush(tri.a, tri.b, tri.c, p, R, y0, y1, p.x, p.z, push)) out.push({ a: r(tri.a), b: r(tri.b), c: r(tri.c), push: [+push.x.toFixed(3), +push.z.toFixed(3)] });
        return out.length >= limit;
      },
    });
    return out;
  }
}
