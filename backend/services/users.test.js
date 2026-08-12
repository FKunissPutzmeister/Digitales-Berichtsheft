'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRoleClaim, buildReqUser, validateUserPatch, landingPathForUser, setUsersAktiv, updateUserProfile } = require('./users');

const ROLE_URI = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';

test('parseRoleClaim liest String-Claim', () => {
  assert.equal(parseRoleClaim({ [ROLE_URI]: 'azubi' }), 'azubi');
  assert.equal(parseRoleClaim({ [ROLE_URI]: 'pruefer' }), 'pruefer');
});

test('parseRoleClaim nimmt bei Array die erste bekannte Rolle', () => {
  assert.equal(parseRoleClaim({ [ROLE_URI]: ['pruefer', 'irgendwas'] }), 'pruefer');
});

test('parseRoleClaim gibt null ohne/bei unbekanntem Claim', () => {
  assert.equal(parseRoleClaim({}), null);
  assert.equal(parseRoleClaim({ [ROLE_URI]: 'fremd' }), null);
  assert.equal(parseRoleClaim(null), null);
});

test('buildReqUser leitet Azubi-Flags + Profilfelder ab', () => {
  const u = buildReqUser({ Oid: 'g1', Name: 'A', Email: 'a@b.de', Role: 'azubi', KannPlanen: false, IstAusbilder: false, Beruf: 'Mechatroniker' });
  assert.equal(u.istAzubi, true);
  assert.equal(u.istAusbilder, false);
  assert.equal(u.kannPlanen, false);
  assert.equal(u.istDhStudent, false);
  assert.equal(u.beruf, 'Mechatroniker');
  assert.equal(u.berichtTyp, 'wöchentlich'); // Default ohne BerichtTyp-Spalte
});

test('buildReqUser: pruefer bekommt Korrektur-Zugang automatisch', () => {
  const u = buildReqUser({ Oid: 'g2', Role: 'pruefer', KannPlanen: false, IstAusbilder: false });
  assert.equal(u.istAusbilder, true);
  assert.equal(u.istAzubi, false);
});

test('buildReqUser: IstAusbilder-Spalte ist additiver Grant', () => {
  const u = buildReqUser({ Oid: 'g3', Role: 'admin', KannPlanen: true, IstAusbilder: true });
  assert.equal(u.istAusbilder, true);
  assert.equal(u.kannPlanen, true);
});

test('buildReqUser: developer bekommt Dev-Flags, aber NICHT automatisch istAzubi/istDhStudent', () => {
  const u = buildReqUser({ Oid: 'g4', Role: 'developer', KannPlanen: false, IstAusbilder: false });
  assert.equal(u.kannPlanen, true);
  assert.equal(u.istAusbilder, true);
  assert.equal(u.istAzubi, false); // Developer ist NICHT automatisch Azubi — nur mit IstAzubi-Tag
  assert.equal(u.istDhStudent, false);
});

test('buildReqUser: IstAzubi-Spalte ist additiver Azubi-Grant (z.B. Developer, der ein Heft führt)', () => {
  const u = buildReqUser({ Oid: 'g4b', Role: 'developer', KannPlanen: false, IstAusbilder: false, IstAzubi: true });
  assert.equal(u.istAzubi, true);
  assert.equal(u.istAusbilder, true); // Dev-Flags bleiben erhalten
});

test('buildReqUser(null) gibt null', () => {
  assert.equal(buildReqUser(null), null);
});

test('validateUserPatch akzeptiert erlaubte Felder/Werte', () => {
  assert.deepEqual(validateUserPatch({ role: 'pruefer', berichtTyp: 'täglich', kannPlanen: true }), { ok: true });
});

test('validateUserPatch lehnt unbekannte Rolle ab', () => {
  assert.equal(validateUserPatch({ role: 'chef' }).ok, false);
});

test('validateUserPatch lehnt unbekanntes Feld ab', () => {
  assert.equal(validateUserPatch({ gehalt: 999 }).ok, false);
});

test('validateUserPatch lehnt ungültigen berichtTyp ab', () => {
  assert.equal(validateUserPatch({ berichtTyp: 'monatlich' }).ok, false);
});

test('validateUserPatch lehnt leeren Patch ab', () => {
  assert.equal(validateUserPatch({}).ok, false);
});

test('buildReqUser: dhstudent positiv', () => {
  const u = buildReqUser({ Oid: 'g5', Role: 'dhstudent', KannPlanen: false, IstAusbilder: false });
  assert.equal(u.istDhStudent, true);
  assert.equal(u.istAzubi, false);
});

test('buildReqUser: aktiv=false wird durchgereicht', () => {
  const u = buildReqUser({ Oid: 'g6', Role: 'azubi', Aktiv: false });
  assert.equal(u.aktiv, false);
});

test('landingPathForUser: dhstudent → Abteilungsdurchlauf, sonst Dashboard', () => {
  assert.equal(landingPathForUser(buildReqUser({ Oid: 'g5', Role: 'dhstudent' })), '/app/abteilungsdurchlauf.html');
  assert.equal(landingPathForUser(buildReqUser({ Oid: 'g1', Role: 'azubi' })), '/app/dashboard.html');
  assert.equal(landingPathForUser(buildReqUser({ Oid: 'g2', Role: 'pruefer' })), '/app/dashboard.html');
  assert.equal(landingPathForUser(buildReqUser({ Oid: 'g3', Role: 'developer' })), '/app/dashboard.html');
  assert.equal(landingPathForUser(null), '/app/dashboard.html');
});

/* ── Löschkonzept: Stichtag InaktivSeit ─────────────────────────
   Fake-Pool statt echter DB (Muster wie vertretungen.test.js): wir prüfen
   das erzeugte SQL, nicht das DB-Ergebnis. */

function fakePool() {
  const calls = [];
  return {
    calls,
    request() {
      const inputs = {};
      const api = {
        input(name, _typ, val) { inputs[name] = val; return api; },
        query(text) { calls.push({ sql: text, inputs }); return Promise.resolve({ rowsAffected: [1] }); },
      };
      return api;
    },
  };
}

test('setUsersAktiv: Deaktivieren stempelt InaktivSeit, ohne einen bestehenden Stempel zu ueberschreiben', async () => {
  const pool = fakePool();
  await setUsersAktiv(['g1', 'g2'], false, pool);

  assert.equal(pool.calls.length, 1);
  const { sql: text, inputs } = pool.calls[0];
  assert.equal(inputs.aktiv, 0);
  assert.equal(inputs.o0, 'g1');
  assert.equal(inputs.o1, 'g2');
  // COALESCE ist der Kern: der Entra-Sync ruft das bei jedem Lauf erneut auf.
  // Ein blindes SYSUTCDATETIME() wuerde die Frist ewig nach hinten schieben.
  assert.match(text, /COALESCE\(InaktivSeit, SYSUTCDATETIME\(\)\)/);
  assert.match(text, /Oid IN \(@o0,@o1\)/);
});

test('setUsersAktiv: Reaktivieren leert InaktivSeit', async () => {
  const pool = fakePool();
  await setUsersAktiv(['g1'], true, pool);

  const { sql: text, inputs } = pool.calls[0];
  assert.equal(inputs.aktiv, 1);
  // Ein CASE deckt beide Richtungen in einer Anweisung ab.
  assert.match(text, /WHEN @aktiv = 0 THEN COALESCE\(InaktivSeit, SYSUTCDATETIME\(\)\) ELSE NULL END/);
});

test('setUsersAktiv: leere Liste macht keinen DB-Aufruf', async () => {
  const pool = fakePool();
  assert.equal(await setUsersAktiv([], false, pool), 0);
  assert.equal(pool.calls.length, 0);
});

test('updateUserProfile: manuelles Deaktivieren stempelt InaktivSeit ebenfalls', async () => {
  const pool = fakePool();
  await updateUserProfile('g1', { aktiv: false }, pool);

  const { sql: text, inputs } = pool.calls[0];
  assert.equal(inputs.aktiv, false);
  assert.match(text, /Aktiv = @aktiv/);
  assert.match(text, /InaktivSeit = CASE WHEN @aktiv = 0 THEN COALESCE\(InaktivSeit, SYSUTCDATETIME\(\)\) ELSE NULL END/);
});

test('updateUserProfile: ohne aktiv-Feld wird InaktivSeit nicht angefasst', async () => {
  const pool = fakePool();
  await updateUserProfile('g1', { beruf: 'Mechatroniker' }, pool);

  const { sql: text } = pool.calls[0];
  assert.match(text, /Beruf = @beruf/);
  assert.ok(!/InaktivSeit/.test(text), 'InaktivSeit darf hier nicht vorkommen');
});

test('validateUserPatch akzeptiert loeschsperreBis', () => {
  assert.equal(validateUserPatch({ loeschsperreBis: '2027-01-01' }).ok, true);
  assert.equal(validateUserPatch({ loeschSperre: '2027-01-01' }).ok, false);
});

test('buildReqUser liefert inaktivSeit und loeschsperreBis', () => {
  const u = buildReqUser({
    Oid: 'g9', Name: 'Muster, Max', Role: 'azubi',
    InaktivSeit: '2026-01-15T02:00:00.000Z', LoeschsperreBis: '2027-03-01',
  });
  assert.equal(u.inaktivSeit, '2026-01-15T02:00:00.000Z');
  assert.equal(u.loeschsperreBis, '2027-03-01');
});

test('buildReqUser: fehlende Loeschkonzept-Spalten ergeben null', () => {
  const u = buildReqUser({ Oid: 'g10', Role: 'pruefer' });
  assert.equal(u.inaktivSeit, null);
  assert.equal(u.loeschsperreBis, null);
});
