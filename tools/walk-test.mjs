// Регрессионный тест прогулки: игрок с капсулой и физикой проходит 29 маршрутов по зданию
// (вход → турникеты → лестницы на все этажи, лекторий, кластеры, санузлы, пандус) и проверяет,
// что с краёв площадок и рядов нельзя упасть. Нужен запущенный сервер (по умолчанию :5321).
//
//   node tools/walk-test.mjs            URL=… CHROME=… — как в shot.mjs
//
// Код выхода 1, если хоть один маршрут не пройден. Маршруты — в координатах здания (u, v), см. AGENTS.md.
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 900000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=640,400'] });
const page = await browser.newPage();
await page.setViewport({ width: 640, height: 400, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (!/GPU stall|GL Driver/.test(m.text()) && m.type() !== 'log') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await page.goto(`${process.env.URL || 'http://localhost:5321'}/?q=low&people=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__s21 && !document.getElementById('loader'), { timeout: 180000 });
const res = await page.evaluate(async () => {
  const w = window.__s21.walk;
  await w.start({ overlay: false, manual: true });
  window.__s21.state.view = 'plan';
  const walkTo = (u, v, o = {}) => {
    const tol = o.tol ?? 0.35, maxT = o.maxT ?? 30, dt = 1 / 60;
    let t = 0, s = w.state(), best = Infinity, stuckT = 0;
    while (t < maxT) {
      const d = Math.hypot(u - s.u, v - s.v);
      if (d < tol) break;
      w.lookAt(u, v); w.setInput({ forward: true, run: !!o.run });
      s = w.step(dt, 1); t += dt;
      if (d < best - 0.03) { best = d; stuckT = 0; } else stuckT += dt;
      if (stuckT > 2.5) break;
    }
    w.setInput({}); s = w.step(dt, 15);
    const d = Math.hypot(u - s.u, v - s.v);
    return { to: [u, v], ok: d < tol + 0.2, d: +d.toFixed(2), z: +s.z.toFixed(2), level: s.level, zone: s.zone, t: +t.toFixed(1) };
  };
  const route = (name, start, pts) => {
    if (start) w.teleport(start[0], start[1], start[2], { yaw: 0 });
    const out = [];
    for (const p of pts) { const r = walkTo(p[0], p[1], p[2] || {}); out.push(r); if (!r.ok) break; }
    const last = out[out.length - 1];
    return { name, ok: out.every((r) => r.ok), steps: out.length, of: pts.length, last, fail: out.find((r) => !r.ok) || null };
  };
  const R = [];
  // A. Улица → крыльцо → портик → двери → холл → турникеты → лобби → мятная лестница → 2 → 3
  w.respawn();
  R.push(route('A: улица → лобби', null, [[47.0, -8.5], [47.0, -3.2], [47.0, 3.0], [47.0, 5.8], [46.9, 8.2], [46.5, 12.0], [46.73, 18.2], [46.73, 22.2], [43.0, 24.2]]));
  R.push(route('A2: мятная 1 → 2', null, [[40.95, 27.4], [40.95, 34.4], [39.05, 35.6], [39.05, 31.4], [39.05, 30.0]]));
  R.push(route('A3: мятная 2 → 3', null, [[40.95, 27.2], [40.95, 34.4], [39.05, 35.6], [39.05, 31.4], [39.05, 30.0]]));
  // B. Лобби → сиреневая лестница к статуе → площадка → марш на галерею 2 этажа
  R.push(route('B: лобби → площадка → 2 эт.', [33.5, 26.2, 'L1'], [[31.2, 26.2], [26.0, 26.2], [21.0, 27.0], [16.65, 31.9], [16.65, 37.2], [16.65, 39.5]]));
  // C. Лобби → мятный марш вниз → кольцо → проход → сцена → ступени → лаунж −1
  R.push(route('C: лобби → лекторий → −1', [33.5, 23.05, 'L1'], [[31.0, 23.1], [26.5, 23.1], [24.7, 23.15], [20.3, 23.15], [18.3, 21.0], [18.2, 19.4], [22.0, 19.4], [28.8, 19.5], [29.0, 26.0], [28.0, 33.5]]));
  // C2. Кольцо лектория ↔ северо-западный марш на 1 этаж
  R.push(route('C2: кольцо → СЗ марш → коридор', [16.65, 32.0, -1.8], [[16.65, 33.2], [16.65, 36.9], [16.65, 37.8]]));
  // D. Лобби → фойе → конференц-зал
  R.push(route('D: фойе → конференц-зал', [34.0, 20.0, 'L1'], [[33.8, 15.2], [31.6, 14.8], [29.9, 14.8], [29.9, 8.3], [22.0, 8.3]]));
  // E. Коридор СЗ → санузлы, пинг-понг, лаунж у конференц-зала
  R.push(route('E: коридор → пинг-понг → лаунж', [25.0, 37.7, 'L1'], [[11.1, 37.6], [11.1, 26.9], [8.8, 26.9], [6.5, 26.0], [8.9, 22.0], [8.9, 20.2], [9.0, 17.0], [11.4, 14.4], [11.4, 3.0], [13.8, 2.4]]));
  // F. 2 этаж: галерея → кухня, Tashkent, Samarkand, Khiva, Bukhara
  R.push(route('F: 2 этаж по кругу', [33.0, 28.0, 'L2'], [[33.0, 39.5], [22.0, 39.5], [11.2, 39.5], [11.2, 29.7], [9.0, 29.7], [5.0, 28.5], [9.0, 29.7], [11.2, 29.7], [11.2, 14.0], [11.2, 44.0], [5.0, 43.9]]));
  R.push(route('F2: 2 этаж → Khiva, Bukhara', [33.0, 28.0, 'L2'], [[35.0, 24.0], [43.9, 24.0], [43.9, 19.6], [44.0, 14.0], [48.0, 11.5], [44.0, 14.0], [46.1, 19.6], [46.1, 26.0]]));
  // G. 3 этаж: кольцо → ступени лаунжа → подиум
  R.push(route('G: 3 этаж, лаунж насквозь', [33.0, 25.8, 'L3'], [[31.4, 25.8], [29.4, 25.8], [26.0, 27.6], [24.9, 24.9], [21.6, 22.6], [20.6, 19.6], [20.3, 17.3], [20.3, 15.6]]));
  // D2. Белое фойе → фойе у фасада → боковая дверь конференц-зала
  R.push(route('D2: фойе у фасада → зал', [33.5, 10.0, 'L1'], [[33.5, 4.0], [31.8, 1.9], [29.6, 1.8], [27.0, 3.0]]));
  // C3. Лаунж −1 по полумесяцу вокруг лектория: от южной полосы до СЗ стены
  R.push(route('C3: лаунж −1 по полумесяцу', [27.9, 21.5, 'B1'], [[28.0, 27.0], [27.2, 31.5], [24.0, 34.2], [20.5, 34.3], [17.0, 34.6]]));
  // H. Лестницы-ядра: ЮВ башня L1 → L2
  R.push(route('H: гардероб → башня', [39.5, 9.0, 'L1'], [[38.3, 7.4], [38.3, 5.4]]));
  // W. Санузлы: через тамбур с умывальниками к кабинкам (1, 2, 3 этажи)
  R.push(route('W1: санузел 1 эт.', [11.1, 33.6, 'L1'], [[9.9, 33.6], [8.4, 33.6], [6.9, 33.6], [4.0, 33.3]]));
  R.push(route('W2: санузел 2 эт.', [11.2, 38.2, 'L2'], [[10.2, 38.2], [8.6, 38.6], [7.4, 39.6], [5.8, 39.6], [3.5, 39.6]]));
  R.push(route('W3: санузел 3 эт.', [11.2, 38.2, 'L3'], [[10.2, 38.2], [8.6, 38.6], [7.4, 39.6], [5.8, 39.6], [3.5, 39.6]]));
  // S. Боковая лестница ЮЗ: 1 → 2 этаж целиком, потом шаг к витражу на площадке
  R.push(route('S1: лестница ЮЗ 1 → 2', [8.0, 17.4, 'L1'], [[6.0, 17.9], [5.0, 17.9], [1.3, 17.9], [1.1, 16.2], [5.3, 16.2], [6.0, 17.2], [7.6, 17.2]]));
  R.push(route('S2: лестница СЗ 2 → 3', [38.8, 47.4, 'L2'], [[38.8, 49.2], [41.5, 50.0], [41.5, 53.4], [39.6, 54.2], [37.7, 53.4], [37.7, 50.0], [38.8, 49.4], [38.8, 47.6]]));
  const edge = (name, at, toward) => {
    w.teleport(at[0], at[1], at[2], { yaw: 0 });
    let s = w.step(1 / 60, 30);
    const z0 = s.z;
    for (let i = 0; i < 240; i++) { w.lookAt(toward[0], toward[1]); w.setInput({ forward: true }); s = w.step(1 / 60, 1); }
    w.setInput({}); s = w.step(1 / 60, 60);
    return { name, ok: Math.abs(s.z - z0) < 0.3, steps: 1, of: 1, last: { z: +s.z.toFixed(2), level: s.level, zone: s.zone }, fail: Math.abs(s.z - z0) < 0.3 ? null : { to: toward, d: 0, z: +s.z.toFixed(2), level: s.level, zone: s.zone } };
  };
  R.push(edge('S3: площадка ЮЗ → к витражу (не падаем)', [1.3, 17.0, 2.25], [-1.0, 17.0]));
  R.push(edge('S4: площадка СЗ → к витражу (не падаем)', [39.6, 54.2, 6.75], [39.6, 57.0]));
  R.push(edge('S5: кольцо лектория → ЮВ край (не падаем)', [24.4, 20.9, -1.8], [24.4, 17.0]));
  R.push(edge('S6: ряд лектория вдоль → торец (не падаем)', [21.93, 21.77, -2.93], [21.0, 20.16]));
  R.push(edge('S6b: ряд у СЗ торца (не падаем)', [13.9, 27.9, -2.93], [12.0, 26.0]));
  R.push(edge('S7: верхний марш пандуса → бортик (не падаем)', [30.0, -1.3, -0.4], [30.0, -5.0]));
  // K. Кластеры: проходы между рядами и поперечный проход
  R.push(route('K1: Tashkent вдоль рядов', [12.0, 43.6, 'L2'], [[11.6, 45.0], [11.6, 48.7], [11.6, 53.4], [11.6, 48.7], [9.6, 48.7], [9.6, 51.0]]));
  R.push(route('K2: Khiva между рядами', [45.0, 11.7, 'L2'], [[47.6, 11.8], [47.6, 14.0], [47.6, 17.5]]));
  R.push(route('K3: Bukhara между рядами', [46.3, 25.6, 'L2'], [[47.8, 25.6], [53.6, 25.6]]));
  // R. Пандус: площадь → нижний марш → поворотная площадка → верхний марш → терраса
  R.push(route('R: пандус к дверям', [39.0, -3.4, -1.5], [[30.0, -3.4], [21.6, -3.4], [19.4, -2.2], [21.6, -1.1], [42.4, -1.1], [45.0, -1.4]]));
  return { R, z: w.state() };
});
for (const r of res.R) console.log((r.ok ? 'OK  ' : 'FAIL') + ' ' + r.name + ` (${r.steps}/${r.of})` + (r.fail ? ` → застрял у ${JSON.stringify(r.fail.to)}, d=${r.fail.d}, z=${r.fail.z}, ${r.fail.level}/${r.fail.zone}` : ` → z=${r.last.z} ${r.last.level}/${r.last.zone}`));
const failed = res.R.filter((r) => !r.ok).length;
console.log(`\n${res.R.length - failed}/${res.R.length} маршрутов пройдено`);
if (logs.length) console.log(logs.slice(0, 20).join('\n'));
await browser.close();
process.exit(failed ? 1 : 0);
