/* ===================================================================
   BERICHTSHEFTVERWALTUNG.JS
   =================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const user = initPage('nav-verwaltung', [{ label: 'Berichtsheftverwaltung', href: 'berichtsheftverwaltung.html' }]);
  if (!user) return;

  const main = document.getElementById('mainContent');

  let selectedAzubiId = user.role === 'azubi' ? user.id : DB.getAzubis()[0]?.id;
  let attachments = [];

  function render() {
    const isAusbilder = ['ausbilder', 'admin'].includes(user.role);
    const azubis = DB.getAzubis();
    const selectedAzubi = DB.getUser(selectedAzubiId);

    main.innerHTML = `
      <div class="page-header">
        <div class="page-header__left">
          <h1 class="page-title">Berichtsheftverwaltung</h1>
          <p class="page-subtitle">Export, Anhänge und Daten deines Berichtshefts.</p>
        </div>
      </div>

      ${isAusbilder && azubis.length > 1 ? `
      <div style="margin-bottom:var(--sp-5);display:flex;align-items:center;gap:var(--sp-3);flex-wrap:wrap">
        <label class="form-label" style="margin:0">Azubi:</label>
        <select class="form-control" id="azubiSelect" style="max-width:280px">
          ${azubis.map(a => `<option value="${a.id}" ${a.id === selectedAzubiId ? 'selected' : ''}>${a.name}</option>`).join('')}
        </select>
      </div>
      ` : ''}

      <div class="verwaltung-grid">

        <!-- Exportbereich -->
        <details class="verwaltung-panel" open>
          <summary class="verwaltung-panel__header">
            <div class="verwaltung-panel__icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            </div>
            <div class="verwaltung-panel__header-text">
              <div class="verwaltung-panel__title">Berichtsheft herunterladen</div>
              <div class="verwaltung-panel__desc">Exportiere Berichtseinträge als PDF innerhalb eines Zeitraums.</div>
            </div>
          </summary>
          <div class="verwaltung-panel__body-wrap"><div class="verwaltung-panel__body">
            <div class="date-range-row">
              <div class="form-group">
                <label class="form-label">Startdatum</label>
                <input type="date" class="form-control" id="exportVon"
                       value="${selectedAzubi?.ausbildungsBeginn || ''}">
              </div>
              <div class="form-group">
                <label class="form-label">Enddatum</label>
                <input type="date" class="form-control" id="exportBis"
                       value="${new Date().toISOString().split('T')[0]}">
              </div>
            </div>
            <div class="export-btns">
              <button class="export-btn" id="exportPdfBtn">
                <div class="export-btn__icon">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                </div>
                <div class="export-btn__text">
                  <span class="export-btn__label">Berichtsheft exportieren (.pdf)</span>
                  <span class="export-btn__desc">Ausgewählter Zeitraum als PDF</span>
                </div>
              </button>
              <button class="export-btn" id="exportAllPdfBtn">
                <div class="export-btn__icon">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div class="export-btn__text">
                  <span class="export-btn__label">Berichtsheftexport aller Einträge (.pdf)</span>
                  <span class="export-btn__desc">Gesamter Ausbildungszeitraum</span>
                </div>
              </button>
            </div>
          </div></div>
        </details>

        <!-- Anhänge -->
        <details class="verwaltung-panel" open>
          <summary class="verwaltung-panel__header">
            <div class="verwaltung-panel__icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </div>
            <div class="verwaltung-panel__header-text">
              <div class="verwaltung-panel__title">Anhänge verwalten</div>
              <div class="verwaltung-panel__desc">Lade Anhänge hoch oder exportiere bestehende Dateien.</div>
            </div>
          </summary>
          <div class="verwaltung-panel__body-wrap"><div class="verwaltung-panel__body">
            <div class="anhaenge-export-row">
              <div class="form-group anhaenge-zeitraum">
                <label class="form-label">Zeitraum (optional)</label>
                <div class="anhaenge-zeitraum__inputs">
                  <input type="date" class="form-control" id="anhaengeVon">
                  <span class="anhaenge-zeitraum__sep">–</span>
                  <input type="date" class="form-control" id="anhaengeBis">
                </div>
              </div>
              <button class="btn btn-outline" id="exportAnhaengeBtn">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                Anhänge (.zip)
              </button>
            </div>

            <!-- Upload -->
            <label class="upload-zone" id="uploadZone" for="fileInput">
              <div class="upload-zone__icon">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
              </div>
              <div class="upload-zone__text">Dateien hier ablegen oder klicken zum Auswählen</div>
              <div class="upload-zone__hint">PDF, JPG, PNG, DOCX – max. 10 MB</div>
              <input type="file" id="fileInput" multiple accept=".pdf,.jpg,.jpeg,.png,.docx">
            </label>

            <div class="attachment-list" id="attachmentList">
              ${renderAttachments()}
            </div>
          </div></div>
        </details>

        <!-- Berichtsheftexport defekt -->
        <details class="verwaltung-panel">
          <summary class="verwaltung-panel__header">
            <div class="verwaltung-panel__icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            </div>
            <div class="verwaltung-panel__header-text">
              <div class="verwaltung-panel__title">Berichtsheftexport defekt?</div>
              <div class="verwaltung-panel__desc">Behebe Fehler im Berichtsheft-Export.</div>
            </div>
          </summary>
          <div class="verwaltung-panel__body-wrap"><div class="verwaltung-panel__body">
            <div class="repair-status repair-status--ok">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span style="font-size:var(--text-sm)">Keine bekannten Probleme gefunden.</span>
            </div>
            <button class="btn btn-outline" id="repairBtn">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
              Berichtsheftexport reparieren
            </button>
          </div></div>
        </details>

        <!-- Unabhängige Anhänge -->
        <details class="verwaltung-panel">
          <summary class="verwaltung-panel__header">
            <div class="verwaltung-panel__icon">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <div class="verwaltung-panel__header-text">
              <div class="verwaltung-panel__title">Unabhängige Berichtsheftanhänge</div>
              <div class="verwaltung-panel__desc">Anhänge, die keiner Berichtswoche zugeordnet sind.</div>
            </div>
          </summary>
          <div class="verwaltung-panel__body-wrap"><div class="verwaltung-panel__body">
            <p style="font-size:var(--text-sm);color:var(--pm-grey-500);margin-bottom:var(--sp-4)">
              Hier kannst du Anhänge zu deinem Berichtsheft hinzufügen, die keiner bestimmten Berichtswoche zugeordnet sind (z.B. Zertifikate, Bescheinigungen).
            </p>
            <button class="btn btn-outline" id="addIndepAnhangBtn">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Anhänge hinzufügen
            </button>
          </div></div>
        </details>
      </div>
    `;

    // Events
    document.getElementById('azubiSelect')?.addEventListener('change', (e) => {
      selectedAzubiId = parseInt(e.target.value);
      render();
    });

    ['exportPdfBtn', 'exportAllPdfBtn', 'exportAnhaengeBtn'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        Toast.info('Export', 'In der Produktionsversion würde hier ein Download starten.');
      });
    });

    document.getElementById('repairBtn')?.addEventListener('click', () => {
      Toast.success('Reparatur', 'Keine Fehler gefunden. Export ist in Ordnung.');
    });

    document.getElementById('addIndepAnhangBtn')?.addEventListener('click', () => {
      document.getElementById('fileInput').click();
    });

    // Datei-Upload
    const fileInput = document.getElementById('fileInput');
    const uploadZone = document.getElementById('uploadZone');

    fileInput?.addEventListener('change', (e) => {
      Array.from(e.target.files).forEach(f => {
        attachments.push({ name: f.name, size: formatFileSize(f.size), type: f.type });
      });
      document.getElementById('attachmentList').innerHTML = renderAttachments();
      Toast.success('Hochgeladen', `${e.target.files.length} Datei(en) hinzugefügt.`);
    });

    uploadZone?.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
    uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('drag-over');
      Array.from(e.dataTransfer.files).forEach(f => {
        attachments.push({ name: f.name, size: formatFileSize(f.size), type: f.type });
      });
      document.getElementById('attachmentList').innerHTML = renderAttachments();
    });

    // Delete Anhang
    document.querySelectorAll('.attachment-item__delete').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        attachments.splice(i, 1);
        document.getElementById('attachmentList').innerHTML = renderAttachments();
        bindDeleteEvents();
      });
    });

    Toast.init();
  }

  function bindDeleteEvents() {
    document.querySelectorAll('.attachment-item__delete').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        attachments.splice(i, 1);
        document.getElementById('attachmentList').innerHTML = renderAttachments();
        bindDeleteEvents();
      });
    });
  }

  function renderAttachments() {
    if (!attachments.length) return '';
    return attachments.map((a, i) => `
      <div class="attachment-item">
        <div class="attachment-item__icon">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <span class="attachment-item__name">${a.name}</span>
        <span class="attachment-item__size">${a.size}</span>
        <button class="attachment-item__delete" data-index="${i}" aria-label="Entfernen">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join('');
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  render();
});
