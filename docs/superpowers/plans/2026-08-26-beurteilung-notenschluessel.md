# Beurteilungsbogen: IHK-Notenschlüssel sichtbar machen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auf der Beurteilungsseite den IHK-Notenschlüssel (Punkte→Note-Tabelle) sichtbar und auffindbar machen, neben dem bestehenden Kriterienkatalog — als deutlich klickbare Buttons — plus einen Hinweis, dass Punkte auch frei (nicht nur über die Stufen) vergeben werden können.

**Architektur:** Reine Frontend-Änderung. Die Punkte→Note-Zuordnung existiert bereits als Datenarray (`PUNKTE_ZU_NOTE`) in `beurteilung-core.js`; neue reine Funktionen leiten daraus eine gruppierte Zeilenliste ab (Gruppierung nach Notenwert, Formatierung wie im Original-PDF: "X", "X + Y" oder "X - Y"). Ein zweites Modal (analog zum bestehenden Kriterienkatalog-Modal) rendert diese Tabelle plus einen Link auf das eingebettete Original-PDF. Zwei Buttons statt einem im Formularkopf, plus ein Hinweistext an der "Punkte"-Spalte.

**Tech Stack:** Vanilla JS (Dual-Mode Browser/Node-Modul), `node:test` für Unit-Tests, reines CSS mit vorhandenen Design-Tokens, Playwright (Edge-Channel) für die visuelle Verifikation.

**Spec:** [docs/superpowers/specs/2026-08-26-beurteilung-notenschluessel-design.md](../specs/2026-08-26-beurteilung-notenschluessel-design.md)

---

## Datei-Übersicht

- **Modify:** `app/js/beurteilung-core.js` — neue Funktionen `formatPunkteGruppe`, `notenschluesselZeilen`, `notenschluesselTableHtml`, `openNotenschluesselModal`; `renderForm()` bekommt zwei Buttons statt einem + Punkte-Spalten-Hinweis; API-Export erweitert.
- **Modify:** `app/js/beurteilung-core.test.js` — Tests für die neuen reinen Funktionen + PDF-Asset-Existenzcheck.
- **Modify:** `app/css/beurteilung.css` — `.beurt__katalog-btn` wird zu `.beurt__referenzen`/`.beurt__ref-btn`; neue Styles für `.beurt-noten__table` und `.beurt-noten__pdf-link`.
- **Create:** `app/templates/ihk-notenschluessel.pdf` — Kopie der vom Nutzer bereitgestellten Original-Datei.

---

## Task 1: PDF-Asset ins Projekt kopieren

**Files:**
- Create: `app/templates/ihk-notenschluessel.pdf`

- [ ] **Step 1: Datei kopieren**

```bash
cp "/c/Users/KunissF/Downloads/Beurteilungsbogen IHK-Notenschlüssel.pdf" \
   "/c/Dev/Digitales-Berichtsheft/app/templates/ihk-notenschluessel.pdf"
```

- [ ] **Step 2: Kopie verifizieren**

```bash
ls -la "/c/Dev/Digitales-Berichtsheft/app/templates/ihk-notenschluessel.pdf"
```

Expected: Datei existiert, Größe > 0 Bytes (Original ist ca. 90 KB).

- [ ] **Step 3: Commit**

```bash
cd "/c/Dev/Digitales-Berichtsheft"
git add app/templates/ihk-notenschluessel.pdf
git commit -m "feat(beurteilung): IHK-Notenschlüssel-PDF als Asset hinzufügen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `formatPunkteGruppe` — Punktegruppen wie im Original formatieren

**Files:**
- Modify: `app/js/beurteilung-core.js`
- Test: `app/js/beurteilung-core.test.js`

- [ ] **Step 1: Schreibe den fehlschlagenden Test**

Füge am Ende von `app/js/beurteilung-core.test.js` an:

```js
test('formatPunkteGruppe formatiert wie im Original-PDF', () => {
  assert.equal(B.formatPunkteGruppe([100]), '100');
  assert.equal(B.formatPunkteGruppe([99, 98]), '98 + 99');
  assert.equal(B.formatPunkteGruppe([40, 39, 38]), '38 - 40');
  assert.equal(B.formatPunkteGruppe([28, 27, 26, 25, 24, 23]), '23 - 28');
  assert.equal(B.formatPunkteGruppe([5, 4, 3, 2, 1, 0]), '0 - 5');
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

```bash
cd "/c/Dev/Digitales-Berichtsheft" && node --test app/js/beurteilung-core.test.js
```

Expected: FAIL — `B.formatPunkteGruppe is not a function`

- [ ] **Step 3: Minimale Implementierung**

In `app/js/beurteilung-core.js`, direkt nach der Funktion `noteFuerPunkte` (nach Zeile `function noteFuerPunkte(p) { return PUNKTE_ZU_NOTE[clampPunkte(p)]; }`) einfügen:

```js
  // punkte: absteigend sortiertes Array (z.B. [99,98] oder [40,39,38]).
  // Formatierung exakt wie im IHK-Original: 1 Wert -> Zahl, 2 -> "X + Y", 3+ -> "X - Y".
  function formatPunkteGruppe(punkte) {
    if (punkte.length === 1) return String(punkte[0]);
    if (punkte.length === 2) return `${punkte[1]} + ${punkte[0]}`;
    return `${punkte[punkte.length - 1]} - ${punkte[0]}`;
  }
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

```bash
cd "/c/Dev/Digitales-Berichtsheft" && node --test app/js/beurteilung-core.test.js
```

Expected: PASS (alle Tests inkl. des neuen)

- [ ] **Step 5: Commit**

```bash
git add app/js/beurteilung-core.js app/js/beurteilung-core.test.js
git commit -m "feat(beurteilung): formatPunkteGruppe für Notenschlüssel-Anzeige

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `notenschluesselZeilen` — Punkte→Note aus vorhandenen Daten gruppieren

**Files:**
- Modify: `app/js/beurteilung-core.js`
- Test: `app/js/beurteilung-core.test.js`

- [ ] **Step 1: Schreibe die fehlschlagenden Tests**

Füge an `app/js/beurteilung-core.test.js` an:

```js
test('notenschluesselZeilen: Stichproben gegen das Original-PDF', () => {
  const zeilen = B.notenschluesselZeilen();
  const byNote = Object.fromEntries(zeilen.map(z => [z.note, z]));

  assert.equal(byNote[1.0].punkteLabel, '100');
  assert.equal(byNote[1.0].verbal, 'sehr gut');

  assert.equal(byNote[1.1].punkteLabel, '98 + 99');
  assert.equal(byNote[3.9].punkteLabel, '59 + 60');
  assert.equal(byNote[3.9].verbal, 'ausreichend');

  assert.equal(byNote[5.0].punkteLabel, '38 - 40');
  assert.equal(byNote[5.0].verbal, 'mangelhaft');

  assert.equal(byNote[5.6].punkteLabel, '23 - 28');
  assert.equal(byNote[5.6].verbal, 'ungenügend');

  assert.equal(byNote[6.0].punkteLabel, '0 - 5');
  assert.equal(byNote[6.0].verbal, 'ungenügend');
});

test('notenschluesselZeilen: Reihenfolge ist absteigend nach Note (1,0 zuerst)', () => {
  const zeilen = B.notenschluesselZeilen();
  assert.equal(zeilen[0].note, 1.0);
  assert.equal(zeilen[zeilen.length - 1].note, 6.0);
  for (let i = 1; i < zeilen.length; i++) {
    assert.ok(zeilen[i].note >= zeilen[i - 1].note, `Notenwerte müssen aufsteigend sein bei Index ${i}`);
  }
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

```bash
cd "/c/Dev/Digitales-Berichtsheft" && node --test app/js/beurteilung-core.test.js
```

Expected: FAIL — `B.notenschluesselZeilen is not a function`

- [ ] **Step 3: Implementierung**

In `app/js/beurteilung-core.js`, direkt nach der neuen `formatPunkteGruppe`-Funktion einfügen:

```js
  // Gruppiert PUNKTE_ZU_NOTE (Index = Punkte 0..100) nach Notenwert.
  // PUNKTE_ZU_NOTE ist mit steigenden Punkten monoton fallend in der Note
  // (verifiziert), d.h. jede Notengruppe ist ein zusammenhängender Punktebereich.
  function notenschluesselZeilen() {
    const byNote = new Map(); // note -> Punkte absteigend
    for (let p = 100; p >= 0; p--) {
      const note = PUNKTE_ZU_NOTE[p];
      if (!byNote.has(note)) byNote.set(note, []);
      byNote.get(note).push(p);
    }
    return [...byNote.entries()].map(([note, punkte]) => {
      const stufe = stufeFuerPunkte(punkte[0]);
      return {
        note,
        punkteLabel: formatPunkteGruppe(punkte),
        stufe,
        verbal: STUFEN.find(s => s.stufe === stufe).verbal,
      };
    });
  }
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

```bash
cd "/c/Dev/Digitales-Berichtsheft" && node --test app/js/beurteilung-core.test.js
```

Expected: PASS (alle Tests)

- [ ] **Step 5: Neue Funktionen exportieren**

In `app/js/beurteilung-core.js`, die `api`-Zeile (Definition von `const api = { ... }`) ändern von:

```js
  const api = { KRITERIEN, BLOECKE, BLOCK_LABELS, STUFEN, PUNKTE_ZU_NOTE, clampPunkte, stufeFuerPunkte, noteFuerPunkte, berechne, renderForm, openKatalogModal };
```

zu:

```js
  const api = { KRITERIEN, BLOECKE, BLOCK_LABELS, STUFEN, PUNKTE_ZU_NOTE, clampPunkte, stufeFuerPunkte, noteFuerPunkte, berechne, renderForm, openKatalogModal, formatPunkteGruppe, notenschluesselZeilen };
```

(`openNotenschluesselModal` existiert erst ab Task 5 und wird dort per eigener Änderung an dieser Zeile ergänzt.)

- [ ] **Step 6: Commit**

```bash
git add app/js/beurteilung-core.js app/js/beurteilung-core.test.js
git commit -m "feat(beurteilung): notenschluesselZeilen gruppiert Punkte->Note aus Bestandsdaten

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Hinweis "frei wählbar" an der Punkte-Spalte

**Files:**
- Modify: `app/js/beurteilung-core.js`

- [ ] **Step 1: Tabellenkopf anpassen**

In `renderForm()` in `app/js/beurteilung-core.js`, die Zeile:

```js
              <th>Punkte</th></tr></thead>
```

ersetzen durch:

```js
              <th>Punkte<br><span class="beurt-th-sub">frei wählbar, unabhängig von der Stufe</span></th></tr></thead>
```

- [ ] **Step 2: Manuell verifizieren**

```bash
cd "/c/Dev/Digitales-Berichtsheft" && node -c app/js/beurteilung-core.js
```

Expected: kein Output (Syntax-Check besteht). Visuelle Kontrolle erfolgt gesammelt in Task 7.

- [ ] **Step 3: Commit**

```bash
git add app/js/beurteilung-core.js
git commit -m "feat(beurteilung): Hinweis 'frei wählbar' an der Punkte-Spalte

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Zwei-Buttons-Einstieg + Notenschlüssel-Modal

**Files:**
- Modify: `app/js/beurteilung-core.js`

- [ ] **Step 1: Buttons im Formularkopf ersetzen**

In `renderForm()`, die Zeile:

```js
          <button type="button" class="btn btn-ghost btn-sm beurt__katalog-btn" id="beurtKatalogBtn">Kriterienkatalog</button>
```

ersetzen durch:

```js
          <div class="beurt__referenzen">
            <button type="button" class="btn btn-ghost btn-sm beurt__ref-btn" id="beurtKatalogBtn"><span aria-hidden="true">📖</span> Kriterienkatalog</button>
            <button type="button" class="btn btn-ghost btn-sm beurt__ref-btn" id="beurtNotenBtn"><span aria-hidden="true">🎯</span> IHK-Notenschlüssel</button>
          </div>
```

- [ ] **Step 2: Click-Handler für den neuen Button registrieren**

Die Zeile:

```js
    document.getElementById('beurtKatalogBtn')?.addEventListener('click', openKatalogModal);
```

ersetzen durch:

```js
    document.getElementById('beurtKatalogBtn')?.addEventListener('click', openKatalogModal);
    document.getElementById('beurtNotenBtn')?.addEventListener('click', openNotenschluesselModal);
```

- [ ] **Step 3: `notenschluesselTableHtml` + `openNotenschluesselModal` implementieren**

Direkt nach der Funktion `openKatalogModal()` (nach deren schließender `}`) einfügen:

```js
  // Baut die <tr>-Zeilen der Notenschlüssel-Tabelle; "Bereich der Note" wird
  // über zusammengehörige Stufen (1-6) per rowspan zusammengefasst, wie im Original.
  function notenschluesselTableHtml() {
    const zeilen = notenschluesselZeilen();
    return zeilen.map((z, i) => {
      const isFirstOfStufe = i === 0 || zeilen[i - 1].stufe !== z.stufe;
      const rowspan = isFirstOfStufe ? zeilen.filter(x => x.stufe === z.stufe).length : 0;
      return `
        <tr>
          <td>${fmtNote(z.note)}</td>
          <td>${esc(z.punkteLabel)}</td>
          ${isFirstOfStufe ? `<td rowspan="${rowspan}">${esc(z.verbal)}</td>` : ''}
        </tr>`;
    }).join('');
  }

  function openNotenschluesselModal() {
    let ov = document.getElementById('beurtNotenModal');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'beurtNotenModal';
      ov.className = 'modal-overlay';
      ov.innerHTML = `<div class="modal modal--lg"><div class="modal__header"><h2 class="modal__title">IHK-Notenschlüssel</h2>
        <button class="modal__close" type="button" data-modal-close aria-label="Schließen">×</button></div>
        <div class="modal__body beurt-noten">
          <table class="beurt-noten__table">
            <thead><tr><th>Schulnote</th><th>Punkte</th><th>Bereich der Note</th></tr></thead>
            <tbody>${notenschluesselTableHtml()}</tbody>
          </table>
          <a class="beurt-noten__pdf-link" href="/templates/ihk-notenschluessel.pdf" target="_blank" rel="noopener">Original-PDF öffnen ↗</a>
        </div></div>`;
      document.body.appendChild(ov);
      ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-modal-close]')) ov.classList.remove('open'); });
    }
    ov.classList.add('open');
  }
```

- [ ] **Step 4: `openNotenschluesselModal` exportieren**

In `app/js/beurteilung-core.js`, die `api`-Zeile (aus Task 3 Step 5) ändern von:

```js
  const api = { KRITERIEN, BLOECKE, BLOCK_LABELS, STUFEN, PUNKTE_ZU_NOTE, clampPunkte, stufeFuerPunkte, noteFuerPunkte, berechne, renderForm, openKatalogModal, formatPunkteGruppe, notenschluesselZeilen };
```

zu:

```js
  const api = { KRITERIEN, BLOECKE, BLOCK_LABELS, STUFEN, PUNKTE_ZU_NOTE, clampPunkte, stufeFuerPunkte, noteFuerPunkte, berechne, renderForm, openKatalogModal, formatPunkteGruppe, notenschluesselZeilen, openNotenschluesselModal };
```

- [ ] **Step 5: Syntax + Tests prüfen**

```bash
cd "/c/Dev/Digitales-Berichtsheft"
node -c app/js/beurteilung-core.js
node --test app/js/beurteilung-core.test.js
```

Expected: Syntax-Check ohne Output, alle Tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/js/beurteilung-core.js
git commit -m "feat(beurteilung): IHK-Notenschlüssel-Modal + Zwei-Buttons-Einstieg

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: CSS für Buttons + Notenschlüssel-Modal

**Files:**
- Modify: `app/css/beurteilung.css`

- [ ] **Step 1: Button-Layout ersetzen**

Die Zeile:

```css
.beurt__katalog-btn { grid-column: 1 / -1; justify-self: start; margin-top: var(--sp-1); }
```

ersetzen durch:

```css
.beurt__referenzen { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: var(--sp-3); margin-top: var(--sp-1); }
.beurt__ref-btn { display: inline-flex; align-items: center; gap: var(--sp-2); }
```

- [ ] **Step 2: Notenschlüssel-Modal-Styles ergänzen**

Nach dem Block `.katalog-krit__stufen li { line-height: var(--lh-snug); }` (Ende des Kriterienkatalog-Modal-Abschnitts) einfügen:

```css
/* ── IHK-Notenschlüssel-Modal ── */
.beurt-noten__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
  margin-bottom: var(--sp-4);
}
.beurt-noten__table th,
.beurt-noten__table td {
  border: 1px solid var(--pm-grey-200);
  padding: var(--sp-2) var(--sp-3);
  text-align: left;
  vertical-align: middle;
}
.beurt-noten__table thead th {
  background: var(--pm-grey-50);
  color: var(--pm-grey-700);
  font-weight: var(--fw-bold);
}
.beurt-noten__pdf-link {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  color: var(--pm-yellow-darker);
  font-weight: var(--fw-medium);
  font-size: var(--text-sm);
}
.beurt-noten__pdf-link:hover { text-decoration: underline; }
```

- [ ] **Step 3: Commit**

```bash
cd "/c/Dev/Digitales-Berichtsheft"
git add app/css/beurteilung.css
git commit -m "style(beurteilung): CSS für Zwei-Buttons-Einstieg + Notenschlüssel-Modal

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: PDF-Asset-Existenz automatisiert absichern

**Files:**
- Test: `app/js/beurteilung-core.test.js`

- [ ] **Step 1: Test schreiben**

An `app/js/beurteilung-core.test.js` anfügen (am Dateianfang steht bereits `const test = require('node:test'); const assert = require('node:assert/strict');` — `node:fs`/`node:path` zusätzlich importieren):

Direkt unter den bestehenden `require`-Zeilen am Dateikopf ergänzen:

```js
const fs = require('node:fs');
const path = require('node:path');
```

Dann als eigener Test anfügen:

```js
test('IHK-Notenschlüssel-PDF liegt als Asset im Projekt', () => {
  const pdfPath = path.join(__dirname, '..', 'templates', 'ihk-notenschluessel.pdf');
  assert.ok(fs.existsSync(pdfPath), `Erwartet: ${pdfPath}`);
  assert.ok(fs.statSync(pdfPath).size > 0, 'PDF-Datei ist leer');
});
```

- [ ] **Step 2: Test ausführen**

```bash
cd "/c/Dev/Digitales-Berichtsheft" && node --test app/js/beurteilung-core.test.js
```

Expected: PASS (alle Tests, inkl. des neuen — Task 1 hat die Datei bereits angelegt)

- [ ] **Step 3: Commit**

```bash
git add app/js/beurteilung-core.test.js
git commit -m "test(beurteilung): Asset-Check für ihk-notenschluessel.pdf

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Visuelle Verifikation im echten Browser

**Files:** keine Code-Änderungen — reine Verifikation.

- [ ] **Step 1: Lokalen Server sicherstellen**

```bash
cd "/c/Dev/Digitales-Berichtsheft/backend" && (netstat -ano | grep ':3000' || echo "not running")
```

Falls "not running": `cd "/c/Dev/Digitales-Berichtsheft/backend" && npm run dev &` (Hintergrund, Port 3000 — Details: [[reference_dev_server_restart_after_code_change]]). Falls bereits ein Prozess läuft, dessen Start-Zeit prüfen (`Get-Process -Id <pid>` in PowerShell) — ist er älter als diese Code-Änderungen, neu starten, sonst liefert er alte Dateien.

- [ ] **Step 2: Screenshot der Beurteilungsseite mit den zwei neuen Buttons**

```bash
cd "/c/Dev/Digitales-Berichtsheft"
export NODE_PATH="/c/Users/KunissF/AppData/Local/npm-cache/_npx/5e2e484947874241/node_modules"
node -e "
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // page.request teilt sich den Cookie-Jar mit page.context() - Login wirkt direkt auf Folge-Navigationen.
  await page.request.post('http://localhost:3000/api/auth/login-by-email', { data: { email: 'matthias.fauser@putzmeister.com' } });
  // Zuweisung mit Beurteilungslink über den Abteilungsdurchlauf finden
  await page.goto('http://localhost:3000/app/abteilungsdurchlauf.html', { waitUntil: 'networkidle' });
  const href = await page.locator('a.durchlauf-card__beurt, .durchlauf-card__beurt a').first().getAttribute('href').catch(() => null);
  if (!href) { console.log('KEIN Beurteilungslink gefunden - manuell prüfen'); await browser.close(); return; }
  await page.goto('http://localhost:3000' + href, { waitUntil: 'networkidle' });
  await page.screenshot({ path: '.superpowers/verify-beurteilung-kopf.png', fullPage: false });
  await page.click('#beurtNotenBtn');
  await page.waitForTimeout(300);
  await page.screenshot({ path: '.superpowers/verify-beurteilung-notenmodal.png', fullPage: false });
  await browser.close();
})();
"
```

Falls kein Beurteilungslink gefunden wird (z. B. keine passende Zuweisung im Dev-Datenbestand): direkt manuell im Browser einloggen (`matthias.fauser@putzmeister.com`), zu „Abteilungsdurchlauf" navigieren und eine Kachel mit Beurteilungs-Link öffnen.

- [ ] **Step 3: Screenshots ansehen und gegen die Spec prüfen**

Prüfpunkte (Spec §3, §4, §6):
- Zwei Buttons „📖 Kriterienkatalog" und „🎯 IHK-Notenschlüssel" nebeneinander sichtbar, gleiche Optik.
- Spaltenkopf „Punkte" zeigt den Untertext „frei wählbar, unabhängig von der Stufe".
- Modal zeigt Tabelle Schulnote/Punkte/Bereich der Note, „Bereich der Note" ist über zusammengehörige Zeilen zusammengefasst (rowspan).
- Link „Original-PDF öffnen ↗" ist vorhanden.
- Im Dark-Theme (`?theme=dark` bzw. Theme-Umschalter) bleibt alles lesbar (keine hartcodierten Farben).

- [ ] **Step 4: Aufräumen**

```bash
rm -f "/c/Dev/Digitales-Berichtsheft/.superpowers/verify-beurteilung-kopf.png" \
      "/c/Dev/Digitales-Berichtsheft/.superpowers/verify-beurteilung-notenmodal.png"
```

(`.superpowers/` ist ohnehin gitignored — Löschen ist Aufräumhygiene, kein Commit nötig.)

---

## Task 9: Abschluss

- [ ] **Step 1: Gesamten Testlauf + Syntax-Check ein letztes Mal**

```bash
cd "/c/Dev/Digitales-Berichtsheft"
node -c app/js/beurteilung-core.js
node --test app/js/beurteilung-core.test.js
```

Expected: Syntax-Check ohne Output, alle Tests PASS.

- [ ] **Step 2: `git status` und `git log` prüfen**

```bash
git status
git log --oneline -8
```

Expected: Working tree clean, alle Tasks als eigene Commits sichtbar.
