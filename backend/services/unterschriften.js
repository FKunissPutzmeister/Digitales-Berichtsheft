'use strict';
/* Persönliche Unterschrift je Nutzer (dbo.Unterschriften) — hinterlegtes
   Standard-Bild, das beim Signieren vorgeschlagen und bei jeder neuen
   Signatur automatisch aktualisiert wird. Geteilte Basis für Beurteilung
   und (später) Fahrtgeld. */
const { getPool, sql } = require('../db/connection');

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB, wie im Client-Dialog (signatur-dialog.js)

function dataUrlToBuffer(dataUrl) {
  const match = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return Buffer.from(match[2], 'base64');
}

function bufferToDataUrl(buffer, extension) {
  if (!buffer) return null;
  const mime = (extension === 'jpeg' || extension === 'jpg') ? 'jpeg' : 'png';
  return `data:image/${mime};base64,${buffer.toString('base64')}`;
}

function normExt(extension) {
  return extension === 'jpeg' || extension === 'jpg' ? 'jpeg' : 'png';
}

// Wirft bei Überschreitung — von JEDER Stelle zu rufen, die Signatur-Bytes
// persistiert (Beurteilungen-Spalten UND das persönliche Profil), sonst
// greift die 2-MB-Grenze nur beim Profil-Upsert, nicht beim eigentlichen
// Dokument.
function pruefeGroesse(bytes) {
  if (bytes && bytes.length > MAX_BYTES) throw new Error('Unterschrift zu groß (max. 2 MB).');
}

async function holeMeine(pool, oid) {
  const r = await pool.request()
    .input('oid', sql.NVarChar(36), oid)
    .query('SELECT Bild, Extension FROM dbo.Unterschriften WHERE Oid = @oid');
  const row = r.recordset[0];
  if (!row) return null;
  return { dataUrl: bufferToDataUrl(row.Bild, row.Extension), extension: row.Extension };
}

async function speichereMeine(pool, oid, { dataUrl, extension } = {}) {
  const bytes = dataUrlToBuffer(dataUrl);
  if (!bytes) throw new Error('Ungültige Unterschrift.');
  pruefeGroesse(bytes);
  await pool.request()
    .input('oid', sql.NVarChar(36), oid)
    .input('bild', sql.VarBinary(sql.MAX), bytes)
    .input('ext', sql.NVarChar(10), normExt(extension))
    .query(`
      MERGE dbo.Unterschriften AS t
      USING (SELECT @oid AS Oid) AS s ON t.Oid = s.Oid
      WHEN MATCHED THEN UPDATE SET Bild=@bild, Extension=@ext, AktualisiertAm=SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (Oid, Bild, Extension) VALUES (@oid, @bild, @ext);
    `);
  return bytes;
}

module.exports = { dataUrlToBuffer, bufferToDataUrl, normExt, pruefeGroesse, holeMeine, speichereMeine, MAX_BYTES };
