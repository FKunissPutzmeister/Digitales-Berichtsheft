'use strict';
/* =====================================================================
   RETENTION / LÖSCHKONZEPT
   Löscht jedes Konto 365 Tage nach seiner Deaktivierung endgültig.

   Aufbau wie berichtsheftBackup.js: reine Entscheidungslogik und
   Datenkonstanten getrennt von I/O, alle Abhängigkeiten injizierbar —
   dadurch ist der Job ohne SQL Server und ohne echte Uhr testbar.

   Spec: docs/superpowers/specs/2026-08-11-loeschkonzept-inaktive-nutzer-design.md
   ===================================================================== */

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
function sperreGreift(user, jetzt) {
  if (!user || !user.loeschsperreBis) return false;
  const bis = String(user.loeschsperreBis).slice(0, 10);
  const heute = jetzt.toISOString().slice(0, 10);
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

module.exports = {
  LOESCHFRIST_TAGE, VORWARN_TAGE,
  istDemoKonto, loeschDatum, istFaellig, istVorwarnFaellig,
  PHASE_A, PHASE_B, PHASE_C, BEKANNTE_TABELLEN,
};
