'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('./durchlauf-report.js');

/* Der Report-Builder muss in Node ladbar bleiben: DB/Toast/Modal und window
   werden ausschliesslich INNERHALB von erstellen() angefasst. Bricht das,
   scheitert schon das require() oben — dieser Test ist damit auch der
   Waechter fuer diese Randbedingung. */

const FONTS = { franklinBold: 'fb.ttf', franklinLight: 'fl.ttf', openSans: 'os.ttf' };

function station(over) {
  return {
    id: 1, abteilung: 'Einkauf', von: '2026-01-01', bis: '2026-02-28',
    verantwName: 'Eins, Erik', verantwEmail: 'e@x.de', beurteilung: null, ...over,
  };
}
function gross(note, punkte, text, status = 'abgeschlossen') {
  return { id: 9, status, typ: 'gross', note, gesamtPunkte: punkte,
    abgeschlossenAm: '2026-03-01', individuelleBeurteilung: text,
    kurzfeedbackEindruck: null, kurzfeedbackEmpfehlung: null };
}
function kurz(eindruck, empfehlung, status = 'abgeschlossen') {
  return { id: 8, status, typ: 'kurz', note: null, gesamtPunkte: null,
    abgeschlossenAm: '2026-03-01', individuelleBeurteilung: null,
    kurzfeedbackEindruck: eindruck, kurzfeedbackEmpfehlung: empfehlung };
}
function ctxMit(azubis, over) {
  return {
    von: '2025-09-01', bis: '2026-08-31', stand: '2026-03-15',
    erstelltVon: 'Admin Verwaltung', logo: '', fonts: FONTS, azubis, ...over,
  };
}

/* ── 1. kuerzen ───────────────────────────────────────────────────── */

test('kuerzen: kurzer Text bleibt unveraendert und bekommt keine Ellipse', () => {
  assert.equal(D.kuerzen('Alles gut gelaufen.'), 'Alles gut gelaufen.');
});

test('kuerzen: null/undefined/leer werden zu einem leeren String', () => {
  assert.equal(D.kuerzen(null), '');
  assert.equal(D.kuerzen(undefined), '');
  assert.equal(D.kuerzen('   '), '');
});

test('kuerzen: zieht Whitespace zusammen (Zeilenumbrueche zerreissen sonst die Zelle)', () => {
  assert.equal(D.kuerzen('Zeile eins\n\n  Zeile zwei'), 'Zeile eins Zeile zwei');
});

test('kuerzen: schneidet an der Wortgrenze und haengt eine Ellipse an', () => {
  const lang = 'abcdef '.repeat(60).trim();     // 419 Zeichen
  const k = D.kuerzen(lang, 200);
  assert.ok(k.length <= 201, `zu lang: ${k.length}`);
  assert.ok(k.endsWith('…'), k.slice(-10));
  // Wortgrenze: kein halbes Wort direkt vor der Ellipse.
  assert.ok(/(abcdef|\s)…$/.test(k), k.slice(-12));
});

test('kuerzen: eigenes Maximum wird beachtet (Empfehlung = 100)', () => {
  const k = D.kuerzen('x '.repeat(200), 100);
  assert.ok(k.length <= 101);
  assert.ok(k.endsWith('…'));
});

/* ── 2. fmtNote / fmtSchnitt ──────────────────────────────────────── */

test('fmtNote: eine Nachkommastelle mit deutschem Komma', () => {
  assert.equal(D.fmtNote(2.3), '2,3');
  assert.equal(D.fmtNote(1), '1,0');
  assert.equal(D.fmtNote(null), '–');
  assert.equal(D.fmtNote(undefined), '–');
});

test('fmtSchnitt: zwei Nachkommastellen mit deutschem Komma', () => {
  assert.equal(D.fmtSchnitt(2.333333), '2,33');
  assert.equal(D.fmtSchnitt(2), '2,00');
  assert.equal(D.fmtSchnitt(null), '–');
});

/* ── 3. berechneKennzahlen ────────────────────────────────────────── */

test('berechneKennzahlen: Durchschnitt nur ueber abgeschlossene gross-Beurteilungen mit Note', () => {
  const stationen = [
    station({ id: 1, beurteilung: gross(2.0, 82, 'gut') }),
    station({ id: 2, beurteilung: gross(3.0, 60, 'ok') }),
    station({ id: 3, beurteilung: kurz('passt', 'weiter so') }),          // kurz: keine Note
    station({ id: 4, beurteilung: gross(null, null, null, 'entwurf') }),  // Entwurf: zaehlt nicht
    station({ id: 5, beurteilung: gross(null, null, 'ohne Note') }),      // Note NULL trotz Abschluss
    station({ id: 6 }),                                                    // gar keine Beurteilung
  ];
  const k = D.berechneKennzahlen(stationen, '2026-03-15');
  assert.equal(k.anzahl, 6);
  assert.equal(k.beurteilt, 4);                 // 1,2,3,5 sind abgeschlossen
  assert.equal(k.notenDurchschnitt, 2.5);       // nur 2,0 und 3,0
});

test('berechneKennzahlen: offen zaehlt beendete Stationen ohne Abschluss, nicht die laufende', () => {
  const stationen = [
    station({ id: 1, von: '2025-09-01', bis: '2025-10-31', beurteilung: null }),                       // beendet, offen
    station({ id: 2, von: '2025-11-01', bis: '2025-12-31', beurteilung: gross(null, null, null, 'entwurf') }), // beendet, Entwurf -> offen
    station({ id: 3, von: '2026-01-01', bis: '2026-06-30', beurteilung: null }),                       // laeuft noch
    station({ id: 4, von: '2026-02-01', bis: null, beurteilung: null }),                               // offenes Ende
    station({ id: 5, von: '2025-09-01', bis: '2025-10-31', beurteilung: gross(2.0, 80, 'gut') }),      // beendet, fertig
  ];
  const k = D.berechneKennzahlen(stationen, '2026-03-15');
  assert.equal(k.offen, 2);
});

test('berechneKennzahlen: leere Liste liefert Nullen und keinen Durchschnitt', () => {
  const k = D.berechneKennzahlen([], '2026-03-15');
  assert.deepEqual(k, { anzahl: 0, beurteilt: 0, notenDurchschnitt: null, offen: 0 });
});

/* ── 4. beurteilungZelle ──────────────────────────────────────────── */

test('beurteilungZelle: Entwurf zeigt "offen (Entwurf)" und KEINEN Text', () => {
  const s = station({ beurteilung: { ...gross(2.0, 80, 'Geheimer Entwurfstext'), status: 'entwurf' } });
  const html = D.beurteilungZelle(s, '2026-03-15');
  assert.match(html, /offen \(Entwurf\)/);
  assert.equal(/Geheimer Entwurfstext/.test(html), false, 'Entwurfstext ist im Report gelandet');
  assert.equal(/Note/.test(html), false);
});

test('beurteilungZelle: gross zeigt Note, Punkte und den individuellen Text', () => {
  const html = D.beurteilungZelle(station({ beurteilung: gross(2.3, 78, 'Arbeitet selbststaendig.') }), '2026-03-15');
  assert.match(html, /Note 2,3/);
  assert.match(html, /78\/100/);
  assert.match(html, /Arbeitet selbststaendig\./);
});

test('beurteilungZelle: gross ohne Note (Altbestand) zeigt "Note –" statt einer erfundenen Zahl', () => {
  const html = D.beurteilungZelle(station({ beurteilung: gross(null, null, 'Text da') }), '2026-03-15');
  assert.match(html, /Note –/);
  assert.equal(/\/100/.test(html), false);
});

test('beurteilungZelle: kurz zeigt Gesamteindruck und die Empfehlung mit Label', () => {
  const html = D.beurteilungZelle(station({ beurteilung: kurz('Guter Eindruck.', 'Weiter im Einkauf.') }), '2026-03-15');
  assert.match(html, /Guter Eindruck\./);
  assert.match(html, /Empfehlung:/);
  assert.match(html, /Weiter im Einkauf\./);
  assert.equal(/Note/.test(html), false, 'kurz hat keine Note');
});

test('beurteilungZelle: ohne Beurteilung – laufend "–", beendet "offen"', () => {
  const laufend = D.beurteilungZelle(station({ von: '2026-03-01', bis: '2026-06-30' }), '2026-03-15');
  assert.match(laufend, /–/);
  assert.equal(/offen/.test(laufend), false);

  const beendet = D.beurteilungZelle(station({ von: '2025-09-01', bis: '2025-10-31' }), '2026-03-15');
  assert.match(beendet, /offen/);
});

/* ── 5. ueberlappt (Regel wie barGeom) ───────────────────────────── */

test('ueberlappt: Regel wie barGeom (Rand, offenes Ende, ueberspannend)', () => {
  const r = { von: '2026-01-01', bis: '2026-06-30' };
  assert.equal(D.ueberlappt(station({ von: '2025-01-01', bis: '2025-12-31' }), r), false, 'endet vorher');
  assert.equal(D.ueberlappt(station({ von: '2026-07-01', bis: '2026-08-31' }), r), false, 'beginnt danach');
  assert.equal(D.ueberlappt(station({ von: '2026-02-01', bis: '2026-03-01' }), r), true, 'ganz innen');
  assert.equal(D.ueberlappt(station({ von: '2025-01-01', bis: '2027-01-01' }), r), true, 'ueberspannt');
  assert.equal(D.ueberlappt(station({ von: '2025-01-01', bis: null }), r), true, 'offenes Ende laeuft hinein');
  assert.equal(D.ueberlappt(station({ von: '2026-06-30', bis: '2026-06-30' }), r), true, 'letzter Tag zaehlt');
  assert.equal(D.ueberlappt(station({ von: '2025-12-31', bis: '2025-12-31' }), r), false, 'Tag vor dem Zeitraum');
});

/* ── 6. renderReportHtml: Blaetter, Kopf, Zeitraumfilter ─────────── */

const DREI = [
  { oid: 'a', name: 'Lena Müller', beruf: 'Industriekauffrau', department: 'Kaufmännische Ausbildung',
    ausbildungsBeginn: '2024-09-01', ausbildungsEnde: '2027-08-31', foto: null,
    stationen: [station({ id: 1, von: '2025-10-01', bis: '2025-12-31', beurteilung: gross(2.0, 82, 'gut') })] },
  { oid: 'b', name: 'Jonas Becker', beruf: 'Mechatroniker', department: null,
    ausbildungsBeginn: null, ausbildungsEnde: null, foto: null, stationen: [] },
  { oid: 'c', name: 'Jana Hofer', beruf: 'DH Maschinenbau', department: 'DH-Student',
    ausbildungsBeginn: '2025-10-01', ausbildungsEnde: '2028-09-30', foto: null,
    stationen: [
      station({ id: 2, von: '2026-01-01', bis: '2026-02-28', beurteilung: kurz('passt', 'weiter') }),
      station({ id: 3, abteilung: 'Weit weg', von: '2019-01-01', bis: '2019-06-30' }),   // ausserhalb
    ] },
];

test('renderReportHtml: je Azubi ein Blatt, nur das erste ist sheet--first', () => {
  const html = D.renderReportHtml(ctxMit(DREI));
  assert.equal((html.match(/class="sheet/g) || []).length, 3);
  assert.equal((html.match(/class="sheet sheet--first"/g) || []).length, 1);
  // Das erste Blatt gehoert zur ersten Person der Liste.
  assert.ok(html.indexOf('sheet--first') < html.indexOf('Jonas Becker'));
});

test('renderReportHtml: Kopfzeile nennt Titel, Personenzahl, Stand und Ersteller', () => {
  const html = D.renderReportHtml(ctxMit(DREI));
  assert.match(html, /Abteilungsdurchlauf-Report/);
  assert.match(html, /3 Personen/);
  assert.match(html, /Stand 15\.03\.2026/);
  assert.match(html, /erstellt von Admin Verwaltung/);
  assert.match(html, /01\.09\.2025 – 31\.08\.2026/);
});

test('renderReportHtml: eine Person heisst "1 Person", nicht "1 Personen"', () => {
  const html = D.renderReportHtml(ctxMit([DREI[0]]));
  assert.match(html, /1 Person /);
});

test('renderReportHtml: Stationen ausserhalb des Zeitraums stehen nicht auf dem Blatt', () => {
  const html = D.renderReportHtml(ctxMit(DREI));
  assert.equal(/Weit weg/.test(html), false, 'Station ausserhalb des Zeitraums wurde gedruckt');
  assert.match(html, /Einkauf/);
});

test('renderReportHtml: Azubi ohne Station bekommt einen Leerzustand statt einer leeren Tabelle', () => {
  const html = D.renderReportHtml(ctxMit([DREI[1]]));
  assert.match(html, /keine Zuweisung im Zeitraum/i);
});

test('renderReportHtml: Tabellenkopf und CD-Fussleiste sind angelegt (Wiederholung je Druckseite)', () => {
  const html = D.renderReportHtml(ctxMit(DREI));
  assert.match(html, /<thead>/);
  assert.match(html, /Verantwortlich/);
  assert.match(html, /tfoot class="pm-footer"/);
  assert.match(html, /#FFC300/);
  assert.match(html, /#53565A/);
  // Print-Dokumente laden kein App-CSS: keine CSS-Variablen der App.
  assert.equal(/var\(--/.test(html), false, 'App-CSS-Variable im Druckdokument');
  assert.match(html, /@page\s*\{\s*size:\s*A4/);
  assert.match(html, /break-before:\s*page/);
});

/* ── 7. Escaping ─────────────────────────────────────────────────── */

test('renderReportHtml: Namen mit HTML werden escaped (Stammdaten und Verantwortlich-Zelle)', () => {
  const boese = [{
    oid: 'x', name: '<b>X</b> & "Y"', beruf: '<i>Beruf</i>', department: null,
    ausbildungsBeginn: null, ausbildungsEnde: null, foto: null,
    stationen: [station({ verantwName: '<script>alert(1)</script>', beurteilung: gross(2.0, 80, '<img src=x>') })],
  }];
  const html = D.renderReportHtml(ctxMit(boese));
  assert.equal(/<b>X<\/b>/.test(html), false);
  assert.match(html, /&lt;b&gt;X&lt;\/b&gt; &amp; &quot;Y&quot;/);
  assert.equal(/<script>alert/.test(html), false);
  assert.equal(/<img src=x>/.test(html), false);
  assert.match(html, /&lt;i&gt;Beruf&lt;\/i&gt;/);
});

/* ── 8. Foto vs. Initialen ───────────────────────────────────────── */

test('renderReportHtml: ohne Foto stehen Initialen, kein img', () => {
  const html = D.renderReportHtml(ctxMit([DREI[0]]));
  assert.equal(/<img/.test(html.replace(/<img class="logo"[^>]*>/g, '')), false, 'unerwartetes Bild ohne Foto');
  assert.match(html, /LM/);   // Lena Müller
});

test('renderReportHtml: mit Foto wird das Data-URI-Bild eingebettet', () => {
  const mitFoto = [{ ...DREI[0], foto: 'data:image/png;base64,AAA' }];
  const html = D.renderReportHtml(ctxMit(mitFoto));
  assert.match(html, /<img[^>]+src="data:image\/png;base64,AAA"/);
});

test('initialen: Vor- und Nachname-Initiale, auch aus dem DB-Format', () => {
  assert.equal(D.initialen('Lena Müller'), 'LM');
  assert.equal(D.initialen('Kuniß, Florian'), 'FK');
  assert.equal(D.initialen(''), '');
});

/* ── 9. Degenerierter Zeitraum ───────────────────────────────────── */

test('renderReportHtml: Bis vor Von liefert einen Hinweis und KEIN Blatt', () => {
  const html = D.renderReportHtml(ctxMit(DREI, { von: '2026-08-31', bis: '2026-01-01' }));
  assert.equal((html.match(/class="sheet/g) || []).length, 0);
  assert.match(html, /Zeitraum ungültig/);
  assert.equal(/Lena Müller/.test(html), false);
});

test('renderReportHtml: leeres Von/Bis nennt den echten Grund, nicht "Ende vor Beginn"', () => {
  const html = D.renderReportHtml(ctxMit(DREI, { von: '', bis: '' }));
  assert.match(html, /Zeitraum fehlt/);
  assert.equal((html.match(/class="sheet/g) || []).length, 0);
});
