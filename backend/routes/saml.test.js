'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { profileToUser, assertionToUserData } = require('./saml');

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

test('profileToUser wirft nicht bei null/undefined und liefert oid===undefined', () => {
  const uNull = profileToUser(null);
  const uUndef = profileToUser(undefined);
  assert.equal(uNull.oid, undefined);
  assert.equal(uUndef.oid, undefined);
});

const RURI = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

test('assertionToUserData bündelt Identität + Rolle', () => {
  const d = assertionToUserData({ objectid: 'g9', email: 'x@pm.com', displayname: 'X Y', [RURI]: 'azubi' });
  assert.equal(d.oid, 'g9');
  assert.equal(d.email, 'x@pm.com');
  assert.equal(d.name, 'X Y');
  assert.equal(d.role, 'azubi');
});

test('assertionToUserData: role null ohne Claim', () => {
  const d = assertionToUserData({ objectid: 'g9', email: 'x@pm.com' });
  assert.equal(d.role, null);
});

test('assertionToUserData: beruf aus Claim, Auszubildende(r)-Präfix entfernt', () => {
  assert.equal(assertionToUserData({ objectid: 'g', beruf: 'Auszubildender Mechatroniker' }).beruf, 'Mechatroniker');
  assert.equal(assertionToUserData({ objectid: 'g', beruf: 'Mechatroniker' }).beruf, 'Mechatroniker');
  assert.equal(assertionToUserData({ objectid: 'g', jobTitle: 'Auszubildende Industriekauffrau' }).beruf, 'Industriekauffrau');
});

test('assertionToUserData: beruf null ohne Claim', () => {
  assert.equal(assertionToUserData({ objectid: 'g9', email: 'x@pm.com' }).beruf, null);
});
