'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./entraSync.js');

const ENV = {
  GRAPH_TENANT_ID: 't', GRAPH_CLIENT_ID: 'c', GRAPH_CLIENT_SECRET: 's',
  SYNC_GROUP_PRUEFER: 'gp', SYNC_GROUP_AZUBI: 'ga', SYNC_GROUP_DHSTUDENT: 'gd',
};

// Regressionsschutz gegen die eigentliche Fehlerquelle: Sync und SAML-Login
// leiteten aus derselben Mehrfach-Mitgliedschaft verschiedene Rollen ab, weil
// jeder Pfad seine eigene (bzw. keine) Vorrangregel hatte. Beide teilen jetzt
// ROLE_PRECEDENCE aus services/users.js — dieser Test schlägt an, sobald
// irgendwo wieder eine eigene Kopie/Reihenfolge entsteht.
test('Login und Entra-Sync leiten für Mehrfach-Gruppenmitglieder dieselbe Rolle ab', () => {
  const ROLE_URI = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';
  const { parseRoleClaim } = require('./users');

  // Eine Person in Prüfer- UND Azubi-Gruppe (z.B. Ausbilder, den sein
  // Department zusätzlich in "Alle Azubis" zieht).
  const { groupRoleMap } = S.buildGroupRoleMap(ENV);
  const syncRolle = S.resolveMembers(
    groupRoleMap
      .filter(({ role }) => role === 'pruefer' || role === 'azubi')
      .map(({ role }) => ({ role, members: [{ oid: 'oid-1' }] }))
  ).get('oid-1').role;

  assert.equal(syncRolle, 'pruefer');
  // Azure bestimmt die Reihenfolge der Rollen in der Assertion — keine davon
  // darf ein anderes Ergebnis liefern als der Sync.
  for (const claim of [['azubi', 'pruefer'], ['pruefer', 'azubi']]) {
    assert.equal(parseRoleClaim({ [ROLE_URI]: claim }), syncRolle);
  }
});

test('buildGroupRoleMap: nur gesetzte Gruppen, Vorrang pruefer>azubi>dhstudent', () => {
  const { groupRoleMap, managedRoles } = S.buildGroupRoleMap(ENV);
  assert.deepEqual(groupRoleMap, [
    { role: 'pruefer', groupId: 'gp' },
    { role: 'azubi', groupId: 'ga' },
    { role: 'dhstudent', groupId: 'gd' },
  ]);
  assert.deepEqual(managedRoles, ['pruefer', 'azubi', 'dhstudent']);
});

test('buildGroupRoleMap: fehlende Gruppen werden ausgelassen', () => {
  const { groupRoleMap, managedRoles } = S.buildGroupRoleMap({ SYNC_GROUP_AZUBI: 'ga' });
  assert.deepEqual(groupRoleMap, [{ role: 'azubi', groupId: 'ga' }]);
  assert.deepEqual(managedRoles, ['azubi']);
});

test('resolveMembers: pruefer gewinnt bei Doppelmitgliedschaft', () => {
  const m = S.resolveMembers([
    { role: 'pruefer', members: [{ oid: 'A', name: 'Ann', email: 'a@x' }] },
    { role: 'azubi',   members: [{ oid: 'A', name: 'Ann', email: 'a@x' }, { oid: 'B', name: 'Bo', email: 'b@x' }] },
  ]);
  assert.equal(m.get('A').role, 'pruefer');
  assert.equal(m.get('B').role, 'azubi');
  assert.equal(m.size, 2);
});

test('resolveMembers: leere/fehlende OID wird verworfen', () => {
  const m = S.resolveMembers([{ role: 'azubi', members: [{ oid: '', name: 'X' }, { oid: '  ', name: 'Y' }, { oid: 'C' }] }]);
  assert.deepEqual([...m.keys()], ['C']);
});

test('resolveMembers: fehlender Name fällt auf E-Mail bzw. OID zurück (Name ist NOT NULL)', () => {
  const m = S.resolveMembers([{ role: 'azubi', members: [
    { oid: 'A', email: 'a@x' }, // kein Name → E-Mail
    { oid: 'B' },               // kein Name, keine E-Mail → OID
  ] }]);
  assert.equal(m.get('A').name, 'a@x');
  assert.equal(m.get('B').name, 'B');
});

test('computeDeactivations: managed-Nutzer nicht in aktivOids → deaktivieren', () => {
  const db = [{ oid: 'A', role: 'azubi' }, { oid: 'B', role: 'pruefer' }, { oid: 'C', role: 'dhstudent' }];
  assert.deepEqual(S.computeDeactivations(db, ['A', 'C']).sort(), ['B']);
});

test('computeDeactivations: leere Eingaben → leer', () => {
  assert.deepEqual(S.computeDeactivations([], ['A']), []);
  assert.deepEqual(S.computeDeactivations([{ oid: 'A', role: 'azubi' }], []), ['A']);
});

// Migration 038: manuell deaktivierte Konten dürfen der Sync NICHT über
// setUsersAktiv(..., true) zurücksetzen, auch wenn sie noch Gruppenmitglied sind.
test('filterReaktivierung: nimmt manuell deaktivierte OIDs aus der Reaktivierung aus', () => {
  assert.deepEqual(S.filterReaktivierung(['A', 'B', 'C'], ['B']), ['A', 'C']);
});

test('filterReaktivierung: leere Eingaben → unverändert bzw. leer', () => {
  assert.deepEqual(S.filterReaktivierung(['A', 'B'], []), ['A', 'B']);
  assert.deepEqual(S.filterReaktivierung([], ['A']), []);
});

test('syncConfigured: vollständig → configured true, Default-Intervall 6', () => {
  const c = S.syncConfigured(ENV);
  assert.equal(c.configured, true);
  assert.equal(c.intervalHours, 6);
});

test('syncConfigured: fehlendes Secret → configured false', () => {
  const c = S.syncConfigured({ ...ENV, GRAPH_CLIENT_SECRET: '' });
  assert.equal(c.configured, false);
});

test('syncConfigured: keine Gruppe gesetzt → configured false', () => {
  const c = S.syncConfigured({ GRAPH_TENANT_ID: 't', GRAPH_CLIENT_ID: 'c', GRAPH_CLIENT_SECRET: 's' });
  assert.equal(c.configured, false);
});

test('berufAusJobtitle: entfernt Auszubildende(r)-Präfix, sonst unverändert; leer → null', () => {
  assert.equal(S.berufAusJobtitle('Auszubildender Mechatroniker'), 'Mechatroniker');
  assert.equal(S.berufAusJobtitle('Auszubildende Industriekauffrau'), 'Industriekauffrau');
  assert.equal(S.berufAusJobtitle('Fachinformatiker für Systemintegration'), 'Fachinformatiker für Systemintegration');
  assert.equal(S.berufAusJobtitle(''), null);
  assert.equal(S.berufAusJobtitle(null), null);
});

test('berichtTypAusDepartment: gewerblich→täglich, kaufmännisch→wöchentlich, sonst null', () => {
  assert.equal(S.berichtTypAusDepartment('Gewerbliche Auszubildende'), 'täglich');
  assert.equal(S.berichtTypAusDepartment('Kaufmännische Auszubildende'), 'wöchentlich');
  assert.equal(S.berichtTypAusDepartment('Sonstiges'), null);
  assert.equal(S.berichtTypAusDepartment(''), null);
  assert.equal(S.berichtTypAusDepartment(null), null);
});

test('resolveMembers: reicht jobTitle und department durch', () => {
  const m = S.resolveMembers([{ role: 'azubi', members: [
    { oid: 'A', name: 'Ann', email: 'a@x', jobTitle: 'Auszubildender Mechatroniker', department: 'Gewerbliche Auszubildende' },
  ] }]);
  assert.equal(m.get('A').jobTitle, 'Auszubildender Mechatroniker');
  assert.equal(m.get('A').department, 'Gewerbliche Auszubildende');
});
