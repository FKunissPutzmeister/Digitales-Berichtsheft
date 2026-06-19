// Reproduces the user's path: SPA-navigate away from dashboard and BACK,
// which appends dashboard.css late → used to make bento images reappear.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
mkdirSync('.verify', { recursive: true });
const BASE = 'http://localhost:3000/app';
const b = await chromium.launch();
const p = await b.newContext({ viewport: { width: 1600, height: 900 } }).then(c => c.newPage());
await p.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await p.fill('#email', 'florian.kern@putzmeister.com');
await p.fill('#password', 'azubi123');
await Promise.all([p.waitForURL(/dashboard/, { timeout: 15000 }).catch(() => {}), p.click('#loginBtn')]);
await p.evaluate(() => localStorage.setItem('customTheme', 'silk'));
await p.goto(BASE + '/dashboard.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(1400);
await p.click('a[href="wochenansicht.html"]').catch(() => {});
await p.waitForTimeout(1200);
await p.click('a[href="dashboard.html"]').catch(() => {});
await p.waitForTimeout(2200);
const r = await p.evaluate(() => {
  const g = (el, pseudo) => el ? getComputedStyle(el, pseudo || null).backgroundImage : 'n/a';
  const hero = document.querySelector('.b-hero'), azubi = document.querySelector('.b-azubi'), recent = document.querySelector('.b-recent');
  const has = s => typeof s === 'string' && s.includes('url(');
  return {
    heroBg: has(g(hero)), heroBefore: has(g(hero, '::before')), heroAfter: has(g(hero, '::after')),
    azubiBg: has(g(azubi)), azubiBefore: has(g(azubi, '::before')),
    recentBg: has(g(recent)),
    logoGrad: !!document.querySelector('.silk-logo-grad'),
    activeLink: !!document.querySelector('.sidebar__link.active'),
  };
});
console.log('IMAGES PRESENT? (should all be false) =>', JSON.stringify(r));
await p.screenshot({ path: '.verify/07-spa-dashboard.png' });
await b.close();
