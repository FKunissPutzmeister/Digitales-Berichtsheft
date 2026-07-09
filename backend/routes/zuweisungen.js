const router = require('express').Router();
const { getPool, sql } = require('../db/connection');

// Nur Nutzer mit Planungsrecht dürfen Zuweisungen anlegen/löschen.
function nurPlaner(req, res, next) {
  if (!req.user || !req.user.kannPlanen) {
    return res.status(403).json({ error: 'Kein Planungsrecht.' });
  }
  next();
}

// GET /api/zuweisungen?azubiOid=...&verantwEmail=...
// Liefert AzubiName/AzubiBeruf per JOIN mit (erspart dem Planer ein
// GET /users/:oid pro Zuweisung) und gated die Sichtbarkeit nach Rolle:
// Planer alles, Azubis/DH nur eigene, Ausbilder ihre betreuten Azubis
// bzw. Zuweisungen mit eigener VerantwEmail.
router.get('/', async (req, res) => {
  try {
    const { azubiOid, verantwEmail } = req.query;
    const pool = await getPool();
    const request = pool.request();
    let where = '1=1';

    const u = req.user;
    if (!u.kannPlanen) {
      if (u.istAzubi || u.istDhStudent) {
        request.input('gateOid', sql.NVarChar(36), u.oid);
        where += ' AND z.AzubiOid = @gateOid';
      } else if (u.istAusbilder) {
        request.input('gateOid', sql.NVarChar(36), u.oid);
        request.input('gateEmail', sql.NVarChar(255), String(u.email || '').toLowerCase());
        where += ` AND (z.VerantwEmail = @gateEmail
          OR z.AzubiOid IN (SELECT AzubiOid FROM dbo.AusbilderAzubis WHERE AusbilderOid = @gateOid))`;
      } else {
        return res.json([]);
      }
    }

    if (azubiOid) {
      request.input('azubiOid', sql.NVarChar(36), azubiOid);
      where += ' AND z.AzubiOid = @azubiOid';
    }
    if (verantwEmail) {
      request.input('verantwEmail', sql.NVarChar(255), String(verantwEmail).toLowerCase());
      where += ' AND z.VerantwEmail = @verantwEmail';
    }

    const result = await request.query(`
      SELECT z.*, u.Name AS AzubiName, u.Beruf AS AzubiBeruf
      FROM dbo.Zuweisungen z
      LEFT JOIN dbo.Users u ON u.Oid = z.AzubiOid
      WHERE ${where}
      ORDER BY z.AzubiOid, z.Von DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/zuweisungen
router.post('/', nurPlaner, async (req, res) => {
  try {
    const { azubiOid, verantwEmail, abteilung, von, bis } = req.body;
    const pool = await getPool();

    // Überschneidung mit bestehender Zuweisung desselben Azubis verbindlich
    // verhindern. Intervalltest: @von <= vorhandenes Bis UND vorhandenes Von
    // <= @bis. NULL-Bis (offene Zuweisung) zählt als unbegrenzt.
    const overlap = await pool.request()
      .input('azubiOid', sql.NVarChar(36), azubiOid)
      .input('von',      sql.Date,         von)
      .input('bis',      sql.Date,         bis)
      .query(`
        SELECT TOP 1 Abteilung, Von, Bis
        FROM dbo.Zuweisungen
        WHERE AzubiOid = @azubiOid
          AND @von <= ISNULL(Bis, '9999-12-31')
          AND Von  <= ISNULL(@bis, '9999-12-31')
        ORDER BY Von
      `);
    if (overlap.recordset.length) {
      const c = overlap.recordset[0];
      const fmt = d => d ? new Date(d).toLocaleDateString('de-DE') : 'offen';
      const abt = c.Abteilung || 'ohne Abteilung';
      return res.status(409).json({
        error: `In diesem Zeitraum besteht für diesen Azubi bereits eine Zuweisung (${abt}, ${fmt(c.Von)}–${fmt(c.Bis)}).`
      });
    }

    const result = await pool.request()
      .input('azubiOid',     sql.NVarChar(36),  azubiOid)
      .input('verantwEmail', sql.NVarChar(255), (verantwEmail || '').toLowerCase() || null)
      .input('abteilung',    sql.NVarChar(100), abteilung || null)
      .input('von',          sql.Date,          von)
      .input('bis',          sql.Date,          bis)
      .query(`
        INSERT INTO dbo.Zuweisungen (AzubiOid, VerantwEmail, Abteilung, Von, Bis)
        OUTPUT inserted.Id
        VALUES (@azubiOid, @verantwEmail, @abteilung, @von, @bis)
      `);
    res.json({ id: result.recordset[0].Id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/zuweisungen/:id – Zeitraum/Abteilung/Verantwortlichen ändern
// (Drag/Resize + Edit-Dialog im Planer). Überschneidungsprüfung wie beim
// Anlegen, aber die eigene Zeile ausgenommen. AzubiOid ist bewusst nicht
// änderbar (Station umhängen = löschen + neu anlegen).
router.patch('/:id', nurPlaner, async (req, res) => {
  try {
    const id = Number(req.params.id) || 0;
    const pool = await getPool();

    const existing = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM dbo.Zuweisungen WHERE Id = @id');
    const row = existing.recordset[0];
    if (!row) return res.status(404).json({ error: 'Zuweisung nicht gefunden.' });

    const von = req.body.von ?? row.Von;
    const bis = req.body.bis !== undefined ? req.body.bis : row.Bis;
    const abteilung = req.body.abteilung !== undefined ? (req.body.abteilung || null) : row.Abteilung;
    const verantwEmail = req.body.verantwEmail !== undefined
      ? ((req.body.verantwEmail || '').toLowerCase() || null)
      : row.VerantwEmail;

    const overlap = await pool.request()
      .input('id',       sql.Int,          id)
      .input('azubiOid', sql.NVarChar(36), row.AzubiOid)
      .input('von',      sql.Date,         von)
      .input('bis',      sql.Date,         bis)
      .query(`
        SELECT TOP 1 Abteilung, Von, Bis
        FROM dbo.Zuweisungen
        WHERE AzubiOid = @azubiOid
          AND Id <> @id
          AND @von <= ISNULL(Bis, '9999-12-31')
          AND Von  <= ISNULL(@bis, '9999-12-31')
        ORDER BY Von
      `);
    if (overlap.recordset.length) {
      const c = overlap.recordset[0];
      const fmt = d => d ? new Date(d).toLocaleDateString('de-DE') : 'offen';
      const abt = c.Abteilung || 'ohne Abteilung';
      return res.status(409).json({
        error: `In diesem Zeitraum besteht für diesen Azubi bereits eine Zuweisung (${abt}, ${fmt(c.Von)}–${fmt(c.Bis)}).`
      });
    }

    await pool.request()
      .input('id',           sql.Int,           id)
      .input('verantwEmail', sql.NVarChar(255), verantwEmail)
      .input('abteilung',    sql.NVarChar(100), abteilung)
      .input('von',          sql.Date,          von)
      .input('bis',          sql.Date,          bis)
      .query(`
        UPDATE dbo.Zuweisungen
        SET VerantwEmail = @verantwEmail, Abteilung = @abteilung, Von = @von, Bis = @bis
        WHERE Id = @id
      `);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/zuweisungen/:id
router.delete('/:id', nurPlaner, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, Number(req.params.id) || 0)
      .query('DELETE FROM dbo.Zuweisungen WHERE Id = @id');
    if (!result.rowsAffected[0]) {
      return res.status(404).json({ error: 'Zuweisung nicht gefunden.' });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/zuweisungen/:id – eine einzelne Zuweisung (für die Beurteilungsseite,
// die die Zuweisung direkt per Id auflöst statt über nutzergebundene Listen).
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, Number(req.params.id) || 0)
      .query('SELECT * FROM dbo.Zuweisungen WHERE Id = @id');
    const row = result.recordset[0];
    if (!row) return res.status(404).json({ error: 'Zuweisung nicht gefunden.' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
