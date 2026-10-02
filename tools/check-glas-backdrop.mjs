/* Wächter gegen den Fehler, der das Panel-Glas dreimal getötet hat: ein
   „Backdrop Root" irgendwo über den Kacheln. Ein backdrop-filter sieht nur bis
   zum nächsten Backdrop Root — liegt einer zwischen Kachel und Seiten-
   hintergrund, filtert das Glas eine leere Fläche und die Kachel ist flach.
   Der Fehler ist im Code-Review unsichtbar und nur im Bild zu sehen, deshalb
   dieser Check.

   Root wird ein Vorfahre durch filter, opacity < 1, isolation, mix-blend-mode,
   transform, mask — UND durch eine GEFÜLLTE Animation: `animation: fadeIn
   220ms both` bleibt nach ihrem Ende am Element hängen und hält es dauerhaft
   Root, obwohl der Endwert opacity:1 ist. Genau das stand auf .main-content
   und auf den Kacheln selbst. Deshalb prüft der Check auch getAnimations().

   Geprüft wird nicht die CSS-Quelle, sondern die Wirkung: dieselbe Kachel
   zweimal aufgenommen, einmal mit und einmal mit abgeschaltetem Glas.
   Das Material ist Kandidat A aus mockups/glas-pruefstand.html — Frost und
   Brechung liegen in EINER Kette auf .pm-xm-glass, es gibt keine getrennte
   Frost-Ebene mehr.

   Aufruf:  node tools/check-glas-backdrop.mjs
   Setzt ein laufendes Backend auf http://localhost:3000 voraus. */
import { readFile } from 'node:fs/promises';

const { chromium } = await import('playwright').catch(() =>
  /* Kein playwright neben tools/ — die Kopie aus silk-react/ tut es auch. */
  import(new URL('../silk-react/node_modules/playwright/index.mjs', import.meta.url).href));

const BASE  = 'http://localhost:3000';
const EMAIL = 'florian.kern.demo@putzmeister.com';
const TILES = ['.welcome-hero', '.b-hero', '.b-mitteilungen', '.b-recent'];

/* Sollwert des Frosts aus theme.js lesen, nicht hier zweitpflegen. */
const themeJs = await readFile(new URL('../app/js/theme.js', import.meta.url), 'utf8');
const FROST = (themeJs.match(/data-frostblur',\s*'(\d+(?:\.\d+)?)'/) || [])[1];
if (!FROST) { console.error('FEHLER data-frostblur nicht in app/js/theme.js gefunden'); process.exit(1); }

let fehler = 0;
const fail = (m) => { console.log('FEHLER ' + m); fehler++; };
const ok   = (m) => console.log('OK    ' + m);

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1030 } });
const login = await ctx.request.post(`${BASE}/api/auth/login-by-email`, { data: { email: EMAIL } });
if (!login.ok()) { console.error(`FEHLER Login ${login.status()} — läuft das Backend?`); process.exit(1); }

const page = await ctx.newPage();
page.on('pageerror', (e) => fail('JS-Fehler auf der Seite: ' + e.message));
await page.addInitScript(() => {
  localStorage.setItem('customTheme', 'christmas');
  localStorage.setItem('perfLite', '0');
});
await page.goto(`${BASE}/app/dashboard.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('.b-hero .pm-xm-glass', { timeout: 15000 });
/* Szene stilllegen: Schnee und Lichterkette verrauschen jeden Bildvergleich.
   Onboarding-Tour raus, die legt einen blur(5px) über den ganzen Viewport. */
await page.evaluate(() => {
  document.querySelectorAll('.onb-blur-panel, #onbCard').forEach((n) => n.remove());
  document.querySelectorAll('.pm-xm-snow').forEach((n) => { n.style.display = 'none'; });
  document.querySelectorAll('.pm-xm-lights').forEach((n) => { n.style.animation = 'none'; });
});
await page.waitForTimeout(1200);   // Einblend-Animationen auslaufen lassen

/* ── 1 · Verdrahtung: EINE Kette blur(<frost>px) url(#glass-filter-N) ───── */
const wiring = await page.evaluate((tiles) => tiles.map((sel) => {
  const t = document.querySelector(sel);
  if (!t) return { sel, fehlt: true };
  const glass = t.querySelector(':scope > .pm-xm-glass');
  return {
    sel,
    kette: glass ? (glass.style.backdropFilter || getComputedStyle(glass).backdropFilter) : null,
  };
}), TILES);
for (const w of wiring) {
  if (w.fehlt) { fail(`${w.sel}: Kachel nicht im DOM`); continue; }
  /* EINE Kette: blur(<data-frostblur>px) url(#glass-filter-N). Der Sollwert
     wird aus theme.js gelesen statt hier zweitgepflegt — er ist schon zweimal
     gewandert (2 -> 3), und ein hartkodierter Waechter schlaegt dann falsch an. */
  const soll = `blur(${FROST}px) url(`;
  if (!(w.kette || '').replace(/\s+/g, ' ').startsWith(soll)) {
    fail(`${w.sel}: Filterkette ist nicht "blur(${FROST}px) url(#...)" sondern "${w.kette}"`);
  }
}
if (!fehler) ok(`Filterkette blur(${FROST}px) url(#...) auf allen ${TILES.length} Kacheln`);

/* ── 2 · Kein Backdrop Root im Vorfahrenpfad ──────────────────────────── */
const roots = await page.evaluate((tiles) => {
  const out = [];
  for (const sel of tiles) {
    let el = document.querySelector(sel);
    while (el && el !== document.documentElement) {
      const s = getComputedStyle(el);
      const gruende = [];
      if (s.filter !== 'none')                      gruende.push('filter: ' + s.filter);
      if (parseFloat(s.opacity) < 1)                gruende.push('opacity: ' + s.opacity);
      if (s.isolation !== 'auto')                   gruende.push('isolation: ' + s.isolation);
      if (s.mixBlendMode !== 'normal')              gruende.push('mix-blend-mode: ' + s.mixBlendMode);
      if (s.transform !== 'none')                   gruende.push('transform: ' + s.transform);
      if ((s.maskImage || 'none') !== 'none')       gruende.push('mask-image');
      if ((s.webkitMaskImage || 'none') !== 'none') gruende.push('-webkit-mask-image');
      if (s.willChange !== 'auto')                  gruende.push('will-change: ' + s.willChange);
      /* Gefüllte Animation: bleibt nach dem Ende am Element und hält es Root. */
      const anim = el.getAnimations().map((a) => a.animationName || 'anonym');
      if (anim.length) gruende.push('Animation haftet: ' + anim.join(', '));
      if (gruende.length) {
        const cls = String(el.className || '').trim().replace(/\s+/g, '.');
        out.push({ tile: sel, el: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
          + (cls ? '.' + cls : ''), gruende });
      }
      el = el.parentElement;
    }
  }
  return out;
}, TILES);
if (roots.length) roots.forEach((r) => fail(`Backdrop Root über ${r.tile}: ${r.el} — ${r.gruende.join('; ')}`));
else ok('Vorfahrenpfad frei von Backdrop Roots');

/* ── 3 · Wirkungsnachweis: die Kachel muss das Bild WEICHZEICHNEN ────────
   Nicht mit einem Testelement geprüft, sondern am fertigen Bild: ein
   Testelement mit backdrop-filter täuscht hier: es löst seinen Backdrop
   anders auf als der echte Frost (in beiden Fällen gemessen, es war auch bei
   totem Glas grün). Was zählt, ist die Schärfe der Szene IN der Kachel.
   Kennzahl: mittlere Pixelabweichung derselben Kachel mit und ohne Glas.
   Wirkt der Frost, ändert er das Bild sichtbar; ist er tot, sind beide
   Aufnahmen identisch. Geometrie spielt dabei keine Rolle — der Kachelinhalt
   ist in beiden Aufnahmen derselbe, die Differenz kommt aus der Szene. */
const abweichung = async (a, b) => page.evaluate(async ([d1, d2]) => {
  const laden = (data) => new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej;
    i.src = 'data:image/png;base64,' + data;
  });
  const [i1, i2] = await Promise.all([laden(d1), laden(d2)]);
  const pix = (img) => {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, c.width, c.height).data;
  };
  const p1 = pix(i1), p2 = pix(i2);
  if (p1.length !== p2.length) return -1;
  let s = 0;
  for (let i = 0; i < p1.length; i += 4) {
    s += Math.abs(p1[i] - p2[i]) + Math.abs(p1[i + 1] - p2[i + 1]) + Math.abs(p1[i + 2] - p2[i + 2]);
  }
  return s / (p1.length / 4) / 3;
}, [a, b]);

/* Nicht am Inline-Style des Vendors drehen — der trägt die Brechung, ihn zu
   löschen misst am Ende gar nichts. Deshalb per Stylesheet abschalten. */
const kachel = await page.$('.b-recent');
const mitGlas = (await kachel.screenshot()).toString('base64');
await page.addStyleTag({ content: 'html .pm-xm-glass '
  + '{ -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }' });
await page.waitForTimeout(500);
const ohneGlas = (await kachel.screenshot()).toString('base64');
const diff = await abweichung(mitGlas, ohneGlas);
if (diff < 3) {
  fail(`Kachel sieht mit und ohne Glas gleich aus (mittlere Abweichung ${diff.toFixed(2)}, `
    + 'erwartet > 3). Der Frost filtert eine leere Fläche, die Szene steht scharf durch.');
} else {
  ok(`Weichzeichnung wirkt: Kachel ändert sich um ${diff.toFixed(2)} Stufen, wenn das Glas ausgeht`);
}

await browser.close();
if (fehler) { console.log(`\n${fehler} Problem(e).`); process.exit(1); }
console.log('\nAlles gut.');
