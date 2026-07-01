/* ===================================================================
   BERICHTSHEFTVERWALTUNG.JS
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-verwaltung', [{ label: 'Berichtsheftverwaltung', href: 'berichtsheftverwaltung.html' }]);
  if (!user) return;

  /* Layout-Marker: erlaubt der Berichtsheftverwaltung die volle Seitenbreite
     (Override der globalen --content-max-Beschränkung in layout.css). */
  document.body.dataset.page = 'berichtsheftverwaltung';

  if (!user.kannPlanen) {
    window.location.href = 'dashboard.html';
    return;
  }

  const main = document.getElementById('mainContent');

  const azubisInit = await DB.getAzubis();
  let selectedAzubiId = azubisInit[0]?.id;
  let attachments = [];

  async function render() {
    const isAusbilder = user.kannPlanen;  // Verwaltung ist nur für Planer erreichbar → Azubi-Auswahl zeigen
    const azubis = await DB.getAzubis();
    const selectedAzubi = await DB.getUser(selectedAzubiId);

    main.innerHTML = `
      <div class="page-header">
        <div class="page-header__left">
          <h1 class="page-title">Berichtsheftverwaltung</h1>
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
              ${Icon('download')}
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
                  ${Icon('download')}
                </div>
                <div class="export-btn__text">
                  <span class="export-btn__label">Berichtsheft exportieren (.pdf)</span>
                  <span class="export-btn__desc">Ausgewählter Zeitraum als PDF</span>
                </div>
              </button>
              <button class="export-btn" id="exportAllPdfBtn">
                <div class="export-btn__icon">
                  ${Icon('verwaltung')}
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
              ${Icon('paperclip')}
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
                ${Icon('download', { size: 16 })}
                Anhänge (.zip)
              </button>
            </div>

            <!-- Upload -->
            <label class="upload-zone" id="uploadZone" for="fileInput">
              <div class="upload-zone__icon">
                ${Icon('upload')}
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

      </div>
    `;

    // Events
    document.getElementById('azubiSelect')?.addEventListener('change', (e) => {
      // Azubi-IDs sind GUID-Strings (z. B. "00000000-…-000000000003").
      // parseInt() hätte daraus 0 gemacht (Parsen bricht beim "-" ab) →
      // DB.getUser(0) findet nichts, die Auswahl wurde nie übernommen.
      selectedAzubiId = e.target.value;
      render();
    });

    ['exportPdfBtn', 'exportAllPdfBtn', 'exportAnhaengeBtn'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        Toast.info('Export', 'In der Produktionsversion würde hier ein Download starten.');
      });
    });

    // Datei-Upload
    const fileInput = document.getElementById('fileInput');
    const uploadZone = document.getElementById('uploadZone');

    function handleFiles(files) {
      const arr = Array.from(files);
      if (!arr.length) return;
      runUploadProgress(arr.length, () => {
        arr.forEach(f => attachments.push({
          name: f.name, size: formatFileSize(f.size), type: f.type, fresh: true,
        }));
        document.getElementById('attachmentList').innerHTML = renderAttachments();
        // "fresh"-Flag nach der Einblend-Animation entfernen, damit der
        // Effekt nicht beim nächsten Re-Render erneut feuert.
        setTimeout(() => attachments.forEach(a => delete a.fresh), 600);
      });
    }

    fileInput?.addEventListener('change', (e) => handleFiles(e.target.files));
    uploadZone?.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
    uploadZone?.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('drag-over');
      handleFiles(e.dataTransfer.files);
    });

    // Delete Anhang (identische Verdrahtung wie nach jedem Re-Render)
    bindDeleteEvents();

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
      <div class="attachment-item${a.fresh ? ' attachment-item--fresh' : ''}">
        <div class="attachment-item__icon">
          ${Icon('document', { size: 16 })}
        </div>
        <span class="attachment-item__name">${a.name}</span>
        <span class="attachment-item__size">${a.size}</span>
        <button class="attachment-item__delete" aria-label="Entfernen">
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join('');
  }

  /* Simuliertes Upload-Feedback: Progress-Ring → Checkmark → Toast.
     Da der Prototyp keine echte Backend-Verbindung hat, animieren wir
     eine plausible 900-ms-Sequenz. Echte Implementierung würde den
     Fortschritt aus XHR/fetch-Events ziehen, die UI bleibt gleich. */
  function runUploadProgress(fileCount, onComplete) {
    const overlay = ensureUploadOverlay();
    const ring   = overlay.querySelector('.upload-progress__ring-fill');
    const num    = overlay.querySelector('.upload-progress__num');
    const label  = overlay.querySelector('.upload-progress__label');

    overlay.classList.remove('upload-progress--done');
    overlay.classList.add('upload-progress--visible');
    label.textContent = fileCount === 1
      ? '1 Datei wird hochgeladen…'
      : `${fileCount} Dateien werden hochgeladen…`;

    const total = 900; // ms
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / total);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out-cubic
      const pct = Math.round(eased * 100);
      num.textContent = pct + '%';
      // SVG-Kreis: circumference = 2πr = 2π*32 ≈ 201
      const circ = 201;
      ring.style.strokeDashoffset = String(circ * (1 - eased));
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        // Erfolgs-State: Checkmark einblenden, Ring kurz pulsen, dann fade-out
        overlay.classList.add('upload-progress--done');
        label.textContent = fileCount === 1
          ? 'Datei hinzugefügt'
          : `${fileCount} Dateien hinzugefügt`;
        onComplete?.();
        setTimeout(() => {
          overlay.classList.remove('upload-progress--visible');
        }, 700);
      }
    }
    requestAnimationFrame(step);
  }

  function ensureUploadOverlay() {
    let overlay = document.getElementById('uploadProgressOverlay');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'uploadProgressOverlay';
    overlay.className = 'upload-progress';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.innerHTML = `
      <div class="upload-progress__card">
        <div class="upload-progress__ring-wrap">
          <svg class="upload-progress__ring" viewBox="0 0 72 72" aria-hidden="true">
            <circle class="upload-progress__ring-track" cx="36" cy="36" r="32"></circle>
            <circle class="upload-progress__ring-fill"  cx="36" cy="36" r="32"></circle>
          </svg>
          <span class="upload-progress__num">0%</span>
          <span class="upload-progress__check" aria-hidden="true">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3.2"><polyline stroke-linecap="round" stroke-linejoin="round" points="20 6 9 17 4 12"/></svg>
          </span>
        </div>
        <div class="upload-progress__label">Wird hochgeladen…</div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  await render();

  async function initUserAdmin(currentUser) {
    const sec = document.getElementById('userAdmin');
    if (!sec || !['admin', 'developer'].includes(currentUser.role)) return;
    sec.hidden = false;
    const tbody = sec.querySelector('#userAdminTable tbody');
    const users = await DB.getAllUsers();
    const ROLES = ['azubi', 'pruefer', 'admin', 'dhstudent', 'developer'];
    const TYPES = ['wöchentlich', 'täglich'];
    tbody.innerHTML = '';
    for (const u of users) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${u.name}</td>` +
        `<td><select data-f="role">${ROLES.map(r => `<option ${u.role===r?'selected':''}>${r}</option>`).join('')}</select></td>` +
        `<td><input data-f="beruf" value="${u.beruf ?? ''}"></td>` +
        `<td><select data-f="berichtTyp">${TYPES.map(t => `<option ${u.berichtTyp===t?'selected':''}>${t}</option>`).join('')}</select></td>` +
        `<td><input type="checkbox" data-f="kannPlanen" ${u.kannPlanen?'checked':''}></td>` +
        `<td><input type="checkbox" data-f="istAusbilder" ${u.istAusbilder?'checked':''}></td>` +
        `<td><input type="checkbox" data-f="aktiv" ${u.aktiv!==false?'checked':''}></td>` +
        `<td><button data-save>Speichern</button></td>`;
      tr.querySelector('[data-save]').addEventListener('click', async () => {
        const fields = {};
        tr.querySelectorAll('[data-f]').forEach(el => {
          const f = el.dataset.f;
          fields[f] = el.type === 'checkbox' ? el.checked : el.value;
        });
        try { await DB.updateUser(u.oid, fields); showToast?.('Gespeichert'); }
        catch (e) { showToast?.('Fehler: ' + e.message); }
      });
      tbody.appendChild(tr);
    }
  }

  initUserAdmin(user);
});
