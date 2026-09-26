// Мебель и светильники: геометрии «одного предмета», которые потом инстансятся.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt, rb, h, x = 0, y = 0, z = 0, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);
const clean = (g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; };
const merge = (parts) => mergeGeometries(parts.map(clean), false);

// Офисное кресло с сетчатой спинкой и подголовником (смотрит в −Z)
export function chairGeo() {
  const parts = [
    box(0.52, 0.08, 0.5, 0, 0.47, 0),            // сиденье
    box(0.5, 0.62, 0.05, 0, 0.84, 0.25),         // спинка
    box(0.34, 0.16, 0.05, 0, 1.25, 0.27),        // подголовник
    box(0.05, 0.28, 0.05, -0.27, 0.62, 0.02),    // подлокотники
    box(0.05, 0.28, 0.05, 0.27, 0.62, 0.02),
    box(0.06, 0.03, 0.26, -0.27, 0.77, -0.02),
    box(0.06, 0.03, 0.26, 0.27, 0.77, -0.02),
    cyl(0.03, 0.03, 0.36, 0, 0.26, 0),           // газлифт
    cyl(0.3, 0.3, 0.03, 0, 0.06, 0, 5),          // крестовина (5 лучей ~ пятиугольник)
  ];
  return merge(parts);
}

// Белый пластиковый стул (конференц-зал, кухня)
export function plasticChairGeo() {
  return merge([
    box(0.46, 0.05, 0.44, 0, 0.45, 0),
    box(0.44, 0.42, 0.04, 0, 0.7, 0.21),
    box(0.04, 0.45, 0.04, -0.2, 0.225, -0.19), box(0.04, 0.45, 0.04, 0.2, 0.225, -0.19),
    box(0.04, 0.45, 0.04, -0.2, 0.225, 0.19), box(0.04, 0.45, 0.04, 0.2, 0.225, 0.19),
  ]);
}

// Монитор на подставке (экран смотрит в −Z) + клавиатура
export function monitorGeo() {
  return merge([
    box(0.62, 0.38, 0.035, 0, 1.12, 0),
    box(0.05, 0.3, 0.04, 0, 0.93, 0.04),
    box(0.24, 0.015, 0.18, 0, 0.77, 0.05),
    box(0.44, 0.02, 0.14, 0, 0.77, -0.28),
  ]);
}
export function screenGeo() {
  return box(0.58, 0.34, 0.005, 0, 1.12, -0.02);
}

// Кресло-мешок
export function beanbagGeo() {
  const g = new THREE.SphereGeometry(0.5, 14, 10);
  g.scale(1, 0.62, 1.1);
  g.translate(0, 0.28, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < 0.05) pos.setY(i, 0.05 * (y + 0.1) / 0.15);
    // «продавленное» сиденье
    const x = pos.getX(i), z = pos.getZ(i);
    if (y > 0.4 && z < 0.1) pos.setY(i, y - 0.12 * (1 - Math.min(1, Math.hypot(x, z + 0.1) / 0.45)));
  }
  g.computeVertexNormals();
  return clean(g);
}

// Шестигранный пуф
export function poufGeo() { return clean(new THREE.CylinderGeometry(0.34, 0.34, 0.45, 6).translate(0, 0.225, 0)); }

// Модульный диван-«банкетка» (серый), угловатый как на фото лобби
export function sofaGeo(len = 2.0) {
  return merge([box(len, 0.42, 0.8, 0, 0.21, 0), box(len, 0.35, 0.18, 0, 0.6, 0.31)]);
}

// Банкетка без спинки
export function benchGeo(len = 2.0, d = 0.6) { return merge([box(len, 0.45, d, 0, 0.225, 0)]); }

// Растение: несколько листовых «шаров»
export function plantGeo(h = 1.1) {
  const g = [];
  for (let k = 0; k < 5; k++) {
    const s = new THREE.IcosahedronGeometry(0.28 + (k % 2) * 0.08, 0);
    const a = k * 1.3;
    s.translate(Math.cos(a) * 0.18, h * (0.55 + (k % 3) * 0.16), Math.sin(a) * 0.18);
    g.push(s);
  }
  return merge(g);
}
export function potGeo() { return merge([cyl(0.2, 0.16, 0.5, 0, 0.25, 0, 12)]); }

// Мольберт с фотографией
export function easelGeo() {
  const legs = [];
  for (const x of [-0.3, 0.3]) {
    const l = box(0.04, 1.7, 0.04);
    l.rotateX(-0.12); l.translate(x, 0.84, 0.05);
    legs.push(l);
  }
  const back = box(0.04, 1.6, 0.04); back.rotateX(0.3); back.translate(0, 0.78, 0.3);
  legs.push(back, box(0.7, 0.04, 0.06, 0, 0.72, 0.0));
  return merge(legs);
}
export function printGeo() { const g = box(0.8, 0.6, 0.02); g.rotateX(-0.12); g.translate(0, 1.08, -0.02); return clean(g); }

// Линейный светильник
export function linearGeo(len = 3.0) { return clean(box(len, 0.05, 0.07)); }

// Кольцевой светильник
export function ringGeo(r = 0.45) { const g = new THREE.TorusGeometry(r, 0.04, 8, 36); g.rotateX(Math.PI / 2); return clean(g); }

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
    // соединительные лучи к соседям (по осям), как решётка на фото
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
  return clean(g);
}

// Стилизованная статуя учёного в халате (выставочная зона)
export function statueGeo() {
  const parts = [
    box(0.9, 0.5, 0.9, 0, 0.25, 0),                                   // постамент
    cyl(0.26, 0.42, 1.5, 0, 1.25, 0, 16),                             // халат
    cyl(0.2, 0.26, 0.35, 0, 2.15, 0, 16),                             // плечи
    new THREE.SphereGeometry(0.14, 16, 12).translate(0, 2.45, 0),     // голова
    cyl(0.17, 0.15, 0.13, 0, 2.6, 0, 16),                             // чалма
    box(0.12, 0.6, 0.12, 0.22, 1.85, -0.12).rotateZ(0.1),             // рука со свитком
    cyl(0.05, 0.05, 0.4, 0.2, 1.62, -0.25, 8),
  ];
  return merge(parts);
}

// Турникет: две стойки из нержавейки + стеклянные створки
export function turnstileGeo() {
  return merge([box(0.18, 1.0, 1.4, -0.45, 0.5, 0), box(0.18, 1.0, 1.4, 0.45, 0.5, 0), box(0.06, 0.06, 0.2, -0.45, 1.25, -0.6)]);
}
export function turnstileGlassGeo() { return merge([box(0.02, 0.85, 0.4, -0.2, 0.75, 0), box(0.02, 0.85, 0.4, 0.2, 0.75, 0)]); }

// Машина (для масштаба на парковке)
export function carBodyGeo() {
  return merge([box(1.8, 0.62, 4.4, 0, 0.55, 0), box(1.6, 0.5, 2.3, 0, 1.1, 0.15)]);
}
export function carGlassGeo() { return merge([box(1.62, 0.4, 2.2, 0, 1.12, 0.15)]); }
export function carWheelsGeo() {
  const w = [];
  for (const x of [-0.82, 0.82]) for (const z of [-1.35, 1.35]) { const c = new THREE.CylinderGeometry(0.33, 0.33, 0.22, 12); c.rotateZ(Math.PI / 2); c.translate(x, 0.33, z); w.push(c); }
  return merge(w);
}

// Дерево: ствол + крона из нескольких икосаэдров
export function treeCrownGeo(kind = 0) {
  const parts = [];
  if (kind === 2) { // туя/кипарис — конус
    return clean(new THREE.ConeGeometry(1.1, 6.5, 9).translate(0, 4.2, 0));
  }
  const n = kind === 1 ? 4 : 6;
  for (let k = 0; k < n; k++) {
    const s = new THREE.IcosahedronGeometry(1.6 + (k % 3) * 0.5, 1);
    const a = k * 2.1;
    s.translate(Math.cos(a) * 1.3, 5.2 + (k % 2) * 1.2, Math.sin(a) * 1.3);
    parts.push(s);
  }
  parts.push(new THREE.IcosahedronGeometry(2.0, 1).translate(0, 6.6, 0));
  return merge(parts);
}
export function trunkGeo() { return clean(new THREE.CylinderGeometry(0.16, 0.24, 4.6, 7).translate(0, 2.3, 0)); }
