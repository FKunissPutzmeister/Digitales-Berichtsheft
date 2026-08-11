-- ============================================================
-- Migration 031 – Namen an Belegen denormalisieren
-- Ausführen gegen: Berichtsheft_Dev
--
-- Voraussetzung für das Löschkonzept (Migration 030): Die App löst
-- Personennamen bisher bei jedem Rendern live über dbo.Users auf. Wird eine
-- Person gelöscht, zeigt der Kommentar "Unbekannt", die PDF-Gegenzeichnung
-- "Ausbilder/in" — und das Status-Banner fällt auf den STATISCH zugeordneten
-- Ausbilder zurück, behauptet also eine falsche Person habe abgenommen
-- (app/js/wochenansicht.js, renderStatusBanner). In einem Nachweisdokument
-- ist das ein Sachmangel.
--
-- Deshalb tragen die drei Belege den Namen künftig selbst. Gespeichert wird
-- die DB-Form "Nachname, Vorname"; gedreht wird erst am Anzeigeort über
-- displayName() — Repo-Konvention.
--
-- KEIN Backfill: der Retention-Job kennt die dbo.Users-Zeile in dem Moment,
-- in dem er sie löscht, und schreibt den Namen dann in genau die betroffenen
-- Zeilen (Phase B, backend/services/retention.js). Ein Massen-UPDATE über
-- alle historischen Wochen und Kommentare wäre unnötiges Risiko.
-- Bestandszeilen bleiben NULL und werden weiter live aufgelöst.
--
-- Zuweisungen ist der gegenläufige Fall: dort steht die E-MAIL des
-- Verantwortlichen, und der Name wird daraus abgeleitet (app/js/api.js,
-- normalizeZuweisung). Ohne VerantwName müsste die E-Mail stehen bleiben —
-- die Löschung wäre wirkungslos. Der Job leert sie und behält den Namen.
--
-- Idempotent (IF-Guards), no-op auf einer bereits migrierten DB.
-- ============================================================

IF COL_LENGTH('dbo.Wochen', 'KorrigiertVonName') IS NULL
BEGIN
  ALTER TABLE dbo.Wochen ADD KorrigiertVonName NVARCHAR(200) NULL;
  PRINT 'Spalte dbo.Wochen.KorrigiertVonName angelegt.';
END
ELSE PRINT 'dbo.Wochen.KorrigiertVonName existiert bereits.';

IF COL_LENGTH('dbo.Kommentare', 'AutorName') IS NULL
BEGIN
  ALTER TABLE dbo.Kommentare ADD AutorName NVARCHAR(200) NULL;
  PRINT 'Spalte dbo.Kommentare.AutorName angelegt.';
END
ELSE PRINT 'dbo.Kommentare.AutorName existiert bereits.';

IF COL_LENGTH('dbo.Zuweisungen', 'VerantwName') IS NULL
BEGIN
  ALTER TABLE dbo.Zuweisungen ADD VerantwName NVARCHAR(200) NULL;
  PRINT 'Spalte dbo.Zuweisungen.VerantwName angelegt.';
END
ELSE PRINT 'dbo.Zuweisungen.VerantwName existiert bereits.';
