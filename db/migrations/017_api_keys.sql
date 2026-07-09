-- ============================================================
-- Migration 017 – API-Schlüssel für den MCP-Zugriff
-- Ausführen gegen: Berichtsheft_Dev
--
-- „Snipe-IT-Modell": Der MCP-Server (intranet-only) wird per persönlichem
-- API-Schlüssel (Bearer) aus einem lokal laufenden Client (Claude Desktop/
-- Code) angesprochen. Developer nehmen Nutzer in der Nutzerverwaltung auf;
-- dabei wird EIN Schlüssel generiert, EINMALIG im Klartext angezeigt und nur
-- als SHA-256-Hash gespeichert. Widerruf = Aktiv=0 bzw. Zeile löschen.
--
-- Idempotent: mehrfaches Ausführen ist gefahrlos.
-- Rollback: DROP TABLE dbo.ApiKeys;  (siehe Runbook)
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables
               WHERE name = 'ApiKeys' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.ApiKeys (
    Id             INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ApiKeys PRIMARY KEY,
    UserOid        NVARCHAR(36)  NOT NULL,     -- Besitzer (dbo.Users.Oid)
    KeyHash        CHAR(64)      NOT NULL,     -- SHA-256(Klartext) als Hex
    Label          NVARCHAR(100) NULL,         -- z.B. "Claude Desktop – Laptop"
    Aktiv          BIT           NOT NULL CONSTRAINT DF_ApiKeys_Aktiv DEFAULT (1),
    ErstelltAm     DATETIME2     NOT NULL CONSTRAINT DF_ApiKeys_ErstelltAm DEFAULT (SYSUTCDATETIME()),
    ZuletztGenutzt DATETIME2     NULL,
    CONSTRAINT UQ_ApiKeys_KeyHash UNIQUE (KeyHash)
  );
  PRINT 'dbo.ApiKeys angelegt.';
END
ELSE
  PRINT 'dbo.ApiKeys existiert bereits – keine Änderung.';

-- Schneller Lookup je Nutzer (Liste in der Nutzerverwaltung).
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_ApiKeys_UserOid' AND object_id = OBJECT_ID('dbo.ApiKeys'))
BEGIN
  CREATE INDEX IX_ApiKeys_UserOid ON dbo.ApiKeys(UserOid);
  PRINT 'Index IX_ApiKeys_UserOid angelegt.';
END
