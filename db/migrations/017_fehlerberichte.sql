-- ============================================================
-- Migration 017 – Fehlerberichts-System
-- Ausführen gegen: Berichtsheft_Dev
-- Zentrale Tabelle für Frontend-/Backend-/manuelle Fehler.
-- Idempotent.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'Fehlerberichte' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.Fehlerberichte (
    Id               INT IDENTITY(1,1) PRIMARY KEY,
    ErsterZeitpunkt  DATETIME2   NOT NULL DEFAULT SYSUTCDATETIME(),
    LetzterZeitpunkt DATETIME2   NOT NULL DEFAULT SYSUTCDATETIME(),
    Quelle           NVARCHAR(20)  NOT NULL,
    Nachricht        NVARCHAR(MAX) NOT NULL,
    Stack            NVARCHAR(MAX) NULL,
    Kontext          NVARCHAR(MAX) NULL,
    BenutzerOid      NVARCHAR(36)  NULL,
    BenutzerName     NVARCHAR(200) NULL,
    Fingerprint      NVARCHAR(64)  NOT NULL,
    Anzahl           INT           NOT NULL DEFAULT 1,
    Erledigt         BIT           NOT NULL DEFAULT 0,
    ErledigtVon      NVARCHAR(200) NULL,
    ErledigtAm       DATETIME2     NULL,
    CONSTRAINT CK_Fehlerberichte_Quelle CHECK (Quelle IN ('frontend','backend','manual'))
  );
  PRINT 'Tabelle dbo.Fehlerberichte angelegt.';
END
ELSE PRINT 'dbo.Fehlerberichte existiert bereits.';

-- Gruppierung beim Insert: schneller Zugriff auf offene Einträge je Fingerprint.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Fehlerberichte_Fingerprint_offen')
  CREATE INDEX IX_Fehlerberichte_Fingerprint_offen
    ON dbo.Fehlerberichte (Fingerprint, Erledigt);

-- Liste sortieren + Cleanup nach Alter.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Fehlerberichte_LetzterZeitpunkt')
  CREATE INDEX IX_Fehlerberichte_LetzterZeitpunkt
    ON dbo.Fehlerberichte (LetzterZeitpunkt DESC);

PRINT 'Migration 017 fertig.';
