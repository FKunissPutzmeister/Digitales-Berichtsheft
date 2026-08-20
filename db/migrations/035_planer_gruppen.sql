-- ============================================================
-- Migration 035 – dbo.PlanerGruppen + dbo.PlanerGruppenMitglieder
-- Ausführen gegen: Berichtsheft_Dev
--
-- Eigene Gruppen für den Abteilungs-Planer ("Schlosserei 2026", "IT-Nachwuchs"):
-- frei benannte Bündel von Azubis/DH-Studenten, die auf der Plantafel ÜBER den
-- automatischen Gruppen (Ohne Zuordnung / Zugewiesen / DH-Studenten) stehen.
-- Die automatischen Gruppen bleiben unverändert und werden weiter gerechnet
-- (gruppeVon() im Frontend) – hier liegen nur die manuell gepflegten.
--
-- Bewusste Entscheidungen:
--  · Gruppen sind GEMEINSAM, nicht pro Nutzer: Planung ist Teamarbeit, ein
--    Kollege soll dieselben Bündel sehen. Deshalb kein Besitzer-Gate, nur
--    ErstelltVon zur Nachvollziehbarkeit.
--  · Name eindeutig (UNIQUE): zwei gleichnamige Gruppen wären auf der Tafel
--    nicht unterscheidbar. Die Route antwortet darauf mit 409.
--  · n:m mit PK (GruppeId, AzubiOid) – eine Person darf in MEHREREN Gruppen
--    sein (bewusst so gewollt: "Schlosserei" und "Prüfung Herbst" gleichzeitig),
--    steht dann auch mehrfach auf der Tafel.
--  · Mitglieder per AzubiOid ohne FK auf dbo.Users – genau wie
--    dbo.Zuweisungen.AzubiOid. Verwaiste Zeilen (Person gelöscht) sind
--    harmlos: die Tafel rendert nur Oids, die sie kennt.
--  · FK auf dbo.PlanerGruppen MIT ON DELETE CASCADE: eine gelöschte Gruppe
--    nimmt ihre Mitgliedschaften mit, die Route braucht kein Aufräumen.
--
-- Idempotent: legt nur an, was fehlt.
-- ============================================================

IF OBJECT_ID('dbo.PlanerGruppen', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.PlanerGruppen (
    Id          INT IDENTITY(1,1) PRIMARY KEY,
    Name        NVARCHAR(60) NOT NULL,
    ErstelltAm  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ErstelltVon NVARCHAR(36) NULL,          -- dbo.Users.Oid
    CONSTRAINT CK_PlanerGruppen_Name CHECK (LEN(LTRIM(RTRIM(Name))) > 0)
  );
  CREATE UNIQUE INDEX UX_PlanerGruppen_Name ON dbo.PlanerGruppen(Name);
  PRINT 'Tabelle dbo.PlanerGruppen angelegt.';
END
ELSE PRINT 'dbo.PlanerGruppen existiert bereits.';

IF OBJECT_ID('dbo.PlanerGruppenMitglieder', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.PlanerGruppenMitglieder (
    GruppeId INT NOT NULL,
    AzubiOid NVARCHAR(36) NOT NULL,
    CONSTRAINT PK_PlanerGruppenMitglieder PRIMARY KEY (GruppeId, AzubiOid),
    CONSTRAINT FK_PlanerGruppenMitglieder_Gruppe FOREIGN KEY (GruppeId)
      REFERENCES dbo.PlanerGruppen(Id) ON DELETE CASCADE
  );
  CREATE INDEX IX_PlanerGruppenMitglieder_AzubiOid ON dbo.PlanerGruppenMitglieder(AzubiOid);
  PRINT 'Tabelle dbo.PlanerGruppenMitglieder angelegt.';
END
ELSE PRINT 'dbo.PlanerGruppenMitglieder existiert bereits.';
