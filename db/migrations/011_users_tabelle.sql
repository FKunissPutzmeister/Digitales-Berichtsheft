-- ============================================================
-- Migration 011 – dbo.Users (persistenter User-Store)
-- Ausführen gegen: Berichtsheft_Dev
--
-- Ersetzt die frühere In-Memory-DEV_USERS-Liste durch eine persistente
-- Tabelle (einzige Nutzerquelle, per Azure-Object-ID = GUID). Wird beim
-- SSO-Login per JIT-Upsert befüllt; Sonderrollen (admin/dhstudent/developer)
-- werden manuell gepflegt. Ohne diese Tabelle startet Login/Auth ins Leere.
--
-- Inhaltlich identisch zum bereits ausgeführten backend/db/create-users-table.sql
-- – hier als nummerierte Migration konsolidiert. Idempotent, no-op falls vorhanden.
-- ============================================================

IF OBJECT_ID('dbo.Users', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Users (
    Oid              NVARCHAR(36)  NOT NULL PRIMARY KEY,
    Name             NVARCHAR(200) NOT NULL,
    Email            NVARCHAR(256) NULL,
    Role             NVARCHAR(20)  NOT NULL,           -- azubi|pruefer|admin|dhstudent|developer
    KannPlanen       BIT           NOT NULL DEFAULT 0,
    IstAusbilder     BIT           NOT NULL DEFAULT 0,
    Beruf            NVARCHAR(200) NULL,
    AusbildungBeginn DATE          NULL,
    AusbildungEnde   DATE          NULL,
    BerichtTyp       NVARCHAR(20)  NOT NULL DEFAULT N'wöchentlich', -- wöchentlich|täglich
    Aktiv            BIT           NOT NULL DEFAULT 1,
    LetzterLogin     DATETIME2     NULL,
    ErstelltAm       DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    AktualisiertAm   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE UNIQUE INDEX IX_Users_Email ON dbo.Users(Email) WHERE Email IS NOT NULL;
  CREATE INDEX IX_Users_Role  ON dbo.Users(Role);
  PRINT 'Tabelle dbo.Users angelegt.';
END
ELSE PRINT 'dbo.Users existiert bereits.';
