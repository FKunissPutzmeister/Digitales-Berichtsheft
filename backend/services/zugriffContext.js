'use strict';
/* Unreine DB-Adapter für die Zugriffsprüfung: laden die normalisierten
   Eingaben, die backend/services/zugriff.js (rein) erwartet. */
const { sql } = require('../db/connection');

// Zuweisungen, in denen `userEmail` Verantwortliche/r ist, + heutiger Stichtag (UTC-Kalendertag).
async function ladeKorrekturKontext(pool, userEmail) {
  const email = String(userEmail || '').trim().toLowerCase();
  const r = await pool.request()
    .input('email', sql.NVarChar(255), email)
    .query('SELECT AzubiOid, VerantwEmail, Von, Bis FROM dbo.Zuweisungen WHERE VerantwEmail = @email');
  const zuweisungen = r.recordset.map(z => ({
    azubiOid: z.AzubiOid,
    verantwortlicherEmail: z.VerantwEmail,
    von: z.Von,
    bis: z.Bis,
  }));
  const stichtag = new Date().toISOString().slice(0, 10);
  return { zuweisungen, stichtag };
}

// Eine Woche normalisiert (inkl. Korrektur-Spuren) für die Zugriffsprüfung.
async function ladeWocheFuerZugriff(pool, wocheId) {
  const r = await pool.request()
    .input('id', sql.Int, wocheId)
    .query(`
      SELECT w.AzubiOid, w.StartDatum, w.EndDatum, w.Status, w.KorrigiertVon,
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
    korrigiertVon: row.KorrigiertVon,
    kommentarAutoren: autoren,
  };
}

module.exports = { ladeKorrekturKontext, ladeWocheFuerZugriff };
