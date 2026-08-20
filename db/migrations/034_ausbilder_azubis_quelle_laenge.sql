-- ============================================================
-- Migration 034 – dbo.AusbilderAzubis.Quelle: Spaltenlänge korrigieren
-- Ausführen gegen: Berichtsheft_Dev
--
-- BEFUND: Migration 024 legt die Spalte als NVARCHAR(12) an, obwohl einer
-- der drei per CHECK-Constraint erlaubten Werte selbst 14 Zeichen lang ist:
--
--   'auto'           ( 4 Zeichen)
--   'manuell'        ( 7 Zeichen)
--   'ausgeschlossen' (14 Zeichen)  ← passt nicht in NVARCHAR(12)
--
-- Sobald services/ausbilderAzubis.js eine bestehende Auto-Zuordnung auf
-- 'ausgeschlossen' umsetzt (Admin entfernt in der Nutzerverwaltung eine per
-- Entra-Sync gesetzte Ausbilder-Zuordnung), scheitert das UPDATE mit
-- "String or binary data would be truncated" (auf 'ausgeschloss' gekappt).
-- Die Route fängt das nur generisch ab → Frontend zeigt "Fehler: Fehler",
-- ohne dass der Admin erkennen kann, dass eigentlich das Speichern der
-- Ausbilder-Zuordnung (nicht z.B. das Aktiv-Flag) gescheitert ist.
--
-- Der CHECK-Constraint selbst war nie das Problem und bleibt unverändert;
-- nur die Spaltenbreite wird auf die längste erlaubte Werte-Länge erweitert.
--
-- Idempotent: ändert nur, was noch nicht NVARCHAR(20) ist.
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.AusbilderAzubis')
             AND name = 'Quelle' AND max_length <> 40) -- NVARCHAR: max_length in Byte (2 je Zeichen)
BEGIN
  ALTER TABLE dbo.AusbilderAzubis ALTER COLUMN Quelle NVARCHAR(20) NOT NULL;
  PRINT 'dbo.AusbilderAzubis.Quelle auf NVARCHAR(20) erweitert.';
END
ELSE PRINT 'dbo.AusbilderAzubis.Quelle hat bereits die korrekte Länge.';
