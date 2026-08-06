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
  // Gezielt die .pp-track-Zellen greifen: die Gruppen-Trennzeilen tragen
  // ebenfalls ein colspan (Spaltenzahl + 1 fuer die Namensspalte), ein
  // pauschales colspan="(\d+)" wuerde sie mitzaehlen.
  const colspanMatches = [...h.matchAll(/class="pp-track" colspan="(\d+)"/g)].map(m => Number(m[1]));
  assert.ok(colspanMatches.length > 0, 'keine colspan-Zelle gefunden');
  assert.ok(colspanMatches.every(c => c === n), `colspan-Werte ${colspanMatches} != ${n}`);
  // Trennzeile spannt die GESAMTE Breite: Namensspalte + alle Rasterspalten.
  assert.match(h, new RegExp(`<tr class="pp-grp"><th colspan="${n + 1}"`));

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

test('renderTafelHtml: Beruf wird escaped', () => {
  const sel = { ...SEL, personen: [{ name: 'A', beruf: '<i>Beruf</i> & "X"', gruppe: 'Zugewiesen', stationen: [] }] };
  const h = PP.renderTafelHtml(sel);
  assert.match(h, /<div class="pp-br">&lt;i&gt;Beruf&lt;\/i&gt; &amp; &quot;X&quot;<\/div>/);
  assert.doesNotMatch(h, /<div class="pp-br"><i>Beruf<\/i>/);
});

// Balken-Marker und title-Attribut nutzen beide esc(s.abteilung) an ZWEI
// verschiedenen Stellen im Template — ein Test, der nur irgendein
// Vorkommen im Dokument prueft, wuerde beide Mutationen scheinbar toeten,
// waehrend die andere ueberlebt. Deshalb je ein Assert, das gezielt nur die
// eine oder die andere Einbaustelle trifft (Span-Inhalt vs. title="...").
// Station ohne cutLeft/cutRight (komplett im SEL-Zeitraum), damit das Label
// exakt "abteilung von–bis" ist, ohne die ‹/›-Marker davor/danach. Der
// Zeitraum ist absichtlich lang genug (01.10.2025-31.07.2026, 304 von 365
// Tagen), damit die breiteste Staffelungsstufe greift und der
// Abteilungsname ueberhaupt im Balken landet.
test('renderTafelHtml: Abteilungsname im Balken-Label UND im title-Attribut werden escaped', () => {
  const sel = { ...SEL, personen: [{ name: 'A', beruf: 'B', gruppe: 'Zugewiesen', stationen: [
    { abteilung: '<b>&"Q</b>', von: '2025-10-01', bis: '2026-07-31', verantw: 'X', farbe: '#333' },
  ] }] };
  const h = PP.renderTafelHtml(sel);

  // Label (sichtbarer Text im Balken):
  assert.match(h, /<span class="pp-bar__lbl">&lt;b&gt;&amp;&quot;Q&lt;\/b&gt; 01\.10\.2025–31\.07\.2026<\/span>/);
  assert.doesNotMatch(h, /<span class="pp-bar__lbl"><b>&"Q<\/b>/);

  // title-Attribut (Tooltip):
  assert.match(h, /title="&lt;b&gt;&amp;&quot;Q&lt;\/b&gt; \(01\.10\.2025 – 31\.07\.2026\)"/);
  assert.doesNotMatch(h, /title="<b>&"Q<\/b> \(/);
});

test('renderTafelHtml: Abteilungsname in der Legende wird escaped', () => {
  const sel = { ...SEL, personen: [{ name: 'A', beruf: 'B', gruppe: 'Zugewiesen', stationen: [
    { abteilung: '<u>Recht</u>', von: '2025-09-01', bis: '2025-10-31', verantw: 'X', farbe: '#111111' },
  ] }] };
  const h = PP.renderTafelHtml(sel);
  // lastIndexOf wie im Nachbar-Test: "pp-legend" steht auch im PRINT_CSS.
  const legende = h.slice(h.lastIndexOf('<div class="pp-legend">'));
  assert.match(legende, /&lt;u&gt;Recht&lt;\/u&gt;/);
  assert.doesNotMatch(legende, /<u>Recht<\/u>/);
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

// zeitraumUngueltig ist die einzige Stelle, die entscheidet, ob ein Zeitraum
// degeneriert ist — beide Builder muessen fuer JEDE dieser Eingaben in den
// Fruehausstieg gehen, nicht nur fuer echtes "von > bis". Insbesondere
// '' / null / undefined sind der Weg, auf dem ein leeres <input
// type="date"> (Task 6) einen degenerierten Zeitraum durchreicht — der
// dortige Dialog-Guard sperrt den Drucken-Button dafuer NICHT, der Builder
// muss sich also selbst schuetzen. Ein direkter Stringvergleich sel.von >
// sel.bis waere hier false (weder '' > '' noch null > null noch
// undefined > undefined ist true), obwohl buildRaster fuer alle diese
// Faelle ein leeres Spaltenarray liefert — deshalb prueft zeitraumUngueltig
// das tatsaechliche Rasterergebnis statt einer Vorbedingung.
// Vierter Eintrag je Zeile = der Grund, den das Blatt nennen MUSS. Vorher
// stand dort fuer alle fuenf Faelle "Zeitraum ungueltig (Ende vor Beginn)" —
// bei leeren Feldern eine falsche Behauptung, die den Nutzer in die falsche
// Fehlersuche schickt. Erwartungen von Hand geschrieben, nicht aus
// zeitraumGrund() abgeleitet.
const DEGENERIERTE_ZEITRAEUME = [
  ['von > bis (echte Daten)', '2026-08-31', '2026-01-01', 'Zeitraum ungültig (Ende vor Beginn)'],
  ["leere Strings ('')", '', '', 'Zeitraum fehlt (Von und Bis sind leer)'],
  ['null', null, null, 'Zeitraum fehlt (Von und Bis sind leer)'],
  ['undefined', undefined, undefined, 'Zeitraum fehlt (Von und Bis sind leer)'],
  ['syntaktisch kaputtes Datum', '2026-13-45', '2026-13-45', 'Zeitraum ungültig (Datum nicht lesbar)'],
];

for (const [label, von, bis, grund] of DEGENERIERTE_ZEITRAEUME) {
  test(`renderTafelHtml: degenerierter Zeitraum (${label}) liefert Hinweis statt colspan="0"/NaN/Infinity`, () => {
    const sel = { ...SEL, von, bis };
    const h = PP.renderTafelHtml(sel);
    assert.match(h, /^<!DOCTYPE html>/);
    assert.match(h, /<\/html>\s*$/);
    assert.ok(h.includes(`${grund} — keine Tafel darstellbar`), `Grundtext fehlt: ${grund}`);
    assert.doesNotMatch(h, /colspan="\d+"/);   // keine Tabellenzelle mit Balken/Spalten gebaut
    assert.doesNotMatch(h, /NaN/);
    assert.doesNotMatch(h, /Infinity/);
    // Umlaute im nutzersichtbaren Drucktext, kein "ungueltig".
    assert.doesNotMatch(h, /Zeitraum ungueltig/);
  });

  test(`renderTabelleHtml: degenerierter Zeitraum (${label}) liefert Hinweis statt Abschnitten`, () => {
    const sel = { ...SEL, von, bis };
    const h = PP.renderTabelleHtml(sel);
    assert.match(h, /^<!DOCTYPE html>/);
    assert.match(h, /<\/html>\s*$/);
    assert.ok(h.includes(`${grund} — keine Tabelle darstellbar`), `Grundtext fehlt: ${grund}`);
    assert.doesNotMatch(h, /class="pp-sec"/);
    assert.doesNotMatch(h, /NaN/);
    assert.doesNotMatch(h, /Infinity/);
    assert.doesNotMatch(h, /Zeitraum ungueltig/);
  });
}

// Halbleere Felder: nur Von oder nur Bis gesetzt. Der Grund muss das
// FEHLENDE Feld benennen, nicht "Ende vor Beginn".
test('zeitraumGrund: nur Von bzw. nur Bis gesetzt nennt das fehlende Feld', () => {
  assert.equal(PP.zeitraumGrund({ von: '2026-01-01', bis: '' }), 'Zeitraum unvollständig (Bis fehlt)');
  assert.equal(PP.zeitraumGrund({ von: '', bis: '2026-01-01' }), 'Zeitraum unvollständig (Von fehlt)');
  assert.equal(PP.zeitraumGrund({ von: null, bis: '2026-01-01' }), 'Zeitraum unvollständig (Von fehlt)');
});

test('renderTafelHtml: nur Bis gesetzt -> Hinweis nennt das fehlende Von, nicht "Ende vor Beginn"', () => {
  const h = PP.renderTafelHtml({ ...SEL, von: '', bis: '2026-08-31' });
  assert.ok(h.includes('Zeitraum unvollständig (Von fehlt) — keine Tafel darstellbar'));
  assert.doesNotMatch(h, /Ende vor Beginn/);
});

test('renderTafelHtml/renderTabelleHtml: gueltiger Ein-Tages-Zeitraum (von === bis, echte Daten) wird normal gerendert', () => {
  const sel = {
    von: '2026-01-01', bis: '2026-01-01', stand: '2026-08-06',
    personen: [{ name: 'A', beruf: 'B', gruppe: 'Zugewiesen', stationen: [
      { abteilung: 'IT', von: '2026-01-01', bis: '2026-01-01', verantw: 'X', farbe: '#333' },
    ] }],
  };
  const hT = PP.renderTafelHtml(sel);
  assert.doesNotMatch(hT, /Zeitraum ungueltig/);
  assert.match(hT, /colspan="1"/);
  assert.match(hT, /background:#333/);

  const hB = PP.renderTabelleHtml(sel);
  assert.doesNotMatch(hB, /Zeitraum ungueltig/);
  assert.match(hB, /class="pp-sec"/);
  assert.match(hB, /01\.01\.2026 – 01\.01\.2026/);
});

test('renderTabelleHtml: Dokument im Hochformat', () => {
  const h = PP.renderTabelleHtml(SEL);
  assert.match(h, /^<!DOCTYPE html>/);
  assert.match(h, /size:A4 portrait/);
  assert.match(h, /<\/html>\s*$/);
});

test('renderTabelleHtml: je Person ein umbruchsicherer Abschnitt', () => {
  const h = PP.renderTabelleHtml(SEL);
  assert.equal((h.match(/class="pp-sec"/g) || []).length, 2);
  assert.match(h, /break-inside:avoid/);
  assert.match(h, /Lena Müller/);
  assert.match(h, /Industriekauffrau/);
});

test('renderTabelleHtml: Spalten Abteilung / Zeitraum / Verantwortlich', () => {
  const h = PP.renderTabelleHtml(SEL);
  assert.match(h, /<th>Abteilung<\/th>/);
  assert.match(h, /<th>Zeitraum<\/th>/);
  assert.match(h, /<th>Verantwortlich<\/th>/);
  assert.match(h, /Marco Rossi/);
});

test('renderTabelleHtml: Randstation mit echtem, ungekuerztem Enddatum', () => {
  const h = PP.renderTabelleHtml(SEL);
  assert.match(h, /01\.06\.2026 – 30\.11\.2026/);
});

test('renderTabelleHtml: Person ohne Station bekommt Hinweiszeile', () => {
  const h = PP.renderTabelleHtml(SEL);
  assert.match(h, /keine Zuweisung im Zeitraum/);
});

test('renderTabelleHtml: offenes Bis wird als "offen" gedruckt', () => {
  const sel = { ...SEL, personen: [{ name: 'A', beruf: 'B', gruppe: 'Zugewiesen',
    stationen: [{ abteilung: 'IT', von: '2026-01-01', bis: null, verantw: 'X', farbe: '#333' }] }] };
  assert.match(PP.renderTabelleHtml(sel), /01\.01\.2026 – offen/);
});

test('renderTabelleHtml: Stationen ausserhalb des Zeitraums fehlen', () => {
  const sel = { ...SEL, personen: [{ name: 'A', beruf: 'B', gruppe: 'Zugewiesen',
    stationen: [{ abteilung: 'Altstation', von: '2020-01-01', bis: '2020-06-30', verantw: 'X', farbe: '#333' }] }] };
  const h = PP.renderTabelleHtml(sel);
  assert.doesNotMatch(h, /Altstation/);
  assert.match(h, /keine Zuweisung im Zeitraum/);
});

// Zusatztests (nicht im Brief): Mutationsschutz und degenerierte Eingaben,
// analog zu den Tafel-Tests weiter oben.

test('renderTabelleHtml: Fremdeingaben werden ueberall escaped (Name, Beruf, Gruppe, Abteilung, Verantwortlich)', () => {
  const h = PP.renderTabelleHtml(SEL);
  // "Kevin <Test>" ist der zweite SEL-Personenname — dient hier wie bei der
  // Tafel als Nachweis, dass esc() tatsaechlich am Namen haengt.
  assert.match(h, /Kevin &lt;Test&gt;/);
  assert.doesNotMatch(h, /Kevin <Test>/);

  // Jedes der fuenf ueber esc() laufenden Felder bekommt einen eigenen Wert
  // mit ", < und & — sonst kann eine einzelne fehlende esc()-Anwendung
  // (z.B. an s.verantw) unbemerkt bleiben, weil kein Testdatensatz dort
  // Sonderzeichen enthaelt.
  const sel = { ...SEL, personen: [{
    name: 'B',
    beruf: 'Beruf "X" & <Y>',
    gruppe: 'Gruppe "X" & <Y>',
    stationen: [
      { abteilung: '<script>x</script>', von: '2026-01-01', bis: '2026-01-31', verantw: 'Verantw "A" & <B>', farbe: '#333' },
    ],
  }] };
  const h2 = PP.renderTabelleHtml(sel);

  assert.match(h2, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.doesNotMatch(h2, /<script>x<\/script>/);

  assert.match(h2, /Beruf &quot;X&quot; &amp; &lt;Y&gt;/);
  assert.doesNotMatch(h2, /Beruf "X" & <Y>/);

  assert.match(h2, /Gruppe &quot;X&quot; &amp; &lt;Y&gt;/);
  assert.doesNotMatch(h2, /Gruppe "X" & <Y>/);

  assert.match(h2, /Verantw &quot;A&quot; &amp; &lt;B&gt;/);
  assert.doesNotMatch(h2, /Verantw "A" & <B>/);
});

test('renderTabelleHtml: umgedrehter Zeitraum (Ende vor Beginn) liefert gueltiges Dokument mit Hinweis', () => {
  const sel = { ...SEL, von: '2026-08-31', bis: '2026-01-01' };
  const h = PP.renderTabelleHtml(sel);
  assert.match(h, /^<!DOCTYPE html>/);
  assert.match(h, /<\/html>\s*$/);
  assert.match(h, /pp-none/);
  assert.doesNotMatch(h, /class="pp-sec"/);
});

test('renderTabelleHtml: leeres personen-Array liefert gueltiges Dokument ohne Abschnitte', () => {
  const sel = { von: SEL.von, bis: SEL.bis, stand: SEL.stand, personen: [] };
  const h = PP.renderTabelleHtml(sel);
  assert.match(h, /^<!DOCTYPE html>/);
  assert.match(h, /<\/html>\s*$/);
  assert.doesNotMatch(h, /class="pp-sec"/);
  assert.match(h, /0 Personen/);
});

test('renderTabelleHtml: fehlendes personen-Array stuerzt nicht ab', () => {
  const sel = { von: SEL.von, bis: SEL.bis, stand: SEL.stand };
  const h = PP.renderTabelleHtml(sel);
  assert.match(h, /^<!DOCTYPE html>/);
  assert.match(h, /<\/html>\s*$/);
  assert.match(h, /0 Personen/);
});

/* ═══════════════════════════════════════════════════════════════════════
   BALKENLABEL — Staffelung nach Breite (Funde B und C)
   Alle Erwartungswerte von Hand nachgerechnet, nicht aus barLabel/
   textBreitePx abgeleitet. Rechenbasis:
     TRACK_PX = 800 (Balkenzelle auf A4 quer), LBL_PADDING = 10
     -> nutzbare Textbreite innen = widthPct/100 * 800 - 10
   Zeichenbreiten (9px Segoe UI, gemessen und aufgerundet):
     Ziffer 4.90 · '.' 2.00 · ' ' 2.50 · '–' 4.50 · '‹'/'›' 2.85
   Damit:
     "01.09.2025–31.10.2025" = 16*4.90 + 4*2.00 + 4.50 = 90.90 px
     "01.01.26"              =  6*4.90 + 2*2.00        = 33.40 px
     "Montage" (M8.10 o5.30 n5.10 t3.05 a4.60 g5.30 e4.75) = 36.20 px
   ═══════════════════════════════════════════════════════════════════════ */

test('textBreitePx: Datum, Kurzdatum und Abteilungsname gegen Handrechnung', () => {
  assert.equal(PP.textBreitePx('01.09.2025–31.10.2025').toFixed(2), '90.90');
  assert.equal(PP.textBreitePx('01.01.26').toFixed(2), '33.40');
  assert.equal(PP.textBreitePx('Montage').toFixed(2), '36.20');
  assert.equal(PP.textBreitePx('').toFixed(2), '0.00');
  // Unbekanntes Zeichen wird grosszuegig mit 8.50 gerechnet (nie zu klein).
  assert.equal(PP.textBreitePx('\u{1F600}').toFixed(2), '8.50');
});

// EHRLICHE EINORDNUNG: dieser Test ist tautologisch. Er haelt die Konstante
// gegen sich selbst und beweist NICHT, dass 800 die richtige Papierbreite ist.
// Er existiert nur, damit eine Aenderung an TRACK_PX auffaellt und der Aenderer
// die Kalibrierung bewusst neu belegen muss. Die tatsaechliche Kalibrierung
// (804.95px gemessene Balkenzellenbreite bei A4 quer) ist ausschliesslich
// durch die Browser-Messung gedeckt — siehe final-fix-report.md, Fund C.
test('TRACK_PX ist unveraendert 800 (Konsistenz, kein Kalibrierungsnachweis)', () => {
  assert.equal(PP.TRACK_PX, 800);
});

// Ein Ausbildungsjahr = 365 Tage (siehe "buildRaster: bis 18 Monate").
const RJ = { von: '2025-09-01', bis: '2026-08-31' };

test('barLabel Stufe 1: viel Platz -> Abteilung + volles Von-Bis', () => {
  // 01.10.2025-31.07.2026 = 304 Tage -> 83.2877% -> 666.30px -> innen 656.30.
  // Stufe 1 "Montage 01.10.2025–31.07.2026" = 36.20 + 2.50 + 90.90 = 129.60 <= 656.30
  const s = { abteilung: 'Montage', von: '2025-10-01', bis: '2026-07-31' };
  assert.equal(PP.barLabel(s, PP.barGeom(s, RJ)), 'Montage 01.10.2025–31.07.2026');
});

test('barLabel Stufe 2: mittlere Breite -> nur das Von-Bis, Abteilung entfaellt', () => {
  // 01.09.2025-31.10.2025 = 61 Tage -> 16.7123% -> 133.70px -> innen 123.70.
  // Stufe 1 = 129.60 > 123.70 (passt NICHT), Stufe 2 = 90.90 <= 123.70.
  const s = { abteilung: 'Montage', von: '2025-09-01', bis: '2025-10-31' };
  assert.equal(PP.barLabel(s, PP.barGeom(s, RJ)), '01.09.2025–31.10.2025');
});

test('barLabel Stufe 3: schmal -> nur das verkuerzte Startdatum', () => {
  // 01.01.2026-28.01.2026 = 28 Tage -> 7.6712% -> 61.37px -> innen 51.37.
  // Stufe 2 = 90.90 > 51.37, Stufe 3 "01.01.26" = 33.40 <= 51.37.
  const s = { abteilung: 'IT', von: '2026-01-01', bis: '2026-01-28' };
  assert.equal(PP.barLabel(s, PP.barGeom(s, RJ)), '01.01.26');
});

test('barLabel Stufe 4: sehr schmal und rechts angeschnitten -> nur der Marker', () => {
  // 25.08.2026-31.12.2026, sichtbar 25.-31.08. = 7 Tage -> 1.9178% -> 15.34px
  // -> innen 5.34. Stufe 3 = 33.40 > 5.34, Marker '›' = 2.85 <= 5.34.
  const s = { abteilung: 'Vertrieb', von: '2026-08-25', bis: '2026-12-31' };
  assert.equal(PP.barLabel(s, PP.barGeom(s, RJ)), '›');
});

test('barLabel Stufe 5: zu schmal fuer alles -> leer (Farbe und Legende tragen die Info)', () => {
  // 02.03.2026-06.03.2026 = 5 Tage -> 1.3699% -> 10.96px -> innen 0.96.
  // Kein Marker (Station liegt komplett drin), Stufe 3 = 33.40 > 0.96.
  const s = { abteilung: 'Recht', von: '2026-03-02', bis: '2026-03-06' };
  assert.equal(PP.barLabel(s, PP.barGeom(s, RJ)), '');
});

test('barLabel: Randmarker bleiben in Stufe 1 erhalten und das Datum ist das ECHTE, ungekuerzte', () => {
  // IT 01.06.2026-30.11.2026, sichtbar bis 31.08.2026 = 92 Tage -> 25.2055%
  // -> 201.64px -> innen 191.64. Stufe 1 mit ' ›' (2.50+2.85=5.35):
  // "IT" (2.40+4.90=7.30) + 2.50 + 90.90 + 5.35 = 106.05 <= 191.64.
  const s = { abteilung: 'IT', von: '2026-06-01', bis: '2026-11-30' };
  assert.equal(PP.barLabel(s, PP.barGeom(s, RJ)), 'IT 01.06.2026–30.11.2026 ›');
});

test('barLabel: links angeschnittene Station traegt den Marker und das echte Startdatum aus der Vergangenheit', () => {
  // 15.06.2025-31.05.2026, sichtbar 01.09.2025-31.05.2026 = 273 Tage
  // -> 74.7945% -> 598.36px -> innen 588.36 — Stufe 1 passt sicher.
  const s = { abteilung: 'Einkauf', von: '2025-06-15', bis: '2026-05-31' };
  const l = PP.barLabel(s, PP.barGeom(s, RJ));
  assert.equal(l, '‹ Einkauf 15.06.2025–31.05.2026');
  // Nicht auf den Zeitraumbeginn zurueckgerechnet:
  assert.doesNotMatch(l, /01\.09\.2025/);
});

test('barLabel: offenes Bis wird als "offen" gezeigt, nicht als Zeitraumende', () => {
  // 01.10.2025-offen: sichtbar bis 31.08.2026 = 335 Tage -> 91.7808%
  // -> 734.25px -> innen 724.25 — Stufe 1 passt.
  const s = { abteilung: 'IT', von: '2025-10-01', bis: null };
  assert.equal(PP.barLabel(s, PP.barGeom(s, RJ)), 'IT 01.10.2025–offen ›');
});

// Kleiner ISO-Datumsrechner nur fuer den Messtest (UTC, wie das Modul).
function isoPlus(iso, tage) {
  const t = new Date(iso + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + tage);
  return t.toISOString().slice(0, 10);
}

// EHRLICHE EINORDNUNG: dieser Test rechnet mit demselben PP.TRACK_PX und
// derselben Padding-Zahl wie barLabel selbst — er ist damit eine
// KONSISTENZPRUEFUNG der Staffelungslogik gegen ihre eigene Rechenbasis, KEIN
// Nachweis, dass die Rechenbasis zum Papier passt. Waeren TRACK_PX und die
// echte Balkenzellenbreite gemeinsam falsch, bliebe der Test gruen.
// Die Papierkalibrierung ist ausschliesslich durch die Browser-Messung
// gedeckt (1715 Balken, 0 Ueberlaeufe; siehe final-fix-report.md, Fund C).
// Was dieser Test dennoch verlaesslich toetet: eine Staffelung, die eine zu
// breite Stufe waehlt, und jede Aenderung, die das Label wieder abschneidet.
test('barLabel: kein Label laeuft je ueber den Balken hinaus (Fund C, ueber alle Rasterstufen)', () => {
  const NAMEN = ['IT', 'Einkauf PMM', 'Qualitätssicherung', 'Montage', 'Öffentlichkeitsarbeit & Marketing', ''];
  const RANGES = [
    { von: '2025-09-01', bis: '2026-08-31' },   // Monatsraster, ein AJ
    { von: '2025-09-01', bis: '2028-08-31' },   // Quartalsraster, ganze Ausbildung
    { von: '2026-01-05', bis: '2026-02-01' },   // Wochenraster, 4 KW
  ];
  let geprueft = 0;
  for (const range of RANGES) {
    const tage = PP.tageZwischen(range.von, range.bis);
    for (const abteilung of NAMEN) {
      for (const laenge of [1, 2, 3, 5, 8, 14, 30, 61, 120, tage, tage + 90]) {
        for (const startOffset of [0, -30, Math.floor(tage / 2)]) {
          const von = isoPlus(range.von, startOffset);
          const s = { abteilung, von, bis: isoPlus(von, laenge - 1) };
          const g = PP.barGeom(s, range);
          if (!g) continue;
          const label = PP.barLabel(s, g);
          // Bei sehr schmalen Balken ist "innen" negativ (Balken schmaler als
          // das Label-Padding) — dort ist NUR das leere Label zulaessig, und
          // fuer das baut renderTafelHtml den <span> gar nicht mehr.
          const innen = Math.max(g.widthPct / 100 * PP.TRACK_PX - 10, 0);
          assert.ok(PP.textBreitePx(label) <= innen,
            `"${label}" (${PP.textBreitePx(label).toFixed(2)}px) passt nicht in ${innen.toFixed(2)}px ` +
            `(${range.von}..${range.bis}, ${abteilung || '(leer)'}, ${laenge} Tage)`);
          geprueft++;
        }
      }
    }
  }
  assert.ok(geprueft > 300, `nur ${geprueft} Faelle geprueft`);
});

test('renderTafelHtml: die gedruckte Tafel enthaelt Datumsangaben IM Balken, nicht nur im title (Fund B)', () => {
  const h = PP.renderTafelHtml(SEL);
  // Montage-Balken (61 Tage) -> Stufe 2 = nur das Datum.
  assert.match(h, /<span class="pp-bar__lbl">01\.09\.2025–31\.10\.2025<\/span>/);
  // IT-Balken laeuft ueber den Rand: echtes Enddatum + Marker im Balken.
  assert.match(h, /<span class="pp-bar__lbl">IT 01\.06\.2026–30\.11\.2026 ›<\/span>/);

  // Gegenprobe: jedes Balken-Label muss ein Datum tragen — genau das war
  // vorher nicht der Fall (dort stand nur der Abteilungsname).
  const labels = [...h.matchAll(/<span class="pp-bar__lbl">([^<]*)<\/span>/g)].map(m => m[1]);
  assert.ok(labels.length >= 2, `nur ${labels.length} Balken-Labels gefunden`);
  assert.ok(labels.every(l => /\d{2}\.\d{2}\.\d{2}/.test(l)),
    `Balken ohne Datum: ${JSON.stringify(labels)}`);
});

test('renderTafelHtml: Balkentext wird nie mitten im Wort abgeschnitten (Fund C)', () => {
  // "Einkauf PMM" druckte frueher als "Ei", "Qualitätssicherung" als
  // "Qualitäts" — ein Wortfragment liest sich wie ein Abteilungsname.
  const sel = { ...SEL, personen: [{ name: 'A', beruf: 'B', gruppe: 'Zugewiesen', stationen: [
    // 181 Tage -> 49.5890% -> 396.71px -> innen 386.71: Stufe 1 passt.
    { abteilung: 'Einkauf PMM',        von: '2025-09-01', bis: '2026-02-28', verantw: 'X', farbe: '#111' },
    // 92 Tage -> 25.2055% -> 201.64px -> innen 191.64: Stufe 1 = 74.20 + 2.50
    // + 90.90 = 167.60 passt noch.
    { abteilung: 'Qualitätssicherung', von: '2026-03-01', bis: '2026-05-31', verantw: 'X', farbe: '#222' },
    // 28 Tage -> innen 51.37: nur noch das Kurzdatum (Stufe 3).
    { abteilung: 'IT',                 von: '2026-06-01', bis: '2026-06-28', verantw: 'X', farbe: '#333' },
  ] }] };
  const h = PP.renderTafelHtml(sel);
  const labels = [...h.matchAll(/<span class="pp-bar__lbl">([^<]*)<\/span>/g)].map(m => m[1]);
  assert.deepEqual(labels, [
    'Einkauf PMM 01.09.2025–28.02.2026',
    'Qualitätssicherung 01.03.2026–31.05.2026',
    '01.06.26',
  ]);
  // Die frueheren Fragmente duerfen nirgends als Label stehen.
  for (const l of labels) {
    assert.doesNotMatch(l, /^Ei$/);
    assert.doesNotMatch(l, /^Qualitäts$/);
    assert.doesNotMatch(l, /^I$/);
  }
});

/* ═══ FARB-FALLBACK (Fund D) ══════════════════════════════════════════ */

test('PRINT_CSS: .pp-bar und die Legendenkaestchen tragen eine dunkle Basisfarbe', () => {
  // Ohne diese Basis erzeugt ein fehlender Farbwert einen vollstaendig
  // transparenten Balken — die Station ist auf dem Papier unsichtbar.
  assert.match(PP.PRINT_CSS, /\.pp-bar\{[^}]*background:#37474F/);
  assert.match(PP.PRINT_CSS, /\.pp-legend span\.sw\{[^}]*background:#37474F/);
});

for (const [label, farbe] of [['undefined', undefined], ['null', null], ["leerer String", ''], ['nur Leerzeichen', '   ']]) {
  test(`renderTafelHtml: Farbe ${label} erzeugt keinen leeren background (Balken bleibt sichtbar)`, () => {
    const sel = { ...SEL, personen: [{ name: 'A', beruf: 'B', gruppe: 'Zugewiesen', stationen: [
      { abteilung: 'Montage', von: '2025-09-01', bis: '2025-10-31', verantw: 'X', farbe },
    ] }] };
    const h = PP.renderTafelHtml(sel);
    // Kein "background:" ohne Wert (weder am Balken noch am Legendenkaestchen).
    assert.doesNotMatch(h, /background:(?=["; ])/);
    assert.doesNotMatch(h, /background:undefined/);
    assert.doesNotMatch(h, /background:null/);
    // Der Balken existiert und traegt nur left/width inline.
    assert.match(h, /<div class="pp-bar" style="left:0\.0000%;width:16\.7123%"/);
    // Legendenkaestchen ohne style-Attribut -> Basisfarbe aus dem CSS.
    assert.match(h, /<span class="sw"><\/span>Montage/);
  });
}

test('renderTafelHtml: brauchbarer Farbwert wird weiterhin inline gesetzt', () => {
  const h = PP.renderTafelHtml(SEL);
  assert.match(h, /width:16\.7123%;background:#4CAF50/);
});

/* ═══ GRUPPEN-TRENNZEILEN (Entscheidung E) ════════════════════════════ */

const SEL_G = {
  von: '2025-09-01', bis: '2026-08-31', stand: '2026-08-06',
  personen: [
    { name: 'Albaque A', beruf: 'X', gruppe: 'Ohne Zuordnung', stationen: [] },
    { name: 'Wunderlich W', beruf: 'X', gruppe: 'Ohne Zuordnung', stationen: [] },
    { name: 'Berger B', beruf: 'X', gruppe: 'Zugewiesen', stationen: [
      { abteilung: 'Montage', von: '2025-09-01', bis: '2025-10-31', verantw: 'V', farbe: '#4CAF50' }] },
    { name: 'Ziegler Z', beruf: 'X', gruppe: 'Zugewiesen', stationen: [] },
    { name: 'Cramer C', beruf: 'X', gruppe: 'Zugewiesen', stationen: [] },
    { name: 'Dorn D', beruf: 'X', gruppe: 'DH-Studenten', stationen: [] },
  ],
};

test('renderTafelHtml: je Gruppe genau eine Trennzeile mit Name und Anzahl', () => {
  const h = PP.renderTafelHtml(SEL_G);
  const zeilen = [...h.matchAll(/<tr class="pp-grp"><th colspan="\d+" scope="rowgroup">([^<]*)<span class="pp-grp__n">\((\d+)\)<\/span>/g)]
    .map(m => [m[1].trim(), Number(m[2])]);
  // Anzahlen von Hand: Ohne Zuordnung 2, Zugewiesen 3, DH-Studenten 1.
  assert.deepEqual(zeilen, [['Ohne Zuordnung', 2], ['Zugewiesen', 3], ['DH-Studenten', 1]]);
});

test('renderTafelHtml: Trennzeilen behalten die Reihenfolge des Aufrufers (nicht alphabetisch)', () => {
  // gruppierteAzubis() in abteilungs-planer.js liefert GROUP_ORDER
  // ('Ohne Zuordnung','Zugewiesen','DH-Studenten') — alphabetisch waere
  // 'DH-Studenten' zuerst. Hier kommt die Reihenfolge umgedreht an; die
  // Ausgabe muss ihr folgen.
  const sel = { ...SEL_G, personen: [...SEL_G.personen].reverse() };
  const h = PP.renderTafelHtml(sel);
  const namen = [...h.matchAll(/scope="rowgroup">([^<]*)<span/g)].map(m => m[1].trim());
  assert.deepEqual(namen, ['DH-Studenten', 'Zugewiesen', 'Ohne Zuordnung']);
});

test('renderTafelHtml: Trennzeile spannt die gesamte Tabellenbreite und verschiebt die Balken nicht', () => {
  const h = PP.renderTafelHtml(SEL_G);
  const n = PP.buildRaster(SEL_G.von, SEL_G.bis).spalten.length;
  assert.equal(n, 12);
  // Namensspalte + 12 Rasterspalten = 13.
  assert.match(h, /<tr class="pp-grp"><th colspan="13"/);
  // Die Balkengeometrie ist unveraendert (gleicher Wert wie im Geometrietest).
  assert.match(h, /left:0\.0000%;width:16\.7123%;background:#4CAF50/);
  // Trennzeile steht VOR der ersten Person ihrer Gruppe.
  const iGrp = h.indexOf('Ohne Zuordnung <span class="pp-grp__n">');
  const iPerson = h.indexOf('Albaque A');
  assert.ok(iGrp > 0, 'Trennzeile "Ohne Zuordnung" nicht gefunden');
  assert.ok(iGrp < iPerson, 'Trennzeile steht nicht vor ihrer ersten Person');
});

test('renderTafelHtml: Trennzeile bleibt nicht allein am Seitenende (break-after:avoid)', () => {
  const h = PP.renderTafelHtml(SEL_G);
  assert.match(h, /\.pp-grp\{[^}]*break-after:avoid/);
  assert.match(h, /\.pp-grp\{[^}]*page-break-after:avoid/);
});

test('renderTafelHtml: Personen ohne gruppe-Feld laufen ohne Trennzeile durch (Panel-Druck)', () => {
  const sel = { ...SEL_G, personen: [{ name: 'Solo', beruf: 'X', stationen: [] }] };
  const h = PP.renderTafelHtml(sel);
  assert.doesNotMatch(h, /class="pp-grp"/);
  assert.match(h, /Solo/);
});

test('renderTafelHtml: Gruppenname wird escaped', () => {
  const sel = { ...SEL_G, personen: [{ name: 'A', beruf: 'X', gruppe: '<b>&"G</b>', stationen: [] }] };
  const h = PP.renderTafelHtml(sel);
  assert.match(h, /scope="rowgroup">&lt;b&gt;&amp;&quot;G&lt;\/b&gt; <span/);
  assert.doesNotMatch(h, /scope="rowgroup"><b>/);
});

/* ═══ TITEL-ZUSATZ (Fund I) ═══════════════════════════════════════════ */

test('kopfHtml/dokument: titelZusatz landet in Ueberschrift und Dokumenttitel', () => {
  const sel = { ...SEL, titelZusatz: 'Lena Müller' };
  for (const h of [PP.renderTafelHtml(sel), PP.renderTabelleHtml(sel)]) {
    assert.match(h, /<title>Durchlauf Lena Müller<\/title>/);
    assert.match(h, /<h1>Abteilungsdurchlauf – Lena Müller<\/h1>/);
  }
});

test('dokument: ohne titelZusatz bleibt der Titel "Abteilungsdurchlauf"', () => {
  assert.match(PP.renderTafelHtml(SEL), /<title>Abteilungsdurchlauf<\/title>/);
  assert.match(PP.renderTafelHtml(SEL), /<h1>Abteilungsdurchlauf<\/h1>/);
});

test('dokument: titelZusatz wird escaped (auch im <title>)', () => {
  const sel = { ...SEL, titelZusatz: '</title><script>x</script>' };
  const h = PP.renderTafelHtml(sel);
  assert.doesNotMatch(h, /<title>Durchlauf <\/title>/);
  assert.match(h, /<title>Durchlauf &lt;\/title&gt;&lt;script&gt;x&lt;\/script&gt;<\/title>/);
});

test('kopfHtml: titelZusatz auch im degenerierten Zeitraum erhalten', () => {
  const h = PP.renderTafelHtml({ ...SEL, von: '', bis: '', titelZusatz: 'Lena Müller' });
  assert.match(h, /<title>Durchlauf Lena Müller<\/title>/);
  assert.match(h, /Zeitraum fehlt/);
});

test('renderTafelHtml: leeres Label baut gar keinen <span> (sonst laeuft sein Padding ueber)', () => {
  // 02.03.2026-06.03.2026 = 5 Tage -> 1.3699% -> 10.96px Balken. Selbst das
  // leere Label-Padding (0 5px = 10px) waere darin schon fast der ganze
  // Balken, bei 1-2 Tagen ein messbarer Ueberlauf. Also kein <span>.
  const sel = { ...SEL, personen: [{ name: 'A', beruf: 'B', gruppe: 'Zugewiesen', stationen: [
    { abteilung: 'Recht', von: '2026-03-02', bis: '2026-03-06', verantw: 'X', farbe: '#333' },
  ] }] };
  const h = PP.renderTafelHtml(sel);
  assert.match(h, /<div class="pp-bar" style="left:[\d.]+%;width:1\.3699%;background:#333" title="Recht \(02\.03\.2026 – 06\.03\.2026\)"><\/div>/);
  assert.doesNotMatch(h, /pp-bar__lbl"><\/span>/);
});

/* ═══════════════════════════════════════════════════════════════════════
   DRUCKZEITRAUM EINER PERSON (Fund A, N1, N2)
   Die Regel, die den Panel-Druck ausloeste, war bis hierher von keinem Test
   gedeckt — sie lag in abteilungs-planer.js, das DOM, Backend und Session
   braucht. Jetzt reine Funktion in planer-print.js.
   Alle Erwartungen von Hand geschrieben; das Fenster ist ueberall dasselbe
   Ausbildungsjahr AJ 2025/26.
   ═══════════════════════════════════════════════════════════════════════ */

const AJ = { von: '2025-09-01', bis: '2026-08-31', heute: '2026-08-06' };
const st = (von, bis) => ({ abteilung: 'X', von, bis, verantw: 'V', farbe: '#333' });

test('druckZeitraum: Zeitraum umschliesst alle Stationen, auch ausser dem AJ (Fund A)', () => {
  // Stationen 2024, 2025-10 und 2027 — genau das Szenario aus dem Review.
  const s = [st('2024-03-01', '2024-08-31'), st('2025-10-01', '2025-12-31'), st('2027-01-15', '2027-06-30')];
  assert.deepEqual(PlanerPrintZ(s), { von: '2024-03-01', bis: '2027-06-30' });
});

test('druckZeitraum: eine einzige Station ergibt genau deren Zeitraum', () => {
  assert.deepEqual(PlanerPrintZ([st('2026-01-05', '2026-02-01')]), { von: '2026-01-05', bis: '2026-02-01' });
});

test('druckZeitraum: Ein-Tages-Station bleibt ein gueltiger Ein-Tages-Zeitraum', () => {
  assert.deepEqual(PlanerPrintZ([st('2026-03-02', '2026-03-02')]), { von: '2026-03-02', bis: '2026-03-02' });
});

/* ── N2: offene Stationen ───────────────────────────────────────────────── */

test('druckZeitraum N2: offene Zukunftsstation faellt nicht heraus', () => {
  // Der gemeldete Fall: max(bis) = 2025-10-31 liegt VOR dem Beginn der
  // offenen Station. Frueher ergab das 2025-09-01..2026-08-31 und die zweite
  // Station fehlte. bis muss mindestens der spaeteste Stationsbeginn sein.
  const s = [st('2025-09-01', '2025-10-31'), st('2027-03-01', null)];
  assert.deepEqual(PlanerPrintZ(s), { von: '2025-09-01', bis: '2027-03-01' });
});

test('druckZeitraum N2: offene Station in der Vergangenheit laeuft bis Ausbildungsende', () => {
  // ausbildungsEnde 2028-01-31 ist spaeter als AJ-Ende und heute -> gewinnt.
  const s = [st('2025-09-01', null)];
  assert.deepEqual(
    PP.druckZeitraum({ ausbildungsEnde: '2028-01-31' }, s, AJ),
    { von: '2025-09-01', bis: '2028-01-31' });
});

test('druckZeitraum N2: ohne Profilende zieht das AJ-Ende (spaeter als heute)', () => {
  assert.deepEqual(PlanerPrintZ([st('2025-09-01', null)]), { von: '2025-09-01', bis: '2026-08-31' });
});

test('druckZeitraum N2: bereits laengerer Zeitraum wird von der Verlaengerung nicht verkuerzt', () => {
  // max(bis) = 2029-12-31 liegt hinter allem, was die Verlaengerung anbietet.
  const s = [st('2025-09-01', '2029-12-31'), st('2026-01-01', null)];
  assert.deepEqual(PlanerPrintZ(s), { von: '2025-09-01', bis: '2029-12-31' });
});

test('druckZeitraum N2: nur offene Stationen ohne jedes Bis', () => {
  const s = [st('2027-05-01', null), st('2026-02-01', null)];
  // von = fruehester Beginn, bis = spaetester Beginn (2027-05-01), danach
  // Verlaengerung auf max(2027-05-01, AJ-Ende 2026-08-31, heute 2026-08-06).
  assert.deepEqual(PlanerPrintZ(s), { von: '2026-02-01', bis: '2027-05-01' });
});

/* ── N1: Guard deckt jeden Rueckgabepfad ────────────────────────────────── */

test('druckZeitraum N1: keine Station und leeres Profil -> das uebergebene Fenster', () => {
  assert.deepEqual(PlanerPrintZ([]), { von: '2025-09-01', bis: '2026-08-31' });
});

test('druckZeitraum N1: keine Station, vollstaendiges Profil -> Profilzeitraum', () => {
  assert.deepEqual(
    PP.druckZeitraum({ ausbildungsBeginn: '2024-09-01', ausbildungsEnde: '2027-08-31' }, [], AJ),
    { von: '2024-09-01', bis: '2027-08-31' });
});

test('druckZeitraum N1: keine Station, nur ausbildungsEnde in der Vergangenheit', () => {
  // Frueher: von = AJ-Beginn 2025-09-01, bis = Profil 2024-07-31 -> das Blatt
  // druckte "Zeitraum ungültig (Ende vor Beginn)", obwohl vor der Fix-Welle
  // ein normales leeres Blatt kam. Der Guard klemmt bis auf von.
  assert.deepEqual(
    PP.druckZeitraum({ ausbildungsEnde: '2024-07-31' }, [], AJ),
    { von: '2025-09-01', bis: '2025-09-01' });
});

test('druckZeitraum N1: keine Station, nur ausbildungsBeginn in der Zukunft', () => {
  // Frueher: 2027-09-01 .. AJ-Ende 2026-08-31 -> Fehlerblatt.
  assert.deepEqual(
    PP.druckZeitraum({ ausbildungsBeginn: '2027-09-01' }, [], AJ),
    { von: '2027-09-01', bis: '2027-09-01' });
});

test('druckZeitraum N1: die halb gefuellten Profile ergeben ein DRUCKBARES Blatt, kein Fehlerblatt', () => {
  // Gegenprobe durch den echten Builder: genau das war die Regression.
  for (const person of [{ ausbildungsEnde: '2024-07-31' }, { ausbildungsBeginn: '2027-09-01' }]) {
    const z = PP.druckZeitraum(person, [], AJ);
    const h = PP.renderTabelleHtml({ ...z, stand: AJ.heute, titelZusatz: 'A',
      personen: [{ name: 'A', beruf: 'B', stationen: [] }] });
    assert.doesNotMatch(h, /Zeitraum ungültig/, `Fehlerblatt fuer ${JSON.stringify(person)}`);
    assert.doesNotMatch(h, /Zeitraum fehlt/);
    assert.doesNotMatch(h, /Zeitraum unvollständig/);
    assert.match(h, /class="pp-sec"/);
    assert.match(h, /keine Zuweisung im Zeitraum/);
  }
});

/* ── Zusicherung: keine Station faellt jemals heraus ────────────────────── */

test('druckZeitraum: KEINE Station faellt aus dem Zeitraum (barGeom-Gegenprobe)', () => {
  // Die eigentliche Zusicherung, unabhaengig von einzelnen Beispielen: fuer
  // jede Kombination muss barGeom JEDE Station durchlassen und der echte
  // Builder jede Station drucken.
  const KOMBIS = [
    [st('2024-03-01', '2024-08-31'), st('2025-10-01', '2025-12-31'), st('2027-01-15', '2027-06-30')],
    [st('2025-09-01', '2025-10-31'), st('2027-03-01', null)],
    [st('2027-05-01', null), st('2026-02-01', null)],
    [st('2026-01-01', '2026-01-01')],
    [st('2020-01-01', '2020-01-02'), st('2030-12-30', '2030-12-31')],
    // bewusst kaputte Station (bis vor von) — in dieser Welle nicht
    // reparieren, aber sie darf nicht lautlos verschwinden.
    [st('2027-03-01', '2026-01-01'), st('2025-09-01', '2025-10-31')],
    [st('2025-09-01', null)],
  ];
  const PROFILE = [{}, { ausbildungsBeginn: '2024-09-01' }, { ausbildungsEnde: '2024-07-31' },
    { ausbildungsBeginn: '2027-09-01' }, { ausbildungsBeginn: '2024-09-01', ausbildungsEnde: '2029-08-31' }];
  for (const stns of KOMBIS) {
    for (const person of PROFILE) {
      const z = PP.druckZeitraum(person, stns, AJ);
      assert.ok(z.von && z.bis && z.bis >= z.von, `degenerierter Zeitraum ${JSON.stringify(z)}`);
      for (const s of stns) {
        assert.ok(PP.barGeom(s, z), `Station ${s.von}..${s.bis} fehlt in ${JSON.stringify(z)}`);
      }
      const h = PP.renderTabelleHtml({ ...z, stand: AJ.heute,
        personen: [{ name: 'A', beruf: 'B', stationen: stns }] });
      const zeilen = (h.match(/<td>X<\/td>/g) || []).length;
      assert.equal(zeilen, stns.length,
        `nur ${zeilen} von ${stns.length} Stationen gedruckt (${JSON.stringify(z)})`);
      assert.doesNotMatch(h, /keine Zuweisung im Zeitraum/);
    }
  }
});

test('druckZeitraum: defensive Aufrufe stuerzen nicht ab', () => {
  assert.deepEqual(PP.druckZeitraum(null, null, AJ), { von: '2025-09-01', bis: '2026-08-31' });
  // Ganz ohne Fenster bleibt nur ein leerer Zeitraum — der Builder sagt das
  // dann auch ("Zeitraum fehlt"), statt etwas zu behaupten.
  assert.deepEqual(PP.druckZeitraum(null, null, null), { von: '', bis: '' });
});

// Kurzform fuer die Faelle mit leerem Profil.
function PlanerPrintZ(stationen) { return PP.druckZeitraum({}, stationen, AJ); }
