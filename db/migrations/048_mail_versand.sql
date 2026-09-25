-- ============================================================
-- Migration 048 – dbo.MailVersand (Sperre gegen doppelte Erinnerungsmails)
-- Ausführen gegen: Berichtsheft_Dev
--
-- Die täglichen Erinnerungen (services/mailErinnerungen.js) dürfen jeden
-- Fall genau EINMAL mailen. Der Job trägt vor dem Senden einen Schlüssel ein;
-- scheitert der INSERT am UNIQUE, war der Fall schon dran und es wird nicht
-- gesendet. Schlägt der Versand fehl, löscht der Job seinen Eintrag wieder,
-- damit es am nächsten Tag erneut versucht wird.
--
-- Schluessel z. B.
--   keine_eintraege:<AzubiOid>:<letzte KW mit Inhalt | nie>
--   beurteilung_offen:<ZuweisungId>:<gross|kurz>
-- Im Testmodus mit Präfix "test:", damit Testläufe die echten Fälle nicht
-- als erledigt markieren.
--
-- Art: 'gesendet' (Mail raus) | 'stichtag' (beim Scharfschalten als erledigt
-- markiert, ohne Mail — so bekommt beim Umschalten auf live niemand eine
-- Mail für einen Fall, der schon länger besteht).
--
-- Keine personenbezogenen Klartextdaten: nur Oid/Id im Schlüssel.
-- Idempotent.
-- ============================================================

IF OBJECT_ID('dbo.MailVersand', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.MailVersand (
    Id          INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Anlass      NVARCHAR(40)  NOT NULL,
    Schluessel  NVARCHAR(200) NOT NULL,
    Art         NVARCHAR(10)  NOT NULL CONSTRAINT DF_MailVersand_Art DEFAULT N'gesendet',
    ErstelltAm  DATETIME2     NOT NULL CONSTRAINT DF_MailVersand_ErstelltAm DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_MailVersand_Schluessel UNIQUE (Schluessel),
    CONSTRAINT CK_MailVersand_Art CHECK (Art IN (N'gesendet', N'stichtag'))
  );
  PRINT 'Tabelle dbo.MailVersand angelegt.';
END
ELSE PRINT 'dbo.MailVersand existiert bereits.';
