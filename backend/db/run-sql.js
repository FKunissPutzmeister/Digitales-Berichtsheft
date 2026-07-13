'use strict';
/* Führt eine SQL-Datei (eine Batch, kein GO) gegen die konfigurierte DB aus.
   Für idempotente Migrationen aus db/migrations/. Beispiel:
     node backend/db/run-sql.js ../../db/migrations/017_api_keys.sql
   Pfad ist relativ zum aktuellen Arbeitsverzeichnis ODER absolut.
   Liest die DB-Zugangsdaten aus backend/.env (gleich wie der Server). */
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getPool } = require('./connection');

async function main() {
  const arg = process.argv[2];
  if (!arg) { console.error('Nutzung: node run-sql.js <pfad-zur-sql-datei>'); process.exit(1); }
  const file = path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg);
  const text = fs.readFileSync(file, 'utf8');
  console.log('[run-sql] Datei:', file);
  const pool = await getPool();
  // .batch() gibt PRINT-Ausgaben über das 'info'-Event zurück.
  const req = pool.request();
  req.on('info', m => console.log('   ', m.message));
  await req.batch(text);
  console.log('[run-sql] Fertig.');
  await pool.close();
}

main().catch(err => { console.error('[run-sql] Fehler:', err.message); process.exit(1); });
