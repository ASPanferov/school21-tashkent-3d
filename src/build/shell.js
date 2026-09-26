// Оболочка здания: фасады (с разбивкой по этажным поясам), карниз, цоколь,
// козырёк, башня, логотипы, крыльцо и пандус, кровля, световой фонарь.
import * as THREE from 'three';
import { Batch, boxUVZ, P, sx, sy, sz, C } from '../lib/geom.js';
import {
  SIZE, GRADE, LEVELS, ROOF_Z, PARAPET_Z, FACADES, CANOPY, LOGOS, ENTRANCE, SKYLIGHT, ROOF_BOXES,
} from '../data/building.js';

const zOf = (id) => LEVELS.find((l) => l.id === id).z;
const Z1 = zOf('L1'), Z2 = zOf('L2'), Z3 = zOf('L3');
// Этажные пояса фасада: по ним режем геометрию, чтобы прятать этажи в разрезе
export const BANDS = [
  { id: 'L1', z0: GRADE, z1: Z2 },
  { id: 'L2', z0: Z2, z1: Z3 },
  { id: 'L3', z0: Z3, z1: ROOF_Z },
  { id: 'ROOF', z0: ROOF_Z, z1: 100 },
];

// (сторона, s, n) → (u, v). n > 0 — наружу от плоскости фасада.
function toUV(side, s, n) {
  switch (side) {
    case 'SE': return [s, -n];
    case 'NE': return [SIZE + n, s];
    case 'NW': return [SIZE - s, SIZE + n];
    case 'SW': return [-n, SIZE - s];
  }
}

export function buildShell(mats) {
  const bands = Object.fromEntries(BANDS.map((b) => [b.id, new Batch(mats)]));
  const glassKey = (base, band) => (band === 'ROOF' ? base : `${base}@${band}`);

  // Коробка на фасаде, автоматически порезанная по поясам
  function fbox(side, s0, s1, z0, z1, n0, n1, mat, { perLevel = false } = {}) {
    for (const b of BANDS) {
      const a = Math.max(z0, b.z0), c = Math.min(z1, b.z1);
      if (c - a < 1e-3) continue;
      const [u0, v0] = toUV(side, s0, n0), [u1, v1] = toUV(side, s1, n1);
      bands[b.id].box(perLevel ? glassKey(mat, b.id) : mat,
        Math.min(u0, u1), Math.min(v0, v1), a, Math.max(u0, u1), Math.max(v0, v1), c);
    }
  }

  // Витражная система: стекло + стойки + ригели
  function curtain(side, s0, s1, z0, z1, glass, { step = 1.25, rows = [], transoms = [] } = {}) {
    fbox(side, s0, s1, z0, z1, -0.04, 0.0, glass, { perLevel: true });
    const n = Math.max(1, Math.round((s1 - s0) / step));
    const st = (s1 - s0) / n;
    for (let i = 0; i <= n; i++) {
      const s = s0 + i * st;
      fbox(side, s - 0.03, s + 0.03, z0, z1, -0.06, 0.07, 'mullion');
    }
    for (const z of rows) if (z > z0 && z < z1) fbox(side, s0, s1, z - 0.03, z + 0.03, -0.06, 0.06, 'mullion');
    for (const z of transoms) if (z > z0 && z < z1) {
      fbox(side, s0, s1, z - 0.22, z + 0.12, -0.06, 0.08, 'mullionDark');
    }
    fbox(side, s0, s1, z0, z0 + 0.06, -0.06, 0.08, 'mullion');
    fbox(side, s0, s1, z1 - 0.06, z1, -0.06, 0.08, 'mullion');
  }

  // Приоткрытые фрамуги (как на фото — несколько распахнутых створок)
  function vents(side, s0, s1, zTop, count, glass, seed) {
    let r = seed;
    for (let k = 0; k < count; k++) {
      r = (r * 9301 + 49297) % 233280;
      const s = s0 + 1 + (r / 233280) * (s1 - s0 - 2.5);
      const [u0, v0] = toUV(side, s, 0.02), [u1, v1] = toUV(side, s + 1.1, 0.02);
      const g = boxUVZ(Math.min(u0, u1), Math.min(v0, v1), zTop - 0.9, Math.max(u0, u1), Math.max(v0, v1), zTop);
      // поворот створки наружу вокруг верхней кромки
      const pivot = P(...(() => { const [u, v] = toUV(side, s + 0.55, 0); return [u, v, zTop]; })());
      const outward = { SE: [0, 0, 1], NE: [1, 0, 0], NW: [0, 0, -1], SW: [-1, 0, 0] }[side];
      const axis = new THREE.Vector3(-outward[2], 0, outward[0]).normalize();
      g.translate(-pivot.x, -pivot.y, -pivot.z);
      g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(axis, 0.42));
      g.translate(pivot.x, pivot.y, pivot.z);
      const band = BANDS.find((b) => zTop > b.z0 && zTop <= b.z1)?.id || 'L3';
      bands[band].add(glassKey(glass, band), g);
    }
  }

  const floorRows = (z0, z1, h = 1.5) => { const out = []; for (let z = z0 + h; z < z1 - 0.3; z += h) out.push(z); return out; };

  for (const [side, fac] of Object.entries(FACADES)) {
    for (const seg of fac.segments) {
      const { s0, s1 } = seg;
      switch (seg.type) {
        case 'pilaster':
          fbox(side, s0, s1, Z1, ROOF_Z, -0.2, 0.25, 'acp');
          break;
        case 'curtain': {
          // три этажа сплошного витража: 1–2 зелёный, 3 голубой (как на фото)
          curtain(side, s0, s1, Z1, Z3, 'glassGreen', { rows: [1.6, 3.2, 6.1, 7.6].map((d) => Z1 + d), transoms: [Z2] });
          curtain(side, s0, s1, Z3, ROOF_Z, 'glassBlue', { rows: [Z3 + 1.3, Z3 + 2.8] });
          fbox(side, s0, s1, Z3 - 0.3, Z3 + 0.05, -0.06, 0.1, 'mullionDark');
          vents(side, s0, s1, ROOF_Z - 0.35, 7, 'glassBlue', 11 + s0);
          vents(side, s0, s1, Z2 - 0.6, 3, 'glassGreen', 31 + s0);
          break;
        }
        case 'portal': {
          const jamb = 1.2, beamZ0 = Z3 - 0.6, beamZ1 = Z3 + 0.6;
          // двухсветный витраж внутри рамы
          curtain(side, s0 + jamb, s1, Z1, beamZ0, 'glassGreen', { rows: [1.6, 3.2, 6.1, 7.4].map((d) => Z1 + d), transoms: [Z2], step: 1.1 });
          // белая П-рама, выступает на 0.5 м
          fbox(side, s0, s0 + jamb, Z1, beamZ1, -0.1, 0.5, 'acp');
          fbox(side, s0, s1, beamZ0, beamZ1, -0.1, 0.5, 'acp');
          // лента 3 этажа над рамой
          curtain(side, s0, s1, beamZ1, ROOF_Z, 'glassBlue', { rows: [beamZ1 + 1.1, beamZ1 + 2.3] });
          vents(side, s0, s1, ROOF_Z - 0.35, 3, 'glassBlue', 71);
          vents(side, s0 + jamb, s1, beamZ0 - 0.5, 1, 'glassGreen', 5);
          break;
        }
        case 'tower': {
          const proj = seg.proj ?? 0.8, top = seg.top ?? 18.0;
          fbox(side, s0, s1, Z1, top, -0.2, proj, 'acp');
          // щелевые окна
          const slot = (a, b, z0, z1) => fbox(side, a, b, z0, z1, proj, proj + 0.03, 'glassSlot');
          slot(s0 + 0.45, s0 + 0.75, Z1 + 6.0, Z1 + 15.0);
          slot(s0 + 1.5, s0 + 1.75, Z1 + 1.8, Z1 + 13.6);
          slot(s1 - 0.9, s1 - 0.6, Z1 + 8.0, Z1 + 16.6);
          break;
        }
        case 'block': {
          // 1 этаж — тёмный витраж (за козырьком), 2 и 3 — голубой, белые пояса
          curtain(side, s0, s1, Z1, Z2 - 0.4, 'glassGreen', { rows: [Z1 + 3.0], step: 1.4 });
          fbox(side, s0, s1, Z2 - 0.4, Z2 + 0.9, -0.08, 0.18, 'acp');
          curtain(side, s0, s1, Z2 + 0.9, Z3 - 0.6, 'glassBlue', { rows: [Z2 + 2.5], step: 0.9 });
          fbox(side, s0, s1, Z3 - 0.6, Z3 + 0.6, -0.08, 0.18, 'acp');
          curtain(side, s0, s1, Z3 + 0.6, ROOF_Z, 'glassBlue', { rows: [Z3 + 2.2], step: 0.9 });
          break;
        }
        case 'ribbon': {
          const sills = [[Z1, 0.5, Z2 - 0.5], [Z2, Z2 + 0.8, Z3 - 0.5], [Z3, Z3 + 0.8, ROOF_Z - 0.2]];
          fbox(side, s0, s1, Z1, Z1 + 0.5, -0.08, 0.18, 'acp');
          for (let i = 0; i < sills.length; i++) {
            const [, g0, g1] = sills[i];
            curtain(side, s0, s1, g0, g1, i === 0 ? 'glassGreen' : 'glassBlue', { rows: [g0 + 1.6], step: 1.5 });
            if (i < sills.length - 1) fbox(side, s0, s1, g1, sills[i + 1][1], -0.08, 0.18, 'acp');
          }
          break;
        }
      }
    }
    // карниз-парапет по всему периметру (+ внутренняя сторона)
    fbox(side, -0.35, SIZE + 0.35, ROOF_Z - 0.2, PARAPET_Z, -0.25, 0.35, 'acp');
    fbox(side, -0.35, SIZE + 0.35, PARAPET_Z - 0.06, PARAPET_Z, -0.3, 0.42, 'acp');
    // цоколь (розовый гранит)
    fbox(side, -0.15, SIZE + 0.15, GRADE, Z1, -0.2, 0.15, 'granite');
  }

  // Плиты перекрытий видны торцом за стеклом
  // (сами полы строит interior.js, здесь только кромка, чтобы фасад не «светился»)

  // ── Козырёк ──────────────────────────────────────────────────────────────
  const cb = bands.L1, cb2 = bands.L2;
  const cz0 = Z1 + CANOPY.soffit, cz1 = Z1 + CANOPY.top;
  // козырёк пересекает пояса L1/L2 — режем по поясам
  const splitBox = (key, u0, v0, z0, u1, v1, z1) => {
    for (const bd of BANDS) {
      const a = Math.max(z0, bd.z0), c = Math.min(z1, bd.z1);
      if (c - a > 1e-3) bands[bd.id].box(key, u0, v0, a, u1, v1, c);
    }
  };
  splitBox('acp', CANOPY.u0, -CANOPY.depth, cz0, CANOPY.u1, 0.0, cz1);
  cb.box('ceilingWhite', CANOPY.u0 + 0.2, -CANOPY.depth + 0.2, cz0 - 0.02, CANOPY.u1 - 0.2, -0.1, cz0);
  for (const u of CANOPY.columns) cb.box('acp', u - 0.42, -CANOPY.depth + 0.05, Z1, u + 0.42, -CANOPY.depth + 0.89, cz0);
  cb.box('acp', CANOPY.u0 + 0.2, -1.2, Z1, CANOPY.u0 + 1.0, -0.4, cz0);
  // точечные светильники в потолке козырька
  for (let u = CANOPY.u0 + 1.5; u < CANOPY.u1 - 0.8; u += 2.2) for (const v of [-1.3, -3.2]) cb.box('led', u - 0.12, v - 0.12, cz0 - 0.03, u + 0.12, v + 0.12, cz0 - 0.01);
  // терраса под козырьком
  cb.box('graniteStep', CANOPY.u0 - 0.6, -CANOPY.depth - 0.2, GRADE, SIZE + 0.15, 0.0, Z1);
  // двери тамбура
  cb.box('glassDoor', 47.0, -0.05, Z1, 54.6, 0.05, Z1 + 3.3);
  for (let u = 47.0; u <= 54.61; u += 1.9) cb.box('frameBlack', u - 0.04, -0.1, Z1, u + 0.04, 0.08, Z1 + 3.3);
  cb.box('frameBlack', 47.0, -0.1, Z1 + 3.26, 54.6, 0.08, Z1 + 3.36);

  // ── Крыльцо ─────────────────────────────────────────────────────────────
  const st = ENTRANCE.stairs;
  const rise = (Z1 - GRADE) / st.risers;
  for (let i = 0; i < st.risers; i++) {
    const v0 = st.vTop - (st.risers - i) * st.tread, v1 = st.vTop - (st.risers - i - 1) * st.tread;
    cb.box('graniteStep', st.u0, v0, GRADE, st.u1, v1 + 0.02, GRADE + rise * (i + 1));
  }
  const vFoot = st.vTop - st.risers * st.tread;
  // щёки лестницы и перила
  cb.box('granite', st.u0 - 0.45, vFoot, GRADE, st.u0, st.vTop, Z1 + 0.15);
  cb.box('granite', st.u1, vFoot, GRADE, st.u1 + 0.6, st.vTop, Z1 + 0.15);
  railing(cb, [st.u0 + 0.3, vFoot + 0.2, GRADE + 0.9], [st.u0 + 0.3, st.vTop, Z1 + 0.9]);
  railing(cb, [st.u1 - 0.3, vFoot + 0.2, GRADE + 0.9], [st.u1 - 0.3, st.vTop, Z1 + 0.9]);
  railing(cb, [47.8, vFoot + 0.2, GRADE + 0.9], [47.8, st.vTop, Z1 + 0.9]);

  // ── Пандус вдоль фасада ──────────────────────────────────────────────────
  const rp = ENTRANCE.ramp;
  const len = rp.u1 - rp.u0;
  const rampGeo = new THREE.BoxGeometry(len, 0.25, rp.v1 - rp.v0);
  const ang = Math.atan2(Z1 - GRADE, len);
  rampGeo.rotateZ(ang);
  rampGeo.translate(sx((rp.u0 + rp.u1) / 2), sy((GRADE + Z1) / 2) - 0.1, sz((rp.v0 + rp.v1) / 2));
  cb.add('graniteStep', rampGeo);
  // наружная подпорная стенка пандуса (ступенчато)
  for (let i = 0; i < 8; i++) {
    const a = rp.u0 + (len / 8) * i, b = a + len / 8;
    const h = GRADE + ((Z1 - GRADE) * (i + 1)) / 8;
    cb.box('granite', a, rp.v0 - 0.35, GRADE, b, rp.v0, h + 0.12);
  }
  railing(cb, [rp.u0, rp.v0 + 0.15, GRADE + 0.95], [rp.u1, rp.v0 + 0.15, Z1 + 0.95]);
  railing(cb, [rp.u0, rp.v1 - 0.05, GRADE + 0.95], [rp.u1, rp.v1 - 0.05, Z1 + 0.95]);

  // ── Кровля ───────────────────────────────────────────────────────────────
  const roof = bands.ROOF;
  const sk = SKYLIGHT;
  roof.add('concrete', slabRing(0.3, 0.3, SIZE - 0.3, SIZE - 0.3, sk.u0, sk.v0, sk.u1, sk.v1, ROOF_Z - 0.35, 0.35));
  roofHip(roof, 0.3, 0.3, SIZE - 0.3, SIZE - 0.3, sk.u0 - 0.4, sk.v0 - 0.4, sk.u1 + 0.4, sk.v1 + 0.4, ROOF_Z + 0.1, ROOF_Z + 1.25);
  // надстройки
  for (const rb of ROOF_BOXES) {
    const [u0, v0, u1, v1] = rb.rect;
    roof.box('acpGray', u0, v0, ROOF_Z, u1, v1, ROOF_Z + rb.h);
    roof.box('acp', u0 - 0.1, v0 - 0.1, ROOF_Z + rb.h - 0.25, u1 + 0.1, v1 + 0.1, ROOF_Z + rb.h);
  }
  // кондиционеры на кровле
  for (const [u, v] of [[20, 6], [23, 6], [26, 6], [8, 30], [8, 33], [47, 40], [50, 40]]) roof.box('acpGray', u, v, ROOF_Z + 0.9, u + 1.6, v + 0.9, ROOF_Z + 2.1);

  // ── Световой фонарь и стеклянная пирамида ────────────────────────────────
  const lz0 = ROOF_Z, lz1 = sk.base;
  const wallT = 0.3;
  // стены фонаря: снаружи серый композит, внутри белые (их видно из лаунжа)
  roof.box('acpGray', sk.u0 - wallT, sk.v0 - wallT, lz0, sk.u1 + wallT, sk.v0, lz1);
  roof.box('acpGray', sk.u0 - wallT, sk.v1, lz0, sk.u1 + wallT, sk.v1 + wallT, lz1);
  roof.box('acpGray', sk.u0 - wallT, sk.v0, lz0, sk.u0, sk.v1, lz1);
  roof.box('acpGray', sk.u1, sk.v0, lz0, sk.u1 + wallT, sk.v1, lz1);
  roof.box('wallWhite', sk.u0 + 0.01, sk.v0 + 0.01, ROOF_Z - 0.4, sk.u1 - 0.01, sk.v0 + 0.03, lz1 - 0.1);
  roof.box('wallWhite', sk.u0 + 0.01, sk.v1 - 0.03, ROOF_Z - 0.4, sk.u1 - 0.01, sk.v1 - 0.01, lz1 - 0.1);
  roof.box('wallWhite', sk.u0 + 0.01, sk.v0 + 0.01, ROOF_Z - 0.4, sk.u0 + 0.03, sk.v1 - 0.01, lz1 - 0.1);
  roof.box('wallWhite', sk.u1 - 0.03, sk.v0 + 0.01, ROOF_Z - 0.4, sk.u1 - 0.01, sk.v1 - 0.01, lz1 - 0.1);
  // вентиляционные оконца в углах фонаря (видны на фото из лаунжа)
  for (const [u, v] of [[sk.u0 + 1.2, sk.v0], [sk.u1 - 2.4, sk.v0], [sk.u0 + 1.2, sk.v1], [sk.u1 - 2.4, sk.v1]]) {
    roof.box('glassSlot', u, v - wallT - 0.02, lz1 - 1.1, u + 1.2, v + wallT + 0.02, lz1 - 0.35);
  }
  const pyramid = buildPyramid(mats, sk);

  const groups = {};
  for (const b of BANDS) groups[b.id] = bands[b.id].build(`shell-${b.id}`);
  groups.ROOF.add(pyramid);

  // Логотипы
  const logos = buildLogos(mats);
  groups.L2.add(logos.canopy);
  groups.ROOF.add(logos.tower);
  return groups;
}

// Кольцевая плита (квадрат с квадратным отверстием)
function slabRing(u0, v0, u1, v1, hu0, hv0, hu1, hv1, z, t) {
  const shape = new THREE.Shape([
    new THREE.Vector2(sx(u0), -sz(v0)), new THREE.Vector2(sx(u1), -sz(v0)),
    new THREE.Vector2(sx(u1), -sz(v1)), new THREE.Vector2(sx(u0), -sz(v1)),
  ]);
  shape.holes.push(new THREE.Path([
    new THREE.Vector2(sx(hu0), -sz(hv0)), new THREE.Vector2(sx(hu1), -sz(hv0)),
    new THREE.Vector2(sx(hu1), -sz(hv1)), new THREE.Vector2(sx(hu0), -sz(hv1)),
  ]));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, sy(z), 0);
  return g;
}

// Вальмовая кровля-«кольцо» вокруг фонаря: 4 трапеции от фонаря к парапету
function roofHip(batch, u0, v0, u1, v1, iu0, iv0, iu1, iv1, zo, zi) {
  const O = [P(u0, v0, zo), P(u1, v0, zo), P(u1, v1, zo), P(u0, v1, zo)];
  const I = [P(iu0, iv0, zi), P(iu1, iv0, zi), P(iu1, iv1, zi), P(iu0, iv1, zi)];
  for (let k = 0; k < 4; k++) {
    const a = O[k], b = O[(k + 1) % 4], c = I[(k + 1) % 4], d = I[k];
    const g = new THREE.BufferGeometry();
    const pos = [a, b, c, a, c, d].flatMap((p) => [p.x, p.y, p.z]);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    // UV: вдоль ската и поперёк, в метрах
    const uv = [a, b, c, a, c, d].flatMap((p) => [k % 2 ? p.z : p.x, k % 2 ? p.x : p.z]);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    // нормаль должна смотреть вверх
    const n = g.attributes.normal;
    if (n.getY(0) < 0) {
      const p2 = [a, c, b, a, d, c].flatMap((p) => [p.x, p.y, p.z]);
      g.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3));
      g.computeVertexNormals();
    }
    batch.add('roof', g);
  }
}

// Перила из нержавейки: поручень + стойки
function railing(batch, a, b, { step = 1.4 } = {}) {
  const A = P(...a), B = P(...b);
  const len = A.distanceTo(B);
  const tube = new THREE.CylinderGeometry(0.025, 0.025, len, 8);
  tube.rotateZ(Math.PI / 2);
  const dir = B.clone().sub(A).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
  tube.applyQuaternion(q);
  tube.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  batch.add('stainless', tube);
  const n = Math.max(1, Math.round(len / step));
  for (let i = 0; i <= n; i++) {
    const p = A.clone().lerp(B, i / n);
    const post = new THREE.CylinderGeometry(0.022, 0.022, 0.9, 6);
    post.translate(p.x, p.y - 0.45, p.z);
    batch.add('stainless', post);
  }
}
export { railing };

// Пирамида: стекло + триангулированный стальной каркас + кольцевые светильники
function buildPyramid(mats, sk) {
  const group = new THREE.Group();
  group.name = 'skylight';
  const batch = new Batch(mats);
  const zb = sk.base, apexZ = sk.base + sk.rise;
  const cu = (sk.u0 + sk.u1) / 2, cv = (sk.v0 + sk.v1) / 2;
  const corners = [[sk.u0, sk.v0], [sk.u1, sk.v0], [sk.u1, sk.v1], [sk.u0, sk.v1]];
  const apex = P(cu, cv, apexZ);
  const n = sk.divisions;
  const member = (A, B, r = 0.07) => {
    const len = A.distanceTo(B);
    if (len < 0.05) return;
    const g = new THREE.BoxGeometry(r * 2, len, r * 2);
    const dir = B.clone().sub(A).normalize();
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
    batch.add('steelDark', g);
  };
  const ringGeo = new THREE.TorusGeometry(0.42, 0.035, 8, 32);
  ringGeo.rotateX(Math.PI / 2);
  const rings = [];
  for (let k = 0; k < 4; k++) {
    const V0 = P(corners[k][0], corners[k][1], zb), V1 = P(corners[(k + 1) % 4][0], corners[(k + 1) % 4][1], zb);
    // стекло грани
    const glass = new THREE.BufferGeometry();
    glass.setAttribute('position', new THREE.Float32BufferAttribute([V0, V1, apex].flatMap((p) => [p.x, p.y, p.z]), 3));
    glass.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
    glass.computeVertexNormals();
    batch.add('skyGlass', glass);
    // сетка стержней (барицентрическая триангуляция)
    const Q = (a, b) => V0.clone().add(V1.clone().sub(V0).multiplyScalar(a / n)).add(apex.clone().sub(V0).multiplyScalar(b / n));
    for (let b = 0; b <= n; b++) for (let a = 0; a + b <= n; a++) {
      const p = Q(a, b);
      if (a + b < n) { member(p, Q(a + 1, b), 0.06); member(p, Q(a, b + 1), 0.06); member(Q(a + 1, b), Q(a, b + 1), 0.05); }
      // узлы
      const hub = new THREE.CylinderGeometry(0.13, 0.13, 0.16, 10);
      hub.translate(p.x, p.y - 0.05, p.z);
      batch.add('steelDark', hub);
      if ((a + b) % 2 === 0 && b > 0 && b < n && a > 0) rings.push(p.clone());
    }
    member(V0, apex, 0.1);
  }
  // обвязка по периметру
  for (let k = 0; k < 4; k++) member(P(corners[k][0], corners[k][1], zb), P(corners[(k + 1) % 4][0], corners[(k + 1) % 4][1], zb), 0.14);
  const built = batch.build('skylight-frame', { castShadow: true });
  // стекло не должно отбрасывать тень — иначе лаунж будет в темноте
  built.children.forEach((m) => { if (m.material.name === 'skyGlass') { m.castShadow = false; m.renderOrder = 2; } });
  group.add(built);
  // кольца подвешены на 1.6 м ниже узлов
  const ringMesh = new THREE.InstancedMesh(ringGeo, mats.get('led'), rings.length);
  const m4 = new THREE.Matrix4();
  rings.forEach((p, i) => { m4.makeTranslation(p.x, p.y - 1.8, p.z); ringMesh.setMatrixAt(i, m4); });
  ringMesh.name = 'skylight-rings';
  group.add(ringMesh);
  // тросы подвеса
  const cable = new Batch(mats);
  for (const p of rings) cable.add('black', new THREE.CylinderGeometry(0.006, 0.006, 1.8, 3).translate(p.x, p.y - 0.9, p.z));
  group.add(cable.build('skylight-cables', { castShadow: false }));
  return group;
}

// Пиксельный логотип «21» (5×8 и 2×8 клеток) + вертикальная надпись SCHOOL
const GLYPH_2 = ['XXXX.', '....X', '....X', '..XX.', '.X...', 'X....', 'X....', 'XXXXX'];
const GLYPH_1 = ['XX', '.X', '.X', '.X', '.X', '.X', '.X', '.X'];
function glyphBoxes(batch, key, glyph, u0, z0, cell, v0, depth) {
  const rows = glyph.length;
  glyph.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch !== 'X') return;
      const zTop = z0 + (rows - r) * cell;
      batch.box(key, u0 + c * cell, v0 - depth, zTop - cell, u0 + (c + 1) * cell, v0, zTop);
    });
  });
}
function buildLogos(mats) {
  const out = {};
  for (const L of LOGOS) {
    const b = new Batch(mats);
    const cell = L.size / 8;
    const depth = Math.max(0.08, cell * 0.6);
    glyphBoxes(b, 'teal21', GLYPH_2, L.u, L.z, cell, L.v, depth);
    glyphBoxes(b, 'teal21', GLYPH_1, L.u + cell * 6.2, L.z, cell, L.v, depth);
    const g = b.build(L.id);
    if (L.school) {
      // вертикальная надпись SCHOOL
      const c = document.createElement('canvas');
      c.width = 64; c.height = 400;
      const x = c.getContext('2d');
      x.fillStyle = '#14c4a2';
      x.fillRect(0, 0, 64, 400);
      x.save(); x.translate(38, 200); x.rotate(Math.PI / 2);
      x.fillStyle = '#0d2b27'; x.font = '700 40px "Unbounded", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('SCHOOL', 0, 0); x.restore();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, emissive: 0x14c4a2, emissiveIntensity: 0.2 });
      m.name = 'teal21-school';
      const h = L.size * 0.86;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(cell * 0.9, h, depth * 0.6), m);
      plate.position.copy(P(L.u + cell * 8.8, L.v - depth * 0.3, L.z + L.size - h / 2));
      plate.castShadow = true;
      g.add(plate);
    }
    out[L.id === 'logo-canopy' ? 'canopy' : 'tower'] = g;
  }
  return out;
}
