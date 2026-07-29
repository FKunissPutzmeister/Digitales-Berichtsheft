-- ============================================================
-- Migration 028 – Einreich-Stempel des Azubis
-- Ausführen gegen: Berichtsheft_Dev
--
-- Bisher trug nur die Ausbilder-Seite einen Zeitstempel
-- (KorrigiertVon/KorrigiertAm, Migration 009). Die Abgabe des Azubis war
-- undatiert, weil die Aktion „einreichen" korrektur:false ist und deshalb
-- nichts stempelte. Im Ausbildungsnachweis stand damit ein Genehmigungs-
-- datum, aber kein Abgabedatum (Audit-Befund G-11); IHK-Vordrucke haben
-- dafür das Feld „Datum, Unterschrift Auszubildende/r".
--
-- EingereichtAm wird bei jedem Einreichen neu gesetzt (letzte Abgabe gilt)
-- und beim Zurückziehen NICHT geleert – der Export zeigt es nur in den
-- Status ab 'freigegeben'.
--
-- Idempotent (IF-Guards).
-- ============================================================

IF COL_LENGTH('dbo.Wochen', 'EingereichtAm') IS NULL
BEGIN
  ALTER TABLE dbo.Wochen ADD EingereichtAm DATETIME2 NULL;
  PRINT 'Spalte dbo.Wochen.EingereichtAm angelegt.';
END
ELSE PRINT 'dbo.Wochen.EingereichtAm existiert bereits.';

IF COL_LENGTH('dbo.Wochen', 'EingereichtVon') IS NULL
BEGIN
  ALTER TABLE dbo.Wochen ADD EingereichtVon NVARCHAR(36) NULL;
  PRINT 'Spalte dbo.Wochen.EingereichtVon angelegt.';
END
ELSE PRINT 'dbo.Wochen.EingereichtVon existiert bereits.';
