-- ============================================================
-- Migration 049 – dbo.MailProtokoll (wer hat welche Mail wann bekommen)
-- Ausführen gegen: Berichtsheft_Dev
--
-- services/mail.js → sendeMail schreibt JEDEN Versandversuch hier hinein,
-- auch fehlgeschlagene (Erfolg = 0, Fehler = Grund). Angezeigt auf der
-- Seite „E-Mails" (app/mails.html, nur developer).
--
-- An = tatsächlicher Empfänger (im Testmodus also MAIL_TEST_AN, der
-- eigentliche Empfänger steht dann im Betreff „[TEST → …]").
-- Idempotent.
-- ============================================================

IF OBJECT_ID('dbo.MailProtokoll', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.MailProtokoll (
    Id          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Zeitpunkt   DATETIME2      NOT NULL CONSTRAINT DF_MailProtokoll_Zeitpunkt DEFAULT SYSUTCDATETIME(),
    An          NVARCHAR(500)  NOT NULL,
    EmpfOid     NVARCHAR(36)   NULL,           -- für Name + Profilbild auf der Seite
    EmpfName    NVARCHAR(200)  NULL,
    Betreff     NVARCHAR(400)  NOT NULL,
    Anlass      NVARCHAR(100)  NULL,
    Modus       NVARCHAR(10)   NOT NULL,
    Erfolg      BIT            NOT NULL,
    Fehler      NVARCHAR(500)  NULL
  );
  CREATE INDEX IX_MailProtokoll_Zeitpunkt ON dbo.MailProtokoll (Zeitpunkt DESC);
  PRINT 'Tabelle dbo.MailProtokoll angelegt.';
END
ELSE PRINT 'dbo.MailProtokoll existiert bereits.';
