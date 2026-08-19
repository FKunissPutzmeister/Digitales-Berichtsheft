'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildExportModel } = require('./abteilungsplaner-export.js');

// AJ 2025/26 (01.09.2025 – 31.08.2026), "heute" = 15.01.2026
const input = () => ({
  ajStartYear: 2025,
  heute: '2026-01-15',
  personen: [
    { id: 'p1', nachname: 'Muster', vorname: 'Max', beruf: 'FI', typ: 'Azubi', gruppe: 'Zugewiesen', email: 'm@x', aktiv: true, ausbildungVon: '2025-09-01', ausbildungBis: '2028-08-31' },
    { id: 'p2', nachname: 'Ohne', vorname: 'Anna', beruf: 'IK', typ: 'DH-Student', gruppe: 'Ohne Zuordnung', email: '', aktiv: true, ausbildungVon: '', ausbildungBis: '' },
  ],
  zuweisungen: [
    { id: 'z1', personId: 'p1', abteilung: 'IT',      von: '2025-09-01', bis: '2025-11-30', verantwEmail: 'a@pm.com', verantwName: 'Anton A' },
    { id: 'z2', personId: 'p1', abteilung: 'Einkauf', von: '2026-01-01', bis: '2026-03-31', verantwEmail: 'a@pm.com', verantwName: 'Anton A' },
    { id: 'z3', personId: 'p1', abteilung: 'Altbau',  von: '2026-03-01', bis: '2026-04-30', verantwEmail: '',         verantwName: '' },
  ],
  abteilungen: [
    { name: 'IT', istPmm: false, aktiv: true, farbe: '#4F9D9A', verantwortliche: [{ email: 'a@pm.com', name: 'Anton A' }] },
    { name: 'Einkauf', istPmm: true, aktiv: true, farbe: '#5B86C2', verantwortliche: [] },
  ],
});

test('Status, Dauer, Überschneidung und Lücke je Zuweisung', () => {
  const m = buildExportModel(input());
  const byId = Object.fromEntries(m.zuweisungen.map(z => [z.id, z]));

  assert.equal(byId.z1.status, 'Beendet');
  assert.equal(byId.z2.status, 'Aktuell');       // 01.01. – 31.03. umfasst den 15.01.
  assert.equal(byId.z3.status, 'Zukünftig');

  assert.equal(byId.z1.dauer, 91);               // Sep 30 + Okt 31 + Nov 30
  assert.equal(byId.z2.dauer, 90);               // Jan 31 + Feb 28 + Mär 31

  // z2 (01.01.–31.03.) und z3 (01.03.–30.04.) überlappen im März
  assert.equal(byId.z2.konflikte, 1);
  assert.equal(byId.z3.konflikte, 1);
  assert.equal(byId.z1.konflikte, 0);

  // Lücke 01.12.2025 – 31.12.2025 = 31 ungeplante Tage vor z2
  assert.equal(byId.z1.lueckeDavor, null);
  assert.equal(byId.z2.lueckeDavor, 31);
});

test('Personen-Aggregate und Monatsbelegung', () => {
  const m = buildExportModel(input());
  const [p1, p2] = m.personen;

  assert.equal(p1.anzahlZuw, 3);
  assert.equal(p1.abteilungenAnzahl, 3);
  assert.equal(p1.aktuelleAbteilung, 'Einkauf');
  assert.equal(p1.naechsteAbteilung, 'Altbau');
  assert.equal(p1.letzteAbteilung, 'IT');
  assert.equal(p1.tageImAj, 91 + 90 + 61);       // alles innerhalb 09/25–08/26

  assert.equal(p2.anzahlZuw, 0);
  assert.equal(p2.aktuelleAbteilung, '');
  assert.equal(p2.tageImAj, 0);

  // Monatsraster startet im September, März geht an Einkauf (31 Tage > Altbau 31? → mehr Tage gewinnt)
  assert.equal(m.monate[0].label, 'Sep 25');
  assert.equal(m.monate[11].label, 'Aug 26');
  assert.equal(p1.monate[0].abteilung, 'IT');        // Sep 25
  assert.equal(p1.monate[3], null);                  // Dez 25 = Lücke
  assert.equal(p1.monate[4].abteilung, 'Einkauf');   // Jan 26
  assert.equal(p1.monate[7].abteilung, 'Altbau');    // Apr 26 (nur Altbau)
});

test('Abteilungen ergänzen verplante Namen ohne Katalogeintrag; Verantwortliche werden aggregiert', () => {
  const m = buildExportModel(input());
  const abt = Object.fromEntries(m.abteilungen.map(a => [a.name, a]));

  assert.deepEqual(m.abteilungen.map(a => a.name), ['Altbau', 'Einkauf', 'IT']);
  assert.equal(abt.Altbau.nichtImKatalog, true);
  assert.equal(abt.IT.anzahlZuw, 1);
  assert.equal(abt.IT.anzahlPersonen, 1);
  assert.equal(abt.IT.tageGeplant, 91);
  assert.equal(abt.IT.verantwText, 'Anton A');

  const v = m.verantwortliche.find(x => x.email === 'a@pm.com');
  assert.equal(v.anzahlZuw, 2);
  assert.equal(v.anzahlPersonen, 1);
  assert.equal(v.tageGeplant, 181);
  assert.equal(v.abteilungenText, 'Einkauf, IT');
});
