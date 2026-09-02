-- ============================================================
-- Migration 045 – DHBW-Punkte auf dbo.NotenEintraege
-- Ausführen gegen: Berichtsheft_Dev
--
-- Die offizielle DUALIS-Punkte-Noten-Tabelle der DHBW (Studienbereich
-- Wirtschaft, Stand 14.10.2022) kennt SECHS Maximalpunktzahlen — 60, 90,
-- 100, 120, 150 und 180 — und dieselbe Punktzahl ergibt je Maximum eine
-- andere Note (60 von 100 = 3,4; 60 von 120 = 4,0). Ohne die
-- Maximalpunktzahl am Eintrag ist eine Umrechnung nicht möglich.
--
-- Zwei Annahmen aus Migration 043 halten damit nicht mehr:
--   1. Punkte war TINYINT. Die DUALIS-Tabelle arbeitet auf einem
--      HALBpunkt-Raster (Note 1,0 bei 100 Punkten beginnt bei 98,5) —
--      TINYINT kann 98,5 nicht speichern. Neu: DECIMAL(5,1).
--   2. CK_NotenEintraege_Punkte begrenzte auf 100 (IHK-Schlüssel). Bei
--      180 möglichen Punkten ist das zu eng. Neue Obergrenze 400,
--      bewusst großzügig: die fachliche Grenze ist MaxPunkte, und die
--      prüft der neue CHECK unten mit.
--
-- IHK-Prüfungen der Azubis bleiben unberührt: dort ist MaxPunkte NULL
-- und die Umrechnung läuft weiter über PUNKTE_ZU_NOTE (0..100) aus
-- app/js/beurteilung-core.js.
--
-- WARUM EXEC() BEI DEN CONSTRAINTS UNTEN:
-- backend/db/run-sql.js schickt die Datei als EINEN Batch (req.batch(),
-- kein GO). SQL Server bindet einen Batch KOMPLETT vor der Ausführung —
-- eine Spalte, die erst in Schritt 3 entsteht, existiert beim Binden von
-- Schritt 4 noch nicht. Ohne EXEC scheitert deshalb die ganze Datei mit
-- "Invalid column name 'MaxPunkte'", und zwar BEVOR irgendeine Anweisung
-- läuft (verifiziert). Dynamisches SQL wird erst zur Laufzeit kompiliert
-- und umgeht das. Betrifft nur Anweisungen, die die NEUE Spalte als
-- Ausdruck referenzieren — ALTER TABLE ... ADD selbst nicht.
--
-- Siehe Design-Spec
-- docs/superpowers/specs/2026-09-01-noten-zeugnisse-design.md
-- Idempotent.
-- ============================================================

-- 1) CHECK auf Punkte lösen – ALTER COLUMN scheitert sonst mit
--    "The object 'CK_NotenEintraege_Punkte' is dependent on column 'Punkte'".
IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_NotenEintraege_Punkte'
             AND parent_object_id = OBJECT_ID('dbo.NotenEintraege'))
BEGIN
  ALTER TABLE dbo.NotenEintraege DROP CONSTRAINT CK_NotenEintraege_Punkte;
  PRINT 'CK_NotenEintraege_Punkte (alt, <= 100) entfernt.';
END
ELSE PRINT 'CK_NotenEintraege_Punkte war nicht vorhanden.';

-- 2) Punkte: TINYINT -> DECIMAL(5,1) für halbe Punkte und Werte über 100.
IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.NotenEintraege')
             AND name = 'Punkte'
             AND TYPE_NAME(system_type_id) = 'tinyint')
BEGIN
  ALTER TABLE dbo.NotenEintraege ALTER COLUMN Punkte DECIMAL(5,1) NULL;
  PRINT 'Spalte Punkte auf DECIMAL(5,1) umgestellt.';
END
ELSE PRINT 'Spalte Punkte ist bereits kein TINYINT mehr.';

-- 3) Maximalpunktzahl. Nur die sechs Werte der DUALIS-Tabelle sind
--    erlaubt: für jede andere Maximalpunktzahl gibt es keine amtliche
--    Umrechnung, dort trägt der Student die Note direkt ein (MaxPunkte
--    bleibt NULL). Ein freies Feld würde stillschweigend falsche Noten
--    erzeugen.
IF COL_LENGTH('dbo.NotenEintraege', 'MaxPunkte') IS NULL
BEGIN
  ALTER TABLE dbo.NotenEintraege ADD MaxPunkte SMALLINT NULL;
  PRINT 'Spalte MaxPunkte auf dbo.NotenEintraege ergänzt.';
END
ELSE PRINT 'dbo.NotenEintraege hat die Spalte MaxPunkte bereits.';

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = 'CK_NotenEintraege_MaxPunkte'
                 AND parent_object_id = OBJECT_ID('dbo.NotenEintraege'))
BEGIN
  EXEC('ALTER TABLE dbo.NotenEintraege ADD CONSTRAINT CK_NotenEintraege_MaxPunkte
          CHECK (MaxPunkte IS NULL OR MaxPunkte IN (60, 90, 100, 120, 150, 180))');
  PRINT 'CK_NotenEintraege_MaxPunkte angelegt (DUALIS-Maxima).';
END
ELSE PRINT 'CK_NotenEintraege_MaxPunkte existiert bereits.';

-- 4) Punkte neu begrenzen und gegen MaxPunkte plausibilisieren.
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = 'CK_NotenEintraege_Punkte'
                 AND parent_object_id = OBJECT_ID('dbo.NotenEintraege'))
BEGIN
  -- Punkte existiert bereits, EXEC wäre hier nicht nötig — der Einheitlichkeit
  -- halber trotzdem, damit niemand die Regel oben halb anwendet.
  EXEC('ALTER TABLE dbo.NotenEintraege ADD CONSTRAINT CK_NotenEintraege_Punkte
          CHECK (Punkte IS NULL OR (Punkte >= 0 AND Punkte <= 400))');
  PRINT 'CK_NotenEintraege_Punkte angelegt (0..400).';
END
ELSE PRINT 'CK_NotenEintraege_Punkte existiert bereits.';

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = 'CK_NotenEintraege_PunkteMax'
                 AND parent_object_id = OBJECT_ID('dbo.NotenEintraege'))
BEGIN
  EXEC('ALTER TABLE dbo.NotenEintraege ADD CONSTRAINT CK_NotenEintraege_PunkteMax
          CHECK (MaxPunkte IS NULL OR Punkte IS NULL OR Punkte <= MaxPunkte)');
  PRINT 'CK_NotenEintraege_PunkteMax angelegt (Punkte <= MaxPunkte).';
END
ELSE PRINT 'CK_NotenEintraege_PunkteMax existiert bereits.';
