-- ============================================================
-- Migration 024 – dbo.AusbilderAzubis: Spalte Quelle
-- Ausführen gegen: Berichtsheft_Dev
--
-- Unterscheidet, wie eine dauerhafte Ausbilder-Zuordnung entstanden ist:
--   'auto'          – vom Entra-Sync aus dem Manager-Attribut gesetzt
--   'manuell'       – von einem Admin über die Nutzerverwaltung hinzugefügt
--   'ausgeschlossen'– war 'auto', ein Admin hat sie bewusst entfernt; der
--                     Sync darf diese Azubi/Ausbilder-Kombination nie wieder
--                     automatisch anlegen (siehe services/ausbilderAzubis.js).
-- Bestehende Zeilen stammen alle aus der bisherigen manuellen Checkbox-UI
-- und bekommen daher den Default 'manuell'. Idempotent.
-- ============================================================
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.AusbilderAzubis') AND name = 'Quelle'
)
BEGIN
  ALTER TABLE dbo.AusbilderAzubis
    ADD Quelle NVARCHAR(12) NOT NULL
      CONSTRAINT DF_AusbilderAzubis_Quelle DEFAULT 'manuell'
      CONSTRAINT CK_AusbilderAzubis_Quelle CHECK (Quelle IN ('auto', 'manuell', 'ausgeschlossen'));
  PRINT 'Spalte dbo.AusbilderAzubis.Quelle angelegt.';
END
ELSE PRINT 'dbo.AusbilderAzubis.Quelle existiert bereits.';
