// Скриншоты модели из заданных точек камеры (координаты здания u, v, z — см. AGENTS.md).
//
//   node tools/shot.mjs out/prefix "name:u,v,z,tu,tv,tz[,fov][,cut]" ...
//   node tools/shot.mjs out/prefix "name:-"            — кадр как есть, камеру не трогаем
//
// Переменные окружения: URL (по умолчанию http://localhost:5321), Q=high|low, W, H, TIME=day|eve|dusk|night,
// PARTY=1 (режим «Праздник»), PEOPLE=0 (без людей), CROWD=0.2…6 (плотность людей), UI=1 (оставить интерфейс),
// CLICK=id1,id2 (нажать кнопки интерфейса по id перед съёмкой), EVAL='…' (выполнить JS в странице, можно await),
// JPG=1, CHROME — путь к Chrome. cut — разрез по уровню (B1, L1, M, L2, L3) или «-».
import puppeteer from 'puppeteer-core';

const [prefix, ...views] = process.argv.slice(2);
if (!prefix || !views.length) { console.log('usage: node tools/shot.mjs out/prefix "name:u,v,z,tu,tv,tz[,fov][,cut]" ...'); process.exit(1); }
const W = +(process.env.W || 1600), H = +(process.env.H || 900);
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const qs = new URLSearchParams({ q: process.env.Q || 'high' });
if (process.env.PARTY) qs.set('party', '');
if (process.env.PEOPLE === '0') qs.set('people', '0');
if (process.env.CROWD) qs.set('crowd', process.env.CROWD);
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 900000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', `--window-size=${W},${H}`, '--force-color-profile=srgb'],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`${process.env.URL || 'http://localhost:5321'}/?${qs.toString().replace('party=', 'party')}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__s21 && !document.getElementById('loader'), { timeout: 180000 });
if (process.env.PEOPLE !== '0') await page.waitForFunction(() => window.__s21.peopleApi()?.count > 0, { timeout: 60000 }).catch(() => logs.push('люди не загрузились за 60 с'));
// режим «Праздник» при старте плавно уводит камеру — гасим анимацию перелёта
if (process.env.PARTY) await page.evaluate(() => window.__s21.fitCamera('party', true));
if (process.env.TIME) await page.evaluate((t) => window.__s21.applyTime(t), process.env.TIME);
for (const id of (process.env.CLICK || '').split(',').filter(Boolean)) { await page.click('#' + id); await new Promise((r) => setTimeout(r, 600)); }
if (process.env.EVAL) await page.evaluate(`(async () => { ${process.env.EVAL} })()`);
if (!process.env.UI) {
  await page.evaluate(() => {
    for (const sel of ['#rail', '.bottom', 'header']) { const e = document.querySelector(sel); if (e) e.style.visibility = 'hidden'; }
    if (window.__s21.labelRenderer) window.__s21.labelRenderer.domElement.style.display = 'none';
  });
}
for (const v of views) {
  const [name, rest] = v.split(':');
  const nums = rest.split(',');
  if (rest !== '-') await page.evaluate((nums) => {
    const s = window.__s21, C = 27.6, G = -1.5;
    const [u, vv, z, tu, tv, tz] = nums.slice(0, 6).map(Number);
    const fov = nums[6] ? +nums[6] : 60, cut = nums[7] || null;
    s.applyCut(cut && cut !== '-' ? cut : null);
    s.camera.fov = fov; s.camera.updateProjectionMatrix();
    // иначе OrbitControls молча поднимает камеру к уровню цели при взгляде вверх
    s.controls.minDistance = 0.05; s.controls.maxPolarAngle = Math.PI;
    s.camera.position.set(u - C, z - G, C - vv); s.controls.target.set(tu - C, tz - G, C - tv); s.controls.update();
  }, nums);
  await new Promise((r) => setTimeout(r, 1800));
  const file = `${prefix}_${name}.${process.env.JPG ? 'jpg' : 'png'}`;
  await page.screenshot({ path: file, ...(process.env.JPG ? { type: 'jpeg', quality: 88 } : {}) });
  console.log(file);
}
if (logs.length) console.log(logs.slice(0, 20).join('\n'));
await browser.close();
