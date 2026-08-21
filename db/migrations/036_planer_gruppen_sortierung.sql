-- ============================================================
-- Migration 036 – dbo.PlanerGruppenSortierung
-- Ausführen gegen: Berichtsheft_Dev
--
-- Selbst gezogene Reihenfolge der Gruppen-Blöcke auf der Plantafel
-- (Abteilungs-Planer, Ziehen am Gruppenkopf).
--
-- Bewusste Entscheidungen:
--  · PRO NUTZER, nicht gemeinsam (anders als die Gruppen selbst in Migration
--    035): die Reihenfolge ist Ansichtssache. Wer "seine" Abteilung oben haben
--    will, soll damit nicht die Tafel der Kollegen umsortieren.
--  · Eine Textspalte mit der Schlüssel-Liste als JSON statt einer Zeile je
--    Gruppe: die automatischen Gruppen (Ohne Zuordnung / Zugewiesen /
--    DH-Studenten) haben gar keine DB-Zeile, ihre Schlüssel ('a:<Titel>')
--    entstehen im Frontend. Eine Rang-Spalte in dbo.PlanerGruppen könnte sie
--    also nicht mit einsortieren.
--  · Kein FK auf dbo.Users (wie dbo.Zuweisungen.AzubiOid): eine verwaiste
--    Zeile ist harmlos, sie wird nie mehr gelesen.
--  · Unbekannte Schlüssel in der Liste (gelöschte Gruppe) sind ebenfalls
--    harmlos – das Frontend ignoriert sie beim Sortieren.
--
-- Idempotent: legt nur an, was fehlt.
-- ============================================================

IF OBJECT_ID('dbo.PlanerGruppenSortierung', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.PlanerGruppenSortierung (
    BenutzerOid NVARCHAR(36)   NOT NULL,
    Reihenfolge NVARCHAR(2000) NOT NULL,   -- JSON-Array der Gruppen-Schlüssel
    GeaendertAm DATETIME2      NOT NULL CONSTRAINT DF_PlanerGruppenSortierung_GeaendertAm DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_PlanerGruppenSortierung PRIMARY KEY (BenutzerOid)
  );
  PRINT 'Tabelle dbo.PlanerGruppenSortierung angelegt.';
END
ELSE PRINT 'dbo.PlanerGruppenSortierung existiert bereits.';
