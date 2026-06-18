// Prove the border-glow hover-edge reaction fires under silk.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = 'http://localhost:3000/app';
mkdirSync('.verify', { recursive: true });

const b = await chromium.launch();
const p = await b.newContext({ viewport: { width: 1440, height: 900 } }).then(c => c.newPage());
await p.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
await p.fill('#email', 'florian.kern@putzmeister.com');
await p.fill('#password', 'azubi123');
await Promise.all([ p.waitForURL(/dashboard/, { timeout: 15000 }).catch(()=>{}), p.click('#loginBtn') ]);
await p.evaluate(() => localStorage.setItem('customTheme', 'silk'));
await p.goto(BASE + '/dashboard.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);

// hover the welcome-hero (a .silk-host with a glow overlay)
const target = await p.$('.welcome-hero') || await p.$('.stat-card') || await p.$('.b-tile');
const box = await target.boundingBox();
// move toward an edge so edge-proximity is high
await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.92, { steps: 6 });
await p.waitForTimeout(700);

const state = await p.evaluate(() => {
  const host = document.querySelector('.silk-host.silk-hover') || document.querySelector('.silk-host');
  return host ? {
    tag: host.className,
    hover: host.classList.contains('silk-hover'),
    mx: host.style.getPropertyValue('--silk-mx'),
    my: host.style.getPropertyValue('--silk-my'),
  } : { noHost: true };
});
console.log('HOVER STATE => ' + JSON.stringify(state));
await p.screenshot({ path: '.verify/04-silk-hover.png' });
await b.close();
console.log('DONE 04-silk-hover.png');
