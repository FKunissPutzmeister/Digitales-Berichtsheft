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
    'erstgenehmigt': 'Erstgenehmigt',
    'genehmigt':   'Genehmigt',
    'abgelehnt':   'Abgelehnt',
  };

  let _user   = null;
  let _parsed = null;  // { wochen, warnungen } von IhkParser
  let _infos  = {};    // key "${year}-${kw}" → { readonly, exists }

  const esc = window.escapeHtml;

  // ── 1) Profil-Sektion ──────────────────────────────────────────
  function renderSection(user) {
    // Beide Berichtsformen werden unterstützt: wöchentlich (kaufmännische &
    // IT-Azubis) und täglich (technische Azubis, IHK-Export „auf Tagesbasis").
    // berichtTyp ist pro Azubi in der DB hinterlegt.
    if (!user || !user.istAzubi) return '';
    if (user.berichtTyp !== 'wöchentlich' && user.berichtTyp !== 'täglich') return '';
    const taeglich = user.berichtTyp === 'täglich';
    const img = name => `assets/ihk/${name}`;
    const introText = taeglich
      ? `Lade deinen <strong>IHK-Ausbildungsnachweis</strong> als PDF hoch – alle erkannten
         Tage werden mit Anwesenheit, Ort und der jeweiligen Tätigkeitsbeschreibung
         in die passenden Wochentage übernommen. Anwesende Tage werden dabei
         standardmäßig als Ganztag übernommen.`
      : `Lade deinen <strong>IHK-Ausbildungsnachweis</strong> als PDF hoch – alle erkannten
         Wochen werden mit Anwesenheit, Ort, Tagdauer und Tätigkeitsbeschreibungen
         (Betrieb, Schule, Unterweisung) ins Berichtsheft übernommen. Anwesende
         Tage werden dabei standardmäßig als Ganztag übernommen.`;
    return `
      <details class="profil-section" id="ihkSection">
        <summary class="profil-section__header">
          <div class="profil-section__icon">
            ${Icon('upload')}
          </div>
          <div class="profil-section__title">IHK-Berichtsheft importieren</div>
        </summary>
        <div class="profil-section__body-wrap"><div class="profil-section__body">
          <p class="ztn-intro">${introText}</p>

          <details class="ztn-tutorial">
            <summary class="ztn-tutorial__summary">
              ${Icon('question', { size: 16 })}
              Wie bekomme ich den IHK-Ausbildungsnachweis?
            </summary>
            <div class="ztn-tutorial__body">
              <ol class="ztn-steps">
                <li>
                  <div class="ztn-step__text">
                    <strong>IHK-Portal öffnen&nbsp;&amp; anmelden</strong> – Rufe das
                    IHK-Ausbildungsnachweis-Portal auf und melde dich mit deinen Zugangsdaten an.
                  </div>
                  <img class="ztn-step__img" src="${img('login.png')}" alt="IHK-Portal: Anmeldeseite" loading="lazy">
                </li>
                <li>
                  <div class="ztn-step__text">
                    In der <strong>Wochenansicht</strong> findest du oben rechts den Button
                    <em>„Berichtsheft exportieren&nbsp;(.pdf)"</em> – klicke darauf.
                  </div>
                  <img class="ztn-step__img" src="${img('exportieren.png')}" alt="Schaltfläche 'Berichtsheft exportieren' oben rechts" loading="lazy">
                </li>
                <li>
                  <div class="ztn-step__text">
                    Im Dialog hast du zwei Möglichkeiten:
                    <ul style="margin-top:6px;padding-left:18px">
                      <li><strong>„Berichtsheft exportieren"</strong> – exportiert alle Einträge des gesamten Ausbildungszeitraums.</li>
                      <li><strong>Zeitraum auswählen</strong> → <em>„Berichtsheft in Zeitraum exportieren"</em> – exportiert nur die Wochen im gewählten Zeitraum.</li>
                    </ul>
                  </div>
                  <img class="ztn-step__img" src="${img('export-dialog.png')}" alt="Export-Dialog: komplettes Berichtsheft oder Zeitraum wählen" loading="lazy">
                </li>
                <li>
                  <div class="ztn-step__text">
                    Die PDF öffnet sich im Browser. Klicke auf das <strong>Drucken-Symbol</strong>
                    in der Browser-Toolbar.
                  </div>
                  <img class="ztn-step__img" src="${img('drucken.png')}" alt="Browser-Toolbar: Drucken-Symbol anklicken" loading="lazy">
                </li>
                <li>
                  <div class="ztn-step__text">
                    Wähle als Drucker <em>„Als PDF speichern"</em> aus und klicke auf
                    <strong>„Speichern"</strong>. Wähle einen Speicherort auf deinem Rechner –
                    diese PDF-Datei lädst du hier hoch.
                  </div>
                  <img class="ztn-step__img" src="${img('als-pdf-speichern.png')}" alt="Druckdialog: Als PDF speichern auswählen" loading="lazy">
                </li>
              </ol>
            </div>
          </details>

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

  // Seitenweise pdf.js-Extraktion: getOperatorList() laedt Fonts (fuer echte
  // Schriftnamen) und liefert die Pfad-Ops (fuer Unterstreichungs-Erkennung).
  async function extractPages(arrayBuffer) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC;
    const pdf   = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const pages = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      // getOperatorList lädt die Fonts (für commonObjs-Namen) und liefert die
      // Pfad-Ops für die Unterstreichungs-Erkennung. Scheitert das für eine
      // einzelne Seite (z. B. defekte Seite), trotzdem weiterextrahieren –
      // Text ohne Formatierung ist besser als ein Totalabbruch des Imports.
      let underlines = [], grids = [];
      try {
        const opList = await page.getOperatorList();
        underlines = IhkParser.decodeUnderlineSegments(opList.fnArray, opList.argsArray, pdfjsLib.OPS);
        grids = IhkParser.detectTableGrids(
          IhkParser.decodeStrokedBoxes(opList.fnArray, opList.argsArray, pdfjsLib.OPS).concat(
            IhkParser.cellsFromLines(
              IhkParser.decodeStrokedLines(opList.fnArray, opList.argsArray, pdfjsLib.OPS))));
      } catch (e) {
        console.warn(`[IhkImport] getOperatorList Seite ${p} fehlgeschlagen:`, e);
      }
      const content = await page.getTextContent();
      pages.push(itemsToText(content.items, page, underlines, grids));
      page.cleanup();
    }
    return pages;
  }

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

  // ── 4) Vorschau-Dialog ─────────────────────────────────────────
  async function openPreview() {
    // Bestehende Wochen-Status aus DB vorab laden (für Schreibschutz-Check)
    _infos = {};
    for (const w of _parsed.wochen) {
      const existing = await DB.getWoche(_user.id, w.kw, w.year);
      _infos[`${w.year}-${w.kw}`] = {
        readonly: !!(existing && (existing.status === 'freigegeben' || existing.status === 'erstgenehmigt' || existing.status === 'genehmigt')),
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

      const hasText = w.modus === 'täglich'
        ? w.tage.some(t => t.eintragText && t.eintragText.trim())
        : !!(w.betriebText || w.schuleText || w.unterweisungText);
      const textHint = (!disabled && hasText)
        ? '<br><span class="ztn-hint ztn-hint--neu">+ Tätigkeitsbeschreibungen</span>'
        : '';

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
          <td class="ztn-row__hint">${hint}${textHint}${warnHint}</td>
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

  function renderPreviewFooter() {
    const footer = document.getElementById('ihkImportFooter');
    if (!footer) return;
    footer.innerHTML = `
      <button class="btn btn-ghost" data-modal-close type="button">Abbrechen</button>
      <button class="btn btn-primary" id="ihkConfirmBtn" type="button">Wochen übernehmen</button>
    `;
    footer.querySelector('[data-modal-close]')?.addEventListener('click', () => Modal.closeAll());
    footer.querySelector('#ihkConfirmBtn')?.addEventListener('click', async () => {
      const confirmBtn = footer.querySelector('#ihkConfirmBtn');
      const cancelBtn  = footer.querySelector('[data-modal-close]');
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<span class="spinner" style="width:15px;height:15px;border-width:2px;vertical-align:middle;margin-right:6px"></span>Wird übernommen…';
      }
      if (cancelBtn) cancelBtn.disabled = true;
      await applySelection();
    });
    updateConfirmCount();
  }

  // ── 5) Übernahme ───────────────────────────────────────────────

  // Wochenbasis: Textfelder auf Wochenebene, Tage tragen nur Anwesenheit/Ort.
  function applyWeekly(woche, pw) {
    woche.typ = 'wöchentlich';
    const hasSchule       = !!(pw.schuleText       && pw.schuleText.trim());
    const hasUnterweisung = !!(pw.unterweisungText && pw.unterweisungText.trim());
    woche.wochenOrt         = hasSchule ? 'betrieb_schule' : 'betrieb';
    woche.unterweisungAktiv = hasUnterweisung;
    if (pw.betriebText)      woche.betriebEintrag      = pw.betriebText;
    if (pw.schuleText)       woche.schuleEintrag       = pw.schuleText;
    if (pw.unterweisungText) woche.unterweisungEintrag = pw.unterweisungText;

    // Anwesenheit/Ort/Tagdauer schreiben; bestehende eintrag-Texte erhalten.
    // Exakte Stunden aus dem PDF werden NICHT übernommen (Tagdauer-Modell):
    // jeder anwesende Tag gilt standardmäßig als Ganztag.
    pw.tage.forEach(pt => {
      let tag = woche.tage.find(t => t.datum === pt.datum);
      if (!tag) {
        tag = { datum: pt.datum, anwesenheit: '', ort: '', tagdauer: 'ganztag', eintrag: '' };
        woche.tage.push(tag);
      }
      tag.anwesenheit = pt.anwesenheit;
      tag.ort         = pt.ort;
      tag.tagdauer    = 'ganztag';
    });
  }

  // Tagesbasis: Tätigkeitsbeschreibung steht PRO TAG. Sie wird in das zum Ort
  // passende Tagesfeld geschrieben (Schule → schuleEintrag, sonst betriebEintrag).
  // Anwesende Tage gelten standardmäßig als Ganztag.
  function applyDaily(woche, pw) {
    woche.typ = 'täglich';
    pw.tage.forEach(pt => {
      let tag = woche.tage.find(t => t.datum === pt.datum);
      if (!tag) {
        tag = {
          datum: pt.datum, anwesenheit: '', ort: '', tagdauer: 'ganztag',
          eintrag: '', betriebEintrag: '', schuleEintrag: '', unterweisungEintrag: '',
        };
        woche.tage.push(tag);
      }
      tag.anwesenheit = pt.anwesenheit;
      tag.ort         = pt.ort;
      tag.tagdauer    = 'ganztag';
      const text = (pt.eintragText || '').trim();
      if (text) {
        if (pt.ort === 'Schule') tag.schuleEintrag  = pt.eintragText;
        else                     tag.betriebEintrag = pt.eintragText;
      }
    });
  }

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
      if (existing && (existing.status === 'freigegeben' || existing.status === 'erstgenehmigt' || existing.status === 'genehmigt')) {
        summary.uebersprungen++;
        continue;
      }

      const woche = existing || {
        azubiId:       _user.id,
        kw:            pw.kw,
        year:          pw.year,
        startDate:     pw.startDate,
        endDate:       pw.endDate,
        status:        pw.status || 'offen',
        gesamtstunden: 0,
        tage:          [],
      };

      // Echten IHK-Status aus dem Import übernehmen (offen/freigegeben/
      // genehmigt/abgelehnt) statt hart 'genehmigt'. pw.status kommt aus
      // IhkParser (mapStatus → bereits eine App-Status-Konstante).
      woche.status = pw.status || 'offen';

      if (!Array.isArray(woche.tage)) woche.tage = [];

      if (pw.modus === 'täglich') applyDaily(woche, pw);
      else                        applyWeekly(woche, pw);

      // Wochensumme = Anzahl der Anwesenheitstage (Tagdauer-Modell), keine Stundensumme.
      woche.gesamtstunden = woche.tage.filter(t => t.anwesenheit === 'anwesend').length;
      await DB.saveWoche(woche);
      summary.uebernommen++;
      summary.betroffeneWochen.push({ kw: pw.kw, year: pw.year });
    }

    renderSuccess(summary);
  }

  function renderSuccess(summary) {
    const body   = document.getElementById('ihkImportBody');
    const footer = document.getElementById('ihkImportFooter');

    const sorted    = summary.betroffeneWochen.slice().sort((a, b) => a.year - b.year || a.kw - b.kw);
    const wochenTxt = sorted.length ? sorted.map(w => 'KW ' + w.kw).join(', ') : '–';
    const first     = sorted[0];

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
})();
