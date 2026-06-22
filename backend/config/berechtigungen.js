'use strict';
/* =====================================================================
   STATISCHE FÄHIGKEITEN je Nutzer (OID-basiert), Brücke bis Azure-AD-Gruppen.
     kannPlanen   → Adminverwaltung (Berichtsheftverwaltung + Azubi-Planer)
     istAusbilder → dauerhafter Zugang zur Korrektur-Ansicht (kein Lockout)
   Der "Verantwortliche" wird NICHT hier gepflegt, sondern datengetrieben
   aus den Zuweisungen abgeleitet.
   ===================================================================== */

const BERECHTIGUNGEN = {
  // Admin Verwaltung (Personalabteilung): plant, korrigiert aber nicht
  '00000000-0000-0000-0000-000000000004': { kannPlanen: true,  istAusbilder: false },
  // Matthias Lengerer: Ausbilder UND plant
  '00000000-0000-0000-0000-000000000002': { kannPlanen: true,  istAusbilder: true  },
};

// Liefert immer ein vollständiges Flag-Objekt (Defaults false).
function faehigkeitenFuer(oid) {
  const b = BERECHTIGUNGEN[oid] || {};
  return { kannPlanen: !!b.kannPlanen, istAusbilder: !!b.istAusbilder };
}

module.exports = { faehigkeitenFuer };
