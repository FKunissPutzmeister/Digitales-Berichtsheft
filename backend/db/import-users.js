'use strict';
/* CSV-Bootstrap: befüllt dbo.Users aus einer vom Azure-Kollegen gelieferten
   CSV. Zwei Modi:

   1) Klassisch (eigene CSV mit Importer-Headern):
        node backend/db/import-users.js <pfad-zur-csv>
      Erwartete Spalten (Header): oid,email,name,role[,beruf,beginn,ende,berichtTyp]

   2) Entra-Gruppen-Export (rohe "Mitglieder herunterladen"-CSV aus dem
      Azure-Portal), Rolle fix pro Datei (= Quell-Gruppe):
        node backend/db/import-users.js --entra --role=azubi   azubi-gruppe.csv
        node backend/db/import-users.js --entra --role=pruefer pruefer-gruppe.csv
      Spalten werden tolerant (case-insensitiv, mit Alias-Fallbacks) gemappt:
        OID    ← id | objectId | Object Id
        Name   ← displayName | Display name
        E-Mail ← mail → sonst userPrincipalName

   Beide Modi rufen pro Zeile das bestehende upsertUser auf (idempotent, gleicher
   Schreibpfad wie SSO-Login). Alle importierten Nutzer sind aktiv (Aktiv=1 als
   Insert-Default in upsertUser; bestehendes Aktiv wird nicht angefasst). */
const fs = require('node:fs');

function stripBom(s) {
  return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

/* RFC-4180-nahe Feld-Zerlegung: berücksichtigt doppelt-quotierte Felder mit
   eingebetteten Kommas und verdoppelten Anführungszeichen (""). Azure-Exporte
   quotieren z.B. Abteilungsnamen mit Komma – ein naiver split(',') würde solche
   Zeilen zerreißen. */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur); cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function parseUsersCsv(text) {
  const lines = stripBom(text).split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

// Entra-Export-Spalten (case-insensitiv) → Importer-Felder.
const ENTRA_ALIASES = {
  oid:   ['id', 'objectid', 'object id', 'oid'],
  name:  ['displayname', 'display name', 'name'],
  email: ['mail', 'userprincipalname', 'user principal name', 'email', 'e-mail'],
};

function lowerKeys(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[String(k).trim().toLowerCase()] = v;
  return out;
}

function pick(lowered, aliases) {
  for (const a of aliases) {
    const v = lowered[a];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

// Eine rohe Entra-Zeile → upsertUser-Datensatz mit fixer Rolle.
function mapEntraRow(row, role) {
  const lowered = lowerKeys(row);
  return {
    oid:   pick(lowered, ENTRA_ALIASES.oid),
    name:  pick(lowered, ENTRA_ALIASES.name),
    email: pick(lowered, ENTRA_ALIASES.email).toLowerCase(),
    role,
  };
}

const ENTRA_ROLES = ['azubi', 'pruefer'];

function parseArgs(argv) {
  const flags = { entra: false, role: null };
  const positional = [];
  for (const a of argv) {
    if (a === '--entra') flags.entra = true;
    else if (a.startsWith('--role=')) flags.role = a.slice('--role='.length).toLowerCase();
    else positional.push(a);
  }
  return { flags, file: positional[0] };
}

function toRecords(rows, flags) {
  if (flags.entra) {
    return rows.map((r) => mapEntraRow(r, flags.role));
  }
  return rows.map((r) => ({
    oid: r.oid, name: r.name, email: (r.email || '').toLowerCase(),
    role: r.role || 'azubi', beruf: r.beruf || null,
    ausbildungBeginn: r.beginn || null, ausbildungEnde: r.ende || null,
    berichtTyp: r.berichtTyp || null,
  }));
}

async function main() {
  require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
  const { upsertUser } = require('../services/users');
  const { flags, file } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error('Usage:');
    console.error('  node backend/db/import-users.js <csv>');
    console.error('  node backend/db/import-users.js --entra --role=azubi|pruefer <entra-export.csv>');
    process.exit(2);
  }
  if (flags.entra && !ENTRA_ROLES.includes(flags.role)) {
    console.error('Im --entra-Modus ist --role=azubi|pruefer erforderlich.');
    process.exit(2);
  }

  const rows = parseUsersCsv(fs.readFileSync(file, 'utf8'));
  const records = toRecords(rows, flags);

  let n = 0, skipped = 0;
  for (const rec of records) {
    if (!rec.oid) { skipped++; continue; }
    await upsertUser(rec);
    n++;
  }
  console.log(`Import: ${n} Nutzer verarbeitet${skipped ? `, ${skipped} übersprungen (fehlende OID)` : ''}.`);
  process.exit(0);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });

module.exports = { parseUsersCsv, splitCsvLine, mapEntraRow, parseArgs, toRecords };
