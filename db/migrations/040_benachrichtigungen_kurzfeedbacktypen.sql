-- ============================================================
-- Migration 040 – Benachrichtigungs-Typen für Kurzfeedback
-- Ausführen gegen: Berichtsheft_Dev
--
-- CK_Benachrichtigungen_Typ (siehe Migration 032) kennt die neuen Typen
-- 'kurzfeedback_faellig'/'kurzfeedback_abgeschlossen' noch nicht — ohne diese
-- Migration schlägt jeder erzeugeBenachrichtigung()-Aufruf mit einem dieser
-- Typen (siehe Kurzfeedback-Feature, Design-Spec
-- 2026-08-26-beurteilung-kurzfeedback-design.md) mit einer CHECK-Constraint-
-- Verletzung fehl. Basiert auf Migration 032 (11 Typen). Idempotent.
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_Benachrichtigungen_Typ'
             AND parent_object_id = OBJECT_ID('dbo.Benachrichtigungen'))
BEGIN
  ALTER TABLE dbo.Benachrichtigungen DROP CONSTRAINT CK_Benachrichtigungen_Typ;
  PRINT 'CK_Benachrichtigungen_Typ (alt) entfernt.';
END
ELSE PRINT 'CK_Benachrichtigungen_Typ existierte nicht - wird erstmals eingefuehrt.';

ALTER TABLE dbo.Benachrichtigungen ADD CONSTRAINT CK_Benachrichtigungen_Typ
  CHECK (Typ IN ('genehmigt','abgelehnt','erstgenehmigt',
                 'beurteilung_faellig','beurteilung_abgeschlossen',
                 'kurzfeedback_faellig','kurzfeedback_abgeschlossen',
                 'versetzung_neu','versetzung_geaendert','versetzung_entfernt',
                 'vertretung_neu','vertretung_beendet',
                 'loeschung_geplant'));
PRINT 'CK_Benachrichtigungen_Typ angelegt (13 Typen, inkl. Kurzfeedback).';
