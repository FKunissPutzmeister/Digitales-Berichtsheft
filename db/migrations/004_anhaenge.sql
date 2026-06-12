-- ============================================================
-- Migration 004 – Datei-Anhänge auf Wochen-Ebene
-- Ausführen gegen: Berichtsheft_Dev
-- ============================================================

-- dbo.Anhaenge: Datei-Anhänge, die zu einer Berichtswoche gehören.
-- Der Inhalt wird direkt als VARBINARY(MAX) in der DB gehalten
-- (ein Backup, transaktionssicher, keine Pfadverwaltung).
-- ON DELETE CASCADE: Anhänge verschwinden automatisch, wenn die
-- zugehörige Woche gelöscht wird.
CREATE TABLE dbo.Anhaenge (
  Id             INT IDENTITY(1,1) PRIMARY KEY,
  WocheId        INT            NOT NULL,
  Dateiname      NVARCHAR(255)  NOT NULL,
  MimeTyp        NVARCHAR(100)  NULL,
  GroesseBytes   INT            NOT NULL,
  Inhalt         VARBINARY(MAX) NOT NULL,
  HochgeladenVon NVARCHAR(36)   NOT NULL,
  HochgeladenAm  DATETIME2      NOT NULL
      CONSTRAINT DF_Anhaenge_HochgeladenAm DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_Anhaenge_Wochen FOREIGN KEY (WocheId)
      REFERENCES dbo.Wochen(Id) ON DELETE CASCADE
);

-- Schnelles Auflisten aller Anhänge einer Woche.
CREATE INDEX IX_Anhaenge_WocheId ON dbo.Anhaenge(WocheId);
