-- ============================================================
-- Migration 050 – Datum am Noten-Eintrag optional
-- Ausführen gegen: Berichtsheft_Dev
--
-- Pflicht sind nur noch Titel und Note (Prüfung in app/js/noten-core.js,
-- pruefeEintrag). Das Datum einer Klassenarbeit kennt nicht jeder mehr –
-- es darf deshalb leer bleiben. Sortiert wird weiter nach Datum DESC;
-- NULL landet dabei hinten.
-- Idempotent.
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.NotenEintraege') AND name = 'Datum' AND is_nullable = 0)
BEGIN
  ALTER TABLE dbo.NotenEintraege ALTER COLUMN Datum DATE NULL;
  PRINT 'NotenEintraege.Datum ist jetzt optional.';
END
ELSE PRINT 'NotenEintraege.Datum ist bereits optional.';
