const router = require('express').Router();
const multer = require('multer');
const { getPool, sql } = require('../db/connection');
const { darfWocheKorrigieren, darfWocheSehen } = require('../services/zugriff');
const { ladeKorrekturKontext, ladeWocheFuerZugriff } = require('../services/zugriffContext');

// ── Upload-Konfiguration ──────────────────────────────────────────
// memoryStorage: die Datei landet als Buffer in req.file.buffer und geht
// direkt als VARBINARY in die DB – kein temporäres File auf der Platte.
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
});

// Erlaubte Dateitypen (Endung, kleingeschrieben). Endungs-basiert, weil der
// vom Browser gemeldete MIME-Typ je nach OS/Datei unzuverlässig ist
// (z.B. .docx kommt oft als application/octet-stream).
const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'docx', 'xlsx', 'pptx', 'txt'];
function extOf(name) {
  const m = /\.([^.]+)$/.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

// multer-Wrapper, der Upload-Fehler (z.B. Datei zu groß) sauber als
// JSON-Antwort zurückgibt statt sie an den globalen Error-Handler zu reichen.
function uploadSingle(req, res, next) {
  upload.single('datei')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Datei zu groß (max. 10 MB).' });
      }
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}

// Prüft, ob der aktuelle User die Woche bearbeiten darf: Eigentümer (Azubi)
// ODER aktiv verantwortlich – UND Woche nicht schreibgeschützt.
async function pruefeBearbeitbar(pool, wocheId, user) {
  const woche = await ladeWocheFuerZugriff(pool, wocheId);
  if (!woche) return { status: 404, error: 'Woche nicht gefunden' };
  if (woche.status === 'freigegeben' || woche.status === 'genehmigt') {
    return { status: 403, error: 'Woche ist schreibgeschützt' };
  }
  if (woche.azubiOid === user.oid) return { ok: true };
  const kontext = await ladeKorrekturKontext(pool, user);
  if (darfWocheKorrigieren(user, woche, kontext)) return { ok: true };
  return { status: 403, error: 'Keine Berechtigung für diese Woche' };
}

// GET /api/wochen/:wocheId/anhaenge  – Metadaten (nur wenn Woche sichtbar)
router.get('/:wocheId/anhaenge', async (req, res) => {
  try {
    const pool = await getPool();
    const woche = await ladeWocheFuerZugriff(pool, req.params.wocheId);
    if (!woche) return res.status(404).json({ error: 'Woche nicht gefunden' });
    const kontext = await ladeKorrekturKontext(pool, req.user);
    if (!darfWocheSehen(req.user, woche, kontext)) {
      return res.status(403).json({ error: 'Keine Berechtigung für diese Woche' });
    }
    const result = await pool.request()
      .input('wocheId', sql.Int, req.params.wocheId)
      .query(`
        SELECT Id, WocheId, Dateiname, MimeTyp, GroesseBytes, HochgeladenVon, HochgeladenAm
        FROM dbo.Anhaenge
        WHERE WocheId = @wocheId
        ORDER BY HochgeladenAm ASC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/wochen/:wocheId/anhaenge  – Upload (nur Eigentümer, Woche bearbeitbar)
router.post('/:wocheId/anhaenge', uploadSingle, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei übermittelt.' });

    // Dateiname kann von multer in latin1 ankommen → nach UTF-8 normalisieren,
    // damit Umlaute im Dateinamen nicht zerschossen werden.
    const dateiname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    if (!ALLOWED_EXT.includes(extOf(dateiname))) {
      return res.status(400).json({
        error: 'Dateityp nicht erlaubt. Erlaubt: ' + ALLOWED_EXT.join(', '),
      });
    }

    const pool = await getPool();
    const check = await pruefeBearbeitbar(pool, req.params.wocheId, req.user);
    if (!check.ok) return res.status(check.status).json({ error: check.error });

    const result = await pool.request()
      .input('wocheId',   sql.Int,               req.params.wocheId)
      .input('dateiname', sql.NVarChar(255),     dateiname)
      .input('mimeTyp',   sql.NVarChar(100),     req.file.mimetype || null)
      .input('groesse',   sql.Int,               req.file.size)
      .input('inhalt',    sql.VarBinary(sql.MAX), req.file.buffer)
      .input('userOid',   sql.NVarChar(36),      req.user.oid)
      .query(`
        INSERT INTO dbo.Anhaenge (WocheId, Dateiname, MimeTyp, GroesseBytes, Inhalt, HochgeladenVon)
        OUTPUT inserted.Id, inserted.WocheId, inserted.Dateiname, inserted.MimeTyp,
               inserted.GroesseBytes, inserted.HochgeladenVon, inserted.HochgeladenAm
        VALUES (@wocheId, @dateiname, @mimeTyp, @groesse, @inhalt, @userOid)
      `);
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/wochen/anhaenge/:id/download  – streamt die Bytes (nur wenn Woche sichtbar)
router.get('/anhaenge/:id/download', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT WocheId, Dateiname, MimeTyp, Inhalt FROM dbo.Anhaenge WHERE Id = @id');
    const row = result.recordset[0];
    if (!row) return res.status(404).json({ error: 'Anhang nicht gefunden' });

    const woche = await ladeWocheFuerZugriff(pool, row.WocheId);
    const kontext = await ladeKorrekturKontext(pool, req.user);
    if (!woche || !darfWocheSehen(req.user, woche, kontext)) {
      return res.status(403).json({ error: 'Keine Berechtigung für diesen Anhang' });
    }

    const encoded = encodeURIComponent(row.Dateiname);
    res.setHeader('Content-Type', row.MimeTyp || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`);
    res.send(row.Inhalt); // VARBINARY → Buffer
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/wochen/anhaenge/:id  – löschen (nur Eigentümer, Woche bearbeitbar)
router.delete('/anhaenge/:id', async (req, res) => {
  try {
    const pool = await getPool();

    // Zugehörige Woche ermitteln, um Eigentümer/Status zu prüfen.
    const wocheRes = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT WocheId FROM dbo.Anhaenge WHERE Id = @id');
    const anhang = wocheRes.recordset[0];
    if (!anhang) return res.status(404).json({ error: 'Anhang nicht gefunden' });

    const check = await pruefeBearbeitbar(pool, anhang.WocheId, req.user);
    if (!check.ok) return res.status(check.status).json({ error: check.error });

    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM dbo.Anhaenge WHERE Id = @id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
