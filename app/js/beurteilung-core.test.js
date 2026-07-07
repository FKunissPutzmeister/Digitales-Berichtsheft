'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('./beurteilung-core.js');

test('KRITERIEN hat 10 Einträge in Blöcken 3/3/4', () => {
  assert.equal(B.KRITERIEN.length, 10);
  assert.equal(B.KRITERIEN.filter(k => k.block === 'A').length, 3);
  assert.equal(B.KRITERIEN.filter(k => k.block === 'B').length, 3);
  assert.equal(B.KRITERIEN.filter(k => k.block === 'C').length, 4);
  B.KRITERIEN.forEach(k => assert.equal(k.stufen.length, 6, `${k.key} braucht 6 Stufentexte`));
});

test('stufeFuerPunkte bildet die IHK-Bänder ab', () => {
  assert.equal(B.stufeFuerPunkte(100), 1);
  assert.equal(B.stufeFuerPunkte(92), 1);
  assert.equal(B.stufeFuerPunkte(91), 2);
  assert.equal(B.stufeFuerPunkte(81), 2);
  assert.equal(B.stufeFuerPunkte(80), 3);
  assert.equal(B.stufeFuerPunkte(67), 3);
  assert.equal(B.stufeFuerPunkte(66), 4);
  assert.equal(B.stufeFuerPunkte(50), 4);
  assert.equal(B.stufeFuerPunkte(49), 5);
  assert.equal(B.stufeFuerPunkte(30), 5);
  assert.equal(B.stufeFuerPunkte(29), 6);
  assert.equal(B.stufeFuerPunkte(0), 6);
});

test('PUNKTE_ZU_NOTE hat 101 Einträge und trifft Stützstellen', () => {
  assert.equal(B.PUNKTE_ZU_NOTE.length, 101);
  assert.equal(B.noteFuerPunkte(100), 1.0);
  assert.equal(B.noteFuerPunkte(92), 1.4);
  assert.equal(B.noteFuerPunkte(85), 2.0);
  assert.equal(B.noteFuerPunkte(73), 3.0);
  assert.equal(B.noteFuerPunkte(50), 4.4);
  assert.equal(B.noteFuerPunkte(40), 5.0);
  assert.equal(B.noteFuerPunkte(29), 5.5);
  assert.equal(B.noteFuerPunkte(5), 6.0);
  assert.equal(B.noteFuerPunkte(0), 6.0);
});

test('berechne: alle 100 -> Gesamt 100, Note 1,0', () => {
  const p = {};
  B.KRITERIEN.forEach(k => { p[k.key] = 100; });
  const r = B.berechne(p);
  assert.equal(r.vollstaendig, true);
  assert.equal(r.bloecke.A, 100);
  assert.equal(r.bloecke.C, 100);
  assert.equal(r.summe, 300);
  assert.equal(r.gesamt, 100);
  assert.equal(r.note, 1.0);
});

test('berechne: Blöcke gleichgewichtet (⅓), nicht je Kriterium', () => {
  // A alle 90, B alle 90, C alle 60 -> ØA=90, ØB=90, ØC=60
  const p = {};
  B.KRITERIEN.forEach(k => { p[k.key] = (k.block === 'C') ? 60 : 90; });
  const r = B.berechne(p);
  assert.equal(r.bloecke.A, 90);
  assert.equal(r.bloecke.B, 90);
  assert.equal(r.bloecke.C, 60);
  assert.equal(r.summe, 240);
  assert.equal(r.gesamt, 80);       // 240/3
  assert.equal(r.note, B.noteFuerPunkte(80)); // 2,5
});

test('berechne: unvollständig -> note null, vollstaendig false', () => {
  const p = { auffassungsgabe: 90 };
  const r = B.berechne(p);
  assert.equal(r.vollstaendig, false);
  assert.equal(r.note, null);
});

test('berechne: kaufmännische Rundung (Gesamt 82,5 -> 83)', () => {
  // ØA=85, ØB=85, ØC=77,5 ((77+77+78+78)/4) -> Summe 247,5 -> Gesamt 82,5 -> round 83
  const p = {}; const cVals = [77, 77, 78, 78]; let ci = 0;
  B.KRITERIEN.forEach(k => { p[k.key] = (k.block === 'C') ? cVals[ci++] : 85; });
  const r = B.berechne(p);
  assert.equal(r.bloecke.C, 77.5);
  assert.equal(r.gesamt, 82.5);
  assert.equal(r.note, B.noteFuerPunkte(83)); // Math.round(82.5)=83 -> 2,2
});
