-- ============================================================
-- Migration 010 – Zuweisungen: AusbilderOid -> VerantwEmail
-- Ausführen gegen: Berichtsheft_Dev
--
-- Verantwortliche einer Zuweisung werden nicht mehr per Azure-Object-ID
-- (AusbilderOid), sondern durchgängig per E-Mail (UPN, lowercase) über die
-- neue Spalte VerantwEmail referenziert. Grund: die Verantwortlichen
-- (Berichtsheft-Prüfer) haben vor ihrem ersten SSO-Login keine OID; die
-- E-Mail ist der stabile, vorab bekannte Schlüssel. Der Laufzeit-Code
-- (backend/services/zugriffContext.js, backend/routes/zuweisungen.js) und der
-- Abteilungs-Katalog erwarten VerantwEmail.
--
-- ACHTUNG: Altbestand in dbo.Zuweisungen trägt AusbilderOid (OID), das sich
-- nicht auf eine E-Mail zurückabbilden lässt. Beim ERST-Lauf (solange die
-- Alt-Spalte AusbilderOid noch existiert) wird die Tabelle daher geleert.
--
-- Inhaltlich identisch zum bereits ausgeführten backend/db/create-abteilungen-table.sql
-- (dortiger Zuweisungen-Block) – hier als nummerierte Migration konsolidiert.
-- Idempotent (IF-Guards), no-op auf einer bereits migrierten DB.
-- ============================================================

IF COL_LENGTH('dbo.Zuweisungen', 'VerantwEmail') IS NULL
BEGIN
  ALTER TABLE dbo.Zuweisungen ADD VerantwEmail NVARCHAR(255) NULL;
  PRINT 'Spalte dbo.Zuweisungen.VerantwEmail angelegt.';
END
ELSE PRINT 'dbo.Zuweisungen.VerantwEmail existiert bereits.';

-- Bestand nur beim ERST-Migrationslauf leeren (solange die Alt-Spalte
-- AusbilderOid noch existiert). Verhindert versehentliches Leeren bei erneutem Lauf.
IF COL_LENGTH('dbo.Zuweisungen', 'AusbilderOid') IS NOT NULL
BEGIN
  DELETE FROM dbo.Zuweisungen;
  PRINT 'dbo.Zuweisungen geleert (Erst-Migration, sauberer Start).';
END
ELSE PRINT 'dbo.Zuweisungen NICHT geleert (Alt-Spalte AusbilderOid bereits weg = kein Erst-Lauf).';

-- Abhängige Objekte auf AusbilderOid zuerst entfernen, sonst schlägt DROP COLUMN fehl.
IF COL_LENGTH('dbo.Zuweisungen', 'AusbilderOid') IS NOT NULL
BEGIN
  IF EXISTS (SELECT 1 FROM sys.indexes
             WHERE name = 'IX_Zuweisungen_AusbilderOid'
               AND object_id = OBJECT_ID('dbo.Zuweisungen'))
    DROP INDEX IX_Zuweisungen_AusbilderOid ON dbo.Zuweisungen;

  DECLARE @dfName sysname = (
    SELECT dc.name FROM sys.default_constraints dc
    JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('dbo.Zuweisungen') AND c.name = 'AusbilderOid'
  );
  IF @dfName IS NOT NULL
    EXEC('ALTER TABLE dbo.Zuweisungen DROP CONSTRAINT ' + @dfName);

  ALTER TABLE dbo.Zuweisungen DROP COLUMN AusbilderOid;
  PRINT 'Spalte dbo.Zuweisungen.AusbilderOid entfernt.';
END
ELSE PRINT 'dbo.Zuweisungen.AusbilderOid existiert nicht (schon entfernt).';
