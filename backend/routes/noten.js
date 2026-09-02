const router = require('express').Router();
const multer = require('multer');
const { getPool, sql } = require('../db/connection');
const { logError } = require('../services/fehlerberichte');
const notenSvc = require('../services/noten');
// Eine Wahrheit für Arten, Grenzen und Validierung, gemeinsam mit dem
// Frontend (Präzedenz: app/js/beurteilung-core.js wird backendseitig requirt).
const core = require('../../app/js/noten-core.js');

/* =====================================================================
   NOTEN & ZEUGNISSE — HTTP-Schicht.
   Design-Spec: docs/superpowers/specs/2026-09-01-noten-zeugnisse-design.md

   Sichtbarkeit und Schreibrecht entscheidet ausschließlich
   backend/services/noten.js. Zwei Dinge, die hier bewusst anders sind
   als im Rest des Repos (Begründung dort im Datei-Header):
     * Eine BEFRISTETE Abteilungs-Zuweisung gibt KEINEN Zugriff —
       ladeKorrekturKontext()/dbo.Zuweisungen werden hier nirgends
       abgefragt. Nicht "symmetrisch" ergänzen.
     * SCHREIBEN darf nur der Eigentümer, auch admin/developer nicht.
   Die Sichtbarkeit wird bei JEDEM Zugriff neu geprüft, auch beim
   Beleg-Download — nicht nur beim Upload.
   ===================================================================== */

// ── Upload-Konfiguration (Muster: routes/anhaenge.js) ──────────────
// memoryStorage: die Datei landet als Buffer in req.file.buffer und geht
// direkt als VARBINARY in die DB – kein temporäres File auf der Platte.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: core.MAX_BELEG_BYTES },
});

// Endungs-basiert, weil der vom Browser gemeldete MIME-Typ unzuverlässig
// ist. Engere Liste als dbo.Anhaenge (kein docx/xlsx/txt): Belege sind
// Fotos und Scans. heic/heif werden angenommen, weil iOS sie über
// "Dateien durchsuchen" liefert — sie sind nur nicht vorschaufähig.
const ERLAUBT_TEXT = [...core.ERLAUBTE_ENDUNGEN].join(', ');

// multer-Wrapper, der Upload-Fehler sauber als JSON zurückgibt statt sie
// an den globalen Error-Handler zu reichen.
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

// ── Hilfen ────────────────────────────────────────────────────────
const ymd = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const iso = (d) => (d ? new Date(d).toISOString() : null);
const zahl = (n) => (n === null || n === undefined ? null : Number(n));

// SQL-Server-Fehlernummern für eine verletzte UNIQUE-Constraint.
const UNIQUE_FEHLER = [2627, 2601];

function fehler(req, res, wo, err) {
  logError({
    quelle: 'backend', nachricht: `[noten] ${wo}: ${err.message}`, stack: err.stack,
    kontext: { route: req.path, methode: req.method },
    benutzerOid: req.user && req.user.oid, benutzerName: req.user && req.user.name,
  });
  res.status(500).json({ error: err.message });
}

function mapOrdner(row) {
  return {
    id: row.Id,
    azubiOid: row.AzubiOid,
    name: row.Name,
    abschnittId: row.AbschnittId ?? null,
    zaehltInSchnitt: !!row.ZaehltInSchnitt,
    sortierung: row.Sortierung,
    erstelltAm: iso(row.ErstelltAm),
    aktualisiertAm: iso(row.AktualisiertAm),
    eintraege: [],
  };
}

function mapEintrag(row) {
  return {
    id: row.Id,
    ordnerId: row.OrdnerId,
    titel: row.Titel,
    art: row.Art,
    datum: ymd(row.Datum),
    note: zahl(row.Note),
    punkte: zahl(row.Punkte),
    maxPunkte: zahl(row.MaxPunkte),
    noteAusPunkten: !!row.NoteAusPunkten,
    credits: zahl(row.Credits),
    status: row.Status ?? null,
    bemerkung: row.Bemerkung ?? null,
    erstelltAm: iso(row.ErstelltAm),
    aktualisiertAm: iso(row.AktualisiertAm),
    belege: [],
  };
}

function mapAbschnitt(row) {
  return {
    id: row.Id,
    azubiOid: row.AzubiOid,
    typ: row.Typ,
    nr: Number(row.Nr),
    label: core.abschnittLabel(row.Typ, Number(row.Nr)),
    erstelltAm: iso(row.ErstelltAm),
  };
}

function mapBeleg(row) {
  return {
    id: row.Id,
    eintragId: row.EintragId,
    dateiname: row.Dateiname,
    mimeTyp: row.MimeTyp ?? null,
    groesseBytes: row.GroesseBytes,
    hochgeladenAm: iso(row.HochgeladenAm),
  };
}

async function ladeAbschnitt(pool, id) {
  const r = await pool.request().input('id', sql.Int, id)
    .query('SELECT * FROM dbo.NotenAbschnitte WHERE Id = @id');
  return r.recordset[0] || null;
}

// Lädt den Ordner samt Eigentümer. null = gibt es nicht.
async function ladeOrdner(pool, id) {
  const r = await pool.request().input('id', sql.Int, id)
    .query('SELECT * FROM dbo.NotenOrdner WHERE Id = @id');
  return r.recordset[0] || null;
}

// Lädt den Eintrag samt Eigentümer (über den Ordner — der Eintrag trägt
// bewusst kein AzubiOid, siehe Migration 043).
async function ladeEintrag(pool, id) {
  const r = await pool.request().input('id', sql.Int, id)
    .query(`SELECT e.*, o.AzubiOid, o.ZaehltInSchnitt
            FROM dbo.NotenEintraege e JOIN dbo.NotenOrdner o ON o.Id = e.OrdnerId
            WHERE e.Id = @id`);
  return r.recordset[0] || null;
}

async function ladeBeleg(pool, id) {
  const r = await pool.request().input('id', sql.Int, id)
    .query(`SELECT b.*, o.AzubiOid
            FROM dbo.NotenBelege b
            JOIN dbo.NotenEintraege e ON e.Id = b.EintragId
            JOIN dbo.NotenOrdner o    ON o.Id = e.OrdnerId
            WHERE b.Id = @id`);
  return r.recordset[0] || null;
}

// Antwortet selbst mit 403 und gibt false zurück (Muster:
// ladeUndAutorisiere in routes/beurteilungen.js).
async function darfLesen(pool, req, res, azubiOid) {
  if (notenSvc.darfNotenSehen(req.user, azubiOid)) return true; // Eigentümer/admin/dev
  const kontext = await notenSvc.ladeNotenKontext(pool, req.user, azubiOid);
  if (notenSvc.darfNotenSehen(req.user, azubiOid, kontext)) return true;
  res.status(403).json({ error: 'Keine Berechtigung für diese Noten.' });
  return false;
}

/* Prüft eine mitgeschickte abschnittId auf Existenz und Eigentum.
   Rückgabe: die Id (Number) — oder undefined, wenn schon geantwortet wurde.
   Ein Aufrufer muss also auf === undefined prüfen, nicht auf falsy: null
   ist ein gültiges Ergebnis (Ordner ohne Zeitraum). */
async function pruefeAbschnittBesitz(pool, res, user, wert) {
  if (wert === null || wert === undefined || wert === '') {
    res.status(400).json({ error: 'Zeitraum fehlt.' });
    return undefined;
  }
  const id = parseInt(wert, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Zeitraum ist keine Zahl.' }); return undefined; }
  const a = await ladeAbschnitt(pool, id);
  if (!a) { res.status(404).json({ error: 'Zeitraum nicht gefunden.' }); return undefined; }
  if (a.AzubiOid !== user.oid) {
    res.status(403).json({ error: 'Dieser Zeitraum gehört jemand anderem.' });
    return undefined;
  }
  return id;
}

function darfSchreiben(req, res, azubiOid) {
  if (notenSvc.darfNotenBearbeiten(req.user, azubiOid)) return true;
  res.status(403).json({ error: 'Noten darf nur der Azubi selbst pflegen.' });
  return false;
}

// Mitteilung an Ausbilder und Ausbildungsleitung — best-effort, darf den
// Vorgang nie brechen (Muster: benachrichtige() in routes/zuweisungen.js).
// Wird pro Eintrag GENAU EINMAL aufgerufen; der Stempel
// MitteilungGesendetAm verhindert eine zweite Runde bei Korrekturen.
async function melde(pool, eintragId, azubiOid) {
  try {
    const ziele = await notenSvc.empfaengerFuerMitteilung(pool, azubiOid);
    for (const userOid of ziele) {
      try {
        await pool.request()
          .input('userOid', sql.NVarChar(36), userOid)
          .input('typ', sql.NVarChar(40), notenSvc.BENACHRICHTIGUNG_TYP)
          .input('fromOid', sql.NVarChar(36), azubiOid)
          .query(`INSERT INTO dbo.Benachrichtigungen (UserOid, Typ, WocheId, FromUserOid)
                  VALUES (@userOid, @typ, NULL, @fromOid)`);
      } catch (_) { /* z.B. CHECK-Constraint ohne Migration 044 */ }
    }
    // Stempel auch setzen, wenn es keine Empfänger gab: der Eintrag ist
    // gemeldet, sobald wir es einmal versucht haben. Sonst würde jede
    // spätere Korrektur einen neuen Versuch starten.
    await pool.request().input('id', sql.Int, eintragId)
      .query('UPDATE dbo.NotenEintraege SET MitteilungGesendetAm = SYSUTCDATETIME() WHERE Id = @id');
  } catch (err) {
    logError({ quelle: 'backend', nachricht: `[noten] melde: ${err.message}`, stack: err.stack });
  }
}

/* Note aus Punkten ableiten, wenn der Nutzer nur Punkte eingetragen hat.
   Punkte sind seit Migration 046 reine IHK-Sache: DH-Studenten tragen Note,
   Credits und Status ein. Für sie werden Punkte und Maximalpunktzahl
   deshalb hart auf null gesetzt — auch wenn ein alter Client sie noch
   mitschickt, damit kein stillgelegter DHBW-Wert wieder einsickert.
   (Die DUALIS-Tabelle in noten-core.js bleibt liegen, siehe Kommentar dort.)

   Schreiben darf nur der Eigentümer, also ist user der Azubi bzw. der
   DH-Student — seine Rolle entscheidet. */
function leiteNoteAb(daten, user) {
  const note = core.parseNote(daten.note);
  if (user.role === 'dhstudent') {
    return { note, punkte: null, maxPunkte: null, ausPunkten: false };
  }
  const punkte = core.parsePunkte(daten.punkte);
  if (note !== null) return { note, punkte, maxPunkte: null, ausPunkten: false };
  if (punkte === null) return { note: null, punkte: null, maxPunkte: null, ausPunkten: false };
  const art = core.artById(daten.art);
  if (!art || !art.zeigtPunkte) return { note: null, punkte, maxPunkte: null, ausPunkten: false };
  const abgeleitet = core.noteAusPunkten(punkte, { dh: false });
  return { note: abgeleitet, punkte, maxPunkte: null, ausPunkten: abgeleitet !== null };
}

/* Credits und Status normalisieren. Beide gehören dem DH-Teil; bei allen
   anderen Rollen werden sie verworfen, statt sie durchzulassen — die
   Validierung in core.pruefeEintrag weist sie ohnehin ab, das hier ist die
   zweite Linie für alte Clients. */
function leiteCreditsAb(daten, user) {
  if (user.role !== 'dhstudent') return { credits: null, status: null };
  return {
    credits: core.parseCredits(daten.credits),
    status: core.statusById(daten.status) ? daten.status : null,
  };
}

/* ── Azubi-Liste für die Ausbilder-Ansicht ─────────────────────────── */
// Bewusst ein eigener Endpunkt statt /api/users/me/azubis: der enthält
// befristete Zuweisungs-Azubis (die hier 403 bekämen) und keine
// DH-Studenten.
router.get('/azubis', async (req, res) => {
  try {
    const pool = await getPool();
    const rows = await notenSvc.sichtbareAzubis(pool, req.user);
    const liste = rows.map(r => ({
      oid: r.Oid, name: r.Name, email: r.Email, role: r.Role, department: r.Department ?? null,
      // Beruf nur für den Kopf des gedruckten Notenspiegels (wie
      // "Ausbildungs-/Studienberuf" auf dem Beurteilungsbogen). In der
      // Übersichtstabelle steht er nicht.
      beruf: r.Beruf ?? null,
      anzahlEintraege: 0, letzterEintrag: null,
      anzahlAbschnitte: 0, schnittAktuell: null, abschnittAktuell: null,
    }));
    if (!liste.length || !req.query.mitSchnitt) return res.json(liste);

    /* Ein Ø über die gesamte Ausbildung gibt es seit Migration 046 nicht
       mehr. Die Übersicht zeigt stattdessen den Ø des AKTUELLEN Abschnitts
       (höchster Sortierschlüssel) — sonst hätte die Tabelle keine
       vergleichbare Zahl mehr.

       Summe und Anzahl statt AVG: der Durchschnitt wird mit derselben
       Funktion gerundet wie im Frontend (noten-core.abschnittSchnitt).
       Scheitert das Aggregat, bleibt die LISTE trotzdem stehen — sie ist der
       Einstieg in die Einzelansichten und darf nicht an Kennzahlen hängen. */
    try {
    const platzhalter = liste.map((_, i) => `@o${i}`).join(',');
    const anfrage = pool.request();
    liste.forEach((a, i) => anfrage.input(`o${i}`, sql.NVarChar(36), a.oid));
    // Je Azubi UND Abschnitt aggregieren; welcher der aktuelle ist,
    // entscheidet core.abschnittSortKey — eine Wahrheit, kein SQL-Nachbau.
    const agg = await anfrage.query(`
      SELECT o.AzubiOid, a.Id AS AbschnittId, a.Typ, a.Nr,
             COUNT(e.Id) AS AnzahlEintraege,
             MAX(e.Datum) AS LetzterEintrag,
             SUM(CASE WHEN o.ZaehltInSchnitt = 1 THEN e.Note END) AS SummeNote,
             COUNT(CASE WHEN o.ZaehltInSchnitt = 1 THEN e.Note END) AS AnzahlNote
      FROM dbo.NotenOrdner o
      LEFT JOIN dbo.NotenAbschnitte a ON a.Id = o.AbschnittId
      LEFT JOIN dbo.NotenEintraege e  ON e.OrdnerId = o.Id
      WHERE o.AzubiOid IN (${platzhalter})
      GROUP BY o.AzubiOid, a.Id, a.Typ, a.Nr`);

    const jeAzubi = new Map();
    for (const r of agg.recordset) {
      if (!jeAzubi.has(r.AzubiOid)) jeAzubi.set(r.AzubiOid, []);
      jeAzubi.get(r.AzubiOid).push(r);
    }
    for (const a of liste) {
      const zeilen = jeAzubi.get(a.oid);
      if (!zeilen || !zeilen.length) continue;
      a.anzahlEintraege = zeilen.reduce((s, r) => s + r.AnzahlEintraege, 0);
      const daten = zeilen.map(r => r.LetzterEintrag).filter(Boolean).sort();
      a.letzterEintrag = daten.length ? ymd(daten[daten.length - 1]) : null;
      const mitAbschnitt = zeilen.filter(r => r.AbschnittId !== null);
      a.anzahlAbschnitte = new Set(mitAbschnitt.map(r => r.AbschnittId)).size;
      // Aktueller Abschnitt = höchster Sortierschlüssel.
      let aktuell = null;
      for (const r of mitAbschnitt) {
        if (!aktuell || core.abschnittSortKey(r.Typ, r.Nr) > core.abschnittSortKey(aktuell.Typ, aktuell.Nr)) {
          aktuell = r;
        }
      }
      if (!aktuell) continue;
      // Alle Ordner-Zeilen DIESES Abschnitts zusammenfassen.
      const drin = mitAbschnitt.filter(r => r.AbschnittId === aktuell.AbschnittId);
      const summe = drin.reduce((s, r) => s + Number(r.SummeNote || 0), 0);
      const anzahl = drin.reduce((s, r) => s + r.AnzahlNote, 0);
      a.abschnittAktuell = core.abschnittLabel(aktuell.Typ, Number(aktuell.Nr));
      a.schnittAktuell = anzahl > 0 ? Math.round((summe / anzahl) * 100) / 100 : null;
    }
    } catch (aggErr) {
      logError({ quelle: 'backend', nachricht: `[noten] azubis-aggregat: ${aggErr.message}`, stack: aggErr.stack,
        kontext: { route: req.path, methode: req.method }, benutzerOid: req.user && req.user.oid });
    }
    res.json(liste);
  } catch (err) { fehler(req, res, 'azubis', err); }
});

/* ── Gesamtansicht eines Azubi ─────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    const pool = await getPool();
    const azubiOid = req.query.azubiOid || req.user.oid;

    if (azubiOid !== req.user.oid) {
      const u = await pool.request().input('oid', sql.NVarChar(36), azubiOid)
        .query('SELECT Oid FROM dbo.Users WHERE Oid = @oid');
      if (!u.recordset.length) return res.status(404).json({ error: 'Azubi nicht gefunden.' });
    }
    if (!(await darfLesen(pool, req, res, azubiOid))) return;

    const abschnitteRes = await pool.request().input('oid', sql.NVarChar(36), azubiOid)
      .query('SELECT * FROM dbo.NotenAbschnitte WHERE AzubiOid = @oid');
    const abschnitte = abschnitteRes.recordset.map(mapAbschnitt);

    const ordnerRes = await pool.request().input('oid', sql.NVarChar(36), azubiOid)
      .query(`SELECT * FROM dbo.NotenOrdner WHERE AzubiOid = @oid
              ORDER BY Sortierung, Name`);
    const ordner = ordnerRes.recordset.map(mapOrdner);
    if (ordner.length) {
      const nachId = new Map(ordner.map(o => [o.id, o]));
      const eintraegeRes = await pool.request().input('oid', sql.NVarChar(36), azubiOid)
        .query(`SELECT e.* FROM dbo.NotenEintraege e
                JOIN dbo.NotenOrdner o ON o.Id = e.OrdnerId
                WHERE o.AzubiOid = @oid
                ORDER BY e.Datum DESC, e.Id DESC`);
      const eintraege = eintraegeRes.recordset.map(mapEintrag);
      const eintragNachId = new Map(eintraege.map(e => [e.id, e]));
      eintraege.forEach(e => { const o = nachId.get(e.ordnerId); if (o) o.eintraege.push(e); });

      if (eintraege.length) {
        const belegeRes = await pool.request().input('oid', sql.NVarChar(36), azubiOid)
          .query(`SELECT b.Id, b.EintragId, b.Dateiname, b.MimeTyp, b.GroesseBytes, b.HochgeladenAm
                  FROM dbo.NotenBelege b
                  JOIN dbo.NotenEintraege e ON e.Id = b.EintragId
                  JOIN dbo.NotenOrdner o    ON o.Id = e.OrdnerId
                  WHERE o.AzubiOid = @oid
                  ORDER BY b.HochgeladenAm`);
        belegeRes.recordset.map(mapBeleg).forEach(b => {
          const e = eintragNachId.get(b.eintragId); if (e) e.belege.push(b);
        });
      }
    }

    /* Abschnitte und Ordner kommen FLACH heraus; gruppiert wird im
       Frontend über core.gruppiereOrdnerNachAbschnitt. Absichtlich so:
       diese Funktion ist getestet, und eine zweite Gruppierung hier wäre
       eine zweite Wahrheit, die auseinanderlaufen kann. Ø und
       Credit-Summe fallen damit ebenfalls dort an. */
    res.json({
      azubiOid,
      darfBearbeiten: notenSvc.darfNotenBearbeiten(req.user, azubiOid),
      abschnitte,
      ordner,
    });
  } catch (err) { fehler(req, res, 'uebersicht', err); }
});

/* ── Abschnitte ────────────────────────────────────────────────────── */
// Umbenennen gibt es nicht: ein Abschnitt IST sein (Typ, Nr). Wer sich
// vertippt hat, löscht ihn und legt den richtigen an.
router.post('/abschnitte', async (req, res) => {
  try {
    if (!darfSchreiben(req, res, req.user.oid)) return;
    const body = req.body || {};
    const nr = body.nr === undefined || body.nr === null || body.nr === '' ? null : Number(body.nr);
    const problem = core.pruefeAbschnitt(body.typ, nr, req.user.role);
    if (problem) return res.status(400).json({ error: problem });

    const pool = await getPool();
    const r = await pool.request()
      .input('oid', sql.NVarChar(36), req.user.oid)
      .input('typ', sql.NVarChar(15), body.typ)
      .input('nr', sql.SmallInt, nr)
      .query(`INSERT INTO dbo.NotenAbschnitte (AzubiOid, Typ, Nr)
              OUTPUT inserted.* VALUES (@oid, @typ, @nr)`);
    res.status(201).json(mapAbschnitt(r.recordset[0]));
  } catch (err) {
    if (UNIQUE_FEHLER.includes(err.number)) {
      return res.status(409).json({ error: 'Diesen Zeitraum gibt es schon.' });
    }
    fehler(req, res, 'abschnitt anlegen', err);
  }
});

// Wie beim Ordner: ohne ?kaskade=1 wird ein nicht leerer Abschnitt NICHT
// gelöscht. Die Kaskade reicht hier drei Ebenen tief (Ordner, Einträge,
// Belege) — das darf nicht ohne Rückfrage passieren.
router.delete('/abschnitte/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const abschnitt = await ladeAbschnitt(pool, req.params.id);
    if (!abschnitt) return res.status(404).json({ error: 'Zeitraum nicht gefunden.' });
    if (!darfSchreiben(req, res, abschnitt.AzubiOid)) return;

    const z = await pool.request().input('id', sql.Int, req.params.id).query(`
      SELECT (SELECT COUNT(*) FROM dbo.NotenOrdner WHERE AbschnittId = @id) AS Ordner,
             (SELECT COUNT(*) FROM dbo.NotenEintraege e
              JOIN dbo.NotenOrdner o ON o.Id = e.OrdnerId
              WHERE o.AbschnittId = @id) AS Eintraege,
             (SELECT COUNT(*) FROM dbo.NotenBelege b
              JOIN dbo.NotenEintraege e ON e.Id = b.EintragId
              JOIN dbo.NotenOrdner o    ON o.Id = e.OrdnerId
              WHERE o.AbschnittId = @id) AS Belege`);
    const { Ordner, Eintraege, Belege } = z.recordset[0];

    if (Ordner > 0 && !req.query.kaskade) {
      return res.status(409).json({
        error: 'Der Zeitraum ist nicht leer.',
        ordner: Ordner, eintraege: Eintraege, belege: Belege,
      });
    }

    await pool.request().input('id', sql.Int, req.params.id)
      .query('DELETE FROM dbo.NotenAbschnitte WHERE Id = @id');
    res.json({ ok: true, geloescht: { ordner: Ordner, eintraege: Eintraege, belege: Belege } });
  } catch (err) { fehler(req, res, 'abschnitt loeschen', err); }
});

/* ── Ordner ────────────────────────────────────────────────────────── */
router.post('/ordner', async (req, res) => {
  try {
    if (!darfSchreiben(req, res, req.user.oid)) return;
    const name = core.normalisiereOrdnerName(req.body && req.body.name);
    const problem = core.pruefeOrdnerName(name);
    if (problem) return res.status(400).json({ error: problem });

    const pool = await getPool();
    // Ein Fach gehört genau einem Zeitraum. Der muss existieren UND dem
    // Aufrufer gehören — sonst hinge ein Ordner an einem fremden Abschnitt
    // und wäre über die Kaskade fremd löschbar.
    const abschnittId = await pruefeAbschnittBesitz(pool, res, req.user, req.body && req.body.abschnittId);
    if (abschnittId === undefined) return;

    const r = await pool.request()
      .input('oid', sql.NVarChar(36), req.user.oid)
      .input('name', sql.NVarChar(100), name)
      .input('abschnittId', sql.Int, abschnittId)
      .input('zaehlt', sql.Bit, req.body.zaehltInSchnitt === false ? 0 : 1)
      .query(`INSERT INTO dbo.NotenOrdner (AzubiOid, Name, AbschnittId, ZaehltInSchnitt)
              OUTPUT inserted.* VALUES (@oid, @name, @abschnittId, @zaehlt)`);
    res.status(201).json(mapOrdner(r.recordset[0]));
  } catch (err) {
    if (UNIQUE_FEHLER.includes(err.number)) {
      return res.status(409).json({ error: 'In diesem Zeitraum gibt es das Fach schon.' });
    }
    fehler(req, res, 'ordner anlegen', err);
  }
});

router.patch('/ordner/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const ordner = await ladeOrdner(pool, req.params.id);
    if (!ordner) return res.status(404).json({ error: 'Ordner nicht gefunden.' });
    if (!darfSchreiben(req, res, ordner.AzubiOid)) return;

    const body = req.body || {};
    const felder = [];
    const anfrage = pool.request().input('id', sql.Int, req.params.id);

    if (body.name !== undefined) {
      const name = core.normalisiereOrdnerName(body.name);
      const problem = core.pruefeOrdnerName(name);
      if (problem) return res.status(400).json({ error: problem });
      felder.push('Name = @name');
      anfrage.input('name', sql.NVarChar(100), name);
    }
    if (body.zaehltInSchnitt !== undefined) {
      felder.push('ZaehltInSchnitt = @zaehlt');
      anfrage.input('zaehlt', sql.Bit, body.zaehltInSchnitt ? 1 : 0);
    }
    if (body.abschnittId !== undefined) {
      const abschnittId = await pruefeAbschnittBesitz(pool, res, req.user, body.abschnittId);
      if (abschnittId === undefined) return;
      felder.push('AbschnittId = @abschnittId');
      anfrage.input('abschnittId', sql.Int, abschnittId);
    }
    if (body.sortierung !== undefined) {
      const s = parseInt(body.sortierung, 10);
      if (isNaN(s)) return res.status(400).json({ error: 'Sortierung ist keine Zahl.' });
      felder.push('Sortierung = @sort');
      anfrage.input('sort', sql.Int, s);
    }
    if (!felder.length) return res.status(400).json({ error: 'Keine Änderung übermittelt.' });

    const r = await anfrage.query(
      `UPDATE dbo.NotenOrdner SET ${felder.join(', ')}, AktualisiertAm = SYSUTCDATETIME()
       OUTPUT inserted.* WHERE Id = @id`);
    res.json(mapOrdner(r.recordset[0]));
  } catch (err) {
    if (UNIQUE_FEHLER.includes(err.number)) {
      return res.status(409).json({ error: 'In diesem Zeitraum gibt es das Fach schon.' });
    }
    fehler(req, res, 'ordner aendern', err);
  }
});

// Ohne ?kaskade=1 wird ein nicht leerer Ordner NICHT gelöscht: die
// FK-Kaskade würde Einträge und Belege klaglos vernichten. Die 409-Antwort
// trägt die Zahlen, mit denen das Frontend nachfragt.
router.delete('/ordner/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const ordner = await ladeOrdner(pool, req.params.id);
    if (!ordner) return res.status(404).json({ error: 'Ordner nicht gefunden.' });
    if (!darfSchreiben(req, res, ordner.AzubiOid)) return;

    const z = await pool.request().input('id', sql.Int, req.params.id).query(`
      SELECT (SELECT COUNT(*) FROM dbo.NotenEintraege WHERE OrdnerId = @id) AS Eintraege,
             (SELECT COUNT(*) FROM dbo.NotenBelege b
              JOIN dbo.NotenEintraege e ON e.Id = b.EintragId
              WHERE e.OrdnerId = @id) AS Belege`);
    const { Eintraege, Belege } = z.recordset[0];

    if (Eintraege > 0 && !req.query.kaskade) {
      return res.status(409).json({
        error: 'Der Ordner ist nicht leer.',
        eintraege: Eintraege,
        belege: Belege,
      });
    }

    await pool.request().input('id', sql.Int, req.params.id)
      .query('DELETE FROM dbo.NotenOrdner WHERE Id = @id');
    res.json({ ok: true, geloescht: { eintraege: Eintraege, belege: Belege } });
  } catch (err) { fehler(req, res, 'ordner loeschen', err); }
});

/* ── Einträge ──────────────────────────────────────────────────────── */
router.post('/ordner/:id/eintraege', async (req, res) => {
  try {
    const pool = await getPool();
    const ordner = await ladeOrdner(pool, req.params.id);
    if (!ordner) return res.status(404).json({ error: 'Ordner nicht gefunden.' });
    if (!darfSchreiben(req, res, ordner.AzubiOid)) return;

    const body = req.body || {};
    const problem = core.pruefeEintrag(body, req.user.role);
    if (problem) return res.status(400).json({ error: problem });
    const { note, punkte, maxPunkte, ausPunkten } = leiteNoteAb(body, req.user);
    const { credits, status } = leiteCreditsAb(body, req.user);

    const r = await pool.request()
      .input('ordnerId', sql.Int, req.params.id)
      .input('titel', sql.NVarChar(200), String(body.titel).trim())
      .input('art', sql.NVarChar(20), body.art)
      .input('datum', sql.Date, body.datum)
      .input('note', sql.Decimal(3, 2), note)
      .input('punkte', sql.Decimal(5, 1), punkte)
      .input('maxPunkte', sql.SmallInt, maxPunkte)
      .input('ausPunkten', sql.Bit, ausPunkten ? 1 : 0)
      .input('credits', sql.Decimal(4, 1), credits)
      .input('status', sql.NVarChar(15), status)
      .input('bemerkung', sql.NVarChar(1000), body.bemerkung || null)
      .query(`INSERT INTO dbo.NotenEintraege
                (OrdnerId, Titel, Art, Datum,
                 Note, Punkte, MaxPunkte, NoteAusPunkten, Credits, Status, Bemerkung)
              OUTPUT inserted.*
              VALUES (@ordnerId, @titel, @art, @datum,
                      @note, @punkte, @maxPunkte, @ausPunkten, @credits, @status, @bemerkung)`);
    const zeile = r.recordset[0];

    if (notenSvc.ARTEN_MIT_MITTEILUNG.has(zeile.Art)) {
      await melde(pool, zeile.Id, ordner.AzubiOid);
    }
    res.status(201).json(mapEintrag(zeile));
  } catch (err) { fehler(req, res, 'eintrag anlegen', err); }
});

router.patch('/eintraege/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const alt = await ladeEintrag(pool, req.params.id);
    if (!alt) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
    if (!darfSchreiben(req, res, alt.AzubiOid)) return;

    const body = req.body || {};
    // Gegen den ZUSAMMENGEFÜHRTEN Stand prüfen: ein PATCH, der nur die Note
    // ändert, darf nicht an fehlenden Pflichtfeldern scheitern. Die
    // Zusammenführung liegt in noten-core.js (dort auch die nicht
    // offensichtliche Regel zu berechneten Noten) und ist dort getestet.
    const neu = core.zusammenfuehreEintrag(mapEintrag(alt), body);
    const problem = core.pruefeEintrag(neu, req.user.role);
    if (problem) return res.status(400).json({ error: problem });

    const abgeleitet = core.mussNeuBerechnen(body)
      ? leiteNoteAb(neu, req.user)
      : { note: zahl(alt.Note), punkte: zahl(alt.Punkte), maxPunkte: zahl(alt.MaxPunkte), ausPunkten: !!alt.NoteAusPunkten };
    const { credits, status } = leiteCreditsAb(neu, req.user);

    const r = await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('titel', sql.NVarChar(200), String(neu.titel).trim())
      .input('art', sql.NVarChar(20), neu.art)
      .input('datum', sql.Date, neu.datum)
      .input('note', sql.Decimal(3, 2), abgeleitet.note)
      .input('punkte', sql.Decimal(5, 1), abgeleitet.punkte)
      .input('maxPunkte', sql.SmallInt, abgeleitet.maxPunkte)
      .input('ausPunkten', sql.Bit, abgeleitet.ausPunkten ? 1 : 0)
      .input('credits', sql.Decimal(4, 1), credits)
      .input('status', sql.NVarChar(15), status)
      .input('bemerkung', sql.NVarChar(1000), neu.bemerkung || null)
      .query(`UPDATE dbo.NotenEintraege SET
                Titel = @titel, Art = @art, Datum = @datum,
                Note = @note, Punkte = @punkte, MaxPunkte = @maxPunkte,
                NoteAusPunkten = @ausPunkten,
                Credits = @credits, Status = @status,
                Bemerkung = @bemerkung, AktualisiertAm = SYSUTCDATETIME()
              OUTPUT inserted.* WHERE Id = @id`);
    const zeile = r.recordset[0];

    // Nachträglich zu einer Mitteilungs-Art gemacht (z.B. Klassenarbeit →
    // Zeugnis)? Dann jetzt melden — aber nur, wenn es nie gemeldet wurde.
    if (notenSvc.ARTEN_MIT_MITTEILUNG.has(zeile.Art) && !alt.MitteilungGesendetAm) {
      await melde(pool, zeile.Id, alt.AzubiOid);
    }
    res.json(mapEintrag(zeile));
  } catch (err) { fehler(req, res, 'eintrag aendern', err); }
});

router.delete('/eintraege/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const eintrag = await ladeEintrag(pool, req.params.id);
    if (!eintrag) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
    if (!darfSchreiben(req, res, eintrag.AzubiOid)) return;

    const z = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT COUNT(*) AS Belege FROM dbo.NotenBelege WHERE EintragId = @id');
    // Belege folgen per ON DELETE CASCADE; die Zahl geht in die Antwort,
    // damit das Frontend "1 Beleg mit gelöscht" melden kann.
    await pool.request().input('id', sql.Int, req.params.id)
      .query('DELETE FROM dbo.NotenEintraege WHERE Id = @id');
    res.json({ ok: true, geloescht: { belege: z.recordset[0].Belege } });
  } catch (err) { fehler(req, res, 'eintrag loeschen', err); }
});

/* ── Belege ────────────────────────────────────────────────────────── */
router.post('/eintraege/:id/belege', uploadSingle, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei übermittelt.' });
    // Dateiname kann von multer in latin1 ankommen → nach UTF-8
    // normalisieren, damit Umlaute nicht zerschossen werden.
    const dateiname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    if (!core.endungErlaubt(dateiname)) {
      return res.status(400).json({ error: `Dateityp nicht erlaubt. Erlaubt: ${ERLAUBT_TEXT}` });
    }

    const pool = await getPool();
    const eintrag = await ladeEintrag(pool, req.params.id);
    if (!eintrag) return res.status(404).json({ error: 'Eintrag nicht gefunden.' });
    if (!darfSchreiben(req, res, eintrag.AzubiOid)) return;

    const r = await pool.request()
      .input('eintragId', sql.Int, req.params.id)
      .input('dateiname', sql.NVarChar(255), dateiname)
      .input('mimeTyp', sql.NVarChar(100), req.file.mimetype || null)
      .input('groesse', sql.Int, req.file.size)
      .input('inhalt', sql.VarBinary(sql.MAX), req.file.buffer)
      .query(`INSERT INTO dbo.NotenBelege (EintragId, Dateiname, MimeTyp, GroesseBytes, Inhalt)
              OUTPUT inserted.Id, inserted.EintragId, inserted.Dateiname, inserted.MimeTyp,
                     inserted.GroesseBytes, inserted.HochgeladenAm
              VALUES (@eintragId, @dateiname, @mimeTyp, @groesse, @inhalt)`);
    res.status(201).json(mapBeleg(r.recordset[0]));
  } catch (err) { fehler(req, res, 'beleg upload', err); }
});

// Sichtbarkeit wird hier NEU geprüft — ein Beleg-Link ist sonst ein
// dauerhaftes Leseloch, auch nachdem eine Zuordnung endet.
router.get('/belege/:id/download', async (req, res) => {
  try {
    const pool = await getPool();
    const beleg = await ladeBeleg(pool, req.params.id);
    if (!beleg) return res.status(404).json({ error: 'Beleg nicht gefunden.' });
    if (!(await darfLesen(pool, req, res, beleg.AzubiOid))) return;

    const encoded = encodeURIComponent(beleg.Dateiname);
    res.setHeader('Content-Type', beleg.MimeTyp || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`);
    res.setHeader('Cache-Control', 'no-store'); // personenbezogen
    res.send(beleg.Inhalt); // VARBINARY → Buffer
  } catch (err) { fehler(req, res, 'beleg download', err); }
});

router.delete('/belege/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const beleg = await ladeBeleg(pool, req.params.id);
    if (!beleg) return res.status(404).json({ error: 'Beleg nicht gefunden.' });
    if (!darfSchreiben(req, res, beleg.AzubiOid)) return;

    await pool.request().input('id', sql.Int, req.params.id)
      .query('DELETE FROM dbo.NotenBelege WHERE Id = @id');
    res.json({ ok: true });
  } catch (err) { fehler(req, res, 'beleg loeschen', err); }
});

module.exports = router;
