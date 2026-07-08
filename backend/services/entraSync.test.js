'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./entraSync.js');

const ENV = {
  GRAPH_TENANT_ID: 't', GRAPH_CLIENT_ID: 'c', GRAPH_CLIENT_SECRET: 's',
  SYNC_GROUP_PRUEFER: 'gp', SYNC_GROUP_AZUBI: 'ga', SYNC_GROUP_DHSTUDENT: 'gd',
};

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
