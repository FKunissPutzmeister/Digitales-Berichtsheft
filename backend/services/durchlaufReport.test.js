'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./durchlaufReport.js');

/* ── pruefeAnfrage (rein) ─────────────────────────────────────────── */

test('pruefeAnfrage: Happy Path dedupliziert die OIDs und behaelt den Zeitraum', () => {
  const r = R.pruefeAnfrage({
    azubiOids: ['a-1', 'a-2', 'a-1'], von: '2025-09-01', bis: '2026-08-31',
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.azubiOids, ['a-1', 'a-2']);
  assert.equal(r.von, '2025-09-01');
  assert.equal(r.bis, '2026-08-31');
});

test('pruefeAnfrage: gleicher Tag fuer Von und Bis ist gueltig', () => {
  assert.equal(R.pruefeAnfrage({ azubiOids: ['a'], von: '2026-01-05', bis: '2026-01-05' }).ok, true);
});

test('pruefeAnfrage: leere Liste, kein Array, leerer Body -> Fehler', () => {
  for (const body of [null, {}, { azubiOids: [] }, { azubiOids: 'a-1' }]) {
    const r = R.pruefeAnfrage(body ? { von: '2026-01-01', bis: '2026-01-31', ...body } : body);
    assert.equal(r.ok, false, `unerwartet ok fuer ${JSON.stringify(body)}`);
    assert.ok(r.fehler, 'Fehlertext fehlt');
  }
});

test('pruefeAnfrage: mehr als 200 OIDs werden abgewiesen (kein unbegrenzter Bulk)', () => {
  const viele = Array.from({ length: 201 }, (_, i) => `oid-${i}`);
  const r = R.pruefeAnfrage({ azubiOids: viele, von: '2026-01-01', bis: '2026-01-31' });
  assert.equal(r.ok, false);
  assert.match(r.fehler, /200/);
});

test('pruefeAnfrage: genau 200 OIDs gehen noch durch', () => {
  const viele = Array.from({ length: 200 }, (_, i) => `oid-${i}`);
  assert.equal(R.pruefeAnfrage({ azubiOids: viele, von: '2026-01-01', bis: '2026-01-31' }).ok, true);
});

test('pruefeAnfrage: zu lange OID (kein GUID) wird abgewiesen', () => {
  const r = R.pruefeAnfrage({ azubiOids: ['x'.repeat(37)], von: '2026-01-01', bis: '2026-01-31' });
  assert.equal(r.ok, false);
});

test('pruefeAnfrage: Datum muss strikt YYYY-MM-DD sein', () => {
  for (const [von, bis] of [['1.1.2026', '2026-01-31'], ['2026-01-01', '31.01.2026'],
                            ['', '2026-01-31'], ['2026-01-01', null], ['2026-13-01', '2026-01-31']]) {
    const r = R.pruefeAnfrage({ azubiOids: ['a'], von, bis });
    assert.equal(r.ok, false, `unerwartet ok fuer ${von} / ${bis}`);
  }
});

test('pruefeAnfrage: Bis vor Von wird abgewiesen', () => {
  const r = R.pruefeAnfrage({ azubiOids: ['a'], von: '2026-08-31', bis: '2026-01-01' });
  assert.equal(r.ok, false);
  assert.match(r.fehler, /Von/);
});

/* ── bereinigeBeurteilung (rein) ──────────────────────────────────── */

const ABGESCHLOSSEN = {
  BeurteilungId: 7, Status: 'abgeschlossen', Typ: 'gross', Note: 2.3, GesamtPunkte: 78,
  AbgeschlossenAm: '2026-03-01T00:00:00.000Z', IndividuelleBeurteilung: 'Sehr selbststaendig.',
  KurzfeedbackEindruck: null, KurzfeedbackEmpfehlung: null,
};

test('bereinigeBeurteilung: null ohne Beurteilungszeile', () => {
  assert.equal(R.bereinigeBeurteilung({ Id: 1, BeurteilungId: null }), null);
  assert.equal(R.bereinigeBeurteilung({}), null);
});

test('bereinigeBeurteilung: abgeschlossen behaelt Note, Punkte und Text', () => {
  const b = R.bereinigeBeurteilung(ABGESCHLOSSEN);
  assert.equal(b.id, 7);
  assert.equal(b.status, 'abgeschlossen');
  assert.equal(b.typ, 'gross');
  assert.equal(b.note, 2.3);
  assert.equal(b.gesamtPunkte, 78);
  assert.equal(b.individuelleBeurteilung, 'Sehr selbststaendig.');
});

test('bereinigeBeurteilung: Entwurf nullt Note und ALLE Texte (zweite Absicherung zum SQL-CASE)', () => {
  // Genau der Fall, der nie aufs Papier darf: ein Entwurfstext, den der
  // Verantwortliche noch nicht freigegeben hat.
  const b = R.bereinigeBeurteilung({ ...ABGESCHLOSSEN, Status: 'entwurf' });
  assert.equal(b.status, 'entwurf');
  assert.equal(b.typ, 'gross');
  assert.equal(b.id, 7);
  assert.equal(b.note, null);
  assert.equal(b.gesamtPunkte, null);
  assert.equal(b.abgeschlossenAm, null);
  assert.equal(b.individuelleBeurteilung, null);
  assert.equal(b.kurzfeedbackEindruck, null);
  assert.equal(b.kurzfeedbackEmpfehlung, null);
});

test('bereinigeBeurteilung: Typ faellt auf gross zurueck, Note kommt als Zahl', () => {
  const b = R.bereinigeBeurteilung({ ...ABGESCHLOSSEN, Typ: null, Note: '1.7' });
  assert.equal(b.typ, 'gross');
  assert.equal(b.note, 1.7);
});

/* ── formeStation (rein) ──────────────────────────────────────────── */

test('formeStation: Date-Objekte werden zu YYYY-MM-DD, Bis bleibt null', () => {
  const s = R.formeStation({
    Id: 42, Abteilung: 'Konstruktion',
    Von: new Date('2026-01-05T00:00:00.000Z'), Bis: null,
    VerantwName: 'Lengerer, Matthias', VerantwEmail: 'm.l@x.de', BeurteilungId: null,
  });
  assert.equal(s.id, 42);
  assert.equal(s.abteilung, 'Konstruktion');
  assert.equal(s.von, '2026-01-05');
  assert.equal(s.bis, null);
  assert.equal(s.verantwName, 'Lengerer, Matthias');
  assert.equal(s.verantwEmail, 'm.l@x.de');
  assert.equal(s.beurteilung, null);
});

test('formeStation: ohne VerantwName bleibt das Feld leer (Client faellt auf die E-Mail zurueck)', () => {
  const s = R.formeStation({ Id: 1, Abteilung: 'IT', Von: '2026-02-01', Bis: '2026-03-01',
    VerantwName: null, VerantwEmail: 'x@y.de', BeurteilungId: null });
  assert.equal(s.verantwName, null);
  assert.equal(s.bis, '2026-03-01');
});

/* ── ladeReport (unrein, Fake-Pool) ──────────────────────────────── */

function fakePool(zuweisungsZeilen, sichtbar) {
  const state = { queries: [], inputs: [] };
  const pool = {
    state,
    request() {
      const api = {
        input(name, typ, wert) { state.inputs.push([name, wert]); return api; },
        query(text) {
          state.queries.push(text);
          if (text.includes('FROM dbo.Zuweisungen')) return Promise.resolve({ recordset: zuweisungsZeilen });
          if (text.includes('FROM dbo.Users')) return Promise.resolve({ recordset: sichtbar });
          return Promise.resolve({ recordset: [] });
        },
      };
      return api;
    },
  };
  return pool;
}

const SICHTBAR = [
  { Oid: 'a-1', Name: 'Müller, Lena', Email: 'l@x.de', Role: 'azubi',
    Department: 'Kaufmännische Ausbildung', Beruf: 'Industriekauffrau',
    AusbildungBeginn: '2024-09-01', AusbildungEnde: '2027-08-31' },
];

test('ladeReport: wirft 403 mit unzulaessig, wenn eine OID nicht sichtbar ist', async () => {
  const pool = fakePool([], SICHTBAR);
  const leiter = { oid: 'l', role: 'pruefer', name: 'Leiter, Lea',
    istAusbildungsleiter: true, ausbildungsleiterBereich: 'kaufmaennisch' };
  await assert.rejects(
    () => R.ladeReport(pool, leiter, { azubiOids: ['a-1', 'fremd-oid'], von: '2025-09-01', bis: '2026-08-31' }),
    err => {
      assert.equal(err.status, 403);
      assert.deepEqual(err.unzulaessig, ['fremd-oid']);
      return true;
    });
});

test('ladeReport: liefert Azubis mit Stationen, offenes Bis bleibt in der Abfrage beruecksichtigt', async () => {
  const zeilen = [
    { Id: 10, AzubiOid: 'a-1', Abteilung: 'Einkauf', Von: new Date('2025-10-01T00:00:00Z'),
      Bis: new Date('2025-12-31T00:00:00Z'), VerantwEmail: 'e@x.de', VerantwName: 'Eins, Erik',
      BeurteilungId: 1, Status: 'abgeschlossen', Typ: 'gross', AbgeschlossenAm: '2026-01-05',
      Note: 2.0, GesamtPunkte: 82, IndividuelleBeurteilung: 'Gut.',
      KurzfeedbackEindruck: null, KurzfeedbackEmpfehlung: null },
    { Id: 11, AzubiOid: 'a-1', Abteilung: 'Vertrieb', Von: new Date('2026-01-01T00:00:00Z'),
      Bis: null, VerantwEmail: 'z@x.de', VerantwName: null,
      BeurteilungId: null, Status: null, Typ: null, AbgeschlossenAm: null,
      Note: null, GesamtPunkte: null, IndividuelleBeurteilung: null,
      KurzfeedbackEindruck: null, KurzfeedbackEmpfehlung: null },
  ];
  const pool = fakePool(zeilen, SICHTBAR);
  const admin = { oid: 'ad', role: 'admin', name: 'Verwaltung, Admin' };
  const data = await R.ladeReport(pool, admin, { azubiOids: ['a-1'], von: '2025-09-01', bis: '2026-08-31' });

  assert.equal(data.von, '2025-09-01');
  assert.equal(data.bis, '2026-08-31');
  assert.match(data.stand, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(data.erstelltVon.oid, 'ad');
  assert.equal(data.erstelltVon.name, 'Verwaltung, Admin');   // DB-Format, Client dreht

  assert.equal(data.azubis.length, 1);
  const az = data.azubis[0];
  assert.equal(az.oid, 'a-1');
  assert.equal(az.name, 'Müller, Lena');
  assert.equal(az.ausbildungsBeginn, '2024-09-01');
  assert.equal(az.ausbildungsEnde, '2027-08-31');
  assert.equal(az.stationen.length, 2);
  assert.equal(az.stationen[0].beurteilung.note, 2);
  assert.equal(az.stationen[1].bis, null);
  assert.equal(az.stationen[1].beurteilung, null);

  // Eine offene Station (Bis IS NULL) darf nicht aus dem Zeitraumfilter
  // fallen — sonst fehlt genau die laufende Abteilung im Report.
  const q = pool.state.queries.find(t => t.includes('FROM dbo.Zuweisungen'));
  assert.ok(q.includes('Bis IS NULL OR'), 'Zeitraumfilter ignoriert offene Zuweisungen');
  assert.ok(q.includes('COALESCE(z.VerantwName'), 'VerantwName-Fallback auf Users.Name fehlt');
  // Texte werden zusaetzlich schon in SQL auf abgeschlossene Beurteilungen begrenzt.
  assert.ok(q.includes("b.Status='abgeschlossen'"));
});

test('ladeReport: Azubi ohne Zuweisung im Zeitraum erscheint mit leerer Stationsliste', async () => {
  const pool = fakePool([], SICHTBAR);
  const admin = { oid: 'ad', role: 'admin', name: 'Verwaltung, Admin' };
  const data = await R.ladeReport(pool, admin, { azubiOids: ['a-1'], von: '2025-09-01', bis: '2026-08-31' });
  assert.equal(data.azubis.length, 1);
  assert.deepEqual(data.azubis[0].stationen, []);
});
