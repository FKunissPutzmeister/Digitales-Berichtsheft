'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRoleClaim, buildReqUser } = require('./users');

const ROLE_URI = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

test('parseRoleClaim liest String-Claim', () => {
  assert.equal(parseRoleClaim({ [ROLE_URI]: 'azubi' }), 'azubi');
  assert.equal(parseRoleClaim({ [ROLE_URI]: 'pruefer' }), 'pruefer');
});

test('parseRoleClaim nimmt bei Array die erste bekannte Rolle', () => {
  assert.equal(parseRoleClaim({ [ROLE_URI]: ['pruefer', 'irgendwas'] }), 'pruefer');
});

test('parseRoleClaim gibt null ohne/bei unbekanntem Claim', () => {
  assert.equal(parseRoleClaim({}), null);
  assert.equal(parseRoleClaim({ [ROLE_URI]: 'fremd' }), null);
  assert.equal(parseRoleClaim(null), null);
});

test('buildReqUser leitet Azubi-Flags + Profilfelder ab', () => {
  const u = buildReqUser({ Oid: 'g1', Name: 'A', Email: 'a@b.de', Role: 'azubi', KannPlanen: false, IstAusbilder: false, Beruf: 'Mechatroniker' });
  assert.equal(u.istAzubi, true);
  assert.equal(u.istAusbilder, false);
  assert.equal(u.kannPlanen, false);
  assert.equal(u.istDhStudent, false);
  assert.equal(u.beruf, 'Mechatroniker');
  assert.equal(u.berichtTyp, 'wöchentlich'); // Default ohne BerichtTyp-Spalte
});

test('buildReqUser: pruefer bekommt Korrektur-Zugang automatisch', () => {
  const u = buildReqUser({ Oid: 'g2', Role: 'pruefer', KannPlanen: false, IstAusbilder: false });
  assert.equal(u.istAusbilder, true);
  assert.equal(u.istAzubi, false);
});

test('buildReqUser: IstAusbilder-Spalte ist additiver Grant', () => {
  const u = buildReqUser({ Oid: 'g3', Role: 'admin', KannPlanen: true, IstAusbilder: true });
  assert.equal(u.istAusbilder, true);
  assert.equal(u.kannPlanen, true);
});

test('buildReqUser: developer bekommt alle Flags, aber NICHT istDhStudent', () => {
  const u = buildReqUser({ Oid: 'g4', Role: 'developer', KannPlanen: false, IstAusbilder: false });
  assert.equal(u.kannPlanen, true);
  assert.equal(u.istAusbilder, true);
  assert.equal(u.istAzubi, true);
  assert.equal(u.istDhStudent, false);
});

test('buildReqUser(null) gibt null', () => {
  assert.equal(buildReqUser(null), null);
});
