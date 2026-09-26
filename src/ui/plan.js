// Поэтажные планы (SVG) — «карта здания». Рисуются из тех же данных, что и 3D.
import * as B from '../data/building.js';

const S = B.SIZE;
const TYPE_FILL = {
  lobby: '#dfe7e4', corridor: '#e6ebe9', gallery: '#e3e2ef', turnstiles: '#dfe7e4', photozone: '#c9d9f5',
  lounge: '#ead9bf', amphitheater: '#efcfc4', platform: '#e2d9f3', grandstair: '#d9ccef', kitchen: '#f8dcc4',
  meeting: '#d6e4f7', conference: '#d9dff0', game: '#dcefd4', pingpong: '#dcefcf', server: '#c9dbff', library: '#efe2cc',
  office: '#e4e6e5', tech: '#e1e3e2', storage: '#e1e3e2', wardrobe: '#e4e6e5', void: 'none',
};
const CONF_COL = { photo: '#0f9e86', video: '#2f6fd0', inferred: '#d98a17' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f1 = (n) => (Math.round(n * 10) / 10).toLocaleString('ru-RU');
const Y = (v) => -v;   // v вверх на листе: главный фасад внизу

export function renderPlan(sheet, { level, zones, conf, selected, onSelect }) {
  const L = B.LEVELS.find((l) => l.id === level) || B.LEVELS.find((l) => l.id === 'L2');
  const zs = zones.filter((z) => z.level === L.id);
  const el = L.z === 0 ? '±0,000' : `${L.z > 0 ? '+' : '−'}${Math.abs(L.z).toFixed(3).replace('.', ',')}`;
  const parts = [];
  const pad = 9;
  const vb = [-pad - 2, Y(S) - pad, S + pad * 2 + 2, S + pad * 2 + 6];
  parts.push(`<defs>
    <pattern id="hatch" width="1.2" height="1.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="1.2" stroke="#d98a17" stroke-width="0.22" stroke-opacity="0.75"/></pattern>
    <pattern id="core" width="0.8" height="0.8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="0.8" stroke="currentColor" stroke-width="0.12" stroke-opacity="0.45"/></pattern>
  </defs>`);

  // сетка осей
  const g = B.GRID;
  g.u.forEach((u, i) => {
    parts.push(`<line x1="${u}" y1="${Y(-3)}" x2="${u}" y2="${Y(S + 3)}" stroke="currentColor" stroke-opacity="0.18" stroke-width="0.06" stroke-dasharray="1.2 0.5 0.2 0.5"/>`);
    parts.push(`<circle cx="${u}" cy="${Y(-5.2)}" r="1.25" fill="none" stroke="currentColor" stroke-width="0.1"/><text x="${u}" y="${Y(-5.2) + 0.45}" font-size="1.25" text-anchor="middle" class="ax">${g.labelsU[i]}</text>`);
  });
  g.v.forEach((v, i) => {
    parts.push(`<line x1="-3" y1="${Y(v)}" x2="${S + 3}" y2="${Y(v)}" stroke="currentColor" stroke-opacity="0.18" stroke-width="0.06" stroke-dasharray="1.2 0.5 0.2 0.5"/>`);
    parts.push(`<circle cx="-5.2" cy="${Y(v)}" r="1.25" fill="none" stroke="currentColor" stroke-width="0.1"/><text x="-5.2" y="${Y(v) + 0.45}" font-size="1.25" text-anchor="middle" class="ax">${g.labelsV[i]}</text>`);
  });

  // пятно здания
  parts.push(`<rect x="0" y="${Y(S)}" width="${S}" height="${S}" fill="currentColor" fill-opacity="0.035"/>`);

  // зоны
  const sorted = [...zs].sort((a, b) => area(b) - area(a));
  for (const z of sorted) {
    const [u0, v0, u1, v1] = z.rect;
    const fill = z.type === 'cluster' ? (B.CLUSTER_COLORS[z.cluster] || '#999') : (TYPE_FILL[z.type] || '#e4e6e5');
    const op = z.type === 'cluster' ? 0.28 : 0.85;
    const sel = selected?.kind === 'zone' && selected.id === z.id;
    if (z.type === 'void') {
      parts.push(`<g data-z="${z.id}" class="z"><rect x="${u0}" y="${Y(v1)}" width="${u1 - u0}" height="${v1 - v0}" fill="transparent" stroke="currentColor" stroke-width="0.12" stroke-dasharray="0.8 0.4"/>
        <line x1="${u0}" y1="${Y(v0)}" x2="${u1}" y2="${Y(v1)}" stroke="currentColor" stroke-width="0.08" stroke-opacity="0.5"/><line x1="${u0}" y1="${Y(v1)}" x2="${u1}" y2="${Y(v0)}" stroke="currentColor" stroke-width="0.08" stroke-opacity="0.5"/></g>`);
      continue;
    }
    parts.push(`<g data-z="${z.id}" class="z">
      <rect x="${u0 + 0.06}" y="${Y(v1) + 0.06}" width="${u1 - u0 - 0.12}" height="${v1 - v0 - 0.12}" fill="${fill}" fill-opacity="${op}" stroke="${sel ? '#0f9e86' : 'currentColor'}" stroke-width="${sel ? 0.4 : 0.1}" stroke-opacity="${sel ? 1 : 0.55}"/>
      ${z.confidence === 'inferred' ? `<rect x="${u0 + 0.06}" y="${Y(v1) + 0.06}" width="${u1 - u0 - 0.12}" height="${v1 - v0 - 0.12}" fill="url(#hatch)" opacity="${conf ? 0.9 : 0.45}" pointer-events="none"/>` : ''}
      ${conf ? `<rect x="${u0 + 0.35}" y="${Y(v1) + 0.35}" width="${u1 - u0 - 0.7}" height="${v1 - v0 - 0.7}" fill="none" stroke="${CONF_COL[z.confidence]}" stroke-width="0.3"/>` : ''}
    </g>`);
    // детали внутри
    if (z.type === 'cluster') parts.push(desksSVG(z));
    if (z.type === 'amphitheater') parts.push(amphSVG(z));
    if (z.type === 'grandstair') parts.push(stepsSVG(u0, v0, u1, v1, 15, 'v'));
  }
  if (L.id === 'M') for (const s of B.ATRIUM_STAIRS) parts.push(stepsSVG(s.u0, s.vBottom, s.u1, s.vTop, 15, 'v'));
  if (L.id === 'L2') for (const s of B.ATRIUM_STAIRS) parts.push(stepsSVG(s.u0, s.vBottom, s.u1, s.vTop, 15, 'v', 0.5));
  if (L.id === 'L3') {
    const sk = B.SKYLIGHT;
    parts.push(`<rect x="${sk.u0}" y="${Y(sk.v1)}" width="${sk.u1 - sk.u0}" height="${sk.v1 - sk.v0}" fill="none" stroke="currentColor" stroke-width="0.1" stroke-dasharray="1.4 0.6"/>`);
    const cu = (sk.u0 + sk.u1) / 2, cv = (sk.v0 + sk.v1) / 2;
    parts.push(`<line x1="${sk.u0}" y1="${Y(sk.v0)}" x2="${sk.u1}" y2="${Y(sk.v1)}" stroke="currentColor" stroke-width="0.06" stroke-dasharray="1 0.6" stroke-opacity="0.6"/><line x1="${sk.u0}" y1="${Y(sk.v1)}" x2="${sk.u1}" y2="${Y(sk.v0)}" stroke="currentColor" stroke-width="0.06" stroke-dasharray="1 0.6" stroke-opacity="0.6"/>`);
    parts.push(`<text x="${cu}" y="${Y(sk.v1) + 1.4}" font-size="0.9" text-anchor="middle" opacity="0.7">стеклянная пирамида над лаунжем</text>`);
    void cv;
  }
  if (L.id === 'L1') {
    const a = B.ATRIUM;
    parts.push(`<rect x="${a.u0}" y="${Y(a.v1)}" width="${a.u1 - a.u0}" height="${a.v1 - a.v0}" fill="none" stroke="#8f78c2" stroke-width="0.15" stroke-dasharray="1.2 0.6"/>`);
    parts.push(`<text x="${(a.u0 + a.u1) / 2}" y="${Y(a.v1) + 1.6}" font-size="0.95" text-anchor="middle" fill="#8f78c2">над ним — парящая площадка +2,250</text>`);
  }

  // ядра
  for (const c of B.CORES.filter((q) => q.levels.includes(L.id))) {
    const [u0, v0, u1, v1] = c.rect;
    parts.push(`<g data-core="${c.id}" class="z"><rect x="${u0 + 0.06}" y="${Y(v1) + 0.06}" width="${u1 - u0 - 0.12}" height="${v1 - v0 - 0.12}" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="0.14"/>
      <rect x="${u0 + 0.06}" y="${Y(v1) + 0.06}" width="${u1 - u0 - 0.12}" height="${v1 - v0 - 0.12}" fill="url(#core)"/></g>`);
    if (c.type === 'stair') parts.push(stepsSVG(u0 + 0.2, v0 + 1.3, u1 - 0.2, v1 - 1.3, 12, (v1 - v0) >= (u1 - u0) ? 'v' : 'u', 0.9, true));
    if (c.type === 'lift') {
      const w = (u1 - u0) / 2;
      for (let k = 0; k < 2; k++) parts.push(`<line x1="${u0 + k * w + 0.3}" y1="${Y(v0) - 0.3}" x2="${u0 + (k + 1) * w - 0.3}" y2="${Y(v1) + 0.3}" stroke="currentColor" stroke-width="0.08"/><line x1="${u0 + k * w + 0.3}" y1="${Y(v1) + 0.3}" x2="${u0 + (k + 1) * w - 0.3}" y2="${Y(v0) - 0.3}" stroke="currentColor" stroke-width="0.08"/>`);
    }
  }

  // колонны
  const inR = (u, v, r, m = 0) => u > r[0] - m && u < r[2] + m && v > r[1] - m && v < r[3] + m;
  const atr = [B.ATRIUM.u0, B.ATRIUM.v0, B.ATRIUM.u1, B.ATRIUM.v1];
  const cores = B.CORES.filter((c) => c.levels.includes(L.id)).map((c) => c.rect);
  const amph = zs.find((z) => z.type === 'amphitheater');
  for (const u of g.u) for (const v of g.v) {
    if (cores.some((r) => inR(u, v, r, -0.01))) continue;
    if (L.id === 'M' && !inR(u, v, atr, 0.01)) continue;
    if ((L.id === 'L1' || L.id === 'L3') && inR(u, v, atr, -0.01)) continue;
    if (amph && inR(u, v, amph.rect, -0.01)) continue;
    const cs = B.GRID.column;
    parts.push(`<rect x="${u - cs / 2}" y="${Y(v) - cs / 2}" width="${cs}" height="${cs}" fill="currentColor"/>`);
  }

  // наружные стены / витражи
  parts.push(`<rect x="0" y="${Y(S)}" width="${S}" height="${S}" fill="none" stroke="currentColor" stroke-width="0.45"/>`);
  parts.push(`<rect x="0.35" y="${Y(S) + 0.35}" width="${S - 0.7}" height="${S - 0.7}" fill="none" stroke="#5aa5d6" stroke-width="0.12"/>`);
  if (L.id === 'L1' || L.id === 'M') {
    const c = B.CANOPY;
    parts.push(`<rect x="${c.u0}" y="${Y(0)}" width="${c.u1 - c.u0}" height="${c.depth}" fill="none" stroke="currentColor" stroke-width="0.1" stroke-dasharray="0.8 0.4"/>`);
    parts.push(`<text x="${(c.u0 + c.u1) / 2}" y="${Y(-c.depth) - 0.6}" font-size="0.95" text-anchor="middle">козырёк · главный вход</text>`);
    const st = B.ENTRANCE.stairs;
    parts.push(stepsSVG(st.u0, st.vTop - st.risers * st.tread, st.u1, st.vTop, st.risers, 'v', 0.7));
    const rp = B.ENTRANCE.ramp;
    parts.push(`<rect x="${rp.u0}" y="${Y(rp.v1)}" width="${rp.u1 - rp.u0}" height="${rp.v1 - rp.v0}" fill="none" stroke="currentColor" stroke-width="0.08"/><text x="${(rp.u0 + rp.u1) / 2}" y="${Y(rp.v0) + 1.2}" font-size="0.85" text-anchor="middle" opacity="0.8">пандус 1:16 →</text>`);
  }

  // подписи зон
  for (const z of sorted) {
    if (z.type === 'void') {
      parts.push(`<text x="${(z.rect[0] + z.rect[2]) / 2}" y="${Y((z.rect[1] + z.rect[3]) / 2) - 0.8}" font-size="1.0" text-anchor="middle" opacity="0.75">второй свет над площадкой</text>`);
      continue;
    }
    const [u0, v0, u1, v1] = z.rect;
    const w = u1 - u0, h = v1 - v0;
    if (w * h < 7) continue;
    const size = Math.max(0.7, Math.min(1.5, Math.min(w, h) / 5));
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    const rot = h > w * 1.6 && w < 9 ? ` transform="rotate(-90 ${cu} ${Y(cv)})"` : '';
    const extra = z.type === 'cluster' ? ` · ${(z.props?.rows ?? 7) * 10} мест` : '';
    parts.push(`<g${rot} pointer-events="none"><text x="${cu}" y="${Y(cv) - size * 0.1}" font-size="${size}" text-anchor="middle" font-weight="600">${esc(z.name)}</text>
      <text x="${cu}" y="${Y(cv) + size * 1.05}" font-size="${size * 0.72}" text-anchor="middle" class="ax" opacity="0.75">${f1(w * h)} м²${extra}</text></g>`);
  }
  for (const c of B.CORES.filter((q) => q.levels.includes(L.id))) {
    const [u0, v0, u1, v1] = c.rect;
    if ((u1 - u0) * (v1 - v0) < 10) continue;
    parts.push(`<text x="${(u0 + u1) / 2}" y="${Y((v0 + v1) / 2) + 0.3}" font-size="0.8" text-anchor="middle" opacity="0.8" pointer-events="none">${esc(c.type === 'stair' ? 'ЛК' : c.type === 'lift' ? 'лифты' : c.type === 'wc' ? 'С/У' : '')}</text>`);
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
    <div class="foot">${esc(L.note || '')} Штриховка — достроено без фото. Клик по помещению — подробности и правка. Сетка колонн 6 × 6 м, размеры в метрах.</div>`;
  sheet.querySelectorAll('[data-z]').forEach((g2) => g2.addEventListener('click', () => onSelect(g2.dataset.z)));
}

const area = (z) => (z.rect[2] - z.rect[0]) * (z.rect[3] - z.rect[1]);

function desksSVG(z) {
  const [u0, v0, u1, v1] = z.rect;
  const rows = z.props?.rows ?? 7;
  const facing = z.props?.facing ?? '-v';
  const alongV = facing.endsWith('v');
  const span = alongV ? u1 - u0 : v1 - v0, depth = alongV ? v1 - v0 : u1 - u0;
  const pitch = Math.min(2.9, (span - 2) / rows);
  const start = (alongV ? u0 : v0) + (span - pitch * (rows - 1)) / 2;
  const len = Math.min(6.0, depth - 3.0);
  const win0 = facing.startsWith('-');
  const b0 = alongV ? v0 : u0, b1 = alongV ? v1 : u1;
  const c = win0 ? b0 + 1.6 + len / 2 : b1 - 1.6 - len / 2;
  const col = B.CLUSTER_COLORS[z.cluster] || '#888';
  const out = [];
  for (let r = 0; r < rows; r++) {
    const a = start + r * pitch;
    if (alongV) out.push(`<rect x="${a - 0.75}" y="${Y(c + len / 2)}" width="1.5" height="${len}" fill="#ffffff" fill-opacity="0.9" stroke="${col}" stroke-width="0.12"/>`);
    else out.push(`<rect x="${c - len / 2}" y="${Y(a + 0.75)}" width="${len}" height="1.5" fill="#ffffff" fill-opacity="0.9" stroke="${col}" stroke-width="0.12"/>`);
  }
  return `<g pointer-events="none">${out.join('')}</g>`;
}

function amphSVG(z) {
  const [u0, v0, u1, v1] = z.rect;
  const cu = u1 - 0.6, cv = v0 + 0.6;
  const out = [];
  for (let k = 0; k <= 5; k++) {
    const r = 4.4 + k * 0.9;
    const x0 = cu - r, y0 = Y(cv), x1 = cu, y1 = Y(cv + r);
    out.push(`<path d="M ${Math.max(u0, x0)} ${y0} A ${r} ${r} 0 0 1 ${x1} ${Math.max(Y(v1), y1)}" fill="none" stroke="currentColor" stroke-width="${k === 5 ? 0.16 : 0.07}"/>`);
  }
  out.push(`<text x="${cu - 2.2}" y="${Y(cv + 1.8)}" font-size="0.8" text-anchor="middle">сцена −2,700</text>`);
  return `<g pointer-events="none">${out.join('')}</g>`;
}

function stepsSVG(u0, v0, u1, v1, n, dir, op = 0.8, arrow = false) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    if (dir === 'v') { const v = v0 + ((v1 - v0) * i) / n; out.push(`<line x1="${u0}" y1="${Y(v)}" x2="${u1}" y2="${Y(v)}" stroke="currentColor" stroke-width="0.05" stroke-opacity="${op}"/>`); }
    else { const u = u0 + ((u1 - u0) * i) / n; out.push(`<line x1="${u}" y1="${Y(v0)}" x2="${u}" y2="${Y(v1)}" stroke="currentColor" stroke-width="0.05" stroke-opacity="${op}"/>`); }
  }
  if (arrow || dir === 'v') {
    const cu = (u0 + u1) / 2;
    out.push(`<path d="M ${cu} ${Y(v0) - 0.3} L ${cu} ${Y(v1) + 0.6}" stroke="currentColor" stroke-width="0.08" stroke-opacity="${op}" marker-end=""/>`);
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
  // север в осях здания: u·cos(39.1°) + v·sin(39.1°); на листе v вверх → угол поворота
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
