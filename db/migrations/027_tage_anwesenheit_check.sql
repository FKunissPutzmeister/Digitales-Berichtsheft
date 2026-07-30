-- ============================================================
-- Migration 027 – CK_Tage_Anwesenheit an aktuelle Werte anpassen
-- Ausführen gegen: Berichtsheft_Dev
--
-- Der Wochen-Upsert (POST /api/wochen, backend/routes/wochen.js) schreibt
-- pro Tag den im Frontend gewählten Anwesenheitswert. Die Auswahl
-- (app/js/app.js: ANWESENHEIT_OPTS) und die PDF-Importe (IHK,
-- SAP-Zeitnachweis) erzeugen inzwischen mehr Werte, als der alte
-- CHECK-Constraint CK_Tage_Anwesenheit kennt – u. a. 'Feiertag',
-- 'sonstige Abwesenheit' und 'Wochenende'. Folge: der INSERT scheitert an
-- der CHECK-Verletzung und der Upsert liefert 500
-- ("[wochen] upsert: ... conflicted with the CHECK constraint
--  CK_Tage_Anwesenheit ...").
--
-- Fix wie bei den analogen CHECK-Erweiterungen (Migration 016/019): alten
-- Constraint entfernen und mit dem vollständigen, vom Code geschriebenen
-- Wertevorrat neu anlegen. 'krank' bleibt aus Kompatibilität zu Altdaten
-- enthalten (api.js mappt es beim Lesen auf 'Arbeitsunfähigkeit'). NULL ist
-- weiterhin erlaubt (leere Anwesenheit -> NULL; CHECK ist bei NULL UNKNOWN
-- und blockt daher nicht). WITH NOCHECK, damit die Migration auch bei
-- eventuell noch vorhandenen Altwerten sauber durchläuft und nur künftige
-- INSERT/UPDATE geprüft werden.
-- Idempotent.
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_Tage_Anwesenheit'
             AND parent_object_id = OBJECT_ID('dbo.Tage'))
BEGIN
  ALTER TABLE dbo.Tage DROP CONSTRAINT CK_Tage_Anwesenheit;
  PRINT 'CK_Tage_Anwesenheit (alt) entfernt.';
END

ALTER TABLE dbo.Tage WITH NOCHECK ADD CONSTRAINT CK_Tage_Anwesenheit
  CHECK (Anwesenheit IN ('anwesend', 'Urlaub', 'Arbeitsunfähigkeit', 'krank',
                         'Feiertag', 'sonstige Abwesenheit', 'Wochenende'));
PRINT 'CK_Tage_Anwesenheit neu angelegt (inkl. Feiertag / sonstige Abwesenheit / Wochenende).';
