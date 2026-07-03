-- ============================================================
-- Migration 012 – Abteilungs-Katalog (dbo.Abteilungen + AbteilungVerantwortliche)
-- Ausführen gegen: Berichtsheft_Dev
--
-- Katalog der Durchlauf-Abteilungen mit hinterlegten Verantwortlichen
-- (Berichtsheft-Prüfer, per E-Mail geführt). Der Azubi-Planer wählt die
-- Abteilung aus diesem Katalog; die Verantwortlichen-Auswahl wird darauf
-- gefiltert. Anzeigename/OID werden beim SSO-Login des Prüfers nachgezogen.
--
-- Nur Schema. Die Katalogdaten (31 Abteilungen + Verantwortliche) kommen aus
-- backend/db/seed-abteilungen.sql (separat ausführen). Inhaltlich identisch zum
-- Tabellen-Teil von backend/db/create-abteilungen-table.sql – hier als
-- nummerierte Migration konsolidiert. Idempotent, no-op falls vorhanden.
-- ============================================================

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
