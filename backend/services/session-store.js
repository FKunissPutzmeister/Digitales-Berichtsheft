'use strict';

// Macht das `touch` eines Session-Stores best-effort (schluckt Fehler).
//
// Hintergrund: express-session ruft bei JEDEM Request einer bestehenden,
// unveränderten Session `store.touch()` auf, um nur die Ablaufzeit (TTL) zu
// verlängern. session-file-store schreibt dafür die komplette Session-Datei
// neu — Temp-Datei + atomares Rename. Unter Windows kollidieren mehrere
// PARALLELE Renames auf DIESELBE Session-Datei sporadisch mit `EPERM`
// (ein Reiterwechsel feuert gleich mehrere API-Requests parallel). Anders als
// der Lesepfad `get()` hat der Schreibpfad von session-file-store KEINE Retries
// (die `retries`-Option greift nur bei `get`), der Fehler landet daher via
// `defer(next, err)` (express-session/index.js) im globalen Fehler-Handler und
// wird als `[unhandled]` (Schweregrad „hoch") protokolliert → der Fehlerbericht
// wird bei jedem Reiterwechsel zugespammt.
//
// Ein fehlgeschlagenes `touch` ist harmlos: es verlängert nur die TTL, die
// Session-DATEN liegen bereits unverändert auf der Platte (echte Änderungen
// laufen über `set`, nicht `touch`). Wir schlucken den Fehler daher, statt ihn
// zum Request-Fehler zu eskalieren. Echte Schreibfehler (`set`) bleiben
// unangetastet und weiterhin sichtbar.
function bestEffortTouch(store) {
  const original = store && store.touch;
  if (typeof original !== 'function') return store;
  store.touch = function (sessionId, session, callback) {
    original.call(store, sessionId, session, function (_err, result) {
      if (callback) callback(null, result);
    });
  };
  return store;
}

module.exports = { bestEffortTouch };
