-- ============================================================
-- Migration 010 – Zuweisungen: Verantwortliche per OID statt E-Mail
-- Ausführen gegen: Berichtsheft_Dev
--
-- Hintergrund: Azubi-Planer, Zugriffskontext (ladeKorrekturKontext) und
-- der Demo-Seed nutzen durchgängig AusbilderOid – die OID der/des
-- Verantwortlichen, analog zu AzubiOid und KorrigiertVon. Die Tabelle
-- trug jedoch noch die alte, im Code nirgends mehr referenzierte Spalte
-- VerantwEmail. Dadurch schlug JEDE Wochen-Abfrage fehl
-- ("Invalid column name 'AusbilderOid'") und das Dashboard lud nicht.
-- Tabelle ist leer -> keine Datenmigration nötig.
-- Idempotent: kann gefahrlos erneut ausgeführt werden.
-- ============================================================

IF COL_LENGTH('dbo.Zuweisungen', 'AusbilderOid') IS NULL
  ALTER TABLE dbo.Zuweisungen ADD AusbilderOid NVARCHAR(36) NULL;

IF COL_LENGTH('dbo.Zuweisungen', 'VerantwEmail') IS NOT NULL
  ALTER TABLE dbo.Zuweisungen DROP COLUMN VerantwEmail;
