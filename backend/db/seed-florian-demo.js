/* ===================================================================
   DEMO-SEED für Florian Kern (Azubi-Eigensicht „Mein Abteilungsdurchlauf")
   -------------------------------------------------------------------
   Legt für EINEN Nutzer (per E-Mail) einen vollständigen, kohärenten
   Demo-Durchlauf an: mehrere Abteilungs-Zuweisungen (beendet/aktuell/
   geplant), Beurteilungen (abgeschlossen + 1 Entwurf) und ausgefüllte
   Berichtsheft-Wochen (mit Tageseinträgen). Nur zum Vorführen.

   Idempotent: löscht ZUERST alle Zuweisungen + Beurteilungen dieses
   Nutzers und legt sie neu an. Berichtsheft-Wochen werden per (Oid,KW,
   Jahr) geupsertet (Tage delete+insert). Es werden NUR Daten dieses
   einen Nutzers angefasst – keine fremden Zeilen, keine Schema-Änderung.

   Ausführen (Backend-Verzeichnis, .env wird geladen):
     node db/seed-florian-demo.js
   =================================================================== */
require('dotenv').config();
const { getPool, sql } = require('./connection');
const { berechne } = require('../../app/js/beurteilung-core.js');

const EMAIL = 'florian.kern@putzmeister.com';

// ── Demo-Abteilungen für einen Fachinformatiker Systemintegration.
//    An den echten Ausbildungsbeginn (01.09.2025) angelehnt; die aktuell
//    laufende Station enthält heute. ──
const ABTEILUNGEN = [
  { abteilung: 'Grundausbildung & IT-Onboarding',   von: '2025-09-01', bis: '2025-10-17', ap: 'stefan.bauer',      beurt: 'abgeschlossen', fillWeeks: true },
  { abteilung: 'Netzwerk- & Infrastrukturtechnik',  von: '2025-10-20', bis: '2025-12-19', ap: 'andrea.vogt',       beurt: 'abgeschlossen', fillWeeks: true },
  { abteilung: 'Client- & Endgeräte-Management',    von: '2026-01-07', bis: '2026-02-27', ap: 'thomas.weber',      beurt: 'abgeschlossen', fillWeeks: true },
  { abteilung: 'Softwareverteilung & Scripting',    von: '2026-03-02', bis: '2026-04-30', ap: 'julia.schmitt',     beurt: 'abgeschlossen', fillWeeks: true },
  { abteilung: 'Rechenzentrum & Serverbetrieb',     von: '2026-05-04', bis: '2026-07-03', ap: 'frank.keller',      beurt: 'entwurf',       fillWeeks: true },
  { abteilung: 'IT-Support & Helpdesk',             von: '2026-07-06', bis: '2026-08-07', ap: 'matthias.lengerer', beurt: null,            fillWeeks: true },
  { abteilung: 'IT-Security & Firewalling',         von: '2026-08-17', bis: '2026-10-30', ap: 'petra.hoffmann',    beurt: null },
  { abteilung: 'Datenbanken & SQL-Administration',  von: '2026-11-02', bis: '2027-01-22', ap: 'christian.roth',    beurt: null },
];

// Beispiel-Punkte je Kriterium (leicht variiert → realistische Note).
const PUNKTE_SETS = [
  { auffassungsgabe: 88, transfervermoegen: 84, ausdauer: 90, zusammenarbeit: 86, interesse_initiative: 92, zuverlaessigkeit: 88, fertigkeiten: 80, kenntnisse: 82, sorgfalt: 85, lerntempo: 83 },
  { auffassungsgabe: 78, transfervermoegen: 74, ausdauer: 80, zusammenarbeit: 82, interesse_initiative: 76, zuverlaessigkeit: 84, fertigkeiten: 72, kenntnisse: 75, sorgfalt: 79, lerntempo: 73 },
  { auffassungsgabe: 92, transfervermoegen: 88, ausdauer: 86, zusammenarbeit: 90, interesse_initiative: 94, zuverlaessigkeit: 91, fertigkeiten: 85, kenntnisse: 88, sorgfalt: 90, lerntempo: 87 },
];
const INDIV_TEXTE = [
  'Hat sich sehr gut in das Team eingefügt, arbeitet zuverlässig und selbstständig. Weiter so!',
  'Solide Leistung mit Steigerungspotenzial bei der Selbstständigkeit. Zeigt großes Interesse.',
  'Überdurchschnittlicher Einsatz, übernimmt Verantwortung und denkt mit. Sehr erfreulich.',
];

const GENERIC_ENTRIES = [
  'Tätigkeiten laut Ausbildungsplan durchgeführt und dokumentiert.',
  'Aufgaben im Team bearbeitet, Rückfragen mit dem Ausbilder geklärt.',
  'Ergebnisse dokumentiert und im System gepflegt.',
  'An internen Terminen und Unterweisungen teilgenommen.',
  'Selbstständig an übertragenen Aufgaben gearbeitet.',
];
const BETRIEB_ENTRIES = {
  'Grundausbildung & IT-Onboarding': [
    'Sicherheitsunterweisung und Einführung in die Betriebsabläufe.',
    'Arbeitsplatz und Hardware eingerichtet, Firmen-Tools installiert.',
    'Benutzerkonten und Zugänge beantragt und eingerichtet.',
    'Erste Support-Anfragen begleitet und mitgehört.',
    'Dokumentation und interne Wikis eingelesen.',
  ],
  'Netzwerk- & Infrastrukturtechnik': [
    'Grundlagen Switching/Routing erarbeitet.',
    'VLAN konfiguriert und getestet.',
    'Patchpanel aufgelegt und Verkabelung dokumentiert.',
    'WLAN-Access-Points montiert und eingebunden.',
    'Netzplan aktualisiert und beschriftet.',
  ],
  'Client- & Endgeräte-Management': [
    'Client-Image erstellt und getestet.',
    'Notebooks aufgesetzt und an Mitarbeitende ausgegeben.',
    'Geräte über MDM/Intune eingebunden.',
    'Drucker und Peripherie eingerichtet.',
    'Hardware-Inventar gepflegt.',
  ],
  'Softwareverteilung & Scripting': [
    'Softwarepakete für die automatische Verteilung geschnürt und getestet.',
    'PowerShell-Skript zur Benutzeranlage angepasst und dokumentiert.',
    'Verteilung über die Management-Konsole ausgerollt und überwacht.',
    'Fehlgeschlagene Installationen analysiert und behoben.',
    'Skript-Doku ins Wiki übernommen, Kollegen eingewiesen.',
  ],
  'Rechenzentrum & Serverbetrieb': [
    'Virtuelle Maschine bereitgestellt und konfiguriert.',
    'Backups kontrolliert und Wiederherstellung getestet.',
    'Monitoring-Alarme ausgewertet und quittiert.',
    'Storage erweitert und dokumentiert.',
    'Sicherheitsupdates eingespielt.',
  ],
  'IT-Support & Helpdesk': [
    'Einarbeitung ins Ticketsystem, ersten First-Level-Support übernommen.',
    'Benutzerkonten im Active Directory angelegt und Gruppen zugewiesen.',
    'Support-Tickets aufgenommen, priorisiert und abgearbeitet.',
    'Netzwerkdosen gepatcht und im Netzplan dokumentiert.',
    'Client-Image getestet und auf neue Geräte verteilt.',
  ],
};

function isoWeek(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7;                 // Mo=0 … So=6
  date.setUTCDate(date.getUTCDate() - day + 3);           // Donnerstag dieser Woche
  const firstThu = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const fday = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fday + 3);
  const kw = 1 + Math.round((date - firstThu) / (7 * 86400000));
  return { kw, year: date.getUTCFullYear() };
}
const iso = (y, m, dd) => `${y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
function addDaysStr(str, n) { const d = new Date(str + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
function mondayOf(str) { const d = new Date(str + 'T00:00:00Z'); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
const TODAY_STR = new Date().toISOString().slice(0, 10);
const SCHULE_TEXT = 'Berufsschule: Lernfelder laut Stundenplan behandelt, Übungsaufgaben bearbeitet und die anstehende Klassenarbeit vorbereitet.';
// Wöchentlicher Berichtstext (mehrzeilig) aus den Tätigkeits-Bausteinen der Abteilung.
function weeklyText(entries, wIdx) {
  const n = entries.length;
  return [0, 1, 2, 3].map(k => '• ' + entries[(wIdx + k) % n]).join('\n');
}

async function main() {
  const pool = await getPool();

  // 1) Nutzer auflösen
  const u = (await pool.request()
    .input('email', sql.NVarChar(256), EMAIL)
    .query('SELECT Oid, Name, Beruf, AusbildungBeginn FROM dbo.Users WHERE LOWER(Email) = LOWER(@email)')).recordset[0];
  if (!u) { console.error(`Kein Nutzer mit E-Mail ${EMAIL} gefunden.`); process.exit(1); }
  const oid = u.Oid;
  console.log(`[seed] Nutzer: ${u.Name} (${oid})`);

  // Beruf + Ausbildungszeitraum nur setzen, wenn leer (für Lehrjahr-Gruppierung).
  if (!u.AusbildungBeginn) {
    await pool.request().input('oid', sql.NVarChar(36), oid)
      .query(`UPDATE dbo.Users SET AusbildungBeginn='2024-09-02', AusbildungEnde='2028-02-29',
                Beruf = ISNULL(NULLIF(Beruf,''),'Mechatroniker/in'), AktualisiertAm=SYSUTCDATETIME()
              WHERE Oid=@oid`);
    console.log('[seed] AusbildungBeginn/Ende + Beruf gesetzt (waren leer).');
  }

  // 2) Bestehende Zuweisungen + Beurteilungen dieses Nutzers entfernen (idempotent)
  await pool.request().input('oid', sql.NVarChar(36), oid).query(`
    DELETE k FROM dbo.BeurteilungKriterien k
      INNER JOIN dbo.Beurteilungen b ON b.Id = k.BeurteilungId WHERE b.AzubiOid = @oid;
    DELETE FROM dbo.Beurteilungen WHERE AzubiOid = @oid;
    DELETE FROM dbo.Zuweisungen  WHERE AzubiOid = @oid;
  `);
  console.log('[seed] Alte Zuweisungen + Beurteilungen entfernt.');

  // 3) Zuweisungen anlegen
  let beurtIdx = 0;
  for (const a of ABTEILUNGEN) {
    const email = `${a.ap}@putzmeister.com`;
    const zid = (await pool.request()
      .input('oid', sql.NVarChar(36), oid)
      .input('email', sql.NVarChar(255), email)
      .input('abt', sql.NVarChar(100), a.abteilung)
      .input('von', sql.Date, a.von)
      .input('bis', sql.Date, a.bis)
      .query(`INSERT INTO dbo.Zuweisungen (AzubiOid, VerantwEmail, Abteilung, Von, Bis)
              OUTPUT inserted.Id VALUES (@oid, @email, @abt, @von, @bis)`)).recordset[0].Id;

    // 4) Beurteilung (abgeschlossen | entwurf)
    if (a.beurt) {
      const punkte = PUNKTE_SETS[beurtIdx % PUNKTE_SETS.length];
      const indiv = INDIV_TEXTE[beurtIdx % INDIV_TEXTE.length];
      beurtIdx++;
      const calc = berechne(punkte);
      const cols = a.beurt === 'abgeschlossen'
        ? { extraCols: ', AbgeschlossenAm, BeurteiltVon', extraVals: ", SYSUTCDATETIME(), @beurtVon" }
        : { extraCols: '', extraVals: '' };
      const bid = (await pool.request()
        .input('zid', sql.Int, zid)
        .input('oid', sql.NVarChar(36), oid)
        .input('status', sql.NVarChar(20), a.beurt)
        .input('indiv', sql.NVarChar(sql.MAX), indiv)
        .input('ges', sql.Decimal(5, 2), calc.gesamt)
        .input('note', sql.Decimal(2, 1), calc.note)
        .input('gespr', sql.Date, addDaysStr(a.bis, -2))
        .input('beurtVon', sql.NVarChar(36), oid)
        .query(`INSERT INTO dbo.Beurteilungen
                  (ZuweisungId, AzubiOid, Status, IndividuelleBeurteilung, GesamtPunkte, Note, GespraechAm${cols.extraCols})
                OUTPUT inserted.Id
                VALUES (@zid, @oid, @status, @indiv, @ges, @note, @gespr${cols.extraVals})`)).recordset[0].Id;
      for (const [key, pkt] of Object.entries(punkte)) {
        await pool.request()
          .input('bid', sql.Int, bid).input('key', sql.NVarChar(40), key).input('pkt', sql.TinyInt, pkt)
          .query('INSERT INTO dbo.BeurteilungKriterien (BeurteilungId, KriteriumKey, Punkte) VALUES (@bid,@key,@pkt)');
      }
      console.log(`[seed]   Beurteilung ${a.beurt} für "${a.abteilung}" (Note ${calc.note}).`);
    }

    // 5) Ausgefüllte Berichtsheft-Wochen – automatisch über den ganzen Einsatz,
    //    Mo–Fr, nur Tage innerhalb [von, bis] und nicht in der Zukunft.
    if (a.fillWeeks) {
      const entries = BETRIEB_ENTRIES[a.abteilung] || GENERIC_ENTRIES;
      const status = a.bis < TODAY_STR ? 'genehmigt' : 'offen';   // beendet=genehmigt, aktuell=offen
      const lastDay = a.bis < TODAY_STR ? a.bis : TODAY_STR;
      let wIdx = 0, wochenCount = 0;
      for (let monday = mondayOf(a.von); monday <= a.bis; monday = addDaysStr(monday, 7)) {
        const tage = [];
        for (let i = 0; i < 5; i++) {                            // Mo–Fr
          const d = addDaysStr(monday, i);
          if (d >= a.von && d <= lastDay) tage.push(d);
        }
        if (!tage.length) continue;                              // Woche komplett außerhalb/Zukunft
        const { kw, year } = isoWeek(new Date(monday + 'T00:00:00Z'));
        // Wöchentliches Berichtsheft: Text auf WOCHENEBENE (mehrzeilig); jede 4. Woche mit Berufsschul-Zeile.
        const betrieb = weeklyText(entries, wIdx);
        const schule = (wIdx % 4 === 3) ? SCHULE_TEXT : null;
        const wid = (await pool.request()
          .input('oid', sql.NVarChar(36), oid)
          .input('kw', sql.TinyInt, kw).input('jahr', sql.SmallInt, year)
          .input('start', sql.Date, monday).input('ende', sql.Date, addDaysStr(monday, 6))
          .input('status', sql.NVarChar(20), status)
          .input('betrieb', sql.NVarChar(sql.MAX), betrieb)
          .input('schule', sql.NVarChar(sql.MAX), schule)
          .query(`
            MERGE dbo.Wochen AS t
            USING (SELECT @oid AS AzubiOid, @kw AS KW, @jahr AS Jahr) AS s
              ON t.AzubiOid=s.AzubiOid AND t.KW=s.KW AND t.Jahr=s.Jahr
            WHEN MATCHED THEN UPDATE SET StartDatum=@start, EndDatum=@ende, Status=@status, Gesamtstunden=0,
              BetriebEintrag=@betrieb, SchuleEintrag=@schule
            WHEN NOT MATCHED THEN INSERT (AzubiOid, KW, Jahr, StartDatum, EndDatum, Status, Gesamtstunden, BetriebEintrag, SchuleEintrag)
              VALUES (@oid,@kw,@jahr,@start,@ende,@status,0,@betrieb,@schule)
            OUTPUT inserted.Id;`)).recordset[0].Id;
        // Tage nur für Anwesenheit/Tagdauer – der Berichtstext steht auf Wochenebene.
        await pool.request().input('wid', sql.Int, wid).query('DELETE FROM dbo.Tage WHERE WocheId=@wid');
        for (const d of tage) {
          await pool.request()
            .input('wid', sql.Int, wid)
            .input('datum', sql.Date, d)
            .input('anw', sql.NVarChar(30), 'anwesend')
            .input('ort', sql.NVarChar(30), 'betrieb')
            .input('dauer', sql.NVarChar(10), 'ganztag')
            .query(`INSERT INTO dbo.Tage (WocheId, Datum, Anwesenheit, Ort, Tagdauer)
                    VALUES (@wid,@datum,@anw,@ort,@dauer)`);
        }
        wIdx++; wochenCount++;
      }
      console.log(`[seed]   ${wochenCount} Wochen für "${a.abteilung}" ausgefüllt (Status ${status}).`);
    }
  }

  console.log(`[seed] Fertig – ${ABTEILUNGEN.length} Abteilungen angelegt.`);
  process.exit(0);
}

main().catch(e => { console.error('[seed] Fehler:', e); process.exit(1); });
