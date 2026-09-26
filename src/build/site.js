// Участок и окружение: земля (с вырезом под заглублённую дорожку), асфальт площади,
// дороги и тротуары из OSM, соседние здания, деревья с двумя уровнями детальности,
// овальная клумба с лавандой и туей, машины на парковке, фонари с синими светодиодами,
// флаги-«паруса» и урны у крыльца.
import * as THREE from 'three';
import { Batch, Instancer, sx, sy, sz, mtx, rng } from '../lib/geom.js';
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
const rectPts = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
// эллипс (u, v, ru, rv) → точки
const ellipse = (u, v, ru, rv, n = 48) => Array.from({ length: n }, (_, i) => [u + Math.cos((i / n) * Math.PI * 2) * ru, v + Math.sin((i / n) * Math.PI * 2) * rv]);

export function buildSite(mats) {
  const group = new THREE.Group();
  group.name = 'site';
  const b = new Batch(mats);
  const y0 = sy(G);                        // = 0: тротуар

  // вырезы в земле: пятно здания и заглублённая дорожка вдоль СВ фасада
  const FOOT = [[0.05, 0.05], [SIZE - 0.05, 0.05], [SIZE - 0.05, SIZE - 0.05], [0.05, SIZE - 0.05]];
  const nw = ENTRANCE.neWalk;
  const WALK = nw ? rectPts(nw.u0, nw.v0, nw.u1 + 0.25, nw.v1) : null;
  const holes = WALK ? [FOOT, WALK] : [FOOT];
  polyFlat(b, 'grass', [[-420, -420], [480, -420], [480, 480], [-420, 480]], y0 - 0.02, holes);

  // асфальт кампуса: площадь перед входом, подъезды и парковки (по спутнику и фото)
  polyFlat(b, 'asphalt', [[-16, -24], [76, -24], [76, 80], [-16, 80]], y0 + 0.005, holes);
  // газон вдоль ЮЗ фасада с дорожкой
  polyFlat(b, 'grass', [[-9.5, -4], [-1.6, -4], [-1.6, 58], [-9.5, 58]], y0 + 0.02);
  ribbon(b, 'paving', [[-6.2, -6], [-6.2, 60]], 2.2, y0 + 0.03);
  // отмостка из плитки вдоль СЗ и ЮЗ фасадов
  polyFlat(b, 'paving', [[-1.6, -1.6], [0.05, -1.6], [0.05, SIZE + 1.6], [-1.6, SIZE + 1.6]], y0 + 0.024);
  polyFlat(b, 'paving', [[0.05, SIZE - 0.05], [SIZE + 1.6, SIZE - 0.05], [SIZE + 1.6, SIZE + 1.6], [0.05, SIZE + 1.6]], y0 + 0.024);

  // ── Овальная клумба у въезда: бордюр, земля, лаванда, кусты, туя в центре ──
  const fb = ENTRANCE.flowerbed;
  const ru = fb.ru ?? fb.r, rv = fb.rv ?? fb.r;
  {
    const outer = ellipse(fb.u, fb.v, ru, rv), inner = ellipse(fb.u, fb.v, ru - 0.2, rv - 0.2);
    const shape = new THREE.Shape(outer.map(([u, v]) => new THREE.Vector2(sx(u), -sz(v))));
    shape.holes.push(new THREE.Path(inner.map(([u, v]) => new THREE.Vector2(sx(u), -sz(v)))));
    const curb = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false, curveSegments: 1 });
    curb.rotateX(-Math.PI / 2); curb.translate(0, y0, 0);
    b.add('curbStone', curb);
    polyFlat(b, 'soil', inner, y0 + 0.14);
  }

  // дороги и дорожки из OSM
  for (const r of CONTEXT.roads) ribbon(b, 'asphalt', r.p, r.w, y0 + (r.k === 'service' ? 0.008 : 0.01));
  for (const p of CONTEXT.paths) ribbon(b, 'paving', p.p, p.w, y0 + 0.018);
  for (const a of CONTEXT.areas) {
    if (a.p.length < 3) continue;
    const key = a.k === 'pitch' ? 'pitchClay' : a.k === 'fountain' ? 'water' : a.k === 'park' || a.k === 'playground' ? 'grass' : null;
    if (key) polyFlat(b, key, a.p, y0 + (key === 'grass' ? 0.015 : 0.022));
  }
  // разметка парковки вдоль СВ стороны (две линии рядов)
  for (const u of [65.0, 67.0, 70.0, 72.0]) b.box('curb', u - 0.05, -2, G + 0.006, u + 0.05, 50, G + 0.012);

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
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
    for (let k = 0; k < pos.count; k++) {
      if (Math.abs(nor.getY(k)) > 0.5) uv.setXY(k, pos.getX(k), pos.getZ(k));
      else uv.setXY(k, pos.getX(k) * Math.abs(nor.getZ(k)) + pos.getZ(k) * Math.abs(nor.getX(k)), pos.getY(k) - y0);
    }
    g.clearGroups();
    cb.add('context', g);
    const top = new THREE.ShapeGeometry(shape);
    top.rotateX(-Math.PI / 2);
    top.translate(0, y0 + h + 0.02, 0);
    cb.add('contextRoof', top);
  }

  // ── Деревья ────────────────────────────────────────────────────────────────
  const R = rng(2024);
  // [u, v, вид, масштаб]; вид: broad | round | conifer | thuja
  const trees = [];
  const blocked = (u, v) => {
    if (u > -3 && u < SIZE + 8 && v > -26 && v < SIZE + 3) return true;
    if (u > 20 && u < 110 && v > -70 && v < 10 && Math.abs((v + 27) - (u - 66) * 1.08) < 14) return true; // коридор обзора на вход
    if (u > -16 && u < 76 && v > -24 && v < 80 && !(u < -1.6 && u > -9.5 && v > -4 && v < 58)) return true;
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
      trees.push([u, v, R() < 0.7 ? 'broad' : 'round', 0.75 + R() * 0.5]);
    }
  }
  // газон ЮЗ: ряд туй у фасада и деревья вдоль дорожки
  for (let v = 2; v < 56; v += 5.5) trees.push([-3.4 - R() * 0.5, v + R() * 1.5, 'thuja', 0.95 + R() * 0.3]);
  for (let v = 2; v < 56; v += 9) trees.push([-8.6, v + R() * 2, 'broad', 0.8 + R() * 0.3]);
  // у южного угла — высокие хвойные (13–15 м), у восточного — большое лиственное (≈13 м)
  trees.push([-2.4, -5.6, 'conifer', 0.98], [1.2, -7.4, 'conifer', 0.9], [-5.8, -2.0, 'conifer', 0.85], [3.6, -4.6, 'thuja', 0.9]);
  trees.push([62.4, 1.2, 'broad', 1.45], [63.5, 12, 'round', 1.2], [63.2, 26, 'broad', 1.15], [63.8, 40, 'round', 1.1]);
  // туи вдоль левой части ЮВ фасада
  for (const [u, v] of [[13.4, -3.2], [8, -3.3], [2.6, -3.1]]) trees.push([u, v, 'thuja', 0.75]);
  for (const [u, v] of [[80, 8], [79, 26], [80, 44], [-20, -12], [-20, 10], [-21, 30], [-20, 52], [10, 84], [34, 85], [58, 84]]) trees.push([u, v, 'broad', 0.9 + R() * 0.3]);
  // сквер к СВ (по спутнику)
  for (let k = 0; k < 40; k++) {
    const u = 78 + R() * 60, v = -30 + R() * 90;
    if (!blocked(u, v)) trees.push([u, v, R() < 0.8 ? 'broad' : 'round', 0.8 + R() * 0.45]);
  }
  // туя в центре клумбы (≈4 м)
  trees.push([fb.u, fb.v, 'thuja', 0.62, G + 0.15]);

  const LEAF = { broad: 'treeLeaf', round: 'treeLeaf2', conifer: 'treeConifer', thuja: 'treeThuja' };
  const tint = { broad: ['#ffffff', '#e8f2dc', '#d9e8cc', '#f4f8e8'], round: ['#ffffff', '#e2eed6'], conifer: ['#ffffff', '#dfe8dc'], thuja: ['#ffffff', '#e8f0e0'] };
  const inst = new Map();
  const I = (name, geoFn, key) => {
    if (!inst.has(name)) { const g = geoFn(); inst.set(name, g ? new Instancer(g, mats.get(key), name) : null); }
    return inst.get(name);
  };
  const cx = SIZE / 2, cy = SIZE / 2 - 10;
  for (const [u, v, kind, s, z = G] of trees) {
    // деревья у здания и площади — подробные, дальние — упрощённые
    const lod = Math.hypot(u - cx, v - cy) < 62 ? 'near' : 'far';
    const m = mtx(u, v, z, R() * 6.28, [s, s * (0.9 + R() * 0.2), s]);
    I(`tree-crown-${kind}-${lod}`, () => F.treeCrown(kind, lod), LEAF[kind])?.push(m, tint[kind][Math.floor(R() * tint[kind].length)]);
    I(`tree-crown-branch-${kind}-${lod}`, () => F.treeWood(kind, lod, 'branches'), 'bark')?.push(m);
    I(`tree-trunk-${kind}-${lod}`, () => F.treeWood(kind, lod, 'trunk'), 'bark')?.push(m);
  }

  // ── Лаванда и кусты: клумба, цветник у крыльца, полоса вдоль СВ фасада ─────
  const lav = new Instancer(F.lavenderGeo(), mats.get('lavender'), 'lavender');
  const shrubs = new Instancer(F.shrubGeo(0.5), mats.get('shrub'), 'plant-shrub');
  const Rl = rng(77);
  for (let ring = 0; ring < 3; ring++) {
    const k = 0.35 + ring * 0.22, n = 14 + ring * 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.3;
      const u = fb.u + Math.cos(a) * ru * k * 1.3, v = fb.v + Math.sin(a) * rv * k * 1.3;
      if (ring === 2 || (ring === 1 && i % 2)) lav.push(mtx(u, v, G + 0.14, Rl() * 6, [1.2, 1 + Rl() * 0.3, 1.2]));
      else shrubs.push(mtx(u, v, G + 0.1, Rl() * 6, [0.7 + Rl() * 0.3, 0.6 + Rl() * 0.3, 0.7 + Rl() * 0.3]), Rl() < 0.3 ? '#e3b9b0' : '#ffffff');
    }
  }
  const pl = ENTRANCE.planter, ns = ENTRANCE.neStrip;
  if (pl) for (let u = pl.u0 + 0.5; u < pl.u1 - 0.3; u += 0.9) for (let v = pl.v0 + 0.5; v < pl.v1 - 0.3; v += 1.0) shrubs.push(mtx(u + (Rl() - 0.5) * 0.3, v + (Rl() - 0.5) * 0.3, pl.top - 0.12, Rl() * 6, [0.9, 0.8 + Rl() * 0.4, 0.9]));
  if (ns) for (let v = ns.v0 + 0.8; v < ns.v1 - 0.6; v += 1.3) for (const du of [0.7, 1.9]) shrubs.push(mtx(ns.u0 + du + (Rl() - 0.5) * 0.4, v + (Rl() - 0.5) * 0.4, ns.top - 0.12, Rl() * 6, [0.9, 0.7 + Rl() * 0.5, 0.9]), Rl() < 0.2 ? '#c8d8b0' : '#ffffff');

  // ── Машины: ряды вдоль СВ стороны (u 65–67, 70–72), у СЗ фасада, у подъезда ──
  const body = new Instancer(F.carBodyGeo(), mats.get('car'), 'car-body');
  const glass = new Instancer(F.carGlassGeo(), mats.get('carGlass'), 'car-glass');
  const wheels = new Instancer(F.carWheelsGeo(), mats.get('tire'), 'car-wheels');
  const carCols = ['#f2f2f2', '#f2f2f2', '#d9dcdf', '#1d1f22', '#f2f2f2', '#9ea4aa', '#6b1f24', '#1e3a5f', '#f2f2f2', '#c9c2b2'];
  const park = (u, v, rot, p = 0.18) => {
    if (R() < p) return;
    const m = mtx(u, v, G + 0.01, rot + (R() - 0.5) * 0.05);
    body.push(m, carCols[Math.floor(R() * carCols.length)]);
    glass.push(m); wheels.push(m);
  };
  for (let u = 1.5; u < 54; u += 2.6) park(u, SIZE + 4.6, 0);            // вдоль СЗ фасада
  for (let u = 1.5; u < 54; u += 2.6) park(u, SIZE + 13.5, 0);
  for (let v = -1; v < 50; v += 5.6) { park(66.0, v, 0, 0.3); park(71.0, v + 2.5, 0, 0.35); }
  for (let u = 20; u < 34; u += 2.6) park(u, -19.5, 0, 0.4);             // у подъезда
  for (let v = -20; v < 50; v += 2.7) park(-13.2, v, Math.PI / 2);       // ЮЗ улица

  // ── Уличные предметы: фонари с синим светодиодом, флаги, урны ─────────────
  const poles = new Instancer(F.lampPoleGeo(4.6), mats.get('pole'), 'lamp-poles');
  const heads = new Instancer(F.lampHeadGeo(4.6), mats.get('poleLed'), 'lamp-heads');
  for (const [u, v, r] of [[30, -12, Math.PI * 0.5], [66, -10, Math.PI * 0.35]]) { poles.push(mtx(u, v, G, r)); heads.push(mtx(u, v, G, r)); }
  const fpoles = new Instancer(F.flagPoleGeo(3.6), mats.get('flagPole'), 'flag-poles');
  const sails = new Instancer(F.flagSailGeo(3.6), mats.get('flag'), 'flag-sails');
  for (const [u, v, r] of [[53.6, -8.6, -0.5], [54.7, -8.9, -0.4], [55.8, -9.1, -0.6]]) { fpoles.push(mtx(u, v, G, r)); sails.push(mtx(u, v, G, r)); }
  const bins = new Instancer(F.binUnitGeo(), mats.get('bin'), 'bins');
  bins.push(mtx(57.2, -7.3, G, 0));

  group.add(b.build('site-ground', { castShadow: false }));
  group.add(cb.build('site-context'));
  const extra = [...inst.values(), lav, shrubs, body, glass, wheels, poles, heads, fpoles, sails, bins];
  for (const it of extra) {
    if (!it) continue;
    const m = it.build();
    if (!m) continue;
    if (/^(tree-crown|lavender|plant-shrub|flag-sails|lamp-heads)/.test(m.name)) m.userData.noCollide = true;
    // листва, трава и флаги не принимают тень сами на себя (меньше мусора в тенях)
    if (/^(lavender|plant-shrub)/.test(m.name)) m.castShadow = false;
    group.add(m);
  }
  return group;
}
