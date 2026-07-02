/* Abteilungs-Katalog + E-Mail-verankerte Verantwortliche.
   Idempotent; ALTER an dbo.Zuweisungen defensiv (Tabelle existiert bereits,
   hat aber kein committetes CREATE-Skript). */

IF OBJECT_ID('dbo.Abteilungen', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Abteilungen (
    Id     INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Name   NVARCHAR(120) NOT NULL,
    IstPmm BIT NOT NULL DEFAULT 0,
    Aktiv  BIT NOT NULL DEFAULT 1
  );
  CREATE UNIQUE INDEX IX_Abteilungen_Name ON dbo.Abteilungen(Name);
  PRINT 'Tabelle dbo.Abteilungen angelegt.';
END
ELSE PRINT 'dbo.Abteilungen existiert bereits.';

IF OBJECT_ID('dbo.AbteilungVerantwortliche', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AbteilungVerantwortliche (
    Id          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    AbteilungId INT NOT NULL,
    Email       NVARCHAR(255) NOT NULL,
    Anzeigename NVARCHAR(200) NULL,
    Oid         NVARCHAR(36)  NULL,
    CONSTRAINT FK_AbteilungVerantw_Abteilung
      FOREIGN KEY (AbteilungId) REFERENCES dbo.Abteilungen(Id) ON DELETE CASCADE
  );
  CREATE UNIQUE INDEX IX_AbteilungVerantw_AbtEmail
    ON dbo.AbteilungVerantwortliche(AbteilungId, Email);
  CREATE INDEX IX_AbteilungVerantw_Email ON dbo.AbteilungVerantwortliche(Email);
  PRINT 'Tabelle dbo.AbteilungVerantwortliche angelegt.';
END
ELSE PRINT 'dbo.AbteilungVerantwortliche existiert bereits.';

/* dbo.Zuweisungen: AusbilderOid -> VerantwEmail. Bestand wird geleert
   (User bestätigt), daher kein Daten-Backfill der neuen Spalte nötig. */
IF COL_LENGTH('dbo.Zuweisungen', 'VerantwEmail') IS NULL
BEGIN
  ALTER TABLE dbo.Zuweisungen ADD VerantwEmail NVARCHAR(255) NULL;
  PRINT 'Spalte dbo.Zuweisungen.VerantwEmail angelegt.';
END
ELSE PRINT 'dbo.Zuweisungen.VerantwEmail existiert bereits.';

-- Bestand nur beim ERST-Migrationslauf leeren (solange die Alt-Spalte AusbilderOid noch
-- existiert). Verhindert versehentliches Leeren bei erneutem Ausführen des Skripts.
IF COL_LENGTH('dbo.Zuweisungen', 'AusbilderOid') IS NOT NULL
BEGIN
  DELETE FROM dbo.Zuweisungen;
  PRINT 'dbo.Zuweisungen geleert (Erst-Migration, sauberer Start).';
END
ELSE PRINT 'dbo.Zuweisungen NICHT geleert (Alt-Spalte AusbilderOid bereits weg = kein Erst-Lauf).';

IF COL_LENGTH('dbo.Zuweisungen', 'AusbilderOid') IS NOT NULL
BEGIN
  -- Abhängige Objekte auf AusbilderOid zuerst entfernen, sonst schlägt DROP COLUMN fehl.
  -- (Index IX_Zuweisungen_AusbilderOid + evtl. DEFAULT-Constraint aus dem Alt-Schema.)
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
