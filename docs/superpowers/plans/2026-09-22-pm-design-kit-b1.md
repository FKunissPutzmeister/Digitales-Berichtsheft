# pm-design-kit Schritt B1 — Mängel beheben (Umsetzungsplan)

> **Für agentische Bearbeiter:** ERFORDERLICHE UNTER-FÄHIGKEIT: Nutze
> superpowers:subagent-driven-development (empfohlen) oder
> superpowers:executing-plans, um diesen Plan Aufgabe für Aufgabe
> umzusetzen. Schritte benutzen Kästchen-Syntax (`- [ ]`) zur
> Fortschrittsverfolgung.

**Ziel:** Die 30 objektiv entscheidbaren Befunde aus Schritt A beheben —
allen voran 21 Kontrastpaare unter WCAG AA — und drei Lücken schließen
(Tabelle, `.sr-only`, Feldbreitenregel), ohne die acht
Professionalisierungs-Achsen anzufassen.

**Architektur:** Das Kit ist ein eigenständiges Repo ohne Laufzeit-Code:
vier CSS-Dateien, eine Token-Datei in zwei Formaten, vier
Dokumentationsdateien und eine Werkzeugkette aus Node-Skripten, die
alles per headless Edge misst statt behauptet. B1 ändert zum ersten Mal
absichtlich gerenderte Werte — deshalb wird als **erste** Aufgabe die
Paritätsprüfung von „gleich der Vorlage" auf „gleich dem freigegebenen
Soll" umgebaut; danach ist jede Farbkorrektur ein gewöhnlicher
Rot-Grün-Zyklus über `npm run check:kontrast`.

**Tech-Stack:** Node 20+ (ESM, `"type": "module"`), Playwright 1.61
gegen `channel: 'msedge'`, `node:test` für Werkzeug-Tests, reines
CSS ohne Präprozessor.

**Spec:** [docs/superpowers/specs/2026-09-22-design-kit-b1-design.md](../specs/2026-09-22-design-kit-b1-design.md)

**Vorgänger-Spec:** [docs/superpowers/specs/2026-09-21-design-kit-design.md](../specs/2026-09-21-design-kit-design.md)

---

## Globale Randbedingungen

Diese gelten für **jede** Aufgabe. Die Anforderungen jeder Aufgabe
schließen diesen Abschnitt stillschweigend ein.

**Arbeitsort**

- Gearbeitet wird **ausschließlich** in `C:\Dev\pm-design-kit`. Das ist
  ein eigenes Git-Repo ohne Remote.
- `C:\Dev\Digitales-Berichtsheft` ist die **Quelle und nur lesbar**. Dort
  wird nichts geändert und nichts committet — das Repo enthält
  unfertige, fremde Arbeit des Auftraggebers.
- Für Volltextsuche im Code **immer das dedizierte Grep-Werkzeug**
  benutzen, nie `grep`/`rg`/`findstr` über Bash oder PowerShell. Ein aus
  Code kopiertes Muster enthält oft `>`/`<`; beide Shells werten das
  außerhalb von Anführungszeichen als Umleitung und legen klaglos leere
  Geister-Dateien an. Das ist im Quellrepo mehrfach passiert.

**Kontrast-Reparaturen (Spec 3.2)**

1. **Farbwinkel bleibt.** Nur Helligkeit, und wenn nötig Sättigung,
   werden verändert. Bei transluzenten Farben wird die **Deckkraft**
   angehoben, nicht die Farbe ersetzt.
2. **So wenig wie möglich.** Zielwert ist **mindestens 4,6:1** für
   Fließtext und **mindestens 3,1:1** für großen Text (ab 18,66px oder
   24px fett) — nicht der maximal mögliche Kontrast. Der Aufschlag auf
   die AA-Grenzwerte 4,5 und 3,0 verhindert, dass ein Wert bei einer
   Rundung oder minimalen Flächenänderung zurückkippt.
3. **Der Grund wird notiert.** Jede geänderte Farbe bekommt im
   Rollen-Satz ihres Tokens (in `css/tokens.css` **und** `tokens.json`)
   einen Hinweis mit Vorher-Wert, Nachher-Wert und Grund.
4. **Dunkelmodus zuerst.** 15 der 21 Durchfaller liegen dort.

**Abgrenzung**

- B1 fasst die acht Professionalisierungs-Achsen **nicht** an:
  Gelb-Einsatz, Radien, Glas, Motion, Typo-Skala, Dichte, Marken-Gelb,
  Icon-Strichstärke. Wer beim Arbeiten eine Geschmacksfrage entdeckt,
  notiert sie in `CHANGELOG.md` unter „Beobachtungen für Schritt B" und
  entscheidet sie nicht.
- `css/surface-glass.css` wird in B1 **nicht** verändert — mit **einer
  benannten Ausnahme**: Aufgabe 5 ersetzt dort das Farb-Literal
  `#F18581` (Zeile 370) durch den Token, den sie im selben Zug anlegt.
  Das ist Tokenisierung, keine Gestaltungsentscheidung: der Wert kommt
  aus dem Badge-Token, nicht aus einer Entscheidung über die Glas-Ebene.
  Alles andere an dieser Datei — Unschärfe, Sättigung, Flächen,
  Ränder — bleibt für B2, Achse 3.

**Nach jeder gerenderten Änderung**

- `npm run soll` ausführen (zeigt die Abweichung, schreibt nichts),
  die Ausgabe **lesen und im Aufgabenbericht zitieren**, dann
  `npm run soll -- --uebernehmen` und die neue `extraktion/soll-*.json`
  mitcommitten.
- `npm run check` muss danach vollständig grün sein.

**Sprache und Form**

- Alle Kommentare, Commit-Nachrichten, Dokumentation und Berichte auf
  **Deutsch**, mit vollständiger Rechtschreibung einschließlich Umlauten
  und Eszett.
- **Ausnahme, bestehende Konvention des Repos:** in `css/*.css` und
  `tools/*.mjs` werden Umlaute in Kommentaren als `ae/oe/ue/ss`
  geschrieben (so ist der gesamte Bestand). In den vier
  Markdown-Dateien stehen echte Umlaute. Diese Trennung beibehalten.
- Als Platzhalter für „kein Wert" gilt im ganzen Kit der
  Halbgeviertstrich `–` (U+2013).

**Commits**

- Kleine, häufige Commits — mindestens einer pro Aufgabe, gern mehr.
- Nachrichtenform wie im Bestand: `typ(bereich): kurze Aussage`, z. B.
  `fix(kontrast): Grauskala im Dunkelmodus auf AA gezogen`.
- Jede Commit-Nachricht endet mit:
  `Co-Authored-By: <Attribution deiner eigenen Sitzung>`
  — also der Attributionszeile, die **deine** Sitzung vorgegeben
  bekommen hat, nicht einer aus diesem Plan abgeschriebenen.

**Versionierung**

- `0.2.0` erst in der letzten Aufgabe. Vorher bleibt `package.json` bei
  `0.1.0`.

---

## Dateistruktur

Was B1 anlegt, ändert oder umbenennt. Jede Datei hat genau eine
Zuständigkeit.

**Neu**

| Datei | Zuständigkeit |
|---|---|
| `tools/farbe.mjs` | Farbmathematik als Modul: Parsen, Leuchtdichte, Kontrast, Alpha-Überlagerung, HSL-Umrechnung. Bisher privat in `check-contrast.mjs`, jetzt von drei Skripten gebraucht |
| `tools/ton-suchen.mjs` | Sucht den kleinsten Eingriff (Helligkeit **oder** Deckkraft), der ein Farbpaar über einen Zielkontrast hebt. Macht Spec 3.2 rechenbar |
| `tools/ton-suchen.test.mjs` | Test dazu |
| `tools/messen.mjs` | Misst `preview.html` in einem Modus. Einzige Messstelle für `check-parity.mjs` **und** `build-soll.mjs` |
| `tools/build-soll.mjs` | Erzeugt `extraktion/soll-*.json`. Zeigt ohne Flagge nur die Abweichung |
| `tools/build-soll.test.mjs` | Test dazu |
| `extraktion/soll-light.json`, `soll-dark.json` | Der freigegebene Soll-Stand. Prüfgrundlage von `check:paritaet` |

**Umbenannt**

| Alt | Neu | Grund |
|---|---|---|
| `extraktion/ist-light.json` | `extraktion/vorlage-light.json` | Ab B1 historischer Bezug, nie wieder Prüfgrundlage |
| `extraktion/ist-dark.json` | `extraktion/vorlage-dark.json` | dito |
| `extraktion/ist-glass-aus.json` | `extraktion/vorlage-glass-aus.json` | dito |

**Geändert**

| Datei | Was daran |
|---|---|
| `css/tokens.css`, `tokens.json` | Farbkorrekturen, sieben neue Tokens aus Literalen, Vokabular-Zusammenführung, Dunkelwerte für acht semantische Farben |
| `css/components.css` | Fokus-Indikatoren, Tooltip per Tastatur, Toast-Pause, Touch-Ebene, Tabelle, `.sr-only`, Feldbreiten, vier Bauteil-Fehler |
| `css/base.css` | `::selection`-Dunkelmodus-Regel, Touch-Ebene, falls sie dorthin gehört |
| `tools/katalog.mjs` | Neue Einträge für Tabelle, `.sr-only`, Feldbreiten und neue Zustände |
| `tools/harvest.mjs` | Schutz gegen versehentliches Überschreiben der Vorlage-Ernte; Desktop-Viewport |
| `tools/check-parity.mjs` | Prüft gegen `soll-*.json`, misst über `messen.mjs` |
| `tools/check-contrast.mjs` | Bezieht Farbmathematik aus `farbe.mjs` |
| `tools/kontrast-paare.json` | Ausnahmen entfernen, neue Paare für neue Tokens |
| `tools/check-zahlen.mjs` | Neue Regeln für die Zahlen, die B1 verändert |
| `preview.html` | Regeneriert aus `katalog.mjs` |
| `package.json` | Skript `soll`, Version `0.2.0` in der letzten Aufgabe |
| `DESIGN.md`, `CHANGELOG.md`, `SKILL.md`, `README.md` | Dokumentation jeder Änderung |

**Unangetastet**

`css/surface-glass.css`, `fonts/` (bis Aufgabe 10),
`tools/check-tokens.mjs`, `tools/check-css-regeln.mjs`,
`tools/check-standalone.mjs`, `tools/shot.mjs`.

---

## Reihenfolge und Abhängigkeiten

```
1  Paritätsprüfung umbauen        ← muss zuerst, sonst wird alles rot
2  Farbwerkzeug                   ← liefert die Rechnung für 3–7
   ├─ 3  Grauskala           (6 Paare)
   ├─ 4  Semantische Farben  (3 Paare)
   ├─ 5  Status-Literale     (5 Paare)
   ├─ 6  Sidebar-Literale    (4 Paare)
   └─ 7  Text auf Gelb       (3 Paare)   Σ 21
8  Fokus, Tastatur, Touch         ← unabhängig
9  Token-Vokabular                ← nach 4 (dort entsteht ein Teil davon)
10 Typografie                     ← unabhängig
11 Dunkelmodus + vier Bauteilfehler
12 Tabelle                        ← größte Einzelaufgabe
13 .sr-only und Feldbreiten
14 Abschluss: Doku, Zahlen, 0.2.0, Sichtprüfung, Probe aufs Exempel
```

Die Aufgaben 3–7 sind untereinander unabhängig und können in beliebiger
Reihenfolge laufen, aber **nicht parallel** — sie ändern alle
`css/tokens.css`, `tokens.json` und `tools/kontrast-paare.json`.

---

### Aufgabe 1: Paritätsprüfung auf einen Soll-Stand umbauen

**Warum zuerst:** Heute beweist `check:paritaet` Gleichheit mit der
Vorlage. Sobald Aufgabe 3 den ersten Farbwert absichtlich ändert, wird
sie rot. Ohne diesen Umbau bliebe nur, sie stillzulegen — und damit
fiele in der Phase mit den meisten Änderungen das Netz weg.

**Dateien:**
- Anlegen: `tools/messen.mjs`
- Anlegen: `tools/build-soll.mjs`
- Anlegen: `tools/build-soll.test.mjs`
- Umbenennen: `extraktion/ist-light.json` → `extraktion/vorlage-light.json`
- Umbenennen: `extraktion/ist-dark.json` → `extraktion/vorlage-dark.json`
- Umbenennen: `extraktion/ist-glass-aus.json` → `extraktion/vorlage-glass-aus.json`
- Ändern: `tools/check-parity.mjs` (vollständig ersetzt)
- Ändern: `tools/harvest.mjs:330-341` (Schutz vor Überschreiben)
- Ändern: `package.json` (Skripte `soll`, `test:soll`)

**Schnittstellen:**
- Liefert: `messen.mjs` exportiert
  `export async function messeVorschau(browser, modus)` →
  `Promise<{ [katalogId: string]: { [eigenschaft: string]: string } }>`
  und `export async function previewAktuellPruefen()` → `Promise<void>`
  (beendet den Prozess mit Code 1, wenn `preview.html` veraltet ist).
- Liefert: `build-soll.mjs` exportiert
  `export function abweichungenFinden(alt, neu)` →
  `Array<{ modus, id, eigenschaft, alt, neu }>`.
  `alt`/`neu` haben die Form `{ light: {...}, dark: {...} }`; ein
  fehlender Eintrag auf einer Seite erscheint als Abweichung mit
  `alt: null` bzw. `neu: null`.
- Verbraucht: `KATALOG`, `IMMER` aus `tools/katalog.mjs`;
  `zustandSetzen`, `aufTransitionsEndeWarten`, `ZEITDECKEL_MS` aus
  `tools/harvest.mjs`; `seiteBauen` aus `tools/build-preview.mjs`.

**Entwurfsentscheidung, die du nicht neu treffen musst:** Die Spec
verlangt, dass `npm run soll` „eine Bestätigung verlangt". Die
Bestätigung ist die **ausdrückliche Flagge `--uebernehmen`**, keine
interaktive Abfrage. Gründe: sie funktioniert auch in einem Skript oder
einer Prüfkette, sie ist im Commit sichtbar (wer sie benutzt hat, hat
sie bewusst getippt), und sie kann nicht versehentlich durch ein
Zeilenende bestätigt werden. Ein Lauf ohne Flagge schreibt unter keinen
Umständen.

- [ ] **Schritt 1: Ausgangslage sichern**

Vor jeder Änderung den jetzigen Zustand als grün belegen, damit ein
späterer Fehlschlag eindeutig dieser Aufgabe zuzuordnen ist.

```bash
cd /c/Dev/pm-design-kit
git status --short          # muss leer sein
npm run check               # muss vollständig gruen sein
```

Erwartet: sechs Zeilen „OK: …", Exit 0. Ist etwas rot, **nicht
weiterarbeiten** — melde es zurück.

- [ ] **Schritt 2: Messlogik nach `tools/messen.mjs` herausziehen**

`check-parity.mjs` enthält heute die Messschleife inline.
`build-soll.mjs` bräuchte sie ein zweites Mal. Zwei Kopien derselben
Messlogik könnten genau auf die Art auseinanderlaufen, die diese Prüfung
aufdecken soll — dieselbe Begründung, mit der `check-parity.mjs` schon
heute `zustandSetzen` aus `harvest.mjs` importiert statt es nachzubauen.

Lege `tools/messen.mjs` an:

```js
/* Misst preview.html mit den KIT-Dateien und liefert die Computed
   Styles aller Katalog-Eintraege eines Modus.

   Einzige Messstelle fuer tools/check-parity.mjs (prueft gegen den
   Soll-Stand) UND tools/build-soll.mjs (erzeugt ihn). Eine zweite,
   von Hand nachgebaute Kopie koennte genau auf die Art auseinander-
   laufen, die die Paritaetspruefung aufdecken soll - dieselbe
   Begruendung, mit der check-parity.mjs schon zustandSetzen aus
   harvest.mjs importiert statt es nachzubauen. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { KATALOG, IMMER } from './katalog.mjs';
import { zustandSetzen, aufTransitionsEndeWarten, ZEITDECKEL_MS } from './harvest.mjs';
import { seiteBauen } from './build-preview.mjs';

/* preview.html ist committet, damit sie ohne Node/npm direkt aus einem
   Checkout im Browser oeffnet - aber "preview.html speist sich aus
   katalog.mjs" darf sich nicht auf die Disziplin kuenftiger Bearbeiter
   verlassen. Deshalb VOR jeder Messung ein struktureller Abgleich gegen
   den Generator. */
export async function previewAktuellPruefen() {
  const soll = seiteBauen();
  const ist = await readFile(path.resolve('preview.html'), 'utf8');
  if (soll !== ist) {
    console.error(
      'preview.html ist veraltet - passt nicht mehr zu tools/katalog.mjs.\n' +
      '  Ursache: katalog.mjs (oder tools/build-preview.mjs selbst) wurde geaendert,\n' +
      '  ohne preview.html danach neu zu erzeugen.\n' +
      '  Fix: npm run build:preview  (und das Ergebnis committen).'
    );
    process.exit(1);
  }
}

/* Messwert erst uebernehmen, wenn zwei aufeinanderfolgende Lesungen
   (mit einem doppelten rAF-Tick dazwischen) UEBEREINSTIMMEN. Grund:
   auf der grossen Sammelseite lieferte getComputedStyle nach dem
   .finished-Promise einer Transition vereinzelt noch einen Zwischen-
   wert - beobachtet bei pm-select__trigger--hover, grob jeder 2.-5.
   volle Lauf. Das beobachtet den tatsaechlich gerenderten Wert, statt
   sich auf Animation-Metadaten zu verlassen. Deckel bei 20 Versuchen. */
async function messenStabil(seite, sel, props, pseudo) {
  const lesen = () => seite.evaluate(({ sel, props, pseudo }) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const s = getComputedStyle(el, pseudo || undefined);
    return Object.fromEntries(props.map((p) => [p, s.getPropertyValue(p).trim()]));
  }, { sel, props, pseudo: pseudo ?? null });

  let vorher = await lesen();
  if (!vorher) return null;
  for (let versuch = 0; versuch < 20; versuch++) {
    await seite.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const jetzt = await lesen();
    if (JSON.stringify(jetzt) === JSON.stringify(vorher)) return jetzt;
    vorher = jetzt;
  }
  return vorher;
}

/* Liefert { katalogId: { eigenschaft: wert } } fuer einen Modus.
   Eintraege, deren messSelektor in preview.html nichts findet, landen
   als null - der Aufrufer entscheidet, ob das ein Fehler ist. */
export async function messeVorschau(browser, modus) {
  const seite = await browser.newPage();
  try {
    await seite.goto(pathToFileURL(path.resolve('preview.html')).href, { waitUntil: 'load' });
    await seite.evaluate((m) => document.documentElement.setAttribute('data-theme', m), modus);

    const raus = {};
    for (const k of KATALOG) {
      const sel = k.messSelektor;
      const props = [...new Set([...k.eigenschaften, ...IMMER])];

      /* Dieselbe Reihenfolge wie in harvest.mjs's ernten(): Zustand
         setzen, auf das Transitionsende warten (nur wenn ueberhaupt
         ein Zustand erzwungen wurde), messen, zuruecksetzen - sonst
         kontaminiert ein Hover-/Fokus-Rest den naechsten Eintrag auf
         derselben Sammelseite. */
      await zustandSetzen(seite, k);
      if (k.erzwingen?.length) {
        await aufTransitionsEndeWarten(seite, sel, k.id, ZEITDECKEL_MS, !!k.pseudo);
      }

      raus[k.id] = k.erzwingen?.length
        ? await messenStabil(seite, sel, props, k.pseudo)
        : await seite.evaluate(({ sel, props, pseudo }) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const s = getComputedStyle(el, pseudo || undefined);
            return Object.fromEntries(props.map((p) => [p, s.getPropertyValue(p).trim()]));
          }, { sel, props, pseudo: k.pseudo ?? null });

      if (k.erzwingen?.includes('hover')) await seite.mouse.move(0, 0);
      if (k.erzwingen?.includes('focus-visible')) {
        await seite.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        });
      }
    }
    return raus;
  } finally {
    await seite.close();
  }
}
```

- [ ] **Schritt 3: Den fehlschlagenden Test für `build-soll` schreiben**

Lege `tools/build-soll.test.mjs` an. Getestet wird die reine
Vergleichsfunktion und das Schreibverhalten — **nicht** der
Browser-Lauf, der dauert zu lange für einen Test.

```js
/* Test fuer tools/build-soll.mjs.

   Geprueft wird die reine Vergleichslogik und das Schreibverhalten,
   NICHT der Browser-Lauf: ein voller Messlauf dauert Minuten und
   gehoert in npm run soll, nicht in die Testkette. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { abweichungenFinden } from './build-soll.mjs';

test('1. Gleiche Messung ergibt keine Abweichung', () => {
  const a = { light: { btn: { color: 'rgb(0, 0, 0)' } }, dark: {} };
  const b = { light: { btn: { color: 'rgb(0, 0, 0)' } }, dark: {} };
  assert.deepEqual(abweichungenFinden(a, b), []);
});

test('2. Geaenderter Wert nennt Modus, Eintrag, Eigenschaft, alt und neu', () => {
  const alt = { light: { btn: { color: 'rgb(0, 0, 0)' } }, dark: {} };
  const neu = { light: { btn: { color: 'rgb(255, 0, 0)' } }, dark: {} };
  assert.deepEqual(abweichungenFinden(alt, neu), [
    { modus: 'light', id: 'btn', eigenschaft: 'color', alt: 'rgb(0, 0, 0)', neu: 'rgb(255, 0, 0)' },
  ]);
});

test('3. Neuer Katalog-Eintrag erscheint mit alt: null', () => {
  const alt = { light: {}, dark: {} };
  const neu = { light: { tabelle: { width: '100%' } }, dark: {} };
  assert.deepEqual(abweichungenFinden(alt, neu), [
    { modus: 'light', id: 'tabelle', eigenschaft: 'width', alt: null, neu: '100%' },
  ]);
});

test('4. Entfernter Katalog-Eintrag erscheint mit neu: null', () => {
  const alt = { light: { alt1: { width: '10px' } }, dark: {} };
  const neu = { light: {}, dark: {} };
  assert.deepEqual(abweichungenFinden(alt, neu), [
    { modus: 'light', id: 'alt1', eigenschaft: 'width', alt: '10px', neu: null },
  ]);
});

test('5. Dunkelmodus wird eigenstaendig verglichen', () => {
  const alt = { light: { btn: { color: 'a' } }, dark: { btn: { color: 'b' } } };
  const neu = { light: { btn: { color: 'a' } }, dark: { btn: { color: 'c' } } };
  assert.deepEqual(abweichungenFinden(alt, neu), [
    { modus: 'dark', id: 'btn', eigenschaft: 'color', alt: 'b', neu: 'c' },
  ]);
});

test('6. npm run check ruft soll NICHT auf', async () => {
  /* Der Kern des Umbaus (Spec 6.2): solange Erzeugen und Pruefen in
     einem Befehl stecken, "repariert" sich jede unbeabsichtigte
     Aenderung selbst. */
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.ok(pkg.scripts.soll, 'Skript "soll" fehlt in package.json');
  assert.ok(
    !/\bsoll\b/.test(pkg.scripts.check),
    `npm run check darf "soll" nicht aufrufen, enthaelt aber: ${pkg.scripts.check}`
  );
});
```

- [ ] **Schritt 4: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd /c/Dev/pm-design-kit
node --test tools/build-soll.test.mjs
```

Erwartet: FEHLSCHLAG, `Cannot find module` für `./build-soll.mjs` —
die Datei gibt es noch nicht.

- [ ] **Schritt 5: `tools/build-soll.mjs` schreiben**

```js
/* Erzeugt den freigegebenen Soll-Stand des Kits (extraktion/soll-*.json).

   Warum getrennt von check:paritaet (Spec 6.2): solange Erzeugen und
   Pruefen in einem Befehl stecken, "repariert" sich jede unbeabsichtigte
   Aenderung selbst und das Netz ist keines mehr. Deshalb zwei Befehle:

     npm run soll                   zeigt, was sich aendern WUERDE. Schreibt nichts.
     npm run soll -- --uebernehmen  schreibt.

   Die Flagge IST die von der Spec verlangte Bestaetigung - keine
   interaktive Abfrage. Sie funktioniert auch in einer Prueflette, sie
   ist im Commit sichtbar, und sie kann nicht versehentlich durch ein
   Zeilenende ausgeloest werden.

   Der Soll-Stand enthaelt bewusst NUR den komponenten-Block, keine
   Tokens: die Token-Paritaet zwischen css/tokens.css und tokens.json
   sichert bereits check:tokens, eine zweite Kopie waere eine
   Doppelung, die auseinanderlaufen kann.                             */
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { messeVorschau, previewAktuellPruefen } from './messen.mjs';

const MODI = ['light', 'dark'];
const ZIEL = (modus) => path.resolve('extraktion', `soll-${modus}.json`);

/* Vergleicht zwei Messungen der Form { light: {...}, dark: {...} }.
   Liefert eine flache, sortierte Liste - je Modus, Eintrag und
   Eigenschaft eine Zeile. Fehlende Seiten erscheinen als null. */
export function abweichungenFinden(alt, neu) {
  const raus = [];
  for (const modus of MODI) {
    const a = alt[modus] ?? {};
    const n = neu[modus] ?? {};
    for (const id of [...new Set([...Object.keys(a), ...Object.keys(n)])].sort()) {
      const ae = a[id] ?? {};
      const ne = n[id] ?? {};
      for (const p of [...new Set([...Object.keys(ae), ...Object.keys(ne)])].sort()) {
        const av = ae[p] ?? null;
        const nv = ne[p] ?? null;
        if (av !== nv) raus.push({ modus, id, eigenschaft: p, alt: av, neu: nv });
      }
    }
  }
  return raus;
}

async function bisherigenSollLesen() {
  const raus = {};
  for (const modus of MODI) {
    try {
      raus[modus] = JSON.parse(await readFile(ZIEL(modus), 'utf8')).komponenten;
    } catch (fehler) {
      if (fehler.code !== 'ENOENT') throw fehler;
      raus[modus] = {};   // erster Lauf: es gibt noch keinen Soll-Stand
    }
  }
  return raus;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const uebernehmen = process.argv.includes('--uebernehmen');
  await previewAktuellPruefen();

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const neu = {};
  try {
    for (const modus of MODI) neu[modus] = await messeVorschau(browser, modus);
  } finally {
    await browser.close();
  }

  const fehlend = [];
  for (const modus of MODI) {
    for (const [id, wert] of Object.entries(neu[modus])) {
      if (wert === null) fehlend.push(`${modus} ${id}`);
    }
  }
  if (fehlend.length) {
    console.error(`${fehlend.length} Katalog-Eintrag/-Eintraege in preview.html nicht gefunden:`);
    for (const f of fehlend) console.error('  - ' + f);
    console.error('\nKein Soll-Stand geschrieben. tools/katalog.mjs pruefen, dann npm run build:preview.');
    process.exit(1);
  }

  const alt = await bisherigenSollLesen();
  const abw = abweichungenFinden(alt, neu);

  if (!abw.length) {
    console.log('Der Soll-Stand ist bereits aktuell - keine Abweichung. Nichts geschrieben.');
    process.exit(0);
  }

  /* Deckel auf der Ausgabe: der ERSTE Lauf hat keinen bisherigen
     Soll-Stand und meldet folglich jede Eigenschaft jedes Eintrags als
     neu - mehrere Tausend Zeilen. Danach sind es typischerweise eine
     Handvoll. Der Deckel haelt den ersten Lauf lesbar, ohne die
     spaeteren zu beschneiden; die vollstaendige Liste steht bei Bedarf
     in extraktion/soll-abweichungen.txt. */
  const DECKEL = 40;
  console.log(`${abw.length} Abweichung(en) gegenueber dem bisherigen Soll-Stand:`);
  for (const a of abw.slice(0, DECKEL)) {
    console.log(`  - ${a.modus.padEnd(5)} ${a.id}.${a.eigenschaft}: ${a.alt ?? '(neu)'} -> ${a.neu ?? '(entfaellt)'}`);
  }
  if (abw.length > DECKEL) {
    console.log(`  … und ${abw.length - DECKEL} weitere - vollstaendig in extraktion/soll-abweichungen.txt`);
  }
  await writeFile(
    path.resolve('extraktion', 'soll-abweichungen.txt'),
    abw.map((a) => `${a.modus}\t${a.id}\t${a.eigenschaft}\t${a.alt ?? ''}\t${a.neu ?? ''}`).join('\n') + '\n',
    'utf8'
  );

  if (!uebernehmen) {
    console.log('\nNichts geschrieben. Jede Zeile oben pruefen; wenn sie ALLE beabsichtigt sind:');
    console.log('  npm run soll -- --uebernehmen');
    process.exit(0);
  }

  for (const modus of MODI) {
    const inhalt = { modus, erzeugtVon: 'tools/build-soll.mjs', komponenten: neu[modus] };
    await writeFile(ZIEL(modus), JSON.stringify(inhalt, null, 2) + '\n', 'utf8');
  }
  console.log(`\nUebernommen: soll-light.json und soll-dark.json neu geschrieben (${abw.length} Abweichung(en)).`);
}
```

- [ ] **Schritt 6: Test laufen lassen, Erfolg bestätigen**

```bash
cd /c/Dev/pm-design-kit
node --test tools/build-soll.test.mjs
```

Erwartet: Test 1–5 BESTANDEN. Test 6 schlägt noch fehl („Skript `soll`
fehlt") — das behebt Schritt 7.

- [ ] **Schritt 7: `package.json` um die neuen Skripte ergänzen**

In `"scripts"` einfügen, hinter `"build:preview"`:

```json
    "soll": "node tools/build-soll.mjs",
    "test:soll": "node --test tools/build-soll.test.mjs",
```

`"check"` bleibt **unverändert**. Prüfen, dass dort `soll` nirgends
vorkommt.

```bash
cd /c/Dev/pm-design-kit
node --test tools/build-soll.test.mjs
```

Erwartet: alle sechs Tests BESTANDEN.

- [ ] **Schritt 8: Die Vorlage-Ernte umbenennen**

`git mv` benutzen, damit Git die Umbenennung als solche sieht statt als
Löschen plus Anlegen:

```bash
cd /c/Dev/pm-design-kit
git mv extraktion/ist-light.json extraktion/vorlage-light.json
git mv extraktion/ist-dark.json extraktion/vorlage-dark.json
git mv extraktion/ist-glass-aus.json extraktion/vorlage-glass-aus.json
```

Dann alle textlichen Verweise nachziehen. Die Fundstellen mit dem
**dedizierten Grep-Werkzeug** suchen (Muster: `ist-light|ist-dark|ist-glass-aus`),
nicht über die Shell. Zu erwarten sind rund 25 Stellen in
`CHANGELOG.md`, `DESIGN.md`, `css/base.css`, `css/components.css`,
`css/tokens.css`, `css/surface-glass.css`, `tools/check-parity.mjs` und
`tools/harvest.mjs`.

**Wichtig für die Kommentare in `CHANGELOG.md`:** Dort stehen Sätze wie
„alle Werte aus `extraktion/ist-light.json`". Die bleiben inhaltlich
richtig — es ist dieselbe Datei — also nur den Namen ersetzen, den Satz
nicht umschreiben. In `DESIGN.md:20` dagegen die Rollenbeschreibung
anpassen: aus „165 gemessene Komponenten-Zustände" wird
„165 gemessene Komponenten-Zustände der Vorlage, Stand 2026-09-21 —
historischer Bezug, seit B1 nicht mehr Prüfgrundlage (siehe
`extraktion/soll-*.json`)".

- [ ] **Schritt 9: `harvest.mjs` gegen versehentliches Überschreiben sichern**

Die Vorlage-Ernte ist ab jetzt eingefroren (Spec 6.4). Ein
unbedachtes `npm run ernte` würde sie stillschweigend auf den
heutigen Stand der Quelle ziehen und damit den historischen Bezug
zerstören.

`tools/harvest.mjs:330-341` ersetzen durch:

```js
/* Direktaufruf: beide Modi ernten und schreiben.

   Seit B1 ist die Vorlage-Ernte eingefroren (Spec 6.4): sie
   dokumentiert, wie die Anwendung am 2026-09-21 aussah, und ist NICHT
   mehr Pruefgrundlage - das ist extraktion/soll-*.json, erzeugt von
   tools/build-soll.mjs. Ein unbedachtes "npm run ernte" wuerde diesen
   historischen Bezug stillschweigend auf den heutigen Stand der Quelle
   ziehen. Deshalb schreibt der Direktaufruf nur noch mit ausdruecklicher
   Flagge. */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes('--vorlage-neu-erzeugen')) {
    console.error(
      'Die Vorlage-Ernte (extraktion/vorlage-*.json) ist seit B1 eingefroren.\n' +
      '  Sie haelt fest, wie das Berichtsheft am 2026-09-21 aussah, und ist NICHT\n' +
      '  mehr Pruefgrundlage - das ist extraktion/soll-*.json (npm run soll).\n' +
      '  Neu erzeugen nur, wenn die Vorlage bewusst auf einen neueren Stand der\n' +
      '  Anwendung gezogen werden soll:\n' +
      '    npm run ernte -- --vorlage-neu-erzeugen\n' +
      '  Nichts geschrieben.'
    );
    process.exit(1);
  }
  await mkdir(ZIEL, { recursive: true });
  const ohneGlas = process.argv.includes('--ohne-glas');
  const laeufe = ohneGlas
    ? [{ modus: 'light', glas: false, name: 'vorlage-glass-aus.json' }]
    : [{ modus: 'light', glas: true, name: 'vorlage-light.json' },
       { modus: 'dark',  glas: true, name: 'vorlage-dark.json' }];
  for (const l of laeufe) {
    const e = await ernten(l);
    await writeFile(path.join(ZIEL, l.name), JSON.stringify(e, null, 2) + '\n', 'utf8');
    console.log(`${l.name}: ${Object.keys(e.tokens).length} Tokens, ${Object.keys(e.komponenten).length} Komponenten`);
  }
}
```

Der Export `ernten()` bleibt unverändert — `tools/harvest.test.mjs`
benutzt ihn direkt und darf nicht brechen.

- [ ] **Schritt 10: `check-parity.mjs` auf den Soll-Stand umbauen**

Die Datei vollständig ersetzen:

```js
/* Rendert preview.html mit den KIT-Dateien und vergleicht die Computed
   Styles gegen den freigegebenen Soll-Stand (extraktion/soll-light.json,
   soll-dark.json).

   Rollenwechsel in B1 (Spec 6.1): bis 0.1.0 wurde gegen die VORLAGE
   geprueft - den gemessenen Ist-Zustand des Berichtshefts. Das war der
   Beweis, dass Schritt A eine Spiegelung ist. Ab B1 aendert das Kit
   absichtlich Werte; die Vorlage bleibt als extraktion/vorlage-*.json
   liegen (historischer Bezug, nie wieder Pruefgrundlage), und geprueft
   wird gegen den Soll-Stand, den npm run soll -- --uebernehmen nach
   einer freigegebenen Aenderung schreibt.

   Was diese Pruefung damit noch leistet und was nicht: sie beweist
   NICHT mehr die Treue zur Vorlage - das kann sie nicht, seit
   Abweichungen gewollt sind. Sie faengt ab, was zwischen zwei
   Freigaben UNBEABSICHTIGT kippt: eine Regel, die eine zweite Komponente
   miterwischt, eine Kaskadenfolge, die niemand vorhergesehen hat. Genau
   dafuer muss das Erzeugen ein eigener, ausdruecklicher Schritt bleiben
   (siehe tools/build-soll.mjs).

   Die Zustandslogik kommt weiterhin aus harvest.mjs (ueber messen.mjs),
   nicht aus einer zweiten Kopie - siehe dortigen Kommentar.            */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { KATALOG } from './katalog.mjs';
import { messeVorschau, previewAktuellPruefen } from './messen.mjs';

await previewAktuellPruefen();

/* Eigenschaften, deren Abweichung erwartet und begruendet ist.
   Absichtlich knapp gehalten: jeder Eintrag wird erst nach einem
   echten, beobachteten Messlauf eingetragen, nie vorsorglich.
   Format: 'katalog-id': { modus?: [...], alle?: [...] }.
   Aktuell LEER - und das soll so bleiben: seit B1 gibt es fuer eine
   gewollte Abweichung den richtigen Weg (npm run soll), also hat eine
   Duldung hier keinen legitimen Anlass mehr. */
const GEDULDET = {};

function geduldet(id, modus, prop) {
  const e = GEDULDET[id];
  if (!e) return false;
  if (e.alle?.includes(prop)) return true;
  if (e[modus]?.includes(prop)) return true;
  return false;
}

const abweichungen = [];
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const modus of ['light', 'dark']) {
    let soll;
    try {
      soll = JSON.parse(await readFile(`extraktion/soll-${modus}.json`, 'utf8')).komponenten;
    } catch (fehler) {
      if (fehler.code !== 'ENOENT') throw fehler;
      console.error(
        `extraktion/soll-${modus}.json fehlt - es gibt noch keinen freigegebenen Soll-Stand.\n` +
        '  Einmalig erzeugen: npm run soll -- --uebernehmen\n' +
        '  (Vorher npm run soll ohne Flagge laufen lassen und die Liste pruefen.)'
      );
      process.exit(1);
    }

    const ist = await messeVorschau(browser, modus);

    for (const k of KATALOG) {
      const gemessen = ist[k.id];
      if (!gemessen) {
        abweichungen.push(`${modus} ${k.id}: in preview.html nicht gefunden (${k.messSelektor})`);
        continue;
      }
      const erwartet = soll[k.id];
      if (!erwartet) {
        abweichungen.push(`${modus} ${k.id}: im Soll-Stand nicht enthalten - neuer Katalog-Eintrag? npm run soll`);
        continue;
      }
      for (const [p, wert] of Object.entries(gemessen)) {
        if (geduldet(k.id, modus, p)) continue;
        if (erwartet[p] !== undefined && erwartet[p] !== wert) {
          abweichungen.push(`${modus} ${k.id}.${p}: Soll "${erwartet[p]}" vs Kit "${wert}"`);
        }
      }
    }
  }
} finally {
  await browser.close();
}

const geprueft = KATALOG.length * 2;
const wieViele = `${KATALOG.length} Eintraege x 2 Modi = ${geprueft} gepruefte Zustaende`;
if (abweichungen.length) {
  console.error(`${abweichungen.length} Abweichung(en) zwischen Soll-Stand und Kit (${wieViele}):`);
  for (const a of abweichungen) console.error('  - ' + a);
  console.error('\nWar die Aenderung beabsichtigt? Dann: npm run soll (pruefen) und npm run soll -- --uebernehmen.');
  process.exit(1);
}
console.log(`OK: Das Kit rendert zeichengleich zum freigegebenen Soll-Stand (${wieViele}, 0 Abweichungen).`);
```

- [ ] **Schritt 11: Den ersten Soll-Stand erzeugen und gegen die Vorlage prüfen**

Das ist die entscheidende Verifikation dieser Aufgabe: Der erste
Soll-Stand wird aus einem Kit erzeugt, das noch **nichts** geändert hat.
Er muss deshalb in jedem gemessenen Wert mit der Vorlage
übereinstimmen — sonst hat der Umbau selbst etwas verschoben.

```bash
cd /c/Dev/pm-design-kit
npm run soll
```

Erwartet: Es gibt noch keinen Soll-Stand, also ist **jede Eigenschaft
jedes Eintrags** neu — mehrere Tausend Zeilen der Form `… : (neu) -> …`.
Die Konsole zeigt davon die ersten 40 und die Gesamtzahl; die
vollständige Liste landet in `extraktion/soll-abweichungen.txt`.
Nichts am Soll-Stand geschrieben.

`extraktion/soll-abweichungen.txt` ist ein Zwischenstand und gehört
**nicht** ins Repo — in `.gitignore` aufnehmen (die Datei anlegen, falls
es sie noch nicht gibt).

```bash
npm run soll -- --uebernehmen
```

Erwartet: „Uebernommen: soll-light.json und soll-dark.json neu
geschrieben".

Jetzt der Abgleich gegen die eingefrorene Vorlage:

```bash
node -e "
import('node:fs/promises').then(async (fs) => {
  let abw = 0, geprueft = 0;
  for (const m of ['light', 'dark']) {
    const v = JSON.parse(await fs.readFile('extraktion/vorlage-' + m + '.json', 'utf8')).komponenten;
    const s = JSON.parse(await fs.readFile('extraktion/soll-' + m + '.json', 'utf8')).komponenten;
    for (const id of Object.keys(s)) {
      for (const [p, w] of Object.entries(s[id])) {
        if (v[id]?.[p] === undefined) continue;
        geprueft++;
        if (v[id][p] !== w) { abw++; console.log(m, id + '.' + p, ':', v[id][p], '!=', w); }
      }
    }
  }
  console.log('Vorlage vs. erster Soll-Stand:', geprueft, 'Werte verglichen,', abw, 'Abweichungen');
});
"
```

Erwartet: **0 Abweichungen.** Ist es nicht 0, hat der Umbau etwas
verschoben — Ursache finden, **nicht** den Soll-Stand als „halt so"
übernehmen.

- [ ] **Schritt 12: Vollständige Prüfkette**

```bash
cd /c/Dev/pm-design-kit
npm run test:soll
npm run check
```

Erwartet: Tests bestanden; alle sechs Prüfungen grün, darunter
`check:paritaet` mit „zeichengleich zum freigegebenen Soll-Stand
(165 Eintraege x 2 Modi = 330 gepruefte Zustaende, 0 Abweichungen)".

- [ ] **Schritt 13: `README.md` um die neue Werkzeugkette ergänzen**

In der Skript-Übersicht `soll` aufnehmen und die Rolle der beiden
Extraktionsstände in zwei Sätzen erklären: `vorlage-*.json` ist der
eingefrorene Zustand der Anwendung vom 2026-09-21, `soll-*.json` der
freigegebene Zielzustand des Kits.

- [ ] **Schritt 14: Commit**

```bash
cd /c/Dev/pm-design-kit
git add -A
git commit -m "$(cat <<'MSG'
refactor(pruefung): Paritaet prueft gegen Soll-Stand statt gegen die Vorlage

Ab B1 aendert das Kit absichtlich gerenderte Werte. Die bisherige
Pruefung gegen die Vorlage-Ernte waere damit ab der ersten Farbkorrektur
dauerhaft rot - und das Netz genau in der Phase mit den meisten
Aenderungen weg.

- extraktion/ist-*.json -> vorlage-*.json (eingefroren, nur noch Bezug)
- extraktion/soll-*.json neu: freigegebener Zielzustand, Pruefgrundlage
- npm run soll zeigt die Abweichung, schreibt nur mit --uebernehmen
- npm run check ruft soll nie auf (per Test abgesichert)
- Messlogik nach tools/messen.mjs, von Pruefung und Erzeugung geteilt
- npm run ernte schreibt die Vorlage nur noch mit ausdruecklicher Flagge

Der erste Soll-Stand stimmt in allen 330 gemessenen Zustaenden mit der
Vorlage ueberein - der Umbau selbst hat nichts verschoben.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
MSG
)"
```

---

### Aufgabe 2: Farbwerkzeug — Rechnen statt Raten

**Warum:** Spec 3.2 verlangt „Farbwinkel bleibt, so wenig wie möglich,
Zielwert mindestens 4,6:1". Das ist eine Rechnung, keine
Geschmacksfrage — und sie muss für 21 Paare reproduzierbar dieselbe
Antwort geben. Ein von Hand geratener Hexwert erfüllt keine der drei
Bedingungen nachweisbar.

**Dateien:**
- Anlegen: `tools/farbe.mjs`
- Anlegen: `tools/ton-suchen.mjs`
- Anlegen: `tools/ton-suchen.test.mjs`
- Ändern: `tools/check-contrast.mjs:20-105` (Farbmathematik herausgezogen)
- Ändern: `package.json` (Skript `test:farbe`)

**Schnittstellen:**
- Liefert: `farbe.mjs` exportiert
  `zuRgba(farbe: string) → [r, g, b, a]`,
  `leuchtdichte([r,g,b]) → number`,
  `kontrast([r,g,b], [r,g,b]) → number`,
  `ueberlagern([r,g,b,a], [r,g,b]) → [r,g,b]`,
  `rgbZuHsl([r,g,b]) → [h, s, l]` (h in Grad 0–360, s/l in 0–1),
  `hslZuRgb([h,s,l]) → [r,g,b]` (0–255, gerundet),
  `alsHex([r,g,b]) → string` (Großbuchstaben, `#RRGGBB`).
- Liefert: `ton-suchen.mjs` exportiert
  `sucheHelligkeit({ vg, hg, unter, ziel }) → { wert, kontrast, schritte } | null`
  und `sucheDeckkraft({ vg, hg, unter, ziel }) → { wert, kontrast, schritte } | null`.
  `vg`/`hg`/`unter` sind Farb-Zeichenketten (Hex oder `rgb()`/`rgba()`),
  `ziel` eine Zahl. `wert` ist die neue Farbe als Zeichenkette in
  derselben Notation wie die Eingabe.
- Verbraucht: nichts aus anderen Aufgaben.

**Diese Aufgabe ändert nichts Gerendertes.** `npm run soll` darf danach
„bereits aktuell" melden. Meldet es eine Abweichung, hat der Umbau von
`check-contrast.mjs` etwas kaputtgemacht.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

Lege `tools/ton-suchen.test.mjs` an:

```js
/* Test fuer tools/farbe.mjs und tools/ton-suchen.mjs.

   Der Zweck des Werkzeugs ist, Spec 3.2 rechenbar zu machen:
   Farbwinkel bleibt, Eingriff so klein wie moeglich, Ziel mindestens
   4,6:1. Genau diese drei Eigenschaften werden hier geprueft - nicht
   einzelne Hexwerte, die sich mit jeder Feinjustierung aendern wuerden. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { zuRgba, kontrast, rgbZuHsl, hslZuRgb, alsHex, ueberlagern } from './farbe.mjs';
import { sucheHelligkeit, sucheDeckkraft } from './ton-suchen.mjs';

test('1. HSL-Hin- und Rueckweg ist verlustfrei genug', () => {
  for (const hex of ['#909096', '#B71C1C', '#FFC300', '#6B6B6B', '#000000', '#FFFFFF']) {
    const rgb = zuRgba(hex).slice(0, 3);
    const zurueck = hslZuRgb(rgbZuHsl(rgb));
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(rgb[i] - zurueck[i]) <= 1, `${hex}: Kanal ${i} ${rgb[i]} -> ${zurueck[i]}`);
    }
  }
});

test('2. Bekannte Kontrastwerte stimmen', () => {
  /* Schwarz auf Weiss ist per Definition 21:1. */
  assert.ok(Math.abs(kontrast([0, 0, 0], [255, 255, 255]) - 21) < 0.01);
  /* Der dokumentierte Ist-Befund aus kontrast-paare.json:
     --pm-grey-400 dunkel (#909096) auf --pm-white dunkel (#3D3D3D). */
  const v = kontrast(zuRgba('#909096').slice(0, 3), zuRgba('#3D3D3D').slice(0, 3));
  assert.ok(Math.abs(v - 3.42) < 0.01, `erwartet ~3.42, gerechnet ${v.toFixed(2)}`);
});

test('3. sucheHelligkeit haelt den Farbwinkel fest', () => {
  const vorher = rgbZuHsl(zuRgba('#B71C1C').slice(0, 3));
  const treffer = sucheHelligkeit({ vg: '#B71C1C', hg: '#3D3D3D', ziel: 4.6 });
  assert.ok(treffer, 'kein Treffer gefunden');
  const nachher = rgbZuHsl(zuRgba(treffer.wert).slice(0, 3));
  assert.ok(Math.abs(vorher[0] - nachher[0]) <= 1.5, `Farbwinkel ${vorher[0]} -> ${nachher[0]}`);
});

test('4. sucheHelligkeit erreicht das Ziel und uebertrifft es nicht unnoetig', () => {
  const treffer = sucheHelligkeit({ vg: '#B71C1C', hg: '#3D3D3D', ziel: 4.6 });
  assert.ok(treffer.kontrast >= 4.6, `erreicht nur ${treffer.kontrast.toFixed(2)}`);
  /* "So wenig wie moeglich": der Schritt davor darf das Ziel noch
     NICHT erreichen, sonst war der Eingriff groesser als noetig. */
  assert.ok(treffer.kontrast < 4.9, `ueberschiesst auf ${treffer.kontrast.toFixed(2)}`);
});

test('5. sucheDeckkraft hebt die Deckkraft, nicht die Farbe', () => {
  const treffer = sucheDeckkraft({ vg: 'rgba(255, 255, 255, 0.25)', hg: '#2C2C2C', unter: '#2C2C2C', ziel: 4.6 });
  assert.ok(treffer, 'kein Treffer gefunden');
  assert.match(treffer.wert, /^rgba\(255, 255, 255, /, `Farbe veraendert: ${treffer.wert}`);
  assert.ok(treffer.kontrast >= 4.6, `erreicht nur ${treffer.kontrast.toFixed(2)}`);
});

test('6. Unerreichbares Ziel liefert null statt einer Notluege', () => {
  /* 21:1 gegen mittleres Grau ist mit keiner Helligkeit erreichbar. */
  assert.equal(sucheHelligkeit({ vg: '#808080', hg: '#808080', ziel: 21 }), null);
});

test('7. Transluzenter Vordergrund wird ueber die Flaeche gerechnet', () => {
  const auf = ueberlagern(zuRgba('rgba(255, 255, 255, 0.5)'), [0, 0, 0]);
  assert.deepEqual(auf.map(Math.round), [128, 128, 128]);
});

test('8. alsHex liefert Grossbuchstaben in sechs Stellen', () => {
  assert.equal(alsHex([255, 195, 0]), '#FFC300');
  assert.equal(alsHex([0, 0, 0]), '#000000');
});
```

- [ ] **Schritt 2: Test laufen lassen, Fehlschlag bestätigen**

```bash
cd /c/Dev/pm-design-kit
node --test tools/ton-suchen.test.mjs
```

Erwartet: FEHLSCHLAG, `Cannot find module './farbe.mjs'`.

- [ ] **Schritt 3: `tools/farbe.mjs` schreiben**

Die ersten vier Funktionen sind **wörtlich** aus
`tools/check-contrast.mjs:24-62` übernommen — nicht neu geschrieben,
sondern verschoben, damit sich das Verhalten der bestehenden 83 Paare
garantiert nicht ändert. Dazu kommen drei neue für die HSL-Rechnung.

```js
/* Farbmathematik als Modul.

   Herkunft: zuRgba/leuchtdichte/kontrast/ueberlagern lagen bis B1
   privat in tools/check-contrast.mjs. Sie sind hier WOERTLICH
   uebernommen, nicht neu geschrieben - tools/ton-suchen.mjs braucht
   exakt dieselbe Rechnung wie die Pruefung, sonst koennte das Werkzeug
   einen Wert vorschlagen, den die Pruefung danach verwirft.

   rgbZuHsl/hslZuRgb sind neu: Spec 3.2 verlangt "Farbwinkel bleibt",
   und HSL ist die Darstellung, in der der Farbwinkel eine eigene,
   unveraenderliche Zahl ist.                                        */

/* Farbe -> [r, g, b, a]. a ist 1, wenn die Farbe deckend ist (Hex oder
   rgb()/rgba() ohne vierten Wert). Nur 3-/6-stellige Hex-Notation - in
   den Quellen kommt kein 8-stelliges Hex vor. */
export function zuRgba(farbe) {
  const h = farbe.trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h);
  if (m) {
    const s = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
    const [r, g, b] = [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16));
    return [r, g, b, 1];
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(h);
  if (m) {
    const teile = m[1].split(',').map(v => v.trim());
    const [r, g, b] = teile.slice(0, 3).map(v => Math.round(parseFloat(v)));
    const a = teile.length > 3 ? parseFloat(teile[3]) : 1;
    return [r, g, b, a];
  }
  throw new Error(`Farbe nicht lesbar: ${farbe}`);
}

export function leuchtdichte([r, g, b]) {
  const f = [r, g, b].map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}

export function kontrast(a, b) {
  const [l1, l2] = [leuchtdichte(a), leuchtdichte(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/* Legt eine (moeglicherweise transluzente) Farbe [r,g,b,a] ueber eine
   deckende Flaeche [r,g,b] und liefert das deckende Ergebnis. */
export function ueberlagern([r, g, b, a], [hr, hg, hb]) {
  if (a >= 1) return [r, g, b];
  return [a * r + (1 - a) * hr, a * g + (1 - a) * hg, a * b + (1 - a) * hb];
}

/* [r,g,b] (0-255) -> [h, s, l] mit h in Grad 0-360, s und l in 0-1. */
export function rgbZuHsl([r, g, b]) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

/* [h, s, l] -> [r, g, b] (0-255, gerundet). */
export function hslZuRgb([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hs = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs(hs % 2 - 1));
  const m = l - c / 2;
  const [r1, g1, b1] =
    hs < 1 ? [c, x, 0] : hs < 2 ? [x, c, 0] : hs < 3 ? [0, c, x] :
    hs < 4 ? [0, x, c] : hs < 5 ? [x, 0, c] : [c, 0, x];
  return [r1, g1, b1].map(v => Math.round((v + m) * 255));
}

export function alsHex([r, g, b]) {
  return '#' + [r, g, b]
    .map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('').toUpperCase();
}
```

- [ ] **Schritt 4: `tools/ton-suchen.mjs` schreiben**

```js
/* Sucht den KLEINSTEN Eingriff, der ein Farbpaar ueber einen
   Zielkontrast hebt - die rechenbare Fassung von Spec 3.2
   ("Minimaleingriff mit erhaltenem Farbton").

   Zwei Stellschrauben, weil die Quelle zwei Arten von Textfarbe kennt:
     --stellschraube helligkeit  deckende Farben: H und S bleiben,
                                 L wandert in 0,2-%-Schritten
     --stellschraube deckkraft   transluzente Farben (Sidebar): die
                                 FARBE bleibt unveraendert, nur Alpha
                                 steigt in 0,01-Schritten

   Warum nicht einfach "heller machen, bis es passt": auf einer hellen
   Flaeche muss der Text DUNKLER werden, auf einer dunklen heller. Die
   Richtung wird deshalb aus dem Ausgangsverhaeltnis abgeleitet, nicht
   vorgegeben.

   Aufruf:
     node tools/ton-suchen.mjs --vg "#909096" --hg "#3D3D3D" --ziel 4.6
     node tools/ton-suchen.mjs --vg "rgba(255,255,255,0.25)" --hg "#2C2C2C" \
                               --unter "#2C2C2C" --ziel 4.6 --stellschraube deckkraft   */
import { pathToFileURL } from 'node:url';
import { zuRgba, leuchtdichte, kontrast, ueberlagern, rgbZuHsl, hslZuRgb, alsHex } from './farbe.mjs';

const L_SCHRITT = 0.002;
const A_SCHRITT = 0.01;

/* Rechnet Vordergrund und Hintergrund auf zwei deckende [r,g,b] herunter -
   dieselbe Reihenfolge wie in check-contrast.mjs: hg zuerst ueber 'unter',
   vg dann ueber das Ergebnis von hg. */
function deckend(vgRgba, hgRoh, unterRoh) {
  const hgRgba = zuRgba(hgRoh);
  const hgOpak = hgRgba[3] < 1
    ? ueberlagern(hgRgba, zuRgba(unterRoh).slice(0, 3))
    : hgRgba.slice(0, 3);
  const vgOpak = vgRgba[3] < 1 ? ueberlagern(vgRgba, hgOpak) : vgRgba.slice(0, 3);
  return [vgOpak, hgOpak];
}

function jetzigerKontrast(vgRgba, hg, unter) {
  const [v, h] = deckend(vgRgba, hg, unter);
  return kontrast(v, h);
}

export function sucheHelligkeit({ vg, hg, unter, ziel }) {
  const start = zuRgba(vg);
  const [h, s, l0] = rgbZuHsl(start.slice(0, 3));

  /* Richtung: ist der Vordergrund heller als die Flaeche, wird er noch
     heller - sonst dunkler. Das ist immer die Richtung, die den
     Kontrast vergroessert. Verglichen werden die FERTIG ueberlagerten
     Farben, nicht die rohen Deklarationen: bei einem transluzenten
     Vordergrund sagt dessen Rohwert nichts darueber, wie hell er auf
     der Flaeche tatsaechlich erscheint. */
  const [vgOpak, hgOpak] = deckend(start, hg, unter);
  const richtung = leuchtdichte(vgOpak) >= leuchtdichte(hgOpak) ? 1 : -1;

  for (let schritte = 1; schritte <= 500; schritte++) {
    const l = l0 + richtung * schritte * L_SCHRITT;
    if (l < 0 || l > 1) return null;
    const rgb = hslZuRgb([h, s, l]);
    const k = jetzigerKontrast([...rgb, start[3]], hg, unter);
    if (k >= ziel) {
      return { wert: start[3] >= 1 ? alsHex(rgb) : `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${start[3]})`, kontrast: k, schritte };
    }
  }
  return null;
}

export function sucheDeckkraft({ vg, hg, unter, ziel }) {
  const start = zuRgba(vg);
  if (start[3] >= 1) throw new Error(`sucheDeckkraft braucht eine transluzente Farbe, bekam: ${vg}`);
  for (let schritte = 1; schritte <= 100; schritte++) {
    const a = Math.min(1, +(start[3] + schritte * A_SCHRITT).toFixed(2));
    const k = jetzigerKontrast([start[0], start[1], start[2], a], hg, unter);
    if (k >= ziel) {
      return { wert: `rgba(${start[0]}, ${start[1]}, ${start[2]}, ${a})`, kontrast: k, schritte };
    }
    if (a >= 1) return null;
  }
  return null;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name, standard) => {
    const i = process.argv.indexOf('--' + name);
    return i === -1 ? standard : process.argv[i + 1];
  };
  const vg = arg('vg');
  const hg = arg('hg');
  const unter = arg('unter', hg);
  const ziel = Number(arg('ziel', '4.6'));
  const stellschraube = arg('stellschraube', 'helligkeit');
  if (!vg || !hg) {
    console.error('Aufruf: node tools/ton-suchen.mjs --vg <farbe> --hg <farbe> [--unter <farbe>] [--ziel 4.6] [--stellschraube helligkeit|deckkraft]');
    process.exit(1);
  }

  const vorher = jetzigerKontrast(zuRgba(vg), hg, unter);
  console.log(`vorher: ${vg} auf ${hg}${unter !== hg ? ` (ueber ${unter})` : ''} = ${vorher.toFixed(2)}:1`);
  if (vorher >= ziel) {
    console.log(`Ziel ${ziel}:1 ist bereits erreicht - kein Eingriff noetig.`);
    process.exit(0);
  }

  const treffer = stellschraube === 'deckkraft'
    ? sucheDeckkraft({ vg, hg, unter, ziel })
    : sucheHelligkeit({ vg, hg, unter, ziel });

  if (!treffer) {
    console.error(`Ziel ${ziel}:1 ist ueber die ${stellschraube} allein NICHT erreichbar.`);
    console.error('  Naechster Schritt: die FLAECHE anpassen statt den Text, oder das Paar');
    console.error('  als begruendete Ausnahme in tools/kontrast-paare.json belassen.');
    process.exit(1);
  }
  console.log(`nachher: ${treffer.wert} = ${treffer.kontrast.toFixed(2)}:1 (${treffer.schritte} Schritt(e))`);
}
```

- [ ] **Schritt 5: Test laufen lassen, Erfolg bestätigen**

```bash
cd /c/Dev/pm-design-kit
node --test tools/ton-suchen.test.mjs
```

Erwartet: alle acht Tests BESTANDEN. Schlägt Test 4 fehl
(„überschießt"), ist `L_SCHRITT` zu grob — auf `0.001` halbieren und
erneut laufen lassen; **nicht** die Schranke im Test lockern.

- [ ] **Schritt 6: `check-contrast.mjs` auf das Modul umstellen**

In `tools/check-contrast.mjs` die vier Funktionsdefinitionen
`zuRgba`, `leuchtdichte`, `kontrast` und `ueberlagern` (Zeilen 24–62)
ersatzlos löschen und durch einen Import ersetzen:

```js
import { zuRgba, kontrast, ueberlagern } from './farbe.mjs';
```

`leuchtdichte` wird in `check-contrast.mjs` nur von `kontrast` benutzt
und muss dort nicht mehr importiert werden. Alles Übrige — `wert()`,
`farbe()`, `deckendeFarben()`, die Schleife, die Schlusszeile — bleibt
**unverändert**. Insbesondere das Ausgabeformat
`OK: N Paare geprueft, M dokumentierte Befunde.` darf sich nicht
ändern: `check-zahlen.mjs` liest es per regulärem Ausdruck.

- [ ] **Schritt 7: Beweisen, dass sich nichts verschoben hat**

```bash
cd /c/Dev/pm-design-kit
npm run check:kontrast
```

Erwartet: **wörtlich dieselbe Ausgabe wie vor dem Umbau** —
„OK: 83 Paare geprueft, 21 dokumentierte Befunde." plus die
21 Befundzeilen mit unveränderten Zahlen. Weicht auch nur eine
Nachkommastelle ab, ist beim Verschieben etwas passiert.

- [ ] **Schritt 8: `package.json` ergänzen und volle Prüfkette**

In `"scripts"` einfügen:

```json
    "test:farbe": "node --test tools/ton-suchen.test.mjs",
```

```bash
cd /c/Dev/pm-design-kit
npm run test:farbe
npm run check
npm run soll
```

Erwartet: Tests bestanden, alle sechs Prüfungen grün, und
`npm run soll` meldet **„Der Soll-Stand ist bereits aktuell — keine
Abweichung."** Diese Aufgabe fasst kein CSS an.

- [ ] **Schritt 9: Commit**

```bash
cd /c/Dev/pm-design-kit
git add -A
git commit -m "$(cat <<'MSG'
feat(werkzeug): Farbmathematik als Modul, Tonsuche fuer die AA-Reparaturen

Spec 3.2 verlangt "Farbwinkel bleibt, so wenig wie moeglich, Ziel
mindestens 4,6:1". Das ist eine Rechnung, die fuer 21 Paare
reproduzierbar dieselbe Antwort geben muss - ein von Hand geratener
Hexwert erfuellt keine der drei Bedingungen nachweisbar.

- tools/farbe.mjs: zuRgba/leuchtdichte/kontrast/ueberlagern woertlich
  aus check-contrast.mjs herausgezogen, dazu HSL-Umrechnung
- tools/ton-suchen.mjs: sucht den kleinsten Eingriff ueber Helligkeit
  (deckende Farben) oder Deckkraft (transluzente Sidebar-Literale)
- check-contrast.mjs bezieht die Rechnung jetzt aus dem Modul und gibt
  nachweislich Zeichen fuer Zeichen dasselbe aus wie vorher

Co-Authored-By: <Attribution deiner eigenen Sitzung>
MSG
)"
```

---

### Aufgabe 3: Grauskala auf AA ziehen (6 Paare)

**Welche Paare:** Die sechs mit `--pm-grey-400` bzw. `--pm-grey-500` als
Textfarbe, in `tools/kontrast-paare.json` erkennbar an
`"vg": "--pm-grey-400"` (fünf Stück) und dem einen `"vg":
"--pm-grey-500"` mit `"hg": "--app-bg-base"`.

| Modus | vg | hg | heute | Rolle |
|---|---|---|---|---|
| dark | `--pm-grey-400` | `--pm-white` | 3,42 | Sekundärtext auf Karte |
| dark | `--pm-grey-400` | `--pm-white` | 3,42 | Empty-State-Text |
| dark | `--pm-grey-400` | `--pm-grey-50` | 4,40 | Kommentar-Datum |
| light | `--pm-grey-400` | `--pm-grey-50` | 4,24 | Kommentar-Datum |
| light | `--pm-grey-400` | `--app-bg-base` | 3,69 | Gedämpfter Text auf dem Seitengrund |
| light | `--pm-grey-500` | `--app-bg-base` | 4,32 | Meta-Text auf dem Seitengrund |

**Dateien:**
- Ändern: `css/tokens.css` (`--pm-grey-400` in beiden Blöcken, `--app-bg-base` im `:root`-Block)
- Ändern: `tokens.json` (dieselben drei Werte plus Rollen-Sätze)
- Ändern: `tools/kontrast-paare.json` (sechs `ausnahme`-Felder entfernen)
- Ändern: `DESIGN.md` Abschnitte 2.1, 2.2, 9.3
- Ändern: `CHANGELOG.md` (neue Rubrik „Behoben")

**Schnittstellen:**
- Verbraucht: `node tools/ton-suchen.mjs` aus Aufgabe 2.
- Liefert: drei geänderte Tokenwerte, auf die Aufgabe 14 sich in der
  Dokumentation beruft.

**Die Entscheidung, die dieser Plan trifft — und die du nicht neu
treffen musst.** Eine frühere Fassung dieses Plans wollte
`--pm-grey-400` abdunkeln (hell) bzw. aufhellen (dunkel), bis er überall
AA hält. Vor Ausführungsbeginn nachgerechnet — der Weg ist falsch, und
zwar messbar:

| Planweg | Ergebnis | Schaden |
|---|---|---|
| `--pm-grey-400` hell auf 4,6:1 gegen `--pm-grey-50` | `#767676` → `#707070` | `--pm-grey-500` ist `#6B6B6B`. **5 Einheiten je Kanal** — die Stufe existiert nicht mehr. |
| `--pm-grey-400` dunkel auf 4,6:1 gegen `--pm-white` | `#909096` → `#A9A9AD` | `--pm-grey-500` dunkel ist `#B0B0B0`. Helligkeit 0,671 gegen 0,690 — ebenfalls dieselbe Farbe. |
| `--app-bg-base` gegen das neue `--pm-grey-400` | `#EAE7E3` → `#F8F7F6` | **heller als `--pm-grey-50`** (`#F7F7F7`). Der Seitengrund ist dann kein Grund mehr, und der warme Ton ist weg. |

Der Fehler im Ansatz: `--pm-grey-400` soll laut Rolle die **gedämpfte**
Stufe sein und gleichzeitig AA halten. Das ist ein Widerspruch —
gedämpft heißt weniger Kontrast, AA ist eine Untergrenze. Ein Token
kann nicht beides sein.

**Deshalb wird nicht der Wert repariert, sondern die Rolle.**
`--pm-grey-400` ist ab B1 **keine Textfarbe mehr**, sondern eine
Nicht-Text-Farbe für Icons und Rahmen — neben `--pm-grey-300`. Jede
Text-Verwendung wandert auf `--pm-grey-500`. Nachgerechnet, mit
**unveränderten** Werten:

| Fläche | `--pm-grey-500` als Text | `--pm-grey-400` als Icon (3:1) |
|---|---|---|
| hell `--pm-white` | **5,33:1** ✓ | 4,54:1 ✓ |
| hell `--pm-grey-50` | **4,97:1** ✓ | – |
| hell `--app-bg-base` | 4,32:1 ✗ | 3,69:1 ✓ |
| dunkel `--pm-white` | **5,01:1** ✓ | 3,42:1 ✓ |
| dunkel `--pm-grey-50` | **6,44:1** ✓ | – |

Vier der fünf Flächen sind damit **ohne jede Farbänderung** in Ordnung.
Übrig bleibt eine einzige: der Seitengrund. Er wird aufgehellt, und
zwar nur noch gegen `--pm-grey-500` — das sind 14 Schritte statt 32:

```
--app-bg-base  #EAE7E3 → #F0EEEB   (4,60:1)
Sättigung 0,143 → 0,143   Farbwinkel 34,3° → 36,0°
Abstand zu --pm-grey-50: 7/9/12 Einheiten je Kanal — klar unterscheidbar
```

**Diese Aufgabe ändert also genau einen Farbwert.** Das ist der
Minimaleingriff, den Spec 3.2 verlangt: eine Regel auf einen anderen
Token zu zeigen ist ein kleinerer Eingriff als eine Farbe zu verschieben,
die durch jede Fläche des Kits läuft. Die Sechserskala bleibt
vollständig, der warme Seitengrund bleibt warm.

**Damit ist auch Spec 9.2 beantwortet** („ist `--pm-grey-400` noch eine
eigene Stufe?"): ja — als Nicht-Text-Stufe. Die Frage geht **nicht**
nach B2.

**Warum der Seitengrund überhaupt angepasst wird:** Die flache
Grundfarbe liegt in der Vorlage **hinter** einem Hintergrundbild und
malt auf iOS nur den Rand, den das Bild nicht erreicht. Erst weil das
Kit das Bild bewusst nicht mitliefert, wird sie zur meistgelesenen
Fläche der Anwendung. Die Alternative — Meta-Text auf dem Seitengrund
verbindlich auf `--pm-grey-600` zwingen — wäre eine Einsatzregel, die
jede verbrauchende Anwendung beachten müsste, und damit genau die Art
von Bürde, die dieses Kit abnehmen soll.

- [ ] **Schritt 1: Den fehlschlagenden Zustand herstellen**

Das ist der Rot-Schritt: erst die Erwartung setzen, dann handeln. In
`tools/kontrast-paare.json` bei **allen sechs** oben genannten Paaren
das Feld `"ausnahme"` samt seinem Text **löschen**. Sonst nichts an den
Paaren ändern.

- [ ] **Schritt 2: Fehlschlag bestätigen**

```bash
cd /c/Dev/pm-design-kit
npm run check:kontrast
```

Erwartet: FEHLSCHLAG, Exit 1, mit sechs Zeilen unter den harten Fehlern
und genau den Zahlen aus der Tabelle oben (3.42, 3.42, 4.40, 4.24,
3.69, 4.32). Stimmen die Zahlen nicht, hast du das falsche Paar
erwischt.

- [ ] **Schritt 3: Alle Verbraucher von `--pm-grey-400` erfassen und einordnen**

Das ist der Kern dieser Aufgabe. Such mit dem **dedizierten
Grep-Werkzeug** (Muster `var\(--pm-grey-400`) **jede** Fundstelle in
`css/base.css`, `css/components.css` und `css/surface-glass.css`.

Trage sie im Bericht als Tabelle zusammen: Datei, Zeile, Selektor,
Eigenschaft, und die Einordnung **Text** oder **Nicht-Text**.

Die Einordnungsregel, ohne Ermessen:

- `color` an einem Element, das Text trägt → **Text**
- `color` an einem Element, das ausschließlich ein Icon/SVG enthält →
  **Nicht-Text**
- `border-color`, `background`, `fill`, `stroke`, `outline-color` →
  **Nicht-Text**
- `color` an einem **deaktivierten** Bedienelement → **Nicht-Text**,
  siehe die Ausnahme unten

Im Zweifel: **Text**. Eine Fehleinordnung nach „Text" kostet etwas
Kontrast zu viel; eine nach „Nicht-Text" lässt einen AA-Verstoß stehen.

**Die eine Ausnahme, schon entschieden:** `.pm-select__option:disabled`
(`css/components.css:764`) setzt `color: var(--pm-grey-400)` und bleibt
so. WCAG 1.4.3 nimmt inaktive Bedienelemente ausdrücklich von der
Kontrastanforderung aus („Incidental: Text … that is part of an inactive
user interface component … has no contrast requirement"), und die
gedämpfte Erscheinung **ist** hier die Aussage: eine deaktivierte Option,
die so kräftig aussieht wie eine aktive, ist ein schlechteres Bauteil,
kein barriereärmeres. Das ist der einzige Fall, in dem „gedämpft" die
richtige Bedeutung trägt.

Der Rollen-Satz von `--pm-grey-400` muss diese Ausnahme deshalb
ausdrücklich nennen — sonst liest der nächste Bearbeiter die Regel
„keine Textfarbe" und ändert es doch. Formuliere sie so, dass sie die
Begründung mitträgt, nicht nur die Erlaubnis.

**Zur Erwartung:** Ich habe die Fundstellen vorab gezählt — es sind
**acht**, davon fünf eindeutig Nicht-Text (`.btn-outline:hover` und
`.form-control:hover` und `.pm-select__trigger:hover` jeweils
`border-color`, der Schalter-Track `background`, der Rollbalken-Griff
`background` in `css/base.css`), zwei Text (`.empty-state__text`,
`.comment__date`) und die eine Ausnahme oben. Findest du eine neunte,
gehört sie in den Bericht — meine Zählung ist keine Obergrenze.

- [ ] **Schritt 4: Jede Text-Verwendung auf `--pm-grey-500` umstellen**

In `css/components.css` (und `css/base.css`, falls dort etwas steht)
jede in Schritt 3 als **Text** eingeordnete Stelle von
`var(--pm-grey-400)` auf `var(--pm-grey-500)` ändern. Über der ersten
geänderten Regel ein Kommentar, der es einmal für alle erklärt:

```css
/* B1: stand auf var(--pm-grey-400). Der Token soll laut Rolle die
   GEDAEMPFTE Stufe sein und gleichzeitig AA halten - das ist ein
   Widerspruch, gedaempft heisst weniger Kontrast, AA ist eine
   Untergrenze. Gemessen riss er an fuenf Stellen (3,42 bis 4,40:1).
   --pm-grey-400 ist deshalb ab B1 keine Textfarbe mehr, sondern eine
   Nicht-Text-Farbe fuer Icons und Raender neben --pm-grey-300; jede
   Text-Verwendung steht jetzt auf --pm-grey-500 (unveraendert
   #6B6B6B/#B0B0B0, 4,97 bis 6,44:1 auf allen Kartenflaechen).
   Siehe CHANGELOG.md 0.2.0, "Behoben". */
```

**Die Nicht-Text-Verwendungen bleiben unangetastet.**

- [ ] **Schritt 5: Den einen Farbwert ausrechnen**

```bash
cd /c/Dev/pm-design-kit
node tools/ton-suchen.mjs --vg "#EAE7E3" --hg "#6B6B6B" --ziel 4.6
```

Der Kontrast ist symmetrisch, deshalb steht der Seitengrund an der
`--vg`-Stelle: gesucht ist **seine** Helligkeit, sein Farbwinkel bleibt
erhalten. Erwartet wird `#F0EEEB` bei 4,60:1 — **die Ausgabe des
Werkzeugs gilt**, nicht diese Erwartung. Ausgabe vollständig in den
Bericht.

- [ ] **Schritt 6: Die Tokenwerte und die zwei Rollen eintragen**

In `css/tokens.css`, `:root`:

```css
  --app-bg-base: NEUERWERT; /* Rolle: Flache Grundfarbe hinter dem App-Hintergrundbild; malt auf iOS den vom Hintergrundbild nicht erreichten Rand (Home-Indikator/Overscroll). B1: von #EAE7E3 aufgehellt - weil das Kit das Hintergrundbild bewusst nicht mitliefert, ist diese Flaeche die meistgelesene der Anwendung, und --pm-grey-500 erreichte darauf nur 4,32:1. Jetzt KONTRASTNEU:1. Farbwinkel und Saettigung unveraendert, der warme Ton bleibt; zu --pm-grey-50 weiterhin klar unterscheidbar. */
```

`--pm-grey-400` behält in **beiden** Blöcken seinen Wert. Was sich
ändert, ist die Rolle. Der heutige `:root`-Satz nennt ausdrücklich die
alten Zahlen („AA-tauglich NUR auf reinem Weiss (--pm-white, 4,54:1).
Auf --pm-grey-50 4,24:1 und auf dem Seitengrund --app-bg-base 3,69:1 -
dort reisst sie AA") und wird **vollständig ersetzt**:

```css
  --pm-grey-400: #767676; /* Rolle: Nicht-Text-Farbe fuer Icons und Raender, neben --pm-grey-300. KEINE Textfarbe: der Ton haelt WCAG AA fuer Fliesstext auf keiner Flaeche des Kits ausser reinem Weiss (4,54:1) und riss an fuenf gemessenen Stellen. Fuer gedaempften TEXT --pm-grey-500 nehmen. Als Nicht-Text-Farbe traegt er ueberall: 4,54:1 auf --pm-white, 3,69:1 auf --app-bg-base (Grenzwert 3:1, WCAG 1.4.11). B1-Entscheidung, siehe CHANGELOG.md 0.2.0. */
```

Im `[data-theme="dark"]`-Block sinngemäß dasselbe, mit 3,42:1 auf
`--pm-white`.

Alle drei Rollen-Sätze **wörtlich gleich** in `tokens.json` nachziehen —
`check:tokens` prüft auch die Rollen-Texte.

- [ ] **Schritt 7: Die Kontrastpaare auf die neue Wirklichkeit umstellen**

Die fünf Paare, die `--pm-grey-400` als **Text** gemessen haben, messen
jetzt etwas, das es nicht mehr gibt. Stelle bei ihnen `"vg"` auf
`--pm-grey-500` um — sie prüfen dann die Farbe, die dort tatsächlich
steht. `"rolle"` entsprechend nachziehen.

Dazu **drei neue Paare** für `--pm-grey-400` in seiner neuen Rolle,
Mindestwert **3.0** (WCAG 1.4.11, Nicht-Text):

```json
  {
    "vg": "--pm-grey-400",
    "hg": "--pm-white",
    "modus": "light",
    "rolle": "Icon-/Randfarbe auf Karte - Nicht-Text, WCAG 1.4.11",
    "mindest": 3.0
  },
```

analog für `--app-bg-base` (hell) und `--pm-white` (dunkel).

- [ ] **Schritt 8: Grün bestätigen**

```bash
cd /c/Dev/pm-design-kit
npm run check:kontrast
npm run check:tokens
```

Erwartet: `check:kontrast` Exit 0, **15 dokumentierte Befunde** (21
minus die sechs behobenen) und eine Paarzahl von **86** (83 plus die
drei neuen). Keine der sechs Zeilen darf noch auftauchen.
`check:tokens` grün — rot heißt meist ein Rollen-Satz, der in
`tokens.json` nicht wörtlich gleich steht.

- [ ] **Schritt 9: Soll-Stand nachziehen**

```bash
cd /c/Dev/pm-design-kit
npm run soll
```

**Die Erwartung hier ist besonders:** Es dürfen **nur** `color`-Werte
abweichen, und nur an den Einträgen, die du in Schritt 4 umgestellt hast
— in beiden Modi. Jede Zeile der Ausgabe muss sich einer Zeile deiner
Tabelle aus Schritt 3 zuordnen lassen. **Ordne sie im Bericht
tatsächlich zu**, Zeile für Zeile.

`--app-bg-base` erzeugt **keine** Abweichung: der Token wird von
`css/base.css` auf `body` gesetzt, und `body` ist kein Katalog-Eintrag.
Das ist erwartet und gehört so in den Bericht — der einzige Wächter für
diesen Wert ist `check:kontrast`.

```bash
npm run soll -- --uebernehmen
npm run check
```

Erwartet: alle sechs Prüfungen grün.

- [ ] **Schritt 10: Dokumentation**

- `DESIGN.md` 2.1/2.2: `--pm-grey-400` bekommt seine neue Rolle,
  `--app-bg-base` seinen neuen Wert. Die Aussage „AA-tauglich nur auf
  reinem Weiß" entfällt und wird durch die Einsatzregel ersetzt:
  **gedämpfter Text ist `--pm-grey-500`, `--pm-grey-400` ist für Icons
  und Ränder.** Diese Regel gehört an die Stelle, an der ein Leser nach
  „welches Grau für Meta-Text" sucht — nicht in eine Fußnote.
- `DESIGN.md` 9.3: die sechs Zeilen aus der AA-Ausnahmeliste
  **streichen** und die beiden Modus-Überschriften
  `**Hellmodus (n):**` / `**Dunkelmodus (n):**` auf die neuen Zahlen
  setzen. `check:zahlen` prüft, dass beide zusammen die Gesamtzahl
  ergeben.
- `SKILL.md`: Steht dort ein Schnellzugriffswert für gedämpften Text,
  muss er auf `--pm-grey-500` zeigen. Nachsehen, nicht raten.
- `CHANGELOG.md`: unter `## 0.2.0` die neue Rubrik `### Behoben`
  anlegen. Der Eintrag muss die **Begründung** tragen, warum die Rolle
  und nicht der Wert geändert wurde, samt der drei gerechneten Zahlen
  aus der Tabelle oben — sonst liest der nächste Bearbeiter es als
  Bequemlichkeit. In „Beobachtungen für Schritt B" die sechs Befunde
  **als erledigt markieren, nicht löschen** (Spec 7): Präfix
  `**[in 0.2.0 behoben]**`. Den Eintrag zu Spec 9.2 („ist
  `--pm-grey-400` noch eine eigene Stufe") ebenfalls als beantwortet
  markieren — er geht **nicht** nach B2.

- [ ] **Schritt 11: Zahlenprüfung und Commit**

```bash
cd /c/Dev/pm-design-kit
npm run check:zahlen
```

Rot heißt: irgendwo in den vier Markdown-Dateien steht noch „21", „83"
oder eine alte Teilsumme. Das Skript nennt Datei und Zeile.

```bash
git add -A
git commit -m "$(cat <<'MSG'
fix(kontrast): --pm-grey-400 ist keine Textfarbe mehr (6 Paare)

Fuenf Paare mit --pm-grey-400 und eines mit --pm-grey-500 lagen unter
4,5:1 - der schlechteste bei 3,42:1 (Sekundaertext auf der dunklen
Karte).

Der naheliegende Weg - den Ton abdunkeln, bis AA faellt - ist
nachgerechnet und verworfen: hell landet --pm-grey-400 dann bei #707070
und ist von --pm-grey-500 (#6B6B6B) fuenf Einheiten je Kanal entfernt,
dunkel bei #A9A9AD gegen #B0B0B0. Die Stufe existierte danach nicht
mehr, und der Seitengrund waere heller geworden als --pm-grey-50.

Der Widerspruch steckt in der Rolle, nicht im Wert: --pm-grey-400 soll
die GEDAEMPFTE Stufe sein und gleichzeitig AA halten. Gedaempft heisst
weniger Kontrast, AA ist eine Untergrenze - ein Token kann nicht beides
sein. Er ist deshalb ab jetzt eine Nicht-Text-Farbe fuer Icons und
Raender (haelt dort ueberall 1.4.11), und jede Text-Verwendung steht auf
--pm-grey-500. Das erledigt vier der fuenf Flaechen ohne jede
Farbaenderung.

Uebrig blieb eine: der Seitengrund, auf dem auch --pm-grey-500 nur
4,32:1 erreicht. --app-bg-base ist aufgehellt, Farbwinkel und
Saettigung unveraendert, und bleibt klar von --pm-grey-50
unterscheidbar. Damit aendert diese Aufgabe genau EINEN Farbwert.

Beantwortet damit auch die offene Frage aus Spec 9.2: --pm-grey-400
bleibt eine eigene Stufe - als Nicht-Text-Stufe. Geht nicht nach B2.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
MSG
)"
```

---

### Aufgabe 4: Semantische Farben bekommen Dunkelwerte (3 Paare + verallgemeinerter Befund)

**Welche Paare:** die drei mit `--color-error` bzw. `--color-error-mid`
als Textfarbe im Dunkelmodus — `.form-error` (1,65:1), der
Dropdown-Gefahreneintrag deckend (2,79:1) und derselbe Eintrag mit
Glas-Ebene in Ruhe (2,77:1).

**Warum mehr als drei Tokens angefasst werden:** Der Befund „acht der 13
semantischen Farbtokens haben keinen eigenen Dunkelwert" beschreibt
dieselbe Ursache. `--color-success`, `--color-warning`, `--color-error`,
`--color-info` und ihre vier `-mid`-Geschwister fallen im Dunkelmodus
auf einen Ton zurück, der für **weißen** Grund gewählt wurde. Dass heute
nur die drei Fehler-Paare auffallen, liegt allein daran, dass die
übrigen sechs Töne im Kit kaum Verbraucher haben. Sie einzeln zu
behandeln hieße, dasselbe Problem beim nächsten Erfolgs- oder
Warnhinweis erneut zu finden.

**Basis und `-mid` bekommen verschiedene Zielwerte — nachgerechnet, nicht
geraten.** Eine frühere Fassung dieses Plans ließ alle acht Töne auf
4,6:1 rechnen. Das ist verworfen: Ein Kontrastwert gegen einen festen
Grund bestimmt die Helligkeit nahezu eindeutig — zwingt man Basis **und**
`-mid` auf dasselbe Ziel gegen dieselbe Fläche, werden sie dieselbe
Farbe. Drei von vier Familien fielen zusammen:

| Familie | Basis → | `-mid` → | max. Kanalabstand |
|---|---|---|---|
| success | `#2AC252` | `#58BD6B` | 46 (noch ok) |
| warning | `#F18F70` | `#F88C6A` | **7** |
| error | `#EE8E8E` | `#F08E8C` | **2** |
| info | `#72ADF0` | `#6EAEEE` | **4** |

Die Rollen sagen längst, dass es zwei verschiedene Aufgaben sind:

- **Basis** (`--color-error`) ist laut Rolle „Fehler-/Destruktiv-**Text**farbe"
  → Fließtext, Ziel **4,6:1**.
- **`-mid`** ist laut Rolle „kräftigerer Ton für **Punkte/Chips**" → ein
  grafisches Objekt, WCAG 1.4.11, Ziel **3,1:1**.

Mit getrennten Zielen bleiben alle vier Familien unterscheidbar, und die
Palette bekommt die Struktur, die ein Dunkelmodus braucht — blasser,
lesbarer Textton neben kräftigem, sattem Punkt:

| Familie | Basis (4,6:1) | `-mid` (3,1:1) | Abstand |
|---|---|---|---|
| success | `#2AC252` | `#43A956` (1 Einheit) | 25 |
| warning | `#F18F70` | `#F4521F` (1 Einheit) | 81 |
| error | `#EE8E8E` | `#E95956` | 56 |
| info | `#72ADF0` | `#308CE6` | 66 |

`--color-success-mid` und `--color-warning-mid` liegen heute schon über
3,1:1 — zwei der acht Werte bleiben also faktisch stehen. **Die Ausgabe
des Werkzeugs gilt**, nicht diese Tabelle; sie ist die Erwartung, gegen
die du deine Messung hältst.

**Dateien:**
- Ändern: `css/tokens.css` (acht neue Deklarationen im `[data-theme="dark"]`-Block)
- Ändern: `tokens.json` (dieselben acht mit Rollen-Sätzen)
- Ändern: `tools/kontrast-paare.json` (drei `ausnahme` entfernen, sechs neue Paare ergänzen, ein `vg` umstellen)
- Ändern: `css/surface-glass.css:365-367` (drei Zeilen löschen — Begründung unten; **die einzige** Änderung an dieser Datei in dieser Aufgabe)
- Ändern: `DESIGN.md` 2.3, 9.3
- Ändern: `CHANGELOG.md`

**Schnittstellen:**
- Verbraucht: `node tools/ton-suchen.mjs` aus Aufgabe 2.
- Liefert: acht neue Dunkelmodus-Tokenwerte. Aufgabe 9 (Vokabular) setzt
  voraus, dass sie existieren.

**Eine Zeile in `css/surface-glass.css` muss weg — und das ist keine
Glas-Entscheidung, sondern die Folge dieser Aufgabe.** Zeile 365-367
lautet:

```css
[data-theme="dark"] .dropdown__item--danger {
  color: var(--color-error-mid);
}
```

Diese Überschreibung existiert **ausschließlich**, weil `--color-error`
bisher keinen Dunkelwert hatte und auf sein dunkelrotes Hellmodus-Ton
zurückfiel (Kommentar in der Quelle: „Im Dark Mode … wird das dunkle Rot
fast unsichtbar"). Nach dieser Aufgabe hat `--color-error` einen
Dunkelwert, und die Überschreibung ist nicht mehr überflüssig, sondern
**schädlich**: Sie würde den `-mid`-Ton, der jetzt ein 3,1-Punktton ist,
als Text auf die Menüfläche setzen. Nachgerechnet:

| Ton auf der komponierten Glas-Menüfläche `rgb(56,56,58)` | Wert |
|---|---|
| `--color-error` neu (`#EE8E8E`) | **4,96:1 ✓** |
| `--color-error-mid` neu (`#E95956`) | 3,36:1 ✗ als Text |

Der Basis-Ton trägt alle drei Dunkelflächen selbst: 4,60:1 auf
`--pm-white`, 5,92:1 auf `--inverse-surface-soft`, 4,96:1 auf der
Glas-Menüfläche. **Lösche die drei Zeilen**, mit Kommentar an ihrer
Stelle:

```css
/* Hier stand bis 0.1.0:
     [data-theme="dark"] .dropdown__item--danger { color: var(--color-error-mid); }
   Die Ueberschreibung existierte nur, weil --color-error keinen
   Dunkelwert hatte und auf seinen dunkelroten Hellmodus-Ton zurueckfiel
   ("im Dark Mode fast unsichtbar", app/css/glass.css). B1 hat
   --color-error einen eigenen Dunkelwert gegeben, der auf der
   komponierten Glas-Menueflaeche 4,96:1 erreicht - die Grundregel
   .dropdown__item--danger { color: var(--color-error) } traegt seitdem
   selbst. Die Ueberschreibung waere jetzt sogar schaedlich:
   --color-error-mid ist seit B1 ein Punkt-/Chip-Ton (Zielwert 3:1,
   WCAG 1.4.11) und erreichte als Text hier nur 3,36:1.
   Nicht wieder einfuehren. */
```

**Warum das die Ausnahme an dieser Datei nicht aufweicht:** Hier wird
keine Gestaltungsfrage der Glas-Ebene entschieden — Unschärfe, Sättigung,
Flächen und Ränder bleiben unberührt. Entfernt wird eine
Barrierefreiheits-Krücke, die an die falsche Ebene gebunden war; genau
das nennt der Befund selbst als Ziel („die Korrektur aus der Glas-Ebene
nach `components.css` ziehen — dann trägt die Glas-Ebene keine
Barrierefreiheits-Korrektur mehr"). Alles andere an
`css/surface-glass.css` bleibt tabu.

- [ ] **Schritt 1: Den fehlschlagenden Zustand herstellen**

In `tools/kontrast-paare.json` bei den drei Paaren mit
`"rolle": "Formular-Fehlertext (form-error, dunkel)"`,
`"rolle": "Dropdown-Eintrag Gefahr-Text (dunkel, deckende Menue-Flaeche ohne Glas)"`
und `"rolle": "Dropdown-Eintrag Gefahr-Text (dunkel, MIT Glas-Ebene, Ruhe)"`
das Feld `"ausnahme"` löschen.

Zusätzlich **sechs neue Paare** anlegen — für die sechs Töne, die heute
gar nicht gerechnet werden. Ohne sie bliebe der Befund „acht Tokens" zur
Hälfte unbelegt, und die nächste Warnmeldung fiele wieder unbemerkt
durch.

**Achtung, zwei verschiedene Mindestwerte.** Die drei fehlenden
**Basis**-Töne bekommen `4.5`:

```json
  {
    "vg": "--color-success",
    "hg": "--pm-white",
    "modus": "dark",
    "rolle": "Erfolgs-Text auf Karte (dunkel)",
    "mindest": 4.5
  },
```

analog für `--color-warning` und `--color-info`.

Die drei fehlenden **`-mid`**-Töne bekommen `3.0`, und ihre `rolle`
**muss sagen, warum** — sonst hält der nächste Leser es für einen
Tippfehler:

```json
  {
    "vg": "--color-success-mid",
    "hg": "--pm-white",
    "modus": "dark",
    "rolle": "Erfolgs-Punkt/-Chip auf Karte (dunkel) - grafisches Objekt, kein Fliesstext: WCAG 1.4.11, Grenzwert 3:1",
    "mindest": 3.0
  },
```

analog für `--color-warning-mid` und `--color-info-mid`.

**Das bestehende Paar `--color-error-mid` auf der Glas-Fläche** wird
`vg` auf `--color-error` umgestellt — siehe Schritt 4b, der erklärt,
warum dort künftig der Basis-Ton steht. Mindestwert bleibt `4.5`.

- [ ] **Schritt 2: Fehlschlag bestätigen**

```bash
cd /c/Dev/pm-design-kit
npm run check:kontrast
```

Erwartet: FEHLSCHLAG mit mindestens neun harten Fehlern — den drei
entdeckelten und den sechs neuen, die ohne Dunkelwert selbstverständlich
durchfallen. Die Paarzahl steigt von 83 auf 89.

- [ ] **Schritt 3: Die acht Werte ausrechnen**

Die schwerste Fläche im Dunkelmodus ist `--pm-white` (dunkel,
`#3D3D3D`) — sie ist **heller** als `--pm-grey-50` (`#2C2C2C`),
`--inverse-surface-soft` (`#2C2C2C`) und die komponierte Glas-Fläche
(`rgb(56,56,58)`). Wer dort besteht, besteht überall.

**Zwei Läufe mit verschiedenen Zielwerten** — die vier Basis-Töne auf
4,6, die vier `-mid`-Töne auf 3,1:

```bash
cd /c/Dev/pm-design-kit

# Basis-Toene: Fliesstext, Ziel 4,6
for f in "#1B7E35" "#D84315" "#B71C1C" "#1565C0"; do
  echo "--- Basis $f"
  node tools/ton-suchen.mjs --vg "$f" --hg "#3D3D3D" --ziel 4.6
done

# -mid-Toene: Punkte/Chips, grafisches Objekt, Ziel 3,1 (WCAG 1.4.11)
for f in "#43A856" "#F4511E" "#E53935" "#1976D2"; do
  echo "--- mid $f"
  node tools/ton-suchen.mjs --vg "$f" --hg "#3D3D3D" --ziel 3.1
done
```

Zuordnung der acht Ausgangswerte: `--color-success` `#1B7E35`,
`--color-success-mid` `#43A856`, `--color-warning` `#D84315`,
`--color-warning-mid` `#F4511E`, `--color-error` `#B71C1C`,
`--color-error-mid` `#E53935`, `--color-info` `#1565C0`,
`--color-info-mid` `#1976D2`.

**Alle acht Ausgaben in den Bericht übernehmen.** Meldet ein
`-mid`-Lauf „Ziel ist bereits erreicht", ist das erwartet
(`--color-success-mid` liegt bei 3,61:1, `--color-warning-mid` bei
3,13:1) — dann bleibt der Wert stehen, und das gehört so in den
Bericht.

**Die Kontrolle, die du selbst durchführen musst:** Prüfe für **jede
der vier Familien**, wie weit Basis- und `-mid`-Ton nach der Korrektur
auseinanderliegen (größter Kanalabstand). Erwartet sind 25 bis 81
Einheiten. Liegt eine Familie unter 20, melde es zurück, statt einen
Wert zurechtzubiegen — dann stimmt an der Annahme etwas nicht, auf der
die getrennten Zielwerte beruhen.

- [ ] **Schritt 4: Die acht Werte eintragen**

In `css/tokens.css` im `[data-theme="dark"]`-Block, im Abschnitt
`/* ── Farbe: Semantische Zustaende ── */`, **vor** den bestehenden
`-light`-Einträgen. Rollen-Satz nach dem Muster:

```css
  --color-error: NEUERWERT; /* Rolle: Fehler-/Destruktiv-Textfarbe (z. B. Abmelden, Loeschen). B1: eigener Dunkelwert ergaenzt - vorher fiel der Token auf den Hellwert #B71C1C zurueck, einen fuer weissen Grund gewaehlten Ton, und erreichte auf --pm-white (dunkel) nur 1,65:1. Jetzt KONTRASTNEU:1. */
```

Dieselben acht Werte und Rollen-Sätze in `tokens.json` nachziehen.

- [ ] **Schritt 5: Grün bestätigen — inklusive des Glas-Paares**

```bash
cd /c/Dev/pm-design-kit
npm run check:kontrast
```

Erwartet: `OK: 89 Paare geprueft, 12 dokumentierte Befunde.` (15 aus
Aufgabe 3 minus die drei hier behobenen).

**Besonders prüfen:** Das Paar „Dropdown-Eintrag Gefahr-Text (dunkel,
MIT Glas-Ebene, Ruhe)" muss jetzt mit `--color-error` bestehen (erwartet
4,96:1), nachdem die drei Zeilen aus `css/surface-glass.css` entfernt
sind. Tut es das nicht, melde es zurück.

Das Paar „… MIT Glas-Ebene, überfahren" (`#F18581`) bleibt vorerst rot —
es gehört zu Aufgabe 5.

**Und eine Prüfung, die leicht vergessen wird:** `check:css` muss grün
bleiben. Du hast eine CSS-Datei bearbeitet, und genau an dieser Datei
ist in Schritt A einmal ein Kommentar-Fehler passiert, der sie zwei
Prüfrunden lang auf **null** geparste Regeln gebracht hat, ohne dass es
auffiel.

```bash
npm run check:css
```

- [ ] **Schritt 6: Soll-Stand nachziehen und Prüfkette**

```bash
cd /c/Dev/pm-design-kit
npm run soll
```

Erwartet: Abweichungen bei den Dropdown-Gefahreneinträgen im
Dunkelmodus und, falls `.form-error` einen Katalog-Eintrag hat, dort.
Prüfen, dann übernehmen:

```bash
npm run soll -- --uebernehmen
npm run check
```

- [ ] **Schritt 7: Dokumentation und Commit**

- `DESIGN.md` 2.3: Tabelle der semantischen Farben um die
  Dunkelmodus-Spalte ergänzen, die es für diese acht bislang nicht gab.
- `DESIGN.md` 9.3: drei Zeilen streichen, Modus-Zahlen anpassen.
- `CHANGELOG.md`: unter „Behoben" ein Eintrag, der ausdrücklich sagt,
  dass **alle acht** Töne behandelt wurden und warum nicht nur
  `--color-error`. Den Befund „acht der 13 semantischen Farbtokens" in
  „Beobachtungen für Schritt B" als erledigt markieren.

```bash
cd /c/Dev/pm-design-kit
npm run check:zahlen
git add -A
git commit -m "$(cat <<'MSG'
fix(kontrast): acht semantische Farbtoene bekommen eigene Dunkelwerte

--color-error erreichte im Dunkelmodus 1,65:1 auf der Kartenflaeche -
nach dem Chip der schlechteste Wert des ganzen Kits. Ursache ist nicht
dieser eine Token: acht der 13 semantischen Farbtokens hatten gar keinen
Dunkelwert und fielen auf einen Ton zurueck, der fuer weissen Grund
gewaehlt wurde. Dass bisher nur die drei Fehler-Paare auffielen, lag
allein daran, dass die uebrigen sechs Toene im Kit kaum Verbraucher
haben - beim naechsten Erfolgs- oder Warnhinweis waere dasselbe Problem
wieder dagewesen.

Alle acht gegen --pm-white (dunkel, #3D3D3D) gerechnet: die hellste
Flaeche, auf der sie stehen, und damit der schwerste Fall.

Basis- und -mid-Toene bekamen dabei VERSCHIEDENE Zielwerte, und das ist
der Kern: zwingt man beide auf 4,6:1 gegen dieselbe Flaeche, werden sie
dieselbe Farbe - drei der vier Familien fielen auf 2 bis 7 Einheiten
zusammen. Die Rollen sagen schon, dass es zwei Aufgaben sind: Basis ist
Textfarbe (4,6:1), -mid ist "kraeftigerer Ton fuer Punkte/Chips", also
ein grafisches Objekt (3,1:1, WCAG 1.4.11). Mit getrennten Zielen
bleiben alle vier unterscheidbar, und die Palette bekommt die Struktur,
die ein Dunkelmodus braucht: blasser, lesbarer Textton neben kraeftigem,
sattem Punkt.

Drei Zeilen aus css/surface-glass.css sind entfallen. Die
Ueberschreibung [data-theme="dark"] .dropdown__item--danger auf
--color-error-mid existierte NUR, weil --color-error keinen Dunkelwert
hatte. Jetzt traegt die Grundregel selbst (4,96:1 auf der komponierten
Glas-Menueflaeche), und die Ueberschreibung waere sogar schaedlich
geworden: --color-error-mid ist seit dieser Aufgabe ein Punkt-Ton und
erreichte als Text dort nur 3,36:1. Das ist keine Glas-Entscheidung -
Unschaerfe, Saettigung, Flaechen und Raender bleiben unberuehrt -,
sondern das Entfernen einer Barrierefreiheits-Kruecke, die an der
falschen Ebene hing. Genau das nennt der Befund selbst als Ziel.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
MSG
)"
```

---

### Aufgabe 5: Status-Literale tokenisieren und korrigieren (5 Paare)

**Welche Paare:**

| Modus | vg | hg | heute |
|---|---|---|---|
| dark | `#6FB1F2` (Literal) | `--status-freigegeben-bg` | 4,06 |
| dark | `#B794F6` (Literal) | `--status-erstgenehmigt-bg` | 4,02 |
| dark | `#F18581` (Literal) | `--status-abgelehnt-bg` | 3,77 |
| dark | `#F18581` (Literal) | rote Hover-Fläche mit Glas | 4,28 |
| dark | `--status-entwurf` | `--status-entwurf-bg` | 3,79 |

**Der Kern dieser Aufgabe:** `css/components.css:835-839` trägt fünf
Farb-Literale ohne Token — `#C8C8D0`, `#6FB1F2`, `#6BD089`, `#B794F6`,
`#F18581`. Sie existieren nur, weil die vier zugehörigen Status-Tokens
`--status-offen`, `--status-freigegeben`, `--status-genehmigt`,
`--status-abgelehnt` und `--status-erstgenehmigt` **keinen eigenen
Dunkelwert** haben und sonst auf ihren Hellwert zurückfielen. Das ist
exakt dasselbe Muster wie bei den semantischen Farben in Aufgabe 4 —
nur hat hier jemand das Problem mit einer Ausnahmeregel zugedeckt statt
mit einem Token.

Die Reparatur dreht das um: Die fünf Tokens bekommen ihre Dunkelwerte,
korrigiert wo nötig. Die fünf `[data-theme="dark"] .badge--*`-Regeln
**entfallen danach ersatzlos** — die Grundregel `color:
var(--status-…)` löst dann von selbst richtig auf. B1 räumt hier also
Code weg, statt welchen hinzuzufügen.

**Vorab nachgerechnet, damit du weißt, was dich erwartet.** Diese
Aufgabe ist die unkritischste der fünf Farbaufgaben — keine Stufe fällt
zusammen, und zwei Werte bleiben stehen:

| Status | heute | wird | Schritte |
|---|---|---|---|
| `offen` | **5,01:1** | `#C8C8D0` **bleibt** | 0 — hält bereits AA |
| `genehmigt` | 4,52:1 | `#70D28D` | 7 |
| `freigegeben` | 4,06:1 | `#85BDF4` | 23 |
| `erstgenehmigt` | 4,02:1 | `#C1A3F7` | 16 |
| `abgelehnt` | 3,77:1 | `#F49F9C` | 29 |
| `entwurf` | 3,79:1 | `#F5CC6D` | 71 |

`--status-offen` wird also **tokenisiert, aber nicht korrigiert** — sein
Literal hält mit 5,01:1 bereits AA. Das ist ein Ergebnis, kein
Versäumnis, und gehört so in den Bericht.

Und die Gegenprobe für `abgelehnt` auf der roten Hover-Fläche mit Glas
ergibt mit `#F49F9C` **5,22:1**: der aus der Badge-Fläche gerechnete
Wert deckt beide Flächen ab, es braucht keinen Kompromiss.

**Die Ausgabe des Werkzeugs gilt**, nicht diese Tabelle. Sie ist die
Erwartung, gegen die du deine Messung hältst; weicht sie ab, gehört die
Abweichung in den Bericht.

**Dateien:**
- Ändern: `css/tokens.css` (fünf neue Dunkelwerte, `--status-entwurf` dunkel angepasst)
- Ändern: `tokens.json` (dieselben)
- Ändern: `css/components.css:828-840` (fünf Überschreibungen entfernen, Kommentar ersetzen)
- Ändern: `css/surface-glass.css:370` (das Literal `#F18581` durch den neuen Token ersetzen — die **einzige** erlaubte Änderung an dieser Datei, siehe globale Randbedingungen)
- Ändern: `tools/kontrast-paare.json`
- Ändern: `DESIGN.md` 2.4, 9.3, 11.4; `CHANGELOG.md`

**Schnittstellen:**
- Verbraucht: `node tools/ton-suchen.mjs` aus Aufgabe 2.
- Liefert: Dunkelwerte für `--status-offen`, `--status-freigegeben`,
  `--status-genehmigt`, `--status-erstgenehmigt`, `--status-abgelehnt`.
  **Aufgabe 9 braucht diese Namen**, um die drei verbliebenen Literale
  in `.stat-card__icon--*` zu bewerten.

**Ausdrücklich nicht in dieser Aufgabe:** Die Literale `#6FB1F2`,
`#6BD089` und `#F18581` kommen ein **zweites** Mal vor, in
`css/components.css:858-860` an `.stat-card__icon--success/--info/--error`.
Dort bedeuten sie semantisch Erfolg, Info und Fehler, nicht einen
Berichtsheft-Status — sie gehören also an die Tokens aus Aufgabe 4, nicht
an die aus dieser hier. Diese Zusammenführung macht **Aufgabe 9**.

- [ ] **Schritt 1: Den fehlschlagenden Zustand herstellen**

In `tools/kontrast-paare.json` bei allen fünf oben genannten Paaren das
Feld `"ausnahme"` löschen. Außerdem bei den drei Badge-Paaren und dem
Glas-Hover-Paar `"vg"` von dem Literal auf den künftigen **Token-Namen**
umstellen (`--status-freigegeben`, `--status-erstgenehmigt`,
`--status-abgelehnt`, `--status-abgelehnt`) — das Paar soll ab jetzt den
Token prüfen, nicht eine Abschrift davon.

Zwei weitere Paare neu anlegen, für die beiden Tokens, die heute gar
nicht geprüft werden:

```json
  {
    "vg": "--status-offen",
    "hg": "--status-offen-bg",
    "unter": "--pm-white",
    "modus": "dark",
    "rolle": "Status-Badge 'offen' (dunkel)",
    "mindest": 4.5
  },
```

analog für `--status-genehmigt` / `--status-genehmigt-bg`.

- [ ] **Schritt 2: Fehlschlag bestätigen**

```bash
cd /c/Dev/pm-design-kit
npm run check:kontrast
```

Erwartet: FEHLSCHLAG. Die Paarzahl steigt von 89 auf 91. Die vier
umgestellten Paare fallen jetzt **deutlich schlechter** aus als vorher
(um 1,5:1 statt um 4:1), weil der Token ohne Dunkelwert auf seinen
Hellwert zurückfällt — genau das, was das Literal verdeckt hat. Diese
Verschlechterung ist der Beweis, dass die Umstellung den richtigen Punkt
trifft; sie gehört in den Bericht.

- [ ] **Schritt 3: Die sechs Werte ausrechnen**

Die Status-Flächen sind im Dunkelmodus transluzent und liegen auf
`--pm-white` (dunkel, `#3D3D3D`). Die Flächen bleiben unangetastet;
gesucht ist jeweils die Textfarbe. Ausgangspunkt ist **das bisherige
Literal**, nicht der Hellwert — das Literal war schon der richtige
Farbwinkel, nur nicht hell genug.

```bash
cd /c/Dev/pm-design-kit

# offen: Literal #C8C8D0 auf rgba(154,154,164,0.18) ueber #3D3D3D
node tools/ton-suchen.mjs --vg "#C8C8D0" --hg "rgba(154,154,164,0.18)" --unter "#3D3D3D" --ziel 4.6
# freigegeben
node tools/ton-suchen.mjs --vg "#6FB1F2" --hg "rgba(25,118,210,0.22)"  --unter "#3D3D3D" --ziel 4.6
# genehmigt
node tools/ton-suchen.mjs --vg "#6BD089" --hg "rgba(67,168,86,0.18)"   --unter "#3D3D3D" --ziel 4.6
# erstgenehmigt
node tools/ton-suchen.mjs --vg "#B794F6" --hg "rgba(124,58,237,0.22)"  --unter "#3D3D3D" --ziel 4.6
# abgelehnt
node tools/ton-suchen.mjs --vg "#F18581" --hg "rgba(229,57,53,0.22)"   --unter "#3D3D3D" --ziel 4.6
# entwurf: hier gibt es schon einen Dunkelwert, er reicht nur nicht
node tools/ton-suchen.mjs --vg "#F0B429" --hg "rgba(240,180,41,0.22)"  --unter "#3D3D3D" --ziel 4.6
```

**Alle sechs Ausgaben in den Bericht übernehmen.**

Danach die **zweite Fläche** gegenprüfen, auf der `--status-abgelehnt`
im Dunkelmodus steht — die rote Hover-Fläche der Glas-Ebene:

```bash
node tools/ton-suchen.mjs --vg "ABGELEHNTNEU" --hg "rgba(229,57,53,0.14)" --unter "rgb(56,56,58)" --ziel 4.6
```

Meldet dieser Lauf „Ziel ist bereits erreicht", ist der Wert aus Lauf 5
auch für den Hover gut genug. Meldet er einen höheren Wert, **diesen**
nehmen: ein Token, zwei Flächen, der schwerere Fall gewinnt.

- [ ] **Schritt 4: Tokens eintragen, Überschreibungen entfernen**

In `css/tokens.css`, `[data-theme="dark"]`-Block, Abschnitt
`/* ── Farbe: Berichtsheft-Status ── */`: die fünf Textfarben ergänzen
und `--status-entwurf` auf den neuen Wert setzen. Rollen-Satz nach dem
bekannten Muster mit Vorher-Wert, Nachher-Wert und Grund. Für
`--status-abgelehnt` zusätzlich vermerken, gegen **welche der beiden
Flächen** gerechnet wurde und warum.

Dieselben Werte und Rollen-Sätze in `tokens.json`.

In `css/components.css` die fünf Zeilen 835–839 löschen (die
`--grey`-Zeile 840 bleibt, sie benutzt bereits einen Token) und den
Kommentar-Block darüber (Zeilen ~828–834) durch eine Erklärung
ersetzen, die festhält, **warum hier jetzt nichts mehr steht**:

```css
/* Hier standen bis 0.1.0 fuenf Farb-Literale ohne Token
   (#C8C8D0/#6FB1F2/#6BD089/#B794F6/#F18581). Sie existierten nur, weil
   die fuenf --status-*-Textfarben keinen eigenen Dunkelwert hatten und
   sonst auf ihren Hellwert zurueckgefallen waeren - eine Ausnahmeregel,
   die das Problem zudeckte statt es zu loesen. B1 hat den Tokens ihre
   Dunkelwerte gegeben (und dabei drei davon ueber AA gezogen, siehe
   CHANGELOG.md 0.2.0). Die Grundregel .badge--* { color: var(--status-…) }
   loest seitdem von selbst richtig auf - diese Ueberschreibungen sind
   ersatzlos entfallen. Nicht wieder einfuehren. */
```

In `css/surface-glass.css:370` das Literal ersetzen:

```css
[data-theme="dark"] .dropdown__item--danger:hover {
  background: rgba(229, 57, 53, 0.14);
  color: var(--status-abgelehnt);   /* B1: war #F18581, dasselbe Literal wie am Badge - jetzt der Token, der es traegt */
}
```

- [ ] **Schritt 5: Grün bestätigen**

```bash
cd /c/Dev/pm-design-kit
npm run check:kontrast
npm run check:tokens
npm run check:css
```

Erwartet: `OK: 91 Paare geprueft, 7 dokumentierte Befunde.`
`check:css` muss grün bleiben — es ist der Wächter dagegen, dass eine
Änderung an `surface-glass.css` die Datei unparsbar macht (genau das ist
in Schritt A einmal passiert und blieb zwei Prüfrunden unentdeckt).

- [ ] **Schritt 6: Soll-Stand und Prüfkette**

```bash
cd /c/Dev/pm-design-kit
npm run soll
```

Erwartet: `color`-Abweichungen an allen Badge-Einträgen im Dunkelmodus
und am Dropdown-Gefahreneintrag im Hover. **Keine** Abweichung im
Hellmodus — die Änderungen liegen ausschließlich im
`[data-theme="dark"]`-Block. Taucht eine Hellmodus-Zeile auf, hast du
versehentlich den `:root`-Block angefasst.

```bash
npm run soll -- --uebernehmen
npm run check
npm run check:zahlen
```

- [ ] **Schritt 7: Dokumentation und Commit**

- `DESIGN.md` 2.4 (Status-Farben) und 11.4 (Badge): Dunkelwerte
  ergänzen; den Hinweis, dass die Dunkelfarben Literale sind, streichen.
- `DESIGN.md` 9.3: fünf Zeilen streichen, Modus-Zahlen anpassen.
- `CHANGELOG.md`: unter „Behoben" beschreiben, dass die Reparatur
  **Code entfernt** hat statt welchen hinzuzufügen, und die beiden
  Befunde („fünf Status-Badge-Textfarben als Literale" und die drei
  Kontrastpaare) als erledigt markieren. Die Sonderrolle der einen
  Änderung an `surface-glass.css` ausdrücklich benennen.

```bash
cd /c/Dev/pm-design-kit
git add -A
git commit -m "$(cat <<'MSG'
fix(status): fuenf Dunkelwerte statt fuenf Literale, drei davon ueber AA

components.css trug fuenf Farb-Literale ohne Token, nur weil die fuenf
--status-*-Textfarben keinen eigenen Dunkelwert hatten und sonst auf
ihren Hellwert zurueckgefallen waeren. Eine Ausnahmeregel, die das
Problem zudeckte - und drei der fuenf Literale erreichten trotzdem kein
AA (3,77 bis 4,06:1).

Die Tokens haben ihre Dunkelwerte bekommen, gerechnet gegen die
tatsaechliche, mit der Kartenflaeche geblendete Status-Flaeche. Die fuenf
Ueberschreibungen in components.css sind damit ersatzlos entfallen: die
Grundregel loest von selbst richtig auf.

--status-abgelehnt steht auf zwei Flaechen (Badge und Dropdown-Hover mit
Glas); gerechnet wurde gegen die schwerere. Das gleichnamige Literal in
surface-glass.css:370 ist durch den Token ersetzt - die einzige Aenderung
an dieser Datei in B1, und eine reine Tokenisierung ohne
Gestaltungsentscheidung.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
MSG
)"
```

---

### Aufgabe 6: Sidebar-Literale tokenisieren und korrigieren (4 Paare)

**Welche Paare:** vier, aber zwei Farben — `rgba(255,255,255,0.25)`
(Abschnitts-Beschriftung, `app/css/layout.css:123`) und
`rgba(255,255,255,0.45)` (Logo-Unterzeile, `:87`), jeweils in beiden
Modi gegen `--sidebar-bg` gemessen: 2,25 / 2,27 / 4,10 / 4,47.

**Die Besonderheit dieser Aufgabe:** Das Kit hat **keine
Sidebar-Komponente** — Aufbau ist ausdrücklich nicht sein Gegenstand.
Die beiden Farben stehen in `app/css/layout.css`, einer Datei, die es
hier nicht gibt. Diese Aufgabe fügt deshalb **keine CSS-Regel** hinzu;
sie legt zwei Tokens an und dokumentiert sie als die Werte, die eine
verbrauchende Anwendung für Text auf der Inverse-Oberfläche benutzen
muss. Das ist genau die Lücke, die das Kit schließen soll: Wer eine
Sidebar baut, soll nicht raten, wie dunkel „dezent" sein darf.

**Wichtig (Spec 3.3):** Die Deckkraft wird angehoben, **nicht** in eine
deckende Farbe umgebaut. Eine transluzente weiße Schrift auf der
Inverse-Oberfläche nimmt den Farbstich der Fläche auf; eine deckende
täte das nicht, und das wäre eine Gestaltungsänderung.

**Dateien:**
- Ändern: `css/tokens.css` (zwei neue Tokens im `:root`-Block)
- Ändern: `tokens.json`
- Ändern: `tools/kontrast-paare.json` (vier `ausnahme` entfernen, `vg` auf die Token-Namen umstellen)
- Ändern: `DESIGN.md` 2.5 (Oberflächen/Inverse) und 9.3; `CHANGELOG.md`

**Schnittstellen:**
- Liefert: **einen** neuen Token, `--on-inverse-text-soft`, neben dem
  bestehenden `--on-inverse-text` (deckendes Weiß).

**Es wird ein Token, nicht zwei — nachgerechnet, nicht geraten.** Eine
frühere Fassung dieses Plans wollte eine Dreierstaffel aufstellen
(deckend / 0,45 / 0,25). Das ist rechnerisch unmöglich: gegen
`--sidebar-bg` hell (`#2C2C2C`) landen **beide** Deckkräfte auf
**0,50** (4,69:1). Sie fallen zusammen, weil beide Fließtext tragen und
deshalb denselben Grenzwert haben.

Also zwei Stufen auf der Inverse-Oberfläche: `--on-inverse-text`
(deckendes Weiß, 13,7:1) für primären Text, `--on-inverse-text-soft`
(0,50) für alles Gedämpfte. Logo-Unterzeile **und**
Abschnitts-Beschriftung benutzen `-soft`.

**Und das ist kein Verlust.** Die beiden unterscheiden sich in der
Quelle längst über Typografie: `.sidebar__section-label` ist
Versalschrift in `--text-xs` mit Sperrung, `.sidebar__logo-sub` nicht.
Die Deckkraft trug eine Unterscheidung, die doppelt vorhanden war — und
brach dabei AA. Nach der Korrektur trägt sie die Typografie allein, wie
es sein sollte.

**Als Befund für B2 notieren:** Wer eine dritte, sichtbar schwächere
Stufe auf der Inverse-Oberfläche will, muss sie über Größe, Gewicht oder
Sperrung holen. Über Deckkraft ist sie nicht AA-tauglich zu haben.

- [ ] **Schritt 1: Den fehlschlagenden Zustand herstellen**

In `tools/kontrast-paare.json` bei den vier Sidebar-Paaren das Feld
`"ausnahme"` löschen und `"vg"` von dem Literal auf den künftigen
Token-Namen umstellen. `"hg"` und `"unter"` bleiben `--sidebar-bg`.

- [ ] **Schritt 2: Fehlschlag bestätigen**

```bash
cd /c/Dev/pm-design-kit
npm run check:kontrast
```

Erwartet: FEHLSCHLAG mit vier harten Fehlern und **einer Meldung
`Token unbekannt`**, falls die Tokens noch nicht existieren — beides ist
ein gültiger Rot-Zustand. Ist es die Token-Meldung, lege in Schritt 4
zuerst die Tokens mit ihren **alten** Werten an, prüfe erneut (dann
müssen die vier Zahlen 2,25/2,27/4,10/4,47 erscheinen) und korrigiere
danach. Ohne diesen Zwischenhalt fehlt der Beweis, dass die Tokens
dieselbe Farbe tragen wie die Literale.

- [ ] **Schritt 3: Den einen Wert ausrechnen**

`--sidebar-bg` ist im Hellmodus `var(--pm-grey-800)` = `#2C2C2C` und im
Dunkelmodus `#1A1A1A`. Der **schwerere** Fall ist der hellere Grund,
also der Hellmodus-Wert `#2C2C2C`.

```bash
cd /c/Dev/pm-design-kit
node tools/ton-suchen.mjs --vg "rgba(255,255,255,0.45)" --hg "#2C2C2C" --unter "#2C2C2C" --ziel 4.6 --stellschraube deckkraft
node tools/ton-suchen.mjs --vg "rgba(255,255,255,0.25)" --hg "#2C2C2C" --unter "#2C2C2C" --ziel 4.6 --stellschraube deckkraft
```

**Beide Ausgaben in den Bericht übernehmen** — auch wenn beide dasselbe
Ergebnis liefern. Erwartet wird in beiden Fällen Deckkraft **0,50** bei
4,69:1; **die Ausgabe des Werkzeugs gilt**. Liefern die beiden Läufe
unterschiedliche Werte, melde es zurück: dann trifft die Annahme nicht
zu, auf der die Zusammenlegung zu einem Token beruht.

**Selbst zu prüfen:** Die Abschnitts-Beschriftung
`.sidebar__section-label` ist kleine Versalschrift in `--text-xs` — also
Fließtext im Sinne von WCAG, 4,5:1, **kein** Sonderfall für großen Text.
Der Zielwert bleibt 4,6.

- [ ] **Schritt 4: Den einen Token anlegen**

In `css/tokens.css`, `:root`, direkt hinter `--on-inverse-text`:

```css
  --on-inverse-text-soft: NEUERWERT; /* Rolle: Gedaempfter Text auf Inverse-Oberflaechen - Logo-Unterzeile, Abschnitts-Beschriftungen ueber Navigationsgruppen, alles Sekundaere auf Sidebar/Toast/Welcome-Banner. Zweite und letzte Stufe neben --on-inverse-text (deckend, 13,7:1). B1: die Quelle fuehrt hier ZWEI Literale, rgba(255,255,255,0.45) fuer die Unterzeile (4,10:1) und rgba(255,255,255,0.25) fuer die Beschriftung (2,25:1, der schlechteste Kontrast des Kits nach dem Chip). Beide landen bei der AA-Korrektur auf derselben Deckkraft - sie tragen beide Fliesstext und haben deshalb denselben Grenzwert. Eine dritte, schwaechere Stufe ist ueber Deckkraft nicht AA-tauglich zu haben; die Unterscheidung der beiden traegt ohnehin die Typografie (Versalien, --text-xs, Sperrung). Angehoben wurde die DECKKRAFT, nicht die Farbe - transluzentes Weiss nimmt den Farbstich der Flaeche auf. Jetzt KONTRASTNEU:1. */
```

Kein `[data-theme="dark"]`-Gegenstück: Die Inverse-Oberfläche ist in
beiden Modi dunkel, und der Hellmodus ist der schwerere Fall. Diesen
Umstand im Rollen-Satz benennen, damit ihn niemand für eine vergessene
Zeile hält.

Denselben Token und denselben Rollen-Satz in `tokens.json`.

- [ ] **Schritt 5: Grün bestätigen und Prüfkette**

```bash
cd /c/Dev/pm-design-kit
npm run check:kontrast
npm run soll
```

Erwartet: `OK: 91 Paare geprueft, 3 dokumentierte Befunde.` und
`npm run soll` meldet **„bereits aktuell"** — diese Aufgabe legt nur
Tokens an, keine Regel benutzt sie im Kit.

```bash
npm run check
```

- [ ] **Schritt 6: Dokumentation und Commit**

- `DESIGN.md` 2.5: die **zwei** Stufen als Tabelle — Token, Deckkraft,
  Kontrast auf `--sidebar-bg`, wofür sie gedacht sind. Dazu **einen Satz
  Einsatzregel**: Text auf Inverse-Oberflächen nimmt einen dieser zwei
  Tokens und keine eigene `rgba(255,255,255,…)`-Schreibweise. Und einen
  zweiten Satz, der sagt, warum es nur zwei sind — sonst legt der
  nächste Bearbeiter eine dritte an.
- `DESIGN.md` 9.3: vier Zeilen streichen, Modus-Zahlen anpassen.
- `CHANGELOG.md`: unter „Behoben"; den Befund „Sidebar-Literale ohne
  Token" als erledigt markieren. Ausdrücklich festhalten, dass das Kit
  hier **keine Sidebar-Regel** ergänzt — der Aufbau bleibt außen vor,
  nur die Farbwerte werden verbindlich. Dazu **als neuer Befund für
  B2**: eine dritte, sichtbar schwächere Stufe auf der
  Inverse-Oberfläche ist über Deckkraft nicht AA-tauglich zu haben; wer
  sie will, muss Größe, Gewicht oder Sperrung dafür einsetzen.

```bash
cd /c/Dev/pm-design-kit
npm run check:zahlen
git add -A
git commit -m "$(cat <<'MSG'
fix(inverse): eine gedaempfte Textstufe auf Inverse-Oberflaechen, AA-tauglich

Die Sidebar-Beschriftungen der Vorlage stehen als nackte
rgba(255,255,255,0.25) und 0.45 in layout.css. Die schwaechere erreicht
2,25:1 - nach dem Chip der schlechteste Kontrast im ganzen Befundsatz,
und das an staendig sichtbarem Text.

Ein neuer Token, nicht zwei: beide Deckkraefte landen bei der
AA-Korrektur auf demselben Wert (0,50, 4,69:1), weil beide Fliesstext
tragen und deshalb denselben Grenzwert haben. Die geplante Dreierstaffel
ist rechnerisch unmoeglich. Es bleiben zwei Stufen - deckendes Weiss fuer
primaeren Text, --on-inverse-text-soft fuer alles Gedaempfte.

Kein Verlust: die beiden unterscheiden sich in der Quelle ohnehin ueber
Typografie (Versalien, --text-xs, Sperrung bei der
Abschnitts-Beschriftung). Die Deckkraft trug eine Unterscheidung, die
doppelt vorhanden war, und brach dabei AA.

Angehoben wurde die DECKKRAFT, nicht die Farbe: transluzentes Weiss
nimmt den Farbstich der Flaeche auf, eine deckende Farbe taete das nicht
- das waere eine Gestaltungsaenderung gewesen, keine Reparatur.
Gerechnet gegen den Hellmodus-Wert von --sidebar-bg (#2C2C2C), den
helleren und damit schwereren der beiden Gruende.

Das Kit ergaenzt bewusst KEINE Sidebar-Regel - Aufbau ist nicht sein
Gegenstand. Verbindlich werden nur die Farbwerte.

Als Befund fuer B2 notiert: eine dritte, sichtbar schwaechere Stufe auf
der Inverse-Oberflaeche ist ueber Deckkraft nicht AA-tauglich zu haben.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
MSG
)"
```

---

### Aufgabe 7: Text auf gelber Fläche (3 Paare)

**Welche Paare:**

| Modus | vg | hg | heute | Wo |
|---|---|---|---|---|
| dark | `--pm-grey-900` | `--pm-yellow` | 1,46 | `.chip.selected` |
| dark | `--on-yellow-text` | `--pm-yellow-bg` über `--inverse-surface-soft` | 1,72 | `.pm-select__option--selected` |
| light | `--pm-yellow-darker` | `--pm-yellow-bg` | 3,07 | `.badge--yellow` |

**Warum die drei zusammen entschieden werden (Spec 3.1):** Es ist
dreimal dieselbe Frage — wie dunkel darf Text auf einer gelben Fläche
sein —, nur einmal auf sattem Markengelb, einmal auf einer transluzenten
Gelbfläche im Dunkelmodus und einmal auf zartgelbem Grund im Hellmodus.
Einzeln entschieden entstünden drei unabhängige Antworten für einen
Sachverhalt.

**Zwei der drei sind keine Farbfrage, sondern ein vergessener Eintrag:**

- **`.chip.selected` (1,46:1)** setzt `color: var(--pm-grey-900)`. Im
  Dunkelmodus ist `--pm-grey-900` ein **heller** Textton (`#F4F4F5`) —
  auf der unverändert gelben Fläche praktisch unlesbar. Die Quelle löst
  genau das für `.btn-primary`, `.avatar` und
  `.pm-select__option--selected` mit `--on-yellow-text`; `.chip` fehlt in
  dieser Liste, vermutlich weil es im Berichtsheft derzeit nirgends
  gerendert wird. **Fix: `color: var(--on-yellow-text)`.** Keine neue
  Farbe, kein neuer Token — die Ergänzung einer Liste, die schon existiert.
- **`.pm-select__option--selected` (1,72:1)** benutzt bereits
  `--on-yellow-text`, aber die Fläche ist im Dunkelmodus nicht sattes
  Gelb, sondern `rgba(255,195,0,0.14)` auf `#2C2C2C` — geblendet ein
  dunkles Oliv (`#4A4126`). Ein bewusst dunkler Text auf einer dunklen
  Fläche. Hier ist der **Token falsch gewählt**, und zwar genau
  spiegelbildlich zum Chip.

**Die Entscheidung, die dieser Plan trifft — nachgerechnet, nicht
geraten.** Eine frühere Fassung wollte `--pm-yellow-bg` im Dunkelmodus
verdichten, bis `--on-yellow-text` darauf trägt. Das ist gemessen und
verworfen:

| Deckkraft | geblendete Fläche | `#1A1A1A` darauf | `#F4F4F5` darauf |
|---|---|---|---|
| **0,14 (heute)** | `#4A4126` | 1,72:1 ✗ | **9,21:1 ✓** |
| 0,30 | `#6B591F` | 2,56:1 ✗ | 6,19:1 ✓ |
| 0,50 | `#967816` | 4,11:1 ✗ | 3,85:1 ✗ |
| **0,56 (nötig für dunklen Text)** | `#A28113` | 4,70:1 ✓ | 3,53:1 ✗ |

Dunkler Text bräuchte eine **Vervierfachung** der Deckkraft, und die
Fläche wäre danach ein sattes Oliv-Gold — keine „zartgelbe
Hintergrundfläche" mehr, sondern eine andere Gestaltung. Heller Text
trägt auf der **unveränderten** Fläche mit 9,21:1.

**Der Denkfehler war, `--pm-yellow-bg` für eine Gelbfläche zu halten.**
Im Dunkelmodus ist sie keine: sie ist eine dunkle Fläche mit gelbem
Hauch. `--on-yellow-text` ist definitionsgemäß die Farbe für **satte**
Gelbflächen — auf dieser hat er nichts zu suchen. Die Regel ist nicht
gebrochen, sie wurde falsch angewandt.

Daraus wird die Regel, die das Kit ab B1 aufstellt, und beide
Durchfaller sind Instanzen davon — jeweils in die andere Richtung:

| Fläche | Textfarbe | Warum |
|---|---|---|
| **Satt gelb** (`--pm-yellow`) | `--on-yellow-text` | bleibt in beiden Modi dunkel, weil die Fläche in beiden Modi hell ist |
| **Gelb getönt** (`--pm-yellow-bg`, `--pm-yellow-pale`) | `--pm-grey-900` | folgt dem Modus, weil die Fläche dem Modus folgt |

`--pm-grey-900` ist genau der richtige Token: `#1A1A1A` im Hellmodus
(16,7:1 auf `#FFFAEB`), `#F4F4F5` im Dunkelmodus (9,21:1 auf der
getönten Fläche). **Kein neuer Token, kein geänderter Farbwert, keine
geänderte Fläche** — ein Token-Tausch an einer Regel.

Der Chip ist der Spiegelfall: er stand auf `--pm-grey-900` und liegt auf
**sattem** Gelb, wo der Token im Dunkelmodus hell wird — 1,46:1. Er
bekommt `--on-yellow-text`. Beide Befunde haben dieselbe Ursache: die
zwei Flächenarten wurden nicht unterschieden.

**Dateien:**
- Ändern: `css/components.css` (`.chip.selected` → `--on-yellow-text`; jeder Text auf getönter Gelbfläche → `--pm-grey-900`)
- Ändern: `css/tokens.css`, `tokens.json` (nur `--pm-yellow-darker` hell; Rollen-Sätze der Gelb-Tokens)
- Ändern: `tools/kontrast-paare.json`
- Ändern: `DESIGN.md` 2.1, 9.3, 11.13; `CHANGELOG.md`

**Schnittstellen:**
- Verbraucht: `node tools/ton-suchen.mjs` aus Aufgabe 2.
- Liefert: nichts, was spätere Aufgaben brauchen.

**`--pm-yellow-bg` behält seinen Wert** — in beiden Modi. Die Tabelle
oben zeigt, warum.

- [ ] **Schritt 1: Den fehlschlagenden Zustand herstellen**

Die drei `"ausnahme"`-Felder in `tools/kontrast-paare.json` löschen.
Zusätzlich `"vg"` auf die Farbe umstellen, die dort künftig steht:

- Chip-Paar: `--pm-grey-900` → `--on-yellow-text`
- PmSelect-Paar: `--on-yellow-text` → `--pm-grey-900`

- [ ] **Schritt 2: Fehlschlag bestätigen**

```bash
cd /c/Dev/pm-design-kit
npm run check:kontrast
```

Erwartet: Chip-Paar und PmSelect-Paar sind nach der `vg`-Umstellung
**grün** (rund 11,4:1 bzw. 9,2:1); übrig bleibt **ein** harter Fehler,
das `--pm-yellow-darker`-Paar mit 3,07:1.

Dass zwei Paare grün werden, noch bevor du `components.css` angefasst
hast, ist erwartet: die Prüfung rechnet Tokens, nicht CSS-Regeln. Die
Regeln musst du trotzdem korrigieren, sonst weicht das Gerenderte vom
Gerechneten ab — Schritt 4 und der Soll-Abgleich in Schritt 6 sind dafür
die Wächter.

- [ ] **Schritt 3: Alle Verbraucher der Gelbflächen erfassen**

Such mit dem **dedizierten Grep-Werkzeug** jede Fundstelle von
`var\(--pm-yellow-bg`, `var\(--pm-yellow-pale` und
`var\(--pm-yellow\b` in `css/base.css` und `css/components.css`.

Trage sie im Bericht als Tabelle zusammen: Datei, Zeile, Selektor,
welche Fläche, welche Textfarbe steht heute darauf — und nach der Regel
aus dieser Aufgabe: welche gehört darauf.

| Fläche | gehört darauf |
|---|---|
| `--pm-yellow` (satt) | `--on-yellow-text` |
| `--pm-yellow-bg`, `--pm-yellow-pale` (getönt) | `--pm-grey-900` |

Jede Abweichung in dieser Tabelle ist eine Regel, die Schritt 4 ändert.
**Für jede, die noch kein Kontrastpaar hat, legst du eines an** — sonst
ist die Regel aufgestellt und ungeprüft.

- [ ] **Schritt 4: Die Regeln korrigieren und den einen Farbwert ausrechnen**

In `css/components.css` bei `.chip.selected`:

```css
  /* B1: war color: var(--pm-grey-900). Der Chip liegt auf SATTEM Gelb
     (--pm-yellow), und dort loest --pm-grey-900 im Dunkelmodus auf einen
     HELLEN Textton auf (#F4F4F5) - 1,46:1, der schlechteste Wert des
     ganzen Kits. Auf satten Gelbflaechen gehoert --on-yellow-text hin,
     der in beiden Modi dunkel bleibt; genau so macht es die Quelle bei
     .btn-primary und .avatar. .ausbilder-chip fehlte in dieser Liste,
     vermutlich unbemerkt, weil es im Berichtsheft derzeit nirgends
     gerendert wird. */
  color: var(--on-yellow-text);
```

Bei `.pm-select__option--selected` — und bei jeder weiteren Stelle, die
Schritt 3 als „getönte Fläche mit `--on-yellow-text`" ausgewiesen hat:

```css
  /* B1: war color: var(--on-yellow-text). Im Dunkelmodus ist
     --pm-yellow-bg aber KEINE Gelbflaeche, sondern eine dunkle Flaeche
     mit gelbem Hauch (rgba(255,195,0,0.14) auf #2C2C2C, geblendet
     #4A4126) - der bewusst dunkle --on-yellow-text ergab darauf 1,72:1.
     Die Flaeche zu verdichten, bis dunkler Text traegt, waere eine
     Vervierfachung der Deckkraft auf 0,56 und danach ein sattes
     Oliv-Gold, also eine andere Gestaltung. --pm-grey-900 folgt
     stattdessen dem Modus wie die Flaeche selbst: 16,7:1 im Hellmodus,
     9,21:1 im Dunkelmodus, bei unveraenderter Flaeche.
     Regel ab B1: satt gelb -> --on-yellow-text, gelb getoent ->
     --pm-grey-900. Siehe DESIGN.md 2.1. */
  color: var(--pm-grey-900);
```

Dann den **einen** Farbwert, der sich ändert:

```bash
cd /c/Dev/pm-design-kit
node tools/ton-suchen.mjs --vg "#B38A00" --hg "#FFFAEB" --ziel 4.6
```

Erwartet `#8D6D00` bei 4,66:1, Farbwinkel 46,3° → 46,4°, auf `--pm-white`
4,86:1 — **die Ausgabe des Werkzeugs gilt**, nicht diese Erwartung.
Ausgabe vollständig in den Bericht.

`--pm-yellow-darker` im `:root`-Block auf diesen Wert setzen,
Rollen-Satz nach dem bekannten Muster mit Vorher-Wert und Grund.
`tokens.json` nachziehen.

**In den Bericht gehört zusätzlich die Liste der übrigen
`--pm-yellow-darker`-Verbraucher** (laut Rolle unter anderem der aktive
Sidebar-Link). Der Ton wird dunkler; ob das dort noch gewollt ist,
entscheidet die Sichtprüfung in Aufgabe 14 — dafür muss sie wissen, wo
sie hinsehen muss.

- [ ] **Schritt 5: Grün bestätigen**

```bash
cd /c/Dev/pm-design-kit
npm run check:kontrast
```

Erwartet: `OK: N Paare geprueft, 0 dokumentierte Befunde.` — das ist der
**Zielzustand der Spec** (Abschnitt 8): null Durchfaller ohne
Begründung. `N` ist 91 plus die Paare, die du in Schritt 3 zusätzlich
angelegt hast.

Bleibt ein Befund stehen, gehört er in den Bericht mit einer Begründung,
die sagt, **warum er nicht behebbar war** — nicht mit einer, die nur
beschreibt, dass er besteht.

- [ ] **Schritt 6: Soll-Stand und Prüfkette**

```bash
cd /c/Dev/pm-design-kit
npm run soll
```

Erwartet:

- `color` an `chip--selected` und an `pm-select__option--selected`
  **nur im Dunkelmodus**. Im Hellmodus sind `--pm-grey-900` und
  `--on-yellow-text` beide `#1A1A1A`; erscheint dort keine Abweichung,
  ist das richtig und gehört so in den Bericht.
- `color` an `badge--yellow` in **beiden** Modi (`--pm-yellow-darker`
  hat einen eigenen Dunkelwert, der hier unberührt bleibt — prüfe, ob
  der Hellmodus allein abweicht, und erkläre es).
- **Keine** `background-color`-Abweichung irgendwo: diese Aufgabe ändert
  keine Fläche. Erscheint eine, hast du `--pm-yellow-bg` angefasst —
  zurücknehmen.

```bash
npm run soll -- --uebernehmen
npm run check
npm run check:zahlen
```

- [ ] **Schritt 7: Dokumentation und Commit**

- `DESIGN.md` 2.1 und 11.13 (Chip): neue Werte; beim Chip die
  Einsatzregel „Text auf Gelb ist immer `--on-yellow-text`" ausdrücklich
  aufnehmen, damit die Liste nicht ein zweites Mal unvollständig bleibt.
- `DESIGN.md` 9.3: Der Abschnitt schrumpft auf **null Ausnahmen** (oder
  auf die begründeten Reste). Die Modus-Überschriften
  `**Hellmodus (0):**` / `**Dunkelmodus (0):**` müssen stehen bleiben —
  `check:zahlen` erwartet sie.
- `CHANGELOG.md`: alle drei Befunde als erledigt markieren; die
  Entscheidung „Fläche verdichten statt Text aufhellen" mit Begründung
  festhalten.

```bash
cd /c/Dev/pm-design-kit
git add -A
git commit -m "$(cat <<'MSG'
fix(gelb): zwei Arten Gelbflaeche unterscheiden, eine Farbe korrigieren

Drei Paare, ein Sachverhalt - und zwei davon waren dieselbe Verwechslung
in entgegengesetzte Richtungen.

Das Kit hat zwei Arten gelber Flaeche, und sie brauchen
entgegengesetzte Textfarben:
- SATT gelb (--pm-yellow) ist in beiden Modi hell, also dunkler Text:
  --on-yellow-text
- gelb GETOENT (--pm-yellow-bg, --pm-yellow-pale) folgt dem Modus, also
  Text, der das auch tut: --pm-grey-900

.chip.selected stand auf --pm-grey-900 und liegt auf satter Flaeche - im
Dunkelmodus heller Text auf Gelb, 1,46:1, der schlechteste Wert des
Kits. .pm-select__option--selected stand spiegelbildlich auf
--on-yellow-text und liegt auf getoenter Flaeche - im Dunkelmodus
dunkler Text auf einem dunklen Oliv (#4A4126), 1,72:1.

Die Flaeche zu verdichten, bis dunkler Text traegt, ist nachgerechnet
und verworfen: es braeuchte eine Vervierfachung der Deckkraft von 0,14
auf 0,56, und die "zartgelbe Hintergrundflaeche" waere danach ein sattes
Oliv-Gold - eine andere Gestaltung, keine Reparatur. Heller Text traegt
auf der UNVERAENDERTEN Flaeche mit 9,21:1.

Beide Faelle sind damit Token-Tausche an einer Regel: kein neuer Token,
kein geaenderter Farbwert, keine geaenderte Flaeche.

Geaendert wurde genau eine Farbe: --pm-yellow-darker lag auf
--pm-yellow-bg im Hellmodus bei 3,07:1 und ist abgedunkelt, Farbwinkel
unveraendert.

Damit erreicht check:kontrast null Durchfaller ohne Begruendung - der
Zielzustand aus Spec 8.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
MSG
)"
```

---

### Aufgabe 8: Fokus, Tastatur, Touch (5 Befunde)

**Was zu tun ist (Spec 4.1):**

| # | Befund | Zu tun |
|---|---|---|
| 1 | `.pm-select__search input:focus` setzt `outline: none` ohne jeden Ersatz | Eigenen Fokusring geben |
| 2 | `.pm-select__option:focus-visible` teilt sich die Deklaration mit `:hover` — Fokus ist optisch nicht vom Zeiger zu unterscheiden | Zusätzliches, eigenes Merkmal |
| 3 | Drei Fokusringe existieren nur als Literal | Tokenisieren oder auf eine bestehende Variante zurückführen |
| 4 | Tooltip-Inhalt ist per Tastatur nicht erreichbar | `:focus-visible` als zweiten Auslöser |
| 5 | Toast lässt sich nicht anhalten | Anhalten bei Zeiger und Fokus (WCAG 2.2.1) |

**Dateien:**
- Ändern: `css/components.css` (alle fünf)
- Ändern: `css/tokens.css`, `tokens.json` (zwei neue Ring-Tokens)
- Ändern: `tools/katalog.mjs` (zwei neue Zustände messbar machen)
- Ändern: `preview.html` (regeneriert)
- Ändern: `DESIGN.md` 9.1, 9.4, 9.5, 11.10; `CHANGELOG.md`

**Schnittstellen:**
- Liefert: `--ring-neutral`, `--ring-success`. Zusammen mit den
  bestehenden `--ring-yellow`, `--ring-yellow-sm`, `--ring-error` sind
  das fünf Ring-Tokens für die sechs Fokus-Darstellungen des Kits; die
  sechste (`.btn-primary`, weißer Zwischenring) bleibt als begründeter
  Sonderfall bestehen.
- Verbraucht: nichts aus früheren Aufgaben.

**Was dieser Plan entscheidet:**

- **Befund 3, PmSelect-Ring:** `.pm-select__trigger:focus-visible` trägt
  `0 0 0 3px rgba(255, 195, 0, 0.18)`. Das ist weder `--ring-yellow`
  (3px, 0.22) noch `--ring-yellow-sm` (2px, 0.18), sondern eine Mischung.
  Er wird **auf `--ring-yellow` zurückgeführt** — gleiche Breite,
  Unterschied nur in einer Nachkommastelle der Deckkraft, also kein
  eigener Gestaltungswille. Ein Token weniger statt eines Tokens mehr.
- **Befund 3, Button-Ringe:** `.btn-secondary` und `.btn-success` tragen
  eigene, farblich zur Schaltfläche passende Ringe. Das **ist** ein
  Gestaltungswille (ein gelber Ring auf grüner Schaltfläche wäre
  fremd), also werden sie **tokenisiert**, nicht eingeebnet.
- **Befund 4, Tooltip:** Nur `:focus-visible` als zweiter Auslöser. Ob
  `.tooltip` langfristig der einzige Selektor wird, bleibt offen (B2).
- **Befund 5, Toast:** Nur das Anhalten. Ein Schließen-Knopf ist ein
  neues Bauteil und gehört nach B2 — der Befund nennt beides, die Spec
  fordert nur das Anhalten.
- **Befund 4 der Touch-Frage:** Das Kit liefert eine **eigene
  `@media (pointer: coarse)`-Ebene** mit, statt die Basisgrößen auf 44px
  zu heben. Grund: Die Basisgrößen zu ändern wäre eine Dichte-Entscheidung
  und damit B2, Achse 6. Eine zusätzliche Ebene ändert am Desktop nichts
  und löst das Problem dort, wo es besteht — genau so macht es die Quelle
  in `app/css/noten.css:624-655`.

- [ ] **Schritt 1: Zwei Ring-Tokens anlegen**

In `css/tokens.css`, `:root`, hinter `--ring-error`:

```css
  --ring-neutral: 0 0 0 3px rgba(44, 44, 44, 0.18);  /* Rolle: Fokusring fuer neutrale Sekundaeraktionen (.btn-secondary) - der Ring nimmt die Farbe der Schaltflaeche auf, ein gelber waere dort fremd. B1: war ein Literal in components.css. */
  --ring-success: 0 0 0 3px rgba(27, 126, 53, 0.22); /* Rolle: Fokusring fuer bestaetigende Aktionen (.btn-success), analog zu --ring-neutral. B1: war ein Literal in components.css. */
```

Im `[data-theme="dark"]`-Block Gegenstücke ergänzen, falls die
bestehenden Ring-Tokens dort welche haben — `--ring-yellow`,
`--ring-yellow-sm` und `--ring-error` haben je einen. Die Deckkräfte
dort sind durchweg höher (0,32 / 0,28 / 0,32 statt 0,22 / 0,18 / 0,18);
dieselbe Anhebung auf die beiden neuen anwenden und im Rollen-Satz
begründen.

`tokens.json` nachziehen.

- [ ] **Schritt 2: Die drei Literale ersetzen**

In `css/components.css`:

- `.btn-secondary:focus-visible` → `box-shadow: var(--ring-neutral);`
- `.btn-success:focus-visible` → `box-shadow: var(--ring-success);`
- `.pm-select__trigger:focus-visible` → `box-shadow: var(--ring-yellow);`
  mit Kommentar:

```css
  /* B1: war 0 0 0 3px rgba(255,195,0,0.18) - weder --ring-yellow
     (3px, 0.22) noch --ring-yellow-sm (2px, 0.18), sondern eine
     Mischung aus beiden. Gleiche Breite wie --ring-yellow, Unterschied
     nur in einer Nachkommastelle der Deckkraft: kein eigener
     Gestaltungswille, sondern Drift. Zurueckgefuehrt. */
  box-shadow: var(--ring-yellow);
```

- [ ] **Schritt 3: Die beiden fehlenden Fokus-Indikatoren ergänzen**

```css
/* B1 (Befund 1): .pm-select__search input:focus setzte outline: none
   OHNE jeden Ersatz - per Ernte bestaetigt (box-shadow: none). Das
   Suchfeld im geoeffneten Dropdown hatte bei Tastaturfokus keinerlei
   sichtbaren Indikator und verletzte damit die Regel aus DESIGN.md 9.1.
   Der kompakte Ring, weil das Feld bereits in einem umrandeten Menue
   sitzt und der grosse dort ueberladen wirkte. */
.pm-select__search input:focus {
  box-shadow: var(--ring-yellow-sm);
}

/* B1 (Befund 2): .pm-select__option:hover und :focus-visible teilten
   sich eine Deklaration - beim Durchtabben der Optionsliste war nicht
   erkennbar, ob die Markierung dem Zeiger oder der Tastatur folgt.
   Der Fokus behaelt die Hover-Flaeche (sonst spraenge die Markierung
   beim Wechsel zwischen Maus und Tastatur) und bekommt ZUSAETZLICH
   eine Innenkante, damit beide Zustaende gleichzeitig lesbar bleiben. */
.pm-select__option:focus-visible {
  box-shadow: inset 0 0 0 2px var(--pm-yellow);
}
```

Die bestehende gemeinsame Deklaration `.pm-select__option:hover:not(:disabled),
.pm-select__option:focus-visible { background: …; outline: none; }` bleibt
erhalten — die neue Regel **ergänzt** sie, sie ersetzt sie nicht.

- [ ] **Schritt 4: Tooltip per Tastatur erreichbar machen**

Überall dort, wo `css/components.css` heute `[data-tooltip]:hover::after`
schreibt, den Fokus als zweiten Auslöser aufnehmen. Die bestehenden
Selektoren mit dem **dedizierten Grep-Werkzeug** suchen (Muster:
`data-tooltip.*::after`) und **jeden** Treffer erweitern — auch den für
`.tooltip`, falls beide Schreibweisen geführt werden:

```css
[data-tooltip]:hover::after,
[data-tooltip]:focus-visible::after,
.tooltip:hover::after,
.tooltip:focus-visible::after {
  /* unveraenderte Deklaration */
}
```

Dazu ein Satz Regel in `DESIGN.md` 9.4: Ein Element mit `data-tooltip`,
das nicht ohnehin fokussierbar ist, braucht `tabindex="0"` — sonst
erreicht die Tastatur den Auslöser gar nicht. Das ist Markup-Sache der
verbrauchenden Anwendung und deshalb Regel, nicht CSS.

- [ ] **Schritt 5: Toast anhaltbar machen**

```css
/* B1 (WCAG 2.2.1 "Pausieren, Beenden, Ausblenden"): der Ablaufbalken
   lief unbedingt 4s durch - wer langsam liest, verliert die Meldung,
   und es gab keine Moeglichkeit, sie stehen zu lassen. Zeiger und
   Fokus halten die Animation jetzt an. focus-within, nicht focus: der
   Toast selbst ist nicht fokussierbar, wohl aber ein Element darin,
   sobald die Anwendung eines einsetzt.
   Ein Schliessen-Knopf ist die uebliche zweite Haelfte dieser
   Ergaenzung - er ist ein neues Bauteil und gehoert nach B2. */
.toast:hover::after,
.toast:focus-within::after {
  animation-play-state: paused;
}
```

- [ ] **Schritt 6: Touch-Ebene ergänzen**

Ans Ende von `css/components.css`:

```css
/* ══════════════════ TOUCH-EBENE (B1) ══════════════════════════════
   Die Zielgeraete sind 11-Zoll-iPads. Die gemessenen Standardmasse
   liegen alle unter der 44px-Trefferflaeche, die DESIGN.md 9.5 als
   Regel nennt: .btn/.form-control 40px, .pm-select__trigger 36px,
   .btn-sm/.btn-icon.btn-sm/.modal__close 32px, native Checkbox 18px,
   Schalter-Track 38x22px. Das Kit lieferte dafuer bis 0.1.0 keine
   Regel - die Quelle loest es seitenspezifisch in
   app/css/noten.css:624-655.

   Bewusst eine ZUSAETZLICHE Ebene statt groesserer Basismasse: die
   Basismasse zu heben waere eine Dichte-Entscheidung (B2, Achse 6) und
   wuerde jede Desktop-Ansicht veraendern. Diese Ebene aendert am
   Desktop nichts.

   pointer: coarse statt einer Breiten-Medienbedingung: ein 11"-iPad ist
   834 oder 1194px breit und faellt durch jedes 768px-Raster - genau der
   Fehler, der in der Quelle dokumentiert ist.

   Bei PmSelect traegt der AUSLOESER die Hoehe, nicht das urspruengliche
   <select> (das ist nach der Umwandlung unsichtbar) - dieselbe
   Feststellung wie in noten.css. */
@media (pointer: coarse) {
  .btn,
  .btn-sm,
  .btn-icon,
  .form-control,
  .pm-select__trigger,
  .pm-select__option,
  .dropdown__item,
  .modal__close,
  .segment__btn {
    min-height: 44px;
  }
  .btn-icon,
  .modal__close {
    min-width: 44px;
  }
  .checkbox-wrap input[type="checkbox"] {
    width: 24px;
    height: 24px;
  }
}
```

**Selbst zu prüfen, bevor du das übernimmst:** Öffne `preview.html` und
kontrolliere jeden Selektor in dieser Liste gegen `tools/katalog.mjs` —
es dürfen nur Klassen darin stehen, die `css/components.css`
tatsächlich kennt. Ein Selektor, den das Kit nicht führt, ist toter Code
und wird gestrichen. Was in der Liste fehlt und aus deiner Messung
heraus hineingehört, nimmst du auf und begründest es im Bericht.

- [ ] **Schritt 7: Die neuen Zustände in den Katalog aufnehmen**

Zwei Zustände sind neu messbar geworden und brauchen einen
Katalog-Eintrag, sonst sichert sie die Paritätsprüfung nicht. In
`tools/katalog.mjs` ergänzen — Muster ist der bestehende Eintrag
`pm-select__search__input--focus`:

```js
  {
    id: 'pm-select__option--focus',
    gruppe: 'PmSelect',
    html: '<div class="pm-select__menu open"><button type="button" class="pm-select__option">Ausbildung</button></div>',
    messSelektor: '[data-id="pm-select__option--focus"] .pm-select__option',
    erzwingen: ['focus-visible'],
    eigenschaften: ['background-color', 'color', 'outline', 'box-shadow'],
  },
```

Den zweiten Eintrag (`pm-select__search__input--focus`) gibt es bereits;
prüfe nur, ob `box-shadow` in seinen `eigenschaften` steht — ohne das
misst die Prüfung den neuen Ring nicht. Falls nicht: ergänzen.

- [ ] **Schritt 8: Vorschau neu bauen und Prüfkette**

```bash
cd /c/Dev/pm-design-kit
npm run build:preview
npm run soll
```

Erwartet: Abweichungen bei `pm-select__trigger--focus` (Ring-Deckkraft
0,18 → 0,22), `btn-secondary--focus`, `btn-success--focus` (jeweils nur
die Schreibweise, **der Wert muss gleich bleiben** — das ist der Beweis,
dass die Tokenisierung nichts verschoben hat), dem neuen
`pm-select__option--focus` und `pm-select__search__input--focus`.

**Wenn bei `btn-secondary--focus` oder `btn-success--focus` der Wert
sich ändert, ist das ein Fehler**, kein Fortschritt: der Token muss das
Literal Zeichen für Zeichen tragen.

```bash
npm run soll -- --uebernehmen
npm run check
npm run check:zahlen
```

- [ ] **Schritt 9: Dokumentation und Commit**

- `DESIGN.md` 9.1: Die Tabelle der sechs Fokus-Darstellungen auf die
  neue Lage bringen — fünf Tokens, ein begründeter Sonderfall, keine
  Literale mehr. Befund 2 (Fokus nicht vom Hover unterscheidbar)
  streichen.
- `DESIGN.md` 9.4: Tooltip-Befund streichen, die `tabindex`-Regel
  aufnehmen.
- `DESIGN.md` 9.5: Aus der Regel, die die verbrauchende Anwendung
  umsetzen muss, wird eine Regel, die das Kit mitliefert. Umformulieren.
- `DESIGN.md` 11.10 (Toast): Anhalten dokumentieren; den Befund auf den
  fehlenden Schließen-Knopf zusammenstreichen.
- `CHANGELOG.md`: fünf Befunde als erledigt markieren.

```bash
cd /c/Dev/pm-design-kit
git add -A
git commit -m "$(cat <<'MSG'
fix(a11y): Fokus sichtbar, Tooltip per Tastatur, Toast anhaltbar, Touch-Ebene

Fuenf Befunde aus der Gruppe Fokus/Tastatur/Touch:

- .pm-select__search input:focus setzte outline: none ohne jeden Ersatz -
  das Suchfeld im geoeffneten Dropdown hatte gar keinen Fokusindikator
- .pm-select__option teilte Hover und Fokus eine Deklaration: beim
  Durchtabben war nicht erkennbar, ob die Markierung dem Zeiger oder der
  Tastatur folgt. Jetzt Hover-Flaeche PLUS Innenkante
- drei Fokusringe waren Literale. Der PmSelect-Ring ist auf --ring-yellow
  zurueckgefuehrt (Unterschied war eine Nachkommastelle, also Drift); die
  beiden Button-Ringe sind tokenisiert, weil ein farblich passender Ring
  dort gewollt ist
- Tooltips reagierten nur auf :hover - fuer Tastatur und Touch unerreichbar
- der Toast lief unbedingt 4s durch (WCAG 2.2.1). Zeiger und Fokus halten
  ihn jetzt an; der Schliessen-Knopf ist ein neues Bauteil und bleibt B2

Dazu die erste @media (pointer: coarse)-Ebene des Kits: 44px
Trefferflaeche auf Touchgeraeten. Bewusst additiv statt groesserer
Basismasse - letzteres waere eine Dichte-Entscheidung (B2, Achse 6) und
wuerde jede Desktop-Ansicht veraendern. pointer: coarse statt eines
Breiten-Rasters, weil ein 11"-iPad mit 834/1194px durch jedes
768px-Raster faellt.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
MSG
)"
```

---

### Aufgabe 9: Ein Konzept, ein Vokabular (7 Befunde)

**Die gemeinsame Regel (Spec 4.2):** Wo zwei Schreibweisen dasselbe
meinen, gewinnt die semantische; die rohe wird zur Ableitung. Und:
**`check:paritaet` muss danach grün bleiben** — Vokabular aufzuräumen
darf den gerenderten Zustand nicht verändern. Wo es ihn doch verändert,
ist es keine Aufräumarbeit mehr, sondern eine Entscheidung, die
begründet werden muss.

| # | Befund | Entscheidung dieses Plans |
|---|---|---|
| 1 | `--shadow-yellow` mit und ohne Leerzeichen geschrieben | Schreibweise mit Leerzeichen in beiden Blöcken |
| 2 | Zwei parallele Schatten-Vokabulare | Rohe Skala trägt die Werte, semantische Rollen verweisen darauf, Komponenten benutzen **nur** Rollen |
| 3 | Vierte Easing-Kurve nur als Literal | `--ease-standard` wieder aufnehmen, Kurve unverändert |
| 4 | Zwei Rahmentöne für gleichrangige Bedienelemente | `--pm-grey-300` gewinnt für Eingabezonen |
| 5 | `--sidebar-w` trägt 220px statt 256px | Auf 256px korrigieren, Ernte-Viewport festschreiben |
| 6 | `border: 1.5px` rendert bei einfacher Pixeldichte als 1px | Erst messen, dann entscheiden (Schritt 6) |
| 7 | Drei Literale in `.stat-card__icon--*` doppeln Tokens (Übergabe aus Aufgabe 5) | Auf die semantischen Tokens aus Aufgabe 4 ziehen |

**Nicht in dieser Aufgabe, obwohl in derselben CHANGELOG-Gruppe:** Der
Befund „zwei Gedankenstriche im Umlauf" betrifft neun Stellen in
`app/js/*.js` — **im Quellrepo**, das für diese Arbeit nur lesbar ist.
B1 kann ihn nicht beheben. Was B1 tut: prüfen, ob das **Kit selbst**
irgendwo den Geviertstrich `—` als Platzhalter für „kein Wert" benutzt
(in Prosa ist er richtig und bleibt), und die Regel in `DESIGN.md` 13.5
als verbindlich kennzeichnen. Der Befund bleibt offen und wird in
Aufgabe 14 als Aufgabe für den Auftraggeber aufgeführt.

**Ebenfalls hier entschieden:** Das `!important` an `.icon-plain`
**bleibt**. Die Klasse ist seit Aufgabe 4 optional statt fest an
`.stat-card__icon` gebunden; wer eine gefüllte Icon-Fläche will, lässt
sie einfach weg. Damit ist das `!important` kein Zwang mehr, sondern die
Zusage, die die Klasse gibt — sie heißt „plain", und sie muss auch dann
plain sein, wenn ein Theme etwas anderes malt. In `DESIGN.md` als
Entscheidung festhalten, den Befund schließen.

**Dateien:**
- Ändern: `css/tokens.css`, `tokens.json` (Schreibweise, Ableitungen, `--ease-standard`, `--sidebar-w`)
- Ändern: `css/components.css` (Rollen statt roher Schatten, Rahmenton, Easing, `.stat-card__icon--*`, ggf. `1.5px`)
- Ändern: `tools/harvest.mjs` (Ernte-Viewport)
- Ändern: `DESIGN.md` 4.5, 6, 7, 13.5; `CHANGELOG.md`

**Schnittstellen:**
- Verbraucht: die acht semantischen Dunkelwerte aus Aufgabe 4 und die
  fünf Status-Dunkelwerte aus Aufgabe 5. **Ohne beide ist Befund 7 nicht
  entscheidbar.**

- [ ] **Schritt 1: Schreibweise vereinheitlichen (Befund 1)**

In `css/tokens.css` den Hellmodus-Wert von `--shadow-yellow` von
`0 4px 16px rgba(255,195,0,0.30)` auf
`0 4px 16px rgba(255, 195, 0, 0.30)` bringen — Leerzeichen nach den
Kommas, wie im Dunkelmodus und wie bei allen anderen Schatten-Tokens.
`tokens.json` nachziehen.

Das ist eine reine Schreibweise; der Browser rechnet beide gleich.
`npm run soll` muss danach **„bereits aktuell"** melden. Tut es das
nicht, hast du einen Wert verändert.

- [ ] **Schritt 2: Schatten-Vokabular zusammenführen (Befund 2)**

Heute tragen `--shadow-sm/-md/-lg/-xl` und `--elev-rest/-hover/-active/-pop`
**dieselben vier Werte doppelt**. Die rohe Skala behält die Werte, die
Rollen werden zur Ableitung:

```css
  --elev-rest: var(--shadow-sm);   /* Rolle: Semantische Tiefenstufe: Ruhezustand. B1: war eine wortgleiche Kopie von --shadow-sm - jetzt eine Ableitung, damit beide nicht auseinanderlaufen koennen. */
  --elev-hover: var(--shadow-md);  /* Rolle: Semantische Tiefenstufe: Hover. B1: siehe --elev-rest. */
  --elev-active: var(--shadow-lg); /* Rolle: Semantische Tiefenstufe: aktiv/gedrueckt. B1: siehe --elev-rest. */
  --elev-pop: var(--shadow-xl);    /* Rolle: Semantische Tiefenstufe: schwebend/Popover (Modal, Toast, Dropdown-Menue). B1: siehe --elev-rest. */
```

Im `[data-theme="dark"]`-Block ebenso — dort stehen dieselben vier
Dopplungen.

Dann in `css/components.css` die drei Stellen umstellen, die heute die
rohe Skala benutzen: `.modal` und `.toast` von `--shadow-xl` auf
`--elev-pop`, `.pm-select__menu` von `--shadow-lg` auf `--elev-active`.
Die Stellen mit dem **dedizierten Grep-Werkzeug** suchen (Muster:
`var\(--shadow-`) und **jeden** Treffer prüfen; es dürfen danach keine
rohen Schatten mehr in Komponentenregeln stehen.

`--shadow-xs` und `--shadow-yellow` behalten keinen Kit-Verbraucher.
Das ist richtig und kein toter Code: beide sind in der Quelle in
Gebrauch (Extraktionsregel 2). Im Rollen-Satz beider Tokens einen Satz
ergänzen, der das sagt — sonst streicht sie beim nächsten Aufräumen
jemand.

- [ ] **Schritt 3: Vierte Easing-Kurve tokenisieren (Befund 3)**

`@keyframes pmSelectIn` in `css/components.css` benutzt
`cubic-bezier(0.4, 0, 0.2, 1)`. Dieser Wert ist zeichengleich mit
`--ease-standard` der Quelle (`app/css/variables.css:163`, dort
kommentiert als „Material Standard"), das Aufgabe 2 von Schritt A als
ungenutzt entfernt hatte. Ungenutzt war nur der Token, nicht der Wert.

In `css/tokens.css`, `:root`, im Motion-Abschnitt:

```css
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1); /* Rolle: Easing-Kurve: gleichmaessige Standardbewegung ("Material Standard"). B1: der Wert war als Literal in @keyframes pmSelectIn im Umlauf, waehrend sein Token in Schritt A als ungenutzt entfernt worden war - das Kit fuehrte damit vier Kurven, aber nur drei Kurven-Tokens. Wieder aufgenommen; die Kurve selbst ist unveraendert. */
```

Im `@keyframes` das Literal durch `var(--ease-standard)` ersetzen.

**Die Kurve wird nicht geändert.** Sie auf `--ease-out-quart` zu ziehen
wäre eine spürbar andere Bewegung und damit eine Motion-Entscheidung —
B2, Achse 4.

- [ ] **Schritt 4: Rahmenton vereinheitlichen (Befund 4)**

`.form-control` trägt `1px solid var(--pm-grey-300)`,
`.pm-select__trigger` als gleichwertiges Bedienelement daneben
`var(--pm-grey-200)`. Beide stehen im selben Formular nebeneinander.

**`--pm-grey-300` gewinnt**, `.pm-select__trigger` zieht nach. Grund:
Von beiden ist er der wahrnehmbarere (`#B0B0B0` gegen `#E0E0E0` auf
Weiß), und ein Rahmen, der die Eingabezone markiert, muss gesehen
werden. Die Alternative — beide auf den helleren Ton — machte die Grenze
schwächer, und genau da ist sie ohnehin schon zu schwach.

Die Rollen-Sätze beider Tokens entsprechend schärfen:
`--pm-grey-300` wird „Rahmenfarbe von Eingabezonen (Eingabefeld,
PmSelect-Auslöser) sowie Icons — nicht für Text", `--pm-grey-200` wird
„Rahmen- und Trennlinienfarbe von Flächen (Karten, Tabellenzeilen)".

**Als neuen Befund notieren, nicht beheben:** Beide Töne erfüllen die
WCAG-Anforderung 1.4.11 für Bedienelemente (3:1 gegen die Nachbarfläche)
**nicht** — `--pm-grey-300` erreicht auf Weiß 2,16:1, `--pm-grey-200`
1,28:1. Das ist eine Nicht-Text-Kontrastanforderung und damit außerhalb
der 21 Paare, die diese Spec behandelt. In `CHANGELOG.md` unter
„Beobachtungen für Schritt B" aufnehmen, mit beiden gerechneten Werten.

- [ ] **Schritt 5: `--sidebar-w` und den Ernte-Viewport korrigieren (Befund 5)**

Das Kit führt 220px. `app/css/variables.css:175` deklariert als
Grundwert **256px**; die 220px stammen aus einem
`@media (max-width: 1280px)`-Block („Kompakter Tablet-Landscape") in
`app/css/layout.css:766`. Ursache ist der Ernte-Viewport: `harvest.mjs`
ruft `browser.newPage()` ohne Viewport-Angabe auf, Playwrights Standard
ist 1280 × 720 — die Bedingung `max-width: 1280px` greift exakt.

Zwei Änderungen:

In `css/tokens.css` und `tokens.json`:

```css
  --sidebar-w: 256px; /* Rolle: Breite der ausgeklappten Sidebar. B1: von 220px auf 256px korrigiert - 220px war der Tablet-Wert aus einem @media (max-width: 1280px)-Block, den die Ernte mitgenommen hat, weil Playwrights Standard-Viewport genau 1280px breit ist. 256px ist der Grundwert der Quelle. */
```

In `tools/harvest.mjs`, in `ernten()`, `browser.newPage()` ersetzen:

```js
    /* Viewport ausdruecklich setzen (B1). Playwrights Standard ist
       1280x720 - genau die Breite, bei der die Quelle in ihren
       "Kompakter Tablet-Landscape"-Block kippt (app/css/layout.css:766,
       @media (max-width: 1280px)). Dadurch hat die Ernte fuer
       --sidebar-w den Tablet-Wert 220px statt des Grundwerts 256px
       geliefert, und niemand konnte es sehen, weil der Viewport
       nirgends stand. Ein ausdruecklicher Desktop-Viewport macht
       breakpoint-abhaengige Werte reproduzierbar. */
    const seite = await browser.newPage({ viewport: { width: 1600, height: 900 } });
```

Dieselbe Angabe in `tools/messen.mjs` und `tools/shot.mjs` ergänzen,
damit alle drei Werkzeuge dasselbe messen. **Achtung:** Das ändert
möglicherweise gemessene Werte — `npm run soll` in Schritt 8 zeigt es.
Jede Abweichung, die daraus entsteht, gehört einzeln in den Bericht.

- [ ] **Schritt 6: `1.5px` messen, dann entscheiden (Befund 6)**

Nicht raten. Miss, ob `border: 1.5px` bei den Pixeldichten, die die
Zielgeräte benutzen, überhaupt jemals als etwas anderes als 1px
gerendert wird:

```bash
cd /c/Dev/pm-design-kit
node -e "
import('playwright').then(async ({ chromium }) => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const dpr of [1, 1.25, 1.5, 2]) {
    const seite = await browser.newPage({ deviceScaleFactor: dpr, viewport: { width: 1600, height: 900 } });
    await seite.goto('file://' + process.cwd().replace(/\\\\/g, '/') + '/preview.html');
    const w = await seite.evaluate(() => {
      const el = document.querySelector('[data-id=\"form-control\"] .form-control');
      return el && el.getBoundingClientRect().height;
    });
    const b = await seite.evaluate(() => {
      const el = document.querySelector('[data-id=\"form-control\"] .form-control');
      return el && getComputedStyle(el).borderTopWidth;
    });
    console.log('DPR', dpr, '-> borderTopWidth', b, ', Hoehe', w);
    await seite.close();
  }
  await browser.close();
});
"
```

**Die Entscheidungsregel:** Zeigt die Messung bei **keiner** der vier
Pixeldichten einen anderen Wert als bei DPR 1, ist `1.5px` eine
Schreibweise ohne Wirkung — dann in `css/components.css` bei
`.form-control` und `.pm-select__trigger` auf `1px` setzen, mit
Kommentar und der gemessenen Tabelle als Begründung. Zeigt sie bei
irgendeiner Dichte einen Unterschied, bleibt `1.5px` stehen und der
Befund wird mit der Messtabelle **geschlossen**, nicht weitergereicht.

**Die vollständige Messausgabe gehört in den Bericht**, in beiden
Fällen.

- [ ] **Schritt 7: Die drei Stat-Card-Literale auflösen (Befund 7)**

`css/components.css:858-860` setzt
`.stat-card__icon--success` auf `#6BD089`, `--info` auf `#6FB1F2` und
`--error` auf `#F18581`. Das sind dieselben drei Literale, die Aufgabe 5
an den Badges beseitigt hat — hier bedeuten sie aber semantisch Erfolg,
Info und Fehler, nicht einen Berichtsheft-Status. Sie gehören also an
die Tokens aus **Aufgabe 4**:

```css
[data-theme="dark"] .stat-card__icon--success { background: rgba(67, 168, 86, 0.18); color: var(--color-success); }
[data-theme="dark"] .stat-card__icon--info    { background: rgba(25, 118, 210, 0.20); color: var(--color-info); }
[data-theme="dark"] .stat-card__icon--error   { background: rgba(229, 57, 53, 0.20); color: var(--color-error); }
```

Darüber ein Kommentar, der festhält, warum hier die semantischen und
nicht die Status-Tokens stehen.

**Das ändert die gerenderte Farbe** — die neuen Dunkelwerte aus
Aufgabe 4 sind auf `#3D3D3D` gerechnet, die Literale waren es nicht.
Drei neue Kontrastpaare anlegen, Mindestwert **3.0** (Icons sind
Nicht-Text-Inhalt nach WCAG 1.4.11, nicht Fließtext), `hg` die jeweilige
transluzente Fläche, `unter` `--pm-white`:

```json
  {
    "vg": "--color-success",
    "hg": "rgba(67, 168, 86, 0.18)",
    "unter": "--pm-white",
    "modus": "dark",
    "rolle": "Stat-Karten-Icon 'Erfolg' (dunkel) - Icon, nicht Text: WCAG 1.4.11",
    "mindest": 3.0
  },
```

Fällt eines durch, mit `tools/ton-suchen.mjs --ziel 3.1` nachrechnen —
aber **nicht** den semantischen Token dafür verbiegen, der ist in
Aufgabe 4 auf Fließtext gerechnet. Stattdessen die **Fläche**
verdichten, oder den Befund dokumentieren. In den Bericht schreiben,
welchen Weg du genommen hast und warum.

- [ ] **Schritt 8: Prüfkette**

```bash
cd /c/Dev/pm-design-kit
npm run check:tokens
npm run check:kontrast
npm run soll
```

**Erwartung an `npm run soll`, sortiert nach Ursache:**

| Erwartete Abweichung | Aus Schritt |
|---|---|
| `border-*-width` an `.form-control`/`.pm-select__trigger`, falls auf 1px gestellt | 6 |
| `border-color` an `.pm-select__trigger` | 4 |
| `color` an den drei Stat-Card-Icons im Dunkelmodus | 7 |
| alles, was der neue Viewport verschiebt | 5 |

**Keine** Abweichung darf aus den Schritten 1, 2 und 3 stammen — das
sind reine Schreibweisen. Erscheint dort eine, hast du einen Wert
verändert: Ursache klären, bevor du übernimmst.

```bash
npm run soll -- --uebernehmen
npm run check
npm run check:zahlen
```

- [ ] **Schritt 9: Dokumentation und Commit**

- `DESIGN.md` 6: Die Regel „Rolle statt Zahl" gilt jetzt ohne Ausnahme
  — den Befund streichen und stattdessen sagen, dass die rohe Skala die
  Werte trägt und die Rollen darauf verweisen.
- `DESIGN.md` 7 (Motion): `--ease-standard` als vierte Kurve aufnehmen.
- `DESIGN.md` 4.5: `--sidebar-w`-Befund streichen, 256px eintragen, den
  festen Ernte-Viewport als Verfahren dokumentieren.
- `DESIGN.md` 13.5: Die Gedankenstrich-Regel als verbindlich
  kennzeichnen und dazusagen, dass die neun Fundstellen in der Quelle
  liegen und von dort behoben werden müssen.
- `CHANGELOG.md`: sieben Befunde als erledigt markieren, den neuen
  1.4.11-Befund und den offenen Gedankenstrich-Befund aufnehmen.

```bash
cd /c/Dev/pm-design-kit
git add -A
git commit -m "$(cat <<'MSG'
refactor(tokens): ein Konzept, ein Vokabular (7 Befunde)

- Schatten: die vier semantischen Rollen waren wortgleiche Kopien der
  rohen Skala. Jetzt Ableitungen; Komponenten benutzen nur noch Rollen,
  --elev-pop hat damit endlich einen Verbraucher (Modal, Toast)
- Easing: cubic-bezier(0.4, 0, 0.2, 1) lief als Literal in @keyframes
  pmSelectIn, waehrend sein Token in Schritt A als ungenutzt entfernt
  worden war - das Kit fuehrte vier Kurven bei drei Tokens.
  --ease-standard wieder aufgenommen, die Kurve unveraendert
- Rahmen: .form-control und .pm-select__trigger trugen zwei verschiedene
  Toene fuer dieselbe Aufgabe. --pm-grey-300 gewinnt, weil ein Rahmen,
  der die Eingabezone markiert, gesehen werden muss
- --sidebar-w: 220px war der Tablet-Wert. Playwrights Standard-Viewport
  ist genau 1280px breit und traf damit den @media (max-width: 1280px)-
  Block der Quelle. Korrigiert auf 256px, und alle drei Messwerkzeuge
  setzen den Viewport jetzt ausdruecklich
- --shadow-yellow: Schreibweise in beiden Bloecken vereinheitlicht
- die drei Literale an .stat-card__icon--* auf die semantischen Tokens
  aus der vorigen Aufgabe gezogen
- 1.5px-Raender bei vier Pixeldichten nachgemessen statt geraten

.icon-plain behaelt sein !important: die Klasse ist seit Aufgabe 4
optional, damit ist das !important kein Zwang mehr, sondern die Zusage,
die die Klasse gibt.

Der Gedankenstrich-Befund bleibt offen - seine neun Fundstellen liegen
im Quellrepo, das fuer diese Arbeit nur lesbar ist.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
MSG
)"
```

---

### Aufgabe 10: Typografie (2 Befunde)

**Befund 1 — `.segment__btn` setzt `font-weight: 600`,** ein Gewicht,
das die Skala nicht kennt (`--fw-light` 300, `--fw-regular` 400,
`--fw-medium` 500, `--fw-bold` 700). Unverändert aus
`app/css/planer-board.css` übernommen.

**Entscheidung:** `--fw-medium` (500). Sein Rollen-Satz nennt ausdrücklich
„betonte Labels, Chips, Tabellen- und Sidebar-Beschriftungen" — eine
Segment-Beschriftung ist genau das. 600 als fünfte Stufe aufzunehmen wäre
eine Skalen-Entscheidung (B2, Achse 5) und würde für **einen** Verbraucher
eine ganze Stufe schaffen.

**Befund 2 — es fehlen die Libre-Franklin-Schnitte Regular (400) und
Medium (500).** `fonts/` führt nur `librefranklin-bold.ttf` (700) und
`librefranklin-light.ttf` (300). Das Brand Manual nennt alle vier.

**Was B1 hier tut und was nicht:** Die beiden Dateien zu beschaffen
heißt, Binärdateien aus einer externen Quelle in ein Firmen-Repo zu
legen. Das ist eine Entscheidung des Auftraggebers, keine, die im
Rahmen dieser Aufgabe getroffen wird — sie wird in Aufgabe 14 als
offener Punkt vorgelegt. **Weder lädst du Schriftdateien herunter noch
legst du Platzhalter an.**

Was B1 stattdessen tut: den Fehler **unmöglich machen**. Solange die
Dateien fehlen, darf `--font-heading` nur mit 300 oder 700 benutzt
werden; jedes andere Gewicht erzeugt stillschweigend einen synthetischen
oder falschen Schnitt. Diese Regel steht heute in `DESIGN.md` 3.2 — und
nichts prüft sie. Aufgabe 10 macht daraus eine Prüfung.

**Dateien:**
- Ändern: `css/components.css` (`.segment__btn`)
- Ändern: `tools/check-css-regeln.mjs` (neue Prüfung)
- Ändern: `DESIGN.md` 3.2, 11.16; `CHANGELOG.md`

**Schnittstellen:**
- Verbraucht: nichts. Liefert: nichts.

- [ ] **Schritt 1: Den Ist-Zustand des Segments messen**

Bevor du das Gewicht änderst: prüfe, ob der **aktive** Segment-Knopf
sich heute allein über das Gewicht vom inaktiven unterscheidet. Wenn ja,
löscht eine Änderung von 600 auf 500 diese Unterscheidung nicht — aber
sie verkleinert sie, und das gehört gewusst.

```bash
cd /c/Dev/pm-design-kit
node -e "
import('node:fs/promises').then(async (fs) => {
  const s = JSON.parse(await fs.readFile('extraktion/soll-light.json', 'utf8')).komponenten;
  for (const [id, w] of Object.entries(s)) {
    if (id.startsWith('segment')) console.log(id, JSON.stringify(w));
  }
});
"
```

Die Ausgabe in den Bericht übernehmen. Unterscheiden sich aktiver und
inaktiver Knopf **nur** im Gewicht, ist das ein Befund für B2
(„aktiver Zustand trägt zu wenig") — notieren, nicht hier lösen.

- [ ] **Schritt 2: Das Gewicht auf die Skala ziehen**

In `css/components.css` bei `.segment__btn`:

```css
  /* B1: war font-weight: 600 - ein Gewicht, das die Skala des Kits
     nicht kennt (300/400/500/700), unveraendert aus
     app/css/planer-board.css uebernommen. Auf --fw-medium gezogen:
     dessen Rolle nennt ausdruecklich "betonte Labels, Chips,
     Tabellen- und Sidebar-Beschriftungen", und eine
     Segment-Beschriftung ist genau das. 600 als fuenfte Stufe
     aufzunehmen waere eine Skalen-Entscheidung (B2) und schuefe fuer
     EINEN Verbraucher eine ganze Stufe. */
  font-weight: var(--fw-medium);
```

- [ ] **Schritt 3: Die Schrift-Regel prüfbar machen**

In `tools/check-css-regeln.mjs` eine zweite Prüfung ergänzen. Sie geht
jede Regel der drei Kit-CSS-Dateien durch und schlägt an, wenn ein
Regelblock `font-family: var(--font-heading)` **und** ein
`font-weight` außerhalb der gedeckten Gewichte setzt:

```js
/* B1: Prueft die Regel aus DESIGN.md 3.2 - auf --font-heading duerfen
   nur die Gewichte stehen, fuer die eine Schriftdatei existiert.

   Warum das eine Pruefung braucht und keine Prosa: fonts/ fuehrt nur
   librefranklin-bold.ttf (700) und librefranklin-light.ttf (300).
   Regular (400) und Medium (500) fehlen, obwohl das Brand Manual sie
   nennt. Setzt jemand --fw-medium auf eine Ueberschrift, faellt der
   Browser mangels passender Datei auf den Light-Schnitt zurueck
   (sichtbar zu duenn) oder fettet synthetisch nach - beides ohne
   Fehlermeldung, beides erst im Rendering zu sehen. Die Quelle hat
   genau diesen Fehler an fuenf Stellen (font-weight: 800 auf
   --font-heading, alles grosse Kennzahlen).

   Sobald die beiden fehlenden Schnitte beschafft sind, wird
   GEDECKTE_GEWICHTE erweitert - und nur dann. */
const GEDECKTE_GEWICHTE = new Set(['300', '700', 'var(--fw-light)', 'var(--fw-bold)']);
```

Die Prüfung schlägt fehl mit einer Meldung, die Datei, Selektor und
gefundenes Gewicht nennt, und die auf `DESIGN.md` 3.2 verweist.

Bestehende Struktur von `check-css-regeln.mjs` zuerst lesen und die
neue Prüfung in ihrem Stil ergänzen — nicht danebenstellen.

- [ ] **Schritt 4: Die Prüfung gegen sich selbst beweisen**

Eine Prüfung, die noch nie angeschlagen hat, ist keine. Trage
vorübergehend in `css/components.css` bei einer Regel mit
`font-family: var(--font-heading)` ein `font-weight: var(--fw-medium)`
ein:

```bash
cd /c/Dev/pm-design-kit
npm run check:css
```

Erwartet: FEHLSCHLAG mit Datei, Selektor und dem Gewicht. Dann die
Zeile wieder entfernen und erneut prüfen:

```bash
npm run check:css
```

Erwartet: grün. **Beide Ausgaben in den Bericht.**

- [ ] **Schritt 5: Prüfkette**

```bash
cd /c/Dev/pm-design-kit
npm run soll
```

Erwartet: **genau eine** Abweichung je Modus —
`font-weight` an den Segment-Knöpfen, `600` → `500`.

```bash
npm run soll -- --uebernehmen
npm run check
npm run check:zahlen
```

- [ ] **Schritt 6: Dokumentation und Commit**

- `DESIGN.md` 3.2: Die drei Regeln bleiben, bekommen aber den Zusatz,
  dass `check:css` sie jetzt erzwingt.
- `DESIGN.md` 11.16 (Segment): Gewicht korrigieren.
- `CHANGELOG.md`: Befund 1 als erledigt markieren. Befund 2 **bleibt
  offen** und wird umformuliert: aus „fehlende Schnitte" wird „fehlende
  Schnitte, Beschaffung offen — bis dahin durch `check:css` abgesichert".

```bash
cd /c/Dev/pm-design-kit
git add -A
git commit -m "$(cat <<'MSG'
fix(typo): Segment-Gewicht auf die Skala, Schrift-Regel wird geprueft

.segment__btn setzte font-weight: 600 - ein Gewicht, das die Skala des
Kits nicht kennt. Auf --fw-medium gezogen, dessen Rolle genau diesen
Einsatz nennt. 600 als fuenfte Stufe aufzunehmen waere eine
Skalen-Entscheidung (B2) und schuefe fuer einen Verbraucher eine Stufe.

Die fehlenden Libre-Franklin-Schnitte (400, 500) sind NICHT beschafft:
Binaerdateien aus einer externen Quelle in ein Firmen-Repo zu legen ist
eine Entscheidung des Auftraggebers. Stattdessen macht check:css die
Regel aus DESIGN.md 3.2 jetzt erzwingbar - auf --font-heading darf nur
stehen, wofuer eine Schriftdatei existiert. Bisher war das Prosa, und
ein Verstoss faellt sonst erst im Rendering auf: der Browser fettet
synthetisch nach oder faellt auf den Light-Schnitt zurueck, beides ohne
Fehlermeldung. Die Quelle hat genau diesen Fehler an fuenf Stellen.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
MSG
)"
```

---

### Aufgabe 11: Dunkelmodus und vier Bauteil-Fehler (6 Befunde)

**Was diese sechs gemeinsam haben:** Es sind die letzten Befunde, bei
denen etwas **nicht funktioniert**, statt nur uneinheitlich zu sein.
Alles Verbleibende ist Geschmack und gehört nach B2.

| # | Befund | Entscheidung dieses Plans |
|---|---|---|
| 1 | `::selection` im Dunkelmodus: heller Text auf Markengelb | Dunkelmodus-Überschreibung ergänzen |
| 2 | `--status-entwurf` und `-mid` fallen im Dunkelmodus zusammen | Nach Aufgabe 5 neu bewerten |
| 3 | Pflichtfeld-Sternchen steht auf `display: none` | Sichtbar machen |
| 4 | `.form-error` hat im Quellrepo keine Markup-Referenz | Bauteil behalten, Regel verbindlich machen |
| 5 | `.toast--warning` fehlt, obwohl `Toast.warning()` die Klasse setzt | Ergänzen |
| 6 | `.stat-card:hover` hebt eine Karte, die `cursor: default` trägt | Hebung auf interaktive Karten einschränken |

**Dateien:**
- Ändern: `css/base.css` oder `css/components.css` (Befund 1 — siehe Schritt 1)
- Ändern: `css/components.css` (Befunde 3, 5, 6)
- Ändern: `css/tokens.css`, `tokens.json` (nur falls Befund 2 es verlangt)
- Ändern: `tools/katalog.mjs`, `preview.html` (drei neue Zustände)
- Ändern: `tools/kontrast-paare.json` (zwei neue Paare)
- Ändern: `DESIGN.md` 8, 11.6.1, 11.10, 11.3, 12.2, 12.3; `CHANGELOG.md`

- [ ] **Schritt 1: `::selection` im Dunkelmodus (Befund 1)**

`css/base.css` trägt die Basisregel
`::selection { background: var(--pm-yellow); color: var(--pm-grey-900); }`,
unverändert aus der Quelle. `--pm-grey-900` ist im Dunkelmodus aber ein
**heller** Textton (`#F4F4F5`) — markierter Text ist dort fast
unsichtbar. Die Quelle löst das nicht in `base.css`, sondern über
`[data-theme="dark"] ::selection { color: var(--on-yellow-text); }` in
`app/css/components.css`.

**Entscheidung: Die Überschreibung kommt nach `css/base.css`, direkt
unter die Basisregel** — nicht nach `components.css`, wo die Quelle sie
hat. Begründung: `::selection` ist keine Komponente, und die Trennung
der Quelle ist an dieser Stelle nachweislich eine Stolperstelle (der
Befund lautet wörtlich „die `::selection`-Regel, die nicht dort steht,
wo man sie sucht"). Die Regel neben ihrer Basisregel zu führen ist die
einzige Anordnung, bei der niemand die zweite übersehen kann.

```css
/* B1: --pm-grey-900 ist im Dunkelmodus ein HELLER Textton (#F4F4F5) -
   auf der unveraendert gelben Markierflaeche waere markierter Text fast
   unsichtbar. Die Quelle korrigiert das in app/css/components.css, also
   weit entfernt von der Basisregel; genau das war der Befund. Hier steht
   die Korrektur direkt unter der Regel, die sie korrigiert. */
[data-theme="dark"] ::selection {
  color: var(--on-yellow-text);
}
```

Ein Kontrastpaar dafür in `tools/kontrast-paare.json` anlegen
(`--on-yellow-text` auf `--pm-yellow`, `modus: dark`, `mindest: 4.5`) —
sonst ist auch diese Fläche wieder ungeprüft.

- [ ] **Schritt 2: `--status-entwurf` und `-mid` neu bewerten (Befund 2)**

Im Hellmodus sind das zwei unterscheidbare Bernstein-Töne (`#96650A`
und `#C98A00`), im Dunkelmodus beide `#F0B429`. Aufgabe 5 hat
`--status-entwurf` dunkel angehoben — **`-mid` aber nicht.**

Lies die beiden aktuellen Werte aus `tokens.json` und entscheide nach
dieser Regel:

- Sind sie jetzt **verschieden**, ist der Befund durch Aufgabe 5
  nebenbei erledigt. Als erledigt markieren, Begründung notieren.
- Sind sie noch **gleich**, bleibt der Befund **offen und wandert nach
  B2**: `-mid` allein aufzuhellen, um Abstand zu schaffen, wäre eine
  Skalen-Entscheidung ohne Kontrastanlass. Den Eintrag in
  „Beobachtungen für Schritt B" auf den neuen Stand bringen, nicht
  löschen.

In beiden Fällen: **keine stille Anpassung.** Das Ergebnis gehört in
den Bericht.

- [ ] **Schritt 3: Pflichtfeld-Sternchen sichtbar machen (Befund 3)**

Die einzige Regel für `.required` im ganzen Ist-Zustand lautet
`.form-label .required { display: none }` — per Ernte bestätigt. Klasse
und Markup existieren, gerendert wird nichts. Pflichtfelder sind damit
**überhaupt nicht** gekennzeichnet.

```css
/* B1: Die einzige Regel fuer .required lautete
   ".form-label .required { display: none }" - Klasse und Markup waren
   da, gerendert wurde nichts, Pflichtfelder waren also gar nicht
   gekennzeichnet. Von den beiden moeglichen Auswegen (sichtbar machen
   oder die tote Klasse entfernen) ist der heutige Zustand der einzige,
   der nichts bringt.

   --color-error, weil das Sternchen dieselbe Sprache spricht wie die
   Fehlermeldung darunter. aria-hidden setzt die verbrauchende Anwendung
   am Markup - das Sternchen ist eine Sehhilfe; fuer Screenreader traegt
   das Feld required/aria-required, siehe DESIGN.md 9.4. */
.form-label .required {
  display: inline;
  margin-left: var(--sp-1);
  color: var(--color-error);
}
```

**Selbst gegenzuprüfen:** `--color-error` hat seit Aufgabe 4 einen
eigenen Dunkelwert. Rechne beide Modi gegen die Kartenfläche nach —
`--color-error` auf `--pm-white` ist als Paar schon in
`kontrast-paare.json` (aus Aufgabe 4). Ist es grün, ist auch das
Sternchen gedeckt; notiere das im Bericht, statt ein drittes Paar
anzulegen.

- [ ] **Schritt 4: `.form-error` verbindlich machen (Befund 4)**

Per Grep über das gesamte `app`-Verzeichnis geprüft: die einzigen
Treffer für `.form-error` und `.form-control--error` sind ihre
CSS-Definitionen. Feldfehler laufen in der Vorlage über Toasts.

**Entscheidung: Das Bauteil bleibt, und `DESIGN.md` erklärt die
Inline-Meldung zur Regel.** Begründung: Eine Fehlermeldung mit
Ablauffrist ist etwas anderes als eine, die stehen bleibt. Ein Toast,
der nach vier Sekunden verschwindet, während der Nutzer noch im Feld
steht, ist für eine Feldvalidierung der falsche Träger — das gilt
unabhängig davon, wie die Vorlage es heute macht. Der heutige
Zwischenzustand (gepflegtes Bauteil, das niemand rendert) ist der
einzige, der nicht vertretbar ist.

**Kein CSS ändert sich.** Was sich ändert:

- `DESIGN.md` 12.2: Die Inline-Variante verliert die Kennzeichnung
  **abgeleitet** und wird Regel.
- `DESIGN.md` 12.3: Der Befund wird umformuliert — aus „Bauteil ohne
  Verwendung" wird „Die Vorlage meldet Feldfehler per Toast; das Kit
  legt sich auf die Inline-Meldung fest, weil eine Meldung mit
  Ablauffrist für eine Feldvalidierung der falsche Träger ist."
- Der Toast bleibt für alles, was **nicht** an einem Feld hängt.

- [ ] **Schritt 5: `.toast--warning` ergänzen (Befund 5)**

`Toast.warning(title, msg)` gibt es in `app/js/app.js:434`;
`Toast.show()` setzt daraufhin `class="toast toast--warning"` samt
eigenem Warndreieck-Icon. Eine `.toast--warning`-Regel existiert in
`app/css/components.css` **nicht** — der einzige Treffer im gesamten
Quell-CSS steht in `app/css/theme-cmd.css`, einer Datei, die gar nicht
zur Ladereihe gehört. Ein Warn-Toast bekommt deshalb heute den gelben
Standard-Ablaufbalken und ist von einer neutralen Meldung nicht zu
unterscheiden.

Neben den bestehenden drei Varianten, im selben Stil:

```css
/* B1: Toast.warning() in der Quelle setzt class="toast toast--warning"
   samt eigenem Warndreieck - eine passende Regel gab es aber nur in
   einer Theme-Datei, die nicht zur Ladereihe gehoert. Ein Warn-Toast
   war deshalb von einer neutralen Meldung nicht zu unterscheiden.
   --color-warning-mid ist der Ton, den die Skala dafuer bereithaelt. */
.toast--warning::after { background: var(--color-warning-mid); }
```

Den genauen Eigenschaftsnamen an den drei bestehenden Varianten
ablesen und **wörtlich** übernehmen — setzen sie `background-color`
statt `background`, gilt das auch hier.

- [ ] **Schritt 6: Stat-Karten-Hebung einschränken (Befund 6)**

`.stat-card:hover` setzt `--elev-hover`, `translateY(-2px)` und
vergrößert das Icon auf `scale(1.05)`, während `.stat-card` selbst
`cursor: default` trägt. `DESIGN.md` 6 sagt wörtlich: überfahren „nur
für Elemente, die auch etwas tun, wenn man klickt".

**Entscheidung: Die Hebung bleibt, sie wird nur auf interaktive
Stat-Karten eingeschränkt** — keine neue Klasse, keine verlorene
Fähigkeit. Die Vorlage führt von Statistikkarten häufig zu einer
Detailansicht; dort ist die Hebung richtig, und wer sie will, macht die
Karte zu dem, was sie vorgibt zu sein.

Die bestehenden Selektoren `.stat-card:hover` und
`.stat-card:hover .stat-card__icon` auf
`a.stat-card:hover` / `button.stat-card:hover` (und die zugehörigen
Icon-Selektoren) umstellen, mit Kommentar:

```css
/* B1: stand als .stat-card:hover - die Karte hob sich beim Ueberfahren,
   obwohl sie cursor: default traegt und nichts ausloest. DESIGN.md 6
   sagt woertlich: ueberfahren "nur fuer Elemente, die auch etwas tun,
   wenn man klickt". Statt die Hebung zu streichen, ist sie jetzt an das
   gebunden, was sie verspricht: eine Statistikkarte, die ein <a> oder
   <button> ist. Die Vorlage fuehrt von ihnen haeufig zu einer
   Detailansicht - dort ist die Hebung richtig. */
```

- [ ] **Schritt 7: Die neuen Zustände in den Katalog aufnehmen**

Drei Zustände sind neu und müssen messbar werden, sonst sichert sie die
Paritätsprüfung nicht:

- `form-label__required` **existiert bereits** — nur prüfen, ob
  `color` und `margin-left` in seinen `eigenschaften` stehen; sonst
  ergänzen.
- `toast--warning` neu anlegen, nach dem Muster des bestehenden
  `toast--error`.
- `stat-card--interaktiv--hover` neu anlegen: `html` mit
  `<a class="stat-card" href="#">…</a>`, `erzwingen: ['hover']`,
  `eigenschaften: ['box-shadow', 'transform']`.

Der bestehende Eintrag `stat-card--hover` misst jetzt eine Karte, die
sich **nicht mehr** hebt. Er bleibt und ist genau deshalb wertvoll: er
belegt die neue Regel. Seinen Kommentar entsprechend anpassen.

- [ ] **Schritt 8: Prüfkette**

```bash
cd /c/Dev/pm-design-kit
npm run build:preview
npm run check:kontrast
npm run soll
```

**Erwartete Abweichungen:** `display`/`color`/`margin-left` am
Pflichtfeld-Sternchen; `background` am neuen `toast--warning`;
`box-shadow` und `transform` an `stat-card--hover` (jetzt Ruhewerte);
`color` an `::selection` lässt sich nicht als Katalog-Eintrag messen —
das ist erwartet und gehört in den Bericht.

```bash
npm run soll -- --uebernehmen
npm run check
npm run check:zahlen
```

- [ ] **Schritt 9: Dokumentation und Commit**

- `DESIGN.md` 8 (Dunkelmodus): `::selection`-Befund streichen.
- `DESIGN.md` 11.6.1: Pflichtfeld-Sternchen neu beschreiben.
- `DESIGN.md` 11.10: vierte Toast-Variante aufnehmen.
- `DESIGN.md` 11.3 und 6: Stat-Karten-Regel.
- `DESIGN.md` 12.2/12.3: siehe Schritt 4.
- `CHANGELOG.md`: fünf Befunde als erledigt markieren, den sechsten
  (`--status-entwurf`/`-mid`) je nach Ergebnis aus Schritt 2.

```bash
cd /c/Dev/pm-design-kit
git add -A
git commit -m "$(cat <<'MSG'
fix(bauteile): vier Bauteile, die nicht taten, was sie versprachen

- ::selection zeigte im Dunkelmodus hellen Text auf Markengelb. Die
  Korrektur steht jetzt direkt unter ihrer Basisregel in base.css, nicht
  wie in der Quelle weit entfernt in components.css - dass man sie dort
  nicht findet, WAR der Befund
- das Pflichtfeld-Sternchen stand auf display: none. Klasse und Markup
  waren da, gerendert wurde nichts: Pflichtfelder waren gar nicht
  gekennzeichnet
- .toast--warning fehlte, obwohl Toast.warning() die Klasse setzt. Ein
  Warn-Toast war von einer neutralen Meldung nicht zu unterscheiden
- .stat-card hob sich beim Ueberfahren, obwohl sie cursor: default
  traegt und nichts ausloest - ein Widerspruch zur eigenen Regel aus
  DESIGN.md 6. Die Hebung ist jetzt an a.stat-card/button.stat-card
  gebunden statt gestrichen: wer sie will, macht die Karte zu dem, was
  sie vorgibt zu sein

.form-error behaelt sein CSS, und DESIGN.md erklaert die Inline-Meldung
zur Regel: eine Meldung mit Ablauffrist ist fuer eine Feldvalidierung
der falsche Traeger. Der heutige Zwischenzustand - ein gepflegtes
Bauteil, das niemand rendert - war der einzige nicht vertretbare.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
MSG
)"
```

---

### Aufgabe 12: Die Tabelle — gemessen, nicht erfunden

**Die größte Einzelaufgabe von B1.** Die Schlussprüfung von Schritt A
hat eine Nutzerverwaltung mit dem Kit gebaut und ist an der Tabelle
hängen geblieben — es gibt keine.

**Die Methode (Spec 5.1):** Die Quelle hat **keine** generische
Tabellen-Komponente, aber fünf echte UI-Datentabellen. Das Kit erfindet
nichts; es misst diese fünf, bestimmt den gemeinsamen Nenner und
begründet jede Abweichung.

| Datei | Klasse | Eigenart |
|---|---|---|
| `app/css/nutzerverwaltung.css:35-75` | `.nv-table` | die vollständigste: Kopf, Zeilentrenner, Zeilen-Hover mit Übergang, Auswahlzustand, Dunkelmodus-Regel |
| `app/css/abteilungsverwaltung.css:5-7` | `.av-table` | „lehnt sich an nutzerverwaltung.css an", aber knapper |
| `app/css/import-ui.css:126-151` | `.ztn-table` | einzige mit klebendem Spaltenkopf und Rollrahmen |
| `app/css/noten.css:355-372` | `.noten-spiegel` | einzige mit Gliederungszeilen quer über die Tabelle |
| `app/css/beurteilung.css:51-86` | `.beurt-table` | Matrix statt Liste: Vollgitter, Kopf ohne Versalien |

**Nicht mitgezählt, und warum:** `app/css/fahrgelderstattung.css:336`
(`.fg-sheet__tabelle`) bildet ein Papierformular nach — Literal-Rahmen
`#333`, feste Zeilenhöhe 25px; `app/css/abteilungs-planer.css:923` und
`app/css/quill-editor.css:465` formatieren Tabellen **im Editorinhalt**,
nicht im Bedienrahmen. `wochenansicht.css`, `dashboard.css`,
`profil.css` und `berichtsheftverwaltung.css` haben entgegen einer
früheren Zählung **gar keine** Tabellenregeln — das mit dem
Grep-Werkzeug selbst gegenprüfen, bevor du dich darauf verlässt.

**Dateien:**
- Anlegen: `tools/tabellen-ernte.mjs` (einmalige Messung, bleibt als Beleg im Repo)
- Ändern: `css/components.css` (neuer Abschnitt Tabelle)
- Ändern: `tools/katalog.mjs`, `preview.html`
- Ändern: `tools/kontrast-paare.json`
- Ändern: `DESIGN.md` (neuer Abschnitt 11.x), `SKILL.md`, `CHANGELOG.md`

**Schnittstellen:**
- Liefert: die Klassen `.table`, `.table--raster`, `.table-wrap`,
  `.table-wrap--fixkopf`, `.table__num`. Aufgabe 14 baut damit die Probe
  aufs Exempel.

- [ ] **Schritt 1: Die fünf Quellen messen**

Lege `tools/tabellen-ernte.mjs` an. Es lädt dieselbe CSS-Reihe wie
`harvest.mjs` **plus** die fünf Seiten-Stylesheets, rendert je ein
Beispiel-Markup pro Quelle und gibt eine Vergleichsmatrix aus.

Struktur — das Modul `ernten()` aus `harvest.mjs` wird **nicht**
wiederverwendet (es liest `KATALOG`), aber `CSS_REIHE`, die
`file://`-Umgehung und der Edge-Start werden nach demselben Muster
gebaut. Die zu messenden Sätze:

```js
const QUELLEN = [
  { name: 'nv-table',       css: 'css/nutzerverwaltung.css',   klasse: 'nv-table' },
  { name: 'av-table',       css: 'css/abteilungsverwaltung.css', klasse: 'av-table' },
  { name: 'ztn-table',      css: 'css/import-ui.css',          klasse: 'ztn-table' },
  { name: 'noten-spiegel',  css: 'css/noten.css',              klasse: 'noten-spiegel' },
  { name: 'beurt-table',    css: 'css/beurteilung.css',        klasse: 'beurt-table' },
];

const MESSPUNKTE = [
  { teil: 'tabelle',    sel: 'table',            props: ['width', 'border-collapse', 'font-size'] },
  { teil: 'kopfzelle',  sel: 'thead th',         props: ['padding', 'text-align', 'font-size', 'font-weight', 'letter-spacing', 'text-transform', 'color', 'background-color', 'border-bottom', 'white-space', 'position'] },
  { teil: 'zeile',      sel: 'tbody tr',         props: ['border-bottom', 'transition'] },
  { teil: 'datenzelle', sel: 'tbody td',         props: ['padding', 'color', 'vertical-align', 'border-bottom', 'border', 'text-align'] },
];
```

Für jede Quelle ein Markup mit `<table class="KLASSE"><thead><tr><th>…`,
und für `.beurt-table` zusätzlich die Zeilen-Klassen, die ihre Regeln
verlangen (`.beurt-row`).

Die Ausgabe ist eine Tabelle **Messpunkt × Eigenschaft × fünf Quellen**,
sodass der gemeinsame Nenner abzulesen ist. Zusätzlich ein zweiter
Lauf mit `erzwingen: hover` auf `tbody tr`, um die Hover-Flächen zu
bekommen.

```bash
cd /c/Dev/pm-design-kit
node tools/tabellen-ernte.mjs > extraktion/tabellen-vergleich.txt
cat extraktion/tabellen-vergleich.txt
```

**Die vollständige Matrix gehört in den Aufgabenbericht.** Sie ist die
Begründung für jeden Wert, den das Kit danach festschreibt.

- [ ] **Schritt 2: Den gemeinsamen Nenner bestimmen**

Aus der Matrix ableiten und im Bericht **als Tabelle mit Stimmenzahl**
festhalten (z. B. „`border-collapse: collapse` — 5 von 5"). Was aus der
Vorabsichtung bereits absehbar ist und von der Messung bestätigt oder
widerlegt werden muss:

| Eigenschaft | Erwartete Lage |
|---|---|
| `width: 100%`, `border-collapse: collapse` | 5 von 5 |
| `font-size: var(--text-sm)` | 4 von 5 (`.av-table` erbt) |
| Kopf in Versalien, `--text-xs`, `--pm-grey-500` | 4 von 5 (`.beurt-table` ist die Matrix-Ausnahme) |
| Zellenpolster | **Streuung:** `--sp-3 --sp-4` zweimal, `--sp-2 --sp-3` zweimal, `--sp-3` einmal |
| Kopf-Sperrung | **Streuung:** `.04em` zweimal, `.05em`, `.06em` |
| Zeilentrenner unten | 4 von 5; `.beurt-table` hat ein Vollgitter |
| Zeilen-Hover | 2 von 5 (`.nv-table`, `.beurt-table`) — beide `--pm-grey-50` |

**Wo die Messung von dieser Erwartung abweicht, gilt die Messung.**
Die Erwartung stammt aus einer Sichtung der Quelltexte, nicht aus einer
Messung der Kaskade.

**Die zwei Entscheidungen, die dieser Plan trifft** (Spec 9.3 erlaubt
sie ausdrücklich und macht sie in B2 revidierbar):

- **Zellenpolster: `var(--sp-3) var(--sp-4)`.** Zwei der fünf tragen es,
  darunter `.nv-table`, an der sich `.av-table` ausdrücklich orientiert
  — das ist die einzige Quelle, die eine andere als Vorbild benennt.
  Die beiden knapperen (`--sp-2 --sp-3`) sind Sonderlagen: `.ztn-table`
  sitzt in einem Dialog mit `max-height: 46vh`, `.beurt-table` ist eine
  Matrix mit `min-width: 620px`. Beide sparen Platz, weil ihnen welcher
  fehlt, nicht weil sie eine andere Dichte wollen.
- **Kopf-Sperrung: `0.04em`.** Zwei von vier, und der kleinste Wert —
  bei Versalien in `--text-xs` ist Sperrung eine Lesehilfe, kein
  Gestaltungsmittel; im Zweifel weniger.

- [ ] **Schritt 3: Die Tabelle bauen**

Neuer Abschnitt in `css/components.css`, mit einem Kopfkommentar, der
die fünf Quellen, die Stimmenzahlen und die beiden Entscheidungen
festhält. Umfang:

- `.table` — Grundgerüst: `width`, `border-collapse`, `font-size`
- `.table thead th` — Spaltenkopf
- `.table tbody tr` — Zeilentrenner und Übergang
- `.table tbody tr:hover` — Zeilen-Hover (`--pm-grey-50`, aus 2 von 5)
- `.table tbody tr:last-child` — kein Trenner unter der letzten Zeile
  (aus `.nv-table`)
- `.table td` — Datenzelle
- `.table__num` — rechtsbündig mit `font-variant-numeric: tabular-nums`
  (gemessen in `.noten-spiegel__rechts` und `.ztn-row__std`)
- `.table-wrap` — Rollrahmen (gemessen in `.ztn-table-wrap` und
  `.beurt-tablewrap`)
- `.table-wrap--fixkopf` — klebender Spaltenkopf (gemessen **einmal**,
  in `.ztn-table`; als Zusatz geführt und als „einmal belegt"
  gekennzeichnet)
- `.table--raster` — Vollgitter für Matrix-Tabellen (aus `.beurt-table`)

**Was nicht gebaut wird:** Sortierbare Spaltenköpfe und
Seitenblätterung gibt es in **keiner** der fünf. Sie bleiben Lücken und
werden in `CHANGELOG.md` unter „Lücken" ausdrücklich als solche
geführt — das ist die Methode des Kits, nicht ihr Versagen.

**Achtung, `position: sticky`:** `.ztn-table thead th` setzt `top: 0`.
Ein `position: sticky` ohne Inset-Wert ist wirkungslos — den `top`-Wert
also unbedingt mitnehmen.

- [ ] **Schritt 4: Katalog-Einträge und Kontrastpaare**

Für jeden der zehn Bausteine einen Katalog-Eintrag anlegen, plus einen
für den Zeilen-Hover (`erzwingen: ['hover']`, `hoverSelektor` auf die
`<tr>`, `messSelektor` auf die `<td>` — der Hover hängt an der Zeile,
gemessen wird die Zelle).

Kontrastpaare für die neuen Textflächen anlegen, in **beiden** Modi:

- Spaltenkopf-Text auf der Kopffläche
- Datenzellen-Text auf `--pm-white`
- Datenzellen-Text auf der Hover-Fläche `--pm-grey-50`

Fällt eines durch, gilt dieselbe Regel wie in den Aufgaben 3–7:
`tools/ton-suchen.mjs`, Ziel 4,6:1, Farbwinkel bleibt. **Ein neues
Bauteil darf nicht mit einem neuen Befund ins Kit kommen.**

- [ ] **Schritt 5: Prüfkette**

```bash
cd /c/Dev/pm-design-kit
npm run build:preview
npm run check:kontrast
npm run check:standalone
npm run soll
```

`check:standalone` ist hier besonders wichtig: Die Tabelle ist das erste
Bauteil, das aus einer **seitenspezifischen** Quelle abgeleitet wurde.
Es darf keine Fremdreferenz (`.nv-`, `.ztn-`, `.beurt-`, `.av-`) im
Kit-CSS zurückbleiben.

```bash
npm run soll -- --uebernehmen
npm run check
```

- [ ] **Schritt 6: Dokumentation und Commit**

- `DESIGN.md`: neuer Abschnitt in Kapitel 11, im Format der übrigen
  Bauteile — Zustände, Werte, Einsatzregel. Ausdrücklich dazu: aus
  welchen fünf Quellen die Werte stammen, mit Stimmenzahl, und welche
  zwei Werte eine Entscheidung waren.
- `SKILL.md`: Die Tabelle in die Schnellreferenz aufnehmen — sie ist
  der häufigste Baustein einer Verwaltungsseite und gehört zu den
  Werten, die man nicht nachschlagen sollte.
- `CHANGELOG.md`: unter „Gespiegelt" (die Werte sind gemessen) mit
  Verweis auf `extraktion/tabellen-vergleich.txt`; die fehlenden
  Sortier- und Blätter-Bausteine unter „Lücken".

```bash
cd /c/Dev/pm-design-kit
npm run check:zahlen
git add -A
git commit -m "$(cat <<'MSG'
feat(tabelle): Tabellen-Bauteil, aus fuenf Quellen gemessen

Die Schlusspruefung von Schritt A hat eine Nutzerverwaltung mit dem Kit
gebaut und ist an der Tabelle haengen geblieben - es gab keine.

Die Quelle hat keine generische Tabellen-Komponente, aber fuenf echte
UI-Datentabellen (nv-table, av-table, ztn-table, noten-spiegel,
beurt-table). Alle fuenf sind gemessen worden, nicht gelesen; die Matrix
liegt als extraktion/tabellen-vergleich.txt bei und begruendet jeden
Wert. Wo die fuenf auseinandergehen - Zellenpolster und Kopf-Sperrung -
ist die Entscheidung im CSS-Kommentar und in DESIGN.md begruendet und
laut Spec 9.3 in B2 revidierbar.

Sortierbare Spaltenkoepfe und Seitenblaetterung gibt es in keiner der
fuenf. Sie bleiben Luecken und stehen als solche im Changelog - das ist
die Methode des Kits, nicht ihr Versagen.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
MSG
)"
```

---

### Aufgabe 13: `.sr-only` und die Breitenregel für Eingabefelder

**Zwei Lücken, die dieselbe Ursache haben:** `DESIGN.md` verlangt beide
ausdrücklich und liefert beide nicht.

**Lücke 1 — `.sr-only`.** `DESIGN.md` 9.4 schreibt wörtlich
„Verstecken heißt `.sr-only`" und räumt im selben Satz ein, dass das Kit
die Klasse nicht führt. Ein barrierefreies Suchfeld ohne sichtbares
Label ist damit nicht baubar.

**Lücke 2 — Feldbreiten.** `.form-control` ist heute immer
`width: 100%`. `DESIGN.md` 9.7 regelt Breiten nur für PmSelect. Wer ein
schmales Suchfeld braucht, erfindet etwas.

**Dateien:**
- Ändern: `css/base.css` (`.sr-only`)
- Ändern: `css/components.css` (Breitenklassen)
- Ändern: `tools/katalog.mjs`, `preview.html`
- Ändern: `DESIGN.md` 9.4, 9.7, 4.1; `SKILL.md`; `CHANGELOG.md`

**Schnittstellen:**
- Liefert: `.sr-only` und die Breitenklassen. Aufgabe 14 baut damit die
  Probe aufs Exempel.

- [ ] **Schritt 1: `.sr-only` anlegen**

Nach `css/base.css`, nicht nach `components.css`: Die Klasse ist kein
Bauteil, sondern ein Grundwerkzeug wie `::selection` oder die
Box-Sizing-Regel.

**Sie ist ausdrücklich abgeleitet, nicht gemessen** — in der Quelle
kommt sie nicht vor. Das ist der erste Fall im Kit, in dem ein Baustein
ohne Vorlage entsteht, und genau deshalb muss der Kommentar ihn als
solchen kennzeichnen.

```css
/* B1 - ABGELEITET, nicht gemessen: diese Klasse kommt in der Vorlage
   nirgends vor. DESIGN.md 9.4 verlangt sie aber woertlich ("Verstecken
   heisst .sr-only") und raeumte im selben Satz ein, dass das Kit sie
   nicht fuehrt - ein barrierefreies Suchfeld ohne sichtbares Label war
   damit nicht baubar.

   Die Umsetzung ist seit Jahren standardisiert und hier unveraendert
   uebernommen. Warum jede einzelne Zeile noetig ist:
   - display: none oder visibility: hidden waeren einfacher, nehmen den
     Inhalt aber AUCH dem Screenreader - das Gegenteil des Zwecks
   - clip-path statt der alten clip-Eigenschaft: clip ist veraltet
   - white-space: nowrap verhindert, dass ein langer Text in der 1px
     hohen Box umbricht und die Zeilenhoehe des Nachbarn verschiebt
   - border-width: 0 statt border: 0, damit ein spaeterer border-style
     nicht wieder Raum belegt */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border-width: 0;
}

/* Gegenstueck: ein Element, das erst bei Tastaturfokus sichtbar wird
   (Sprungmarke "Zum Inhalt"). Ohne dieses Paar ist .sr-only nur zur
   Haelfte benutzbar. */
.sr-only-focusable:focus,
.sr-only-focusable:focus-visible {
  position: static;
  width: auto;
  height: auto;
  padding: revert;
  margin: revert;
  overflow: visible;
  clip-path: none;
  white-space: normal;
}
```

- [ ] **Schritt 2: Die vorkommenden Breiten messen**

Nicht erfinden. Such mit dem **dedizierten Grep-Werkzeug** in
`app/css/*.css` nach Regeln, die einem `.form-control` oder einem
PmSelect eine Breite geben (Muster: `form-control[^{]*\{[^}]*width`
und `pm-select[^{]*\{[^}]*width`), und trage sie mit Fundstelle im
Bericht zusammen. Bereits belegt und als Ausgangspunkt zu bestätigen:

| Fundstelle | Wert | Zweck |
|---|---|---|
| `app/css/abteilungsverwaltung.css:3` | `max-width: 360px` | Suchfeld in einer Werkzeugleiste |
| `app/css/abteilungsdurchlauf.css:311` | `width: 260px` | Suchfeld in einer Filterleiste |
| `app/css/nutzerverwaltung.css:27-32` | `min-width: 200px; max-width: 280px` | Auswahlfilter (Rolle) |
| `app/css/abteilungsdurchlauf.css:315` | `width: 180px` | Auswahlfilter |
| `app/css/berichtsheftverwaltung.css:124` | `min-width: 140px` | Datumsfeld |

**Ebenfalls zu prüfen und in den Bericht:** Was passiert unterhalb der
Breakpoints? `app/css/abteilungsdurchlauf.css:642-645` setzt alle drei
auf `width: 100%`. Das ist die Regel hinter der Regel — feste Breiten
gelten nur, solange Platz ist.

- [ ] **Schritt 3: Die Zuordnung ableiten**

Die Werte gruppieren sich erkennbar in drei Bänder. Leg sie im selben
Format an wie die Abstands-Zuordnung in `DESIGN.md` 4.1 —
**Feldzweck → Breite**, nicht umgekehrt:

| Zweck | Breite | Belegt durch |
|---|---|---|
| Suchfeld in einer Werkzeug-/Filterleiste | schmal | 360px, 260px |
| Auswahlfilter (Rolle, Status, Abteilung) | sehr schmal | 280px, 200px, 180px |
| Datum, Zahl, Kürzel | eng | 140px |
| Alles im Formularfluss | `100%` | der heutige Grundwert |

Für jedes Band **einen** Wert festlegen und begründen — nicht die
Spannweite ins Kit übernehmen. Die Klassen im Stil des Kits benennen
(`.form-control--suche`, `.form-control--filter`, `.form-control--eng`)
und ans Ende des Formular-Abschnitts in `css/components.css` legen.

**Zwei Regeln, die mit hineingehören, weil das Kit sie sonst schuldig
bleibt:**

1. Jede Breitenklasse braucht ihr Verhalten bei Platzmangel. Die
   Quelle löst es mit `width: 100%` unterhalb des Breakpoints; das Kit
   löst es ohne Breakpoint, weil es keinen Aufbau vorgibt:
   `max-width: WERT; width: 100%;` — das Feld nimmt seine Wunschbreite,
   wenn Platz ist, und schrumpft sonst.
2. **PmSelect überstimmt.** `app.js` der Quelle wandelt jedes
   `.form-control`-`<select>` in einen `.pm-select--block`-Wrapper um,
   der mit Spezifität (0,2,0) `width: 100%` erzwingt; die Klassen
   wandern dabei auf den Wrapper. Eine Breitenklasse am `<select>`
   bleibt wirkungslos. Das ist im Quellrepo dokumentiert
   (`app/css/nutzerverwaltung.css:20-25`) und muss in `DESIGN.md` 9.7
   stehen, sonst läuft der erste Anwender genau da hinein.

- [ ] **Schritt 4: Katalog-Einträge**

Je einen Eintrag für `.sr-only` (gemessen wird, dass es **nicht**
sichtbar ist: `position`, `width`, `height`, `clip-path`, `overflow`)
und für jede Breitenklasse (`max-width`, `width`).

- [ ] **Schritt 5: Prüfkette**

```bash
cd /c/Dev/pm-design-kit
npm run build:preview
npm run soll
npm run soll -- --uebernehmen
npm run check
npm run check:zahlen
```

- [ ] **Schritt 6: Dokumentation und Commit**

- `DESIGN.md` 9.4: Der Satz „das Kit führt sie nicht" entfällt.
- `DESIGN.md` 9.7: Die Zuordnung, die `max-width`/`width`-Regel und die
  PmSelect-Warnung.
- `SKILL.md`: Die Breiten-Zuordnung in die Schnellreferenz — das ist
  eine Frage, die sich bei jeder Verwaltungsseite sofort stellt.
- `CHANGELOG.md`: `.sr-only` unter „Lücken" streichen und unter einer
  neuen Rubrik `### Ergänzt (abgeleitet)` führen — sie ist der erste
  Baustein des Kits ohne Vorlage, und das muss auffindbar bleiben.

```bash
cd /c/Dev/pm-design-kit
git add -A
git commit -m "$(cat <<'MSG'
feat(formular): .sr-only und eine Breitenregel fuer Eingabefelder

DESIGN.md verlangte beides ausdruecklich und lieferte beides nicht.

.sr-only ist der erste Baustein des Kits OHNE Vorlage - in der Quelle
kommt die Klasse nirgends vor. Sie ist deshalb als abgeleitet
gekennzeichnet, im CSS-Kommentar und im Changelog. Dazu
.sr-only-focusable: ohne das Gegenstueck ist .sr-only nur zur Haelfte
benutzbar.

Die Breiten sind dagegen gemessen: fuenf Fundstellen in der Quelle,
gruppiert in drei Baender nach Feldzweck, im selben Format wie die
Abstands-Zuordnung in DESIGN.md 4.1. Statt einer festen Breite
max-width + width: 100% - das Feld nimmt seine Wunschbreite, wenn Platz
ist, und schrumpft sonst; die Quelle loest dasselbe mit einem
Breakpoint, den das Kit nicht vorgeben darf.

Mit dokumentiert: PmSelect ueberstimmt jede Breitenklasse am <select>,
weil app.js es in einen .pm-select--block-Wrapper (0,2,0) umwandelt.
Ohne diesen Hinweis laeuft der erste Anwender genau da hinein.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
MSG
)"
```

---

### Aufgabe 14: Abschluss — Zahlen, Sichtprüfung, Probe aufs Exempel, 0.2.0

**Warum das eine eigene Aufgabe ist:** Die dreizehn Aufgaben davor haben
jede für sich geprüft. Was keine von ihnen prüfen konnte: ob die Palette
als Ganzes noch zusammenpasst und ob das Kit seinen Zweck jetzt besser
erfüllt. Beides geht nur am Ende, und beides ist der eigentliche
Gegenstand von Spec 8.

**Dateien:**
- Ändern: `package.json` (Version `0.2.0`)
- Ändern: `CHANGELOG.md`, `DESIGN.md`, `SKILL.md`, `README.md`
- Anlegen: `extraktion/probe-nutzerverwaltung.html` (die Probe aufs Exempel, bleibt als Beleg)

- [ ] **Schritt 1: Vollständige Prüfkette, alles grün**

```bash
cd /c/Dev/pm-design-kit
npm run test:soll
npm run test:farbe
npm run test:tokens
npm run test:ernte
npm run check
```

Erwartet: alles grün. `check:kontrast` muss **„0 dokumentierte
Befunde"** melden — das ist der Zielzustand aus Spec 8. Jede
verbliebene Ausnahme braucht eine Begründung, die sagt, **warum sie
nicht behebbar war**; eine, die nur beschreibt, dass sie besteht, zählt
nicht. Solche Reste hier namentlich auflisten.

- [ ] **Schritt 2: Sichtprüfung der Palette (Spec 3.4)**

Einzelne Kontrastwerte lassen sich rechnen; ob die Palette danach noch
zusammenpasst, nicht.

```bash
cd /c/Dev/pm-design-kit
npm run schuss
```

Die Aufnahmen beider Modi ansehen und **im Bericht beantworten**:

1. Wirkt eine der aufgehellten Farben jetzt grell oder aus der Familie
   gefallen?
2. Sind Stufen, die vorher unterscheidbar waren, zusammengerückt —
   insbesondere `--pm-grey-400`/`-500` und die Status-Töne?
3. Wirkt der aufgehellte Seitengrund noch wie ein Grund oder schon wie
   eine Fläche?

Diese drei Antworten sind der Kern dessen, was dem Auftraggeber
vorgelegt wird. **Keine Änderung aufgrund der Sichtprüfung ohne
Rückmeldung** — das ist Geschmack, und Geschmack ist B2.

- [ ] **Schritt 3: Die Probe aufs Exempel wiederholen (Spec 8.2)**

Die Schlussprüfung von Schritt A hat eine Nutzerverwaltung allein mit
dem Kit gebaut und musste an **elf** Stellen raten; sechs davon waren
echte Lücken (keine Tabelle, keine Feldbreitenregel, kein `.sr-only`,
kein Zeilen-Hover, kein sortierbarer Spaltenkopf, keine
Seitenblätterung). Dieselbe Seite jetzt noch einmal bauen.

Regeln für die Probe:

- **Nur** `DESIGN.md` und `SKILL.md` lesen, nicht `css/components.css`.
  Wer das CSS liest, prüft nicht mehr die Dokumentation.
- Jede Stelle, an der du raten musst, **notieren**, mit dem Grund.
- Die Seite als `extraktion/probe-nutzerverwaltung.html` speichern und
  in beiden Modi rendern (`tools/shot.mjs` als Muster).

Die Seite enthält: Kopfzeile mit Titel und Primäraktion, Filterleiste
mit Suchfeld und Rollen-Auswahl, Tabelle mit Spaltenkopf,
Zeilen-Hover, Status-Badge und Aktionsspalte, Leerzustand,
Bestätigungs-Dialog zum Löschen, Toast für die Rückmeldung.

**Das Ergebnis vergleichen:** Die elf Ratestellen müssen **messbar
weniger** geworden sein. Die Zahl und die Liste gehören in den Bericht
und ins `CHANGELOG.md` — sie ist die einzige Kennzahl, die den Zweck
des Kits direkt misst.

Bleibt eine der sechs Lücken offen, die B1 schließen sollte, ist das
ein Fehlschlag dieser Aufgabe, kein Befund: zurückmelden.

- [ ] **Schritt 4: `CHANGELOG.md` für 0.2.0 fertigstellen**

- Alle behobenen Befunde stehen unter `### Behoben`, jeder mit altem
  Wert, neuem Wert und Begründung.
- In „Beobachtungen für Schritt B" ist **jeder** behobene Eintrag mit
  `**[in 0.2.0 behoben]**` markiert und **keiner gelöscht** (Spec 7) —
  die Liste bleibt als Protokoll lesbar.
- Eine Schlussrechnung: von 56 Befunden sind 30 behoben, 20 nach B2
  verschoben, 6 waren nie Aufgaben. Dazu die in B1 **neu** gefundenen
  Befunde, mindestens: die WCAG-1.4.11-Rahmenkontraste aus Aufgabe 9
  und was die Aufgaben 3–7 an zusammenfallenden Stufen zutage gefördert
  haben.

- [ ] **Schritt 5: Version setzen und Zahlen prüfen**

```bash
cd /c/Dev/pm-design-kit
```

`package.json` auf `"version": "0.2.0"`.

```bash
npm run check:zahlen
npm run check
```

`check:zahlen` ist hier der wichtigste Lauf der ganzen Aufgabe: Er
prüft, dass keine der Zahlen in den vier Markdown-Dateien noch auf dem
Stand von 0.1.0 steht. In Schritt A hat genau dieses Nachziehen von Hand
**dreimal hintereinander** versagt.

- [ ] **Schritt 6: Die offenen Punkte zusammenstellen**

Ein Abschnitt in `CHANGELOG.md` unter 0.2.0, Überschrift
`### Offen — Entscheidung des Auftraggebers`. Er enthält mindestens:

1. **Sie oder Du** in Ausbilder-Ansichten. Das Kit legt sich vorläufig
   auf „Du" fest; `app/js/abteilungs-planer.js:543` siezt. Eine Frage
   an den Auftraggeber, keine ableitbare.
2. **Die fehlenden Libre-Franklin-Schnitte** (Regular 400, Medium 500).
   Beschaffung ist eine Entscheidung über externe Binärdateien im
   Firmen-Repo; bis dahin erzwingt `check:css` die Einschränkung.
3. **Die neun Geviertstriche** in `app/js/*.js` — im Quellrepo, das für
   diese Arbeit nur lesbar ist.
4. **Ob `--pm-grey-400` nach der Korrektur noch eine eigene Stufe ist**
   (Spec 9.2) — Skalen-Entscheidung für B2.
5. Was die Sichtprüfung in Schritt 2 aufgeworfen hat.

- [ ] **Schritt 7: Abschluss-Commit**

```bash
cd /c/Dev/pm-design-kit
git add -A
git commit -m "$(cat <<'MSG'
chore(release): 0.2.0 - Schritt B1 abgeschlossen

30 der 56 Befunde aus Schritt A sind behoben, darunter alle 21
Kontrastpaare unter WCAG AA: check:kontrast meldet null Durchfaller ohne
Begruendung. 20 Befunde sind nach B2 verschoben (die acht
Professionalisierungs-Achsen und was an ihnen haengt), 6 waren nie
Aufgaben, sondern Protokoll.

Drei Luecken geschlossen, die das Kit fuer Verwaltungsseiten unbrauchbar
machten: Tabelle (aus fuenf Quellen gemessen), .sr-only (abgeleitet, als
solche gekennzeichnet) und eine Breitenregel fuer Eingabefelder.

Die Paritaetspruefung prueft seit dieser Version gegen einen
freigegebenen Soll-Stand statt gegen die Vorlage - ohne diesen Umbau
waere sie ab der ersten Farbkorrektur dauerhaft rot gewesen.

Die Probe aufs Exempel (dieselbe Nutzerverwaltung wie in der
Schlusspruefung von Schritt A, allein aus DESIGN.md und SKILL.md gebaut)
liegt als extraktion/probe-nutzerverwaltung.html bei.

1.0.0 bleibt Schritt C vorbehalten.

Co-Authored-By: <Attribution deiner eigenen Sitzung>
MSG
)"
git tag -a v0.2.0 -m "pm-design-kit 0.2.0 - Schritt B1"
```

- [ ] **Schritt 8: Übergabe**

Fasse für den Auftraggeber zusammen, in dieser Reihenfolge:

1. Was sich **sichtbar** geändert hat (die Farben, mit Vorher/Nachher).
2. Das Ergebnis der Probe aufs Exempel: von elf Ratestellen auf wie
   viele.
3. Die drei Fragen aus der Sichtprüfung.
4. Die offenen Punkte aus Schritt 6.
5. Was B2 als Nächstes entscheidet: die acht Achsen.

---

## Selbstprüfung des Plans

Nach dem Schreiben gegen die Spec gelesen.

**1. Spec-Abdeckung**

| Spec-Abschnitt | Abgedeckt durch |
|---|---|
| 2 Sortierung der 56 Befunde | Aufgaben 3–13, Schlussrechnung in 14/4 |
| 3.1 Die 10 Kontrast-Cluster | 3 (Cluster 1+2), 4 (3), 5 (5+6+10), 6 (4), 7 (7+8+9) |
| 3.2 Minimaleingriff | Globale Randbedingungen + Aufgabe 2 (rechenbar gemacht) |
| 3.3 Literale tokenisieren | 5 (Status), 6 (Sidebar), 8 (Fokusringe), 9 (Stat-Card) |
| 3.4 Sichtprüfung | 14/2 |
| 4.1 Fokus, Tastatur, Touch | 8 |
| 4.2 Token-System (9) | 4 (semantische Töne) + 9 (übrige 7) + 9/Vorbemerkung (Gedankenstrich, nicht behebbar) |
| 4.3 Typografie (2) | 10 |
| 4.4 Dunkelmodus (2) + 4 Bauteilfehler | 11 |
| 5.1 Tabelle | 12 |
| 5.2 `.sr-only` | 13 |
| 5.3 Breitenregel | 13 |
| 6 Umbau der Paritätsprüfung | 1 |
| 7 Dokumentation | in jeder Aufgabe der vorletzte Schritt; 14/4 |
| 8 Verifikation | 14/1–3 |
| 9 Offene Punkte | 14/6 |
| 10 Versionierung 0.2.0 | 14/5 |

Keine Lücke.

**2. Platzhalter-Prüfung**

Alle Code-Blöcke enthalten ausführbaren Inhalt. Die
Grossbuchstaben-Marken (`NEUERWERT`, `KONTRASTNEU`) sind **keine**
Platzhalter im verbotenen Sinn: Sie
markieren Werte, die in einem vorangehenden Schritt **ausgerechnet**
werden und die ein Plan nicht vorwegnehmen darf, ohne zu raten — genau
das, was Spec 3.2 untersagt. Der Rechenweg steht jeweils vollständig
dabei.

**3. Namens- und Typkonsistenz**

- `messeVorschau(browser, modus)` — definiert in Aufgabe 1, benutzt in
  1 (check-parity) und 1 (build-soll). Gleich geschrieben.
- `abweichungenFinden(alt, neu)` — definiert in Aufgabe 1, getestet in
  Aufgabe 1. Gleich.
- `sucheHelligkeit` / `sucheDeckkraft` — definiert in Aufgabe 2, benutzt
  in 3, 5, 6, 7, 9, 12. Gleich.
- `--ring-neutral` / `--ring-success` — angelegt in Aufgabe 8, sonst
  nirgends erwartet.
- `--ease-standard` — angelegt in Aufgabe 9.
- `.table` / `.table--raster` / `.table-wrap` / `.table-wrap--fixkopf` /
  `.table__num` — angelegt in Aufgabe 12, benutzt in 14.
- `.sr-only` / `.sr-only-focusable` / `.form-control--suche` /
  `--filter` / `--eng` — angelegt in Aufgabe 13, benutzt in 14.
- `extraktion/vorlage-*.json` / `soll-*.json` — durchgehend so
  geschrieben; `ist-*.json` kommt nach Aufgabe 1 nirgends mehr vor.
