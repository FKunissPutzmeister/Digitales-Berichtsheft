-- ============================================================
-- Migration 019 – Zweistufiger Genehmigungsprozess
-- Ausführen gegen: Berichtsheft_Dev
--
-- 1) Neuer Zwischenstatus 'erstgenehmigt' (Prüfer hat erstgenehmigt,
--    wartet auf Endabnahme durch den dauerhaften Ausbilder).
-- 2) Routing-Flag EndabnahmeDirekt: 1 = Prüfer-Stufe übersprungen,
--    nur der Ausbilder darf noch handeln (nach Ausbilder-Rückgabe).
-- 3) Benachrichtigungstyp 'erstgenehmigt' (Hinweis an den Ausbilder,
--    dass ein Bericht auf die Endabnahme wartet).
-- Idempotent.
-- ============================================================

-- 1) Routing-Flag EndabnahmeDirekt
IF NOT EXISTS (SELECT 1 FROM sys.columns
               WHERE object_id = OBJECT_ID('dbo.Wochen') AND name = 'EndabnahmeDirekt')
BEGIN
  ALTER TABLE dbo.Wochen
    ADD EndabnahmeDirekt BIT NOT NULL
        CONSTRAINT DF_Wochen_EndabnahmeDirekt DEFAULT 0;
  PRINT 'Spalte dbo.Wochen.EndabnahmeDirekt angelegt.';
END
ELSE PRINT 'dbo.Wochen.EndabnahmeDirekt existiert bereits.';

-- 2) Status-CHECK-Constraint um 'erstgenehmigt' erweitern
IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_Wochen_Status'
             AND parent_object_id = OBJECT_ID('dbo.Wochen'))
BEGIN
  ALTER TABLE dbo.Wochen DROP CONSTRAINT CK_Wochen_Status;
  PRINT 'CK_Wochen_Status (alt) entfernt.';
END

ALTER TABLE dbo.Wochen ADD CONSTRAINT CK_Wochen_Status
  CHECK (Status IN ('offen', 'freigegeben', 'erstgenehmigt', 'genehmigt', 'abgelehnt'));
PRINT 'CK_Wochen_Status neu angelegt (inkl. erstgenehmigt).';

-- 3) Benachrichtigungstyp 'erstgenehmigt' erlauben (für Task 8)
--    WICHTIG: Die Liste enthält ALLE in produktiven DBs bereits genutzten
--    Typen (Beurteilung/Versetzung/Vertretung stammen aus Features außerhalb
--    dieses Repos). Die Werteliste NIE verengen — sonst scheitert das
--    ADD CONSTRAINT an vorhandenen Zeilen (Msg 547). Nur ergänzen.
IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_Benachrichtigungen_Typ'
             AND parent_object_id = OBJECT_ID('dbo.Benachrichtigungen'))
BEGIN
  ALTER TABLE dbo.Benachrichtigungen DROP CONSTRAINT CK_Benachrichtigungen_Typ;
  PRINT 'CK_Benachrichtigungen_Typ (alt) entfernt.';
END

ALTER TABLE dbo.Benachrichtigungen ADD CONSTRAINT CK_Benachrichtigungen_Typ
  CHECK (Typ IN ('genehmigt','abgelehnt','erstgenehmigt',
                 'beurteilung_faellig','beurteilung_abgeschlossen',
                 'versetzung_neu','versetzung_entfernt',
                 'vertretung_neu','vertretung_beendet'));
PRINT 'CK_Benachrichtigungen_Typ neu angelegt (inkl. erstgenehmigt).';
