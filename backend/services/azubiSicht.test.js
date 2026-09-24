'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('./azubiSicht.js');

/* Fake-Pool: routet den SQL-Text per Substring auf ein vorgegebenes
   recordset (Muster beurteilungen.test.js). Merkt sich zusätzlich alle
   Query-Texte, damit Tests prüfen können, WAS gefragt wurde — die
   Extraktion aus noten.js darf die Abfragen inhaltlich nicht verändern,
   nur um AusbildungBeginn/AusbildungEnde erweitern. */
function fakePool(routen) {
  const queries = [];
  const pool = {
    queries,
    request() {
      const api = {
        input() { return api; },
        query(text) {
          queries.push(text);
          const treffer = routen.find(([nadel]) => text.includes(nadel));
          return Promise.resolve({ recordset: treffer ? treffer[1] : [] });
        },
      };
      return api;
    },
  };
  return pool;
}

/* ── istReportBerechtigt (rein) ───────────────────────────────────── */

test('istReportBerechtigt: admin und developer duerfen immer', () => {
  assert.equal(A.istReportBerechtigt({ role: 'admin' }), true);
  assert.equal(A.istReportBerechtigt({ role: 'developer' }), true);
});

test('istReportBerechtigt: Ausbildungsleiter nur MIT Bereich', () => {
  assert.equal(A.istReportBerechtigt(
    { role: 'pruefer', istAusbildungsleiter: true, ausbildungsleiterBereich: 'kaufmaennisch' }), true);
  // Ohne Bereich waere die serverseitige Schnittmenge leer -> kein Zugriff,
  // statt eines Reports ueber niemanden.
  assert.equal(A.istReportBerechtigt(
    { role: 'pruefer', istAusbildungsleiter: true, ausbildungsleiterBereich: null }), false);
  assert.equal(A.istReportBerechtigt(
    { role: 'pruefer', istAusbildungsleiter: false, ausbildungsleiterBereich: 'technisch' }), false);
});

test('istReportBerechtigt: normaler Pruefer, Azubi und null duerfen nicht', () => {
  assert.equal(A.istReportBerechtigt({ role: 'pruefer' }), false);
  assert.equal(A.istReportBerechtigt({ role: 'azubi' }), false);
  assert.equal(A.istReportBerechtigt(null), false);
  assert.equal(A.istReportBerechtigt(undefined), false);
});

/* ── sichtbareAzubis (unrein, Fake-Pool) ──────────────────────────── */

test('sichtbareAzubis: admin bekommt alle aktiven Azubis/DH-Studenten', async () => {
  const alle = [
    { Oid: 'a1', Name: 'Kuniß, Florian', Email: 'a1@x.de', Role: 'azubi', Department: null, Beruf: 'Mechatroniker', AusbildungBeginn: '2024-09-01', AusbildungEnde: '2027-08-31' },
    { Oid: 'a2', Name: 'Müller, Lena', Email: 'a2@x.de', Role: 'azubi', Department: 'Kaufmännische Ausbildung', Beruf: 'Industriekauffrau', AusbildungBeginn: null, AusbildungEnde: null },
  ];
  const pool = fakePool([["Role IN ('azubi','dhstudent') ORDER BY Name", alle]]);
  const rows = await A.sichtbareAzubis(pool, { oid: 'admin-oid', role: 'admin' });
  assert.deepEqual(rows.map(r => r.Oid), ['a1', 'a2']);
  // Der Report braucht den Ausbildungsrahmen in den Stammdaten.
  assert.equal(rows[0].AusbildungBeginn, '2024-09-01');
  assert.ok(pool.queries.some(q => q.includes('AusbildungBeginn') && q.includes('AusbildungEnde')));
});

test('sichtbareAzubis: leeres Ergebnis ohne user', async () => {
  assert.deepEqual(await A.sichtbareAzubis(fakePool([]), null), []);
});

test('sichtbareAzubis: kaufmaennische Leitung sieht nur den eigenen Bereich (inkl. DH) plus Dauer-Azubis', async () => {
  const leiter = {
    oid: 'leiter-oid', role: 'pruefer',
    istAusbildungsleiter: true, ausbildungsleiterBereich: 'kaufmaennisch',
  };
  const departments = [
    { Oid: 'kfm', Department: 'Kaufmännische Ausbildung' },
    { Oid: 'dh', Department: 'DH-Student' },
    { Oid: 'tech', Department: 'Gewerbliche Auszubildende' },
    { Oid: 'ohne', Department: null },
  ];
  // Zwei Detail-Abfragen unterscheiden sich nur im WHERE -> Routing ueber
  // die charakteristischen Fragmente.
  const pool = fakePool([
    ['FROM dbo.AusbilderAzubis', [{ AzubiOid: 'dauer' }]],
    ['FROM dbo.Vertretungen', []],
    ['SELECT Oid, Department', departments],            // Department-Scan der Leitung
    ['Aktiv = 1 AND Oid IN (', [
      { Oid: 'kfm', Name: 'Müller, Lena', Role: 'azubi', Department: 'Kaufmännische Ausbildung', Beruf: 'Industriekauffrau', AusbildungBeginn: '2024-09-01', AusbildungEnde: '2027-08-31' },
      { Oid: 'dh', Name: 'Hofer, Jana', Role: 'dhstudent', Department: 'DH-Student', Beruf: 'DH Maschinenbau', AusbildungBeginn: null, AusbildungEnde: null },
      { Oid: 'dauer', Name: 'Becker, Jonas', Role: 'azubi', Department: null, Beruf: 'Mechatroniker', AusbildungBeginn: null, AusbildungEnde: null },
    ]],
  ]);

  const rows = await A.sichtbareAzubis(pool, leiter);
  const oids = rows.map(r => r.Oid);
  assert.ok(oids.includes('kfm'), 'kaufmaennischer Azubi fehlt');
  assert.ok(oids.includes('dh'), 'DH-Student fehlt (zaehlt kaufmaennisch)');
  assert.ok(oids.includes('dauer'), 'dauerhaft zugeordneter Azubi fehlt');

  // Der technische Azubi darf NICHT in der IN-Liste stehen — das ist die
  // Grundlage des 403 im Report-Endpunkt.
  const detail = pool.queries.find(q => q.includes('Aktiv = 1 AND Oid IN ('));
  assert.ok(detail, 'Detail-Abfrage wurde nicht gestellt');
  assert.equal(rows.some(r => r.Oid === 'tech'), false);
});

test('sichtbareAzubis: Pruefer ohne Zuordnung und ohne Leiter-Tag sieht niemanden', async () => {
  const pool = fakePool([
    ['FROM dbo.AusbilderAzubis', []],
    ['FROM dbo.Vertretungen', []],
  ]);
  const rows = await A.sichtbareAzubis(pool, { oid: 'p', role: 'pruefer' });
  assert.deepEqual(rows, []);
  // Ohne Treffer darf keine Detail-Abfrage mit leerer IN-Liste rausgehen
  // (das waere ein SQL-Syntaxfehler).
  assert.equal(pool.queries.some(q => q.includes('Oid IN ()')), false);
});

test('dauerAzubiOids: leeres Array ohne user', async () => {
  assert.deepEqual(await A.dauerAzubiOids(fakePool([]), null), []);
  assert.deepEqual(await A.dauerAzubiOids(fakePool([]), {}), []);
});
