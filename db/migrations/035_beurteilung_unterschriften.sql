-- ============================================================
-- Migration 035 – Digitale Unterschriften im Beurteilungsbogen
-- Ausführen gegen: Berichtsheft_Dev
--
-- 1) dbo.Unterschriften: persönliches Profil-Merkmal, eine Zeile je Nutzer
--    (hinterlegte Standard-Unterschrift, wiederverwendbar über Beurteilung
--    hinaus, z.B. später Fahrtgeld).
-- 2) dbo.Beurteilungen: drei Signatur-Slots (Beurteiler/Azubi/Ausbilder) +
--    neue Ausbilder-Bestätigung (eigenständig, unabhängig vom Abschluss).
-- Idempotent.
-- ============================================================

IF OBJECT_ID('dbo.Unterschriften', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Unterschriften (
    Oid            NVARCHAR(36)   NOT NULL PRIMARY KEY,
    Bild           VARBINARY(MAX) NOT NULL,
    Extension      NVARCHAR(10)   NOT NULL,
    AktualisiertAm DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
  );
  PRINT 'Tabelle dbo.Unterschriften angelegt.';
END
ELSE PRINT 'dbo.Unterschriften existiert bereits.';

IF COL_LENGTH('dbo.Beurteilungen', 'BeurteilerUnterschriftBild') IS NULL
BEGIN
  ALTER TABLE dbo.Beurteilungen ADD
    BeurteilerUnterschriftBild     VARBINARY(MAX) NULL,
    BeurteilerUnterschriftExt      NVARCHAR(10)   NULL,
    KenntnisnahmeUnterschriftBild  VARBINARY(MAX) NULL,
    KenntnisnahmeUnterschriftExt   NVARCHAR(10)   NULL,
    AusbilderBestaetigtVon         NVARCHAR(36)   NULL,
    AusbilderBestaetigtAm          DATETIME2      NULL,
    AusbilderUnterschriftBild      VARBINARY(MAX) NULL,
    AusbilderUnterschriftExt       NVARCHAR(10)   NULL;
  PRINT 'Spalten für Beurteilungs-Unterschriften ergänzt.';
END
ELSE PRINT 'Beurteilungs-Unterschrift-Spalten existieren bereits.';
