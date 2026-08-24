const router = require('express').Router();
const { getPool, sql } = require('../db/connection');
const { logError } = require('../services/fehlerberichte');
const { mitVertretern } = require('../services/vertretungen');
const { ladeKorrekturKontext } = require('../services/zugriffContext');
const { istZugreifbar, ymd, NACHLAUF_TAGE } = require('../services/zugriff');
const { mailVersetzung } = require('../services/mail');

// Nur Nutzer mit Planungsrecht dürfen Zuweisungen anlegen/löschen.
function nurPlaner(req, res, next) {
  if (!req.user || !req.user.kannPlanen) {
    return res.status(403).json({ error: 'Kein Planungsrecht.' });
  }
  next();
}

// Nutzer (Oid + Name) zu einer E-Mail auflösen — eine Abfrage für beide
// Zwecke, die rund um den Verantwortlichen einer Zuweisung anfallen: die
// In-App-Benachrichtigung braucht die Oid (Fehler dürfen den eigentlichen
// Zuweisungs-Vorgang NIE brechen, u.a. wenn der CHECK-Constraint die
// Versetzungs-Typen noch nicht kennt → Migration 019 muss laufen; WocheId
// bleibt NULL, referenziert eine Zuweisung), und Zuweisungen.VerantwName
// (Migration 031) braucht den Namen — denormalisiert, weil die Zuweisung nur
// die E-Mail trägt und der Retention-Job diese beim Löschen der Person leert;
// ohne den gespeicherten Namen stünde danach überall "–".
// Kein Treffer (Verantwortlicher noch ohne SSO-Login) → null; die Anzeige
// leitet den Namen dann wie bisher aus der E-Mail ab, die Benachrichtigung
// bleibt für diesen Empfänger einfach aus (benachrichtige()/mitVertretern()
// filtern null-Einträge ohnehin heraus).
async function userForEmail(pool, email) {
  if (!email) return null;
  try {
    const r = await pool.request()
      .input('email', sql.NVarChar(255), String(email).toLowerCase())
      .query('SELECT TOP 1 Oid, Name FROM dbo.Users WHERE LOWER(Email) = @email');
    return r.recordset[0] ? { oid: r.recordset[0].Oid, name: r.recordset[0].Name } : null;
  } catch (err) {
    // Ein Fehlschlag hier verpasst nicht nur eine Benachrichtigung, sondern
    // auch die einzige Chance, den Namen vor einer späteren Löschung der
    // Person festzuhalten (Migration 031 hat bewusst kein Backfill) —
    // deshalb sichtbar loggen statt stillschweigend zu verschlucken.
    logError({ quelle: 'backend', nachricht: `[zuweisungen] userForEmail: ${err.message}`, stack: err.stack });
    return null;
  }
}
async function benachrichtige(pool, empfaengerOids, typ, fromOid) {
  // Aktive Vertreter der Empfänger mitbenachrichtigen (Azubis haben keine → no-op).
  const erweitert = await mitVertretern(pool, empfaengerOids);
  const ziele = [...new Set(erweitert.filter(Boolean))].filter(o => o !== fromOid);
  for (const userOid of ziele) {
    try {
      await pool.request()
        .input('userOid', sql.NVarChar(36), userOid)
        .input('typ',     sql.NVarChar(40), typ)
        .input('fromOid', sql.NVarChar(36), fromOid || null)
        .query(`INSERT INTO dbo.Benachrichtigungen (UserOid, Typ, WocheId, FromUserOid)
                VALUES (@userOid, @typ, NULL, @fromOid)`);
    } catch (_) { /* best-effort: Mitteilung darf den Vorgang nicht brechen */ }
  }
  // Dieselbe Empfängermenge nutzt der Mail-/Termin-Versand (mailVersetzung).
  return ziele;
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
      SELECT z.*, u.Name AS AzubiName, u.Beruf AS AzubiBeruf, v.Oid AS VerantwOid
      FROM dbo.Zuweisungen z
      LEFT JOIN dbo.Users u ON u.Oid = z.AzubiOid
      LEFT JOIN dbo.Users v ON LOWER(v.Email) = LOWER(z.VerantwEmail)
      WHERE ${where}
      ORDER BY z.AzubiOid, z.Von DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[zuweisungen] list: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/zuweisungen
router.post('/', nurPlaner, async (req, res) => {
  try {
    const { azubiOid, verantwEmail, abteilung, von, bis } = req.body;
    // Invariante serverseitig erzwingen (Frontend-Modal prüft das auch, aber
    // API-/MCP-Aufrufe umgehen es sonst → negative Balkenbreite, kaputte Overlap-/
    // Lücken-Rechnung). ISO-Strings sind lexikografisch vergleichbar.
    if (bis && von && von > bis) {
      return res.status(400).json({ error: 'Von muss vor oder gleich Bis liegen.' });
    }
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

    // Eine Auflösung bedient sowohl die Spalte (Name) als auch die
    // Benachrichtigung (Oid) — kein zweiter Lookup für dieselbe E-Mail.
    const verantwUser = await userForEmail(pool, verantwEmail);
    const result = await pool.request()
      .input('azubiOid',     sql.NVarChar(36),  azubiOid)
      .input('verantwEmail', sql.NVarChar(255), (verantwEmail || '').toLowerCase() || null)
      .input('verantwName',  sql.NVarChar(200), verantwUser ? verantwUser.name : null)
      .input('abteilung',    sql.NVarChar(100), abteilung || null)
      .input('von',          sql.Date,          von)
      .input('bis',          sql.Date,          bis)
      .query(`
        INSERT INTO dbo.Zuweisungen (AzubiOid, VerantwEmail, VerantwName, Abteilung, Von, Bis)
        OUTPUT inserted.Id
        VALUES (@azubiOid, @verantwEmail, @verantwName, @abteilung, @von, @bis)
      `);
    const neueId = result.recordset[0].Id;
    const ziele = await benachrichtige(pool, [azubiOid, verantwUser ? verantwUser.oid : null],
      'versetzung_neu', req.user.oid);
    // Mail + Outlook-Termin an dieselben Empfänger (best-effort, wirft nie).
    await mailVersetzung(pool, ziele, 'versetzung_neu',
      { zuweisungId: neueId, azubiOid, abteilung, von, bis });
    res.json({ id: neueId });
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[zuweisungen] create: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
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
    // Invariante von<=bis (Body kann String sein, row.* ist Date → über Date vergleichen).
    if (von && bis && new Date(von) > new Date(bis)) {
      return res.status(400).json({ error: 'Von muss vor oder gleich Bis liegen.' });
    }
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

    // Nutzer zur neuen E-Mail neu auflösen (Migration 031): ohne das würde
    // der bereits gespeicherte VerantwName der VORHERIGEN Person stehen
    // bleiben und laut normalizeZuweisung-Vorrang die geänderte E-Mail
    // überstimmen — die Zeile zeigte dann dauerhaft die falsche Person an.
    // Dieselbe Auflösung liefert zugleich die Oid für die Benachrichtigung.
    const verantwUser = await userForEmail(pool, verantwEmail);
    await pool.request()
      .input('id',           sql.Int,           id)
      .input('verantwEmail', sql.NVarChar(255), verantwEmail)
      .input('verantwName',  sql.NVarChar(200), verantwUser ? verantwUser.name : null)
      .input('abteilung',    sql.NVarChar(100), abteilung)
      .input('von',          sql.Date,          von)
      .input('bis',          sql.Date,          bis)
      .query(`
        UPDATE dbo.Zuweisungen
        SET VerantwEmail = @verantwEmail, VerantwName = @verantwName,
            Abteilung = @abteilung, Von = @von, Bis = @bis
        WHERE Id = @id
      `);
    // Azubi + alter UND neuer Verantwortlicher (falls umgehängt) informieren.
    // Für die vorherige E-Mail wird nur die Oid gebraucht — ein zweiter
    // Lookup ist hier legitim, weil er eine andere Person betrifft.
    const ziele = await benachrichtige(pool,
      [row.AzubiOid, verantwUser ? verantwUser.oid : null, (await userForEmail(pool, row.VerantwEmail))?.oid ?? null],
      'versetzung_geaendert', req.user.oid);
    // Termin-Aktualisierung: gleiche UID, höhere SEQUENCE — Outlook ersetzt den
    // bestehenden Termin statt einen zweiten anzulegen.
    await mailVersetzung(pool, ziele, 'versetzung_geaendert',
      { zuweisungId: id, azubiOid: row.AzubiOid, abteilung, von, bis });
    res.json({ ok: true });
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[zuweisungen] patch: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/zuweisungen/:id
router.delete('/:id', nurPlaner, async (req, res) => {
  let tx;
  try {
    const pool = await getPool();
    const id = Number(req.params.id) || 0;
    // Empfänger VOR dem Löschen merken (danach ist die Zeile weg).
    // Abteilung/Von/Bis mitlesen: die Termin-Absage braucht Titel und Zeitraum,
    // und nach dem DELETE ist die Zeile weg.
    const pre = await pool.request().input('id', sql.Int, id)
      .query('SELECT AzubiOid, VerantwEmail, Abteilung, Von, Bis FROM dbo.Zuweisungen WHERE Id = @id');
    const row = pre.recordset[0];
    // Atomar aufräumen: es gibt KEINEN FK von Beurteilungen/Benachrichtigungen auf
    // Zuweisungen. Ohne dies bliebe eine (ggf. abgeschlossene) Beurteilung als Waise
    // zurück – mit totem Deep-Link in den Aktivitäts-Feeds und in der Mitteilung des
    // Azubis. (BeurteilungKriterien hängen per FK ON DELETE CASCADE an Beurteilungen
    // und verschwinden automatisch mit.)
    tx = new sql.Transaction(pool);
    await tx.begin();
    await new sql.Request(tx).input('id', sql.Int, id)
      .query("DELETE FROM dbo.Benachrichtigungen WHERE ZuweisungId = @id AND Typ LIKE 'beurteilung%'");
    await new sql.Request(tx).input('id', sql.Int, id)
      .query('DELETE FROM dbo.Beurteilungen WHERE ZuweisungId = @id');
    const result = await new sql.Request(tx).input('id', sql.Int, id)
      .query('DELETE FROM dbo.Zuweisungen WHERE Id = @id');
    if (!result.rowsAffected[0]) {
      await tx.rollback(); tx = null;
      return res.status(404).json({ error: 'Zuweisung nicht gefunden.' });
    }
    await tx.commit(); tx = null;
    if (row) {
      const ziele = await benachrichtige(pool, [row.AzubiOid, (await userForEmail(pool, row.VerantwEmail))?.oid ?? null],
        'versetzung_entfernt', req.user.oid);
      await mailVersetzung(pool, ziele, 'versetzung_entfernt',
        { zuweisungId: id, azubiOid: row.AzubiOid, abteilung: row.Abteilung, von: row.Von, bis: row.Bis });
    }
    res.json({ ok: true });
  } catch (err) {
    if (tx) { try { await tx.rollback(); } catch (_) { /* nicht begonnen / schon zurückgerollt */ } }
    logError({ quelle: 'backend', nachricht: `[zuweisungen] delete: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/zuweisungen/meine-pruefungen
// Für Prüfer: die eigenen (inkl. per Vertretung geerbten) befristeten
// Zuweisungen, je Azubi nur die zeitlich aktuellste (höchstes Von), gefiltert
// auf den noch bestehenden Zugriff (Von…Bis + 6 Wochen Nachlauf). Speist das
// Prüfer-Dashboard und die Wochenansicht-Fenstergrenzen.
router.get('/meine-pruefungen', async (req, res) => {
  try {
    const pool = await getPool();
    const kontext = await ladeKorrekturKontext(pool, req.user);

    const neuesteJeAzubi = new Map();
    for (const z of kontext.zuweisungen) {
      const bisher = neuesteJeAzubi.get(z.azubiOid);
      if (!bisher || ymd(z.von) > ymd(bisher.von)) neuesteJeAzubi.set(z.azubiOid, z);
    }
    const zugreifbare = [...neuesteJeAzubi.values()].filter(z => istZugreifbar(z, kontext.stichtag));
    if (!zugreifbare.length) return res.json([]);

    const r = pool.request();
    const params = zugreifbare.map((z, i) => { r.input(`o${i}`, sql.NVarChar(36), z.azubiOid); return `@o${i}`; });
    const namen = await r.query(`SELECT Oid, Name FROM dbo.Users WHERE Oid IN (${params.join(',')})`);
    const nameByOid = new Map(namen.recordset.map(n => [n.Oid, n.Name]));

    const liste = zugreifbare.map(z => {
      const bis = ymd(z.bis);
      const nachlaufDatum = new Date(bis + 'T00:00:00Z');
      nachlaufDatum.setUTCDate(nachlaufDatum.getUTCDate() + NACHLAUF_TAGE);
      return {
        azubiOid: z.azubiOid,
        azubiName: nameByOid.get(z.azubiOid) || '',
        abteilung: z.abteilung || null,
        von: ymd(z.von),
        bis,
        status: kontext.stichtag <= bis ? 'laeuft' : 'nachlauf',
        nachlaufBis: nachlaufDatum.toISOString().slice(0, 10),
      };
    }).sort((a, b) => (a.von < b.von ? -1 : 1));

    res.json(liste);
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[zuweisungen] meine-pruefungen: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/zuweisungen/meine-pruefungen-kommend
// Für Prüfer: die eigenen (inkl. per Vertretung geerbten) befristeten
// Zuweisungen, die noch nicht begonnen haben (Von in der Zukunft). Speist
// den "Demnächst"-Abschnitt im Prüfer-Dashboard. Keine Zugreifbarkeits-
// prüfung nötig (die Zuweisung hat ja noch nicht begonnen), keine Dedup-
// Notwendigkeit (mehrere künftige Rotationen zum selben Azubi sind
// informativ und werden alle gezeigt).
router.get('/meine-pruefungen-kommend', async (req, res) => {
  try {
    const pool = await getPool();
    const kontext = await ladeKorrekturKontext(pool, req.user);
    const kommende = kontext.zuweisungen.filter(z => ymd(z.von) > kontext.stichtag);
    if (!kommende.length) return res.json([]);

    const r = pool.request();
    const params = kommende.map((z, i) => { r.input(`o${i}`, sql.NVarChar(36), z.azubiOid); return `@o${i}`; });
    const namen = await r.query(`SELECT Oid, Name FROM dbo.Users WHERE Oid IN (${params.join(',')})`);
    const nameByOid = new Map(namen.recordset.map(n => [n.Oid, n.Name]));

    const liste = kommende.map(z => ({
      azubiOid: z.azubiOid,
      azubiName: nameByOid.get(z.azubiOid) || '',
      abteilung: z.abteilung || null,
      von: ymd(z.von),
      bis: ymd(z.bis),
    })).sort((a, b) => (a.von < b.von ? -1 : 1));

    res.json(liste);
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[zuweisungen] meine-pruefungen-kommend: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
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
      .query(`
        SELECT z.*, v.Oid AS VerantwOid
        FROM dbo.Zuweisungen z
        LEFT JOIN dbo.Users v ON LOWER(v.Email) = LOWER(z.VerantwEmail)
        WHERE z.Id = @id
      `);
    const row = result.recordset[0];
    if (!row) return res.status(404).json({ error: 'Zuweisung nicht gefunden.' });
    // Sichtbarkeit wie GET '/': Planer alles; Azubi/DH nur eigene; Ausbilder
    // betreute Azubis bzw. eigene VerantwEmail. Sonst 404 (kein Existenz-Orakel
    // für fremde Ids → verhindert IDOR/Hochzählen).
    const u = req.user;
    if (!u.kannPlanen) {
      let darf = false;
      if (u.istAzubi || u.istDhStudent) {
        darf = row.AzubiOid === u.oid;
      } else if (u.istAusbilder) {
        if (String(row.VerantwEmail || '').toLowerCase() === String(u.email || '').toLowerCase()) {
          darf = true;
        } else {
          const betreut = await pool.request()
            .input('aoid', sql.NVarChar(36), u.oid)
            .input('zoid', sql.NVarChar(36), row.AzubiOid)
            .query('SELECT TOP 1 1 AS x FROM dbo.AusbilderAzubis WHERE AusbilderOid = @aoid AND AzubiOid = @zoid');
          darf = betreut.recordset.length > 0;
        }
      }
      if (!darf) return res.status(404).json({ error: 'Zuweisung nicht gefunden.' });
    }
    res.json(row);
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[zuweisungen] get/:id: ${err.message}`, stack: err.stack,
      kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
