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

-- WARNUNG: leert die Tabelle bedingungslos bei JEDEM Ausführen. Nur beim einmaligen Migrations-Run gewünscht.
DELETE FROM dbo.Zuweisungen;
PRINT 'dbo.Zuweisungen geleert (sauberer Start).';

IF COL_LENGTH('dbo.Zuweisungen', 'AusbilderOid') IS NOT NULL
BEGIN
  ALTER TABLE dbo.Zuweisungen DROP COLUMN AusbilderOid;
  PRINT 'Spalte dbo.Zuweisungen.AusbilderOid entfernt.';
END
ELSE PRINT 'dbo.Zuweisungen.AusbilderOid existiert nicht (schon entfernt).';
