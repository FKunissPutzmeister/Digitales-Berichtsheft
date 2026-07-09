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

  // Node/Test-Kontext: nur die reine Funktion exportieren, nichts anhängen.
  if (typeof window === 'undefined') {
    module.exports = { sollMelden };
    return;
  }

  const gesehen = new Map();
  const FENSTER_MS = 10000;
  let sendet = false;   // reentrancy-Guard gegen Selbst-Fehlerschleifen

  const API_BASE = (window.location.port === '5500')
    ? `http://${window.location.hostname}:3000/api` : '/api';

  function melde(quelle, nachricht, stack, extra) {
    if (sendet) return;
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
        melde('frontend', `apiFetch ${path}: ${e.message}`, e.stack, { apiPfad: path });
        throw e;
      }
    };
  }

  // Für den manuellen Melde-Button (Task 7) freigeben.
  window.meldeFehler = melde;
})();
