-- ============================================================
-- Migration 021 – Benachrichtigungs-Typen für Vertretungen
-- Ausführen gegen: Berichtsheft_Dev
--
-- Wird eine Vertretung angelegt/beendet, erhält der Vertreter eine
-- In-App-Mitteilung. Dafür zwei neue Typen im CHECK-Constraint.
-- WocheId/ZuweisungId bleiben bei diesen Mitteilungen NULL. Idempotent.
-- Muss laufen, BEVOR die Vertretungs-Mitteilungen greifen – vorher
-- scheitern sie am CHECK und werden im Backend best-effort verschluckt.
-- Basiert auf Migration 019 (inkl. Versetzungs-Typen).
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_Benachrichtigungen_Typ'
             AND parent_object_id = OBJECT_ID('dbo.Benachrichtigungen'))
BEGIN
  ALTER TABLE dbo.Benachrichtigungen DROP CONSTRAINT CK_Benachrichtigungen_Typ;
  PRINT 'CK_Benachrichtigungen_Typ (alt) entfernt.';
END

ALTER TABLE dbo.Benachrichtigungen ADD CONSTRAINT CK_Benachrichtigungen_Typ
  CHECK (Typ IN ('genehmigt','abgelehnt','beurteilung_faellig','beurteilung_abgeschlossen',
                 'versetzung_neu','versetzung_geaendert','versetzung_entfernt',
                 'vertretung_neu','vertretung_beendet'));
PRINT 'CK_Benachrichtigungen_Typ neu angelegt (inkl. Vertretungs-Typen).';
