-- ============================================================
-- Migration 025 – Zugriffsprotokoll für den MCP-Endpunkt
-- Ausführen gegen: Berichtsheft_Dev
--
-- Bisher gab es außer ApiKeys.ZuletztGenutzt keine Spur, WAS über den
-- MCP-Endpunkt lief (der Zeitstempel wird schon bei einem reinen
-- initialize/tools/list-Handshake aktualisiert, nicht erst bei echtem
-- Tool-Aufruf). Diese Tabelle protokolliert jede JSON-RPC-Methode
-- inkl. Tool-Name (bei tools/call), damit sich „wer hat wann was
-- aufgerufen" nachvollziehen lässt.
--
-- Idempotent: mehrfaches Ausführen ist gefahrlos.
-- Rollback: DROP TABLE dbo.McpLog;
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.tables
               WHERE name = 'McpLog' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.McpLog (
    Id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_McpLog PRIMARY KEY,
    UserOid    NVARCHAR(36)  NOT NULL,        -- Besitzer des API-Keys (dbo.Users.Oid)
    Methode    NVARCHAR(50)  NOT NULL,        -- initialize | ping | tools/list | tools/call
    ToolName   NVARCHAR(100) NULL,            -- nur bei Methode = tools/call
    Zeitpunkt  DATETIME2     NOT NULL CONSTRAINT DF_McpLog_Zeitpunkt DEFAULT (SYSUTCDATETIME())
  );
  PRINT 'dbo.McpLog angelegt.';
END
ELSE
  PRINT 'dbo.McpLog existiert bereits – keine Änderung.';

-- Für die Anzeige „letzte N Aufrufe" (neueste zuerst).
IF NOT EXISTS (SELECT 1 FROM sys.indexes
               WHERE name = 'IX_McpLog_Zeitpunkt' AND object_id = OBJECT_ID('dbo.McpLog'))
BEGIN
  CREATE INDEX IX_McpLog_Zeitpunkt ON dbo.McpLog(Zeitpunkt DESC);
  PRINT 'Index IX_McpLog_Zeitpunkt angelegt.';
END
