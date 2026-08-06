'use strict';
/* Reine Logik des Druck-Moduls: Zeitraster, Balkengeometrie und die
   HTML-Builder. Kein Browser, kein Server — nur node:test. */
const test = require('node:test');
const assert = require('node:assert/strict');
const PP = require('./planer-print.js');

test('esc entschaerft HTML-Sonderzeichen', () => {
  assert.equal(PP.esc('<b>A & "B"</b>'), '&lt;b&gt;A &amp; &quot;B&quot;&lt;/b&gt;');
  assert.equal(PP.esc(null), '');
});

test('fmtDe dreht ISO auf deutsches Datum', () => {
  assert.equal(PP.fmtDe('2026-08-06'), '06.08.2026');
  assert.equal(PP.fmtDe(''), '');
  assert.equal(PP.fmtDe(null), '');
});

test('tageZwischen zaehlt beide Enden mit', () => {
  assert.equal(PP.tageZwischen('2026-08-06', '2026-08-06'), 1);
  assert.equal(PP.tageZwischen('2026-08-01', '2026-08-31'), 31);
  // Ueber die Sommerzeit-Umstellung (29.03.2026) darf nichts kippen.
  assert.equal(PP.tageZwischen('2026-03-01', '2026-03-31'), 31);
});

test('buildRaster: bis 3 Monate in Kalenderwochen', () => {
  const r = PP.buildRaster('2026-01-05', '2026-02-01');   // 4 KW
  assert.equal(r.einheit, 'woche');
  assert.equal(r.spalten.length, 4);
  assert.equal(r.spalten[0].label, 'KW 2');
  assert.equal(r.tage, 28);
});

test('buildRaster: bis 18 Monate in Monaten', () => {
  const r = PP.buildRaster('2025-09-01', '2026-08-31');   // ein Ausbildungsjahr
  assert.equal(r.einheit, 'monat');
  assert.equal(r.spalten.length, 12);
  assert.equal(r.spalten[0].label, 'Sep 25');
  assert.equal(r.spalten[11].label, 'Aug 26');
  assert.equal(r.tage, 365);
});

test('buildRaster: darueber in Quartalen', () => {
  const r = PP.buildRaster('2025-09-01', '2028-08-31');   // ganze Ausbildung
  assert.equal(r.einheit, 'quartal');
  // Q3/25 (angeschnitten, beginnt am 01.09.) bis Q3/28 = 13 Spalten:
  // 2025: Q3,Q4 · 2026: 4 · 2027: 4 · 2028: Q1,Q2,Q3
  assert.equal(r.spalten.length, 13);
  assert.equal(r.spalten[0].label, 'Q3 25');
  assert.equal(r.spalten[1].label, 'Q4 25');
  assert.equal(r.spalten[12].label, 'Q3 28');
  // Erste Spalte ist auf den Zeitraumbeginn geklemmt, nicht auf den 01.07.
  assert.equal(r.spalten[0].leftPct, 0);
});

test('buildRaster: Spalten decken den Zeitraum luecken- und ueberlappungsfrei ab', () => {
  for (const [von, bis] of [['2026-01-05', '2026-02-01'], ['2025-09-01', '2026-08-31'], ['2025-09-01', '2028-08-31']]) {
    const r = PP.buildRaster(von, bis);
    const summe = r.spalten.reduce((s, c) => s + c.widthPct, 0);
    assert.ok(Math.abs(summe - 100) < 0.001, `Summe ${summe} fuer ${von}..${bis}`);
    assert.equal(r.spalten[0].leftPct, 0);
    for (let i = 1; i < r.spalten.length; i++) {
      const prev = r.spalten[i - 1];
      assert.ok(Math.abs(prev.leftPct + prev.widthPct - r.spalten[i].leftPct) < 0.001, `Luecke bei ${i}`);
    }
  }
});

test('buildRaster: umgedrehter Zeitraum liefert leeres Raster', () => {
  const r = PP.buildRaster('2026-08-31', '2026-01-01');
  assert.equal(r.tage, 0);
  assert.deepEqual(r.spalten, []);
});

// Grenzfaelle der Rastereinheit: 3/4/18/19 beruehrte Kalendermonate sind die
// Umschaltpunkte woche<->monat<->quartal. Genau hier hatte der Plan schon
// einmal eine falsche Spaltenzahl (13 statt 12).
test('buildRaster: genau 3 beruehrte Monate -> woche', () => {
  const r = PP.buildRaster('2026-01-01', '2026-03-31');
  assert.equal(r.einheit, 'woche');
});

test('buildRaster: genau 4 beruehrte Monate -> monat', () => {
  const r = PP.buildRaster('2026-01-01', '2026-04-30');
  assert.equal(r.einheit, 'monat');
});

test('buildRaster: genau 18 beruehrte Monate -> monat', () => {
  const r = PP.buildRaster('2025-01-01', '2026-06-30');
  assert.equal(r.einheit, 'monat');
});

test('buildRaster: genau 19 beruehrte Monate -> quartal', () => {
  const r = PP.buildRaster('2025-01-01', '2026-07-31');
  assert.equal(r.einheit, 'quartal');
});

test('buildRaster: Zeitraum beginnt und endet mittig in einer Einheit', () => {
  const r = PP.buildRaster('2026-01-15', '2026-02-15');
  assert.equal(r.tage, 32);
  assert.equal(r.spalten[0].leftPct, 0);
  const summe = r.spalten.reduce((s, c) => s + c.widthPct, 0);
  assert.ok(Math.abs(summe - 100) < 0.001);
  for (let i = 1; i < r.spalten.length; i++) {
    const prev = r.spalten[i - 1];
    assert.ok(Math.abs(prev.leftPct + prev.widthPct - r.spalten[i].leftPct) < 0.001, `Luecke bei ${i}`);
  }
});

test('buildRaster: Schaltjahr-Februar wird komplett erfasst', () => {
  const r = PP.buildRaster('2024-02-01', '2024-02-29');
  assert.equal(r.tage, 29);
  const summe = r.spalten.reduce((s, c) => s + c.widthPct, 0);
  assert.ok(Math.abs(summe - 100) < 0.001);
});

test('buildRaster: Zeitraum ueberspannt einen Schaltjahr-Februar', () => {
  const r = PP.buildRaster('2024-01-15', '2024-03-15');
  assert.equal(r.tage, 61);
  const summe = r.spalten.reduce((s, c) => s + c.widthPct, 0);
  assert.ok(Math.abs(summe - 100) < 0.001);
});

const R = { von: '2026-01-01', bis: '2026-12-31' };   // 365 Tage

test('barGeom: Station komplett innerhalb', () => {
  const g = PP.barGeom({ von: '2026-01-01', bis: '2026-01-31' }, R);
  assert.equal(g.leftPct, 0);
  assert.ok(Math.abs(g.widthPct - 31 / 365 * 100) < 0.001);
  assert.equal(g.cutLeft, false);
  assert.equal(g.cutRight, false);
  assert.equal(g.open, false);
});

test('barGeom: Station ragt links heraus -> cutLeft, links auf 0', () => {
  const g = PP.barGeom({ von: '2025-11-15', bis: '2026-01-31' }, R);
  assert.equal(g.leftPct, 0);
  assert.equal(g.cutLeft, true);
  assert.equal(g.cutRight, false);
  assert.ok(Math.abs(g.widthPct - 31 / 365 * 100) < 0.001);
});

test('barGeom: Station ragt rechts heraus -> cutRight, endet am Rand', () => {
  const g = PP.barGeom({ von: '2026-12-01', bis: '2027-03-31' }, R);
  assert.equal(g.cutRight, true);
  assert.equal(g.cutLeft, false);
  assert.ok(Math.abs(g.leftPct + g.widthPct - 100) < 0.001);
});

test('barGeom: Station umspannt den Zeitraum beidseitig', () => {
  const g = PP.barGeom({ von: '2025-01-01', bis: '2027-12-31' }, R);
  assert.equal(g.leftPct, 0);
  assert.ok(Math.abs(g.widthPct - 100) < 0.001);
  assert.equal(g.cutLeft, true);
  assert.equal(g.cutRight, true);
});

test('barGeom: offenes Bis laeuft bis Zeitraumende und gilt als cutRight', () => {
  const g = PP.barGeom({ von: '2026-06-01', bis: null }, R);
  assert.equal(g.open, true);
  assert.equal(g.cutRight, true);
  assert.ok(Math.abs(g.leftPct + g.widthPct - 100) < 0.001);
});

test('barGeom: Station komplett ausserhalb -> null', () => {
  assert.equal(PP.barGeom({ von: '2024-01-01', bis: '2024-06-30' }, R), null);
  assert.equal(PP.barGeom({ von: '2028-01-01', bis: '2028-06-30' }, R), null);
});

test('barGeom: Station beruehrt den Zeitraum mit genau einem Tag', () => {
  const g = PP.barGeom({ von: '2025-06-01', bis: '2026-01-01' }, R);
  assert.ok(g);
  assert.ok(Math.abs(g.widthPct - 1 / 365 * 100) < 0.001);
  assert.equal(g.cutLeft, true);
});
