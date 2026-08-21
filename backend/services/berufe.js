'use strict';
/* Berufe->Bereich-Katalog (dbo.Berufe) — ordnet Berufsbezeichnungen einem
   Bereich (technisch/kaufmaennisch) zu, damit der zuständige Ausbildungs-
   leiter im Beurteilungsbogen automatisch ermittelt werden kann, ohne
   Berufsbezeichnungen im Code zu verankern. Pflege in der Nutzerverwaltung. */
const { getPool, sql } = require('../db/connection');

const BEREICHE = ['technisch', 'kaufmaennisch'];
const BERUF_MAX = 200;

function validateBeruf(fields, { partial = false } = {}) {
  const known = ['beruf', 'bereich'];
  const keys = Object.keys(fields || {});
  if (keys.length === 0) return { ok: false, error: 'Keine Felder angegeben' };
  for (const k of keys) if (!known.includes(k)) return { ok: false, error: `Unbekanntes Feld: ${k}` };
  if (!partial || 'beruf' in fields) {
    if (typeof fields.beruf !== 'string' || !fields.beruf.trim()) return { ok: false, error: 'Beruf ist Pflicht' };
    if (fields.beruf.length > BERUF_MAX) return { ok: false, error: `Beruf max. ${BERUF_MAX} Zeichen` };
  }
  if (!partial || 'bereich' in fields) {
    if (!BEREICHE.includes(fields.bereich)) return { ok: false, error: 'Bereich muss technisch oder kaufmaennisch sein' };
  }
  return { ok: true };
}

// Reine Logik: Bereich für einen Beruf-Freitext aus dem Katalog ermitteln.
// Case-insensitiv, getrimmt — Beruf kommt konsistent aus Azure AD (jobTitle).
// null, wenn kein Katalog-Eintrag existiert.
function bereichFuerBeruf(beruf, katalog) {
  if (!beruf) return null;
  const gesucht = String(beruf).trim().toLowerCase();
  const treffer = (katalog || []).find(k => String(k.beruf).trim().toLowerCase() === gesucht);
  return treffer ? treffer.bereich : null;
}

async function listBerufe() {
  const pool = await getPool();
  const r = await pool.request().query('SELECT Id, Beruf, Bereich FROM dbo.Berufe ORDER BY Beruf');
  return r.recordset.map(x => ({ id: x.Id, beruf: x.Beruf, bereich: x.Bereich }));
}

async function createBeruf({ beruf, bereich }) {
  const pool = await getPool();
  const r = await pool.request()
    .input('beruf', sql.NVarChar(BERUF_MAX), beruf.trim())
    .input('bereich', sql.NVarChar(20), bereich)
    .query('INSERT INTO dbo.Berufe (Beruf, Bereich) OUTPUT inserted.Id VALUES (@beruf, @bereich)');
  return { id: r.recordset[0].Id, beruf: beruf.trim(), bereich };
}

async function updateBeruf(id, fields) {
  const map = {
    beruf:   { col: 'Beruf',   type: () => sql.NVarChar(BERUF_MAX), val: v => v.trim() },
    bereich: { col: 'Bereich', type: () => sql.NVarChar(20),        val: v => v },
  };
  const pool = await getPool();
  const r = pool.request().input('id', sql.Int, id);
  const sets = [];
  for (const [k, def] of Object.entries(map)) {
    if (k in fields) { r.input(k, def.type(), def.val(fields[k])); sets.push(`${def.col} = @${k}`); }
  }
  if (sets.length === 0) return await getBerufById(id);
  await r.query(`UPDATE dbo.Berufe SET ${sets.join(', ')} WHERE Id = @id`);
  return await getBerufById(id);
}

async function getBerufById(id) {
  const all = await listBerufe();
  return all.find(b => b.id === id) || null;
}

async function deleteBeruf(id) {
  const pool = await getPool();
  await pool.request().input('id', sql.Int, id).query('DELETE FROM dbo.Berufe WHERE Id = @id');
}

module.exports = {
  BEREICHE, validateBeruf, bereichFuerBeruf,
  listBerufe, createBeruf, updateBeruf, getBerufById, deleteBeruf,
};
