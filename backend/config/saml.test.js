'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extractIdpCerts } = require('./saml');

const META = fs.readFileSync(
  path.join(__dirname, 'saml', 'azure-idp-metadata.xml'), 'utf8'
);

test('extractIdpCerts liefert mindestens ein Base64-Zertifikat', () => {
  const certs = extractIdpCerts(META);
  assert.ok(Array.isArray(certs));
  assert.ok(certs.length >= 1);
});

test('extractIdpCerts liefert sauberes Base64 ohne Whitespace/Tags', () => {
  const certs = extractIdpCerts(META);
  for (const c of certs) {
    assert.doesNotMatch(c, /\s/);                 // kein Whitespace
    assert.doesNotMatch(c, /</);                  // keine XML-Tags
    assert.match(c, /^[A-Za-z0-9+/=]+$/);         // reines Base64
    assert.ok(c.length > 100);                    // plausibel lang
  }
});

test('extractIdpCerts dedupliziert identische Zertifikate', () => {
  const certs = extractIdpCerts(META);
  assert.equal(certs.length, new Set(certs).size);
});
