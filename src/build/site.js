// Участок и окружение: земля, дороги и тротуары из OSM, соседние здания,
// деревья, машины на парковках, круглая клумба у входа.
import * as THREE from 'three';
import { Batch, Instancer, P, sx, sy, sz, mtx, rng } from '../lib/geom.js';
import { SIZE, GRADE, ENTRANCE } from '../data/building.js';
import { CONTEXT } from '../data/context.js';
import * as F from './furniture.js';

const G = GRADE; // отметка земли

const insideFoot = (u, v) => u > -0.3 && u < SIZE + 0.3 && v > -0.3 && v < SIZE + 0.3;
function ribbon(batch, key, pts, w, y) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [u0, v0] = pts[i], [u1, v1] = pts[i + 1];
    if (insideFoot(u0, v0) || insideFoot(u1, v1) || insideFoot((u0 + u1) / 2, (v0 + v1) / 2)) continue;
    const len = Math.hypot(u1 - u0, v1 - v0);
    if (len < 0.01) continue;
    const g = new THREE.PlaneGeometry(len, w);
    g.rotateX(-Math.PI / 2);
    g.rotateY(-Math.atan2(-(v1 - v0), u1 - u0));
    g.translate(sx((u0 + u1) / 2), y, sz((v0 + v1) / 2));
    // UV в метрах
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let k = 0; k < pos.count; k++) uv.setXY(k, pos.getX(k), pos.getZ(k));
    batch.add(key, g);
  }
  for (const [u, v] of pts) {
    if (insideFoot(u, v)) continue;
    const c = new THREE.CircleGeometry(w / 2, 16);
    c.rotateX(-Math.PI / 2);
    c.translate(sx(u), y - 0.001, sz(v));
    const pos = c.attributes.position, uv = c.attributes.uv;
    for (let k = 0; k < pos.count; k++) uv.setXY(k, pos.getX(k), pos.getZ(k));
    batch.add(key, c);
  }
}

function polyFlat(batch, key, pts, y, holes = []) {
  const shape = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(sx(u), -sz(v))));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(sx(u), -sz(v)))));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let k = 0; k < pos.count; k++) uv.setXY(k, pos.getX(k), pos.getZ(k));
  batch.add(key, g);
}

const inPoly = (u, v, poly) => {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ui, vi] = poly[i], [uj, vj] = poly[j];
    if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) ins = !ins;
  }
  return ins;
};

export function buildSite(mats) {
  const group = new THREE.Group();
  group.name = 'site';
  const b = new Batch(mats);
  const y0 = sy(G);

  // земля — с вырезом под пятно здания (иначе газон «перекрывает» заглублённый амфитеатр и подвалы)
  const FOOT = [[0.05, 0.05], [SIZE - 0.05, 0.05], [SIZE - 0.05, SIZE - 0.05], [0.05, SIZE - 0.05]];
  polyFlat(b, 'grass', [[-420, -420], [480, -420], [480, 480], [-420, 480]], y0 - 0.02, [FOOT]);

  // асфальтовая площадка кампуса (по спутнику: парковки с СЗ и СВ, подъезд с ЮВ)
  polyFlat(b, 'asphalt', [[-16, -24], [74, -24], [74, 80], [-16, 80]], y0 + 0.005, [FOOT]);
  // газон вдоль ЮЗ фасада с дорожкой
  polyFlat(b, 'grass', [[-9.5, -4], [-1.2, -4], [-1.2, 58], [-9.5, 58]], y0 + 0.02);
  ribbon(b, 'paving', [[-6.2, -6], [-6.2, 60]], 2.2, y0 + 0.03);
  // отмостка-тротуар вокруг здания
  const sw = 1.6;
  polyFlat(b, 'paving', [[-sw, -sw], [SIZE + sw, -sw], [SIZE + sw, SIZE + sw], [-sw, SIZE + sw]], y0 + 0.012, [FOOT]);
  // тротуар перед входом
  polyFlat(b, 'paving', [[18, -9.5], [58, -9.5], [58, -2.2], [18, -2.2]], y0 + 0.013);

  // клумба у входа
  const fb = ENTRANCE.flowerbed;
  const curb = new THREE.CylinderGeometry(fb.r, fb.r, 0.25, 40);
  curb.translate(sx(fb.u), y0 + 0.125, sz(fb.v));
  b.add('curb', curb);
  const soil = new THREE.CylinderGeometry(fb.r - 0.15, fb.r - 0.15, 0.27, 40);
  soil.translate(sx(fb.u), y0 + 0.14, sz(fb.v));
  b.add('grass', soil);

  // дороги и дорожки из OSM
  for (const r of CONTEXT.roads) ribbon(b, 'asphalt', r.p, r.w, y0 + (r.k === 'service' ? 0.008 : 0.01));
  for (const p of CONTEXT.paths) ribbon(b, 'paving', p.p, p.w, y0 + 0.018);
  for (const a of CONTEXT.areas) {
    if (a.p.length < 3) continue;
    const key = a.k === 'pitch' ? 'pitchClay' : a.k === 'fountain' ? 'water' : a.k === 'park' || a.k === 'playground' ? 'grass' : null;
    if (key) polyFlat(b, key, a.p, y0 + (key === 'grass' ? 0.015 : 0.022));
  }

  // соседние здания (выдавливание контуров OSM)
  const cb = new Batch(mats);
  for (const bd of CONTEXT.buildings) {
    if (bd.p.length < 3) continue;
    const pts = bd.p.slice(0, -1);
    const shape = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(sx(u), -sz(v))));
    const h = Math.min(bd.h, 40);
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0, 0);
    // UV стен в метрах: вдоль периметра × высота
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    for (let k = 0; k < pos.count; k++) {
      if (Math.abs(nor.getY(k)) > 0.5) uv.setXY(k, pos.getX(k), pos.getZ(k));
      else uv.setXY(k, pos.getX(k) * Math.abs(nor.getZ(k)) + pos.getZ(k) * Math.abs(nor.getX(k)), pos.getY(k) - y0);
    }
    g.clearGroups();
    cb.add('context', g);
    // парапет-крыша чуть другого тона
    const top = new THREE.ShapeGeometry(shape);
    top.rotateX(-Math.PI / 2);
    top.translate(0, y0 + h + 0.02, 0);
    cb.add('contextRoof', top);
  }

  // деревья: вдоль дорог + вокруг кампуса
  const R = rng(2024);
  const trees = [];
  const blocked = (u, v) => {
    if (u > -3 && u < SIZE + 3 && v > -26 && v < SIZE + 3) return true;  // здание, крыльцо, подъезд
    if (u > 20 && u < 110 && v > -70 && v < 10 && Math.abs((v + 27) - (u - 66) * 1.08) < 14) return true; // коридор обзора на вход
    if (u > -16 && u < 74 && v > -24 && v < 80 && !(u < -1.5 && u > -9.5 && v > -4 && v < 58)) return true; // асфальт
    for (const bd of CONTEXT.buildings) if (inPoly(u, v, bd.p)) return true;
    for (const r of CONTEXT.roads) for (let i = 0; i < r.p.length - 1; i++) {
      const [a, c] = r.p[i], [e, f] = r.p[i + 1];
      const L2 = (e - a) ** 2 + (f - c) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((u - a) * (e - a) + (v - c) * (f - c)) / L2));
      if (Math.hypot(u - (a + t * (e - a)), v - (c + t * (f - c))) < r.w / 2 + 1.8) return true;
    }
    return false;
  };
  for (const r of CONTEXT.roads) for (let i = 0; i < r.p.length - 1; i++) {
    const [a, c] = r.p[i], [e, f] = r.p[i + 1];
    const len = Math.hypot(e - a, f - c);
    const nu = -(f - c) / (len || 1), nv = (e - a) / (len || 1);
    for (let t = 4; t < len; t += 8 + R() * 5) for (const side of [-1, 1]) {
      const off = r.w / 2 + 3 + R() * 3;
      const u = a + ((e - a) * t) / len + nu * off * side, v = c + ((f - c) * t) / len + nv * off * side;
      if (Math.hypot(u - SIZE / 2, v - SIZE / 2) > 220 || blocked(u, v)) continue;
      trees.push([u, v, R() < 0.7 ? 0 : 1]);
    }
  }
  // газон ЮЗ: ряд деревьев и туи у фасада
  for (let v = 0; v < 56; v += 5.5) trees.push([-3.6 - R() * 0.6, v + R() * 1.5, 2]);
  for (let v = 2; v < 56; v += 9) trees.push([-8.6, v + R() * 2, 0]);
  // у входа — туи и деревья вдоль подъезда
  for (const [u, v] of [[60.5, -3], [60.5, 3], [61, 10], [14, -3.5], [8, -3.5], [2, -3.4]]) trees.push([u, v, 2]);
  for (const [u, v] of [[78, 8], [77, 26], [78, 44], [-20, -12], [-20, 10], [-21, 30], [-20, 52], [10, 84], [34, 85], [58, 84]]) trees.push([u, v, 0]);
  // скопление деревьев в сквере к СВ (по спутнику)
  for (let k = 0; k < 40; k++) {
    const u = 76 + R() * 60, v = -30 + R() * 90;
    if (!blocked(u, v)) trees.push([u, v, R() < 0.8 ? 0 : 1]);
  }
  const crown0 = new Instancer(F.treeCrownGeo(0), mats.get('leaf'), 'tree-crown');
  const crown1 = new Instancer(F.treeCrownGeo(1), mats.get('leafDark'), 'tree-crown-2');
  const cone = new Instancer(F.treeCrownGeo(2), mats.get('leafDark'), 'thuja');
  const trunk = new Instancer(F.trunkGeo(), mats.get('trunk'), 'tree-trunk');
  for (const [u, v, k] of trees) {
    const s = 0.75 + R() * 0.55;
    const m = mtx(u, v, G, R() * 6.28, [s, s * (0.9 + R() * 0.3), s]);
    if (k === 2) { cone.push(m, R() < 0.5 ? '#2f5a35' : '#345f3a'); continue; }
    (k === 0 ? crown0 : crown1).push(m, ['#3f7a3a', '#4a8540', '#35693a', '#557f3c'][Math.floor(R() * 4)]);
    trunk.push(m);
  }
  // туя в центре клумбы
  cone.push(mtx(fb.u, fb.v, G + 0.2, 0, [0.55, 0.48, 0.55]), '#3f6f3c');
  // лаванда по кругу клумбы
  const lav = new Instancer(new THREE.IcosahedronGeometry(0.22, 0), mats.get('fabric'), 'lavender');
  for (let k = 0; k < 26; k++) { const a = (k / 26) * Math.PI * 2; lav.push(mtx(fb.u + Math.cos(a) * 2.2, fb.v + Math.sin(a) * 2.2, G + 0.35), k % 3 ? '#8f7fc4' : '#5f8a4a'); }

  // машины на парковках
  const body = new Instancer(F.carBodyGeo(), mats.get('car'), 'car-body');
  const glass = new Instancer(F.carGlassGeo(), mats.get('carGlass'), 'car-glass');
  const wheels = new Instancer(F.carWheelsGeo(), mats.get('tire'), 'car-wheels');
  const carCols = ['#f2f2f2', '#f2f2f2', '#d9dcdf', '#1d1f22', '#f2f2f2', '#9ea4aa', '#6b1f24', '#1e3a5f', '#f2f2f2'];
  const park = (u, v, rot) => {
    if (R() < 0.18) return;
    const m = mtx(u, v, G + 0.01, rot + (R() - 0.5) * 0.05);
    body.push(m, carCols[Math.floor(R() * carCols.length)]);
    glass.push(m); wheels.push(m);
  };
  for (let u = 1.5; u < 54; u += 2.6) park(u, SIZE + 4.6, 0);            // вдоль СЗ фасада
  for (let u = 1.5; u < 54; u += 2.6) park(u, SIZE + 13.5, 0);
  for (let v = 3; v < 52; v += 2.6) park(SIZE + 4.8, v, Math.PI / 2);     // вдоль СВ
  for (let u = 20; u < 40; u += 2.6) park(u, -19.5, 0);                  // у подъезда
  for (let v = -20; v < 50; v += 2.7) park(-13.2, v, Math.PI / 2);       // ЮЗ улица

  group.add(b.build('site-ground', { castShadow: false }));
  group.add(cb.build('site-context'));
  for (const inst of [crown0, crown1, cone, trunk, lav, body, glass, wheels]) {
    const m = inst.build();
    if (m) group.add(m);
  }
  return group;
}
