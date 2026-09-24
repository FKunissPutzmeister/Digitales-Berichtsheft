# pm-design-kit — Umsetzungsplan Schritt A

> **Für agentische Bearbeiter:** ERFORDERLICHE SUB-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Aufgabe für Aufgabe umzusetzen. Die Schritte nutzen Checkbox-Syntax (`- [ ]`) zur Verfolgung.

**Ziel:** Den heutigen visuellen Zustand des Digitalen Berichtshefts als eigenständiges, überprüfbares Design-Kit im neuen Repo `pm-design-kit` abbilden (Version 0.1.0) — noch ohne gestalterische Änderungen.

**Architektur:** Der Ist-Zustand wird nicht aus den CSS-Dateien abgeschrieben, sondern **maschinell aus dem Browser geerntet** (Computed Styles) und als JSON eingefroren. Diese Ernte ist danach die Wahrheit, gegen die jede Kit-Datei automatisch geprüft wird. Das Kit selbst ist reines CSS + HTML ohne Laufzeit-Abhängigkeiten; Playwright wird nur von den Prüfskripten benutzt.

**Tech-Stack:** Node v24 (ESM, `.mjs`), Playwright 1.61.1 mit System-Edge (`channel: 'msedge'`), keine weiteren Abhängigkeiten.

**Spec:** [docs/superpowers/specs/2026-09-21-design-kit-design.md](../specs/2026-09-21-design-kit-design.md)

## Globale Rahmenbedingungen

- **Zielrepo:** `C:\Dev\pm-design-kit`, neu angelegt. GitHub später: `FKunissPutzmeister/pm-design-kit`. Das Berichtsheft-Repo wird **nicht verändert**.
- **Quellrepo:** `C:\Dev\Digitales-Berichtsheft` — nur lesend.
- **CSS-Ladereihenfolge der Quelle** (aus `app/dashboard.html:15-19`, maßgeblich für jede Ernte): `variables.css` → `base.css` → `components.css` → `layout.css` → `glass.css`. Theme-Dateien werden **nicht** geladen.
- **`layout.css` wird geerntet, aber nicht übernommen.** Es muss beim Ernten mitgeladen werden, weil es Tokens setzt und in die Kaskade eingreift — ohne es wären die gemessenen Werte falsch. Ins Kit wandert davon **nichts**: Layout ist Nicht-Ziel (Spec Abschnitt 2). Ernten heißt hier messen, nicht kopieren. Dieselbe Trennung gilt für die iOS-Korrekturen in `base.css`.
- **Sprache:** Alle Dokumente, Kommentare und Commit-Meldungen auf Deutsch.
- **Schritt A ändert nichts am Design.** Auch wenn ein Wert offensichtlich verbesserungswürdig ist: übernehmen, in `CHANGELOG.md` unter „Beobachtungen für Schritt B" notieren, weitergehen. Gestaltungsentscheidungen sind Schritt B.
- **Extraktionsregeln** (Spec Abschnitt 5) gelten für jeden Wert: gelebter Ist-Zustand statt Dateiinhalt · toter Code fliegt raus · Konflikte werden aufgelöst und dokumentiert · jedes Token bekommt eine Rolle · Verifikation gegen die echte App.
- **Keine Fremdreferenzen:** Keine Datei im Kit darf auf `C:\Dev\Digitales-Berichtsheft` oder ein CDN zeigen. Wird in Aufgabe 10 maschinell geprüft.
- **Browser-Start immer:** `chromium.launch({ channel: 'msedge', headless: true })`. Kein Playwright-Browser-Download nötig, System-Edge wird verwendet.
- **Version:** `0.1.0` (Zwischenstand). `1.0.0` entsteht erst nach Schritt C.
- **Commit-Fußzeile:** Jeder Commit endet mit der Attributions-Zeile, die dem Umsetzenden seine EIGENE Sitzung vorgibt (System-Hinweis am Anfang der jeweiligen Sitzung). Sie nennt das Modell, das den Commit tatsaechlich geschrieben hat, und ist deshalb je Subagent verschieden. In den Commit-Beispielen unten steht dafuer ein Platzhalter:
  ```
  Co-Authored-By: <Attribution deiner eigenen Sitzung>
  ```

## Dateistruktur

```
C:\Dev\pm-design-kit\
├── .gitignore
├── package.json               devDep playwright; npm-Skripte für die Prüfungen
├── README.md                  Einstieg für Menschen (Aufgabe 12)
├── DESIGN.md                  Regelwerk (Aufgaben 9, 11, 12)
├── SKILL.md                   Claude-Anbindung (Aufgabe 12)
├── CHANGELOG.md               Versionshistorie + Beobachtungen für Schritt B
├── tokens.json                Maschinenlesbare Tokens (Aufgabe 2)
├── preview.html               Musterseite (Aufgabe 9)
├── css/
│   ├── tokens.css             Aufgabe 2
│   ├── base.css               Aufgabe 3
│   ├── components.css         Aufgaben 4–7
│   └── surface-glass.css      Aufgabe 8
├── fonts/                     Schriftdateien + @font-face (Aufgabe 3)
├── extraktion/
│   ├── ist-light.json         Geerntete Wahrheit, hell (Aufgabe 1)
│   ├── ist-dark.json          Geerntete Wahrheit, dunkel (Aufgabe 1)
│   └── ist-glass-aus.json     Ohne Glas-Ebene (Aufgabe 8)
└── tools/
    ├── katalog.mjs            Markup-Katalog: Selektor → HTML (Aufgabe 1)
    ├── harvest.mjs            Ernte aus dem Berichtsheft-CSS (Aufgabe 1)
    ├── harvest.test.mjs       Test der Ernte (Aufgabe 1)
    ├── check-tokens.mjs       tokens.css ↔ tokens.json ↔ Ernte (Aufgabe 2)
    ├── kontrast-paare.json    Deklarierte Text/Fläche-Paare (Aufgabe 3)
    ├── check-contrast.mjs     WCAG-AA-Prüfung (Aufgabe 3)
    ├── check-parity.mjs       preview.html ↔ Ernte (Aufgabe 10)
    ├── check-standalone.mjs   Keine Fremdreferenzen (Aufgabe 10)
    └── shot.mjs               Screenshots hell/dunkel (Aufgabe 10)
```

**Verantwortlichkeiten:** `harvest.mjs` erzeugt Wahrheit, die `check-*.mjs` konsumieren. `katalog.mjs` ist die einzige Stelle, an der Komponenten-Markup definiert wird — Ernte **und** `preview.html` speisen sich daraus, damit beide nie auseinanderlaufen können.

---

## Aufgabe 1: Repo-Gerüst und Ernte-Werkzeug

Legt das Repo an und baut das Werkzeug, das den Ist-Zustand maschinell aus dem Browser liest. Ohne dieses Werkzeug ist jede folgende Aufgabe Rateschätzung.

**Dateien:**
- Anlegen: `C:\Dev\pm-design-kit\.gitignore`
- Anlegen: `C:\Dev\pm-design-kit\package.json`
- Anlegen: `C:\Dev\pm-design-kit\tools\katalog.mjs`
- Anlegen: `C:\Dev\pm-design-kit\tools\harvest.mjs`
- Test: `C:\Dev\pm-design-kit\tools\harvest.test.mjs`
- Erzeugt: `extraktion/ist-light.json`, `extraktion/ist-dark.json`

**Schnittstellen:**
- Liefert: `katalog.mjs` exportiert `KATALOG` — ein Array aus `{ id, gruppe, html, messSelektor, eigenschaften[] }`. `harvest.mjs` exportiert `ernten({ modus, glas })` → `Promise<Ernte>`; `Ernte` = `{ modus, glas, tokens: Record<string,string>, komponenten: Record<string, Record<string,string>> }`. Alle folgenden Aufgaben lesen diese JSON-Struktur.

- [ ] **Schritt 1: Repo anlegen**

```bash
mkdir -p /c/Dev/pm-design-kit/tools /c/Dev/pm-design-kit/css /c/Dev/pm-design-kit/extraktion
cd /c/Dev/pm-design-kit
git init -b main
```

- [ ] **Schritt 2: `.gitignore` und `package.json` schreiben**

`.gitignore`:
```
node_modules/
schuss/
*.log
```

`package.json`:
```json
{
  "name": "pm-design-kit",
  "version": "0.1.0",
  "description": "Design-Kit fuer interne Putzmeister-Web-Anwendungen",
  "type": "module",
  "private": true,
  "scripts": {
    "ernte": "node tools/harvest.mjs",
    "test:ernte": "node tools/harvest.test.mjs",
    "check:tokens": "node tools/check-tokens.mjs",
    "check:kontrast": "node tools/check-contrast.mjs",
    "check:paritaet": "node tools/check-parity.mjs",
    "check:standalone": "node tools/check-standalone.mjs",
    "check": "npm run check:tokens && npm run check:kontrast && npm run check:standalone && npm run check:paritaet",
    "schuss": "node tools/shot.mjs"
  },
  "devDependencies": {
    "playwright": "^1.61.1"
  }
}
```

```bash
cd /c/Dev/pm-design-kit && npm install
```

- [ ] **Schritt 3: Den fehlschlagenden Test schreiben**

`tools/harvest.test.mjs` — prüft drei bekannte Wahrheiten aus der Spec-Analyse: das Marken-Gelb, den effektiven Button-Schriftgrad (12px, **nicht** die 13px aus der ersten Deklaration) und die Glas-Überschreibung der Sidebar-Farbe.

```js
/* Prueft die Ernte gegen drei unabhaengig belegte Ist-Werte.
   Schlaegt der Test fehl, stimmt entweder die Ladereihenfolge in
   harvest.mjs nicht oder der Katalog trifft das falsche Element.   */
import { strict as assert } from 'node:assert';
import { ernten } from './harvest.mjs';

const e = await ernten({ modus: 'light', glas: true });

// 1. Marken-Gelb aus variables.css
assert.equal(e.tokens['--pm-yellow'], '#FFC300',
  `--pm-yellow erwartet #FFC300, war ${e.tokens['--pm-yellow']}`);

// 2. .btn deklariert font-size zweimal (13px, dann 0.75rem). Es gilt 12px.
assert.equal(e.komponenten['btn-primary']['font-size'], '12px',
  `.btn font-size erwartet 12px, war ${e.komponenten['btn-primary']['font-size']}`);

// 3. glass.css ueberschreibt --sidebar-bg von var(--pm-grey-800) auf hell-transluzent
assert.match(e.tokens['--sidebar-bg'], /rgba\(255,\s*255,\s*255/,
  `--sidebar-bg erwartet hell-transluzent (glass.css), war ${e.tokens['--sidebar-bg']}`);

console.log('OK: Ernte trifft alle drei Referenzwerte.');
```

- [ ] **Schritt 4: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd /c/Dev/pm-design-kit && npm run test:ernte
```
Erwartet: FEHLER `Cannot find module './harvest.mjs'`

- [ ] **Schritt 5: `tools/katalog.mjs` schreiben**

Der Markup-Katalog. In Aufgabe 1 nur mit den Einträgen, die der Test braucht — spätere Aufgaben erweitern ihn. `messSelektor` zeigt auf das Element, dessen Computed Style geerntet wird.

```js
/* Einzige Quelle fuer Komponenten-Markup. Ernte UND preview.html lesen
   daraus, damit beide nie auseinanderlaufen koennen.
   Erweitert wird pro Komponenten-Aufgabe (4-7).                        */
export const KATALOG = [
  {
    id: 'btn-primary',
    gruppe: 'Buttons',
    html: '<button class="btn btn-primary">Speichern</button>',
    messSelektor: '.btn-primary',
    eigenschaften: [
      'height', 'padding', 'font-family', 'font-size', 'font-weight',
      'letter-spacing', 'text-transform', 'border-radius', 'border',
      'background-color', 'color', 'transition'
    ]
  }
];

/* Eigenschaften, die fuer JEDE Komponente geerntet werden, zusaetzlich
   zu den komponentenspezifischen oben. */
export const IMMER = ['display', 'box-shadow', 'opacity'];
```

- [ ] **Schritt 6: `tools/harvest.mjs` schreiben**

```js
/* Erntet den Ist-Zustand des Berichtsheft-Designs aus dem Browser.

   Warum aus dem Browser und nicht aus den CSS-Dateien: die Dateien
   widersprechen sich an mehreren Stellen (.btn setzt font-size zweimal,
   glass.css ueberschreibt Tokens aus variables.css). Nur der Computed
   Style zeigt, was tatsaechlich gilt.

   Aufruf: node tools/harvest.mjs            (schreibt beide Modi)
           node tools/harvest.mjs --ohne-glas (zusaetzlich Glas aus)      */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { KATALOG, IMMER } from './katalog.mjs';

const QUELLE = 'C:/Dev/Digitales-Berichtsheft/app';
const ZIEL = path.resolve('extraktion');

/* Ladereihenfolge exakt wie app/dashboard.html:15-19. Theme-Dateien
   bewusst ausgelassen - sie gehoeren nicht ins Kit. */
const CSS_REIHE = [
  'css/variables.css',
  'css/base.css',
  'css/components.css',
  'css/layout.css',
  'css/glass.css'
];

/* Namen aller Custom Properties aus den Quelldateien sammeln. Ueber die
   Namen geht getPropertyValue zuverlaessig - ueber die Iteration des
   CSSStyleDeclaration waere es browserabhaengig. */
async function tokenNamen() {
  const namen = new Set();
  for (const datei of CSS_REIHE) {
    const text = await readFile(path.join(QUELLE, datei), 'utf8');
    for (const treffer of text.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) {
      namen.add(treffer[1]);
    }
  }
  return [...namen].sort();
}

function seiteBauen(cssLinks, koerper) {
  return `<!doctype html><html data-theme="__MODUS__"><head><meta charset="utf-8">
${cssLinks}
<style>body{padding:24px}#katalog>*{margin:12px 0}</style>
</head><body><div id="katalog">${koerper}</div></body></html>`;
}

export async function ernten({ modus = 'light', glas = true } = {}) {
  const dateien = glas ? CSS_REIHE : CSS_REIHE.filter(d => !d.endsWith('glass.css'));
  const links = dateien
    .map(d => `<link rel="stylesheet" href="${pathToFileURL(path.join(QUELLE, d)).href}">`)
    .join('\n');
  const koerper = KATALOG.map(k => `<div data-id="${k.id}">${k.html}</div>`).join('\n');
  const html = seiteBauen(links, koerper).replace('__MODUS__', modus);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const seite = await browser.newPage();
    await seite.setContent(html, { waitUntil: 'load' });

    const namen = await tokenNamen();
    const tokens = await seite.evaluate((ns) => {
      const s = getComputedStyle(document.documentElement);
      const raus = {};
      for (const n of ns) {
        const w = s.getPropertyValue(n).trim();
        if (w) raus[n] = w;
      }
      return raus;
    }, namen);

    const komponenten = {};
    for (const k of KATALOG) {
      const props = [...new Set([...k.eigenschaften, ...IMMER])];
      komponenten[k.id] = await seite.evaluate(({ sel, props }) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`Katalog-Selektor findet nichts: ${sel}`);
        const s = getComputedStyle(el);
        const raus = {};
        for (const p of props) raus[p] = s.getPropertyValue(p).trim();
        return raus;
      }, { sel: k.messSelektor, props });
    }

    return { modus, glas, tokens, komponenten };
  } finally {
    await browser.close();
  }
}

/* Direktaufruf: beide Modi ernten und schreiben. */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir(ZIEL, { recursive: true });
  const ohneGlas = process.argv.includes('--ohne-glas');
  const laeufe = ohneGlas
    ? [{ modus: 'light', glas: false, name: 'ist-glass-aus.json' }]
    : [{ modus: 'light', glas: true, name: 'ist-light.json' },
       { modus: 'dark',  glas: true, name: 'ist-dark.json' }];
  for (const l of laeufe) {
    const e = await ernten(l);
    await writeFile(path.join(ZIEL, l.name), JSON.stringify(e, null, 2) + '\n', 'utf8');
    console.log(`${l.name}: ${Object.keys(e.tokens).length} Tokens, ${Object.keys(e.komponenten).length} Komponenten`);
  }
}
```

- [ ] **Schritt 7: Test laufen lassen, Erfolg bestätigen**

```bash
cd /c/Dev/pm-design-kit && npm run test:ernte
```
Erwartet: `OK: Ernte trifft alle drei Referenzwerte.`

Schlägt Referenzwert 2 oder 3 fehl, ist die Ladereihenfolge falsch — **nicht** den Test anpassen, sondern `CSS_REIHE` prüfen.

- [ ] **Schritt 8: Ernte erzeugen und committen**

```bash
cd /c/Dev/pm-design-kit && npm run ernte
git add -A
git commit -m "$(cat <<'EOF'
feat: Repo-Geruest und Ernte-Werkzeug fuer den Ist-Zustand

Erntet Computed Styles aus dem Berichtsheft-CSS statt sie abzuschreiben.
Notwendig, weil die Quelldateien sich widersprechen (.btn setzt
font-size zweimal, glass.css ueberschreibt Tokens aus variables.css).

Co-Authored-By: <Attribution deiner eigenen Sitzung>
EOF
)"
```

---

## Aufgabe 2: `css/tokens.css` und `tokens.json`

Überträgt alle Tokens aus der Ernte in das Kit — in zwei Formaten, die maschinell gegeneinander und gegen die Ernte geprüft werden.

**Dateien:**
- Anlegen: `css/tokens.css`
- Anlegen: `tokens.json`
- Test: `tools/check-tokens.mjs`
- Liest: `extraktion/ist-light.json`, `extraktion/ist-dark.json`

**Schnittstellen:**
- Verbraucht: `Ernte.tokens` aus Aufgabe 1.
- Liefert: `tokens.json` mit der Struktur `{ version, light: Record<string,{wert,rolle}>, dark: Record<string,{wert,rolle}> }`. `rolle` ist ein deutscher Satz, der sagt wofür das Token da ist — Extraktionsregel 4. Aufgaben 3–12 lesen diese Datei.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`tools/check-tokens.mjs`:

```js
/* Prueft die Token-Dateien gegen die Ernte und gegeneinander:
   1. Jedes Token aus tokens.css steht in tokens.json und umgekehrt.
   2. Jeder Wert stimmt mit dem geernteten Ist-Wert ueberein.
   3. Jedes Token hat eine nicht-leere Rolle (Extraktionsregel 4).
   4. Kein Token ist ungenutzt uebernommen worden (Extraktionsregel 2).  */
import { readFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';

const json = JSON.parse(await readFile('tokens.json', 'utf8'));
const css = await readFile('css/tokens.css', 'utf8');

function bloeckeLesen(text) {
  /* Liefert { light: Map, dark: Map } aus :root {...} und
     [data-theme="dark"] {...}. */
  const raus = { light: new Map(), dark: new Map() };
  const rx = /(:root|\[data-theme="dark"\])\s*\{([^}]*)\}/gs;
  for (const [, sel, inhalt] of text.matchAll(rx)) {
    const ziel = sel === ':root' ? raus.light : raus.dark;
    for (const [, name, wert] of inhalt.matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g)) {
      ziel.set(name, wert.trim());
    }
  }
  return raus;
}

const ausCss = bloeckeLesen(css);
const fehler = [];

for (const modus of ['light', 'dark']) {
  const jsonTokens = json[modus] ?? {};
  const cssTokens = ausCss[modus];

  for (const name of Object.keys(jsonTokens)) {
    if (!cssTokens.has(name)) fehler.push(`${modus}: ${name} fehlt in tokens.css`);
    const rolle = jsonTokens[name]?.rolle;
    if (!rolle || !rolle.trim()) fehler.push(`${modus}: ${name} hat keine Rolle`);
  }
  for (const name of cssTokens.keys()) {
    if (!(name in jsonTokens)) fehler.push(`${modus}: ${name} fehlt in tokens.json`);
  }
  for (const [name, def] of Object.entries(jsonTokens)) {
    const imCss = cssTokens.get(name);
    if (imCss !== undefined && imCss !== def.wert) {
      fehler.push(`${modus}: ${name} — tokens.css "${imCss}" vs tokens.json "${def.wert}"`);
    }
  }
}

if (fehler.length) {
  console.error(`${fehler.length} Abweichung(en):`);
  for (const f of fehler) console.error('  - ' + f);
  process.exit(1);
}
console.log(`OK: ${Object.keys(json.light).length} Tokens hell, ${Object.keys(json.dark).length} dunkel, alle mit Rolle.`);
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd /c/Dev/pm-design-kit && npm run check:tokens
```
Erwartet: FEHLER `ENOENT ... tokens.json`

- [ ] **Schritt 3: `css/tokens.css` aus der Ernte schreiben**

Inhalt sind die Tokens aus `extraktion/ist-light.json` bzw. `ist-dark.json`, gegliedert in **Markenwerte** (Farbe, Schrift) oben und **Systemwerte** (Abstand, Radius, Schatten, Motion, Layout, Z-Ebenen) darunter (Spec 4.1). Der `@font-face`-Block bleibt in `base.css` (Aufgabe 3), nicht hier.

Regeln beim Übertragen:
- **Konflikt `--sidebar-bg`** (Spec 3.3 (2)): Der Glas-Wert gehört nach `surface-glass.css` (Aufgabe 8), nicht in `tokens.css`. In `tokens.css` steht der Basiswert `var(--pm-grey-800)` mit Rollen-Kommentar, der auf die Überschreibung hinweist.
- **Ungenutzte Tokens** vor dem Übernehmen prüfen:
  ```bash
  cd /c/Dev/Digitales-Berichtsheft && grep -rn "var(--TOKENNAME)" app/css app/js app/*.html | wc -l
  ```
  Ergebnis `0` → nicht übernehmen, in `CHANGELOG.md` unter „entfernt (ungenutzt)" listen.
- Jedes Token bekommt einen Kommentar mit seiner Rolle, wortgleich zur `rolle` in `tokens.json`.

- [ ] **Schritt 4: `tokens.json` schreiben**

```json
{
  "version": "0.1.0",
  "light": {
    "--pm-yellow": {
      "wert": "#FFC300",
      "rolle": "Markenfarbe. Primaeraktion, Fokusring, aktiver Zustand."
    }
  },
  "dark": {}
}
```

Vollständig zu befüllen aus der Ernte. Werte müssen **zeichengleich** zu `css/tokens.css` sein, sonst schlägt der Test fehl.

- [ ] **Schritt 5: Test laufen lassen, Erfolg bestätigen**

```bash
cd /c/Dev/pm-design-kit && npm run check:tokens
```
Erwartet: `OK: N Tokens hell, M dunkel, alle mit Rolle.`

- [ ] **Schritt 6: Committen**

```bash
cd /c/Dev/pm-design-kit && git add -A
git commit -m "$(cat <<'EOF'
feat: Design-Tokens als CSS und JSON, gegen die Ernte geprueft

Jedes Token traegt eine Rolle; ungenutzte wurden aussortiert.
Die Glas-Ueberschreibung von --sidebar-bg bleibt der Glas-Ebene
vorbehalten statt den Basiswert zu verdecken.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
EOF
)"
```

---

## Aufgabe 3: `css/base.css`, Schriften und Kontrastprüfung

Reset, Typografie-Grundlagen, Fokus — plus das Prüfskript, das jede Text/Fläche-Kombination gegen WCAG AA rechnet.

**Dateien:**
- Anlegen: `css/base.css`
- Anlegen: `fonts/` (Kopien aus `Corporate Design/Fonts/`)
- Anlegen: `tools/kontrast-paare.json`
- Test: `tools/check-contrast.mjs`

**Schnittstellen:**
- Verbraucht: `tokens.json` aus Aufgabe 2.
- Liefert: `kontrast-paare.json` als Array von `{ vg, hg, modus, rolle, mindest, ausnahme? }`. `vg`/`hg` sind Token-Namen. `ausnahme` ist ein deutscher Begründungssatz; Paare mit Ausnahme werden gemeldet, aber brechen den Lauf nicht ab. Aufgabe 11 zitiert die berechneten Werte in `DESIGN.md`.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`tools/check-contrast.mjs`:

```js
/* Rechnet fuer jedes deklarierte Text/Flaeche-Paar den WCAG-Kontrast.

   Wichtig: Schritt A spiegelt den Ist-Zustand. Faellt ein Paar durch,
   ist das ein BEFUND, kein Baufehler - es bekommt einen Eintrag mit
   Begruendung in kontrast-paare.json und wandert in die Schritt-B-Liste.
   Ohne Eintrag bricht der Lauf ab, damit nichts unbemerkt durchrutscht. */
import { readFile } from 'node:fs/promises';

const tokens = JSON.parse(await readFile('tokens.json', 'utf8'));
const paare = JSON.parse(await readFile('tools/kontrast-paare.json', 'utf8'));

function zuRgb(farbe) {
  const h = farbe.trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h);
  if (m) {
    const s = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
    return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16));
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(h);
  if (m) return m[1].split(',').slice(0, 3).map(v => Math.round(parseFloat(v)));
  throw new Error(`Farbe nicht lesbar: ${farbe}`);
}

function leuchtdichte([r, g, b]) {
  const f = [r, g, b].map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}

function kontrast(a, b) {
  const [l1, l2] = [leuchtdichte(zuRgb(a)), leuchtdichte(zuRgb(b))].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/* Token im Modus aufloesen; faellt auf light zurueck, wenn dark es
   nicht ueberschreibt - genau wie die CSS-Kaskade. */
function wert(name, modus) {
  const w = tokens[modus]?.[name]?.wert ?? tokens.light?.[name]?.wert;
  if (!w) throw new Error(`Token unbekannt: ${name} (${modus})`);
  if (w.startsWith('var(')) {
    const inner = /var\(\s*(--[A-Za-z0-9_-]+)/.exec(w)?.[1];
    return wert(inner, modus);
  }
  return w;
}

const harteFehler = [];
const befunde = [];

for (const p of paare) {
  const v = kontrast(wert(p.vg, p.modus), wert(p.hg, p.modus));
  const ok = v >= p.mindest;
  const zeile = `${p.modus.padEnd(5)} ${p.vg} auf ${p.hg}: ${v.toFixed(2)}:1 (min ${p.mindest}) — ${p.rolle}`;
  if (ok) continue;
  if (p.ausnahme) befunde.push(`${zeile}\n      Begruendung: ${p.ausnahme}`);
  else harteFehler.push(zeile);
}

if (befunde.length) {
  console.warn(`\n${befunde.length} bekannte(r) Befund(e) fuer Schritt B:`);
  for (const b of befunde) console.warn('  - ' + b);
}
if (harteFehler.length) {
  console.error(`\n${harteFehler.length} undeklarierte(r) Kontrastverstoss/-verstoesse:`);
  for (const f of harteFehler) console.error('  - ' + f);
  process.exit(1);
}
console.log(`\nOK: ${paare.length} Paare geprueft, ${befunde.length} dokumentierte Befunde.`);
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd /c/Dev/pm-design-kit && npm run check:kontrast
```
Erwartet: FEHLER `ENOENT ... tools/kontrast-paare.json`

- [ ] **Schritt 3: `tools/kontrast-paare.json` anlegen**

Jede im UI real vorkommende Text/Fläche-Kombination, hell und dunkel. Startpunkt:

```json
[
  { "vg": "--pm-grey-800", "hg": "--pm-white",  "modus": "light", "rolle": "Fliesstext auf Karte",            "mindest": 4.5 },
  { "vg": "--pm-grey-900", "hg": "--pm-white",  "modus": "light", "rolle": "Ueberschrift auf Karte",          "mindest": 4.5 },
  { "vg": "--pm-grey-400", "hg": "--pm-white",  "modus": "light", "rolle": "Sekundaertext auf Karte",         "mindest": 4.5 },
  { "vg": "--pm-grey-500", "hg": "--pm-grey-50","modus": "light", "rolle": "Sekundaertext auf Seitengrund",   "mindest": 4.5 },
  { "vg": "--on-yellow-text", "hg": "--pm-yellow", "modus": "light", "rolle": "Beschriftung Primaerbutton",   "mindest": 4.5 },
  { "vg": "--on-inverse-text", "hg": "--color-error", "modus": "light", "rolle": "Beschriftung Loeschen-Button", "mindest": 4.5 },
  { "vg": "--pm-grey-800", "hg": "--pm-white",  "modus": "dark",  "rolle": "Fliesstext auf Karte (dunkel)",   "mindest": 4.5 },
  { "vg": "--pm-grey-900", "hg": "--pm-white",  "modus": "dark",  "rolle": "Ueberschrift auf Karte (dunkel)", "mindest": 4.5 }
]
```

Hinweis zur Dark-Fallstrick: Im Dunkelmodus ist die Grauskala **invertiert** — `--pm-grey-900` ist dort eine helle Textfarbe und `--pm-white` eine dunkle Fläche. Die Paare oben sind deshalb im Dunkelmodus korrekt, auch wenn sie auf den ersten Blick verdreht aussehen.

Die Liste ist vollständig zu erweitern: Badges (6 Status × Text/Fläche, beide Modi), Sidebar, Toast, Empty-State, Formular-Platzhalter, deaktivierte Zustände.

- [ ] **Schritt 4: Schriften kopieren**

```bash
cd /c/Dev/pm-design-kit && mkdir -p fonts
cp "/c/Dev/Digitales-Berichtsheft/Corporate Design/Fonts/librefranklin-bold.ttf" fonts/
cp "/c/Dev/Digitales-Berichtsheft/Corporate Design/Fonts/librefranklin-light.ttf" fonts/
cp "/c/Dev/Digitales-Berichtsheft/Corporate Design/Fonts/OpenSans-Variable.ttf" fonts/
ls -la fonts/
```

Es bleibt bei **zwei** Libre-Franklin-Schnitten (Spec 3.3 (4)). Regular und Medium fehlen und werden in Schritt A **nicht** ergänzt — das ist offener Punkt 5 der Spec. In `CHANGELOG.md` unter „Beobachtungen für Schritt B" vermerken, inklusive der Stellen im Quell-CSS, die `font-weight: 800` fordern.

- [ ] **Schritt 5: `css/base.css` schreiben**

Aus `extraktion/ist-light.json` und `app/css/base.css`: `@font-face`-Block (Pfade jetzt `../fonts/`), Box-Sizing-Reset, `html`/`body`-Grundlagen, Überschriften-Skala h1–h6, Absatz, Scrollbar, `::selection`, `:focus-visible`.

**Nicht** übernehmen: `overflow-x: hidden` und `overscroll-behavior` auf `html`/`body` sowie der `--app-bg-base`-Kommentar — das sind Berichtsheft-spezifische iOS-Korrekturen, kein Designregelwerk. In `DESIGN.md` Abschnitt 9 als Hinweis erwähnen (Aufgabe 9).

- [ ] **Schritt 6: Test laufen lassen, Erfolg bestätigen**

```bash
cd /c/Dev/pm-design-kit && npm run check:kontrast
```
Erwartet: `OK: N Paare geprueft, M dokumentierte Befunde.`

Bricht der Lauf mit „undeklarierter Kontrastverstoß" ab: Wert **nicht** ändern (Schritt A ändert nichts), sondern Eintrag mit `ausnahme`-Begründung ergänzen und in die Schritt-B-Liste aufnehmen.

- [ ] **Schritt 7: Committen**

```bash
cd /c/Dev/pm-design-kit && git add -A
git commit -m "$(cat <<'EOF'
feat: Basis-CSS, Schriften und maschinelle Kontrastpruefung

Jedes Text/Flaeche-Paar wird gegen WCAG AA gerechnet. Durchfaller
brauchen eine begruendete Ausnahme, sonst bricht der Lauf ab - so
bleibt kein Kontrastproblem unbemerkt in Schritt B stehen.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
EOF
)"
```

---

## Aufgaben 4–7: `css/components.css`

Vier Aufgaben mit identischem Ablauf, unterschiedlichem Umfang. Sie bauen dieselbe Datei schrittweise auf und erweitern jeweils `tools/katalog.mjs`.

**Gemeinsamer Ablauf — gilt für jede der vier Aufgaben:**

- [ ] **Schritt 1:** Katalog-Einträge für die Komponenten der Gruppe in `tools/katalog.mjs` ergänzen — je Komponente **ein Eintrag pro Zustand** (`btn-primary`, `btn-primary--hover`, `btn-primary--disabled`, …). Zustände, die sich nicht durch Markup erzeugen lassen, bekommen das Feld `erzwingen`.
- [ ] **Schritt 2:** `npm run test:ernte` — muss weiterhin durchlaufen.
- [ ] **Schritt 3:** `npm run ernte` — erzeugt die Ist-Werte der neuen Einträge.
- [ ] **Schritt 4:** Die Regeln in `css/components.css` schreiben, Werte **aus der Ernte**, nicht aus der Quelldatei abgeschrieben.
- [ ] **Schritt 5:** `npm run check:tokens && npm run check:kontrast` — beide grün.
- [ ] **Schritt 6:** Committen.

**Warum in diesen vier Aufgaben kein fertiges CSS im Plan steht:** Die
Werte entstehen erst zur Laufzeit aus der Ernte. Sie hier vorab
hinzuschreiben hieße raten — und würde Extraktionsregel 1 verletzen, die
genau das verbietet. Was der Plan stattdessen festlegt, sind die exakten
Klassennamen (siehe „Schnittstellen" je Aufgabe) und die Sonderfälle.

**Einmalige Erweiterung der Werkzeuge in Aufgabe 4** (die späteren
Aufgaben nutzen sie mit): `harvest.mjs` und `check-parity.mjs` kennen das
Feld `erzwingen` noch nicht. In beiden Dateien vor dem Messen einfügen:

```js
/* Zustaende, die kein Markup erzeugt: :hover per echtem Zeigerkontakt,
   :focus-visible per Tastatur-Fokus. page.hover() allein loest kein
   :focus-visible aus, deshalb die Fallunterscheidung.               */
async function zustandSetzen(seite, k) {
  for (const z of k.erzwingen ?? []) {
    if (z === 'hover') await seite.hover(k.messSelektor);
    else if (z === 'focus-visible') await seite.locator(k.messSelektor).press('Tab').catch(async () => {
      await seite.locator(k.messSelektor).focus();
      await seite.keyboard.press('Shift+Tab');
      await seite.keyboard.press('Tab');
    });
    else throw new Error(`Unbekannter erzwingen-Wert: ${z} (${k.id})`);
  }
}
```

Aufruf jeweils direkt vor dem `seite.evaluate(...)`, das die Eigenschaften
liest: `await zustandSetzen(seite, k);`. Nach dem Messen eines
`hover`-Eintrags den Zeiger wieder wegbewegen, sonst verfälscht er den
nächsten Eintrag: `await seite.mouse.move(0, 0);`

### Aufgabe 4: Buttons, Karten, Stat-Karten, Badges, Avatare

**Dateien:** Anlegen `css/components.css`; Ändern `tools/katalog.mjs`

**Schnittstellen:** Liefert die Klassen `.btn` (+ `-primary`, `-secondary`, `-outline`, `-outline-yellow`, `-ghost`, `-danger`, `-success`, `-sm`, `-lg`, `-icon`), `.card` (+ `--interactive`, `--flat`, `__header`, `__title`, `__body`, `__footer`), `.stat-card` (+ `__icon`, `__content`, `__label`, `__value`, `__sub`), `.badge` (+ 6 Statusvarianten, `--yellow`, `--grey`, `--dot`), `.avatar` (+ `--sm`, `--lg`, `--xl`). Aufgaben 9–11 referenzieren exakt diese Namen.

Zwei Besonderheiten:
- **`.btn` Doppeldeklaration** (Spec 3.3 (1)): Nur die effektiven Werte schreiben — `font-size: 0.75rem`, `letter-spacing: 0.06em`. Die verworfenen Werte in `CHANGELOG.md` unter „bereinigt" vermerken.
- **Icon-Flächen:** `components.css:252-267` setzt bewusst `background: none` für eine Liste von Icon-Elementen. Als Regel ins Kit übernehmen, aber generisch benannt (`.icon-plain`) statt mit der Berichtsheft-Klassenliste.

### Aufgabe 5: Formulare

**Dateien:** Ändern `css/components.css`, `tools/katalog.mjs`

**Schnittstellen:** Liefert `.form-group`, `.form-label` (+ `.required`), `.form-control` (+ `--error`), `.form-hint`, `.form-error`, `.checkbox-wrap`, `.pm-switch` (+ `__input`, `__track`, `__thumb`), `.pm-select` (+ `__trigger`, `__label`, `__chevron`, `__menu`, `__search`, `__option`, `--sm`, `--block`, `--open`).

Besonderheit **PmSelect**: Die Quelle wrappt jedes `.form-control`-`<select>` per JavaScript in einen `.pm-select--block`-Wrapper und kopiert dabei die Klassen auf den Wrapper. `components.css:1081-1116` enthält deshalb Kompatibilitätsregeln, die Wrapper-Eigenschaften zurücksetzen. Diese Regeln sind **an das Berichtsheft-JavaScript gebunden** und gehören nicht ins Kit. Stattdessen: das reine Erscheinungsbild von `.pm-select` übernehmen und in `DESIGN.md` festhalten, dass Breitenangaben an den Wrapper gehören, nicht an das `<select>`.

### Aufgabe 6: Overlays

**Dateien:** Ändern `css/components.css`, `tools/katalog.mjs`

**Schnittstellen:** Liefert `.modal-overlay` (+ `.open`, `.confirm-overlay`), `.modal` (+ `__header`, `__title`, `__close`, `__body`, `__footer`), `.confirm__zeile`/`__icon`/`__inhalt`/`__text`/`__liste`/`__hinweis`, `.toast-container`, `.toast` (+ `--success`, `--error`, `--info`, `__icon`, `__content`, `__title`, `__msg`), `.dropdown` (+ `__menu`, `__item`, `__item--danger`), `.tooltip`, `.spinner`.

Besonderheit: `.modal-overlay.open` nutzt `backdrop-filter: blur(12px)`. Das ist eine Glas-Eigenschaft — sie gehört nach `surface-glass.css` (Aufgabe 8), nicht hierher. In `components.css` bleibt die deckende Variante.

### Aufgabe 7: Restliche Komponenten

**Dateien:** Ändern `css/components.css`, `tools/katalog.mjs`

**Schnittstellen:** Liefert `.progress-bar` (+ `__fill`, `__fill--success`, `__fill--info`), `.empty-state` (+ `__icon`, `__title`, `__text`), `.comment` (+ `--ausbilder`, `--abgelehnt`, `__header`, `__name`, `__date`, `__text`), `.chip` (aus `.ausbilder-chip` verallgemeinert), `.segment` (+ `.segment__btn`, `.segment__btn.is-on`).

Zwei Besonderheiten:
- **Segment-Umschalter:** Die Quelle (`app/css/planer-board.css:98-101`, dort `.pt-seg`) bezieht `--pt-ctl-h`, `--pt-ctl-fs` und `--pt-seg-pad` aus einem `.pt-toolbar`-Vorfahren. Freistehend rendert sie unformatiert. Beim Übernehmen: die geernteten Zahlenwerte einsetzen und als eigene Tokens in `tokens.css`/`tokens.json` aufnehmen, damit `.segment` ohne Vorfahren funktioniert. Umbenennung `.pt-seg` → `.segment`, weil das Kürzel „pt" (Plantafel) berichtsheftspezifisch ist.
- **Tabellen:** Es existiert **keine** generische Tabellen-Komponente in der Quelle — Tabellen sind überall seitenspezifisches Markup. In Schritt A wird deshalb keine gebaut. Stattdessen: `CHANGELOG.md`-Eintrag unter „Lücke, Neuentwurf in Schritt B" und ein entsprechender Platzhalter-Abschnitt in `DESIGN.md` (Aufgabe 11), der die Lücke offen benennt statt sie zu verschweigen.

---

## Aufgabe 8: `css/surface-glass.css`

Die Glas-Ebene als separat abschaltbare Datei (Spec 4.2).

**Dateien:**
- Anlegen: `css/surface-glass.css`
- Ändern: `tools/harvest.mjs` (Lauf ohne Glas)
- Erzeugt: `extraktion/ist-glass-aus.json`

**Schnittstellen:**
- Verbraucht: Alle Klassen aus den Aufgaben 4–7.
- Liefert: Die Glas-Tokens (`--glass-bg`, `--glass-bg-strong`, `--glass-bg-tint`, `--glass-border`, `--glass-border-soft`, `--glass-highlight`, `--glass-shadow`, `--glass-blur`, `--glass-blur-strong`) und die Token-Überschreibung `--sidebar-bg`. Aufgabe 9 dokumentiert sie, Aufgabe 10 prüft den Ein/Aus-Vergleich.

- [ ] **Schritt 1: Ernte ohne Glas erzeugen**

```bash
cd /c/Dev/pm-design-kit && npm run ernte -- --ohne-glas
```
Erwartet: `ist-glass-aus.json` wird geschrieben.

- [ ] **Schritt 2: Differenz zwischen den Ernten bestimmen**

```bash
cd /c/Dev/pm-design-kit && node -e "
const a = require('fs').readFileSync('extraktion/ist-light.json','utf8');
const b = require('fs').readFileSync('extraktion/ist-glass-aus.json','utf8');
const [A,B] = [JSON.parse(a), JSON.parse(b)];
for (const k of Object.keys(A.tokens)) {
  if (A.tokens[k] !== B.tokens[k]) console.log('TOKEN', k, '|mit:', A.tokens[k], '|ohne:', B.tokens[k]);
}
for (const id of Object.keys(A.komponenten)) {
  for (const p of Object.keys(A.komponenten[id])) {
    if (A.komponenten[id][p] !== B.komponenten[id][p])
      console.log('KOMP', id, p, '|mit:', A.komponenten[id][p], '|ohne:', B.komponenten[id][p]);
  }
}
"
```

Diese Ausgabe ist die vollständige Liste dessen, was die Glas-Ebene tatsächlich bewirkt — und damit exakt der Inhalt von `surface-glass.css`. Sie ist gleichzeitig die Vorlage für die Entscheidung in Schritt B.

- [ ] **Schritt 3: `css/surface-glass.css` schreiben**

Nur die in Schritt 2 gefundenen Unterschiede. Kopfkommentar, der festhält: additive Ebene, nach `components.css` einzubinden, per Entfernen der `<link>`-Zeile abschaltbar, und welche Tokens sie überschreibt.

**Nicht** übernehmen: `--app-bg-image`, `--app-bg-overlay`, `--app-bg-vignette`, `--sidebar-bg-image` samt der Bilddateien (Spec 4.2, je ~1,4 MB). Nur als Kommentar dokumentieren.

- [ ] **Schritt 4: Beide Ernten neu erzeugen, Prüfungen laufen lassen**

```bash
cd /c/Dev/pm-design-kit && npm run ernte && npm run ernte -- --ohne-glas && npm run check:tokens && npm run check:kontrast
```
Erwartet: beide Prüfungen grün.

- [ ] **Schritt 5: Committen**

```bash
cd /c/Dev/pm-design-kit && git add -A
git commit -m "$(cat <<'EOF'
feat: Glas-Ebene als separat abschaltbare Datei

Inhalt ist die maschinell bestimmte Differenz zwischen Ernte mit und
ohne glass.css - damit ist in Schritt B "Glas raus" ein Ein/Aus-
Vergleich statt einer Umbauaktion. Die Hintergrundbilder (~3 MB)
bleiben draussen und sind nur dokumentiert.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
EOF
)"
```

---

## Aufgabe 9: `DESIGN.md` Fundament (Abschnitte 1–10)

**Dateien:** Anlegen `DESIGN.md`

**Schnittstellen:** Verbraucht `tokens.json`, die Kontrastwerte aus Aufgabe 3 und die Ernte. Liefert die Abschnittsstruktur, die Aufgaben 11 und 12 fortschreiben.

- [ ] **Schritt 1: Abschnitte 1–10 schreiben**

Gliederung nach Spec Abschnitt 6. Leitprinzip **Entscheidungsdichte**: nicht „es gibt `--sp-4: 16px`", sondern „Karten-Innenabstand 20px, Abstand zwischen Karten 16px, zwischen Abschnitten 32px".

Je Abschnitt verbindlich:
1. **Grundsätze** — 5–7 Leitsätze, jeder mit Begründung, die im Zweifelsfall die Entscheidung trägt.
2. **Farbe** — Tabelle je Stufe: Hex, Rolle, gemessener Kontrast (aus Aufgabe 3, nicht geschätzt), Dark-Entsprechung. Dazu die Statusfarben-Systematik (Textfarbe + gedämpfte Fläche als Paar) und die Regeln zum Gelb-Einsatz.
3. **Typografie** — Fonts, Einbindung, die 9 Größenstufen in px **und** rem, Gewichtszuordnung je Rolle, Zeilenhöhen, Überschriften-Hierarchie, Textfarben-Zuordnung, maximale Zeilenlänge. **Mit ausdrücklichem Hinweis** auf die fehlenden Libre-Franklin-Schnitte (Spec 3.3 (4)) und die Folge: `font-weight: 500` und `800` erzeugen einen synthetischen Schnitt.
4. **Abstände** — Skala **und** Zuordnungstabelle Situation → Wert.
5. **Radien** — Skala mit Zuordnung je Elementtyp.
6. **Elevation** — die vier semantischen Rollen (ruhend / überfahren / aktiv / schwebend) statt roher Schattenwerte.
7. **Rahmen & Trennlinien** — wann Kante, wann Schatten, wann Fläche.
8. **Motion** — die vier Kurven mit Einsatzgebiet, Dauern, was animiert werden darf, `prefers-reduced-motion`.
9. **Fokus & Barrierefreiheit** — Fokusring, WCAG-AA-Mindestwerte, Tastaturbedienung, **44px Touch-Ziele**. Dazu der Hinweis aus Aufgabe 3 Schritt 5, dass die iOS-Korrekturen der Quelle bewusst nicht ins Kit übernommen wurden und wo sie nachzulesen sind.
10. **Ikonografie** — Stil, **eine** verbindliche Strichstärke, Größenraster, Farbzuordnung, Regel „keine gefüllten Flächen hinter Icons".

Zu Abschnitt 10, Strichstärke: Die Quelle nutzt 10 verschiedene Werte (Spec 3.3 (3)). Da Schritt A nichts ändern soll, wird der **häufigste** Wert `2` als Regel festgeschrieben und die Streuung als Befund in `CHANGELOG.md` notiert. Prüfen:
```bash
cd /c/Dev/Digitales-Berichtsheft && grep -oh 'stroke-width="[0-9.]*"' app/js/*.js app/*.html | sort | uniq -c | sort -rn
```

- [ ] **Schritt 2: Querprüfung gegen `tokens.json`**

```bash
cd /c/Dev/pm-design-kit && node -e "
const t = JSON.parse(require('fs').readFileSync('tokens.json','utf8'));
const d = require('fs').readFileSync('DESIGN.md','utf8');
const fehlt = Object.keys(t.light).filter(n => !d.includes(n));
console.log(fehlt.length ? 'In DESIGN.md nicht erwaehnt:\n  ' + fehlt.join('\n  ') : 'OK: alle Tokens erwaehnt.');
"
```
Jedes nicht erwähnte Token ist entweder zu dokumentieren oder war ungenutzt und gehört entfernt (Extraktionsregel 2).

- [ ] **Schritt 3: Committen**

```bash
cd /c/Dev/pm-design-kit && git add -A
git commit -m "$(cat <<'EOF'
docs: DESIGN.md Fundament - Farbe, Typografie, Raster, Motion, A11y

Kontrastwerte sind gerechnet, nicht geschaetzt. Die fehlenden
Libre-Franklin-Schnitte sind als Einschraenkung benannt statt
stillschweigend vererbt zu werden.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
EOF
)"
```

---

## Aufgabe 10: `preview.html` und die Prüfkette

Die Musterseite plus die drei Prüfungen, die beweisen, dass das Kit eigenständig ist und dem Ist-Zustand entspricht.

**Dateien:**
- Anlegen: `preview.html`
- Test: `tools/check-parity.mjs`, `tools/check-standalone.mjs`
- Anlegen: `tools/shot.mjs`

**Schnittstellen:** Verbraucht `KATALOG` aus Aufgabe 1 und alle Kit-CSS-Dateien. `shot.mjs` legt Screenshots unter `schuss/` ab (in `.gitignore`).

- [ ] **Schritt 1: Die fehlschlagenden Tests schreiben**

`tools/check-standalone.mjs`:

```js
/* Beweist, dass das Kit niemanden von aussen braucht. Ein Kit, das
   heimlich auf das Berichtsheft-Repo zeigt, ist in einem anderen
   Projekt sofort kaputt - und zwar unsichtbar.                      */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/* nur: gilt fuer diese Endungen. Die URL-Regel klammert .md aus -
   README und CHANGELOG duerfen die GitHub-Adresse und das Quellrepo
   nennen, das ist Dokumentation und keine Laufzeit-Abhaengigkeit. */
const VERBOTEN = [
  { rx: /Digitales-Berichtsheft/i,          was: 'Verweis auf das Quellrepo',            nur: /\.(css|html|json|mjs)$/ },
  { rx: /https?:\/\/(?!www\.putzmeister)/i, was: 'externe URL (CDN o.ae.)',              nur: /\.(css|html)$/ },
  { rx: /Corporate Design\//,               was: 'Verweis auf den Corporate-Design-Ordner', nur: /\.(css|html|json|mjs)$/ },
  { rx: /\.\.\/\.\.\//,                     was: 'Pfad ausserhalb des Kits',             nur: /\.(css|html)$/ }
];
const PRUEFEN = /\.(css|html|json|mjs|md)$/;
const AUS = new Set(['node_modules', '.git', 'extraktion', 'schuss']);

async function dateien(wurzel) {
  const raus = [];
  for (const e of await readdir(wurzel, { withFileTypes: true })) {
    if (AUS.has(e.name)) continue;
    const p = path.join(wurzel, e.name);
    if (e.isDirectory()) raus.push(...await dateien(p));
    else if (PRUEFEN.test(e.name)) raus.push(p);
  }
  return raus;
}

const fehler = [];
for (const datei of await dateien('.')) {
  const text = await readFile(datei, 'utf8');
  text.split('\n').forEach((zeile, i) => {
    /* Kommentarzeilen duerfen die Quelle nennen - sie sind Dokumentation. */
    if (/^\s*(\/\*|\*|\/\/|<!--|\s*-\s)/.test(zeile)) return;
    for (const v of VERBOTEN) {
      if (!v.nur.test(datei)) continue;
      if (v.rx.test(zeile)) fehler.push(`${datei}:${i + 1} — ${v.was}\n      ${zeile.trim()}`);
    }
  });
}

/* Schriftdateien muessen wirklich dasein, nicht nur referenziert sein. */
for (const f of ['librefranklin-bold.ttf', 'librefranklin-light.ttf', 'OpenSans-Variable.ttf']) {
  try { await stat(path.join('fonts', f)); }
  catch { fehler.push(`fonts/${f} fehlt`); }
}

if (fehler.length) {
  console.error(`${fehler.length} Eigenstaendigkeits-Verstoss/-Verstoesse:`);
  for (const f of fehler) console.error('  - ' + f);
  process.exit(1);
}
console.log('OK: Das Kit hat keine Fremdreferenzen.');
```

`tools/check-parity.mjs`:

```js
/* Rendert preview.html mit den KIT-Dateien und vergleicht die Computed
   Styles gegen die aus dem Berichtsheft geerntete Wahrheit. Das ist der
   eigentliche Beweis, dass Schritt A eine Spiegelung ist und keine
   Neuinterpretation.                                                   */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { KATALOG, IMMER } from './katalog.mjs';

/* Eigenschaften, deren Abweichung erwartet und begruendet ist. */
const GEDULDET = {
  'segment': ['height', 'padding', 'font-size'] // aus .pt-toolbar entkoppelt, Aufgabe 7
};

const abweichungen = [];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const modus of ['light', 'dark']) {
    const ernte = JSON.parse(await readFile(`extraktion/ist-${modus}.json`, 'utf8'));
    const seite = await browser.newPage();
    await seite.goto(pathToFileURL(path.resolve('preview.html')).href, { waitUntil: 'load' });
    await seite.evaluate(m => document.documentElement.setAttribute('data-theme', m), modus);

    for (const k of KATALOG) {
      const props = [...new Set([...k.eigenschaften, ...IMMER])];
      const ist = await seite.evaluate(({ sel, props }) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const s = getComputedStyle(el);
        return Object.fromEntries(props.map(p => [p, s.getPropertyValue(p).trim()]));
      }, { sel: k.messSelektor, props });

      if (!ist) { abweichungen.push(`${modus} ${k.id}: in preview.html nicht gefunden (${k.messSelektor})`); continue; }
      for (const p of props) {
        if (GEDULDET[k.id]?.includes(p)) continue;
        const soll = ernte.komponenten[k.id]?.[p];
        if (soll !== undefined && soll !== ist[p]) {
          abweichungen.push(`${modus} ${k.id}.${p}: Ernte "${soll}" vs Kit "${ist[p]}"`);
        }
      }
    }
    await seite.close();
  }
} finally { await browser.close(); }

if (abweichungen.length) {
  console.error(`${abweichungen.length} Abweichung(en) zwischen Ernte und Kit:`);
  for (const a of abweichungen) console.error('  - ' + a);
  process.exit(1);
}
console.log('OK: Das Kit rendert zeichengleich zum Ist-Zustand.');
```

- [ ] **Schritt 2: Tests laufen lassen, Fehlschlag bestätigen**

```bash
cd /c/Dev/pm-design-kit && npm run check:standalone; npm run check:paritaet
```
Erwartet: `check:standalone` meldet Verstöße oder läuft durch; `check:paritaet` schlägt mit `ENOENT ... preview.html` fehl.

- [ ] **Schritt 3: `preview.html` schreiben**

Bindet `css/tokens.css`, `css/base.css`, `css/components.css`, `css/surface-glass.css` in dieser Reihenfolge ein. Enthält **jede** Katalog-Komponente in **jedem** Zustand, nach Gruppen gegliedert, plus einen Umschalter hell/dunkel, der `data-theme` auf `<html>` setzt.

Die Markup-Schnipsel müssen mit `KATALOG[].html` übereinstimmen — sonst schlägt `check:paritaet` fehl. Am einfachsten per Generator:

```bash
cd /c/Dev/pm-design-kit && node -e "
import('./tools/katalog.mjs').then(({KATALOG}) => {
  const gruppen = {};
  for (const k of KATALOG) (gruppen[k.gruppe] ??= []).push(k);
  for (const [g, eintraege] of Object.entries(gruppen)) {
    console.log('<section><h2>' + g + '</h2>');
    for (const k of eintraege) console.log('  <div data-id=\"' + k.id + '\">' + k.html + '</div>');
    console.log('</section>');
  }
});
"
```

- [ ] **Schritt 4: `tools/shot.mjs` schreiben**

```js
/* Screenshots der Musterseite in beiden Modi, ganzseitig.
   Aufruf: node tools/shot.mjs [--breite=1440]                         */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const breite = Number(process.argv.find(a => a.startsWith('--breite='))?.split('=')[1] ?? 1440);
await mkdir('schuss', { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const modus of ['light', 'dark']) {
    const seite = await browser.newPage({ viewport: { width: breite, height: 1000 } });
    await seite.goto(pathToFileURL(path.resolve('preview.html')).href, { waitUntil: 'load' });
    await seite.evaluate(m => document.documentElement.setAttribute('data-theme', m), modus);
    const ziel = `schuss/preview-${modus}-${breite}.png`;
    await seite.screenshot({ path: ziel, fullPage: true });
    console.log('geschrieben:', ziel);
    await seite.close();
  }
} finally { await browser.close(); }
```

- [ ] **Schritt 5: Gesamte Prüfkette laufen lassen**

```bash
cd /c/Dev/pm-design-kit && npm run check && npm run schuss
```
Erwartet: alle vier Prüfungen grün, zwei PNG unter `schuss/`.

Meldet `check:paritaet` Abweichungen: Das ist der Zweck der Prüfung. Entweder das Kit-CSS korrigieren (Regelfall) oder — wenn die Abweichung gewollt und begründet ist, wie beim entkoppelten Segment-Umschalter — einen Eintrag in `GEDULDET` mit Kommentar ergänzen.

- [ ] **Schritt 6: Sichtprüfung gegen die echte App**

Backend im Berichtsheft-Repo starten und vergleichen:
```bash
cd /c/Dev/Digitales-Berichtsheft/backend && npm run dev
```
Dann `http://localhost:3000` öffnen (**immer über :3000**, nicht über Live Server — sonst werden Frontend und API getrennt) und die Screenshots aus `schuss/` danebenlegen. Abweichungen, die die Paritätsprüfung nicht erfasst (Schriftbild, Gesamteindruck), notieren.

- [ ] **Schritt 7: Committen**

```bash
cd /c/Dev/pm-design-kit && git add -A
git commit -m "$(cat <<'EOF'
feat: Musterseite und vollstaendige Pruefkette

check:paritaet rendert das Kit und vergleicht Computed Styles gegen
die geerntete Wahrheit - damit ist belegbar, dass Schritt A spiegelt
statt neu zu interpretieren. check:standalone schliesst aus, dass
das Kit heimlich aufs Quellrepo zeigt.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
EOF
)"
```

---

## Aufgabe 11: `DESIGN.md` Komponenten-Katalog (Abschnitt 11)

**Dateien:** Ändern `DESIGN.md`

**Schnittstellen:** Verbraucht die Klassennamen aus den Aufgaben 4–7 und die Ernte. Jeder dokumentierte Wert muss aus `extraktion/ist-light.json` bzw. `ist-dark.json` belegbar sein.

- [ ] **Schritt 1: Katalog schreiben**

Je Komponente, ohne Ausnahme: **Zweck** (ein Satz) · **Anatomie** (die Teile und ihre Klassen) · **Maße** (exakt, aus der Ernte) · **alle Zustände** (default, hover, active, focus-visible, disabled, loading, leer, Fehler — nicht zutreffende ausdrücklich als „entfällt" kennzeichnen) · **Varianten** · **Do/Don't** · **Code-Schnipsel** (lauffähig, aus `katalog.mjs`).

Reihenfolge: Buttons · Karten · Stat-Karten · Badges · Avatare · Formulare · Progress · Modal · Bestätigungs-Dialog · Toast · Empty-State · Dropdown · Tooltip · Spinner · Segment-Umschalter · Chips · Kommentar · Navigations-Muster.

**Tabellen** bekommen einen eigenen Abschnitt, der die Lücke offen benennt: keine generische Komponente in der Quelle vorhanden, Neuentwurf in Schritt B, bis dahin keine Empfehlung. Eine erfundene Tabelle wäre schlimmer als eine benannte Lücke — sie sähe verbindlich aus.

- [ ] **Schritt 2: Vollständigkeit prüfen**

```bash
cd /c/Dev/pm-design-kit && node -e "
import('./tools/katalog.mjs').then(({KATALOG}) => {
  const d = require('fs').readFileSync('DESIGN.md','utf8');
  const fehlt = [...new Set(KATALOG.map(k => k.id.split('--')[0]))].filter(id => !d.includes(id));
  console.log(fehlt.length ? 'Im Katalog, aber nicht in DESIGN.md:\n  ' + fehlt.join('\n  ') : 'OK: alle Komponenten dokumentiert.');
});
"
```

- [ ] **Schritt 3: Committen**

```bash
cd /c/Dev/pm-design-kit && git add -A
git commit -m "$(cat <<'EOF'
docs: Komponenten-Katalog mit allen Zustaenden

Maße stammen aus der Ernte, nicht aus Schaetzung. Die fehlende
Tabellen-Komponente ist als Luecke benannt statt erfunden - eine
erfundene Tabelle saehe verbindlich aus und waere es nicht.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
EOF
)"
```

---

## Aufgabe 12: Verhalten, Sprache, `README.md`, `SKILL.md`, `CHANGELOG.md`

Schließt Schritt A ab.

**Dateien:** Ändern `DESIGN.md`; Anlegen `README.md`, `SKILL.md`, `CHANGELOG.md`

**Schnittstellen:** `SKILL.md` braucht YAML-Frontmatter mit `name` und `description`, damit Claude Code die Skill erkennt.

- [ ] **Schritt 1: `DESIGN.md` Abschnitte 12–17 schreiben**

12. **Feedback-Sprache** — wann Toast, wann Inline-Meldung, wann Modal, wann gar nichts. Mit Entscheidungstabelle.
13. **Microcopy** — Buttonbeschriftungen als Verb statt Substantiv, Sie/Du-Festlegung, Datumsformat, Zahlenformat, **Namensdarstellung „Vorname Nachname"** (die Quelle liefert „Nachname, Vorname" roh und dreht es in der Anzeige).
14. **Dunkelmodus** — Regeln und Fallen. Verbindlich aufnehmen: *Die Grauskala ist im Dunkelmodus invertiert.* `--pm-grey-700/800/900` sind dort **Textfarben**, keine Flächen; `--pm-white` ist dort eine dunkle Kartenfläche. Wer im Dunkelmodus eine Fläche braucht, nimmt `--pm-white` oder die Klasse `.card` — niemals eine eigene Überschreibung.
15. **Anti-Patterns** — Verbotsliste mit Begründung, jeweils als „nicht X, sondern Y".
16. **Theming-Mechanik** — wie `data-theme` und Token-Überschreibung funktionieren, mit dem Hinweis, dass Overrides **alle** Modi abdecken müssen.
17. **Checkliste** — abhakbare Listen für „neue Komponente" und „neue Seite".

- [ ] **Schritt 2: `README.md` schreiben**

Was das Kit ist · Einbindung (die vier `<link>`-Zeilen in korrekter Reihenfolge) · wie man die Glas-Ebene abschaltet · wie man die Prüfungen laufen lässt · Verweis auf `DESIGN.md` als das eigentliche Regelwerk · Verweis auf `Digital Brand Manual V1.pdf` für Logo-Regeln (die das Kit bewusst nicht dupliziert) · Hinweis, dass das Kit ab 1.0 zentral gepflegt und **nicht pro Projekt angepasst** wird.

- [ ] **Schritt 3: `SKILL.md` schreiben**

```markdown
---
name: pm-design-kit
description: Verbindliches Design-Regelwerk fuer interne Putzmeister-Web-Anwendungen. Nutze es bei jeder UI-Arbeit in Projekten, die dieses Kit enthalten - Farben, Typografie, Abstaende, Komponenten und deren Zustaende sind darin abschliessend geregelt.
---
```

Danach zweistufig (Spec Abschnitt 7): ein **Schnellzugriff** mit den 20–30 häufigsten Werten (Marken-Gelb, Textfarben, Abstandszuordnung, Button-Maße, Radien, Fokusring) für den Alltagsfall — und darunter eine Verweistabelle „Frage → Abschnitt in `DESIGN.md`". So landet nicht bei jeder Kleinigkeit das ganze Regelwerk im Kontext.

- [ ] **Schritt 4: `CHANGELOG.md` schreiben**

Version `0.1.0` mit vier Rubriken, die über die Aufgaben 1–11 hinweg befüllt wurden:
- **Gespiegelt** — was aus der Quelle übernommen wurde
- **Bereinigt** — aufgelöste Widersprüche (`.btn`-Doppeldeklaration, `--sidebar-bg`-Konflikt) und ungenutzte Tokens
- **Lücken** — fehlende Tabellen-Komponente, fehlende Libre-Franklin-Schnitte
- **Beobachtungen für Schritt B** — Kontrast-Ausnahmen, Icon-Strichstärken-Streuung, die 5 offenen Punkte aus Spec Abschnitt 10, plus alles, was während der Umsetzung auffiel

- [ ] **Schritt 5: Gesamte Prüfkette ein letztes Mal**

```bash
cd /c/Dev/pm-design-kit && npm run check && npm run schuss
```
Erwartet: alle vier Prüfungen grün.

- [ ] **Schritt 6: Committen und Version markieren**

```bash
cd /c/Dev/pm-design-kit && git add -A
git commit -m "$(cat <<'EOF'
docs: Verhalten, Sprache, README, SKILL und CHANGELOG — Schritt A fertig

Das Kit spiegelt den Ist-Zustand vollstaendig und maschinell geprueft.
Alle bewussten Luecken und Befunde stehen im CHANGELOG als Vorlage
fuer Schritt B.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
EOF
)"
git tag -a v0.1.0 -m "Schritt A: Ist-Zustand gespiegelt"
```

- [ ] **Schritt 7: GitHub-Repo anlegen und pushen**

`gh` ist auf diesem Rechner nicht installiert. Zwei Wege — **vorher mit Kuniß abstimmen**, ob und wann gepusht wird:

*Weg A, manuell:* Repo `pm-design-kit` auf github.com unter `FKunissPutzmeister` anlegen (privat, ohne README/Lizenz), dann:
```bash
cd /c/Dev/pm-design-kit
git remote add origin https://github.com/FKunissPutzmeister/pm-design-kit.git
git push -u origin main --tags
```

*Weg B, per API* (Muster: Token über `git credential fill`, Anfrage über Node-`https` — MSYS-`curl` wird in dieser Umgebung blockiert).

---

## Abschluss von Schritt A

Nach Aufgabe 12 liegt vor: ein eigenständiges, maschinell geprüftes Kit in Version 0.1.0, Screenshots beider Modi, und eine `CHANGELOG.md`, deren Rubrik „Beobachtungen für Schritt B" die Arbeitsliste für die Professionalisierung ist.

**Schritt B** (eigener Plan) arbeitet die 8 Achsen aus Spec Abschnitt 8 ab, ergänzt um alles, was in dieser Rubrik gelandet ist. **Schritt C** friert auf 1.0 ein, nachdem der Praxistest aus Spec Abschnitt 9 bestanden ist.
