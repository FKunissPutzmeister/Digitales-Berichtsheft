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
      out.set(oid, { oid, name: m.name ?? null, email: m.email ?? null, role });
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

module.exports = { buildGroupRoleMap, resolveMembers, computeDeactivations, syncConfigured };
