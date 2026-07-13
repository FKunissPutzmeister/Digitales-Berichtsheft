'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('./ihk-parser.js');

const B = '\x02', E = '\x03';
const wByKw = (res, kw) => res.wochen.find(w => w.kw === kw);

// ── Format-Helfer ──────────────────────────────────────────────
test('classifyFontName erkennt Bold/Italic/Normal', () => {
  assert.deepEqual(P.classifyFontName('EAAAAA+LiberationSans-Bold'),   { bold: true,  italic: false });
  assert.deepEqual(P.classifyFontName('EAAAAC+LiberationSans-Italic'), { bold: false, italic: true });
  assert.deepEqual(P.classifyFontName('EAAAAB+LiberationSans'),        { bold: false, italic: false });
  assert.deepEqual(P.classifyFontName(''),                             { bold: false, italic: false });
});

test('assembleLine sortiert nach x und setzt Flag-Marker', () => {
  const line = P.assembleLine([
    { x: 100, str: 'ERM',       bold: false, italic: false, underline: false },
    { x: 10,  str: 'Software:', bold: true,  italic: false, underline: false },
  ]);
  assert.equal(line, B + '1Software:' + E + ' ERM');
});

test('assembleLine kombiniert Flags (fett+unterstrichen = 5)', () => {
  assert.equal(
    P.assembleLine([{ x: 0, str: 'Dienstag:', bold: true, italic: false, underline: true }]),
    B + '5Dienstag:' + E
  );
});

test('linesToHtml löst Flags zu verschachtelten Tags auf und escaped', () => {
  assert.equal(P.linesToHtml([B + '5Dienstag:' + E + ' normal']),
    '<p><strong><u>Dienstag:</u></strong> normal</p>');
  assert.equal(P.linesToHtml([B + '1GK:' + E + ' <Sach>']),
    '<p><strong>GK:</strong> &lt;Sach&gt;</p>');
  assert.equal(P.linesToHtml([]), '');
});

// ── Unterstreichungs-Geometrie ─────────────────────────────────
const OPS = { save:10, restore:11, transform:12, constructPath:91,
  moveTo:13, lineTo:14, curveTo:15, rectangle:19,
  fill:22, eoFill:23, stroke:20, closeStroke:21, endPath:28 };

test('decodeUnderlineSegments findet dünnes gefülltes Rechteck', () => {
  const segs = P.decodeUnderlineSegments(
    [OPS.constructPath, OPS.fill],
    [ [ [OPS.rectangle], [69, 565.7, 45, 0.3] ], null ], OPS);
  assert.equal(segs.length, 1);
  assert.ok(Math.abs(segs[0].y - 565.85) < 0.2);
  assert.equal(Math.round(segs[0].x0), 69);
  assert.equal(Math.round(segs[0].x1), 114);
});

test('decodeUnderlineSegments ignoriert gestrichene Pfade', () => {
  assert.equal(P.decodeUnderlineSegments(
    [OPS.constructPath, OPS.stroke],
    [ [ [OPS.rectangle], [57, 736, 241, 0] ], null ], OPS).length, 0);
});

test('decodeUnderlineSegments ignoriert hohe Rechtecke', () => {
  assert.equal(P.decodeUnderlineSegments(
    [OPS.constructPath, OPS.fill],
    [ [ [OPS.rectangle], [57, 600, 480, 5] ], null ], OPS).length, 0);
});

test('matchUnderline trifft Linie knapp unter Baseline', () => {
  assert.equal(P.matchUnderline({ x0: 69, x1: 114, baseline: 566.9 },
    [{ y: 565.9, x0: 69, x1: 114 }]), true);
});

test('matchUnderline verwirft zu breite Tabellenlinie', () => {
  assert.equal(P.matchUnderline({ x0: 298, x1: 466, baseline: 686.5 },
    [{ y: 684, x0: 298, x1: 539 }]), false);
});

// ── Zellrahmen-Geometrie (Tabellen) ────────────────────────────
test('decodeStrokedBoxes findet gestrichenes Rechteck (rectangle-Op)', () => {
  const boxes = P.decodeStrokedBoxes(
    [OPS.constructPath, OPS.stroke],
    [ [ [OPS.rectangle], [50, 700, 90, 30] ], null ], OPS);
  assert.equal(boxes.length, 1);
  assert.deepEqual(boxes[0], { x0: 50, y0: 700, x1: 140, y1: 730 });
});

test('decodeStrokedBoxes findet Subpfad aus moveTo/lineTo/curveTo (abgerundete Zelle)', () => {
  // Rechteck-ähnlicher Pfad mit Kurvenecken → BBox über alle Punkte
  const boxes = P.decodeStrokedBoxes(
    [OPS.constructPath, OPS.stroke],
    [ [ [OPS.moveTo, OPS.lineTo, OPS.curveTo, OPS.lineTo],
        [55, 700,  135, 700,  140, 700, 140, 705, 140, 710,  140, 730] ], null ], OPS);
  assert.equal(boxes.length, 1);
  assert.equal(boxes[0].x0, 55);
  assert.equal(boxes[0].x1, 140);
  assert.equal(boxes[0].y0, 700);
  assert.equal(boxes[0].y1, 730);
});

test('decodeStrokedBoxes ignoriert Linien (degeneriert) und gefuellte Pfade', () => {
  // 0-hohe gestrichene Linie (Header-Separator) → raus
  assert.equal(P.decodeStrokedBoxes(
    [OPS.constructPath, OPS.stroke],
    [ [ [OPS.rectangle], [57, 736, 241, 0] ], null ], OPS).length, 0);
  // gefuelltes Rechteck (blaue Tagesleiste) → raus
  assert.equal(P.decodeStrokedBoxes(
    [OPS.constructPath, OPS.fill],
    [ [ [OPS.rectangle], [50, 700, 90, 30] ], null ], OPS).length, 0);
  // Seitengrosser Container (w>520) → raus
  assert.equal(P.decodeStrokedBoxes(
    [OPS.constructPath, OPS.stroke],
    [ [ [OPS.rectangle], [30, 100, 540, 700] ], null ], OPS).length, 0);
});

test('decodeStrokedBoxes wendet CTM-Transform an', () => {
  const boxes = P.decodeStrokedBoxes(
    [OPS.transform, OPS.constructPath, OPS.stroke],
    [ [2, 0, 0, 2, 10, 10], [ [OPS.rectangle], [20, 20, 40, 10] ], null ], OPS);
  assert.equal(boxes.length, 1);
  assert.deepEqual(boxes[0], { x0: 50, y0: 50, x1: 130, y1: 70 });
});

// ── Gitter-Clustering ──────────────────────────────────────────
// 2×2-Gitter wie im IHK-Schule-Block: schmale Fach-Spalte, breite
// Inhalts-Spalte, kleine Lücken (≈4–10pt) zwischen den Zellboxen.
const GRID_BOXES = [
  { x0: 50,  y0: 700, x1: 140, y1: 730 },  // Zeile 1, Spalte 1
  { x0: 150, y0: 700, x1: 340, y1: 730 },  // Zeile 1, Spalte 2
  { x0: 50,  y0: 660, x1: 140, y1: 696 },  // Zeile 2, Spalte 1
  { x0: 150, y0: 660, x1: 340, y1: 696 },  // Zeile 2, Spalte 2
];

test('detectTableGrids erkennt 2x2-Gitter (Zeilen top→bottom, Zellen links→rechts)', () => {
  const grids = P.detectTableGrids(GRID_BOXES);
  assert.equal(grids.length, 1);
  const g = grids[0];
  assert.equal(g.rows.length, 2);
  assert.equal(g.rows[0].length, 2);
  assert.equal(g.rows[0][0].x0, 50);   // Zeile 1 = obere (y1=730)
  assert.equal(g.rows[0][0].y1, 730);
  assert.equal(g.rows[1][1].x0, 150);
  assert.deepEqual({ x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1 }, { x0: 50, y0: 660, x1: 340, y1: 730 });
});

test('detectTableGrids ignoriert einspaltige Boxen-Stapel (Tageskarten)', () => {
  assert.equal(P.detectTableGrids([
    { x0: 50, y0: 700, x1: 340, y1: 730 },
    { x0: 50, y0: 660, x1: 340, y1: 696 },
    { x0: 50, y0: 620, x1: 340, y1: 656 },
  ]).length, 0);
});

test('detectTableGrids ignoriert einzeilige Nachbar-Boxen und weit entfernte Boxen', () => {
  assert.equal(P.detectTableGrids([
    { x0: 50,  y0: 700, x1: 140, y1: 730 },
    { x0: 150, y0: 700, x1: 340, y1: 730 },   // nur 1 Zeile
    { x0: 400, y0: 100, x1: 500, y1: 130 },   // isoliert
  ]).length, 0);
});

test('gridContaining trifft nur Punkte INNERHALB von Zellen', () => {
  const grids = P.detectTableGrids(GRID_BOXES);
  assert.ok(P.gridContaining(grids, 60, 710));            // in Zelle (1,1)
  assert.ok(P.gridContaining(grids, 200, 670));           // in Zelle (2,2)
  assert.equal(P.gridContaining(grids, 145, 710), null);  // Lücke zwischen Spalten
  assert.equal(P.gridContaining(grids, 60, 500), null);   // außerhalb
});

// ── State-Machine: Kernbug (Multi-Page + Qualifikationen) ──────
test('mehrseitige Woche: alle 5 Tage trotz Qualifikationen-Block & Seitenumbruch', () => {
  const page1 = [
    'Ausbildungsnachweis auf Wochenbasis',
    'Auszubildende/r',
    'Mustermann, Max',
    'Ausbilder Status',
    'Lengerer, Matthias Eingereicht am 10.02.2025. Von Ausbilder:in Matthias',
    'Lengerer am 27.08.2025 freigegeben.',
    'Ausbildungswoche 06.01.2025 bis 12.01.2025',
    'Schule/Betrieb',
    'Schule:',
    B + '5Dienstag:' + E,
    B + '1GK:' + E + ' Sachmängel',
    'Betrieb:',
    B + '5IT-Abteilung:' + E,
    '-PDF Dateien in SAP einfügen und aussortieren',
    'Mo | 06.01.2025 | Feiertag | abwesend 00:00',
    'Di | 07.01.2025 | Schule | anwesend 07:00',
    '07:00',
    'Qualifikationen:',
    '- Allgemeinbildende Fächer',
    '- Serviceanfragen bearbeiten',
    'Mi | 08.01.2025 | Betrieb | anwesend 07:25',
    '07:25',
    'Seite 7',
  ].join('\n');
  const page2 = [
    'Ausbildungsnachweis auf Wochenbasis',
    'Qualifikationen:',
    '- Betreiben von IT-Systemen',
    'Do | 09.01.2025 | Betrieb | anwesend 07:05',
    '07:05',
    'Qualifikationen:',
    '- Sonstige Qualifikation',
    'Fr | 10.01.2025 | Betrieb | anwesend 07:00',
    '07:00',
    'Dauer gesamt: 28:30',
    'Seite 8',
  ].join('\n');

  const res = P.parse([page1, page2]);
  assert.equal(res.wochen.length, 1);
  const w = res.wochen[0];
  assert.equal(w.kw, 2);
  assert.equal(w.year, 2025);
  assert.equal(w.tage.length, 5);
  const byTag = Object.fromEntries(w.tage.map(t => [t.wochentag, t]));
  assert.equal(byTag.Mo.anwesenheit, 'Feiertag');
  assert.equal(byTag.Di.ort, 'Schule');
  assert.equal(byTag.Di.stunden, 7);
  assert.equal(byTag.Mi.ort, 'Betrieb');
  assert.equal(byTag.Mi.stunden, 7.42);
  assert.equal(byTag.Do.ort, 'Betrieb');
  assert.equal(byTag.Fr.stunden, 7);
  assert.equal(w.status, 'freigegeben');
  // Formatierung durchgereicht:
  assert.match(w.schuleText, /<strong><u>Dienstag:<\/u><\/strong>/);
  assert.match(w.schuleText, /<strong>GK:<\/strong> Sachmängel/);
  assert.match(w.betriebText, /<strong><u>IT-Abteilung:<\/u><\/strong>/);
  assert.match(w.betriebText, /PDF Dateien in SAP/);
});

test('Inhaltsverzeichnis (Gesamtzeitraum) erzeugt keine Schein-Woche', () => {
  const toc = [
    'Inhaltsverzeichnis',
    'Ausbildungswoche 30.12.2024 bis 08.02.2026',
    'Berichtheftswoche Seitenzahl Status Ort',
    '30.12.2024 bis 05.01.2025 6 0 5 Urlaub',
    '06.01.2025 bis 12.01.2025 7 4 1 Schule/Betrieb',
    'Seite 3',
  ].join('\n');
  assert.equal(P.parse([toc]).wochen.length, 0);
});

test('Status wird der richtigen Woche zugeordnet (steht vor dem Marker)', () => {
  const page = [
    'Ausbilder Status',
    'X Eingereicht am 01.01.2025. freigegeben.',
    'Ausbildungswoche 06.01.2025 bis 12.01.2025',
    'Mo | 06.01.2025 | Betrieb | anwesend 08:00',
    'Qualifikationen:',
    '- Irgendwas',
    'Ausbilder Status',
    'Y am 02.02.2025 abgelehnt.',
    'Ausbildungswoche 13.01.2025 bis 19.01.2025',
    'Mo | 13.01.2025 | Betrieb | anwesend 08:00',
  ].join('\n');
  const res = P.parse([page]);
  assert.equal(res.wochen.length, 2);
  assert.equal(wByKw(res, 2).status, 'freigegeben');
  assert.equal(wByKw(res, 3).status, 'abgelehnt');
});

test('Betrieb + Schule am selben Tag → Ort Betrieb/Schule, Stunden summiert', () => {
  const page = [
    'Ausbildungswoche 13.01.2025 bis 19.01.2025',
    'Mo | 13.01.2025 | Betrieb | anwesend 04:00',
    'Mo | 13.01.2025 | Schule | anwesend 04:00',
    'Di | 14.01.2025 | Feiertag | abwesend 00:00',
  ].join('\n');
  const mo = P.parse([page]).wochen[0].tage.find(t => t.wochentag === 'Mo');
  assert.equal(mo.ort, 'Betrieb/Schule');
  assert.equal(mo.stunden, 8);
});

test('Status leakt nicht aus dem Freitext der Vorwoche in die Folgewoche', () => {
  const page = [
    'Ausbildungswoche 06.01.2025 bis 12.01.2025',
    'Betrieb:',
    'Wir haben das Projekt freigegeben und ausgiebig getestet',
    'Mo | 06.01.2025 | Betrieb | anwesend 08:00',
    'Qualifikationen:',
    '- Irgendwas',
    'Ausbildungswoche 13.01.2025 bis 19.01.2025',
    'Mo | 13.01.2025 | Betrieb | anwesend 08:00',
  ].join('\n');
  const res = P.parse([page]);
  assert.equal(res.wochen.length, 2);
  assert.equal(wByKw(res, 2).status, 'offen');
  assert.equal(wByKw(res, 3).status, 'offen'); // KW3 hat keinen Status-Kopf → kein Leak aus KW2-Freitext
});

// ── Tagesbasis-Export (technische Azubis) ──────────────────────
test('detectModus erkennt Tages- vs. Wochenbasis am Seitenkopf', () => {
  assert.equal(P.detectModus(['Ausbildungsnachweis auf Tagesbasis\nfoo']), 'täglich');
  assert.equal(P.detectModus(['Ausbildungsnachweis auf Wochenbasis\nfoo']), 'wöchentlich');
  assert.equal(P.detectModus(['irgendwas']), 'wöchentlich'); // Default
});

test('Tagesbasis: Beschreibung landet pro Tag, Dauer-Zeit & Quali entfernt', () => {
  const page1 = [
    'Ausbildungsnachweis auf Tagesbasis',
    'Auszubildende/r',
    'Merkle, Marius',
    'Ausbilder Status',
    'Rossi, Marco Eingereicht am 01.10.2025. Von Ausbilder:in Marco',
    'Rossi am 26.11.2025 freigegeben.',
    'Ausbildungswoche 01.09.2025 bis 07.09.2025',
    'Mo | 01.09.2025 | Betrieb | anwesend 08:00',
    'Azubi Welcomedays: 08:00',         // Dauer rechts an erster Zeile
    'Hinfahrt nach Tübingen mit dem Fahrrad',
    'Qualifikationen:',
    '- Sonstige Qualifikation',
    'Di | 02.09.2025 | Schule | anwesend 07:00',
    'Erster Tag Berufsschule 07:00',
    'Schulregeln durchgelesen',
    'Qualifikationen:',
    '- Allgemeinbildende Fächer',
    'Mi | 03.09.2025 | Urlaub | abwesend 00:00',
    'Seite 5',
  ].join('\n');
  // Folgewoche: Kopfblock fällt ans Ende des Bodys von KW36 → darf die letzte
  // Tagesbeschreibung NICHT verschmutzen.
  const page2 = [
    'Ausbildungsnachweis auf Tagesbasis',
    'Auszubildende/r',
    'Merkle, Marius',
    'Ausbilder Status',
    'Rossi, Marco Eingereicht am 24.09.2025. freigegeben.',
    'Ausbildungswoche 08.09.2025 bis 14.09.2025',
    'Mo | 08.09.2025 | Betrieb | anwesend 08:00',
    'Hallenpräsentation 08:00',
    'Qualifikationen:',
    '- Sonstige Qualifikation',
    'Dauer gesamt: 37:30',
    'Seite 7',
  ].join('\n');

  const res = P.parse([page1, page2]);
  assert.equal(res.modus, 'täglich');
  assert.equal(res.wochen.length, 2);

  const w1 = res.wochen[0];
  assert.equal(w1.modus, 'täglich');
  assert.equal(w1.tage.length, 3);
  const byD = Object.fromEntries(w1.tage.map(t => [t.datum, t]));

  // Betriebstag: Dauer-Zeit von erster Zeile entfernt, beide Zeilen als <p>.
  assert.equal(byD['2025-09-01'].ort, 'Betrieb');
  assert.equal(byD['2025-09-01'].anwesenheit, 'anwesend');
  assert.match(byD['2025-09-01'].eintragText, /<p>Azubi Welcomedays:<\/p>/);
  assert.match(byD['2025-09-01'].eintragText, /Hinfahrt nach Tübingen/);
  assert.doesNotMatch(byD['2025-09-01'].eintragText, /08:00/);
  assert.doesNotMatch(byD['2025-09-01'].eintragText, /Qualifikation/);

  // Schultag → Schule-Ort, Text vorhanden.
  assert.equal(byD['2025-09-02'].ort, 'Schule');
  assert.match(byD['2025-09-02'].eintragText, /Schulregeln durchgelesen/);

  // Urlaubstag: abwesend, kein Ort, kein Text.
  assert.equal(byD['2025-09-03'].anwesenheit, 'Urlaub');
  assert.equal(byD['2025-09-03'].ort, '');
  assert.equal(byD['2025-09-03'].eintragText, '');

  // Letzter Tag der Woche 1 endet sauber – kein Leak aus dem Kopf der Folgewoche.
  assert.doesNotMatch(byD['2025-09-03'].eintragText, /Auszubildende|Merkle|Ausbilder/);

  // Woche 2 korrekt abgegrenzt.
  const w2 = res.wochen[1];
  assert.equal(w2.tage.length, 1);
  assert.match(w2.tage[0].eintragText, /Hallenpräsentation/);
  assert.doesNotMatch(w2.tage[0].eintragText, /37:30/);
});

test('Tagesbasis: modus-Override greift unabhängig vom Seitenkopf', () => {
  const page = [
    'Ausbildungswoche 01.09.2025 bis 07.09.2025',
    'Mo | 01.09.2025 | Betrieb | anwesend 08:00',
    'Etwas gearbeitet',
    'Qualifikationen:',
    '- Sonstige Qualifikation',
  ].join('\n');
  const res = P.parse([page], { modus: 'täglich' });
  assert.equal(res.wochen[0].modus, 'täglich');
  assert.match(res.wochen[0].tage[0].eintragText, /Etwas gearbeitet/);
});
