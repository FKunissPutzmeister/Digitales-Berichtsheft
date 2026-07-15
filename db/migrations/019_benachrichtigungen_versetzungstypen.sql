-- ============================================================
-- Migration 019 – Benachrichtigungs-Typen für Abteilungs-Versetzungen
-- Ausführen gegen: Berichtsheft_Dev
--
-- Der Abteilungs-Planer meldet Azubi + Verantwortlicher, wenn eine
-- Zuweisung angelegt/geändert/entfernt wird. Dafür drei neue Typen im
-- CHECK-Constraint. WocheId bleibt bei diesen Mitteilungen NULL (sie
-- referenzieren eine Zuweisung, keine Woche – wie die Beurteilungs-Typen).
-- Idempotent. Muss laufen, BEVOR die Versetzungs-Mitteilungen greifen –
-- vorher scheitern sie am CHECK und werden im Backend best-effort verschluckt.
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
                 'versetzung_neu','versetzung_geaendert','versetzung_entfernt'));
PRINT 'CK_Benachrichtigungen_Typ neu angelegt (inkl. Versetzungs-Typen).';
