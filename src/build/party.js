// Праздничный режим «С днём рождения, School 21!»: подарочная лента с бантом поверх здания,
// арка и связки шаров, шары под потолками, флажки, конфетти, баннеры и фейерверк.
// Строится лениво при первом включении режима; в коллизиях прогулки не участвует.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as B from '../data/building.js';
import { sy, P, rng } from '../lib/geom.js';
import * as ART from '../lib/art.js';

const PAL = ['#2fd0b3', '#ffffff', '#8f5bff', '#ffc83d', '#ff5fa2', '#3d8bff', '#ff4b3a'];
const S = B.SIZE, SK = B.SKYLIGHT, APEX = SK.base + SK.rise;
const UC = (SK.u0 + SK.u1) / 2, VC = (SK.v0 + SK.v1) / 2;       // вершина пирамиды — центр банта
const UP = new THREE.Vector3(0, 1, 0);
const ORDER = ['B1', 'L1', 'M', 'L2', 'L3'];

// ── Лента: полоса вдоль ломаной оси; side — направление ширины; notch — V-вырез на конце ──
function ribbonGeo(pts, side, w, { notch = 0 } = {}) {
  const pos = [], uv = [];
  let acc = 0;
  const rows = pts.map((p, i) => {
    if (i) acc += p.distanceTo(pts[i - 1]);
    const L = p.clone().addScaledVector(side, -w / 2), R = p.clone().addScaledVector(side, w / 2);
    const C = notch && i === pts.length - 1 ? p.clone().addScaledVector(p.clone().sub(pts[i - 1]).normalize(), -notch) : p.clone();
    return { L, C, R, v: acc / w };
  });
  const quad = (a, b, c, d, u0, u1, v0, v1) => {
    pos.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray());
    uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  };
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    quad(a.L, a.C, b.C, b.L, 0, 0.5, a.v, b.v);
    quad(a.C, a.R, b.R, b.C, 0.5, 1, a.v, b.v);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// Ось ленты, обвязывающей здание: вверх по фасаду, через карниз, натянутой над кровлей
// к световому фонарю, по граням пирамиды через вершину и так же вниз с другой стороны
function wrapAxis(axis) {
  const alongV = axis === 'v';
  const O = alongV ? 0.45 : 0.53, dz = alongV ? 0 : 0.07;
  const PZ = B.PARAPET_Z + 0.35 + dz, top = SK.base + 0.3 + dz, apex = APEX + 0.24 + dz;
  const s0 = alongV ? SK.v0 : SK.u0, s1 = alongV ? SK.v1 : SK.u1;
  const bot0 = alongV ? -0.7 : -1.5;
  const prof = [[-O, bot0], [-O, PZ], [0.4, PZ], [s0 - 0.12, top], [(s0 + s1) / 2, apex], [s1 + 0.12, top], [S - 0.4, PZ], [S + O, PZ], [S + O, -1.5]];
  return prof.map(([s, z]) => (alongV ? P(UC, s, z) : P(s, VC, z)));
}

function bow(mat) {
  const g = new THREE.Group();
  const K = P(UC, VC, APEX + 0.3);
  const e1 = new THREE.Vector3(1, 0, -1).normalize(), e2 = new THREE.Vector3(1, 0, 1).normalize();
  // две петли по диагонали: «капля», прижатая к узлу и поднятая вверх
  for (const sg of [-1, 1]) {
    const e = e1.clone().multiplyScalar(sg), side = new THREE.Vector3().crossVectors(e, UP).normalize();
    const L = 7.6, H = 6.4, a = 0.55, pts = [];
    for (let i = 0; i <= 72; i++) {
      const th = (i / 72) * Math.PI * 2;
      const x = (L / 2) * (1 - Math.cos(th)), y = (H / 2) * Math.sin(th) * Math.sin(th / 2);
      const xr = x * Math.cos(a) - y * Math.sin(a), yr = x * Math.sin(a) + y * Math.cos(a);
      pts.push(K.clone().addScaledVector(e, xr + 0.5).addScaledVector(UP, yr + 0.55));
    }
    g.add(new THREE.Mesh(ribbonGeo(pts, side, 2.3), mat));
  }
  // хвосты вдоль рёбер пирамиды с V-вырезом
  const slope = SK.rise / (Math.hypot(SK.u1 - SK.u0, SK.v1 - SK.v0) / 2);
  for (const sg of [-1, 1]) {
    const e = e2.clone().multiplyScalar(sg), side = new THREE.Vector3().crossVectors(e, UP).normalize();
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const d = (i / 14) * 8.4;
      pts.push(K.clone().addScaledVector(e, d + 0.4).addScaledVector(UP, -d * slope - 0.08 + 0.22 * Math.sin((i / 14) * Math.PI)));
    }
    g.add(new THREE.Mesh(ribbonGeo(pts, side, 2.0, { notch: 1.0 }), mat));
  }
  // узел
  const kn = new THREE.Mesh(new THREE.SphereGeometry(1.25, 28, 18), mat);
  kn.scale.set(1.25, 0.9, 1.25); kn.rotation.y = Math.PI / 4;
  kn.position.copy(K).addScaledVector(UP, 0.6);
  g.add(kn);
  return g;
}

// ── Шары: латекс, «капля» с узелком; нитки — одним LineSegments на набор ──
function balloonGeo(r, hq) {
  const g = new THREE.SphereGeometry(r, hq ? 20 : 12, hq ? 16 : 9);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = y < 0 ? 1 - 0.3 * (-y / r) ** 2 : 1;
    p.setXYZ(i, p.getX(i) * k, y * 1.16, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  const knot = new THREE.ConeGeometry(r * 0.13, r * 0.2, 8);
  knot.translate(0, -r * 1.16 - r * 0.07, 0);
  return mergeGeometries([g, knot]);
}
function balloons(list, r, mat, stringMat, hq, seed) {
  const R = rng(seed);
  const g = new THREE.Group();
  if (!list.length) return g;
  const mesh = new THREE.InstancedMesh(balloonGeo(r, hq), mat, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  const lp = [];
  list.forEach((b, i) => {
    const s = b.s ?? 1;
    e.set((R() - 0.5) * 0.22, R() * 6.28, (R() - 0.5) * 0.22);
    q.setFromEuler(e);
    m4.compose(b.p, q, new THREE.Vector3(s, s, s));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.set(b.c));
    if (b.string !== false) {
      const top = b.p.clone().addScaledVector(UP, -r * 1.3 * s);
      const bot = b.anchor ?? top.clone().addScaledVector(UP, -(b.len ?? 1.4));
      lp.push(...top.toArray(), ...bot.toArray());
    }
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  g.add(mesh);
  if (lp.length) {
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    g.add(new THREE.LineSegments(lg, stringMat));
  }
  return g;
}
// Связка: n шаров на нитках от точки привязки A (u, v, z), парят на высоте h
function bunch(A, n, h, R, spread = 0.55, r = 0.3) {
  const out = [];
  const anchor = P(...A);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.6, d = spread * (0.35 + R() * 0.65);
    const p = P(A[0] + Math.cos(a) * d, A[1] + Math.sin(a) * d, A[2] + h + (R() - 0.5) * 0.7);
    out.push({ p, c: PAL[Math.floor(R() * PAL.length)], anchor, s: (r / 0.3) * (0.9 + R() * 0.2) });
  }
  return out;
}

// ── Флажки на провисающих нитках ──
function bunting(lines, hq, seed) {
  const R = rng(seed);
  const g = new THREE.Group();
  const flag = new THREE.BufferGeometry();
  flag.setAttribute('position', new THREE.Float32BufferAttribute([-0.19, 0, 0, 0.19, 0, 0, 0, -0.46, 0], 3));
  flag.computeVertexNormals();
  const items = [], lp = [];
  for (const [a, b, sag] of lines) {
    const A = P(...a), Bp = P(...b), n = Math.max(4, Math.round(A.distanceTo(Bp) / 0.5));
    const ang = Math.atan2(-(Bp.z - A.z), Bp.x - A.x);
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = A.clone().lerp(Bp, t);
      p.y -= sag * 4 * t * (1 - t);
      if (prev) lp.push(...prev.toArray(), ...p.toArray());
      prev = p;
      if (i > 0 && i < n) items.push({ p, ang });
    }
  }
  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.6 });
  const mesh = new THREE.InstancedMesh(flag, mat, items.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  items.forEach((it, i) => {
    q.setFromAxisAngle(UP, it.ang);
    m4.compose(it.p, q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.set(PAL[i % PAL.length]));
  });
  mesh.computeBoundingSphere();
  g.add(mesh);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xdddddd })));
  void hq; void R;
  return g;
}

// ── Конфетти на полу ──
function confetti(areas, seed) {
  const R = rng(seed);
  const pieces = [];
  for (const { rect: [u0, v0, u1, v1], z, n, skip } of areas) {
    for (let i = 0; i < n; i++) {
      const u = u0 + R() * (u1 - u0), v = v0 + R() * (v1 - v0);
      if (skip && skip(u, v)) continue;
      pieces.push([u, v, z]);
    }
  }
  const geo = new THREE.PlaneGeometry(0.07, 0.04); geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5, metalness: 0.2 }), pieces.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(), e = new THREE.Euler();
  pieces.forEach(([u, v, z], i) => {
    e.set((R() - 0.5) * 0.3, R() * 6.28, (R() - 0.5) * 0.3); q.setFromEuler(e);
    m4.compose(P(u, v, z + 0.006), q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, col.set(PAL[Math.floor(R() * PAL.length)]));
  });
  mesh.computeBoundingSphere();
  return mesh;
}

// Баннер-плоскость: A→C по низу (u, v), лицом влево от A→C, от z0 до z1
function banner(tex, A, C, z0, z1, off = 0.02) {
  const du = C[0] - A[0], dv = C[1] - A[1], len = Math.hypot(du, dv);
  const g = new THREE.PlaneGeometry(len, z1 - z0);
  // плоскость смотрит в +Z сцены; поворачиваем так, чтобы нормаль = влево от A→C
  const nu = -dv / len, nv = du / len;
  g.rotateY(Math.atan2(nu, -nv));
  const M = P((A[0] + C[0]) / 2 + nu * off, (A[1] + C[1]) / 2 + nv * off, (z0 + z1) / 2);
  g.translate(M.x, M.y, M.z);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.18 }));
  return m;
}

// ── Фейерверк: пул частиц, ракеты взлетают и раскрываются шарами искр ──
class Fireworks {
  constructor(hq) {
    const N = this.N = hq ? 2800 : 1400;
    this.pos = new Float32Array(N * 3); this.col = new Float32Array(N * 3); this.base = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3); this.age = new Float32Array(N).fill(1e9); this.life = new Float32Array(N).fill(1);
    this.rocket = new Uint8Array(N); this.burstCol = new Float32Array(N * 3);
    this.pos.fill(0); for (let i = 0; i < N; i++) this.pos[i * 3 + 1] = -1000;
    this.next = 0; this.timer = 0.2; this.R = rng(77);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: hq ? 1.6 : 2.0, map: ART.sparkSprite(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.cols = ['#ffd34d', '#2fd0b3', '#ff5fa2', '#8f7bff', '#ffffff', '#ff5a3a', '#6dff8a'].map((c) => new THREE.Color(c));
    this.cfg = { speed: 1, radius: [25, 80], height: [34, 74] };
    this.baseSize = this.points.material.size;
  }
  // настройка для съёмки: крупнее и ближе к зданию
  set({ size = 1, speed = 1, radius = [25, 80], height = [34, 74] } = {}) { this.points.material.size = this.baseSize * size; this.cfg = { speed, radius, height }; }
  alloc() { const i = this.next; this.next = (this.next + 1) % this.N; return i; }
  launch() {
    const R = this.R;
    const { radius: [r0, r1], height: [h0, h1] } = this.cfg;
    const ang = R() * Math.PI * 2, rad = r0 + R() * (r1 - r0);
    const T = P(27.6 + Math.cos(ang) * rad, 27.6 + Math.sin(ang) * rad, h0 + R() * (h1 - h0));
    const i = this.alloc(), k = i * 3, dur = 1.1 + R() * 0.5;
    this.pos[k] = T.x + (R() - 0.5) * 8; this.pos[k + 1] = sy(-1.5); this.pos[k + 2] = T.z + (R() - 0.5) * 8;
    this.vel[k] = (T.x - this.pos[k]) / dur; this.vel[k + 1] = (T.y - this.pos[k + 1]) / dur; this.vel[k + 2] = (T.z - this.pos[k + 2]) / dur;
    this.age[i] = 0; this.life[i] = dur; this.rocket[i] = 1;
    this.base[k] = 1.6; this.base[k + 1] = 1.2; this.base[k + 2] = 0.7;
    const c = this.cols[Math.floor(R() * this.cols.length)];
    this.burstCol[k] = c.r; this.burstCol[k + 1] = c.g; this.burstCol[k + 2] = c.b;
  }
  burst(x, y, z, r0, g0, b0) {
    const R = this.R, n = 130 + Math.floor(R() * 90), sp = (10 + R() * 6) * this.cfg.speed, ring = R() < 0.25;
    const two = R() < 0.35 ? this.cols[Math.floor(R() * this.cols.length)] : null;
    for (let j = 0; j < n; j++) {
      const i = this.alloc(), k = i * 3;
      let dx, dy, dz;
      if (ring) { const a = (j / n) * Math.PI * 2; dx = Math.cos(a); dy = (R() - 0.5) * 0.15; dz = Math.sin(a); }
      else { const u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u); dx = s * Math.cos(a); dy = u; dz = s * Math.sin(a); }
      const v = sp * (0.85 + R() * 0.3);
      this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
      this.vel[k] = dx * v; this.vel[k + 1] = dy * v; this.vel[k + 2] = dz * v;
      this.age[i] = 0; this.life[i] = 1.5 + R() * 1.0; this.rocket[i] = 0;
      const c = two && j % 2 ? two : null;
      this.base[k] = (c ? c.r : r0) * 2.4; this.base[k + 1] = (c ? c.g : g0) * 2.4; this.base[k + 2] = (c ? c.b : b0) * 2.4;
    }
  }
  update(dt, rate = 1) {
    const R = this.R;
    this.timer -= dt * rate;
    if (this.timer <= 0) { this.launch(); if (R() < 0.35) this.launch(); this.timer = 0.35 + R() * 0.75; }
    const { N, pos, vel, col, base, age, life } = this;
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      if (age[i] >= life[i]) { if (col[k] || col[k + 1] || col[k + 2]) { col[k] = col[k + 1] = col[k + 2] = 0; pos[k + 1] = -1000; } continue; }
      age[i] += dt;
      if (this.rocket[i]) {
        pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
        col[k] = base[k]; col[k + 1] = base[k + 1]; col[k + 2] = base[k + 2];
        if (age[i] >= life[i]) this.burst(pos[k], pos[k + 1], pos[k + 2], this.burstCol[k], this.burstCol[k + 1], this.burstCol[k + 2]);
        continue;
      }
      vel[k + 1] -= 5.2 * dt;
      const drag = 1 - 1.15 * dt;
      vel[k] *= drag; vel[k + 1] *= drag; vel[k + 2] *= drag;
      pos[k] += vel[k] * dt; pos[k + 1] += vel[k + 1] * dt; pos[k + 2] += vel[k + 2] * dt;
      const f = 1 - age[i] / life[i];
      const fl = f < 0.45 ? 0.45 + R() * 0.8 : 1;
      const a = f * f * fl;
      col[k] = base[k] * a; col[k + 1] = base[k + 1] * a; col[k + 2] = base[k + 2] * a;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

export function buildParty({ hq = true } = {}) {
  const R = rng(2110);
  const root = new THREE.Group();
  root.name = 'party';
  root.userData.noCollide = true;
  const parts = {};
  const add = (key, obj) => { (parts[key] ??= new THREE.Group()).add(obj); };

  // лента и бант
  const rtex = ART.ribbonTexture();
  const rmat = new THREE.MeshStandardMaterial({ map: rtex, side: THREE.DoubleSide, roughness: 0.32, metalness: 0.12, emissive: 0x5a0610, emissiveIntensity: 0.55 });
  add('roof', new THREE.Mesh(ribbonGeo(wrapAxis('v'), new THREE.Vector3(1, 0, 0), 2.4), rmat));
  add('roof', new THREE.Mesh(ribbonGeo(wrapAxis('u'), new THREE.Vector3(0, 0, 1), 2.4), rmat));
  add('roof', bow(rmat));

  // шары
  const bmat = hq ? new THREE.MeshPhysicalMaterial({ roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.15 }) : new THREE.MeshStandardMaterial({ roughness: 0.3 });
  const smat = new THREE.LineBasicMaterial({ color: 0xe8e8e8 });
  // арка у входной лестницы: грозди по 4 шара по полуэллипсу
  const arch = [];
  const au = 49.7, aa = 6.2, ah = 5.5, av = -7.7;
  const ARCH = ['#2fd0b3', '#ffffff', '#8f5bff', '#ffc83d'];
  for (let i = 0, n = 34; i <= n; i++) {
    const t = Math.PI * (1 - i / n), u = au + aa * Math.cos(t), z = -1.5 + ah * Math.sin(t);
    const nu = Math.cos(t) / aa, nz = Math.sin(t) / ah, nl = Math.hypot(nu, nz);
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      arch.push({ p: P(u + (nu / nl) * a * 0.26, av + b * 0.26, z + (nz / nl) * a * 0.26), c: ARCH[i % 4], string: false });
    }
  }
  add('ext', balloons(arch, 0.3, bmat, smat, hq, 11));
  // связки у колонн портика, у пандуса, по углам площади; гигантские шары на углах кровли
  const bn = [
    ...bunch([47.6, -2.2, 1.0], 8, 1.6, R), ...bunch([49.75, -2.2, 1.0], 8, 1.6, R),
    ...bunch([19.2, -2.3, 0.2], 7, 1.7, R), ...bunch([42.0, -9.4, -0.6], 9, 2.2, R), ...bunch([57.4, -9.4, -0.6], 9, 2.2, R),
  ];
  add('ext', balloons(bn, 0.3, bmat, smat, hq, 12));
  const roofB = [];
  for (const [u, v] of [[0.6, 0.6], [S - 0.6, 0.6], [0.6, S - 0.6], [S - 0.6, S - 0.6]]) roofB.push(...bunch([u, v, B.PARAPET_Z], 6, 5.5, R, 1.4, 0.75));
  add('roof', balloons(roofB, 0.3, bmat, smat, hq, 13));
  // внутри: под плитой лаунжа над атриумом, под потолками холла и лобби, в фонаре пирамиды
  const inWell = (u, v) => B.LOUNGE3.wells.some(([a, c, e, f]) => u > a - 0.4 && u < e + 0.4 && v > c - 0.4 && v < f + 0.4);
  const atr = [];
  while (atr.length < (hq ? 150 : 90)) {
    const u = 13.2 + R() * 16.8, v = 19.2 + R() * 16.8;
    if (inWell(u, v)) continue;
    atr.push({ p: P(u, v, 8.25 - R() * 0.35), c: PAL[Math.floor(R() * PAL.length)], len: 1.2 + R() * 0.8 });
  }
  add('atr', balloons(atr, 0.28, bmat, smat, hq, 14));
  const l1 = [];
  for (const [rect, n] of [[[43.2, 7.2, 54.0, 18.8], 45], [[31.2, 19.2, 47.8, 30.2], 55]]) {
    for (let i = 0; i < n; i++) l1.push({ p: P(rect[0] + R() * (rect[2] - rect[0]), rect[1] + R() * (rect[3] - rect[1]), 3.72 - R() * 0.25), c: PAL[Math.floor(R() * PAL.length)], len: 1.3 + R() * 0.6 });
  }
  add('L1', balloons(l1, 0.28, bmat, smat, hq, 15));
  const lan = [];
  while (lan.length < (hq ? 70 : 40)) {
    const u = SK.u0 + 0.8 + R() * (SK.u1 - SK.u0 - 1.6), v = SK.v0 + 0.8 + R() * (SK.v1 - SK.v0 - 1.6);
    const edge = Math.max(Math.abs(u - UC), Math.abs(v - VC)) / ((SK.u1 - SK.u0) / 2);
    const glass = SK.base + SK.rise * (1 - edge);
    lan.push({ p: P(u, v, Math.max(14.6, glass - 0.55 - R() * 1.5)), c: PAL[Math.floor(R() * PAL.length)], len: 1.4 + R() });
  }
  add('roof', balloons(lan, 0.28, bmat, smat, hq, 16));
  // связки у статуи на площадке
  const plat = [...bunch([14.2, 24.6, 3.3], 7, 1.3, R), ...bunch([14.2, 28.0, 3.3], 7, 1.3, R)];
  add('M', balloons(plat, 0.28, bmat, smat, hq, 17));

  // флажки: над атриумом по диагоналям на уровне парапетов 2 этажа, по краю козырька,
  // между колоннами площадки и под пирамидой лаунжа
  add('atr', bunting([[[12.9, 18.9, 7.4], [30.3, 36.3, 7.4], 0.8], [[12.9, 36.3, 7.4], [30.3, 18.9, 7.4], 0.8]], hq, 21));
  add('ext', bunting([[[41.9, -6.75, 3.25], [55.0, -6.75, 3.25], 0.45]], hq, 22));
  add('roof', bunting([[[SK.u0 + 0.6, SK.v0 + 0.6, 16.9], [SK.u1 - 0.6, SK.v1 - 0.6, 16.9], 1.3], [[SK.u0 + 0.6, SK.v1 - 0.6, 16.9], [SK.u1 - 0.6, SK.v0 + 0.6, 16.9], 1.3]], hq, 24));

  // конфетти
  const far = (u, v) => Math.hypot(u - B.AMPHI.c[0], v - B.AMPHI.c[1]) < B.AMPHI.walk[1] + 0.8;
  add('ext', confetti([
    { rect: [37.5, -15.5, 58.5, -7.4], z: -1.5, n: hq ? 2600 : 1400 },
    { rect: [43.2, 0.4, 54.8, 6.2], z: 0, n: hq ? 500 : 250 },
  ], 31));
  add('M', confetti([{ rect: [13.2, 19.2, 25.8, 32.0], z: B.PLATFORM.z, n: hq ? 900 : 450 }], 32));
  add('L3', confetti([{ rect: [12.8, 18.8, 30.4, 36.4], z: 9.0 + B.LOUNGE3.podium, n: hq ? 700 : 350, skip: inWell }], 33));
  add('B1', confetti([{ rect: [12.8, 18.8, 30.4, 36.4], z: B.AMPHI.floorZ, n: hq ? 500 : 250, skip: far }], 34));

  // баннеры «С днём рождения, School 21!»
  const big = ART.birthdayBanner();
  add('band3', banner(big, [34.2, -0.5], [23.2, -0.5], 8.95, 11.55));
  add('band3', banner(big, [S + 0.5, 20.5], [S + 0.5, 9.5], 8.95, 11.55));
  add('atr', banner(ART.birthdayBanner({ oneLine: true }), [13.6, 18.95], [25.6, 18.95], 4.52, 5.62, 0.01));

  for (const [k, g] of Object.entries(parts)) { g.name = `party-${k}`; root.add(g); }
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  parts.roof.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) o.castShadow = true; });

  const fw = new Fireworks(hq);
  root.add(fw.points);

  return {
    group: root,
    update(dt, rate = 1) { fw.update(dt, rate); },
    setFireworks(o) { fw.set(o); },
    setCut(cut) {
      const ci = cut ? ORDER.indexOf(cut) : ORDER.length;
      const show = { roof: !cut, band3: !cut || ci >= 4, ext: cut !== 'B1', L1: ci >= 1, M: ci >= 2, atr: ci >= 3, L3: ci >= 4, B1: true };
      for (const [k, g] of Object.entries(parts)) g.visible = show[k] ?? true;
    },
  };
}
