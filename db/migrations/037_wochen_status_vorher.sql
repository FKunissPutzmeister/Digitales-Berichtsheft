-- ============================================================
-- Migration 037 – Vorstatus für die Rücknahme eines Statuswechsels
-- Ausführen gegen: Berichtsheft_Dev
--
-- Ausbilder/Prüfer können eine versehentlich erteilte Genehmigung oder
-- Rückweisung innerhalb von 28 Tagen (RUECKNAHME_TAGE, services/zugriff.js)
-- wieder zurücknehmen. Dafür muss der Zustand VOR dem letzten Wechsel
-- bekannt sein – ableiten lässt er sich nicht:
--   'genehmigt' kann aus 'freigegeben' ODER 'erstgenehmigt' kommen,
--   'abgelehnt' ebenso, und die Ausbilder-Rückgabe setzt EndabnahmeDirekt=1
--   (der Wert davor war nicht zwingend 0 – eine zweimal zurückgegebene
--   Woche trägt schon 1).
--
-- Beide Spalten trägt nur der jeweils LETZTE Korrektur-Wechsel; die
-- Rücknahme leert sie wieder. Keine Historie, nur ein Schritt zurück.
--
-- Idempotent (IF-Guards).
-- ============================================================

IF COL_LENGTH('dbo.Wochen', 'StatusVorher') IS NULL
BEGIN
  ALTER TABLE dbo.Wochen ADD StatusVorher NVARCHAR(20) NULL;
  PRINT 'Spalte dbo.Wochen.StatusVorher angelegt.';
END
ELSE PRINT 'dbo.Wochen.StatusVorher existiert bereits.';

IF COL_LENGTH('dbo.Wochen', 'EndabnahmeDirektVorher') IS NULL
BEGIN
  ALTER TABLE dbo.Wochen ADD EndabnahmeDirektVorher BIT NULL;
  PRINT 'Spalte dbo.Wochen.EndabnahmeDirektVorher angelegt.';
END
ELSE PRINT 'dbo.Wochen.EndabnahmeDirektVorher existiert bereits.';
