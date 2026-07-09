'use strict';
const crypto = require('crypto');
const { getPool, sql } = require('../db/connection');

// Fingerprint gruppiert „gleiche" Fehler: Quelle + Nachricht + die ersten 3
// Stack-Zeilen (tiefer unten wandern Zeilennummern/async-Frames, das würde
// sonst jeden Aufruf einzigartig machen). Rein & testbar, kein DB-Zugriff.
function berechneFingerprint({ quelle, nachricht, stack }) {
  const stackKopf = String(stack || '').split('\n').slice(0, 3).join('\n');
  const basis = `${quelle}|${nachricht}|${stackKopf}`;
  return crypto.createHash('sha256').update(basis).digest('hex');
}

// Persistiert einen Fehler. Gruppiert per Fingerprint auf einen OFFENEN Eintrag
// (Anzahl++ + LetzterZeitpunkt/Stack/Kontext aktualisieren) statt neuer Zeile.
// Logging darf den Request NIE killen → alle Fehler hier werden verschluckt,
// nachdem sie zusätzlich auf der Konsole gelandet sind (nssm-Datei-Boden).
async function logError({ quelle, nachricht, stack, kontext, benutzerOid, benutzerName }) {
  const msg = String(nachricht == null ? '' : nachricht).slice(0, 8000);
  const kontextStr = kontext == null ? null
    : (typeof kontext === 'string' ? kontext : JSON.stringify(kontext));
  console.error(`[fehler:${quelle}]`, msg, stack ? `\n${stack}` : '');
  try {
    const fp = berechneFingerprint({ quelle, nachricht: msg, stack });
    const pool = await getPool();
    const upd = await pool.request()
      .input('fp', sql.NVarChar(64), fp)
      .input('stack', sql.NVarChar(sql.MAX), stack || null)
      .input('kontext', sql.NVarChar(sql.MAX), kontextStr)
      .query(`
        UPDATE TOP (1) dbo.Fehlerberichte
        SET Anzahl = Anzahl + 1,
            LetzterZeitpunkt = SYSUTCDATETIME(),
            Stack = @stack,
            Kontext = @kontext
        WHERE Fingerprint = @fp AND Erledigt = 0
      `);
    if (upd.rowsAffected[0] > 0) return;
    await pool.request()
      .input('quelle', sql.NVarChar(20), quelle)
      .input('nachricht', sql.NVarChar(sql.MAX), msg)
      .input('stack', sql.NVarChar(sql.MAX), stack || null)
      .input('kontext', sql.NVarChar(sql.MAX), kontextStr)
      .input('benutzerOid', sql.NVarChar(36), benutzerOid || null)
      .input('benutzerName', sql.NVarChar(200), benutzerName || null)
      .input('fp', sql.NVarChar(64), fp)
      .query(`
        INSERT INTO dbo.Fehlerberichte
          (Quelle, Nachricht, Stack, Kontext, BenutzerOid, BenutzerName, Fingerprint)
        VALUES (@quelle, @nachricht, @stack, @kontext, @benutzerOid, @benutzerName, @fp)
      `);
  } catch (e) {
    console.error('[fehlerberichte] logError konnte nicht persistieren:', e.message);
  }
}

async function listErrors({ quelle, erledigt, benutzerOid, seit, limit } = {}) {
  const pool = await getPool();
  const bedingungen = [];
  const req = pool.request();
  if (quelle)      { req.input('quelle', sql.NVarChar(20), quelle); bedingungen.push('Quelle = @quelle'); }
  if (erledigt !== undefined) { req.input('erledigt', sql.Bit, erledigt ? 1 : 0); bedingungen.push('Erledigt = @erledigt'); }
  if (benutzerOid) { req.input('benutzerOid', sql.NVarChar(36), benutzerOid); bedingungen.push('BenutzerOid = @benutzerOid'); }
  if (seit)        { req.input('seit', sql.DateTime2, new Date(seit)); bedingungen.push('LetzterZeitpunkt >= @seit'); }
  const where = bedingungen.length ? `WHERE ${bedingungen.join(' AND ')}` : '';
  const top = Math.max(1, Math.min(Math.floor(Number(limit)) || 500, 2000));
  const result = await req.query(`
    SELECT TOP (${top}) *
    FROM dbo.Fehlerberichte
    ${where}
    ORDER BY LetzterZeitpunkt DESC
  `);
  return result.recordset;
}

async function markResolved(id, erledigtVon) {
  const pool = await getPool();
  await pool.request()
    .input('id', sql.Int, Number(id))
    .input('von', sql.NVarChar(200), erledigtVon || null)
    .query(`
      UPDATE dbo.Fehlerberichte
      SET Erledigt = 1, ErledigtVon = @von, ErledigtAm = SYSUTCDATETIME()
      WHERE Id = @id
    `);
}

async function cleanupAlt(tage = 90) {
  const pool = await getPool();
  const result = await pool.request()
    .input('tage', sql.Int, tage)
    .query(`
      DELETE FROM dbo.Fehlerberichte
      WHERE LetzterZeitpunkt < DATEADD(day, -@tage, SYSUTCDATETIME())
    `);
  return result.rowsAffected[0];
}

module.exports = { berechneFingerprint, logError, listErrors, markResolved, cleanupAlt };
