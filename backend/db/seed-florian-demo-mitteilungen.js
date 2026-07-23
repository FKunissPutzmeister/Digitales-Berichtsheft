/* ===================================================================
   DEMO-SEED: Benachrichtigungen (Mitteilungen) für Florian Kern (Demo)
   -------------------------------------------------------------------
   Legt für florian.kern.demo@putzmeister.com ein realistisches Set an
   Azubi-Benachrichtigungen an (erstgenehmigt / abgelehnt), damit die
   Mitteilungen-Kachel + die Vollseite befüllt sind. Referenzierte Wochen
   werden angelegt, falls sie fehlen (so zeigt jede Mitteilung ein echtes
   „KW X/Y" und der Klick führt auf eine existierende Woche).

   Idempotent: löscht ZUERST alle Benachrichtigungen dieses Nutzers und
   legt sie neu an; Wochen werden nur ergänzt (bestehende bleiben unberührt).
   Nur Daten dieses einen Demo-Nutzers – keine Schema-Änderung.

   Ausführen (Backend-Verzeichnis):  node db/seed-florian-demo-mitteilungen.js
   =================================================================== */
require('dotenv').config();
const { getPool, sql } = require('./connection');

const EMAIL = 'florian.kern.demo@putzmeister.com';
const FROM  = '00000000-0000-0000-0000-000000000002'; // Matthias Lengerer (Prüfer, Demo)

// Newest first. status = Sollzustand der Woche (nur gesetzt, wenn die Woche
// neu angelegt wird – bestehende Wochen werden nicht überschrieben).
const NOTIFS = [
  { kw: 29, typ: 'erstgenehmigt', status: 'erstgenehmigt', agoH: 4,      gelesen: 0 },
  { kw: 28, typ: 'erstgenehmigt', status: 'erstgenehmigt', agoH: 28,     gelesen: 0 },
  { kw: 27, typ: 'abgelehnt',     status: 'abgelehnt',     agoH: 24 * 3, gelesen: 0 },
  { kw: 26, typ: 'erstgenehmigt', status: 'erstgenehmigt', agoH: 24 * 5, gelesen: 1 },
  { kw: 25, typ: 'erstgenehmigt', status: 'erstgenehmigt', agoH: 24 * 8, gelesen: 1 },
  { kw: 24, typ: 'abgelehnt',     status: 'abgelehnt',     agoH: 24 * 12, gelesen: 1 },
  { kw: 23, typ: 'erstgenehmigt', status: 'erstgenehmigt', agoH: 24 * 16, gelesen: 1 },
];
const YEAR = 2026;

function mondayOfKW(kw, year) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = (jan4.getUTCDay() + 6) % 7;          // Mo=0
  const w1Mon = new Date(jan4);
  w1Mon.setUTCDate(jan4.getUTCDate() - jan4Dow);
  const mon = new Date(w1Mon);
  mon.setUTCDate(w1Mon.getUTCDate() + (kw - 1) * 7);
  return mon;
}
const isoStr = d => d.toISOString().slice(0, 10);

async function main() {
  const pool = await getPool();

  const u = (await pool.request().input('e', sql.NVarChar(256), EMAIL)
    .query('SELECT Oid, Name FROM dbo.Users WHERE LOWER(Email)=LOWER(@e)')).recordset[0];
  if (!u) { console.error(`Kein Nutzer mit E-Mail ${EMAIL} gefunden.`); process.exit(1); }
  const oid = u.Oid;
  console.log(`[seed] Nutzer: ${u.Name} (${oid})`);

  // Alte Benachrichtigungen dieses Nutzers entfernen (idempotent)
  const del = await pool.request().input('o', sql.NVarChar(36), oid)
    .query('DELETE FROM dbo.Benachrichtigungen WHERE UserOid=@o');
  console.log(`[seed] ${del.rowsAffected[0]} bestehende Benachrichtigung(en) entfernt.`);

  for (const n of NOTIFS) {
    // Woche auflösen oder anlegen (bestehende NICHT überschreiben)
    let wid = (await pool.request()
      .input('o', sql.NVarChar(36), oid).input('kw', sql.TinyInt, n.kw).input('j', sql.SmallInt, YEAR)
      .query('SELECT Id FROM dbo.Wochen WHERE AzubiOid=@o AND KW=@kw AND Jahr=@j')).recordset[0]?.Id;
    if (!wid) {
      const mon = mondayOfKW(n.kw, YEAR);
      const end = new Date(mon); end.setUTCDate(mon.getUTCDate() + 6);
      wid = (await pool.request()
        .input('o', sql.NVarChar(36), oid)
        .input('kw', sql.TinyInt, n.kw).input('j', sql.SmallInt, YEAR)
        .input('start', sql.Date, isoStr(mon)).input('ende', sql.Date, isoStr(end))
        .input('status', sql.NVarChar(20), n.status)
        .input('betrieb', sql.NVarChar(sql.MAX), 'Tätigkeiten laut Ausbildungsplan durchgeführt und dokumentiert.')
        .query(`INSERT INTO dbo.Wochen (AzubiOid, KW, Jahr, StartDatum, EndDatum, Status, Gesamtstunden, BetriebEintrag)
                OUTPUT inserted.Id VALUES (@o,@kw,@j,@start,@ende,@status,0,@betrieb)`)).recordset[0].Id;
      console.log(`[seed]   Woche KW${n.kw}/${YEAR} angelegt (Status ${n.status}, Id ${wid}).`);
    }

    await pool.request()
      .input('o', sql.NVarChar(36), oid)
      .input('typ', sql.NVarChar(40), n.typ)
      .input('wid', sql.Int, wid)
      .input('from', sql.NVarChar(36), FROM)
      .input('gelesen', sql.Bit, n.gelesen)
      .input('ago', sql.Int, n.agoH)
      .query(`INSERT INTO dbo.Benachrichtigungen (UserOid, Typ, WocheId, FromUserOid, Gelesen, Timestamp)
              VALUES (@o,@typ,@wid,@from,@gelesen, DATEADD(HOUR, -@ago, SYSUTCDATETIME()))`);
    console.log(`[seed]   Mitteilung: KW${n.kw} ${n.typ} (${n.gelesen ? 'gelesen' : 'ungelesen'}, vor ${n.agoH}h).`);
  }

  const cnt = (await pool.request().input('o', sql.NVarChar(36), oid)
    .query('SELECT COUNT(*) c FROM dbo.Benachrichtigungen WHERE UserOid=@o')).recordset[0].c;
  console.log(`[seed] Fertig – ${cnt} Benachrichtigungen für ${u.Name}.`);
  process.exit(0);
}
main().catch(e => { console.error('[seed] Fehler:', e); process.exit(1); });
