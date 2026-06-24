'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('./activity-suggestions.js');

test('htmlToLines: splittet Absätze und Listen in Zeilen', () => {
  const html = '<p>Wartung der Pumpe</p><ul><li>Förderband geölt</li><li>Doku erstellt</li></ul>';
  assert.deepEqual(S.htmlToLines(html), ['Wartung der Pumpe', 'Förderband geölt', 'Doku erstellt']);
});

test('htmlToLines: <br> trennt, leere Zeilen entfallen, &nbsp; wird Space', () => {
  const html = '<p>Zeile A<br>Zeile&nbsp;B</p><p><br></p>';
  assert.deepEqual(S.htmlToLines(html), ['Zeile A', 'Zeile B']);
});

test('htmlToLines: leerer/Nullwert und leere Absätze → []', () => {
  assert.deepEqual(S.htmlToLines(''), []);
  assert.deepEqual(S.htmlToLines(null), []);
  assert.deepEqual(S.htmlToLines('<p><br></p>'), []);
});

test('normalize: lowercase, Akzente entfernt, Whitespace normalisiert', () => {
  assert.equal(S.normalize('  Wärtung  der   PÜMPE '), 'wartung der pumpe');
});

test('buildIndex: zählt Häufigkeit pro Kind und merkt lastDate', () => {
  const wochen = [
    { startDate: '2026-01-05', endDate: '2026-01-11', tage: [
      { datum: '2026-01-05', betriebEintrag: '<p>Wartung Pumpe</p>' },
      { datum: '2026-01-06', betriebEintrag: '<p>Wartung Pumpe</p><p>Doku</p>' },
      { datum: '2026-01-07', schuleEintrag: '<p>Mathe</p>' },
    ] },
  ];
  const idx = S.buildIndex(wochen);
  const w = idx.betrieb.get('wartung pumpe');
  assert.equal(w.count, 2);
  assert.equal(w.lastDate, '2026-01-06');
  assert.equal(idx.betrieb.get('doku').count, 1);
  assert.equal(idx.schule.get('mathe').count, 1);
  assert.equal(idx.unterweisung.size, 0);
});

test('buildIndex: Alt-Feld eintrag wird als betrieb gewertet', () => {
  const idx = S.buildIndex([{ tage: [{ datum: '2026-02-01', eintrag: '<p>Altbestand</p>' }] }]);
  assert.equal(idx.betrieb.get('altbestand').count, 1);
});

test('buildIndex: Wochen-Ebene (wöchentliches Format) wird erfasst', () => {
  const idx = S.buildIndex([{ endDate: '2026-03-01', betriebEintrag: '<p>Projektarbeit</p>' }]);
  assert.equal(idx.betrieb.get('projektarbeit').count, 1);
  assert.equal(idx.betrieb.get('projektarbeit').lastDate, '2026-03-01');
});

test('buildIndex: leere/fehlende Eingabe → leere Maps', () => {
  const idx = S.buildIndex(null);
  assert.equal(idx.betrieb.size, 0);
  assert.equal(idx.schule.size, 0);
  assert.equal(idx.unterweisung.size, 0);
});
