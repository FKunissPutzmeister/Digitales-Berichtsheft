-- ============================================================
-- Migration 008 – Tagdauer (Ganztag/Halbtag) statt Stunden
-- Ausführen gegen: Berichtsheft_Dev
--
-- Das Berichtsheft erfasst keine Arbeitsstunden mehr, sondern nur noch,
-- ob ein Anwesenheitstag ganz- oder halbtags war.
--  - dbo.Tage.Stunden wird entfernt (inkl. Default-Constraint),
--  - dbo.Tage.Tagdauer ('ganztag' | 'halbtag', Default 'ganztag') kommt neu.
-- dbo.Wochen.Gesamtstunden bleibt bestehen (führt jetzt die Zahl der
-- Anwesenheitstage statt Stunden) – separater Cleanup optional.
--
-- Idempotent (IF-Guards), damit ein erneuter Lauf nicht scheitert. Der
-- CHECK läuft über EXEC, damit die neue Spalte im selben Batch sichtbar ist
-- (mssql kennt kein GO als Batch-Trenner).
-- ============================================================

IF COL_LENGTH('dbo.Tage', 'Tagdauer') IS NULL
  ALTER TABLE dbo.Tage
    ADD Tagdauer NVARCHAR(10) NOT NULL
        CONSTRAINT DF_Tage_Tagdauer DEFAULT 'ganztag';

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Tage_Tagdauer')
  EXEC('ALTER TABLE dbo.Tage ADD CONSTRAINT CK_Tage_Tagdauer CHECK (Tagdauer IN (''ganztag'', ''halbtag''))');

IF EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_Tage_Stunden')
  ALTER TABLE dbo.Tage DROP CONSTRAINT DF_Tage_Stunden;

IF COL_LENGTH('dbo.Tage', 'Stunden') IS NOT NULL
  ALTER TABLE dbo.Tage DROP COLUMN Stunden;
