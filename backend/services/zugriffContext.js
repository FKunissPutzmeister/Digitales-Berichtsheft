'use strict';
/* Unreine DB-Adapter für die Zugriffsprüfung: laden die normalisierten
   Eingaben, die backend/services/zugriff.js (rein) erwartet. */
const { sql } = require('../db/connection');
const { aktiveVertreteneOids } = require('./vertretungen');

// Befristete Zuweisungen einer VerantwEmail, normalisiert. `alsEmail` schreibt
// die effektive Identität in verantwortlicherEmail — bei delegierten Zuweisungen
// wird so die E-Mail des Vertreters eingesetzt, damit der reine Check
// (z.verantwortlicherEmail === user.email) unverändert greift.
async function ladeZuweisungen(pool, verantwEmail, alsEmail) {
  const rz = await pool.request()
    .input('email', sql.NVarChar(255), verantwEmail)
    .query('SELECT Id, AzubiOid, VerantwEmail, Abteilung, Von, Bis FROM dbo.Zuweisungen WHERE VerantwEmail = @email');
  return rz.recordset.map(z => ({
    id: z.Id,
    azubiOid: z.AzubiOid,
    verantwortlicherEmail: alsEmail,
    abteilung: z.Abteilung,
    von: z.Von,
    bis: z.Bis,
  }));
}

async function ladeDauerAzubiOids(pool, ausbilderOid) {
  const rd = await pool.request()
    .input('oid', sql.NVarChar(36), ausbilderOid)
    .query('SELECT AzubiOid FROM dbo.AusbilderAzubis WHERE AusbilderOid = @oid');
  return rd.recordset.map(r => r.AzubiOid);
}

// Zuweisungen (befristet, per E-Mail) + dauerhafte Ausbilder-Zuordnungen (per OID)
// des Nutzers + heutiger Stichtag (UTC-Kalendertag). PLUS: die Quellen jeder
// Person, die den Nutzer aktuell VERTRETEN lässt — additiv uniert, unter der
// Identität (E-Mail) des Vertreters. Eine Ebene (keine Weiterdelegation).
async function ladeKorrekturKontext(pool, user) {
  const email = String((user && user.email) || '').trim().toLowerCase();
  const oid   = String((user && user.oid)   || '').trim();
  const stichtag = new Date().toISOString().slice(0, 10);

  const zuweisungen = await ladeZuweisungen(pool, email, email);
  const dauerSet = new Set(await ladeDauerAzubiOids(pool, oid));

  const vertretene = oid ? await aktiveVertreteneOids(pool, oid, stichtag) : [];
  for (const vOid of vertretene) {
    const vr = await pool.request().input('oid', sql.NVarChar(36), vOid)
      .query('SELECT Email FROM dbo.Users WHERE Oid = @oid');
    const vEmail = String((vr.recordset[0] && vr.recordset[0].Email) || '').trim().toLowerCase();
    if (vEmail) zuweisungen.push(...await ladeZuweisungen(pool, vEmail, email));
    for (const az of await ladeDauerAzubiOids(pool, vOid)) dauerSet.add(az);
  }

  return { zuweisungen, stichtag, dauerAusbilderAzubiOids: [...dauerSet] };
}

// Eine Woche normalisiert (inkl. Korrektur-Spuren) für die Zugriffsprüfung.
async function ladeWocheFuerZugriff(pool, wocheId) {
  const r = await pool.request()
    .input('id', sql.Int, wocheId)
    .query(`
      SELECT w.AzubiOid, w.StartDatum, w.EndDatum, w.Status, w.KorrigiertVon, w.EndabnahmeDirekt,
        (SELECT k.UserOid FROM dbo.Kommentare k WHERE k.WocheId = w.Id FOR JSON PATH) AS autorenJson
      FROM dbo.Wochen w WHERE w.Id = @id
    `);
  const row = r.recordset[0];
  if (!row) return null;
  const autoren = row.autorenJson ? JSON.parse(row.autorenJson).map(a => a.UserOid) : [];
  return {
    id: Number(wocheId),
    azubiOid: row.AzubiOid,
    start: row.StartDatum,
    ende: row.EndDatum,
    status: row.Status,
    endabnahmeDirekt: row.EndabnahmeDirekt ? 1 : 0,
    korrigiertVon: row.KorrigiertVon,
    kommentarAutoren: autoren,
  };
}

module.exports = { ladeKorrekturKontext, ladeWocheFuerZugriff };
