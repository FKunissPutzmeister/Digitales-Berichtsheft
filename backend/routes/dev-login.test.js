'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const usersMod = require('../services/users');

// User-Service stubben (kein echter DB-Zugriff im Unit-Test).
let USERS = [];
usersMod.getUserByOid = async (oid) => USERS.find(u => u.Oid === oid) || null;
usersMod.getUserByEmail = async (email) => USERS.find(u => u.Email === email) || null;

const { isDemoEmail, loginByOid, loginByEmail } = require('./dev-login');

function makeRes() {
  return { statusCode: 200, body: null,
    status(c){ this.statusCode=c; return this; }, json(b){ this.body=b; return this; } };
}

const DEMO_ROW = { Oid: 'demo-1', Name: 'Florian Kern', Email: 'florian.kern.demo@putzmeister.com',
  Role: 'azubi', KannPlanen: false, IstAusbilder: false, Aktiv: true };
const REAL_ROW = { Oid: 'real-1', Name: 'Echter Ausbilder', Email: 'echter.ausbilder@putzmeister.com',
  Role: 'pruefer', KannPlanen: true, IstAusbilder: true, Aktiv: true };

test('isDemoEmail: nur .demo@putzmeister.com-Adressen gelten als Demo', () => {
  assert.equal(isDemoEmail('florian.kern.demo@putzmeister.com'), true);
  assert.equal(isDemoEmail('ADMIN.DEMO@PUTZMEISTER.COM'), true);
  assert.equal(isDemoEmail('echter.ausbilder@putzmeister.com'), false);
  assert.equal(isDemoEmail('boese.demo@evil.com'), false);
  assert.equal(isDemoEmail(''), false);
  assert.equal(isDemoEmail(null), false);
});

test('loginByEmail: Demo-Adresse → Session gesetzt, User zurück', async () => {
  USERS = [DEMO_ROW];
  const req = { body: { email: 'florian.kern.demo@putzmeister.com' }, session: {} };
  const res = makeRes();
  await loginByEmail(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(req.session.userOid, 'demo-1');
  assert.equal(res.body.user.oid, 'demo-1');
});

test('loginByEmail: echte Mitarbeiter-Adresse → 403, keine Session', async () => {
  USERS = [REAL_ROW];
  const req = { body: { email: 'echter.ausbilder@putzmeister.com' }, session: {} };
  const res = makeRes();
  await loginByEmail(req, res);
  assert.equal(res.statusCode, 403);
  assert.equal(req.session.userOid, undefined);
});

test('loginByEmail: unbekannte Adresse → 401', async () => {
  USERS = [];
  const req = { body: { email: 'ghost.demo@putzmeister.com' } , session: {} };
  const res = makeRes();
  await loginByEmail(req, res);
  assert.equal(res.statusCode, 401);
});

test('loginByOid: Demo-User → Session gesetzt', async () => {
  USERS = [DEMO_ROW];
  const req = { body: { oid: 'demo-1' }, session: {} };
  const res = makeRes();
  await loginByOid(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(req.session.userOid, 'demo-1');
});

test('loginByOid: Nicht-Demo-User → 403, keine Session', async () => {
  USERS = [REAL_ROW];
  const req = { body: { oid: 'real-1' }, session: {} };
  const res = makeRes();
  await loginByOid(req, res);
  assert.equal(res.statusCode, 403);
  assert.equal(req.session.userOid, undefined);
});

test('loginByOid: inaktiver Demo-User → 400', async () => {
  USERS = [{ ...DEMO_ROW, Aktiv: false }];
  const req = { body: { oid: 'demo-1' }, session: {} };
  const res = makeRes();
  await loginByOid(req, res);
  assert.equal(res.statusCode, 400);
});
