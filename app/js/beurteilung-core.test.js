'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('./beurteilung-core.js');
const fs = require('node:fs');
const path = require('node:path');

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

test('formatPunkteGruppe formatiert wie im Original-PDF', () => {
  assert.equal(B.formatPunkteGruppe([100]), '100');
  assert.equal(B.formatPunkteGruppe([99, 98]), '98 + 99');
  assert.equal(B.formatPunkteGruppe([40, 39, 38]), '38 - 40');
  assert.equal(B.formatPunkteGruppe([28, 27, 26, 25, 24, 23]), '23 - 28');
  assert.equal(B.formatPunkteGruppe([5, 4, 3, 2, 1, 0]), '0 - 5');
});

test('notenschluesselZeilen: Stichproben gegen das Original-PDF', () => {
  const zeilen = B.notenschluesselZeilen();
  const byNote = Object.fromEntries(zeilen.map(z => [z.note, z]));

  assert.equal(byNote[1.0].punkteLabel, '100');
  assert.equal(byNote[1.0].verbal, 'sehr gut');

  assert.equal(byNote[1.1].punkteLabel, '98 + 99');
  assert.equal(byNote[3.9].punkteLabel, '59 + 60');
  assert.equal(byNote[3.9].verbal, 'ausreichend');

  assert.equal(byNote[5.0].punkteLabel, '38 - 40');
  assert.equal(byNote[5.0].verbal, 'mangelhaft');

  assert.equal(byNote[5.6].punkteLabel, '23 - 28');
  assert.equal(byNote[5.6].verbal, 'ungenügend');

  assert.equal(byNote[6.0].punkteLabel, '0 - 5');
  assert.equal(byNote[6.0].verbal, 'ungenügend');
});

test('notenschluesselZeilen: Reihenfolge ist aufsteigend nach Note (1,0 zuerst)', () => {
  const zeilen = B.notenschluesselZeilen();
  assert.equal(zeilen[0].note, 1.0);
  assert.equal(zeilen[zeilen.length - 1].note, 6.0);
  for (let i = 1; i < zeilen.length; i++) {
    assert.ok(zeilen[i].note >= zeilen[i - 1].note, `Notenwerte müssen aufsteigend sein bei Index ${i}`);
  }
});

test('IHK-Notenschlüssel-PDF liegt als Asset im Projekt', () => {
  const pdfPath = path.join(__dirname, '..', 'templates', 'ihk-notenschluessel.pdf');
  assert.ok(fs.existsSync(pdfPath), `Erwartet: ${pdfPath}`);
  assert.ok(fs.statSync(pdfPath).size > 0, 'PDF-Datei ist leer');
});

test('IHK-Notenschlüssel-PDF-Link im Modal ist relativ (kein führender Slash)', () => {
  const src = fs.readFileSync(path.join(__dirname, 'beurteilung-core.js'), 'utf8');
  const match = src.match(/href="([^"]*ihk-notenschluessel\.pdf)"/);
  assert.ok(match, 'PDF-Link nicht gefunden');
  assert.ok(!match[1].startsWith('/'), `Href sollte relativ sein (kein führender Slash), war: ${match[1]}`);
});
