# Digitale Unterschriften im Beurteilungsbogen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drei-Parteien-Signaturprozess (Beurteiler, Azubi, dauerhafter Ausbilder) im Beurteilungsbogen — jede Partei kann beim jeweiligen Prozessschritt eine Unterschrift hinterlegen, die serverseitig gespeichert und im PDF-Export eingebettet wird.

**Architecture:** Neue Migration 035 legt eine persönliche `dbo.Unterschriften`-Tabelle (ein Profil-Bild je Nutzer) sowie sieben neue Signatur-Spalten auf `dbo.Beurteilungen` an. Ein neuer Backend-Service (`unterschriften.js`) kapselt die dataUrl↔Buffer-Konvertierung; `beurteilungen.js` (Service+Route) bekommt einen dritten, eigenständigen Bestätigungsschritt für den dauerhaften Ausbilder. Frontend: die bestehende Fahrtgeld-Signatur-Komponente wird zu einer geteilten `signatur-dialog.js`/`.css` (kein Verhaltenswechsel für Fahrtgeld), `beurteilung.js` ruft sie an den drei Aktionspunkten auf; Signaturbilder werden nicht in JSON eingebettet, sondern über einen eigenen Bild-Endpunkt nachgeladen (wie bereits bei Anhängen üblich).

**Tech Stack:** Node.js/Express 5, `mssql` (VARBINARY(MAX) für Bilder), `node:test` + `node:assert/strict` (kolokierte `*.test.js`, Ausführung via `node --test`), Vanilla-JS-Frontend (kein Framework), SQL Server (`dbo`-Schema).

Spec: [docs/superpowers/specs/2026-08-20-beurteilung-unterschriften-design.md](../specs/2026-08-20-beurteilung-unterschriften-design.md)

---

## Wichtiger Architektur-Hinweis (Abweichung von der Spec-Formulierung)

Die Spec sagt, der dritte Button erscheine "im Read-Modus". Das stimmt so nicht ganz:
`darfBeurteilen()` (und damit `editable` in `beurteilung.js`) ist für den **dauerhaften
Ausbilder bereits heute `true`** — unabhängig davon, ob er selbst beurteilt hat
([backend/services/zugriff.js:189-195](../../../backend/services/zugriff.js#L189-L195):
`verantwortlichFuerZuweisung` prüft `kontext.dauerAusbilderAzubiOids` datumsunabhängig).
Ein dauerhafter Ausbilder, der eine von einem befristeten Prüfer abgeschlossene
Beurteilung ansieht, landet also im **editable**-Zweig (Korrektur-Möglichkeit,
bestehendes Verhalten, unverändert), nicht im Azubi-Read-Modus.

**Konsequenz für diesen Plan:** Der neue "Als Ausbilder bestätigen"-Button wird
**zusätzlich in den editable-Zweig** von `renderActions()` eingehängt (neben
Speichern/Abschließen/PDF), gesteuert einzig durch das serverseitige Flag
`darfAusbilderBestaetigen` — nicht durch eine Umschaltung des Edit-Modus. Die
bestehende Korrektur-Funktion ("Änderungen speichern") bleibt für den Ausbilder
unverändert zusätzlich verfügbar. Das ist additiv und ändert nichts an
bestehendem Verhalten.

---

## File Structure

| Datei | Änderung |
|---|---|
| `db/migrations/035_beurteilung_unterschriften.sql` | neu |
| `backend/services/unterschriften.js` | neu |
| `backend/services/unterschriften.test.js` | neu |
| `backend/routes/unterschrift.js` | neu |
| `backend/services/beurteilungen.js` | erweitert |
| `backend/services/beurteilungen.test.js` | neu |
| `backend/routes/beurteilungen.js` | erweitert |
| `backend/server.js` | Route mounten |
| `app/js/fahrtgeld-signatur.js` → `app/js/signatur-dialog.js` | umbenannt + erweitert |
| `app/css/fahrgelderstattung.css` | Signatur-Regeln entfernt (→ neue Datei) |
| `app/css/signatur-dialog.css` | neu (verschobene + neue Regeln) |
| `app/fahrgelderstattung.html` | Script-/CSS-Pfad angepasst |
| `app/beurteilung.html` | neue Script-/CSS-Includes |
| `app/js/api.js` | erweitert |
| `app/js/beurteilung.js` | erweitert |

---

### Task 1: Migration 035 — Datenmodell

**Files:**
- Create: `db/migrations/035_beurteilung_unterschriften.sql`

- [ ] **Step 1: Migration schreiben**

```sql
-- ============================================================
-- Migration 035 – Digitale Unterschriften im Beurteilungsbogen
-- Ausführen gegen: Berichtsheft_Dev
--
-- 1) dbo.Unterschriften: persönliches Profil-Merkmal, eine Zeile je Nutzer
--    (hinterlegte Standard-Unterschrift, wiederverwendbar über Beurteilung
--    hinaus, z.B. später Fahrtgeld).
-- 2) dbo.Beurteilungen: drei Signatur-Slots (Beurteiler/Azubi/Ausbilder) +
--    neue Ausbilder-Bestätigung (eigenständig, unabhängig vom Abschluss).
-- Idempotent.
-- ============================================================

IF OBJECT_ID('dbo.Unterschriften', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Unterschriften (
    Oid            NVARCHAR(36)   NOT NULL PRIMARY KEY,
    Bild           VARBINARY(MAX) NOT NULL,
    Extension      NVARCHAR(10)   NOT NULL,
    AktualisiertAm DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
  );
  PRINT 'Tabelle dbo.Unterschriften angelegt.';
END
ELSE PRINT 'dbo.Unterschriften existiert bereits.';

IF COL_LENGTH('dbo.Beurteilungen', 'BeurteilerUnterschriftBild') IS NULL
BEGIN
  ALTER TABLE dbo.Beurteilungen ADD
    BeurteilerUnterschriftBild     VARBINARY(MAX) NULL,
    BeurteilerUnterschriftExt      NVARCHAR(10)   NULL,
    KenntnisnahmeUnterschriftBild  VARBINARY(MAX) NULL,
    KenntnisnahmeUnterschriftExt   NVARCHAR(10)   NULL,
    AusbilderBestaetigtVon         NVARCHAR(36)   NULL,
    AusbilderBestaetigtAm          DATETIME2      NULL,
    AusbilderUnterschriftBild      VARBINARY(MAX) NULL,
    AusbilderUnterschriftExt       NVARCHAR(10)   NULL;
  PRINT 'Spalten für Beurteilungs-Unterschriften ergänzt.';
END
ELSE PRINT 'Beurteilungs-Unterschrift-Spalten existieren bereits.';
```

- [ ] **Step 2: Manuell prüfen (kein automatisierter Test — Migrationen laufen manuell)**

Datei auf Syntax/Idempotenz durchlesen (zweimal ausführen dürfte keinen Fehler
werfen — `IF OBJECT_ID(...) IS NULL` / `IF COL_LENGTH(...) IS NULL` decken das
ab). **Nicht selbst gegen die Dev-DB ausführen** — laut Projekt-Konvention
spielt nur Kuniß Migrationen manuell ein (kein DDL-Recht im Dev-Account).

- [ ] **Step 3: Commit**

```bash
git add db/migrations/035_beurteilung_unterschriften.sql
git commit -m "feat(db): Migration 035 - Unterschriften-Tabelle + Beurteilung-Spalten"
```

---

### Task 2: Signatur-Dialog umbenennen (reiner Rename, kein Verhaltenswechsel)

**Files:**
- Rename: `app/js/fahrtgeld-signatur.js` → `app/js/signatur-dialog.js`
- Modify: `app/fahrgelderstattung.html`

- [ ] **Step 1: Datei umbenennen**

```bash
git mv app/js/fahrtgeld-signatur.js app/js/signatur-dialog.js
```

- [ ] **Step 2: Kommentarkopf anpassen (Datei ist jetzt geteilt, nicht mehr Fahrtgeld-exklusiv)**

In `app/js/signatur-dialog.js`, ersetze die ersten 8 Zeilen:

```js
/* ===================================================================
   SIGNATUR-DIALOG.JS
   Geteilter Signatur-Erstelldialog (Fahrgelderstattung + Beurteilung).
   Drei Tabs: Zeichnen (Canvas/Pointer), Tippen (Name → Handschrift),
   Hochladen (PNG/JPG). Optional eine vierte, vorangestellte Ansicht
   "Bestehende Unterschrift verwenden", wenn eine hinterlegte Signatur
   übergeben wird (opts.bestehende).
   Liefert { dataUrl, extension } an onSave. Erzeugung der dataUrl ist
   der einzige Zweck — Persistenz/Einbettung liegen beim jeweiligen
   Aufrufer (fahrgelderstattung.js bzw. beurteilung.js).
   =================================================================== */
```

- [ ] **Step 3: Script-Referenz in `app/fahrgelderstattung.html` anpassen**

Zeile mit `<script src="js/fahrtgeld-signatur.js"></script>` ersetzen durch:

```html
<script src="js/signatur-dialog.js"></script>
```

- [ ] **Step 4: Manuell verifizieren**

Backend starten (`node server.js` im `backend`-Ordner), Fahrgelderstattung im
Browser öffnen (Demo-Login, Developer-Rolle wegen `previewUnlocked`), auf
"Unterschrift hinzufügen" klicken → Dialog öffnet sich unverändert
(Zeichnen/Tippen/Hochladen funktionieren wie vorher).

- [ ] **Step 5: Commit**

```bash
git add app/js/signatur-dialog.js app/fahrgelderstattung.html
git commit -m "refactor(signatur): fahrtgeld-signatur.js zu geteilter signatur-dialog.js umbenannt"
```

---

### Task 3: Signatur-CSS in eigene Datei auslagern

**Files:**
- Create: `app/css/signatur-dialog.css`
- Modify: `app/css/fahrgelderstattung.css:8-31,300-313`
- Modify: `app/fahrgelderstattung.html`
- Modify: `app/beurteilung.html`

- [ ] **Step 1: Neue Datei `app/css/signatur-dialog.css` anlegen**

```css
/* ===================================================================
   SIGNATUR-DIALOG.CSS
   Geteilter Signatur-Erstelldialog (Fahrgelderstattung + Beurteilung).
   =================================================================== */

/* ── Handschrift-Fonts für die Signatur-Erstellung (lokal, kein CDN) ──
   Kalam + Caveat = SIL OFL (HANDWRITING-OFL.txt), Homemade Apple = Apache 2.0
   (HOMEMADEAPPLE-APACHE-LICENSE.txt). Caveat wird auch fett (700) genutzt. */
@font-face {
  font-family: 'Kalam';
  src: url('../assets/fonts/Kalam.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Caveat';
  src: url('../assets/fonts/Caveat.ttf') format('truetype-variations');
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'Homemade Apple';
  src: url('../assets/fonts/HomemadeApple.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

.sig-tabs { display:flex; gap:var(--sp-2); border-bottom:1px solid var(--pm-grey-200); margin-bottom:var(--sp-4); }
.sig-tab { appearance:none; background:none; border:none; padding:var(--sp-2) var(--sp-3); cursor:pointer; color:var(--pm-grey-500); font:inherit; border-bottom:2px solid transparent; }
.sig-tab.is-active { color:var(--pm-grey-900); border-bottom-color:var(--pm-yellow,#FFC300); }
.sig-tab--muted { margin-left:auto; opacity:.75; }
.sig-panel { display:none; }
.sig-panel.is-active { display:block; }
.sig-panel__actions { display:flex; align-items:center; gap:var(--sp-3); margin-top:var(--sp-2); }
.sig-canvas { width:100%; height:180px; background:#fff; border:1px dashed var(--pm-grey-300); border-radius:var(--radius-md,8px); touch-action:none; cursor:crosshair; display:block; }
.sig-styles { display:flex; gap:var(--sp-2); flex-wrap:wrap; margin:var(--sp-3) 0; }
.sig-style { flex:1; min-width:120px; background:#fff; color:#1a1a2e; border:2px solid var(--pm-grey-200); border-radius:var(--radius-md,8px); padding:var(--sp-2); font-size:26px; cursor:pointer; }
.sig-style.is-active { border-color:var(--pm-yellow,#FFC300); }
.sig-preview { min-height:80px; margin-top:var(--sp-3); padding:var(--sp-3); background:#fff; border-radius:var(--radius-md,8px); display:flex; align-items:center; justify-content:center; color:#1a1a2e; overflow:hidden; }
.sig-preview img { max-height:80px; max-width:100%; }

/* ── "Bestehende Unterschrift verwenden"-Block (Task 4) ── */
.sig-bestehende { background:#fff; border-radius:var(--radius-md,8px); padding:var(--sp-3); display:flex; align-items:center; gap:var(--sp-3); flex-wrap:wrap; }
.sig-bestehende__img { max-height:60px; max-width:200px; }
```

- [ ] **Step 2: Verschobene Regeln aus `app/css/fahrgelderstattung.css` entfernen**

Zeilen 8-31 (Font-Face-Kommentar + drei `@font-face`-Blöcke) löschen — die
Datei beginnt danach direkt mit dem bisherigen Inhalt ab der alten Zeile 32.

Zeilen 300-313 (Kommentar `/* ── Signatur-Erstelldialog ── */` + alle
`.sig-*`-Regeln) ebenfalls löschen.

- [ ] **Step 3: `app/fahrgelderstattung.html` — neues Stylesheet einbinden**

Nach der Zeile `<link rel="stylesheet" href="css/fahrgelderstattung.css">`
ergänzen:

```html
<link rel="stylesheet" href="css/signatur-dialog.css">
```

- [ ] **Step 4: `app/beurteilung.html` — neues Stylesheet einbinden**

Nach `<link rel="stylesheet" href="css/beurteilung.css">` ergänzen:

```html
<link rel="stylesheet" href="css/signatur-dialog.css">
```

- [ ] **Step 5: Manuell verifizieren**

Fahrgelderstattung erneut öffnen, Signatur-Dialog checken (Canvas-Höhe,
Tab-Optik, Handschrift-Fonts im "Tippen"-Tab) — visuell identisch zu vorher.

- [ ] **Step 6: Commit**

```bash
git add app/css/signatur-dialog.css app/css/fahrgelderstattung.css app/fahrgelderstattung.html app/beurteilung.html
git commit -m "refactor(signatur): Signatur-CSS in eigene geteilte Datei ausgelagert"
```

---

### Task 4: "Bestehende Unterschrift verwenden" im Dialog

**Files:**
- Modify: `app/js/signatur-dialog.js`

- [ ] **Step 1: `buildMarkup` um optionalen Vorschau-Block erweitern**

In `app/js/signatur-dialog.js`, `buildMarkup()` nimmt jetzt ein Argument und
fügt den neuen Block direkt nach `<div class="modal__body">` ein:

```js
  function buildMarkup(bestehende) {
    return `
      <div class="modal-overlay" id="fgSigModal" role="dialog" aria-modal="true" aria-label="Unterschrift erstellen">
        <div class="modal" style="max-width:600px">
          <div class="modal__header">
            <span class="modal__title">Unterschrift erstellen</span>
            <button class="modal__close" data-modal-close aria-label="Schließen">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal__body">
            ${bestehende ? `
              <div class="sig-bestehende">
                <img src="${bestehende.dataUrl}" alt="Hinterlegte Unterschrift" class="sig-bestehende__img">
                <button class="btn btn-primary btn-sm" id="fg-sig-use-bestehende" type="button">Diese Unterschrift verwenden</button>
              </div>
              <p class="hint" style="margin:var(--sp-3) 0">Oder neu erstellen:</p>
            ` : ''}
            <div class="sig-tabs" role="tablist">
              <button class="sig-tab is-active" data-sig-tab="draw"   type="button">Zeichnen</button>
              <button class="sig-tab"           data-sig-tab="type"   type="button">Tippen</button>
              <button class="sig-tab sig-tab--muted" data-sig-tab="upload" type="button">Hochladen</button>
            </div>

            <div class="sig-panel is-active" data-sig-panel="draw">
              <canvas id="fg-sig-canvas" class="sig-canvas"></canvas>
              <div class="sig-panel__actions">
                <button class="btn btn-ghost btn-sm" id="fg-sig-clear" type="button">Löschen</button>
                <span class="hint">Mit Maus, Finger oder Stift unterschreiben.</span>
              </div>
            </div>

            <div class="sig-panel" data-sig-panel="type">
              <input class="form-control" id="fg-sig-text" placeholder="Name eingeben" autocomplete="off">
              <div class="sig-styles" id="fg-sig-styles">
                ${FONTS.map((f, i) => `<button class="sig-style${i === 0 ? ' is-active' : ''}" data-sig-font="${f.key}" type="button" style="font-family:'${f.family}',cursive;font-weight:${f.weight || 400}">Beispiel</button>`).join('')}
              </div>
              <div class="sig-preview" id="fg-sig-preview" aria-live="polite"></div>
            </div>

            <div class="sig-panel" data-sig-panel="upload">
              <p class="hint" style="margin:0 0 var(--sp-3)">Alternativ ein fertiges Unterschrift-Bild (PNG/JPG) hochladen.</p>
              <input type="file" id="fg-sig-file" accept="image/png,image/jpeg">
              <div class="sig-preview" id="fg-sig-upload-preview"></div>
            </div>
          </div>
          <div class="modal__footer">
            <button class="btn btn-ghost" data-modal-close type="button">Abbrechen</button>
            <button class="btn btn-primary" id="fg-sig-apply" type="button">Übernehmen</button>
          </div>
        </div>
      </div>`;
  }
```

- [ ] **Step 2: `open()` anpassen — `bestehende` entgegennehmen, Markup damit bauen, Button verdrahten**

```js
  function open({ name, onSave, bestehende }) {
    document.getElementById('fgSigModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', buildMarkup(bestehende));
    state = { onSave, activeTab: 'draw', currentFont: FONTS[0], pendingUpload: null, drawCtx: null, drawInk: false, drawReady: false, bestehende: bestehende || null };

    document.getElementById('fg-sig-use-bestehende')?.addEventListener('click', () => {
      state.onSave?.(state.bestehende);
      Modal?.closeAll?.();
    });

    document.querySelectorAll('#fgSigModal .sig-tab').forEach(btn =>
      btn.addEventListener('click', () => switchTab(btn.dataset.sigTab)));
    document.getElementById('fg-sig-apply')?.addEventListener('click', onApply);

    const textInput = document.getElementById('fg-sig-text');
    if (textInput) {
      textInput.value = name || '';
      textInput.addEventListener('input', updateTypePreview);
    }
    document.querySelectorAll('#fgSigModal .sig-style').forEach(btn =>
      btn.addEventListener('click', () => {
        state.currentFont = FONTS.find(f => f.key === btn.dataset.sigFont) || FONTS[0];
        document.querySelectorAll('#fgSigModal .sig-style').forEach(b =>
          b.classList.toggle('is-active', b === btn));
        updateTypePreview();
      }));
    updateTypePreview();

    document.getElementById('fg-sig-file')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!['image/png', 'image/jpeg'].includes(file.type)) {
        Toast?.warning?.('Format', 'Bitte ein PNG oder JPG hochladen.');
        e.target.value = ''; return;
      }
      if (file.size > 2 * 1024 * 1024) {
        Toast?.warning?.('Zu groß', 'Das Bild darf höchstens 2 MB groß sein.');
        e.target.value = ''; return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        state.pendingUpload = {
          dataUrl: reader.result,
          extension: file.type === 'image/png' ? 'png' : 'jpeg',
        };
        const prev = document.getElementById('fg-sig-upload-preview');
        if (prev) prev.innerHTML = `<img src="${state.pendingUpload.dataUrl}" alt="Vorschau">`;
      };
      reader.readAsDataURL(file);
    });

    Modal?.init?.();
    Modal?.open?.('fgSigModal');
    requestAnimationFrame(setupDrawCanvas);
  }
```

(Einziger Unterschied zur bestehenden Funktion: die neue erste Zeile mit
`bestehende` im Destructuring, der Aufruf `buildMarkup(bestehende)` statt
`buildMarkup()`, das neue `bestehende: bestehende || null` im State-Objekt und
der neue Listener direkt danach — alles andere unverändert übernommen.)

- [ ] **Step 3: Manuell verifizieren**

Da `fahrgelderstattung.js` `SignaturDialog.open()` weiterhin ohne `bestehende`
aufruft, darf sich dort nichts ändern — Dialog öffnet sich wie bisher direkt
mit den drei Tabs, ohne den neuen Vorschau-Block. (Der Block wird erst ab
Task 15+ von `beurteilung.js` mit `bestehende` befüllt.)

- [ ] **Step 4: Commit**

```bash
git add app/js/signatur-dialog.js
git commit -m "feat(signatur): Option 'Bestehende Unterschrift verwenden' im Dialog"
```

---

### Task 5: Backend-Service `unterschriften.js` (TDD)

**Files:**
- Create: `backend/services/unterschriften.test.js`
- Create: `backend/services/unterschriften.js`

- [ ] **Step 1: Failing Test für die reinen dataUrl↔Buffer-Funktionen schreiben**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('./unterschriften.js');

test('dataUrlToBuffer dekodiert eine PNG-DataURL zu einem Buffer', () => {
  const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const buf = U.dataUrlToBuffer(`data:image/png;base64,${png1x1}`);
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf.toString('base64'), png1x1);
});

test('dataUrlToBuffer liefert null bei ungültigem Format', () => {
  assert.equal(U.dataUrlToBuffer('nicht-data-url'), null);
  assert.equal(U.dataUrlToBuffer(''), null);
  assert.equal(U.dataUrlToBuffer(null), null);
});

test('bufferToDataUrl baut die DataURL mit passendem MIME-Typ', () => {
  const buf = Buffer.from([1, 2, 3]);
  assert.equal(U.bufferToDataUrl(buf, 'png'), `data:image/png;base64,${buf.toString('base64')}`);
  assert.equal(U.bufferToDataUrl(buf, 'jpeg'), `data:image/jpeg;base64,${buf.toString('base64')}`);
  assert.equal(U.bufferToDataUrl(buf, 'jpg'), `data:image/jpeg;base64,${buf.toString('base64')}`);
});

test('bufferToDataUrl liefert null ohne Buffer', () => {
  assert.equal(U.bufferToDataUrl(null, 'png'), null);
});

test('pruefeGroesse wirft ab 2 MB, akzeptiert darunter und null', () => {
  assert.doesNotThrow(() => U.pruefeGroesse(Buffer.alloc(1024)));
  assert.doesNotThrow(() => U.pruefeGroesse(null));
  assert.throws(() => U.pruefeGroesse(Buffer.alloc(U.MAX_BYTES + 1)), /zu groß/);
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen (Modul existiert noch nicht)**

Run: `node --test backend/services/unterschriften.test.js`
Expected: FAIL mit "Cannot find module './unterschriften.js'"

- [ ] **Step 3: Service implementieren**

```js
'use strict';
/* Persönliche Unterschrift je Nutzer (dbo.Unterschriften) — hinterlegtes
   Standard-Bild, das beim Signieren vorgeschlagen und bei jeder neuen
   Signatur automatisch aktualisiert wird. Geteilte Basis für Beurteilung
   und (später) Fahrtgeld. */
const { getPool, sql } = require('../db/connection');

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB, wie im Client-Dialog (signatur-dialog.js)

function dataUrlToBuffer(dataUrl) {
  const match = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return Buffer.from(match[2], 'base64');
}

function bufferToDataUrl(buffer, extension) {
  if (!buffer) return null;
  const mime = (extension === 'jpeg' || extension === 'jpg') ? 'jpeg' : 'png';
  return `data:image/${mime};base64,${buffer.toString('base64')}`;
}

function normExt(extension) {
  return extension === 'jpeg' || extension === 'jpg' ? 'jpeg' : 'png';
}

// Wirft bei Überschreitung — von JEDER Stelle zu rufen, die Signatur-Bytes
// persistiert (Beurteilungen-Spalten UND das persönliche Profil), sonst
// greift die 2-MB-Grenze nur beim Profil-Upsert, nicht beim eigentlichen
// Dokument.
function pruefeGroesse(bytes) {
  if (bytes && bytes.length > MAX_BYTES) throw new Error('Unterschrift zu groß (max. 2 MB).');
}

async function holeMeine(pool, oid) {
  const r = await pool.request()
    .input('oid', sql.NVarChar(36), oid)
    .query('SELECT Bild, Extension FROM dbo.Unterschriften WHERE Oid = @oid');
  const row = r.recordset[0];
  if (!row) return null;
  return { dataUrl: bufferToDataUrl(row.Bild, row.Extension), extension: row.Extension };
}

async function speichereMeine(pool, oid, { dataUrl, extension } = {}) {
  const bytes = dataUrlToBuffer(dataUrl);
  if (!bytes) throw new Error('Ungültige Unterschrift.');
  pruefeGroesse(bytes);
  await pool.request()
    .input('oid', sql.NVarChar(36), oid)
    .input('bild', sql.VarBinary(sql.MAX), bytes)
    .input('ext', sql.NVarChar(10), normExt(extension))
    .query(`
      MERGE dbo.Unterschriften AS t
      USING (SELECT @oid AS Oid) AS s ON t.Oid = s.Oid
      WHEN MATCHED THEN UPDATE SET Bild=@bild, Extension=@ext, AktualisiertAm=SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (Oid, Bild, Extension) VALUES (@oid, @bild, @ext);
    `);
  return bytes;
}

module.exports = { dataUrlToBuffer, bufferToDataUrl, normExt, pruefeGroesse, holeMeine, speichereMeine, MAX_BYTES };
```

- [ ] **Step 4: Test ausführen — muss bestehen**

Run: `node --test backend/services/unterschriften.test.js`
Expected: PASS (5 Tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/unterschriften.js backend/services/unterschriften.test.js
git commit -m "feat(unterschrift): Service für persönliche Unterschrift (dataUrl<->Buffer, Upsert)"
```

---

### Task 6: Route `/api/unterschrift`

**Files:**
- Create: `backend/routes/unterschrift.js`
- Modify: `backend/server.js:126,141` (Bereich der Router-Requires/Mounts)

- [ ] **Step 1: Route implementieren**

```js
const router = require('express').Router();
const { getPool } = require('../db/connection');
const svc = require('../services/unterschriften');
const { logError } = require('../services/fehlerberichte');

// GET /api/unterschrift/meine -> { dataUrl, extension } | null
router.get('/meine', async (req, res) => {
  try {
    const pool = await getPool();
    res.json(await svc.holeMeine(pool, req.user.oid));
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[unterschrift] meine get: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/unterschrift/meine  { dataUrl, extension } -> Upsert
router.put('/meine', async (req, res) => {
  try {
    const pool = await getPool();
    await svc.speichereMeine(pool, req.user.oid, req.body || {});
    res.json({ ok: true });
  } catch (err) {
    const clientError = /zu groß|Ungültige/.test(err.message);
    if (!clientError) {
      logError({ quelle: 'backend', nachricht: `[unterschrift] meine put: ${err.message}`, stack: err.stack,
        kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    }
    res.status(clientError ? 400 : 500).json({ error: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 2: In `backend/server.js` mounten**

Nach Zeile `const beurteilungenRouter  = require('./routes/beurteilungen');` ergänzen:

```js
const unterschriftRouter   = require('./routes/unterschrift');
```

Nach Zeile `app.use('/api/beurteilungen',       devAuth, beurteilungenRouter);` ergänzen:

```js
app.use('/api/unterschrift',        devAuth, unterschriftRouter);
```

- [ ] **Step 3: Manuell verifizieren**

Backend starten, im Browser eingeloggt via DevTools-Konsole:

```js
await fetch('/api/unterschrift/meine', { credentials: 'include' }).then(r => r.json())
```

Expected: `null` (noch keine hinterlegte Unterschrift).

```js
await fetch('/api/unterschrift/meine', { method: 'PUT', credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', extension: 'png' }) })
  .then(r => r.json())
```

Expected: `{ ok: true }`. Erneuter GET liefert danach die passende `dataUrl`.

- [ ] **Step 4: Commit**

```bash
git add backend/routes/unterschrift.js backend/server.js
git commit -m "feat(unterschrift): Route /api/unterschrift/meine (GET/PUT)"
```

---

### Task 7: `istDauerhafterAusbilder` — pure Funktion + Test

**Files:**
- Create: `backend/services/beurteilungen.test.js`
- Modify: `backend/services/beurteilungen.js`

- [ ] **Step 1: Failing Test schreiben**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('./beurteilungen.js');

test('istDauerhafterAusbilderVon: true wenn die Oid in der Ausbilder-Liste des Azubis steckt', () => {
  const zeilen = [{ oid: 'A1', name: 'Ausbilder Eins' }, { oid: 'A2', name: 'Ausbilder Zwei' }];
  assert.equal(B.istDauerhafterAusbilderVon('A1', zeilen), true);
  assert.equal(B.istDauerhafterAusbilderVon('A2', zeilen), true);
});

test('istDauerhafterAusbilderVon: false wenn die Oid fehlt oder die Liste leer ist', () => {
  const zeilen = [{ oid: 'A1', name: 'Ausbilder Eins' }];
  assert.equal(B.istDauerhafterAusbilderVon('A3', zeilen), false);
  assert.equal(B.istDauerhafterAusbilderVon('A1', []), false);
  assert.equal(B.istDauerhafterAusbilderVon('A1', null), false);
  assert.equal(B.istDauerhafterAusbilderVon(null, zeilen), false);
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `node --test backend/services/beurteilungen.test.js`
Expected: FAIL — `B.istDauerhafterAusbilderVon is not a function`

- [ ] **Step 3: Pure Funktion + async Wrapper implementieren**

In `backend/services/beurteilungen.js`, Imports ergänzen (nach der bestehenden
`vertretungen`-Zeile):

```js
const { listFuerAzubi } = require('./ausbilderAzubis');
```

Nach der bestehenden Funktion `darfBeurteilen` (nach Zeile 30) einfügen:

```js
// Datums-UNABHÄNGIGE Prüfung: ist userOid unter den dauerhaften Ausbildern
// dieses Azubis (dbo.AusbilderAzubis)? Reine Logik, DB-unabhängig testbar —
// analog zum Muster verantwortlichFuerZuweisung/darfBeurteilen.
function istDauerhafterAusbilderVon(userOid, ausbilderZeilen) {
  if (!userOid) return false;
  return (ausbilderZeilen || []).some(a => a.oid === userOid);
}

// Ist der Nutzer der dauerhafte Ausbilder DIESES Azubis? admin/developer
// zählen immer (wie bei darfBeurteilen). user zuerst, analog zu darfBeurteilen.
async function istDauerhafterAusbilder(user, azubiOid, pool) {
  if (user.role === 'developer' || user.role === 'admin') return true;
  const zeilen = await listFuerAzubi(azubiOid);
  return istDauerhafterAusbilderVon(user.oid, zeilen);
}
```

Am Ende der Datei, `module.exports` um die beiden neuen Funktionen erweitern
(siehe finale Fassung in Task 11 — an dieser Stelle reicht ein Zwischenstand):

```js
module.exports = {
  ladeZuweisung, darfBeurteilen, getByZuweisung, listByAzubi,
  upsertEntwurf, abschliessen, patchNachAbschluss, kenntnisnahme, ermittleUndErzeugeFaellige,
  listMeineBeurteilbaren, istDauerhafterAusbilderVon, istDauerhafterAusbilder,
};
```

- [ ] **Step 4: Test ausführen — muss bestehen**

Run: `node --test backend/services/beurteilungen.test.js`
Expected: PASS (2 Tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/beurteilungen.js backend/services/beurteilungen.test.js
git commit -m "feat(beurteilung): istDauerhafterAusbilder(Von) fuer die neue Ausbilder-Bestaetigung"
```

---

### Task 8: `abschliessen` — Beurteiler-Signatur persistieren

**Files:**
- Modify: `backend/services/beurteilungen.js:120-142` (Funktion `abschliessen`)

- [ ] **Step 1: Funktion erweitern**

Vollständiger Ersatz der bestehenden `abschliessen`-Funktion:

```js
async function abschliessen(pool, id, autorOid, signatur) {
  const cur = await pool.request().input('id', sql.Int, id)
    .query('SELECT Id, ZuweisungId, AzubiOid FROM dbo.Beurteilungen WHERE Id=@id');
  const b = cur.recordset[0];
  if (!b) throw new Error('Beurteilung nicht gefunden.');
  const sigBytes = signatur ? unterschriftenSvc.dataUrlToBuffer(signatur.dataUrl) : null;
  if (signatur && !sigBytes) throw new Error('Ungültige Unterschrift.');
  unterschriftenSvc.pruefeGroesse(sigBytes);
  const sigExt = signatur ? unterschriftenSvc.normExt(signatur.extension) : null;
  // Status-Update UND Azubi-Mitteilung atomar: schlägt der Benachrichtigungs-
  // INSERT fehl (z.B. CHECK-Constraint), wird auch der Abschluss zurückgerollt –
  // kein stiller Zustand "abgeschlossen ohne Mitteilung".
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('id', sql.Int, id)
      .input('von', sql.NVarChar(36), autorOid)
      .input('bild', sql.VarBinary(sql.MAX), sigBytes)
      .input('ext', sql.NVarChar(10), sigExt)
      .query(`UPDATE dbo.Beurteilungen SET Status='abgeschlossen',
                AbgeschlossenAm=SYSUTCDATETIME(), BeurteiltVon=@von,
                BeurteilerUnterschriftBild=@bild, BeurteilerUnterschriftExt=@ext,
                AktualisiertAm=SYSUTCDATETIME()
              WHERE Id=@id`);
    await erzeugeBenachrichtigung(tx, {
      userOid: b.AzubiOid, typ: 'beurteilung_abgeschlossen', zuweisungId: b.ZuweisungId, fromUserOid: autorOid,
    });
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }
  // Persönliche Standard-Unterschrift aktualisieren — best effort, AUSSERHALB
  // der Transaktion: ein Fehlschlag hier darf den bereits committeten Abschluss
  // nicht zurückrollen (rein komfortbezogen, kein Blocker).
  if (signatur) {
    try { await unterschriftenSvc.speichereMeine(pool, autorOid, signatur); } catch (e) { /* best effort */ }
  }
}
```

- [ ] **Step 2: Import ergänzen**

Am Kopf von `backend/services/beurteilungen.js`, nach der `vertretungen`-Zeile:

```js
const unterschriftenSvc = require('./unterschriften');
```

- [ ] **Step 3: Manuell verifizieren**

`node --test backend/services/beurteilungen.test.js` (weiterhin PASS, keine
Regressionen an den Pure-Function-Tests) — echter DB-Roundtrip folgt in
Task 13 nach der Route-Anbindung, hier nur sicherstellen, dass die Datei
weiter lädt: `node -e "require('./backend/services/beurteilungen.js')"` läuft
ohne Fehler.

- [ ] **Step 4: Commit**

```bash
git add backend/services/beurteilungen.js
git commit -m "feat(beurteilung): abschliessen() speichert optionale Beurteiler-Unterschrift"
```

---

### Task 9: `kenntnisnahme` — Azubi-Signatur persistieren

**Files:**
- Modify: `backend/services/beurteilungen.js:172-178` (Funktion `kenntnisnahme`)

- [ ] **Step 1: Funktion erweitern**

```js
async function kenntnisnahme(pool, id, azubiOid, signatur) {
  const sigBytes = signatur ? unterschriftenSvc.dataUrlToBuffer(signatur.dataUrl) : null;
  if (signatur && !sigBytes) throw new Error('Ungültige Unterschrift.');
  unterschriftenSvc.pruefeGroesse(sigBytes);
  const sigExt = signatur ? unterschriftenSvc.normExt(signatur.extension) : null;
  await pool.request()
    .input('id', sql.Int, id)
    .input('oid', sql.NVarChar(36), azubiOid)
    .input('bild', sql.VarBinary(sql.MAX), sigBytes)
    .input('ext', sql.NVarChar(10), sigExt)
    .query(`UPDATE dbo.Beurteilungen SET KenntnisnahmeVon=@oid, KenntnisnahmeAm=SYSUTCDATETIME(),
              KenntnisnahmeUnterschriftBild=@bild, KenntnisnahmeUnterschriftExt=@ext,
              AktualisiertAm=SYSUTCDATETIME() WHERE Id=@id AND AzubiOid=@oid`);
  if (signatur) {
    try { await unterschriftenSvc.speichereMeine(pool, azubiOid, signatur); } catch (e) { /* best effort */ }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/services/beurteilungen.js
git commit -m "feat(beurteilung): kenntnisnahme() speichert optionale Azubi-Unterschrift"
```

---

### Task 10: `ausbilderBestaetigen` — neue Funktion

**Files:**
- Modify: `backend/services/beurteilungen.js` (neue Funktion, nach `kenntnisnahme`)

- [ ] **Step 1: Funktion hinzufügen**

```js
// Neuer, eigenständiger dritter Schritt: der dauerhafte Ausbilder bestätigt
// die Beurteilung — unabhängig davon, ob/wann der Azubi seine Kenntnisnahme
// gegeben hat (keine Reihenfolge-Pflicht, siehe Design-Spec).
async function ausbilderBestaetigen(pool, id, ausbilderOid, signatur) {
  const sigBytes = signatur ? unterschriftenSvc.dataUrlToBuffer(signatur.dataUrl) : null;
  if (signatur && !sigBytes) throw new Error('Ungültige Unterschrift.');
  unterschriftenSvc.pruefeGroesse(sigBytes);
  const sigExt = signatur ? unterschriftenSvc.normExt(signatur.extension) : null;
  await pool.request()
    .input('id', sql.Int, id)
    .input('von', sql.NVarChar(36), ausbilderOid)
    .input('bild', sql.VarBinary(sql.MAX), sigBytes)
    .input('ext', sql.NVarChar(10), sigExt)
    .query(`UPDATE dbo.Beurteilungen SET AusbilderBestaetigtVon=@von, AusbilderBestaetigtAm=SYSUTCDATETIME(),
              AusbilderUnterschriftBild=@bild, AusbilderUnterschriftExt=@ext,
              AktualisiertAm=SYSUTCDATETIME() WHERE Id=@id`);
  if (signatur) {
    try { await unterschriftenSvc.speichereMeine(pool, ausbilderOid, signatur); } catch (e) { /* best effort */ }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/services/beurteilungen.js
git commit -m "feat(beurteilung): neue ausbilderBestaetigen()-Funktion (dritter Signaturschritt)"
```

---

### Task 11: `getByZuweisung` — `ausbilderSchrittEntfaellt` + Bild-Flags statt Roh-Bytes

**Files:**
- Modify: `backend/services/beurteilungen.js:39-47` (Funktion `getByZuweisung`)

- [ ] **Step 1: Funktion ersetzen**

```js
async function getByZuweisung(pool, zuweisungId) {
  const r = await pool.request()
    .input('zid', sql.Int, zuweisungId)
    .query('SELECT * FROM dbo.Beurteilungen WHERE ZuweisungId = @zid');
  const b = r.recordset[0];
  if (!b) return null;
  b.kriterien = await ladeKriterien(pool, b.Id);
  // Personalunion: hat der Beurteiler selbst bereits die dauerhafte
  // Ausbilder-Rolle für diesen Azubi, entfällt der dritte Signaturschritt
  // (keine doppelte Unterschrift derselben Person).
  const ausbilderZeilen = b.BeurteiltVon ? await listFuerAzubi(b.AzubiOid) : [];
  b.ausbilderSchrittEntfaellt = istDauerhafterAusbilderVon(b.BeurteiltVon, ausbilderZeilen);
  // Roh-Bytes NIE über diesen JSON-Pfad ausliefern (würde als riesiges
  // {type:'Buffer',data:[...]}-Array serialisiert) — nur Vorhanden-Flags.
  // Die eigentlichen Bilder kommen über den Bild-Endpunkt (Task 13).
  b.hatBeurteilerUnterschrift = !!b.BeurteilerUnterschriftBild;
  b.hatKenntnisnahmeUnterschrift = !!b.KenntnisnahmeUnterschriftBild;
  b.hatAusbilderUnterschrift = !!b.AusbilderUnterschriftBild;
  delete b.BeurteilerUnterschriftBild; delete b.BeurteilerUnterschriftExt;
  delete b.KenntnisnahmeUnterschriftBild; delete b.KenntnisnahmeUnterschriftExt;
  delete b.AusbilderUnterschriftBild; delete b.AusbilderUnterschriftExt;
  return b;
}
```

- [ ] **Step 2: `module.exports` final ergänzen**

```js
module.exports = {
  ladeZuweisung, darfBeurteilen, getByZuweisung, listByAzubi,
  upsertEntwurf, abschliessen, patchNachAbschluss, kenntnisnahme, ermittleUndErzeugeFaellige,
  listMeineBeurteilbaren, istDauerhafterAusbilderVon, istDauerhafterAusbilder,
  ausbilderBestaetigen,
};
```

- [ ] **Step 3: Manuell verifizieren**

```bash
node -e "require('./backend/services/beurteilungen.js'); console.log('lädt ohne Fehler')"
```

Expected: `lädt ohne Fehler`

- [ ] **Step 4: Commit**

```bash
git add backend/services/beurteilungen.js
git commit -m "feat(beurteilung): getByZuweisung liefert ausbilderSchrittEntfaellt + Unterschrift-Flags statt Roh-Bytes"
```

---

### Task 12: `patchNachAbschluss` — Signaturen bei Korrektur zurücksetzen

**Files:**
- Modify: `backend/services/beurteilungen.js:144-170` (Funktion `patchNachAbschluss`)

- [ ] **Step 1: SQL-UPDATE erweitern**

In der bestehenden `patchNachAbschluss`-Funktion die UPDATE-Query ersetzen durch:

```js
      .query(`UPDATE dbo.Beurteilungen SET IndividuelleBeurteilung=@indiv, GesamtPunkte=@ges,
                Note=@note, GespraechAm=@gespr, KorrigiertVon=@von, KorrigiertAm=SYSUTCDATETIME(),
                KenntnisnahmeVon=NULL, KenntnisnahmeAm=NULL,
                KenntnisnahmeUnterschriftBild=NULL, KenntnisnahmeUnterschriftExt=NULL,
                AusbilderBestaetigtVon=NULL, AusbilderBestaetigtAm=NULL,
                AusbilderUnterschriftBild=NULL, AusbilderUnterschriftExt=NULL,
                AktualisiertAm=SYSUTCDATETIME() WHERE Id=@id`);
```

(Die Beurteiler-Unterschrift-Spalten bleiben unangetastet — Korrektur macht
i. d. R. dieselbe Person, siehe Design-Entscheidung in der Spec.)

- [ ] **Step 2: Commit**

```bash
git add backend/services/beurteilungen.js
git commit -m "feat(beurteilung): Korrektur nach Abschluss setzt Azubi-/Ausbilder-Unterschrift zurueck"
```

---

### Task 13: Routen — Signatur-Parameter, neuer Bestätigungs-Endpunkt, Bild-Endpunkt

**Files:**
- Modify: `backend/routes/beurteilungen.js`

- [ ] **Step 1: `PATCH /:id/abschliessen` — Signatur durchreichen**

```js
// Signatur-Validierungsfehler (dataUrlToBuffer/pruefeGroesse werfen "Ungültige
// Unterschrift."/"...zu groß...") sind Client-Fehler (400), kein Server-Bug —
// analog zum bestehenden Muster in backend/routes/unterschrift.js.
function istSignaturFehler(err) {
  return /zu groß|Ungültige/.test(err.message);
}

router.patch('/:id/abschliessen', async (req, res) => {
  try {
    const ctx = await ladeUndAutorisiere(req, res); if (!ctx) return;
    await svc.abschliessen(ctx.pool, ctx.b.Id, req.user.oid, req.body.signatur || null);
    res.json({ ok: true });
  } catch (err) {
    if (istSignaturFehler(err)) return res.status(400).json({ error: err.message });
    logError({ quelle: 'backend', nachricht: `[beurteilungen] abschliessen: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: `PATCH /:id/kenntnisnahme` — Signatur durchreichen**

```js
router.patch('/:id/kenntnisnahme', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, Number(req.params.id))
      .query('SELECT AzubiOid FROM dbo.Beurteilungen WHERE Id=@id');
    const row = r.recordset[0];
    if (!row) return res.status(404).json({ error: 'Beurteilung nicht gefunden.' });
    if (row.AzubiOid !== req.user.oid) return res.status(403).json({ error: 'Nur der Azubi kann bestätigen.' });
    await svc.kenntnisnahme(pool, Number(req.params.id), req.user.oid, req.body.signatur || null);
    res.json({ ok: true });
  } catch (err) {
    if (istSignaturFehler(err)) return res.status(400).json({ error: err.message });
    logError({ quelle: 'backend', nachricht: `[beurteilungen] kenntnisnahme: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Neuer Endpunkt `PATCH /:id/ausbilder-bestaetigung`**

Direkt nach dem `kenntnisnahme`-Handler einfügen:

```js
// PATCH /api/beurteilungen/:id/ausbilder-bestaetigung  (nur der dauerhafte Ausbilder des Azubis)
router.patch('/:id/ausbilder-bestaetigung', async (req, res) => {
  try {
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, Number(req.params.id))
      .query('SELECT Id, AzubiOid, Status, AusbilderBestaetigtAm FROM dbo.Beurteilungen WHERE Id=@id');
    const b = r.recordset[0];
    if (!b) return res.status(404).json({ error: 'Beurteilung nicht gefunden.' });
    if (b.Status !== 'abgeschlossen') return res.status(400).json({ error: 'Beurteilung ist noch nicht abgeschlossen.' });
    if (!(await svc.istDauerhafterAusbilder(req.user, b.AzubiOid, pool))) {
      return res.status(403).json({ error: 'Nur der zuständige Ausbilder kann bestätigen.' });
    }
    await svc.ausbilderBestaetigen(pool, b.Id, req.user.oid, req.body.signatur || null);
    res.json({ ok: true });
  } catch (err) {
    if (istSignaturFehler(err)) return res.status(400).json({ error: err.message });
    logError({ quelle: 'backend', nachricht: `[beurteilungen] ausbilder-bestaetigung: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});
```

Der Helfer `istSignaturFehler` steht einmalig am Dateikopf-Ende (vor den
Routen-Definitionen, direkt nach den bestehenden Requires) — nicht mehrfach
definieren.

- [ ] **Step 4: `GET /` (zuweisungId-Zweig) — `darfAusbilderBestaetigen` ergänzen**

Im bestehenden Block:

```js
    if (zuweisungId) {
      const zuw = await svc.ladeZuweisung(pool, Number(zuweisungId));
      if (!zuw) return res.status(404).json({ error: 'Zuweisung nicht gefunden.' });
      const darfBearbeiten = await svc.darfBeurteilen(req.user, zuw, pool);
      const istAzubiOwner = req.user.oid === zuw.azubiOid;
      if (!darfBearbeiten && !istAzubiOwner) return res.status(403).json({ error: 'Kein Zugriff.' });
      const b = await svc.getByZuweisung(pool, Number(zuweisungId));
      // Azubi sieht die Beurteilung erst, wenn abgeschlossen.
      if (istAzubiOwner && !darfBearbeiten && (!b || b.Status !== 'abgeschlossen')) return res.json(null);
      if (b) {
        b.darfAusbilderBestaetigen = b.Status === 'abgeschlossen' && !b.ausbilderSchrittEntfaellt
          && !b.AusbilderBestaetigtAm && await svc.istDauerhafterAusbilder(req.user, zuw.azubiOid, pool);
      }
      return res.json(b);
    }
```

(Nur die vier neuen Zeilen ab `if (b) {` sind neu; der Rest des Blocks bleibt
unverändert — hier als vollständiger Block gezeigt, damit die Einbettung
eindeutig ist.)

- [ ] **Step 5: Neuer Bild-Endpunkt `GET /:id/unterschrift/:rolle`**

Direkt vor `module.exports = router;` einfügen:

```js
const ROLLE_SPALTEN = {
  beurteiler: { bild: 'BeurteilerUnterschriftBild', ext: 'BeurteilerUnterschriftExt' },
  azubi:      { bild: 'KenntnisnahmeUnterschriftBild', ext: 'KenntnisnahmeUnterschriftExt' },
  ausbilder:  { bild: 'AusbilderUnterschriftBild', ext: 'AusbilderUnterschriftExt' },
};

// GET /api/beurteilungen/:id/unterschrift/:rolle  – streamt das Bild (image/png|jpeg)
// Zugriff wie beim Lesen der Beurteilung: verantwortlich ODER Azubi-Eigentümer.
router.get('/:id/unterschrift/:rolle', async (req, res) => {
  try {
    const spalten = ROLLE_SPALTEN[req.params.rolle];
    if (!spalten) return res.status(400).json({ error: 'Unbekannte Rolle.' });
    const pool = await getPool();
    const r = await pool.request().input('id', sql.Int, Number(req.params.id))
      .query(`SELECT ZuweisungId, AzubiOid, ${spalten.bild} AS Bild, ${spalten.ext} AS Ext
              FROM dbo.Beurteilungen WHERE Id=@id`);
    const row = r.recordset[0];
    if (!row || !row.Bild) return res.status(404).end();
    const zuw = await svc.ladeZuweisung(pool, row.ZuweisungId);
    const darfBearbeiten = await svc.darfBeurteilen(req.user, zuw, pool);
    const istAzubiOwner = req.user.oid === row.AzubiOid;
    if (!darfBearbeiten && !istAzubiOwner) return res.status(403).json({ error: 'Kein Zugriff.' });
    res.setHeader('Content-Type', `image/${row.Ext === 'jpeg' ? 'jpeg' : 'png'}`);
    res.send(row.Bild);
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[beurteilungen] unterschrift: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 6: Manuell verifizieren (Voraussetzung: Migration 035 wurde von Kuniß gegen die Dev-DB eingespielt)**

Backend starten, im Browser mit einem Prüfer-Demo-Konto eine offene
Beurteilung abschließen — Netzwerk-Tab prüfen: `PATCH .../abschliessen` mit
Body `{signatur: null}` (Signatur folgt erst in Task 16) läuft weiterhin
fehlerfrei mit 200 durch (Rückwärtskompatibilität: `signatur` optional).

- [ ] **Step 7: Commit**

```bash
git add backend/routes/beurteilungen.js
git commit -m "feat(beurteilung): Routen fuer Signatur-Uebergabe, Ausbilder-Bestaetigung und Bild-Abruf"
```

---

### Task 14: Frontend `api.js` — Wrapper erweitern

**Files:**
- Modify: `app/js/api.js:303-322` (`normalizeBeurteilung`)
- Modify: `app/js/api.js:828-844` (Beurteilungen-Wrapper)

- [ ] **Step 1: `normalizeBeurteilung` um neue Felder erweitern**

```js
function normalizeBeurteilung(b) {
  if (!b) return null;
  return {
    id: b.Id,
    zuweisungId: b.ZuweisungId,
    azubiId: b.AzubiOid,
    status: b.Status,
    individuelleBeurteilung: b.IndividuelleBeurteilung ?? '',
    gesamtPunkte: b.GesamtPunkte != null ? Number(b.GesamtPunkte) : null,
    note: b.Note != null ? Number(b.Note) : null,
    gespraechAm: toDateStr(b.GespraechAm),
    beurteiltVon: b.BeurteiltVon ?? null,
    abgeschlossenAm: b.AbgeschlossenAm ?? null,
    kenntnisnahmeVon: b.KenntnisnahmeVon ?? null,
    kenntnisnahmeAm: b.KenntnisnahmeAm ?? null,
    korrigiertVon: b.KorrigiertVon ?? null,
    korrigiertAm: b.KorrigiertAm ?? null,
    kriterien: (b.kriterien || []).map(k => ({ kriteriumKey: k.kriteriumKey, punkte: k.punkte })),
    ausbilderSchrittEntfaellt: !!b.ausbilderSchrittEntfaellt,
    darfAusbilderBestaetigen: !!b.darfAusbilderBestaetigen,
    ausbilderBestaetigtVon: b.AusbilderBestaetigtVon ?? null,
    ausbilderBestaetigtAm: b.AusbilderBestaetigtAm ?? null,
    hatBeurteilerUnterschrift: !!b.hatBeurteilerUnterschrift,
    hatKenntnisnahmeUnterschrift: !!b.hatKenntnisnahmeUnterschrift,
    hatAusbilderUnterschrift: !!b.hatAusbilderUnterschrift,
  };
}
```

- [ ] **Step 2: Beurteilungen-Wrapper erweitern**

```js
  async abschliessenBeurteilung(id, signatur) {
    await apiFetch(`/beurteilungen/${id}/abschliessen`, { method: 'PATCH', body: { signatur: signatur || null } });
  },
  async patchBeurteilung(id, payload) {
    await apiFetch(`/beurteilungen/${id}`, { method: 'PATCH', body: payload });
  },
  async kenntnisnahmeBeurteilung(id, signatur) {
    await apiFetch(`/beurteilungen/${id}/kenntnisnahme`, { method: 'PATCH', body: { signatur: signatur || null } });
  },
  async ausbilderBestaetigenBeurteilung(id, signatur) {
    await apiFetch(`/beurteilungen/${id}/ausbilder-bestaetigung`, { method: 'PATCH', body: { signatur: signatur || null } });
  },
  beurteilungUnterschriftUrl(beurteilungId, rolle) {
    return `${API_BASE}/beurteilungen/${beurteilungId}/unterschrift/${rolle}`;
  },
  async getMeineUnterschrift() {
    return await apiFetch('/unterschrift/meine');
  },
  async setMeineUnterschrift(signatur) {
    await apiFetch('/unterschrift/meine', { method: 'PUT', body: signatur });
  },
```

(`patchBeurteilung` ist unverändert mit abgedruckt, damit die Einfügestelle
der drei neuen/geänderten Zeilen danach eindeutig ist — nur `kenntnisnahmeBeurteilung`
ändert sich, `ausbilderBestaetigenBeurteilung`/`beurteilungUnterschriftUrl`/
`getMeineUnterschrift`/`setMeineUnterschrift` sind neu.)

- [ ] **Step 3: Manuell verifizieren**

Backend starten, `beurteilungen.html` öffnen, DevTools-Konsole:

```js
await DB.getMeineUnterschrift()
```

Expected: `null` (noch nichts hinterlegt) — kein Fehler.

- [ ] **Step 4: Commit**

```bash
git add app/js/api.js
git commit -m "feat(beurteilung): api.js-Wrapper fuer Unterschrift-Uebergabe und Ausbilder-Bestaetigung"
```

---

### Task 15: `beurteilung.js` — Abschließen mit Signatur

**Files:**
- Modify: `app/js/beurteilung.js:121-135` (Klick-Handler `beurtFinish`)

- [ ] **Step 1: Handler ersetzen**

```js
    document.getElementById('beurtFinish').addEventListener('click', async () => {
      const st = form.getState();
      if (st.kriterien.length < 10) { Toast.error('Unvollständig', 'Bitte alle 10 Kriterien bewerten.'); return; }
      if (abgeschlossen) {
        try {
          await DB.patchBeurteilung(id, st);
          Toast.success('Aktualisiert', 'Beurteilung wurde aktualisiert (Azubi wird informiert).');
          setTimeout(back, 800);
        } catch (e) { Toast.error('Fehler', e.message); }
        return;
      }
      const bestehende = await DB.getMeineUnterschrift().catch(() => null);
      window.SignaturDialog.open({
        name: displayName(user.name || ''),
        bestehende,
        onSave: async (sig) => {
          try {
            id = await DB.saveBeurteilungEntwurf({ zuweisungId: zuweisung.id, ...st });
            await DB.abschliessenBeurteilung(id, sig);
            Toast.success('Abgeschlossen', 'Beurteilung abgeschlossen. Der Azubi wurde benachrichtigt.');
            setTimeout(back, 800);
          } catch (e) { Toast.error('Fehler', e.message); }
        },
      });
    });
```

- [ ] **Step 2: Manuell verifizieren**

Als Prüfer eine Entwurfs-Beurteilung mit allen 10 Kriterien öffnen, auf
"Abschließen" klicken → Signatur-Dialog erscheint (kein `bestehende`-Block
beim allerersten Mal). Zeichnen + Übernehmen → Toast "Abgeschlossen", zurück
zur Ausgangsseite. Erneut eine andere Beurteilung abschließen → Dialog zeigt
jetzt oben "Bestehende Unterschrift verwenden" mit der eben gezeichneten
Signatur.

- [ ] **Step 3: Commit**

```bash
git add app/js/beurteilung.js
git commit -m "feat(beurteilung): Signatur-Dialog vor dem Abschliessen"
```

---

### Task 16: `beurteilung.js` — Kenntnisnahme mit Signatur

**Files:**
- Modify: `app/js/beurteilung.js:141-157` (Read-only-Zweig `renderActions`)

- [ ] **Step 1: Klick-Handler ersetzen**

```js
  if (!bestaetigt) {
    document.getElementById('beurtAck').addEventListener('click', async () => {
      const bestehende = await DB.getMeineUnterschrift().catch(() => null);
      window.SignaturDialog.open({
        name: displayName(user.name || ''),
        bestehende,
        onSave: async (sig) => {
          try {
            await DB.kenntnisnahmeBeurteilung(beurteilung.id, sig);
            Toast.success('Bestätigt', 'Kenntnisnahme wurde vermerkt.');
            setTimeout(() => location.reload(), 800);
          } catch (e) { Toast.error('Fehler', e.message); }
        },
      });
    });
  }
```

- [ ] **Step 2: Manuell verifizieren**

Als Azubi eine abgeschlossene Beurteilung öffnen, "Kenntnisnahme bestätigen"
klicken → Signatur-Dialog, danach Toast + Reload, Button zeigt danach
"Kenntnisnahme bestätigt" (disabled).

- [ ] **Step 3: Commit**

```bash
git add app/js/beurteilung.js
git commit -m "feat(beurteilung): Signatur-Dialog vor der Azubi-Kenntnisnahme"
```

---

### Task 17: `beurteilung.js` — neuer Ausbilder-Bestätigen-Button

**Files:**
- Modify: `app/js/beurteilung.js:106-138` (editable-Zweig `renderActions`)

- [ ] **Step 1: Button + Handler nach den bestehenden drei Listenern des editable-Zweigs einfügen**

Direkt vor dem `return;`, das den editable-Zweig beendet (nach dem
`beurtPdf`-Listener), einfügen:

```js
    if (abgeschlossen && ctx.beurteilung?.darfAusbilderBestaetigen) {
      document.getElementById('beurtActions').insertAdjacentHTML('beforeend',
        `<button class="btn btn-secondary" id="beurtAusbilderBestaetigen">Als Ausbilder bestätigen</button>`);
      document.getElementById('beurtAusbilderBestaetigen').addEventListener('click', async () => {
        const bestehende = await DB.getMeineUnterschrift().catch(() => null);
        window.SignaturDialog.open({
          name: displayName(user.name || ''),
          bestehende,
          onSave: async (sig) => {
            try {
              await DB.ausbilderBestaetigenBeurteilung(ctx.beurteilung.id, sig);
              Toast.success('Bestätigt', 'Beurteilung als Ausbilder bestätigt.');
              setTimeout(() => location.reload(), 800);
            } catch (e) { Toast.error('Fehler', e.message); }
          },
        });
      });
    }
```

(Nutzt `ctx.beurteilung` statt der lokalen destrukturierten `beurteilung`-
Variable, da `renderActions(ctx)` bereits mit `ctx` als Parameter arbeitet —
`beurteilung` ist im Funktionskopf per `const { zuweisung, beurteilung,
editable, form, user, back } = ctx;` destrukturiert, `ctx.beurteilung` ist
also identisch und hier bewusst explizit für Lesbarkeit im neuen Block.)

- [ ] **Step 2: Manuell verifizieren (zwei Konten nötig)**

Beurteilung als Prüfer abschließen. Danach mit einem *zweiten*, dauerhaften
Ausbilder-Konto (nicht identisch mit dem Prüfer, aber per `AusbilderAzubis`
demselben Azubi zugeordnet) dieselbe Beurteilung öffnen → zusätzlicher
Button "Als Ausbilder bestätigen" sichtbar neben Speichern/Abschließen/PDF.
Klicken → Signatur-Dialog → Toast → Reload → Button verschwindet (da
`AusbilderBestaetigtAm` jetzt gesetzt ist, `darfAusbilderBestaetigen` wird
serverseitig `false`).

Testfall Personalunion: dieselbe Beurteilung mit dem dauerhaften Ausbilder
selbst abschließen (kein separater Prüfer) → Button erscheint gar nicht
(`ausbilderSchrittEntfaellt: true`).

- [ ] **Step 3: Commit**

```bash
git add app/js/beurteilung.js
git commit -m "feat(beurteilung): neuer Aktionsbutton 'Als Ausbilder bestaetigen'"
```

---

### Task 18: PDF-Export — Unterschriften einbetten

**Files:**
- Modify: `app/js/beurteilung.js:201-238` (Funktion `exportBeurteilungPdf`)

- [ ] **Step 1: `.sign`-Block in der eingebetteten Vorlage umbauen**

Im Style-Block der Funktion, bestehende Regel ersetzen:

```
  .sign { display:flex; justify-content:space-between; margin-top:16mm; gap:8mm; }
  .sign div { flex:1; border-top:1px solid #333; padding-top:2mm; font-size:8pt; text-align:center; }
```

durch:

```
  .sign { display:flex; justify-content:space-between; margin-top:16mm; gap:8mm; }
  .sign__slot { flex:1; display:flex; flex-direction:column; align-items:center; }
  .sign__img { height:14mm; width:100%; display:flex; align-items:flex-end; justify-content:center; }
  .sign__img img { max-height:14mm; max-width:100%; }
  .sign__line { border-top:1px solid #333; padding-top:2mm; font-size:8pt; text-align:center; width:100%; }
```

- [ ] **Step 2: Markup-Erzeugung der Unterschriftszeile ersetzen**

Vor der Zeile mit `const html = ...` eine kleine Hilfsfunktion einfügen:

```js
  const signSlot = (rolle, hat, label) => `
    <div class="sign__slot">
      <div class="sign__img">${hat ? `<img src="${DB.beurteilungUnterschriftUrl(beurteilung.id, rolle)}" alt="Unterschrift ${esc(label)}">` : ''}</div>
      <div class="sign__line">${esc(label)}</div>
    </div>`;
```

Im HTML-Template den bestehenden Block

```html
    <div class="sign">
      <div>Unterschrift des/r Beurteilenden</div>
      <div>Unterschrift des/r Ausbildungsleiters/-in</div>
      <div>Unterschrift des/r Auszubildenden</div>
    </div>
```

ersetzen durch:

```html
    <div class="sign">
      ${beurteilung ? signSlot('beurteiler', beurteilung.hatBeurteilerUnterschrift, 'Unterschrift des/r Beurteilenden') : `<div class="sign__slot"><div class="sign__img"></div><div class="sign__line">Unterschrift des/r Beurteilenden</div></div>`}
      ${beurteilung && !beurteilung.ausbilderSchrittEntfaellt ? signSlot('ausbilder', beurteilung.hatAusbilderUnterschrift, 'Unterschrift des/r Ausbildungsleiters/-in') : `<div class="sign__slot"><div class="sign__img"></div><div class="sign__line">${beurteilung?.ausbilderSchrittEntfaellt ? '' : 'Unterschrift des/r Ausbildungsleiters/-in'}</div></div>`}
      ${beurteilung ? signSlot('azubi', beurteilung.hatKenntnisnahmeUnterschrift, 'Unterschrift des/r Auszubildenden') : `<div class="sign__slot"><div class="sign__img"></div><div class="sign__line">Unterschrift des/r Auszubildenden</div></div>`}
    </div>
```

(Fehlt `beurteilung` komplett — Entwurf, noch nie gespeichert — bleiben alle
drei Zeilen leer wie bisher. Bei Personalunion bleibt die mittlere Zeile ganz
ohne Beschriftung, statt eine ungenutzte zweite Unterschriftslinie für
dieselbe Person zu zeigen.)

- [ ] **Step 2: Manuell verifizieren**

Abgeschlossene Beurteilung mit allen drei Signaturen (Beurteiler, Azubi,
Ausbilder) öffnen, "Als PDF" klicken → alle drei Bilder erscheinen über der
jeweiligen Linie, Beschriftung darunter wie vorher. Beurteilung ohne
Ausbilder-Bestätigung (aber nicht Personalunion) → mittlere Zeile zeigt Text
+ leere Fläche (Platz zum Ausdrucken/handschriftlichen Nachtragen wie
bisher). Personalunion-Fall → mittlere Zeile komplett leer.

- [ ] **Step 3: Commit**

```bash
git add app/js/beurteilung.js
git commit -m "feat(beurteilung): PDF-Export bettet vorhandene Unterschriften ein"
```

---

### Task 19: Abschließende manuelle Gesamt-Verifikation

Keine Code-Änderung — Abschluss-Checkliste, um das Zusammenspiel aller
Teile zu bestätigen (Demo-Konten: ein Prüfer, ein Azubi, ein davon
verschiedener dauerhafter Ausbilder für denselben Azubi — Zuordnung ggf.
vorher über die Nutzerverwaltung anlegen).

- [ ] **Schritt 1:** Migration 035 wurde gegen die Dev-DB eingespielt (durch
      Kuniß, siehe Task 1).
- [ ] **Schritt 2:** Prüfer schließt eine Beurteilung ab → Signatur-Pflicht,
      Toast, Azubi bekommt Mitteilung.
- [ ] **Schritt 3:** Azubi nimmt zur Kenntnis → eigene Signatur.
- [ ] **Schritt 4:** Dauerhafter Ausbilder (≠ Prüfer) bestätigt unabhängig
      von Schritt 3 (auch VOR der Azubi-Kenntnisnahme möglich testen).
- [ ] **Schritt 5:** PDF-Export zeigt alle drei Unterschriften korrekt
      platziert.
- [ ] **Schritt 6:** Personalunion-Fall (Ausbilder = Beurteiler): kein
      dritter Button, PDF zeigt nur zwei gefüllte Zeilen.
- [ ] **Schritt 7:** Korrektur nach Abschluss ("Änderungen speichern") →
      Azubi- und Ausbilder-Unterschrift verschwinden aus Ansicht/PDF,
      Beurteiler-Unterschrift bleibt; neue Kenntnisnahme-Mitteilung an Azubi.
- [ ] **Schritt 8:** Fahrtgeld-Signatur-Dialog (unverändertes Verhalten)
      erneut stichprobenartig prüfen — kein Regressions-Risiko durch den
      Rename/die CSS-Auslagerung.
