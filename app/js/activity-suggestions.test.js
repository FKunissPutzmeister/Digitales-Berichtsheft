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

test('query: leerer Query liefert Top nach Häufigkeit, ohne Highlight', () => {
  const idx = { betrieb: new Map([
    ['a', { text: 'Aufräumen', count: 1, lastDate: '2026-01-01' }],
    ['b', { text: 'Bohren', count: 5, lastDate: '2026-01-01' }],
    ['c', { text: 'CNC fräsen', count: 3, lastDate: '2026-02-01' }],
  ]), schule: new Map(), unterweisung: new Map() };
  const res = S.query(idx, 'betrieb', '', 2);
  assert.deepEqual(res.map(r => r.text), ['Bohren', 'CNC fräsen']);
  assert.equal(res[0].matchStart, -1);
});

test('query: Voll-Präfix rankt vor Token-Präfix', () => {
  const idx = { betrieb: new Map([
    ['wartung pumpe', { text: 'Wartung Pumpe', count: 2, lastDate: '2026-01-01' }],
    ['pumpe wartung', { text: 'Pumpe Wartung', count: 9, lastDate: '2026-01-01' }],
  ]), schule: new Map(), unterweisung: new Map() };
  const res = S.query(idx, 'betrieb', 'wart', 5);
  assert.deepEqual(res.map(r => r.text), ['Wartung Pumpe', 'Pumpe Wartung']);
});

test('query: Highlight-Position im Originaltext', () => {
  const idx = { betrieb: new Map([
    ['wartung pumpe', { text: 'Wartung Pumpe', count: 1, lastDate: '' }],
  ]), schule: new Map(), unterweisung: new Map() };
  const res = S.query(idx, 'betrieb', 'wart', 5);
  assert.equal(res[0].matchStart, 0);
  assert.equal(res[0].matchLen, 4);
});

test('query: exakter Treffer (= bereits getippt) wird ausgelassen', () => {
  const idx = { betrieb: new Map([
    ['wartung pumpe', { text: 'Wartung Pumpe', count: 1, lastDate: '' }],
  ]), schule: new Map(), unterweisung: new Map() };
  assert.deepEqual(S.query(idx, 'betrieb', 'Wartung Pumpe', 5), []);
});

test('query: limit begrenzt die Trefferzahl', () => {
  const m = new Map();
  for (let i = 0; i < 20; i++) m.set('t' + i, { text: 'Task ' + i, count: i, lastDate: '' });
  const idx = { betrieb: m, schule: new Map(), unterweisung: new Map() };
  assert.equal(S.query(idx, 'betrieb', 'task', 7).length, 7);
});

test('query: leerer Index → []', () => {
  const idx = { betrieb: new Map(), schule: new Map(), unterweisung: new Map() };
  assert.deepEqual(S.query(idx, 'betrieb', 'x', 7), []);
});

test('bump: hebt count und lastDate (today injiziert)', () => {
  const idx = { betrieb: new Map([['wartung pumpe', { text: 'Wartung Pumpe', count: 1, lastDate: '2026-01-01' }]]),
                schule: new Map(), unterweisung: new Map() };
  S.bump(idx, 'betrieb', 'Wartung Pumpe', '2026-06-24');
  const e = idx.betrieb.get('wartung pumpe');
  assert.equal(e.count, 2);
  assert.equal(e.lastDate, '2026-06-24');
});

test('bump: unbekannte Zeile wird neu angelegt', () => {
  const idx = { betrieb: new Map(), schule: new Map(), unterweisung: new Map() };
  S.bump(idx, 'betrieb', 'Bohren', '2026-06-24');
  assert.equal(idx.betrieb.get('bohren').count, 1);
});

test('ensure: baut Index einmal pro azubiId und cached', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return [{ tage: [{ datum: '2026-01-01', betriebEintrag: '<p>X</p>' }] }]; };
  S.invalidate();
  const a = await S.ensure('azubi-1', fetcher);
  const b = await S.ensure('azubi-1', fetcher);
  assert.equal(calls, 1);
  assert.equal(a, b);
  assert.equal(a.betrieb.get('x').count, 1);
});

test('ensure: invalidate erzwingt Neuaufbau', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return []; };
  S.invalidate();
  await S.ensure('azubi-2', fetcher);
  S.invalidate('azubi-2');
  await S.ensure('azubi-2', fetcher);
  assert.equal(calls, 2);
});
