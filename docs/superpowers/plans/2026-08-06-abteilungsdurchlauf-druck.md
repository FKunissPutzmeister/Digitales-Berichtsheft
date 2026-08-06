# Abteilungsdurchlauf-Druck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den defekten Tafel-Druck des Abteilungs-Planers reparieren und durch
einen Druck-Dialog ersetzen, in dem Azubis, Zeitraum und Darstellung
(Gantt-Tafel oder Tabelle) vor dem Drucken gewählt werden.

**Architecture:** Neues, eigenständiges Modul `app/js/planer-print.js` mit reinen
HTML-Buildern (in Node testbar) plus einer dünnen Browser-Schicht für Dialog und
Druckfenster. Die Ausgabe entsteht in einem **eigenen Fenster mit eigenem CSS**,
damit Theme-, Sidebar- und Responsive-Regeln der SPA strukturell nicht mehr
hineinwirken können. Der CSS-Bugfix am Live-Druck läuft davon unabhängig, damit
direktes Strg+P nutzbar bleibt.

**Tech Stack:** Klassische Browser-Scripts (kein ESM, kein Bundler), `node:test`
+ `node:assert/strict` für kolozierte `*.test.js`, Playwright mit Edge-Channel
für Browser-Gegenproben.

**Spec:** [2026-08-06-abteilungsdurchlauf-druck-design.md](../specs/2026-08-06-abteilungsdurchlauf-druck-design.md)

## Global Constraints

Diese Regeln gelten für **jede** Aufgabe in diesem Plan:

- **Keine ES-Module.** `app/js/*.js` sind klassische Scripts, per `<script src>`
  eingebunden. Kein `import`/`export`.
- **Dual-Mode-Modul.** `planer-print.js` endet mit
  `if (typeof window !== 'undefined') window.PlanerPrint = api;` und
  `if (typeof module !== 'undefined' && module.exports) module.exports = api;`
  — exakt wie `app/js/beurteilung-core.js:334`.
- **Reine Builder ohne App-Globals.** Die HTML-Builder dürfen `escapeHtml`,
  `DateUtil`, `displayName` **nicht** benutzen — die existieren in Node nicht und
  im Druckfenster ohnehin nicht. Das Modul bringt lokale `esc()` und `fmtDe()` mit.
- **IDs sind GUID-Strings.** Azubi-/Zuweisungs-IDs niemals mit `parseInt`
  behandeln. (Nur Woche/Zuweisung-PK/Benachrichtigung sind Integer.)
- **Personennamen** kommen vom Backend als `"Nachname, Vorname"`. Die Umdrehung
  auf `"Vorname Nachname"` passiert per `displayName()` **im Aufrufer**
  (`abteilungs-planer.js`), bevor die Daten ins Modul gehen. Die Builder
  bekommen fertige Anzeigenamen.
- **`Modal` ist eine `const`** in `app/js/app.js:354` — bare verwenden
  (`Modal.open('ptPrintModal')`), **nicht** `window.Modal`.
- **Kein `<select class="form-control">` im Dialog.** PmSelect wrappt jedes
  solche Select zu einem full-width `.pm-select--block`; Breitenangaben am Select
  wirken dann nicht. Für Umschalter `.pt-seg`-Buttons verwenden (im Planer für
  den Zoom bereits vorhanden, `planer-board.css`).
- **Tests koloziert** als `<datei>.test.js` neben der Quelle, Ausführung mit
  `node --test <pfad>`. Kein npm-Test-Script im Repo.
- **Datumsrechnung in UTC.** Im neuen Modul `new Date(iso + 'T00:00:00Z')` und
  `Date.UTC(...)` verwenden. Der Bestand rechnet lokal
  (`abteilungs-planer.js:1155` `new Date(z.von + 'T00:00:00')`); bei
  Zeitzonenwechseln (Sommer-/Winterzeit) kann das um einen Tag kippen. Neuer
  Code macht das nicht nach.
- **Dev-Server:** App + API laufen über einen Port, Static-Root ist das
  **Repo-Root** — die Seite liegt unter `/app/abteilungs-planer.html`, nicht
  unter `/abteilungs-planer.html`. Start: `cd backend && PORT=3100 node server.js`
  (aus `backend/`, sonst findet dotenv die `.env` nicht). Plain `node` hat kein
  Auto-Reload — nach JS-Änderungen neu starten oder `npm run dev` nutzen.
- **Login in Browser-Proben** ist passwortlos: `#email` mit einem
  `*.demo@putzmeister.com`-Konto füllen, `#loginBtn` klicken. Für die Planer-Sicht
  `admin.demo@putzmeister.com` verwenden (Prüfer-Konten bekommen die
  read-only-Durchlaufsicht, nicht die Plantafel).

---

### Task 1: Bugfix — weißer Kasten und linker Rand im Druck

Der Live-Druck (`Strg+P` auf der Planer-Seite) ist defekt. Zwei Ursachen, beide
in `app/css/planer-board.css`. Diese Aufgabe ist unabhängig vom Dialog und
liefert allein schon einen brauchbaren Zustand.

**Hintergrund:** Bei A4-Landscape mit 12 mm Rand ist der Inhaltsbereich nur
~1032 CSS-px breit. Damit greift `@media (max-width:1100px)` (Zeile 146-149) und
macht `.pt-panel` zu `position:fixed; right:0; width:384px` — ein dokumenthoher
weißer Block über der Tafel. Das `hidden`-Attribut hilft nicht, weil
`.pt-panel { display:flex }` (Zeile 110) als Klassenregel `[hidden]{display:none}`
in der Spezifität schlägt.

**Files:**
- Modify: `app/css/planer-board.css:110` (Panel-Regel, direkt darunter einfügen)
- Modify: `app/css/planer-board.css:156-165` (`@media print`-Block)
- Verify: Skript im Scratchpad (nicht im Repo — siehe Schritt 2)

**Interfaces:**
- Consumes: nichts
- Produces: nichts (reiner CSS-Fix; keine späteren Tasks hängen daran)

- [ ] **Step 1: Test-Server starten**

```bash
cd c:/Dev/Digitales-Berichtsheft/backend && PORT=3100 node server.js
```

Erwartet in der Ausgabe: `[DB] Verbindung erfolgreich` und
`Backend + Frontend laufen auf http://localhost:3100`. Läuft im Hintergrund
weiter — für alle Browser-Proben dieses Plans.

- [ ] **Step 2: Gegenprobe-Skript schreiben (schlägt jetzt fehl)**

Nach `<scratchpad>/print-check.js` (nicht ins Repo — es braucht Server und DB):

```js
const { chromium } = require('c:/Dev/Digitales-Berichtsheft/node_modules/playwright');
const THEMES = ['light', 'dark', 'silk', 'glass', 'hyperspace', 'cmd'];

(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  await p.goto('http://localhost:3100/');
  await p.fill('#email', 'admin.demo@putzmeister.com');
  await p.click('#loginBtn');
  await p.waitForURL('**/dashboard.html', { timeout: 15000 });
  await p.goto('http://localhost:3100/app/abteilungs-planer.html');
  await p.waitForSelector('#ptBoard .pt-name', { timeout: 20000 });

  // Echte A4-Landscape-Inhaltsbreite: 297mm - 2*12mm = 273mm ~ 1032px.
  // Bei 1600px ist der Bug unsichtbar - diese Breite IST der Regressionstest.
  await p.emulateMedia({ media: 'print' });
  await p.setViewportSize({ width: 1032, height: 760 });

  let fail = 0;
  for (const t of THEMES) {
    await p.evaluate(th => document.documentElement.setAttribute('data-theme', th), t);
    await p.waitForTimeout(250);
    const r = await p.evaluate(() => {
      const panel = document.getElementById('ptPanel');
      const mw = document.querySelector('.main-wrapper');
      const board = document.getElementById('ptBoard').getBoundingClientRect();
      // Deckt irgendein fixed/absolutes Element die Tafel ab?
      const cover = [...document.querySelectorAll('body *')].filter(el => {
        const c = getComputedStyle(el);
        if (c.display === 'none' || c.visibility === 'hidden' || c.opacity === '0') return false;
        if (c.position !== 'fixed' && c.position !== 'absolute') return false;
        const r = el.getBoundingClientRect();
        if (r.width < 100 || r.height < 100) return false;
        return r.left < board.right && r.right > board.left;
      }).map(el => el.id || el.className);
      return {
        panelDisplay: getComputedStyle(panel).display,
        marginLeft: getComputedStyle(mw).marginLeft,
        boardX: Math.round(board.x),
        cover,
      };
    });
    const ok = r.panelDisplay === 'none' && r.marginLeft === '0px' && r.cover.length === 0;
    if (!ok) fail++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${t.padEnd(11)} panel=${r.panelDisplay} ml=${r.marginLeft} boardX=${r.boardX} cover=${JSON.stringify(r.cover)}`);
  }
  await p.screenshot({ path: 'C:/Users/KunissF/AppData/Local/Temp/claude/c--Dev-Digitales-Berichtsheft/9888acdc-06de-462e-96da-dd35a6cb3e9b/scratchpad/print-after.png' });
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
```

- [ ] **Step 3: Skript laufen lassen, Fehlschlag bestätigen**

Run: `node <scratchpad>/print-check.js`
Expected: FAIL für alle Themes, mit `panel=flex`, `ml=252px` und `ptPanel` in
`cover`. Exit-Code 1.

- [ ] **Step 4: `[hidden]` am Panel wirksam machen**

In `app/css/planer-board.css` direkt **unter** Zeile 110 (`.pt-panel { … }`)
einfügen:

```css
/* [hidden] muss am Panel wirken: die Klassenregel oben setzt display:flex und
   schlaegt [hidden]{display:none} in der Spezifitaet. Am Bildschirm faellt das
   nicht auf (das Panel ist im Flow nur ein 2px-Splitter), im Druck-Layout wird
   daraus ein dokumenthoher weisser Block ueber der Tafel. */
.pt-panel[hidden] { display:none; }
```

- [ ] **Step 5: Druck-Block reparieren**

`app/css/planer-board.css`, den `@media print`-Block (Zeile 156-165) ersetzen:

```css
/* ── Druck ── */
@media print {
  .sidebar, .sidebar-overlay, .topbar, .pt-toolbar, .pt-panel__close,
  .pt-panel__foot, .pt-legend, .pt-grip { display:none !important; }

  /* Das Detail-Panel gehoert nie aufs Papier. Ohne position:static wuerde es
     unter @media (max-width:1100px) als fixed ueber der Tafel liegen — die
     Druck-Inhaltsbreite von A4-Landscape (~1032px) loest diesen Breakpoint aus. */
  .pt-panel { display:none !important; position:static !important; }

  /* Linker Rand auf 0. Achtung: .main-wrapper{margin-left:0!important} allein
     verliert gegen glass.css:1339 — gleiche Spezifitaet (0,1,0), beide
     !important, und glass.css laedt spaeter (abteilungs-planer.html:20 vs 19).
     Bei !important-Gleichstand entscheidet die Ladereihenfolge, deshalb hier
     hoehere Spezifitaet (0,2,0) statt eines lauteren !important. */
  .app-shell .main-wrapper { margin-left:0 !important; margin-right:0 !important; }
  body { background:none !important; }

  .pt-scroll { max-height:none !important; overflow:visible !important; }
  .pt-wrap { box-shadow:none !important; border-color:#ccc !important; }
  .pt-layout.pt-has-panel { grid-template-columns:1fr; }
  .pt-bar { box-shadow:none !important; print-color-adjust:exact; -webkit-print-color-adjust:exact; }
  @page { size:landscape; margin:12mm; }
}
```

- [ ] **Step 6: Gegenprobe laufen lassen**

Run: `node <scratchpad>/print-check.js`
Expected: `OK` für alle sechs Themes (`panel=none`, `ml=0px`, `cover=[]`),
Exit-Code 0. Zusätzlich `print-after.png` ansehen: die Tafel beginnt links am
Blattrand, kein weißer Kasten.

- [ ] **Step 7: Commit**

```bash
git add app/css/planer-board.css
git commit -m "fix(planer): weisser Kasten und linker Rand im Druck

.pt-panel sprang bei A4-Landscape-Inhaltsbreite (~1032px) in den
1100px-Breakpoint und lag als fixed, dokumenthoher weisser Block ueber der
Tafel; [hidden] wirkte dort nicht, weil .pt-panel{display:flex} die
Attribut-Regel in der Spezifitaet schlaegt.

Der 252px-Gutter blieb, weil die Druck-Regel gegen glass.css:1339 verliert
(gleiche Spezifitaet, spaeter geladen). Fix ueber hoehere Spezifitaet statt
lauteres !important."
```

---

### Task 2: Modul-Grundgerüst + Zeitraster

Erste Hälfte des reinen Kerns: aus einem Zeitraum die Spalten des Druckrasters
berechnen. Die Einheit ergibt sich automatisch aus der Länge — im Dialog gibt es
bewusst keinen Zoom-Regler.

**Files:**
- Create: `app/js/planer-print.js`
- Test: `app/js/planer-print.test.js`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `esc(s) -> string` — HTML-Escaping (`& < > " '`)
  - `fmtDe(iso) -> string` — `'2026-08-06'` → `'06.08.2026'`, `''` bei falsy
  - `tageZwischen(vonISO, bisISO) -> number` — inklusive beider Enden
  - `buildRaster(vonISO, bisISO) -> { einheit, tage, spalten }`
    mit `einheit: 'woche'|'monat'|'quartal'` und
    `spalten: [{ label, leftPct, widthPct }]`

- [ ] **Step 1: Failing test schreiben**

`app/js/planer-print.test.js`:

```js
'use strict';
/* Reine Logik des Druck-Moduls: Zeitraster, Balkengeometrie und die
   HTML-Builder. Kein Browser, kein Server — nur node:test. */
const test = require('node:test');
const assert = require('node:assert/strict');
const PP = require('./planer-print.js');

test('esc entschaerft HTML-Sonderzeichen', () => {
  assert.equal(PP.esc('<b>A & "B"</b>'), '&lt;b&gt;A &amp; &quot;B&quot;&lt;/b&gt;');
  assert.equal(PP.esc(null), '');
});

test('fmtDe dreht ISO auf deutsches Datum', () => {
  assert.equal(PP.fmtDe('2026-08-06'), '06.08.2026');
  assert.equal(PP.fmtDe(''), '');
  assert.equal(PP.fmtDe(null), '');
});

test('tageZwischen zaehlt beide Enden mit', () => {
  assert.equal(PP.tageZwischen('2026-08-06', '2026-08-06'), 1);
  assert.equal(PP.tageZwischen('2026-08-01', '2026-08-31'), 31);
  // Ueber die Sommerzeit-Umstellung (29.03.2026) darf nichts kippen.
  assert.equal(PP.tageZwischen('2026-03-01', '2026-03-31'), 31);
});

test('buildRaster: bis 3 Monate in Kalenderwochen', () => {
  const r = PP.buildRaster('2026-01-05', '2026-02-01');   // 4 KW
  assert.equal(r.einheit, 'woche');
  assert.equal(r.spalten.length, 4);
  assert.equal(r.spalten[0].label, 'KW 2');
  assert.equal(r.tage, 28);
});

test('buildRaster: bis 18 Monate in Monaten', () => {
  const r = PP.buildRaster('2025-09-01', '2026-08-31');   // ein Ausbildungsjahr
  assert.equal(r.einheit, 'monat');
  assert.equal(r.spalten.length, 12);
  assert.equal(r.spalten[0].label, 'Sep 25');
  assert.equal(r.spalten[11].label, 'Aug 26');
  assert.equal(r.tage, 365);
});

test('buildRaster: darueber in Quartalen', () => {
  const r = PP.buildRaster('2025-09-01', '2028-08-31');   // ganze Ausbildung
  assert.equal(r.einheit, 'quartal');
  // Q3/25 (angeschnitten, beginnt am 01.09.) bis Q3/28 = 13 Spalten:
  // 2025: Q3,Q4 · 2026: 4 · 2027: 4 · 2028: Q1,Q2,Q3
  assert.equal(r.spalten.length, 13);
  assert.equal(r.spalten[0].label, 'Q3 25');
  assert.equal(r.spalten[1].label, 'Q4 25');
  assert.equal(r.spalten[12].label, 'Q3 28');
  // Erste Spalte ist auf den Zeitraumbeginn geklemmt, nicht auf den 01.07.
  assert.equal(r.spalten[0].leftPct, 0);
});

test('buildRaster: Spalten decken den Zeitraum luecken- und ueberlappungsfrei ab', () => {
  for (const [von, bis] of [['2026-01-05', '2026-02-01'], ['2025-09-01', '2026-08-31'], ['2025-09-01', '2028-08-31']]) {
    const r = PP.buildRaster(von, bis);
    const summe = r.spalten.reduce((s, c) => s + c.widthPct, 0);
    assert.ok(Math.abs(summe - 100) < 0.001, `Summe ${summe} fuer ${von}..${bis}`);
    assert.equal(r.spalten[0].leftPct, 0);
    for (let i = 1; i < r.spalten.length; i++) {
      const prev = r.spalten[i - 1];
      assert.ok(Math.abs(prev.leftPct + prev.widthPct - r.spalten[i].leftPct) < 0.001, `Luecke bei ${i}`);
    }
  }
});

test('buildRaster: umgedrehter Zeitraum liefert leeres Raster', () => {
  const r = PP.buildRaster('2026-08-31', '2026-01-01');
  assert.equal(r.tage, 0);
  assert.deepEqual(r.spalten, []);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node --test app/js/planer-print.test.js`
Expected: FAIL — `Cannot find module './planer-print.js'`

- [ ] **Step 3: Modul mit Raster implementieren**

`app/js/planer-print.js`:

```js
'use strict';
/* ===================================================================
   PLANER-PRINT.JS — Druckausgabe des Abteilungsdurchlaufs

   Baut vollstaendige HTML-Dokumente fuer ein EIGENES Druckfenster.
   Bewusst ohne App-Globals (escapeHtml/DateUtil/displayName): das
   Druckfenster hat sie nicht, und die Builder sollen in Node testbar
   bleiben. Deshalb lokale esc()/fmtDe().

   Warum eigenes Fenster statt @media print auf der Live-Seite: die SPA-Seite
   traegt Theme-Hintergruende, eine fixed Sidebar und Responsive-Breakpoints,
   die bei Druckbreite (~1032px bei A4-Landscape) anders greifen als am
   Bildschirm. Genau daran ist der alte Tafel-Druck gescheitert.

   Browser: window.PlanerPrint · Node/Tests: module.exports
   =================================================================== */
const PlanerPrint = (() => {
  const MS_TAG = 86400000;

  /* Datumsrechnung strikt in UTC — lokale Zeitzonen kippen an der
     Sommerzeit-Umstellung um einen Tag. */
  function d(iso) { return new Date(iso + 'T00:00:00Z'); }
  function isoOf(date) { return date.toISOString().slice(0, 10); }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtDe(iso) {
    if (!iso) return '';
    const [y, m, day] = String(iso).slice(0, 10).split('-');
    return `${day}.${m}.${y}`;
  }

  function tageZwischen(vonISO, bisISO) {
    const n = Math.round((d(bisISO) - d(vonISO)) / MS_TAG) + 1;
    return n > 0 ? n : 0;
  }

  /* ISO-Kalenderwoche (Do-Regel), gleiche Logik wie DateUtil.getKW —
     hier UTC-basiert und ohne Abhaengigkeit auf api.js. */
  function kwOf(date) {
    const t = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dow = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dow);
    const jahresStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil((((t - jahresStart) / MS_TAG) + 1) / 7);
  }

  const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

  /* Spaltenraster: <=3 Monate -> Kalenderwochen, <=18 -> Monate, sonst
     Quartale. Automatisch, damit der Dialog keinen Zoom-Regler braucht.
     leftPct/widthPct sind Prozent des Gesamtzeitraums — die Balken nutzen
     dieselbe Skala, dadurch passt der Tabellenkopf ohne Pixelrechnung. */
  function buildRaster(vonISO, bisISO) {
    const tage = tageZwischen(vonISO, bisISO);
    if (!tage) return { einheit: 'monat', tage: 0, spalten: [] };

    const start = d(vonISO), ende = d(bisISO);
    const monate = (ende.getUTCFullYear() - start.getUTCFullYear()) * 12
                 + (ende.getUTCMonth() - start.getUTCMonth()) + 1;
    const einheit = monate <= 3 ? 'woche' : (monate <= 18 ? 'monat' : 'quartal');

    // Grenzen der Spalten sammeln (jeweils Beginn der Einheit, auf den
    // Zeitraum geklemmt), dann in Prozent umrechnen.
    const grenzen = [];
    let cur;
    if (einheit === 'woche') {
      cur = new Date(start);
      cur.setUTCDate(cur.getUTCDate() - ((cur.getUTCDay() || 7) - 1));   // Montag
    } else if (einheit === 'monat') {
      cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    } else {
      cur = new Date(Date.UTC(start.getUTCFullYear(), Math.floor(start.getUTCMonth() / 3) * 3, 1));
    }
    while (cur <= ende) {
      grenzen.push(new Date(cur));
      if (einheit === 'woche') cur.setUTCDate(cur.getUTCDate() + 7);
      else cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + (einheit === 'monat' ? 1 : 3), 1));
    }

    const spalten = grenzen.map((g, i) => {
      const von = g < start ? start : g;
      const naechste = grenzen[i + 1];
      const bis = new Date((naechste && naechste <= ende ? naechste : new Date(ende.getTime() + MS_TAG)).getTime() - MS_TAG);
      const offset = Math.round((von - start) / MS_TAG);
      const laenge = Math.round((bis - von) / MS_TAG) + 1;
      const jj = String(g.getUTCFullYear()).slice(2);
      const label = einheit === 'woche' ? `KW ${kwOf(g)}`
        : einheit === 'monat' ? `${MONATE[g.getUTCMonth()]} ${jj}`
        : `Q${Math.floor(g.getUTCMonth() / 3) + 1} ${jj}`;
      return { label, leftPct: offset / tage * 100, widthPct: laenge / tage * 100 };
    });

    return { einheit, tage, spalten };
  }

  const api = { esc, fmtDe, tageZwischen, buildRaster };
  if (typeof window !== 'undefined') window.PlanerPrint = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
```

- [ ] **Step 4: Test laufen lassen**

Run: `node --test app/js/planer-print.test.js`
Expected: PASS, 7 Tests.

- [ ] **Step 5: Commit**

```bash
git add app/js/planer-print.js app/js/planer-print.test.js
git commit -m "feat(planer): Druck-Modul mit automatischem Zeitraster

Raster waehlt Kalenderwochen (<=3 Monate), Monate (<=18) oder Quartale
selbst — der Druckdialog braucht damit keinen Zoom-Regler. Datumsrechnung
in UTC, damit die Sommerzeit-Umstellung keine Spalte verschiebt."
```

---

### Task 3: Balkengeometrie mit Randmarkern

Zweite Hälfte des Kerns: eine Station auf den Druckzeitraum abbilden. Laut Spec
werden Randstationen **gezeigt, aber nicht im Datum gekürzt** — der Balken wird
am Blattrand abgeschnitten und mit `‹`/`›` markiert.

**Files:**
- Modify: `app/js/planer-print.js`
- Modify: `app/js/planer-print.test.js`

**Interfaces:**
- Consumes: `tageZwischen` (Task 2)
- Produces:
  - `barGeom(station, range) -> null | { leftPct, widthPct, cutLeft, cutRight, open }`
    - `station = { von, bis }` — ISO-Strings, `bis` darf `null`/`''` sein (offen)
    - `range = { von, bis }` — ISO-Strings
    - `null`, wenn die Station den Zeitraum nicht berührt

- [ ] **Step 1: Failing test schreiben**

An `app/js/planer-print.test.js` anhängen:

```js
const R = { von: '2026-01-01', bis: '2026-12-31' };   // 365 Tage

test('barGeom: Station komplett innerhalb', () => {
  const g = PP.barGeom({ von: '2026-01-01', bis: '2026-01-31' }, R);
  assert.equal(g.leftPct, 0);
  assert.ok(Math.abs(g.widthPct - 31 / 365 * 100) < 0.001);
  assert.equal(g.cutLeft, false);
  assert.equal(g.cutRight, false);
  assert.equal(g.open, false);
});

test('barGeom: Station ragt links heraus -> cutLeft, links auf 0', () => {
  const g = PP.barGeom({ von: '2025-11-15', bis: '2026-01-31' }, R);
  assert.equal(g.leftPct, 0);
  assert.equal(g.cutLeft, true);
  assert.equal(g.cutRight, false);
  assert.ok(Math.abs(g.widthPct - 31 / 365 * 100) < 0.001);
});

test('barGeom: Station ragt rechts heraus -> cutRight, endet am Rand', () => {
  const g = PP.barGeom({ von: '2026-12-01', bis: '2027-03-31' }, R);
  assert.equal(g.cutRight, true);
  assert.equal(g.cutLeft, false);
  assert.ok(Math.abs(g.leftPct + g.widthPct - 100) < 0.001);
});

test('barGeom: Station umspannt den Zeitraum beidseitig', () => {
  const g = PP.barGeom({ von: '2025-01-01', bis: '2027-12-31' }, R);
  assert.equal(g.leftPct, 0);
  assert.ok(Math.abs(g.widthPct - 100) < 0.001);
  assert.equal(g.cutLeft, true);
  assert.equal(g.cutRight, true);
});

test('barGeom: offenes Bis laeuft bis Zeitraumende und gilt als cutRight', () => {
  const g = PP.barGeom({ von: '2026-06-01', bis: null }, R);
  assert.equal(g.open, true);
  assert.equal(g.cutRight, true);
  assert.ok(Math.abs(g.leftPct + g.widthPct - 100) < 0.001);
});

test('barGeom: Station komplett ausserhalb -> null', () => {
  assert.equal(PP.barGeom({ von: '2024-01-01', bis: '2024-06-30' }, R), null);
  assert.equal(PP.barGeom({ von: '2028-01-01', bis: '2028-06-30' }, R), null);
});

test('barGeom: Station beruehrt den Zeitraum mit genau einem Tag', () => {
  const g = PP.barGeom({ von: '2025-06-01', bis: '2026-01-01' }, R);
  assert.ok(g);
  assert.ok(Math.abs(g.widthPct - 1 / 365 * 100) < 0.001);
  assert.equal(g.cutLeft, true);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node --test app/js/planer-print.test.js`
Expected: FAIL — `PP.barGeom is not a function`

- [ ] **Step 3: `barGeom` implementieren**

In `app/js/planer-print.js` vor dem `const api = …` einfügen:

```js
  /* Station auf den Druckzeitraum abbilden. Randstationen werden GEZEIGT und
     am Blattrand abgeschnitten (cutLeft/cutRight -> Marker im HTML); das
     angezeigte Datum bleibt trotzdem das echte, ungekuerzte. Leeres Bis =
     offen und laeuft bis zum Zeitraumende. */
  function barGeom(station, range) {
    const OFFEN = '9999-12-31';
    const sVon = String(station.von).slice(0, 10);
    const sBis = station.bis ? String(station.bis).slice(0, 10) : OFFEN;
    if (sBis < range.von || sVon > range.bis) return null;

    const start = sVon < range.von ? range.von : sVon;
    const ende  = sBis > range.bis ? range.bis : sBis;
    const tage  = tageZwischen(range.von, range.bis);
    const offset = tageZwischen(range.von, start) - 1;
    const laenge = tageZwischen(start, ende);

    return {
      leftPct: offset / tage * 100,
      widthPct: laenge / tage * 100,
      cutLeft: sVon < range.von,
      cutRight: sBis > range.bis,
      open: !station.bis,
    };
  }
```

Und `barGeom` in `const api = { … }` aufnehmen.

- [ ] **Step 4: Test laufen lassen**

Run: `node --test app/js/planer-print.test.js`
Expected: PASS, 14 Tests.

- [ ] **Step 5: Commit**

```bash
git add app/js/planer-print.js app/js/planer-print.test.js
git commit -m "feat(planer): Balkengeometrie fuer den Druck mit Randmarkern

Stationen, die den Zeitraum nur beruehren, werden gezeigt und am Blattrand
abgeschnitten; das Datum bleibt ungekuerzt, damit das Papier ueber
Zeitraeume nicht luegt. Offenes Bis laeuft bis Zeitraumende."
```

---

### Task 4: Druckdokument — Tafel (Querformat)

**Files:**
- Modify: `app/js/planer-print.js`
- Modify: `app/js/planer-print.test.js`

**Interfaces:**
- Consumes: `esc`, `fmtDe`, `buildRaster`, `barGeom`
- Produces:
  - `PRINT_CSS -> string` — gemeinsames Stylesheet für alle Druckdokumente
  - `renderTafelHtml(sel) -> string` — vollständiges HTML-Dokument
  - Form von `sel` (gilt auch für Task 5):

```js
sel = {
  von: '2025-09-01',            // ISO
  bis: '2026-08-31',            // ISO
  stand: '2026-08-06',          // ISO, Druckdatum
  personen: [{
    name: 'Lena Müller',        // fertiger Anzeigename ("Vorname Nachname")
    beruf: 'Industriekauffrau',
    gruppe: 'Zugewiesen',
    stationen: [{ abteilung: 'Montage', von: '2025-09-01', bis: '2025-10-31',
                  verantw: 'Marco Rossi', farbe: '#4CAF50' }],
  }],
}
```

- [ ] **Step 1: Failing test schreiben**

An `app/js/planer-print.test.js` anhängen:

```js
const SEL = {
  von: '2025-09-01', bis: '2026-08-31', stand: '2026-08-06',
  personen: [
    { name: 'Lena Müller', beruf: 'Industriekauffrau', gruppe: 'Zugewiesen', stationen: [
      { abteilung: 'Montage', von: '2025-09-01', bis: '2025-10-31', verantw: 'Marco Rossi', farbe: '#4CAF50' },
      { abteilung: 'IT', von: '2026-06-01', bis: '2026-11-30', verantw: 'M. Lengerer', farbe: '#2196F3' },
    ] },
    { name: 'Kevin <Test>', beruf: 'Mechatroniker', gruppe: 'Ohne Zuordnung', stationen: [] },
  ],
};

test('renderTafelHtml: vollstaendiges Dokument im Querformat', () => {
  const h = PP.renderTafelHtml(SEL);
  assert.match(h, /^<!DOCTYPE html>/);
  assert.match(h, /<html lang="de">/);
  assert.match(h, /size:A4 landscape/);
  assert.match(h, /<\/html>\s*$/);
});

test('renderTafelHtml: Kopf nennt Zeitraum, Anzahl und Stand', () => {
  const h = PP.renderTafelHtml(SEL);
  assert.match(h, /Abteilungsdurchlauf/);
  assert.match(h, /01\.09\.2025/);
  assert.match(h, /31\.08\.2026/);
  assert.match(h, /2 Personen/);
  assert.match(h, /Stand 06\.08\.2026/);
});

test('renderTafelHtml: thead traegt die Rasterspalten (fuer Kopfwiederholung)', () => {
  const h = PP.renderTafelHtml(SEL);
  assert.match(h, /<thead>/);
  assert.match(h, /Sep 25/);
  assert.match(h, /Aug 26/);
  // table-layout:fixed ist Pflicht, sonst ignoriert der Browser die Spaltenbreiten
  assert.match(h, /table-layout:fixed/);
});

test('renderTafelHtml: Balken tragen Farbe, Breite und exaktes Datum', () => {
  const h = PP.renderTafelHtml(SEL);
  assert.match(h, /background:#4CAF50/);
  assert.match(h, /Montage/);
  // IT laeuft bis 30.11.2026, also ueber das Zeitraumende hinaus:
  // Marker gesetzt, Datum ungekuerzt.
  assert.match(h, /30\.11\.2026/);
  assert.match(h, /pp-bar--cut-r/);
});

test('renderTafelHtml: Person ohne Station bekommt Hinweis statt zu fehlen', () => {
  const h = PP.renderTafelHtml(SEL);
  assert.match(h, /keine Zuweisung im Zeitraum/);
});

test('renderTafelHtml: Legende listet nur die gedruckten Abteilungen', () => {
  // Eine Station liegt komplett vor dem Zeitraum — sie darf weder als Balken
  // noch in der Legende auftauchen.
  const sel = { ...SEL, personen: [{ name: 'A', beruf: 'B', gruppe: 'Zugewiesen', stationen: [
    { abteilung: 'Montage',   von: '2025-09-01', bis: '2025-10-31', verantw: 'X', farbe: '#4CAF50' },
    { abteilung: 'Altlager',  von: '2020-01-01', bis: '2020-06-30', verantw: 'X', farbe: '#999999' },
  ] }] };
  const h = PP.renderTafelHtml(sel);
  // lastIndexOf, nicht indexOf: "pp-legend" steht auch im PRINT_CSS, und ein
  // Slice ab dem CSS-Vorkommen wuerde die ganze Tabelle einschliessen —
  // die Negativpruefung koennte dann nie fehlschlagen.
  const legende = h.slice(h.lastIndexOf('<div class="pp-legend">'));
  assert.match(legende, /Montage/);
  assert.doesNotMatch(legende, /Altlager/);
  assert.doesNotMatch(h, /background:#999999/);
});

test('renderTafelHtml: Fremdeingaben werden escaped', () => {
  const h = PP.renderTafelHtml(SEL);
  assert.match(h, /Kevin &lt;Test&gt;/);
  assert.doesNotMatch(h, /Kevin <Test>/);
});

test('renderTafelHtml: print-color-adjust gesetzt, sonst schluckt der Browser die Farben', () => {
  assert.match(PP.renderTafelHtml(SEL), /print-color-adjust:exact/);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node --test app/js/planer-print.test.js`
Expected: FAIL — `PP.renderTafelHtml is not a function`

- [ ] **Step 3: `PRINT_CSS` und `renderTafelHtml` implementieren**

In `app/js/planer-print.js` vor `const api = …` einfügen:

```js
  /* Gemeinsames Stylesheet aller Druckdokumente. Bewusst eigenstaendig und
     ohne CSS-Variablen der App — das Druckfenster laedt kein App-CSS. */
  const PRINT_CSS = `
    *{box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1a1a;margin:0;padding:0}
    h1{font-size:17px;margin:0 0 3px}
    .sub{color:#666;margin:0 0 14px;font-size:11px}
    table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px}
    th,td{text-align:left;padding:5px 7px;border-bottom:1px solid #ddd;vertical-align:middle}
    th{font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#888;border-bottom:1px solid #bbb}
    th+th,td+td{border-left:1px solid #eee}
    .pp-nm{font-weight:700}
    .pp-br{color:#888;font-size:9px}
    .pp-track{position:relative;height:20px;padding:0}
    .pp-bar{position:absolute;top:2px;height:16px;border-radius:3px;color:#fff;font-size:9px;
      line-height:16px;padding:0 5px;overflow:hidden;white-space:nowrap;
      print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .pp-bar--cut-l{border-top-left-radius:0;border-bottom-left-radius:0}
    .pp-bar--cut-r{border-top-right-radius:0;border-bottom-right-radius:0}
    .pp-none{color:#aaa;font-style:italic;font-size:9px}
    .pp-legend{margin-top:12px;font-size:9px;color:#555;display:flex;flex-wrap:wrap;gap:10px}
    .pp-legend span.sw{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;
      print-color-adjust:exact;-webkit-print-color-adjust:exact}
    .pp-sec{margin:0 0 18px;break-inside:avoid;page-break-inside:avoid}
    .pp-sec h2{font-size:13px;margin:0 0 2px}
  `;

  function kopfHtml(sel, titelZusatz) {
    const n = sel.personen.length;
    return `<h1>Abteilungsdurchlauf${titelZusatz ? ` – ${esc(titelZusatz)}` : ''}</h1>
      <p class="sub">${fmtDe(sel.von)} – ${fmtDe(sel.bis)} · ${n} ${n === 1 ? 'Person' : 'Personen'} · Stand ${fmtDe(sel.stand)}</p>`;
  }

  function dokument(titel, css, body, seite) {
    return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">`
      + `<title>${esc(titel)}</title><style>${css}\n@page{${seite}}</style></head>`
      + `<body>${body}</body></html>`;
  }

  /* Tafel = echte <table> mit <thead>: Browser wiederholen einen Tabellenkopf
     auf jeder Folgeseite von selbst, ein nachgebauter Grid-Kopf tut das nicht.
     Die Balken liegen absolut in EINER Zelle, die per colspan genau die
     Rasterspalten ueberdeckt — dadurch stimmt die Ausrichtung ohne
     Pixelrechnung. table-layout:fixed ist dafuer Pflicht. */
  function renderTafelHtml(sel) {
    const range = { von: sel.von, bis: sel.bis };
    const raster = buildRaster(sel.von, sel.bis);
    const NAME_PCT = 22;
    const restPct = 100 - NAME_PCT;

    const cols = `<colgroup><col style="width:${NAME_PCT}%">`
      + raster.spalten.map(c => `<col style="width:${(c.widthPct * restPct / 100).toFixed(4)}%">`).join('')
      + `</colgroup>`;

    const kopf = `<thead><tr><th>Person</th>`
      + raster.spalten.map(c => `<th>${esc(c.label)}</th>`).join('')
      + `</tr></thead>`;

    // Senkrechte Rasterlinien in der Balkenzelle nachziehen (die colspan-Zelle
    // hat keine eigenen Spaltengrenzen mehr).
    const linien = raster.spalten.slice(1)
      .map(c => `<div style="position:absolute;top:0;bottom:0;left:${c.leftPct.toFixed(4)}%;width:1px;background:#eee"></div>`)
      .join('');

    const zeilen = sel.personen.map(p => {
      const balken = (p.stationen || []).map(s => {
        const g = barGeom(s, range);
        if (!g) return '';
        const cls = 'pp-bar'
          + (g.cutLeft ? ' pp-bar--cut-l' : '')
          + (g.cutRight ? ' pp-bar--cut-r' : '');
        const bisTxt = s.bis ? fmtDe(s.bis) : 'offen';
        const marker = (g.cutLeft ? '‹ ' : '') + esc(s.abteilung || '') + (g.cutRight ? ' ›' : '');
        return `<div class="${cls}" style="left:${g.leftPct.toFixed(4)}%;width:${g.widthPct.toFixed(4)}%;background:${esc(s.farbe)}"`
          + ` title="${esc(s.abteilung || '')} (${fmtDe(s.von)} – ${bisTxt})">${marker}</div>`;
      }).join('');

      const leer = balken ? '' : `<div class="pp-none">keine Zuweisung im Zeitraum</div>`;
      return `<tr>
        <td><div class="pp-nm">${esc(p.name)}</div><div class="pp-br">${esc(p.beruf || '')}</div></td>
        <td class="pp-track" colspan="${raster.spalten.length}">${linien}${balken}${leer}</td>
      </tr>`;
    }).join('');

    // Legende nur mit den Abteilungen, die tatsaechlich aufs Papier kommen.
    const gedruckt = new Map();
    sel.personen.forEach(p => (p.stationen || []).forEach(s => {
      if (barGeom(s, range) && !gedruckt.has(s.abteilung)) gedruckt.set(s.abteilung, s.farbe);
    }));
    const legende = `<div class="pp-legend">`
      + [...gedruckt].sort((a, b) => a[0].localeCompare(b[0], 'de'))
          .map(([ab, farbe]) => `<b><span class="sw" style="background:${esc(farbe)}"></span>${esc(ab)}</b>`).join('')
      + `</div>`;

    const body = kopfHtml(sel, '')
      + `<table>${cols}${kopf}<tbody>${zeilen}</tbody></table>${legende}`;
    return dokument('Abteilungsdurchlauf', PRINT_CSS, body, 'size:A4 landscape;margin:12mm');
  }
```

`PRINT_CSS` und `renderTafelHtml` in `const api = { … }` aufnehmen.

- [ ] **Step 4: Test laufen lassen**

Run: `node --test app/js/planer-print.test.js`
Expected: PASS, 22 Tests.

- [ ] **Step 5: Commit**

```bash
git add app/js/planer-print.js app/js/planer-print.test.js
git commit -m "feat(planer): Tafel-Druckdokument im Querformat

Echte <table> mit <thead>, damit Browser den Kopf auf Folgeseiten
wiederholen; Balken absolut in einer colspan-Zelle auf derselben
Prozentskala wie das Raster. Legende nur mit gedruckten Abteilungen."
```

---

### Task 5: Druckdokument — Tabelle (Hochformat)

**Files:**
- Modify: `app/js/planer-print.js`
- Modify: `app/js/planer-print.test.js`

**Interfaces:**
- Consumes: `esc`, `fmtDe`, `barGeom`, `PRINT_CSS`, `kopfHtml`, `dokument` (Task 4)
- Produces: `renderTabelleHtml(sel) -> string` — gleiche `sel`-Form wie Task 4

- [ ] **Step 1: Failing test schreiben**

An `app/js/planer-print.test.js` anhängen (nutzt `SEL` aus Task 4):

```js
test('renderTabelleHtml: Dokument im Hochformat', () => {
  const h = PP.renderTabelleHtml(SEL);
  assert.match(h, /^<!DOCTYPE html>/);
  assert.match(h, /size:A4 portrait/);
  assert.match(h, /<\/html>\s*$/);
});

test('renderTabelleHtml: je Person ein umbruchsicherer Abschnitt', () => {
  const h = PP.renderTabelleHtml(SEL);
  assert.equal((h.match(/class="pp-sec"/g) || []).length, 2);
  assert.match(h, /break-inside:avoid/);
  assert.match(h, /Lena Müller/);
  assert.match(h, /Industriekauffrau/);
});

test('renderTabelleHtml: Spalten Abteilung / Zeitraum / Verantwortlich', () => {
  const h = PP.renderTabelleHtml(SEL);
  assert.match(h, /<th>Abteilung<\/th>/);
  assert.match(h, /<th>Zeitraum<\/th>/);
  assert.match(h, /<th>Verantwortlich<\/th>/);
  assert.match(h, /Marco Rossi/);
});

test('renderTabelleHtml: Randstation mit echtem, ungekuerztem Enddatum', () => {
  const h = PP.renderTabelleHtml(SEL);
  assert.match(h, /01\.06\.2026 – 30\.11\.2026/);
});

test('renderTabelleHtml: Person ohne Station bekommt Hinweiszeile', () => {
  const h = PP.renderTabelleHtml(SEL);
  assert.match(h, /keine Zuweisung im Zeitraum/);
});

test('renderTabelleHtml: offenes Bis wird als "offen" gedruckt', () => {
  const sel = { ...SEL, personen: [{ name: 'A', beruf: 'B', gruppe: 'Zugewiesen',
    stationen: [{ abteilung: 'IT', von: '2026-01-01', bis: null, verantw: 'X', farbe: '#333' }] }] };
  assert.match(PP.renderTabelleHtml(sel), /01\.01\.2026 – offen/);
});

test('renderTabelleHtml: Stationen ausserhalb des Zeitraums fehlen', () => {
  const sel = { ...SEL, personen: [{ name: 'A', beruf: 'B', gruppe: 'Zugewiesen',
    stationen: [{ abteilung: 'Altstation', von: '2020-01-01', bis: '2020-06-30', verantw: 'X', farbe: '#333' }] }] };
  const h = PP.renderTabelleHtml(sel);
  assert.doesNotMatch(h, /Altstation/);
  assert.match(h, /keine Zuweisung im Zeitraum/);
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node --test app/js/planer-print.test.js`
Expected: FAIL — `PP.renderTabelleHtml is not a function`

- [ ] **Step 3: `renderTabelleHtml` implementieren**

In `app/js/planer-print.js` vor `const api = …` einfügen:

```js
  /* Tabelle = je Person ein Abschnitt. break-inside:avoid haelt Name und
     Stationen zusammen, damit kein Azubi mitten im Block umbricht.
     Gefiltert wird mit barGeom (gleiche Zeitraumlogik wie die Tafel), das
     angezeigte Datum bleibt das echte. */
  function renderTabelleHtml(sel) {
    const range = { von: sel.von, bis: sel.bis };
    const abschnitte = sel.personen.map(p => {
      const drin = (p.stationen || []).filter(s => barGeom(s, range));
      const zeilen = drin.length
        ? drin.map(s => `<tr>
            <td>${esc(s.abteilung || '–')}</td>
            <td>${fmtDe(s.von)} – ${s.bis ? fmtDe(s.bis) : 'offen'}</td>
            <td>${esc(s.verantw || '–')}</td>
          </tr>`).join('')
        : `<tr><td colspan="3" class="pp-none">keine Zuweisung im Zeitraum</td></tr>`;
      return `<div class="pp-sec">
        <h2>${esc(p.name)}</h2>
        <p class="sub">${esc(p.beruf || '')}${p.gruppe ? ` · ${esc(p.gruppe)}` : ''}</p>
        <table><thead><tr><th>Abteilung</th><th>Zeitraum</th><th>Verantwortlich</th></tr></thead>
        <tbody>${zeilen}</tbody></table>
      </div>`;
    }).join('');

    return dokument('Abteilungsdurchlauf', PRINT_CSS,
      kopfHtml(sel, '') + abschnitte, 'size:A4 portrait;margin:16mm');
  }
```

`renderTabelleHtml` in `const api = { … }` aufnehmen.

- [ ] **Step 4: Test laufen lassen**

Run: `node --test app/js/planer-print.test.js`
Expected: PASS, 29 Tests.

- [ ] **Step 5: Commit**

```bash
git add app/js/planer-print.js app/js/planer-print.test.js
git commit -m "feat(planer): Tabellen-Druckdokument im Hochformat

Je Person ein umbruchsicherer Abschnitt mit Abteilung/Zeitraum/
Verantwortlich. Zeitraumfilter ueber dieselbe barGeom-Logik wie die Tafel,
Datum bleibt ungekuerzt."
```

---

### Task 6: Druckfenster + Dialog

Die Browser-Schicht: Modal-Markup, Dialog-Logik und das Öffnen des
Druckfensters. Nicht per `node:test` prüfbar — Gegenprobe per Playwright-Skript.

**Files:**
- Modify: `app/abteilungs-planer.html` (Modal-Markup nach `#zuweisungModal`, vor `<script>`-Block ab Zeile 102)
- Modify: `app/abteilungs-planer.html:102-111` (neues `<script src="js/planer-print.js">`)
- Modify: `app/js/planer-print.js` (`openPrintWindow`, `open`)
- Modify: `app/css/planer-board.css` (Dialog-Styles am Ende)

**Interfaces:**
- Consumes: `renderTafelHtml`, `renderTabelleHtml` (Tasks 4-5); `Modal` aus `app/js/app.js:354`; `Toast` aus `app/js/app.js`
- Produces:
  - `openPrintWindow(html) -> boolean` — `false`, wenn das Popup blockiert wurde
  - `open(ctx) -> void` — öffnet Dialog; `ctx` wie folgt:

```js
ctx = {
  personen: [{ id, name, beruf, gruppe, ausbildungsBeginn, ausbildungsEnde,
               stationen: [{ abteilung, von, bis, verantw, farbe }] }],
  von: '2025-09-01',        // Vorbelegung = sichtbares Ausbildungsjahr
  bis: '2026-08-31',
  ajLabel: 'AJ 2025/26',    // Beschriftung des ersten Presets
  stand: '2026-08-06',
}
```

Alle `personen` sind vorbelegt **angehakt** (= aktuelle Toolbar-Filterung).

- [ ] **Step 1: Modal-Markup einfügen**

In `app/abteilungs-planer.html` nach dem schließenden `</div>` von
`#zuweisungModal` (vor `<script src="js/abteilungen-helpers.js">`):

```html
<!-- Druck-Dialog: Azubis, Zeitraum und Darstellung vor dem Drucken waehlen.
     Bewusst ohne <select class="form-control"> — PmSelect wrappt die zu
     full-width .pm-select--block, Breitenangaben am Select wirken dann nicht. -->
<div class="modal-overlay" id="ptPrintModal">
  <div class="modal">
    <div class="modal__header">
      <h3 class="modal__title">Abteilungsdurchlauf drucken</h3>
      <button class="modal__close" data-modal-close aria-label="Schließen">&times;</button>
    </div>
    <div class="modal__body">
      <div class="pp-dlg__row">
        <span class="pp-dlg__lbl">Darstellung</span>
        <div class="pt-seg" id="ppMode">
          <button type="button" data-mode="tafel" class="is-on">Tafel</button>
          <button type="button" data-mode="tabelle">Tabelle</button>
        </div>
      </div>

      <div class="pp-dlg__row">
        <span class="pp-dlg__lbl">Zeitraum</span>
        <div class="pp-dlg__presets" id="ppPresets">
          <button type="button" class="btn btn-outline btn-sm" data-preset="aj">AJ</button>
          <button type="button" class="btn btn-outline btn-sm" data-preset="alles">Ganze Ausbildung</button>
          <button type="button" class="btn btn-outline btn-sm" data-preset="heute">Ab heute</button>
        </div>
      </div>
      <div class="pp-dlg__row">
        <span class="pp-dlg__lbl"></span>
        <div class="pp-dlg__dates">
          <label>Von <input type="date" id="ppVon" class="form-control"></label>
          <label>Bis <input type="date" id="ppBis" class="form-control"></label>
        </div>
      </div>
      <p class="pp-dlg__err" id="ppErr" hidden>„Bis" liegt vor „Von".</p>

      <div class="pp-dlg__row pp-dlg__row--head">
        <span class="pp-dlg__lbl">Azubis <span id="ppCount"></span></span>
        <div>
          <button type="button" class="btn btn-outline btn-sm" id="ppAll">Alle</button>
          <button type="button" class="btn btn-outline btn-sm" id="ppNone">Keine</button>
        </div>
      </div>
      <input type="search" id="ppSearch" class="form-control" placeholder="Person suchen …" aria-label="Person suchen">
      <div class="pp-dlg__list" id="ppList"></div>
    </div>
    <div class="modal__footer">
      <button class="btn btn-outline" data-modal-close>Abbrechen</button>
      <button class="btn btn-primary" id="ppGo">Drucken</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Script einbinden**

In `app/abteilungs-planer.html` **vor** `<script src="js/abteilungs-planer.js"></script>`
(Zeile 111) einfügen:

```html
<script src="js/planer-print.js"></script>
```

- [ ] **Step 3: Dialog-Styles ergänzen**

Am Ende von `app/css/planer-board.css`:

```css
/* ── Druck-Dialog ── */
.pp-dlg__row { display:flex; align-items:center; gap:12px; margin-bottom:10px; }
.pp-dlg__row--head { margin-top:16px; }
.pp-dlg__lbl { flex:0 0 96px; font-size:var(--text-sm); color:var(--pm-grey-600); }
.pp-dlg__presets, .pp-dlg__dates { display:flex; gap:8px; flex-wrap:wrap; }
.pp-dlg__dates label { font-size:var(--text-xs); color:var(--pm-grey-500); display:flex; align-items:center; gap:6px; }
.pp-dlg__dates input { width:150px; }
.pp-dlg__err { color:var(--color-error); font-size:var(--text-xs); margin:0 0 10px 108px; }
.pp-dlg__list { max-height:260px; overflow:auto; border:1px solid var(--pm-grey-200); border-radius:var(--r-md); margin-top:8px; }
.pp-dlg__item { display:flex; align-items:center; gap:9px; padding:7px 11px; border-bottom:1px solid var(--pm-grey-100); font-size:var(--text-sm); }
.pp-dlg__item:last-child { border-bottom:none; }
.pp-dlg__item b { font-weight:600; color:var(--pm-grey-900); }
.pp-dlg__item span { color:var(--pm-grey-500); font-size:var(--text-xs); margin-left:auto; }
```

- [ ] **Step 4: `openPrintWindow` und `open` implementieren**

In `app/js/planer-print.js` vor `const api = …` einfügen:

```js
  /* Eigenes Fenster statt @media print: das Druckdokument bringt sein CSS
     selbst mit und ist damit immun gegen Theme-, Sidebar- und
     Responsive-Regeln der SPA. Rueckgabe false = Popup blockiert. */
  function openPrintWindow(html) {
    const w = window.open('', '_blank', 'width=1000,height=760');
    if (!w) return false;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (_) {} }, 250);
    return true;
  }

  /* Dialog-Zustand auf MODULEBENE, nicht in der open()-Closure.
     Grund: die Handler unten werden nur EINMAL gebunden (das Markup bleibt im
     DOM). Lebte der Zustand in der Closure von open(), wuerden sie beim
     zweiten Oeffnen weiter das ctx des ERSTEN Aufrufs sehen — nach einem
     Filterwechsel wuerde also die alte Personenliste gedruckt. */
  let S = null;   // { ctx, gewaehlt:Set, mode, suche }

  const byId = id => document.getElementById(id);

  function dlgPruefen() {
    const von = byId('ppVon').value, bis = byId('ppBis').value;
    const kaputt = !!(von && bis && von > bis);
    byId('ppErr').hidden = !kaputt;
    byId('ppGo').disabled = kaputt || S.gewaehlt.size === 0;
  }

  function dlgZeichnen() {
    const listEl = byId('ppList'), countEl = byId('ppCount');
    const sichtbar = S.ctx.personen.filter(p => !S.suche
      || `${p.name} ${p.beruf || ''}`.toLowerCase().includes(S.suche));
    listEl.innerHTML = sichtbar.map(p => `
      <label class="pp-dlg__item">
        <input type="checkbox" data-id="${esc(p.id)}" ${S.gewaehlt.has(p.id) ? 'checked' : ''}>
        <b>${esc(p.name)}</b><span>${esc(p.beruf || '')}</span>
      </label>`).join('') || `<div class="pp-dlg__item">Keine Treffer.</div>`;
    listEl.querySelectorAll('input[data-id]').forEach(cb => cb.addEventListener('change', () => {
      if (cb.checked) S.gewaehlt.add(cb.dataset.id); else S.gewaehlt.delete(cb.dataset.id);
      countEl.textContent = `(${S.gewaehlt.size} von ${S.ctx.personen.length})`;
      dlgPruefen();
    }));
    countEl.textContent = `(${S.gewaehlt.size} von ${S.ctx.personen.length})`;
    dlgPruefen();
  }

  function dlgBind() {
    const modal = byId('ptPrintModal');
    if (modal.dataset.ppBound) return;
    modal.dataset.ppBound = '1';

    byId('ppMode').addEventListener('click', e => {
      const b = e.target.closest('button[data-mode]'); if (!b) return;
      S.mode = b.dataset.mode;
      byId('ppMode').querySelectorAll('button').forEach(x => x.classList.toggle('is-on', x === b));
    });
    byId('ppSearch').addEventListener('input', e => { S.suche = e.target.value.toLowerCase(); dlgZeichnen(); });
    byId('ppAll').addEventListener('click', () => { S.ctx.personen.forEach(p => S.gewaehlt.add(p.id)); dlgZeichnen(); });
    byId('ppNone').addEventListener('click', () => { S.gewaehlt.clear(); dlgZeichnen(); });
    byId('ppVon').addEventListener('change', dlgPruefen);
    byId('ppBis').addEventListener('change', dlgPruefen);

    byId('ppPresets').addEventListener('click', e => {
      const b = e.target.closest('button[data-preset]'); if (!b) return;
      const ctx = S.ctx;
      const aktive = ctx.personen.filter(p => S.gewaehlt.has(p.id));
      if (b.dataset.preset === 'aj') { byId('ppVon').value = ctx.von; byId('ppBis').value = ctx.bis; }
      else if (b.dataset.preset === 'heute') {
        byId('ppVon').value = ctx.stand;
        byId('ppBis').value = maxEnde(aktive) || ctx.bis;
      } else {
        // Ganze Ausbildung: Min/Max ueber die gewaehlten Personen. Fehlen die
        // Profildaten, bleibt das aktuelle Ausbildungsjahr stehen.
        byId('ppVon').value = minBeginn(aktive) || ctx.von;
        byId('ppBis').value = maxEnde(aktive) || ctx.bis;
      }
      dlgPruefen();
    });

    byId('ppGo').addEventListener('click', () => {
      const sel = {
        von: byId('ppVon').value, bis: byId('ppBis').value, stand: S.ctx.stand,
        personen: S.ctx.personen.filter(p => S.gewaehlt.has(p.id)),
      };
      const html = S.mode === 'tafel' ? renderTafelHtml(sel) : renderTabelleHtml(sel);
      if (!openPrintWindow(html)) {
        if (typeof Toast !== 'undefined') Toast.error('Popup blockiert', 'Bitte Pop-ups für diese Seite erlauben.');
        return;
      }
      Modal.close('ptPrintModal');
    });
  }

  function open(ctx) {
    S = { ctx, gewaehlt: new Set(ctx.personen.map(p => p.id)), mode: 'tafel', suche: '' };
    byId('ppVon').value = ctx.von;
    byId('ppBis').value = ctx.bis;
    byId('ppSearch').value = '';
    byId('ppPresets').querySelector('[data-preset="aj"]').textContent = ctx.ajLabel;
    // Darstellung bei jedem Oeffnen auf Tafel zuruecksetzen (passt zu S.mode).
    byId('ppMode').querySelectorAll('button').forEach(x => x.classList.toggle('is-on', x.dataset.mode === 'tafel'));
    dlgBind();
    dlgZeichnen();
    Modal.init();
    Modal.open('ptPrintModal');
  }

  function minBeginn(ps) {
    const v = ps.map(p => p.ausbildungsBeginn).filter(Boolean).sort();
    return v[0] || null;
  }
  function maxEnde(ps) {
    const v = ps.map(p => p.ausbildungsEnde).filter(Boolean).sort();
    return v[v.length - 1] || null;
  }
```

`openPrintWindow` und `open` in `const api = { … }` aufnehmen.

- [ ] **Step 5: Gegenprobe-Skript schreiben**

Nach `<scratchpad>/dialog-check.js`:

```js
const { chromium } = require('c:/Dev/Digitales-Berichtsheft/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  await p.goto('http://localhost:3100/');
  await p.fill('#email', 'admin.demo@putzmeister.com');
  await p.click('#loginBtn');
  await p.waitForURL('**/dashboard.html', { timeout: 15000 });
  await p.goto('http://localhost:3100/app/abteilungs-planer.html');
  await p.waitForSelector('#ptBoard .pt-name', { timeout: 20000 });

  // window.open abfangen, damit das erzeugte Dokument pruefbar ist
  await p.evaluate(() => {
    window.__printed = null;
    window.open = () => ({
      document: { write(h) { window.__printed = h; }, close() {} },
      focus() {}, print() {},
    });
  });

  await p.click('#ptPrint');
  await p.waitForSelector('#ptPrintModal.open', { timeout: 5000 });

  const vorbelegt = await p.evaluate(() =>
    document.querySelectorAll('#ppList input[data-id]:checked').length);
  const sichtbar = await p.evaluate(() => document.querySelectorAll('#ptBoard .pt-name').length);
  console.log(`Vorauswahl ${vorbelegt} / sichtbar auf der Tafel ${sichtbar} → ${vorbelegt === sichtbar ? 'OK' : 'FAIL'}`);

  // Auf zwei Personen reduzieren
  await p.click('#ppNone');
  await p.evaluate(() => {
    [...document.querySelectorAll('#ppList input[data-id]')].slice(0, 2)
      .forEach(cb => { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
  });
  console.log('Drucken aktiv nach 2 Auswahl:', !(await p.locator('#ppGo').isDisabled()) ? 'OK' : 'FAIL');

  // Ungueltiger Zeitraum sperrt den Button
  await p.fill('#ppVon', '2026-12-31');
  await p.fill('#ppBis', '2026-01-01');
  await p.dispatchEvent('#ppBis', 'change');
  console.log('Drucken gesperrt bei Von>Bis:', await p.locator('#ppGo').isDisabled() ? 'OK' : 'FAIL');
  console.log('Fehlerhinweis sichtbar:', await p.locator('#ppErr').isVisible() ? 'OK' : 'FAIL');

  // Zurueck auf gueltig, Tafel drucken
  await p.fill('#ppVon', '2025-09-01');
  await p.fill('#ppBis', '2026-08-31');
  await p.dispatchEvent('#ppBis', 'change');
  await p.click('#ppGo');
  const tafel = await p.evaluate(() => window.__printed || '');
  console.log('Tafel-Dokument:', /A4 landscape/.test(tafel) && /2 Personen/.test(tafel) ? 'OK' : 'FAIL');

  // Tabelle drucken
  await p.click('#ptPrint');
  await p.waitForSelector('#ptPrintModal.open');
  await p.click('#ppMode button[data-mode="tabelle"]');
  await p.click('#ppGo');
  const tab = await p.evaluate(() => window.__printed || '');
  console.log('Tabellen-Dokument:', /A4 portrait/.test(tab) ? 'OK' : 'FAIL');

  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
```

- [ ] **Step 6: Skript laufen lassen, Fehlschlag bestätigen**

Run: `node <scratchpad>/dialog-check.js`
Expected: FAIL — Timeout auf `#ptPrintModal.open`, weil der Button noch
`window.print()` bzw. `printAbteilung` aufruft. Das verdrahtet Task 7.

- [ ] **Step 7: Commit**

```bash
git add app/abteilungs-planer.html app/css/planer-board.css app/js/planer-print.js
git commit -m "feat(planer): Druck-Dialog und Druckfenster

Modal mit Umschalter Tafel/Tabelle, Zeitraum-Presets plus freien Von/Bis-
Feldern und Azubi-Mehrfachauswahl mit Suche. Ausgabe in eigenem Fenster.
Umschalter als .pt-seg-Buttons statt <select class=form-control>, weil
PmSelect die sonst zu full-width .pm-select--block wrappt.

Noch nicht verdrahtet — der Toolbar-Button folgt."
```

---

### Task 7: Verdrahtung im Planer + Druckwege zusammenführen

Letzter Schritt: Der Toolbar-Button öffnet den Dialog, und die beiden
bestehenden Druckfunktionen nutzen dieselbe Infrastruktur — damit fällt der
dreifach kopierte `<style>`-Block weg.

**Files:**
- Modify: `app/js/abteilungs-planer.js:901` (Button-Titel)
- Modify: `app/js/abteilungs-planer.js:949` (Click-Handler)
- Modify: `app/js/abteilungs-planer.js:1500-1523` (`printPerson` umstellen)
- Delete: `app/js/abteilungs-planer.js:1525-1555` (`printAbteilung` — nach Step 2
  ohne Aufrufer)

**Interfaces:**
- Consumes: `PlanerPrint.open`, `PlanerPrint.openPrintWindow`,
  `PlanerPrint.PRINT_CSS`, `PlanerPrint.esc`, `PlanerPrint.fmtDe` (Tasks 2-6)
- Produces: nichts (Endpunkt des Plans)

- [ ] **Step 1: Button-Titel anpassen**

`app/js/abteilungs-planer.js:901` — der alte Titel beschreibt Verhalten, das es
nicht mehr gibt:

```js
        <button type="button" class="btn btn-outline btn-sm" id="ptPrint" title="Azubis, Zeitraum und Darstellung wählen, dann drucken">Drucken</button>
```

- [ ] **Step 2: Click-Handler auf den Dialog umstellen**

`app/js/abteilungs-planer.js:949` ersetzen:

```js
    on('ptPrint', 'click', () => {
      // Vorauswahl = genau die Personen, die die Toolbar gerade zeigt.
      // Namen sind hier bereits Anzeigenamen ("Vorname Nachname", siehe
      // displayName() beim Laden), Verantwortliche werden hier aufgeloest,
      // damit das Druckmodul ohne App-Globals arbeitet.
      const win = ajWindow();
      const sichtbar = gruppierteAzubis().flatMap(g => g.azubis);
      PlanerPrint.open({
        personen: sichtbar.map(a => ({
          id: a.id,
          name: a.name,
          beruf: a.beruf || '',
          gruppe: gruppeVon(a),
          ausbildungsBeginn: a.ausbildungsBeginn || null,
          ausbildungsEnde: a.ausbildungsEnde || null,
          stationen: zuwList(a.id).map(z => ({
            abteilung: z.abteilung || '',
            von: z.von,
            bis: z.bis || null,
            verantw: z.verantwName || verantwNameFor(z.verantwEmail) || '',
            farbe: colorFor(z.abteilung),
          })),
        })),
        von: DateUtil.toISODate(win.start),
        bis: DateUtil.toISODate(win.end),
        ajLabel: ajLabel(),
        stand: todayISO,
      });
    });
```

- [ ] **Step 3: `printPerson` umstellen, `printAbteilung` entfernen**

Wichtig: Nach Step 2 ruft **nichts mehr** `printAbteilung` auf — der
Toolbar-Handler in Zeile 949 war der einzige Aufrufer. Die Funktion würde toter
Code. Der Inhalt ist nicht verloren: mit gesetztem Abteilungsfilter enthält die
Tabellen-Variante genau dieselben Personen, nur nach Person gruppiert statt nach
Abteilung.

`app/js/abteilungs-planer.js:1500-1555` **komplett** durch das Folgende ersetzen
(der ganze `printAbteilung`-Block fällt weg):

```js
  // ═══════════════════ DRUCK (eine Person) ═══════════════════
  // Nutzt das Tabellen-Dokument aus planer-print.js — dadurch nur noch EIN
  // Druck-Stylesheet im Projekt statt dreier kopierter <style>-Bloecke.
  function printPerson(azubiId) {
    const a = azubiById.get(azubiId); if (!a) return;
    const win = ajWindow();
    const html = PlanerPrint.renderTabelleHtml({
      von: DateUtil.toISODate(win.start),
      bis: DateUtil.toISODate(win.end),
      stand: todayISO,
      personen: [{
        name: a.name, beruf: a.beruf || '', gruppe: gruppeVon(a),
        stationen: zuwList(azubiId).map(z => ({
          abteilung: z.abteilung || '', von: z.von, bis: z.bis || null,
          verantw: z.verantwName || verantwNameFor(z.verantwEmail) || '',
          farbe: colorFor(z.abteilung),
        })),
      }],
    });
    if (!PlanerPrint.openPrintWindow(html)) Toast.error('Popup blockiert', 'Bitte Pop-ups für diese Seite erlauben.');
  }
```

Danach prüfen, dass `printAbteilung` nirgends mehr referenziert wird:

```bash
grep -n "printAbteilung" app/js/abteilungs-planer.js
```

Expected: keine Treffer. Falls doch, den Aufrufer mitentfernen.

- [ ] **Step 4: Server neu starten (plain `node` hat kein Auto-Reload)**

```bash
# alten :3100-Prozess beenden, dann
cd c:/Dev/Digitales-Berichtsheft/backend && PORT=3100 node server.js
```

- [ ] **Step 5: Dialog-Gegenprobe laufen lassen**

Run: `node <scratchpad>/dialog-check.js`
Expected: alle Zeilen `OK` — Vorauswahl gleich der Tafel-Zeilenzahl,
Button-Sperren greifen, Tafel-Dokument enthält `A4 landscape` + `2 Personen`,
Tabellen-Dokument enthält `A4 portrait`.

- [ ] **Step 6: Panel-Druck und Filterwechsel gegenprüfen**

`dialog-check.js` deckt `printPerson` nicht ab, und der Filterwechsel ist der
Regressionstest für den Stale-State-Fall (Handler werden nur einmal gebunden,
der Zustand liegt deshalb in `S` auf Modulebene). Nach
`<scratchpad>/rewire-check.js`:

```js
const { chromium } = require('c:/Dev/Digitales-Berichtsheft/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
  const fehler = [];
  p.on('console', m => { if (m.type() === 'error') fehler.push(m.text()); });
  p.on('pageerror', e => fehler.push('pageerror: ' + e.message));

  await p.goto('http://localhost:3100/');
  await p.fill('#email', 'admin.demo@putzmeister.com');
  await p.click('#loginBtn');
  await p.waitForURL('**/dashboard.html', { timeout: 15000 });
  await p.goto('http://localhost:3100/app/abteilungs-planer.html');
  await p.waitForSelector('#ptBoard .pt-name', { timeout: 20000 });
  await p.evaluate(() => {
    window.__printed = null;
    window.open = () => ({
      document: { write(h) { window.__printed = h; }, close() {} },
      focus() {}, print() {},
    });
  });

  // 1) Panel-Druck (printPerson) — neue Datenaufbereitung aus Step 3
  await p.click('#ptBoard .pt-name');
  await p.waitForSelector('#ptPanelPrint', { timeout: 5000 });
  await p.click('#ptPanelPrint');
  const person = await p.evaluate(() => window.__printed || '');
  console.log('Panel-Druck:',
    /A4 portrait/.test(person) && /Abteilungsdurchlauf/.test(person) ? 'OK' : 'FAIL');

  // PmSelect versteckt das native <select> und spiegelt es in einen eigenen
  // Wrapper — page.selectOption() scheitert daran (Element nicht sichtbar).
  // Deshalb Wert direkt setzen und change selbst feuern.
  const setFilter = (id, wert) => p.evaluate(([i, w]) => {
    const el = document.getElementById(i);
    el.value = w;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [id, wert]);

  // 2) Abteilungsfilter schraenkt nur die Vorauswahl ein und oeffnet den
  //    Dialog — es gibt keinen zweiten Druckweg mehr (printAbteilung ist weg).
  await p.evaluate(() => window.__printed = null);
  await setFilter('ptFilterAbteilung', 'IT');
  await p.waitForTimeout(300);
  const aufTafel = await p.evaluate(() => document.querySelectorAll('#ptBoard .pt-name').length);
  await p.click('#ptPrint');
  await p.waitForSelector('#ptPrintModal.open', { timeout: 5000 });
  const nurIT = await p.evaluate(() => document.querySelectorAll('#ppList input[data-id]:checked').length);
  console.log(`Vorauswahl bei Abteilungsfilter IT ${nurIT} / Tafel ${aufTafel}:`,
    nurIT === aufTafel && nurIT > 0 ? 'OK' : 'FAIL');
  await p.click('#ptPrintModal [data-modal-close]');

  // 3) Stale-State: Filter aendern, Dialog erneut oeffnen -> neue Vorauswahl
  await setFilter('ptFilterAbteilung', '');
  await p.fill('#ptSearch', 'müller');
  await p.waitForTimeout(300);
  await p.click('#ptPrint');
  await p.waitForSelector('#ptPrintModal.open', { timeout: 5000 });
  const nachFilter = await p.evaluate(() => ({
    gewaehlt: document.querySelectorAll('#ppList input[data-id]:checked').length,
    tafel: document.querySelectorAll('#ptBoard .pt-name').length,
  }));
  console.log(`Vorauswahl nach Filterwechsel ${nachFilter.gewaehlt} / Tafel ${nachFilter.tafel}:`,
    nachFilter.gewaehlt === nachFilter.tafel ? 'OK' : 'FAIL (stale ctx)');

  console.log('Konsolenfehler:', fehler.length === 0 ? 'keine' : fehler);
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
```

Run: `node <scratchpad>/rewire-check.js`
Expected: alle drei `OK`, `Konsolenfehler: keine`. Erwartbar unkritisch sind
lediglich `404 /api/users/:oid/photo` (Konto ohne Foto) — die tauchen als
Netzwerk-, nicht als Konsolenfehler auf.

- [ ] **Step 7: Alle Unit-Tests laufen lassen**

Run: `node --test app/js/planer-print.test.js`
Expected: PASS, 29 Tests (Regression durch die Umstellung ausgeschlossen).

- [ ] **Step 8: Commit**

```bash
git add app/js/abteilungs-planer.js
git commit -m "feat(planer): Toolbar-Drucken oeffnet den Auswahl-Dialog

Vorauswahl ist die aktuelle Toolbar-Filterung; window.print() auf der
Live-Seite ist damit kein Druckweg mehr. printPerson nutzt jetzt das
gemeinsame Stylesheet und Druckfenster aus planer-print.js — die kopierten
<style>-Bloecke sind weg.

printAbteilung entfaellt: der Toolbar-Handler war der einzige Aufrufer. Mit
gesetztem Abteilungsfilter liefert die Tabellen-Variante dieselben Personen,
nur nach Person gruppiert statt nach Abteilung."
```

---

## Abschluss

- [ ] **Test-Server beenden** (die :3100-Instanz aus Task 1)
- [ ] **Scratchpad-Skripte** (`print-check.js`, `dialog-check.js`,
      `rewire-check.js`) nicht committen — sie brauchen Server und DB und haben
      im Repo keinen Platz (es gibt bisher keine committeten Browser-Tests).

## Bewusste Grenzen dieses Plans

Damit nichts stillschweigend unter den Tisch fällt:

- **Der CSS-Bugfix (Task 1) und der Dialog (Tasks 6-7) haben keine committeten
  automatisierten Tests** — nur Scratchpad-Skripte. Das Repo hat keine
  Browser-Test-Infrastruktur, und eine aufzubauen wäre eine eigene Entscheidung.
  Die reine Logik (Tasks 2-5) ist dagegen vollständig per `node:test` abgedeckt.
- **Der Zoom des Druckrasters ist nicht wählbar** — er ergibt sich aus der
  Zeitraumlänge (Spec-Entscheidung, YAGNI).
- **Keine Beurteilungs-Noten im Druck**, kein Sammel-PDF über mehrere
  Ausbildungsjahre, keine server-seitige PDF-Erzeugung (alles außerhalb der Spec).
- **`abteilungs-planer.js` bleibt groß.** Der Plan zieht nur den Druck heraus
  (~170 Zeilen); Planer-, Azubi- und Ausbilder-Sicht in einer Datei bleibt als
  bekannte Altlast bestehen. Eine weitere Aufteilung ist nicht Teil dieser Arbeit.
- **Der abteilungszentrierte Ausdruck fällt weg** (`printAbteilung`, Task 7
  Step 3). Er hatte nach der Umstellung keinen Aufrufer mehr, weil der
  Toolbar-Button laut Spec immer den Dialog öffnet. Die Personen sind mit
  gesetztem Abteilungsfilter weiter vollständig druckbar, nur nach Person
  gruppiert statt nach Abteilung. Wer die Gruppierung nach Abteilung braucht,
  bekommt sie über eine dritte Darstellungsvariante — das ist bewusst nicht
  Teil dieses Plans.
