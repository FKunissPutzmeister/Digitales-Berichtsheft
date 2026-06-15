/* ===================================================================
   ZEITNACHWEIS-UPLOAD.JS
   UI-Glue für den Zeitnachweis-Import im Profil:
   - rendert die Profil-Sektion (Tutorial + Upload-Button) und die
     Vorschau-Modal-Hülle,
   - liest das PDF im Browser mit pdf.js aus (verlässt nie den Rechner),
   - ruft den reinen Parser (zeitnachweis-parser.js),
   - zeigt die Vorschau und übernimmt die Auswahl via DB.applyZeitnachweis.
   Hält profil.js schlank: dort nur renderSection()/bind() aufrufen.
   =================================================================== */
const ZeitnachweisUpload = (() => {
  'use strict';

  // pdf.js-Worker liegt vendored neben der Library (kein CDN).
  const WORKER_SRC = 'js/vendor/pdf.worker.min.js';

  const WT = { MO: 'Mo', DI: 'Di', MI: 'Mi', DO: 'Do', FR: 'Fr', SA: 'Sa', SO: 'So' };

  // Zustand zwischen Vorschau-Renders (Toggle umschalten).
  let _user = null;
  let _parsed = null;
  let _workdays = [];   // gefilterte Werktage (ohne leere Wochenenden)
  let _mode = 'overwrite';
  // Bestehende Wochen des Azubis, einmal vor der Vorschau geladen. So muss
  // die Tabelle pro Zeile nicht erneut das (async) Backend abfragen –
  // getTagInfoSync arbeitet rein lokal auf diesem Cache.
  let _wochen = [];

  // ── kleine Helfer ──────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function decToTime(dec) {
    const mins = Math.round((dec || 0) * 60);
    return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
  }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // ── 1) Profil-Sektion + Modal-Hülle ────────────────────────────
  function renderSection(user) {
    if (!user || user.role !== 'azubi') return '';

    const img = name => `assets/zeitnachweis/${name}`;

    return `
      <details class="profil-section" id="ztnSection">
        <summary class="profil-section__header">
          <div class="profil-section__icon">
            ${Icon('upload')}
          </div>
          <div class="profil-section__title">Zeitnachweis-Import</div>
        </summary>
        <div class="profil-section__body-wrap"><div class="profil-section__body">
          <p class="ztn-intro">
            Lade deinen <strong>Zeitnachweis aus SAP&nbsp;ESS</strong> als PDF hoch – die
            erkannten Arbeitszeiten werden dir als Vorschau angezeigt und auf Wunsch
            automatisch ins Berichtsheft (Anwesenheit, Ort, Stunden) übernommen.
            Deine Tätigkeitsbeschreibungen füllst du wie gewohnt selbst aus.
          </p>

          <details class="ztn-tutorial">
            <summary class="ztn-tutorial__summary">
              ${Icon('question', { size: 16 })}
              Wo finde ich die richtige Datei?
            </summary>
            <div class="ztn-tutorial__body">
              <ol class="ztn-steps">
                <li>
                  <div class="ztn-step__text">
                    <strong>SAP&nbsp;ESS öffnen</strong> → Kachel <em>„Meine Zeitbuchungen"</em>,
                    Reiter <em>„Schnellerfassung"</em>. Unten rechts auf
                    <em>„Zeitnachweis herunterladen"</em> klicken. Im Dialog
                    <em>„Anderer Zeitraum"</em> wählen und den gewünschten Zeitraum
                    (z.&nbsp;B. den ganzen Monat) eingeben.
                  </div>
                  <img class="ztn-step__img" src="${img('zeitraum.png')}" alt="SAP ESS: Zeitraum für Zeitnachweis auswählen" loading="lazy">
                </li>
                <li>
                  <div class="ztn-step__text">
                    Erneut auf <em>„Zeitnachweis herunterladen"</em> klicken – der
                    Zeitnachweis wird als PDF erzeugt.
                  </div>
                  <img class="ztn-step__img" src="${img('download.png')}" alt="SAP ESS: Zeitnachweis herunterladen" loading="lazy">
                </li>
                <li>
                  <div class="ztn-step__text">
                    Das PDF öffnet sich im Browser. Über das <strong>Speichern-Symbol</strong>
                    (Diskette) die Datei lokal abspeichern – diese gespeicherte Datei lädst
                    du hier hoch.
                  </div>
                  <img class="ztn-step__img" src="${img('speichern.png')}" alt="PDF im Browser über das Speichern-Symbol sichern" loading="lazy">
                </li>
              </ol>
            </div>
          </details>

          <div class="ztn-drop" id="ztnDrop">
            ${Icon('upload', { cls: 'ztn-drop__icon' })}
            <div class="ztn-drop__text">
              <span>PDF hierher ziehen oder</span>
            </div>
            <button class="btn btn-outline btn-sm" id="ztnUploadBtn" type="button">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4"/></svg>
              Zeitnachweis hochladen
            </button>
            <input type="file" id="ztnFileInput" accept="application/pdf,.pdf" hidden>
            <div class="ztn-drop__hint">Nur PDF-Dateien · Die Datei bleibt lokal auf deinem Rechner.</div>
          </div>
        </div></div>
      </details>
    `;
  }

  // Modal-Hülle separat — wird in bind() direkt an <body> gehängt. Sonst
  // läge sie im Seiteninhalt, dessen Ambient-Backdrop (body::before/::after
  // mit filter:blur) bzw. Glass-Container das position:fixed-Zentrieren
  // zum Viewport verhindern würde → Dialog klebte am oberen Rand.
  function buildModal() {
    return `
      <div class="modal-overlay" id="ztnImportModal" role="dialog" aria-modal="true" aria-label="Zeitnachweis übernehmen">
        <div class="modal ztn-modal">
          <div class="modal__header">
            <span class="modal__title">Zeitnachweis übernehmen</span>
            <button class="modal__close" data-modal-close aria-label="Schließen">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal__body" id="ztnImportBody"></div>
          <div class="modal__footer" id="ztnImportFooter"></div>
        </div>
      </div>
    `;
  }

  // ── 2) Events binden ───────────────────────────────────────────
  function bind(user) {
    _user = user;
    const section = document.getElementById('ztnSection');
    if (!section) return; // nicht-azubi: keine Sektion

    // Vorschau-Modal einmalig direkt an <body> hängen (siehe buildModal).
    if (!document.getElementById('ztnImportModal')) {
      document.body.insertAdjacentHTML('beforeend', buildModal());
    }

    const input = document.getElementById('ztnFileInput');
    const btn   = document.getElementById('ztnUploadBtn');
    const drop  = document.getElementById('ztnDrop');

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
      Toast.error('Falscher Dateityp', 'Bitte lade die PDF-Datei deines Zeitnachweises hoch.');
      return;
    }
    if (typeof pdfjsLib === 'undefined') {
      Toast.error('PDF-Reader fehlt', 'Die PDF-Bibliothek konnte nicht geladen werden.');
      return;
    }

    const origLabel = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Wird gelesen…'; }

    try {
      const text = await extractText(await file.arrayBuffer());
      const parsed = ZeitnachweisParser.parse(text);

      const erkannt = parsed.tage.filter(t => t.datum && t.anwesenheit !== 'Wochenende');
      if (!erkannt.length) {
        Toast.error('Kein gültiger Zeitnachweis', 'In der Datei konnten keine Tageszeiten erkannt werden. Stammt das PDF aus SAP ESS („Einzelergebnisse pro Tag")?');
        return;
      }

      // Bestehende Wochen einmal laden, damit die Vorschau den Bearbeitungs-
      // status (readonly/belegt) ohne Pro-Zeilen-Backend-Aufruf bestimmt.
      _wochen = await DB.getWochenFuerAzubi(_user.id);

      _parsed = parsed;
      _workdays = erkannt;
      _mode = 'overwrite';
      openPreview();
    } catch (err) {
      console.error('[Zeitnachweis] Fehler beim Lesen:', err);
      Toast.error('Datei konnte nicht gelesen werden', 'Die PDF-Datei ist beschädigt oder hat ein unerwartetes Format.');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = origLabel; }
    }
  }

  // pdf.js-Textextraktion: Items zeilenweise (nach y) gruppieren,
  // innerhalb der Zeile nach x sortieren → liest die Tabelle korrekt aus.
  async function extractText(arrayBuffer) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC;
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    let out = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      out += itemsToText(content.items) + '\n';
    }
    return out;
  }

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

  // ── 4) Vorschau-Dialog ─────────────────────────────────────────
  function openPreview() {
    renderPreviewBody();
    renderPreviewFooter();
    Modal.open('ztnImportModal');
  }

  function renderPreviewBody() {
    const body = document.getElementById('ztnImportBody');
    if (!body) return;

    const zr = _parsed.zeitraum;
    const stichtagNote = (_parsed.stichtag && (!zr || _parsed.stichtag < zr.bis))
      ? `<div class="ztn-meta__note">
           <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:15px;height:15px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
           Im PDF waren nur Daten bis zum <strong>${DateUtil.formatDate(_parsed.stichtag)}</strong> ausgewertet – spätere Tage fehlen.
         </div>`
      : '';

    body.innerHTML = `
      <div class="ztn-preview">
        <div class="ztn-meta">
          <div class="ztn-meta__range">
            ${zr ? `Zeitraum <strong>${DateUtil.formatDate(zr.von)} – ${DateUtil.formatDate(zr.bis)}</strong> · ` : ''}
            <strong>${_workdays.length}</strong> Tage erkannt
          </div>
          ${stichtagNote}
        </div>

        <div class="ztn-modebar">
          <span class="ztn-modebar__label">Bestehende Einträge:</span>
          <div class="ztn-toggle" role="group" aria-label="Übernahme-Modus">
            <button type="button" class="ztn-toggle__btn ${_mode === 'overwrite' ? 'active' : ''}" data-mode="overwrite">Alle überschreiben</button>
            <button type="button" class="ztn-toggle__btn ${_mode === 'empty' ? 'active' : ''}" data-mode="empty">Nur leere Tage füllen</button>
          </div>
        </div>

        <div class="ztn-table-wrap" id="ztnTableWrap">
          ${renderTable()}
        </div>
      </div>
    `;

    // Toggle umschalten → Tabelle + Checkbox-Defaults neu aufbauen
    body.querySelectorAll('.ztn-toggle__btn').forEach(b => {
      b.addEventListener('click', () => {
        _mode = b.dataset.mode;
        body.querySelectorAll('.ztn-toggle__btn').forEach(x => x.classList.toggle('active', x === b));
        document.getElementById('ztnTableWrap').innerHTML = renderTable();
        wireRowChecks();
        updateConfirmCount();
      });
    });

    wireRowChecks();
  }

  function renderTable() {
    // Werktage nach KW gruppieren (Reihenfolge wie im PDF erhalten).
    const groups = [];
    _workdays.forEach((t, idx) => {
      const info = DB.getTagInfoSync(_wochen, t.datum);
      const key = `${info.year}-${info.kw}`;
      let g = groups.find(x => x.key === key);
      if (!g) { g = { key, kw: info.kw, year: info.year, readonly: info.readonly, rows: [] }; groups.push(g); }
      g.rows.push({ t, idx, info });
    });

    const rowsHtml = groups.map(g => {
      const head = `
        <tr class="ztn-group${g.readonly ? ' ztn-group--ro' : ''}">
          <td colspan="6">KW ${g.kw} · ${g.year}${g.readonly ? ' — bereits eingereicht, wird übersprungen' : ''}</td>
        </tr>`;
      const body = g.rows.map(({ t, idx, info }) => {
        const checked  = defaultChecked(info);
        const disabled = info.readonly;
        const hint = info.readonly
          ? '<span class="ztn-hint ztn-hint--ro">eingereicht</span>'
          : (info.belegt
              ? `<span class="ztn-hint ztn-hint--belegt">${_mode === 'empty' ? 'bereits ausgefüllt' : 'wird überschrieben'}</span>`
              : (info.exists ? '' : '<span class="ztn-hint ztn-hint--neu">neu</span>'));
        const eindeutigCls = t.eindeutig ? '' : ' ztn-row--unsicher';
        return `
          <tr class="ztn-row${disabled ? ' ztn-row--disabled' : ''}${eindeutigCls}">
            <td class="ztn-row__check">
              <input type="checkbox" class="ztn-check" data-idx="${idx}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
            </td>
            <td class="ztn-row__date">${DateUtil.formatDate(t.datum)} <span class="ztn-row__wt">${WT[t.wochentag] || ''}</span></td>
            <td><span class="ztn-anw" data-anw="${esc(t.anwesenheit)}">${esc(cap(t.anwesenheit) || '–')}</span></td>
            <td class="ztn-row__ort">${esc(t.ort || '–')}</td>
            <td class="ztn-row__std">${t.stunden > 0 ? decToTime(t.stunden) : '–'}</td>
            <td class="ztn-row__hint">${hint}</td>
          </tr>`;
      }).join('');
      return head + body;
    }).join('');

    return `
      <table class="ztn-table">
        <thead>
          <tr><th></th><th>Datum</th><th>Anwesenheit</th><th>Ort</th><th>Std.</th><th></th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;
  }

  function defaultChecked(info) {
    if (info.readonly) return false;
    if (info.belegt && _mode === 'empty') return false;
    return true;
  }

  function wireRowChecks() {
    document.querySelectorAll('#ztnTableWrap .ztn-check').forEach(cb => {
      cb.addEventListener('change', updateConfirmCount);
    });
  }

  function selectedTage() {
    const out = [];
    document.querySelectorAll('#ztnTableWrap .ztn-check:checked').forEach(cb => {
      const t = _workdays[parseInt(cb.dataset.idx, 10)];
      if (t) out.push({ datum: t.datum, anwesenheit: t.anwesenheit, ort: t.ort, stunden: t.stunden });
    });
    return out;
  }

  function updateConfirmCount() {
    const btn = document.getElementById('ztnConfirmBtn');
    if (!btn) return;
    const n = document.querySelectorAll('#ztnTableWrap .ztn-check:checked').length;
    btn.textContent = n > 0 ? `${n} ${n === 1 ? 'Tag' : 'Tage'} übernehmen` : 'Tage übernehmen';
    btn.disabled = n === 0;
  }

  function renderPreviewFooter() {
    const footer = document.getElementById('ztnImportFooter');
    if (!footer) return;
    footer.innerHTML = `
      <button class="btn btn-ghost" data-modal-close type="button">Abbrechen</button>
      <button class="btn btn-primary" id="ztnConfirmBtn" type="button">Tage übernehmen</button>
    `;
    footer.querySelector('[data-modal-close]')?.addEventListener('click', () => Modal.closeAll());
    footer.querySelector('#ztnConfirmBtn')?.addEventListener('click', applySelection);
    updateConfirmCount();
  }

  // ── 5) Übernahme + Erfolg ──────────────────────────────────────
  async function applySelection() {
    const tage = selectedTage();
    if (!tage.length) return;
    const btn = document.getElementById('ztnConfirmBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Wird übernommen…'; }
    try {
      const summary = await DB.applyZeitnachweis(_user.id, tage);
      renderSuccess(summary);
    } catch (err) {
      console.error('[Zeitnachweis] Übernahme fehlgeschlagen:', err);
      Toast.error('Übernahme fehlgeschlagen', err.message || 'Die Tage konnten nicht gespeichert werden.');
      if (btn) { btn.disabled = false; updateConfirmCount(); }
    }
  }

  function renderSuccess(summary) {
    const body   = document.getElementById('ztnImportBody');
    const footer = document.getElementById('ztnImportFooter');

    const wochenTxt = summary.betroffeneWochen.length
      ? summary.betroffeneWochen
          .slice().sort((a, b) => a.year - b.year || a.kw - b.kw)
          .map(w => 'KW ' + w.kw).join(', ')
      : '–';

    if (body) {
      body.innerHTML = `
        <div class="ztn-success">
          <div class="ztn-success__icon">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          </div>
          <div class="ztn-success__title">${summary.uebernommen} ${summary.uebernommen === 1 ? 'Tag' : 'Tage'} übernommen</div>
          <p class="ztn-success__text">
            Aktualisierte Wochen: <strong>${wochenTxt}</strong>.
            ${summary.uebersprungenReadonly ? `<br>${summary.uebersprungenReadonly} ${summary.uebersprungenReadonly === 1 ? 'Tag' : 'Tage'} übersprungen, da die Woche bereits eingereicht/genehmigt ist.` : ''}
            <br>Die Einträge findest du in der Wochenansicht – die Tätigkeitsbeschreibungen ergänzt du dort wie gewohnt.
          </p>
        </div>
      `;
    }
    if (footer) {
      const first = summary.betroffeneWochen.slice().sort((a, b) => a.year - b.year || a.kw - b.kw)[0];
      footer.innerHTML = `
        <button class="btn btn-ghost" data-modal-close type="button">Schließen</button>
        ${first ? `<button class="btn btn-primary" id="ztnGotoBtn" type="button">Zur Wochenansicht</button>` : ''}
      `;
      footer.querySelector('[data-modal-close]')?.addEventListener('click', () => Modal.closeAll());
      footer.querySelector('#ztnGotoBtn')?.addEventListener('click', () => {
        sessionStorage.setItem('gotoKW', String(first.kw));
        sessionStorage.setItem('gotoYear', String(first.year));
        window.location.href = 'wochenansicht.html';
      });
    }

    Toast.success('Übernommen', `${summary.uebernommen} ${summary.uebernommen === 1 ? 'Tag' : 'Tage'} ins Berichtsheft geschrieben.`);
  }

  return { renderSection, bind };
})();
