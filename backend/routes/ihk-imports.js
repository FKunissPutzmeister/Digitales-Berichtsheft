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

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PDF_RE  = /^[\w.\-]+\.pdf$/i;

/* Pfadsegmente aus der URL prüfen, bevor daraus ein Dateipfad wird: Ordner muss
   eine GUID sein, Datei genau das Muster von safeName() (kein „/", kein „\",
   also auch kein „.."). Rückgabe: absoluter Pfad oder null. */
function pfadOk(oid, datei) {
  if (!GUID_RE.test(String(oid)) || !PDF_RE.test(String(datei))) return null;
  return path.join(DATA_DIR, oid, datei);
}

function nurDeveloper(req, res, next) {
  if (!req.user || req.user.role !== 'developer') {
    return res.status(403).json({ error: 'Nur für Developer.' });
  }
  next();
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

// GET /api/ihk-imports — Archiv-Liste über alle Azubis (developer-only).
router.get('/', nurDeveloper, (req, res) => {
  try {
    if (!fs.existsSync(DATA_DIR)) return res.json([]);
    const out = [];
    for (const oid of fs.readdirSync(DATA_DIR)) {
      if (!GUID_RE.test(oid)) continue;
      for (const datei of fs.readdirSync(path.join(DATA_DIR, oid))) {
        if (!PDF_RE.test(datei)) continue;
        const p = path.join(DATA_DIR, oid, datei);
        // Meta-JSON ist Beigabe: fehlt/kaputt → Eintrag trotzdem listen (Datei zählt).
        let meta = {};
        try { meta = JSON.parse(fs.readFileSync(p + '.json', 'utf8')); } catch (_) {}
        const st = fs.statSync(p);
        out.push({
          oid, datei,
          azubiName:     meta.azubiName || null,
          origName:      meta.origName || datei,
          groesseBytes:  st.size,
          hochgeladenAm: meta.hochgeladenAm || st.mtime.toISOString(),
          wochen:        meta.parse && Array.isArray(meta.parse.wochen) ? meta.parse.wochen.length : null,
          modus:         (meta.parse && meta.parse.modus) || null,
          warnungen:     (meta.parse && meta.parse.warnungen) || [],
        });
      }
    }
    out.sort((a, b) => String(b.hochgeladenAm).localeCompare(String(a.hochgeladenAm)));
    res.setHeader('Cache-Control', 'no-store');   // personenbezogen → nicht im Browser-Cache halten
    res.json(out);
  } catch (e) {
    logError({ quelle: 'backend', nachricht: `[ihk-imports] Liste: ${e.message}`, stack: e.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: 'Laden fehlgeschlagen.' });
  }
});

// GET /api/ihk-imports/:oid/:datei — archivierte PDF ausliefern (developer-only).
router.get('/:oid/:datei', nurDeveloper, (req, res) => {
  const p = pfadOk(req.params.oid, req.params.datei);
  if (!p) return res.status(400).json({ error: 'Ungültiger Pfad.' });
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'Datei nicht gefunden.' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'no-store');   // personenbezogen → nicht im Browser-Cache halten
  res.setHeader('Content-Disposition', `inline; filename="${req.params.datei}"`);
  fs.createReadStream(p).pipe(res);
});

module.exports = router;
module.exports.pfadOk = pfadOk;   // für den Unit-Test
