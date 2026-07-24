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
