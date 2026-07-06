'use strict';
/* Dauerhafte Ausbilder<->Azubi-Zuordnung (dbo.AusbilderAzubis).
   Getrennt vom befristeten Zuweisungs-/Zugriffskontext. */
const { getPool, sql } = require('../db/connection');
const { getUserByOid, buildReqUser } = require('./users');

// Aktuell zugewiesene Ausbilder eines Azubis (für das Modal).
async function listFuerAzubi(azubiOid) {
  const pool = await getPool();
  const r = await pool.request()
    .input('azubiOid', sql.NVarChar(36), azubiOid)
    .query(`
      SELECT u.Oid AS oid, u.Name AS name, u.Email AS email
      FROM dbo.AusbilderAzubis aa
      JOIN dbo.Users u ON u.Oid = aa.AusbilderOid
      WHERE aa.AzubiOid = @azubiOid
      ORDER BY u.Name
    `);
  return r.recordset;
}

// Prüft: Ziel ist Azubi, alle OIDs sind ausbilderfähig. Keine DB-Schreibzugriffe.
async function validateZuordnung(azubiOid, ausbilderOids) {
  const azubi = await getUserByOid(azubiOid);
  if (!azubi) return { ok: false, status: 404, error: 'Azubi nicht gefunden.' };
  if (!buildReqUser(azubi).istAzubi) return { ok: false, status: 400, error: 'Ziel-Nutzer ist kein Azubi.' };
  for (const oid of ausbilderOids) {
    const row = await getUserByOid(oid);
    if (!row || !buildReqUser(row).istAusbilder) {
      return { ok: false, status: 400, error: `Nutzer ${oid} ist kein Ausbilder.` };
    }
  }
  return { ok: true };
}

// Ersetzt die Ausbilder-Menge eines Azubis transaktional (DELETE + INSERT).
async function setFuerAzubi(azubiOid, ausbilderOids) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('azubiOid', sql.NVarChar(36), azubiOid)
      .query('DELETE FROM dbo.AusbilderAzubis WHERE AzubiOid = @azubiOid');
    for (const oid of [...new Set(ausbilderOids)]) {
      await new sql.Request(tx)
        .input('azubiOid', sql.NVarChar(36), azubiOid)
        .input('ausbilderOid', sql.NVarChar(36), oid)
        .query('INSERT INTO dbo.AusbilderAzubis (AzubiOid, AusbilderOid) VALUES (@azubiOid, @ausbilderOid)');
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

module.exports = { listFuerAzubi, validateZuordnung, setFuerAzubi };
