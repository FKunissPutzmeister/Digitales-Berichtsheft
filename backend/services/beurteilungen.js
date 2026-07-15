'use strict';
/* Persistenz + Logik für Beurteilungsbögen. Rechenkern wird aus dem
   Frontend-Kernmodul WIEDERVERWENDET (eine Wahrheit für die Mathematik). */
const { getPool, sql } = require('../db/connection');
const { berechne } = require('../../app/js/beurteilung-core.js');
const { ladeKorrekturKontext } = require('./zugriffContext');
const { verantwortlichFuerZuweisung } = require('./zugriff');
const { aktiveVertreteneEmails } = require('./vertretungen');

const heuteYmd = () => new Date().toISOString().slice(0, 10);

async function ladeZuweisung(pool, zuweisungId) {
  const r = await pool.request()
    .input('id', sql.Int, zuweisungId)
    .query('SELECT Id, AzubiOid, VerantwEmail, Abteilung, Von, Bis FROM dbo.Zuweisungen WHERE Id = @id');
  const z = r.recordset[0];
  if (!z) return null;
  return {
    id: z.Id, azubiOid: z.AzubiOid, verantwortlicherEmail: z.VerantwEmail,
    abteilung: z.Abteilung, von: z.Von, bis: z.Bis,
  };
}

// Darf der Nutzer die Beurteilung dieser Zuweisung bearbeiten?
async function darfBeurteilen(user, zuweisung, pool) {
  if (!zuweisung) return false;
  if (user.role === 'developer' || user.role === 'admin') return true;
  const kontext = await ladeKorrekturKontext(pool, user);
  return verantwortlichFuerZuweisung(user, zuweisung, kontext);
}

async function ladeKriterien(pool, beurteilungId) {
  const r = await pool.request()
    .input('bid', sql.Int, beurteilungId)
    .query('SELECT KriteriumKey, Punkte FROM dbo.BeurteilungKriterien WHERE BeurteilungId = @bid');
  return r.recordset.map(x => ({ kriteriumKey: x.KriteriumKey, punkte: x.Punkte }));
}

async function getByZuweisung(pool, zuweisungId) {
  const r = await pool.request()
    .input('zid', sql.Int, zuweisungId)
    .query('SELECT * FROM dbo.Beurteilungen WHERE ZuweisungId = @zid');
  const b = r.recordset[0];
  if (!b) return null;
  b.kriterien = await ladeKriterien(pool, b.Id);
  return b;
}

async function listByAzubi(pool, azubiOid) {
  const r = await pool.request()
    .input('oid', sql.NVarChar(36), azubiOid)
    .query('SELECT ZuweisungId, Status, Note, GesamtPunkte, AbgeschlossenAm FROM dbo.Beurteilungen WHERE AzubiOid = @oid');
  return r.recordset;
}

// Rechnet Gesamt/Note aus kriterien = [{kriteriumKey,punkte}].
function rechne(kriterien) {
  const byKey = {};
  (kriterien || []).forEach(k => { byKey[k.kriteriumKey] = k.punkte; });
  return berechne(byKey);
}

// Kriterien für eine Beurteilung neu setzen (delete-then-insert, wie Tage/Wochen).
async function schreibeKriterien(tx, beurteilungId, kriterien) {
  await new sql.Request(tx).input('bid', sql.Int, beurteilungId)
    .query('DELETE FROM dbo.BeurteilungKriterien WHERE BeurteilungId = @bid');
  for (const k of (kriterien || [])) {
    if (k.punkte === null || k.punkte === undefined || k.punkte === '') continue;
    await new sql.Request(tx)
      .input('bid', sql.Int, beurteilungId)
      .input('key', sql.NVarChar(40), k.kriteriumKey)
      .input('pkt', sql.TinyInt, Math.max(0, Math.min(100, Math.round(Number(k.punkte)))))
      .query('INSERT INTO dbo.BeurteilungKriterien (BeurteilungId, KriteriumKey, Punkte) VALUES (@bid,@key,@pkt)');
  }
}

async function upsertEntwurf(pool, { zuweisungId, azubiOid, kriterien, individuelleBeurteilung, gespraechAm }) {
  const calc = rechne(kriterien);
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const up = await new sql.Request(tx)
      .input('zid', sql.Int, zuweisungId)
      .input('oid', sql.NVarChar(36), azubiOid)
      .input('indiv', sql.NVarChar(sql.MAX), individuelleBeurteilung ?? null)
      .input('ges', sql.Decimal(5, 2), calc.gesamt)
      .input('note', sql.Decimal(2, 1), calc.note)
      .input('gespr', sql.Date, gespraechAm || null)
      .query(`
        MERGE dbo.Beurteilungen AS t
        USING (SELECT @zid AS ZuweisungId) AS s ON t.ZuweisungId = s.ZuweisungId
        WHEN MATCHED THEN UPDATE SET
          IndividuelleBeurteilung=@indiv, GesamtPunkte=@ges, Note=@note,
          GespraechAm=@gespr, AktualisiertAm=SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (ZuweisungId, AzubiOid, Status, IndividuelleBeurteilung, GesamtPunkte, Note, GespraechAm)
          VALUES (@zid, @oid, 'entwurf', @indiv, @ges, @note, @gespr)
        OUTPUT inserted.Id;
      `);
    const id = up.recordset[0].Id;
    await schreibeKriterien(tx, id, kriterien);
    await tx.commit();
    return id;
  } catch (e) { await tx.rollback(); throw e; }
}

// Serverseitige Mitteilung (inkl. ZuweisungId; kein offener Client-POST).
// `runner` = Pool ODER laufende Transaktion – so kann der INSERT atomar
// gemeinsam mit dem Status-Update ausgeführt werden (siehe abschliessen).
async function erzeugeBenachrichtigung(runner, { userOid, typ, zuweisungId, fromUserOid }) {
  if (!userOid) return; // Empfänger ohne OID (nie eingeloggt) -> später self-healing
  await new sql.Request(runner)
    .input('userOid', sql.NVarChar(36), userOid)
    .input('typ', sql.NVarChar(40), typ)
    .input('zid', sql.Int, zuweisungId)
    .input('from', sql.NVarChar(36), fromUserOid || null)
    .query(`INSERT INTO dbo.Benachrichtigungen (UserOid, Typ, ZuweisungId, FromUserOid)
            VALUES (@userOid,@typ,@zid,@from)`);
}

async function abschliessen(pool, id, autorOid) {
  const cur = await pool.request().input('id', sql.Int, id)
    .query('SELECT Id, ZuweisungId, AzubiOid FROM dbo.Beurteilungen WHERE Id=@id');
  const b = cur.recordset[0];
  if (!b) throw new Error('Beurteilung nicht gefunden.');
  // Status-Update UND Azubi-Mitteilung atomar: schlägt der Benachrichtigungs-
  // INSERT fehl (z.B. CHECK-Constraint), wird auch der Abschluss zurückgerollt –
  // kein stiller Zustand "abgeschlossen ohne Mitteilung".
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('id', sql.Int, id)
      .input('von', sql.NVarChar(36), autorOid)
      .query(`UPDATE dbo.Beurteilungen SET Status='abgeschlossen',
                AbgeschlossenAm=SYSUTCDATETIME(), BeurteiltVon=@von, AktualisiertAm=SYSUTCDATETIME()
              WHERE Id=@id`);
    await erzeugeBenachrichtigung(tx, {
      userOid: b.AzubiOid, typ: 'beurteilung_abgeschlossen', zuweisungId: b.ZuweisungId, fromUserOid: autorOid,
    });
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }
}

async function patchNachAbschluss(pool, id, { kriterien, individuelleBeurteilung, gespraechAm }, autorOid) {
  const cur = await pool.request().input('id', sql.Int, id)
    .query('SELECT Id, ZuweisungId, AzubiOid FROM dbo.Beurteilungen WHERE Id=@id');
  const b = cur.recordset[0];
  if (!b) throw new Error('Beurteilung nicht gefunden.');
  const calc = rechne(kriterien);
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('id', sql.Int, id)
      .input('indiv', sql.NVarChar(sql.MAX), individuelleBeurteilung ?? null)
      .input('ges', sql.Decimal(5, 2), calc.gesamt)
      .input('note', sql.Decimal(2, 1), calc.note)
      .input('gespr', sql.Date, gespraechAm || null)
      .input('von', sql.NVarChar(36), autorOid)
      .query(`UPDATE dbo.Beurteilungen SET IndividuelleBeurteilung=@indiv, GesamtPunkte=@ges,
                Note=@note, GespraechAm=@gespr, KorrigiertVon=@von, KorrigiertAm=SYSUTCDATETIME(),
                AktualisiertAm=SYSUTCDATETIME() WHERE Id=@id`);
    await schreibeKriterien(tx, id, kriterien);
    // Mitteilung im selben Transaktions-Rahmen (atomar mit der Korrektur).
    await erzeugeBenachrichtigung(tx, {
      userOid: b.AzubiOid, typ: 'beurteilung_abgeschlossen', zuweisungId: b.ZuweisungId, fromUserOid: autorOid,
    });
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }
}

async function kenntnisnahme(pool, id, azubiOid) {
  await pool.request()
    .input('id', sql.Int, id)
    .input('oid', sql.NVarChar(36), azubiOid)
    .query(`UPDATE dbo.Beurteilungen SET KenntnisnahmeVon=@oid, KenntnisnahmeAm=SYSUTCDATETIME(),
              AktualisiertAm=SYSUTCDATETIME() WHERE Id=@id AND AzubiOid=@oid`);
}

// Beendete Durchläufe des Nutzers ohne abgeschlossene Beurteilung -> Mitteilung anlegen (idempotent).
async function ermittleUndErzeugeFaellige(pool, user) {
  const email = String(user.email || '').toLowerCase();
  if (!email) return [];
  // Eigene Zuweisungen + die der aktuell Vertretenen (der Vertreter soll auch
  // deren fällige Beurteilungen sehen/erledigen). Alle per VerantwEmail.
  const delegiert = await aktiveVertreteneEmails(pool, user.oid);
  const emails = [...new Set([email, ...delegiert])];
  const req = pool.request().input('heute', sql.Date, heuteYmd());
  const params = emails.map((e, i) => { req.input(`e${i}`, sql.NVarChar(255), e); return `@e${i}`; });
  const r = await req
    .query(`
      SELECT z.Id AS ZuweisungId, z.Abteilung, z.Von, z.Bis, z.AzubiOid
      FROM dbo.Zuweisungen z
      LEFT JOIN dbo.Beurteilungen b ON b.ZuweisungId = z.Id AND b.Status = 'abgeschlossen'
      WHERE z.VerantwEmail IN (${params.join(',')}) AND z.Bis IS NOT NULL AND z.Bis < @heute AND b.Id IS NULL
      ORDER BY z.Bis DESC`);
  for (const z of r.recordset) {
    const exists = await pool.request()
      .input('userOid', sql.NVarChar(36), user.oid)
      .input('zid', sql.Int, z.ZuweisungId)
      .query(`SELECT TOP 1 Id FROM dbo.Benachrichtigungen
              WHERE UserOid=@userOid AND Typ='beurteilung_faellig' AND ZuweisungId=@zid`);
    if (!exists.recordset.length) {
      await erzeugeBenachrichtigung(pool, {
        userOid: user.oid, typ: 'beurteilung_faellig', zuweisungId: z.ZuweisungId, fromUserOid: null,
      });
    }
  }
  return r.recordset.map(z => ({
    zuweisungId: z.ZuweisungId, abteilung: z.Abteilung, von: z.Von, bis: z.Bis, azubiOid: z.AzubiOid,
  }));
}

module.exports = {
  ladeZuweisung, darfBeurteilen, getByZuweisung, listByAzubi,
  upsertEntwurf, abschliessen, patchNachAbschluss, kenntnisnahme, ermittleUndErzeugeFaellige,
};
