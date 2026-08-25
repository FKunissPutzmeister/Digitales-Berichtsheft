'use strict';
/* Tests zum Wartungsmodus (siehe middleware/wartung.js).

   Zweck des Modus: Während die Daten auf einen anderen Server umziehen, darf
   NIEMAND mehr schreiben — auch niemand mit einer bereits offenen Sitzung.
   Was in dieser Zeit noch eingetragen würde, wäre nach dem Umzug verloren.

   Zwei Fallen, die diese Tests festnageln:
   · Express routet standardmäßig case-INsensitiv. Ein Guard, der nur auf
     "/api" prüft, wäre über "/API/wochen" umgehbar — die Anfrage landet
     trotzdem bei der Route. Gleiche Lektion wie beim static-guard.
   · Der Status-Endpunkt MUSS erreichbar bleiben. Sperrt man ihn mit, kann
     die Login-Seite nicht erfahren, dass Wartung ist, und zeigt statt der
     Meldung einen unspezifischen Fehler.

   Reine Logik: kein Server, kein Netz. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { istWartungAktiv, istGesperrterPfad, wartungsGuard } = require('./wartung.js');

/* ── Schalter ──────────────────────────────────────────────────── */

test('wartung: nur WARTUNG=1 schaltet ein', () => {
  assert.equal(istWartungAktiv({ WARTUNG: '1' }), true);
  assert.equal(istWartungAktiv({ WARTUNG: ' 1 ' }), true, 'Leerzeichen aus der .env');
  assert.equal(istWartungAktiv({}), false);
  assert.equal(istWartungAktiv({ WARTUNG: '' }), false);
  assert.equal(istWartungAktiv({ WARTUNG: '0' }), false);
  assert.equal(istWartungAktiv({ WARTUNG: 'true' }), false, 'bewusst nur "1"');
});

/* ── Welche Pfade gesperrt werden ──────────────────────────────── */

test('wartung: API und MCP sind gesperrt', () => {
  assert.equal(istGesperrterPfad('/api/wochen'), true);
  assert.equal(istGesperrterPfad('/api/users/me'), true);
  assert.equal(istGesperrterPfad('/api'), true);
  assert.equal(istGesperrterPfad('/api/'), true);
  assert.equal(istGesperrterPfad('/mcp'), true);
  assert.equal(istGesperrterPfad('/mcp/tools'), true);
});

test('wartung: der SSO-Einstieg ist gesperrt', () => {
  // Sonst käme jemand per Lesezeichen an der gesperrten Login-Seite vorbei.
  assert.equal(istGesperrterPfad('/api/auth/saml/login'), true);
  assert.equal(istGesperrterPfad('/api/auth/saml/acs'), true);
});

test('wartung: Status und Logout bleiben offen', () => {
  // Status: die Login-Seite muss die Wartung melden können.
  assert.equal(istGesperrterPfad('/api/auth/saml/status'), false);
  // Logout: wer drin ist, soll wenigstens sauber hinauskommen.
  assert.equal(istGesperrterPfad('/api/auth/logout'), false);
});

test('wartung: Groß-/Kleinschreibung hilft nicht beim Umgehen', () => {
  // Express routet per Default case-insensitiv — /API/wochen erreicht die Route.
  assert.equal(istGesperrterPfad('/API/wochen'), true);
  assert.equal(istGesperrterPfad('/Api/Wochen'), true);
  assert.equal(istGesperrterPfad('/MCP'), true);
  // Umgekehrt darf die Ausnahme ebenfalls case-insensitiv greifen.
  assert.equal(istGesperrterPfad('/API/auth/saml/status'), false);
});

test('wartung: das Frontend bleibt erreichbar', () => {
  // Ohne die Login-Seite gäbe es keinen Ort für die Wartungsmeldung.
  assert.equal(istGesperrterPfad('/'), false);
  assert.equal(istGesperrterPfad('/app/index.html'), false);
  assert.equal(istGesperrterPfad('/app/css/variables.css'), false);
  assert.equal(istGesperrterPfad('/Corporate Design/Fonts/OpenSans-Variable.ttf'), false);
});

test('wartung: ähnlich benannte Pfade werden nicht mitgesperrt', () => {
  assert.equal(istGesperrterPfad('/apidoku'), false);
  assert.equal(istGesperrterPfad('/app/api-hilfe.html'), false);
  assert.equal(istGesperrterPfad('/mcpanleitung'), false);
});

/* ── Middleware-Verhalten ──────────────────────────────────────── */

function fakeRes() {
  const res = { code: null, body: null };
  res.status = (c) => { res.code = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.set = () => res;
  return res;
}

test('wartung: ausgeschaltet reicht der Guard alles durch', () => {
  const guard = wartungsGuard({ aktiv: false });
  let weiter = 0;
  const res = fakeRes();
  guard({ path: '/api/wochen', method: 'POST' }, res, () => { weiter += 1; });
  assert.equal(weiter, 1);
  assert.equal(res.code, null, 'keine Antwort, wenn der Modus aus ist');
});

test('wartung: eingeschaltet antwortet der Guard mit 503 und Kennzeichen', () => {
  const guard = wartungsGuard({ aktiv: true });
  let weiter = 0;
  const res = fakeRes();
  guard({ path: '/api/wochen', method: 'POST' }, res, () => { weiter += 1; });
  assert.equal(weiter, 0, 'die Route darf NICHT erreicht werden');
  assert.equal(res.code, 503);
  assert.equal(res.body.wartung, true, 'Kennzeichen, an dem das Frontend den Modus erkennt');
  assert.ok(res.body.error && res.body.error.length > 0, 'Meldung für den Nutzer');
});

test('wartung: eingeschaltet bleiben Frontend und Status durchlässig', () => {
  const guard = wartungsGuard({ aktiv: true });
  for (const pfad of ['/app/index.html', '/api/auth/saml/status', '/api/auth/logout']) {
    let weiter = 0;
    const res = fakeRes();
    guard({ path: pfad, method: 'GET' }, res, () => { weiter += 1; });
    assert.equal(weiter, 1, `${pfad} muss durchgelassen werden`);
    assert.equal(res.code, null);
  }
});

test('wartung: auch lesende Zugriffe werden gesperrt', () => {
  // Bewusste Entscheidung: Eine halb geladene Anwendung wäre verwirrender als
  // eine klare Wartungsmeldung. Das Frontend fängt den 503 zentral ab.
  const guard = wartungsGuard({ aktiv: true });
  let weiter = 0;
  const res = fakeRes();
  guard({ path: '/api/wochen', method: 'GET' }, res, () => { weiter += 1; });
  assert.equal(weiter, 0);
  assert.equal(res.code, 503);
});
