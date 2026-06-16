-- ============================================================
-- Migration 009 – Korrektur-Attribution auf Wochen-Ebene
-- Ausführen gegen: Berichtsheft_Dev
--
-- Hintergrund: Wer eine Woche genehmigt/abgelehnt hat, wurde bisher
-- nicht festgehalten. Für die zuweisungsgetriebene Zugriffsregel
-- "ein Verantwortlicher behält Lesezugriff auf die von ihm korrigierten
-- Wochen" brauchen wir diese Spur. Kommentare tragen UserOid bereits.
-- ============================================================

ALTER TABLE dbo.Wochen ADD
  KorrigiertVon NVARCHAR(36) NULL,
  KorrigiertAm  DATETIME2    NULL;
