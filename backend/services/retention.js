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

// Für die Selbstprüfung gegen INFORMATION_SCHEMA: alles, was der Job kennt.
// Kaskaden-Kinder und fremdverwaltete Tabellen gehören dazu, sonst meldet die
// Prüfung sie fälschlich als vergessen. Fehlerberichte hat eine eigene
// 90-Tage-Rotation (services/fehlerberichte.js) und ist bewusst ausgenommen.
const BEKANNTE_TABELLEN = new Set([
  ...PHASE_A.map(e => e.tabelle),
  ...PHASE_B.map(e => e.tabelle),
  ...PHASE_C.map(e => e.tabelle),
  'Anhaenge', 'BeurteilungKriterien', 'UserPhotos',
  'Fehlerberichte', 'FehlerAnhaenge',
]);

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
   schon gibt). Steht die Tabelle einer Fundstelle nicht in
   BEKANNTE_TABELLEN, hat jemand eine Tabelle angelegt, ohne den Löschjob
   anzupassen — dann bleiben dort personenbezogene Daten liegen.
   Liefert die Namen der unbekannten Tabellen; der Aufrufer meldet sie. */
async function pruefeUnbekannteTabellen(poolOverride) {
  const pool = poolOverride || await getPool();
  const res = await pool.request().query(`
    SELECT DISTINCT TABLE_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = 'dbo'
       AND (COLUMN_NAME LIKE '%Oid' OR COLUMN_NAME LIKE '%Von' OR COLUMN_NAME LIKE '%Email')`);
  return res.recordset
    .map((r) => r.TABLE_NAME)
    .filter((t) => !BEKANNTE_TABELLEN.has(t));
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
    pruefeTabellen = pruefeUnbekannteTabellen,
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

  // Selbstprüfung: nachrangig, darf den Lauf nicht kippen.
  try {
    const unbekannt = await pruefeTabellen();
    if (unbekannt.length) {
      logFehler({
        quelle: 'backend',
        nachricht: `[retention] Tabellen mit Personenbindung, die der Loeschjob NICHT kennt: ${unbekannt.join(', ')} — personenbezogene Daten bleiben dort liegen.`,
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
  PHASE_A, PHASE_B, PHASE_C, BEKANNTE_TABELLEN,
  baueAnweisungen, loescheNutzer, ermittleKandidaten, pruefeUnbekannteTabellen,
  IHK_IMPORT_DIR, raeumeWaisenDateien,
  VORWARN_TYP, ermittleVorwarnEmpfaenger, sendeVorwarnung,
  runRetention, runRetentionSerialisiert,
};
