-- ============================================================
-- Migration 029 – Unterweisung-aktiv-Flag je Tag
-- Ausführen gegen: Berichtsheft_Dev
--
-- Die Unterweisung-Kachel in der Tagesansicht (wochenansicht.js) ist pro
-- Tag auf-/zuklappbar ("+ Unterweisung & besondere Ereignisse hinzufügen").
-- Damit ein aktivierter, aber noch leerer Eintrag NICHT als "vollständig
-- erfasst" (grüner Status-Streifen) zählt, muss der Aktivierungs-Zustand
-- selbst gespeichert werden – reiner Text-Inhalt (UnterweisungEintrag)
-- reicht nicht, weil er bei „aktiviert aber leer" identisch mit „nie
-- angefasst" wäre.
--
-- Idempotent (IF-Guard).
-- ============================================================

IF COL_LENGTH('dbo.Tage', 'UnterweisungAktiv') IS NULL
BEGIN
  ALTER TABLE dbo.Tage ADD UnterweisungAktiv BIT NOT NULL DEFAULT 0;
  PRINT 'Spalte dbo.Tage.UnterweisungAktiv angelegt.';
END
ELSE PRINT 'dbo.Tage.UnterweisungAktiv existiert bereits.';
