'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hatInhalt, isoWoche, pruefWochen } = require('./mailErinnerungen');

const utc = (s) => new Date(`${s}T00:00:00Z`);
const geruest = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']
  .map((Datum) => ({ Datum, Anwesenheit: 'anwesend', Tagdauer: 'ganztag' }));

test('ISO-KW auch über den Jahreswechsel', () => {
  assert.deepEqual(isoWoche(utc('2026-09-25')), { kw: 39, jahr: 2026 });
  assert.deepEqual(isoWoche(utc('2024-12-30')), { kw: 1, jahr: 2025 });
  assert.deepEqual(isoWoche(utc('2027-01-01')), { kw: 53, jahr: 2026 });
});

test('Prüffenster: laufende KW + 3 abgeschlossene, neueste zuerst', () => {
  assert.deepEqual(pruefWochen(utc('2026-09-25')).map((w) => w.kw), [39, 38, 37, 36]);
});

test('Das automatische Mo–Fr-Gerüst ist kein Inhalt', () => {
  assert.equal(hatInhalt({ Status: 'offen', tage: geruest }, 'täglich'), false);
  assert.equal(hatInhalt({ Status: 'offen', tage: geruest }, 'wöchentlich'), false);
  assert.equal(hatInhalt(undefined, 'täglich'), false);
});

test('Inhalt: Abweichung, Halbtag, Wochenendtag, Text — und jede nicht offene Woche', () => {
  const mit = (t) => ({ Status: 'offen', tage: [...geruest.slice(1), t] });
  assert.equal(hatInhalt(mit({ Datum: '2026-09-21', Anwesenheit: 'Urlaub' }), 'täglich'), true);
  assert.equal(hatInhalt(mit({ Datum: '2026-09-21', Anwesenheit: 'anwesend', Tagdauer: 'halbtag' }), 'täglich'), true);
  assert.equal(hatInhalt(mit({ Datum: '2026-09-27', Anwesenheit: 'anwesend' }), 'täglich'), true);
  assert.equal(hatInhalt(mit({ Datum: '2026-09-27', Anwesenheit: 'Wochenende' }), 'täglich'), false);
  assert.equal(hatInhalt({ Status: 'freigegeben', tage: [] }, 'täglich'), true);
});

test('Texte zählen nur im eigenen Format; leeres HTML ist leer', () => {
  const tagMitText = { Status: 'offen', tage: [{ Datum: '2026-09-21', Anwesenheit: 'anwesend', Eintrag: '<p>Server</p>' }] };
  assert.equal(hatInhalt(tagMitText, 'täglich'), true);
  assert.equal(hatInhalt(tagMitText, 'wöchentlich'), false);
  assert.equal(hatInhalt({ Status: 'offen', BetriebEintrag: '<p>Woche</p>', tage: [] }, 'wöchentlich'), true);
  assert.equal(hatInhalt({ Status: 'offen', BetriebEintrag: '<p>&nbsp;</p>', tage: [] }, 'wöchentlich'), false);
});