-- ============================================================
-- Migration 018 – Schweregrad für Fehlerberichte
-- Ausführen gegen: Berichtsheft_Dev
-- hoch = Kernaktion fehlgeschlagen (Absenden/Genehmigen/Speichern),
-- mittel = Lese-Fehler/manuelle Meldung, gering = Kleinigkeit.
-- Idempotent.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.Fehlerberichte')
                 AND name = 'Schweregrad')
BEGIN
  ALTER TABLE dbo.Fehlerberichte ADD Schweregrad NVARCHAR(10) NOT NULL
    CONSTRAINT DF_Fehlerberichte_Schweregrad DEFAULT 'mittel';
  PRINT 'Spalte Fehlerberichte.Schweregrad angelegt.';
END
ELSE PRINT 'Fehlerberichte.Schweregrad existiert bereits.';

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = 'CK_Fehlerberichte_Schweregrad'
                 AND parent_object_id = OBJECT_ID('dbo.Fehlerberichte'))
BEGIN
  ALTER TABLE dbo.Fehlerberichte ADD CONSTRAINT CK_Fehlerberichte_Schweregrad
    CHECK (Schweregrad IN ('hoch','mittel','gering'));
  PRINT 'CK_Fehlerberichte_Schweregrad angelegt.';
END
ELSE PRINT 'CK_Fehlerberichte_Schweregrad existiert bereits.';

PRINT 'Migration 018 fertig.';
