'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { profileToUser } = require('./saml');

test('profileToUser liest oid aus dem objectid-Claim', () => {
  const u = profileToUser({ objectid: 'guid-xyz', email: 'max@pm.com', displayname: 'Max M' });
  assert.equal(u.oid, 'guid-xyz');
  assert.equal(u.email, 'max@pm.com');
  assert.equal(u.name, 'Max M');
});

test('profileToUser fällt für E-Mail auf NameID und Claim-URI zurück', () => {
  const u = profileToUser({
    objectid: 'g1',
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': 'uri@pm.com',
    nameID: 'nameid@pm.com',
  });
  assert.equal(u.email, 'uri@pm.com');
});

test('profileToUser nutzt E-Mail als Name-Fallback', () => {
  const u = profileToUser({ objectid: 'g2', email: 'only@pm.com' });
  assert.equal(u.name, 'only@pm.com');
});
