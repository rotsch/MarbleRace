// Dev helper: screenshot the running app at given sim times.
//   node scripts/shot.mjs <outDir> <url> <t1,t2,...> [debug]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const [outDir, url, times, debug] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, deviceScaleFactor: 1 });
page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && console.log('[console]', m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForFunction(() => window.race, null, { timeout: 30000 });
if (debug) await page.keyboard.press('d');
for (const t of times.split(',').map(Number)) {
  await page.waitForFunction((t) => window.race.time >= t || window.race.finished, t, { timeout: 600000, polling: 100 });
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${outDir}/t${t}.png` });
  console.log('shot', t, await page.evaluate(() => window.race.time.toFixed(2)));
}
await browser.close();
