/* Misst das Azubi-Dashboard an den Viewports, die uns real begegnen.
   Hintergrund: die Hero-Kachel hat eine vom Grid vorgegebene feste Höhe und
   .bento .b-tile hat overflow:hidden — zu hoher Inhalt wird ohne Scrollbalken
   und ohne Fehlermeldung abgeschnitten. Genau das prüfen wir hier, plus die
   Frage, ob die drei Kacheln im sichtbaren Bereich ankommen.

   Aufruf:  node tools/check-dashboard-viewports.mjs [--theme=dark] [--shots=out]
   Setzt ein laufendes Backend auf http://localhost:3000 voraus. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE  = 'http://localhost:3000';
const EMAIL = 'florian.kern.demo@putzmeister.com';

const args     = process.argv.slice(2);
const theme    = (args.find(a => a.startsWith('--theme=')) || '--theme=light').split('=')[1];
const shotsDir = (args.find(a => a.startsWith('--shots=')) || '').split('=')[1] || null;

/* Höhen sind die NUTZBAREN Höhen, nicht die Gerätehöhen: Safari auf dem iPad
   belegt im Querformat rund 90 px mit Tab- und Adressleiste. Der Seite steht
   nur der Rest zur Verfügung, also messen wir auch nur den. */
const VIEWPORTS = [
  { name: 'ipad-pro-11-quer',  width: 1194, height: 745,  erwartetNebeneinander: true,  heroZeilen: 2 },
  { name: 'ipad-air-11-quer',  width: 1180, height: 731,  erwartetNebeneinander: true,  heroZeilen: 2 },
  { name: 'ipad-11-hoch',      width: 834,  height: 1105, erwartetNebeneinander: true,  heroZeilen: 3 },
  { name: 'laptop-13',         width: 1280, height: 800,  erwartetNebeneinander: true,  heroZeilen: 2 },
  { name: 'desktop',           width: 1440, height: 900,  erwartetNebeneinander: true,  heroZeilen: 3 },
];

/* Höhe in Grid-Zeilen: grid-auto-rows 116px, gap 16px.
   1 Zeile = 116, 2 Zeilen = 248, 3 Zeilen = 380. */
const zeilenHoehe = (n) => n * 116 + (n - 1) * 16;

function messen() {
  const q = (s) => document.querySelector(s);
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right,
             width: r.width, height: r.height };
  };

  /* Ragt ein Kind über die Kachelgrenze hinaus? Kinder innerhalb eines
     bewusst scrollenden Containers (.b-mitteilungen__list) zählen nicht. */
  const ueberlauf = (tile) => {
    const tr = tile.getBoundingClientRect();
    let max = 0, wer = null;
    for (const kind of tile.querySelectorAll('*')) {
      if (kind.closest('.b-mitteilungen__list')) continue;
      if (!kind.getClientRects().length) continue;
      const kr = kind.getBoundingClientRect();
      const raus = Math.max(kr.bottom - tr.bottom, tr.top - kr.top,
                            kr.right - tr.right, tr.left - kr.left);
      if (raus > max) { max = raus; wer = kind.className || kind.tagName; }
    }
    return { px: Math.round(max), wer };
  };

  const hero   = q('.bento .b-hero');
  const mitt   = q('.bento .b-mitteilungen');
  const recent = q('.bento .b-recent');
  const tag    = q('.bento .b-day');

  return {
    hero:   box(hero),
    mitt:   box(mitt),
    recent: box(recent),
    tagHoehe: tag ? Math.round(tag.getBoundingClientRect().height) : 0,
    heroUeberlauf: hero ? ueberlauf(hero) : null,
    mittUeberlauf: mitt ? ueberlauf(mitt) : null,
    sichtbareMitteilungen: document.querySelectorAll('.b-mitteilung').length,
    viewportHoehe: window.innerHeight,
  };
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
let fehler = 0;

if (shotsDir) await mkdir(shotsDir, { recursive: true });

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  });

  const login = await ctx.request.post(`${BASE}/api/auth/login-by-email`, {
    data: { email: EMAIL },
  });
  if (!login.ok()) {
    console.error(`FEHLER Login fehlgeschlagen (${login.status()}). Läuft das Backend?`);
    process.exit(1);
  }

  const page = await ctx.newPage();
  await page.addInitScript((t) => {
    localStorage.setItem('theme', t);
  }, theme);
  await page.goto(`${BASE}/app/dashboard.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.bento .b-hero', { timeout: 15000 });
  await page.waitForSelector('.bento .b-recent', { timeout: 15000 });

  const m = await page.evaluate(messen);
  const probleme = [];

  if (!m.hero || !m.mitt || !m.recent) {
    probleme.push('Eine der drei Kacheln wurde nicht gerendert');
  } else {
    const sollHoehe = zeilenHoehe(vp.heroZeilen);
    if (Math.abs(m.hero.height - sollHoehe) > 2) {
      probleme.push(`Hero ${Math.round(m.hero.height)} px, erwartet ${sollHoehe} px (${vp.heroZeilen} Zeilen)`);
    }
    if (vp.erwartetNebeneinander) {
      if (Math.abs(m.hero.top - m.mitt.top) > 2) {
        probleme.push('Hero und Mitteilungen stehen nicht auf derselben Höhe');
      }
      if (m.mitt.left < m.hero.right - 1) {
        probleme.push('Mitteilungen stehen nicht rechts neben dem Hero');
      }
      if (Math.abs(m.hero.height - m.mitt.height) > 2) {
        probleme.push('Hero und Mitteilungen sind unterschiedlich hoch');
      }
      /* Das eigentliche Symptom: eine Lücke rechts neben den Mitteilungen,
         weil die Kachel schmaler ist als der freie Platz. */
      const luecke = Math.round(m.recent.right - m.mitt.right);
      if (luecke > 4) {
        probleme.push(`Leerfläche von ${luecke} px rechts neben den Mitteilungen`);
      }
    }
    if (m.recent.top >= m.viewportHoehe) {
      probleme.push(`"Zuletzt" beginnt erst bei ${Math.round(m.recent.top)} px, komplett unter der Kante (${m.viewportHoehe} px)`);
    }
  }

  if (m.heroUeberlauf && m.heroUeberlauf.px > 1) {
    probleme.push(`Hero-Inhalt wird um ${m.heroUeberlauf.px} px abgeschnitten (${m.heroUeberlauf.wer})`);
  }
  if (m.mittUeberlauf && m.mittUeberlauf.px > 1) {
    probleme.push(`Mitteilungs-Inhalt wird um ${m.mittUeberlauf.px} px abgeschnitten (${m.mittUeberlauf.wer})`);
  }
  if (m.tagHoehe && m.tagHoehe < 44) {
    probleme.push(`Tages-Kacheln nur ${m.tagHoehe} px hoch, unter dem 44-px-Touch-Minimum`);
  }

  const status = probleme.length ? 'FEHLER' : 'OK   ';
  console.log(`${status} ${vp.name.padEnd(18)} ${vp.width}x${vp.height}  ` +
              `Hero ${m.hero ? Math.round(m.hero.height) : '?'}px  ` +
              `Mitteilungen ${m.mitt ? Math.round(m.mitt.width) : '?'}px breit / ${m.sichtbareMitteilungen} Eintraege  ` +
              `Zuletzt ab ${m.recent ? Math.round(m.recent.top) : '?'}px`);
  for (const p of probleme) console.log(`      → ${p}`);
  if (probleme.length) fehler++;

  if (shotsDir) {
    await page.screenshot({ path: `${shotsDir}/${vp.name}-${theme}.png`, fullPage: false });
  }
  await ctx.close();
}

await browser.close();
console.log(fehler ? `\n${fehler} Viewport(s) mit Befund.` : '\nAlle Viewports in Ordnung.');
process.exit(fehler ? 1 : 0);
