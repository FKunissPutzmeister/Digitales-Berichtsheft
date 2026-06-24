'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { requireAuth, DEV_USERS } = require('./auth');

function makeRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test('SAML-Session-User hat Vorrang und wird durchgereicht', () => {
  const req = { headers: {}, session: { user: { oid: 'real-guid-123', email: 'a@b.de', name: 'A B' } } };
  const res = makeRes();
  let called = false;
  requireAuth(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user.oid, 'real-guid-123');
  assert.equal(req.user.email, 'a@b.de');
  assert.equal(req.user.istAzubi, false);
  assert.equal(typeof req.user.kannPlanen, 'boolean');
  assert.equal(req.user.name, 'A B');
  assert.equal(typeof req.user.istAusbilder, 'boolean');
});

test('Ohne SAML-Session: Fallback auf DEV_USERS via X-Dev-OID', () => {
  const devOid = Object.keys(DEV_USERS)[0];
  const req = { headers: { 'x-dev-oid': devOid }, session: {} };
  const res = makeRes();
  let called = false;
  requireAuth(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user.oid, devOid);
  assert.equal(req.user.name, DEV_USERS[devOid].name);
});

test('Ohne SAML-Session: Fallback auf DEV_USERS via session.userOid', () => {
  const devOid = Object.keys(DEV_USERS)[0];
  const req = { headers: {}, session: { userOid: devOid } };
  const res = makeRes();
  let called = false;
  requireAuth(req, res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.user.oid, devOid);
  assert.equal(req.user.name, DEV_USERS[devOid].name);
});

test('Weder SAML noch Dev-User: 401', () => {
  const req = { headers: {}, session: {} };
  const res = makeRes();
  let called = false;
  requireAuth(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
});
