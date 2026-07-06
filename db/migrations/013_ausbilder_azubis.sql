-- ============================================================
-- Migration 013 – dbo.AusbilderAzubis (dauerhafte Ausbilder<->Azubi-Zuordnung)
-- Ausführen gegen: Berichtsheft_Dev
--
-- n:m, datumslos. Getrennt von dbo.Zuweisungen (die die befristete
-- Abteilungs-Zeitleiste + befristeten Verantwortlichen-Grant modelliert).
-- Referenz per OID (dbo.Users.Oid). Idempotent.
-- ============================================================
IF OBJECT_ID('dbo.AusbilderAzubis', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AusbilderAzubis (
    Id           INT IDENTITY(1,1) PRIMARY KEY,
    AzubiOid     NVARCHAR(36)  NOT NULL,   -- dbo.Users.Oid (Rolle azubi)
    AusbilderOid NVARCHAR(36)  NOT NULL,   -- dbo.Users.Oid (ausbilderfähig)
    ErstelltAm   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_AusbilderAzubis UNIQUE (AzubiOid, AusbilderOid)
  );
  CREATE INDEX IX_AusbilderAzubis_AusbilderOid ON dbo.AusbilderAzubis(AusbilderOid);
  CREATE INDEX IX_AusbilderAzubis_AzubiOid     ON dbo.AusbilderAzubis(AzubiOid);
  PRINT 'Tabelle dbo.AusbilderAzubis angelegt.';
END
ELSE PRINT 'dbo.AusbilderAzubis existiert bereits.';
