'use strict';
/* API-Schlüssel für den MCP-Zugriff ("Snipe-IT-Modell").
   – Klartext-Schlüssel wird EINMALIG bei der Erstellung zurückgegeben.
   – Gespeichert wird nur der SHA-256-Hash (dbo.ApiKeys.KeyHash).
   – Auflösung (resolveApiKey) prüft Aktiv-Flag des Schlüssels UND des Nutzers. */
const crypto = require('node:crypto');
const { getPool, sql } = require('../db/connection');

// Format: pmb_<43 base64url-Zeichen> (256 Bit Entropie).
function generateKey() {
  return 'pmb_' + crypto.randomBytes(32).toString('base64url');
}
function hashKey(key) {
  return crypto.createHash('sha256').update(String(key), 'utf8').digest('hex');
}

async function createApiKey(userOid, label) {
  const key = generateKey();
  const pool = await getPool();
  const r = await pool.request()
    .input('userOid', sql.NVarChar(36), userOid)
    .input('keyHash', sql.Char(64), hashKey(key))
    .input('label',   sql.NVarChar(100), label || null)
    .query(`INSERT INTO dbo.ApiKeys (UserOid, KeyHash, Label)
            OUTPUT inserted.Id VALUES (@userOid, @keyHash, @label)`);
  return { id: r.recordset[0].Id, key };     // key NUR hier – danach nie wieder lesbar
}

async function listApiKeys() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT k.Id, k.UserOid, k.Label, k.Aktiv, k.ErstelltAm, k.ZuletztGenutzt,
           u.Name AS UserName, u.Email AS UserEmail
    FROM dbo.ApiKeys k LEFT JOIN dbo.Users u ON u.Oid = k.UserOid
    ORDER BY u.Name, k.ErstelltAm DESC`);
  return r.recordset;
}

async function setApiKeyAktiv(id, aktiv) {
  const pool = await getPool();
  const r = await pool.request()
    .input('id', sql.Int, id).input('aktiv', sql.Bit, aktiv ? 1 : 0)
    .query('UPDATE dbo.ApiKeys SET Aktiv = @aktiv WHERE Id = @id');
  return r.rowsAffected[0] > 0;
}

async function deleteApiKey(id) {
  const pool = await getPool();
  const r = await pool.request().input('id', sql.Int, id)
    .query('DELETE FROM dbo.ApiKeys WHERE Id = @id');
  return r.rowsAffected[0] > 0;
}

// MCP-Auth: Klartext-Bearer → { userOid } wenn Schlüssel UND Nutzer aktiv sind.
// Aktualisiert ZuletztGenutzt (fire-and-forget). Sonst null.
async function resolveApiKey(key) {
  if (!key || !String(key).startsWith('pmb_')) return null;
  const pool = await getPool();
  const r = await pool.request().input('h', sql.Char(64), hashKey(key)).query(`
    SELECT k.Id, k.UserOid, k.Aktiv AS KeyAktiv, u.Aktiv AS UserAktiv
    FROM dbo.ApiKeys k LEFT JOIN dbo.Users u ON u.Oid = k.UserOid
    WHERE k.KeyHash = @h`);
  const row = r.recordset[0];
  if (!row || !row.KeyAktiv || !row.UserAktiv) return null;
  pool.request().input('id', sql.Int, row.Id)
    .query('UPDATE dbo.ApiKeys SET ZuletztGenutzt = SYSUTCDATETIME() WHERE Id = @id')
    .catch(() => { /* nicht kritisch */ });
  return { keyId: row.Id, userOid: row.UserOid };
}

module.exports = {
  generateKey, hashKey, createApiKey, listApiKeys,
  setApiKeyAktiv, deleteApiKey, resolveApiKey,
};
