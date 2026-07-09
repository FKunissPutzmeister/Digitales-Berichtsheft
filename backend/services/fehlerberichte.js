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

const SCHWEREGRADE = ['hoch', 'mittel', 'gering'];

// Serverseitige Schwere-Einstufung (Client-Angaben wären fälschbar).
// Reihenfolge: erste zutreffende Regel gewinnt. Siehe Spec-Tabelle.
function bewerteSchwere({ quelle, nachricht, kontext }) {
  if (quelle === 'manual') return 'mittel';
  const msg = String(nachricht || '');
  if (/^\[(uncaughtException|unhandledRejection|unhandled|auth)\]/.test(msg)) return 'hoch';
  const methode = String((kontext && typeof kontext === 'object' && kontext.methode) || '').toUpperCase();
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(methode)) return 'hoch';
  if (methode === 'GET') return 'mittel';
  return quelle === 'backend' ? 'mittel' : 'gering';
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
    const schwere = bewerteSchwere({ quelle, nachricht: msg, kontext });
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
      .input('schweregrad', sql.NVarChar(10), schwere)
      .query(`
        INSERT INTO dbo.Fehlerberichte
          (Quelle, Nachricht, Stack, Kontext, BenutzerOid, BenutzerName, Fingerprint, Schweregrad)
        VALUES (@quelle, @nachricht, @stack, @kontext, @benutzerOid, @benutzerName, @fp, @schweregrad)
      `);
  } catch (e) {
    console.error('[fehlerberichte] logError konnte nicht persistieren:', e.message);
  }
}

async function listErrors({ quelle, erledigt, benutzerOid, seit, limit, schweregrad } = {}) {
  const pool = await getPool();
  const bedingungen = [];
  const req = pool.request();
  if (quelle)      { req.input('quelle', sql.NVarChar(20), quelle); bedingungen.push('Quelle = @quelle'); }
  if (erledigt !== undefined) { req.input('erledigt', sql.Bit, erledigt ? 1 : 0); bedingungen.push('Erledigt = @erledigt'); }
  if (benutzerOid) { req.input('benutzerOid', sql.NVarChar(36), benutzerOid); bedingungen.push('BenutzerOid = @benutzerOid'); }
  if (seit)        { req.input('seit', sql.DateTime2, new Date(seit)); bedingungen.push('LetzterZeitpunkt >= @seit'); }
  if (schweregrad && SCHWEREGRADE.includes(schweregrad)) { req.input('schweregrad', sql.NVarChar(10), schweregrad); bedingungen.push('Schweregrad = @schweregrad'); }
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

async function setSchweregrad(id, schweregrad) {
  if (!SCHWEREGRADE.includes(schweregrad)) throw new Error('Ungültiger Schweregrad');
  const pool = await getPool();
  await pool.request()
    .input('id', sql.Int, Number(id))
    .input('schweregrad', sql.NVarChar(10), schweregrad)
    .query('UPDATE dbo.Fehlerberichte SET Schweregrad = @schweregrad WHERE Id = @id');
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

module.exports = { berechneFingerprint, logError, listErrors, markResolved, cleanupAlt, bewerteSchwere, setSchweregrad, SCHWEREGRADE };
