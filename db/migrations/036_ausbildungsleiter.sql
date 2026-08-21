-- ============================================================
-- Migration 036 – Ausbildungsleiter statt Ausbilder im Beurteilungsbogen
-- Ausführen gegen: Berichtsheft_Dev
--
-- Migration 035 hat den dritten Signatur-Schritt fälschlich an "Ausbilder"
-- benannt (gemeint war: der zuständige Ausbildungsleiter, zwei feste
-- Personen je Berufsgruppe). Diese Migration:
-- 1) benennt die betroffenen Beurteilungen-Spalten um (Daten bleiben erhalten)
-- 2) legt den Berufe->Bereich-Katalog an (Pflege in der Nutzerverwaltung)
-- 3) ergänzt IstAusbildungsleiter/AusbildungsleiterBereich auf dbo.Users
-- Idempotent.
-- ============================================================

IF COL_LENGTH('dbo.Beurteilungen','AusbilderBestaetigtVon') IS NOT NULL
   AND COL_LENGTH('dbo.Beurteilungen','AusbildungsleiterBestaetigtVon') IS NULL
BEGIN
  EXEC sp_rename 'dbo.Beurteilungen.AusbilderBestaetigtVon', 'AusbildungsleiterBestaetigtVon', 'COLUMN';
  EXEC sp_rename 'dbo.Beurteilungen.AusbilderBestaetigtAm', 'AusbildungsleiterBestaetigtAm', 'COLUMN';
  EXEC sp_rename 'dbo.Beurteilungen.AusbilderUnterschriftBild', 'AusbildungsleiterUnterschriftBild', 'COLUMN';
  EXEC sp_rename 'dbo.Beurteilungen.AusbilderUnterschriftExt', 'AusbildungsleiterUnterschriftExt', 'COLUMN';
  PRINT 'Beurteilungen-Spalten von Ausbilder* auf Ausbildungsleiter* umbenannt.';
END
ELSE PRINT 'Umbenennung bereits erfolgt oder Ausgangsspalten fehlen.';

IF OBJECT_ID('dbo.Berufe', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Berufe (
    Id      INT IDENTITY(1,1) PRIMARY KEY,
    Beruf   NVARCHAR(200) NOT NULL,
    Bereich NVARCHAR(20)  NOT NULL
      CONSTRAINT CK_Berufe_Bereich CHECK (Bereich IN ('technisch','kaufmaennisch')),
    CONSTRAINT UQ_Berufe_Beruf UNIQUE (Beruf)
  );
  INSERT INTO dbo.Berufe (Beruf, Bereich) VALUES
    ('Industriemechaniker', 'technisch'),
    ('Mechatroniker', 'technisch'),
    ('Lackierer', 'technisch');
  PRINT 'Tabelle dbo.Berufe angelegt und mit bekannten technischen Berufen vorbelegt.';
END
ELSE PRINT 'dbo.Berufe existiert bereits.';

IF COL_LENGTH('dbo.Users','IstAusbildungsleiter') IS NULL
BEGIN
  ALTER TABLE dbo.Users ADD
    IstAusbildungsleiter     BIT          NOT NULL CONSTRAINT DF_Users_IstAusbildungsleiter DEFAULT 0,
    AusbildungsleiterBereich NVARCHAR(20) NULL
      CONSTRAINT CK_Users_AusbildungsleiterBereich CHECK (AusbildungsleiterBereich IN ('technisch','kaufmaennisch'));
  PRINT 'Spalten IstAusbildungsleiter/AusbildungsleiterBereich auf dbo.Users ergänzt.';
END
ELSE PRINT 'dbo.Users hat die Ausbildungsleiter-Spalten bereits.';
