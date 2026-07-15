const router = require('express').Router();
const { getPool, sql } = require('../db/connection');
const { darfWocheSehen, darfWocheKorrigieren, rolleFuerWoche, wochenAktionen } = require('../services/zugriff');
const { ladeKorrekturKontext, ladeWocheFuerZugriff } = require('../services/zugriffContext');
const { logError } = require('../services/fehlerberichte');

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
    const kontext = await ladeKorrekturKontext(pool, user);
    const sichtbar = rows
      .filter(w => darfWocheSehen(user, normWoche(w), kontext))
      .map(w => annotiereWoche(w, user, kontext));
    res.json(sichtbar);
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[wochen] list: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
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

    const kontext = await ladeKorrekturKontext(pool, req.user);
    if (!darfWocheSehen(req.user, normWoche(woche), kontext)) {
      return res.status(403).json({ error: 'Keine Berechtigung für diese Woche' });
    }
    annotiereWoche(woche, req.user, kontext);
    res.json(woche);
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[wochen] get/:id: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
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
      const kontext = await ladeKorrekturKontext(pool, req.user);
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
    logError({ quelle: 'backend', nachricht: `[wochen] upsert: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/wochen/:id/status
// Übergang wird über rolleFuerWoche + wochenAktionen (services/zugriff.js)
// validiert. Prüfer: freigegeben→erstgenehmigt|abgelehnt. Ausbilder:
// freigegeben|erstgenehmigt→genehmigt|abgelehnt (Rückgabe setzt EndabnahmeDirekt=1).
// Azubi: offen↔freigegeben. Korrektur-Aktionen stempeln KorrigiertVon/Am.
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const pool = await getPool();
    const woche = await ladeWocheFuerZugriff(pool, req.params.id);
    if (!woche) return res.status(404).json({ error: 'Woche nicht gefunden' });

    const user = req.user;
    const kontext = await ladeKorrekturKontext(pool, user);
    const rolle = rolleFuerWoche(user, woche, kontext);
    const treffer = wochenAktionen(rolle, woche.status, woche.endabnahmeDirekt)
      .find(a => a.zielStatus === status);
    if (!treffer) {
      return res.status(403).json({ error: 'Keine Berechtigung, diesen Status zu setzen.' });
    }

    const request = pool.request()
      .input('id',     sql.Int,          req.params.id)
      .input('status', sql.NVarChar(20), status)
      .input('flag',   sql.Bit,          treffer.endabnahmeDirekt);
    let setClause = 'Status = @status, EndabnahmeDirekt = @flag';
    if (treffer.korrektur) {
      request.input('korrigiertVon', sql.NVarChar(36), user.oid);
      setClause += ', KorrigiertVon = @korrigiertVon, KorrigiertAm = SYSUTCDATETIME()';
    }
    await request.query(`UPDATE dbo.Wochen SET ${setClause} WHERE Id = @id`);

    if (treffer.zielStatus === 'erstgenehmigt') {
      // Dauerhafte Ausbilder des Azubis über anstehende Endabnahme informieren.
      const rd = await pool.request()
        .input('azubiOid', sql.NVarChar(36), woche.azubiOid)
        .query('SELECT AusbilderOid FROM dbo.AusbilderAzubis WHERE AzubiOid = @azubiOid');
      for (const r of rd.recordset) {
        await pool.request()
          .input('userOid',     sql.NVarChar(36), r.AusbilderOid)
          .input('typ',         sql.NVarChar(20), 'erstgenehmigt')
          .input('wocheId',     sql.Int,          req.params.id)
          .input('fromUserOid', sql.NVarChar(36), user.oid)
          .query(`INSERT INTO dbo.Benachrichtigungen (UserOid, Typ, WocheId, FromUserOid)
                  VALUES (@userOid, @typ, @wocheId, @fromUserOid)`);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[wochen] status: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

// Reichert eine parseWoche-Zeile mit der Betrachter-Sicht an:
// viewerRolle + erlaubteAktionen (Aktions-Slugs) für das aktuelle Frontend.
function annotiereWoche(row, user, kontext) {
  const rolle = rolleFuerWoche(user, normWoche(row), kontext);
  row.viewerRolle = rolle;
  row.erlaubteAktionen = wochenAktionen(rolle, row.Status, row.EndabnahmeDirekt).map(a => a.aktion);
  return row;
}

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
