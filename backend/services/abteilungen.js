'use strict';
/* =====================================================================
   ABTEILUNGS-KATALOG-SERVICE.
   Dieser Abschnitt: reine Logik (Namensableitung, E-Mail-Normalisierung,
   Validierung). DB-Zugriffsfunktionen folgen weiter unten (Task 3).
   ===================================================================== */
const { getPool, sql } = require('../db/connection');

// E-Mail (UPN) -> Anzeigename-Fallback bis Azure den echten Namen liefert.
// "ruediger.breuning@x" -> "Ruediger Breuning"; Bindestriche bleiben.
function deriveName(email) {
  if (!email) return '';
  const local = String(email).split('@')[0];
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  return local
    .split('.')
    .map((word) => word.split('-').map(cap).join('-'))
    .filter(Boolean)
    .join(' ')
    .trim();
}

// UPN einheitlich klein + getrimmt speichern/vergleichen.
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const NAME_MAX = 120;

// Validierung fürs Anlegen (name Pflicht) bzw. Patch (partial: name optional,
// aber mind. ein bekanntes Feld). Unbekannte Felder -> invalid.
function validateAbteilung(fields, { partial = false } = {}) {
  const known = ['name', 'istPmm', 'aktiv'];
  const keys = Object.keys(fields || {});
  if (keys.length === 0) return { ok: false, error: 'Keine Felder angegeben' };
  for (const k of keys) if (!known.includes(k)) return { ok: false, error: `Unbekanntes Feld: ${k}` };
  if (!partial || 'name' in fields) {
    if (typeof fields.name !== 'string' || !fields.name.trim()) return { ok: false, error: 'Name ist Pflicht' };
    if (fields.name.length > NAME_MAX) return { ok: false, error: `Name max. ${NAME_MAX} Zeichen` };
  }
  if ('istPmm' in fields && typeof fields.istPmm !== 'boolean') return { ok: false, error: 'istPmm muss boolean sein' };
  if ('aktiv' in fields && typeof fields.aktiv !== 'boolean') return { ok: false, error: 'aktiv muss boolean sein' };
  return { ok: true };
}

function validateVerantwEmail(email) {
  const e = normalizeEmail(email);
  if (!e || !e.includes('@')) return { ok: false, error: 'Gültige E-Mail erforderlich' };
  return { ok: true };
}

// Katalog inkl. Verantwortliche. inclInactive=false blendet Aktiv=0 aus
// (Planer-Dropdown); true zeigt alle (Pflege-UI).
async function listAbteilungen({ inclInactive = true } = {}) {
  const pool = await getPool();
  const res = await pool.request().query(`
    SELECT Id, Name, IstPmm, Aktiv FROM dbo.Abteilungen ORDER BY Name;
    SELECT Id, AbteilungId, Email, Anzeigename, Oid FROM dbo.AbteilungVerantwortliche;
  `);
  const [abt, verantw] = res.recordsets;
  const byAbt = {};
  for (const v of verantw) (byAbt[v.AbteilungId] = byAbt[v.AbteilungId] || []).push(v);
  return abt
    .filter((a) => inclInactive || a.Aktiv)
    .map((a) => ({
      id: a.Id,
      name: a.Name,
      istPmm: !!a.IstPmm,
      aktiv: a.Aktiv !== false,
      verantwortliche: (byAbt[a.Id] || [])
        .map((v) => ({ id: v.Id, email: v.Email, name: v.Anzeigename || deriveName(v.Email), oid: v.Oid || null }))
        .sort((x, y) => x.name.localeCompare(y.name)),
    }));
}

async function createAbteilung({ name, istPmm = false, aktiv = true }) {
  const pool = await getPool();
  const res = await pool.request()
    .input('name', sql.NVarChar(120), name.trim())
    .input('istPmm', sql.Bit, istPmm ? 1 : 0)
    .input('aktiv', sql.Bit, aktiv ? 1 : 0)
    .query(`INSERT INTO dbo.Abteilungen (Name, IstPmm, Aktiv)
            OUTPUT inserted.Id VALUES (@name, @istPmm, @aktiv)`);
  return { id: res.recordset[0].Id, name: name.trim(), istPmm: !!istPmm, aktiv: !!aktiv, verantwortliche: [] };
}

// Dynamisches UPDATE nur der übergebenen Felder. Gibt die frische Abteilung
// (inkl. Verantwortliche) zurück, oder null bei unbekannter Id.
async function updateAbteilung(id, fields) {
  const map = { name: { col: 'Name', type: () => sql.NVarChar(120), val: (v) => v.trim() },
                istPmm: { col: 'IstPmm', type: () => sql.Bit, val: (v) => (v ? 1 : 0) },
                aktiv: { col: 'Aktiv', type: () => sql.Bit, val: (v) => (v ? 1 : 0) } };
  const pool = await getPool();
  const r = pool.request().input('id', sql.Int, id);
  const sets = [];
  for (const [k, def] of Object.entries(map)) {
    if (k in fields) { r.input(k, def.type(), def.val(fields[k])); sets.push(`${def.col} = @${k}`); }
  }
  if (sets.length === 0) return await getAbteilungById(id);
  await r.query(`UPDATE dbo.Abteilungen SET ${sets.join(', ')} WHERE Id = @id`);
  return await getAbteilungById(id);
}

async function getAbteilungById(id) {
  const all = await listAbteilungen({ inclInactive: true });
  return all.find((a) => a.id === id) || null;
}

async function deleteAbteilung(id) {
  const pool = await getPool();
  await pool.request().input('id', sql.Int, id)
    .query('DELETE FROM dbo.Abteilungen WHERE Id = @id'); // Verantwortliche via ON DELETE CASCADE
}

// Fügt eine/n Verantwortliche/n hinzu. Kollision (bereits vorhanden) -> Error mit code 'DUP'.
async function addVerantwortliche(abteilungId, email) {
  const e = normalizeEmail(email);
  const pool = await getPool();
  const dup = await pool.request()
    .input('aid', sql.Int, abteilungId).input('email', sql.NVarChar(255), e)
    .query('SELECT TOP 1 Id FROM dbo.AbteilungVerantwortliche WHERE AbteilungId=@aid AND Email=@email');
  if (dup.recordset.length) { const err = new Error('Verantwortliche/r bereits zugeordnet'); err.code = 'DUP'; throw err; }
  const res = await pool.request()
    .input('aid', sql.Int, abteilungId).input('email', sql.NVarChar(255), e)
    .query(`INSERT INTO dbo.AbteilungVerantwortliche (AbteilungId, Email)
            OUTPUT inserted.Id, inserted.Email, inserted.Anzeigename, inserted.Oid
            VALUES (@aid, @email)`);
  const row = res.recordset[0];
  return { id: row.Id, email: row.Email, name: row.Anzeigename || deriveName(row.Email), oid: row.Oid || null };
}

async function removeVerantwortliche(verantwId) {
  const pool = await getPool();
  await pool.request().input('id', sql.Int, verantwId)
    .query('DELETE FROM dbo.AbteilungVerantwortliche WHERE Id = @id');
}

// Beim SSO-Login: echten Azure-Namen + OID im Katalog nachziehen (per E-Mail).
async function backfillVerantwortlicheByEmail(email, name, oid) {
  const e = normalizeEmail(email);
  if (!e) return;
  const pool = await getPool();
  await pool.request()
    .input('email', sql.NVarChar(255), e)
    .input('name', sql.NVarChar(200), name ?? null)
    .input('oid', sql.NVarChar(36), oid ?? null)
    .query(`UPDATE dbo.AbteilungVerantwortliche
               SET Anzeigename = COALESCE(@name, Anzeigename),
                   Oid         = COALESCE(@oid, Oid)
             WHERE Email = @email`);
}

module.exports = {
  deriveName, normalizeEmail, validateAbteilung, validateVerantwEmail,
  listAbteilungen, createAbteilung, updateAbteilung, getAbteilungById,
  deleteAbteilung, addVerantwortliche, removeVerantwortliche,
  backfillVerantwortlicheByEmail,
};
