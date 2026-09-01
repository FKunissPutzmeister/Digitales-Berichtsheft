-- ============================================================
-- Migration 041 – Manuelle Nutzerverwaltungs-Korrekturen überstehen
--                 Entra-Sync UND Login-JIT
-- Ausführen gegen: Berichtsheft_Dev
--
-- Bisher: upsertUser() (der EINE Schreibpfad für Rolle/Beruf/etc. — läuft bei
-- JEDEM SSO-Login (backend/routes/saml.js) und bei jedem Entra-Sync-Lauf
-- (backend/services/entraSync.js)) durfte Role/KannPlanen/IstAusbilder/Beruf/
-- AusbildungBeginn/AusbildungEnde/BerichtTyp überschreiben, sobald die
-- aktuelle Rolle azubi/pruefer/dhstudent war. Setzte man z.B. Marco.Rossi in
-- der Nutzerverwaltung manuell auf Role=pruefer, kippte der nächste Login
-- (nicht erst der 6h-Sync!) das sofort wieder auf azubi zurück, weil er
-- weiterhin Mitglied der Entra-Gruppe "Alle Azubis Aichtal" war — analog zum
-- Aktiv-Problem, das Migration 038 für die Deaktivierung gelöst hat.
--
-- Diese Migration ergänzt eine Komma-Liste der Spalten, die zuletzt manuell
-- (Nutzerverwaltung, PATCH /api/users/:oid) gesetzt wurden. upsertUser lässt
-- jede darin genannte Spalte danach unangetastet — unabhängig davon, was
-- SAML-Claim oder Entra-Gruppe liefert. Zurücksetzen auf "automatisch" ist
-- aktuell nur per direktem DB-Update möglich (kein UI-Reset).
-- Idempotent.
-- ============================================================

IF COL_LENGTH('dbo.Users','ManuellUeberschriebeneFelder') IS NULL
BEGIN
  ALTER TABLE dbo.Users ADD
    ManuellUeberschriebeneFelder NVARCHAR(400) NOT NULL CONSTRAINT DF_Users_ManuellUeberschriebeneFelder DEFAULT '';
  PRINT 'Spalte ManuellUeberschriebeneFelder auf dbo.Users ergänzt.';
END
ELSE PRINT 'dbo.Users hat die Spalte ManuellUeberschriebeneFelder bereits.';
