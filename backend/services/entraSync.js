'use strict';
/* Automatischer Entra-Gruppen-Sync (Client-Credentials/App-only).
   Reine Logik (testbar) getrennt von Graph-/DB-I/O. I/O-Teil folgt in Task 3. */

// Vorrang: höchster zuerst. Gruppen-OIDs kommen aus diesen .env-Variablen.
const ROLE_PRECEDENCE = ['pruefer', 'azubi', 'dhstudent'];
const GROUP_ENV = {
  pruefer:   'SYNC_GROUP_PRUEFER',
  azubi:     'SYNC_GROUP_AZUBI',
  dhstudent: 'SYNC_GROUP_DHSTUDENT',
};

// env → Gruppen→Rollen in Vorrang-Reihenfolge (nur gesetzte) + Liste der verwalteten Rollen.
function buildGroupRoleMap(env) {
  const groupRoleMap = [];
  for (const role of ROLE_PRECEDENCE) {
    const groupId = String(env[GROUP_ENV[role]] || '').trim();
    if (groupId) groupRoleMap.push({ role, groupId });
  }
  return { groupRoleMap, managedRoles: groupRoleMap.map((g) => g.role) };
}

// groupResults: [{role, members:[{oid,name,email}]}] in Vorrang-Reihenfolge.
// → Map<oid,{oid,name,email,role}>; erster Treffer gewinnt (= höchster Vorrang).
function resolveMembers(groupResults) {
  const out = new Map();
  for (const { role, members } of (groupResults || [])) {
    for (const m of (members || [])) {
      const oid = String(m.oid || '').trim();
      if (!oid || out.has(oid)) continue;
      // Name ist in dbo.Users NOT NULL. Fehlt der Azure-displayName, auf E-Mail
      // und zuletzt die OID zurückfallen, statt den ganzen Lauf am INSERT zu brechen.
      out.set(oid, { oid, name: m.name || m.email || oid, email: m.email ?? null, role });
    }
  }
  return out;
}

// dbManagedUsers: [{oid, role}] (bereits gefiltert: aktiv + Rolle verwaltet).
// aktivOids: aktuelle Mitglieder. → OIDs, die deaktiviert werden.
function computeDeactivations(dbManagedUsers, aktivOids) {
  const active = new Set(aktivOids || []);
  return (dbManagedUsers || []).filter((u) => !active.has(u.oid)).map((u) => u.oid);
}

function syncConfigured(env = process.env) {
  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = env;
  const { groupRoleMap, managedRoles } = buildGroupRoleMap(env);
  const n = Number(env.SYNC_INTERVAL_HOURS);
  const intervalHours = n > 0 ? n : 6;
  const configured = !!(GRAPH_TENANT_ID && GRAPH_CLIENT_ID && GRAPH_CLIENT_SECRET && groupRoleMap.length);
  return {
    configured,
    tenantId: GRAPH_TENANT_ID, clientId: GRAPH_CLIENT_ID, clientSecret: GRAPH_CLIENT_SECRET,
    groupRoleMap, managedRoles, intervalHours,
  };
}

const { upsertUser, listManagedUsers, setUsersAktiv } = require('./users');

// App-only-Token per Client-Credentials.
async function getGraphToken({ tenantId, clientId, clientSecret }) {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  });
  const r = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) throw new Error(`Token-Abruf fehlgeschlagen: HTTP ${r.status}`);
  const j = await r.json();
  if (!j.access_token) throw new Error('Token-Antwort ohne access_token');
  return j.access_token;
}

// Gruppen-Mitglieder (nur User) inkl. Paging. Wirft bei HTTP-Fehler.
async function fetchGroupMembers(token, groupId) {
  let url = `https://graph.microsoft.com/v1.0/groups/${groupId}/members?$select=id,displayName,mail,userPrincipalName&$top=999`;
  const out = [];
  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Gruppe ${groupId}: HTTP ${r.status}`);
    const j = await r.json();
    for (const m of (j.value || [])) {
      const isUser = String(m['@odata.type'] || '').toLowerCase().endsWith('.user') || !!m.userPrincipalName;
      if (!isUser) continue;
      const email = String(m.mail || m.userPrincipalName || '').trim().toLowerCase();
      out.push({ oid: m.id, name: m.displayName ?? null, email: email || null });
    }
    url = j['@odata.nextLink'] || null;
  }
  return out;
}

// Ein vollständiger Sync-Lauf. Bricht bei Token-/Gruppenfehler komplett ab
// (kein Teil-Abgleich → keine fälschlichen Deaktivierungen).
async function runSync(env = process.env) {
  const cfg = syncConfigured(env);
  if (!cfg.configured) return { ok: false, proGruppe: {}, upserted: 0, reactivated: 0, deactivated: 0, errors: ['Entra-Sync nicht konfiguriert'] };
  try {
    const token = await getGraphToken(cfg);
    const groupResults = [];
    for (const { role, groupId } of cfg.groupRoleMap) {
      groupResults.push({ role, members: await fetchGroupMembers(token, groupId) });
    }
    const resolved = resolveMembers(groupResults);
    const members = [...resolved.values()];
    for (const u of members) {
      await upsertUser({ oid: u.oid, name: u.name, email: u.email, role: u.role, letzterLogin: false });
    }
    const aktivOids = members.map((u) => u.oid);
    await setUsersAktiv(aktivOids, true);
    const dbManaged = await listManagedUsers(cfg.managedRoles);
    const stale = computeDeactivations(dbManaged, aktivOids);
    await setUsersAktiv(stale, false);
    const proGruppe = Object.fromEntries(groupResults.map((g) => [g.role, g.members.length]));
    console.log('[entra-sync] Lauf ok:', JSON.stringify(proGruppe), `upserted=${members.length} deactivated=${stale.length}`);
    return { ok: true, proGruppe, upserted: members.length, reactivated: aktivOids.length, deactivated: stale.length, errors: [] };
  } catch (e) {
    console.error('[entra-sync] Lauf fehlgeschlagen:', e.message);
    return { ok: false, proGruppe: {}, upserted: 0, reactivated: 0, deactivated: 0, errors: [e.message] };
  }
}

module.exports = { buildGroupRoleMap, resolveMembers, computeDeactivations, syncConfigured, getGraphToken, fetchGroupMembers, runSync };
