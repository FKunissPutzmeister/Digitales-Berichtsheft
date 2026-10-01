'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeHeader, buildMime, sendeMail, appUrl, mailConfig, zustellung } = require('./mail');

const CREDS = { MAIL_FROM: 'berichtsheft@putzmeister.com', MAIL_TENANT_ID: 't', MAIL_CLIENT_ID: 'c', MAIL_CLIENT_SECRET: 's' };
const BILD = [{ cid: 'pm-logo', datei: 'pm-logo.png', inhalt: Buffer.from('png') }];

test('MAIL_MODUS fehlt oder unbekannt → aus, auch mit vollständigen Zugangsdaten', () => {
  assert.equal(mailConfig({ ...CREDS }).configured, false);
  assert.equal(mailConfig({ ...CREDS, MAIL_MODUS: 'quatsch' }).modus, 'aus');
  assert.equal(mailConfig({ ...CREDS, MAIL_MODUS: 'live' }).configured, true);
  // Testmodus ohne Testadresse wäre ein Versand ins Leere → aus.
  assert.equal(mailConfig({ ...CREDS, MAIL_MODUS: 'test' }).configured, false);
});

test('Testmodus: alles geht nur an MAIL_TEST_AN, echte Empfänger im Betreff, Teilnehmer ersetzt', () => {
  const cfg = mailConfig({ ...CREDS, MAIL_MODUS: 'test', MAIL_TEST_AN: 'florian.kern@putzmeister.com' });
  const z = zustellung(cfg, ['Azubi@Putzmeister.com', 'azubi@putzmeister.com', 'chef@putzmeister.com']);
  assert.deepEqual(z.an, ['florian.kern@putzmeister.com']);
  assert.equal(z.betreffPraefix, '[TEST → azubi@putzmeister.com, chef@putzmeister.com] ');
  assert.deepEqual(z.teilnehmerErsatz, ['florian.kern@putzmeister.com']);
  assert.match(z.hinweis, /eigentlich an: azubi@putzmeister\.com/);
});

test('Pilot: nur freigegebene Adressen, Rest verworfen; keiner freigegeben → nichts', () => {
  const cfg = mailConfig({ ...CREDS, MAIL_MODUS: 'pilot', MAIL_NUR_AN: 'a@putzmeister.com; B@putzmeister.com' });
  assert.deepEqual(zustellung(cfg, ['a@putzmeister.com', 'x@putzmeister.com']).an, ['a@putzmeister.com']);
  assert.deepEqual(zustellung(cfg, ['b@putzmeister.com']).an, ['b@putzmeister.com']);
  assert.equal(zustellung(cfg, ['x@putzmeister.com']), null);
});

test('Live: echte Empfänger, kein Präfix; aus → null', () => {
  const z = zustellung(mailConfig({ ...CREDS, MAIL_MODUS: 'live' }), ['a@putzmeister.com']);
  assert.deepEqual(z.an, ['a@putzmeister.com']);
  assert.equal(z.betreffPraefix, '');
  assert.equal(zustellung(mailConfig({ ...CREDS }), ['a@putzmeister.com']), null);
});

test('Mit Bildern: multipart/related mit Content-ID, ohne Termin', () => {
  const mime = buildMime({ from: 'b@p.com', fromName: 'BH', to: ['a@p.com'], subject: 'x', html: '<img src="cid:pm-logo">', bilder: BILD });
  assert.match(mime, /^Content-Type: multipart\/related; type="text\/html"; boundary="bhs-/m);
  assert.match(mime, /^Content-ID: <pm-logo>$/m);
  assert.match(mime, /^Content-Disposition: inline; filename="pm-logo.png"$/m);
  assert.doesNotMatch(mime, /multipart\/alternative/);
});

test('Mit Termin und Bildern: alternative[ related[html, bild], calendar ]', () => {
  const mime = buildMime({
    from: 'b@p.com', fromName: 'BH', to: ['a@p.com'], subject: 'x', html: '<p>hi</p>', bilder: BILD,
    ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', icsMethod: 'REQUEST',
  });
  const iAlt = mime.indexOf('multipart/alternative');
  const iRel = mime.indexOf('multipart/related');
  const iCal = mime.indexOf('text/calendar; charset=UTF-8; method=REQUEST');
  assert.ok(iAlt > 0 && iAlt < iRel && iRel < iCal, 'Verschachtelung falsch');
});

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
  assert.equal(await sendeMail({ to: ['a@putzmeister.com'], empf: {}, text: { subject: 'x', titel: 't', satz: 's' } }), false);
  if (vorher !== undefined) process.env.MAIL_FROM = vorher;
});

test('appUrl leitet die Basis notfalls aus der SAML-Callback-URL ab, abgeleitet nie localhost', () => {
  assert.equal(appUrl({ APP_BASE_URL: 'https://berichtsheft.pm.de/' }), 'https://berichtsheft.pm.de');
  assert.equal(appUrl({ SAML_CALLBACK_URL: 'https://berichtsheft.jumbo.net/api/auth/saml/acs' }), 'https://berichtsheft.jumbo.net');
  // aus der lokalen SAML-URL abgeleitetes localhost ist in einer Mail wertlos → echte Anwendung
  assert.equal(appUrl({ SAML_CALLBACK_URL: 'http://localhost:3000/api/auth/saml/acs' }), 'https://berichtsheft.jumbo.net');
  assert.equal(appUrl({ APP_BASE_URL: '', SAML_CALLBACK_URL: 'http://127.0.0.1:3000/api/auth/saml/acs' }), 'https://berichtsheft.jumbo.net');
  assert.equal(appUrl({}), 'https://berichtsheft.jumbo.net');
  // ausdrücklich gesetzt (lokaler Linktest) gilt
  assert.equal(appUrl({ APP_BASE_URL: 'http://localhost:3000' }), 'http://localhost:3000');
});
