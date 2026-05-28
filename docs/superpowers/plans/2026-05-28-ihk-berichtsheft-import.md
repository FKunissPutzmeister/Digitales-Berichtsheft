# IHK-Berichtsheft-Import — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import-Funktion für den IHK-Ausbildungsnachweis: PDF hochladen → alle Wochen mit Anwesenheit, Ort und Stunden werden automatisch ins Berichtsheft übernommen.

**Architecture:** Zwei neue JS-Dateien (`ihk-parser.js` für reine Parse-Logik, `ihk-import.js` für UI + DB-Zugriff), analog zur bestehenden SAP-Import-Struktur (`zeitnachweis-parser.js` / `zeitnachweis-upload.js`). Kein Backend-Code. Parser läuft in Node testbar (kein DOM, kein pdf.js).

**Tech Stack:** Vanilla JS (ES5-compatible IIFE), pdf.js (bereits vorhanden unter `app/js/vendor/`), bestehende `DB.getWoche` / `DB.saveWoche` aus `api.js`.

---

## File Map

| Aktion | Datei | Verantwortung |
|---|---|---|
| Neu | `app/js/ihk-parser.js` | Reine Parsing-Logik: Seitentext → Wochenobjekte |
| Neu | `app/js/ihk-import.js` | UI (Widget, Modal, Drag-Drop) + DB-Schreibzugriff |
| Ändern | `app/profil.html` | Zwei `<script>`-Tags hinzufügen |
| Ändern | `app/js/profil.js` | `IhkImport.renderSection()` + `IhkImport.bind()` aufrufen |

---

## Task 1: `ihk-parser.js` erstellen — vollständige Implementierung

**Files:**
- Create: `app/js/ihk-parser.js`

- [ ] **Schritt 1: Datei anlegen**

  Erstelle `app/js/ihk-parser.js` mit folgendem Inhalt:

```js
/* ===================================================================
   IHK-PARSER.JS
   Reine Parsing-Logik für den IHK-Ausbildungsnachweis (PDF → Wochendaten).
   Bewusst ohne DOM- und ohne pdf.js-Abhängigkeit, damit die Logik
   isoliert (auch in Node) testbar bleibt. Die PDF-Textextraktion
   passiert separat in ihk-import.js und liefert hier ein Array von
   Seiten-Strings (je Seite = je Ausbildungswoche).
   =================================================================== */
(function (global) {
  'use strict';

  function ddmmyyyyToISO(s) {
    const m = String(s).match(/(\d{2})\.(\d{2})\.(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  }

  // "7:48" → 7.8  |  "08:00" → 8.0
  function hmToDecimal(s) {
    const m = String(s || '').match(/(\d{1,2}):(\d{2})/);
    if (!m) return 0;
    return Math.round((parseInt(m[1], 10) + parseInt(m[2], 10) / 60) * 100) / 100;
  }

  // ISO 8601 Kalenderwoche aus Date-Objekt (identische Logik wie DateUtil in api.js)
  function getISOKW(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dow = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dow);
    const yr = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return {
      kw:   Math.ceil((((d - yr) / 86400000) + 1) / 7),
      year: d.getUTCFullYear(),
    };
  }

  function mapStatus(text) {
    const t = String(text || '').toLowerCase();
    if (/genehmigt/.test(t))                          return 'genehmigt';
    if (/freigegeben|eingereicht|vom azubi/.test(t))  return 'freigegeben';
    if (/abgelehnt|zur[üu]ckgegeben/.test(t))         return 'abgelehnt';
    return 'offen';
  }

  function mapDayType(typ) {
    const t = String(typ || '').trim().toLowerCase();
    if (/betrieb/.test(t))               return { anwesenheit: 'anwesend',              ort: 'Betrieb' };
    if (/schule/.test(t))                return { anwesenheit: 'anwesend',              ort: 'Schule'  };
    if (/urlaub/.test(t))                return { anwesenheit: 'Urlaub',                ort: ''        };
    if (/feiertag/.test(t))              return { anwesenheit: 'Feiertag',              ort: ''        };
    if (/zeitausgleich/.test(t))         return { anwesenheit: 'sonstige Abwesenheit',  ort: ''        };
    if (/sonstige abwesenheit/.test(t))  return { anwesenheit: 'sonstige Abwesenheit',  ort: ''        };
    if (/krank|arbeitsunf/i.test(t))     return { anwesenheit: 'krank',                 ort: ''        };
    return null;
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // Mo/Di/Mi/Do/Fr | DD.MM.YYYY | Typ | anwesend/abwesend [HH:MM]
  // Das | kann im extrahierten pdf.js-Text auch fehlen oder als Leerzeichen erscheinen.
  const DAY_RE     = /^(Mo|Di|Mi|Do|Fr|Sa|So)\s*\|?\s*(\d{2}\.\d{2}\.\d{4})\s*\|?\s*(.+?)\s*\|?\s*(anwesend|abwesend)(?:\s+(\d{1,2}:\d{2}))?/i;
  const WOCHE_RE   = /Ausbildungswoche\s+(\d{2}\.\d{2}\.\d{4})\s+bis\s+(\d{2}\.\d{2}\.\d{4})/i;
  const STATUS_RE  = /^Status[:\s]+(.+)/i;
  const QUALI_RE   = /^Qualifikationen:/i;
  const WEEKEND_RE = /^(Sa|So)\b/i;

  function parsePage(text, warnungen) {
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    let startDate = null;
    let endDate   = null;
    let status    = 'offen';
    let skipRest  = false;
    // Roheinträge je Datum – mehrere Zeilen möglich (Betrieb + Schule am gleichen Tag)
    const rawByDatum = {};

    for (const line of lines) {
      if (skipRest) continue;
      if (QUALI_RE.test(line)) { skipRest = true; continue; }

      const wm = line.match(WOCHE_RE);
      if (wm) {
        startDate = ddmmyyyyToISO(wm[1]);
        endDate   = ddmmyyyyToISO(wm[2]);
        continue;
      }

      const sm = line.match(STATUS_RE);
      if (sm) { status = mapStatus(sm[1]); continue; }

      if (WEEKEND_RE.test(line)) continue; // Sa/So in 7-Tage-PDFs überspringen

      const dm = line.match(DAY_RE);
      if (dm) {
        const [, wt, datStr, typ, anwAbw, zeit] = dm;
        const datum = ddmmyyyyToISO(datStr);
        if (!datum) continue;

        const mapped = mapDayType(typ);
        if (!mapped) {
          warnungen.push(`${cap(wt)} ${datum}: Typ „${typ.trim()}" nicht erkannt.`);
          continue;
        }

        const stunden = anwAbw.toLowerCase() === 'anwesend' ? hmToDecimal(zeit) : 0;
        if (!rawByDatum[datum]) rawByDatum[datum] = [];
        rawByDatum[datum].push({ datum, wochentag: cap(wt), ...mapped, stunden });
      }
    }

    if (!startDate) return null; // Kein Wochenkopf → keine gültige Seite

    const { kw, year } = getISOKW(new Date(startDate + 'T00:00:00'));

    // Betrieb + Schule am gleichen Tag → ort: 'Betrieb/Schule', Stunden summiert
    const tage = Object.values(rawByDatum).map(entries => {
      if (entries.length === 1) return entries[0];
      const hatBetrieb = entries.some(e => e.ort === 'Betrieb');
      const hatSchule  = entries.some(e => e.ort === 'Schule');
      if (hatBetrieb && hatSchule) {
        return {
          datum:       entries[0].datum,
          wochentag:   entries[0].wochentag,
          anwesenheit: 'anwesend',
          ort:         'Betrieb/Schule',
          stunden:     entries.reduce((s, e) => s + e.stunden, 0),
        };
      }
      return entries[0];
    });

    tage.sort((a, b) => (a.datum < b.datum ? -1 : 1));

    return { kw, year, startDate, endDate, status, tage };
  }

  /**
   * @param {string[]} pages  Array von Seiten-Strings (je Seite = je Woche).
   * @returns {{ wochen: Woche[], warnungen: string[] }}
   */
  function parse(pages) {
    const result = { wochen: [], warnungen: [] };
    for (const pageText of (pages || [])) {
      const woche = parsePage(pageText, result.warnungen);
      if (woche) result.wochen.push(woche);
    }
    return result;
  }

  const api = {
    parse,
    // Für direkte Node-Tests exportiert:
    _ddmmyyyyToISO: ddmmyyyyToISO,
    _hmToDecimal:   hmToDecimal,
    _mapStatus:     mapStatus,
    _mapDayType:    mapDayType,
    _getISOKW:      getISOKW,
  };
  global.IhkParser = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Schritt 2: Parser in Node testen — Basisfall (Mo–Fr, Betrieb)**

  Ausführen aus dem Projekt-Root (`c:\Dev\Digitales-Berichtsheft`):

```
node -e "
const p = require('./app/js/ihk-parser.js');
const page = [
  'Ausbildungswoche 06.01.2025 bis 10.01.2025',
  'Status: Offen',
  'Mo | 06.01.2025 | Betrieb | anwesend 07:48',
  'Di | 07.01.2025 | Betrieb | anwesend 08:00',
  'Mi | 08.01.2025 | Urlaub | abwesend',
  'Do | 09.01.2025 | Betrieb | anwesend 07:45',
  'Fr | 10.01.2025 | Betrieb | anwesend 07:00',
  'Qualifikationen:',
  'Netzwerke (wird ignoriert)'
].join('\n');
const r = p.parse([page]);
console.assert(r.wochen.length === 1,        'Genau 1 Woche erwartet');
console.assert(r.wochen[0].kw === 2,         'KW 2 erwartet, ist: ' + r.wochen[0].kw);
console.assert(r.wochen[0].year === 2025,    'Jahr 2025 erwartet');
console.assert(r.wochen[0].status === 'offen', 'Status offen erwartet');
console.assert(r.wochen[0].tage.length === 5, '5 Tage erwartet, ist: ' + r.wochen[0].tage.length);
console.assert(r.wochen[0].tage[0].stunden === 7.8, 'Mo 7.8h erwartet, ist: ' + r.wochen[0].tage[0].stunden);
console.assert(r.wochen[0].tage[2].anwesenheit === 'Urlaub', 'Mi Urlaub erwartet');
console.assert(r.warnungen.length === 0, 'Keine Warnungen erwartet');
console.log('✓ Basisfall bestanden');
"
```

  Erwartet: `✓ Basisfall bestanden`

- [ ] **Schritt 3: Parser in Node testen — Betrieb/Schule-Merge + 7-Tage-PDF + Status-Mapping**

```
node -e "
const p = require('./app/js/ihk-parser.js');
const page = [
  'Ausbildungswoche 13.01.2025 bis 17.01.2025',
  'Status: Vom Ausbilder genehmigt am 20.01.2025',
  'Mo | 13.01.2025 | Betrieb | anwesend 04:00',
  'Mo | 13.01.2025 | Schule | anwesend 04:00',
  'Di | 14.01.2025 | Feiertag | abwesend',
  'Mi | 15.01.2025 | Betrieb | anwesend 07:48',
  'Do | 16.01.2025 | Betrieb | anwesend 07:48',
  'Fr | 17.01.2025 | Betrieb | anwesend 07:48',
  'Sa | 18.01.2025 | Schule | anwesend 04:00',
  'So | 19.01.2025 | Schule | anwesend 04:00'
].join('\n');
const r = p.parse([page]);
console.assert(r.wochen[0].status === 'genehmigt',        'Status genehmigt erwartet');
console.assert(r.wochen[0].tage[0].ort === 'Betrieb/Schule', 'Mo: Betrieb/Schule erwartet');
console.assert(r.wochen[0].tage[0].stunden === 8,         'Mo: 8h erwartet, ist: ' + r.wochen[0].tage[0].stunden);
console.assert(r.wochen[0].tage[1].anwesenheit === 'Feiertag', 'Di: Feiertag erwartet');
console.assert(r.wochen[0].tage.length === 5,             '5 Tage (Sa/So gefiltert), ist: ' + r.wochen[0].tage.length);
console.log('✓ Merge + 7-Tage + Status bestanden');
"
```

  Erwartet: `✓ Merge + 7-Tage + Status bestanden`

- [ ] **Schritt 4: Commit**

```
git add app/js/ihk-parser.js
git commit -m "feat: add ihk-parser.js — IHK Ausbildungsnachweis PDF parser"
```

---

## Task 2: `ihk-import.js` erstellen — Teil 1: Widget + pdf.js-Extraktion

**Files:**
- Create: `app/js/ihk-import.js`

- [ ] **Schritt 1: Datei anlegen (Widget + Extraktion)**

  Erstelle `app/js/ihk-import.js`:

```js
/* ===================================================================
   IHK-IMPORT.JS
   UI-Glue für den IHK-Ausbildungsnachweis-Import im Profil:
   - rendert die Profil-Sektion (Upload-Widget)
   - liest das PDF im Browser seitenweise mit pdf.js aus
   - ruft IhkParser.parse(pages[])
   - zeigt eine Wochen-Vorschau und übernimmt via DB.saveWoche.
   Hält profil.js schlank: dort nur renderSection()/bind() aufrufen.
   =================================================================== */
const IhkImport = (() => {
  'use strict';

  const WORKER_SRC = 'js/vendor/pdf.worker.min.js';
  const STATUS_LABELS = {
    'offen':       'Offen',
    'freigegeben': 'Freigegeben',
    'genehmigt':   'Genehmigt',
    'abgelehnt':   'Abgelehnt',
  };

  let _user   = null;
  let _parsed = null;  // { wochen, warnungen } von IhkParser
  let _infos  = {};    // key "${year}-${kw}" → { readonly, exists }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── 1) Profil-Sektion ──────────────────────────────────────────
  function renderSection(user) {
    if (!user || user.role !== 'azubi') return '';
    return `
      <details class="profil-section" id="ihkSection">
        <summary class="profil-section__header">
          <div class="profil-section__icon">
            ${Icon('upload')}
          </div>
          <div class="profil-section__title">IHK-Berichtsheft importieren</div>
        </summary>
        <div class="profil-section__body-wrap"><div class="profil-section__body">
          <p class="ztn-intro">
            Lade deinen <strong>IHK-Ausbildungsnachweis</strong> als PDF hoch – alle erkannten
            Wochen werden mit Anwesenheit, Ort und Stunden ins Berichtsheft übernommen.
            Deine Tätigkeitsbeschreibungen ergänzt du wie gewohnt selbst.
          </p>
          <div class="ztn-drop" id="ihkDrop">
            ${Icon('upload', { cls: 'ztn-drop__icon' })}
            <div class="ztn-drop__text">
              <span>PDF hierher ziehen oder</span>
            </div>
            <button class="btn btn-outline btn-sm" id="ihkUploadBtn" type="button">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4"/></svg>
              IHK-PDF hochladen
            </button>
            <input type="file" id="ihkFileInput" accept="application/pdf,.pdf" hidden>
            <div class="ztn-drop__hint">Nur PDF-Dateien · Die Datei bleibt lokal auf Ihrem Rechner.</div>
          </div>
        </div></div>
      </details>
    `;
  }

  // Modal-Hülle direkt an <body> hängen (wie ztnImportModal), damit
  // der Glass-Container des Seitenbereichs das Zentrieren nicht verhindert.
  function buildModal() {
    return `
      <div class="modal-overlay" id="ihkImportModal" role="dialog" aria-modal="true" aria-label="IHK-Berichtsheft übernehmen">
        <div class="modal ztn-modal">
          <div class="modal__header">
            <span class="modal__title">IHK-Berichtsheft übernehmen</span>
            <button class="modal__close" data-modal-close aria-label="Schließen">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal__body"  id="ihkImportBody"></div>
          <div class="modal__footer" id="ihkImportFooter"></div>
        </div>
      </div>
    `;
  }

  // ── 2) Events binden ───────────────────────────────────────────
  function bind(user) {
    _user = user;
    const section = document.getElementById('ihkSection');
    if (!section) return;

    if (!document.getElementById('ihkImportModal')) {
      document.body.insertAdjacentHTML('beforeend', buildModal());
    }

    const input = document.getElementById('ihkFileInput');
    const btn   = document.getElementById('ihkUploadBtn');
    const drop  = document.getElementById('ihkDrop');

    btn?.addEventListener('click', () => input?.click());
    input?.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (file) handleFile(file, btn);
      input.value = '';
    });

    if (drop) {
      ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => {
        e.preventDefault(); e.stopPropagation(); drop.classList.add('ztn-drop--over');
      }));
      ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => {
        e.preventDefault(); e.stopPropagation(); drop.classList.remove('ztn-drop--over');
      }));
      drop.addEventListener('drop', e => {
        const file = e.dataTransfer?.files && e.dataTransfer.files[0];
        if (file) handleFile(file, btn);
      });
    }
  }

  // ── 3) Datei verarbeiten ───────────────────────────────────────
  async function handleFile(file, btn) {
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      Toast.error('Falscher Dateityp', 'Bitte lade die PDF-Datei deines IHK-Ausbildungsnachweises hoch.');
      return;
    }
    if (typeof pdfjsLib === 'undefined') {
      Toast.error('PDF-Reader fehlt', 'Die PDF-Bibliothek konnte nicht geladen werden.');
      return;
    }

    const origLabel = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Wird gelesen…'; }

    try {
      const pages  = await extractPages(await file.arrayBuffer());
      const parsed = IhkParser.parse(pages);

      if (!parsed.wochen.length) {
        Toast.error(
          'Kein gültiger IHK-Nachweis',
          'In der Datei konnten keine Ausbildungswochen erkannt werden. ' +
          'Stammt das PDF aus dem IHK-Ausbildungsnachweis-Portal?'
        );
        return;
      }

      _parsed = parsed;
      await openPreview();
    } catch (err) {
      console.error('[IhkImport] Fehler:', err);
      Toast.error('Datei konnte nicht gelesen werden', 'Die PDF-Datei ist beschädigt oder hat ein unerwartetes Format.');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = origLabel; }
    }
  }

  // Seitenweise pdf.js-Extraktion: eine Seite = eine Ausbildungswoche.
  async function extractPages(arrayBuffer) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC;
    const pdf   = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page    = await pdf.getPage(p);
      const content = await page.getTextContent();
      pages.push(itemsToText(content.items));
    }
    return pages;
  }

  // Items nach y-Koordinate zu Zeilen gruppieren, dann nach x sortieren.
  // Identisches Verfahren wie in zeitnachweis-upload.js.
  function itemsToText(items) {
    const rows = [];
    items.forEach(it => {
      if (!it.str || !it.str.trim()) return;
      const y = Math.round(it.transform[5]);
      let row = rows.find(r => Math.abs(r.y - y) <= 3);
      if (!row) { row = { y, cells: [] }; rows.push(row); }
      row.cells.push({ x: it.transform[4], str: it.str });
    });
    rows.sort((a, b) => b.y - a.y); // oben → unten
    return rows
      .map(r => r.cells.sort((a, b) => a.x - b.x).map(c => c.str).join(' ').replace(/\s+/g, ' ').trim())
      .join('\n');
  }

  // PLATZHALTER für Tasks 3 und 4 (openPreview + applySelection)
  // Diese Funktionen werden in den nächsten Tasks ergänzt.
  async function openPreview() {}

  return { renderSection, bind };
})();
```

- [ ] **Schritt 2: Commit (Zwischenstand)**

```
git add app/js/ihk-import.js
git commit -m "feat: add ihk-import.js skeleton — widget, pdf.js extraction"
```

---

## Task 3: `ihk-import.js` — Preview-Modal (Wochen-Tabelle)

**Files:**
- Modify: `app/js/ihk-import.js`

- [ ] **Schritt 1: `openPreview`, `renderPreviewBody`, `renderTable`, `wireChecks`, `updateConfirmCount` einfügen**

  Ersetze die Platzhalter-`openPreview`-Funktion und das `return`-Statement am Ende durch:

```js
  // ── 4) Vorschau-Dialog ─────────────────────────────────────────
  async function openPreview() {
    // Bestehende Wochen-Status aus DB vorab laden (für Schreibschutz-Check)
    _infos = {};
    for (const w of _parsed.wochen) {
      const existing = await DB.getWoche(_user.id, w.kw, w.year);
      _infos[`${w.year}-${w.kw}`] = {
        readonly: !!(existing && (existing.status === 'freigegeben' || existing.status === 'genehmigt')),
        exists:   !!existing,
      };
    }
    renderPreviewBody();
    renderPreviewFooter();
    Modal.open('ihkImportModal');
  }

  function renderPreviewBody() {
    const body = document.getElementById('ihkImportBody');
    if (!body) return;

    const total    = _parsed.wochen.length;
    const warnings = _parsed.warnungen;

    body.innerHTML = `
      <div class="ztn-preview">
        <div class="ztn-meta">
          <div class="ztn-meta__range">
            <strong>${total}</strong> ${total === 1 ? 'Woche' : 'Wochen'} erkannt
          </div>
          ${warnings.length
            ? `<div class="ztn-meta__note">
                 <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                 ${warnings.length} Zeile${warnings.length > 1 ? 'n' : ''} nicht eindeutig erkannt.
               </div>`
            : ''}
        </div>
        <div class="ztn-table-wrap" id="ihkTableWrap">
          ${renderTable()}
        </div>
      </div>
    `;
    wireChecks();
  }

  function renderTable() {
    const rows = _parsed.wochen.map((w, idx) => {
      const key      = `${w.year}-${w.kw}`;
      const info     = _infos[key] || {};
      const disabled = info.readonly;

      const hint = disabled
        ? '<span class="ztn-hint ztn-hint--ro">bereits eingereicht/genehmigt</span>'
        : (info.exists
            ? '<span class="ztn-hint ztn-hint--belegt">wird überschrieben</span>'
            : '<span class="ztn-hint ztn-hint--neu">neu</span>');

      // Warnungen die Tage dieser Woche betreffen
      const warnCount = _parsed.warnungen.filter(wn =>
        w.tage.some(t => wn.includes(t.datum))
      ).length;
      const warnHint = warnCount
        ? `<br><span class="ztn-hint ztn-hint--warn">⚠ ${warnCount} Tag${warnCount > 1 ? 'e' : ''} nicht erkannt</span>`
        : '';

      return `
        <tr class="ztn-row${disabled ? ' ztn-row--disabled' : ''}">
          <td class="ztn-row__check">
            <input type="checkbox" class="ztn-check" data-idx="${idx}"
              ${disabled ? 'disabled' : 'checked'}>
          </td>
          <td class="ztn-row__date"><strong>KW ${esc(w.kw)}</strong> · ${esc(w.year)}</td>
          <td class="ztn-row__date">${DateUtil.formatDateShort(w.startDate)} – ${DateUtil.formatDateShort(w.endDate)}</td>
          <td><span class="ztn-anw" data-anw="${esc(w.status)}">${esc(STATUS_LABELS[w.status] || w.status)}</span></td>
          <td class="ztn-row__std">${w.tage.length} Werktag${w.tage.length !== 1 ? 'e' : ''}</td>
          <td class="ztn-row__hint">${hint}${warnHint}</td>
        </tr>`;
    }).join('');

    return `
      <table class="ztn-table">
        <thead>
          <tr><th></th><th>KW</th><th>Zeitraum</th><th>IHK-Status</th><th>Tage</th><th></th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function wireChecks() {
    document.querySelectorAll('#ihkTableWrap .ztn-check').forEach(cb => {
      cb.addEventListener('change', updateConfirmCount);
    });
  }

  function updateConfirmCount() {
    const btn = document.getElementById('ihkConfirmBtn');
    if (!btn) return;
    const n = document.querySelectorAll('#ihkTableWrap .ztn-check:checked').length;
    btn.textContent = n > 0 ? `${n} ${n === 1 ? 'Woche' : 'Wochen'} übernehmen` : 'Wochen übernehmen';
    btn.disabled    = n === 0;
  }

  // Platzhalter für Task 4
  function renderPreviewFooter() {}

  return { renderSection, bind };
```

- [ ] **Schritt 2: Commit**

```
git add app/js/ihk-import.js
git commit -m "feat: ihk-import — preview modal with weeks table"
```

---

## Task 4: `ihk-import.js` — Bestätigen + DB-Schreiben + Erfolgsscreen

**Files:**
- Modify: `app/js/ihk-import.js`

- [ ] **Schritt 1: `renderPreviewFooter`, `applySelection`, `renderSuccess` einfügen**

  Ersetze die Platzhalter-`renderPreviewFooter`-Funktion und das `return`-Statement durch:

```js
  function renderPreviewFooter() {
    const footer = document.getElementById('ihkImportFooter');
    if (!footer) return;
    footer.innerHTML = `
      <button class="btn btn-ghost" data-modal-close type="button">Abbrechen</button>
      <button class="btn btn-primary" id="ihkConfirmBtn" type="button">Wochen übernehmen</button>
    `;
    footer.querySelector('[data-modal-close]')?.addEventListener('click', () => Modal.closeAll());
    footer.querySelector('#ihkConfirmBtn')?.addEventListener('click', applySelection);
    updateConfirmCount();
  }

  // ── 5) Übernahme ───────────────────────────────────────────────
  async function applySelection() {
    const selected = [];
    document.querySelectorAll('#ihkTableWrap .ztn-check:checked').forEach(cb => {
      const w = _parsed.wochen[parseInt(cb.dataset.idx, 10)];
      if (w) selected.push(w);
    });
    if (!selected.length) return;

    const summary = { uebernommen: 0, uebersprungen: 0, betroffeneWochen: [] };

    for (const pw of selected) {
      const existing = await DB.getWoche(_user.id, pw.kw, pw.year);

      // Doppelte Schreibschutz-Prüfung (Checkbox-State könnte manipuliert sein)
      if (existing && (existing.status === 'freigegeben' || existing.status === 'genehmigt')) {
        summary.uebersprungen++;
        continue;
      }

      const woche = existing || {
        azubiId:       _user.id,
        kw:            pw.kw,
        year:          pw.year,
        startDate:     pw.startDate,
        endDate:       pw.endDate,
        status:        pw.status,
        gesamtstunden: 0,
        tage:          [],
      };

      woche.status = pw.status; // IHK-Status übernehmen

      if (!Array.isArray(woche.tage)) woche.tage = [];

      // Anwesenheit/Ort/Stunden schreiben; bestehende eintrag-Texte erhalten
      pw.tage.forEach(pt => {
        let tag = woche.tage.find(t => t.datum === pt.datum);
        if (!tag) {
          tag = { datum: pt.datum, anwesenheit: '', ort: '', stunden: 0, eintrag: '' };
          woche.tage.push(tag);
        }
        tag.anwesenheit = pt.anwesenheit;
        tag.ort         = pt.ort;
        tag.stunden     = pt.stunden;
      });

      woche.gesamtstunden = woche.tage.reduce((s, t) => s + (t.stunden || 0), 0);
      await DB.saveWoche(woche);
      summary.uebernommen++;
      summary.betroffeneWochen.push({ kw: pw.kw, year: pw.year });
    }

    renderSuccess(summary);
  }

  function renderSuccess(summary) {
    const body   = document.getElementById('ihkImportBody');
    const footer = document.getElementById('ihkImportFooter');

    const sorted     = summary.betroffeneWochen.slice().sort((a, b) => a.year - b.year || a.kw - b.kw);
    const wochenTxt  = sorted.length ? sorted.map(w => 'KW ' + w.kw).join(', ') : '–';
    const first      = sorted[0];

    if (body) {
      body.innerHTML = `
        <div class="ztn-success">
          <div class="ztn-success__icon">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div class="ztn-success__title">${summary.uebernommen} ${summary.uebernommen === 1 ? 'Woche' : 'Wochen'} übernommen</div>
          <p class="ztn-success__text">
            Aktualisierte Wochen: <strong>${wochenTxt}</strong>.
            ${summary.uebersprungen
              ? `<br>${summary.uebersprungen} ${summary.uebersprungen === 1 ? 'Woche' : 'Wochen'} übersprungen (bereits genehmigt/freigegeben).`
              : ''}
            <br>Die Einträge findest du in der Wochenansicht.
          </p>
        </div>
      `;
    }

    if (footer) {
      footer.innerHTML = `
        <button class="btn btn-ghost" data-modal-close type="button">Schließen</button>
        ${first ? `<button class="btn btn-primary" id="ihkGotoBtn" type="button">Zur Wochenansicht</button>` : ''}
      `;
      footer.querySelector('[data-modal-close]')?.addEventListener('click', () => Modal.closeAll());
      footer.querySelector('#ihkGotoBtn')?.addEventListener('click', () => {
        sessionStorage.setItem('gotoKW',   String(first.kw));
        sessionStorage.setItem('gotoYear', String(first.year));
        window.location.href = 'wochenansicht.html';
      });
    }

    Toast.success('Übernommen', `${summary.uebernommen} ${summary.uebernommen === 1 ? 'Woche' : 'Wochen'} ins Berichtsheft geschrieben.`);
  }

  return { renderSection, bind };
```

- [ ] **Schritt 2: Commit**

```
git add app/js/ihk-import.js
git commit -m "feat: ihk-import — confirm, DB write, success screen"
```

---

## Task 5: `profil.html` + `profil.js` — Integration + Browser-Test

**Files:**
- Modify: `app/profil.html`
- Modify: `app/js/profil.js`

- [ ] **Schritt 1: Script-Tags in `profil.html` einfügen**

  In [app/profil.html](app/profil.html) nach dem `zeitnachweis-upload.js`-Tag (Zeile 34) einfügen:

```html
<!-- IHK-Berichtsheft-Import -->
<script src="js/ihk-parser.js"></script>
<script src="js/ihk-import.js"></script>
```

  Der `<script>`-Block am Ende der Datei soll danach so aussehen:

```html
<script src="js/api.js"></script>
<script src="js/icons.js"></script>
<script src="js/topbar-ds.js"></script>
<script src="js/app.js"></script>
<script src="js/sidebar.js"></script>
<!-- Zeitnachweis-Import (SAP ESS PDF → Berichtsheft) -->
<script src="js/vendor/pdf.min.js"></script>
<script src="js/zeitnachweis-parser.js"></script>
<script src="js/zeitnachweis-upload.js"></script>
<!-- IHK-Berichtsheft-Import -->
<script src="js/ihk-parser.js"></script>
<script src="js/ihk-import.js"></script>
<script src="js/profil.js"></script>
```

- [ ] **Schritt 2: `IhkImport.renderSection` + `IhkImport.bind` in `profil.js` einfügen**

  In [app/js/profil.js](app/js/profil.js) die Zeile `${ZeitnachweisUpload.renderSection(user)}` suchen und direkt danach `${IhkImport.renderSection(user)}` einfügen:

```js
          ${ZeitnachweisUpload.renderSection(user)}
          ${IhkImport.renderSection(user)}
          ${buildIHKDaten()}
```

  Dann die Zeile `ZeitnachweisUpload.bind(user);` suchen und direkt danach `IhkImport.bind(user);` einfügen:

```js
    // Zeitnachweis-Import-Sektion verdrahten (nur für Azubis vorhanden)
    ZeitnachweisUpload.bind(user);
    IhkImport.bind(user);
```

- [ ] **Schritt 3: Browser-Smoke-Test**

  1. Server starten (`node backend/server.js` oder `npm start` — je nach Projektsetup)
  2. Browser öffnen: `http://localhost:3000/app/profil.html` (als Azubi eingeloggt)
  3. Prüfen: Auf der Profil-Seite erscheint unter dem SAP-Zeitnachweis-Import ein neuer Aufklappbereich "IHK-Berichtsheft importieren" mit Upload-Button
  4. Klick auf "IHK-PDF hochladen" → Datei-Dialog öffnet sich
  5. Eine der IHK-PDF-Beispieldateien aus `Berichtsheft exporte/` auswählen
  6. Erwartetes Verhalten: Lade-Anzeige → Modal erscheint mit Wochen-Tabelle, alle Wochen mit Checkbox angehakt
  7. Auf "N Wochen übernehmen" klicken
  8. Erwartetes Verhalten: Erfolgsscreen mit Liste der KWs + Toast "Übernommen"
  9. "Zur Wochenansicht" klicken → navigiert zur Wochenansicht der ersten importierten Woche
  10. In der Wochenansicht prüfen: Anwesenheit, Ort und Stunden korrekt eingetragen

- [ ] **Schritt 4: Commit**

```
git add app/profil.html app/js/profil.js
git commit -m "feat: wire IHK import into profil page"
```

---

## Selbstprüfung gegen Spec

| Spec-Anforderung | Task |
|---|---|
| PDF-Import auf Profil-Seite | Task 5 |
| Client-seitig (kein Backend) | Task 1–4 (api.js-Methoden verwendet) |
| Wöchentliches Format | Task 1 (parsePage, keine täglichen eintrag-Texte) |
| Betrieb/Schule-Merge → `ort: 'Betrieb/Schule'` | Task 1 (rawByDatum-Merge) |
| Sa/So filtern (5-Tage + 7-Tage PDFs) | Task 1 (WEEKEND_RE) |
| Qualifikationen überspringen | Task 1 (QUALI_RE) |
| IHK-Status → App-Status Mapping | Task 1 (mapStatus) |
| Immer überschreiben | Task 4 (applySelection, kein empty-Mode) |
| Freigegeben/Genehmigt nicht überschreiben | Task 3 (_infos readonly) + Task 4 (Schreibschutz-Check) |
| Vorschau auf Wochen-Ebene | Task 3 (renderTable) |
| `eintrag`-Texte erhalten | Task 4 (nur anwesenheit/ort/stunden schreiben) |
| IHK-Status in App-Status übernehmen | Task 4 (woche.status = pw.status) |
| Drag-Drop | Task 2 (bind) |
| Erfolgsscreen + Wochenansicht-Link | Task 4 (renderSuccess) |
