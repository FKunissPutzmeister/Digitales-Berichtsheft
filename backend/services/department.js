'use strict';
/* Department-Klassifizierung: bildet das Entra-`department`-Feld eines
   Nutzers (siehe backend/services/entraSync.js) auf einen Bereich ab.
   Eigenständiges Modul, weil diese Unterscheidung über die Ausbildungs-
   leiter-Ermittlung (beurteilungen.js) hinaus gebraucht werden kann —
   siehe Design-Spec docs/superpowers/specs/
   2026-09-01-ausbildungsleiter-department-design.md. Kein Anbau an
   berufe.js (Beruf-Katalog, bleibt unverändert für den Abteilungsplaner
   bestehen) oder entraSync.js (Sync-Service). */

// Case-insensitiv/substring, gleiches Muster wie das bestehende
// berichtTypAusDepartment (entraSync.js). DH-Studenten zählen zur
// kaufmännischen Ausbildungsleitung (fachliche Vorgabe).
function bereichAusDepartment(department) {
  const d = String(department || '').toLowerCase();
  if (d.includes('gewerblich')) return 'technisch';
  if (d.includes('kaufm')) return 'kaufmaennisch';
  if (d.includes('dh-student') || d.includes('dh student')) return 'kaufmaennisch';
  return null;
}

module.exports = { bereichAusDepartment };
