-- ============================================================
-- Migration 002 – Tages-Kommentare für Ausbilder
-- Ausführen gegen: Berichtsheft_Dev
-- ============================================================

-- dbo.Kommentare: optionale Verknüpfung zu einem einzelnen Tag.
-- TagId = NULL  → Kommentar bezieht sich auf die gesamte Woche (bisheriges Verhalten)
-- TagId = <id>  → Kommentar bezieht sich auf einen bestimmten Tag
ALTER TABLE dbo.Kommentare
  ADD TagId INT NULL
      CONSTRAINT FK_Kommentare_Tage FOREIGN KEY REFERENCES dbo.Tage(Id);
