'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { icsEscape, fold, anzeigeName, sequenceNow, einsatzUid, buildEinsatzIcs } = require('./ics');

const ORG = { name: 'Digitales Berichtsheft', email: 'berichtsheft@putzmeister.com' };

function bauen(over = {}) {
  return buildEinsatzIcs({
    uid: einsatzUid(42), sequence: 0, summary: 'Azubi Einsatz | Florian Kern | IT',
    von: '2026-09-01', bis: '2026-09-14', organizer: ORG,
    attendees: ['a@putzmeister.com', 'b@putzmeister.com'], now: new Date('2026-08-24T10:15:00Z'),
    ...over,
  });
}

test('DTEND ist der Tag NACH bis (Ganztagstermin über zwei Wochen)', () => {
  const ics = bauen();
  assert.match(ics, /DTSTART;VALUE=DATE:20260901/);
  assert.match(ics, /DTEND;VALUE=DATE:20260915/);
  assert.match(ics, /X-MICROSOFT-CDO-ALLDAYEVENT:TRUE/);
});

test('Komma im Namen wird escaped (dbo.Users.Name ist "Nachname, Vorname")', () => {
  assert.equal(icsEscape('Kern, Florian'), 'Kern\\, Florian');
  const ics = bauen({ summary: 'Azubi Einsatz | Kern, Florian | IT' });
  assert.match(ics, /SUMMARY:Azubi Einsatz \| Kern\\, Florian \| IT/);
});

test('CANCEL sagt denselben Termin ab (gleiche UID, STATUS)', () => {
  const ics = bauen({ method: 'CANCEL', sequence: 7 });
  assert.match(ics, /METHOD:CANCEL/);
  assert.match(ics, /STATUS:CANCELLED/);
  assert.match(ics, /UID:zuweisung-42@berichtsheft\.putzmeister\.com/);
  assert.match(ics, /SEQUENCE:7/);
});

test('fold hält 75 Oktette ein und zerschneidet keinen Umlaut', () => {
  const lang = 'SUMMARY:' + 'Ü'.repeat(90);
  const gefaltet = fold(lang);
  for (const z of gefaltet.split('\r\n')) {
    assert.ok(Buffer.from(z, 'utf8').length <= 75, `Zeile zu lang: ${z.length}`);
  }
  // Unfolding (CRLF + ein Leerzeichen entfernen) ergibt wieder das Original.
  assert.equal(gefaltet.replace(/\r\n /g, ''), lang);
});

test('anzeigeName dreht "Nachname, Vorname" und lässt einfache Namen in Ruhe', () => {
  assert.equal(anzeigeName('Kern, Florian'), 'Florian Kern');
  assert.equal(anzeigeName('Florian Kern'), 'Florian Kern');
  assert.equal(anzeigeName(null), '');
});

test('sequenceNow steigt monoton', () => {
  const a = sequenceNow(new Date('2026-08-24T10:00:00Z'));
  const b = sequenceNow(new Date('2026-08-24T10:01:00Z'));
  assert.ok(b > a);
  assert.ok(a > 0);
});
