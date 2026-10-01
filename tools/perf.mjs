// Быстрый замер: вызовы отрисовки, треугольники, кадры/с в нескольких видах (headless, без ретины — для сравнения версий)
import puppeteer from 'puppeteer-core';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 0, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1440,900'] });
const out = {};
for (const party of [false, true]) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${process.env.URL || 'http://localhost:5321'}/?q=${process.env.Q || 'high'}${party ? '&party' : ''}${process.env.PEOPLE === '0' ? '&people=0' : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__s21 && !document.getElementById('loader'), { timeout: 180000 });
  if (process.env.PEOPLE !== '0') await page.waitForFunction(() => window.__s21.peopleApi()?.count > 0, { timeout: 60000 }).catch(() => {});
  if (party) await page.evaluate(() => window.__s21.fitCamera('party', true));
  out[party ? 'party' : 'normal'] = await page.evaluate(async (party) => {
    const s = window.__s21, r = s.renderer, C = 27.6, G = -1.5;
    const views = party ? { hall: [30.0, 12.8, 2.4, 13.6, 7.6, 1.5] } : { cluster: [11.6, 44.0, 6.3, 11.6, 50, 5.0], lobby: [44, 27.5, 1.7, 36, 23, 1.0], ext: [80, -44, 27, 25, 24, 11] };
    const res = { people: s.peopleApi()?.count ?? 0 };
    for (const [k, [u, v, z, tu, tv, tz]] of Object.entries(views)) {
      s.controls.maxPolarAngle = Math.PI; s.camera.position.set(u - C, z - G, C - v); s.controls.target.set(tu - C, tz - G, C - tv); s.controls.update();
      await new Promise((ok) => setTimeout(ok, 800));
      r.info.autoReset = false; r.info.reset();
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      const calls = r.info.render.calls, tris = r.info.render.triangles; r.info.autoReset = true;
      const T = performance.now(); let n = 0;
      await new Promise((ok) => { const f = () => { n++; if (performance.now() - T < 2500) requestAnimationFrame(f); else ok(); }; requestAnimationFrame(f); });
      res[k] = { calls, tris, fps: +(n / 2.5).toFixed(1) };
    }
    return res;
  }, party);
  await page.close();
}
console.log(JSON.stringify(out));
await browser.close();
