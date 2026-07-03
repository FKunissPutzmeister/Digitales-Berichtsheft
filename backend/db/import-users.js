'use strict';
/* CSV-Bootstrap: befüllt dbo.Users aus einer vom Azure-Kollegen gelieferten
   CSV. Aufruf:  node backend/db/import-users.js <pfad-zur-csv>
   Erwartete Spalten (Header): oid,email,name,role[,beruf,beginn,ende,berichtTyp] */
const fs = require('node:fs');

function parseUsersCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',').map((c) => c.trim());
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

async function main() {
  require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
  const { upsertUser } = require('../services/users');
  const file = process.argv[2];
  if (!file) { console.error('Usage: node backend/db/import-users.js <csv>'); process.exit(2); }
  const rows = parseUsersCsv(fs.readFileSync(file, 'utf8'));
  let n = 0;
  for (const r of rows) {
    if (!r.oid) continue;
    await upsertUser({
      oid: r.oid, name: r.name, email: (r.email || '').toLowerCase(),
      role: r.role || 'azubi', beruf: r.beruf || null,
      ausbildungBeginn: r.beginn || null, ausbildungEnde: r.ende || null,
      berichtTyp: r.berichtTyp || null,
    });
    n++;
  }
  console.log(`Import: ${n} Nutzer verarbeitet.`);
  process.exit(0);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });

module.exports = { parseUsersCsv };
