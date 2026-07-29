-- ============================================================
-- Migration 027 – Abwesenheitsnotiz je Tag
-- Ausführen gegen: Berichtsheft_Dev
--
-- Die Wochenansicht rendert seit langem ein Feld „Abwesenheitsnotiz
-- (optional)" für Abwesenheitstage (wochenansicht.js), es gab dafür aber
-- keine Spalte: die Eingabe war nach dem Reload weg, ohne Fehlermeldung
-- (stiller Datenverlust, Audit-Befund G-12).
--
-- NICHT zu verwechseln mit dbo.Kommentare.TagId – das ist der Ausbilder-
-- Kanal am Tag. Hier geht es um die Notiz des Azubis zur eigenen Fehlzeit.
--
-- Idempotent (IF-Guard).
-- ============================================================

IF COL_LENGTH('dbo.Tage', 'Abwesenheitsnotiz') IS NULL
BEGIN
  ALTER TABLE dbo.Tage ADD Abwesenheitsnotiz NVARCHAR(1000) NULL;
  PRINT 'Spalte dbo.Tage.Abwesenheitsnotiz angelegt.';
END
ELSE PRINT 'dbo.Tage.Abwesenheitsnotiz existiert bereits.';
