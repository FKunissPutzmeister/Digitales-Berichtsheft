-- ============================================================
-- Migration 046 – Abschnitte als eigene Ebene, Credits + Status
-- Ausführen gegen: Berichtsheft_Dev
--
-- Der Zeitraum hing bisher am EINTRAG (NotenEintraege.AbschnittTyp/Nr).
-- Damit gehörte ein Fach-Ordner allen Jahren gleichzeitig, und der
-- Durchschnitt lief über die gesamte Ausbildung. Neu ist der Zeitraum die
-- OBERSTE Ebene:
--
--   NotenAbschnitte -> NotenOrdner -> NotenEintraege -> NotenBelege
--
-- Für DH-Studenten ist die Achse nicht "Semester 1..8", sondern das, was
-- im DUALIS-Notenspiegel steht: Sommer- und Wintersemester mit Jahreszahl
-- ("SoSe 2026"). Deshalb trägt Typ drei Werte und Nr zwei Wertebereiche:
--   ausbildungsjahr -> Nr = 1..4
--   sose | wise     -> Nr = Jahr (bei wise das STARTjahr: 2025 = "WiSe 2025/26")
--
-- Zwei neue Spalten am Eintrag, beide nur für DH-Studenten gefüllt:
--   Credits DECIMAL(4,1) – zählen in die Semestersumme nur bei Status
--                          'bestanden' (so rechnet DUALIS: im Referenz-
--                          Notenspiegel ergeben 7 Module 45,0 Credits,
--                          angezeigt werden 33,0 – die 12,0 der noch nicht
--                          bewerteten Bachelorarbeit fehlen)
--   Status  NVARCHAR(15) – bestanden | nicht_bestanden | offen
--
-- "bestanden ohne Note" (in DUALIS ein "b" in der Notenspalte) ist KEIN
-- Notenwert, sondern Status='bestanden' bei Note IS NULL. Note bleibt so
-- eine reine Zahl.
--
-- Punkte/MaxPunkte bleiben unverändert: IHK-Punkte der Azubis werden
-- weiter gebraucht. Der DHBW-Teil (MaxPunkte, Migration 045) wird nur aus
-- der Oberfläche genommen, nicht aus dem Schema.
--
-- WARUM EXEC() – gleiche Falle wie in Migration 045:
-- backend/db/run-sql.js schickt die Datei als EINEN Batch (req.batch(),
-- kein GO). SQL Server bindet den Batch KOMPLETT, bevor die erste
-- Anweisung läuft. Jede Anweisung, die AbschnittId, Credits oder Status
-- als Ausdruck referenziert, würde deshalb mit "Invalid column name"
-- scheitern – und zwar BEVOR irgendetwas passiert, also mit unverändertem
-- Schema, das wie ein Erfolg aussieht. Dynamisches SQL wird erst zur
-- Laufzeit kompiliert und umgeht das.
-- ALTER TABLE ... ADD <Spalte> selbst braucht kein EXEC. Ein Verweis auf
-- die NEUE TABELLE dbo.NotenAbschnitte ebenfalls nicht – für Tabellen
-- gilt Deferred Name Resolution, nur fehlende SPALTEN bestehender
-- Tabellen brechen das Binden.
--
-- Siehe Design-Spec
-- docs/superpowers/specs/2026-09-02-noten-abschnitte-credits-design.md
-- Idempotent.
-- ============================================================

-- 1) Abschnitte -----------------------------------------------------
IF OBJECT_ID('dbo.NotenAbschnitte', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.NotenAbschnitte (
    Id         INT IDENTITY(1,1) PRIMARY KEY,
    AzubiOid   NVARCHAR(36) NOT NULL,  -- dbo.Users.Oid, lose (Repo-Konvention)
    Typ        NVARCHAR(15) NOT NULL,
    Nr         SMALLINT     NOT NULL,
    ErstelltAm DATETIME2    NOT NULL
      CONSTRAINT DF_NotenAbschnitte_ErstelltAm DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_NotenAbschnitte_AzubiTypNr UNIQUE (AzubiOid, Typ, Nr),
    CONSTRAINT CK_NotenAbschnitte_Typ CHECK (Typ IN ('ausbildungsjahr','sose','wise')),
    -- Ein CHECK für BEIDE Wertebereiche: ein Ausbildungsjahr 2026 und ein
    -- Semester 3 sind gleichermaßen Unsinn und sollen nicht speicherbar sein.
    CONSTRAINT CK_NotenAbschnitte_Nr CHECK (
      (Typ = 'ausbildungsjahr' AND Nr BETWEEN 1 AND 4)
      OR (Typ IN ('sose','wise') AND Nr BETWEEN 2015 AND 2100))
  );
  CREATE INDEX IX_NotenAbschnitte_AzubiOid ON dbo.NotenAbschnitte(AzubiOid);
  PRINT 'Tabelle dbo.NotenAbschnitte angelegt.';
END
ELSE PRINT 'Tabelle dbo.NotenAbschnitte existiert bereits.';

-- 2) NotenOrdner.AbschnittId ----------------------------------------
--    Bewusst NULLABLE: ein Ordner ohne Abschnitt landet in der Anzeige in
--    der Auffanggruppe "Ohne Zuordnung". NOT NULL wäre nur mit einem
--    erfundenen Zwangs-Abschnitt für Altdaten zu haben.
IF COL_LENGTH('dbo.NotenOrdner', 'AbschnittId') IS NULL
BEGIN
  ALTER TABLE dbo.NotenOrdner ADD AbschnittId INT NULL;
  PRINT 'Spalte AbschnittId auf dbo.NotenOrdner ergänzt.';
END
ELSE PRINT 'dbo.NotenOrdner hat die Spalte AbschnittId bereits.';

-- 3) Alte Eindeutigkeit lösen ---------------------------------------
--    MUSS vor der Datenwanderung passieren: dort entstehen bewusst mehrere
--    Ordner mit demselben Namen (einer je Abschnitt), was UQ(AzubiOid, Name)
--    verbieten würde.
IF EXISTS (SELECT 1 FROM sys.key_constraints
           WHERE name = 'UQ_NotenOrdner_AzubiName'
             AND parent_object_id = OBJECT_ID('dbo.NotenOrdner'))
BEGIN
  ALTER TABLE dbo.NotenOrdner DROP CONSTRAINT UQ_NotenOrdner_AzubiName;
  PRINT 'UQ_NotenOrdner_AzubiName (alt) entfernt.';
END
ELSE PRINT 'UQ_NotenOrdner_AzubiName war nicht vorhanden.';

-- 4) Fremdschlüssel Ordner -> Abschnitt -----------------------------
--    ON DELETE CASCADE macht die Kette vierstufig (Abschnitt -> Ordner ->
--    Eintrag -> Beleg). Eine LINEARE Kette ist erlaubt; verboten wären nur
--    mehrere Kaskadenpfade auf dieselbe Tabelle.
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys
               WHERE name = 'FK_NotenOrdner_Abschnitt'
                 AND parent_object_id = OBJECT_ID('dbo.NotenOrdner'))
BEGIN
  EXEC('ALTER TABLE dbo.NotenOrdner ADD CONSTRAINT FK_NotenOrdner_Abschnitt
          FOREIGN KEY (AbschnittId) REFERENCES dbo.NotenAbschnitte(Id) ON DELETE CASCADE');
  PRINT 'FK_NotenOrdner_Abschnitt angelegt (ON DELETE CASCADE).';
END
ELSE PRINT 'FK_NotenOrdner_Abschnitt existiert bereits.';

-- 5) Datenwanderung -------------------------------------------------
--    Läuft nur, solange die Altspalten noch da sind (also genau einmal).
--    Alles in EINEM EXEC: der Block referenziert AbschnittId, Altspalten
--    und eine temporäre Tabelle durchgängig.
--
--    Semester-Umrechnung: aus "Semester 1..8" lässt sich kein "SoSe 2026"
--    ableiten – die Jahreszahl steckt nicht darin. Sie kommt deshalb aus
--    dem DATUM des Eintrags (DHBW: SoSe ca. März–August, WiSe ca.
--    September–Februar). Eine Einmal-Heuristik, bewusst grob; sie ist
--    besser als alles in "Ohne Zuordnung" zu werfen.
--
--    Ausbildungsjahre 5..8 (das alte CHECK erlaubte bis 8) werden NICHT
--    umgerechnet: eine Ausbildung hat höchstens 4 Jahre, solche Werte
--    waren schon vorher Unsinn. Sie landen in "Ohne Zuordnung", statt
--    stillschweigend auf 4 gekürzt zu werden.
IF COL_LENGTH('dbo.NotenEintraege', 'AbschnittTyp') IS NOT NULL
BEGIN
  EXEC('
    CREATE TABLE #Zuordnung (
      EintragId  INT PRIMARY KEY,
      AzubiOid   NVARCHAR(36) NOT NULL,
      OrdnerId   INT          NOT NULL,
      OrdnerName NVARCHAR(100) NOT NULL,
      Typ        NVARCHAR(15) NOT NULL,
      Nr         SMALLINT     NOT NULL
    );

    INSERT INTO #Zuordnung (EintragId, AzubiOid, OrdnerId, OrdnerName, Typ, Nr)
    SELECT e.Id, o.AzubiOid, o.Id, o.Name,
           CASE
             WHEN e.AbschnittTyp = ''ausbildungsjahr'' THEN ''ausbildungsjahr''
             WHEN MONTH(e.Datum) BETWEEN 3 AND 8      THEN ''sose''
             ELSE ''wise''
           END,
           CASE
             WHEN e.AbschnittTyp = ''ausbildungsjahr'' THEN e.AbschnittNr
             WHEN MONTH(e.Datum) BETWEEN 1 AND 2       THEN YEAR(e.Datum) - 1
             ELSE YEAR(e.Datum)
           END
    FROM dbo.NotenEintraege e
    JOIN dbo.NotenOrdner o ON o.Id = e.OrdnerId
    WHERE e.AbschnittTyp IS NOT NULL
      AND e.AbschnittNr  IS NOT NULL
      AND e.Datum        IS NOT NULL
      AND NOT (e.AbschnittTyp = ''ausbildungsjahr'' AND e.AbschnittNr > 4);

    INSERT INTO dbo.NotenAbschnitte (AzubiOid, Typ, Nr)
    SELECT DISTINCT z.AzubiOid, z.Typ, z.Nr
    FROM #Zuordnung z
    WHERE NOT EXISTS (SELECT 1 FROM dbo.NotenAbschnitte a
                      WHERE a.AzubiOid = z.AzubiOid AND a.Typ = z.Typ AND a.Nr = z.Nr);

    -- Je (Fachname, Abschnitt) einen Ordner sicherstellen. Eigenschaften
    -- kommen vom Ursprungsordner, damit ein "Zeugnisse"-Ordner sein
    -- ZaehltInSchnitt=0 behält.
    INSERT INTO dbo.NotenOrdner (AzubiOid, Name, ZaehltInSchnitt, Sortierung, AbschnittId)
    SELECT DISTINCT z.AzubiOid, z.OrdnerName, o.ZaehltInSchnitt, o.Sortierung, a.Id
    FROM #Zuordnung z
    JOIN dbo.NotenOrdner o     ON o.Id = z.OrdnerId
    JOIN dbo.NotenAbschnitte a ON a.AzubiOid = z.AzubiOid AND a.Typ = z.Typ AND a.Nr = z.Nr
    WHERE NOT EXISTS (SELECT 1 FROM dbo.NotenOrdner o2
                      WHERE o2.AzubiOid = z.AzubiOid AND o2.Name = z.OrdnerName
                        AND o2.AbschnittId = a.Id);

    UPDATE e
       SET OrdnerId = ziel.Id
    FROM dbo.NotenEintraege e
    JOIN #Zuordnung z          ON z.EintragId = e.Id
    JOIN dbo.NotenAbschnitte a ON a.AzubiOid = z.AzubiOid AND a.Typ = z.Typ AND a.Nr = z.Nr
    JOIN dbo.NotenOrdner ziel  ON ziel.AzubiOid = z.AzubiOid AND ziel.Name = z.OrdnerName
                              AND ziel.AbschnittId = a.Id;

    -- Ursprungsordner, die dadurch leer geworden sind, abräumen. Ordner, die
    -- schon vorher leer waren, bleiben (sie standen in keiner Zuordnung).
    DELETE o
    FROM dbo.NotenOrdner o
    WHERE o.AbschnittId IS NULL
      AND EXISTS     (SELECT 1 FROM #Zuordnung z     WHERE z.OrdnerId = o.Id)
      AND NOT EXISTS (SELECT 1 FROM dbo.NotenEintraege e WHERE e.OrdnerId = o.Id);

    DECLARE @n INT = (SELECT COUNT(*) FROM #Zuordnung);
    PRINT CONCAT(''Datenwanderung: '', @n, '' Eintrag/Einträge auf Abschnitte umgehängt.'');
    DROP TABLE #Zuordnung;
  ');
END
ELSE PRINT 'Datenwanderung bereits erledigt (AbschnittTyp existiert nicht mehr).';

-- 6) Neue Eindeutigkeit ---------------------------------------------
--    Dasselbe Fach darf in mehreren Abschnitten liegen, im selben nicht
--    zweimal. Hinweis: SQL Server behandelt NULLs in UNIQUE als GLEICH –
--    es gibt also pro (Azubi, Name) nur EINEN Ordner ohne Abschnitt. Für
--    die Auffanggruppe genügt das.
IF NOT EXISTS (SELECT 1 FROM sys.key_constraints
               WHERE name = 'UQ_NotenOrdner_AbschnittName'
                 AND parent_object_id = OBJECT_ID('dbo.NotenOrdner'))
BEGIN
  EXEC('ALTER TABLE dbo.NotenOrdner ADD CONSTRAINT UQ_NotenOrdner_AbschnittName
          UNIQUE (AzubiOid, AbschnittId, Name)');
  PRINT 'UQ_NotenOrdner_AbschnittName angelegt.';
END
ELSE PRINT 'UQ_NotenOrdner_AbschnittName existiert bereits.';

-- 7) Altspalten am Eintrag entfernen --------------------------------
--    Zwei Wahrheiten für denselben Begriff (Abschnitt am Eintrag UND am
--    Ordner) wären eine Fehlerquelle. CHECKs zuerst, sonst scheitert
--    DROP COLUMN an der Abhängigkeit.
IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_NotenEintraege_AbschnittTyp'
             AND parent_object_id = OBJECT_ID('dbo.NotenEintraege'))
BEGIN
  ALTER TABLE dbo.NotenEintraege DROP CONSTRAINT CK_NotenEintraege_AbschnittTyp;
  PRINT 'CK_NotenEintraege_AbschnittTyp entfernt.';
END
ELSE PRINT 'CK_NotenEintraege_AbschnittTyp war nicht vorhanden.';

IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_NotenEintraege_AbschnittNr'
             AND parent_object_id = OBJECT_ID('dbo.NotenEintraege'))
BEGIN
  ALTER TABLE dbo.NotenEintraege DROP CONSTRAINT CK_NotenEintraege_AbschnittNr;
  PRINT 'CK_NotenEintraege_AbschnittNr entfernt.';
END
ELSE PRINT 'CK_NotenEintraege_AbschnittNr war nicht vorhanden.';

IF COL_LENGTH('dbo.NotenEintraege', 'AbschnittTyp') IS NOT NULL
BEGIN
  ALTER TABLE dbo.NotenEintraege DROP COLUMN AbschnittTyp;
  PRINT 'Spalte AbschnittTyp entfernt.';
END
ELSE PRINT 'Spalte AbschnittTyp war nicht vorhanden.';

IF COL_LENGTH('dbo.NotenEintraege', 'AbschnittNr') IS NOT NULL
BEGIN
  ALTER TABLE dbo.NotenEintraege DROP COLUMN AbschnittNr;
  PRINT 'Spalte AbschnittNr entfernt.';
END
ELSE PRINT 'Spalte AbschnittNr war nicht vorhanden.';

-- 8) Credits und Status ---------------------------------------------
IF COL_LENGTH('dbo.NotenEintraege', 'Credits') IS NULL
BEGIN
  ALTER TABLE dbo.NotenEintraege ADD Credits DECIMAL(4,1) NULL;
  PRINT 'Spalte Credits auf dbo.NotenEintraege ergänzt.';
END
ELSE PRINT 'dbo.NotenEintraege hat die Spalte Credits bereits.';

IF COL_LENGTH('dbo.NotenEintraege', 'Status') IS NULL
BEGIN
  ALTER TABLE dbo.NotenEintraege ADD Status NVARCHAR(15) NULL;
  PRINT 'Spalte Status auf dbo.NotenEintraege ergänzt.';
END
ELSE PRINT 'dbo.NotenEintraege hat die Spalte Status bereits.';

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = 'CK_NotenEintraege_Credits'
                 AND parent_object_id = OBJECT_ID('dbo.NotenEintraege'))
BEGIN
  -- 60 ist großzügig: ein DHBW-Modul liegt bei 5, eine Bachelorarbeit bei 12.
  EXEC('ALTER TABLE dbo.NotenEintraege ADD CONSTRAINT CK_NotenEintraege_Credits
          CHECK (Credits IS NULL OR (Credits >= 0 AND Credits <= 60))');
  PRINT 'CK_NotenEintraege_Credits angelegt (0..60).';
END
ELSE PRINT 'CK_NotenEintraege_Credits existiert bereits.';

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE name = 'CK_NotenEintraege_Status'
                 AND parent_object_id = OBJECT_ID('dbo.NotenEintraege'))
BEGIN
  EXEC('ALTER TABLE dbo.NotenEintraege ADD CONSTRAINT CK_NotenEintraege_Status
          CHECK (Status IS NULL OR Status IN (''bestanden'',''nicht_bestanden'',''offen''))');
  PRINT 'CK_NotenEintraege_Status angelegt.';
END
ELSE PRINT 'CK_NotenEintraege_Status existiert bereits.';
