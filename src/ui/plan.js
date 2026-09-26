// Поэтажные планы (SVG) — «карта здания». Рисуются из тех же данных, что и 3D:
// зоны, стены с проёмами, марши, ядра, ряды столов, лекторий, площадка, колонны.
import * as B from '../data/building.js';

const S = B.SIZE;
const TYPE_FILL = {
  lobby: '#dfe7e4', hall: '#dfe7e4', foyer: '#e6ebe9', corridor: '#e6ebe9', gallery: '#e3e2ef', turnstiles: '#dfe7e4', photozone: '#c9d9f5',
  lounge: '#ead9bf', lounge3: '#e7d3b5', amphitheater: '#efcfc4', atrium: '#e9d6c8', platform: '#e2d9f3', kitchen: '#f8dcc4',
  meeting: '#d6e4f7', conference: '#d9dff0', game: '#dcefd4', pingpong: '#dcefcf', server: '#c9dbff', library: '#ecebe7',
  office: '#e4e6e5', cowork: '#e4e6e5', booths: '#d6e4f7', wardrobe: '#e4e6e5', wc: '#e1e3e2', porch: '#e8ded6', stairhall: '#e3f0ea',
};
const WALL_STYLE = {
  w: ['currentColor', 0.14, 1], c: ['currentColor', 0.26, 1], lib: ['currentColor', 0.3, 1], pink: ['#c98c7a', 0.3, 1], lift: ['#8e9496', 0.26, 1],
  g: ['#3aa0d8', 0.1, 1], glassrail: ['#3aa0d8', 0.08, 0.9], mint: ['#5fb89a', 0.18, 1], lilac: ['#a887c9', 0.18, 1], deco: null,
};
const CONF_COL = { plan: '#0f9e86', photo: '#0f9e86', video: '#2f6fd0', inferred: '#d98a17' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (n) => (Math.round(n * 10) / 10).toLocaleString('ru-RU');
const Y = (v) => -v;   // v вверх на листе: главный фасад внизу
const DIRV = { '+u': [1, 0], '-u': [-1, 0], '+v': [0, 1], '-v': [0, -1] };
const segDist = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  let t = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};
const seatsOf = (cluster, level) => B.DESKS.filter((d) => d.cluster === cluster && d.level === level)
  .reduce((n, d) => n + 2 * Math.max(1, Math.round((Math.abs(d.to - d.from) - 0.6) / 1.2)), 0);

export function renderPlan(sheet, { level, zones, conf, selected, onSelect }) {
  const L = B.LEVELS.find((l) => l.id === level) || B.LEVELS.find((l) => l.id === 'L2');
  const zs = zones.filter((z) => z.level === L.id);
  const el = L.z === 0 ? '±0,000' : `${L.z > 0 ? '+' : '−'}${Math.abs(L.z).toFixed(3).replace('.', ',')}`;
  const parts = [];
  const pad = 9;
  const vb = [-pad - 2, Y(S) - pad, S + pad * 2 + 2, S + pad * 2 + 6];
  parts.push(`<defs>
    <pattern id="hatch" width="1.2" height="1.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="1.2" stroke="#d98a17" stroke-width="0.22" stroke-opacity="0.75"/></pattern>
    <pattern id="closed" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="1.6" stroke="currentColor" stroke-width="0.12" stroke-opacity="0.25"/></pattern>
    <marker id="arr" viewBox="0 0 4 4" refX="2" refY="2" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L4 2 L0 4 z" fill="currentColor"/></marker>
  </defs>`);

  // сетка осей
  const g = B.GRID;
  g.u.forEach((u, i) => {
    parts.push(`<line x1="${u}" y1="${Y(-3)}" x2="${u}" y2="${Y(S + 3)}" stroke="currentColor" stroke-opacity="0.16" stroke-width="0.06" stroke-dasharray="1.2 0.5 0.2 0.5"/>`);
    parts.push(`<circle cx="${u}" cy="${Y(-5.2)}" r="1.25" fill="none" stroke="currentColor" stroke-width="0.1"/><text x="${u}" y="${Y(-5.2) + 0.45}" font-size="1.25" text-anchor="middle" class="ax">${g.labelsU[i]}</text>`);
  });
  g.v.forEach((v, i) => {
    parts.push(`<line x1="-3" y1="${Y(v)}" x2="${S + 3}" y2="${Y(v)}" stroke="currentColor" stroke-opacity="0.16" stroke-width="0.06" stroke-dasharray="1.2 0.5 0.2 0.5"/>`);
    parts.push(`<circle cx="-5.2" cy="${Y(v)}" r="1.25" fill="none" stroke="currentColor" stroke-width="0.1"/><text x="-5.2" y="${Y(v) + 0.45}" font-size="1.25" text-anchor="middle" class="ax">${g.labelsV[i]}</text>`);
  });
  parts.push(`<rect x="0" y="${Y(S)}" width="${S}" height="${S}" fill="currentColor" fill-opacity="0.035"/>`);

  // для полуэтажей — бледный план уровня под ними
  const underId = L.id === 'M' ? 'L1' : null;
  if (underId) for (const z of zones.filter((q) => q.level === underId)) {
    const [u0, v0, u1, v1] = z.rect;
    parts.push(`<rect x="${u0}" y="${Y(v1)}" width="${u1 - u0}" height="${v1 - v0}" fill="currentColor" fill-opacity="0.04" stroke="currentColor" stroke-opacity="0.12" stroke-width="0.06"/>`);
  }

  // зоны
  const sorted = [...zs].sort((a, b) => area(b) - area(a));
  for (const z of sorted) {
    const [u0, v0, u1, v1] = z.rect;
    const fill = z.type === 'cluster' ? (B.CLUSTER_COLORS[z.cluster] || '#999') : (TYPE_FILL[z.type] || '#e4e6e5');
    const op = z.type === 'cluster' ? 0.26 : 0.8;
    const sel = selected?.kind === 'zone' && selected.id === z.id;
    parts.push(`<g data-z="${z.id}" class="z">
      <rect x="${u0 + 0.06}" y="${Y(v1) + 0.06}" width="${u1 - u0 - 0.12}" height="${v1 - v0 - 0.12}" fill="${fill}" fill-opacity="${op}" stroke="${sel ? '#0f9e86' : 'currentColor'}" stroke-width="${sel ? 0.4 : 0.06}" stroke-opacity="${sel ? 1 : 0.3}"/>
      ${z.closed ? `<rect x="${u0}" y="${Y(v1)}" width="${u1 - u0}" height="${v1 - v0}" fill="url(#closed)" pointer-events="none"/>` : ''}
      ${z.confidence === 'inferred' ? `<rect x="${u0 + 0.06}" y="${Y(v1) + 0.06}" width="${u1 - u0 - 0.12}" height="${v1 - v0 - 0.12}" fill="url(#hatch)" opacity="${conf ? 0.9 : 0.45}" pointer-events="none"/>` : ''}
      ${conf ? `<rect x="${u0 + 0.35}" y="${Y(v1) + 0.35}" width="${u1 - u0 - 0.7}" height="${v1 - v0 - 0.7}" fill="none" stroke="${CONF_COL[z.confidence]}" stroke-width="0.3"/>` : ''}
    </g>`);
  }

  // проёмы в перекрытии (атриум, колодцы)
  for (const r of (B.SLAB_HOLES[L.id] || [])) {
    parts.push(`<rect x="${r[0]}" y="${Y(r[3])}" width="${r[2] - r[0]}" height="${r[3] - r[1]}" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="0.08" stroke-dasharray="0.7 0.35"/>
      <line x1="${r[0]}" y1="${Y(r[1])}" x2="${r[2]}" y2="${Y(r[3])}" stroke="currentColor" stroke-width="0.05" stroke-opacity="0.35"/><line x1="${r[0]}" y1="${Y(r[3])}" x2="${r[2]}" y2="${Y(r[1])}" stroke="currentColor" stroke-width="0.05" stroke-opacity="0.35"/>`);
  }
  // лекторий: веер рядов (на −1 и под площадкой на 1 этаже)
  if (L.id === 'B1' || L.id === 'L1' || L.id === 'M') parts.push(amphSVG(L.id === 'B1' ? 0.9 : 0.35));
  if (L.id === 'M' || L.id === 'L2') {
    const r = B.PLATFORM.rect;
    parts.push(`<rect x="${r[0]}" y="${Y(r[3])}" width="${r[2] - r[0]}" height="${r[3] - r[1]}" fill="${L.id === 'M' ? '#e2d9f3' : 'none'}" fill-opacity="0.8" stroke="#8f78c2" stroke-width="0.14" ${L.id === 'L2' ? 'stroke-dasharray="1 0.5"' : ''}/>`);
    const [su, sv] = B.PLATFORM.statue;
    parts.push(`<circle cx="${su}" cy="${Y(sv)}" r="0.45" fill="currentColor"/><text x="${su + 0.9}" y="${Y(sv) + 0.35}" font-size="0.85">статуя</text>`);
    for (const [u, v] of B.PLATFORM.columns) parts.push(`<rect x="${u - 0.31}" y="${Y(v) - 0.31}" width="0.62" height="0.62" fill="#222"/>`);
  }
  if (L.id === 'L3') {
    for (const w of B.LOUNGE3.wells) parts.push(`<rect x="${w[0]}" y="${Y(w[3])}" width="${w[2] - w[0]}" height="${w[3] - w[1]}" fill="none" stroke="#3a8a4a" stroke-width="0.25"/>`);
    const sk = B.SKYLIGHT;
    parts.push(`<rect x="${sk.u0}" y="${Y(sk.v1)}" width="${sk.u1 - sk.u0}" height="${sk.v1 - sk.v0}" fill="none" stroke="currentColor" stroke-width="0.08" stroke-dasharray="1.4 0.6" opacity="0.6"/>`);
  }

  // ряды столов кластеров
  for (const d of B.DESKS.filter((q) => q.level === L.id)) {
    const col = B.CLUSTER_COLORS[d.cluster] || '#888';
    const a0 = Math.min(d.from, d.to), a1 = Math.max(d.from, d.to);
    if (d.axis === 'v') parts.push(`<rect x="${d.at - 0.7}" y="${Y(a1)}" width="1.4" height="${a1 - a0}" fill="#fff" fill-opacity="0.92" stroke="${col}" stroke-width="0.12" pointer-events="none"/>`);
    else parts.push(`<rect x="${a0}" y="${Y(d.at + 0.7)}" width="${a1 - a0}" height="1.4" fill="#fff" fill-opacity="0.92" stroke="${col}" stroke-width="0.12" pointer-events="none"/>`);
  }

  // марши
  for (const s of B.STAIRS) {
    const show = s.level === L.id || (L.id === 'L1' && (s.level === 'M' || (s.level === 'B1' && s.z1 === 0))) || (L.id === 'M' && s.level === 'M') || (L.id === 'L2' && s.level === 'M' && s.z1 > 3);
    if (!show) continue;
    parts.push(flightSVG(s, s.level === L.id || (L.id === 'L1' && s.z0 === 0) || (L.id === 'M' && s.z0 >= 2) ? 0.9 : 0.4));
  }
  for (const l of B.LANDINGS.filter((q) => q.level === L.id)) parts.push(`<rect x="${l.rect[0]}" y="${Y(l.rect[3])}" width="${l.rect[2] - l.rect[0]}" height="${l.rect[3] - l.rect[1]}" fill="none" stroke="currentColor" stroke-width="0.06"/>`);

  // ядра
  for (const c of B.CORES.filter((q) => q.levels.includes(L.id))) {
    const [u0, v0, u1, v1] = c.rect;
    parts.push(`<g data-core="${c.id}" class="z"><rect x="${u0 + 0.06}" y="${Y(v1) + 0.06}" width="${u1 - u0 - 0.12}" height="${v1 - v0 - 0.12}" fill="currentColor" fill-opacity="0.07"/></g>`);
    if (c.type === 'stair') parts.push(coreStairSVG(c));
    if (c.type === 'lift') for (const [a, e] of c.cars || []) parts.push(`<rect x="${a}" y="${Y(v1 - 0.2)}" width="${e - a}" height="${v1 - v0 - 0.4}" fill="none" stroke="currentColor" stroke-width="0.07"/><line x1="${a}" y1="${Y(v1 - 0.2)}" x2="${e}" y2="${Y(v0 + 0.2)}" stroke="currentColor" stroke-width="0.06"/><line x1="${a}" y1="${Y(v0 + 0.2)}" x2="${e}" y2="${Y(v1 - 0.2)}" stroke="currentColor" stroke-width="0.06"/>`);
  }

  // колонны
  const inR = (u, v, r, m = 0) => u > r[0] - m && u < r[2] + m && v > r[1] - m && v < r[3] + m;
  const atr = [B.ATRIUM.u0, B.ATRIUM.v0, B.ATRIUM.u1, B.ATRIUM.v1];
  const cores = B.CORES.filter((c) => c.levels.includes(L.id)).map((c) => c.rect);
  if (!L.partial) for (const u of g.u) for (const v of g.v) {
    if (inR(u, v, atr, -0.01) || cores.some((r) => inR(u, v, r, -0.01))) continue;
    const cs = B.GRID.column;
    parts.push(`<rect x="${u - cs / 2}" y="${Y(v) - cs / 2}" width="${cs}" height="${cs}" fill="currentColor"/>`);
  }

  // стены с проёмами
  const doors = B.DOORS.filter((d) => d.level === L.id);
  const walls = [...B.WALLS.filter((w) => w.level === L.id)];
  for (const c of B.CORES.filter((q) => q.levels.includes(L.id))) {
    const [u0, v0, u1, v1] = c.rect;
    for (const [a, e] of [[[u0, v0], [u1, v0]], [[u1, v0], [u1, v1]], [[u1, v1], [u0, v1]], [[u0, v1], [u0, v0]]]) walls.push({ a, b: e, k: c.type === 'lift' ? 'lift' : 'c' });
  }
  for (const w of walls) {
    const st = WALL_STYLE[w.k];
    if (!st) continue;
    const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    if (len < 0.05) continue;
    const d = [(w.b[0] - w.a[0]) / len, (w.b[1] - w.a[1]) / len];
    const ops = doors.filter((o) => segDist(o.at, w.a, w.b) < 0.16).map((o) => {
      const s = (o.at[0] - w.a[0]) * d[0] + (o.at[1] - w.a[1]) * d[1];
      return [Math.max(0, s - o.w / 2), Math.min(len, s + o.w / 2), o];
    }).sort((p, q) => p[0] - q[0]);
    let cur = 0;
    const seg = (s0, s1) => { if (s1 - s0 > 0.02) parts.push(`<line x1="${w.a[0] + d[0] * s0}" y1="${Y(w.a[1] + d[1] * s0)}" x2="${w.a[0] + d[0] * s1}" y2="${Y(w.a[1] + d[1] * s1)}" stroke="${st[0]}" stroke-width="${st[1]}" stroke-opacity="${st[2]}"/>`); };
    for (const [s0, s1, o] of ops) {
      seg(cur, s0); cur = Math.max(cur, s1);
      if (o.kind !== 'open') {
        // дуга распашной двери
        const p0 = [w.a[0] + d[0] * s0, w.a[1] + d[1] * s0], r = s1 - s0, n = [-d[1], d[0]];
        const tip = [p0[0] + n[0] * r * 0.9, p0[1] + n[1] * r * 0.9];
        parts.push(`<path d="M ${p0[0]} ${Y(p0[1])} L ${tip[0]} ${Y(tip[1])} A ${r} ${r} 0 0 ${d[0] * n[1] - d[1] * n[0] > 0 ? 0 : 1} ${p0[0] + d[0] * r} ${Y(p0[1] + d[1] * r)}" fill="none" stroke="${o.kind === 'glass' ? '#3aa0d8' : 'currentColor'}" stroke-width="0.06" stroke-opacity="0.7"/>`);
      }
    }
    seg(cur, len);
  }

  // наружные стены / витражи, портик
  parts.push(`<rect x="0" y="${Y(S)}" width="${S}" height="${S}" fill="none" stroke="currentColor" stroke-width="0.45"/>`);
  parts.push(`<rect x="0.35" y="${Y(S) + 0.35}" width="${S - 0.7}" height="${S - 0.7}" fill="none" stroke="#5aa5d6" stroke-width="0.12"/>`);
  if (L.id === 'L1') {
    const gl = B.ENTRANCE.glazing, pr = B.ENTRANCE.porch;
    if (pr) {
      parts.push(`<rect x="${pr.u0}" y="${Y(pr.v1)}" width="${pr.u1 - pr.u0}" height="${pr.v1 - pr.v0}" fill="var(--bg, #fff)" stroke="none"/>`);
      parts.push(`<line x1="${gl.u0}" y1="${Y(gl.v)}" x2="${gl.u1}" y2="${Y(gl.v)}" stroke="#5aa5d6" stroke-width="0.2"/>`);
      for (const d of B.ENTRANCE.doors) parts.push(`<line x1="${d.u0}" y1="${Y(gl.v)}" x2="${d.u1}" y2="${Y(gl.v)}" stroke="#0f9e86" stroke-width="0.45"/>`);
      for (const [u, v] of pr.columns || []) parts.push(`<rect x="${u - 0.35}" y="${Y(v) - 0.35}" width="0.7" height="0.7" fill="currentColor"/>`);
      parts.push(`<text x="${(pr.u0 + pr.u1) / 2}" y="${Y(pr.v1 / 2) + 0.3}" font-size="0.95" text-anchor="middle">портик</text>`);
    }
    const c = B.CANOPY;
    parts.push(`<rect x="${c.u0}" y="${Y(0)}" width="${c.u1 - c.u0}" height="${c.depth}" fill="none" stroke="currentColor" stroke-width="0.1" stroke-dasharray="0.8 0.4"/>`);
    parts.push(`<text x="${(c.u0 + c.u1) / 2}" y="${Y(-c.depth) - 0.6}" font-size="0.95" text-anchor="middle">козырёк · главный вход</text>`);
    const st = B.ENTRANCE.stairs;
    parts.push(stepsSVG(st.u0, st.vTop - st.risers * st.tread, st.u1, st.vTop, st.risers, 'v', 0.7));
  }

  // ориентиры
  for (const m of (B.LANDMARKS || []).filter((q) => q.level === L.id)) {
    parts.push(`<g pointer-events="none"><circle cx="${m.u}" cy="${Y(m.v)}" r="0.35" fill="#e24d7a"/><text x="${m.u + 0.7}" y="${Y(m.v) - 0.5}" font-size="0.8" fill="#e24d7a">${esc(m.name)}</text></g>`);
  }

  // подписи зон
  for (const z of sorted) {
    const [u0, v0, u1, v1] = z.rect;
    const w = u1 - u0, h = v1 - v0;
    if (w * h < 7 || z.type === 'stairhall' || z.type === 'turnstiles') continue;
    const size = Math.max(0.7, Math.min(1.5, Math.min(w, h) / 5));
    let cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    if (z.type === 'gallery' || z.id === 'l1-lobby') { cu = u0 + Math.min(4, w / 4); cv = v1 - 1.6; }
    if (z.type === 'atrium') { cu = 27.8; cv = 34.4; }
    if (z.type === 'amphitheater') { cu = 20.5; cv = 26.2; }
    const rot = h > w * 1.6 && w < 9 ? ` transform="rotate(-90 ${cu} ${Y(cv)})"` : '';
    const extra = z.type === 'cluster' ? ` · ${seatsOf(z.cluster, z.level)} мест` : '';
    parts.push(`<g${rot} pointer-events="none"><text x="${cu}" y="${Y(cv) - size * 0.1}" font-size="${size}" text-anchor="middle" font-weight="600">${esc(z.name)}</text>
      <text x="${cu}" y="${Y(cv) + size * 1.05}" font-size="${size * 0.72}" text-anchor="middle" class="ax" opacity="0.75">${f1(w * h)} м²${extra}</text></g>`);
  }

  // размерная линия и стрелка на север
  parts.push(dimH(0, S, Y(-8.6)));
  parts.push(dimV(Y(0), Y(S), S + 6.2));
  parts.push(northArrow(S + 4.6, Y(S) + 2.5));
  parts.push(scaleBar(-1.5, Y(-11.4)));
  parts.push(`<text x="${S / 2}" y="${Y(-11.4) + 0.3}" font-size="1.0" text-anchor="middle" opacity="0.8">главный фасад · ЮВ · вход с ул. Зиёлилар</text>`);

  sheet.innerHTML = `<div class="bar"><h3>План · ${esc(L.name)} · отм. <span class="mono">${el}</span></h3></div>
    <svg viewBox="${vb.join(' ')}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="План: ${esc(L.name)}">
      <style>text{font-family:Onest,system-ui,sans-serif;fill:currentColor}.ax{font-family:"JetBrains Mono",monospace}.z{cursor:pointer}.z:hover rect:first-child{stroke:#0f9e86;stroke-width:0.3;stroke-opacity:1}</style>
      ${parts.join('\n')}
    </svg>
    <div class="foot">${esc(L.note || '')} Планировка — по поэтажным планам 360°-тура; штриховка — достроено. Клик по помещению — подробности. Сетка колонн 6 × 6 м, размеры в метрах.</div>`;
  sheet.querySelectorAll('[data-z]').forEach((g2) => g2.addEventListener('click', () => onSelect(g2.dataset.z)));
}

const area = (z) => (z.rect[2] - z.rect[0]) * (z.rect[3] - z.rect[1]);

function amphSVG(op) {
  const A = B.AMPHI, [cu, cv] = A.c;
  const out = [];
  const arc = (r, a0, a1, w) => {
    const p = (a) => [cu + Math.cos((a * Math.PI) / 180) * r, cv + Math.sin((a * Math.PI) / 180) * r];
    const pts = [];
    for (let a = a0; a <= a1; a += 3) { const [u, v] = p(a); if (u >= A.clip.u - 0.01 && v >= A.clip.v - 0.01) pts.push(`${u.toFixed(2)},${Y(v).toFixed(2)}`); }
    if (pts.length > 1) out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-opacity="${op}"/>`);
  };
  for (const r of A.rows) arc(r, A.rowAngles[0], A.rowAngles[1], 0.07);
  arc(A.walk[1], A.walkAngles[0], A.walkAngles[1], 0.2);
  const [[x0, y0], [x1, y1]] = A.screen;
  out.push(`<line x1="${x0}" y1="${Y(y0)}" x2="${x1}" y2="${Y(y1)}" stroke="#c98c7a" stroke-width="0.3" stroke-opacity="${op}"/>`);
  for (const a of A.aisles) {
    if (a.axis === 'u') out.push(stepsSVG(a.from, cv + A.rows[0], a.to, cv + A.walk[0] + 0.5, 10, 'v', op * 0.8));
    else out.push(stepsSVG(cu + A.rows[0], a.from, cu + A.walk[0] + 0.5, a.to, 10, 'u', op * 0.8));
  }
  out.push(`<text x="${cu - 0.6}" y="${Y(cv - 1.2)}" font-size="0.75" text-anchor="middle" opacity="${op}">сцена ${String(A.stageZ).replace('.', ',').replace('-', '−')}</text>`);
  return `<g pointer-events="none">${out.join('')}</g>`;
}

function flightSVG(s, op) {
  const d = DIRV[s.dir], p = [-d[1], d[0]], hw = s.w / 2;
  const at = (a, c) => [s.a[0] + d[0] * a + p[0] * c, s.a[1] + d[1] * a + p[1] * c];
  const out = [];
  const q = [at(0, -hw), at(0, hw), at(s.len, hw), at(s.len, -hw)];
  const col = s.style === 'mint' ? '#5fb89a' : s.style === 'lilac' ? '#a887c9' : 'currentColor';
  out.push(`<polygon points="${q.map(([u, v]) => `${u},${Y(v)}`).join(' ')}" fill="${col}" fill-opacity="0.18" stroke="${col}" stroke-width="0.1" stroke-opacity="${op}"/>`);
  for (let i = 1; i < s.n; i++) { const A = at((s.len * i) / s.n, -hw), C = at((s.len * i) / s.n, hw); out.push(`<line x1="${A[0]}" y1="${Y(A[1])}" x2="${C[0]}" y2="${Y(C[1])}" stroke="currentColor" stroke-width="0.04" stroke-opacity="${op * 0.8}"/>`); }
  const A = at(0.3, 0), C = at(s.len - 0.3, 0);
  out.push(`<line x1="${A[0]}" y1="${Y(A[1])}" x2="${C[0]}" y2="${Y(C[1])}" stroke="currentColor" stroke-width="0.07" stroke-opacity="${op}" marker-end="url(#arr)"/>`);
  return `<g pointer-events="none">${out.join('')}</g>`;
}

function coreStairSVG(c) {
  const [u0, v0, u1, v1] = c.rect;
  const alongV = c.entry === 'v0' || c.entry === 'v1';
  const out = [];
  const land = 1.4, mid = 1.15;
  if (alongV) {
    const a = c.entry === 'v1' ? v1 - land : v0 + land, b = c.entry === 'v1' ? v0 + mid : v1 - mid;
    out.push(stepsSVG(u0 + 0.15, Math.min(a, b), (u0 + u1) / 2 - 0.08, Math.max(a, b), 14, 'v', 0.8));
    out.push(stepsSVG((u0 + u1) / 2 + 0.08, Math.min(a, b), u1 - 0.15, Math.max(a, b), 14, 'v', 0.8));
  } else {
    const a = c.entry === 'u1' ? u1 - land : u0 + land, b = c.entry === 'u1' ? u0 + mid : u1 - mid;
    out.push(stepsSVG(Math.min(a, b), v0 + 0.15, Math.max(a, b), (v0 + v1) / 2 - 0.08, 14, 'u', 0.8));
    out.push(stepsSVG(Math.min(a, b), (v0 + v1) / 2 + 0.08, Math.max(a, b), v1 - 0.15, 14, 'u', 0.8));
  }
  return `<g pointer-events="none">${out.join('')}</g>`;
}

function stepsSVG(u0, v0, u1, v1, n, dir, op = 0.8) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    if (dir === 'v') { const v = v0 + ((v1 - v0) * i) / n; out.push(`<line x1="${u0}" y1="${Y(v)}" x2="${u1}" y2="${Y(v)}" stroke="currentColor" stroke-width="0.05" stroke-opacity="${op}"/>`); }
    else { const u = u0 + ((u1 - u0) * i) / n; out.push(`<line x1="${u}" y1="${Y(v0)}" x2="${u}" y2="${Y(v1)}" stroke="currentColor" stroke-width="0.05" stroke-opacity="${op}"/>`); }
  }
  return `<g pointer-events="none">${out.join('')}</g>`;
}

function dimH(a, b, y) {
  return `<g stroke="currentColor" stroke-width="0.07"><line x1="${a}" y1="${y}" x2="${b}" y2="${y}"/><line x1="${a}" y1="${y - 0.7}" x2="${a}" y2="${y + 0.7}"/><line x1="${b}" y1="${y - 0.7}" x2="${b}" y2="${y + 0.7}"/>
    <line x1="${a - 0.4}" y1="${y + 0.4}" x2="${a + 0.4}" y2="${y - 0.4}" stroke-width="0.14"/><line x1="${b - 0.4}" y1="${y + 0.4}" x2="${b + 0.4}" y2="${y - 0.4}" stroke-width="0.14"/></g>
    <text x="${(a + b) / 2}" y="${y - 0.5}" font-size="1.1" text-anchor="middle" class="ax">${Math.round((b - a) * 1000).toLocaleString('ru-RU')}</text>`;
}
function dimV(y0, y1, x) {
  return `<g stroke="currentColor" stroke-width="0.07"><line x1="${x}" y1="${y0}" x2="${x}" y2="${y1}"/><line x1="${x - 0.7}" y1="${y0}" x2="${x + 0.7}" y2="${y0}"/><line x1="${x - 0.7}" y1="${y1}" x2="${x + 0.7}" y2="${y1}"/></g>
    <text x="${x - 0.5}" y="${(y0 + y1) / 2}" font-size="1.1" text-anchor="middle" class="ax" transform="rotate(-90 ${x - 0.5} ${(y0 + y1) / 2})">${Math.round(Math.abs(y1 - y0) * 1000).toLocaleString('ru-RU')}</text>`;
}
function northArrow(x, y) {
  const bu = (B.BEARING_U * Math.PI) / 180;
  const nx = Math.cos(bu), ny = -Math.sin(bu);
  const ang = (Math.atan2(nx, -ny) * 180) / Math.PI;
  return `<g transform="translate(${x} ${y}) rotate(${ang})"><circle r="2.1" fill="none" stroke="currentColor" stroke-width="0.08"/><path d="M0 -1.9 L0.7 1.1 L0 0.5 L-0.7 1.1 Z" fill="currentColor"/><text y="-2.5" font-size="1.1" text-anchor="middle" font-weight="700">С</text></g>`;
}
function scaleBar(x, y) {
  const seg = [];
  for (let i = 0; i < 5; i++) seg.push(`<rect x="${x + i * 2}" y="${y - 0.35}" width="2" height="0.7" fill="${i % 2 ? 'none' : 'currentColor'}" stroke="currentColor" stroke-width="0.06"/>`);
  return `<g>${seg.join('')}<text x="${x}" y="${y - 0.7}" font-size="0.85" class="ax">0</text><text x="${x + 10}" y="${y - 0.7}" font-size="0.85" text-anchor="middle" class="ax">10 м</text></g>`;
}
