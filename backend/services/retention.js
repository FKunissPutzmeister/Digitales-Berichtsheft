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
  return /\.demo$/i.test(String(email || '').trim());
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

module.exports = {
  LOESCHFRIST_TAGE, VORWARN_TAGE,
  istDemoKonto, loeschDatum, istFaellig, istVorwarnFaellig,
};
