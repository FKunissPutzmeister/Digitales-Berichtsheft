'use strict';

// Härtet den Schreibpfad eines session-file-store gegen Windows-EPERM ab.
//
// Hintergrund: session-file-store schreibt Sessions atomar (Temp-Datei +
// Rename). Unter Windows kollidiert das Rename sporadisch mit einem
// kurzzeitigen Datei-Lock (Virenscanner, Such-Indexer, paralleler Zugriff) →
// `EPERM`/`EBUSY`/`EACCES`. Der Store hat NUR beim Lesen (`get`) Retries; der
// Schreibpfad (`set`/`touch`) hat KEINE. express-session ruft aber bei JEDEM
// Request einer bestehenden Session `store.touch()` (TTL-Bump) und leitet einen
// Fehler via `defer(next, err)` an den globalen Handler → protokolliert als
// `[unhandled]` (Schweregrad „hoch"). Ein Reiterwechsel feuert mehrere
// Requests parallel → mehrere Renames auf dieselbe Datei → Fehler-Spam.
//
// Lösung: den Schreibpfad selbst mit Retries versehen (analog zur `get`-Logik,
// die es schon gibt). `touch` ist reiner TTL-Bump — schlägt es endgültig fehl,
// wird der Fehler geschluckt (harmlos: die Session-Daten liegen unverändert auf
// der Platte). `set` (echte Speicherungen: Login, Dev-View-Umschaltung) wird
// ebenfalls wiederholt, ein endgültiger Fehler aber DURCHGEREICHT — dort ist er
// echt und die vorhandene Fehlerbehandlung (z.B. saml.js) soll ihn sehen.

// Vorübergehende, wiederholbare Datei-Fehler (Windows-Lock-Kollisionen).
const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES', 'EEXIST']);

function retryWrite(store, method, { retries, delayMs, swallow }) {
  const original = store && store[method];
  if (typeof original !== 'function') return;
  store[method] = function (sessionId, session, callback) {
    let attempt = 0;
    const run = () => {
      original.call(store, sessionId, session, (err, result) => {
        if (err && TRANSIENT.has(err.code) && attempt < retries) {
          attempt += 1;
          // linear ansteigende Wartezeit gibt dem Lock Zeit, sich zu lösen.
          setTimeout(run, delayMs * attempt);
          return;
        }
        if (callback) callback(swallow ? null : err, result);
      });
    };
    run();
  };
}

// Versieht `set` und `touch` des Stores mit Schreib-Retries. `touch` schluckt
// einen endgültigen Fehler (best effort), `set` reicht ihn durch.
function hardenWrites(store, { retries = 5, delayMs = 40 } = {}) {
  retryWrite(store, 'set',   { retries, delayMs, swallow: false });
  retryWrite(store, 'touch', { retries, delayMs, swallow: true });
  return store;
}

module.exports = { hardenWrites, TRANSIENT };
