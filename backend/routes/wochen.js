const router = require('express').Router();
const { getPool, sql } = require('../db/connection');
const { darfWocheSehen, darfWocheKorrigieren } = require('../services/zugriff');
const { ladeKorrekturKontext, ladeWocheFuerZugriff } = require('../services/zugriffContext');

// GET /api/wochen?azubiOid=...  – liefert nur Wochen, die der Nutzer sehen darf
router.get('/', async (req, res) => {
  try {
    const { azubiOid } = req.query;
    const user = req.user;
    const pool = await getPool();

    const request = pool.request();
    let whereClause = '';
    if (azubiOid) {
      request.input('azubiOid', sql.NVarChar(36), azubiOid);
      whereClause = 'WHERE w.AzubiOid = @azubiOid';
    }
    const wochen = await request.query(`
      SELECT w.*,
        (SELECT * FROM dbo.Tage t WHERE t.WocheId = w.Id FOR JSON PATH) AS tageJson,
        (SELECT * FROM dbo.Kommentare k WHERE k.WocheId = w.Id FOR JSON PATH) AS kommentareJson
      FROM dbo.Wochen w
      ${whereClause}
      ORDER BY w.Jahr DESC, w.KW DESC
    `);
    const rows = wochen.recordset.map(parseWoche);

    // Zugriffsfilter: eigenes Heft, aktive Zuweisung (in-Periode) oder Korrektur-Historie.
    const kontext = await ladeKorrekturKontext(pool, user.email);
    const sichtbar = rows.filter(w => darfWocheSehen(user, normWoche(w), kontext));
    res.json(sichtbar);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/wochen/:id  – nur wenn der Nutzer die Woche sehen darf
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
    const woche = parseWoche(result.recordset[0]);

    const kontext = await ladeKorrekturKontext(pool, req.user.email);
    if (!darfWocheSehen(req.user, normWoche(woche), kontext)) {
      return res.status(403).json({ error: 'Keine Berechtigung für diese Woche' });
    }
    res.json(woche);
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
    if (!azubiOid) return res.status(400).json({ error: 'azubiOid fehlt' });
    const pool = await getPool();

    // Zugriffsschutz: nur das eigene Heft ODER ein Heft, für das der Nutzer im
    // Wochenzeitraum aktiv verantwortlich ist. Ohne diese Prüfung könnte jeder
    // Angemeldete das Berichtsheft eines beliebigen Azubis überschreiben.
    const eigenes = azubiOid === req.user.oid;
    if (!eigenes) {
      const kontext = await ladeKorrekturKontext(pool, req.user.oid);
      const zielWoche = { azubiOid, start: startDatum, ende: endDatum };
      if (!darfWocheKorrigieren(req.user, zielWoche, kontext)) {
        return res.status(403).json({ error: 'Keine Berechtigung für dieses Berichtsheft.' });
      }
    }

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
// Azubi (eigenes Heft): 'offen'/'freigegeben'. Korrektor (aktiv verantwortlich):
// 'genehmigt'/'abgelehnt' → setzt KorrigiertVon/KorrigiertAm.
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const pool = await getPool();
    const woche = await ladeWocheFuerZugriff(pool, req.params.id);
    if (!woche) return res.status(404).json({ error: 'Woche nicht gefunden' });

    const user = req.user;
    const istEigenes = woche.azubiOid === user.oid;
    const kontext = await ladeKorrekturKontext(pool, user.email);
    const istKorrektor = darfWocheKorrigieren(user, woche, kontext);

    const AZUBI_STATUS = ['offen', 'freigegeben'];
    const KORREKTOR_STATUS = ['genehmigt', 'abgelehnt'];

    let setzeKorrektur = false;
    if (istEigenes && AZUBI_STATUS.includes(status)) {
      // Azubi gibt eigenes Heft frei oder nimmt zurück – keine Attribution.
    } else if (istKorrektor && KORREKTOR_STATUS.includes(status)) {
      setzeKorrektur = true;
    } else {
      return res.status(403).json({ error: 'Keine Berechtigung, diesen Status zu setzen.' });
    }

    const request = pool.request()
      .input('id',     sql.Int,          req.params.id)
      .input('status', sql.NVarChar(20), status);
    let setClause = 'Status = @status';
    if (setzeKorrektur) {
      request.input('korrigiertVon', sql.NVarChar(36), user.oid);
      setClause += ', KorrigiertVon = @korrigiertVon, KorrigiertAm = SYSUTCDATETIME()';
    }
    await request.query(`UPDATE dbo.Wochen SET ${setClause} WHERE Id = @id`);
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

// parseWoche-Ergebnis → normalisierte Woche für die Zugriffsprüfung.
function normWoche(w) {
  return {
    azubiOid: w.AzubiOid,
    start: w.StartDatum,
    ende: w.EndDatum,
    korrigiertVon: w.KorrigiertVon,
    kommentarAutoren: (w.kommentare || []).map(k => k.UserOid),
  };
}

module.exports = router;
