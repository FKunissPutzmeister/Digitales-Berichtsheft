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

const SEL = {
  von: '2025-09-01', bis: '2026-08-31', stand: '2026-08-06',
  personen: [
    { name: 'Lena Müller', beruf: 'Industriekauffrau', gruppe: 'Zugewiesen', stationen: [
      { abteilung: 'Montage', von: '2025-09-01', bis: '2025-10-31', verantw: 'Marco Rossi', farbe: '#4CAF50' },
      { abteilung: 'IT', von: '2026-06-01', bis: '2026-11-30', verantw: 'M. Lengerer', farbe: '#2196F3' },
    ] },
    { name: 'Kevin <Test>', beruf: 'Mechatroniker', gruppe: 'Ohne Zuordnung', stationen: [] },
  ],
};

test('renderTafelHtml: vollstaendiges Dokument im Querformat', () => {
  const h = PP.renderTafelHtml(SEL);
  assert.match(h, /^<!DOCTYPE html>/);
  assert.match(h, /<html lang="de">/);
  assert.match(h, /size:A4 landscape/);
  assert.match(h, /<\/html>\s*$/);
});

test('renderTafelHtml: Kopf nennt Zeitraum, Anzahl und Stand', () => {
  const h = PP.renderTafelHtml(SEL);
  assert.match(h, /Abteilungsdurchlauf/);
  assert.match(h, /01\.09\.2025/);
  assert.match(h, /31\.08\.2026/);
  assert.match(h, /2 Personen/);
  assert.match(h, /Stand 06\.08\.2026/);
});

test('renderTafelHtml: thead traegt die Rasterspalten (fuer Kopfwiederholung)', () => {
  const h = PP.renderTafelHtml(SEL);
  assert.match(h, /<thead>/);
  assert.match(h, /Sep 25/);
  assert.match(h, /Aug 26/);
  // table-layout:fixed ist Pflicht, sonst ignoriert der Browser die Spaltenbreiten
  assert.match(h, /table-layout:fixed/);
});

test('renderTafelHtml: Balken tragen Farbe, Cut-Marker und exaktes Datum', () => {
  const h = PP.renderTafelHtml(SEL);
  assert.match(h, /background:#4CAF50/);
  assert.match(h, /Montage/);
  // IT laeuft bis 30.11.2026, also ueber das Zeitraumende hinaus:
  // Marker gesetzt, Datum ungekuerzt.
  assert.match(h, /30\.11\.2026/);
  assert.match(h, /pp-bar--cut-r/);
});

// Zeitraum SEL: 2025-09-01 .. 2026-08-31 = 365 Tage (siehe
// "buildRaster: bis 18 Monate in Monaten"). Werte von Hand nachgerechnet,
// nicht aus barGeom/renderTafelHtml abgeleitet — sonst waere die Pruefung
// nur eine Wiederholung der Implementierung.
test('renderTafelHtml: Balkengeometrie (left/width) exakt gegen von Hand berechnete Prozentwerte', () => {
  const h = PP.renderTafelHtml(SEL);

  // Montage 01.09.2025..31.10.2025: komplett im Zeitraum, direkt am Anfang.
  // Laenge = Sep(30 Tage ab dem 1.) + Okt(31) = 61 Tage. 61/365*100 = 16.7123...
  assert.match(h, /left:0\.0000%;width:16\.7123%;background:#4CAF50/);

  // IT 01.06.2026..30.11.2026: rechts abgeschnitten auf den 31.08.2026.
  // Tage vor dem 01.06. (ab 01.09.2025): Sep+Okt+Nov+Dez+Jan+Feb+Mär+Apr+Mai
  // = 30+31+30+31+31+28+31+30+31 = 273 -> left = 273/365*100 = 74.7945...
  // Laenge (01.06.-31.08.) = Jun(30)+Jul(31)+Aug(31) = 92 -> width = 92/365*100 = 25.2055...
  assert.match(h, /left:74\.7945%;width:25\.2055%;background:#2196F3/);
});

test('renderTafelHtml: Track-Zelle, colgroup und Rasterlinien passen zur Spaltenzahl des Rasters', () => {
  const h = PP.renderTafelHtml(SEL);
  const raster = PP.buildRaster(SEL.von, SEL.bis);
  const n = raster.spalten.length;   // 12 (Monatsraster fuer ein Ausbildungsjahr)

  // colspan der Balkenzelle muss exakt die Spaltenzahl treffen, nicht 0/1.
  const colspanMatches = [...h.matchAll(/colspan="(\d+)"/g)].map(m => Number(m[1]));
  assert.ok(colspanMatches.length > 0, 'keine colspan-Zelle gefunden');
  assert.ok(colspanMatches.every(c => c === n), `colspan-Werte ${colspanMatches} != ${n}`);

  // <colgroup>: Namensspalte + eine <col> pro Rasterspalte.
  const colCount = (h.match(/<col style=/g) || []).length;
  assert.equal(colCount, n + 1);

  // Rasterlinien in der Balkenzelle: eine je innerer Spaltengrenze
  // (Spaltenzahl - 1, die erste Grenze faellt mit dem Zellrand zusammen),
  // multipliziert mit der Personenzahl, da jede Zeile ihre eigene
  // Balkenzelle mit denselben Linien bekommt. Spezifisches Muster, nicht
  // nur "#eee" — das steht auch in PRINT_CSS (td+td{border-left:1px solid
  // #eee}) und wuerde die Zaehlung verfaelschen.
  const linienCount = (h.match(/width:1px;background:#eee/g) || []).length;
  assert.equal(linienCount, (n - 1) * SEL.personen.length);
});

test('renderTafelHtml: Farbwert mit Sonderzeichen wird im style-Attribut escaped', () => {
  const sel = { ...SEL, personen: [{ name: 'A', beruf: 'B', gruppe: 'Zugewiesen', stationen: [
    { abteilung: 'Test', von: '2025-09-01', bis: '2025-10-31', verantw: 'X', farbe: '"><script>x</script' },
  ] }] };
  const h = PP.renderTafelHtml(sel);
  assert.doesNotMatch(h, /background:"><script>/);
  assert.match(h, /background:&quot;&gt;&lt;script&gt;x&lt;\/script/);
});

test('renderTafelHtml: Person ohne Station bekommt Hinweis statt zu fehlen', () => {
  const h = PP.renderTafelHtml(SEL);
  assert.match(h, /keine Zuweisung im Zeitraum/);
});

test('renderTafelHtml: Legende listet nur die gedruckten Abteilungen', () => {
  // Eine Station liegt komplett vor dem Zeitraum — sie darf weder als Balken
  // noch in der Legende auftauchen.
  const sel = { ...SEL, personen: [{ name: 'A', beruf: 'B', gruppe: 'Zugewiesen', stationen: [
    { abteilung: 'Montage',   von: '2025-09-01', bis: '2025-10-31', verantw: 'X', farbe: '#4CAF50' },
    { abteilung: 'Altlager',  von: '2020-01-01', bis: '2020-06-30', verantw: 'X', farbe: '#999999' },
  ] }] };
  const h = PP.renderTafelHtml(sel);
  // lastIndexOf, nicht indexOf: "pp-legend" steht auch im PRINT_CSS, und ein
  // Slice ab dem CSS-Vorkommen wuerde die ganze Tabelle einschliessen —
  // die Negativpruefung koennte dann nie fehlschlagen.
  const legende = h.slice(h.lastIndexOf('<div class="pp-legend">'));
  assert.match(legende, /Montage/);
  assert.doesNotMatch(legende, /Altlager/);
  assert.doesNotMatch(h, /background:#999999/);
});

test('renderTafelHtml: Fremdeingaben werden escaped', () => {
  const h = PP.renderTafelHtml(SEL);
  assert.match(h, /Kevin &lt;Test&gt;/);
  assert.doesNotMatch(h, /Kevin <Test>/);
});

test('renderTafelHtml: print-color-adjust gesetzt, sonst schluckt der Browser die Farben', () => {
  assert.match(PP.renderTafelHtml(SEL), /print-color-adjust:exact/);
});

test('renderTafelHtml: umgedrehter Zeitraum (Ende vor Beginn) liefert gueltiges Dokument mit Hinweis statt colspan="0"/NaN%', () => {
  const sel = { ...SEL, von: '2026-08-31', bis: '2026-01-01' };
  const h = PP.renderTafelHtml(sel);
  assert.match(h, /^<!DOCTYPE html>/);
  assert.match(h, /<\/html>\s*$/);
  assert.match(h, /pp-none/);
  assert.doesNotMatch(h, /colspan="0"/);
  assert.doesNotMatch(h, /NaN/);
});

test('renderTafelHtml: fehlendes personen-Array stuerzt nicht ab, liefert leeres gueltiges Dokument', () => {
  const sel = { von: SEL.von, bis: SEL.bis, stand: SEL.stand };
  const h = PP.renderTafelHtml(sel);
  assert.match(h, /^<!DOCTYPE html>/);
  assert.match(h, /<\/html>\s*$/);
  assert.match(h, /0 Personen/);
});
