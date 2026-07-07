-- ============================================================
-- Migration 015 – Beurteilungsbogen für Abteilungsdurchläufe
-- Ausführen gegen: Berichtsheft_Dev
--
-- Eine Beurteilung je Zuweisung (Rotationszeitraum). Kriterien in
-- Kindtabelle (nur Punkte 0–100; Stufe wird abgeleitet). Idempotent.
-- ============================================================

-- 1) Beurteilungen ------------------------------------------------
IF OBJECT_ID('dbo.Beurteilungen', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Beurteilungen (
    Id                      INT IDENTITY(1,1) PRIMARY KEY,
    ZuweisungId             INT           NOT NULL,          -- dbo.Zuweisungen.Id
    AzubiOid                NVARCHAR(36)  NOT NULL,          -- denormalisiert
    Status                  NVARCHAR(20)  NOT NULL CONSTRAINT DF_Beurteilungen_Status DEFAULT 'entwurf',
    IndividuelleBeurteilung NVARCHAR(MAX) NULL,
    GesamtPunkte            DECIMAL(5,2)  NULL,
    Note                    DECIMAL(2,1)  NULL,
    GespraechAm             DATE          NULL,
    BeurteiltVon            NVARCHAR(36)  NULL,
    AbgeschlossenAm         DATETIME2     NULL,
    KenntnisnahmeVon        NVARCHAR(36)  NULL,
    KenntnisnahmeAm         DATETIME2     NULL,
    KorrigiertVon           NVARCHAR(36)  NULL,
    KorrigiertAm            DATETIME2     NULL,
    ErstelltAm              DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    AktualisiertAm          DATETIME2     NULL,
    CONSTRAINT CK_Beurteilungen_Status CHECK (Status IN ('entwurf','abgeschlossen')),
    CONSTRAINT UQ_Beurteilungen_Zuweisung UNIQUE (ZuweisungId)
  );
  CREATE INDEX IX_Beurteilungen_AzubiOid ON dbo.Beurteilungen(AzubiOid);
  PRINT 'Tabelle dbo.Beurteilungen angelegt.';
END
ELSE PRINT 'dbo.Beurteilungen existiert bereits.';

-- 2) BeurteilungKriterien ----------------------------------------
IF OBJECT_ID('dbo.BeurteilungKriterien', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.BeurteilungKriterien (
    Id            INT IDENTITY(1,1) PRIMARY KEY,
    BeurteilungId INT          NOT NULL,
    KriteriumKey  NVARCHAR(40) NOT NULL,
    Punkte        TINYINT      NOT NULL,   -- 0..100 (Stufe abgeleitet)
    CONSTRAINT FK_BeurtKrit_Beurteilung FOREIGN KEY (BeurteilungId)
      REFERENCES dbo.Beurteilungen(Id) ON DELETE CASCADE,
    CONSTRAINT UQ_BeurtKrit UNIQUE (BeurteilungId, KriteriumKey)
  );
  PRINT 'Tabelle dbo.BeurteilungKriterien angelegt.';
END
ELSE PRINT 'dbo.BeurteilungKriterien existiert bereits.';

-- 3) Benachrichtigungen erweitern --------------------------------
-- 3a) Referenz auf die Zuweisung (die 'fällig'-Meldung entsteht, bevor
--     eine Beurteilungen-Zeile existiert -> Zuweisung statt Beurteilung).
IF COL_LENGTH('dbo.Benachrichtigungen', 'ZuweisungId') IS NULL
BEGIN
  ALTER TABLE dbo.Benachrichtigungen ADD ZuweisungId INT NULL;
  PRINT 'Spalte Benachrichtigungen.ZuweisungId ergänzt.';
END
ELSE PRINT 'Benachrichtigungen.ZuweisungId existiert bereits.';

-- 3b) Typ verbreitern (beurteilung_abgeschlossen = 24 Zeichen > 20).
--     Typ hat keinen CHECK-Constraint. Bestehende Nullability BEIBEHALTEN
--     (nicht implizit auf NULL herabstufen), falls die Spalte NOT NULL ist.
IF COL_LENGTH('dbo.Benachrichtigungen', 'Typ') < 80   -- NVARCHAR(40) => 80 Bytes
BEGIN
  IF EXISTS (SELECT 1 FROM sys.columns
             WHERE object_id = OBJECT_ID('dbo.Benachrichtigungen') AND name = 'Typ' AND is_nullable = 0)
    ALTER TABLE dbo.Benachrichtigungen ALTER COLUMN Typ NVARCHAR(40) NOT NULL;
  ELSE
    ALTER TABLE dbo.Benachrichtigungen ALTER COLUMN Typ NVARCHAR(40) NULL;
  PRINT 'Spalte Benachrichtigungen.Typ auf NVARCHAR(40) verbreitert (Nullability beibehalten).';
END
ELSE PRINT 'Benachrichtigungen.Typ ist bereits >= NVARCHAR(40).';

-- 3c) WocheId NULL-erlaubt machen: Beurteilungs-Mitteilungen (fällig/abgeschlossen)
--     referenzieren eine Zuweisung, keine Woche -> WocheId bleibt bei ihnen NULL.
--     Nur ändern, falls die Spalte existiert und aktuell NOT NULL ist (idempotent).
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.Benachrichtigungen') AND name = 'WocheId' AND is_nullable = 0)
BEGIN
  ALTER TABLE dbo.Benachrichtigungen ALTER COLUMN WocheId INT NULL;
  PRINT 'Spalte Benachrichtigungen.WocheId auf NULL-erlaubt gesetzt.';
END
ELSE PRINT 'Benachrichtigungen.WocheId ist bereits NULL-erlaubt (oder Spalte fehlt).';
