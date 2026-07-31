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

// ── Bild-Anhänge (nur manuelle Meldungen) ──────────────────────
// Limits identisch zum Client (error-reporter.js). Der kumulative
// Deckel hält die base64-Payload unter dem 10-MB-express.json-Limit.
const MAX_BILDER = 5;
const MAX_BILD_BYTES = 4 * 1024 * 1024;   // je Bild, dekodiert
const MAX_GESAMT_BYTES = 6 * 1024 * 1024; // Summe, dekodiert

// Reine Prüfung/Dekodierung eingehender { name, mimeTyp, dataUrl }-Objekte.
// Kein DB-Zugriff → testbar. Ungültige/zu große Einträge werden gezählt
// (verworfen), aber nie geworfen: die Textmeldung soll immer durchgehen.
function parseUndValidiereBilder(bilder) {
  if (!Array.isArray(bilder)) return { gueltig: [], verworfen: 0 };
  const gueltig = [];
  let verworfen = 0;
  let gesamt = 0;
  for (const b of bilder) {
    if (gueltig.length >= MAX_BILDER) { verworfen++; continue; }
    const m = b && typeof b.dataUrl === 'string'
      ? /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(b.dataUrl)
      : null;
    if (!m) { verworfen++; continue; }
    const buffer = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
    if (buffer.length === 0 || buffer.length > MAX_BILD_BYTES) { verworfen++; continue; }
    if (gesamt + buffer.length > MAX_GESAMT_BYTES) { verworfen++; continue; }
    gesamt += buffer.length;
    gueltig.push({
      name: b.name ? String(b.name).slice(0, 255) : 'bild',
      mimeTyp: m[1].toLowerCase(),
      buffer,
      groesse: buffer.length,
    });
  }
  return { gueltig, verworfen };
}

// Transiente Verbindungsfehler: der Client konnte den Server schlicht nicht
// erreichen (Server-Neustart, DB kurz weg, Netzwerk-Blip, abgebrochener Autosave
// beim Tab-Schließen). Diese haben KEINEN diagnostischen Wert und würden sonst den
// Fehler-Posteingang fluten. Der Client (error-reporter.js) filtert sie bereits,
// aber gecachte/veraltete Frontend-Versionen melden weiter – deshalb hier serverseitig
// als Defense-in-Depth dasselbe Muster ausfiltern. Muss zur Client-Regex passen.
// Echte App-Fehler (500 mit Meldung, reale 404, Validierung) treffen diese Muster NICHT.
function istTransienterVerbindungsfehler(nachricht) {
  const s = String(nachricht || '');
  return /Failed to fetch/i.test(s)
      || /Load failed/i.test(s)
      || /NetworkError|Network request failed/i.test(s)
      || /nicht rechtzeitig geantwortet/i.test(s);
}

// Benignes Browser-Rauschen (kein App-Fehlverhalten): der ResizeObserver-Hinweis
// entsteht, wenn ein Observer-Callback im selben Frame erneut Layout ändert; der
// Browser liefert im nächsten Frame nach, es geht nichts verloren. Muss zur
// Client-Regex in error-reporter.js passen (dort schon gefiltert) – hier als
// Defense-in-Depth, weil gecachte Frontend-Versionen weiter melden.
function istBenignesBrowserrauschen(nachricht) {
  return /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/i
    .test(String(nachricht || ''));
}

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
  // Transientes Verbindungs-Rauschen (z. B. „apiFetch /wochen: Failed to fetch")
  // gar nicht erst persistieren – manuelle Meldungen bleiben ausgenommen.
  if (quelle !== 'manual' && (istTransienterVerbindungsfehler(msg) || istBenignesBrowserrauschen(msg))) return;
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
        OUTPUT inserted.Id
        WHERE Fingerprint = @fp AND Erledigt = 0
      `);
    if (upd.recordset && upd.recordset.length > 0) return upd.recordset[0].Id;
    const ins = await pool.request()
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
        OUTPUT inserted.Id
        VALUES (@quelle, @nachricht, @stack, @kontext, @benutzerOid, @benutzerName, @fp, @schweregrad)
      `);
    return ins.recordset[0].Id;
  } catch (e) {
    console.error('[fehlerberichte] logError konnte nicht persistieren:', e.message);
  }
}

// Speichert validierte Bilder zu einem Fehlerbericht. Rein additiv – prüft
// per parseUndValidiereBilder erneut (Defense-in-Depth). Gibt die Anzahl
// tatsächlich gespeicherter Bilder zurück.
async function speichereFehlerAnhaenge(fehlerId, bilder) {
  const { gueltig } = parseUndValidiereBilder(bilder);
  if (!gueltig.length) return 0;
  const pool = await getPool();
  for (const bild of gueltig) {
    await pool.request()
      .input('fehlerId', sql.Int, Number(fehlerId))
      .input('dateiname', sql.NVarChar(255), bild.name)
      .input('mimeTyp', sql.NVarChar(100), bild.mimeTyp)
      .input('groesse', sql.Int, bild.groesse)
      .input('inhalt', sql.VarBinary(sql.MAX), bild.buffer)
      .query(`
        INSERT INTO dbo.FehlerAnhaenge (FehlerId, Dateiname, MimeTyp, GroesseBytes, Inhalt)
        VALUES (@fehlerId, @dateiname, @mimeTyp, @groesse, @inhalt)
      `);
  }
  return gueltig.length;
}

// Metadaten aller Anhänge eines Fehlers (ohne Binärdaten).
async function listeFehlerAnhaenge(fehlerId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('fehlerId', sql.Int, Number(fehlerId))
    .query(`
      SELECT Id, Dateiname, MimeTyp, GroesseBytes, HochgeladenAm
      FROM dbo.FehlerAnhaenge
      WHERE FehlerId = @fehlerId
      ORDER BY HochgeladenAm ASC, Id ASC
    `);
  return result.recordset;
}

// Ein einzelner Anhang inkl. Binärdaten (für den Binär-Endpunkt).
async function ladeFehlerAnhang(anhangId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, Number(anhangId))
    .query('SELECT MimeTyp, Dateiname, Inhalt FROM dbo.FehlerAnhaenge WHERE Id = @id');
  return result.recordset[0];
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
    SELECT TOP (${top}) fb.*,
      (SELECT COUNT(*) FROM dbo.FehlerAnhaenge fa WHERE fa.FehlerId = fb.Id) AS AnzahlAnhaenge
    FROM dbo.Fehlerberichte fb
    ${where}
    ORDER BY fb.LetzterZeitpunkt DESC
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

module.exports = { berechneFingerprint, logError, listErrors, markResolved, cleanupAlt, bewerteSchwere, setSchweregrad, istTransienterVerbindungsfehler, istBenignesBrowserrauschen, SCHWEREGRADE, parseUndValidiereBilder, speichereFehlerAnhaenge, listeFehlerAnhaenge, ladeFehlerAnhang };
