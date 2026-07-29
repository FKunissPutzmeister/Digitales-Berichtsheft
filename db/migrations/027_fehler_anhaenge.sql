-- ============================================================
-- Migration 027 – dbo.FehlerAnhaenge (Bild-/Screenshot-Anhänge
-- zu manuellen Fehlermeldungen)
-- Ausführen gegen: Berichtsheft_Dev
--
-- Spiegelt das Muster von dbo.Anhaenge (004): Inhalt als
-- VARBINARY(MAX) direkt in der DB (transaktionssicher, keine
-- Pfadverwaltung). FK auf Fehlerberichte mit ON DELETE CASCADE,
-- damit Anhänge mit dem Fehler-Cleanup (cleanupAlt) verschwinden.
-- Idempotent, no-op falls vorhanden.
-- ============================================================

IF OBJECT_ID('dbo.FehlerAnhaenge', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.FehlerAnhaenge (
    Id            INT IDENTITY(1,1) PRIMARY KEY,
    FehlerId      INT            NOT NULL,
    Dateiname     NVARCHAR(255)  NOT NULL,
    MimeTyp       NVARCHAR(100)  NULL,
    GroesseBytes  INT            NOT NULL,
    Inhalt        VARBINARY(MAX) NOT NULL,
    HochgeladenAm DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_FehlerAnhaenge_Fehlerberichte FOREIGN KEY (FehlerId)
        REFERENCES dbo.Fehlerberichte(Id) ON DELETE CASCADE
  );
  PRINT 'Tabelle dbo.FehlerAnhaenge angelegt.';
END
ELSE PRINT 'dbo.FehlerAnhaenge existiert bereits.';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_FehlerAnhaenge_FehlerId')
  CREATE INDEX IX_FehlerAnhaenge_FehlerId ON dbo.FehlerAnhaenge (FehlerId);

PRINT 'Migration 027 fertig.';
