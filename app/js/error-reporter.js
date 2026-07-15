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

  // Node/Test-Kontext: nur die reinen Funktionen exportieren, nichts anhängen.
  if (typeof window === 'undefined') {
    module.exports = { sollMelden, istTransienterVerbindungsfehler };
    return;
  }

  const gesehen = new Map();
  const FENSTER_MS = 10000;
  let sendet = false;   // reentrancy-Guard gegen Selbst-Fehlerschleifen

  const API_BASE = (window.location.port === '5500')
    ? `http://${window.location.hostname}:3000/api` : '/api';

  function melde(quelle, nachricht, stack, extra) {
    if (sendet) return;
    // Manuelle Meldungen nie unterdrücken; transiente Verbindungsfehler schon.
    if (quelle !== 'manual' && istTransienterVerbindungsfehler(nachricht)) return;
    const key = `${quelle}|${nachricht}|${String(stack || '').split('\n').slice(0, 2).join('|')}`;
    if (!sollMelden(key, Date.now(), gesehen, FENSTER_MS)) return;
    sendet = true;
    try {
      fetch(API_BASE + '/errors', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quelle,
          nachricht: String(nachricht || '').slice(0, 4000),
          stack: stack ? String(stack).slice(0, 8000) : null,
          kontext: Object.assign({ url: location.href, seite: document.body?.dataset?.page || null,
            userAgent: navigator.userAgent }, extra || {}),
        }),
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
        melde('frontend', `apiFetch ${path}: ${e.message}`, e.stack,
          { apiPfad: path, methode: ((options && options.method) || 'GET').toUpperCase() });
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
        </div>
        <div class="modal__footer">
          <button class="btn btn-outline" type="button" data-modal-close>Abbrechen</button>
          <button class="btn btn-primary" type="button" id="fmSendBtn">Senden</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelectorAll('[data-modal-close]').forEach(btn => btn.addEventListener('click', fmModalOffen));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fmModalOffen(); });

    overlay.querySelector('#fmSendBtn').addEventListener('click', () => {
      const feld = overlay.querySelector('#fmText');
      const text = feld.value.trim();
      if (!text) return;
      melde('manual', text, null, { gemeldetVon: 'profil' });
      feld.value = '';
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
