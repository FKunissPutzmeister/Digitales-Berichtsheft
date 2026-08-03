'use strict';
/* Regressionstest zum Static-Guard (siehe middleware/static-guard.js).
   Hintergrund: der frühere Guard verglich den ROHEN URL-String und war
   dadurch umgehbar — "//backend/data/backups/<tag>/_manifest.json" und
   "/app/%2e%2e/backend/..." lieferten unangemeldet komplette Snapshots
   (Name, E-Mail, alle Wocheninhalte) aus. Diese Varianten müssen für
   immer 404 bleiben. Kein Server, kein Netz: reine Pfadlogik. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { istGesperrterPfad } = require('./middleware/static-guard.js');

// Repo-Wurzel, genau wie server.js sie bildet.
const ROOT = path.join(__dirname, '..');
const gesperrt = (p) => istGesperrterPfad(p, ROOT);

test('static-guard: der direkte /backend-Pfad bleibt gesperrt', () => {
  assert.equal(gesperrt('/backend'), true);
  assert.equal(gesperrt('/backend/'), true);
  assert.equal(gesperrt('/backend/.env'), true);
  assert.equal(gesperrt('/backend/data/backups/2026-08-03/_manifest.json'), true);
  assert.equal(gesperrt('/backend/data/ihk-imports/irgendwas.pdf'), true);
});

test('static-guard: doppelter Schrägstrich rutscht nicht mehr durch', () => {
  assert.equal(gesperrt('//backend/data/backups/2026-08-03/_manifest.json'), true);
  assert.equal(gesperrt('///backend/.env'), true);
  assert.equal(gesperrt('//backend'), true);
});

test('static-guard: kodierte Traversal-Varianten rutschen nicht mehr durch', () => {
  assert.equal(gesperrt('/app/%2e%2e/backend/data/backups/2026-08-03/_manifest.json'), true);
  assert.equal(gesperrt('/app/..%2fbackend/.env'), true);
  assert.equal(gesperrt('/app/%2e%2e%2fbackend/.env'), true);
  assert.equal(gesperrt('/%2e%2e%2fbackend/.env'), true);
  assert.equal(gesperrt('/app/../backend/.env'), true);
  assert.equal(gesperrt('/%62ackend/.env'), true);         // 'b' kodiert
});

test('static-guard: Groß-/Kleinschreibung hilft nicht (Windows-Dateisystem)', () => {
  assert.equal(gesperrt('/BACKEND/data/backups/2026-08-03/_manifest.json'), true);
  assert.equal(gesperrt('/BackEnd/.env'), true);
  assert.equal(gesperrt('//BACKEND/data/x.json'), true);
  assert.equal(gesperrt('/.GIT/config'), true);
  assert.equal(gesperrt('/Node_Modules/express/package.json'), true);
});

test('static-guard: Backslash gilt unter Windows als Trenner', () => {
  assert.equal(gesperrt('/app\\..\\backend\\.env'), true);
  assert.equal(gesperrt('\\backend\\.env'), true);
});

test('static-guard: .git und node_modules bleiben gesperrt, auch verschachtelt', () => {
  assert.equal(gesperrt('/.git/config'), true);
  assert.equal(gesperrt('/.git/HEAD'), true);
  assert.equal(gesperrt('/node_modules/express/package.json'), true);
  assert.equal(gesperrt('/app/node_modules/heimlich.js'), true);
  assert.equal(gesperrt('/silk-react/.git/config'), true);
});

test('static-guard: Pfade außerhalb der Wurzel werden abgelehnt', () => {
  assert.equal(gesperrt('/../geheim.txt'), true);
  assert.equal(gesperrt('/app/../../geheim.txt'), true);
});

test('static-guard: kaputte Prozentkodierung wirft nicht, sondern sperrt', () => {
  assert.doesNotThrow(() => gesperrt('/app/%zz/x.js'));
  assert.equal(gesperrt('/app/%zz/x.js'), true);
  assert.equal(gesperrt('/app/%2'), true);
  assert.equal(gesperrt('/app/js/api%00.js'), true);   // NUL-Byte
});

test('static-guard: legitime Frontend-Pfade bleiben erlaubt', () => {
  assert.equal(gesperrt('/app/js/api.js'), false);
  assert.equal(gesperrt('/app/profil.html'), false);
  assert.equal(gesperrt('/index.html'), false);
  assert.equal(gesperrt('/'), false);
  assert.equal(gesperrt('/app/css/variables.css'), false);
  assert.equal(gesperrt('/Corporate Design/logo.png'), false);
  assert.equal(gesperrt('/app/img/pdf-logo.png'), false);
  // Umlaute/Leerzeichen als Prozentkodierung müssen weiter durchgehen
  assert.equal(gesperrt('/Corporate%20Design/logo.png'), false);
});

test('static-guard: "backend" nur als ganzes Segment, nicht als Präfix', () => {
  assert.equal(gesperrt('/app/backendinfo.js'), false);
  assert.equal(gesperrt('/backendXY/datei.js'), false);
  assert.equal(gesperrt('/app/js/backend-api.js'), false);
  assert.equal(gesperrt('/node_modules_alt/x.js'), false);
  assert.equal(gesperrt('/.gitignore'), false);
});
