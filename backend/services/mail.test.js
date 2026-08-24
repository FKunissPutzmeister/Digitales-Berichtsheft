'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeHeader, buildMime, sendeMail, appUrl } = require('./mail');

test('Betreff mit Umlaut wird RFC-2047-kodiert, ASCII bleibt unangetastet', () => {
  assert.equal(encodeHeader('Beurteilung faellig'), 'Beurteilung faellig');
  assert.match(encodeHeader('Beurteilung fällig'), /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
});

test('Mit Termin: multipart/alternative mit text/calendar-Teil', () => {
  const mime = buildMime({
    from: 'berichtsheft@putzmeister.com', fromName: 'Digitales Berichtsheft',
    to: ['a@putzmeister.com'], subject: 'Azubi Einsatz', html: '<p>hi</p>',
    ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', icsMethod: 'CANCEL',
  });
  assert.match(mime, /Content-Type: multipart\/alternative; boundary="bhs-/);
  assert.match(mime, /Content-Type: text\/calendar; charset=UTF-8; method=CANCEL/);
  assert.match(mime, /Content-Type: text\/html; charset=UTF-8/);
});

test('Ohne Termin: einteilige HTML-Mail', () => {
  const mime = buildMime({
    from: 'berichtsheft@putzmeister.com', fromName: 'Digitales Berichtsheft',
    to: ['a@putzmeister.com'], subject: 'Test', html: '<p>hi</p>',
  });
  assert.doesNotMatch(mime, /multipart/);
  assert.match(mime, /^Content-Type: text\/html; charset=UTF-8$/m);
});

test('Ohne MAIL_FROM wird nichts gesendet (kein Netzzugriff)', async () => {
  const vorher = process.env.MAIL_FROM;
  delete process.env.MAIL_FROM;
  assert.equal(await sendeMail({ to: ['a@putzmeister.com'], subject: 'x', html: 'y' }), false);
  if (vorher !== undefined) process.env.MAIL_FROM = vorher;
});

test('appUrl leitet die Basis notfalls aus der SAML-Callback-URL ab', () => {
  assert.equal(appUrl({ APP_BASE_URL: 'https://berichtsheft.pm.de/' }), 'https://berichtsheft.pm.de');
  assert.equal(appUrl({ SAML_CALLBACK_URL: 'http://localhost:3000/api/auth/saml/acs' }), 'http://localhost:3000');
  assert.equal(appUrl({}), 'http://localhost:3000');
});
