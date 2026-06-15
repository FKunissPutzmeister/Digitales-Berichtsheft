-- ============================================================
-- Migration 005 – Stunden mit Minutengenauigkeit (TinyInt → Decimal)
-- Ausführen gegen: Berichtsheft_Dev
--
-- Hintergrund: Das Frontend (Wochenansicht-Time-Spinner) erfasst Stunden
-- minutengenau und speichert sie dezimal (z. B. 6,27 h = 6:16). Die
-- Spalten dbo.Tage.Stunden (TinyInt) und dbo.Wochen.Gesamtstunden
-- (SmallInt) konnten bisher nur ganze Stunden halten und hätten die
-- Minuten beim Speichern abgeschnitten. Beim ESS-Zeitnachweis-Import
-- (Ist-Werte aus SAP, durchweg dezimal) wäre das ein echter Datenverlust.
-- Diese Migration erweitert die Typen verlustfrei auf DECIMAL.
-- ============================================================

-- Die DEFAULT-Constraints (DEFAULT 0) müssen vor dem Typwechsel entfernt
-- und danach neu angelegt werden – sonst blockiert SQL Server das ALTER
-- COLUMN ("one or more objects access this column").

-- 1) Tagesstunden: 0–99,99 h
ALTER TABLE dbo.Tage DROP CONSTRAINT DF_Tage_Stunden;
ALTER TABLE dbo.Tage ALTER COLUMN Stunden DECIMAL(4,2) NOT NULL;
ALTER TABLE dbo.Tage ADD CONSTRAINT DF_Tage_Stunden DEFAULT 0 FOR Stunden;

-- 2) Wochensumme: 0–999,99 h
ALTER TABLE dbo.Wochen DROP CONSTRAINT DF_Wochen_Gesamtstunden;
ALTER TABLE dbo.Wochen ALTER COLUMN Gesamtstunden DECIMAL(5,2) NOT NULL;
ALTER TABLE dbo.Wochen ADD CONSTRAINT DF_Wochen_Gesamtstunden DEFAULT 0 FOR Gesamtstunden;
