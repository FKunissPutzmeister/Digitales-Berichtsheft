// Direct dashboard load under silk; wait for bento; capture console errors +
// computed styles for the 4 fixes (donut glow, today pill, button, logo).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('.verify', { recursive: true });
const BASE = 'http://localhost:3000/app';
const b = await chromium.launch();
const p = await b.newContext({ viewport: { width: 1600, height: 1000 } }).then(c => c.newPage());
const errors = [];
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
p.on('pageerror', e => errors.push('PAGEERR: ' + e.message));
await p.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await p.evaluate(() => localStorage.setItem('customTheme', 'silk'));
await p.fill('#email', 'florian.kern@putzmeister.com');
await p.fill('#password', 'azubi123');
await Promise.all([p.waitForURL(/dashboard/, { timeout: 15000 }).catch(() => {}), p.click('#loginBtn')]);
await p.goto(BASE + '/dashboard.html', { waitUntil: 'networkidle' });
await p.waitForSelector('.b-hero', { timeout: 15000 }).catch(() => {});
await p.waitForTimeout(2000);
const r = await p.evaluate(() => {
  const cs = (sel, prop, pseudo) => { const el = document.querySelector(sel); return el ? getComputedStyle(el, pseudo || null)[prop] : 'NO-EL'; };
  const today = document.querySelector('.b-day--today');
  const btn = document.querySelector('.b-btn-primary');
  return {
    bentoExists: !!document.querySelector('.bento'),
    heroExists: !!document.querySelector('.b-hero'),
    donutSvgFilter: cs('.b-donut svg', 'filter'),
    ringStop0: (() => { const s = document.querySelector('#bentoRingGrad stop'); return s ? getComputedStyle(s).stopColor : 'NO'; })(),
    todayBg: today ? getComputedStyle(today).backgroundImage.slice(0, 40) : 'NO-TODAY',
    todayClass: today ? today.className : 'NO-TODAY',
    btnExists: !!btn,
    btnDisplay: btn ? getComputedStyle(btn).display : 'NO',
    btnGlassbtn: !!(btn && btn.querySelector('.silk-glassbtn .glass-surface')),
    btnIsolation: btn ? getComputedStyle(btn).isolation : 'NO',
    logoSpan: !!document.querySelector('.silk-logo-grad'),
    logoImgHidden: (() => { const i = document.querySelector('.sidebar__logo-mark'); return i ? getComputedStyle(i).display : 'NO'; })(),
  };
});
console.log(JSON.stringify(r, null, 2));
console.log('CONSOLE ERRORS:', errors.length ? errors.slice(0, 8) : 'none');
await p.screenshot({ path: '.verify/fixes-dashboard.png', fullPage: false });
await b.close();
