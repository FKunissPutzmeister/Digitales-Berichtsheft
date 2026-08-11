-- ============================================================
-- Migration 030 – Löschkonzept: Stichtag und Sperre auf dbo.Users
-- Ausführen gegen: Berichtsheft_Dev
--
-- InaktivSeit ist der Stichtag der Löschfrist (365 Tage). Er wird beim
-- Übergang aktiv -> inaktiv gesetzt und beim Reaktivieren geleert; siehe
-- setUsersAktiv/updateUserProfile in backend/services/users.js.
-- Bewusst NICHT AktualisiertAm verwenden: die Spalte wird von jedem
-- Entra-Sync-Lauf und jeder manuellen Änderung angefasst.
--
-- LoeschsperreBis hält einen Einzelfall zurück (Prüfungsanfechtung,
-- Rechtsstreit). Die Sperre GREIFT, solange LoeschsperreBis >= heute.
-- Sie startet die Frist nicht neu.
--
-- Backfill: heute inaktive Konten bekommen einen FRISCHEN Stichtag, also
-- ein volles Jahr ab Migration. Ein aus AktualisiertAm abgeleiteter Wert
-- könnte zu alt sein und direkt nach dem Deployment löschen.
--
-- Der Backfill läuft über EXEC(), weil run-sql.js die Datei als EINE Batch
-- ausführt (kein GO): eine in derselben Batch neu angelegte Spalte ist dem
-- Parser noch unbekannt und ein direktes UPDATE scheiterte an
-- "Invalid column name 'InaktivSeit'". Muster wie Migration 008/010.
--
-- Idempotent (IF-Guards), no-op auf einer bereits migrierten DB.
-- ============================================================

IF COL_LENGTH('dbo.Users', 'InaktivSeit') IS NULL
BEGIN
  ALTER TABLE dbo.Users ADD InaktivSeit DATETIME2 NULL;
  PRINT 'Spalte dbo.Users.InaktivSeit angelegt.';
END
ELSE PRINT 'dbo.Users.InaktivSeit existiert bereits.';

IF COL_LENGTH('dbo.Users', 'LoeschsperreBis') IS NULL
BEGIN
  ALTER TABLE dbo.Users ADD LoeschsperreBis DATE NULL;
  PRINT 'Spalte dbo.Users.LoeschsperreBis angelegt.';
END
ELSE PRINT 'dbo.Users.LoeschsperreBis existiert bereits.';

-- Backfill der Bestandsdaten (siehe Kopfkommentar zu EXEC).
EXEC('
  UPDATE dbo.Users
     SET InaktivSeit = SYSUTCDATETIME()
   WHERE Aktiv = 0 AND InaktivSeit IS NULL;
');
PRINT 'Backfill InaktivSeit fuer bereits inaktive Konten ausgefuehrt.';

-- Der Retention-Job filtert auf Aktiv = 0 + InaktivSeit; ohne Index ein
-- Full Scan pro Nacht. Bei wenigen hundert Zeilen unkritisch, aber billig.
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_Users_InaktivSeit' AND object_id = OBJECT_ID('dbo.Users'))
BEGIN
  CREATE INDEX IX_Users_InaktivSeit ON dbo.Users(Aktiv, InaktivSeit);
  PRINT 'Index IX_Users_InaktivSeit angelegt.';
END
ELSE PRINT 'Index IX_Users_InaktivSeit existiert bereits.';
