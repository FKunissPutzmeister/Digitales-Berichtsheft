/* Persistente Nutzer (einzige Quelle, ersetzt DEV_USERS). Per Oid (GUID). */
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
    BerichtTyp       NVARCHAR(20)  NOT NULL DEFAULT N'wöchentlich', -- wöchentlich|täglich (Umlaut-Form wie in der App)
    Aktiv            BIT           NOT NULL DEFAULT 1,
    LetzterLogin     DATETIME2     NULL,
    ErstelltAm       DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    AktualisiertAm   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_Users_Email ON dbo.Users(Email);
  CREATE INDEX IX_Users_Role  ON dbo.Users(Role);
  PRINT 'Tabelle dbo.Users angelegt.';
END
ELSE PRINT 'dbo.Users existiert bereits.';
