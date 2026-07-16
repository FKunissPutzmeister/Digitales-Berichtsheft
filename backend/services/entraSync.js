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
      out.set(oid, { oid, name: m.name || m.email || oid, email: m.email ?? null, role, jobTitle: m.jobTitle ?? null, department: m.department ?? null });
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

const { upsertUser, listUsers, listManagedUsers, setUsersAktiv } = require('./users');
const { upsertPhoto, deletePhoto } = require('./userPhotos');

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
  let url = `https://graph.microsoft.com/v1.0/groups/${groupId}/members?$select=id,displayName,mail,userPrincipalName,jobTitle,department&$top=999`;
  const out = [];
  while (url) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Gruppe ${groupId}: HTTP ${r.status}`);
    const j = await r.json();
    for (const m of (j.value || [])) {
      const isUser = String(m['@odata.type'] || '').toLowerCase().endsWith('.user') || !!m.userPrincipalName;
      if (!isUser) continue;
      const email = String(m.mail || m.userPrincipalName || '').trim().toLowerCase();
      out.push({ oid: m.id, name: m.displayName ?? null, email: email || null, jobTitle: m.jobTitle ?? null, department: m.department ?? null });
    }
    url = j['@odata.nextLink'] || null;
  }
  return out;
}

// Ein Profilfoto abrufen (96x96, reicht für die kleinen Avatare im UI).
// 404 = kein Foto hinterlegt (Normalfall, kein Fehler) → null. Andere
// HTTP-Fehler (z.B. 403 ohne User.Read.All) wirft die Funktion.
async function fetchUserPhoto(token, oid) {
  const r = await fetch(`https://graph.microsoft.com/v1.0/users/${oid}/photos/96x96/$value`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Foto ${oid}: HTTP ${r.status}`);
  const contentType = r.headers.get('content-type') || 'image/jpeg';
  const content = Buffer.from(await r.arrayBuffer());
  return { content, contentType };
}

// Fotos für alle übergebenen OIDs abgleichen. Anders als der Gruppen-Sync
// bricht ein einzelner Fehler (z.B. fehlende Photo-Permission, ein User ohne
// Mailbox) NICHT den gesamten Lauf ab — ein fehlendes Foto ist unkritisch,
// im Gegensatz zu einer falschen Rollen-Zuordnung. Kleine Batches statt
// alles parallel, um Graph nicht zu throtteln.
async function syncUserPhotos(token, oids) {
  const BATCH = 5;
  let updated = 0, removed = 0, errors = 0;
  for (let i = 0; i < oids.length; i += BATCH) {
    const batch = oids.slice(i, i + BATCH);
    await Promise.all(batch.map(async (oid) => {
      try {
        const photo = await fetchUserPhoto(token, oid);
        if (photo) { await upsertPhoto(oid, photo.content, photo.contentType); updated++; }
        else { await deletePhoto(oid); removed++; }
      } catch (e) {
        errors++;
        console.error(`[entra-sync] Foto ${oid}:`, e.message);
      }
    }));
  }
  return { updated, removed, errors };
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
      await upsertUser({ oid: u.oid, name: u.name, email: u.email, role: u.role, beruf: berufAusJobtitle(u.jobTitle), berichtTyp: berichtTypAusDepartment(u.department), letzterLogin: false });
    }
    const aktivOids = members.map((u) => u.oid);
    await setUsersAktiv(aktivOids, true);
    const dbManaged = await listManagedUsers(cfg.managedRoles);
    const stale = computeDeactivations(dbManaged, aktivOids);
    await setUsersAktiv(stale, false);
    const proGruppe = Object.fromEntries(groupResults.map((g) => [g.role, g.members.length]));

    // Fotos für ALLE aktiven User (nicht nur die gerade gruppen-synchronisierten
    // Rollen) — auch manuell gepflegte admin/developer/dhstudent-Konten bekommen
    // so ein Echtfoto, sofern in Entra vorhanden.
    const alleAktiven = await listUsers({ inclInactive: false });
    const photos = await syncUserPhotos(token, alleAktiven.map((u) => u.Oid));

    console.log('[entra-sync] Lauf ok:', JSON.stringify(proGruppe), `upserted=${members.length} deactivated=${stale.length}`, `fotos=${JSON.stringify(photos)}`);
    return { ok: true, proGruppe, upserted: members.length, reactivated: aktivOids.length, deactivated: stale.length, photos, errors: [] };
  } catch (e) {
    console.error('[entra-sync] Lauf fehlgeschlagen:', e.message);
    return { ok: false, proGruppe: {}, upserted: 0, reactivated: 0, deactivated: 0, errors: [e.message] };
  }
}

// "Auszubildender Mechatroniker" → "Mechatroniker"; leer → null (Präfix wie SAML-Beruf).
function berufAusJobtitle(jobTitle) {
  const s = String(jobTitle || '').replace(/^auszubildende[r]?\s+/i, '').trim();
  return s || null;
}

// Department → Berichtstyp: "gewerblich…" → täglich, "kaufmänn…" → wöchentlich,
// sonst null (Berichtstyp unverändert lassen).
function berichtTypAusDepartment(department) {
  const d = String(department || '').toLowerCase();
  if (d.includes('gewerblich')) return 'täglich';
  if (d.includes('kaufm')) return 'wöchentlich';
  return null;
}

module.exports = {
  buildGroupRoleMap, resolveMembers, computeDeactivations, syncConfigured, getGraphToken, fetchGroupMembers,
  fetchUserPhoto, syncUserPhotos, runSync, berufAusJobtitle, berichtTypAusDepartment,
};
