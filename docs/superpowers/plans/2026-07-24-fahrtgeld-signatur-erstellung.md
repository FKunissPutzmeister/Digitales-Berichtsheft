# Fahrtgeld-Signatur erstellen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nutzer können ihre Unterschrift für die Fahrgelderstattung direkt in der App erstellen — durch Zeichnen (Maus/Touch/Stift) oder Tippen des Namens in Handschrift-Optik; Bild-Upload bleibt erhalten, aber weniger präsent.

**Architecture:** Neues isoliertes IIFE-Modul `app/js/fahrtgeld-signatur.js` stellt `SignaturDialog.open({ name, onSave })` bereit und kapselt Modal, Canvas und Text-Rendering. Alle drei Eingabemethoden erzeugen eine PNG-`dataUrl` (weißer Hintergrund, auf Bounding-Box getrimmt) und liefern `{ dataUrl, extension }` an `onSave`. `fahrgelderstattung.js` speichert unverändert per `setSignature` im `localStorage`; die Einbettung in Excel/PDF (`fahrtgeld-core.js`) bleibt komplett unangetastet.

**Tech Stack:** Vanilla JS (Browser-Globals, kein Bundler), HTML5 Canvas, Pointer Events, `document.fonts` API, lokale OFL-Handschrift-Fonts, bestehender `Modal`-Helper aus `app/js/app.js`.

## Global Constraints

- **Kein Bundler / keine Module** — alle JS-Dateien sind IIFEs, die über `<script>`-Tags in `app/fahrgelderstattung.html` geladen werden und Globals wie `Modal`, `Toast`, `window.escapeHtml` nutzen.
- **Self-contained / kein CDN** — Fonts liegen lokal in `app/assets/fonts/` und werden per `@font-face` eingebunden (Muster wie `app/css/variables.css`).
- **Datenmodell unverändert** — Signatur bleibt `{ dataUrl, extension }` im `localStorage` (`setSignature` in `fahrgelderstattung.js`); `fahrtgeld-core.js` wird NICHT geändert.
- **Bild-Export:** weißer Hintergrund, auf Bounding-Box getrimmt, `image/png` (außer Upload, der sein Original-Format PNG/JPG behält).
- **Lokales Testen:** Backend `node server.js` auf `http://localhost:3000` (App wird von Node statisch serviert — NIE über Live-Server :5500 öffnen). UI-Verifikation via `npx playwright` mit Edge. CSS/JS-Änderungen erscheinen erst nach Hard-Reload (Strg+F5), nicht bei Sidebar-Navigation. Es gibt **kein JS-Unit-Test-Framework** im Projekt — Verifikation erfolgt im Browser.
- **Zugriff:** Die Seite ist hinter `previewUnlocked(user.role)` (localhost/Developer-Ansicht); zum Testen lokal auf :3000 mit Demo-Login als Azubi öffnen.

## File Structure

| Datei | Verantwortung | Aktion |
|---|---|---|
| `app/js/fahrtgeld-signatur.js` | Signatur-Modal: 3 Tabs, Canvas-Zeichnen, Text→Canvas, Trim/Export, `SignaturDialog.open()` | **Neu** |
| `app/fahrgelderstattung.html` | Modul-`<script>` einbinden | Modify (Zeile ~49–50) |
| `app/js/fahrgelderstattung.js` | Karte umbauen (primärer „Erstellen"-Button), `SignaturDialog.open` verdrahten, alte Upload-Buttons/Handler/Hidden-Input entfernen | Modify (~147–190, ~392–422, ~522–533) |
| `app/css/fahrgelderstattung.css` | `@font-face` (3 Fonts) + Modal-/Tab-/Canvas-/Chip-CSS | Modify |
| `app/assets/fonts/*.ttf` | 3 OFL-Handschrift-Fonts + `OFL.txt` | **Neu** |

---

### Task 1: Fonts beschaffen + `@font-face` registrieren

**Files:**
- Create: `app/assets/fonts/DancingScript.ttf`, `app/assets/fonts/Caveat.ttf`, `app/assets/fonts/Sacramento.ttf`, `app/assets/fonts/HANDWRITING-OFL.txt`
- Modify: `app/css/fahrgelderstattung.css` (oben, vor den bestehenden Regeln)

**Interfaces:**
- Produces: drei CSS-`font-family`-Namen, die spätere Tasks verwenden: `'Dancing Script'`, `'Caveat'`, `'Sacramento'`.

- [ ] **Step 1: Fonts herunterladen (OFL, kein CDN zur Laufzeit)**

Aus dem offiziellen `google/fonts`-Repo (SIL Open Font License) nach `app/assets/fonts/` laden:

```powershell
$dst = "app/assets/fonts"
$base = "https://raw.githubusercontent.com/google/fonts/main/ofl"
Invoke-WebRequest -Uri "$base/dancingscript/DancingScript%5Bwght%5D.ttf" -OutFile "$dst/DancingScript.ttf"
Invoke-WebRequest -Uri "$base/caveat/Caveat%5Bwght%5D.ttf"               -OutFile "$dst/Caveat.ttf"
Invoke-WebRequest -Uri "$base/sacramento/Sacramento-Regular.ttf"         -OutFile "$dst/Sacramento.ttf"
Invoke-WebRequest -Uri "$base/dancingscript/OFL.txt"                     -OutFile "$dst/HANDWRITING-OFL.txt"
```

- [ ] **Step 2: Download verifizieren**

Run:
```powershell
Get-ChildItem app/assets/fonts | Where-Object { $_.Name -in 'DancingScript.ttf','Caveat.ttf','Sacramento.ttf','HANDWRITING-OFL.txt' } | Select-Object Name,Length
```
Expected: alle vier Dateien vorhanden, die drei `.ttf` je > 30 KB (nicht 0 / keine HTML-Fehlerseite).

- [ ] **Step 3: `@font-face` in `app/css/fahrgelderstattung.css` ergänzen**

Ganz oben in die Datei einfügen (Dancing Script & Caveat sind Variable Fonts → `truetype-variations`; Sacramento ist statisch):

```css
/* ── Handschrift-Fonts für die Signatur-Erstellung (OFL, lokal) ── */
@font-face {
  font-family: 'Dancing Script';
  src: url('../assets/fonts/DancingScript.ttf') format('truetype-variations');
  font-weight: 400 700;
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
  font-family: 'Sacramento';
  src: url('../assets/fonts/Sacramento.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

- [ ] **Step 4: Font-Laden im Browser verifizieren**

Backend starten (`node server.js` im `backend/`-Ordner, Port 3000), Seite `http://localhost:3000/fahrgelderstattung.html` als Demo-Azubi öffnen (Strg+F5). In der DevTools-Konsole:

```js
await Promise.all([
  document.fonts.load('64px "Dancing Script"'),
  document.fonts.load('72px "Caveat"'),
  document.fonts.load('60px "Sacramento"'),
]);
['Dancing Script','Caveat','Sacramento'].map(f => [f, document.fonts.check(`64px "${f}"`)]);
```
Expected: alle drei `true`.

- [ ] **Step 5: Commit**

```bash
git add app/assets/fonts/DancingScript.ttf app/assets/fonts/Caveat.ttf app/assets/fonts/Sacramento.ttf app/assets/fonts/HANDWRITING-OFL.txt app/css/fahrgelderstattung.css
git commit -m "feat(fahrtgeld): Handschrift-Fonts (OFL) lokal + @font-face registrieren"
```

---

### Task 2: Signatur-Modul-Skelett + Modal-Shell mit Tabs + Karte-Umbau

**Files:**
- Create: `app/js/fahrtgeld-signatur.js`
- Modify: `app/fahrgelderstattung.html` (nach Zeile 49, vor `fahrgelderstattung.js`)
- Modify: `app/js/fahrgelderstattung.js` (`buildStammdatenCard` ~158–189; Event-Verdrahtung ~419–422)
- Modify: `app/css/fahrgelderstattung.css` (Modal-/Tab-CSS)

**Interfaces:**
- Consumes: globaler `Modal` (`Modal.open(id)`, `Modal.closeAll()`, `Modal.init()`), `Toast`, `window.escapeHtml`.
- Produces: globales `window.SignaturDialog` mit `open({ name, onSave })`. `onSave` wird mit `{ dataUrl, extension }` (oder gar nicht) aufgerufen. In diesem Task ruft „Übernehmen" noch KEIN `onSave` (Stub) — nur Tabs/Öffnen/Schließen funktionieren.

- [ ] **Step 1: Modul-Skelett `app/js/fahrtgeld-signatur.js` anlegen**

```js
/* ===================================================================
   FAHRTGELD-SIGNATUR.JS
   Signatur-Erstelldialog für die Fahrgelderstattung.
   Drei Tabs: Zeichnen (Canvas/Pointer), Tippen (Name → Handschrift),
   Hochladen (PNG/JPG). Liefert { dataUrl, extension } an onSave.
   Erzeugung der dataUrl ist der einzige Zweck — Persistenz/Einbettung
   liegen bei fahrgelderstattung.js bzw. fahrtgeld-core.js.
   =================================================================== */
(function () {
  'use strict';
  const esc = window.escapeHtml || (s => String(s));

  // Handschrift-Stile fürs Tippen (font-family aus @font-face in CSS).
  const FONTS = [
    { key: 'dancing',    label: 'Stil 1', family: 'Dancing Script', size: 64 },
    { key: 'caveat',     label: 'Stil 2', family: 'Caveat',         size: 74 },
    { key: 'sacramento', label: 'Stil 3', family: 'Sacramento',     size: 62 },
  ];
  const INK = '#1a1a2e';   // dunkle "Tinte" auf weißem Grund

  let state = null;  // { onSave, activeTab, currentFont, pendingUpload, drawCtx, drawInk }

  function buildMarkup() {
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
                ${FONTS.map((f, i) => `<button class="sig-style${i === 0 ? ' is-active' : ''}" data-sig-font="${f.key}" type="button" style="font-family:'${f.family}',cursive">Beispiel</button>`).join('')}
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

  function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('#fgSigModal .sig-tab').forEach(b =>
      b.classList.toggle('is-active', b.dataset.sigTab === tab));
    document.querySelectorAll('#fgSigModal .sig-panel').forEach(p =>
      p.classList.toggle('is-active', p.dataset.sigPanel === tab));
    if (tab === 'draw') requestAnimationFrame(setupDrawCanvas);
  }

  // Stubs — in Task 3/4/5 gefüllt.
  function setupDrawCanvas() {}
  function onApply() { window.Toast?.info?.('Bald', 'Übernehmen folgt.'); }

  function open({ name, onSave }) {
    document.getElementById('fgSigModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', buildMarkup());
    state = { onSave, activeTab: 'draw', currentFont: FONTS[0], pendingUpload: null, drawCtx: null, drawInk: false };

    document.querySelectorAll('#fgSigModal .sig-tab').forEach(btn =>
      btn.addEventListener('click', () => switchTab(btn.dataset.sigTab)));
    document.getElementById('fg-sig-apply')?.addEventListener('click', onApply);

    window.Modal?.init?.();
    window.Modal?.open?.('fgSigModal');
    requestAnimationFrame(setupDrawCanvas);
  }

  window.SignaturDialog = { open };
})();
```

- [ ] **Step 2: Modul in `app/fahrgelderstattung.html` einbinden**

Zwischen Zeile 49 und 50 (vor `fahrgelderstattung.js`, da dieses `SignaturDialog` nutzt):

```html
<script src="js/fahrtgeld-core.js"></script>
<script src="js/fahrtgeld-signatur.js"></script>
<script src="js/fahrgelderstattung.js"></script>
```

- [ ] **Step 3: Signatur-Sektion der Karte umbauen (`buildStammdatenCard`)**

In `app/js/fahrgelderstattung.js` den Block mit den Buttons (`fg-sig-upload`/`fg-sig-remove`, aktuell ~182–185) ersetzen durch:

```js
          <div style="display:flex;gap:var(--sp-2);flex-shrink:0">
            <button class="btn btn-primary btn-sm" id="fg-sig-create" type="button">${has ? 'Ändern' : 'Unterschrift erstellen'}</button>
            ${has ? `<button class="btn btn-outline btn-sm" id="fg-sig-remove" type="button">Entfernen</button>` : ''}
          </div>
```

Der Vorschau-`<img>`-Block darunter (~187–189) bleibt unverändert.

- [ ] **Step 4: Event-Verdrahtung ersetzen**

In `app/js/fahrgelderstattung.js` die beiden Zeilen (aktuell ~420–421):

```js
    document.getElementById('fg-sig-upload')?.addEventListener('click', () => document.getElementById('fg-sig-input')?.click());
    document.getElementById('fg-sig-input')?.addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) uploadSignatureImage(f); e.target.value = ''; });
```

ersetzen durch:

```js
    document.getElementById('fg-sig-create')?.addEventListener('click', () => {
      SignaturDialog.open({
        name: konfig?.name || '',
        onSave: (sig) => { setSignature(sig); Toast.success('Gespeichert', 'Unterschrift hinterlegt.'); render(); },
      });
    });
```

Die `fg-sig-remove`-Zeile (~422) bleibt unverändert.

- [ ] **Step 5: Modal-/Tab-CSS in `app/css/fahrgelderstattung.css` ergänzen**

```css
/* ── Signatur-Erstelldialog ── */
.sig-tabs { display:flex; gap:var(--sp-2); border-bottom:1px solid var(--border-color,rgba(255,255,255,.12)); margin-bottom:var(--sp-4); }
.sig-tab { appearance:none; background:none; border:none; padding:var(--sp-2) var(--sp-3); cursor:pointer; color:var(--text-secondary,#888); font:inherit; border-bottom:2px solid transparent; }
.sig-tab.is-active { color:var(--text-primary,#fff); border-bottom-color:var(--pm-yellow,#FFC300); }
.sig-tab--muted { margin-left:auto; opacity:.75; }
.sig-panel { display:none; }
.sig-panel.is-active { display:block; }
.sig-panel__actions { display:flex; align-items:center; gap:var(--sp-3); margin-top:var(--sp-2); }
.sig-canvas { width:100%; height:180px; background:#fff; border:1px dashed var(--border-color,#ccc); border-radius:var(--radius-md,8px); touch-action:none; cursor:crosshair; display:block; }
.sig-styles { display:flex; gap:var(--sp-2); flex-wrap:wrap; margin:var(--sp-3) 0; }
.sig-style { flex:1; min-width:120px; background:#fff; color:#1a1a2e; border:2px solid var(--border-color,#ccc); border-radius:var(--radius-md,8px); padding:var(--sp-2); font-size:26px; cursor:pointer; }
.sig-style.is-active { border-color:var(--pm-yellow,#FFC300); }
.sig-preview { min-height:80px; margin-top:var(--sp-3); padding:var(--sp-3); background:#fff; border-radius:var(--radius-md,8px); display:flex; align-items:center; justify-content:center; color:#1a1a2e; overflow:hidden; }
.sig-preview img { max-height:80px; max-width:100%; }
```

- [ ] **Step 6: Verifikation im Browser**

Seite auf `http://localhost:3000/fahrgelderstattung.html` neu laden (Strg+F5). Prüfen:
- Karte zeigt Button „Unterschrift erstellen" (bzw. „Ändern", falls Signatur vorhanden).
- Klick öffnet das Modal mit drei Tabs; „Zeichnen" ist aktiv.
- Tab-Wechsel Zeichnen ↔ Tippen ↔ Hochladen zeigt jeweils das richtige Panel.
- „Abbrechen" / X / ESC / Overlay-Klick schließen das Modal.
- „Übernehmen" zeigt (noch) den Stub-Toast „Bald".

Playwright-Kurzcheck (Edge), Beispiel:
```
mcp-Playwright: navigate → click #fg-sig-create → snapshot (Modal sichtbar) → click [data-sig-tab="type"] → snapshot (Tipp-Panel)
```

- [ ] **Step 7: Commit**

```bash
git add app/js/fahrtgeld-signatur.js app/fahrgelderstattung.html app/js/fahrgelderstattung.js app/css/fahrgelderstattung.css
git commit -m "feat(fahrtgeld): Signatur-Modal-Skelett mit Tabs + Karte-Umbau"
```

---

### Task 3: Tab „Zeichnen" — Canvas, Pointer-Events, High-DPI, Trim-Export

**Files:**
- Modify: `app/js/fahrtgeld-signatur.js` (`setupDrawCanvas`, neuer Trim-Helper, `onApply` für Draw)

**Interfaces:**
- Consumes: `state`, `INK`.
- Produces: `trimToDataUrl(canvas) → string|null` (weißer Grund, auf Bounding-Box getrimmt, PNG-DataURL; `null` wenn leer) — wird in Task 4 wiederverwendet. `onApply` liefert für Tab „draw" `{ dataUrl, extension:'png' }` an `state.onSave`.

- [ ] **Step 1: `setupDrawCanvas` implementieren (High-DPI + Pointer-Events)**

Stub in `fahrtgeld-signatur.js` ersetzen:

```js
  function setupDrawCanvas() {
    const canvas = document.getElementById('fg-sig-canvas');
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;  // Panel noch nicht sichtbar
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    state.drawCtx = ctx;
    state.drawInk = false;

    let drawing = false;
    canvas.onpointerdown = (e) => {
      drawing = true; state.drawInk = true;
      ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY);
      canvas.setPointerCapture(e.pointerId);
    };
    canvas.onpointermove = (e) => {
      if (!drawing) return;
      ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke();
    };
    canvas.onpointerup = canvas.onpointercancel = () => { drawing = false; };

    document.getElementById('fg-sig-clear').onclick = () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, rect.width, rect.height);
      state.drawInk = false;
    };
  }
```

- [ ] **Step 2: Trim-Helper `trimToDataUrl` ergänzen**

Vor `open()` einfügen:

```js
  // Schneidet einen (weiß hinterlegten, dunkel bezeichneten) Canvas auf die
  // Bounding-Box der "Tinte" zu und liefert eine PNG-DataURL. null wenn leer.
  function trimToDataUrl(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;   // Geräte-Pixel
    const data = ctx.getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = 0, maxY = 0, found = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) {
          found = true;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) return null;
    const pad = Math.round(8 * (window.devicePixelRatio || 1));
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
    const cw = maxX - minX + 1, ch = maxY - minY + 1;
    const out = document.createElement('canvas');
    out.width = cw; out.height = ch;
    const octx = out.getContext('2d');
    octx.fillStyle = '#fff';
    octx.fillRect(0, 0, cw, ch);
    octx.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
    return out.toDataURL('image/png');
  }
```

- [ ] **Step 3: `onApply` für den Draw-Tab implementieren**

Stub-`onApply` ersetzen (Type/Upload folgen in Task 4/5, hier vorerst nur `draw`):

```js
  async function onApply() {
    let sig = null;
    if (state.activeTab === 'draw') {
      const canvas = document.getElementById('fg-sig-canvas');
      if (state.drawInk && canvas) {
        const dataUrl = trimToDataUrl(canvas);
        if (dataUrl) sig = { dataUrl, extension: 'png' };
      }
    }
    if (!sig || !sig.dataUrl) {
      window.Toast?.warning?.('Leer', 'Bitte zuerst eine Unterschrift erstellen.');
      return;
    }
    state.onSave?.(sig);
    window.Modal?.closeAll?.();
  }
```

`onApply` ist jetzt `async` — der Handler in Step 2/Task 2 (`addEventListener('click', onApply)`) funktioniert unverändert.

- [ ] **Step 4: Verifikation im Browser**

Seite neu laden (Strg+F5), „Unterschrift erstellen" → Tab „Zeichnen":
- Zeichnen mit der Maus hinterlässt eine glatte, scharfe Linie.
- „Löschen" leert die Fläche.
- „Übernehmen" ohne Zeichnung → Toast „Leer", Modal bleibt offen.
- Nach Zeichnen „Übernehmen" → Modal schließt, Vorschau-Bild erscheint auf der Karte, Button heißt jetzt „Ändern".
- Seite neu laden → Vorschau bleibt (localStorage). In DevTools: `JSON.parse(localStorage.getItem('fahrtgeldUnterschrift_' + (window.__user?.oid||''))).dataUrl.startsWith('data:image/png')` → `true` (oder Vorschau-`<img src>` prüfen).

- [ ] **Step 5: Commit**

```bash
git add app/js/fahrtgeld-signatur.js
git commit -m "feat(fahrtgeld): Signatur zeichnen (Canvas, Pointer, High-DPI, Trim)"
```

---

### Task 4: Tab „Tippen" — Textfeld, 3 Stile, Live-Vorschau, Text→Canvas

**Files:**
- Modify: `app/js/fahrtgeld-signatur.js` (Tipp-Verdrahtung in `open()`, `renderTypedToCanvas`, `updateTypePreview`, `onApply`-Zweig für `type`)

**Interfaces:**
- Consumes: `FONTS`, `INK`, `trimToDataUrl` (aus Task 3), `state`.
- Produces: `renderTypedToCanvas(text, font) → Promise<HTMLCanvasElement>` (weißer Grund, dunkler Text, Font vor dem Zeichnen via `document.fonts.load` geladen). `onApply` liefert für Tab „type" `{ dataUrl, extension:'png' }`.

- [ ] **Step 1: `renderTypedToCanvas` + `updateTypePreview` ergänzen**

Vor `open()` einfügen:

```js
  async function renderTypedToCanvas(text, font) {
    await document.fonts.load(`${font.size}px "${font.family}"`);
    const dpr = window.devicePixelRatio || 1;
    const meas = document.createElement('canvas').getContext('2d');
    meas.font = `${font.size}px "${font.family}"`;
    const w = Math.ceil(meas.measureText(text).width) + 40;
    const h = Math.ceil(font.size * 1.8);
    const c = document.createElement('canvas');
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${font.size}px "${font.family}"`;   // nach Resize erneut setzen
    ctx.fillText(text, w / 2, h / 2);
    return c;
  }

  function updateTypePreview() {
    const el = document.getElementById('fg-sig-preview');
    const text = (document.getElementById('fg-sig-text')?.value || '').trim();
    if (!el) return;
    el.innerHTML = text
      ? `<span style="font-family:'${state.currentFont.family}',cursive;font-size:44px;color:${INK}">${esc(text)}</span>`
      : '<span class="hint">Vorschau erscheint hier</span>';
  }
```

- [ ] **Step 2: Tipp-Tab in `open()` verdrahten + Textfeld vorbelegen**

In `open()` nach der Tab-Verdrahtung ergänzen:

```js
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
```

- [ ] **Step 3: `onApply` um den `type`-Zweig erweitern**

Im `onApply` (aus Task 3) nach dem `draw`-Block ergänzen:

```js
    } else if (state.activeTab === 'type') {
      const text = (document.getElementById('fg-sig-text')?.value || '').trim();
      if (text) {
        const canvas = await renderTypedToCanvas(text, state.currentFont);
        const dataUrl = trimToDataUrl(canvas);
        if (dataUrl) sig = { dataUrl, extension: 'png' };
      }
```

(D.h. `if (state.activeTab === 'draw') { … } else if (state.activeTab === 'type') { … }` — der bestehende Leer-Check und `onSave` darunter bleiben.)

- [ ] **Step 4: Verifikation im Browser**

Seite neu laden, „Unterschrift erstellen" → Tab „Tippen":
- Textfeld ist mit dem Profilnamen vorbelegt.
- Die drei Stil-Buttons zeigen sichtbar unterschiedliche Handschriften; Klick markiert den aktiven Stil und ändert die Vorschau.
- Tippen aktualisiert die Vorschau live.
- „Übernehmen" bei leerem Feld → Toast „Leer".
- „Übernehmen" mit Text → Modal schließt, Karten-Vorschau zeigt den Namen in der gewählten Handschrift (scharf, nicht pixelig).

- [ ] **Step 5: Commit**

```bash
git add app/js/fahrtgeld-signatur.js
git commit -m "feat(fahrtgeld): getippte Signatur mit 3 Handschrift-Stilen"
```

---

### Task 5: Tab „Hochladen" + Aufräumen der alten Upload-Reste

**Files:**
- Modify: `app/js/fahrtgeld-signatur.js` (Upload-Verdrahtung in `open()`, `onApply`-Zweig für `upload`)
- Modify: `app/js/fahrgelderstattung.js` (Hidden-Input `fg-sig-input` aus `render()` entfernen; tote `uploadSignatureImage`-Funktion entfernen)

**Interfaces:**
- Consumes: `state`.
- Produces: `onApply` liefert für Tab „upload" `state.pendingUpload = { dataUrl, extension }` (`extension` = `'png'` oder `'jpeg'`, Original-Format bleibt).

- [ ] **Step 1: Upload-Tab in `open()` verdrahten**

In `open()` ergänzen (nach der Tipp-Verdrahtung):

```js
    document.getElementById('fg-sig-file')?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!['image/png', 'image/jpeg'].includes(file.type)) {
        window.Toast?.warning?.('Format', 'Bitte ein PNG oder JPG hochladen.');
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
```

- [ ] **Step 2: `onApply` um den `upload`-Zweig erweitern**

Im `onApply` nach dem `type`-Block ergänzen:

```js
    } else if (state.activeTab === 'upload') {
      sig = state.pendingUpload;
```

- [ ] **Step 3: Hidden-Input aus `render()` in `fahrgelderstattung.js` entfernen**

In `render()` die Zeile mit dem versteckten Signatur-File-Input entfernen (Suche nach `id="fg-sig-input"`). Der Dok-Upload-Input `fg-doc-input` bleibt bestehen.

- [ ] **Step 4: Tote `uploadSignatureImage`-Funktion entfernen**

Die Funktion `uploadSignatureImage(file)` in `fahrgelderstattung.js` (~522–533) wird nicht mehr aufgerufen (Upload läuft jetzt im Modul) — komplett entfernen. `arrayBufferToDataUrl` (für Excel-Auto-Extraktion) und `dataUrlToBytes` (für die Generierung) **bleiben**.

- [ ] **Step 5: Verifikation im Browser**

Seite neu laden:
- Tab „Hochladen" ist optisch dezent (rechts, `--muted`).
- PNG/JPG auswählen → Vorschau im Panel; „Übernehmen" → Karten-Vorschau zeigt das Bild.
- Falsches Format (z. B. `.gif`) → Toast „Format".
- Konsole zeigt keine `ReferenceError` (kein Aufruf von entferntem `uploadSignatureImage`/`fg-sig-input`).

- [ ] **Step 6: Commit**

```bash
git add app/js/fahrtgeld-signatur.js app/js/fahrgelderstattung.js
git commit -m "feat(fahrtgeld): Upload in Modal-Tab verlagert + alte Reste entfernt"
```

---

### Task 6: End-to-End — Einbettung in Excel & PDF für alle drei Methoden

**Files:**
- Keine Code-Änderung erwartet — reine Verifikation der unveränderten Einbettung (`fahrtgeld-core.js`). Nur falls ein Defekt auftritt, hier fixen.

**Interfaces:**
- Consumes: gespeicherte Signatur `{ dataUrl, extension }` (localStorage), `FahrtgeldCore.generiereFahrtgeldExcel` / `generiereFahrtgeldPdf`.

- [ ] **Step 1: Excel-Generierung mit gezeichneter Signatur prüfen**

Signatur zeichnen → übernehmen. Stammdaten vollständig, einen Monat mit Schultagen wählen → „Excel erzeugen". Datei öffnen: Unterschrift sitzt im Bereich A21, Seitenverhältnis korrekt (nicht verzerrt/abgeschnitten), heutiges Datum darunter zentriert.

- [ ] **Step 2: PDF-Generierung mit getippter Signatur prüfen**

Signatur tippen (ein Stil) → übernehmen → „PDF erzeugen". Im PDF sitzt die Unterschrift über dem Auszubildender-Feld, Datum korrekt.

- [ ] **Step 3: Upload-Signatur in beiden Formaten prüfen**

PNG hochladen → übernehmen → Excel **und** PDF erzeugen. Einbettung in beiden korrekt (identischer Pfad wie zuvor, da `setSignature` gleich).

- [ ] **Step 4: „Entfernen" prüfen**

„Entfernen" → Vorschau weg, Button wieder „Unterschrift erstellen". Excel/PDF erzeugen → nur Datum, kein Bild, kein Fehler.

- [ ] **Step 5: Regressions-Check Dokument-Import**

Ein bestehendes Fahrgeld-Excel mit eingebetteter Unterschrift über „Aus Dokument übernehmen" hochladen → Stammdaten **und** Auto-Unterschrift werden weiterhin übernommen (Pfad `unterschriftAuto` unverändert). Vorschau erscheint.

- [ ] **Step 6: Abschluss-Commit (nur falls in diesem Task Fixes nötig waren)**

```bash
git add -A
git commit -m "fix(fahrtgeld): Signatur-Einbettung End-to-End verifiziert"
```

---

## Self-Review

**Spec coverage:**
- Getippte Signatur → Task 4. ✓
- Gezeichnete Signatur (Maus/Touch/Stift) → Task 3 (Pointer-Events). ✓
- Upload erhalten, weniger präsent → Task 5 (Tab `--muted`) + Task 2 (Karte ohne Upload-Button). ✓
- Neues Modul `fahrtgeld-signatur.js` mit `SignaturDialog.open` → Task 2. ✓
- Modal mit 3 Tabs → Task 2. ✓
- Weißer Hintergrund + Bounding-Box-Trim + PNG → Task 3 (`trimToDataUrl`), Task 4 (Text). ✓
- Fonts lokal + `@font-face` + `document.fonts.load` vor Render → Task 1 + Task 4. ✓
- Karte vereinfacht (Erstellen/Ändern + Entfernen) → Task 2. ✓
- Datenmodell/Einbettung unverändert → Task 6 (Verifikation), keine Core-Änderung. ✓
- Fehlerbehandlung (leer, Format, Font-Fallback via `font-display:swap`) → Task 3/4/5. ✓

**Placeholder-Scan:** Stubs in Task 2 (`setupDrawCanvas`, `onApply`) sind bewusst und werden in Task 3/4/5 vollständig ersetzt — kein „TODO/TBD" in fertigem Code. ✓

**Typ-Konsistenz:** `trimToDataUrl(canvas)→string|null` (Task 3) wird in Task 3 & 4 identisch genutzt; `renderTypedToCanvas(text,font)→Promise<canvas>` (Task 4) konsistent; `onSave({dataUrl,extension})` und `state`-Felder (`activeTab`, `currentFont`, `pendingUpload`, `drawCtx`, `drawInk`) über alle Tasks gleich benannt. ✓
