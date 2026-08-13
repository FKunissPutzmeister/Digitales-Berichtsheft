'use strict';
/* =====================================================================
   RETENTION / LÖSCHKONZEPT
   Löscht jedes Konto 365 Tage nach seiner Deaktivierung endgültig.

   Aufbau wie berichtsheftBackup.js: reine Entscheidungslogik und
   Datenkonstanten getrennt von I/O, alle Abhängigkeiten injizierbar —
   dadurch ist der Job ohne SQL Server und ohne echte Uhr testbar.

   Spec: docs/superpowers/specs/2026-08-11-loeschkonzept-inaktive-nutzer-design.md
   ===================================================================== */

const fs = require('node:fs');
const path = require('node:path');
const { getPool, sql } = require('../db/connection');

// Fristen bewusst als Konstanten, NICHT als .env-Variablen: die Löschfrist ist
// eine dokumentierte Compliance-Entscheidung, die in der Datenschutzinformation
// steht. Ein Wert, der auf dem Dev-Server anders sein kann als produktiv, ohne
// Spur in Git, ist bei unwiderruflichem Löschen die falsche Eigenschaft.
// Testbarkeit kommt stattdessen über die Parameter jetzt/fristTage.
const LOESCHFRIST_TAGE = 365;
const VORWARN_TAGE = 30;

const TAG_MS = 24 * 3600 * 1000;

// Demo-Konten sind vom Löschen ausgenommen — dieselbe Ausnahme wie im
// Entra-Sync (users.js listManagedUsers). Ohne sie radiert der erste
// Nachtlauf den Demo-Datenbestand.
function istDemoKonto(email) {
  // `.demo` steht im LOKALTEIL, nicht in der Domain: die Konten heißen
  // `lena.mueller.demo@putzmeister.com`. Ein `/\.demo$/`-Test würde keines
  // von ihnen erkennen. Muster deckungsgleich mit dem SQL-Guard
  // `Email NOT LIKE '%.demo@%'` in users.js.
  return /\.demo@/i.test(String(email || '').trim());
}

// Stichtag + Frist. Ohne Stempel (Altbestand, aktives Konto) → null.
function loeschDatum(user, { fristTage = LOESCHFRIST_TAGE } = {}) {
  if (!user || !user.inaktivSeit) return null;
  const start = new Date(user.inaktivSeit);
  if (isNaN(start)) return null;
  return new Date(start.getTime() + fristTage * TAG_MS);
}

// Greift die Löschsperre? Sie hält zurück, solange LoeschsperreBis >= heute.
// Vergleich auf Tagesebene, damit eine Sperre "bis 15.06." den 15. noch abdeckt.
// "heute" ist das ORTSDATUM (lokale Getter), nicht jetzt.toISOString() — die
// Sperre steht in der Nutzerverwaltung als Kalendertag am Serverstandort, und
// das Frontend (app/js/api.js DateUtil.toISODate) rechnet genauso lokal. Ein
// UTC-Datum würde in bestimmten Nachtstunden auf den falschen Tag fallen.
function sperreGreift(user, jetzt) {
  if (!user || !user.loeschsperreBis) return false;
  const bis = String(user.loeschsperreBis).slice(0, 10);
  const j = jetzt.getFullYear();
  const m = String(jetzt.getMonth() + 1).padStart(2, '0');
  const t = String(jetzt.getDate()).padStart(2, '0');
  const heute = `${j}-${m}-${t}`;
  return bis >= heute;
}

function istFaellig(user, { jetzt = new Date(), fristTage = LOESCHFRIST_TAGE } = {}) {
  if (!user) return false;
  if (user.aktiv) return false;
  if (istDemoKonto(user.email)) return false;
  if (sperreGreift(user, jetzt)) return false;
  const ziel = loeschDatum(user, { fristTage });
  if (!ziel) return false;
  return ziel.getTime() <= jetzt.getTime();
}

// Im Vorwarnfenster: Löschdatum liegt in der Zukunft, aber höchstens
// vorwarnTage entfernt. Ein bereits fälliges Konto wird nicht mehr vorgewarnt —
// es wird im selben Lauf gelöscht.
function istVorwarnFaellig(user, {
  jetzt = new Date(), fristTage = LOESCHFRIST_TAGE, vorwarnTage = VORWARN_TAGE,
} = {}) {
  if (!user) return false;
  if (user.aktiv) return false;
  if (istDemoKonto(user.email)) return false;
  if (sperreGreift(user, jetzt)) return false;
  const ziel = loeschDatum(user, { fristTage });
  if (!ziel) return false;
  const restMs = ziel.getTime() - jetzt.getTime();
  return restMs > 0 && restMs <= vorwarnTage * TAG_MS;
}

/* ── Löschreihenfolge ────────────────────────────────────────────
   AzubiOid/UserOid sind fast überall lose NVARCHAR(36) OHNE Fremdschlüssel auf
   dbo.Users. Die Datenbank erzwingt hier also nichts — die Reihenfolge unten
   ist die einzige Absicherung, und retention.test.js nagelt sie fest.

   Platzhalter, die loescheNutzer() ersetzt:
     @oid    OID der Person
     @name   dbo.Users.Name der Person (DB-Form "Nachname, Vorname")
     @email  dbo.Users.Email der Person (lowercase)
     @wochen SELECT Id FROM dbo.Wochen WHERE AzubiOid = @oid
     @zuw    SELECT Id FROM dbo.Zuweisungen WHERE AzubiOid = @oid

   NICHT aufgeführt, weil per ON DELETE CASCADE erledigt:
     Anhaenge (FK auf Wochen), BeurteilungKriterien (FK auf Beurteilungen),
     UserPhotos (FK auf Users). */

// PHASE A — eigene Daten, hart löschen. Kinder vor Eltern.
const PHASE_A = [
  {
    tabelle: 'Benachrichtigungen',
    // Vier Wege zur Person: bei 'erstgenehmigt' steht der Azubi in KEINER
    // Personenspalte (wochen.js:320-327), Beurteilungs-Mitteilungen haben
    // FromUserOid = NULL und hängen nur über ZuweisungId.
    // Trifft auch Mitteilungen ANDERER an dieser Woche/Zuweisung — gewollt,
    // die Referenz existiert danach nicht mehr.
    bedingung: 'UserOid = @oid OR FromUserOid = @oid OR WocheId IN (@wochen) OR ZuweisungId IN (@zuw)',
  },
  {
    tabelle: 'Kommentare',
    // MUSS vor Tage stehen: FK_Kommentare_Tage (Migration 002) hat kein
    // ON DELETE CASCADE, ein DELETE auf Tage würde daran scheitern.
    bedingung: 'WocheId IN (@wochen)',
  },
  { tabelle: 'Tage',            bedingung: 'WocheId IN (@wochen)' },
  { tabelle: 'Wochen',          bedingung: 'AzubiOid = @oid' },
  // Vor Zuweisungen: Beurteilungen.ZuweisungId zeigt darauf.
  { tabelle: 'Beurteilungen',   bedingung: 'AzubiOid = @oid' },
  { tabelle: 'Zuweisungen',     bedingung: 'AzubiOid = @oid' },
  { tabelle: 'FahrtgeldKonfig', bedingung: 'AzubiOid = @oid' },
  // Arbeitszeitdaten je Azubi (Datum, Tagestyp, Ist/Soll/Diff). Steht in keiner
  // Migration und wird von keinem Codepfad gelesen — gefunden über die
  // INFORMATION_SCHEMA-Selbstprüfung. Personenbezogen, also von der Frist erfasst.
  { tabelle: 'EssTag',          bedingung: 'AzubiOid = @oid' },
];

// PHASE B — Handlungen an FREMDEN Nachweisen: Referenz nullen, Name behalten.
// Rechtsgrundlage für den verbleibenden Namen ist dieselbe wie für das Heft
// selbst (Art. 6 Abs. 1 lit. c DSGVO i.V.m. BBiG): die Gegenzeichnung ist
// Pflichtinhalt des Ausbildungsnachweises. Der Name verschwindet, wenn das
// Heft selbst gelöscht wird.
// COALESCE, damit ein bereits beim Schreiben gefüllter Name (Migration 031)
// nicht durch den heutigen Users.Name überschrieben wird — gespeichert ist der
// Name zum Zeitpunkt der Handlung.
const PHASE_B = [
  {
    tabelle: 'Wochen',
    anweisung: 'SET KorrigiertVonName = COALESCE(KorrigiertVonName, @name), KorrigiertVon = NULL',
    bedingung: 'KorrigiertVon = @oid',
  },
  {
    tabelle: 'Kommentare',
    anweisung: 'SET AutorName = COALESCE(AutorName, @name), UserOid = NULL',
    bedingung: 'UserOid = @oid',
  },
  {
    tabelle: 'Zuweisungen',
    // Die E-Mail MUSS weg: sie ist personenbezogener als der Name, und die
    // Anzeige leitet den Namen daraus ab (api.js normalizeZuweisung) — ohne
    // dieses Leeren wäre die Löschung wirkungslos. Nebeneffekt gewollt: der
    // befristete Lesezugriff hängt an dieser E-Mail (zugriff.js), sie darf
    // keinem neuen Träger derselben Adresse Zugriff geben.
    anweisung: "SET VerantwName = COALESCE(VerantwName, @name), VerantwEmail = ''",
    bedingung: 'LOWER(VerantwEmail) = LOWER(@email)',
  },
  {
    tabelle: 'Beurteilungen',
    // Diese drei Spalten werden nirgends als Name gerendert (geprüft:
    // beurteilung.js zeigt zuweisung.verantwName) — nur die OID muss weg,
    // ein dangling GUID ist ein pseudonymer Personenbezug.
    anweisung: 'SET BeurteiltVon = NULL',
    bedingung: 'BeurteiltVon = @oid',
  },
  { tabelle: 'Beurteilungen', anweisung: 'SET KenntnisnahmeVon = NULL', bedingung: 'KenntnisnahmeVon = @oid' },
  { tabelle: 'Beurteilungen', anweisung: 'SET KorrigiertVon = NULL',    bedingung: 'KorrigiertVon = @oid' },
  { tabelle: 'Anhaenge',      anweisung: 'SET HochgeladenVon = NULL',   bedingung: 'HochgeladenVon = @oid' },
  {
    tabelle: 'Vertretungen',
    // PHASE_C loescht Vertretungen nur ueber VertretenerOid/VertreterOid. Wer
    // als Planer eine Vertretung zwischen ZWEI ANDEREN Personen eingetragen
    // hat, steht in keiner dieser beiden Spalten — seine OID bliebe fuer immer
    // in ErstelltVon stehen. Ein dangling GUID ist ein pseudonymer
    // Personenbezug, also wird auch diese Referenz genullt (Spec, "Nicht
    // betroffen — geprueft": "Ihre OIDs werden trotzdem genullt").
    anweisung: 'SET ErstelltVon = NULL',
    bedingung: 'ErstelltVon = @oid',
  },
  {
    tabelle: 'Benachrichtigungen',
    // Genullt, NICHT gelöscht: die Zeile gehört dem Empfänger. Ein Azubi soll
    // seine Mitteilung "Woche genehmigt" nicht verlieren, weil der Prüfer das
    // Unternehmen verlassen hat. FromUserOid ist seit Migration 016 nullable.
    anweisung: 'SET FromUserOid = NULL',
    bedingung: 'FromUserOid = @oid',
  },
];

// PHASE C — Konto und Verkehrsdaten, hart löschen.
const PHASE_C = [
  { tabelle: 'AusbilderAzubis',          bedingung: 'AzubiOid = @oid OR AusbilderOid = @oid' },
  // Bindet über BEIDES: Oid ist erst nach dem ersten SSO-Login gefüllt,
  // Email ist NOT NULL (Migration 012). Anzeigename geht mit der Zeile.
  { tabelle: 'AbteilungVerantwortliche', bedingung: 'Oid = @oid OR LOWER(Email) = LOWER(@email)' },
  { tabelle: 'Vertretungen',             bedingung: 'VertretenerOid = @oid OR VertreterOid = @oid' },
  { tabelle: 'McpLog',                   bedingung: 'UserOid = @oid' },
  { tabelle: 'ApiKeys',                  bedingung: 'UserOid = @oid' },
  // Zuletzt. UserPhotos folgt per FK_UserPhotos_Users ON DELETE CASCADE.
  { tabelle: 'Users',                    bedingung: 'Oid = @oid' },
];

/* ── Bekannte Spalten für die Selbstprüfung ──────────────────────
   SPALTEN-granular, nicht tabellen-granular. Eine Prüfung auf Tabellennamen
   ist blind für eine NEUE personenbezogene Spalte auf einer bereits bekannten
   Tabelle — genau so blieb Vertretungen.ErstelltVon lange unentdeckt, obwohl
   Vertretungen längst in PHASE_C stand.

   Der Großteil der Menge wird AUS den Phasenlisten abgeleitet: was eine Phase
   anfasst, kennt der Job per Definition. Damit kann die Menge nicht mehr
   auseinanderdriften, wenn jemand eine Phase erweitert. */

// Spaltenmuster mit Personenbindung — deckungsgleich mit dem SQL-Filter in
// pruefeUnbekannteSpalten: '%Oid' (Fremdverweis auf dbo.Users), '%Von'
// (Handlung EINER Person: BeurteiltVon, HochgeladenVon, ErstelltVon …) und
// '%Email'.
const PERSONEN_SPALTE_RE = /(Oid|Von|Email)$/i;

// Spaltennamen aus einem SQL-Fragment ziehen. Bezeichner mit '@' davor sind
// gebundene Parameter (@oid, @name, @email) bzw. Subselect-Platzhalter
// (@wochen, @zuw) — Werte, keine Spalten, deshalb ausgeschlossen.
function spaltenAusFragment(fragment) {
  const out = [];
  for (const m of String(fragment || '').matchAll(/(@?)([A-Za-z_][A-Za-z0-9_]*)/g)) {
    if (m[1]) continue;
    if (PERSONEN_SPALTE_RE.test(m[2])) out.push(m[2]);
  }
  return out;
}

const spaltenSchluessel = (tabelle, spalte) => `${tabelle}.${spalte}`.toLowerCase();

const BEKANNTE_SPALTEN = new Set([
  // Abgeleitet: jede Personenspalte, die in einer Bedingung oder Anweisung
  // der drei Phasen vorkommt.
  ...[...PHASE_A, ...PHASE_B, ...PHASE_C].flatMap((e) => [
    ...spaltenAusFragment(e.bedingung),
    ...spaltenAusFragment(e.anweisung),
  ].map((spalte) => spaltenSchluessel(e.tabelle, spalte))),

  // Handgepflegt — was die Phasenlisten nicht ausdrücken können, je mit Grund:
  // Kaskaden-Kind: die Zeile geht per FK_UserPhotos_Users ON DELETE CASCADE
  // mit dem Users-DELETE aus PHASE_C, die Spalte IST die User-Oid.
  spaltenSchluessel('UserPhotos', 'Oid'),
  // Die ganze Users-Zeile stirbt in PHASE_C (Oid = @oid) — damit auch Email.
  // Steht hier, weil keine Phase die Spalte einzeln nennt.
  spaltenSchluessel('Users', 'Email'),
  // Azubi-exklusiv: 'einreichen' kann nur der Azubi selbst (zugriff.js
  // wochenAktionen), die Woche wird in PHASE_A mit ihm gelöscht. In FREMDEN
  // Wochen kann diese OID deshalb nie stehen (Spec, "Nicht betroffen").
  spaltenSchluessel('Wochen', 'EingereichtVon'),
]);

// Ganze Tabellen, die bewusst außerhalb des Löschkonzepts liegen: eigene
// 90-Tage-Rotation in services/fehlerberichte.js, nach 365 Tagen Inaktivität
// längst verfallen. Hier absichtlich TABELLEN-granular — auch eine künftige
// Personenspalte dort ist von der Rotation erfasst.
const AUSGENOMMENE_TABELLEN = new Set(['fehlerberichte', 'fehleranhaenge']);

// Kennt der Löschjob diese Spalte? Vergleich exakt auf (Tabelle, Spalte) und
// case-insensitiv, weil SQL Server Bezeichner nicht case-sensitiv behandelt.
// Exakt heißt: 'UserOid' deckt NICHT 'FromUserOid' ab, 'Oid' nicht 'AzubiOid' —
// die Namen dieses Schemas enthalten einander als Teilstrings.
function istBekannteSpalte(tabelle, spalte) {
  if (AUSGENOMMENE_TABELLEN.has(String(tabelle).toLowerCase())) return true;
  return BEKANNTE_SPALTEN.has(spaltenSchluessel(tabelle, spalte));
}

/* ── SQL-Erzeugung ───────────────────────────────────────────────
   @oid/@name/@email bleiben PARAMETER (mssql-Bindung) — nur die beiden
   Subselect-Platzhalter werden textuell ersetzt, und die enthalten selbst
   keine Nutzerdaten. */
const SUB_WOCHEN = 'SELECT Id FROM dbo.Wochen WHERE AzubiOid = @oid';
const SUB_ZUW    = 'SELECT Id FROM dbo.Zuweisungen WHERE AzubiOid = @oid';

function fuellePlatzhalter(fragment) {
  return String(fragment)
    .replace(/@wochen\b/g, SUB_WOCHEN)
    .replace(/@zuw\b/g, SUB_ZUW);
}

// Vollständige, geordnete Liste der Anweisungen für eine Person.
// Rein: kein I/O, dadurch im Test vollständig inspizierbar.
function baueAnweisungen(_user) {
  const out = [];
  for (const e of PHASE_A) {
    out.push({ tabelle: e.tabelle, phase: 'A',
      sql: `DELETE FROM dbo.${e.tabelle} WHERE ${fuellePlatzhalter(e.bedingung)}` });
  }
  for (const e of PHASE_B) {
    out.push({ tabelle: e.tabelle, phase: 'B',
      sql: `UPDATE dbo.${e.tabelle} ${e.anweisung} WHERE ${fuellePlatzhalter(e.bedingung)}` });
  }
  for (const e of PHASE_C) {
    out.push({ tabelle: e.tabelle, phase: 'C',
      sql: `DELETE FROM dbo.${e.tabelle} WHERE ${fuellePlatzhalter(e.bedingung)}` });
  }
  return out;
}

/* Eine Person vollständig verarbeiten: Phasen A, B und C in EINER Transaktion.
   Ein Abbruch zwischen A und B wäre der schlimmste Zustand — Heft gelöscht,
   Konto und Belege noch da —, deshalb alles oder nichts.

   deps.tx/deps.request sind für Tests; produktiv wird beides aus dem Pool
   gebaut. Transaktions-Muster wie ausbilderAzubis.js setFuerAzubi. */
async function loescheNutzer(user, deps = {}) {
  /* Eigener Wachposten. ermittleKandidaten filtert bereits, aber DAS ist der
     unwiderrufliche Einstiegspunkt: er loescht bisher, was man ihm gibt. Die
     Abnahme-Checkliste laesst einen Operator eine listKandidaten-Filterzeile
     von Hand schreiben — eine Zeile ueber einer echten Loeschung.
     BEWUSST nur diese zwei Bedingungen: ein gesperrtes Konto ist nach Ablauf
     der Sperre legitim loeschbar, und die Frist erneut zu pruefen waere die
     Aufgabe von istFaellig doppelt (und damit eine zweite Wahrheit). */
  if (!user || !user.oid) throw new Error('loescheNutzer: kein Nutzer uebergeben.');
  if (user.aktiv) {
    throw new Error(`loescheNutzer: Konto ${user.oid} ist aktiv und wird nicht geloescht.`);
  }
  if (istDemoKonto(user.email)) {
    throw new Error(`loescheNutzer: Konto ${user.oid} ist ein Demo-Konto und wird nie geloescht.`);
  }

  const pool = deps.pool || (deps.tx ? null : await getPool());
  const tx = deps.tx || new sql.Transaction(pool);
  const request = deps.request || (() => new sql.Request(tx));

  const tabellen = {};
  let phaseB = 0;
  await tx.begin();
  try {
    for (const a of baueAnweisungen(user)) {
      const res = await request()
        .input('oid',   sql.NVarChar(36),  user.oid)
        .input('name',  sql.NVarChar(200), user.name ?? null)
        .input('email', sql.NVarChar(256), (user.email || '').toLowerCase() || null)
        .query(a.sql);
      const n = (res.rowsAffected && res.rowsAffected[0]) || 0;
      tabellen[a.tabelle] = (tabellen[a.tabelle] || 0) + n;
      // Phase B getrennt zählen: das sind die Belege in FREMDEN Heften, an
      // denen der Name der Person stehen bleibt. Im Protokoll ist damit
      // sichtbar, ob eine Person überhaupt Spuren hinterlassen hat.
      if (a.phase === 'B') phaseB += n;
    }
    await tx.commit();
  } catch (err) {
    try { await tx.rollback(); } catch (_) { /* Transaktion evtl. schon tot */ }
    throw err;
  }
  return { tabellen, phaseB };
}

/* Kandidaten: inaktive Konten mit Stichtag, ohne Demo-Adresse. Bewusst OHNE
   Rollenbedingung — die Regel ist einheitlich (siehe Spec, Kern-Erkenntnis 1).
   Rolle und Demo-Ausnahme werden anschließend in istFaellig erneut geprüft:
   diese SQL hält die Liste klein, die reine Funktion ist die per Test
   festgenagelte Stelle. */
async function ermittleKandidaten(poolOverride) {
  const pool = poolOverride || await getPool();
  const res = await pool.request()
    .input('demo', sql.NVarChar(20), '%.demo@%')
    .query(`
      SELECT Oid, Name, Email, Role, Aktiv, InaktivSeit, LoeschsperreBis
        FROM dbo.Users
       WHERE Aktiv = 0
         AND InaktivSeit IS NOT NULL
         AND (Email IS NULL OR Email NOT LIKE @demo)
       ORDER BY InaktivSeit`);
  return res.recordset.map((r) => ({
    oid: r.Oid,
    name: r.Name,
    email: r.Email,
    role: r.Role,
    aktiv: !!r.Aktiv,
    inaktivSeit: r.InaktivSeit ? new Date(r.InaktivSeit).toISOString() : null,
    loeschsperreBis: r.LoeschsperreBis ? new Date(r.LoeschsperreBis).toISOString().slice(0, 10) : null,
  }));
}

/* Selbstprüfung gegen stilles Vergessen: drei Spaltenmuster verraten eine
   Personenbindung — '%Oid' (Fremdverweis auf dbo.Users), '%Von' (Handlung
   EINER Person, wie BeurteiltVon/KenntnisnahmeVon/KorrigiertVon/
   HochgeladenVon aus PHASE_B — ein reines '%Oid' würde keine davon sehen,
   weil sie nicht so heißen) und '%Email' (nicht nur die exakte Spalte
   'Email', sondern auch Formen wie VerantwEmail, die es in Zuweisungen
   schon gibt).

   Verglichen wird das Paar (Tabelle, Spalte), NICHT bloß der Tabellenname:
   eine neue Personenspalte auf einer längst bekannten Tabelle wäre sonst
   unsichtbar, und genau das ist der reale Fehlerfall (Vertretungen.ErstelltVon).

   Ausgenommen ist die Spalte, die exakt 'Von' heißt: das ist im ganzen Schema
   der Anfang eines Zeitraums (Zuweisungen.Von, Vertretungen.Von, jeweils mit
   'Bis'), kein Personenverweis. Ohne diesen Ausschluss meldete die Prüfung bei
   jedem neuen Datumsbereich einen Falschtreffer — und Falschtreffer sind der
   Weg, auf dem eine solche Prüfung stillgelegt wird.

   Liefert 'Tabelle.Spalte' je unbekannter Fundstelle; der Aufrufer meldet sie. */
async function pruefeUnbekannteSpalten(poolOverride) {
  const pool = poolOverride || await getPool();
  const res = await pool.request().query(`
    SELECT TABLE_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = 'dbo'
       AND COLUMN_NAME <> 'Von'
       AND (COLUMN_NAME LIKE '%Oid' OR COLUMN_NAME LIKE '%Von' OR COLUMN_NAME LIKE '%Email')
     ORDER BY TABLE_NAME, COLUMN_NAME`);
  return res.recordset
    .filter((r) => !istBekannteSpalte(r.TABLE_NAME, r.COLUMN_NAME))
    .map((r) => `${r.TABLE_NAME}.${r.COLUMN_NAME}`);
}

/* ── Dateien: IHK-Import-Archiv ──────────────────────────────────
   backend/data/ihk-imports/<oid>/ enthält vollständige IHK-Nachweis-PDFs und
   hat KEINE Rotation (routes/ihk-imports.js). Ohne diesen Schritt löscht der
   Job die Datenbank und lässt das PDF liegen.

   Bewusst zustandslos: gelöscht wird jeder Ordner, dessen OID keine
   dbo.Users-Zeile mehr hat. Damit ist der Schritt selbstheilend — schlägt ein
   rmSync fehl (offenes Handle, Virenscanner; bei pruneOldBackups real
   aufgetreten), greift der nächste Lauf denselben Ordner wieder auf, ohne dass
   irgendwo ein Merkzettel geführt werden muss. Nebeneffekt: bestehender
   Waisen-Altbestand wird mit aufgeräumt. */
const IHK_IMPORT_DIR = path.join(__dirname, '..', 'data', 'ihk-imports');
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function raeumeWaisenDateien({ dir = IHK_IMPORT_DIR, existierendeOids } = {}) {
  const entfernt = [];
  const probleme = [];
  if (!fs.existsSync(dir)) return { entfernt, probleme };

  // Vergleich case-insensitiv: Graph liefert OIDs lowercase, ein von Hand
  // angelegter Ordner kann anders geschrieben sein.
  const bekannt = new Set([...(existierendeOids || [])].map((o) => String(o).toLowerCase()));

  for (const name of fs.readdirSync(dir)) {
    // Alles, was nicht wie eine OID aussieht, bleibt unangetastet — Schutz
    // gegen versehentliches Löschen fremder Daten (wie bei pruneOldBackups).
    if (!GUID_RE.test(name)) continue;
    if (bekannt.has(name.toLowerCase())) continue;
    const p = path.join(dir, name);
    try {
      if (!fs.statSync(p).isDirectory()) continue;
      fs.rmSync(p, { recursive: true, force: true });
      entfernt.push(name);
    } catch (err) {
      probleme.push(`${name}: ${err.message}`);   // weiter mit dem nächsten
    }
  }
  return { entfernt, probleme };
}

/* ── Vorwarnung ──────────────────────────────────────────────────
   Muss vor dem ersten Scharfschalten per Migration 032 im CHECK-Constraint
   stehen — sonst scheitert das INSERT still. */
const VORWARN_TYP = 'loeschung_geplant';

// Empfänger: Ausbildungsleitung (KannPlanen) plus Developer. Nur aktive Konten.
async function ermittleVorwarnEmpfaenger(poolOverride) {
  const pool = poolOverride || await getPool();
  const res = await pool.request().query(`
    SELECT Oid FROM dbo.Users
     WHERE Aktiv = 1 AND (KannPlanen = 1 OR Role = 'developer')`);
  return res.recordset.map((r) => r.Oid);
}

/* Eine Vorwarnung je Empfänger. Idempotent über die Existenzprüfung: der Job
   läuft jede Nacht, das Vorwarnfenster ist 30 Tage breit — ohne die Prüfung
   käme die Meldung 30 Nächte hintereinander.
   Der betroffene Nutzer steht in FromUserOid: sein Konto ist inaktiv und für
   Empfänger mit KannPlanen nicht in der Nutzerliste sichtbar, der Name muss
   also aus dieser Referenz aufgelöst werden.
   Rückgabe: true, wenn tatsächlich gesendet wurde. */
async function sendeVorwarnung(user, { pool: poolOverride, empfaenger } = {}) {
  const ziele = (empfaenger || []).filter(Boolean);
  if (!ziele.length) return false;
  const pool = poolOverride || await getPool();

  const vorhanden = await pool.request()
    .input('typ',     sql.NVarChar(40), VORWARN_TYP)
    .input('fromOid', sql.NVarChar(36), user.oid)
    .query('SELECT COUNT(*) AS n FROM dbo.Benachrichtigungen WHERE Typ = @typ AND FromUserOid = @fromOid');
  if (vorhanden.recordset[0].n > 0) return false;

  for (const userOid of ziele) {
    await pool.request()
      .input('userOid', sql.NVarChar(36), userOid)
      .input('typ',     sql.NVarChar(40), VORWARN_TYP)
      .input('fromOid', sql.NVarChar(36), user.oid)
      .query(`INSERT INTO dbo.Benachrichtigungen (UserOid, Typ, WocheId, FromUserOid)
              VALUES (@userOid, @typ, NULL, @fromOid)`);
  }
  return true;
}

/* ── Ein vollständiger Lauf ──────────────────────────────────────
   Reihenfolge: Kandidaten lesen → vorwarnen → löschen → Dateien → Selbstprüfung.
   Fail closed: scheitert das Lesen der Kandidatenliste, wird NICHTS gelöscht
   (wie entraSync bei Token-/Gruppenfehlern). Ein Fehler bei EINEM Nutzer rollt
   nur dessen Transaktion zurück und stoppt den Lauf nicht (wie fuehreBackupAus).
   Alle Abhängigkeiten injizierbar → ohne DB und ohne echte Uhr testbar. */
async function runRetention(deps = {}) {
  const {
    listKandidaten = ermittleKandidaten,
    loescheNutzer: loescheFn = loescheNutzer,
    sendeVorwarnung: warnFn = sendeVorwarnung,
    empfaenger: empfaengerFn = ermittleVorwarnEmpfaenger,
    raeumeDateien = raeumeWaisenDateien,
    pruefeSpalten = pruefeUnbekannteSpalten,
    jetzt = new Date(),
    fristTage = LOESCHFRIST_TAGE,
    vorwarnTage = VORWARN_TAGE,
    dir = IHK_IMPORT_DIR,
    logFehler = () => {},
  } = deps;

  const bericht = {
    kandidaten: 0, vorgewarnt: 0, geloescht: 0, gesperrt: 0,
    anonymisiert: 0, dateienEntfernt: 0, fehler: [],
  };

  let kandidaten;
  try {
    kandidaten = (await listKandidaten()) || [];
  } catch (err) {
    // Ohne verlässliche Liste wird nicht gelöscht.
    bericht.fehler.push({ oid: null, name: '(kandidaten)', fehler: err.message });
    logFehler({ quelle: 'backend', nachricht: `[retention] Kandidaten: ${err.message}`, stack: err.stack });
    return bericht;
  }
  bericht.kandidaten = kandidaten.length;

  const opts = { jetzt, fristTage, vorwarnTage };
  const verbleibend = new Set(kandidaten.map((u) => u.oid));

  // Vorwarnen
  const zuWarnen = kandidaten.filter((u) => istVorwarnFaellig(u, opts));
  if (zuWarnen.length) {
    let empfaenger = [];
    try { empfaenger = (await empfaengerFn()) || []; }
    catch (err) {
      bericht.fehler.push({ oid: null, name: '(empfaenger)', fehler: err.message });
      logFehler({ quelle: 'backend', nachricht: `[retention] Empfaenger: ${err.message}`, stack: err.stack });
    }
    for (const u of zuWarnen) {
      try { if (await warnFn(u, { empfaenger })) bericht.vorgewarnt++; }
      catch (err) {
        bericht.fehler.push({ oid: u.oid, name: u.name || '', fehler: err.message });
        logFehler({ quelle: 'backend', nachricht: `[retention] Vorwarnung ${u.oid}: ${err.message}`, stack: err.stack });
      }
    }
  }

  // Löschen
  const geloeschteOids = new Set();
  for (const u of kandidaten) {
    if (!istFaellig(u, opts)) {
      // Nur als "gesperrt" zählen, was ohne Sperre fällig WÄRE — sonst zählte
      // jedes Konto mit Restlaufzeit mit.
      if (u.loeschsperreBis && istFaellig({ ...u, loeschsperreBis: null }, opts)) bericht.gesperrt++;
      continue;
    }
    try {
      const zeilen = await loescheFn(u);
      bericht.geloescht++;
      verbleibend.delete(u.oid);
      geloeschteOids.add(u.oid);
      // Nur Phase B: Belege in FREMDEN Heften, an denen der Name stehen bleibt.
      bericht.anonymisiert += (zeilen && zeilen.phaseB) || 0;
    } catch (err) {
      bericht.fehler.push({ oid: u.oid, name: u.name || '', fehler: err.message });
      logFehler({ quelle: 'backend', nachricht: `[retention] Loeschen ${u.oid}: ${err.message}`, stack: err.stack });
    }
  }

  // Dateien: alle OIDs, die es noch gibt — die eben gelöschten sind raus.
  // Muss ALLE Nutzer kennen, nicht nur die Kandidaten, sonst gelten aktive
  // Konten als Waisen und ihre IHK-PDFs würden gelöscht.
  try {
    const alle = await alleUserOids(deps);
    for (const oid of verbleibend) alle.add(oid);
    // Explizit entfernen, was DIESER Lauf gerade gelöscht hat — unabhängig
    // davon, ob alleUserOids() (echte DB-Abfrage oder injizierter Snapshot)
    // die Löschung bereits widerspiegelt. Ohne dieses Entfernen bliebe das
    // IHK-PDF eines gerade gelöschten Kontos liegen, sobald die Quelle von
    // alleUserOids() nicht in derselben Sekunde konsistent ist.
    for (const oid of geloeschteOids) alle.delete(oid);
    const res = raeumeDateien({ dir, existierendeOids: alle });
    bericht.dateienEntfernt = res.entfernt.length;
    for (const p of res.probleme) {
      bericht.fehler.push({ oid: null, name: '(dateien)', fehler: p });
      logFehler({ quelle: 'backend', nachricht: `[retention] Datei: ${p}` });
    }
  } catch (err) {
    bericht.fehler.push({ oid: null, name: '(dateien)', fehler: err.message });
    logFehler({ quelle: 'backend', nachricht: `[retention] Dateien: ${err.message}`, stack: err.stack });
  }

  // Selbstprüfung: nachrangig, darf den Lauf nicht kippen. Absichtlich NUR
  // logFehler, kein bericht.fehler-Eintrag: es betrifft keine Person dieses
  // Laufs, sondern ein strukturelles Versaeumnis (neue Personenspalte
  // vergessen) - ein Eintrag dort wuerde bei jedem Lauf doppelt gemeldet werden
  // (Fehlerinbox UND Bericht). Nicht ohne Ruecksprache "fixen".
  try {
    const unbekannt = await pruefeSpalten();
    if (unbekannt.length) {
      logFehler({
        quelle: 'backend',
        nachricht: `[retention] Spalten mit Personenbindung, die der Loeschjob NICHT kennt: ${unbekannt.join(', ')} — personenbezogene Daten bleiben dort liegen.`,
        schweregrad: 'hoch',
      });
    }
  } catch (err) {
    logFehler({ quelle: 'backend', nachricht: `[retention] Selbstpruefung: ${err.message}`, stack: err.stack });
  }

  return bericht;
}

// OIDs aller noch existierenden Nutzer (für die Waisen-Erkennung).
// Injizierbar über deps.alleOids, damit runRetention ohne DB testbar bleibt.
async function alleUserOids(deps = {}) {
  if (deps.alleOids) return new Set(await deps.alleOids());
  const pool = await getPool();
  const res = await pool.request().query('SELECT Oid FROM dbo.Users');
  return new Set(res.recordset.map((r) => r.Oid));
}

/* Lauf-Sperre wie bei runBackup: der 03:00-Timer und ein evtl. manueller
   Aufruf dürfen sich nicht überlappen — zwei parallele Läufe würden dieselben
   Kandidaten doppelt verarbeiten. */
let laufenderLauf = null;

function runRetentionSerialisiert(deps = {}) {
  if (laufenderLauf) return laufenderLauf;
  laufenderLauf = runRetention(deps).finally(() => { laufenderLauf = null; });
  return laufenderLauf;
}

module.exports = {
  LOESCHFRIST_TAGE, VORWARN_TAGE,
  istDemoKonto, loeschDatum, istFaellig, istVorwarnFaellig,
  PHASE_A, PHASE_B, PHASE_C, BEKANNTE_SPALTEN, istBekannteSpalte,
  baueAnweisungen, loescheNutzer, ermittleKandidaten, pruefeUnbekannteSpalten,
  IHK_IMPORT_DIR, raeumeWaisenDateien,
  VORWARN_TYP, ermittleVorwarnEmpfaenger, sendeVorwarnung,
  runRetention, runRetentionSerialisiert,
};
