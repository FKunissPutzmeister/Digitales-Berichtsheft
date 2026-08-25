'use strict';
/* =====================================================================
   USER-STORE: einzige Nutzerquelle (dbo.Users).
   Dieser Abschnitt: reine Logik (Rollen-Claim-Parsing, Flag-Ableitung)
   + DB-Zugriffsfunktionen (upsert/get/list/update).
   ===================================================================== */
const { getPool, sql } = require('../db/connection');
const { backfillVerantwortlicheByEmail, normalizeEmail } = require('./abteilungen');

const ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';
const AZURE_ROLES = ['azubi', 'pruefer'];

// Nutzer, die ihre Ansicht per Session-Switch auf "developer" heben dürfen
// (Entwickler-Escape-Hatch). Bewusst als Code-Allowlist statt DB-Flag: betrifft
// nur eine Handvoll Entwickler. E-Mail-Vergleich case-insensitiv.
const DEV_VIEW_EMAILS = new Set([
  'florian.kern@putzmeister.com',
  // TEMPORÄR (Testzwecke, 2026-08-05): wieder entfernen, wenn der Test durch ist.
  'florian.kuniss@putzmeister.com',
]);

function canUseDevView(email) {
  return DEV_VIEW_EMAILS.has((email || '').trim().toLowerCase());
}

// Rollen-Claim aus der Assertion lesen (String ODER Array), auf bekannte
// Azure-Basisrollen einschränken. Unbekannt/fehlend → null.
function parseRoleClaim(profile) {
  const raw = profile && profile[ROLE_CLAIM];
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  return list.find((r) => AZURE_ROLES.includes(r)) || null;
}

// Server-seitige Landeseite je effektiver Rolle (Pendant zu landingPageFor im
// Frontend, app.js). DH-Studenten sehen ausschließlich den Abteilungsdurchlauf
// (schlanke Seite OHNE Sidebar); alle anderen das Dashboard.
// WICHTIG: Muss aus der EFFEKTIVEN Rolle (buildReqUser → istDhStudent) abgeleitet
// werden, nicht aus dem SAML-Rollen-Claim — der kennt nur azubi/pruefer, die
// dhstudent-Rolle steht in der DB. Ohne diese Weiche landet ein DH-Student nach
// SSO erst auf der Sidebar-Seite und wird von initLayout weggebounct (Flash).
function landingPathForUser(user) {
  return user && user.istDhStudent ? '/app/abteilungsdurchlauf.html' : '/app/dashboard.html';
}

// DB-Zeile → req.user-Form mit abgeleiteten Flags.
function buildReqUser(row) {
  if (!row) return null;
  const role = row.Role;
  const isDev = role === 'developer';
  const toDay = (d) => { if (!d) return null; const t = new Date(d); return isNaN(t) ? null : t.toISOString().slice(0, 10); };
  return {
    oid: row.Oid,
    name: row.Name,
    email: row.Email,
    role,
    kannPlanen:   isDev || !!row.KannPlanen,
    istAusbilder: isDev || role === 'pruefer' || !!row.IstAusbilder,
    // Ausbildungsleiter: eigenständiges Tag, KEIN Zusammenhang mit istAusbilder
    // (der dauerhafte Ausbilder ist eine andere Rolle, siehe Design-Spec
    // 2026-08-21). Genau zwei Personen im echten Betrieb, je Bereich eine.
    istAusbildungsleiter: !!row.IstAusbildungsleiter,
    ausbildungsleiterBereich: row.AusbildungsleiterBereich ?? null,
    // Azubi = Basisrolle 'azubi' ODER explizites Zusatz-Tag IstAzubi (z.B. ein
    // Developer, der zugleich ein Berichtsheft führt). Bewusst NICHT isDev —
    // sonst wäre jeder Developer automatisch Azubi.
    istAzubi:     role === 'azubi' || !!row.IstAzubi,
    istDhStudent: role === 'dhstudent', // developer NICHT (sonst Zwangs-Redirect)
    // Profilfelder (Azubi-Ansicht + Admin-UI brauchen sie):
    beruf:             row.Beruf ?? null,
    ausbildungsBeginn: toDay(row.AusbildungBeginn),
    ausbildungsEnde:   toDay(row.AusbildungEnde),
    berichtTyp:        row.BerichtTyp || 'wöchentlich',
    aktiv:             row.Aktiv !== false,
    // Zeitpunkt des allerersten Logins (nie überschrieben) — Gating fürs
    // IHK-Import-Onboarding, siehe onboarding-ihk-import.js.
    ersteAnmeldung: row.ErsteAnmeldung ? new Date(row.ErsteAnmeldung).toISOString() : null,
    // Löschkonzept (Migration 030): Stichtag der 365-Tage-Frist und eine
    // optionale Sperre. Die Nutzerverwaltung zeigt daraus das Löschdatum.
    inaktivSeit:     row.InaktivSeit ? new Date(row.InaktivSeit).toISOString() : null,
    loeschsperreBis: toDay(row.LoeschsperreBis),
    // Manuelle Deaktivierung (Migration 038): nimmt den Account vom Entra-Sync
    // aus, solange er noch Mitglied seiner Gruppe ist — sonst würde der nächste
    // Lauf Aktiv=1 sofort wieder herstellen. Siehe entraSync.filterReaktivierung.
    manuellDeaktiviert: !!row.ManuellDeaktiviert,
  };
}

const ALLOWED_ROLES = ['azubi', 'pruefer', 'admin', 'dhstudent', 'developer'];
const ALLOWED_BERICHT = ['wöchentlich', 'täglich'];

// Whitelist der admin-editierbaren Felder → DB-Spalte + mssql-Typ.
const PATCH_COLUMNS = {
  role:             { col: 'Role',             type: () => sql.NVarChar(20) },
  kannPlanen:       { col: 'KannPlanen',       type: () => sql.Bit },
  istAusbilder:     { col: 'IstAusbilder',     type: () => sql.Bit },
  istAzubi:         { col: 'IstAzubi',         type: () => sql.Bit },
  istAusbildungsleiter:     { col: 'IstAusbildungsleiter',     type: () => sql.Bit },
  ausbildungsleiterBereich: { col: 'AusbildungsleiterBereich', type: () => sql.NVarChar(20) },
  beruf:            { col: 'Beruf',            type: () => sql.NVarChar(200) },
  ausbildungBeginn: { col: 'AusbildungBeginn', type: () => sql.Date },
  ausbildungEnde:   { col: 'AusbildungEnde',   type: () => sql.Date },
  berichtTyp:       { col: 'BerichtTyp',       type: () => sql.NVarChar(20) },
  aktiv:            { col: 'Aktiv',            type: () => sql.Bit },
  // Löschsperre: hält ein Konto über die 365-Tage-Frist hinaus zurück
  // (Prüfungsanfechtung, Rechtsstreit). Siehe services/retention.js.
  loeschsperreBis:  { col: 'LoeschsperreBis',  type: () => sql.Date },
};

function validateUserPatch(fields) {
  if (Object.keys(fields).length === 0) return { ok: false, error: 'Keine Felder angegeben' };
  for (const key of Object.keys(fields)) {
    if (!(key in PATCH_COLUMNS)) return { ok: false, error: `Unbekanntes Feld: ${key}` };
  }
  if ('role' in fields && !ALLOWED_ROLES.includes(fields.role)) {
    return { ok: false, error: 'Ungültige Rolle' };
  }
  if ('berichtTyp' in fields && !ALLOWED_BERICHT.includes(fields.berichtTyp)) {
    return { ok: false, error: 'Ungültiger Berichtstyp' };
  }
  if ('ausbildungsleiterBereich' in fields && fields.ausbildungsleiterBereich != null
      && !['technisch', 'kaufmaennisch'].includes(fields.ausbildungsleiterBereich)) {
    return { ok: false, error: 'Ungültiger Ausbildungsleiter-Bereich' };
  }
  return { ok: true };
}

// EIN Schreibpfad für Identität/Rolle (Login-JIT, CSV-Import, später Graph).
// Merge-Regel: Sonderrollen (admin/dhstudent/developer) werden NIE von einer
// Azure-Basisrolle überschrieben; nur übergebene Felder werden aktualisiert.
async function upsertUser(data) {
  const pool = await getPool();

  // JIT-Reconciliation per E-Mail: Existiert die E-Mail bereits unter einer
  // ANDEREN OID (z.B. Demo-Seed mit Platzhalter-OID oder ein neu angelegtes
  // Azure-Konto), übernimmt der echte SSO-Login diese Zeile (OID = echte
  // Azure-OID), statt am Unique-Index IX_Users_Email zu scheitern. Nur wenn
  // für die echte OID noch keine Zeile existiert — sonst gäbe es ein
  // PK-Duplikat. E-Mail-Vergleich ist über die DB-Collation case-insensitiv.
  if (data.email) {
    await pool.request()
      .input('oid',   sql.NVarChar(36),  data.oid)
      .input('email', sql.NVarChar(256), data.email)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Oid = @oid)
          UPDATE dbo.Users
             SET Oid = @oid, AktualisiertAm = SYSUTCDATETIME()
           WHERE Email = @email AND Oid <> @oid;
      `);
  }

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
      -- Basisrolle nur setzen, wenn aktuelle Rolle azubi/pruefer/dhstudent/leer ist:
      Role  = CASE WHEN @role IS NULL THEN t.Role
                   WHEN t.Role IN ('azubi','pruefer','dhstudent') OR t.Role IS NULL THEN @role
                   ELSE t.Role END,
      KannPlanen   = COALESCE(@kannPlanen, t.KannPlanen),
      IstAusbilder = COALESCE(@istAusbilder, t.IstAusbilder),
      Beruf            = COALESCE(@beruf, t.Beruf),
      AusbildungBeginn = COALESCE(@beginn, t.AusbildungBeginn),
      AusbildungEnde   = COALESCE(@ende, t.AusbildungEnde),
      BerichtTyp       = COALESCE(@berichtTyp, t.BerichtTyp),
      LetzterLogin     = CASE WHEN @setLogin = 1 THEN SYSUTCDATETIME() ELSE t.LetzterLogin END,
      -- Einmaliger Zeitstempel des allerersten Logins (nie wieder überschrieben,
      -- im Unterschied zu LetzterLogin) — Grundlage für das IHK-Import-Onboarding.
      ErsteAnmeldung   = CASE WHEN t.ErsteAnmeldung IS NOT NULL THEN t.ErsteAnmeldung
                              WHEN @setLogin = 1 THEN SYSUTCDATETIME() ELSE NULL END,
      AktualisiertAm   = SYSUTCDATETIME()
    WHEN NOT MATCHED THEN INSERT
      (Oid, Name, Email, Role, KannPlanen, IstAusbilder, Beruf, AusbildungBeginn, AusbildungEnde, BerichtTyp, LetzterLogin, ErsteAnmeldung)
    VALUES
      (@oid, @name, @email, COALESCE(@role,'azubi'), COALESCE(@kannPlanen,0), COALESCE(@istAusbilder,0),
       @beruf, @beginn, @ende, COALESCE(@berichtTyp, N'wöchentlich'),
       CASE WHEN @setLogin = 1 THEN SYSUTCDATETIME() ELSE NULL END,
       CASE WHEN @setLogin = 1 THEN SYSUTCDATETIME() ELSE NULL END);
  `);
  // Katalog-Verantwortliche mit echtem Azure-Namen/OID nachziehen (per E-Mail).
  // Defensiv: fehlt der Abteilungs-Katalog (vor Migration), darf der Login nicht brechen.
  if (data.email) {
    try { await backfillVerantwortlicheByEmail(normalizeEmail(data.email), data.name ?? null, data.oid ?? null); }
    catch (e) { console.error('[users] backfill verantwortliche:', e.message); }
  }
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

async function listUsers({ role, exclRole, inclInactive } = {}) {
  const pool = await getPool();
  const r = pool.request();
  const where = [];
  if (!inclInactive) where.push('Aktiv = 1');
  // Azubi-Listen (role='azubi') schließen zusätzlich getaggte Azubis (IstAzubi=1)
  // ein — z.B. ein Developer, der zugleich ein Berichtsheft führt.
  if (role)     { r.input('role', sql.NVarChar(20), role);     where.push(role === 'azubi' ? '(Role = @role OR IstAzubi = 1)' : 'Role = @role'); }
  if (exclRole) { r.input('excl', sql.NVarChar(20), exclRole); where.push('Role <> @excl'); }
  const clause = where.length ? where.join(' AND ') : '1=1';
  const res = await r.query(`SELECT * FROM dbo.Users WHERE ${clause} ORDER BY Name`);
  return res.recordset;
}

async function updateUserProfile(oid, fields, poolOverride) {
  const check = validateUserPatch(fields);
  if (!check.ok) throw new Error(check.error);
  const pool = poolOverride || await getPool();
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
  // Manuelle Deaktivierung in der Nutzerverwaltung muss die Löschfrist genauso
  // starten wie der Entra-Sync (setUsersAktiv) — sonst bliebe InaktivSeit auf
  // NULL und das Konto würde nie fällig. Gleiche CASE/COALESCE-Semantik dort.
  if ('aktiv' in fields) {
    sets.push('InaktivSeit = CASE WHEN @aktiv = 0 THEN COALESCE(InaktivSeit, SYSUTCDATETIME()) ELSE NULL END');
    // ManuellDeaktiviert (Migration 038): markiert eine Deaktivierung als von
    // Hand gesetzt, damit der Entra-Sync sie nicht überschreibt (siehe
    // entraSync.filterReaktivierung). Reaktivieren löscht das Flag wieder.
    sets.push('ManuellDeaktiviert = CASE WHEN @aktiv = 0 THEN 1 ELSE 0 END');
  }
  sets.push('AktualisiertAm = SYSUTCDATETIME()');
  await r.query(`UPDATE dbo.Users SET ${sets.join(', ')} WHERE Oid = @oid`);
}

// Aktive Nutzer mit einer der verwalteten Rollen (für den Deaktivierungs-Abgleich).
async function listManagedUsers(roles) {
  if (!roles || !roles.length) return [];
  const pool = await getPool();
  const r = pool.request();
  r.input('demo', sql.NVarChar(20), '%.demo@%');
  const params = roles.map((role, i) => { r.input(`r${i}`, sql.NVarChar(20), role); return `@r${i}`; });
  const res = await r.query(`SELECT Oid, Role FROM dbo.Users WHERE Aktiv = 1 AND Role IN (${params.join(',')}) AND (Email IS NULL OR Email NOT LIKE @demo)`);
  return res.recordset.map((x) => ({ oid: x.Oid, role: x.Role }));
}

// Welche der übergebenen OIDs sind manuell deaktiviert (Migration 038)?
// Für den Entra-Sync: diese OIDs dürfen NICHT automatisch reaktiviert werden,
// auch wenn sie noch Mitglied ihrer Entra-Gruppe sind. No-op bei leerer Liste.
async function listManuellDeaktivierteOids(oids, poolOverride) {
  if (!oids || !oids.length) return [];
  const pool = poolOverride || await getPool();
  const r = pool.request();
  const params = oids.map((oid, i) => { r.input(`o${i}`, sql.NVarChar(36), oid); return `@o${i}`; });
  const res = await r.query(`SELECT Oid FROM dbo.Users WHERE ManuellDeaktiviert = 1 AND Oid IN (${params.join(',')})`);
  return res.recordset.map((x) => x.Oid);
}

// Aktiv-Flag für eine OID-Liste setzen (parametrisiert). No-op bei leerer Liste.
// poolOverride ist ausschließlich für Unit-Tests (Fake-Pool) gedacht.
async function setUsersAktiv(oids, aktiv, poolOverride) {
  if (!oids || !oids.length) return 0;
  const pool = poolOverride || await getPool();
  const r = pool.request();
  r.input('aktiv', sql.Bit, aktiv ? 1 : 0);
  const params = oids.map((oid, i) => { r.input(`o${i}`, sql.NVarChar(36), oid); return `@o${i}`; });
  // InaktivSeit ist der Stichtag der Löschfrist (Migration 030).
  // COALESCE ist wesentlich: entraSync ruft setUsersAktiv(stale, false) bei
  // JEDEM Lauf auf. Ein blindes SYSUTCDATETIME() würde die Frist alle 6 Stunden
  // nach hinten schieben und das Konto nie fällig werden lassen.
  const res = await r.query(`
    UPDATE dbo.Users
       SET Aktiv = @aktiv,
           InaktivSeit = CASE WHEN @aktiv = 0 THEN COALESCE(InaktivSeit, SYSUTCDATETIME()) ELSE NULL END,
           AktualisiertAm = SYSUTCDATETIME()
     WHERE Oid IN (${params.join(',')})`);
  return res.rowsAffected[0];
}

module.exports = {
  parseRoleClaim, buildReqUser, landingPathForUser, validateUserPatch, canUseDevView,
  upsertUser, getUserByOid, getUserByEmail, listUsers, updateUserProfile,
  listManagedUsers, setUsersAktiv, listManuellDeaktivierteOids,
};
