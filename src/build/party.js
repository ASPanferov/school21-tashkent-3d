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
function banner(tex, A, C, z0, z1, off = 0.02, glow = 0.18) {
  const du = C[0] - A[0], dv = C[1] - A[1], len = Math.hypot(du, dv);
  const g = new THREE.PlaneGeometry(len, z1 - z0);
  // плоскость смотрит в +Z сцены; поворачиваем так, чтобы нормаль = влево от A→C
  const nu = -dv / len, nv = du / len;
  g.rotateY(Math.atan2(nu, -nv));
  const M = P((A[0] + C[0]) / 2 + nu * off, (A[1] + C[1]) / 2 + nv * off, (z0 + z1) / 2);
  g.translate(M.x, M.y, M.z);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: glow }));
  return m;
}

// ── Фольгированные цифры «2» и «1» (высота 1 в единицах формы, ширина по x) ──
function digitShape(d) {
  const s = new THREE.Shape();
  if (d === '1') {
    s.moveTo(0.14, 0); s.lineTo(0.4, 0); s.lineTo(0.4, 1); s.lineTo(0.24, 1); s.lineTo(0.0, 0.8);
    s.lineTo(0.06, 0.66); s.lineTo(0.14, 0.72); s.lineTo(0.14, 0);
  } else {
    s.moveTo(0, 0); s.lineTo(0.66, 0); s.lineTo(0.66, 0.2); s.lineTo(0.31, 0.2);
    s.bezierCurveTo(0.45, 0.33, 0.62, 0.45, 0.64, 0.66);
    s.bezierCurveTo(0.66, 0.88, 0.52, 1.0, 0.33, 1.0);
    s.bezierCurveTo(0.14, 1.0, 0.03, 0.88, 0.02, 0.72);
    s.lineTo(0.22, 0.7);
    s.bezierCurveTo(0.23, 0.78, 0.27, 0.81, 0.33, 0.81);
    s.bezierCurveTo(0.4, 0.81, 0.45, 0.76, 0.45, 0.67);
    s.bezierCurveTo(0.45, 0.55, 0.3, 0.42, 0.0, 0.17);
    s.lineTo(0, 0);
  }
  return s;
}
// «21» из фольги: h — высота, стоит на полу в (u, v, z) лицом в сторону +u (читается слева направо по +v)
function foil21(h, mat) {
  const parts = [];
  let x = 0;
  for (const d of ['2', '1']) {
    const g = new THREE.ExtrudeGeometry(digitShape(d), { depth: 0.1, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.055, bevelSegments: 5, curveSegments: 18 });
    g.translate(x, 0.055, 0);
    parts.push(g);
    x += d === '2' ? 0.78 : 0.5;
  }
  const g = mergeGeometries(parts);
  g.translate(-x / 2, 0, -0.05);
  g.scale(h, h, h);
  g.rotateY(Math.PI / 2);                    // x формы → −Z сцены (+v), выдавливание → +X сцены (+u)
  return new THREE.Mesh(g, mat);
}
// Трёхъярусный торт со свечами и «21» наверху, на круглом столе со скатертью
function cake(u, v, z, fmat) {
  const g = new THREE.Group();
  const at = (o, dz) => { const p = P(u, v, z + dz); o.position.copy(p); g.add(o); return o; };
  const cloth = new THREE.MeshStandardMaterial({ color: 0xf4f1ee, roughness: 0.85 });
  at(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.76, 40), cloth), 0.38);
  at(new THREE.Mesh(new THREE.CylinderGeometry(0.565, 0.565, 0.1, 40, 1, true), new THREE.MeshStandardMaterial({ color: 0x2fd0b3, roughness: 0.6, side: THREE.DoubleSide })), 0.06);
  const tiers = [[0.3, 0.16, 0xfbf4f0], [0.23, 0.15, 0xffd3e2], [0.16, 0.14, 0xfbf4f0]];
  let h = 0.76;
  for (const [r, th, c] of tiers) {
    at(new THREE.Mesh(new THREE.CylinderGeometry(r, r, th, 40), new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 })), h + th / 2);
    at(new THREE.Mesh(new THREE.TorusGeometry(r, 0.014, 8, 40).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2fd0b3, roughness: 0.4 })), h + 0.02);
    h += th;
  }
  const wax = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const flame = new THREE.MeshStandardMaterial({ color: 0xffc46b, emissive: 0xffa64a, emissiveIntensity: 3.2 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, r = 0.2;
    const cu = u + Math.cos(a) * r, cv = v + Math.sin(a) * r;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 8), wax); c.position.copy(P(cu, cv, z + 0.76 + 0.16 + 0.045)); g.add(c);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6).scale(1, 1.8, 1), flame); f.position.copy(P(cu, cv, z + 0.76 + 0.16 + 0.1)); g.add(f);
  }
  const top = foil21(0.16, fmat);
  top.position.copy(P(u, v, z + h + 0.01)); g.add(top);
  return g;
}
// Подарки: коробки с лентами крест-накрест
function gifts(list) {
  const g = new THREE.Group();
  for (const [u, v, z, w, d, hh, col, rib] of list) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), new THREE.MeshStandardMaterial({ color: col, roughness: 0.45 }));
    box.position.copy(P(u, v, z + hh / 2)); g.add(box);
    const rm = new THREE.MeshStandardMaterial({ color: rib, roughness: 0.35, metalness: 0.2 });
    for (const [a, b] of [[w + 0.004, 0.05], [0.05, d + 0.004]]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(a, hh + 0.004, b), rm); r.position.copy(P(u, v, z + hh / 2)); g.add(r);
    }
    const bw = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 16), rm);
    bw.position.copy(P(u, v, z + hh + 0.04)); bw.rotation.y = 0.6; g.add(bw);
  }
  return g;
}
// Гирлянда-огоньки: тёплые точки по провисающим дугам (a → b, провис sag), шаг step
function fairy(lines, step = 0.11) {
  const pts = [];
  for (const [a, b, sag] of lines) {
    const A = P(...a), Bp = P(...b), n = Math.max(2, Math.round(A.distanceTo(Bp) / step));
    for (let i = 0; i <= n; i++) { const t = i / n, p = A.clone().lerp(Bp, t); p.y -= sag * 4 * t * (1 - t); pts.push(p); }
  }
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.016, 6, 4), new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffc27a, emissiveIntensity: 2.6 }), pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); mesh.setMatrixAt(i, m4); });
  mesh.computeBoundingSphere();
  return mesh;
}

// ── Цветная подсветка фасада: аддитивные «мазки света» снизу вверх (без настоящих источников) ──
function washTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(64, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 64; x++) {
    const h = 1 - y / 255, w = 1 - Math.abs(x - 31.5) / 32;
    const a = Math.pow(Math.max(0, h), 1.6) * Math.pow(Math.max(0, w), 0.8) * (0.55 + 0.45 * Math.exp(-((1 - h) * 7)));
    const i = (y * 64 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * Math.min(1, a));
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function washes(list) {
  const tex = washTexture(), g = new THREE.Group(), mats = [];
  for (const [u0, u1, v, z0, z1, col] of list) {
    const m = new THREE.MeshBasicMaterial({ map: tex, color: col, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    m.userData.baseOpacity = 0.6; mats.push(m);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(u1 - u0, z1 - z0), m);
    pl.position.copy(P((u0 + u1) / 2, v, (z0 + z1) / 2));
    // PlaneGeometry смотрит в +Z сцены, то есть в −v — на площадь
    pl.renderOrder = 2;
    g.add(pl);
  }
  g.userData.mats = mats;
  return g;
}

// ── Падающее конфетти в зале: точки-«бумажки» медленно кружатся и падают, внизу возвращаются под потолок ──
class ConfettiRain {
  constructor(rect, z0, z1, n) {
    this.rect = rect; this.z0 = z0; this.z1 = z1; this.n = n; this.R = rng(612);
    const pos = this.pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    this.ph = new Float32Array(n); this.sp = new Float32Array(n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      this.spawn(i, z0 + this.R() * (z1 - z0));
      c.set(PAL[i % PAL.length]); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      this.ph[i] = this.R() * 6.28; this.sp[i] = 0.45 + this.R() * 0.5;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.038, vertexColors: true, sizeAttenuation: true }));
    this.points.frustumCulled = false;
    this.t = 0;
  }
  spawn(i, z) {
    const [u0, v0, u1, v1] = this.rect, p = P(u0 + this.R() * (u1 - u0), v0 + this.R() * (v1 - v0), z);
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
  }
  update(dt) {
    this.t += dt;
    const { pos, n, ph, sp } = this, yb = sy(this.z0);
    for (let i = 0; i < n; i++) {
      const k = i * 3, w = this.t * 2.2 + ph[i];
      pos[k] += Math.cos(w) * 0.35 * dt; pos[k + 2] += Math.sin(w * 0.8) * 0.35 * dt;
      pos[k + 1] -= sp[i] * (0.75 + 0.25 * Math.sin(w * 1.7)) * dt;
      if (pos[k + 1] < yb) this.spawn(i, this.z1);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

// ── Лучи прожекторов: конусы с аддитивным градиентом, концы гуляют по сцене ──
function beamTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function lightBeams(src, z, colors, aim) {
  const group = new THREE.Group(), tex = beamTexture(), items = [];
  src.forEach(([u, v], i) => {
    const len = 16, geo = new THREE.ConeGeometry(1.1, len, 24, 1, true);
    geo.translate(0, -len / 2, 0);                    // вершина в начале координат, конус вниз по −Y
    geo.rotateX(-Math.PI / 2);                        // ось вдоль −Z: удобно для lookAt
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[i % colors.length], map: tex, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.position.copy(P(u, v, z));
    m.renderOrder = 3;
    group.add(m); items.push({ m, ph: i * 1.7, v });
  });
  const tgt = new THREE.Vector3();
  return {
    group,
    update(t) {
      for (const it of items) {
        tgt.copy(P(aim[0] + 1.4 * Math.sin(t * 0.5 + it.ph), aim[1] + 3.2 * Math.sin(t * 0.37 + it.ph * 1.3), 1.2 + 0.8 * Math.sin(t * 0.61 + it.ph)));
        it.m.lookAt(tgt); it.m.rotateY(Math.PI);        // lookAt направляет +Z, а конус смотрит в −Z
      }
    },
  };
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
    this.onBurst = null;                                   // для съёмки: звук взрывов по кадрам
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
    this.onBurst?.(x, y, z);
    const R = this.R, n = 130 + Math.floor(R() * 90), sp = (10 + R() * 6) * this.cfg.speed, ring = R() < 0.25;
    const two = R() < 0.35 ? this.cols[Math.floor(R() * this.cols.length)] : null;
    // кольцо — в наклонной вертикальной плоскости (плашмя оно выглядит сбоку как светящаяся плашка)
    const yaw = R() * Math.PI * 2, tilt = (R() - 0.5) * 0.9, cy = Math.cos(yaw), sy2 = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    for (let j = 0; j < n; j++) {
      const i = this.alloc(), k = i * 3;
      let dx, dy, dz;
      if (ring) {
        const a = (j / n) * Math.PI * 2, x = Math.cos(a), y = Math.sin(a) * ct, z = Math.sin(a) * st + (R() - 0.5) * 0.08;
        dx = x * cy - z * sy2; dy = y; dz = x * sy2 + z * cy;
      }
      else { const u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u); dx = s * Math.cos(a); dy = u; dz = s * Math.sin(a); }
      const v = sp * (0.85 + R() * 0.3), off = 0.25 + R() * 0.45;     // старт из небольшой сферы, а не из точки
      this.pos[k] = x + dx * off; this.pos[k + 1] = y + dy * off; this.pos[k + 2] = z + dz * off;
      this.vel[k] = dx * v; this.vel[k + 1] = dy * v; this.vel[k + 2] = dz * v;
      this.age[i] = 0; this.life[i] = 1.5 + R() * 1.0; this.rocket[i] = 0;
      const c = two && j % 2 ? two : null;
      this.base[k] = (c ? c.r : r0) * 2.0; this.base[k + 1] = (c ? c.g : g0) * 2.0; this.base[k + 2] = (c ? c.b : b0) * 2.0;
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
      const a = f * f * fl * Math.min(1, age[i] / 0.18) ** 2;   // вспышка разгорается, пока искры не разлетелись
      col[k] = base[k] * a; col[k + 1] = base[k + 1] * a; col[k + 2] = base[k + 2] * a;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}

export function buildParty({ hq = true } = {}) {
  const R = rng(2110);
  let rain = null, beams = null, tt = 0;
  const screen = ART.birthdayScreen({ live: hq });
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

  // ── Ивент-холл 1 этажа (общий зал): рамка из шаров вокруг экрана, «21» из фольги, торт и подарки,
  // шары под потолком, флажки зигзагом, гирлянды-огоньки, поздравление на экране и телевизорах ──
  const hall = B.ZONES.find((z) => z.id === 'l1-conf');
  if (hall) {
    const [hu0, hv0, hu1, hv1] = hall.rect, htop = B.LEVELS.find((l) => l.id === 'L1').top;
    const su = hu0 + 0.39, sv0 = 5.8, sv1 = 10.8, sz0 = 0.6, sz1 = 3.15;       // LED-экран на ЮЗ стене
    add('L1', banner(screen.texture, [su + 0.012, sv1], [su + 0.012, sv0], sz0, sz1, 0, 1.0));
    for (const v of [6.6, 12.6]) add('L1', banner(screen.texture, [18.6 + 0.35 + 0.066, v + 0.56], [18.6 + 0.35 + 0.066, v - 0.56], 2.3, 2.95, 0, 1.0));
    // трибуна ведущего со знаком «21»
    const lec = new THREE.Group();
    const lb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.12, 0.45), new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.5 }));
    lb.position.y = 0.56; lec.add(lb);
    const lt = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.04, 0.52), new THREE.MeshStandardMaterial({ color: 0x2b2d33, roughness: 0.4 }));
    lt.position.y = 1.14; lt.rotation.x = -0.12; lec.add(lt);
    const lp = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshStandardMaterial({ map: ART.logo21Texture(), emissive: 0xffffff, emissiveMap: ART.logo21Texture(), emissiveIntensity: 0.6, transparent: true }));
    lp.position.set(0, 0.72, 0.226); lec.add(lp);
    lec.position.copy(P(hu0 + 2.35, 5.5, 0)); lec.rotation.y = Math.PI / 2;
    add('L1', lec);
    // лучи прожекторов из-под потолка у задней стены — медленно гуляют по сцене
    beams = lightBeams([[hu1 - 2.6, 2.4], [hu1 - 2.6, 6.2], [hu1 - 2.6, 10.4], [hu1 - 2.6, 14.0]], htop - 0.2, ['#2fd0b3', '#b28bff', '#ff5fa2', '#ffd34d'], [hu0 + 1.2, (sv0 + sv1) / 2]);
    add('L1', beams.group);
    // рамка-гирлянда: от пола вверх по краю экрана, аркой над ним и вниз
    const G = [];
    const path = [];
    const gl = sv0 - 0.75, gr = sv1 + 0.75, gtop = 3.62;
    for (let z = 0.15; z < gtop - 0.3; z += 0.06) path.push([gl, z]);
    for (let a = Math.PI; a >= 0; a -= 0.02) path.push([(gl + gr) / 2 + Math.cos(a) * (gr - gl) / 2, gtop - 0.3 + Math.sin(a) * 0.3 + (1 - Math.abs(Math.cos(a))) * 0.02]);
    for (let z = gtop - 0.3; z > 0.15; z -= 0.06) path.push([gr, z]);
    const FR = ['#2fd0b3', '#ffffff', '#8f5bff', '#ffc83d', '#2fd0b3', '#ffffff', '#b8a6ff'];
    for (let i = 0; i < path.length; i += 2) {
      const [v, z] = path[i];
      for (let k = 0; k < 2; k++) {
        const r = 0.09 + R() * 0.16;
        G.push({ p: P(hu0 + 0.62 + R() * 0.34, v + (R() - 0.5) * 0.34, z + (R() - 0.5) * 0.3), c: FR[Math.floor(R() * FR.length)], string: false, s: r / 0.28 });
      }
    }
    add('L1', balloons(G, 0.28, bmat, smat, hq, 41));
    // «21» из фольги слева от экрана (со стороны зала), торт по центру перед экраном, подарки справа
    const gold = new THREE.MeshStandardMaterial({ color: 0xf2c86a, metalness: 1, roughness: 0.2, envMapIntensity: 1.2 });
    const num = foil21(1.55, gold);
    num.position.copy(P(hu0 + 1.35, 3.1, 0.02));
    add('L1', num);
    add('L1', cake(hu0 + 2.95, (sv0 + sv1) / 2, 0, gold));
    add('L1', gifts([
      [hu0 + 1.3, 12.2, 0, 0.5, 0.5, 0.42, 0x8f5bff, 0xffc83d], [hu0 + 1.85, 12.55, 0, 0.36, 0.36, 0.3, 0x2fd0b3, 0xffffff],
      [hu0 + 1.25, 12.8, 0, 0.3, 0.3, 0.26, 0xff5fa2, 0xffffff], [hu0 + 1.3, 12.2, 0.42, 0.3, 0.3, 0.24, 0xffc83d, 0x8f5bff],
      [hu0 + 2.35, 12.1, 0, 0.28, 0.28, 0.22, 0xffffff, 0xff5fa2],
    ]));
    // шары под потолком с нитками
    const ceil = [];
    for (let i = 0; i < (hq ? 110 : 60); i++) {
      const u = hu0 + 3.4 + R() * (hu1 - hu0 - 3.9), v = hv0 + 0.5 + R() * (hv1 - hv0 - 1.0);
      ceil.push({ p: P(u, v, htop - 0.42 - R() * 0.22), c: PAL[Math.floor(R() * PAL.length)], len: 1.1 + R() * 0.9 });
    }
    add('L1', balloons(ceil, 0.28, bmat, smat, hq, 42));
    // связки у колонн и у кресел вдоль прохода
    const hb = [];
    for (const [u, v] of [[18.6, 6.6], [18.6, 12.6], [24.6, 6.6], [24.6, 12.6]]) hb.push(...bunch([u + 0.42, v - 0.42, 1.0], 6, 1.5, R, 0.45));
    for (const u of [18.1, 22.9, 27.6]) hb.push(...bunch([u, 8.02, 0.85], 3, 1.1, R, 0.25, 0.24), ...bunch([u, 8.58, 0.85], 3, 1.1, R, 0.25, 0.24));
    add('L1', balloons(hb, 0.28, bmat, smat, hq, 43));
    // флажки зигзагом через весь зал и огоньки: занавес по бокам экрана и дуги по стенам
    add('L1', bunting([[[hu0 + 1.2, hv0 + 0.6, htop - 0.3], [19.6, hv1 - 0.5, htop - 0.3], 0.5], [[19.6, hv1 - 0.5, htop - 0.3], [25.0, hv0 + 0.6, htop - 0.3], 0.5],
      [[25.0, hv0 + 0.6, htop - 0.3], [hu1 - 0.4, hv1 - 0.5, htop - 0.3], 0.5]], hq, 44));
    const fl = [];
    for (const [a, b] of [[3.55, sv0 - 1.05], [sv1 + 1.05, 13.25]]) for (let v = a; v <= b + 1e-6; v += 0.24) fl.push([[su - 0.04, v, htop - 0.12], [su - 0.04, v, 0.35], 0]);
    for (let v = hv0 + 0.4; v < hv1 - 0.6; v += 1.6) {
      fl.push([[hu1 - 0.25, v, htop - 0.15], [hu1 - 0.25, v + 1.6, htop - 0.15], 0.32]);
      fl.push([[su - 0.02, v, htop - 0.08], [su - 0.02, v + 1.6, htop - 0.08], 0.22]);
    }
    add('L1', fairy(fl));
    add('L1', confetti([{ rect: [hu0 + 0.5, hv0 + 0.3, hu1 - 0.3, hv1 - 0.3], z: 0, n: hq ? 1400 : 700 }], 45));
    rain = new ConfettiRain([hu0 + 0.6, hv0 + 0.5, hu1 - 0.4, hv1 - 0.4], 0.05, htop - 0.15, hq ? 2200 : 1000);
    add('L1', rain.points);
    // вход из фойе: арка из шаров вокруг двустворчатой двери и связки по сторонам
    const door = B.DOORS.find((d) => d.level === 'L1' && Math.abs(d.at[0] - hu1) < 0.05 && d.kind === 'double');
    if (door) {
      const dv = door.at[1], hw = door.w / 2 + 0.35, dh = 2.62, da = [];
      for (let a = 0; a <= Math.PI + 1e-6; a += Math.PI / 30) {
        const v = dv + Math.cos(a) * hw, z = dh - 0.42 + Math.sin(a) * 0.55;
        for (let k = 0; k < 3; k++) da.push({ p: P(hu1 + 0.3 + R() * 0.2, v + (R() - 0.5) * 0.24, z + (R() - 0.5) * 0.24), c: FR[Math.floor(R() * FR.length)], string: false, s: (0.12 + R() * 0.12) / 0.28 });
      }
      for (let z = 0.15; z < dh - 0.42; z += 0.12) for (const v of [dv - hw, dv + hw]) for (let k = 0; k < 2; k++) {
        da.push({ p: P(hu1 + 0.3 + R() * 0.2, v + (R() - 0.5) * 0.24, z + (R() - 0.5) * 0.1), c: FR[Math.floor(R() * FR.length)], string: false, s: (0.11 + R() * 0.12) / 0.28 });
      }
      add('L1', balloons(da, 0.28, bmat, smat, hq, 46));
      add('L1', balloons([...bunch([hu1 + 1.6, dv - 2.2, 0.4], 7, 1.8, R, 0.5), ...bunch([hu1 + 1.4, dv + 0.9, 0.4], 5, 1.6, R, 0.4)], 0.28, bmat, smat, hq, 47));
    }
  }

  // ── Амфитеатр: поздравление на экране, связки у парапета кольца, шары под площадкой, флажки ──
  {
    const A = B.AMPHI, [[x0, y0], [x1, y1]] = A.screen, C = A.c;
    const L = Math.hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / L, dy = (y1 - y0) / L, mu = (x0 + x1) / 2, mv = (y0 + y1) / 2;
    add('B1', banner(screen.texture, [mu - dx * 2.2, mv - dy * 2.2], [mu + dx * 2.2, mv + dy * 2.2], A.stageZ + 0.95, A.stageZ + 3.35, 0.185, 1.0));
    const inside = (u, v) => u > A.clip.u + 0.3 && v > A.clip.v + 0.3;
    const ring = [];
    for (let a = -18; a <= 118; a += 17) {
      const r = A.walk[1] - 0.2, u = C[0] + Math.cos((a * Math.PI) / 180) * r, v = C[1] + Math.sin((a * Math.PI) / 180) * r;
      if (inside(u, v)) ring.push(...bunch([u, v, A.walkZ + 1.05], 5, 1.0, R, 0.4, 0.26));
    }
    // связки по краям проходов-лестниц: на каждом втором ряду, с двух сторон прохода
    const aisle = [];
    const [au, av] = A.aisles;
    for (let k = 0; k < A.rows.length - 1; k += 2) {
      const rm = (A.rows[k] + A.rows[k + 1]) / 2, zt = A.stageZ + A.rowRise * (k + 1);
      // вдоль одного прохода (второй остаётся свободным — по нему удобно подниматься к кольцу)
      for (const side of [-1, 1]) aisle.push(...bunch([C[0] + rm, side < 0 ? av.from - 0.22 : av.to + 0.22, zt + 0.1], 3, 1.0, R, 0.22, 0.24));
      void au;
    }
    add('B1', balloons([...ring, ...aisle], 0.28, bmat, smat, hq, 51));
    const bz = B.PLATFORM.z - 0.5;
    add('B1', bunting([[[14.3, 22.9, bz], [22.6, 30.8, bz], 0.45], [[16.9, 20.6, bz], [25.6, 25.4, bz], 0.4]], hq, 52));
  }

  // флажки: над атриумом по диагоналям на уровне парапетов 2 этажа, по краю козырька,
  // между колоннами площадки и под пирамидой лаунжа
  add('atr', bunting([[[12.9, 18.9, 7.4], [30.3, 36.3, 7.4], 0.8], [[12.9, 36.3, 7.4], [30.3, 18.9, 7.4], 0.8]], hq, 21));
  add('ext', bunting([[[41.9, -6.75, 3.25], [55.0, -6.75, 3.25], 0.45]], hq, 22));
  add('roof', bunting([[[SK.u0 + 0.6, SK.v0 + 0.6, 16.9], [SK.u1 - 0.6, SK.v1 - 0.6, 16.9], 1.3], [[SK.u0 + 0.6, SK.v1 - 0.6, 16.9], [SK.u1 - 0.6, SK.v0 + 0.6, 16.9], 1.3]], hq, 24));

  // цветная подсветка главного фасада: башня — бирюзой, рама портала и угол — фиолетовым и розовым
  const wash = washes([
    [35.1, 38.3, -0.26, -1.4, 10.5, 0x2fd0b3], [38.9, 42.1, -0.26, -1.4, 10.5, 0x2fd0b3],
    [16.1, 18.5, -0.06, -1.4, 9.5, 0x8f5bff], [32.6, 35.0, -0.06, -1.4, 9.5, 0xff5fa2],
    [0.0, 1.3, -0.32, -1.4, 9.0, 0x8f5bff], [8.4, 11.2, -0.06, -1.4, 7.5, 0x3d8bff],
  ]);
  add('ext', wash);
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
  const outside = new Set(['roof', 'band3', 'ext']);
  for (const [k, g] of Object.entries(parts)) g.traverse((o) => { if (o.material && !outside.has(k)) o.material.userData.env = 'int'; });
  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  parts.roof.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) o.castShadow = true; });

  const fw = new Fireworks(hq);
  root.add(fw.points);

  return {
    group: root,
    update(dt, rate = 1) {
      tt += dt;
      fw.update(dt, rate);
      if (rain?.points.parent?.visible) { rain.update(dt); beams?.update(tt); }
      screen.update(tt);
    },
    setFireworks(o) { fw.set(o); },
    onBurst(fn) { fw.onBurst = fn; },
    // сила подсветки фасада по времени суток: днём не видна
    setGlow(t) { const k = { day: 0, eve: 0.45, dusk: 0.9, night: 1 }[t] ?? 1; for (const m of wash.userData.mats) { m.opacity = m.userData.baseOpacity * k; m.visible = k > 0; } },
    setCut(cut) {
      const ci = cut ? ORDER.indexOf(cut) : ORDER.length;
      const show = { roof: !cut, band3: !cut || ci >= 4, ext: cut !== 'B1', L1: ci >= 1, M: ci >= 2, atr: ci >= 3, L3: ci >= 4, B1: true };
      for (const [k, g] of Object.entries(parts)) g.visible = show[k] ?? true;
    },
  };
}
