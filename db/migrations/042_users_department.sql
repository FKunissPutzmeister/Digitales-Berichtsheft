-- ============================================================
-- Migration 042 – Department-Spalte auf dbo.Users
-- Ausführen gegen: Berichtsheft_Dev
--
-- Speichert das rohe Entra-`department`-Feld (z.B. "Gewerbliche
-- Auszubildende", "Kaufmännische Auszubildende", "DH-Studenten") auf
-- dbo.Users — analog zur bestehenden Beruf-Spalte. Wird wie Beruf im
-- Entra-Sync befüllt (kein Login nötig) und ist über den Migration-041-
-- Mechanismus (ManuellUeberschriebeneFelder) manuell überschreibbar.
--
-- Ersetzt NICHT den Berufe-Katalog (dbo.Berufe) — der bleibt für den
-- Abteilungsplaner-Filter im Einsatz. Siehe Design-Spec
-- docs/superpowers/specs/2026-09-01-ausbildungsleiter-department-design.md
-- Idempotent.
-- ============================================================

IF COL_LENGTH('dbo.Users','Department') IS NULL
BEGIN
  ALTER TABLE dbo.Users ADD Department NVARCHAR(200) NULL;
  PRINT 'Spalte Department auf dbo.Users ergänzt.';
END
ELSE PRINT 'dbo.Users hat die Spalte Department bereits.';
