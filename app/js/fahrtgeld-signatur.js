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

  async function onApply() {
    let sig = null;
    if (state.activeTab === 'draw') {
      const canvas = document.getElementById('fg-sig-canvas');
      if (state.drawInk && canvas) {
        const dataUrl = trimToDataUrl(canvas);
        if (dataUrl) sig = { dataUrl, extension: 'png' };
      }
    } else if (state.activeTab === 'type') {
      const text = (document.getElementById('fg-sig-text')?.value || '').trim();
      if (text) {
        const canvas = await renderTypedToCanvas(text, state.currentFont);
        const dataUrl = trimToDataUrl(canvas);
        if (dataUrl) sig = { dataUrl, extension: 'png' };
      }
    } else if (state.activeTab === 'upload') {
      sig = state.pendingUpload;
    }
    if (!sig || !sig.dataUrl) {
      window.Toast?.warning?.('Leer', 'Bitte zuerst eine Unterschrift erstellen.');
      return;
    }
    state.onSave?.(sig);
    window.Modal?.closeAll?.();
  }

  function open({ name, onSave }) {
    document.getElementById('fgSigModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', buildMarkup());
    state = { onSave, activeTab: 'draw', currentFont: FONTS[0], pendingUpload: null, drawCtx: null, drawInk: false };

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
        window.Toast?.warning?.('Format', 'Bitte ein PNG oder JPG hochladen.');
        e.target.value = ''; return;
      }
      // Signatur landet im localStorage (~5 MB Quota, setSignature schluckt
      // Fehler still) → große Bilder vorher abweisen.
      if (file.size > 2 * 1024 * 1024) {
        window.Toast?.warning?.('Zu groß', 'Das Bild darf höchstens 2 MB groß sein.');
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

    window.Modal?.init?.();
    window.Modal?.open?.('fgSigModal');
    requestAnimationFrame(setupDrawCanvas);
  }

  window.SignaturDialog = { open };
})();
