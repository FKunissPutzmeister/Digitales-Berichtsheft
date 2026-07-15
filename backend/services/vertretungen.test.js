'use strict';
/* Verifiziert das Herzstück der Vertretung: ladeKorrekturKontext uniert die
   Zugriffsquellen der aktiv Vertretenen in den Kontext des Vertreters – mit
   E-Mail-Rewrite (befristete Zuweisungen) und OID-Merge (Dauer-Zuordnung) –,
   sodass die REINE Logik (zugriff.js) den Vertreter durchlässt, ohne selbst
   angefasst worden zu sein. Fake-Pool, keine echte DB. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { ladeKorrekturKontext } = require('./zugriffContext.js');
const Z = require('./zugriff.js');

// Szenario: Linda (L, linda@) vertritt aktiv Anika (A, anika@).
// Anika hat eine befristete Zuweisung für Azubi X und eine Dauer-Zuordnung für Azubi Y.
function fakePool() {
  return {
    request() {
      const inputs = {};
      const api = {
        input(name, _type, val) { inputs[name] = val; return api; },
        query(sqlText) {
          let recordset = [];
          if (/FROM dbo\.Vertretungen/i.test(sqlText)) {
            recordset = [{ VertretenerOid: 'A' }];               // Linda vertritt Anika
          } else if (/FROM dbo\.Users/i.test(sqlText)) {
            recordset = [{ Email: 'anika@pm.com' }];              // Anikas E-Mail
          } else if (/FROM dbo\.Zuweisungen/i.test(sqlText)) {
            recordset = inputs.email === 'anika@pm.com'
              ? [{ AzubiOid: 'X', VerantwEmail: 'anika@pm.com', Von: '2026-01-01', Bis: '2026-12-31' }]
              : [];
          } else if (/FROM dbo\.AusbilderAzubis/i.test(sqlText)) {
            recordset = inputs.oid === 'A' ? [{ AzubiOid: 'Y' }] : [];
          }
          return Promise.resolve({ recordset });
        },
      };
      return api;
    },
  };
}

test('ladeKorrekturKontext: delegierte Zuweisung wird auf die E-Mail des Vertreters umgeschrieben', async () => {
  const linda = { oid: 'L', email: 'linda@pm.com' };
  const kontext = await ladeKorrekturKontext(fakePool(), linda);

  const zX = kontext.zuweisungen.find(z => z.azubiOid === 'X');
  assert.ok(zX, 'delegierte Zuweisung für Azubi X ist im Kontext');
  assert.equal(zX.verantwortlicherEmail, 'linda@pm.com', 'E-Mail auf den Vertreter umgeschrieben');
  assert.ok(kontext.dauerAusbilderAzubiOids.includes('Y'), 'delegierte Dauer-Zuordnung (Y) ist im Kontext');
});

test('darfWocheKorrigieren: Vertreter darf Wochen der Vertretenen korrigieren (reine Logik unverändert)', async () => {
  const linda = { oid: 'L', email: 'linda@pm.com' };
  const kontext = await ladeKorrekturKontext(fakePool(), linda);

  // Befristete Delegation (über E-Mail-Rewrite): Woche von Azubi X.
  const wocheX = { azubiOid: 'X', start: '2026-03-02', ende: '2026-03-08' };
  assert.equal(Z.darfWocheKorrigieren(linda, wocheX, kontext), true);

  // Dauer-Delegation (über OID): Woche von Azubi Y, ohne Datumsprüfung.
  const wocheY = { azubiOid: 'Y', start: '2020-01-06', ende: '2020-01-12' };
  assert.equal(Z.darfWocheKorrigieren(linda, wocheY, kontext), true);

  // Kontrolle: fremder Azubi Z bleibt gesperrt.
  const wocheZ = { azubiOid: 'Z', start: '2026-03-02', ende: '2026-03-08' };
  assert.equal(Z.darfWocheKorrigieren(linda, wocheZ, kontext), false);
});
