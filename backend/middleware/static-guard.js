'use strict';
/* ===================================================================
   STATIC-GUARD
   Sperrt sensible Verzeichnisse, bevor express.static (bzw. der
   Dev-Server) irgendetwas ausliefert.

   ⚠ Warum auf dem AUFGELÖSTEN Pfad und nicht auf dem URL-String:
   Ein reiner String-Vergleich ("beginnt mit /backend/") ist umgehbar,
   weil send/serve-static die URL erst NACH so einer Prüfung
   normalisieren. `//backend/data/...` und `/app/%2e%2e/backend/data/...`
   rutschten daran vorbei und lieferten trotzdem Dateien aus
   backend/ aus (u. a. die Nacht-Backups und die IHK-PDFs) — ohne
   jede Anmeldung. Deshalb wird hier dekodiert, gegen die Wurzel
   aufgelöst und erst der reale Zielpfad bewertet.
   =================================================================== */

const path = require('path');

// Verzeichnisnamen, die nie ausgeliefert werden dürfen — auf JEDER Ebene,
// nicht nur direkt unter der Wurzel. Vergleich case-insensitiv, weil das
// Windows-Dateisystem /BACKEND/ genauso auflöst wie /backend/.
const GESPERRTE_ORDNER = ['backend', '.git', 'node_modules'];

/* URL-Pfad → absoluter Zielpfad unterhalb von root.
   Liefert null, wenn die Anfrage schon syntaktisch unbrauchbar ist
   (kaputte Prozentkodierung wie "%zz" lässt decodeURIComponent werfen,
   NUL-Byte im Pfad). Solche Anfragen behandelt der Aufrufer wie einen
   Treffer, also 404. */
function aufloesen(urlPfad, root) {
  let dekodiert;
  try {
    dekodiert = decodeURIComponent(String(urlPfad == null ? '' : urlPfad));
  } catch {
    return null;                                  // z. B. "%zz" oder "%2"
  }
  if (dekodiert.includes('\0')) return null;
  // Backslashes gelten unter Windows als Trenner; führende Trenner weg,
  // damit path.resolve den Pfad als relativ zur Wurzel behandelt (sonst
  // würde "//backend/..." als eigener absoluter Pfad gelesen).
  const relativ = dekodiert.replace(/\\/g, '/').replace(/^\/+/, '');
  return path.resolve(root, relativ);
}

/* true = Anfrage ablehnen (404). Geprüft wird der aufgelöste Pfad:
   - außerhalb der Wurzel (Path-Traversal) → gesperrt
   - irgendein Pfadsegment in GESPERRTE_ORDNER → gesperrt
   Ein Segment muss dabei EXAKT passen: "backendinfo.js" oder
   "backend-doku/" sind erlaubt, nur "backend" selbst nicht. */
function istGesperrterPfad(urlPfad, root) {
  const wurzel = path.resolve(root);
  const ziel = aufloesen(urlPfad, wurzel);
  if (ziel === null) return true;

  const rel = path.relative(wurzel, ziel);
  if (rel === '') return false;                   // die Wurzel selbst
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    return true;                                  // zeigt aus der Wurzel heraus
  }
  return rel.split(path.sep)
    .some((teil) => GESPERRTE_ORDNER.includes(teil.toLowerCase()));
}

/* Express-Middleware-Fabrik: vor express.static einhängen. */
function staticGuard(root) {
  return function guard(req, res, next) {
    if (istGesperrterPfad(req.path, root)) return res.status(404).send('Not found');
    next();
  };
}

module.exports = { istGesperrterPfad, staticGuard, GESPERRTE_ORDNER };
