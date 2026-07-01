'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const usersMod = require('../services/users');

// getUserByOid stubben (kein echter DB-Zugriff im Unit-Test).
let STUB = null;
usersMod.getUserByOid = async (oid) => (STUB && STUB.Oid === oid ? STUB : null);

const { requireAuth } = require('./auth');

function makeRes() {
  return { statusCode: 200, body: null,
    status(c){ this.statusCode=c; return this; }, json(b){ this.body=b; return this; } };
}

test('SAML-Session-oid → Nutzer aus DB, Flags abgeleitet', async () => {
  STUB = { Oid: 'real-1', Name: 'A', Email: 'a@b.de', Role: 'azubi', KannPlanen: false, IstAusbilder: false, Aktiv: true };
  const req = { headers: {}, session: { user: { oid: 'real-1' } } };
  const res = makeRes(); let called = false;
  await requireAuth(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user.role, 'azubi');
  assert.equal(req.user.istAzubi, true);
});

test('Dev X-Dev-OID → gleicher DB-Pfad', async () => {
  STUB = { Oid: 'dev-1', Name: 'D', Email: 'd@b.de', Role: 'pruefer', KannPlanen: true, IstAusbilder: false, Aktiv: true };
  const req = { headers: { 'x-dev-oid': 'dev-1' }, session: {} };
  const res = makeRes(); let called = false;
  await requireAuth(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user.istAusbilder, true); // pruefer → Korrektur
});

test('unbekannte oid → 401', async () => {
  STUB = null;
  const req = { headers: { 'x-dev-oid': 'ghost' }, session: {} };
  const res = makeRes(); let called = false;
  await requireAuth(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
});

test('inaktiver Nutzer → 401', async () => {
  STUB = { Oid: 'x', Role: 'azubi', Aktiv: false };
  const req = { headers: { 'x-dev-oid': 'x' }, session: {} };
  const res = makeRes(); let called = false;
  await requireAuth(req, res, () => { called = true; });
  assert.equal(res.statusCode, 401);
});
