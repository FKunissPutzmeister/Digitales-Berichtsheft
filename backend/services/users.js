'use strict';
/* =====================================================================
   USER-STORE: einzige Nutzerquelle (dbo.Users).
   Dieser Abschnitt: reine Logik (Rollen-Claim-Parsing, Flag-Ableitung).
   ===================================================================== */
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

module.exports = { parseRoleClaim, buildReqUser };
