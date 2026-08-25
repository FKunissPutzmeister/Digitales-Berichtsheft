/* ===================================================================
   ERROR-REPORTER.JS – meldet Frontend-Fehler an /api/errors.
   Lädt nach api.js (nutzt API_BASE). Meldet still, kein UI-Popup.
   =================================================================== */
(function () {
  'use strict';

  // Reine Dedupe-Entscheidung: gleicher key innerhalb fensterMs → nicht erneut.
  function sollMelden(key, jetzt, lastMap, fensterMs) {
    const last = lastMap.get(key);
    if (last !== undefined && jetzt - last < fensterMs) return false;
    lastMap.set(key, jetzt);
    return true;
  }

  // Transiente Verbindungsfehler: der Client konnte den Server schlicht nicht
  // erreichen (Server-Neustart, DB kurz weg, Netzwerk-Blip). Diese haben KEINEN
  // diagnostischen Wert – der Nutzer versucht es Sekunden später erneut – und
  // fluten sonst den Fehler-Posteingang. Echte App-Fehler (500 mit Meldung,
  // reale 404, Validierung) enthalten diese Muster NICHT und werden weiter
  // gemeldet. Deckt „Failed to fetch" (Chrome/Edge), „Load failed"/„NetworkError"
  // (Safari/Firefox) und den apiFetch-Timeout ab.
  function istTransienterVerbindungsfehler(nachricht) {
    const s = String(nachricht || '');
    return /Failed to fetch/i.test(s)
        || /Load failed/i.test(s)
        || /NetworkError|Network request failed/i.test(s)
        || /nicht rechtzeitig geantwortet/i.test(s);
  }

  // Benignes Browser-Rauschen: Meldungen, die die Engine selbst erzeugt und
  // die KEIN Fehlverhalten der App sind. „ResizeObserver loop completed with
  // undelivered notifications" entsteht, wenn ein ResizeObserver-Callback im
  // selben Frame erneut Layout ändert (bei uns u. a. Editor-/Toolbar-Layout)
  // – der Browser liefert die Notifikationen im nächsten Frame nach, es geht
  // nichts verloren. Solche Meldungen fluten sonst den Posteingang
  // (×373 in vier Tagen) und verdecken echte Bugs.
  function istBenignesBrowserrauschen(nachricht) {
    return /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/i
      .test(String(nachricht || ''));
  }

  // Erwartete HTTP-Fachergebnisse, die NIE als Bug gelten:
  //   401 – Session abgelaufen / noch nicht angemeldet. Der Aufrufer leitet
  //         zum Login (login.js prüft mit /auth/me genau das ab).
  //   409 – Konflikt („existiert bereits"), wird als Toast gezeigt.
  // Alles andere ist nur dann kein Bug, wenn der Aufrufer es ausdrücklich als
  // erwartet markiert (apiFetch(..., { erwartet: [403, 404] })).
  const IMMER_ERWARTET = [401, 409];
  function sollStatusMelden(status, erwartet) {
    if (status === undefined || status === null) return true;
    if (IMMER_ERWARTET.includes(status)) return false;
    return !(Array.isArray(erwartet) && erwartet.includes(status));
  }

  // Node/Test-Kontext: nur die reinen Funktionen exportieren, nichts anhängen.
  if (typeof window === 'undefined') {
    module.exports = { sollMelden, istTransienterVerbindungsfehler,
      istBenignesBrowserrauschen, sollStatusMelden };
    return;
  }

  const gesehen = new Map();
  const FENSTER_MS = 10000;
  let sendet = false;   // reentrancy-Guard gegen Selbst-Fehlerschleifen

  const API_BASE = (window.location.port === '5500')
    ? `http://${window.location.hostname}:3000/api` : '/api';

  function melde(quelle, nachricht, stack, extra, bilder) {
    if (sendet) return;
    // Manuelle Meldungen nie unterdrücken; transientes Verbindungs- und
    // benignes Browser-Rauschen schon.
    if (quelle !== 'manual'
        && (istTransienterVerbindungsfehler(nachricht) || istBenignesBrowserrauschen(nachricht))) return;
    const key = `${quelle}|${nachricht}|${String(stack || '').split('\n').slice(0, 2).join('|')}`;
    if (!sollMelden(key, Date.now(), gesehen, FENSTER_MS)) return;
    sendet = true;
    try {
      fetch(API_BASE + '/errors', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({
          quelle,
          nachricht: String(nachricht || '').slice(0, 4000),
          stack: stack ? String(stack).slice(0, 8000) : null,
          kontext: Object.assign({ url: location.href, seite: document.body?.dataset?.page || null,
            userAgent: navigator.userAgent }, extra || {}),
        }, (Array.isArray(bilder) && bilder.length) ? { bilder } : {})),
      }).catch(() => {}).finally(() => { sendet = false; });
    } catch (e) { sendet = false; }
  }

  window.addEventListener('error', (ev) => {
    melde('frontend', ev.message || 'Unbekannter Fehler',
      ev.error && ev.error.stack, { quelltext: ev.filename, zeile: ev.lineno });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason;
    melde('frontend', (r && r.message) || String(r) || 'Unhandled rejection', r && r.stack);
  });

  // apiFetch-Fehler zusätzlich melden (api.js wirft Error mit .message).
  if (typeof window.apiFetch === 'function') {
    const orig = window.apiFetch;
    window.apiFetch = async function (path, options) {
      try { return await orig(path, options); }
      catch (e) {
        // Erwartete Fachergebnisse sind keine Bugs und gehören nicht in den
        // Posteingang (gleiche Rationale wie istTransienterVerbindungsfehler):
        // 401/409 immer (Session abgelaufen bzw. Konflikt-Toast), zusätzlich
        // die vom Aufrufer via { erwartet: [...] } deklarierten Status – etwa
        // 403 „Kein Zugriff" bei Beurteilungs-Badges, die der Aufrufer
        // ausdrücklich wegfängt und ohne Badge weiterläuft.
        // Wartungsmodus (503 mit wartung:true, gesetzt in api.js) ist ein
        // angekündigter Betriebszustand, kein Bug. Während der Wartung würde
        // ohnehin JEDER Aufruf so enden — der Posteingang liefe voll, und
        // /api/errors antwortet selbst mit 503, die Meldung käme nie an.
        if (e && e.wartung === true) throw e;
        if (e && sollStatusMelden(e.status, options && options.erwartet)) {
          melde('frontend', `apiFetch ${path}: ${e.message}`, e.stack,
            { apiPfad: path, methode: ((options && options.method) || 'GET').toUpperCase() });
        }
        throw e;
      }
    };
  }

  // Für den manuellen Melde-Button (Task 7) freigeben.
  window.meldeFehler = melde;

  /* ── Manueller Melde-Button (Task 7) ──────────────────────────────
     Einmalig hier definiert (statt in profil.js UND dh-profil.js
     dupliziert), da error-reporter.js auf jeder Shell-Seite geladen
     wird. Modal-Konvention entspricht nutzerverwaltung.js/profil.js
     (modal-overlay/modal__header/modal__body/modal__footer, gesteuert
     über den globalen Modal-Helfer aus app.js). Da app.js NACH
     error-reporter.js geladen wird, referenzieren wir Modal/Toast nur
     lose (typeof-Check) — zum Zeitpunkt des Klicks sind sie längst
     definiert. */
  const FM_MODAL_ID = 'fehlerMeldenModal';

  function fmModalOffen() {
    if (typeof Modal !== 'undefined' && typeof Modal.close === 'function') Modal.close(FM_MODAL_ID);
    else {
      document.getElementById(FM_MODAL_ID)?.classList.remove('open');
      document.body.style.overflow = '';
    }
  }

  // ── Bild-Anhänge im Melde-Modal ─────────────────────────────────
  const FM_MAX_BILDER = 5;
  const FM_MAX_BILD_BYTES = 4 * 1024 * 1024;   // je Bild, dekodiert
  const FM_MAX_GESAMT_BYTES = 6 * 1024 * 1024; // Summe, dekodiert
  const FM_MAX_KANTE = 1600;                   // längste Kante nach Skalierung

  function fmHinweis(msg) {
    if (typeof Toast !== 'undefined' && typeof Toast.error === 'function') Toast.error('Hinweis', msg);
    else alert(msg);
  }
  function fmEsc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmDataUrlBytes(dataUrl) {
    const komma = dataUrl.indexOf(',');
    const b64 = komma >= 0 ? dataUrl.slice(komma + 1) : dataUrl;
    return Math.floor(b64.length * 3 / 4);
  }
  function fmDateiZuDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }
  // Skaliert nur, wenn die längste Kante FM_MAX_KANTE übersteigt. PNG behält
  // seinen Typ (Transparenz), alles andere wird als JPEG (kleiner) ausgegeben.
  function fmSkaliere(dataUrl, mimeTyp) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const max = Math.max(img.width, img.height);
        if (max <= FM_MAX_KANTE) { resolve(dataUrl); return; }
        const faktor = FM_MAX_KANTE / max;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * faktor);
        canvas.height = Math.round(img.height * faktor);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const ziel = mimeTyp === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(ziel, 0.85));
      };
      img.onerror = () => resolve(dataUrl); // Fallback: Original behalten
      img.src = dataUrl;
    });
  }

  function baueFehlerMeldenModal() {
    let overlay = document.getElementById(FM_MODAL_ID);
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = FM_MODAL_ID;
    overlay.innerHTML = `
      <div class="modal" style="max-width:480px" role="dialog" aria-modal="true" aria-label="Fehler melden">
        <div class="modal__header">
          <span class="modal__title">Fehler melden</span>
          <button class="modal__close" data-modal-close aria-label="Schließen">
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal__body">
          <p class="form-hint" style="margin:0 0 var(--sp-3)">Beschreibe kurz, was nicht funktioniert hat.</p>
          <div class="form-group">
            <textarea class="form-control" id="fmText" rows="5" maxlength="4000" placeholder="Was ist passiert?"></textarea>
          </div>
          <div class="form-group">
            <p class="form-hint" style="margin:0 0 var(--sp-2)">Bilder / Screenshots (optional) — Screenshot mit Strg+V einfügen oder Datei wählen, max. 5.</p>
            <input type="file" id="fmFile" accept="image/*" multiple hidden>
            <button class="btn btn-outline btn-sm" type="button" id="fmFileBtn">Bild auswählen</button>
            <div id="fmThumbs" class="fm-thumbs"></div>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn-outline" type="button" data-modal-close>Abbrechen</button>
          <button class="btn btn-primary" type="button" id="fmSendBtn">Senden</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelectorAll('[data-modal-close]').forEach(btn => btn.addEventListener('click', fmModalOffen));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fmModalOffen(); });

    let bilder = [];

    function zeichneThumbnails() {
      const box = overlay.querySelector('#fmThumbs');
      box.innerHTML = bilder.map((b, i) =>
        `<div class="fm-thumb"><img src="${b.dataUrl}" alt="${fmEsc(b.name)}">`
        + `<button type="button" class="fm-thumb__del" data-del="${i}" aria-label="Entfernen">✕</button></div>`).join('');
      box.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', () => {
        bilder.splice(Number(btn.dataset.del), 1);
        zeichneThumbnails();
      }));
    }

    async function fuegeDateiHinzu(file) {
      if (!file || !file.type || !file.type.startsWith('image/')) { fmHinweis('Nur Bilder können angehängt werden.'); return; }
      if (bilder.length >= FM_MAX_BILDER) { fmHinweis(`Maximal ${FM_MAX_BILDER} Bilder.`); return; }
      let dataUrl;
      try {
        const roh = await fmDateiZuDataUrl(file);
        dataUrl = await fmSkaliere(roh, file.type);
      } catch (e) { fmHinweis('Bild konnte nicht verarbeitet werden.'); return; }
      const groesse = fmDataUrlBytes(dataUrl);
      if (groesse > FM_MAX_BILD_BYTES) { fmHinweis('Bild ist auch nach Verkleinern zu groß (max. 4 MB).'); return; }
      const gesamt = bilder.reduce((s, b) => s + fmDataUrlBytes(b.dataUrl), 0);
      if (gesamt + groesse > FM_MAX_GESAMT_BYTES) { fmHinweis('Gesamtgröße der Bilder zu groß (max. 6 MB).'); return; }
      const mimeTyp = dataUrl.slice(5, dataUrl.indexOf(';'));
      bilder.push({ name: file.name || 'screenshot.png', mimeTyp, dataUrl });
      zeichneThumbnails();
    }

    overlay.querySelector('#fmFileBtn').addEventListener('click', () => overlay.querySelector('#fmFile').click());
    overlay.querySelector('#fmFile').addEventListener('change', (e) => {
      Array.from(e.target.files || []).forEach(fuegeDateiHinzu);
      e.target.value = ''; // gleiche Datei erneut wählbar
    });
    overlay.addEventListener('paste', (e) => {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const it of items) {
        if (it.type && it.type.startsWith('image/')) {
          const file = it.getAsFile();
          if (file) fuegeDateiHinzu(file);
        }
      }
    });

    overlay.querySelector('#fmSendBtn').addEventListener('click', () => {
      const feld = overlay.querySelector('#fmText');
      const text = feld.value.trim();
      if (!text) return;
      melde('manual', text, null, { gemeldetVon: 'profil' },
        bilder.map(b => ({ name: b.name, mimeTyp: b.mimeTyp, dataUrl: b.dataUrl })));
      feld.value = '';
      bilder = [];
      zeichneThumbnails();
      fmModalOffen();
      if (typeof Toast !== 'undefined' && typeof Toast.success === 'function') {
        Toast.success('Danke!', 'Deine Meldung wurde übermittelt.');
      }
    });

    return overlay;
  }

  window.oeffneFehlerMeldung = function oeffneFehlerMeldung() {
    baueFehlerMeldenModal();
    if (typeof Modal !== 'undefined' && typeof Modal.open === 'function') {
      Modal.open(FM_MODAL_ID);
    } else {
      document.getElementById(FM_MODAL_ID)?.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  };
})();
