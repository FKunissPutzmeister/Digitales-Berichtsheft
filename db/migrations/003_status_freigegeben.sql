-- ============================================================
-- Migration 003 – Status 'eingereicht' → 'freigegeben'
-- Ausführen gegen: Berichtsheft_Dev
--
-- Hintergrund: Der Frontend-Code verwendet durchgehend 'freigegeben'
-- für "zur Abnahme freigegeben". Die DB-Tabelle kannte bisher nur
-- 'eingereicht'. Diese Migration bringt Schema und Code in Einklang.
-- ============================================================

-- 1) Alten CHECK-Constraint entfernen
ALTER TABLE dbo.Wochen DROP CONSTRAINT CK_Wochen_Status;

-- 2) Vorhandene Zeilen mit dem alten Status umschreiben
UPDATE dbo.Wochen SET Status = 'freigegeben' WHERE Status = 'eingereicht';

-- 3) Neuen CHECK-Constraint ohne 'eingereicht', mit 'freigegeben' anlegen
ALTER TABLE dbo.Wochen
  ADD CONSTRAINT CK_Wochen_Status
  CHECK (Status IN ('offen', 'freigegeben', 'genehmigt', 'abgelehnt'));
