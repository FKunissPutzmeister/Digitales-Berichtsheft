-- ============================================================
-- Migration 018 – Schweregrad für Fehlerberichte
-- Ausführen gegen: Berichtsheft_Dev
-- hoch = Kernaktion fehlgeschlagen (Absenden/Genehmigen/Speichern),
-- mittel = Lese-Fehler/manuelle Meldung, gering = Kleinigkeit.
-- Idempotent.
-- ============================================================

-- Spalte + DEFAULT + CHECK in EINEM Statement: ein separates
-- "ADD CONSTRAINT ... CHECK (Schweregrad ...)" würde beim Batch-Compile
-- scheitern, weil die Spalte zu diesem Zeitpunkt noch nicht existiert
-- (T-SQL kompiliert den ganzen Batch vor der Ausführung; ohne GO-Trenner
-- betrifft das auch guarded Blöcke). Inline-Constraints am ADD dürfen die
-- neue Spalte referenzieren.
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.Fehlerberichte')
                 AND name = 'Schweregrad')
BEGIN
  ALTER TABLE dbo.Fehlerberichte ADD Schweregrad NVARCHAR(10) NOT NULL
    CONSTRAINT DF_Fehlerberichte_Schweregrad DEFAULT 'mittel'
    CONSTRAINT CK_Fehlerberichte_Schweregrad
      CHECK (Schweregrad IN ('hoch','mittel','gering'));
  PRINT 'Spalte Fehlerberichte.Schweregrad (inkl. DEFAULT + CHECK) angelegt.';
END
ELSE PRINT 'Fehlerberichte.Schweregrad existiert bereits.';

PRINT 'Migration 018 fertig.';
