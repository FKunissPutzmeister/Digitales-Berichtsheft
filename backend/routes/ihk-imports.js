const router = require('express').Router();
const multer = require('multer');
const fs = require('node:fs');
const path = require('node:path');
const { logError } = require('../services/fehlerberichte');

/* Legt importierte IHK-Ausbildungsnachweis-PDFs serverseitig ab, damit der
   Original-Nachweis später erneut geprüft werden kann ("guck dir die Datei
   nochmal an und prüfe sie auf Fehler"). Reines Entwickler-/Support-Archiv.

   Speicherort: backend/data/ihk-imports/<azubiOid>/ — bewusst UNTER backend/,
   denn server.js blockt /backend/* vom statischen Ausliefern (nicht web-
   erreichbar), und .gitignore hält backend/data/ aus dem geteilten Repo
   (die PDFs enthalten personenbezogene Daten). */
const DATA_DIR = path.join(__dirname, '..', 'data', 'ihk-imports');
const MAX_BYTES = 30 * 1024 * 1024; // 30 MB (IHK-Volljahres-Export kann groß sein)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES } });

// Dateiname entschärfen: nur Wort-/Punkt-/Bindestrich-Zeichen, Länge begrenzen.
function safeName(n) {
  const s = String(n || 'nachweis.pdf').replace(/[^\w.\-]+/g, '_');
  return s.slice(-120) || 'nachweis.pdf';
}

// POST /api/ihk-imports  (multipart: datei + optional meta-JSON)
router.post('/', (req, res) => {
  upload.single('datei')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Datei zu groß (max. 30 MB).' });
      return res.status(400).json({ error: err.message });
    }
    try {
      if (!req.file) return res.status(400).json({ error: 'Keine Datei.' });
      // Nur PDFs annehmen (Endung ODER %PDF-Signatur) — Upload landet auf der
      // Platte, daher am Trust-Boundary auf den erwarteten Typ begrenzen.
      const istPdf = /\.pdf$/i.test(req.file.originalname || '')
        || (req.file.buffer && req.file.buffer.slice(0, 4).toString('latin1') === '%PDF');
      if (!istPdf) return res.status(400).json({ error: 'Nur PDF-Dateien erlaubt.' });
      // Nur das EIGENE Heft archivieren — Ziel-Oid ist immer der eingeloggte
      // Nutzer (der Import läuft im Azubi-Profil), kein fremder Oid aus dem Body.
      const azubiOid = req.user.oid;
      const dir = path.join(DATA_DIR, azubiOid);
      fs.mkdirSync(dir, { recursive: true });

      const ts   = new Date().toISOString().replace(/[:.]/g, '-');
      const base = `${ts}_${safeName(req.file.originalname)}`;
      fs.writeFileSync(path.join(dir, base), req.file.buffer);

      let parsed = null;
      try { parsed = req.body && req.body.meta ? JSON.parse(req.body.meta) : null; } catch (_) { parsed = null; }
      const meta = {
        azubiOid,
        azubiName:    req.user.name,
        origName:     req.file.originalname,
        groesseBytes: req.file.size,
        hochgeladenAm: new Date().toISOString(),
        parse:        parsed,   // { wochen:[{kw,year,status}], warnungen, modus } — für schnellen Soll/Ist-Abgleich
      };
      fs.writeFileSync(path.join(dir, base + '.json'), JSON.stringify(meta, null, 2));

      res.json({ ok: true, datei: base });
    } catch (e) {
      logError({ quelle: 'backend', nachricht: `[ihk-imports] Speichern: ${e.message}`, stack: e.stack,
        kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
      res.status(500).json({ error: 'Speichern fehlgeschlagen.' });
    }
  });
});

module.exports = router;
