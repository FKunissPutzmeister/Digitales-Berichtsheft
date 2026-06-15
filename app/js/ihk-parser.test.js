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
