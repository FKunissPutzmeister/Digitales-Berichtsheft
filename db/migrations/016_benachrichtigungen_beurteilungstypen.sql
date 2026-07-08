-- ============================================================
-- Migration 016 – Benachrichtigungen für Beurteilungs-Mitteilungen fit machen
-- Ausführen gegen: Berichtsheft_Dev
--
-- Migration 015 nahm an, Typ hätte keinen CHECK-Constraint — die DB
-- hat aber CK_Benachrichtigungen_Typ (erlaubt nur 'genehmigt' /
-- 'abgelehnt'). Die Beurteilungs-Mitteilungen scheitern daran mit
-- CHECK-Constraint-Verletzung. Außerdem ist FromUserOid NOT NULL,
-- die automatischen 'beurteilung_faellig'-Mitteilungen haben aber
-- keinen Absender. Beides hier. Idempotent.
-- ============================================================

-- 1) CHECK-Constraint neu mit allen vier vom Backend geschriebenen Typen.
IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_Benachrichtigungen_Typ'
             AND parent_object_id = OBJECT_ID('dbo.Benachrichtigungen'))
BEGIN
  ALTER TABLE dbo.Benachrichtigungen DROP CONSTRAINT CK_Benachrichtigungen_Typ;
  PRINT 'CK_Benachrichtigungen_Typ (alt) entfernt.';
END

ALTER TABLE dbo.Benachrichtigungen ADD CONSTRAINT CK_Benachrichtigungen_Typ
  CHECK (Typ IN ('genehmigt','abgelehnt','beurteilung_faellig','beurteilung_abgeschlossen'));
PRINT 'CK_Benachrichtigungen_Typ neu angelegt (inkl. Beurteilungs-Typen).';

-- 2) FromUserOid NULL erlauben: systemgenerierte Mitteilungen
--    (beurteilung_faellig) haben keinen Absender, der Code schreibt NULL.
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.Benachrichtigungen')
             AND name = 'FromUserOid' AND is_nullable = 0)
BEGIN
  ALTER TABLE dbo.Benachrichtigungen ALTER COLUMN FromUserOid NVARCHAR(36) NULL;
  PRINT 'Spalte Benachrichtigungen.FromUserOid auf NULL-erlaubt gesetzt.';
END
ELSE PRINT 'Benachrichtigungen.FromUserOid ist bereits NULL-erlaubt.';
