# iPad-Layout Azubi-Dashboard — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Azubi-Dashboard so umbauen, dass auf 11″-iPads im Querformat alle drei Kacheln erreichbar sind und die Mitteilungs-Kachel neben statt unter der Hero-Kachel steht.

**Architecture:** Reine CSS-Änderung an einer Datei (`app/css/dashboard.css`). Der defekte Tablet-Media-Block bei 1180 px wird durch eine Breakpoint-Leiter 1280 / 900 / 720 ersetzt. Die Hero-Kachel schrumpft von 3 auf 2 Grid-Zeilen, ihr Innenleben wird im selben Zug verkleinert, weil `overflow: hidden` sonst lautlos abschneidet. Verifiziert wird mit einem neuen Playwright-Skript, das an definierten Viewports misst statt zu schätzen.

**Tech Stack:** Vanilla CSS (kein Präprozessor), Playwright über `node_modules` mit Edge-Channel, Node `node:test` ist für diese Änderung nicht einschlägig.

**Spec:** [docs/superpowers/specs/2026-08-11-ipad-dashboard-layout-design.md](../specs/2026-08-11-ipad-dashboard-layout-design.md)

## Global Constraints

- Am ausgelieferten Code werden ausschließlich `app/css/dashboard.css` und `app/dashboard.html` (Cache-Token) verändert. Kein Anwendungs-JavaScript, kein Backend, keine Datenbank. Davon unberührt: das Prüfwerkzeug `tools/check-dashboard-viewports.mjs` (Task 1) und die Statuszeile der Spec (Task 5) — beide werden nicht ausgeliefert.
- Desktop ab 1281 px muss pixelgleich bleiben.
- Die Klassen `.b-azubi` und `.b-stats` werden nur aus den Media-Blöcken entfernt. Ihre Basis-Regeln ab [dashboard.css:1871](../../../app/css/dashboard.css#L1871) und [2302](../../../app/css/dashboard.css#L2302) bleiben unangetastet — `.b-mitteilungen` bezieht Hintergrund und Rahmen noch aus dem geteilten `.b-azubi`-Selektor.
- Breakpoint-Leiter, verbindlich: `≤ 1280 px` Querformat/13″-Laptop, `≤ 900 px` Hochformat, `≤ 720 px` Handy.
- Zielbelegung `≤ 1280 px`: Hero `grid-column: span 7` / `grid-row: span 2`, Mitteilungen `span 5` / `span 2`, Zuletzt `span 12` / `span 2`.
- Zielbelegung `≤ 900 px`: Hero und Mitteilungen je `span 6` / `span 3`, Zuletzt `span 12` / `span 2`.
- `app/abteilungsdurchlauf.html` lädt dieselbe `dashboard.css` ohne Cache-Token. Diese Seite nutzt keine `.bento`-Kacheln, muss aber in Task 5 gegengeprüft werden.
- Deutsche Kommentare im CSS, im Stil der umliegenden Kommentare: sie erklären das *Warum*, nicht das *Was*.

---

### Task 1: Mess-Harness für die Dashboard-Viewports

Ein Skript, das den Ist-Zustand messbar macht. Es muss **vor** der CSS-Änderung laufen und fehlschlagen — das ist der Beweis, dass es das richtige Problem misst.

**Files:**
- Create: `tools/check-dashboard-viewports.mjs`

**Interfaces:**
- Consumes: nichts aus früheren Tasks.
- Produces: das Kommando `node tools/check-dashboard-viewports.mjs`. Exit-Code 0 = alle Prüfungen bestanden, 1 = mindestens eine Verletzung. Optionale Flags: `--theme=light|dark` (Standard `light`), `--shots=<verzeichnis>` schreibt je Viewport einen PNG-Screenshot. Alle späteren Tasks rufen genau dieses Kommando auf.

- [ ] **Step 1: Vorbedingungen prüfen**

Das Skript braucht ein laufendes Backend mit erreichbarer Datenbank. In einem Terminal, das offen bleibt:

```bash
cd backend && npm run dev
```

In einem zweiten Terminal prüfen, dass der Server steht und Dev-Login aktiv ist:

```bash
curl -s -X POST http://localhost:3000/api/auth/login-by-email \
  -H "Content-Type: application/json" \
  -d '{"email":"florian.kern.demo@putzmeister.com"}'
```

Erwartet: JSON mit einem `user`-Objekt, Rolle `azubi`. Kommt `404 Not Found`, läuft ein alter Server ohne diese Route — neu starten. Kommt ein DB-Fehler, ist die Datenbank nicht erreichbar; ohne sie ist dieser Plan nicht ausführbar.

- [ ] **Step 2: Das Mess-Skript schreiben**

Datei `tools/check-dashboard-viewports.mjs`:

```js
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
  await page.goto(`${BASE}/dashboard.html`, { waitUntil: 'networkidle' });
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
```

- [ ] **Step 3: Skript gegen den Ist-Zustand laufen lassen**

Run: `node tools/check-dashboard-viewports.mjs`

Der Server serviert das Repo-Wurzelverzeichnis; das Dashboard liegt daher unter `/app/dashboard.html`, nicht unter `/dashboard.html`.

Erwartet: **Exit-Code 1.** Konkret muss mindestens erscheinen:
- `ipad-air-11-quer` — „Leerfläche von … px rechts neben den Mitteilungen" (die Kachel steht auf `span 6` ohne Partner)
- `ipad-pro-11-quer` — „Hero 380 px, erwartet 248 px" (der 1180-px-Block greift dort nicht)
- `ipad-air-11-quer` — `"Zuletzt" beginnt erst bei … px, komplett unter der Kante`

Beim iPad Pro erscheint der letzte Befund **nicht**, und das ist korrekt: Dort greift der 1180-px-Block gar nicht, der Hero bleibt auf `span 8` und schiebt „Zuletzt" nicht nach unten. Nur beim Air zieht sich der Hero über die volle Breite und drückt Mitteilungen und „Zuletzt" untereinander aus dem Bild. Die beiden Geräte sind unterschiedlich kaputt — genau das ist der Befund.

Erscheinen diese Befunde nicht, misst das Skript das falsche Problem. Dann erst das Skript korrigieren, nicht das CSS.

- [ ] **Step 4: Ist-Zustand als Screenshots festhalten**

Run: `node tools/check-dashboard-viewports.mjs --shots=docs/_ipad-vorher`

Die Bilder dienen dem Vorher-Nachher-Vergleich in Task 5 und werden **nicht** eingecheckt.

- [ ] **Step 5: Commit**

```bash
git add tools/check-dashboard-viewports.mjs
git commit -m "test: Mess-Skript fuer die Dashboard-Viewports

Misst Kachelhoehen, Nebeneinander-Anordnung, abgeschnittenen Inhalt und
die Lage von 'Zuletzt' an den fuenf real relevanten Viewports. Schlaegt im
Ist-Zustand an drei Stellen fehl.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Querformat — Raster und Hero-Innenleben

Der Kern. Raster und Innenleben gehören in einen Task, weil das eine ohne das andere kaputt ist: Ein 248-px-Fach mit unverändertem Inhalt schneidet den Tages-Streifen ab.

**Files:**
- Modify: `app/css/dashboard.css:1858-1868` (bestehender 1280-px-Block, Hero-Innenleben)
- Modify: `app/css/dashboard.css:2377-2383` (bisheriger 1180-px-Block, Raster)

**Interfaces:**
- Consumes: `node tools/check-dashboard-viewports.mjs` aus Task 1.
- Produces: die Media-Query `@media (max-width: 1280px)` als Träger des Querformat-Layouts. Task 3 und 4 hängen sich an dieselbe Grenze bzw. darunter.

- [ ] **Step 1: Hero-Innenleben im bestehenden 1280-px-Block verkleinern**

In [dashboard.css:1858](../../../app/css/dashboard.css#L1858) steht heute:

```css
@media (max-width: 1280px) {
  .b-hero { padding: 24px 28px 20px; }
  .b-hero__kw { font-size: 64px; }
  /* Tablet: Wochen-Info oben, Kalender gestapelt darunter (volle Breite) */
  .b-hero__middle {
    grid-template-columns: 1fr;
    align-items: stretch;
    gap: 18px;
  }
  .b-weekmini { grid-template-columns: repeat(7, 1fr); }
}
```

Ersetzen durch:

```css
@media (max-width: 1280px) {
  .b-hero { padding: 24px 28px 20px; }
  /* 56 statt 64 px: der Hero belegt ab hier nur noch 2 Grid-Zeilen (248 px,
     s. Responsiv-Block am Dateiende). .bento .b-tile hat overflow:hidden —
     zu hoher Inhalt verschwindet lautlos, also muss er mitschrumpfen.
     Rechnung: 44 (Kachel-Padding) + 90 (middle) + 72 (bottom) ≈ 206 px. */
  .b-hero__kw { font-size: 56px; }
  /* Tablet: Wochen-Info oben, Kalender gestapelt darunter (volle Breite) */
  .b-hero__middle {
    grid-template-columns: 1fr;
    align-items: stretch;
    gap: 18px;
    padding: 12px 0 10px;
  }
  .b-weekmini { grid-template-columns: repeat(7, 1fr); }
  .b-day { padding: 8px 0; }
  .b-day .dnum { font-size: 18px; }
}
```

- [ ] **Step 2: Den Raster-Block austauschen**

In [dashboard.css:2377](../../../app/css/dashboard.css#L2377) steht heute:

```css
/* Responsiv */
@media (max-width: 1180px) {
  .b-hero { grid-column: span 12; grid-row: span 3; }
  .b-azubi, .b-mitteilungen { grid-column: span 6; grid-row: span 3; }
  .b-recent { grid-column: span 12; }
  .b-stats { grid-column: span 6; grid-row: span 1; }
}
```

Ersetzen durch:

```css
/* ── Responsiv: Leiter 1280 / 900 / 720 ──
   Die Grenze lag früher bei 1180 px und trennte damit zwei baugleiche Geräte:
   iPad Air 11" ist quer 1180 px breit (Regel griff), iPad Pro 11" 1194 px
   (Regel griff nicht) — zwei völlig verschiedene Layouts auf demselben
   Schreibtisch. 1280 fängt beide ein und fällt mit dem Block weiter oben
   zusammen, der Hero-Typografie und Sidebar-Breite reduziert.

   Der alte Block adressierte außerdem .b-azubi und .b-stats. Beide Kacheln
   existieren in keinem Template mehr; .b-mitteilungen verlor dadurch seinen
   Partner und stand mit span 6 allein auf halber Breite. */
@media (max-width: 1280px) {
  .b-hero         { grid-column: span 7; grid-row: span 2; }
  .b-mitteilungen { grid-column: span 5; grid-row: span 2; }
  .b-recent       { grid-column: span 12; grid-row: span 2; }
}
```

- [ ] **Step 3: Cache-Token in dashboard.html hochziehen**

Das Stylesheet wird in [app/dashboard.html:19](../../../app/dashboard.html#L19) mit fester Version geladen. Ohne neuen Token sehen bestehende Sitzungen die alte Datei.

```html
  <link rel="stylesheet" href="css/dashboard.css?v=20260811-ipad">
```

- [ ] **Step 4: Messen**

Run: `node tools/check-dashboard-viewports.mjs`

Erwartet nach diesem Schritt:
- `ipad-pro-11-quer`, `ipad-air-11-quer`, `laptop-13` → **OK**, Hero 248 px, keine Leerfläche, kein abgeschnittener Inhalt
- `desktop` → **OK**, Hero 380 px (unverändert)
- `ipad-11-hoch` → **weiterhin FEHLER**: „Hero 248 px, erwartet 380 px". Das ist beabsichtigt, Task 4 räumt es ab.

Meldet ein Querformat noch „Hero-Inhalt wird um … px abgeschnitten", stimmt die Rechnung aus Step 1 nicht — dann die Werte dort weiter senken, nicht die Grid-Zeilen erhöhen.

- [ ] **Step 5: Commit**

```bash
git add app/css/dashboard.css app/dashboard.html
git commit -m "fix(dashboard): Azubi-Bento fuer 11-Zoll-iPads im Querformat

Der Tablet-Block lag bei 1180px und traf damit iPad Air 11 (1180), aber
nicht iPad Pro 11 (1194). Er adressierte ausserdem .b-azubi und .b-stats,
zwei Kacheln, die es in keinem Template mehr gibt — .b-mitteilungen stand
dadurch mit span 6 allein auf halber Breite unter dem Hero.

Neu: Grenze bei 1280px, Hero span 7 ueber 2 statt 3 Zeilen, Mitteilungen
span 5 daneben. Das Hero-Innenleben schrumpft mit, weil .b-tile
overflow:hidden hat und den Inhalt sonst lautlos abschneidet.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Mitteilungs-Kachel im Querformat

Bei 248 px Höhe kostet das großzügige Innenabstand-Polster spürbar Einträge. Eigener Task, weil er unabhängig bewertbar ist: Das Raster aus Task 2 ist auch ohne ihn korrekt.

**Files:**
- Modify: `app/css/dashboard.css:1945-1949` (`.b-mitteilungen__list`)
- Modify: `app/css/dashboard.css` — der in Task 2 angelegte 1280-px-Raster-Block

**Interfaces:**
- Consumes: den 1280-px-Block aus Task 2.
- Produces: nichts, worauf spätere Tasks aufbauen.

- [ ] **Step 1: Scroll-Verkettung auf dem Touchgerät unterbinden**

`.b-mitteilungen__list` scrollt intern ([dashboard.css:1945](../../../app/css/dashboard.css#L1945)). Auf dem iPad schlägt das Scrollen am Listenende sonst auf die Seite durch und man verliert versehentlich die Position. Die Regel lautet heute:

```css
.b-mitteilungen__list {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--sp-2);
  margin: 0 -6px; padding: 2px 6px 0;
}
```

Ergänzen um eine Zeile:

```css
.b-mitteilungen__list {
  flex: 1; min-height: 0; overflow-y: auto;
  /* Touch: am Listenende nicht in den Seiten-Scroll durchrutschen. */
  overscroll-behavior: contain;
  display: flex; flex-direction: column; gap: var(--sp-2);
  margin: 0 -6px; padding: 2px 6px 0;
}
```

- [ ] **Step 2: Innenabstand im Querformat straffen**

Den in Task 2 angelegten 1280-px-Block um eine Regel erweitern:

```css
@media (max-width: 1280px) {
  .b-hero         { grid-column: span 7; grid-row: span 2; }
  .b-mitteilungen { grid-column: span 5; grid-row: span 2; }
  .b-recent       { grid-column: span 12; grid-row: span 2; }

  /* Wirksame Basis ist .bento .b-tile mit 26/28 px — nicht die 30/30/28 px
     aus der .b-azubi/.b-mitteilungen-Regel, die davon überstimmt werden.
     In einem 248-px-Fach kostet das Polster rund einen ganzen Eintrag. */
  .bento .b-mitteilungen { padding: 20px 22px 18px; }
}
```

**Der `.bento`-Vorsatz ist nicht optional.** `.bento .b-tile { padding: 26px 28px; }` ([dashboard.css:1608](../../../app/css/dashboard.css#L1608)) hat die Spezifität (0,2,0) und schlägt ein blankes `.b-mitteilungen` (0,1,0) — unabhängig von Quellreihenfolge und Media-Query. Ohne den Vorsatz hat die Regel schlicht keine Wirkung. Aus demselben Grund sind die `padding`-Angaben in den beiden `.b-mitteilungen`-Regeln bei [1878](../../../app/css/dashboard.css#L1878) und [1917](../../../app/css/dashboard.css#L1917) toter Code.

Das betrifft **nur `padding`**. Die Raster-Eigenschaften (`grid-column`, `grid-row`) setzt `.bento .b-tile` nicht, dort gewinnen die blanken Selektoren regulär über die Quellreihenfolge — die Blöcke aus Task 2 und 4 brauchen den Vorsatz also nicht.

- [ ] **Step 3: Messen**

Run: `node tools/check-dashboard-viewports.mjs`

Erwartet: unverändert gegenüber Task 2 — Querformate und Desktop **OK**, `ipad-11-hoch` weiterhin **FEHLER** wegen der Hero-Höhe.

Die Zahl hinter „Eintraege" in der Ausgabe taugt **nicht** als Erfolgsmaß: Das Dashboard-JS kappt die Liste bei sechs Einträgen, gezählt wird das DOM, nicht das Sichtbare. Sie steht in jedem Viewport auf 6.

Aussagekräftig ist die nutzbare Höhe der Liste. Vor und nach der Änderung messen:

```bash
node -e "
import('playwright').then(async ({chromium}) => {
  const b = await chromium.launch({channel:'msedge', headless:true});
  const c = await b.newContext({viewport:{width:1194,height:745}});
  await c.request.post('http://localhost:3000/api/auth/login-by-email',
    {data:{email:'florian.kern.demo@putzmeister.com'}});
  const p = await c.newPage();
  await p.goto('http://localhost:3000/app/dashboard.html', {waitUntil:'networkidle'});
  await p.waitForSelector('.b-mitteilungen__list');
  console.log('Listenhoehe:', await p.evaluate(() =>
    Math.round(document.querySelector('.b-mitteilungen__list').clientHeight)), 'px');
  await b.close();
});
"
```

Erwartet: Der Wert **nach** Step 2 liegt 14 px über dem Wert davor (vertikale Basis 26 + 26 = 52 px, neu 20 + 18 = 38 px). Sinkt er oder bleibt er gleich, hat die Regel nicht gegriffen — dann zuerst die Spezifität prüfen, nicht die Pixelwerte ändern. Beide Zahlen im Report festhalten.

- [ ] **Step 4: Commit**

```bash
git add app/css/dashboard.css
git commit -m "fix(dashboard): Mitteilungs-Kachel im Tablet-Querformat entschlacken

Innenabstand von 30/30/28 auf 20/22/18 — in der auf 248px gedeckelten
Kachel kostet das Polster sonst rund einen ganzen Eintrag. Dazu
overscroll-behavior:contain, damit das Scrollen in der Liste auf dem iPad
nicht in den Seiten-Scroll durchschlaegt.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Hochformat

Das iPad ist hochkant 834 px breit und fällt damit in eine Lücke: Die Regel, die im Hero Button und Tages-Streifen untereinander stellt, greift erst ab 768 px.

**Files:**
- Modify: `app/css/dashboard.css:1817-1824` (Stapel-Regel für `.b-hero__bottom`)
- Modify: `app/css/dashboard.css` — Responsiv-Bereich, neuer 900-px-Block
- Modify: `app/css/dashboard.css:2384-2391` (bestehender 720-px-Block)

**Interfaces:**
- Consumes: den 1280-px-Block aus Task 2 und 3.
- Produces: den finalen Zustand der Breakpoint-Leiter.

- [ ] **Step 1: Stapel-Regel von 768 auf 900 px anheben**

In [dashboard.css:1817](../../../app/css/dashboard.css#L1817) steht heute:

```css
/* Mobil: fixe 7×50px-Spalten (≈398px) sprengen die Hero-Karte → Button und
   Datums-Strip stapeln, Strip füllt die Breite (1fr) statt abgeschnitten zu werden. */
@media (max-width: 768px) {
  .b-hero__bottom { flex-direction: column; align-items: stretch; gap: 16px; }
  .b-weekmini { grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .b-day { padding: 8px 0; }
  .b-day .dnum { font-size: 17px; }
}
```

Ersetzen durch:

```css
/* Schmale Kachel: Button und Datums-Strip nebeneinander sprengen die Breite →
   stapeln, Strip füllt die Breite (1fr) statt abgeschnitten zu werden.
   Grenze lag bei 768 px. Das iPad ist hochkant 834 px breit und fiel damit
   genau daneben — beide Elemente wurden nebeneinander gequetscht. */
@media (max-width: 900px) {
  .b-hero__bottom { flex-direction: column; align-items: stretch; gap: 16px; }
  .b-weekmini { grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .b-day { padding: 8px 0; }
  .b-day .dnum { font-size: 17px; }
}
```

- [ ] **Step 2: 900-px-Raster-Block anlegen**

Direkt hinter den 1280-px-Block aus Task 2/3 einfügen:

```css
/* Hochformat. Der Hero braucht hier wieder 3 Zeilen: .b-hero__bottom stellt
   Button und Tages-Streifen untereinander, das passt nicht in 248 px. */
@media (max-width: 900px) {
  .b-hero         { grid-column: span 6; grid-row: span 3; }
  .b-mitteilungen { grid-column: span 6; grid-row: span 3; }
  .b-recent       { grid-column: span 12; grid-row: span 2; }
  /* 6 Wochen-Cards auf ~710 px Inhaltsbreite ergäben je ~100 px. */
  .b-recent__grid { grid-template-columns: repeat(3, 1fr); }
}
```

- [ ] **Step 3: 720-px-Block bereinigen**

In [dashboard.css:2384](../../../app/css/dashboard.css#L2384) steht heute:

```css
@media (max-width: 720px) {
  .bento { gap: 12px; }
  .b-azubi, .b-mitteilungen { grid-column: span 12; }
  .b-stats { grid-column: span 12; }
  .b-recent__grid { grid-template-columns: repeat(3, 1fr); }
  .b-hero__middle { grid-template-columns: 1fr; gap: 18px; }
  .b-hero__kw { font-size: 88px; }
}
```

Ersetzen durch:

```css
/* Handy: alles einspaltig. .b-hero braucht hier explizit span 12 — vorher kam
   das aus dem 1180er-Block, jetzt stünde es sonst auf span 6 aus dem
   900er-Block. Die 3-Spalten-Regel für .b-recent__grid liegt jetzt bei 900 px.
   .b-azubi/.b-stats sind entfernt: die Kacheln existieren in keinem Template. */
@media (max-width: 720px) {
  .bento { gap: 12px; }
  .b-hero, .b-mitteilungen { grid-column: span 12; }
  .b-hero__middle { grid-template-columns: 1fr; gap: 18px; }
  .b-hero__kw { font-size: 88px; }
}
```

- [ ] **Step 4: Messen**

Run: `node tools/check-dashboard-viewports.mjs`

Erwartet: **Exit-Code 0**, alle fünf Viewports `OK`. Insbesondere `ipad-11-hoch` mit Hero 380 px, Mitteilungen daneben, kein abgeschnittener Inhalt.

- [ ] **Step 5: Handy-Breite gegenprüfen**

Der 720-px-Block wurde angefasst, das Skript deckt ihn nicht ab. Einmalig prüfen, dass unter 720 px nichts gebrochen ist:

```bash
node -e "
import('playwright').then(async ({chromium}) => {
  const b = await chromium.launch({channel:'msedge', headless:true});
  const c = await b.newContext({viewport:{width:390,height:844}});
  await c.request.post('http://localhost:3000/api/auth/login-by-email',
    {data:{email:'florian.kern.demo@putzmeister.com'}});
  const p = await c.newPage();
  await p.goto('http://localhost:3000/app/dashboard.html', {waitUntil:'networkidle'});
  await p.waitForSelector('.bento .b-hero');
  console.log(await p.evaluate(() => {
    const g = s => { const e=document.querySelector(s); if(!e) return null;
      const r=e.getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height),y:Math.round(r.top)}; };
    return {hero:g('.b-hero'), mitt:g('.b-mitteilungen'), recent:g('.b-recent')};
  }));
  await b.close();
});
"
```

Erwartet: Hero und Mitteilungen haben dieselbe Breite, und `mitt.y` liegt unter `hero.y` — also gestapelt, nicht nebeneinander.

- [ ] **Step 6: Commit**

```bash
git add app/css/dashboard.css
git commit -m "fix(dashboard): Azubi-Bento im iPad-Hochformat

Hochkant ist das iPad 834px breit und fiel damit in eine Luecke: die Regel,
die im Hero Button und Tages-Streifen stapelt, griff erst ab 768px. Grenze
auf 900px angehoben und ein passender Raster-Block ergaenzt (je span 6 ueber
3 Zeilen, Wochen-Cards dreispaltig).

Der 720er-Block braucht .b-hero jetzt explizit auf span 12; die toten
Selektoren .b-azubi/.b-stats sind raus.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Themes, Nachbarseite und Abschluss

Die Kachel-Hintergründe haben pro Theme eigene Regeln, und `dashboard.css` wird von einer zweiten Seite geladen. Beides muss gegengeprüft werden, bevor die Sache steht.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-11-ipad-dashboard-layout-design.md` (Status)
- Ggf. Modify: `app/css/dashboard.css` (nur falls die Prüfung etwas findet)

**Interfaces:**
- Consumes: alle vorherigen Tasks.
- Produces: nichts.

- [ ] **Step 1: Dunkles Theme messen**

Run: `node tools/check-dashboard-viewports.mjs --theme=dark`

Erwartet: **Exit-Code 0**, dieselben Werte wie hell. Weicht eine Höhe ab, setzt ein Theme eigene Schriftgrößen — dann die betroffene Regel im 1280-px-Block nachziehen.

- [ ] **Step 2: Screenshots für den Sichtvergleich erzeugen**

```bash
node tools/check-dashboard-viewports.mjs --shots=docs/_ipad-nachher
node tools/check-dashboard-viewports.mjs --theme=dark --shots=docs/_ipad-nachher
```

Die Bilder in `docs/_ipad-vorher` und `docs/_ipad-nachher` nebeneinander ansehen. Beurteilen, nicht nur messen: Wirkt der Hero mit 56-px-Zahl noch als Blickfang? Sind die Tages-Kacheln als Tippziele erkennbar? Ist die Mitteilungs-Kachel erkennbar eine Liste und nicht ein abgeschnittener Rest?

Beides sind Wegwerf-Verzeichnisse. Nicht einchecken.

- [ ] **Step 3: Die zweite Seite prüfen, die dashboard.css lädt**

[app/abteilungsdurchlauf.html:17](../../../app/abteilungsdurchlauf.html#L17) lädt dieselbe Datei. Sie nutzt keine `.bento`-Kacheln, aber `.b-day`, `.b-hero__*` und `.b-mitteilungen__*` sind generische Namen.

```bash
grep -nE "b-hero|b-day|b-mitteilungen|b-recent|bento" app/abteilungsdurchlauf.html app/js/abteilungsdurchlauf.js
```

Erwartet: keine Treffer. Gibt es welche, die betroffene Seite bei 1194 × 745 im Browser ansehen und beurteilen, ob die neuen Regeln dort schaden.

- [ ] **Step 4: Custom-Themes stichprobenartig prüfen**

`hyperspace` und `cmd` erben `[data-theme="dark"]`-Regeln nicht. Für das Layout ist das unkritisch, für die Lesbarkeit der geschrumpften Schrift nicht.

**Achtung:** Custom-Designs hängen an einem anderen Speicher-Schlüssel als hell/dunkel. `theme.js` liest sie aus `localStorage('customTheme')`, während `localStorage('theme')` nur `light` und `dark` kennt ([app/js/theme.js:9-12](../../../app/js/theme.js#L9-L12)). Der falsche Schlüssel lässt die Prüfung stillschweigend im Standard-Theme laufen.

```bash
node -e "
import('playwright').then(async ({chromium}) => {
  const b = await chromium.launch({channel:'msedge', headless:true});
  for (const t of ['hyperspace','cmd']) {
    const c = await b.newContext({viewport:{width:1194,height:745}, deviceScaleFactor:2});
    await c.request.post('http://localhost:3000/api/auth/login-by-email',
      {data:{email:'florian.kern.demo@putzmeister.com'}});
    const p = await c.newPage();
    await p.addInitScript(th => localStorage.setItem('customTheme', th), t);
    await p.goto('http://localhost:3000/app/dashboard.html', {waitUntil:'networkidle'});
    await p.waitForSelector('.bento .b-hero');
    const aktiv = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
    console.log(t, '→ data-theme =', aktiv);
    await p.screenshot({path: 'docs/_ipad-nachher/theme-'+t+'.png'});
    await c.close();
  }
  await b.close();
});
"
```

Erwartet: die Ausgabe meldet `hyperspace → data-theme = hyperspace` und `cmd → data-theme = cmd`. Steht dort `light`, hat das Theme nicht gegriffen und die Screenshots sind wertlos — dann im `addInitScript` zusätzlich `document.documentElement.setAttribute('data-theme', th)` setzen.

Die beiden Bilder ansehen. Bewertet wird nur, ob Text lesbar und nichts abgeschnitten ist.

- [ ] **Step 5: Spec-Status nachziehen**

In `docs/superpowers/specs/2026-08-11-ipad-dashboard-layout-design.md` die Statuszeile ändern:

```markdown
**Status:** umgesetzt am 2026-08-11, verifiziert per `tools/check-dashboard-viewports.mjs`
```

- [ ] **Step 6: Aufräumen und Commit**

```bash
rm -rf docs/_ipad-vorher docs/_ipad-nachher
git status --short
```

`git status` muss außer der Spec-Datei sauber sein. Dann:

```bash
git add docs/superpowers/specs/2026-08-11-ipad-dashboard-layout-design.md
git commit -m "docs: iPad-Dashboard-Design als umgesetzt markieren

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Abschließende Gesamtmessung**

```bash
node tools/check-dashboard-viewports.mjs && node tools/check-dashboard-viewports.mjs --theme=dark
```

Erwartet: beide Läufe mit Exit-Code 0 und der Zeile „Alle Viewports in Ordnung."

---

## Was dieser Plan bewusst nicht tut

- **Die Basis-Regeln von `.b-azubi` und `.b-stats` entfernen.** Beide Kachel-Klassen sind tot, aber `.b-mitteilungen` bezieht Hintergrund und Rahmen noch aus dem geteilten `.b-azubi`-Selektor. Der Rückbau ist eine eigene Aufräumarbeit und hat in einer Layout-Änderung nichts verloren.
- **Wochen- und Jahresansicht anfassen.** Sie treffen dieselben Geräte und sollen die Leiter 1280 / 900 / 720 als Muster erben, sind aber eigene Vorhaben.
- **Das Willkommens-Banner verkleinern.** Es belegt quer rund 166 px des sichtbaren Bereichs. Das ist spürbar, aber ein eigener gestalterischer Eingriff und nicht Teil des freigegebenen Designs.
- **Die Mitteilungs-Kachel unabhängig vom Hero wachsen lassen.** Das war die verworfene Variante B. Falls sich 2–3 sichtbare Einträge als zu knapp erweisen, ist die Stellschraube ohne Umbau `grid-auto-rows` im 1280-px-Bereich von 116 auf ~128 px — zulasten der Sichtbarkeit von „Zuletzt".
