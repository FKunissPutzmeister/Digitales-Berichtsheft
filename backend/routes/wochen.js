const router = require('express').Router();
const { getPool, sql } = require('../db/connection');

// GET /api/wochen?azubiOid=...
router.get('/', async (req, res) => {
  try {
    const { azubiOid } = req.query;
    const pool = await getPool();
    const request = pool.request();

    if (azubiOid) {
      request.input('azubiOid', sql.NVarChar(36), azubiOid);
      const wochen = await request.query(`
        SELECT w.*,
          (SELECT * FROM dbo.Tage t WHERE t.WocheId = w.Id FOR JSON PATH) AS tageJson,
          (SELECT * FROM dbo.Kommentare k WHERE k.WocheId = w.Id FOR JSON PATH) AS kommentareJson
        FROM dbo.Wochen w
        WHERE w.AzubiOid = @azubiOid
        ORDER BY w.Jahr DESC, w.KW DESC
      `);
      const rows = wochen.recordset.map(parseWoche);
      return res.json(rows);
    }

    // Ausbilder/Admin: alle Wochen
    const wochen = await request.query(`
      SELECT w.*,
        (SELECT * FROM dbo.Tage t WHERE t.WocheId = w.Id FOR JSON PATH) AS tageJson,
        (SELECT * FROM dbo.Kommentare k WHERE k.WocheId = w.Id FOR JSON PATH) AS kommentareJson
      FROM dbo.Wochen w
      ORDER BY w.Jahr DESC, w.KW DESC
    `);
    res.json(wochen.recordset.map(parseWoche));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/wochen/:id
router.get('/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`
        SELECT w.*,
          (SELECT * FROM dbo.Tage t WHERE t.WocheId = w.Id FOR JSON PATH) AS tageJson,
          (SELECT * FROM dbo.Kommentare k WHERE k.WocheId = w.Id FOR JSON PATH) AS kommentareJson
        FROM dbo.Wochen w WHERE w.Id = @id
      `);
    if (!result.recordset[0]) return res.status(404).json({ error: 'Woche nicht gefunden' });
    res.json(parseWoche(result.recordset[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/wochen  (upsert)
router.post('/', async (req, res) => {
  try {
    const {
      azubiOid, kw, jahr, startDatum, endDatum, status, gesamtstunden, tage,
      typ, wochenOrt, unterweisungAktiv, betriebEintrag, schuleEintrag, unterweisungEintrag,
    } = req.body;
    const pool = await getPool();

    // Woche upserten
    const upsert = await pool.request()
      .input('azubiOid',            sql.NVarChar(36),      azubiOid)
      .input('kw',                  sql.TinyInt,            kw)
      .input('jahr',                sql.SmallInt,           jahr)
      .input('startDatum',          sql.Date,               startDatum)
      .input('endDatum',            sql.Date,               endDatum)
      .input('status',              sql.NVarChar(20),       status || 'offen')
      .input('gesamtstunden',       sql.Decimal(5, 2),      gesamtstunden || 0)
      .input('typ',                 sql.NVarChar(20),       typ || null)
      .input('wochenOrt',           sql.NVarChar(20),       wochenOrt || null)
      .input('unterweisungAktiv',   sql.Bit,                unterweisungAktiv ? 1 : 0)
      .input('betriebEintrag',      sql.NVarChar(sql.MAX),  betriebEintrag || null)
      .input('schuleEintrag',       sql.NVarChar(sql.MAX),  schuleEintrag || null)
      .input('unterweisungEintrag', sql.NVarChar(sql.MAX),  unterweisungEintrag || null)
      .query(`
        MERGE dbo.Wochen AS target
        USING (SELECT @azubiOid AS AzubiOid, @kw AS KW, @jahr AS Jahr) AS source
          ON target.AzubiOid = source.AzubiOid AND target.KW = source.KW AND target.Jahr = source.Jahr
        WHEN MATCHED THEN
          UPDATE SET StartDatum = @startDatum, EndDatum = @endDatum,
                     Status = @status, Gesamtstunden = @gesamtstunden,
                     Typ = @typ, WochenOrt = @wochenOrt, UnterweisungAktiv = @unterweisungAktiv,
                     BetriebEintrag = @betriebEintrag, SchuleEintrag = @schuleEintrag,
                     UnterweisungEintrag = @unterweisungEintrag
        WHEN NOT MATCHED THEN
          INSERT (AzubiOid, KW, Jahr, StartDatum, EndDatum, Status, Gesamtstunden,
                  Typ, WochenOrt, UnterweisungAktiv,
                  BetriebEintrag, SchuleEintrag, UnterweisungEintrag)
          VALUES (@azubiOid, @kw, @jahr, @startDatum, @endDatum, @status, @gesamtstunden,
                  @typ, @wochenOrt, @unterweisungAktiv,
                  @betriebEintrag, @schuleEintrag, @unterweisungEintrag)
        OUTPUT inserted.Id;
      `);

    const wocheId = upsert.recordset[0].Id;

    // Tage speichern (delete + re-insert)
    if (Array.isArray(tage) && tage.length > 0) {
      await pool.request()
        .input('wocheId', sql.Int, wocheId)
        .query('DELETE FROM dbo.Tage WHERE WocheId = @wocheId');

      for (const tag of tage) {
        await pool.request()
          .input('wocheId',             sql.Int,               wocheId)
          .input('datum',               sql.Date,              tag.datum)
          .input('anwesenheit',         sql.NVarChar(30),      tag.anwesenheit || null)
          .input('ort',                 sql.NVarChar(30),      tag.ort || null)
          .input('eintrag',             sql.NVarChar(sql.MAX), tag.eintrag || null)
          .input('tagdauer',            sql.NVarChar(10),      (tag.tagdauer === 'halbtag' ? 'halbtag' : 'ganztag'))
          .input('betriebEintrag',      sql.NVarChar(sql.MAX), tag.betriebEintrag || null)
          .input('schuleEintrag',       sql.NVarChar(sql.MAX), tag.schuleEintrag || null)
          .input('unterweisungEintrag', sql.NVarChar(sql.MAX), tag.unterweisungEintrag || null)
          .query(`
            INSERT INTO dbo.Tage
              (WocheId, Datum, Anwesenheit, Ort, Eintrag, Tagdauer,
               BetriebEintrag, SchuleEintrag, UnterweisungEintrag)
            VALUES
              (@wocheId, @datum, @anwesenheit, @ort, @eintrag, @tagdauer,
               @betriebEintrag, @schuleEintrag, @unterweisungEintrag)
          `);
      }
    }

    res.json({ id: wocheId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/wochen/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const pool = await getPool();
    await pool.request()
      .input('id',     sql.Int,         req.params.id)
      .input('status', sql.NVarChar(20), status)
      .query('UPDATE dbo.Wochen SET Status = @status WHERE Id = @id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function parseWoche(row) {
  return {
    ...row,
    tage:        row.tageJson        ? JSON.parse(row.tageJson)        : [],
    kommentare:  row.kommentareJson  ? JSON.parse(row.kommentareJson)  : [],
    tageJson:       undefined,
    kommentareJson: undefined,
  };
}

module.exports = router;
