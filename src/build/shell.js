// Оболочка здания по схеме, снятой с 6 откалиброванных фото:
// фасады (с разбивкой по этажным поясам для разрезов), карниз, башня со щелевыми окнами,
// козырёк-консоль с колоннами и светильниками, логотипы «21 SCHOOL», вход с раздвижными
// дверями, крыльцо, пандус-«змейка», гранитные цветники, заглублённая дорожка вдоль
// СВ фасада с окнами подвала, кровля с надстройками, световой фонарь с пирамидой.
import * as THREE from 'three';
import { Batch, boxUVZ, P, sx, sy, sz, rng } from '../lib/geom.js';
import {
  SIZE, GRADE, LEVELS, ROOF_Z, PARAPET_Z, FACADE, FACADES, CANOPY, LOGOS, ENTRANCE, SKYLIGHT, ROOF_BOXES,
} from '../data/building.js';

const zOf = (id) => LEVELS.find((l) => l.id === id).z;
const Z1 = zOf('L1'), Z2 = zOf('L2'), Z3 = zOf('L3');
// Этажные пояса фасада: по ним режем геометрию, чтобы прятать этажи в разрезе
export const BANDS = [
  { id: 'L1', z0: GRADE - 3, z1: Z2 },
  { id: 'L2', z0: Z2, z1: Z3 },
  { id: 'L3', z0: Z3, z1: ROOF_Z },
  { id: 'ROOF', z0: ROOF_Z, z1: 100 },
];
const bandOf = (z) => (BANDS.find((b) => z >= b.z0 && z < b.z1) || BANDS[BANDS.length - 1]).id;

// Значения по умолчанию (если в building.js нет FACADE)
const F = {
  module: 1.12, sill: 0.9, l2Glass: 4.25, band: [7.64, 8.93], bandJoint: 8.28, l3Top: 12.57,
  l2Rows: [6.63], l3Rows: [9.65, 11.4], corniceProj: 0.18, corniceJoint: 13.6, ...(FACADE || {}),
};

// (сторона, s, n) → (u, v). n > 0 — наружу от плоскости фасада.
function toUV(side, s, n) {
  switch (side) {
    case 'SE': return [s, -n];
    case 'NE': return [SIZE + n, s];
    case 'NW': return [SIZE - s, SIZE + n];
    case 'SW': return [-n, SIZE - s];
  }
}
// наружная нормаль фасада в координатах сцены
const OUT = { SE: [0, 0, 1], NE: [1, 0, 0], NW: [0, 0, -1], SW: [-1, 0, 0] };

export function buildShell(mats) {
  const bands = Object.fromEntries(BANDS.map((b) => [b.id, new Batch(mats)]));
  const glassKey = (base, band) => (band === 'ROOF' ? base : `${base}@${band}`);
  const R = rng(2110);

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
  // Коробка в координатах здания, порезанная по поясам
  function ubox(key, u0, v0, z0, u1, v1, z1) {
    for (const b of BANDS) {
      const a = Math.max(z0, b.z0), c = Math.min(z1, b.z1);
      if (c - a > 1e-3) bands[b.id].box(key, u0, v0, a, u1, v1, c);
    }
  }
  const addGeo = (key, geo, z) => bands[bandOf(z)].add(key, geo);

  // Витраж: стекло + стойки на модуле 1.12 + ригели. Возвращает разбивку модулей.
  function glazing(side, s0, s1, z0, z1, glass, { rows = [], frame = 'mullion', n = 0, cap = 0.055, head = true, sill = true, skipV = null } = {}) {
    fbox(side, s0, s1, z0, z1, n - 0.03, n, glass, { perLevel: true });
    const cnt = Math.max(1, Math.round((s1 - s0) / F.module));
    const st = (s1 - s0) / cnt;
    for (let i = 0; i <= cnt; i++) {
      const s = s0 + i * st;
      if (skipV && skipV(s)) continue;
      fbox(side, s - 0.026, s + 0.026, z0, z1, n - 0.08, n + cap, frame);
    }
    for (const z of rows) if (z > z0 + 0.05 && z < z1 - 0.05) fbox(side, s0, s1, z - 0.026, z + 0.026, n - 0.08, n + cap * 0.8, frame);
    if (sill) fbox(side, s0, s1, z0, z0 + 0.05, n - 0.08, n + cap, frame);
    if (head) fbox(side, s0, s1, z1 - 0.05, z1, n - 0.08, n + cap, frame);
    return { cnt, st };
  }

  // Приоткрытая верхнеподвесная фрамуга (стекло + рама), поворот наружу вокруг верхней кромки
  function vent(side, sA, sB, zTop, h, glass, ang = 0.4) {
    const [ua, va] = toUV(side, sA, 0.012), [ub, vb] = toUV(side, sB, 0.05);
    const u0 = Math.min(ua, ub), u1 = Math.max(ua, ub), v0 = Math.min(va, vb), v1 = Math.max(va, vb);
    const band = bandOf(zTop - 0.02);
    const [pu, pv] = toUV(side, (sA + sB) / 2, 0.03);
    const pivot = P(pu, pv, zTop);
    const o = OUT[side];
    const axis = new THREE.Vector3(-o[2], 0, o[0]).normalize();
    const rot = new THREE.Matrix4().makeRotationAxis(axis, ang);
    const place = (g) => { g.translate(-pivot.x, -pivot.y, -pivot.z); g.applyMatrix4(rot); g.translate(pivot.x, pivot.y, pivot.z); return g; };
    bands[band].add(glassKey(glass, band), place(boxUVZ(u0, v0, zTop - h, u1, v1, zTop)));
    // рама створки
    const fr = 0.045, alongU = side === 'SE' || side === 'NW';
    const bar = (a0, a1, z0, z1) => {
      const g = alongU ? boxUVZ(a0, v0 - 0.01, z0, a1, v1 + 0.01, z1) : boxUVZ(u0 - 0.01, a0, z0, u1 + 0.01, a1, z1);
      bands[band].add('mullion', place(g));
    };
    const a0 = alongU ? u0 : v0, a1 = alongU ? u1 : v1;
    bar(a0, a1, zTop - fr, zTop); bar(a0, a1, zTop - h, zTop - h + fr);
    bar(a0, a0 + fr, zTop - h, zTop); bar(a1 - fr, a1, zTop - h, zTop);
  }
  // count фрамуг в случайных модулях ряда
  function vents(side, s0, s1, zTop, h, count, glass, cnt, st) {
    const used = new Set();
    for (let k = 0; k < count * 4 && used.size < count; k++) {
      const i = Math.floor(R() * cnt);
      if (used.has(i) || used.has(i - 1) || used.has(i + 1)) continue;
      used.add(i);
      vent(side, s0 + i * st + 0.03, s0 + (i + 1) * st - 0.03, zTop, h, glass, 0.35 + R() * 0.08);
    }
  }
  // Шов облицовки (тёмная риска) по фасаду: горизонтальный / вертикальный
  const hJoint = (side, s0, s1, z, n) => fbox(side, s0, s1, z - 0.007, z + 0.007, n - 0.02, n + 0.003, 'acpJoint');
  const vJoint = (side, s, z0, z1, n) => fbox(side, s - 0.007, s + 0.007, z0, z1, n - 0.02, n + 0.003, 'acpJoint');
  // Гранитный цоколь
  const plinth = (side, s0, s1, top) => fbox(side, s0, s1, GRADE - 0.4, top, -0.2, 0.14, 'plinthGranite');

  // ── Фасады ───────────────────────────────────────────────────────────────
  for (const [side, fac] of Object.entries(FACADES)) {
    for (const seg of fac.segments) {
      const { s0, s1 } = seg;
      const cz = seg.cornice ?? F.l3Top;
      switch (seg.type) {
        case 'pilaster': {
          const pr = seg.proj ?? 0.3;
          plinth(side, s0, s1, Z1);
          fbox(side, s0, s1, Z1, cz, -0.25, pr, 'acp');
          for (let z = Z1 + 1.4; z < cz - 0.3; z += 1.4) hJoint(side, s0, s1, z, pr);
          break;
        }
        case 'curtain': {
          // сплошной витраж 0.9 → низ карниза: оливковое стекло, выше перекрытия 3 эт. — голубое
          const blue = seg.blueFrom ?? 8.9;
          plinth(side, s0, s1, F.sill);
          const rows = (seg.rows || []).filter((z) => z < blue - 0.2);
          glazing(side, s0, s1, F.sill, blue, 'glassOlive', { rows, head: false });
          fbox(side, s0, s1, blue - 0.17, blue + 0.03, -0.08, 0.06, 'mullionDark');     // кромка перекрытия
          const g = glazing(side, s0, s1, blue, cz, 'glassBlue', { rows: (seg.rows || []).filter((z) => z > blue + 0.2), sill: false });
          vents(side, s0, s1, cz - 0.06, 1.2, seg.vents ?? 5, 'glassBlue', g.cnt, g.st);
          break;
        }
        case 'portal': {
          const jamb = seg.jamb ?? 2.1, [b0, b1] = seg.beam || [7.6, 8.9];
          plinth(side, s0, s1, F.sill);
          // двухсветный витраж в раме (утоплен относительно белой рамы)
          const g1 = glazing(side, s0 + jamb, s1, F.sill, b0, 'glassOlive', { rows: seg.rows || [] });
          if (seg.portalVents) {
            const top = (seg.rows || []).filter((z) => z < b0).pop() ?? b0 - 0.8;
            vents(side, s0 + jamb, s1, b0 - 0.05, Math.min(1.1, b0 - top - 0.1), seg.portalVents, 'glassOlive', g1.cnt, g1.st);
          }
          // белая П-рама: косяк (0 → верх ригеля) и ригель
          fbox(side, s0, s0 + jamb, Z1, b1, -0.1, 0.25, 'acp');
          fbox(side, s0 + jamb, s1, b0, b1, -0.1, 0.2, 'acp');
          for (let z = Z1 + 1.5; z < b0; z += 1.5) hJoint(side, s0, s0 + jamb, z, 0.25);
          vJoint(side, s0 + jamb / 2, Z1, b1, 0.25);
          for (let s = s0 + jamb + 2.24; s < s1 - 0.5; s += 2.24) vJoint(side, s, b0, b1, 0.2);
          hJoint(side, s0, s1, (b0 + b1) / 2, 0.2);
          // голубая лента 3 этажа над рамой
          const g = glazing(side, s0, s1, b1, cz, 'glassBlue', { rows: seg.ribbonRows || [9.65] });
          vents(side, s0, s1, cz - 0.06, 1.2, seg.vents ?? 7, 'glassBlue', g.cnt, g.st);
          break;
        }
        case 'tower': {
          const pr = seg.proj ?? 0.2, top = seg.top ?? 17.3;
          plinth(side, s0, s1, Z1);
          fbox(side, s0, s1, Z1, top, -0.3, pr, 'acp');
          // над кровлей башня уходит вглубь (лестница + машинное отделение, см. ROOF_BOXES)
          fbox(side, s0, s1, PARAPET_Z - 0.3, top, -1.2, -0.3, 'acp');
          fbox(side, s0 - 0.02, s1 + 0.02, top - 0.05, top + 0.05, -1.25, pr + 0.03, 'coping');
          // щелевые окна: тёмно-синее стекло в тонкой раме
          const slots = seg.slots || [];
          for (const [a, b, z0, z1] of slots) {
            fbox(side, a, b, z0, z1, pr - 0.02, pr + 0.006, 'glassNavy');
            fbox(side, a - 0.035, b + 0.035, z0 - 0.035, z0, pr - 0.02, pr + 0.02, 'mullionDark');
            fbox(side, a - 0.035, b + 0.035, z1, z1 + 0.035, pr - 0.02, pr + 0.02, 'mullionDark');
            fbox(side, a - 0.035, a, z0, z1, pr - 0.02, pr + 0.02, 'mullionDark');
            fbox(side, b, b + 0.035, z0, z1, pr - 0.02, pr + 0.02, 'mullionDark');
          }
          // швы облицовки башни: сетка ≈1.2 × 1.0 м, в обход окон
          const inSlot = (s, z) => slots.some(([a, b, z0, z1]) => s > a - 0.05 && s < b + 0.05 && z > z0 - 0.05 && z < z1 + 0.05);
          const vs = [s0 + 1.2, (slots[0]?.[1] ?? s0 + 1.8) + 0.62, (s0 + s1) / 2 + 0.25, s1 - 1.2];
          for (const s of vs) {
            let z = Z1 + 0.05;
            while (z < top - 0.05) {
              let e = z; while (e < top - 0.05 && !inSlot(s, e)) e += 0.1;
              if (e - z > 0.3) vJoint(side, s, z, e, pr);
              z = e + 0.1; while (z < top - 0.05 && inSlot(s, z)) z += 0.1;
            }
          }
          for (let z = Z1 + 1.0; z < top - 0.2; z += 1.0) {
            let a = s0 + 0.02;
            const cuts = slots.filter(([, , z0, z1]) => z > z0 - 0.05 && z < z1 + 0.05).map(([p, q]) => [p - 0.05, q + 0.05]).sort((x, y) => x[0] - y[0]);
            for (const [p, q] of cuts) { if (p - a > 0.1) hJoint(side, a, p, z, pr); a = q; }
            if (s1 - 0.02 - a > 0.1) hJoint(side, a, s1 - 0.02, z, pr);
          }
          break;
        }
        case 'block': {
          const l1 = seg.l1 || 'glass';
          if (l1 === 'entrance') entranceL1(side, seg);
          else if (l1 === 'open') {
            // бок портика: 1 этаж открыт, по краю — балка перекрытия и ограждение
            fbox(side, s0, s1, Z1 + CANOPY.soffit, F.l2Glass, -0.1, 0.03, 'acp');
            const [ua, va] = toUV(side, s0 + 0.2, -0.1), [ub, vb] = toUV(side, s1 - 0.1, -0.1);
            railing(bands.L1, [ua, va, Z1 + 0.95], [ub, vb, Z1 + 0.95], { mat: 'steelExt', bars: 3, step: 1.3 });
          } else if (l1 === 'recessed') {
            plinth(side, s0, s1, Z1);
            glazing(side, s0, s1, Z1 + 0.02, Z1 + CANOPY.soffit, 'glassDark', { n: -0.2, rows: [Z1 + 2.7] });
            // выносная полоса-софит 3.3–4.25 (продолжение козырька) с точечными светильниками
            const d = seg.soffit ?? 1.5, zs = Z1 + CANOPY.soffit;
            fbox(side, s0, s1, zs, F.l2Glass, -0.2, d, 'acp');
            fbox(side, s0, s1, zs - 0.015, zs, -0.2, d - 0.04, 'soffit');
            hJoint(side, s0, s1, zs + 0.45, d);
            for (let s = s0 + 1.2; s < s1 - 0.4; s += 1.2) vJoint(side, s, zs, F.l2Glass, d);
            for (let s = s0 + 1.1; s < s1 - 0.5; s += 2.2) {
              const [u, v] = toUV(side, s, d * 0.5);
              downlight(bands.L1, u, v, zs - 0.015);
            }
          } else {
            plinth(side, s0, s1, F.sill);
            glazing(side, s0, s1, F.sill, Z1 + 3.3, 'glassOlive', { rows: [Z1 + 2.5] });
            fbox(side, s0, s1, Z1 + 3.3, F.l2Glass, -0.1, 0.03, 'acp');
          }
          // 2 этаж — голубое стекло, белый пояс заподлицо, 3 этаж — голубое стекло
          const g2 = glazing(side, s0, s1, F.l2Glass, F.band[0], 'glassBlue', { rows: F.l2Rows });
          fbox(side, s0, s1, F.band[0], F.band[1], -0.12, 0.03, 'acp');
          hJoint(side, s0, s1, F.bandJoint, 0.03);
          for (let s = s0 + 2.24; s < s1 - 0.3; s += 2.24) vJoint(side, s, F.band[0], F.band[1], 0.03);
          const g3 = glazing(side, s0, s1, F.band[1], cz, 'glassBlue', { rows: F.l3Rows });
          if (seg.vents) vents(side, s0, s1, cz - 0.06, 1.15, seg.vents, 'glassBlue', g3.cnt, g3.st);
          void g2;
          break;
        }
      }
      // карниз участка (у башни карниза нет — она выше)
      if (seg.type !== 'tower') {
        const pr = F.corniceProj;
        const a = s0 <= 0.01 ? s0 - pr : s0, b = s1 >= SIZE - 0.01 ? s1 + pr : s1;
        fbox(side, a, b, cz, PARAPET_Z, -0.35, pr, 'acp');
        hJoint(side, a, b, F.corniceJoint, pr);
        for (let s = Math.ceil((a + 0.3) / F.module) * F.module; s < b - 0.3; s += F.module) vJoint(side, s, cz + 0.02, PARAPET_Z - 0.03, pr);
        fbox(side, a - 0.01, b + 0.01, PARAPET_Z - 0.03, PARAPET_Z + 0.03, -0.42, pr + 0.025, 'coping');
      }
    }
  }

  // ── Вход: витраж тамбура с раздвижными дверями (u 42.3–53.4) ──────────────
  function entranceL1(side, seg) {
    const g = ENTRANCE.glazing || { u0: seg.s0, u1: seg.s1 - 1.8, h: 3.3 };
    const doors = ENTRANCE.doors || [];
    const dv = g.v ?? 0;                       // витраж утоплен в глубину портика на dv
    const cnt = Math.max(1, Math.round((g.u1 - g.u0) / F.module));
    const st = (g.u1 - g.u0) / cnt;
    const doorH = doors[0]?.h ?? 2.7;
    const n0 = -dv - 0.03, n1 = -dv;
    const inDoor = (a, b) => doors.some((d) => (a + b) / 2 > d.u0 && (a + b) / 2 < d.u1);
    const midDoor = (s) => doors.some((d) => s > d.u0 + 0.15 && s < d.u1 - 0.15);
    for (let i = 0; i < cnt; i++) {
      const a = g.u0 + i * st, b = a + st;
      if (inDoor(a, b)) fbox(side, a, b, doorH, g.h, n0, n1, 'glassDark', { perLevel: true });
      else fbox(side, a, b, Z1, g.h, n0, n1, 'glassDark', { perLevel: true });
    }
    for (let i = 0; i <= cnt; i++) {
      const s = g.u0 + i * st;
      if (midDoor(s)) { fbox(side, s - 0.03, s + 0.03, doorH, g.h, n0 - 0.05, n1 + 0.06, 'frameBlack'); continue; }
      fbox(side, s - 0.03, s + 0.03, Z1, g.h, n0 - 0.05, n1 + 0.06, 'frameBlack');
    }
    fbox(side, g.u0, g.u1, doorH - 0.04, doorH + 0.04, n0 - 0.05, n1 + 0.06, 'frameBlack');
    fbox(side, g.u0, g.u1, g.h - 0.06, g.h, n0 - 0.05, n1 + 0.06, 'frameBlack');
    for (let i = 0; i < cnt; i++) { const a = g.u0 + i * st, b = a + st; if (!inDoor(a, b)) fbox(side, a, b, Z1, Z1 + 0.06, n0 - 0.05, n1 + 0.06, 'frameBlack'); }
    // распашные стеклянные двери — открыты внутрь
    for (const d of doors) {
      const w = (d.u1 - d.u0) / 2;
      for (const [a, sgn] of [[d.u0, 1], [d.u1, -1]]) {
        fbox(side, a + sgn * 0.02 - (sgn < 0 ? 0.04 : 0), a + sgn * 0.02 + (sgn > 0 ? 0.04 : 0), Z1 + 0.01, d.h - 0.04, n0 - w, n0 - 0.02, 'glassDoor');
        fbox(side, a - 0.03, a + 0.03, Z1 + 0.01, d.h - 0.04, n0 - w, n0 - 0.02, 'frameBlack');
      }
    }
    // над витражом до потолка портика
    fbox(side, g.u0, g.u1, g.h, Z1 + 4.1, n0 - 0.1, n1 + 0.03, 'acp');
    // по фасадной линии — балка перекрытия над портиком (под ней видна глубина портика)
    fbox(side, seg.s0, seg.s1, Z1 + CANOPY.soffit, F.l2Glass, -0.1, 0.03, 'acp');
  }

  // ── Козырёк: консоль 6.7 м, софит 3.3, верх 4.2, фасция из белых панелей ──
  const L1b = bands.L1;
  const c = CANOPY;
  const cz0 = Z1 + c.soffit, cz1 = Z1 + c.top;
  L1b.box('acp', c.u0, -c.depth, cz0, c.u1, 0, cz1);
  for (let u = c.u0 + 1.2; u < c.u1 - 0.1; u += 1.2) L1b.box('acpJoint', u - 0.007, -c.depth - 0.004, cz0 + 0.02, u + 0.007, -c.depth + 0.02, cz1 - 0.02);
  for (let v = -c.depth + 1.2; v < -0.2; v += 1.2) L1b.box('acpJoint', c.u1 - 0.02, v - 0.007, cz0 + 0.02, c.u1 + 0.004, v + 0.007, cz1 - 0.02);
  L1b.box('acpJoint', c.u0, -c.depth - 0.004, cz0 + 0.443, c.u1 + 0.004, -c.depth + 0.02, cz0 + 0.457);
  L1b.box('acpJoint', c.u1 - 0.02, -c.depth, cz0 + 0.443, c.u1 + 0.004, 0, cz0 + 0.457);
  L1b.box('coping', c.u0, -c.depth - 0.025, cz1, c.u1 + 0.025, 0, cz1 + 0.035);
  L1b.box('soffit', c.u0 + 0.04, -c.depth + 0.04, cz0 - 0.015, c.u1 - 0.04, -0.02, cz0);
  const dl = c.downlights || { rows: [-1.2, -3.4, -5.6], u0: c.u0 + 2, u1: c.u1 - 0.6, step: 2.2 };
  for (const v of dl.rows) for (let u = dl.u0; u <= dl.u1 + 0.01; u += dl.step) downlight(L1b, u, v, cz0 - 0.015);
  // отдельно стоящие колонны и пилоны у восточного края
  const col = (u0, v0, u1, v1) => {
    L1b.box('acpCream', u0, v0, Z1, u1, v1, cz0);
    for (let z = Z1 + 1.1; z < cz0 - 0.2; z += 1.1) L1b.box('acpJoint', u0 - 0.004, v0 - 0.004, z - 0.007, u1 + 0.004, v1 + 0.004, z + 0.007);
    L1b.box('steelDark', u0 - 0.01, v0 - 0.01, Z1, u1 + 0.01, v1 + 0.01, Z1 + 0.08);
  };
  for (const [u, v] of c.freeColumns || []) col(u - 0.45, v - 0.45, u + 0.45, v + 0.45);
  for (const [u0, v0, u1, v1] of c.piers || []) col(u0, v0, u1, v1);
  for (const u of c.columns || []) col(u - 0.45, -c.depth + 0.1, u + 0.45, -c.depth + 1.0);

  // ── Терраса, крыльцо, гранитный цветник-щека ──────────────────────────────
  const st = ENTRANCE.stairs;
  const rise = (Z1 - GRADE) / st.risers;
  const vFoot = st.vTop - st.risers * st.tread;
  const tU0 = (ENTRANCE.glazing?.u0 ?? 42.3);
  L1b.box('stepGranite', tU0, st.vTop, GRADE - 0.3, st.u1, 0.0, Z1);                     // площадка перед дверями
  L1b.box('stepGranite', c.u0, st.vTop, GRADE - 0.3, tU0, -0.25, Z1);
  for (let i = 0; i < st.risers; i++) {
    const v0 = vFoot + i * st.tread, v1 = v0 + st.tread;
    L1b.box('stepGranite', st.u0, v0, GRADE - 0.3, st.u1, v1, GRADE + rise * (i + 1));
    L1b.box('stepNosing', st.u0 + 0.05, v0 + 0.03, GRADE + rise * (i + 1), st.u1 - 0.05, v0 + 0.07, GRADE + rise * (i + 1) + 0.004);
  }
  // левая щека крыльца (гранит, со скатом)
  const cheek = wedgeU(st.u0 - 0.4, st.u0, vFoot, st.vTop, GRADE + 0.35, Z1 + 0.35, GRADE - 0.3, 'v');
  L1b.add('plinthGranite', cheek);
  L1b.box('plinthGranite', tU0, st.vTop - 0.3, GRADE - 0.3, st.u0, st.vTop, Z1 + 0.35);
  // поручни — только по краям (средний убран)
  railing(L1b, [st.u0 + 0.3, vFoot + 0.15, GRADE + 0.95], [st.u0 + 0.3, st.vTop + 0.1, Z1 + 0.95], { mat: 'steelExt', bars: 3, step: 1.3 });
  railing(L1b, [st.u1 - 0.3, vFoot + 0.15, GRADE + 0.95], [st.u1 - 0.3, st.vTop + 0.1, Z1 + 0.95], { mat: 'steelExt', bars: 3, step: 1.3 });
  railing(L1b, [tU0 + 0.1, st.vTop + 0.12, Z1 + 0.95], [st.u0 - 0.1, st.vTop + 0.12, Z1 + 0.95], { mat: 'steelExt', bars: 3, step: 1.2 });
  // гранитный цветник справа от крыльца
  const pl = ENTRANCE.planter;
  if (pl) {
    L1b.box('plinthGranite', pl.u0, pl.v0, GRADE - 0.3, pl.u1, pl.v1, pl.top);
    L1b.box('soil', pl.u0 + 0.15, pl.v0 + 0.15, pl.top - 0.1, pl.u1 - 0.15, pl.v1 - 0.05, pl.top - 0.02);
    L1b.box('coping', pl.u0 - 0.02, pl.v0 - 0.02, pl.top - 0.01, pl.u1 + 0.02, pl.v0 + 0.15, pl.top + 0.03);
  }

  // ── Пандус-«змейка»: нижний марш ← площадь, поворотная площадка, верхний марш → терраса ──
  const rp = ENTRANCE.ramp;
  if (rp.landing) {
    const Ld = rp.landing, up = rp.upper, lo = rp.lower;
    // площадка
    L1b.box('stepGranite', Ld.u0, lo.v0, GRADE - 0.3, Ld.u1, up.v1, Ld.z);
    // верхний марш (поднимается по +u к террасе)
    L1b.add('stepGranite', wedgeU(Ld.u1, up.u1, up.v0, up.v1, Ld.z, Z1, GRADE - 0.3));
    // нижний марш (спускается по +u к площади)
    L1b.add('stepGranite', wedgeU(Ld.u1, lo.u1, lo.v0, lo.v1, Ld.z, GRADE + 0.01, GRADE - 0.3));
    // стенка между маршами и наружная стенка (гранит), бортики на 0.1 выше покрытия
    L1b.add('plinthGranite', wedgeU(Ld.u1, up.u1, lo.v1, up.v0, Ld.z + 0.12, Z1 + 0.12, GRADE - 0.3));
    L1b.add('plinthGranite', wedgeU(Ld.u1, lo.u1, lo.v0 - 0.25, lo.v0, Ld.z + 0.12, GRADE + 0.12, GRADE - 0.3));
    L1b.box('plinthGranite', Ld.u0 - 0.1, lo.v0 - 0.25, GRADE - 0.3, Ld.u1, lo.v0, Ld.z + 0.12);
    // 5 ступеней с площадки к площади (у южного края)
    const n = rp.steps || 5, tr = 0.35, rz = (Ld.z - GRADE) / n;
    for (let i = 0; i < n; i++) {
      const u1 = Ld.u0 - i * tr;
      L1b.box('stepGranite', u1 - tr, lo.v0, GRADE - 0.3, u1, up.v1, Ld.z - rz * i);
      L1b.box('stepNosing', u1 - 0.07, lo.v0 + 0.05, Ld.z - rz * i, u1 - 0.03, up.v1 - 0.05, Ld.z - rz * i + 0.004);
    }
    // перила из нержавейки с 3 ригелями, синие светодиоды на стойках
    const zu = (u) => Ld.z + (Z1 - Ld.z) * (u - Ld.u1) / (up.u1 - Ld.u1);
    const zl = (u) => Ld.z + (GRADE - Ld.z) * (u - Ld.u1) / (lo.u1 - Ld.u1);
    const rOpt = { mat: 'steelExt', bars: 3, step: 1.5, led: true };
    railing(L1b, [Ld.u1, up.v1 - 0.12, zu(Ld.u1) + 0.95], [up.u1, up.v1 - 0.12, Z1 + 0.95], rOpt);
    railing(L1b, [Ld.u1, up.v0 + 0.1, zu(Ld.u1) + 1.07], [up.u1, up.v0 + 0.1, Z1 + 1.07], rOpt);
    railing(L1b, [Ld.u1, lo.v1 - 0.1, zl(Ld.u1) + 0.95], [lo.u1, lo.v1 - 0.1, GRADE + 0.95], rOpt);
    railing(L1b, [Ld.u1, lo.v0 - 0.12, zl(Ld.u1) + 1.07], [lo.u1, lo.v0 - 0.12, GRADE + 1.07], rOpt);
    railing(L1b, [Ld.u0 - 0.05, lo.v0 - 0.12, Ld.z + 1.07], [Ld.u1, lo.v0 - 0.12, Ld.z + 1.07], rOpt);
    railing(L1b, [Ld.u0 - n * tr, up.v1 - 0.12, GRADE + 0.95], [Ld.u0, up.v1 - 0.12, Ld.z + 0.95], rOpt);
    railing(L1b, [Ld.u0 - n * tr, lo.v0 + 0.12, GRADE + 0.95], [Ld.u0, lo.v0 + 0.12, Ld.z + 0.95], rOpt);
  } else {
    // старый формат: прямой пандус вдоль фасада
    L1b.add('stepGranite', wedgeU(rp.u0, rp.u1, rp.v0, rp.v1, GRADE, Z1, GRADE - 0.3));
    railing(L1b, [rp.u0, rp.v0 + 0.15, GRADE + 0.95], [rp.u1, rp.v0 + 0.15, Z1 + 0.95], { mat: 'steelExt', bars: 3 });
  }

  // ── Гранитная полоса-цветник и заглублённая дорожка вдоль СВ фасада ───────
  const ns = ENTRANCE.neStrip, nw = ENTRANCE.neWalk;
  if (ns && nw) {
    // верхний короб цветника (с полкой −0.25) и нижняя подпорная стена до дорожки
    L1b.box('plinthGranite', ns.u0, ns.v0, ns.ledge, ns.u1 + 0.08, ns.v1, ns.top);
    L1b.box('plinthGranite', ns.u0, ns.v0, nw.z - 0.3, ns.u1, ns.v1, ns.ledge);
    L1b.box('coping', ns.u1 + 0.08 - 0.02, ns.v0, ns.top - 0.01, ns.u1 + 0.1, ns.v1, ns.top + 0.03);
    L1b.box('soil', ns.u0 + 0.05, ns.v0 + 0.05, ns.top - 0.1, ns.u1 - 0.1, ns.v1 - 0.05, ns.top - 0.03);
    // синие светодиодные акценты на грани цветника
    for (let v = ns.v0 + 1.2; v < ns.v1 - 0.5; v += 2.4) L1b.box('ledBlue', ns.u1 + 0.08, v - 0.015, ns.top - 0.45, ns.u1 + 0.095, v + 0.015, ns.top - 0.2);
    for (let u = (pl?.u0 ?? 55) + 0.8; u < (pl?.u1 ?? 58) - 0.3; u += 1.6) L1b.box('ledBlue', u - 0.015, (pl?.v0 ?? -6.5) - 0.015, (pl?.top ?? 0.7) - 0.4, u + 0.015, (pl?.v0 ?? -6.5), (pl?.top ?? 0.7) - 0.18);
    // маленькие окна подвала −1 в подпорной стене (z −1.9…−1.1)
    const [wz0, wz1] = nw.basementWindows || [-1.9, -1.1];
    let k = 0;
    for (let v = 3.0; v < ns.v1 - 2; v += 4.5, k++) {
      L1b.box('glassB1', ns.u1 - 0.02, v, wz0, ns.u1 + 0.004, v + 0.9, wz1);
      L1b.box('frameBlack', ns.u1 - 0.01, v - 0.04, wz0 - 0.04, ns.u1 + 0.012, v + 0.94, wz0);
      L1b.box('frameBlack', ns.u1 - 0.01, v - 0.04, wz1, ns.u1 + 0.012, v + 0.94, wz1 + 0.04);
      L1b.box('frameBlack', ns.u1 - 0.01, v - 0.04, wz0, ns.u1 + 0.012, v, wz1);
      L1b.box('frameBlack', ns.u1 - 0.01, v + 0.9, wz0, ns.u1 + 0.012, v + 0.94, wz1);
      if (k % 3 === 1) L1b.box('glassB1Lit', ns.u1 - 0.025, v + 0.05, wz0 + 0.05, ns.u1 - 0.02, v + 0.85, wz1 - 0.05);
    }
    // дорожка: шахматная плитка на −2.1, спуск с площади у южного конца, подпорная стенка и перила
    const vStairs = nw.v0 + 1.6;
    L1b.box('checkerTile', nw.u0, vStairs, nw.z - 0.25, nw.u1, nw.v1, nw.z);
    const nst = 4, rz = (GRADE - nw.z) / nst, tr = (vStairs - nw.v0) / nst;
    for (let i = 0; i < nst; i++) L1b.box('stepGranite', nw.u0, nw.v0 + i * tr, nw.z - 0.25, nw.u1, nw.v0 + (i + 1) * tr, GRADE - rz * (i + 1) + 0.0001);
    L1b.box('plinthGranite', nw.u1, nw.v0, nw.z - 0.3, nw.u1 + 0.25, nw.v1, GRADE + 0.12);
    L1b.box('plinthGranite', nw.u0, nw.v1 - 0.25, nw.z - 0.3, nw.u1, nw.v1, GRADE + 0.12);
    railing(L1b, [nw.u1 + 0.12, nw.v0 + 0.1, GRADE + 1.0], [nw.u1 + 0.12, nw.v1 - 0.2, GRADE + 1.0], { mat: 'steelExt', bars: 3, step: 2.2 });
  }

  // ── Кровля ───────────────────────────────────────────────────────────────
  const roof = bands.ROOF;
  const sk = SKYLIGHT;
  roof.add('concrete', slabRing(0.3, 0.3, SIZE - 0.3, SIZE - 0.3, sk.u0, sk.v0, sk.u1, sk.v1, ROOF_Z - 0.35, 0.35));
  roofHip(roof, 0.35, 0.35, SIZE - 0.35, SIZE - 0.35, sk.u0 - 0.4, sk.v0 - 0.4, sk.u1 + 0.4, sk.v1 + 0.4, ROOF_Z + 0.08, ROOF_Z + 0.75);
  // надстройки
  for (const rb of ROOF_BOXES) {
    const [u0, v0, u1, v1] = rb.rect;
    if (rb.ac) {
      roof.box('concrete', u0, v0, ROOF_Z, u1, v1, ROOF_Z + (rb.h ?? 0.3));
      for (let u = u0 + 0.7; u < u1 - 1.4; u += 2.1) for (let v = v0 + 0.8; v < v1 - 1.0; v += 2.4) acUnit(roof, u, v, ROOF_Z + (rb.h ?? 0.3));
      continue;
    }
    const top = rb.top ?? ROOF_Z + (rb.h ?? 2.6);
    const key = rb.top ? 'acp' : 'acpGray';
    roof.box(key, u0, v0, ROOF_Z, u1, v1, top);
    roof.box('coping', u0 - 0.06, v0 - 0.06, top - 0.04, u1 + 0.06, v1 + 0.06, top + 0.03);
    if (rb.tealRoof) roof.box('tealRoof', u0 + 0.1, rb.tealRoof[0], top + 0.03, u1 - 0.1, rb.tealRoof[1], top + 0.05);
    else roof.box('roofFlat', u0 + 0.1, v0 + 0.1, top + 0.03, u1 - 0.1, v1 - 0.1, top + 0.045);
    // дверь выхода на кровлю
    if (!rb.top) roof.box('frameBlack', (u0 + u1) / 2 - 0.5, v0 - 0.02, ROOF_Z + 0.9, (u0 + u1) / 2 + 0.5, v0 + 0.01, ROOF_Z + 2.9 > top - 0.2 ? top - 0.3 : ROOF_Z + 2.9);
  }
  // наружные блоки кондиционеров
  for (const [u, v] of [[20, 6], [23, 6], [26, 6], [8, 30], [8, 33], [47, 40], [50, 40], [47, 34], [22, 48]]) acUnit(roof, u, v, ROOF_Z + 0.35);

  // ── Световой фонарь и стеклянная пирамида ────────────────────────────────
  const lz0 = ROOF_Z, lz1 = sk.base;
  const wallT = 0.3;
  roof.box('acpGray', sk.u0 - wallT, sk.v0 - wallT, lz0, sk.u1 + wallT, sk.v0, lz1);
  roof.box('acpGray', sk.u0 - wallT, sk.v1, lz0, sk.u1 + wallT, sk.v1 + wallT, lz1);
  roof.box('acpGray', sk.u0 - wallT, sk.v0, lz0, sk.u0, sk.v1, lz1);
  roof.box('acpGray', sk.u1, sk.v0, lz0, sk.u1 + wallT, sk.v1, lz1);
  roof.box('coping', sk.u0 - wallT - 0.05, sk.v0 - wallT - 0.05, lz1 - 0.02, sk.u1 + wallT + 0.05, sk.v0 + 0.02, lz1 + 0.04);
  roof.box('coping', sk.u0 - wallT - 0.05, sk.v1 - 0.02, lz1 - 0.02, sk.u1 + wallT + 0.05, sk.v1 + wallT + 0.05, lz1 + 0.04);
  roof.box('coping', sk.u0 - wallT - 0.05, sk.v0, lz1 - 0.02, sk.u0 + 0.02, sk.v1, lz1 + 0.04);
  roof.box('coping', sk.u1 - 0.02, sk.v0, lz1 - 0.02, sk.u1 + wallT + 0.05, sk.v1, lz1 + 0.04);
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
  if (logos.canopy) groups.L2.add(logos.canopy);
  if (logos.tower) groups.ROOF.add(logos.tower);
  // Пятна света от светильников козырька (видны вечером и ночью)
  groups.L1.add(buildLightPools(mats));
  return groups;
}

// Точечный светильник в потолке: кольцо-рамка + светящийся диск
function downlight(batch, u, v, z) {
  const ring = new THREE.CylinderGeometry(0.11, 0.11, 0.012, 16).translate(sx(u), sy(z - 0.006), sz(v));
  batch.add('trimDark', ring);
  const disc = new THREE.CylinderGeometry(0.075, 0.075, 0.014, 16).translate(sx(u), sy(z - 0.008), sz(v));
  batch.add('ledDown', disc);
}

// Наружный блок кондиционера с вентилятором
function acUnit(batch, u, v, z) {
  batch.box('acUnit', u, v, z, u + 1.0, v + 0.8, z + 0.85);
  const fan = new THREE.CylinderGeometry(0.3, 0.3, 0.02, 18).translate(sx(u + 0.5), sy(z + 0.86), sz(v + 0.4));
  batch.add('trimDark', fan);
  batch.box('steelDark', u - 0.05, v - 0.05, z - 0.1, u + 1.05, v + 0.85, z);
}

// Клин вдоль u: верх наклонный от zA (при u0) до zB (при u1), низ zBot.
// dir = 'v' — наклон вдоль v (для щёк лестниц): zA при v0, zB при v1.
function wedgeU(u0, u1, v0, v1, zA, zB, zBot, dir = 'u') {
  const g = new THREE.BufferGeometry();
  const top = dir === 'u'
    ? [[u0, v0, zA], [u1, v0, zB], [u1, v1, zB], [u0, v1, zA]]
    : [[u0, v0, zA], [u1, v0, zA], [u1, v1, zB], [u0, v1, zB]];
  const bot = top.map(([u, v]) => [u, v, zBot]);
  const V = (p) => P(p[0], p[1], p[2]);
  const T = top.map(V), B = bot.map(V);
  const pos = [], uv = [];
  const quad = (a, b, c2, d, mode) => {
    for (const p of [a, b, c2, a, c2, d]) {
      pos.push(p.x, p.y, p.z);
      if (mode === 'y') uv.push(p.x, p.z); else if (mode === 'x') uv.push(p.z, p.y); else uv.push(p.x, p.y);
    }
  };
  // верх (порядок вершин — нормаль вверх), низ, 4 боковые грани
  quad(T[0], T[3], T[2], T[1], 'y');
  quad(B[0], B[1], B[2], B[3], 'y');
  quad(B[0], T[0], T[1], B[1], 'z');
  quad(B[1], T[1], T[2], B[2], 'x');
  quad(B[2], T[2], T[3], B[3], 'z');
  quad(B[3], T[3], T[0], B[0], 'x');
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  // гарантируем наружные нормали (сцена: z = −v, так что порядок мог развернуться)
  const n = g.attributes.normal;
  if (n.getY(0) < 0) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1);
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
      p.setXYZ(i + 2, x, y, z);
      const a = uv[(i + 1) * 2], b = uv[(i + 1) * 2 + 1];
      g.attributes.uv.setXY(i + 1, uv[(i + 2) * 2], uv[(i + 2) * 2 + 1]);
      g.attributes.uv.setXY(i + 2, a, b);
    }
    g.computeVertexNormals();
  }
  return g;
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

// Вальмовая кровля-«кольцо» вокруг фонаря: 4 трапеции от парапета к фонарю
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
    const n = g.attributes.normal;
    if (n.getY(0) < 0) {
      const p2 = [a, c, b, a, d, c].flatMap((p) => [p.x, p.y, p.z]);
      g.setAttribute('position', new THREE.Float32BufferAttribute(p2, 3));
      g.computeVertexNormals();
    }
    batch.add('roof', g);
  }
  // коньки-«рёбра» от углов к фонарю (видны на спутнике)
  for (let k = 0; k < 4; k++) {
    const A = O[k], B2 = I[k];
    const len = A.distanceTo(B2);
    const g = new THREE.BoxGeometry(0.16, 0.05, len);
    g.lookAt(B2.clone().sub(A));
    g.translate((A.x + B2.x) / 2, (A.y + B2.y) / 2 + 0.02, (A.z + B2.z) / 2);
    batch.add('roofRidge', g);
  }
}

// Перила из нержавейки: поручень + стойки (+ горизонтальные ригели, + синие светодиоды)
function railing(batch, a, b, { step = 1.4, mat = 'stainless', bars = 0, led = false, postH = 0.9 } = {}) {
  const A = P(...a), B = P(...b);
  const len = A.distanceTo(B);
  if (len < 0.05) return;
  const dir = B.clone().sub(A).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
  const tube = (r, dy, seg = 8) => {
    const t = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
    t.rotateZ(Math.PI / 2);
    t.applyQuaternion(q);
    t.translate((A.x + B.x) / 2, (A.y + B.y) / 2 - dy, (A.z + B.z) / 2);
    batch.add(mat, t);
  };
  tube(0.024, 0, 10);
  for (let k = 1; k <= bars; k++) tube(0.009, (postH - 0.12) * k / (bars + 1), 6);
  const n = Math.max(1, Math.round(len / step));
  for (let i = 0; i <= n; i++) {
    const p = A.clone().lerp(B, i / n);
    const post = new THREE.CylinderGeometry(0.021, 0.021, postH, 8);
    post.translate(p.x, p.y - postH / 2, p.z);
    batch.add(mat, post);
    if (led) batch.add('ledBlue', new THREE.BoxGeometry(0.02, 0.1, 0.02).translate(p.x, p.y - postH + 0.12, p.z + (Math.abs(dir.x) > 0.5 ? 0.025 : 0)));
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
    const glass = new THREE.BufferGeometry();
    glass.setAttribute('position', new THREE.Float32BufferAttribute([V0, V1, apex].flatMap((p) => [p.x, p.y, p.z]), 3));
    glass.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
    glass.computeVertexNormals();
    batch.add('skyGlass', glass);
    const Q = (a, b) => V0.clone().add(V1.clone().sub(V0).multiplyScalar(a / n)).add(apex.clone().sub(V0).multiplyScalar(b / n));
    for (let b = 0; b <= n; b++) for (let a = 0; a + b <= n; a++) {
      const p = Q(a, b);
      if (a + b < n) { member(p, Q(a + 1, b), 0.06); member(p, Q(a, b + 1), 0.06); member(Q(a + 1, b), Q(a, b + 1), 0.05); }
      const hub = new THREE.SphereGeometry(0.12, 8, 6);
      hub.translate(p.x, p.y - 0.04, p.z);
      batch.add('steelDark', hub);
      if ((a + b) % 2 === 0 && b > 0 && b < n && a > 0) rings.push(p.clone());
    }
    member(V0, apex, 0.1);
  }
  for (let k = 0; k < 4; k++) member(P(corners[k][0], corners[k][1], zb), P(corners[(k + 1) % 4][0], corners[(k + 1) % 4][1], zb), 0.14);
  // три красные горизонтальные стяжки (видны на фото из лаунжа)
  for (const t of [0.3, 0.5, 0.7]) {
    const zz = zb + sk.rise * t;
    const cs = corners.map(([u, v]) => P(cu + (u - cu) * (1 - t), cv + (v - cv) * (1 - t), zz));
    for (let k = 0; k < 4; k++) {
      const A = cs[k], B = cs[(k + 1) % 4];
      const g = new THREE.CylinderGeometry(0.022, 0.022, A.distanceTo(B), 6);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
      g.translate((A.x + B.x) / 2, (A.y + B.y) / 2 - 0.25, (A.z + B.z) / 2);
      batch.add('steelRed', g);
    }
  }
  const built = batch.build('skylight-frame', { castShadow: true });
  built.children.forEach((m) => { if (m.material.name === 'skyGlass') { m.castShadow = false; m.renderOrder = 2; } });
  group.add(built);
  const ringMesh = new THREE.InstancedMesh(ringGeo, mats.get('led'), rings.length);
  const m4 = new THREE.Matrix4();
  const r2 = rng(77);
  rings.forEach((p, i) => { m4.makeTranslation(p.x, p.y - 1.4 - r2() * 1.2, p.z); ringMesh.setMatrixAt(i, m4); });
  ringMesh.name = 'skylight-rings';
  group.add(ringMesh);
  const cable = new Batch(mats);
  const r3 = rng(77);
  for (const p of rings) { const h = 1.4 + r3() * 1.2; cable.add('black', new THREE.CylinderGeometry(0.006, 0.006, h, 3).translate(p.x, p.y - h / 2, p.z)); }
  group.add(cable.build('skylight-cables', { castShadow: false }));
  return group;
}

// ── Логотип «21 SCHOOL» ─────────────────────────────────────────────────────
// По фото: «2» — лесенка из 5 скруглённых блоков (сетка 4 × 5), «1» — флажок + высокая
// ножка, на которой у большого логотипа вертикальная надпись SCHOOL.
// Единицы: колонка = 0.182·size (0.40 м при 2.2), ряд = 0.2045·size (0.45 м).
const LOGO_2 = [[0.22, 0, 3.0, 1.0], [3.0, 0.92, 4.0, 1.92], [0.94, 1.92, 3.0, 2.92], [0.0, 2.9, 0.94, 3.86], [0.94, 3.84, 4.0, 5.0]];
const LOGO_1_FLAG = [4.5, 0, 5.45, 0.95];
const LOGO_1_STEM = [5.75, 0.88, 6.87, 5.0];
function roundedRectShape(x0, y0, x1, y1, r) {
  const s = new THREE.Shape();
  r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r);
  s.lineTo(x1, y1 - r); s.quadraticCurveTo(x1, y1, x1 - r, y1); s.lineTo(x0 + r, y1);
  s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}
// ExtrudeGeometry → [лицевые грани, боковины]
function splitCaps(g) {
  const out = [[], []];
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (const gr of g.groups) {
    const dst = out[gr.materialIndex === 0 ? 0 : 1];
    for (let i = gr.start; i < gr.start + gr.count; i++) dst.push(i);
  }
  return out.map((idx) => {
    const ng = new THREE.BufferGeometry();
    const p = new Float32Array(idx.length * 3), n = new Float32Array(idx.length * 3), t = new Float32Array(idx.length * 2);
    idx.forEach((i, k) => { p.set([pos.getX(i), pos.getY(i), pos.getZ(i)], k * 3); n.set([nor.getX(i), nor.getY(i), nor.getZ(i)], k * 3); t.set([uv.getX(i), uv.getY(i)], k * 2); });
    ng.setAttribute('position', new THREE.BufferAttribute(p, 3));
    ng.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    ng.setAttribute('uv', new THREE.BufferAttribute(t, 2));
    return ng;
  });
}
function buildLogos(mats) {
  const out = {};
  for (const L of LOGOS) {
    const b = new Batch(mats);
    const cw = 0.182 * L.size, rh = 0.2045 * L.size;
    const depth = L.posts ? 0.22 : 0.07;
    const H = 5 * rh;
    // блок в единицах логотипа → в плоскости фасада: x = u, y = z (сверху вниз по рядам)
    const block = (x0, y0, x1, y1, key = 'teal21') => {
      const shape = roundedRectShape(x0 * cw, H - y1 * rh, x1 * cw, H - y0 * rh, 0.22 * Math.min(cw, rh));
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 3 });
      g.translate(sx(L.u), sy(L.z), sz(L.v) - depth);
      const [caps, sides] = splitCaps(g);
      b.add(key, caps); b.add('teal21Side', sides);
    };
    for (const r of LOGO_2) block(...r);
    // перемычки-«шейки» между ступенями лесенки
    const neck = (x, y) => {
      const s = 0.3;
      const shape = new THREE.Shape([new THREE.Vector2(-s, 0), new THREE.Vector2(0, s), new THREE.Vector2(s, 0), new THREE.Vector2(0, -s)].map((p) => new THREE.Vector2(x * cw + p.x * cw, H - y * rh + p.y * rh)));
      const g = new THREE.ExtrudeGeometry(shape, { depth: depth * 0.999, bevelEnabled: false });
      g.translate(sx(L.u), sy(L.z), sz(L.v) - depth);
      const [caps, sides] = splitCaps(g);
      b.add('teal21', caps); b.add('teal21Side', sides);
    };
    neck(3.0, 0.96); neck(3.0, 1.92); neck(0.94, 2.91); neck(0.94, 3.85); neck(5.6, 0.92);
    block(...LOGO_1_FLAG);
    if (L.school) {
      block(...LOGO_1_STEM, 'teal21');
      // надпись SCHOOL на ножке «1»
      const [x0, y0, x1, y1] = LOGO_1_STEM;
      const g = new THREE.PlaneGeometry((x1 - x0) * cw * 0.84, (y1 - y0) * rh * 0.9);
      g.translate(sx(L.u + (x0 + x1) / 2 * cw), sy(L.z + H - (y0 + y1) / 2 * rh), sz(L.v) + 0.004);
      b.add('teal21School', g);
    } else block(...LOGO_1_STEM);
    // стойки и тяги к фасаду (большой логотип стоит на козырьке)
    if (L.posts) {
      const zTop = L.z, zCan = zTop - 0.4;
      for (const x of [0.6, 2.2, 3.6, 6.3]) b.box('steelDark', L.u + x * cw - 0.04, L.v + 0.04, zCan, L.u + x * cw + 0.04, L.v + 0.14, zTop + 0.05);
      b.box('steelDark', L.u, L.v + 0.08, zTop - 0.06, L.u + 6.9 * cw, L.v + 0.16, zTop);
      for (const x of [1.0, 5.2]) {
        const A = P(L.u + x * cw, L.v + depth, L.z + H * 0.72), Bp = P(L.u + x * cw, -0.05, L.z + H * 0.95);
        const len = A.distanceTo(Bp);
        const rod = new THREE.CylinderGeometry(0.018, 0.018, len, 6);
        rod.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bp.clone().sub(A).normalize()));
        rod.translate((A.x + Bp.x) / 2, (A.y + Bp.y) / 2, (A.z + Bp.z) / 2);
        b.add('steelDark', rod);
      }
    }
    const g = b.build(L.id);
    out[L.id === 'logo-canopy' ? 'canopy' : 'tower'] = g;
  }
  return out;
}

// Пятна света на террасе и ступенях под светильниками козырька (аддитивные, только вечером/ночью)
function buildLightPools(mats) {
  const c = CANOPY, st = ENTRANCE.stairs;
  const dl = c.downlights || { rows: [-1.2, -3.4, -5.6], u0: c.u0 + 2, u1: c.u1 - 0.6, step: 2.2 };
  const geos = [];
  const vFoot = st.vTop - st.risers * st.tread;
  const rise = (Z1 - GRADE) / st.risers;
  for (const v of dl.rows) for (let u = dl.u0; u <= dl.u1 + 0.01; u += dl.step) {
    let z = Z1;
    if (v < st.vTop && u > st.u0 && u < st.u1) z = GRADE + rise * Math.min(st.risers, Math.max(1, Math.ceil((v - vFoot) / st.tread)));
    const g = new THREE.PlaneGeometry(2.6, 2.6);
    g.rotateX(-Math.PI / 2);
    g.translate(sx(u), sy(z + 0.012), sz(v));
    geos.push(g);
  }
  const b = new Batch(mats);
  for (const g of geos) b.add('lightPool', g);
  const grp = b.build('lights-pools', { castShadow: false, receiveShadow: false });
  grp.userData.noCollide = true;
  grp.traverse((o) => { o.renderOrder = 3; });
  return grp;
}
