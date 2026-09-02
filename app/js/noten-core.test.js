'use strict';
// Tests für app/js/noten-core.js — Design-Spec
// docs/superpowers/specs/2026-09-01-noten-zeugnisse-design.md
// Aufruf: node --test app/js/noten-core.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('./noten-core.js');
const B = require('./beurteilung-core.js');

// ── Arten ───────────────────────────────────────────────────────────
test('ARTEN hat genau die sechs vereinbarten Arten', () => {
  assert.deepEqual(N.ARTEN.map(a => a.id), [
    'klassenarbeit', 'zwischenpruefung', 'abschlusspruefung',
    'semesterpruefung', 'zeugnis', 'sonstiges',
  ]);
  N.ARTEN.forEach(a => {
    assert.equal(typeof a.label, 'string', `${a.id} braucht ein Label`);
    assert.ok(a.label.length > 0, `${a.id} braucht ein Label`);
  });
});

test('Mitteilung geht nur bei Zeugnis und Prüfungen raus', () => {
  const mit = N.ARTEN.filter(a => a.mitteilung).map(a => a.id).sort();
  assert.deepEqual(mit, ['abschlusspruefung', 'semesterpruefung', 'zeugnis', 'zwischenpruefung']);
  // ARTEN_MIT_MITTEILUNG muss dieselbe Wahrheit sein - das Backend liest sie.
  assert.deepEqual([...N.ARTEN_MIT_MITTEILUNG].sort(), mit);
  assert.equal(N.ARTEN_MIT_MITTEILUNG.has('klassenarbeit'), false);
  assert.equal(N.ARTEN_MIT_MITTEILUNG.has('sonstiges'), false);
});

test('Punktefeld nur bei Prüfungen, Note überall', () => {
  const mitPunkten = N.ARTEN.filter(a => a.zeigtPunkte).map(a => a.id).sort();
  assert.deepEqual(mitPunkten, ['abschlusspruefung', 'semesterpruefung', 'zwischenpruefung']);
  N.ARTEN.forEach(a => assert.equal(a.zeigtNote, true, `${a.id} muss eine Note erlauben`));
});

test('artById kennt nur die Whitelist', () => {
  assert.equal(N.artById('zeugnis').label, 'Zeugnis');
  assert.equal(N.artById('mündliche_prüfung'), null);
  assert.equal(N.artById(''), null);
  assert.equal(N.artById(null), null);
});

// ── Noteneingabe ────────────────────────────────────────────────────
test('parseNote versteht deutsche Komma-Eingabe', () => {
  assert.equal(N.parseNote('2,3'), 2.3);
  assert.equal(N.parseNote('2.3'), 2.3);
  assert.equal(N.parseNote(' 2,3 '), 2.3);
  assert.equal(N.parseNote('1'), 1);
  assert.equal(N.parseNote('6'), 6);
  assert.equal(N.parseNote(2.3), 2.3);
  assert.equal(N.parseNote('2,346'), 2.35); // auf zwei Stellen gerundet
  assert.equal(N.parseNote('2,344'), 2.34);
});

test('parseNote weist alles außerhalb 1,0-6,0 ab', () => {
  assert.equal(N.parseNote('0,9'), null);
  assert.equal(N.parseNote('6,1'), null);
  assert.equal(N.parseNote('0'), null);
  assert.equal(N.parseNote('-2'), null);
  assert.equal(N.parseNote(''), null);
  assert.equal(N.parseNote('   '), null);
  assert.equal(N.parseNote('abc'), null);
  assert.equal(N.parseNote('2,3 gut'), null);
  assert.equal(N.parseNote(null), null);
  assert.equal(N.parseNote(undefined), null);
  assert.equal(N.parseNote(NaN), null);
});

test('formatNote gibt deutsche Schreibweise mit einer Nachkommastelle', () => {
  assert.equal(N.formatNote(2.3), '2,3');
  assert.equal(N.formatNote(1), '1,0');
  assert.equal(N.formatNote(2.35), '2,35');
  assert.equal(N.formatNote(null), '–');
  assert.equal(N.formatNote(undefined), '–');
});

test('parsePunkte akzeptiert 0-100 und halbe Punkte', () => {
  assert.equal(N.parsePunkte('87'), 87);
  assert.equal(N.parsePunkte(0), 0);
  assert.equal(N.parsePunkte('100'), 100);
  // Halbe Punkte, weil die DUALIS-Tabelle auf dem 0,5-Raster liegt.
  assert.equal(N.parsePunkte('87,5'), 87.5);
  assert.equal(N.parsePunkte('87.5'), 87.5);
  assert.equal(N.parsePunkte('101'), null);
  assert.equal(N.parsePunkte('-1'), null);
  assert.equal(N.parsePunkte('87,25'), null); // feiner als halbe Punkte
  assert.equal(N.parsePunkte(''), null);
  assert.equal(N.parsePunkte(null), null);
});

test('formatPunkte zeigt halbe Punkte deutsch, ganze ohne Nachkomma', () => {
  assert.equal(N.formatPunkte(87), '87');
  assert.equal(N.formatPunkte(87.5), '87,5');
  assert.equal(N.formatPunkte(0), '0');
  assert.equal(N.formatPunkte(null), '–');
});

test('parsePunkte hebt die Grenze mit der Maximalpunktzahl an', () => {
  assert.equal(N.parsePunkte('150', 180), 150);
  assert.equal(N.parsePunkte('177,5', 180), 177.5);
  assert.equal(N.parsePunkte('181', 180), null);
  // Ohne Maximum bleibt die IHK-Grenze 100 in Kraft.
  assert.equal(N.parsePunkte('150'), null);
});

// ── Punkte -> Note ──────────────────────────────────────────────────
test('noteAusPunkten folgt exakt dem IHK-Schlüssel aus beurteilung-core', () => {
  // Gegen PUNKTE_ZU_NOTE gegengeprüft, nicht hart kodiert: wenn der
  // Schlüssel im Beurteilungsbogen korrigiert wird, zieht das hier mit.
  for (let p = 0; p <= 100; p++) {
    assert.equal(N.noteAusPunkten(p), B.PUNKTE_ZU_NOTE[p], `Punkte ${p}`);
  }
  assert.equal(N.noteAusPunkten(100), 1.0);
  assert.equal(N.noteAusPunkten(92), 1.4);
  assert.equal(N.noteAusPunkten(50), 4.4);
});

test('noteAusPunkten weist unbrauchbare Punkte ab statt zu klemmen', () => {
  // Bewusst anders als Beurteilung.clampPunkte: dort ist ein Formularfeld
  // die Quelle, hier eine freie Eingabe - stillschweigend auf 0 oder 100
  // zu klemmen würde eine falsche Note erzeugen.
  assert.equal(N.noteAusPunkten(101), null);
  assert.equal(N.noteAusPunkten(-1), null);
  assert.equal(N.noteAusPunkten(null), null);
  assert.equal(N.noteAusPunkten(''), null);
  assert.equal(N.noteAusPunkten('abc'), null);
});

test('IHK-Umrechnung nimmt keine halben Punkte', () => {
  // Der IHK-Schlüssel ist auf ganze Punkte indiziert; ein versehentliches
  // "87,5" darf keine erfundene Note ergeben.
  assert.equal(N.noteAusPunkten(87.5), null);
  assert.equal(N.noteAusPunkten('87,5'), null);
});

// ── DHBW / DUALIS ───────────────────────────────────────────────────
test('DHBW kennt genau die sechs Maximalpunktzahlen der DUALIS-Tabelle', () => {
  assert.deepEqual(N.DHBW_MAXPUNKTE, [60, 90, 100, 120, 150, 180]);
  assert.deepEqual(Object.keys(N.DHBW_SKALEN).map(Number).sort((a, b) => a - b), N.DHBW_MAXPUNKTE);
  assert.equal(N.istDhbwMax(120), true);
  assert.equal(N.istDhbwMax('120'), true);
  assert.equal(N.istDhbwMax(110), false);
  assert.equal(N.istDhbwMax(null), false);
});

test('jede DHBW-Skala hat die Notenfolge 1,0 bis 5,0 in 0,1-Schritten', () => {
  const erwartet = Array.from({ length: 41 }, (_, i) => Math.round((1 + i * 0.1) * 10) / 10);
  for (const max of N.DHBW_MAXPUNKTE) {
    const noten = N.DHBW_SKALEN[max].map(p => p[1]).slice().sort((a, b) => a - b);
    assert.deepEqual(noten, erwartet, `max ${max}`);
  }
});

test('DHBW-Schwellen fallen streng und liegen auf dem 0,5-Raster', () => {
  for (const max of N.DHBW_MAXPUNKTE) {
    const skala = N.DHBW_SKALEN[max];
    for (let i = 1; i < skala.length; i++) {
      assert.ok(skala[i][0] < skala[i - 1][0], `max ${max}: Schwelle ${skala[i][0]} nicht kleiner als ${skala[i - 1][0]}`);
      assert.ok(skala[i][1] > skala[i - 1][1], `max ${max}: Note ${skala[i][1]} nicht größer als ${skala[i - 1][1]}`);
    }
    skala.forEach(([ab]) => assert.equal(ab * 2, Math.round(ab * 2), `max ${max}: ${ab} nicht auf 0,5-Raster`));
    // Auffangfall: unterhalb der letzten Schwelle ist alles 5,0.
    assert.deepEqual(skala[skala.length - 1], [0, 5.0], `max ${max}`);
  }
});

test('DHBW-Ankerpunkte der Tabelle: 4,0 bei max/2, 5,0-Grenze bei max/3', () => {
  // Die beiden Sonderzeilen der DUALIS-Tabelle. Sie sind die einzige
  // unabhängige Kontrolle, dass die Spalten nicht verrutscht sind.
  for (const max of N.DHBW_MAXPUNKTE) {
    assert.equal(N.noteAusPunktenDhbw(max / 2, max), 4.0, `max ${max}: max/2 muss 4,0 sein`);
    assert.equal(N.noteAusPunktenDhbw(Math.floor(max / 3), max), 5.0, `max ${max}: max/3 muss 5,0 sein`);
    assert.equal(N.noteAusPunktenDhbw(max, max), 1.0, `max ${max}: volle Punktzahl muss 1,0 sein`);
    assert.equal(N.noteAusPunktenDhbw(0, max), 5.0, `max ${max}: 0 Punkte muss 5,0 sein`);
  }
});

test('DHBW-Stützstellen aus dem PDF (Spalte 100)', () => {
  // Direkt aus DUALIS_Punkte-Noten-Tabelle_2022.pdf abgelesene Zeilen.
  assert.equal(N.noteAusPunktenDhbw(100, 100), 1.0);
  assert.equal(N.noteAusPunktenDhbw(98.5, 100), 1.0);
  assert.equal(N.noteAusPunktenDhbw(98, 100), 1.1);   // nächste Zeile: 98 – 97
  assert.equal(N.noteAusPunktenDhbw(97, 100), 1.1);
  assert.equal(N.noteAusPunktenDhbw(96.5, 100), 1.2);
  assert.equal(N.noteAusPunktenDhbw(83, 100), 2.0);   // Zeile 83 – 82
  assert.equal(N.noteAusPunktenDhbw(82, 100), 2.0);
  assert.equal(N.noteAusPunktenDhbw(81.5, 100), 2.1);
  assert.equal(N.noteAusPunktenDhbw(50, 100), 4.0);
  assert.equal(N.noteAusPunktenDhbw(49.5, 100), 4.1); // Zeile 49,5 – 47
  assert.equal(N.noteAusPunktenDhbw(33.5, 100), 4.9);
  assert.equal(N.noteAusPunktenDhbw(33, 100), 5.0);
});

test('dieselbe Punktzahl ergibt je Maximum eine andere Note', () => {
  // Der Grund, warum die Maximalpunktzahl am Eintrag gespeichert wird.
  // Jede Zeile gegen die entsprechende PDF-Zeile geprüft.
  assert.equal(N.noteAusPunktenDhbw(60, 60), 1.0);  // "60 – 59,5"
  assert.equal(N.noteAusPunktenDhbw(60, 90), 3.0);  // "60 – 59"
  assert.equal(N.noteAusPunktenDhbw(60, 100), 3.4); // "60 – 58,5"
  assert.equal(N.noteAusPunktenDhbw(60, 120), 4.0); // "60" (= max/2)
  assert.equal(N.noteAusPunktenDhbw(60, 150), 4.6); // "60 – 58"
  assert.equal(N.noteAusPunktenDhbw(60, 180), 5.0); // "X – 60"
});

test('DHBW ohne gültige Maximalpunktzahl rechnet nicht', () => {
  assert.equal(N.noteAusPunkten(80, { dh: true }), null);            // Maximum fehlt
  assert.equal(N.noteAusPunkten(80, { dh: true, maxPunkte: 110 }), null); // kein DUALIS-Wert
  assert.equal(N.noteAusPunkten(181, { dh: true, maxPunkte: 180 }), null); // über dem Maximum
  assert.equal(N.noteAusPunkten('', { dh: true, maxPunkte: 100 }), null);
  assert.equal(N.noteAusPunkten(80, { dh: true, maxPunkte: 100 }), 2.2);
});

// ── Durchschnitte ───────────────────────────────────────────────────
test('ordnerSchnitt ignoriert Einträge ohne Note', () => {
  const eintraege = [{ note: 1 }, { note: 2 }, { note: null }, { note: undefined }, {}];
  assert.equal(N.ordnerSchnitt(eintraege), 1.5);
  assert.equal(N.anzahlMitNote(eintraege), 2);
});

test('ordnerSchnitt liefert null ohne einzige Note', () => {
  assert.equal(N.ordnerSchnitt([]), null);
  assert.equal(N.ordnerSchnitt([{ note: null }]), null);
  assert.equal(N.ordnerSchnitt(null), null);
  assert.equal(N.ordnerSchnitt(undefined), null);
  assert.equal(N.anzahlMitNote([]), 0);
  assert.equal(N.anzahlMitNote(null), 0);
});

test('ordnerSchnitt rundet auf zwei Nachkommastellen', () => {
  assert.equal(N.ordnerSchnitt([{ note: 1 }, { note: 2 }, { note: 2 }]), 1.67);
});

// ── Belege ──────────────────────────────────────────────────────────
test('Beleg-Allowlist deckt Scans, Fotos und iOS-HEIC ab', () => {
  assert.deepEqual([...N.ERLAUBTE_ENDUNGEN].sort(),
    ['gif', 'heic', 'heif', 'jpeg', 'jpg', 'pdf', 'png', 'webp']);
  assert.equal(N.MAX_BELEG_BYTES, 10 * 1024 * 1024);
  assert.equal(N.endungErlaubt('zeugnis.PDF'), true);
  assert.equal(N.endungErlaubt('foto.HEIC'), true);
  assert.equal(N.endungErlaubt('noten.xlsx'), false);
  assert.equal(N.endungErlaubt('ohne-endung'), false);
  assert.equal(N.endungErlaubt(''), false);
  assert.equal(N.endungErlaubt(null), false);
});

test('HEIC ist nicht vorschaufähig, alles andere Bildliche schon', () => {
  // Edge/Chrome können HEIC nicht dekodieren - die Kachel zeigt dann statt
  // einer kaputten Vorschau den Download-Hinweis.
  assert.equal(N.istBildVorschau('foto.jpg'), true);
  assert.equal(N.istBildVorschau('bild.PNG'), true);
  assert.equal(N.istBildVorschau('foto.heic'), false);
  assert.equal(N.istBildVorschau('foto.heif'), false);
  assert.equal(N.istBildVorschau('zeugnis.pdf'), false);
});

test('formatBytes bleibt lesbar', () => {
  assert.equal(N.formatBytes(0), '0 B');
  assert.equal(N.formatBytes(512), '512 B');
  assert.equal(N.formatBytes(2048), '2,0 KB');
  assert.equal(N.formatBytes(3 * 1024 * 1024), '3,0 MB');
});

// ── Eintrags-Validierung (eine Wahrheit für Frontend und Backend) ────
test('pruefeEintrag lässt einen vollständigen Eintrag durch', () => {
  assert.equal(N.pruefeEintrag({
    titel: 'Vokabeltest', art: 'klassenarbeit', datum: '2026-03-14',
    note: 2.3, abschnittTyp: 'ausbildungsjahr', abschnittNr: 2,
  }), null);
  // Note und Punkte sind optional - ein Beleg allein darf reichen.
  assert.equal(N.pruefeEintrag({ titel: 'Zeugnis', art: 'zeugnis', datum: '2026-07-24' }), null);
});

test('pruefeEintrag meldet fehlende Pflichtfelder im Klartext', () => {
  assert.match(N.pruefeEintrag({ art: 'zeugnis', datum: '2026-07-24' }), /Titel/);
  assert.match(N.pruefeEintrag({ titel: '   ', art: 'zeugnis', datum: '2026-07-24' }), /Titel/);
  assert.match(N.pruefeEintrag({ titel: 'X', datum: '2026-07-24' }), /Art/);
  assert.match(N.pruefeEintrag({ titel: 'X', art: 'quiz', datum: '2026-07-24' }), /Art/);
  assert.match(N.pruefeEintrag({ titel: 'X', art: 'zeugnis' }), /Datum/);
});

test('pruefeEintrag prüft das Datum nur grob auf Plausibilität', () => {
  // Zeugnisse können älter als der Ausbildungsvertrag sein - deshalb keine
  // Kopplung an AusbildungBeginn, nur eine weite Spanne.
  const gut = { titel: 'X', art: 'zeugnis' };
  assert.equal(N.pruefeEintrag({ ...gut, datum: '2015-01-01' }), null);
  assert.match(N.pruefeEintrag({ ...gut, datum: '2014-12-31' }), /Datum/);
  assert.match(N.pruefeEintrag({ ...gut, datum: '14.03.2026' }), /Datum/);
  assert.match(N.pruefeEintrag({ ...gut, datum: '2026-13-01' }), /Datum/);
  const weitInDerZukunft = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  assert.match(N.pruefeEintrag({ ...gut, datum: weitInDerZukunft }), /Zukunft/);
});

test('pruefeEintrag prüft Note und Punkte', () => {
  const gut = { titel: 'X', art: 'zwischenpruefung', datum: '2026-03-12' };
  assert.match(N.pruefeEintrag({ ...gut, note: 6.5 }), /Note/);
  assert.match(N.pruefeEintrag({ ...gut, note: 0.5 }), /Note/);
  assert.match(N.pruefeEintrag({ ...gut, punkte: 101 }), /Punkte/);
  assert.match(N.pruefeEintrag({ ...gut, punkte: -1 }), /Punkte/);
  // Mit Maximalpunktzahl gilt deren Grenze statt der IHK-Grenze 100.
  assert.equal(N.pruefeEintrag({ ...gut, punkte: 150, maxPunkte: 180 }), null);
  assert.match(N.pruefeEintrag({ ...gut, punkte: 181, maxPunkte: 180 }), /Punkte/);
  assert.match(N.pruefeEintrag({ ...gut, punkte: 80, maxPunkte: 110 }), /Maximalpunktzahl/);
  assert.equal(N.pruefeEintrag({ ...gut, punkte: 87.5, maxPunkte: 100 }), null);
  assert.match(N.pruefeEintrag({ ...gut, bemerkung: 'x'.repeat(1001) }), /Bemerkung/);
  assert.match(N.pruefeEintrag({ ...gut, titel: 'x'.repeat(201) }), /Titel/);
});

// ── PATCH-Zusammenführung ───────────────────────────────────────────
const GESPEICHERT = {
  titel: 'Klausur', art: 'semesterpruefung', datum: '2026-07-10',
  note: 1.7, punkte: 87.5, maxPunkte: 100, noteAusPunkten: true,
  bemerkung: 'alt',
};

test('zusammenfuehreEintrag übernimmt nur die gesendeten Felder', () => {
  const neu = N.zusammenfuehreEintrag(GESPEICHERT, { titel: 'Nachklausur' });
  assert.equal(neu.titel, 'Nachklausur');
  assert.equal(neu.art, 'semesterpruefung');
  assert.equal(neu.datum, '2026-07-10');
  assert.equal(neu.punkte, 87.5);
  assert.equal(neu.maxPunkte, 100);
  assert.equal(neu.bemerkung, 'alt');
});

test('eine BERECHNETE Note blockiert die Neuberechnung nicht', () => {
  // Regressionsnagel: ein PATCH, der nur die Maximalpunktzahl korrigiert,
  // ließ die alte (aus 100 Punkten berechnete) Note stehen.
  const neu = N.zusammenfuehreEintrag(GESPEICHERT, { maxPunkte: 120 });
  assert.equal(neu.note, null, 'berechnete Note wird verworfen');
  assert.equal(neu.punkte, 87.5);
  assert.equal(neu.maxPunkte, 120);
  // 87,5 von 120 liegt in der PDF-Zeile "88 – 86,5" = 2,6.
  assert.equal(N.noteAusPunkten(neu.punkte, { dh: true, maxPunkte: neu.maxPunkte }), 2.6);
});

test('eine GETIPPTE Note bleibt erhalten und behält den Vorrang', () => {
  const getippt = { ...GESPEICHERT, note: 2.0, noteAusPunkten: false };
  const neu = N.zusammenfuehreEintrag(getippt, { punkte: 50 });
  assert.equal(neu.note, 2.0, 'getippte Note wird nicht verworfen');
  assert.equal(neu.punkte, 50);
});

test('eine ausdrücklich gesendete Note gewinnt immer', () => {
  assert.equal(N.zusammenfuehreEintrag(GESPEICHERT, { note: '3,0' }).note, '3,0');
  // Leeren der Note ist eine Absicht, kein "nicht gesendet".
  assert.equal(N.zusammenfuehreEintrag(GESPEICHERT, { note: null }).note, null);
});

test('mussNeuBerechnen erkennt genau die vier Auslöser', () => {
  for (const feld of ['note', 'punkte', 'art', 'maxPunkte']) {
    assert.equal(N.mussNeuBerechnen({ [feld]: 1 }), true, feld);
  }
  assert.equal(N.mussNeuBerechnen({ titel: 'X' }), false);
  assert.equal(N.mussNeuBerechnen({ bemerkung: 'X', abschnittNr: 2 }), false);
  assert.equal(N.mussNeuBerechnen({}), false);
  assert.equal(N.mussNeuBerechnen(null), false);
});

test('der zusammengeführte Stand ist gültig für pruefeEintrag', () => {
  assert.equal(N.pruefeEintrag(N.zusammenfuehreEintrag(GESPEICHERT, { titel: 'Neu' })), null);
  assert.equal(N.pruefeEintrag(N.zusammenfuehreEintrag(GESPEICHERT, { maxPunkte: 120 })), null);
  assert.match(N.pruefeEintrag(N.zusammenfuehreEintrag(GESPEICHERT, { titel: '  ' })), /Titel/);
});

// ── Ordnername ──────────────────────────────────────────────────────
test('normalisiereOrdnerName trimmt und kollabiert Whitespace', () => {
  assert.equal(N.normalisiereOrdnerName('  Englisch  '), 'Englisch');
  assert.equal(N.normalisiereOrdnerName('Technische   Mathematik'), 'Technische Mathematik');
  assert.equal(N.normalisiereOrdnerName('Deutsch\tund\nKommunikation'), 'Deutsch und Kommunikation');
  assert.equal(N.normalisiereOrdnerName('   '), '');
  assert.equal(N.normalisiereOrdnerName(null), '');
});

test('pruefeOrdnerName meldet leer und zu lang', () => {
  assert.equal(N.pruefeOrdnerName('Englisch'), null);
  assert.match(N.pruefeOrdnerName('   '), /Name/);
  assert.match(N.pruefeOrdnerName('x'.repeat(101)), /100/);
});

/* ===================================================================
   ABSCHNITTE, CREDITS, STATUS — Fortschreibung (Migration 046)
   Spec: docs/superpowers/specs/2026-09-02-noten-abschnitte-credits-design.md
   =================================================================== */

// ── Abschnitts-Typen und Wertebereiche ──────────────────────────────
test('ABSCHNITT_TYPEN kennt Ausbildungsjahr und beide Semesterhälften', () => {
  assert.deepEqual(N.ABSCHNITT_TYPEN, ['ausbildungsjahr', 'sose', 'wise']);
});

test('abschnittTypenFuerRolle trennt Azubi und DH-Student', () => {
  assert.deepEqual(N.abschnittTypenFuerRolle('azubi'), ['ausbildungsjahr']);
  assert.deepEqual(N.abschnittTypenFuerRolle('dhstudent'), ['sose', 'wise']);
  // Ausbilder/Admin legen nichts an; sie bekommen dieselbe Liste wie Azubis,
  // damit die Anzeige nicht leer läuft.
  assert.deepEqual(N.abschnittTypenFuerRolle('pruefer'), ['ausbildungsjahr']);
});

test('die beiden Wertebereiche lassen sich nicht vertauschen', () => {
  assert.equal(N.abschnittGueltig('ausbildungsjahr', 2), true);
  assert.equal(N.abschnittGueltig('ausbildungsjahr', 4), true);
  // Eine Ausbildung hat höchstens 4 Jahre — 5 und eine Jahreszahl sind Unsinn.
  assert.equal(N.abschnittGueltig('ausbildungsjahr', 5), false);
  assert.equal(N.abschnittGueltig('ausbildungsjahr', 2026), false);
  assert.equal(N.abschnittGueltig('sose', 2026), true);
  assert.equal(N.abschnittGueltig('wise', 2015), true);
  // Ein "Semester 3" gibt es in der neuen Achse nicht mehr.
  assert.equal(N.abschnittGueltig('sose', 3), false);
  assert.equal(N.abschnittGueltig('wise', 2101), false);
  assert.equal(N.abschnittGueltig('semester', 3), false); // alte Achse ist weg
  assert.equal(N.abschnittGueltig('sose', null), false);
  assert.equal(N.abschnittGueltig('sose', 2026.5), false);
});

test('abschnittLabel schreibt das Wintersemester mit beiden Jahren', () => {
  assert.equal(N.abschnittLabel('ausbildungsjahr', 2), '2. Ausbildungsjahr');
  assert.equal(N.abschnittLabel('sose', 2026), 'SoSe 2026');
  // Startjahr 2025 -> "WiSe 2025/26", wie im DUALIS-Notenspiegel.
  assert.equal(N.abschnittLabel('wise', 2025), 'WiSe 2025/26');
  // Jahrhundertwechsel: 2099/00, nicht 2099/100.
  assert.equal(N.abschnittLabel('wise', 2099), 'WiSe 2099/00');
  assert.equal(N.abschnittLabel('sose', 3), null);
});

test('abschnittSortKey ordnet chronologisch, WiSe zwischen den SoSe', () => {
  const k = N.abschnittSortKey;
  assert.ok(k('sose', 2025) < k('wise', 2025), 'SoSe 2025 liegt vor WiSe 2025/26');
  assert.ok(k('wise', 2025) < k('sose', 2026), 'WiSe 2025/26 liegt vor SoSe 2026');
  // Eine reine Sortierung nach Nr würde WiSe 2025/26 vor SoSe 2025 legen.
  assert.ok(k('ausbildungsjahr', 1) < k('ausbildungsjahr', 2));
});

test('das Semesterfenster reicht 3 Jahre zurück und 1 nach vorn', () => {
  // Bezugsjahr als Parameter, damit der Test nicht an der Systemuhr hängt.
  const jahre = [...new Set(N.abschnittKandidaten('dhstudent', [], 2026).map(k => k.nr))].sort();
  assert.deepEqual(jahre, [2023, 2024, 2025, 2026, 2027]);
  // Und es WANDERT: kein fester Startpunkt, sonst wächst die Liste jährlich.
  const spaeter = [...new Set(N.abschnittKandidaten('dhstudent', [], 2030).map(k => k.nr))].sort();
  assert.deepEqual(spaeter, [2027, 2028, 2029, 2030, 2031]);
  assert.equal(spaeter.length, jahre.length, 'die Liste bleibt gleich groß');
});

test('das Semesterfenster liefert je Jahr SoSe und WiSe, jüngstes zuerst', () => {
  const k = N.abschnittKandidaten('dhstudent', [], 2026);
  assert.equal(k.length, 10);                       // 5 Jahre x 2 Halbjahre
  assert.equal(N.abschnittLabel(k[0].typ, k[0].nr), 'WiSe 2027/28');
  assert.equal(N.abschnittLabel(k[1].typ, k[1].nr), 'SoSe 2027');
});

test('Azubis bekommen die vier Ausbildungsjahre, kein Jahresfenster', () => {
  const k = N.abschnittKandidaten('azubi', [], 2026);
  assert.deepEqual(k.map(x => x.nr), [4, 3, 2, 1]);
  assert.ok(k.every(x => x.typ === 'ausbildungsjahr'));
});

test('schon angelegte Zeiträume stehen nicht mehr zur Auswahl', () => {
  const k = N.abschnittKandidaten('dhstudent', [{ typ: 'sose', nr: 2026 }], 2026);
  assert.ok(!k.some(x => x.typ === 'sose' && x.nr === 2026));
  assert.equal(k.length, 9);
  // Ein Azubi mit allen vier Jahren bekommt eine leere Liste (die UI meldet
  // das, statt ein leeres Dropdown zu zeigen).
  const voll = [1, 2, 3, 4].map(nr => ({ typ: 'ausbildungsjahr', nr }));
  assert.deepEqual(N.abschnittKandidaten('azubi', voll, 2026), []);
});

test('semesterFuerDatum trifft die DHBW-Monatsgrenzen', () => {
  const s = (iso) => {
    const r = N.semesterFuerDatum(new Date(iso + 'T12:00:00'));
    return N.abschnittLabel(r.typ, r.nr);
  };
  assert.equal(s('2026-03-01'), 'SoSe 2026', 'März ist der erste SoSe-Monat');
  assert.equal(s('2026-07-14'), 'SoSe 2026');
  assert.equal(s('2026-08-31'), 'SoSe 2026', 'August ist der letzte SoSe-Monat');
  assert.equal(s('2026-09-01'), 'WiSe 2026/27', 'September beginnt das WiSe');
  assert.equal(s('2026-12-24'), 'WiSe 2026/27');
  // Januar und Februar gehören noch zum WiSe des VORjahres.
  assert.equal(s('2027-01-15'), 'WiSe 2026/27');
  assert.equal(s('2027-02-28'), 'WiSe 2026/27');
});

test('vorausgewählt ist das laufende Semester', () => {
  const heute = new Date('2026-09-02T12:00:00');
  const k = N.abschnittKandidaten('dhstudent', [], 2026);
  const v = N.vorauswahlAbschnitt('dhstudent', k, heute);
  assert.equal(N.abschnittLabel(v.typ, v.nr), 'WiSe 2026/27');
  // Nicht der Listenkopf: der ist das Vorlauf-Semester.
  assert.equal(N.abschnittLabel(k[0].typ, k[0].nr), 'WiSe 2027/28');
});

test('ist das laufende Semester schon angelegt, wird das jüngste VERGANGENE vorgewählt', () => {
  const heute = new Date('2026-09-02T12:00:00');
  const k = N.abschnittKandidaten('dhstudent', [{ typ: 'wise', nr: 2026 }], 2026);
  const v = N.vorauswahlAbschnitt('dhstudent', k, heute);
  // Ein Nachtrag meint eher das vergangene SoSe 2026 als das kommende.
  assert.equal(N.abschnittLabel(v.typ, v.nr), 'SoSe 2026');
});

test('sind nur Zukunfts-Semester frei, greift der Listenkopf', () => {
  const heute = new Date('2026-09-02T12:00:00');
  const belegt = [2023, 2024, 2025, 2026].flatMap(nr => [{ typ: 'sose', nr }, { typ: 'wise', nr }]);
  const k = N.abschnittKandidaten('dhstudent', belegt, 2026);
  const v = N.vorauswahlAbschnitt('dhstudent', k, heute);
  assert.equal(N.abschnittLabel(v.typ, v.nr), 'WiSe 2027/28');
});

test('bei Azubis ist das niedrigste freie Ausbildungsjahr vorgewählt', () => {
  const leer = N.vorauswahlAbschnitt('azubi', N.abschnittKandidaten('azubi', [], 2026));
  assert.equal(N.abschnittLabel(leer.typ, leer.nr), '1. Ausbildungsjahr');
  // Das Kalenderdatum spielt hier keine Rolle — es sagt nichts über das
  // Ausbildungsjahr.
  const zwei = N.vorauswahlAbschnitt('azubi',
    N.abschnittKandidaten('azubi', [{ typ: 'ausbildungsjahr', nr: 1 }], 2026));
  assert.equal(N.abschnittLabel(zwei.typ, zwei.nr), '2. Ausbildungsjahr');
});

test('vorauswahlAbschnitt verträgt eine leere Liste', () => {
  assert.equal(N.vorauswahlAbschnitt('dhstudent', [], new Date()), null);
  assert.equal(N.vorauswahlAbschnitt('azubi', null), null);
});

test('ACCEPT_BELEG deckt jede erlaubte Endung ab', () => {
  // Regressionsnagel: accept stand einmal auf "image/*,application/pdf".
  // iOS ordnet HEIC nicht immer image/* zu, die Datei fiel damit schon im
  // Auswahlfenster durch — obwohl endungErlaubt() sie annimmt.
  for (const endung of N.ERLAUBTE_ENDUNGEN) {
    assert.ok(N.ACCEPT_BELEG.split(',').includes('.' + endung),
      `accept muss .${endung} enthalten`);
  }
  assert.ok(N.ACCEPT_BELEG.includes('application/pdf'));
  assert.ok(N.ACCEPT_BELEG.includes('image/*'));
  // Und umgekehrt: nichts anbieten, was die Prüfung ablehnt.
  for (const teil of N.ACCEPT_BELEG.split(',')) {
    if (teil.startsWith('.')) {
      assert.ok(N.endungErlaubt('x' + teil), `accept bietet ${teil} an, endungErlaubt lehnt es ab`);
    }
  }
});

test('sortiereAbschnitte liefert den jüngsten zuerst', () => {
  const roh = [
    { typ: 'sose', nr: 2025 }, { typ: 'sose', nr: 2026 }, { typ: 'wise', nr: 2025 },
  ];
  assert.deepEqual(N.sortiereAbschnitte(roh).map(a => N.abschnittLabel(a.typ, a.nr)),
    ['SoSe 2026', 'WiSe 2025/26', 'SoSe 2025']);
  assert.deepEqual(N.sortiereAbschnitte([]), []);
});

// ── Credits und Status ──────────────────────────────────────────────
test('parseCredits nimmt Komma und Punkt, weist Unsinn ab', () => {
  assert.equal(N.parseCredits('5'), 5);
  assert.equal(N.parseCredits('5,0'), 5);
  assert.equal(N.parseCredits('12.5'), 12.5);
  assert.equal(N.parseCredits(''), null);
  assert.equal(N.parseCredits(null), null);
  assert.equal(N.parseCredits('abc'), null);
  assert.equal(N.parseCredits('-1'), null);
  assert.equal(N.parseCredits('61'), null);           // über CREDITS_MAX
  assert.equal(N.parseCredits('5,25'), null);         // nur eine Nachkommastelle
});

test('formatCredits schreibt deutsch mit einer Nachkommastelle', () => {
  assert.equal(N.formatCredits(5), '5,0');
  assert.equal(N.formatCredits(12.5), '12,5');
  assert.equal(N.formatCredits(null), '–');
});

test('STATUS_WERTE sind genau die drei aus dem Notenspiegel', () => {
  assert.deepEqual(N.STATUS_WERTE.map(s => s.id), ['bestanden', 'nicht_bestanden', 'offen']);
  N.STATUS_WERTE.forEach(s => assert.ok(s.label.length > 0, `${s.id} braucht ein Label`));
});

test('istBestandenOhneNote erkennt das "b" der Notenspalte', () => {
  // "b" ist KEIN Notenwert, sondern Status bestanden bei leerer Note.
  assert.equal(N.istBestandenOhneNote({ status: 'bestanden', note: null }), true);
  assert.equal(N.istBestandenOhneNote({ status: 'bestanden', note: 1.5 }), false);
  assert.equal(N.istBestandenOhneNote({ status: 'offen', note: null }), false);
  assert.equal(N.istBestandenOhneNote({ note: null }), false);
  assert.equal(N.istBestandenOhneNote(null), false);
});

// ── Rechnen je Abschnitt ────────────────────────────────────────────

/* Der DUALIS-Notenspiegel aus der Vorlage, Zeile für Zeile. Er ist als
   Fixture hier, weil sich aus ihm ZWEI Rechenregeln ablesen lassen, die
   sonst nur Behauptung wären:

     Nr.        Name                    Endnote   Credits   Status
     T3_3000    Praxisprojekt III       b          8,0      bestanden
     T3_3200    Studienarbeit II        1,5        5,0      bestanden
     T3_3300    Bachelorarbeit          (leer)    12,0      (kein Status)
     T3MB9059   Vertiefung Antriebst.   1,8        5,0      bestanden
     T3MB9159   IoT - Mech. Anwend.     1,6        5,0      bestanden
     T3MB9176   Fertigungsmasch./Rob.   1,5        5,0      bestanden
     T3MB9178   Maschinendynamik        2,7        5,0      bestanden
     ------------------------------------------------------------------
     Semester-GPA                       1,8       33,0

   Die Credits der sieben Zeilen ergeben 45,0 — angezeigt werden 33,0.
   Es fehlen genau die 12,0 der Zeile ohne Status. Und der GPA 1,8 ist
   (1,5+1,8+1,6+1,5+2,7)/5 = 1,82: das "b" und die leere Note gehen nicht
   ein. */
const DUALIS_SOSE_2026 = [{
  name: 'SoSe 2026',
  zaehltInSchnitt: true,
  eintraege: [
    { titel: 'Praxisprojekt III',              note: null, credits: 8,  status: 'bestanden' },
    { titel: 'Studienarbeit II',               note: 1.5,  credits: 5,  status: 'bestanden' },
    { titel: 'Bachelorarbeit',                 note: null, credits: 12, status: 'offen' },
    { titel: 'Vertiefung Antriebstechnik',     note: 1.8,  credits: 5,  status: 'bestanden' },
    { titel: 'IoT - Mechatronische Anwendung', note: 1.6,  credits: 5,  status: 'bestanden' },
    { titel: 'Fertigungsmaschinen und Robotik',note: 1.5,  credits: 5,  status: 'bestanden' },
    { titel: 'Maschinendynamik',               note: 2.7,  credits: 5,  status: 'bestanden' },
  ],
}];

test('Credit-Summe zählt nur bestandene Module (33,0 statt 45,0)', () => {
  assert.equal(N.creditSumme(DUALIS_SOSE_2026), 33);
  // Gegenprobe: alle sieben Zeilen zusammen wären 45,0.
  const alle = DUALIS_SOSE_2026[0].eintraege.reduce((s, e) => s + e.credits, 0);
  assert.equal(alle, 45);
});

test('Noten-Ø je Abschnitt lässt "b" und leere Noten außen vor', () => {
  // (1,5 + 1,8 + 1,6 + 1,5 + 2,7) / 5 = 1,82
  const oe = N.abschnittSchnitt(DUALIS_SOSE_2026);
  assert.equal(oe, 1.82);
  // DUALIS weist den GPA auf EINE Stelle gerundet aus ("1,8"). Der Wert
  // stimmt also mit der Vorlage ueberein; unsere Anzeige behaelt bewusst
  // zwei Stellen (formatNote), wie der Ordner-Oe im Azubi-Teil auch.
  assert.equal(oe.toLocaleString('de-DE', { maximumFractionDigits: 1 }), '1,8');
  assert.equal(N.formatNote(oe), '1,82');
});

test('abschnittSchnitt ist ein EINFACHER Mittelwert, nicht credit-gewichtet', () => {
  // Ein Modul mit 12 Credits und Note 4,0 neben einem mit 3 Credits und 1,0:
  // einfach = 2,5. Credit-gewichtet wären es 3,4.
  const ordner = [{ zaehltInSchnitt: true, eintraege: [
    { note: 4.0, credits: 12, status: 'bestanden' },
    { note: 1.0, credits: 3,  status: 'bestanden' },
  ] }];
  assert.equal(N.abschnittSchnitt(ordner), 2.5);
});

test('Ordner mit zaehltInSchnitt=false bleiben aus Ø und Credit-Summe heraus', () => {
  const ordner = [
    { zaehltInSchnitt: true,  eintraege: [{ note: 2.0, credits: 5, status: 'bestanden' }] },
    { zaehltInSchnitt: false, eintraege: [{ note: 5.0, credits: 9, status: 'bestanden' }] },
  ];
  assert.equal(N.abschnittSchnitt(ordner), 2.0);
  assert.equal(N.creditSumme(ordner), 5);
});

test('leere Eingaben ergeben null bzw. 0, nicht NaN', () => {
  assert.equal(N.abschnittSchnitt([]), null);
  assert.equal(N.abschnittSchnitt(null), null);
  assert.equal(N.abschnittSchnitt([{ zaehltInSchnitt: true, eintraege: [] }]), null);
  assert.equal(N.creditSumme([]), 0);
  assert.equal(N.creditSumme(null), 0);
});

test('gesamtSchnitt gibt es nicht mehr', () => {
  // Der Ø über die gesamte Ausbildung ist bewusst entfallen — er soll nicht
  // versehentlich wieder irgendwo auftauchen.
  assert.equal(N.gesamtSchnitt, undefined);
  assert.equal(N.gruppiereNachAbschnitt, undefined);
});

// ── Gruppierung: Abschnitt außen, Fächer innen ──────────────────────
test('gruppiereOrdnerNachAbschnitt hängt Ordner unter ihren Abschnitt', () => {
  const abschnitte = [
    { id: 1, typ: 'ausbildungsjahr', nr: 1 },
    { id: 2, typ: 'ausbildungsjahr', nr: 2 },
  ];
  const ordner = [
    { id: 10, abschnittId: 2, name: 'Englisch',       zaehltInSchnitt: true, eintraege: [{ note: 2.0 }] },
    { id: 11, abschnittId: 1, name: 'Englisch',       zaehltInSchnitt: true, eintraege: [{ note: 3.0 }] },
    { id: 12, abschnittId: 2, name: 'Rechnungswesen', zaehltInSchnitt: true, eintraege: [] },
  ];
  const g = N.gruppiereOrdnerNachAbschnitt(abschnitte, ordner);
  assert.deepEqual(g.map(x => x.label), ['2. Ausbildungsjahr', '1. Ausbildungsjahr']);
  assert.deepEqual(g[0].ordner.map(o => o.id), [10, 12]);
  assert.deepEqual(g[1].ordner.map(o => o.id), [11]);
  // Derselbe Fachname in zwei Jahren sind zwei getrennte Ordner.
  assert.equal(g[0].schnitt, 2.0);
  assert.equal(g[1].schnitt, 3.0);
});

test('ein leerer Abschnitt bleibt sichtbar', () => {
  // "SoSe 2026" anlegen, bevor Fächer darin liegen, muss gehen — sonst
  // verschwindet der gerade erzeugte Abschnitt sofort wieder.
  const g = N.gruppiereOrdnerNachAbschnitt([{ id: 5, typ: 'sose', nr: 2026 }], []);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].ordner, []);
  assert.equal(g[0].schnitt, null);
  assert.equal(g[0].credits, 0);
});

test('Ordner ohne Abschnitt landen in einer Auffanggruppe am Ende', () => {
  const g = N.gruppiereOrdnerNachAbschnitt(
    [{ id: 1, typ: 'ausbildungsjahr', nr: 1 }],
    [{ id: 20, abschnittId: null, name: 'Altbestand', eintraege: [] },
     { id: 21, abschnittId: 1, name: 'Englisch', eintraege: [] }]);
  assert.equal(g.length, 2);
  assert.equal(g[0].label, '1. Ausbildungsjahr');
  assert.equal(g[1].label, null);          // "Ohne Zuordnung"
  assert.equal(g[1].id, null);
  assert.deepEqual(g[1].ordner.map(o => o.id), [20]);
});

test('ohne unzugeordnete Ordner gibt es keine Auffanggruppe', () => {
  const g = N.gruppiereOrdnerNachAbschnitt(
    [{ id: 1, typ: 'ausbildungsjahr', nr: 1 }],
    [{ id: 21, abschnittId: 1, name: 'Englisch', eintraege: [] }]);
  assert.equal(g.length, 1);
});

// ── Validierung je Rolle ────────────────────────────────────────────
const BASIS = { titel: 'Klausur', art: 'semesterpruefung', datum: '2026-07-14' };

test('Notenobergrenze hängt an der Rolle', () => {
  assert.equal(N.NOTE_MAX_FUER_ROLLE('azubi'), 6);
  assert.equal(N.NOTE_MAX_FUER_ROLLE('dhstudent'), 5);
  // Schulnote 5,5 gibt es, eine DHBW-Note 5,5 nicht.
  assert.equal(N.pruefeEintrag({ ...BASIS, art: 'klassenarbeit', note: '5,5' }, 'azubi'), null);
  assert.match(String(N.pruefeEintrag({ ...BASIS, note: '5,5' }, 'dhstudent')), /Note/);
});

test('Credits und Status sind DH-Sache, Punkte Azubi-Sache', () => {
  assert.equal(N.pruefeEintrag({ ...BASIS, credits: '5', status: 'bestanden' }, 'dhstudent'), null);
  assert.match(String(N.pruefeEintrag({ ...BASIS, credits: '5' }, 'azubi')), /Credits/);
  assert.match(String(N.pruefeEintrag({ ...BASIS, status: 'bestanden' }, 'azubi')), /Status/);
  assert.equal(N.pruefeEintrag({ ...BASIS, art: 'zwischenpruefung', punkte: '87' }, 'azubi'), null);
  assert.match(String(N.pruefeEintrag({ ...BASIS, punkte: '87' }, 'dhstudent')), /Punkte/);
});

test('unbekannter Status wird abgewiesen', () => {
  assert.match(String(N.pruefeEintrag({ ...BASIS, status: 'irgendwas' }, 'dhstudent')), /Status/);
});

test('Credits über der Obergrenze werden abgewiesen', () => {
  assert.match(String(N.pruefeEintrag({ ...BASIS, credits: '61' }, 'dhstudent')), /Credits/);
});

test('pruefeEintrag kennt abschnittTyp/abschnittNr nicht mehr', () => {
  // Der Abschnitt hängt am Ordner. Ein Body, der die alten Felder noch
  // mitschickt, darf daran nicht scheitern — sie werden ignoriert.
  assert.equal(N.pruefeEintrag({ ...BASIS, art: 'klassenarbeit', abschnittTyp: 'semester', abschnittNr: 3 }, 'azubi'), null);
});

test('pruefeAbschnitt prüft Typ, Nummer und Rolle zusammen', () => {
  assert.equal(N.pruefeAbschnitt('sose', 2026, 'dhstudent'), null);
  assert.equal(N.pruefeAbschnitt('ausbildungsjahr', 2, 'azubi'), null);
  // Ein Azubi legt kein Semester an und ein Student kein Ausbildungsjahr.
  assert.match(String(N.pruefeAbschnitt('sose', 2026, 'azubi')), /Ausbildungsjahr/);
  assert.match(String(N.pruefeAbschnitt('ausbildungsjahr', 2, 'dhstudent')), /Semester/);
  assert.match(String(N.pruefeAbschnitt('sose', 3, 'dhstudent')), /Jahr/);
});

// ── PATCH-Zusammenführung ───────────────────────────────────────────
test('zusammenfuehreEintrag trägt Credits und Status mit', () => {
  const alt = { titel: 'A', art: 'semesterpruefung', datum: '2026-07-14',
                note: 1.5, punkte: null, maxPunkte: null, credits: 5, status: 'bestanden' };
  const z = N.zusammenfuehreEintrag(alt, { status: 'offen' });
  assert.equal(z.status, 'offen');
  assert.equal(z.credits, 5);
  assert.equal(z.note, 1.5);
  // Credits ausdrücklich auf null setzen muss möglich sein.
  assert.equal(N.zusammenfuehreEintrag(alt, { credits: null }).credits, null);
});

test('zusammenfuehreEintrag führt die Abschnittsfelder nicht mehr mit', () => {
  const z = N.zusammenfuehreEintrag({ titel: 'A', abschnittTyp: 'semester', abschnittNr: 3 }, {});
  assert.equal('abschnittTyp' in z, false);
  assert.equal('abschnittNr' in z, false);
});

test('eine berechnete Note blockiert die Neuberechnung weiterhin nicht', () => {
  // Regression aus der ersten Fassung: der gespeicherte, aus Punkten
  // BERECHNETE Wert darf nicht als Nutzereingabe zurückkommen.
  const alt = { note: 1.7, punkte: 87.5, maxPunkte: 100, noteAusPunkten: true };
  assert.equal(N.zusammenfuehreEintrag(alt, { maxPunkte: 120 }).note, null);
  const getippt = { note: 1.7, punkte: 87.5, maxPunkte: 100, noteAusPunkten: false };
  assert.equal(N.zusammenfuehreEintrag(getippt, { maxPunkte: 120 }).note, 1.7);
});

// ── Notenspiegel: flache Tabelle ────────────────────────────────────
// Vorlage für app/noten-tabelle.html und das A4-Blatt. Beide Ausgaben
// bekommen ihre Zeilen aus DIESER Funktion — nur so ist "was ich sehe,
// wird gedruckt" garantiert und nicht bloß beabsichtigt.

// API-Form: GET /api/noten liefert Abschnitte und Ordner flach, die
// Einträge je Ordner nach Datum ABSTEIGEND (ORDER BY e.Datum DESC).
const SPIEGEL_ABSCHNITTE = [
  { id: 10, typ: 'sose', nr: 2026 },
  { id: 11, typ: 'wise', nr: 2025 },
];
const SPIEGEL_ORDNER = [
  { id: 1, abschnittId: 10, name: 'Projektarbeiten', zaehltInSchnitt: true, eintraege: [
    { id: 5, titel: 'Studienarbeit II',  art: 'semesterpruefung', datum: '2026-07-14', note: 1.5,  punkte: null, credits: 5, status: 'bestanden' },
    { id: 4, titel: 'Praxisprojekt III', art: 'semesterpruefung', datum: '2026-03-02', note: null, punkte: null, credits: 8, status: 'bestanden' },
  ] },
  { id: 2, abschnittId: 10, name: 'Wirtschaft', zaehltInSchnitt: true, eintraege: [
    { id: 6, titel: 'Controlling', art: 'semesterpruefung', datum: '2026-06-20', note: 2.1, punkte: null, credits: 5, status: 'bestanden' },
  ] },
  { id: 3, abschnittId: 11, name: 'Technik', zaehltInSchnitt: true, eintraege: [
    { id: 7, titel: 'Statistik', art: 'semesterpruefung', datum: '2026-01-15', note: 3.0, punkte: null, credits: 5, status: 'bestanden' },
  ] },
];

test('tabellenZeilen macht aus drei Ebenen eine flache Tabelle mit Fach-Spalte', () => {
  const g = N.tabellenZeilen(SPIEGEL_ABSCHNITTE, SPIEGEL_ORDNER);
  assert.deepEqual(g.map(x => x.label), ['SoSe 2026', 'WiSe 2025/26']);
  // Jede Zeile trägt ihr Fach selbst — in der flachen Tabelle ist das eine
  // Spalte, keine Zwischenzeile.
  assert.deepEqual(g[0].zeilen.map(z => [z.fach, z.titel]), [
    ['Projektarbeiten', 'Praxisprojekt III'],
    ['Projektarbeiten', 'Studienarbeit II'],
    ['Wirtschaft', 'Controlling'],
  ]);
});

test('tabellenZeilen sortiert Prüfungen AUFSTEIGEND, gegen die API-Reihenfolge', () => {
  // Die API liefert absteigend (jüngste zuerst) — auf Papier liest man
  // vorwärts, deshalb dreht die Funktion die Reihenfolge.
  const g = N.tabellenZeilen(SPIEGEL_ABSCHNITTE, SPIEGEL_ORDNER);
  const daten = g[0].zeilen.filter(z => z.fach === 'Projektarbeiten').map(z => z.datum);
  assert.deepEqual(daten, ['2026-03-02', '2026-07-14']);
});

test('tabellenZeilen filtert auf einen Zeitraum', () => {
  const g = N.tabellenZeilen(SPIEGEL_ABSCHNITTE, SPIEGEL_ORDNER, { abschnittId: 11 });
  assert.equal(g.length, 1);
  assert.equal(g[0].label, 'WiSe 2025/26');
  assert.deepEqual(g[0].zeilen.map(z => z.titel), ['Statistik']);
  // Ein unbekannter Filterwert liefert nichts, nicht versehentlich alles.
  assert.deepEqual(N.tabellenZeilen(SPIEGEL_ABSCHNITTE, SPIEGEL_ORDNER, { abschnittId: 999 }), []);
});

test('tabellenZeilen lässt Zeiträume ohne Prüfungen weg', () => {
  // Ein leerer Zeitraum muss in der PFLEGE-Ansicht stehenbleiben (man legt
  // ihn an, bevor Fächer darin liegen) — auf einem Notenspiegel ist er nur
  // eine leere Überschrift.
  const abschnitte = SPIEGEL_ABSCHNITTE.concat([{ id: 12, typ: 'sose', nr: 2027 }]);
  const ordner = SPIEGEL_ORDNER.concat([
    { id: 4, abschnittId: 12, name: 'Noch leer', zaehltInSchnitt: true, eintraege: [] },
  ]);
  const gruppen = N.tabellenZeilen(abschnitte, ordner);
  assert.deepEqual(gruppen.map(x => x.label), ['SoSe 2026', 'WiSe 2025/26']);
  assert.equal(gruppen.every(x => x.zeilen.length > 0), true);
});

test('tabellenZeilen rechnet Ø und Credits wie die Bildschirmansicht', () => {
  const spiegel = N.tabellenZeilen(SPIEGEL_ABSCHNITTE, SPIEGEL_ORDNER);
  const bildschirm = N.gruppiereOrdnerNachAbschnitt(SPIEGEL_ABSCHNITTE, SPIEGEL_ORDNER);
  assert.deepEqual(spiegel.map(g => [g.label, g.schnitt, g.credits]),
                   bildschirm.map(g => [g.label, g.schnitt, g.credits]));
  // (1,5 + 2,1) / 2 = 1,8 · Credits nur bestanden: 5 + 8 + 5 = 18
  assert.equal(spiegel[0].schnitt, 1.8);
  assert.equal(spiegel[0].credits, 18);
});

test('tabellenZeilen markiert Zeilen, die nicht in den Ø eingehen', () => {
  const ordner = [
    { id: 1, abschnittId: 10, name: 'Englisch', zaehltInSchnitt: true, eintraege: [
      { id: 1, titel: 'Test 1', art: 'klassenarbeit', datum: '2026-04-01', note: 2.0 },
    ] },
    { id: 2, abschnittId: 10, name: 'Zeugnisse', zaehltInSchnitt: false, eintraege: [
      { id: 2, titel: 'Halbjahr', art: 'zeugnis', datum: '2026-02-01', note: 5.0 },
    ] },
  ];
  const g = N.tabellenZeilen(SPIEGEL_ABSCHNITTE, ordner, { abschnittId: 10 });
  assert.deepEqual(g[0].zeilen.map(z => [z.fach, z.zaehltInSchnitt]), [
    ['Englisch', true], ['Zeugnisse', false],
  ]);
  // Der Ø darf die 5,0 nicht enthalten, sonst stimmt die Kopfzeile nicht.
  assert.equal(g[0].schnitt, 2.0);
  assert.equal(g[0].anzahlNoten, 1);
  // ... und es muss erkennbar sein, DASS eine Fußnote nötig ist.
  assert.equal(g[0].zeilen.some(z => !z.zaehltInSchnitt), true);
});

test('anzahlNoten zählt genau die Noten, die im Ø stecken', () => {
  // Die Zahl neben dem Ø muss nachprüfbar sein: "Ø 2,0 · 3 Noten" bei drei
  // Zeilen, von denen eine nicht mitzählt, ist eine falsche Auskunft.
  const ordner = [
    { id: 1, abschnittId: 10, name: 'A', zaehltInSchnitt: true, eintraege: [
      { id: 1, note: 1.0, datum: '2026-01-01' }, { id: 2, note: 3.0, datum: '2026-01-02' },
      { id: 3, note: null, datum: '2026-01-03', status: 'bestanden' },
    ] },
    { id: 2, abschnittId: 10, name: 'B', zaehltInSchnitt: false, eintraege: [
      { id: 4, note: 6.0, datum: '2026-01-04' },
    ] },
  ];
  assert.equal(N.abschnittAnzahlNoten(ordner), 2);
  assert.equal(N.abschnittSchnitt(ordner), 2.0);
  const g = N.tabellenZeilen(SPIEGEL_ABSCHNITTE, ordner, { abschnittId: 10 });
  assert.equal(g[0].anzahlNoten, 2);
  assert.equal(g[0].zeilen.length, 4); // gezeigt werden trotzdem alle
});

test('tabellenZeilen hängt Fächer ohne Zeitraum hinten an', () => {
  const ordner = SPIEGEL_ORDNER.concat([
    { id: 9, abschnittId: null, name: 'Ohne Zuordnung', zaehltInSchnitt: true, eintraege: [
      { id: 30, titel: 'Alt', art: 'sonstiges', datum: '2024-05-05', note: 2.5 },
    ] },
  ]);
  const g = N.tabellenZeilen(SPIEGEL_ABSCHNITTE, ordner);
  assert.equal(g.length, 3);
  assert.equal(g[2].label, null); // Auffanggruppe, die Oberfläche betitelt sie
  assert.deepEqual(g[2].zeilen.map(z => z.titel), ['Alt']);
});

test('tabellenZeilen verträgt leere und fehlende Eingaben', () => {
  assert.deepEqual(N.tabellenZeilen([], []), []);
  assert.deepEqual(N.tabellenZeilen(null, null), []);
  assert.deepEqual(N.tabellenZeilen(undefined, undefined, { abschnittId: 3 }), []);
});

// ── Spaltenbild ─────────────────────────────────────────────────────
test('tabellenSpalten: DH-Studenten bekommen Credits und Status, keine Punkte', () => {
  const g = N.tabellenZeilen(SPIEGEL_ABSCHNITTE, SPIEGEL_ORDNER);
  const ids = N.tabellenSpalten('dhstudent', g).map(s => s.id);
  assert.deepEqual(ids, ['fach', 'titel', 'datum', 'note', 'credits', 'status']);
});

test('tabellenSpalten: Azubis bekommen die Art, keine Credits', () => {
  const ordner = [{ id: 1, abschnittId: 10, name: 'Englisch', zaehltInSchnitt: true, eintraege: [
    { id: 1, titel: 'Test', art: 'klassenarbeit', datum: '2026-04-01', note: 2.0, punkte: null },
  ] }];
  const g = N.tabellenZeilen(SPIEGEL_ABSCHNITTE, ordner, { abschnittId: 10 });
  const ids = N.tabellenSpalten('azubi', g).map(s => s.id);
  assert.deepEqual(ids, ['fach', 'titel', 'art', 'datum', 'note']);
  assert.equal(ids.includes('credits'), false);
  assert.equal(ids.includes('status'), false);
});

test('die Punkte-Spalte erscheint nur, wenn Punkte eingetragen sind', () => {
  const mit = [{ id: 1, abschnittId: 10, name: 'IHK', zaehltInSchnitt: true, eintraege: [
    { id: 1, titel: 'ZP', art: 'zwischenpruefung', datum: '2026-04-01', note: 1.7, punkte: 87.5 },
  ] }];
  const g = N.tabellenZeilen(SPIEGEL_ABSCHNITTE, mit, { abschnittId: 10 });
  assert.equal(N.tabellenSpalten('azubi', g).map(s => s.id).includes('punkte'), true);
  // Eine leere Spalte quer über das ganze Blatt ist verschenkte Breite.
  assert.equal(N.tabellenSpalten('azubi', N.tabellenZeilen(SPIEGEL_ABSCHNITTE, SPIEGEL_ORDNER))
    .map(s => s.id).includes('punkte'), false);
});

test('jede Spalte hat Beschriftung und Ausrichtung — eine Wahrheit für Bildschirm und Druck', () => {
  const alle = N.tabellenSpalten('dhstudent', N.tabellenZeilen(SPIEGEL_ABSCHNITTE, SPIEGEL_ORDNER));
  alle.forEach(s => {
    assert.equal(typeof s.label, 'string');
    assert.ok(s.label.length > 0, s.id + ' braucht eine Beschriftung');
    assert.ok(['links', 'rechts'].includes(s.ausricht), s.id + ' braucht eine Ausrichtung');
  });
  // Zahlen rechts, Text links.
  const nach = Object.fromEntries(alle.map(s => [s.id, s.ausricht]));
  assert.equal(nach.note, 'rechts');
  assert.equal(nach.credits, 'rechts');
  assert.equal(nach.fach, 'links');
});

// ── Notenzelle ──────────────────────────────────────────────────────
test('noteText liefert die drei Zustände der Notenspalte', () => {
  assert.equal(N.noteText({ note: 2.3 }), '2,3');
  assert.equal(N.noteText({ note: null, status: 'bestanden' }), 'b');
  assert.equal(N.noteText({ note: null, status: 'offen' }), '–');
  assert.equal(N.noteText({}), '–');
  assert.equal(N.noteText(null), '–');
});

// ── Fach-Farben ─────────────────────────────────────────────────────
// Rein visuelle Hilfe (Migration 047), aber in der DB gespeichert, damit
// sie auf jedem Gerät und für mitlesende Ausbilder dieselbe ist.

// Die Töne des Abteilungsplaners (GANTT_PALETTE in
// app/js/abteilungs-planer.js). Hier absichtlich ABGESCHRIEBEN und nicht
// aus der Palette abgeleitet: der Test soll bemerken, wenn eine der
// beiden Listen wandert.
const PLANER_TOENE = [
  '#4F9D9A', '#5B86C2', '#5FAE72', '#D8835A', '#9B7BC4',
  '#C75C6B', '#C99A3E', '#6B8E4E', '#C77FB2', '#4F8FB8',
  '#7E70BE', '#B06A52', '#5BA98C', '#6E7E8C', '#A86FA0',
];

test('FACH_FARBEN ist die Palette des Abteilungsplaners', () => {
  assert.deepEqual(N.FACH_FARBEN.map(f => f.hex), PLANER_TOENE);
});

test('jede Farbe hat Id, Namen und ein RGB-Tripel', () => {
  N.FACH_FARBEN.forEach(f => {
    assert.match(f.hex, /^#[0-9A-F]{6}$/, f.id + ': Hex in Großbuchstaben');
    assert.equal(typeof f.id, 'string');
    assert.ok(f.id.length > 0, 'Id fehlt');
    assert.ok(typeof f.label === 'string' && f.label.length > 0, f.id + ': Name fehlt');
    // Das Tripel treibt die CSS-Tönung: rgba(var(--fach-rgb), .12).
    assert.match(f.rgb, /^\d{1,3},\d{1,3},\d{1,3}$/, f.id + ': RGB-Tripel');
  });
  // Ids eindeutig — sie sind der Schlüssel in der Oberfläche.
  assert.equal(new Set(N.FACH_FARBEN.map(f => f.id)).size, N.FACH_FARBEN.length);
});

test('das RGB-Tripel passt zum Hexwert', () => {
  N.FACH_FARBEN.forEach(f => {
    const erwartet = [1, 3, 5].map(i => parseInt(f.hex.substr(i, 2), 16)).join(',');
    assert.equal(f.rgb, erwartet, f.id);
  });
});

test('farbeRgb rechnet jeden Hexwert um, auch klein geschrieben', () => {
  assert.equal(N.farbeRgb('#4F9D9A'), '79,157,154');
  assert.equal(N.farbeRgb('#4f9d9a'), '79,157,154');
  assert.equal(N.farbeRgb('#000000'), '0,0,0');
  assert.equal(N.farbeRgb('#FFFFFF'), '255,255,255');
  // Kein Hexwert → nichts. Der Rückgabewert landet in einem style-Attribut.
  assert.equal(N.farbeRgb('red'), null);
  assert.equal(N.farbeRgb('#4F9D9'), null);
  assert.equal(N.farbeRgb(null), null);
  assert.equal(N.farbeRgb(''), null);
});

test('istHexFarbe hält alles ab, was in kein style-Attribut darf', () => {
  assert.equal(N.istHexFarbe('#4F9D9A'), true);
  assert.equal(N.istHexFarbe('#4f9d9a'), true);
  assert.equal(N.istHexFarbe('red'), false);
  assert.equal(N.istHexFarbe('#4F9D9A;background:url(x)'), false);
  assert.equal(N.istHexFarbe('#fff" onload="alert(1)'), false);
  assert.equal(N.istHexFarbe('rgb(1,2,3)'), false);
  assert.equal(N.istHexFarbe(null), false);
});

test('keine Farbe ist ein gültiger Zustand', () => {
  // NULL heißt neutral — so sehen alle bestehenden Fächer aus, es wird
  // ausdrücklich keine Farbe automatisch vergeben.
  assert.equal(N.farbeGueltig(null), true);
  assert.equal(N.farbeGueltig(undefined), true);
  assert.equal(N.farbeGueltig(''), true);
  assert.equal(N.pruefeOrdnerFarbe(null), null);
  assert.equal(N.pruefeOrdnerFarbe(''), null);
});

test('nur Farben AUS DER PALETTE sind gültig', () => {
  assert.equal(N.farbeGueltig('#4F9D9A'), true);
  assert.equal(N.farbeGueltig('#4f9d9a'), true, 'Kleinschreibung muss durchgehen');
  // Formal ein Hexwert, aber nicht aus der Palette:
  assert.equal(N.farbeGueltig('#FFFF00'), false);
  assert.equal(N.farbeGueltig('#123456'), false);
  assert.equal(N.farbeGueltig('teal'), false);
  assert.match(String(N.pruefeOrdnerFarbe('#FFFF00')), /Palette/);
  assert.match(String(N.pruefeOrdnerFarbe('nicht-mal-hex')), /Palette/);
});

test('normalisiereFarbe speichert einheitlich in Großbuchstaben', () => {
  // Sonst stünden dieselbe Farbe zweimal unterschiedlich in der DB und
  // der Vergleich in der Oberfläche (welcher Tupfer ist aktiv?) schlägt fehl.
  assert.equal(N.normalisiereFarbe('#4f9d9a'), '#4F9D9A');
  assert.equal(N.normalisiereFarbe('#4F9D9A'), '#4F9D9A');
  assert.equal(N.normalisiereFarbe('  #4f9d9a  '), '#4F9D9A');
  assert.equal(N.normalisiereFarbe(null), null);
  assert.equal(N.normalisiereFarbe(''), null);
  assert.equal(N.normalisiereFarbe('#FFFF00'), null, 'außerhalb der Palette → keine Farbe');
});

test('farbeById findet den Eintrag der Palette', () => {
  const erste = N.FACH_FARBEN[0];
  assert.equal(N.farbeById(erste.id).hex, erste.hex);
  assert.equal(N.farbeById('gibtsnicht'), null);
  assert.equal(N.farbeById(null), null);
});

test('die Palette deckt genug Fächer ab, ohne sich zu wiederholen', () => {
  // Ein Ausbildungsjahr hat selten mehr als eine Handvoll Fächer; 15
  // eindeutige Töne genügen also für jeden Zeitraum, ohne dass zwei
  // Fächer nebeneinander gleich aussehen.
  assert.equal(new Set(N.FACH_FARBEN.map(f => f.hex)).size, 15);
});

test('tabellenZeilen tragen die Farbe ihres Fachs mit', () => {
  // Der Notenspiegel setzt daraus einen Punkt vor den Fachnamen. Auf dem
  // A4-Blatt erscheint sie NICHT — dort bleibt es schwarzweiss.
  const ordner = [
    { id: 1, abschnittId: 10, name: 'Englisch', zaehltInSchnitt: true, farbe: '#4F9D9A', eintraege: [
      { id: 1, titel: 'Test', art: 'klassenarbeit', datum: '2026-04-01', note: 2.0 },
    ] },
    { id: 2, abschnittId: 10, name: 'Ohne Farbe', zaehltInSchnitt: true, eintraege: [
      { id: 2, titel: 'Test 2', art: 'klassenarbeit', datum: '2026-04-02', note: 3.0 },
    ] },
  ];
  const g = N.tabellenZeilen(SPIEGEL_ABSCHNITTE, ordner, { abschnittId: 10 });
  assert.deepEqual(g[0].zeilen.map(z => [z.fach, z.farbe]), [
    ['Englisch', '#4F9D9A'],
    ['Ohne Farbe', null],
  ]);
});
