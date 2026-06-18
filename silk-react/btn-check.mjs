import { chromium } from 'playwright';
const BASE = 'http://localhost:3000/app';
const b = await chromium.launch();
const p = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }).then(c => c.newPage());
await p.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await p.fill('#email', 'florian.kern@putzmeister.com');
await p.fill('#password', 'azubi123');
await Promise.all([ p.waitForURL(/dashboard/, { timeout: 15000 }).catch(()=>{}), p.click('#loginBtn') ]);
await p.evaluate(() => localStorage.setItem('customTheme', 'silk'));
await p.goto(BASE + '/dashboard.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(2600);

const info = await p.evaluate(() => {
  const out = {};
  const cta = document.querySelector('.b-btn-primary');
  out.cta = cta ? { hasGlass: !!cta.querySelector(':scope > .silk-glassbtn .glass-surface'), cls: cta.className } : 'none';
  const btns = document.querySelectorAll('.btn, .b-btn-primary, .btn-ms, .demo-login-btn');
  out.btnCount = btns.length;
  out.btnsWithGlass = [...btns].filter(x => x.querySelector(':scope > .silk-glassbtn .glass-surface')).length;
  return out;
});
console.log('BTN INFO => ' + JSON.stringify(info));

const cta = await p.$('.b-btn-primary');
if (cta) { const bx = await cta.boundingBox(); await p.screenshot({ path: '.verify/05-cta-btn.png', clip: { x: Math.max(0,bx.x-30), y: Math.max(0,bx.y-30), width: bx.width+60, height: bx.height+60 } }); }
// sidebar close-up
await p.screenshot({ path: '.verify/06-sidebar.png', clip: { x: 0, y: 0, width: 230, height: 900 } });
await b.close();
console.log('DONE');
