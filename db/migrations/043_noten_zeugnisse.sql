-- ============================================================
-- Migration 043 – Noten & Zeugnisse (Nachweis-Archiv)
-- Ausführen gegen: Berichtsheft_Dev
--
-- Azubis (Rolle 'azubi') und DH-Studenten ('dhstudent') legen ihre
-- SCHULnoten samt Belegen selbst ab; Ausbilder und Ausbildungsleitung
-- lesen nur. Kein Genehmigungs-Workflow. Siehe Design-Spec
-- docs/superpowers/specs/2026-09-01-noten-zeugnisse-design.md
--
-- Drei Ebenen, beide Fremdschlüssel mit ON DELETE CASCADE: ein
-- Ordner-DELETE räumt Einträge und Belege mit ab. Ordner gehören dem
-- Azubi und werden per Freitext angelegt ("Englisch", "Software",
-- "Zeugnisse") – es gibt bewusst KEINEN globalen Fächerkatalog, weil
-- gewerbliche, kaufmännische und DH-Fächer zu verschieden sind.
--
-- KEINE Kopplung an dbo.Zuweisungen: befristete Abteilungs-Zuweisungen
-- geben hier ausdrücklich KEINEN Zugriff, anders als bei Wochen und
-- Beurteilungen (siehe backend/services/noten.js, Regel 1).
--
-- BEWUSST WEGGELASSENE SPALTEN – Begründung für den Löschjob
-- (backend/services/retention.js, pruefeUnbekannteSpalten):
--   * dbo.NotenEintraege hat KEIN AzubiOid. Denormalisiert wäre es für
--     Abfragen bequem, erzeugt aber eine zweite Personenspalte, die die
--     Selbstprüfung melden müsste. Der Azubi steht nur am Ordner.
--   * dbo.NotenBelege hat KEIN HochgeladenVon: hochladen darf nur der
--     Eigentümer (Ausbilder sind read-only), die Spalte wäre reine
--     Dopplung von NotenOrdner.AzubiOid.
--   Damit ist NotenOrdner.AzubiOid die EINZIGE Personenspalte dieses
--   Features -> eine PHASE_A-Zeile in retention.js genügt.
--
--   ÜBERHOLT DURCH MIGRATION 046: dbo.NotenAbschnitte kam als neue oberste
--   Ebene hinzu und hat eine eigene AzubiOid. retention.js braucht seitdem
--   ZWEI PHASE_A-Zeilen (Abschnitte vor Ordnern). Die Aussage oben gilt
--   nur noch für die beiden Kindtabellen.
--
-- Beleg-Inhalte als VARBINARY(MAX) direkt in der DB – gleiche
-- Entscheidung und Begründung wie dbo.Anhaenge (Migration 004).
-- Idempotent.
-- ============================================================

-- 1) Ordner ---------------------------------------------------------
IF OBJECT_ID('dbo.NotenOrdner', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.NotenOrdner (
    Id              INT IDENTITY(1,1) PRIMARY KEY,
    AzubiOid        NVARCHAR(36)  NOT NULL,  -- dbo.Users.Oid, lose (Repo-Konvention)
    Name            NVARCHAR(100) NOT NULL,  -- Freitext: "Englisch", "Zeugnisse"
    -- Fließt der Ordner in den GESAMTdurchschnitt ein? Default ja. Ein
    -- "Zeugnisse"-Ordner wiederholt Noten, die schon in den Fachordnern
    -- stehen, und würde den Gesamtschnitt doppelt gewichten. Der
    -- ORDNER-Durchschnitt wird unabhängig davon immer angezeigt.
    ZaehltInSchnitt BIT           NOT NULL
      CONSTRAINT DF_NotenOrdner_ZaehltInSchnitt DEFAULT 1,
    Sortierung      INT           NOT NULL
      CONSTRAINT DF_NotenOrdner_Sortierung DEFAULT 0,
    ErstelltAm      DATETIME2     NOT NULL
      CONSTRAINT DF_NotenOrdner_ErstelltAm DEFAULT SYSUTCDATETIME(),
    AktualisiertAm  DATETIME2     NULL,
    -- Pro Azubi eindeutig. Die Default-Collation ist case-INsensitiv,
    -- "Englisch" und "englisch" kollidieren also – gewollt; die Route
    -- fängt den Verstoß als 409 mit Klartext ab.
    CONSTRAINT UQ_NotenOrdner_AzubiName UNIQUE (AzubiOid, Name),
    CONSTRAINT CK_NotenOrdner_Name CHECK (LEN(LTRIM(RTRIM(Name))) > 0)
  );
  CREATE INDEX IX_NotenOrdner_AzubiOid ON dbo.NotenOrdner(AzubiOid);
  PRINT 'Tabelle dbo.NotenOrdner angelegt.';
END
ELSE PRINT 'dbo.NotenOrdner existiert bereits.';

-- 2) Einträge -------------------------------------------------------
IF OBJECT_ID('dbo.NotenEintraege', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.NotenEintraege (
    Id             INT IDENTITY(1,1) PRIMARY KEY,
    OrdnerId       INT            NOT NULL,
    Titel          NVARCHAR(200)  NOT NULL,
    -- Steuert (a) welche Eingabefelder die UI zeigt (IHK-Punkte gibt es
    -- nur bei Prüfungen) und (b) ob eine Mitteilung rausgeht. Whitelist
    -- wie CK_Benachrichtigungen_Typ: Erweiterung = neue Migration.
    -- Gleiche Liste wie ARTEN in app/js/noten-core.js.
    Art            NVARCHAR(20)   NOT NULL,
    Datum          DATE           NOT NULL,
    -- Zeitraum-Zuordnung. Gespeichert statt aus Users.AusbildungBeginn
    -- abgeleitet: ein abgeleiteter Wert deutet Altdaten um, sobald der
    -- Beginn korrigiert wird, und DH-Semester decken sich nicht mit
    -- Ausbildungsjahren.
    AbschnittTyp   NVARCHAR(15)   NULL,
    AbschnittNr    TINYINT        NULL,
    -- Freie Noteneingabe (das Frontend wandelt "2,3"). DECIMAL(3,2) und
    -- NICHT (2,1) wie Beurteilungen.Note: Schulnoten wie 2,35 und
    -- DHBW-Zwischenwerte brauchen zwei Nachkommastellen.
    Note           DECIMAL(3,2)   NULL,
    Punkte         TINYINT        NULL,  -- 0..100, nur bei Prüfungen
    -- 1 = Note wurde aus Punkte berechnet (IHK-Schlüssel PUNKTE_ZU_NOTE
    -- in app/js/beurteilung-core.js), 0 = vom Nutzer eingetippt. Für
    -- DH-Studenten bleibt es bis zur DHBW-Tabelle des Auftraggebers
    -- immer 0 (Punktefeld informativ).
    NoteAusPunkten BIT            NOT NULL
      CONSTRAINT DF_NotenEintraege_NoteAusPunkten DEFAULT 0,
    Bemerkung      NVARCHAR(1000) NULL,
    -- Idempotenz-Marker: die Mitteilung an Ausbilder und Ausbildungs-
    -- leitung geht GENAU EINMAL raus (beim Anlegen mit Mitteilungs-Art,
    -- sonst beim ersten PATCH, der die Art dazu macht). Ohne diesen
    -- Stempel würde jede spätere Notenkorrektur erneut senden.
    MitteilungGesendetAm DATETIME2 NULL,
    ErstelltAm     DATETIME2      NOT NULL
      CONSTRAINT DF_NotenEintraege_ErstelltAm DEFAULT SYSUTCDATETIME(),
    AktualisiertAm DATETIME2      NULL,
    CONSTRAINT FK_NotenEintraege_Ordner FOREIGN KEY (OrdnerId)
      REFERENCES dbo.NotenOrdner(Id) ON DELETE CASCADE,
    CONSTRAINT CK_NotenEintraege_Art CHECK (Art IN (
      'klassenarbeit','zwischenpruefung','abschlusspruefung',
      'semesterpruefung','zeugnis','sonstiges')),
    CONSTRAINT CK_NotenEintraege_AbschnittTyp CHECK (
      AbschnittTyp IS NULL OR AbschnittTyp IN ('ausbildungsjahr','semester')),
    CONSTRAINT CK_NotenEintraege_AbschnittNr CHECK (
      AbschnittNr IS NULL OR (AbschnittNr >= 1 AND AbschnittNr <= 8)),
    CONSTRAINT CK_NotenEintraege_Note CHECK (
      Note IS NULL OR (Note >= 1.0 AND Note <= 6.0)),
    CONSTRAINT CK_NotenEintraege_Punkte CHECK (Punkte IS NULL OR Punkte <= 100),
    CONSTRAINT CK_NotenEintraege_Titel CHECK (LEN(LTRIM(RTRIM(Titel))) > 0)
  );
  CREATE INDEX IX_NotenEintraege_OrdnerId ON dbo.NotenEintraege(OrdnerId);
  PRINT 'Tabelle dbo.NotenEintraege angelegt.';
END
ELSE PRINT 'dbo.NotenEintraege existiert bereits.';

-- 3) Belege ---------------------------------------------------------
IF OBJECT_ID('dbo.NotenBelege', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.NotenBelege (
    Id            INT IDENTITY(1,1) PRIMARY KEY,
    EintragId     INT            NOT NULL,
    Dateiname     NVARCHAR(255)  NOT NULL,
    MimeTyp       NVARCHAR(100)  NULL,
    GroesseBytes  INT            NOT NULL,
    Inhalt        VARBINARY(MAX) NOT NULL,
    HochgeladenAm DATETIME2      NOT NULL
      CONSTRAINT DF_NotenBelege_HochgeladenAm DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_NotenBelege_Eintrag FOREIGN KEY (EintragId)
      REFERENCES dbo.NotenEintraege(Id) ON DELETE CASCADE
  );
  CREATE INDEX IX_NotenBelege_EintragId ON dbo.NotenBelege(EintragId);
  PRINT 'Tabelle dbo.NotenBelege angelegt.';
END
ELSE PRINT 'dbo.NotenBelege existiert bereits.';
