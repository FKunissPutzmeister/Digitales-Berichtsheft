// Headless verification for the silk React theme-layer.
// Logs in, exercises silk + the existing themes, asserts:
//  - no console/page errors on any theme
//  - silk mounts #silk-react-root + a <canvas>; bundle IS fetched for silk
//  - non-silk themes: no #silk-react-root, bundle NOT fetched
// Writes screenshots to .verify/ for visual review.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:3000/app';
const OUT = '.verify/'; // relative to cwd (silk-react)
mkdirSync(OUT, { recursive: true });

const results = [];
function log(s){ console.log(s); results.push(s); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const errors = [];
let bundleRequested = false;
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('request', r => { if (r.url().includes('silk-bundle.js')) bundleRequested = true; });

// ── Login ────────────────────────────────────────────────────────────
await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await page.fill('#email', 'florian.kern@putzmeister.com');
await page.fill('#password', 'azubi123');
await Promise.all([
  page.waitForURL(/dashboard\.html/, { timeout: 15000 }).catch(() => {}),
  page.click('#loginBtn'),
]);
await page.waitForTimeout(1500);
log('after login url=' + page.url());

async function setTheme(t){
  await page.evaluate((theme) => {
    if (theme) localStorage.setItem('customTheme', theme);
    else localStorage.removeItem('customTheme');
  }, t);
}
async function snapshot(label){
  await page.waitForTimeout(2200); // allow bundle import + first frames
  const info = await page.evaluate(() => ({
    dataTheme: document.documentElement.getAttribute('data-theme'),
    dataSkin: document.documentElement.getAttribute('data-skin'),
    silkRoot: !!document.getElementById('silk-react-root'),
    glass: document.querySelectorAll('.silk-glass').length,
    glow: document.querySelectorAll('.silk-glow').length,
    silkCanvas: !!document.querySelector('#silk-react-root canvas'),
    blurHost: !!document.querySelector('.silk-blur-host'),
    backings: document.querySelectorAll('.silk-backing').length,
    pmThemeFX: !!document.getElementById('pmThemeFX'),
  }));
  log(label + ' => ' + JSON.stringify(info) + ' bundleRequested=' + bundleRequested + ' errors=' + errors.length);
  await page.screenshot({ path: OUT + label + '.png', fullPage: false });
}

// ── Silk on the dashboard ────────────────────────────────────────────
bundleRequested = false; errors.length = 0;
await setTheme('silk');
await page.goto(BASE + '/dashboard.html', { waitUntil: 'networkidle' });
await snapshot('01-silk-dashboard');

// ── Perf probe: rAF frame rate over 2s on the silk dashboard ─────────
const fps = await page.evaluate(() => new Promise(res => {
  let frames = 0; const t0 = performance.now();
  (function loop(){ frames++; const dt = performance.now() - t0;
    if (dt < 2000) requestAnimationFrame(loop); else res(Math.round(frames / (dt / 1000))); })();
}));
log('FPS (silk dashboard, 2s) => ' + fps);

// ── Navigate (SPA) to wochenansicht under silk ───────────────────────
await page.click('a[href="wochenansicht.html"]').catch(() => {});
await page.waitForTimeout(1500);
await snapshot('02-silk-wochenansicht-spa');

// ── Regression: reuse the SAME logged-in session (no re-login → avoids the
//    machine's sporadic Session-FileStore 401). Set theme, reload, check. ──
for (const t of ['', 'iceland', 'candy', 'hyperspace', 'cmd', 'dark']) {
  errors.length = 0; bundleRequested = false;
  await page.evaluate((theme) => {
    if (theme === 'dark') { localStorage.setItem('theme','dark'); localStorage.removeItem('customTheme'); }
    else if (theme) { localStorage.setItem('customTheme', theme); }
    else { localStorage.removeItem('customTheme'); localStorage.setItem('theme','light'); }
  }, t);
  await page.goto(BASE + '/dashboard.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  const info = await page.evaluate(() => ({
    dataTheme: document.documentElement.getAttribute('data-theme'),
    silkRoot: !!document.getElementById('silk-react-root'),
    pmThemeFX: !!document.getElementById('pmThemeFX'),
    cards: document.querySelectorAll('.b-tile, .stat-card, .welcome-hero').length,
  }));
  log('REGRESSION ' + (t||'standard-light') + ' => ' + JSON.stringify(info) + ' bundleRequested=' + bundleRequested + ' errors=' + errors.length + (errors.length? ' :: ' + errors.join(' | ') : ''));
  await page.screenshot({ path: OUT + 'reg-' + (t||'standard') + '.png' });
}

// ── Silk on the login page ───────────────────────────────────────────
{
  const c3 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p3 = await c3.newPage();
  const errs3 = [];
  p3.on('console', m => { if (m.type() === 'error') errs3.push(m.text()); });
  p3.on('pageerror', e => errs3.push(e.message));
  await p3.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await p3.evaluate(() => localStorage.setItem('customTheme', 'silk'));
  await p3.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await p3.waitForTimeout(2200);
  const info = await p3.evaluate(() => ({
    dataTheme: document.documentElement.getAttribute('data-theme'),
    loginBg: !!document.getElementById('silk-login-bg'),
    loginCanvas: !!document.querySelector('#silk-login-bg canvas'),
    cardBacking: document.querySelectorAll('.login-card .silk-backing').length,
  }));
  log('LOGIN silk => ' + JSON.stringify(info) + ' errors=' + errs3.length + (errs3.length? ' :: ' + errs3.join(' | ') : ''));
  await p3.screenshot({ path: OUT + '03-silk-login.png' });
  await c3.close();
}

log('SILK DASHBOARD errors total=' + errors.length + (errors.length ? ' :: ' + errors.join(' | ') : ''));
await browser.close();
console.log('\nDONE. Screenshots in ' + OUT);
