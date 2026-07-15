'use strict';
/* =====================================================================
   VERTRETUNGEN (Self-Service-Delegation, dbo.Vertretungen).
   Eine betreuende Person (Vertretener) delegiert ihre azubi-bezogenen
   Rechte an eine andere (Vertreter) – dauerhaft (Von/Bis NULL) oder
   befristet. Solange am Stichtag aktiv, werden die Zugriffsquellen des
   Vertretenen additiv in den Kontext des Vertreters uniert
   (backend/services/zugriffContext.js) und seine Azubis im Selektor
   sichtbar (backend/routes/users.js → /me/azubis).
   ===================================================================== */
const { getPool, sql } = require('../db/connection');
const { getUserByOid, buildReqUser } = require('./users');

// heutiger Kalendertag (UTC), 'YYYY-MM-DD' – konsistent mit zugriffContext.
function heute() { return new Date().toISOString().slice(0, 10); }

// Am Stichtag aktives Fenster: (Von NULL oder Von<=t) UND (Bis NULL oder t<=Bis).
const AKTIV_CLAUSE = '(v.Von IS NULL OR v.Von <= @t) AND (v.Bis IS NULL OR @t <= v.Bis)';

// OIDs der Personen, die @deputy aktuell vertreten lässt (er erbt deren Rechte).
async function aktiveVertreteneOids(pool, vertreterOid, stichtag) {
  if (!vertreterOid) return [];
  const r = await pool.request()
    .input('deputy', sql.NVarChar(36), vertreterOid)
    .input('t', sql.Date, stichtag || heute())
    .query(`SELECT DISTINCT v.VertretenerOid FROM dbo.Vertretungen v
            WHERE v.VertreterOid = @deputy AND ${AKTIV_CLAUSE}`);
  return r.recordset.map(x => x.VertretenerOid);
}

// OIDs der Personen, die @principal aktuell vertreten (für Benachrichtigungs-
// Weiterleitung: eine Mitteilung an @principal geht auch an diese).
async function aktiveVertreterOids(pool, vertretenerOid, stichtag) {
  if (!vertretenerOid) return [];
  const r = await pool.request()
    .input('principal', sql.NVarChar(36), vertretenerOid)
    .input('t', sql.Date, stichtag || heute())
    .query(`SELECT DISTINCT v.VertreterOid FROM dbo.Vertretungen v
            WHERE v.VertretenerOid = @principal AND ${AKTIV_CLAUSE}`);
  return r.recordset.map(x => x.VertreterOid);
}

// E-Mails der aktiven Vertretenen (für befristete Zuweisungs-Abfragen, die
// per VerantwEmail gehen – z.B. fällige Beurteilungen).
async function aktiveVertreteneEmails(pool, vertreterOid, stichtag) {
  if (!vertreterOid) return [];
  const r = await pool.request()
    .input('deputy', sql.NVarChar(36), vertreterOid)
    .input('t', sql.Date, stichtag || heute())
    .query(`SELECT DISTINCT LOWER(u.Email) AS Email
            FROM dbo.Vertretungen v JOIN dbo.Users u ON u.Oid = v.VertretenerOid
            WHERE v.VertreterOid = @deputy AND ${AKTIV_CLAUSE} AND u.Email IS NOT NULL`);
  return r.recordset.map(x => x.Email).filter(Boolean);
}

// Empfängerliste um die aktiven Vertreter jedes Empfängers erweitern.
// Azubis haben keine Vertreter → für sie no-op. Dedupliziert.
async function mitVertretern(pool, empfaengerOids, stichtag) {
  const t = stichtag || heute();
  const set = new Set((empfaengerOids || []).filter(Boolean));
  for (const oid of [...set]) {
    for (const dep of await aktiveVertreterOids(pool, oid, t)) set.add(dep);
  }
  return [...set];
}

// Volle Users-Zeilen der Azubis, die @deputy über AKTIVE Vertretungen sieht:
// dauerhafte Zuordnungen (AusbilderAzubis) UND befristete Zuweisungen
// (VerantwEmail) der Vertretenen. Eine Abfrage, für /me/azubis-Selektor.
async function listDelegierteAzubis(pool, vertreterOid, stichtag) {
  if (!vertreterOid) return [];
  const r = await pool.request()
    .input('deputy', sql.NVarChar(36), vertreterOid)
    .input('t', sql.Date, stichtag || heute())
    .query(`
      SELECT DISTINCT u.*
      FROM dbo.Vertretungen v
      JOIN dbo.Users pv ON pv.Oid = v.VertretenerOid
      JOIN dbo.Users u  ON u.Aktiv = 1 AND (
             u.Oid IN (SELECT AzubiOid FROM dbo.AusbilderAzubis WHERE AusbilderOid = v.VertretenerOid)
          OR u.Oid IN (SELECT AzubiOid FROM dbo.Zuweisungen WHERE LOWER(VerantwEmail) = LOWER(pv.Email))
      )
      WHERE v.VertreterOid = @deputy AND ${AKTIV_CLAUSE}
      ORDER BY u.Name`);
  return r.recordset;
}

// Vertretungen mit Bezug zu @oid: als Vertretener (von mir vergeben) UND als
// Vertreter (ich vertrete). Inkl. Namen für die UI.
async function listeFuerNutzer(pool, oid) {
  const r = await pool.request()
    .input('oid', sql.NVarChar(36), oid)
    .query(`
      SELECT v.Id, v.VertretenerOid, v.VertreterOid, v.Von, v.Bis, v.ErstelltAm,
             pv.Name AS VertretenerName, pd.Name AS VertreterName
      FROM dbo.Vertretungen v
      LEFT JOIN dbo.Users pv ON pv.Oid = v.VertretenerOid
      LEFT JOIN dbo.Users pd ON pd.Oid = v.VertreterOid
      WHERE v.VertretenerOid = @oid OR v.VertreterOid = @oid
      ORDER BY v.ErstelltAm DESC`);
  const t = heute();
  const aktiv = (von, bis) => {
    const ymd = d => d ? new Date(d).toISOString().slice(0, 10) : null;
    const vo = ymd(von), bi = ymd(bis);
    return (!vo || vo <= t) && (!bi || t <= bi);
  };
  return r.recordset.map(x => ({
    id: x.Id,
    vertretenerOid: x.VertretenerOid,
    vertreterOid: x.VertreterOid,
    vertretenerName: x.VertretenerName,
    vertreterName: x.VertreterName,
    von: x.Von ? new Date(x.Von).toISOString().slice(0, 10) : null,
    bis: x.Bis ? new Date(x.Bis).toISOString().slice(0, 10) : null,
    aktiv: aktiv(x.Von, x.Bis),
    richtung: x.VertretenerOid === oid ? 'vergeben' : 'erhalten',
  }));
}

// Vertreter muss existieren, betreuend sein (kein Azubi/DH), nicht man selbst.
async function validiereVertreter(vertreterOid, vertretenerOid) {
  if (!vertreterOid) return { ok: false, status: 400, error: 'Kein Vertreter angegeben.' };
  if (vertreterOid === vertretenerOid) return { ok: false, status: 400, error: 'Man kann sich nicht selbst vertreten.' };
  const row = await getUserByOid(vertreterOid);
  if (!row) return { ok: false, status: 404, error: 'Vertreter nicht gefunden.' };
  const u = buildReqUser(row);
  if (u.istAzubi || u.istDhStudent) {
    return { ok: false, status: 400, error: 'Als Vertreter kommt nur eine betreuende Person in Frage (kein Azubi/DH-Student).' };
  }
  return { ok: true };
}

// Anlegen. von/bis 'YYYY-MM-DD' oder null. Wirft bei Doppelung (UNIQUE) –
// die Route fängt das als 409 ab.
async function anlegen(pool, { vertretenerOid, vertreterOid, von, bis, erstelltVon }) {
  const r = await pool.request()
    .input('ver', sql.NVarChar(36), vertretenerOid)
    .input('dep', sql.NVarChar(36), vertreterOid)
    .input('von', sql.Date, von || null)
    .input('bis', sql.Date, bis || null)
    .input('erst', sql.NVarChar(36), erstelltVon || null)
    .query(`INSERT INTO dbo.Vertretungen (VertretenerOid, VertreterOid, Von, Bis, ErstelltVon)
            OUTPUT inserted.Id
            VALUES (@ver, @dep, @von, @bis, @erst)`);
  return r.recordset[0].Id;
}

// Beenden – nur die eigene (VertretenerOid = @oid). Gibt die gelöschte Zeile
// zurück (für die Benachrichtigung an den Vertreter) oder null.
async function beenden(pool, id, vertretenerOid) {
  const pre = await pool.request()
    .input('id', sql.Int, id)
    .input('oid', sql.NVarChar(36), vertretenerOid)
    .query('SELECT * FROM dbo.Vertretungen WHERE Id = @id AND VertretenerOid = @oid');
  const row = pre.recordset[0];
  if (!row) return null;
  await pool.request().input('id', sql.Int, id)
    .query('DELETE FROM dbo.Vertretungen WHERE Id = @id');
  return row;
}

module.exports = {
  heute,
  aktiveVertreteneOids, aktiveVertreterOids, aktiveVertreteneEmails,
  mitVertretern, listDelegierteAzubis, listeFuerNutzer,
  validiereVertreter, anlegen, beenden,
};
