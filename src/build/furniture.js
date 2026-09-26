// Мебель, растения, деревья, уличные предметы: геометрии «одного предмета»,
// которые потом инстансятся (один draw call на тип и этаж).
// Многокомпонентные предметы несут вершинные цвета (атрибут color): материалы
// chairBlack / chairWhite / monitor / fabric / leaf / car / tire / bin / lavender
// включают vertexColors, цвет инстанса (setColorAt) умножается на них.
// Детальность: setFurnitureDetail('low') — упрощённые модели для телефонов.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { rng } from '../lib/geom.js';

let DETAIL = 'high';
export function setFurnitureDetail(d) { DETAIL = d === 'low' ? 'low' : 'high'; }
const hi = () => DETAIL !== 'low';

const _c = new THREE.Color();
// Деталь предмета: неиндексированная геометрия + вершинный цвет (sRGB hex)
function part(g, hex = 0xffffff) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  _c.set(hex);
  const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}
const merge = (parts) => mergeGeometries(parts.map((p) => (p.attributes.color ? p : part(p))), false);
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt, rb, h, x = 0, y = 0, z = 0, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);
// Коробка со скошенными рёбрами (выпуклая оболочка 24 точек) — «мягкие» подушки и корпуса
function bevelBox(w, h, d, b = 0.02) {
  b = Math.min(b, w / 2.2, h / 2.2, d / 2.2);
  const pts = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * w / 2, y = sy * h / 2, z = sz * d / 2;
    pts.push(new THREE.Vector3(x - sx * b, y, z - sz * b), new THREE.Vector3(x, y - sy * b, z - sz * b), new THREE.Vector3(x - sx * b, y - sy * b, z));
  }
  const g = new ConvexGeometry(pts);
  // UV в метрах по доминирующей оси нормали
  const pos = g.attributes.position, nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ax > 0.6) { uv[i * 2] = z; uv[i * 2 + 1] = y; } else if (ay > 0.6) { uv[i * 2] = x; uv[i * 2 + 1] = z; } else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const bbox = (w, h, d, x, y, z, b) => bevelBox(w, h, d, b).translate(x, y, z);
// Плоская «звезда» крестовины кресла
function starBase(r = 0.3, arms = 5, t = 0.028) {
  const s = new THREE.Shape();
  for (let k = 0; k < arms * 2; k++) {
    const a = (k / (arms * 2)) * Math.PI * 2 + Math.PI / 2;
    const rr = k % 2 === 0 ? r : 0.065;
    const w = k % 2 === 0 ? 0.022 : 0;
    const p = [Math.cos(a) * rr, Math.sin(a) * rr];
    if (w) { s.lineTo(p[0] - Math.sin(a) * w, p[1] + Math.cos(a) * w); s.lineTo(p[0] + Math.sin(a) * w, p[1] - Math.cos(a) * w); } else if (k === 0) s.moveTo(p[0], p[1]); else s.lineTo(p[0], p[1]);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  return g;
}

// ── Кресла и стулья ─────────────────────────────────────────────────────────
// Офисное кресло с сетчатой спинкой и подголовником, пятилучевая крестовина (смотрит в −Z)
export function chairGeo() {
  const MESH = 0x1d1e21, FRAME = 0x141517, ALU = 0x9ea4aa, CAST = 0x111111;
  if (!hi()) {
    return merge([
      part(box(0.5, 0.08, 0.48, 0, 0.47, 0), MESH), part(box(0.46, 0.58, 0.04, 0, 0.82, 0.24), MESH),
      part(box(0.3, 0.14, 0.04, 0, 1.2, 0.26), MESH), part(cyl(0.025, 0.025, 0.36, 0, 0.26, 0, 5), ALU),
      part(starBase(0.3).translate(0, 0.05, 0), ALU),
    ]);
  }
  const parts = [];
  const base = starBase(0.31); base.translate(0, 0.055, 0);
  parts.push(part(base, ALU));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + Math.PI / 2;
    parts.push(part(box(0.045, 0.045, 0.03, Math.cos(a) * 0.29, 0.025, -Math.sin(a) * 0.29), CAST));
  }
  parts.push(part(cyl(0.028, 0.034, 0.3, 0, 0.23, 0, 8), 0x2a2b2e));                 // газлифт
  parts.push(part(box(0.26, 0.04, 0.26, 0, 0.395, 0), FRAME));                         // механизм
  parts.push(part(bbox(0.5, 0.075, 0.48, 0, 0.455, -0.01, 0.025), MESH));              // сиденье
  // спинка: изогнутая сетка из 4 сегментов + рама
  for (let i = 0; i < 4; i++) {
    const y = 0.58 + i * 0.14, tilt = 0.08 + i * 0.03;
    const g = box(0.46 - i * 0.02, 0.14, 0.025);
    g.rotateX(-tilt); g.translate(0, y + 0.07, 0.24 + i * 0.018);
    parts.push(part(g, MESH));
  }
  parts.push(part(box(0.035, 0.6, 0.03, -0.235, 0.86, 0.265).rotateX(-0.12), FRAME));
  parts.push(part(box(0.035, 0.6, 0.03, 0.235, 0.86, 0.265).rotateX(-0.12), FRAME));
  parts.push(part(box(0.04, 0.26, 0.05, 0, 0.47, 0.25), FRAME));                        // стойка спинки
  parts.push(part(bbox(0.3, 0.13, 0.05, 0, 1.24, 0.34, 0.015), MESH));                 // подголовник
  parts.push(part(box(0.025, 0.2, 0.025, 0, 1.12, 0.33), FRAME));
  for (const x of [-0.27, 0.27]) {                                                     // подлокотники
    parts.push(part(box(0.035, 0.22, 0.05, x, 0.6, 0.03), FRAME));
    parts.push(part(bbox(0.07, 0.03, 0.24, x, 0.72, 0.0, 0.01), FRAME));
  }
  return merge(parts);
}

// Белый пластиковый стул-кресло (кухни, конференц-зал): оболочка + ножки
export function plasticChairGeo() {
  const SHELL = 0xf2f2f0, LEG = 0x5a5d61;
  if (!hi()) return merge([part(box(0.46, 0.05, 0.44, 0, 0.45, 0), SHELL), part(box(0.44, 0.42, 0.04, 0, 0.7, 0.21), SHELL), part(box(0.4, 0.45, 0.36, 0, 0.225, 0).scale(1, 1, 1), LEG)]);
  const parts = [];
  parts.push(part(bbox(0.46, 0.045, 0.44, 0, 0.45, 0, 0.018), SHELL));
  const back = bbox(0.44, 0.36, 0.035, 0, 0.0, 0, 0.012);
  back.rotateX(-0.16); back.translate(0, 0.66, 0.225);
  parts.push(part(back, SHELL));
  for (const x of [-0.235, 0.235]) {                                                   // подлокотники-«крылья» оболочки
    const w = bbox(0.03, 0.16, 0.3, 0, 0, 0, 0.01); w.translate(x, 0.54, 0.05);
    parts.push(part(w, SHELL));
  }
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) {
    const l = box(0.025, 0.45, 0.025); l.rotateX(z < 0 ? 0.06 : -0.06); l.rotateZ(x < 0 ? -0.05 : 0.05); l.translate(x, 0.215, z);
    parts.push(part(l, LEG));
  }
  return merge(parts);
}

// Моноблок Lenovo ~24" на подставке (экран смотрит в −Z) + клавиатура и мышь
export function monitorGeo() {
  const BODY = 0x141517, STAND = 0x2c2e31, KB = 0x18191b;
  if (!hi()) return merge([part(box(0.56, 0.36, 0.03, 0, 1.11, 0), BODY), part(box(0.05, 0.3, 0.04, 0, 0.93, 0.05), STAND), part(box(0.24, 0.015, 0.17, 0, 0.765, 0.05), STAND), part(box(0.44, 0.02, 0.14, 0, 0.77, -0.28), KB)]);
  const parts = [];
  parts.push(part(bbox(0.555, 0.345, 0.028, 0, 1.12, 0, 0.006), BODY));               // корпус с узкой рамкой
  parts.push(part(bbox(0.555, 0.045, 0.034, 0, 0.93, 0.002, 0.008), 0x1f2023));         // «подбородок»
  const leg = box(0.07, 0.3, 0.02); leg.rotateX(0.22); leg.translate(0, 0.9, 0.07);
  parts.push(part(leg, STAND));
  parts.push(part(bbox(0.22, 0.012, 0.17, 0, 0.761, 0.06, 0.004), STAND));
  parts.push(part(bbox(0.44, 0.018, 0.135, 0, 0.764, -0.28, 0.005), KB));             // клавиатура
  parts.push(part(box(0.41, 0.004, 0.105, 0, 0.775, -0.28), 0x2a2b2e));                // «клавиши»
  parts.push(part(bbox(0.06, 0.028, 0.1, 0.31, 0.769, -0.27, 0.012), KB));             // мышь
  return merge(parts);
}
// Экран моноблока (атлас заставок — вариант по номеру инстанса, см. materials.js)
export function screenGeo() {
  return box(0.53, 0.3, 0.004, 0, 1.125, -0.016);
}

// ── Мягкая мебель ───────────────────────────────────────────────────────────
// Кресло-мешок: «груша» со спинкой и вмятиной сиденья
export function beanbagGeo() {
  const g = new THREE.SphereGeometry(0.5, hi() ? 16 : 10, hi() ? 11 : 7);
  g.scale(1, 0.62, 1.1);
  g.translate(0, 0.28, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), x = pos.getX(i), z = pos.getZ(i);
    if (y < 0.05) pos.setY(i, 0.05 * (y + 0.1) / 0.15);
    // спинка выше, сиденье продавлено
    if (z > 0.1 && y > 0.3) pos.setY(i, y + 0.12 * Math.min(1, (z - 0.1) / 0.4));
    if (y > 0.35 && z < 0.1) pos.setY(i, y - 0.13 * (1 - Math.min(1, Math.hypot(x, z + 0.1) / 0.45)));
  }
  g.computeVertexNormals();
  const p = part(g, 0xffffff);
  // затемнение к низу (контактная тень)
  const col = p.attributes.color, pp = p.attributes.position;
  for (let i = 0; i < pp.count; i++) { const k = 0.72 + 0.28 * Math.min(1, pp.getY(i) / 0.3); col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k); }
  return p;
}

// Шестигранный пуф (с кантом)
export function poufGeo() {
  return merge([part(cyl(0.34, 0.34, 0.4, 0, 0.22, 0, 6), 0xffffff), part(cyl(0.3, 0.3, 0.03, 0, 0.435, 0, 6), 0xe8e8e8), part(cyl(0.3, 0.3, 0.02, 0, 0.01, 0, 6), 0x222222)]);
}

// Модульный диван (угловатый, серый войлок в лобби / велюр в лаунже): цоколь, подушки, спинка
export function sofaGeo(len = 2.0) {
  if (!hi()) return merge([part(box(len, 0.42, 0.8, 0, 0.21, 0)), part(box(len, 0.35, 0.18, 0, 0.6, 0.31))]);
  const parts = [];
  const k = Math.max(1, Math.round(len / 0.75));
  const cw = len / k;
  parts.push(part(box(len - 0.12, 0.06, 0.7, 0, 0.03, 0.02), 0x2a2a2a));             // утопленный цоколь
  parts.push(part(bbox(len, 0.2, 0.82, 0, 0.16, 0, 0.02), 0xdedede));                  // основание
  for (let i = 0; i < k; i++) {
    const x = -len / 2 + cw * (i + 0.5);
    parts.push(part(bbox(cw - 0.02, 0.15, 0.64, x, 0.335, -0.06, 0.04), 0xffffff));   // сиденье
    const b = bbox(cw - 0.03, 0.36, 0.17, 0, 0, 0, 0.04); b.rotateX(-0.14); b.translate(x, 0.56, 0.3);
    parts.push(part(b, 0xf4f4f4));                                                      // спинка
  }
  return merge(parts);
}

// Банкетка без спинки (синие банкетки у атриума)
export function benchGeo(len = 2.0, d = 0.6) {
  if (!hi()) return merge([part(box(len, 0.45, d, 0, 0.225, 0))]);
  return merge([part(box(len - 0.1, 0.06, d - 0.1, 0, 0.03, 0), 0x222222), part(bbox(len, 0.39, d, 0, 0.255, 0, 0.035), 0xffffff), part(box(len - 0.06, 0.01, d - 0.06, 0, 0.452, 0), 0xe6e6e6)]);
}

// ── Растения ────────────────────────────────────────────────────────────────
// Лист: полоса вдоль изогнутой жилки (ромбовидная форма), двусторонний
function leafStrip(len, wid, bend, segs = 4) {
  const pos = [], nor = [], uv = [];
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = Math.sin(t * Math.PI * 0.5) * len * 0.35 - bend * t * t * len;
    const z = t * len;
    const w = wid * Math.sin(Math.min(1, t * 1.15) * Math.PI) * (1 - t * 0.2);
    pts.push([y, z, w]);
  }
  for (let i = 0; i < segs; i++) {
    const [y0, z0, w0] = pts[i], [y1, z1, w1] = pts[i + 1];
    const q = [[-w0 / 2, y0, z0], [w0 / 2, y0, z0], [w1 / 2, y1, z1], [-w1 / 2, y1, z1]];
    const mid0 = [0, y0 + w0 * 0.12, z0], mid1 = [0, y1 + w1 * 0.12, z1];
    // два треугольника на половинку (жилка приподнята — лист «домиком»)
    for (const tri of [[q[0], mid0, mid1], [q[0], mid1, q[3]], [mid0, q[1], q[2]], [mid0, q[2], mid1]]) for (const p of tri) { pos.push(...p); uv.push(p[0] / wid + 0.5, p[2] / len); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
// Тропическое растение (кашпо в лобби и лаунже): веер листьев на черешках
export function plantGeo(h = 1.1) {
  const R = rng(Math.round(h * 100) + 7);
  const parts = [];
  const n = hi() ? 15 : 7;
  const greens = [0x3f7d34, 0x4e8d3c, 0x5c9a44, 0x356e30, 0x6aa84c];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + R() * 0.5;
    const up = 0.35 + R() * 0.55;                          // крутизна черешка
    const stemL = h * (0.35 + R() * 0.35);
    const leaf = leafStrip(h * (0.32 + R() * 0.16), h * (0.1 + R() * 0.05), 0.35 + R() * 0.4, hi() ? 4 : 2);
    // лист смотрит наружу и вверх
    leaf.rotateX(-(Math.PI / 2 - up * 1.2));
    leaf.translate(0, stemL * Math.sin(up + 0.4), 0);
    leaf.rotateY(a);
    parts.push(part(leaf, greens[Math.floor(R() * greens.length)]));
    // черешки растут прямо из грунта (без них листья «висят» над кашпо)
    if (k % 2 === 0 || hi()) {
      const s = cyl(0.008, 0.012, stemL, 0, 0, 0, 4);
      s.translate(0, stemL / 2, 0); s.rotateX(-(Math.PI / 2 - up) * 0.4); s.rotateY(a);
      parts.push(part(s, 0x4d6b2e));
    }
  }
  return merge(parts);
}
export function potGeo() { return merge([part(cyl(0.2, 0.16, 0.5, 0, 0.25, 0, 14), 0xf1f1ef), part(cyl(0.185, 0.185, 0.02, 0, 0.48, 0, 14), 0x3b2e24)]); }

// Невысокий куст (цветники у входа): купол из карточек листвы
export function shrubGeo(r = 0.5) {
  const R = rng(Math.round(r * 1000) + 3);
  const cards = [];
  const n = hi() ? 7 : 4;
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(r * 1.5, r * 1.3);
    g.rotateY(R() * Math.PI); g.rotateX((R() - 0.5) * 0.6);
    g.translate((R() - 0.5) * r * 0.6, r * (0.55 + R() * 0.25), (R() - 0.5) * r * 0.6);
    cards.push(g);
  }
  return sphericalNormals(mergeGeometries(cards.map((g) => part(g)), false), new THREE.Vector3(0, r * 0.2, 0));
}

// Кустик лаванды: зелёные стебли + фиолетовые колоски
export function lavenderGeo() {
  const R = rng(91);
  const parts = [];
  const n = hi() ? 12 : 6;
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI * 2, tilt = 0.15 + R() * 0.35, h = 0.35 + R() * 0.2;
    const stem = new THREE.PlaneGeometry(0.018, h); stem.translate(0, h / 2, 0);
    const spike = new THREE.PlaneGeometry(0.05, 0.12); spike.translate(0, h + 0.05, 0);
    for (const [g, col] of [[stem, 0x6f8a58], [spike, R() < 0.5 ? 0x8466c2 : 0x9a7fd4]]) {
      g.rotateZ(tilt); g.rotateY(a);
      parts.push(part(g, col));
      const g2 = g.clone(); g2.rotateY(Math.PI / 2); parts.push(part(g2, col));
    }
  }
  return merge(parts);
}

// ── Прочее ──────────────────────────────────────────────────────────────────
// Мольберт с фотографией
export function easelGeo() {
  const legs = [];
  for (const x of [-0.3, 0.3]) {
    const l = box(0.04, 1.7, 0.04);
    l.rotateX(-0.12); l.translate(x, 0.84, 0.05);
    legs.push(l);
  }
  const back = box(0.04, 1.6, 0.04); back.rotateX(0.3); back.translate(0, 0.78, 0.3);
  legs.push(back, box(0.7, 0.04, 0.06, 0, 0.72, 0.0), box(0.66, 0.03, 0.03, 0, 1.42, -0.1));
  return merge(legs.map((g) => part(g)));
}
export function printGeo() { const g = box(0.8, 0.6, 0.02); g.rotateX(-0.12); g.translate(0, 1.08, -0.02); return part(g); }

// Линейный светильник (подвесной профиль)
export function linearGeo(len = 3.0) { return part(box(len, 0.05, 0.06)); }

// Кольцевой светильник
export function ringGeo(r = 0.45) { const g = new THREE.TorusGeometry(r, 0.04, 8, 36); g.rotateX(Math.PI / 2); return part(g); }

// Узор «восьмиконечная звезда» из светящихся полос. Возвращает список отрезков [x0,z0,x1,z1]
export function starSegments(cx, cz, R) {
  const pts = [];
  const r = R * 0.765;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2 + Math.PI / 16;
    const rr = k % 2 === 0 ? R : r;
    pts.push([cx + Math.cos(a) * rr, cz + Math.sin(a) * rr]);
  }
  const seg = [];
  for (let k = 0; k < 16; k++) seg.push([...pts[k], ...pts[(k + 1) % 16]]);
  return seg;
}

// Поле звёзд-светильников (гирих-решётка) в прямоугольнике
export function starField(u0, v0, u1, v1, step = 2.6) {
  const segs = [];
  const nu = Math.max(1, Math.floor((u1 - u0) / step)), nv = Math.max(1, Math.floor((v1 - v0) / step));
  const su = (u1 - u0) / nu, sv = (v1 - v0) / nv;
  const R = Math.min(su, sv) * 0.38;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const cu = u0 + su * (i + 0.5), cv = v0 + sv * (j + 0.5);
    const big = (i + j) % 2 === 0;
    segs.push(...starSegments(cu, cv, big ? R : R * 0.7));
    if (big) segs.push(...starSegments(cu, cv, R * 0.42));
    if (i < nu - 1) segs.push([cu + (big ? R : R * 0.7), cv, cu + su - ((i + 1 + j) % 2 === 0 ? R : R * 0.7), cv]);
    if (j < nv - 1) segs.push([cu, cv + (big ? R : R * 0.7), cu, cv + sv - ((i + j + 1) % 2 === 0 ? R : R * 0.7)]);
  }
  return segs;
}

// Отрезок светящейся полосы между двумя точками плана на высоте y (в координатах сцены)
export function stripGeo(ax, az, bx, bz, y, w = 0.05) {
  const len = Math.hypot(bx - ax, bz - az);
  const g = new THREE.BoxGeometry(len + w, 0.045, w);
  g.rotateY(-Math.atan2(bz - az, bx - ax));
  g.translate((ax + bx) / 2, y, (az + bz) / 2);
  return part(g);
}

// Стилизованная статуя учёного в халате (выставочная зона)
export function statueGeo() {
  const parts = [
    bbox(0.9, 0.5, 0.9, 0, 0.25, 0, 0.03),                              // постамент
    cyl(0.28, 0.44, 1.5, 0, 1.25, 0, 18),                               // халат
    cyl(0.2, 0.28, 0.35, 0, 2.15, 0, 16),                               // плечи
    new THREE.SphereGeometry(0.14, 16, 12).translate(0, 2.45, 0),       // голова
    cyl(0.17, 0.15, 0.13, 0, 2.6, 0, 16),                               // чалма
    new THREE.SphereGeometry(0.16, 12, 8).scale(1, 0.55, 1).translate(0, 2.68, 0),
    box(0.12, 0.6, 0.12, 0.22, 1.85, -0.12).rotateZ(0.1),               // рука со свитком
    cyl(0.05, 0.05, 0.4, 0.2, 1.62, -0.25, 8),
  ];
  return merge(parts.map((g) => part(g)));
}

// Турникет (скоростной проход): тумбы из нержавейки + стеклянные створки, стойка Face ID
export function turnstileGeo() {
  return merge([
    part(bbox(0.18, 1.0, 1.4, -0.45, 0.5, 0, 0.03)), part(bbox(0.18, 1.0, 1.4, 0.45, 0.5, 0, 0.03)),
    part(box(0.2, 0.02, 1.42, -0.45, 1.01, 0), 0x222222), part(box(0.2, 0.02, 1.42, 0.45, 1.01, 0), 0x222222),
    part(cyl(0.02, 0.02, 0.5, -0.45, 1.25, -0.55, 6)), part(box(0.1, 0.16, 0.03, -0.45, 1.52, -0.55), 0x222222),
  ]);
}
export function turnstileGlassGeo() { return merge([part(box(0.02, 0.85, 0.4, -0.2, 0.75, 0)), part(box(0.02, 0.85, 0.4, 0.2, 0.75, 0))]); }

// ── Машины (для масштаба на парковке) ──────────────────────────────────────
export function carBodyGeo() {
  const parts = [];
  parts.push(part(bbox(1.78, 0.56, 4.4, 0, 0.58, 0, 0.12), 0xffffff));              // кузов
  const cab = new THREE.CylinderGeometry(0.5, 0.78, 1.0, 4, 1); cab.rotateY(Math.PI / 4); cab.scale(1.12, 0.52, 2.2); cab.translate(0, 1.1, 0.1);
  parts.push(part(cab, 0xffffff));                                                      // салон (трапеция)
  parts.push(part(box(1.8, 0.16, 0.12, 0, 0.42, 2.2), 0x2a2b2d), part(box(1.8, 0.16, 0.12, 0, 0.42, -2.2), 0x2a2b2d));
  parts.push(part(box(1.82, 0.08, 4.2, 0, 0.34, 0), 0x3a3b3e));                        // порог
  return merge(parts);
}
export function carGlassGeo() {
  const cab = new THREE.CylinderGeometry(0.47, 0.75, 0.96, 4, 1); cab.rotateY(Math.PI / 4); cab.scale(1.14, 0.44, 2.22); cab.translate(0, 1.13, 0.1);
  return part(cab);
}
export function carWheelsGeo() {
  const w = [];
  for (const x of [-0.8, 0.8]) for (const z of [-1.35, 1.35]) {
    const c = new THREE.CylinderGeometry(0.33, 0.33, 0.22, hi() ? 14 : 8); c.rotateZ(Math.PI / 2); c.translate(x, 0.33, z); w.push(part(c, 0x1a1a1a));
    const h = new THREE.CylinderGeometry(0.2, 0.2, 0.235, 8); h.rotateZ(Math.PI / 2); h.translate(x, 0.33, z); w.push(part(h, 0x9da3a8));
  }
  return merge(w);
}

// ── Деревья: кроны из карточек листвы (альфа-тест) + ствол и ветви, 2 уровня детальности ──
// Нормали карточек направлены от центра кроны — мягкий объёмный свет, как у настоящей листвы.
function sphericalNormals(g, center) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).sub(center);
    v.y *= 0.8; v.normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}
// kind: 'broad' (лиственное), 'round' (поменьше), 'conifer' (ель/сосна 13–15 м), 'thuja' (туя-конус)
// lod: 'near' | 'far'. Размеры — для дерева высотой ~9 м (масштаб задаёт инстанс).
export function treeCrown(kind = 'broad', lod = 'near') {
  const R = rng(kind.length * 17 + (lod === 'near' ? 3 : 5));
  const cards = [];
  const center = new THREE.Vector3();
  const card = (w, h, x, y, z, ry, rx) => {
    const g = new THREE.PlaneGeometry(w, h);
    g.rotateX(rx); g.rotateY(ry); g.translate(x, y, z);
    cards.push(g);
  };
  if (kind === 'conifer') {
    // ярусы из наклонённых карточек вокруг ствола, к верху уже
    center.set(0, 7, 0);
    const tiers = lod === 'near' ? 8 : 4, per = lod === 'near' ? 4 : 3;
    for (let t = 0; t < tiers; t++) {
      const f = t / (tiers - 1);
      const y = 3.5 + f * 10.5, r = 2.6 * (1 - f * 0.85) + 0.3;
      for (let k = 0; k < per; k++) {
        const a = (k / per) * Math.PI + R() * 0.6 + t * 0.7;
        card(r * 2.2, r * 1.3 + 0.8, 0, y, 0, a, 0);
      }
    }
    card(0.9, 2.2, 0, 14.6, 0, 0.3, 0); card(0.9, 2.2, 0, 14.6, 0, 1.87, 0);
  } else if (kind === 'thuja') {
    center.set(0, 3.2, 0);
    const per = lod === 'near' ? 5 : 3;
    for (let t = 0; t < 3; t++) for (let k = 0; k < per; k++) {
      const y = 1.4 + t * 1.7, w = 1.9 - t * 0.55;
      card(w, 2.6 - t * 0.3, 0, y + 0.6, 0, (k / per) * Math.PI + t * 0.4, 0);
    }
  } else {
    const big = kind === 'broad';
    center.set(0, big ? 6.4 : 5.6, 0);
    const n = lod === 'near' ? (big ? 30 : 20) : (big ? 12 : 8);
    const rx = big ? 3.2 : 2.4, ry = big ? 2.6 : 2.0;
    for (let i = 0; i < n; i++) {
      // точки на эллипсоиде, больше снаружи
      const u = R() * 2 - 1, th = R() * Math.PI * 2, s = 0.45 + Math.sqrt(R()) * 0.55;
      const x = Math.sqrt(1 - u * u) * Math.cos(th) * rx * s, z = Math.sqrt(1 - u * u) * Math.sin(th) * rx * s, y = center.y + u * ry * s;
      const sz = (big ? 2.4 : 2.0) * (0.75 + R() * 0.5) * (lod === 'far' ? 1.4 : 1);
      card(sz, sz * 0.9, x, y, z, R() * Math.PI, (R() - 0.5) * 1.2);
    }
  }
  const g = mergeGeometries(cards.map((c) => part(c)), false);
  return sphericalNormals(g, center);
}
// Ствол (коллизия прогулки — только он) и ветви (отдельно, без коллизии).
// which: 'trunk' | 'branches' | 'all'. conifer — один прямой ствол до верха.
export function treeWood(kind = 'broad', lod = 'near', which = 'all') {
  const parts = [];
  const trunk = which !== 'branches', branches = which !== 'trunk';
  if (kind === 'conifer') {
    if (trunk) parts.push(cyl(0.08, 0.3, 14.5, 0, 7.25, 0, lod === 'near' ? 7 : 5));
  } else if (kind === 'thuja') {
    if (trunk) parts.push(cyl(0.05, 0.12, 1.2, 0, 0.6, 0, 5));
  } else {
    const big = kind === 'broad';
    const h = big ? 4.4 : 3.6;
    if (trunk) parts.push(cyl(0.16, 0.26, h, 0, h / 2, 0, lod === 'near' ? 7 : 5));
    if (branches && lod === 'near') {
      const R = rng(big ? 5 : 9);
      for (let k = 0; k < (big ? 5 : 4); k++) {
        const a = (k / 5) * Math.PI * 2 + R() * 0.5, L = big ? 2.6 : 2.0;
        const b = cyl(0.05, 0.12, L, 0, L / 2, 0, 5);
        b.rotateZ(0.7 + R() * 0.35); b.rotateY(a); b.translate(0, h - 0.4 - R() * 0.8, 0);
        parts.push(b);
      }
    }
  }
  if (!parts.length) return null;
  return merge(parts.map((g) => part(g)));
}
// Совместимость со старым API
export function treeCrownGeo(kind = 0) { return treeCrown(kind === 2 ? 'thuja' : kind === 1 ? 'round' : 'broad', 'far'); }
export function trunkGeo() { return treeWood('broad', 'far'); }

// ── Уличные предметы ────────────────────────────────────────────────────────
// Урна на три секции (зелёная / красная / жёлтая) на общей раме
export function binUnitGeo() {
  const parts = [];
  [0x2f9a44, 0xd23a2e, 0xf2c230].forEach((col, i) => {
    const x = (i - 1) * 0.46;
    parts.push(part(bbox(0.42, 0.78, 0.42, x, 0.47, 0, 0.03), col));
    parts.push(part(bbox(0.44, 0.06, 0.44, x, 0.89, 0, 0.02), col));
    parts.push(part(box(0.24, 0.02, 0.06, x, 0.92, -0.12), 0x222222));
  });
  parts.push(part(box(1.44, 0.05, 0.36, 0, 0.05, 0), 0x3a3d42));
  for (const x of [-0.7, 0.7]) parts.push(part(box(0.04, 0.9, 0.04, x, 0.45, 0), 0x3a3d42));
  return merge(parts);
}
// Флаг-«парус»: древко (материал flagPole) и полотнище (материал flag, альфа-форма)
export function flagPoleGeo(h = 3.6) { return merge([part(cyl(0.018, 0.022, h, 0, h / 2, 0, 6)), part(cyl(0.2, 0.2, 0.05, 0, 0.025, 0, 10))]); }
export function flagSailGeo(h = 3.6) {
  const g = new THREE.PlaneGeometry(0.62, h * 0.72, 1, 4);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setZ(i, Math.sin((y / (h * 0.72) + 0.5) * Math.PI) * 0.06 * (pos.getX(i) + 0.31)); }
  g.computeVertexNormals();
  g.translate(0.33, h - h * 0.36 - 0.05, 0);
  return part(g);
}
// Фонарь с загнутым верхом и синим светодиодным плафоном
export function lampPoleGeo(h = 4.6) {
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, h - 0.8, 0), new THREE.Vector3(0, h + 0.15, 0), new THREE.Vector3(0.75, h - 0.1, 0));
  const arm = new THREE.TubeGeometry(curve, 10, 0.05, 6, false);
  return merge([part(cyl(0.06, 0.09, h - 0.8, 0, (h - 0.8) / 2, 0, 8)), part(arm), part(cyl(0.16, 0.2, 0.3, 0, 0.15, 0, 8))]);
}
export function lampHeadGeo(h = 4.6) { return part(cyl(0.16, 0.12, 0.08, 0.78, h - 0.16, 0, 12)); }
