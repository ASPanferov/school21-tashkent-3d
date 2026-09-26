// Геометрические утилиты: перевод координат здания (u, v, z) в сцену Three.js
// и «батчер», который склеивает статическую геометрию по материалам,
// чтобы держать число draw calls низким.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SIZE, GRADE } from '../data/building.js';

export const C = SIZE / 2;

// Сцена: X — вдоль главного фасада (u), Y — вверх (0 = тротуар), Z — к зрителю (−v).
export const sx = (u) => u - C;
export const sy = (z) => z - GRADE;
export const sz = (v) => C - v;
export const P = (u, v, z) => new THREE.Vector3(sx(u), sy(z), sz(v));

// Коробка с UV в метрах — текстуры ложатся в реальном масштабе на любой грани.
export function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + w / 2, y = pos.getY(i) + h / 2, z = pos.getZ(i) + d / 2;
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    if (nx > 0.5) uv.setXY(i, z, y);
    else if (ny > 0.5) uv.setXY(i, x, z);
    else uv.setXY(i, x, y);
  }
  return g;
}

// Коробка по координатам здания: [u0,u1] × [v0,v1] × [z0,z1]
export function boxUVZ(u0, v0, z0, u1, v1, z1) {
  const w = Math.abs(u1 - u0), d = Math.abs(v1 - v0), h = Math.abs(z1 - z0);
  const g = boxGeo(Math.max(w, 1e-3), Math.max(h, 1e-3), Math.max(d, 1e-3));
  g.translate(sx((u0 + u1) / 2), sy((z0 + z1) / 2), sz((v0 + v1) / 2));
  return g;
}

// Плита с отверстиями. outer/holes — массивы [u, v]. z — низ плиты, t — толщина.
export function slabGeo(outer, holes, z, t) {
  const shape = new THREE.Shape(outer.map(([u, v]) => new THREE.Vector2(sx(u), -sz(v))));
  for (const h of holes || []) shape.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(sx(u), -sz(v)))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  // Extrude идёт вдоль +Z; поворачиваем так, чтобы толщина шла вверх
  g.rotateX(-Math.PI / 2);
  g.translate(0, sy(z), 0);
  // UV в метрах по плану
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i), -pos.getZ(i));
  return g;
}

export const rectPts = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

// Батчер: копим геометрию по ключу материала, в конце склеиваем в меши.
export class Batch {
  constructor(materials) { this.materials = materials; this.parts = new Map(); }
  add(key, geo) {
    if (!geo) return;
    if (!this.parts.has(key)) this.parts.set(key, []);
    // приводим к общему набору атрибутов
    if (geo.index) geo = geo.toNonIndexed();
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    geo.morphAttributes = {};
    geo.clearGroups();
    this.parts.get(key).push(geo);
  }
  box(key, u0, v0, z0, u1, v1, z1) { this.add(key, boxUVZ(u0, v0, z0, u1, v1, z1)); }
  build(name = 'batch', { castShadow = true, receiveShadow = true } = {}) {
    const group = new THREE.Group();
    group.name = name;
    for (const [key, geos] of this.parts) {
      const mat = this.materials.get(key);
      if (!mat) { console.warn('нет материала', key); continue; }
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `${name}:${key}`;
      const transparent = mat.transparent || mat.transmission > 0;
      mesh.castShadow = castShadow && !transparent && !mat.userData.noShadow;
      mesh.receiveShadow = receiveShadow;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

// Инстансинг: копим матрицы, в конце создаём InstancedMesh
export class Instancer {
  constructor(geometry, material, name) { this.geometry = geometry; this.material = material; this.name = name; this.items = []; }
  push(matrix, color) { this.items.push([matrix.clone(), color ? new THREE.Color(color) : null]); }
  build({ castShadow = true, receiveShadow = true } = {}) {
    if (!this.items.length) return null;
    const m = new THREE.InstancedMesh(this.geometry, this.material, this.items.length);
    m.name = this.name;
    this.items.forEach(([mat, col], i) => {
      m.setMatrixAt(i, mat);
      if (col) m.setColorAt(i, col);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.castShadow = castShadow;
    m.receiveShadow = receiveShadow;
    m.computeBoundingSphere();
    return m;
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
// Матрица для инстанса: позиция в координатах здания, поворот вокруг вертикали (рад, от оси u), масштаб
export function mtx(u, v, z, rotY = 0, scale = [1, 1, 1]) {
  _e.set(0, rotY, 0);
  _q.setFromEuler(_e);
  _s.set(scale[0], scale[1], scale[2]);
  return _m.compose(P(u, v, z), _q, _s);
}

// Детерминированный генератор случайных чисел (чтобы модель не «прыгала» при пересборке)
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
