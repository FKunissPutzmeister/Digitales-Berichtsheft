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

// Logout-Race: `touch` liest die Session-Datei und schreibt sie danach
// komplett zurück. Läuft `destroy` (Logout) genau dazwischen, legt der
// Rückschreib-Vorgang die gelöschte Datei samt Anmeldung wieder an — der
// Nutzer kommt nicht raus ("sofort wieder angemeldet"). express-session sendet
// die Antwort, bevor touch fertig ist, und Seiten mit vielen parallelen
// Requests (Admin-Verwaltung) treffen das Fenster zuverlässig.
// Abhilfe: zerstörte IDs eine Weile merken und einen danach fertig gewordenen
// set/touch sofort wieder löschen.
function guardDestroyed(store, { tombstoneMs }) {
  if (typeof store.destroy !== 'function') return;
  const destroyed = new Map();   // sessionId → Ablaufzeitpunkt der Markierung
  const isDestroyed = (id) => {
    const bis = destroyed.get(id);
    if (bis === undefined) return false;
    if (Date.now() > bis) { destroyed.delete(id); return false; }
    return true;
  };
  const destroy = store.destroy;
  store.destroy = function (sessionId, callback) {
    const jetzt = Date.now();
    for (const [id, bis] of destroyed) if (jetzt > bis) destroyed.delete(id);
    destroyed.set(sessionId, jetzt + tombstoneMs);
    destroy.call(store, sessionId, callback);
  };
  for (const method of ['set', 'touch']) {
    const original = store[method];
    if (typeof original !== 'function') continue;
    store[method] = function (sessionId, session, callback) {
      original.call(store, sessionId, session, (err, result) => {
        if (isDestroyed(sessionId)) {
          destroy.call(store, sessionId, () => { if (callback) callback(null); });
          return;
        }
        if (callback) callback(err, result);
      });
    };
  }
}

// Versieht `set` und `touch` des Stores mit Schreib-Retries. `touch` schluckt
// einen endgültigen Fehler (best effort), `set` reicht ihn durch. Zusätzlich
// kann kein set/touch eine per Logout zerstörte Session wiederbeleben.
function hardenWrites(store, { retries = 5, delayMs = 40, tombstoneMs = 60_000 } = {}) {
  retryWrite(store, 'set',   { retries, delayMs, swallow: false });
  retryWrite(store, 'touch', { retries, delayMs, swallow: true });
  guardDestroyed(store, { tombstoneMs });
  return store;
}

module.exports = { hardenWrites, TRANSIENT };
