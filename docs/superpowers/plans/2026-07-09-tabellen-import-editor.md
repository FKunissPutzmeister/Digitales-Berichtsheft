# Tabellen im Berichtsheft (IHK-Import + Editor) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** IHK-PDF-Tabellen werden beim Import als echte `<table>`-Strukturen erkannt und übernommen; Azubis können Tabellen im Quill-Editor selbst erstellen/bearbeiten; Tabellen erscheinen im App-PDF-Export.

**Architecture:** Quill 1.3.7 (CDN) wird durch lokal vendored Quill 2.0.3 + `quill-table-better` 1.2.3 ersetzt. Der IHK-Parser bekommt eine Geometrie-Stufe: gestrichene Zellrahmen aus der pdf.js-Operatorliste → Gitter-Clustering (≥ 2×2) → Textzuordnung pro Zelle → In-Band-Tabellenmarker (`\x04…\x05`) im Zeilenstrom → `<table>`-HTML. Export-Whitelist + Druck-CSS werden um Tabellen erweitert.

**Tech Stack:** Vanilla JS (Browser, keine Bundler), pdf.js (vendored), Quill 2.0.3 UMD, quill-table-better 1.2.3 UMD, Node.js `node:test` für Parser-Tests, MSSQL-Backend (unverändert).

**Spec:** `docs/superpowers/specs/2026-07-09-tabellen-import-editor-design.md`

## Global Constraints

- Quill exakt **2.0.3**, quill-table-better exakt **1.2.3**, beide **lokal vendored** (kein CDN).
- Sprache des Tabellen-Moduls: **`de_DE`**.
- Tabellenmarker-Format: `'\x04' + JSON.stringify(rows) + '\x05'`, `rows: string[][]` (Zelle = Zeilen mit `\x02flag…\x03`-Formatmarkern, per `\n` verbunden). Marker ist immer **eine** Zeile im Zeilenstrom.
- Gitter-Heuristik: nur Gruppen mit **≥ 2 Spalten UND ≥ 2 Zeilen** (mind. 4 Zellen) sind Tabellen.
- **Kein Datenverlust:** Jeder Fehlerpfad (Gittererkennung, Marker-Parse) fällt auf das bestehende zeilenweise Verhalten zurück.
- Keine DB-/Backend-Änderung. Bestehende Einträge müssen unverändert laden.
- Nach jedem Parser-Task: kompletter Testlauf `node --test app/js/ihk-parser.test.js` muss grün sein.
- MSYS-`curl` ist auf dem Rechner blockiert → Downloads per **PowerShell `Invoke-WebRequest`**.
- Alle Kommentare/Commit-Messages auf Deutsch, Stil wie im Bestand.

---

### Task 1: Quill 2 + quill-table-better vendoren und in wochenansicht.html einbinden

**Files:**
- Create: `app/js/vendor/quill.js` (Quill 2.0.3 UMD)
- Create: `app/js/vendor/quill-table-better.js` (1.2.3 UMD)
- Create: `app/css/vendor/quill.snow.css`
- Create: `app/css/vendor/quill-table-better.css`
- Modify: `app/wochenansicht.html:19` (CSS-Link) und `app/wochenansicht.html:148` (Script-Tag)

**Interfaces:**
- Produces: globale Variablen `Quill` (v2) und `QuillTableBetter` auf der Wochenansicht-Seite; Task 2 baut darauf auf.

- [ ] **Step 1: Dateien herunterladen (PowerShell, kein curl)**

```powershell
New-Item -ItemType Directory -Force "app/css/vendor" | Out-Null
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js" -OutFile "app/js/vendor/quill.js"
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css" -OutFile "app/css/vendor/quill.snow.css"
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/quill-table-better@1.2.3/dist/quill-table-better.js" -OutFile "app/js/vendor/quill-table-better.js"
Invoke-WebRequest -Uri "https://cdn.jsdelivr.net/npm/quill-table-better@1.2.3/dist/quill-table-better.css" -OutFile "app/css/vendor/quill-table-better.css"
```

- [ ] **Step 2: Downloads verifizieren**

Prüfen: alle 4 Dateien existieren, > 10 KB, und `app/js/vendor/quill.js` enthält den String `2.0.3`, `app/js/vendor/quill-table-better.js` enthält `QuillTableBetter` (UMD-Global).

- [ ] **Step 3: wochenansicht.html umstellen**

Zeile 19 ersetzen:

```html
<!-- ALT -->
  <link rel="stylesheet" href="https://cdn.quilljs.com/1.3.7/quill.snow.css">
<!-- NEU -->
  <link rel="stylesheet" href="css/vendor/quill.snow.css">
  <link rel="stylesheet" href="css/vendor/quill-table-better.css">
```

Zeile 148 ersetzen:

```html
<!-- ALT -->
<script src="https://cdn.quilljs.com/1.3.7/quill.min.js"></script>
<!-- NEU -->
<script src="js/vendor/quill.js"></script>
<script src="js/vendor/quill-table-better.js"></script>
```

- [ ] **Step 4: Smoke-Test**

Dev-Server neu starten (Backend serviert `app/` statisch; plain `node server.js` lädt nicht automatisch neu):

```powershell
# im Ordner backend/ (falls Server läuft: beenden und neu starten)
npm run dev
```

Browser: `http://localhost:3000/wochenansicht.html` öffnen (Dev-Login mit .demo-Azubi). Erwartung: Seite lädt ohne Konsolen-Fehler, Editoren erscheinen. (Tabellen-Button kommt erst in Task 2 — hier zählt nur: Quill 2 lädt lokal, keine 404s auf die 4 Vendor-Dateien.)

- [ ] **Step 5: Commit**

```bash
git add app/js/vendor/quill.js app/js/vendor/quill-table-better.js app/css/vendor/ app/wochenansicht.html
git commit -m "feat(editor): Quill 2.0.3 + quill-table-better 1.2.3 lokal vendored (statt CDN 1.3.7)"
```

---

### Task 2: Tabellen-Modul registrieren, Toolbar-Button, Editor-Optionen + Editor-CSS

**Files:**
- Modify: `app/js/wochenansicht.js:47-63` (QUILL_TOOLBAR + Registrierung + Options-Helfer)
- Modify: `app/js/wochenansicht.js:1224-1232` (`initSingleDayEditor`: modules)
- Modify: `app/js/wochenansicht.js:1713-1721` (`initSingleWochenEditor`: modules)
- Modify: `app/css/quill-editor.css` (Tabellen-Styling ergänzen)

**Interfaces:**
- Consumes: globale `Quill`/`QuillTableBetter` aus Task 1.
- Produces: `quillModules(readonly)` → Quill-`modules`-Objekt; alle Editor-Instanzen können `<table>`-HTML laden, anzeigen und (nicht-readonly) bearbeiten. Tasks 7/9 verlassen sich darauf, dass `dangerouslyPasteHTML('<table><tbody><tr><td><p>…')` als Tabelle übernommen wird.

- [ ] **Step 1: Registrierung + Toolbar + Options-Helfer einbauen**

In `app/js/wochenansicht.js` direkt VOR `const QUILL_TOOLBAR = [` einfügen:

```js
// quill-table-better global registrieren (Blots + Modul). Ohne Registrierung
// würde dangerouslyPasteHTML <table>-HTML beim Laden verwerfen — auch in
// Readonly-Instanzen (Ausbilder-Sicht) muss das Modul daher aktiv sein.
if (window.QuillTableBetter) {
  Quill.register({ 'modules/table-better': QuillTableBetter }, true);
} else {
  console.warn('[Wochenansicht] quill-table-better nicht geladen – Tabellen deaktiviert.');
}
```

In `QUILL_TOOLBAR` nach `['blockquote'],` ergänzen:

```js
  ['table-better'],
```

Direkt NACH dem `QUILL_TOOLBAR`-Array einfügen:

```js
// Gemeinsame Quill-Moduloptionen für alle Editor-Instanzen. Readonly-
// Instanzen bekommen keine Tabellen-Menüs (nur Anzeige), aber das Modul
// selbst, damit gespeicherte Tabellen gerendert werden.
function quillModules(readonly) {
  const mods = {
    toolbar: readonly ? false : { container: QUILL_TOOLBAR },
    history: { delay: 1000, maxStack: 100, userOnly: true },
  };
  if (window.QuillTableBetter) {
    mods.table = false;
    mods['table-better'] = {
      language: 'de_DE',
      menus: readonly ? [] : ['column', 'row', 'merge', 'table', 'cell', 'wrap', 'delete'],
      toolbarTable: !readonly,
    };
    mods.keyboard = { bindings: QuillTableBetter.keyboardBindings };
  }
  return mods;
}
```

- [ ] **Step 2: Beide Editor-Konstruktoren auf quillModules umstellen**

`initSingleDayEditor` (ca. Zeile 1224):

```js
      const quill = new Quill(wrap, {
        theme: 'snow',
        readOnly: readonly,
        placeholder: DAY_SECTION_META[kind].placeholder,
        modules: quillModules(readonly),
      });
```

`initSingleWochenEditor` (ca. Zeile 1713):

```js
    const quill = new Quill(wrap, {
      theme: 'snow',
      readOnly: readonly,
      placeholder: WOCHEN_PLACEHOLDERS[id],
      modules: quillModules(readonly),
    });
```

- [ ] **Step 3: Tabellen-Styling in quill-editor.css ergänzen**

Am Ende von `app/css/quill-editor.css` anhängen:

```css
/* ── Tabellen (quill-table-better) ─────────────────────────────── */
.ql-editor table {
  border-collapse: collapse;
  width: 100%;
  margin: 6px 0;
}
.ql-editor td,
.ql-editor th {
  border: 1px solid var(--border-color, #c9ced6);
  padding: 4px 8px;
  vertical-align: top;
}
[data-theme="dark"] .ql-editor td,
[data-theme="dark"] .ql-editor th {
  border-color: rgba(255, 255, 255, 0.25);
}
```

Hinweis: Vor dem Festlegen von `var(--border-color, …)` in `app/css/base.css`/`glass.css` prüfen, welche Border-Variable das Projekt tatsächlich nutzt, und diese verwenden.

- [ ] **Step 4: Manuelle Verifikation im Browser (Playwright/Edge oder manuell)**

`http://localhost:3000/wochenansicht.html` als .demo-Azubi:
1. Toolbar zeigt Tabellen-Button; Klick → Raster-Picker → 3×3-Tabelle wird eingefügt.
2. Zellen befüllbar; Rechtsklick/Menü: Zeile/Spalte hinzufügen funktioniert.
3. Bestehende Formatierungen intakt: Fett/Listen/Überschriften-Dropdown, Bild-Button, Zeichenzähler (`markQuillLimit`), Tätigkeiten-Autocomplete (tippen im Betrieb-Feld), Strg+Z.
4. Autosave: Tabelle füllen, warten, Seite neu laden (Strg+F5, SPA-Router cached CSS/JS) → Tabelle ist persistiert.
5. Readonly-Check: als Ausbilder/Dev-View dieselbe Woche öffnen → Tabelle wird angezeigt, keine Bearbeitungs-Menüs.
6. Dark Mode + Custom-Themes (hyperspace/cmd erben `[data-theme="dark"]`-Regeln nicht — Rahmenfarben dort gegenprüfen).

- [ ] **Step 5: Commit**

```bash
git add app/js/wochenansicht.js app/css/quill-editor.css
git commit -m "feat(editor): Tabellen erstellen/bearbeiten via quill-table-better (Toolbar, Menues, Styling)"
```

---

### Task 3: Parser — `decodeStrokedBoxes` (Zellrahmen-Geometrie)

**Files:**
- Modify: `app/js/ihk-parser.js` (neue Funktion + Export, nach `decodeUnderlineSegments`)
- Test: `app/js/ihk-parser.test.js`

**Interfaces:**
- Produces: `decodeStrokedBoxes(fnArray, argsArray, OPS) → [{x0,y0,x1,y1}]` — Bounding-Boxen aller **gestrichenen** Subpfade in Gerätekoordinaten, gefiltert auf plausible Zellgrößen (`15 ≤ w ≤ 520`, `8 ≤ h ≤ 500`). Nutzt die vorhandenen `matMul`/`matApply`. Task 4 konsumiert die Boxen.

- [ ] **Step 1: Failing Tests schreiben**

In `app/js/ihk-parser.test.js` (nutzt das vorhandene `OPS`-Mock-Objekt) ergänzen:

```js
// ── Zellrahmen-Geometrie (Tabellen) ────────────────────────────
test('decodeStrokedBoxes findet gestrichenes Rechteck (rectangle-Op)', () => {
  const boxes = P.decodeStrokedBoxes(
    [OPS.constructPath, OPS.stroke],
    [ [ [OPS.rectangle], [50, 700, 90, 30] ], null ], OPS);
  assert.equal(boxes.length, 1);
  assert.deepEqual(boxes[0], { x0: 50, y0: 700, x1: 140, y1: 730 });
});

test('decodeStrokedBoxes findet Subpfad aus moveTo/lineTo/curveTo (abgerundete Zelle)', () => {
  // Rechteck-ähnlicher Pfad mit Kurvenecken → BBox über alle Punkte
  const boxes = P.decodeStrokedBoxes(
    [OPS.constructPath, OPS.stroke],
    [ [ [OPS.moveTo, OPS.lineTo, OPS.curveTo, OPS.lineTo],
        [55, 700,  135, 700,  140, 700, 140, 705, 140, 710,  140, 730] ], null ], OPS);
  assert.equal(boxes.length, 1);
  assert.equal(boxes[0].x0, 55);
  assert.equal(boxes[0].x1, 140);
  assert.equal(boxes[0].y0, 700);
  assert.equal(boxes[0].y1, 730);
});

test('decodeStrokedBoxes ignoriert Linien (degeneriert) und gefuellte Pfade', () => {
  // 0-hohe gestrichene Linie (Header-Separator) → raus
  assert.equal(P.decodeStrokedBoxes(
    [OPS.constructPath, OPS.stroke],
    [ [ [OPS.rectangle], [57, 736, 241, 0] ], null ], OPS).length, 0);
  // gefuelltes Rechteck (blaue Tagesleiste) → raus
  assert.equal(P.decodeStrokedBoxes(
    [OPS.constructPath, OPS.fill],
    [ [ [OPS.rectangle], [50, 700, 90, 30] ], null ], OPS).length, 0);
  // Seitengrosser Container (w>520) → raus
  assert.equal(P.decodeStrokedBoxes(
    [OPS.constructPath, OPS.stroke],
    [ [ [OPS.rectangle], [30, 100, 540, 700] ], null ], OPS).length, 0);
});

test('decodeStrokedBoxes wendet CTM-Transform an', () => {
  const boxes = P.decodeStrokedBoxes(
    [OPS.transform, OPS.constructPath, OPS.stroke],
    [ [2, 0, 0, 2, 10, 10], [ [OPS.rectangle], [20, 20, 40, 10] ], null ], OPS);
  assert.equal(boxes.length, 1);
  assert.deepEqual(boxes[0], { x0: 50, y0: 50, x1: 130, y1: 70 });
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `node --test app/js/ihk-parser.test.js`
Expected: FAIL, `P.decodeStrokedBoxes is not a function`

- [ ] **Step 3: Implementierung in ihk-parser.js**

Nach `decodeUnderlineSegments` einfügen:

```js
  // → Bounding-Boxen GESTRICHENER Subpfade (Tabellen-Zellrahmen). Gegenstück
  // zu decodeUnderlineSegments (das nur GEFÜLLTE Unterstreichungs-Rechtecke
  // sammelt). Zellen im IHK-Export sind gestrichene (Rund-)Rechtecke; Linien
  // (Separatoren) und flächige Container werden über die Größenfilter verworfen.
  function decodeStrokedBoxes(fnArray, argsArray, OPS) {
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [];
    let subpaths = [];
    let cur = null;
    const boxes = [];

    function addPoint(x, y) {
      const p = matApply(ctm, x, y);
      if (!cur) { cur = { minX: p[0], minY: p[1], maxX: p[0], maxY: p[1] }; subpaths.push(cur); return; }
      cur.minX = Math.min(cur.minX, p[0]); cur.maxX = Math.max(cur.maxX, p[0]);
      cur.minY = Math.min(cur.minY, p[1]); cur.maxY = Math.max(cur.maxY, p[1]);
    }
    function flushStroke() {
      for (const s of subpaths) {
        const w = s.maxX - s.minX, h = s.maxY - s.minY;
        // Plausible Zellgrößen (PDF-Punkte): schließt Separator-Linien
        // (h≈0 bzw. w≈0) und den seitengroßen Karten-Container aus.
        if (w >= 15 && w <= 520 && h >= 8 && h <= 500) {
          boxes.push({ x0: s.minX, y0: s.minY, x1: s.maxX, y1: s.maxY });
        }
      }
    }

    for (let k = 0; k < fnArray.length; k++) {
      const fn = fnArray[k], a = argsArray[k];
      if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (fn === OPS.transform) ctm = matMul(ctm, a);
      else if (fn === OPS.constructPath) {
        const ops = a[0], c = a[1];
        let i = 0;
        for (const op of ops) {
          if (op === OPS.moveTo)      { cur = null; addPoint(c[i], c[i+1]); i += 2; }
          else if (op === OPS.lineTo) { addPoint(c[i], c[i+1]); i += 2; }
          else if (op === OPS.curveTo) {
            addPoint(c[i], c[i+1]); addPoint(c[i+2], c[i+3]); addPoint(c[i+4], c[i+5]); i += 6;
          }
          else if (op === OPS.rectangle) {
            cur = null;
            addPoint(c[i], c[i+1]);
            addPoint(c[i] + c[i+2], c[i+1] + c[i+3]);
            cur = null;
            i += 4;
          }
        }
      }
      else if (fn === OPS.stroke || fn === OPS.closeStroke) { flushStroke(); subpaths = []; cur = null; }
      else if (fn === OPS.fill || fn === OPS.eoFill || fn === OPS.endPath) { subpaths = []; cur = null; }
    }
    return boxes;
  }
```

Im `api`-Objekt exportieren (nach `decodeUnderlineSegments,`):

```js
    decodeStrokedBoxes,
```

- [ ] **Step 4: Tests laufen lassen — alle grün (auch Bestand)**

Run: `node --test app/js/ihk-parser.test.js`
Expected: PASS (alle Tests, keine Regressions)

- [ ] **Step 5: Commit**

```bash
git add app/js/ihk-parser.js app/js/ihk-parser.test.js
git commit -m "feat(ihk-parser): decodeStrokedBoxes – Zellrahmen-Geometrie aus pdf.js-Operatorliste"
```

---

### Task 4: Parser — `detectTableGrids` + `gridContaining` (Gitter-Clustering)

**Files:**
- Modify: `app/js/ihk-parser.js`
- Test: `app/js/ihk-parser.test.js`

**Interfaces:**
- Consumes: Boxen `{x0,y0,x1,y1}` aus `decodeStrokedBoxes` (Task 3).
- Produces:
  - `detectTableGrids(boxes) → [{x0,y0,x1,y1, rows: Box[][]}]` — `rows` top→bottom, Zellen je Zeile links→rechts; nur Gitter mit ≥ 2 Zeilen und ≥ 2 Spalten.
  - `gridContaining(grids, x, y) → grid|null` — Gitter, in dessen **Zelle** (±1pt) der Punkt liegt (Punkte in Zell-Lücken zählen NICHT).
  - Task 5 nutzt `grid.rows`; Task 7 nutzt `gridContaining` und `grid.y1`.

- [ ] **Step 1: Failing Tests schreiben**

```js
// ── Gitter-Clustering ──────────────────────────────────────────
// 2×2-Gitter wie im IHK-Schule-Block: schmale Fach-Spalte, breite
// Inhalts-Spalte, kleine Lücken (≈4–10pt) zwischen den Zellboxen.
const GRID_BOXES = [
  { x0: 50,  y0: 700, x1: 140, y1: 730 },  // Zeile 1, Spalte 1
  { x0: 150, y0: 700, x1: 340, y1: 730 },  // Zeile 1, Spalte 2
  { x0: 50,  y0: 660, x1: 140, y1: 696 },  // Zeile 2, Spalte 1
  { x0: 150, y0: 660, x1: 340, y1: 696 },  // Zeile 2, Spalte 2
];

test('detectTableGrids erkennt 2x2-Gitter (Zeilen top→bottom, Zellen links→rechts)', () => {
  const grids = P.detectTableGrids(GRID_BOXES);
  assert.equal(grids.length, 1);
  const g = grids[0];
  assert.equal(g.rows.length, 2);
  assert.equal(g.rows[0].length, 2);
  assert.equal(g.rows[0][0].x0, 50);   // Zeile 1 = obere (y1=730)
  assert.equal(g.rows[0][0].y1, 730);
  assert.equal(g.rows[1][1].x0, 150);
  assert.deepEqual({ x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1 }, { x0: 50, y0: 660, x1: 340, y1: 730 });
});

test('detectTableGrids ignoriert einspaltige Boxen-Stapel (Tageskarten)', () => {
  assert.equal(P.detectTableGrids([
    { x0: 50, y0: 700, x1: 340, y1: 730 },
    { x0: 50, y0: 660, x1: 340, y1: 696 },
    { x0: 50, y0: 620, x1: 340, y1: 656 },
  ]).length, 0);
});

test('detectTableGrids ignoriert einzeilige Nachbar-Boxen und weit entfernte Boxen', () => {
  assert.equal(P.detectTableGrids([
    { x0: 50,  y0: 700, x1: 140, y1: 730 },
    { x0: 150, y0: 700, x1: 340, y1: 730 },   // nur 1 Zeile
    { x0: 400, y0: 100, x1: 500, y1: 130 },   // isoliert
  ]).length, 0);
});

test('gridContaining trifft nur Punkte INNERHALB von Zellen', () => {
  const grids = P.detectTableGrids(GRID_BOXES);
  assert.ok(P.gridContaining(grids, 60, 710));            // in Zelle (1,1)
  assert.ok(P.gridContaining(grids, 200, 670));           // in Zelle (2,2)
  assert.equal(P.gridContaining(grids, 145, 710), null);  // Lücke zwischen Spalten
  assert.equal(P.gridContaining(grids, 60, 500), null);   // außerhalb
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `node --test app/js/ihk-parser.test.js`
Expected: FAIL, `P.detectTableGrids is not a function`

- [ ] **Step 3: Implementierung**

Nach `decodeStrokedBoxes` in `ihk-parser.js` einfügen:

```js
  // ── Tabellen-Gitter aus Zellboxen ──────────────────────────────
  function overlap1d(a0, a1, b0, b1) { return Math.min(a1, b1) - Math.max(a0, b0); }

  // Benachbart = neben- oder untereinander mit kleiner Lücke (IHK-Export:
  // Zellboxen haben ~4–10pt Abstand) und ausreichender Überlappung quer dazu.
  function boxesAdjacent(a, b) {
    const GAP = 14;
    const hGap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
    const vGap = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1);
    const vOv  = overlap1d(a.y0, a.y1, b.y0, b.y1);
    const hOv  = overlap1d(a.x0, a.x1, b.x0, b.x1);
    const minH = Math.min(a.y1 - a.y0, b.y1 - b.y0);
    const minW = Math.min(a.x1 - a.x0, b.x1 - b.x0);
    if (hGap > -2 && hGap <= GAP && vOv >= minH * 0.5) return true;
    if (vGap > -2 && vGap <= GAP && hOv >= minW * 0.5) return true;
    return false;
  }

  // Boxen zu Gittern clustern. Tabelle = Cluster mit ≥2 Zeilen UND ≥2 Spalten;
  // alles andere (einspaltige Layout-Boxen, Einzelboxen) wird verworfen.
  function detectTableGrids(boxes) {
    const n = (boxes || []).length;
    const parent = [];
    for (let i = 0; i < n; i++) parent.push(i);
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (boxesAdjacent(boxes[i], boxes[j])) parent[find(i)] = find(j);
      }
    }
    const groups = {};
    for (let i = 0; i < n; i++) {
      const r = find(i);
      if (!groups[r]) groups[r] = [];
      groups[r].push(boxes[i]);
    }

    const grids = [];
    Object.values(groups).forEach(cells => {
      if (cells.length < 4) return;
      // Zeilen: Zellen mit ≥50% vertikaler Überlappung zur ersten Zelle der Zeile
      const sorted = cells.slice().sort((a, b) => b.y1 - a.y1);
      const rows = [];
      for (const c of sorted) {
        const row = rows.find(r =>
          overlap1d(r[0].y0, r[0].y1, c.y0, c.y1) >= Math.min(r[0].y1 - r[0].y0, c.y1 - c.y0) * 0.5);
        if (row) row.push(c); else rows.push([c]);
      }
      rows.forEach(r => r.sort((a, b) => a.x0 - b.x0));
      // Spaltenzahl: distinkte x0-Werte (Toleranz 6pt)
      const xs = [];
      cells.forEach(c => { if (!xs.some(x => Math.abs(x - c.x0) <= 6)) xs.push(c.x0); });
      if (rows.length < 2 || xs.length < 2) return;
      grids.push({
        x0: Math.min.apply(null, cells.map(c => c.x0)),
        y0: Math.min.apply(null, cells.map(c => c.y0)),
        x1: Math.max.apply(null, cells.map(c => c.x1)),
        y1: Math.max.apply(null, cells.map(c => c.y1)),
        rows,
      });
    });
    return grids;
  }

  // Zellindex eines Punkts im Gitter (±1pt Toleranz), sonst null.
  function cellAt(grid, x, y) {
    for (let r = 0; r < grid.rows.length; r++) {
      const row = grid.rows[r];
      for (let c = 0; c < row.length; c++) {
        const b = row[c];
        if (x >= b.x0 - 1 && x <= b.x1 + 1 && y >= b.y0 - 1 && y <= b.y1 + 1) return { r, c };
      }
    }
    return null;
  }

  // Gitter, in dessen ZELLE der Punkt liegt. Punkte in Zell-Lücken/Rändern
  // bleiben im normalen Zeilenfluss (kein Textverlust durch Fehlzuordnung).
  function gridContaining(grids, x, y) {
    for (const g of (grids || [])) { if (cellAt(g, x, y)) return g; }
    return null;
  }
```

Exports im `api`-Objekt ergänzen:

```js
    detectTableGrids,
    gridContaining,
```

- [ ] **Step 4: Tests laufen lassen — alle grün**

Run: `node --test app/js/ihk-parser.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/js/ihk-parser.js app/js/ihk-parser.test.js
git commit -m "feat(ihk-parser): detectTableGrids/gridContaining – Zellboxen zu Tabellengittern clustern"
```

---

### Task 5: Parser — `assembleTable` (Marker erzeugen) + Tabellen-HTML in `linesToHtml`

**Files:**
- Modify: `app/js/ihk-parser.js` (`assembleTable`, `tableMarkerToHtml`, `linesToHtml`-Refactor, `assembleLine`-Härtung)
- Test: `app/js/ihk-parser.test.js`

**Interfaces:**
- Consumes: `grid` aus Task 4 (`grid.rows`, `cellAt`), vorhandenes `assembleLine`.
- Produces:
  - `assembleTable(grid, items) → string` — Marker `'\x04' + JSON.stringify(string[][]) + '\x05'`. `items`: `[{x, y, str, bold, italic, underline}]` (y = Baseline). Items werden per `cellAt` Zellen zugeordnet, je Zelle nach y-Läufen (Toleranz 3) gruppiert, per `assembleLine` formatiert, Zeilen mit `\n` verbunden.
  - `linesToHtml(lines)`: Zeilen, die mit `\x04` beginnen, werden zu `<table><tbody><tr><td><p>…</p></td>…</table>`; defekte Marker fallen auf `<p>`-Ausgabe zurück (Markerzeichen entfernt).
  - `assembleLine` entfernt jetzt `\x02–\x05` aus Nutztext (Marker-Injektion unmöglich).
  - Task 7 ruft `assembleTable`; die HTML-Ausgabe muss von Quill/quill-table-better ladbar sein (`<p>` je Zellzeile).

- [ ] **Step 1: Failing Tests schreiben**

```js
// ── Tabellenmarker & HTML ──────────────────────────────────────
const T = '\x04', TE = '\x05';

test('assembleTable ordnet Items Zellen zu und baut Marker mit Formatflags', () => {
  const grid = P.detectTableGrids(GRID_BOXES)[0];
  const items = [
    { x: 55,  y: 712, str: 'BWL',        bold: true,  italic: false, underline: false },
    { x: 155, y: 715, str: '• Prokura',  bold: false, italic: false, underline: false },
    { x: 160, y: 704, str: 'o HGB',      bold: false, italic: false, underline: false }, // 2. Zeile derselben Zelle
    { x: 55,  y: 670, str: 'SUK',        bold: false, italic: false, underline: false },
    { x: 155, y: 670, str: '• Inventur', bold: false, italic: false, underline: false },
  ];
  const marker = P.assembleTable(grid, items);
  assert.equal(marker.charAt(0), T);
  assert.equal(marker.charAt(marker.length - 1), TE);
  const rows = JSON.parse(marker.slice(1, -1));
  assert.deepEqual(rows, [
    ['\x021BWL\x03', '• Prokura\no HGB'],
    ['SUK', '• Inventur'],
  ]);
});

test('linesToHtml rendert Tabellenmarker als <table> mit Zell-Absaetzen', () => {
  const marker = T + JSON.stringify([
    ['\x021BWL\x03', '• Prokura\no HGB'],
    ['SUK', ''],
  ]) + TE;
  assert.equal(P.linesToHtml(['davor', marker, 'danach']),
    '<p>davor</p>' +
    '<table><tbody>' +
      '<tr><td><p><strong>BWL</strong></p></td><td><p>• Prokura</p><p>o HGB</p></td></tr>' +
      '<tr><td><p>SUK</p></td><td><p><br></p></td></tr>' +
    '</tbody></table>' +
    '<p>danach</p>');
});

test('linesToHtml escaped HTML in Tabellenzellen', () => {
  const marker = T + JSON.stringify([['<b>x</b>', 'a'], ['c', 'd']]) + TE;
  assert.ok(P.linesToHtml([marker]).includes('<td><p>&lt;b&gt;x&lt;/b&gt;</p></td>'));
});

test('linesToHtml: defekter Marker faellt auf Absatz zurueck (kein Crash, kein Verlust)', () => {
  const kaputt = T + '{kein json' + TE;
  const html = P.linesToHtml([kaputt]);
  assert.ok(html.startsWith('<p>'));
  assert.ok(html.includes('{kein json'));
  assert.ok(!html.includes('\x04'));
});

test('assembleLine entfernt Markerzeichen \\x04/\\x05 aus Nutztext', () => {
  const line = P.assembleLine([{ x: 0, str: 'a\x04b\x05c', bold: false, italic: false, underline: false }]);
  assert.equal(line, 'abc');
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `node --test app/js/ihk-parser.test.js`
Expected: FAIL, `P.assembleTable is not a function` (bzw. Assertion-Fehler bei assembleLine/linesToHtml)

- [ ] **Step 3: Implementierung**

**(a)** In `assembleLine` die Marker-Bereinigung erweitern:

```js
        const str = String(c.str).replace(/[\x02-\x05]/g, ''); // In-band-Markerzeichen aus Nutztext fernhalten
```

**(b)** `linesToHtml` refactoren — Inline-Rendering extrahieren und Tabellenpfad ergänzen (ersetzt die bestehende Funktion):

```js
  // Eine Marker-Zeile (\x02flag…\x03-Läufe) → Inline-HTML.
  function inlineHtml(line) {
    const parts = String(line).split(/(\x02[1-7][^\x03]*\x03)/);
    return parts.map(part => {
      if (part.charAt(0) === '\x02') {
        return wrapFlag(parseInt(part.charAt(1), 10), escapeHtml(part.slice(2, -1)));
      }
      return escapeHtml(part);
    }).join('');
  }

  // Zellinhalt (Zeilen per \n) → <p>-Folge; leere Zelle → Quill-Leerabsatz.
  function cellHtml(cellStr) {
    const lines = String(cellStr).split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length) return '<p><br></p>';
    return lines.map(l => `<p>${inlineHtml(l)}</p>`).join('');
  }

  // Tabellenmarker (\x04json\x05) → <table>-HTML; null bei defektem Marker.
  function tableMarkerToHtml(line) {
    const s = String(line);
    if (s.charAt(0) !== '\x04' || s.charAt(s.length - 1) !== '\x05') return null;
    let rows;
    try { rows = JSON.parse(s.slice(1, -1)); } catch (e) { return null; }
    if (!Array.isArray(rows) || !rows.length || !rows.every(Array.isArray)) return null;
    const body = rows.map(r =>
      '<tr>' + r.map(c => `<td>${cellHtml(c)}</td>`).join('') + '</tr>'
    ).join('');
    return `<table><tbody>${body}</tbody></table>`;
  }

  function linesToHtml(lines) {
    if (!lines.length) return '';
    return lines.map(l => {
      if (String(l).charAt(0) === '\x04') {
        const t = tableMarkerToHtml(l);
        if (t) return t;
        // Fallback: Markerzeichen entfernen, Inhalt als Absatz erhalten.
        return `<p>${inlineHtml(String(l).replace(/[\x04\x05]/g, ''))}</p>`;
      }
      return `<p>${inlineHtml(l)}</p>`;
    }).join('');
  }
```

**(c)** `assembleTable` nach `gridContaining` einfügen:

```js
  // Items eines Gitters → Tabellenmarker. Je Zelle werden die Items wie in
  // itemsToText nach y-Läufen gruppiert (Toleranz 3) und per assembleLine
  // formatiert; mehrzeilige Zellinhalte verbinden sich per \n. JSON.stringify
  // escaped die \x02/\x03-Formatmarker → der Marker bleibt EINE Zeile.
  function assembleTable(grid, items) {
    const buf = grid.rows.map(row => row.map(() => []));
    for (const it of (items || [])) {
      const pos = cellAt(grid, it.x, it.y);
      if (!pos) continue;
      const runs = buf[pos.r][pos.c];
      const y = Math.round(it.y);
      let run = runs.find(l => Math.abs(l.y - y) <= 3);
      if (!run) { run = { y, cells: [] }; runs.push(run); }
      run.cells.push({ x: it.x, str: it.str, bold: it.bold, italic: it.italic, underline: it.underline });
    }
    const rows = buf.map(row => row.map(runs => {
      runs.sort((a, b) => b.y - a.y);
      return runs.map(r => assembleLine(r.cells)).join('\n');
    }));
    return '\x04' + JSON.stringify(rows) + '\x05';
  }
```

**(d)** Export im `api`-Objekt:

```js
    assembleTable,
```

- [ ] **Step 4: Tests laufen lassen — alle grün (inkl. Bestand: linesToHtml-Refactor darf nichts brechen)**

Run: `node --test app/js/ihk-parser.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/js/ihk-parser.js app/js/ihk-parser.test.js
git commit -m "feat(ihk-parser): Tabellenmarker (assembleTable) + <table>-Rendering in linesToHtml"
```

---

### Task 6: Parser — Marker-Durchfluss durch `parse()` (Wochen- + Tagesbasis) absichern

**Files:**
- Modify: `app/js/ihk-parser.js` (nur falls Tests Lücken aufdecken)
- Test: `app/js/ihk-parser.test.js`

**Interfaces:**
- Consumes: Marker-Format aus Task 5; bestehende `parse(pages)`-Pipeline.
- Produces: Garantie, dass Marker-Zeilen (a) im Wochenformat in `betriebText`/`schuleText`/`unterweisungText` landen, (b) im Tagesformat in `eintragText`, (c) NICHT als Tag/Abschnitt/Rauschen fehlinterpretiert werden. Task 7 verlässt sich darauf.

- [ ] **Step 1: Failing/Absicherungs-Tests schreiben**

Fixture-Stil wie die bestehenden `parse`-Tests der Datei (Seiten-Strings). Ergänzen:

```js
// ── Tabellenmarker durch parse() ───────────────────────────────
test('parse (Wochenbasis): Tabellenmarker im Schule-Block landet als <table> in schuleText', () => {
  const marker = T + JSON.stringify([['BWL', '• Prokura'], ['SUK', '• Inventur']]) + TE;
  const page = [
    'Eingereicht am 26.09.2024. Von Ausbilder:in Anika',
    'Kailer am 09.04.2025 freigegeben.',
    'Ausbildungswoche 09.09.2024 bis 15.09.2024',
    'Schule/Betrieb',
    'Schule:',
    marker,
    'Betrieb:',
    'Poststelle sortiert',
    'Mo | 09.09.2024 | Schule/Betrieb | anwesend 06:00',
  ].join('\n');
  const res = P.parse([page]);
  assert.equal(res.wochen.length, 1);
  const w = res.wochen[0];
  assert.ok(w.schuleText.includes('<table><tbody>'));
  assert.ok(w.schuleText.includes('<td><p>BWL</p></td>'));
  assert.equal(w.betriebText, '<p>Poststelle sortiert</p>');
});

test('parse (Tagesbasis): Tabellenmarker in Tagesbeschreibung landet in eintragText', () => {
  const marker = T + JSON.stringify([['A', 'B'], ['C', 'D']]) + TE;
  const pages = [
    'Ausbildungsnachweis auf Tagesbasis',
    'Ausbildungswoche 09.09.2024 bis 15.09.2024',
    'Mo | 09.09.2024 | Betrieb | anwesend 08:00',
    'Werkbank aufgeräumt 08:00',
    marker,
    'Qualifikationen:',
    '- Sonstige Qualifikation',
  ].join('\n');
  const res = P.parse([pages]);
  assert.equal(res.wochen.length, 1);
  const tag = res.wochen[0].tage[0];
  assert.ok(tag.eintragText.includes('<p>Werkbank aufgeräumt</p>'));
  assert.ok(tag.eintragText.includes('<table><tbody>'));
});

test('parse: Markerzeile matcht weder Tageszeile noch Rauschfilter', () => {
  // Marker, dessen JSON-Inhalt einer Tageszeile ähnelt, darf keinen Tag erzeugen
  const marker = T + JSON.stringify([['Mo | 01.01.2025 | Betrieb | anwesend 08:00', 'x'], ['a', 'b']]) + TE;
  const page = [
    'Ausbildungswoche 09.09.2024 bis 15.09.2024',
    'Betrieb:',
    marker,
    'Mo | 09.09.2024 | Betrieb | anwesend 08:00',
  ].join('\n');
  const res = P.parse([page]);
  assert.equal(res.wochen[0].tage.length, 1);
  assert.equal(res.wochen[0].tage[0].datum, '2024-09-09');
});
```

- [ ] **Step 2: Tests laufen lassen**

Run: `node --test app/js/ihk-parser.test.js`
Expected: idealerweise PASS (Marker beginnt mit `\x04` → `strip()` lässt es stehen, `^`-verankerte Regexe matchen nicht). Falls FAIL: Ursache lokalisieren und minimal fixen — z. B. `NOISE_RE`/`DAY_RE`-Prüfungen in `flattenPages`/`parseWeekBody*` um Guard `if (line.charAt(0) === '\x04')` ergänzen, der Markerzeilen direkt als Textzeile durchreicht.

- [ ] **Step 3: Commit**

```bash
git add app/js/ihk-parser.js app/js/ihk-parser.test.js
git commit -m "test(ihk-parser): Tabellenmarker-Durchfluss durch parse() (Wochen-/Tagesbasis) abgesichert"
```

---

### Task 7: ihk-import.js — Tabellen extrahieren und in den Zeilenstrom einsortieren

**Files:**
- Modify: `app/js/ihk-import.js:217-269` (`extractPages`, `itemsToText`)

**Interfaces:**
- Consumes: `IhkParser.decodeStrokedBoxes`, `IhkParser.detectTableGrids`, `IhkParser.gridContaining`, `IhkParser.assembleTable` (Tasks 3–5).
- Produces: Seiten-Strings, in denen erkannte Tabellen als Marker-Zeile an ihrer Leseposition stehen. Keine API-Änderung nach außen (`extractPages(arrayBuffer) → string[]`).

- [ ] **Step 1: `extractPages` erweitern**

Im `try`-Block nach der `underlines`-Zeile:

```js
      let underlines = [], grids = [];
      try {
        const opList = await page.getOperatorList();
        underlines = IhkParser.decodeUnderlineSegments(opList.fnArray, opList.argsArray, pdfjsLib.OPS);
        grids = IhkParser.detectTableGrids(
          IhkParser.decodeStrokedBoxes(opList.fnArray, opList.argsArray, pdfjsLib.OPS));
      } catch (e) {
        console.warn(`[IhkImport] getOperatorList Seite ${p} fehlgeschlagen:`, e);
      }
      const content = await page.getTextContent();
      pages.push(itemsToText(content.items, page, underlines, grids));
```

- [ ] **Step 2: `itemsToText` umbauen**

Komplette Funktion ersetzen:

```js
  // Items nach y-Koordinate zu Zeilen gruppieren; pro Lauf Bold/Italic (echter
  // Schriftname via commonObjs) und Underline (Fuell-Rechteck) bestimmen.
  // Items innerhalb erkannter Tabellengitter werden PRO ZELLE gesammelt und
  // als eine Marker-Zeile (an der Oberkante des Gitters) einsortiert – so
  // bleibt die Lesereihenfolge im Zeilenstrom erhalten.
  function itemsToText(items, page, underlines, grids) {
    const fontFlags = {};
    function flagsFor(fontName) {
      if (fontFlags[fontName]) return fontFlags[fontName];
      let name = '';
      try {
        if (page.commonObjs.has(fontName)) name = (page.commonObjs.get(fontName) || {}).name || '';
      } catch (e) { name = ''; }
      return (fontFlags[fontName] = IhkParser.classifyFontName(name));
    }

    const rows = [];
    const tableItems = new Map();  // grid → Items im Gitter
    items.forEach(it => {
      if (!it.str || !it.str.trim()) return;
      const f  = flagsFor(it.fontName);
      const x0 = it.transform[4];
      const yB = it.transform[5];
      const underline = IhkParser.matchUnderline({ x0, x1: x0 + it.width, baseline: yB }, underlines);

      const grid = IhkParser.gridContaining(grids, x0, yB);
      if (grid) {
        if (!tableItems.has(grid)) tableItems.set(grid, []);
        tableItems.get(grid).push({ x: x0, y: yB, str: it.str, bold: f.bold, italic: f.italic, underline });
        return;
      }

      const y = Math.round(yB);
      let row = rows.find(r => Math.abs(r.y - y) <= 3);
      if (!row) { row = { y, cells: [] }; rows.push(row); }
      row.cells.push({ x: x0, str: it.str, bold: f.bold, italic: f.italic, underline });
    });

    // Tabellen als synthetische Zeile an ihrer Oberkante einsortieren.
    tableItems.forEach((tItems, grid) => {
      rows.push({ y: Math.round(grid.y1), marker: IhkParser.assembleTable(grid, tItems) });
    });

    rows.sort((a, b) => b.y - a.y); // oben → unten
    return rows.map(r => r.marker || IhkParser.assembleLine(r.cells)).join('\n');
  }
```

- [ ] **Step 3: Verifikation — kompletter Parser-Testlauf + Browser-Smoke**

Run: `node --test app/js/ihk-parser.test.js`
Expected: PASS (ihk-import ist Browser-Glue, kein Node-Test; Logik steckt testbar im Parser).

Browser: Import mit einem PDF **ohne** Tabellen (z. B. `Berichtsheft exporte/Flo K.pdf`) → Verhalten identisch zu vorher (Regressionscheck der Vorschau + einer übernommenen Woche).

- [ ] **Step 4: Commit**

```bash
git add app/js/ihk-import.js
git commit -m "feat(ihk-import): Tabellengitter erkennen und als Marker in den Zeilenstrom einsortieren"
```

---

### Task 8: App-PDF-Export — Whitelist + Druck-CSS für Tabellen

**Files:**
- Modify: `app/js/berichtsheft-export.js:39` (`RICH_ALLOWED`) und Druck-CSS-Template (ca. Zeile 469 ff.)

**Interfaces:**
- Consumes: Eintrag-HTML mit `<table><tbody><tr><td>` (aus Import oder Editor).
- Produces: Export rendert Tabellen mit Rahmen; Attribute werden weiterhin verworfen (gleichverteilte Spalten laut Spec).

- [ ] **Step 1: Whitelist erweitern**

```js
  const RICH_ALLOWED = new Set([
    'p', 'br', 'strong', 'em', 'u', 'b', 'i', 'ul', 'ol', 'li', 'span',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ]);
```

- [ ] **Step 2: Druck-CSS ergänzen**

Im CSS-Template des Exports (dort steht bereits `table { border-collapse:collapse; width:100%; }` — diese Regel gilt den LAYOUT-Tabellen und bleibt unverändert) **scoped auf `.richtext`** ergänzen:

```css
  .richtext table { border-collapse:collapse; width:100%; margin:2pt 0; }
  .richtext th, .richtext td { border:0.6pt solid #999; padding:2pt 5pt; vertical-align:top; }
  .richtext tr { page-break-inside:avoid; }
```

- [ ] **Step 3: Verifikation**

Browser: Woche mit Tabelle (aus Task 2-Smoke) → „Berichtsheft exportieren" ausführen. Erwartung: Tabelle erscheint im erzeugten PDF/Druckbild mit Rahmen, Layout-Tabellen (Stammdaten, TOC) unverändert.

- [ ] **Step 4: Commit**

```bash
git add app/js/berichtsheft-export.js
git commit -m "feat(export): Tabellen in Eintraegen (Whitelist + Druck-CSS, .richtext-scoped)"
```

---

### Task 9: End-to-End-Verifikation mit echtem IHK-Export

**Files:**
- Kein Code (nur ggf. Bugfixes aus Befunden, jeweils mit eigenem Commit).

**Interfaces:**
- Consumes: alles aus Tasks 1–8.

**Voraussetzung:** Das Beispiel-PDF „Berichtsheft Export mit tabellen.pdf" liegt **nicht** im Repo — vom Nutzer bereitstellen lassen und unter `Berichtsheft exporte/Berichtsheft Export mit tabellen.pdf` ablegen.

- [ ] **Step 1: Dev-Server frisch starten** (`backend/ npm run dev`, App unter `http://localhost:3000` — Single-Origin, nicht :5500)

- [ ] **Step 2: Import durchspielen (Playwright + Edge oder manuell)**

1. Dev-Login als .demo-Azubi mit `berichtTyp='wöchentlich'`.
2. Profil → „IHK-Berichtsheft importieren" → Beispiel-PDF hochladen.
3. Vorschau: ~97 Wochen erkannt, Warnungszahl notieren (sollte nicht höher sein als vor der Änderung).
4. Einige Wochen übernehmen — gezielt KW mit Schul-Tabellen, z. B. **08.09.–15.09.2024** (BWL/Englisch/SUK/Deutsch) und **17.11.–23.11.2025**.

- [ ] **Step 3: Ergebnis prüfen**

1. Wochenansicht der importierten KW: Schule-Kachel zeigt eine **echte Tabelle**; „o Prokura"-artige Unterzeilen stehen in der Zelle ihres Fachs (nicht mehr fachlos darunter).
2. Zellen editierbar, Autosave + Reload (Strg+F5) persistiert.
3. Betrieb-/Unterweisungstexte (Nicht-Tabellen) unverändert korrekt (Regressionsvergleich mit Import vor der Änderung, falls verfügbar).
4. Tagesbasis-Regression: ein Tagesbasis-PDF (falls vorhanden) importieren — Verhalten unverändert.
5. App-Export der Woche → Tabelle im PDF sichtbar.
6. Visueller Layout-Check (Screenshot via npx Playwright + Edge): Editor mit Tabelle in hell/dunkel + Custom-Theme.

- [ ] **Step 4: Befunde beheben** (insb. Kalibrierung der Geometrie-Schwellwerte `GAP`/Größenfilter, falls die echten IHK-Zellboxen abweichen — Konstanten in `boxesAdjacent`/`decodeStrokedBoxes` anpassen, Tests nachziehen, je Fix ein Commit)

- [ ] **Step 5: Abschluss-Commit (falls Fixes) + kompletter Testlauf**

Run: `node --test app/js/ihk-parser.test.js` → PASS
