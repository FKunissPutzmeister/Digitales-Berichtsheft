const router = require('express').Router();
const { getPool, sql } = require('../db/connection');
const { darfWocheSehen, darfWocheKorrigieren, rolleFuerWoche, wochenAktionen, schreibGate } = require('../services/zugriff');
const { ladeKorrekturKontext, ladeWocheFuerZugriff } = require('../services/zugriffContext');
const { logError } = require('../services/fehlerberichte');

// Wochen-Ids sind INTEGER (im Gegensatz zu den GUID-Ids der Nutzer). Eine
// nicht-numerische :id (z. B. „undefined" aus einem Frontend-Zustand ohne
// gespeicherte Woche) lief bisher bis in mssql und kam als 500 „Validation
// failed for parameter 'id'" zurück – inklusive Eintrag im Fehler-Posteingang,
// obwohl es eine schlichte Fehlbenutzung der Route ist. Guard → 400.
function wocheIdParam(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Ungültige Woche-Id.' });
    return null;
  }
  return id;
}

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
    const id = wocheIdParam(req, res);
    if (id === null) return;
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
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
//
// SCHREIBSCHUTZ: Diese Route setzt den Status NICHT. Wer einreicht, erstgenehmigt
// oder genehmigt, geht über PATCH /:id/status — nur dort läuft der geprüfte
// Rollen-Automat (wochenAktionen). Ohne diese Trennung konnte ein Azubi seine
// eigene Woche per Body-Feld auf 'genehmigt' setzen und den Inhalt einer bereits
// abgenommenen Woche überschreiben.
//
// Ausnahme ?migration=1: Datenübernahme aus einem FREMDEN System (IHK-PDF-Import,
// JSON-Restore eines eigenen Backups). Die darf den mitgelieferten Status
// übernehmen – auch 'genehmigt', weil die Woche in der IHK-Plattform bereits
// genehmigt war –, aber nur im eigenen Heft und nie über eine in DIESER App
// erteilte Abnahme hinweg (siehe schreibGate in services/zugriff.js).
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

    const migration = req.query.migration === '1';
    if (migration && !eigenes) {
      return res.status(403).json({ error: 'Datenübernahme ist nur im eigenen Berichtsheft möglich.' });
    }

    // Woche + Tage in EINER Transaktion speichern. Ohne Transaktion können
    // zwei parallele Autosave-POSTs derselben Woche (Autosave feuert pro Tag
    // getrennt) den DELETE/INSERT-Ablauf verschränken:
    //   A DELETE → B DELETE → A INSERT(Mo) → B INSERT(Mo) → UQ_Tage_Woche_Datum.
    // In der Transaktion hält der DELETE seine Sperren bis zum Commit, sodass
    // der zweite Request wartet und sauber serialisiert wird (kein Duplikat,
    // kein halb geschriebener Zustand).
    const tx = new sql.Transaction(pool);
    await tx.begin();
    let wocheId;
    try {
      // Aktuellen Zustand IM Transaktionsfenster lesen. UPDLOCK+HOLDLOCK, damit
      // zwischen Prüfung und MERGE kein paralleler PATCH den Status kippt
      // (Ausbilder genehmigt, während der Azubi-Autosave noch läuft).
      const vorhanden = (await new sql.Request(tx)
        .input('azubiOid', sql.NVarChar(36), azubiOid)
        .input('kw',       sql.TinyInt,      kw)
        .input('jahr',     sql.SmallInt,     jahr)
        .query(`SELECT Id, Status, KorrigiertVon FROM dbo.Wochen WITH (UPDLOCK, HOLDLOCK)
                 WHERE AzubiOid = @azubiOid AND KW = @kw AND Jahr = @jahr`)).recordset[0] || null;

      const gate = schreibGate(
        vorhanden ? { status: vorhanden.Status, korrigiertVon: vorhanden.KorrigiertVon } : null,
        { migration, wunschStatus: status },
      );
      if (!gate.ok) {
        await tx.rollback();
        return res.status(403).json({ error: gate.grund });
      }

      const upsert = await new sql.Request(tx)
        .input('azubiOid',            sql.NVarChar(36),      azubiOid)
        .input('kw',                  sql.TinyInt,            kw)
        .input('jahr',                sql.SmallInt,           jahr)
        .input('startDatum',          sql.Date,               startDatum)
        .input('endDatum',            sql.Date,               endDatum)
        .input('status',              sql.NVarChar(20),       gate.status)
        .input('gesamtstunden',       sql.Decimal(5, 2),      gesamtstunden || 0)
        .input('typ',                 sql.NVarChar(20),       typ || null)
        .input('wochenOrt',           sql.NVarChar(20),       wochenOrt || null)
        .input('unterweisungAktiv',   sql.Bit,                unterweisungAktiv ? 1 : 0)
        .input('betriebEintrag',      sql.NVarChar(sql.MAX),  betriebEintrag || null)
        .input('schuleEintrag',       sql.NVarChar(sql.MAX),  schuleEintrag || null)
        .input('unterweisungEintrag', sql.NVarChar(sql.MAX),  unterweisungEintrag || null)
        .query(`
          -- WITH (HOLDLOCK): serialisiert den Upsert per Key-Range-Sperre.
          -- Ohne HOLDLOCK werten zwei gleichzeitige POSTs derselben Woche
          -- (z. B. Ausbilder-Korrektur parallel zur Azubi-Bearbeitung, oder
          -- zwei Tabs) unter READ COMMITTED beide WHEN NOT MATCHED aus und
          -- INSERTen beide -> Unique-Verletzung auf (AzubiOid, KW, Jahr)
          -- -> 500. Mit HOLDLOCK wartet der zweite Request bis zum Commit
          -- des ersten und trifft dann sauber den MATCHED-Zweig (UPDATE).
          MERGE dbo.Wochen WITH (HOLDLOCK) AS target
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

      wocheId = upsert.recordset[0].Id;

      // Tage speichern: MERGE je (WocheId, Datum) statt DELETE + Re-Insert.
      // Der alte DELETE brach an FK_Kommentare_Tage (Migration 002, ohne
      // ON DELETE): sobald ein Ausbilder EINEN Tag kommentiert hatte, schlug
      // jedes weitere Speichern der Woche mit Fehler 547 fehl und die Woche
      // war dauerhaft unspeicherbar. Der MERGE hält Tage.Id stabil, damit
      // Tages-Kommentare weiter auf ihren Tag zeigen.
      // Semantik unverändert: der Client schickt immer die vollständige,
      // gemergte Tagesliste, also wird jedes Feld überschrieben (kein COALESCE
      // wie im MCP-Pfad, sonst ließe sich ein Text nicht mehr leeren).
      if (Array.isArray(tage) && tage.length > 0) {
        for (const tag of tage) {
          await new sql.Request(tx)
            .input('wocheId',             sql.Int,               wocheId)
            .input('datum',               sql.Date,              tag.datum)
            .input('anwesenheit',         sql.NVarChar(30),      tag.anwesenheit || null)
            .input('ort',                 sql.NVarChar(30),      tag.ort || null)
            .input('eintrag',             sql.NVarChar(sql.MAX), tag.eintrag || null)
            .input('tagdauer',            sql.NVarChar(10),      (tag.tagdauer === 'halbtag' ? 'halbtag' : 'ganztag'))
            .input('betriebEintrag',      sql.NVarChar(sql.MAX), tag.betriebEintrag || null)
            .input('schuleEintrag',       sql.NVarChar(sql.MAX), tag.schuleEintrag || null)
            .input('unterweisungEintrag', sql.NVarChar(sql.MAX), tag.unterweisungEintrag || null)
            .input('abwesenheitsnotiz',   sql.NVarChar(1000),    tag.abwesenheitsnotiz || null)
            .input('unterweisungAktiv',   sql.Bit,               !!tag.unterweisungAktiv)
            .query(`
              MERGE dbo.Tage WITH (HOLDLOCK) AS target
              USING (SELECT @wocheId AS WocheId, @datum AS Datum) AS source
                ON target.WocheId = source.WocheId AND target.Datum = source.Datum
              WHEN MATCHED THEN
                UPDATE SET Anwesenheit = @anwesenheit, Ort = @ort, Eintrag = @eintrag,
                           Tagdauer = @tagdauer, BetriebEintrag = @betriebEintrag,
                           SchuleEintrag = @schuleEintrag, UnterweisungEintrag = @unterweisungEintrag,
                           Abwesenheitsnotiz = @abwesenheitsnotiz, UnterweisungAktiv = @unterweisungAktiv
              WHEN NOT MATCHED THEN
                INSERT (WocheId, Datum, Anwesenheit, Ort, Eintrag, Tagdauer,
                        BetriebEintrag, SchuleEintrag, UnterweisungEintrag, Abwesenheitsnotiz, UnterweisungAktiv)
                VALUES (@wocheId, @datum, @anwesenheit, @ort, @eintrag, @tagdauer,
                        @betriebEintrag, @schuleEintrag, @unterweisungEintrag, @abwesenheitsnotiz, @unterweisungAktiv);
            `);
        }

        // Tage, die der Client nicht mehr mitschickt, entfernen. Kommentare
        // daran vorher auf Wochenebene lösen (TagId = NULL), sonst greift
        // derselbe FK wieder – der Kommentar bleibt so erhalten.
        const daten = tage.map(t => t.datum).filter(Boolean);
        const platzhalter = daten.map((_, i) => `@d${i}`).join(', ');
        const aufraeumen = new sql.Request(tx).input('wocheId', sql.Int, wocheId);
        daten.forEach((d, i) => aufraeumen.input(`d${i}`, sql.Date, d));
        await aufraeumen.query(`
          UPDATE dbo.Kommentare SET TagId = NULL
           WHERE TagId IN (SELECT Id FROM dbo.Tage
                            WHERE WocheId = @wocheId AND Datum NOT IN (${platzhalter}));
          DELETE FROM dbo.Tage
           WHERE WocheId = @wocheId AND Datum NOT IN (${platzhalter});
        `);
      }

      await tx.commit();
    } catch (txErr) {
      await tx.rollback();
      throw txErr;
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
    const id = wocheIdParam(req, res);
    if (id === null) return;
    const { status } = req.body;
    const pool = await getPool();
    const woche = await ladeWocheFuerZugriff(pool, id);
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
      .input('id',     sql.Int,          id)
      .input('status', sql.NVarChar(20), status)
      .input('flag',   sql.Bit,          treffer.endabnahmeDirekt);
    let setClause = 'Status = @status, EndabnahmeDirekt = @flag';
    if (treffer.korrektur) {
      request.input('korrigiertVon', sql.NVarChar(36), user.oid);
      // Name mitschreiben (Migration 031): die Gegenzeichnung im
      // Ausbildungsnachweis muss den Prüfer auch dann noch nennen, wenn sein
      // Konto später vom Retention-Job gelöscht wird. DB-Form, nicht Anzeigeform.
      request.input('korrigiertVonName', sql.NVarChar(200), user.name ?? null);
      setClause += ', KorrigiertVon = @korrigiertVon, KorrigiertVonName = @korrigiertVonName'
                 + ', KorrigiertAm = SYSUTCDATETIME()';
    }
    // Abgabe des Azubis datieren (Migration 028). Ohne diesen Stempel trug der
    // Ausbildungsnachweis nur ein Genehmigungsdatum, aber kein Abgabedatum.
    // Beim Zurückziehen NICHT geleert – ein erneutes Einreichen überschreibt.
    if (treffer.aktion === 'einreichen') {
      request.input('eingereichtVon', sql.NVarChar(36), user.oid);
      setClause += ', EingereichtAm = SYSUTCDATETIME(), EingereichtVon = @eingereichtVon';
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
          .input('wocheId',     sql.Int,          id)
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
