-- ============================================================
-- Migration 020 – dbo.Vertretungen (Self-Service-Delegation)
-- Ausführen gegen: Berichtsheft_Dev
--
-- Eine betreuende Person (Vertretener) delegiert ihre azubi-bezogenen
-- Rechte an eine andere betreuende Person (Vertreter) – dauerhaft
-- (Von/Bis NULL) oder befristet (Von/Bis gesetzt). Solange die
-- Vertretung am Stichtag aktiv ist, werden die Zugriffsquellen des
-- Vertretenen (Zuweisungen + AusbilderAzubis) additiv in den Kontext
-- des Vertreters uniert (siehe backend/services/zugriffContext.js).
-- Referenz per OID (dbo.Users.Oid). n:m, aber pro Paar genau eine Zeile
-- (UNIQUE) – Fenster ändern = beenden + neu anlegen. Idempotent.
-- ============================================================
IF OBJECT_ID('dbo.Vertretungen', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Vertretungen (
    Id             INT IDENTITY(1,1) PRIMARY KEY,
    VertretenerOid NVARCHAR(36) NOT NULL,  -- dbo.Users.Oid: delegiert seine Rechte
    VertreterOid   NVARCHAR(36) NOT NULL,  -- dbo.Users.Oid: erhält die Rechte
    Von            DATE NULL,              -- NULL = ab sofort
    Bis            DATE NULL,              -- NULL = unbefristet ("für immer")
    ErstelltAm     DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ErstelltVon    NVARCHAR(36) NULL,
    CONSTRAINT UQ_Vertretungen UNIQUE (VertretenerOid, VertreterOid),
    CONSTRAINT CK_Vertretungen_NichtSelbst CHECK (VertretenerOid <> VertreterOid)
  );
  CREATE INDEX IX_Vertretungen_VertreterOid   ON dbo.Vertretungen(VertreterOid);
  CREATE INDEX IX_Vertretungen_VertretenerOid ON dbo.Vertretungen(VertretenerOid);
  PRINT 'Tabelle dbo.Vertretungen angelegt.';
END
ELSE PRINT 'dbo.Vertretungen existiert bereits.';
