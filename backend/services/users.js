'use strict';
/* =====================================================================
   USER-STORE: einzige Nutzerquelle (dbo.Users).
   Dieser Abschnitt: reine Logik (Rollen-Claim-Parsing, Flag-Ableitung)
   + DB-Zugriffsfunktionen (upsert/get/list/update).
   ===================================================================== */
const { getPool, sql } = require('../db/connection');

const ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';
const AZURE_ROLES = ['azubi', 'pruefer'];

// Rollen-Claim aus der Assertion lesen (String ODER Array), auf bekannte
// Azure-Basisrollen einschränken. Unbekannt/fehlend → null.
function parseRoleClaim(profile) {
  const raw = profile && profile[ROLE_CLAIM];
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  return list.find((r) => AZURE_ROLES.includes(r)) || null;
}

// DB-Zeile → req.user-Form mit abgeleiteten Flags.
function buildReqUser(row) {
  if (!row) return null;
  const role = row.Role;
  const isDev = role === 'developer';
  return {
    oid: row.Oid,
    name: row.Name,
    email: row.Email,
    role,
    kannPlanen:   isDev || !!row.KannPlanen,
    istAusbilder: isDev || role === 'pruefer' || !!row.IstAusbilder,
    istAzubi:     isDev || role === 'azubi',
    istDhStudent: role === 'dhstudent', // developer NICHT (sonst Zwangs-Redirect)
    // Profilfelder (Azubi-Ansicht + Admin-UI brauchen sie):
    beruf:            row.Beruf ?? null,
    ausbildungBeginn: row.AusbildungBeginn ?? null,
    ausbildungEnde:   row.AusbildungEnde ?? null,
    berichtTyp:       row.BerichtTyp || 'wöchentlich',
    aktiv:            row.Aktiv !== false,
  };
}

const ALLOWED_ROLES = ['azubi', 'pruefer', 'admin', 'dhstudent', 'developer'];
const ALLOWED_BERICHT = ['wöchentlich', 'täglich'];

// Whitelist der admin-editierbaren Felder → DB-Spalte + mssql-Typ.
const PATCH_COLUMNS = {
  role:             { col: 'Role',             type: () => sql.NVarChar(20) },
  kannPlanen:       { col: 'KannPlanen',       type: () => sql.Bit },
  istAusbilder:     { col: 'IstAusbilder',     type: () => sql.Bit },
  beruf:            { col: 'Beruf',            type: () => sql.NVarChar(200) },
  ausbildungBeginn: { col: 'AusbildungBeginn', type: () => sql.Date },
  ausbildungEnde:   { col: 'AusbildungEnde',   type: () => sql.Date },
  berichtTyp:       { col: 'BerichtTyp',       type: () => sql.NVarChar(20) },
  aktiv:            { col: 'Aktiv',            type: () => sql.Bit },
};

function validateUserPatch(fields) {
  for (const key of Object.keys(fields)) {
    if (!(key in PATCH_COLUMNS)) return { ok: false, error: `Unbekanntes Feld: ${key}` };
  }
  if ('role' in fields && !ALLOWED_ROLES.includes(fields.role)) {
    return { ok: false, error: 'Ungültige Rolle' };
  }
  if ('berichtTyp' in fields && !ALLOWED_BERICHT.includes(fields.berichtTyp)) {
    return { ok: false, error: 'Ungültiger Berichtstyp' };
  }
  return { ok: true };
}

// EIN Schreibpfad für Identität/Rolle (Login-JIT, CSV-Import, später Graph).
// Merge-Regel: Sonderrollen (admin/dhstudent/developer) werden NIE von einer
// Azure-Basisrolle überschrieben; nur übergebene Felder werden aktualisiert.
async function upsertUser(data) {
  const pool = await getPool();
  const r = pool.request();
  r.input('oid',   sql.NVarChar(36),  data.oid);
  r.input('name',  sql.NVarChar(200), data.name ?? null);
  r.input('email', sql.NVarChar(256), data.email ?? null);
  r.input('role',  sql.NVarChar(20),  data.role ?? null);
  r.input('kannPlanen',   sql.Bit,          data.kannPlanen ?? null);
  r.input('istAusbilder', sql.Bit,          data.istAusbilder ?? null);
  r.input('beruf',        sql.NVarChar(200),data.beruf ?? null);
  r.input('beginn',       sql.Date,         data.ausbildungBeginn ?? null);
  r.input('ende',         sql.Date,         data.ausbildungEnde ?? null);
  r.input('berichtTyp',   sql.NVarChar(20), data.berichtTyp ?? null);
  r.input('setLogin',     sql.Bit,          data.letzterLogin ? 1 : 0);
  await r.query(`
    MERGE dbo.Users AS t
    USING (SELECT @oid AS Oid) AS s ON t.Oid = s.Oid
    WHEN MATCHED THEN UPDATE SET
      Name  = COALESCE(@name, t.Name),
      Email = COALESCE(@email, t.Email),
      -- Basisrolle nur setzen, wenn aktuelle Rolle azubi/pruefer/leer ist:
      Role  = CASE WHEN @role IS NULL THEN t.Role
                   WHEN t.Role IN ('azubi','pruefer') OR t.Role IS NULL THEN @role
                   ELSE t.Role END,
      KannPlanen   = COALESCE(@kannPlanen, t.KannPlanen),
      IstAusbilder = COALESCE(@istAusbilder, t.IstAusbilder),
      Beruf            = COALESCE(@beruf, t.Beruf),
      AusbildungBeginn = COALESCE(@beginn, t.AusbildungBeginn),
      AusbildungEnde   = COALESCE(@ende, t.AusbildungEnde),
      BerichtTyp       = COALESCE(@berichtTyp, t.BerichtTyp),
      LetzterLogin     = CASE WHEN @setLogin = 1 THEN SYSUTCDATETIME() ELSE t.LetzterLogin END,
      AktualisiertAm   = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN INSERT
      (Oid, Name, Email, Role, KannPlanen, IstAusbilder, Beruf, AusbildungBeginn, AusbildungEnde, BerichtTyp, LetzterLogin)
    VALUES
      (@oid, @name, @email, COALESCE(@role,'azubi'), COALESCE(@kannPlanen,0), COALESCE(@istAusbilder,0),
       @beruf, @beginn, @ende, COALESCE(@berichtTyp, N'wöchentlich'),
       CASE WHEN @setLogin = 1 THEN SYSUTCDATETIME() ELSE NULL END);
  `);
}

async function getUserByOid(oid) {
  const pool = await getPool();
  const res = await pool.request().input('oid', sql.NVarChar(36), oid)
    .query('SELECT * FROM dbo.Users WHERE Oid = @oid');
  return res.recordset[0] || null;
}

async function getUserByEmail(email) {
  const pool = await getPool();
  const res = await pool.request().input('email', sql.NVarChar(256), email)
    .query('SELECT * FROM dbo.Users WHERE Email = @email');
  return res.recordset[0] || null;
}

async function listUsers({ role, exclRole } = {}) {
  const pool = await getPool();
  const r = pool.request();
  const where = ['Aktiv = 1'];
  if (role)     { r.input('role', sql.NVarChar(20), role);     where.push('Role = @role'); }
  if (exclRole) { r.input('excl', sql.NVarChar(20), exclRole); where.push('Role <> @excl'); }
  const res = await r.query(`SELECT * FROM dbo.Users WHERE ${where.join(' AND ')} ORDER BY Name`);
  return res.recordset;
}

async function updateUserProfile(oid, fields) {
  const pool = await getPool();
  const r = pool.request();
  r.input('oid', sql.NVarChar(36), oid);
  const sets = [];
  for (const [key, val] of Object.entries(fields)) {
    const c = PATCH_COLUMNS[key];
    if (!c) continue;
    r.input(key, c.type(), val);
    sets.push(`${c.col} = @${key}`);
  }
  if (sets.length === 0) return;
  sets.push('AktualisiertAm = SYSUTCDATETIME()');
  await r.query(`UPDATE dbo.Users SET ${sets.join(', ')} WHERE Oid = @oid`);
}

module.exports = {
  parseRoleClaim, buildReqUser, validateUserPatch,
  upsertUser, getUserByOid, getUserByEmail, listUsers, updateUserProfile,
};
