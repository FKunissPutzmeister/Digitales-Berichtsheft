-- ============================================================
-- Migration 047 – Farbe am Fach-Ordner
-- Ausführen gegen: Berichtsheft_Dev
--
-- Rein visuelle Hilfe: mit einer Farbe je Fach lassen sich die Fächer
-- eines Zeitraums schneller auseinanderhalten. Gespeichert wird sie
-- trotzdem in der DB und nicht im Browser, weil die Farbe damit auf
-- jedem Gerät und auch für die mitlesenden Ausbilder dieselbe ist.
--
-- Werte: die 15 Töne der App-Palette (FACH_FARBEN in
-- app/js/noten-core.js, deckungsgleich mit GANTT_PALETTE aus
-- app/js/abteilungs-planer.js, mit dem die Abteilungen eingefärbt sind).
-- NULL = keine Farbe = Darstellung wie bisher; das ist auch der Zustand
-- aller bestehenden Fächer, es wird KEINE Farbe automatisch vergeben.
--
-- Der CHECK prüft nur das FORMAT (#rrggbb), nicht die Palette selbst:
-- eine Constraint mit 15 aufgezählten Werten müsste bei jeder
-- Palettenänderung migriert werden. Ob ein Wert zur Palette gehört,
-- entscheidet noten-core.js beim Schreiben (klare Fehlermeldung statt
-- SQL-Fehler); beim Rendern lässt das Frontend zusätzlich nur #rrggbb
-- durch, weil die Farbe in ein style-Attribut geht.
--
-- LIKE-Muster: '[0-9A-Fa-f]' ist in T-SQL eine Zeichenklasse wie in einem
-- regulären Ausdruck. Der Vergleich läuft über die Collation, ist also
-- ohnehin unabhängig von Groß-/Kleinschreibung — die Klasse nennt beide
-- Bereiche nur, damit das Muster für sich lesbar bleibt.
--
-- Kein EXEC() nötig (anders als 045/046): die Spalte wird hier angelegt
-- und danach in DIESER Datei nicht mehr als Ausdruck referenziert. Der
-- CHECK steht trotzdem in EXEC(), weil er die neue Spalte im selben
-- Batch benennt und run-sql.js die Datei als EINEN Batch schickt
-- (req.batch(), kein GO) — SQL Server bindet dann alles, bevor die erste
-- Anweisung läuft, und würde mit "Invalid column name" scheitern.
--
-- Idempotent: mehrfach ausführbar, beim zweiten Lauf melden alle
-- PRINT-Zeilen "existiert bereits".
-- ============================================================

IF COL_LENGTH('dbo.NotenOrdner', 'Farbe') IS NULL
BEGIN
  ALTER TABLE dbo.NotenOrdner ADD Farbe NVARCHAR(7) NULL;
  PRINT 'Spalte Farbe auf dbo.NotenOrdner ergänzt.';
END
ELSE PRINT 'dbo.NotenOrdner hat die Spalte Farbe bereits.';

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = 'CK_NotenOrdner_Farbe'
                 AND parent_object_id = OBJECT_ID('dbo.NotenOrdner'))
BEGIN
  EXEC('ALTER TABLE dbo.NotenOrdner ADD CONSTRAINT CK_NotenOrdner_Farbe
          CHECK (Farbe IS NULL OR Farbe LIKE ''#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'')');
  PRINT 'CK_NotenOrdner_Farbe angelegt (#rrggbb oder NULL).';
END
ELSE PRINT 'CK_NotenOrdner_Farbe existiert bereits.';
