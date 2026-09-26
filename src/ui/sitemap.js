// Ситуационный план: кампус и окружение в радиусе ~220 м, север вверху.
import * as B from '../data/building.js';
import { CONTEXT } from '../data/context.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bu = (B.BEARING_U * Math.PI) / 180;
const NU = Math.cos(bu), NV = Math.sin(bu);      // север в осях u, v
const EU = Math.sin(bu), EV = -Math.cos(bu);     // восток в осях u, v
const C0 = B.SIZE / 2;
// (u, v) → (x, y) листа: x — на восток, y — на юг
const xy = ([u, v]) => {
  const du = u - C0, dv = v - C0;
  return [du * EU + dv * EV, -(du * NU + dv * NV)];
};
const path = (pts) => pts.map((p, i) => { const [x, y] = xy(p); return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join(' ');

const LABELS = {
  33203080: 'Inha University', 915518607: 'Академия наук', 33203734: 'Детская больница № 5',
  33204840: 'Общежитие АН', 33202664: 'Институт химии растительных веществ',
};

export function renderSite(sheet, { onPickBuilding }) {
  const R = 215;
  const parts = [];
  // зелень и площадки
  for (const a of CONTEXT.areas) {
    const fill = a.k === 'pitch' ? '#c9795a' : a.k === 'fountain' ? '#7fb3cf' : a.k === 'park' || a.k === 'playground' ? '#9cc27a' : null;
    if (fill) parts.push(`<path d="${path(a.p)} Z" fill="${fill}" fill-opacity="0.55"/>`);
  }
  // дороги: подложка + полотно
  const roads = [...CONTEXT.roads].sort((a, b) => a.w - b.w);
  for (const r of roads) parts.push(`<path d="${path(r.p)}" fill="none" stroke="currentColor" stroke-opacity="0.35" stroke-width="${r.w + 1.4}" stroke-linecap="round" stroke-linejoin="round"/>`);
  for (const r of roads) parts.push(`<path d="${path(r.p)}" fill="none" stroke="var(--paper)" stroke-width="${r.w}" stroke-linecap="round" stroke-linejoin="round"/>`);
  for (const p of CONTEXT.paths) parts.push(`<path d="${path(p.p)}" fill="none" stroke="currentColor" stroke-opacity="0.35" stroke-width="0.8" stroke-dasharray="2 1.4"/>`);
  // соседние здания
  for (const bd of CONTEXT.buildings) {
    parts.push(`<path d="${path(bd.p)} Z" fill="currentColor" fill-opacity="${0.12 + Math.min(0.2, bd.h / 120)}" stroke="currentColor" stroke-opacity="0.5" stroke-width="0.4"/>`);
    const name = LABELS[bd.id] || bd.name;
    if (name) {
      const c = bd.p.reduce((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0]).map((s) => s / bd.p.length);
      const [x, y] = xy(c);
      parts.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="5" text-anchor="middle" opacity="0.75">${esc(name)}</text>`);
    }
  }
  // кампус
  const S = B.SIZE;
  const fp = [[0, 0], [S, 0], [S, S], [0, S]];
  const a = B.ATRIUM, c = B.CANOPY;
  parts.push(`<g class="campus" style="cursor:pointer">
    <path d="${path(fp)} Z" fill="#0f9e86" fill-opacity="0.85" stroke="#0a6f5e" stroke-width="0.8"/>
    <path d="${path([[a.u0, a.v0], [a.u1, a.v0], [a.u1, a.v1], [a.u0, a.v1]])} Z" fill="#bfe9df" stroke="#0a6f5e" stroke-width="0.5"/>
    <path d="${path([[c.u0, -c.depth], [c.u1, -c.depth], [c.u1, 0], [c.u0, 0]])} Z" fill="#0a6f5e"/>
  </g>`);
  const [lx, ly] = xy([C0, C0]);
  parts.push(`<text x="${lx}" y="${ly + 36}" font-size="7" text-anchor="middle" font-weight="700" class="brand">School 21</text>`);
  const [ex, ey] = xy([(c.u0 + c.u1) / 2, -c.depth - 8]);
  parts.push(`<text x="${ex}" y="${ey}" font-size="4.2" text-anchor="middle">вход</text>`);

  // названия улиц: самый длинный отрезок каждой улицы
  const byName = new Map();
  for (const r of CONTEXT.roads) {
    if (!r.name) continue;
    for (let i = 0; i < r.p.length - 1; i++) {
      const [p, q] = [r.p[i], r.p[i + 1]];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (!byName.has(r.name) || byName.get(r.name).len < len) byName.set(r.name, { p, q, len });
    }
  }
  for (const [name, { p, q, len }] of byName) {
    if (len < 40) continue;
    const [x0, y0] = xy(p), [x1, y1] = xy(q);
    let ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI;
    if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    if (Math.hypot(mx, my) > R) continue;
    parts.push(`<text x="${mx.toFixed(1)}" y="${my.toFixed(1)}" font-size="4.6" text-anchor="middle" dy="1.6" transform="rotate(${ang.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)})" font-style="italic" opacity="0.85">${esc(name)}</text>`);
  }
  // север и масштаб
  parts.push(`<g transform="translate(${R - 18} ${-R + 20})"><circle r="10" fill="none" stroke="currentColor" stroke-width="0.6"/><path d="M0 -9 L3.4 5 L0 2.4 L-3.4 5 Z" fill="currentColor"/><text y="-12.5" font-size="5.5" text-anchor="middle" font-weight="700">С</text></g>`);
  const sb = [];
  for (let i = 0; i < 5; i++) sb.push(`<rect x="${-R + 10 + i * 10}" y="${R - 16}" width="10" height="3" fill="${i % 2 ? 'none' : 'currentColor'}" stroke="currentColor" stroke-width="0.4"/>`);
  parts.push(`<g>${sb.join('')}<text x="${-R + 10}" y="${R - 19}" font-size="4.5" class="ax">0</text><text x="${-R + 60}" y="${R - 19}" font-size="4.5" text-anchor="middle" class="ax">50 м</text></g>`);

  sheet.innerHTML = `<div class="bar"><h3>Ситуационный план · Академгородок, Мирзо-Улугбекский район</h3></div>
    <svg viewBox="${-R} ${-R} ${R * 2} ${R * 2}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Ситуационный план кампуса">
      <style>text{font-family:Onest,system-ui,sans-serif;fill:currentColor}.ax{font-family:"JetBrains Mono",monospace}.brand{font-family:Unbounded,Onest,sans-serif;fill:#0f9e86}</style>
      <rect x="${-R}" y="${-R}" width="${R * 2}" height="${R * 2}" fill="currentColor" fill-opacity="0.025"/>
      ${parts.join('\n')}
    </svg>
    <div class="foot"><span class="mono">41.33844° N, 69.33590° E</span> · ул. Зиёлилар, 13 · контур и улицы — © OpenStreetMap. Кампус окрашен, клик — к 3D.
      <a href="https://yandex.uz/maps/org/school_21/209504048996/" target="_blank" rel="noopener" style="color:var(--accent)">Яндекс Карты</a> ·
      <a href="https://www.openstreetmap.org/way/33203100" target="_blank" rel="noopener" style="color:var(--accent)">OpenStreetMap</a></div>`;
  sheet.querySelector('.campus')?.addEventListener('click', onPickBuilding);
}
