-- ============================================================
-- Migration 006 – Fahrtgelderstattung: Konfiguration pro Azubi
-- Ausführen gegen: Berichtsheft_Dev
--
-- Speichert die gleichbleibenden Angaben für die Fahrgeld-Excel
-- (Name, Personalnummer, Kostenstelle, Haltestellen, Betrag pro
-- Berufsschultag). Die erkannten Schultage selbst kommen aus den
-- importierten Tagesdaten (dbo.Tage, Ort = Schule) und werden NICHT
-- hier gehalten – nur die Stammdaten für die Vorlage.
-- Ein Datensatz je Azubi (AzubiOid = PK).
-- ============================================================
CREATE TABLE dbo.FahrtgeldKonfig (
  AzubiOid        NVARCHAR(36)  NOT NULL PRIMARY KEY,
  Name            NVARCHAR(120) NULL,
  PersNr          NVARCHAR(20)  NULL,
  Kst             NVARCHAR(20)  NULL,
  VonHaltestelle  NVARCHAR(120) NULL,
  NachHaltestelle NVARCHAR(120) NULL,
  BetragProTag    DECIMAL(6,2)  NOT NULL CONSTRAINT DF_FahrtgeldKonfig_Betrag DEFAULT 0,
  UpdatedAt       DATETIME2     NOT NULL CONSTRAINT DF_FahrtgeldKonfig_UpdatedAt DEFAULT SYSUTCDATETIME()
);
