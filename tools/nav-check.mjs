// Анализ проходимости: заливка по сетке 0,25 м капсулой игрока от входов и лестниц.
// Ищет обрывы (шаг в пустоту выше 0,55 м без ограждения), отрезанные участки зон и заблокированные двери.
// Нужен запущенный сервер (по умолчанию :5321).
//
//   node tools/nav-check.mjs [out.json]      URL=… CHROME=… — как в shot.mjs
//
// Печатает сводку; с аргументом сохраняет все клетки и проблемы в JSON (для отрисовки карты).
// Код выхода 1, если найдены обрывы или заблокированные двери.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 0,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1280,800'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${process.env.URL || 'http://localhost:5321'}/?q=high&people=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__s21 && !document.getElementById('loader'), { timeout: 240000 });
const t0 = Date.now();
const r = await page.evaluate(async () => {
  const s = window.__s21, W = s.walk;
  await W.rebuild();
  const B = await import('/src/data/building.js');
  const STEP = 0.25, UP = 0.2, DOWN = 0.45, FALL = 0.55;
  const U0 = -3, U1 = 58.5, V0 = -16, V1 = 58.5;
  const NI = Math.round((U1 - U0) / STEP), NJ = Math.round((V1 - V0) / STEP);
  const uAt = (i) => U0 + i * STEP, vAt = (j) => V0 + j * STEP;
  const vis = new Map();            // "i,j" → [z...]
  const has = (i, j, z) => (vis.get(i + ',' + j) || []).some((q) => Math.abs(q - z) < 0.2);
  const addV = (i, j, z) => { const k = i + ',' + j; const a = vis.get(k); if (a) a.push(z); else vis.set(k, [z]); };
  const falls = [];
  const q = [];
  const seed = (u, v, z) => { const g = W.ground(u, v, z + 0.6, z - 0.6); if (g == null) return; const i = Math.round((u - U0) / STEP), j = Math.round((v - V0) / STEP); if (!has(i, j, g) && W.fits(uAt(i), vAt(j), g)) { addV(i, j, g); q.push([i, j, g]); } };
  seed(44, 25, 0); seed(47, -10, -1.5); seed(33.5, 28, 4.5); seed(33, 26, 9.0); seed(22.5, 25.5, 2.25); seed(28, 30, -4.5);
  const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let n = 0;
  while (q.length) {
    const [i, j, z] = q.pop();
    n++;
    for (const [di, dj] of D8) {
      const i2 = i + di, j2 = j + dj;
      if (i2 < 0 || j2 < 0 || i2 > NI || j2 > NJ) continue;
      const u2 = uAt(i2), v2 = vAt(j2);
      const g2 = W.ground(u2, v2, z + UP + 0.02, z - 25);
      if (g2 != null && g2 >= z - DOWN) {
        if (has(i2, j2, g2)) continue;
        if (W.fits(u2, v2, g2)) { addV(i2, j2, g2); q.push([i2, j2, g2]); }
      } else if (Math.abs(di) + Math.abs(dj) === 1) {
        const drop = g2 == null ? 99 : z - g2;
        if (drop > FALL && W.fits(u2, v2, z)) falls.push([+uAt(i).toFixed(2), +vAt(j).toFixed(2), +z.toFixed(2), +u2.toFixed(2), +v2.toFixed(2), +drop.toFixed(2)]);
      }
    }
  }
  // отрезанные места: свободный пол в зонах, куда заливка не дошла
  const unreach = {};
  const lvlZ = Object.fromEntries(B.LEVELS.map((l) => [l.id, l.z]));
  for (const zn of B.ZONES) {
    if (zn.closed || zn.type === 'void') continue;
    const z0 = zn.type === 'lounge3' ? lvlZ[zn.level] + B.LOUNGE3.podium : zn.type === 'platform' ? B.PLATFORM.z : lvlZ[zn.level];
    const [a, b, c, d] = zn.rect;
    let free = 0, bad = 0; const pts = [];
    for (let u = a + 0.3; u < c - 0.2; u += 0.5) for (let v = b + 0.3; v < d - 0.2; v += 0.5) {
      const g = W.ground(u, v, z0 + 1.0, z0 - 0.12);
      if (g == null || Math.abs(g - z0) > 0.1 || !W.fits(u, v, g) || W.inside(u, v, g + 0.5)) continue;
      if (B.CORES.some((c) => c.type === 'lift' && u > c.rect[0] - 0.1 && u < c.rect[2] + 0.1 && v > c.rect[1] - 0.1 && v < c.rect[3] + 0.1)) continue;
      free++;
      const i = Math.round((u - U0) / STEP), j = Math.round((v - V0) / STEP);
      let ok = false;
      for (let di = -1; di <= 1 && !ok; di++) for (let dj = -1; dj <= 1 && !ok; dj++) if (has(i + di, j + dj, g)) ok = true;
      if (!ok) { bad++; if (pts.length < 400) pts.push([+u.toFixed(1), +v.toFixed(1), +g.toFixed(2)]); }
    }
    if (bad) unreach[zn.id] = { level: zn.level, name: zn.name, free, bad, pts };
  }
  // двери: обе стороны проёма
  const doorsBad = [];
  for (const dr of B.DOORS) {
    const z0 = lvlZ[dr.level];
    if (dr.kind === 'open') continue;
    for (const [du, dv] of [[0.7, 0], [-0.7, 0], [0, 0.7], [0, -0.7]]) {
      const u = dr.at[0] + du, v = dr.at[1] + dv;
      const g = W.ground(u, v, z0 + 0.6, z0 - 0.6);
      if (g == null || !W.fits(u, v, g)) continue;
      const i = Math.round((u - U0) / STEP), j = Math.round((v - V0) / STEP);
      let ok = false;
      for (let di = -1; di <= 1 && !ok; di++) for (let dj = -1; dj <= 1 && !ok; dj++) if (has(i + di, j + dj, g)) ok = true;
      if (!ok) doorsBad.push({ level: dr.level, at: dr.at, side: [du, dv] });
    }
  }
  // проём двери: центр должен быть пройден заливкой
  const doorsBlocked = [];
  for (const dr of B.DOORS) {
    const z0 = lvlZ[dr.level];
    const g = W.ground(dr.at[0], dr.at[1], z0 + 0.5, z0 - 0.5);
    const i = Math.round((dr.at[0] - U0) / STEP), j = Math.round((dr.at[1] - V0) / STEP);
    let ok = false;
    if (g != null) for (let di = -1; di <= 1 && !ok; di++) for (let dj = -1; dj <= 1 && !ok; dj++) if (has(i + di, j + dj, g)) ok = true;
    if (!ok) doorsBlocked.push({ level: dr.level, at: dr.at, w: dr.w, kind: dr.kind, g, fits: g != null ? W.fits(dr.at[0], dr.at[1], g) : null });
  }
  const cells = [];
  for (const [k, zs] of vis) { const [i, j] = k.split(',').map(Number); for (const z of zs) cells.push([+uAt(i).toFixed(2), +vAt(j).toFixed(2), +z.toFixed(2)]); }
  return { visited: n, falls, unreach, doorsBad, doorsBlocked, cells };
});
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(r));
console.log(`клеток пройдено: ${r.visited}; обрывов: ${r.falls.length}; зон с отрезанными участками: ${Object.keys(r.unreach).length}; ` +
  `дверей без прохода с одной стороны: ${r.doorsBad.length}; заблокированных проёмов: ${r.doorsBlocked.length} · ${((Date.now() - t0) / 1000).toFixed(0)} с`);
for (const f of r.falls.slice(0, 15)) console.log(`  обрыв: с (${f[0]}, ${f[1]}, z ${f[2]}) на (${f[3]}, ${f[4]}) — перепад ${f[5]} м`);
for (const [id, z] of Object.entries(r.unreach)) console.log(`  отрезано: ${z.level} ${id} «${z.name}» — ${z.bad} из ${z.free} точек, напр. ${JSON.stringify(z.pts[0])}`);
for (const d of r.doorsBlocked) console.log(`  проём закрыт: ${d.level} (${d.at}) ${d.kind} ${d.w} м`);
await browser.close();
process.exit(r.falls.length || r.doorsBlocked.length ? 1 : 0);
