-- ============================================================
-- Migration 023 – dbo.UserPhotos (Profilbilder aus Entra)
-- Ausführen gegen: Berichtsheft_Dev
--
-- Speichert die von Microsoft Graph (App-Only, User.Read.All) periodisch
-- synchronisierten Profilfotos getrennt von dbo.Users – dort wird an vielen
-- Stellen per SELECT * gelesen, ein VARBINARY(MAX) in dieser Tabelle würde
-- diese Abfragen unnötig aufblähen/verlangsamen. Wird von
-- services/entraSync.js befüllt, ausgeliefert über GET /api/users/:oid/photo.
-- Idempotent, no-op falls vorhanden.
-- ============================================================

IF OBJECT_ID('dbo.UserPhotos', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.UserPhotos (
    Oid            NVARCHAR(36)   NOT NULL PRIMARY KEY,
    Content        VARBINARY(MAX) NOT NULL,
    ContentType    NVARCHAR(50)   NOT NULL DEFAULT 'image/jpeg',
    AktualisiertAm DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_UserPhotos_Users FOREIGN KEY (Oid) REFERENCES dbo.Users(Oid) ON DELETE CASCADE
  );
  PRINT 'Tabelle dbo.UserPhotos angelegt.';
END
ELSE PRINT 'dbo.UserPhotos existiert bereits.';
