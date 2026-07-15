-- ============================================================
-- Migration 020 – Zuweisungen: Invariante Bis >= Von auf DB-Ebene
-- Ausführen gegen: Berichtsheft_Dev
--
-- Ergänzt die (bereits im Backend erzwungene) Prüfung von<=bis als
-- CHECK-Constraint, damit auch direkte DB-/Import-/MCP-Schreibpfade keine
-- bis<von-Zeiträume anlegen (die im Planer als negative Balkenbreite lautlos
-- verschwinden und Overlap-/Lücken-Rechnung verfälschen). Offene Zuweisung
-- (Bis IS NULL) bleibt erlaubt. Idempotent.
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_Zuweisungen_VonBis'
             AND parent_object_id = OBJECT_ID('dbo.Zuweisungen'))
BEGIN
  ALTER TABLE dbo.Zuweisungen DROP CONSTRAINT CK_Zuweisungen_VonBis;
  PRINT 'CK_Zuweisungen_VonBis (alt) entfernt.';
END

ALTER TABLE dbo.Zuweisungen ADD CONSTRAINT CK_Zuweisungen_VonBis
  CHECK (Bis IS NULL OR Bis >= Von);
PRINT 'CK_Zuweisungen_VonBis angelegt (Bis IS NULL OR Bis >= Von).';
