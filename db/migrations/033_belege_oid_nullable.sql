-- ============================================================
-- Migration 033 – Belegspalten NULL-erlaubt machen (Löschkonzept)
-- Ausführen gegen: Berichtsheft_Dev
--
-- BEFUND des Abschluss-Reviews (2026-08-13): Phase B des Retention-Jobs
-- (backend/services/retention.js) anonymisiert Belege in FREMDEN Heften,
-- indem sie die Personen-Referenz auf NULL setzt und den denormalisierten
-- Namen behält:
--
--   UPDATE dbo.Kommentare SET AutorName = COALESCE(AutorName, @name), UserOid = NULL ...
--   UPDATE dbo.Anhaenge   SET HochgeladenVon = NULL ...
--
-- Beide Spalten sind aber NOT NULL. Das UPDATE scheitert deshalb mit
-- Fehler 515, sobald mindestens eine Zeile passt — und weil alle drei
-- Phasen in EINER Transaktion laufen, rollt der komplette Löschvorgang
-- zurück. Das Konto würde jede Nacht erneut versucht und jede Nacht
-- erneut scheitern, mit nur einem generischen Eintrag im
-- Fehler-Posteingang.
--
-- Betroffen ist genau die Personengruppe, für die das Drei-Phasen-Modell
-- überhaupt gebaut wurde: Prüfer und Ausbilder, die in fremden Heften
-- gehandelt haben. In der Dev-Datenbank haben aktuell 2 Personen
-- Kommentare in fremden Heften (Kommentare: akut), 0 Personen Anhänge
-- (Anhaenge: latent, tritt beim ersten Fall auf).
--
-- Warum NULL und nicht Löschen der Zeile: Kommentar und Anhang gehören
-- zum Ausbildungsnachweis des AZUBIS, nicht zur ausgeschiedenen Person.
-- Sie müssen erhalten bleiben; nur der Personenbezug (die OID) fällt weg,
-- der Name bleibt als Bestandteil des Belegs stehen.
--
-- Nach dieser Migration entsprechen die Spalten den bereits
-- NULL-erlaubten Gegenstücken Wochen.KorrigiertVon,
-- Beurteilungen.BeurteiltVon/KenntnisnahmeVon/KorrigiertVon und
-- Benachrichtigungen.FromUserOid.
--
-- Verträglichkeit geprüft: renderComment vergleicht k.userId === user.id
-- (bei NULL false, niemand kann den Kommentar einer gelöschten Person
-- entfernen — gewollt), hatKorrigiert in zugriff.js guardet auf
-- !user.oid, und FOR JSON PATH lässt NULL-Schlüssel einfach weg.
--
-- Idempotent: ändert nur, was noch NOT NULL ist.
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.Kommentare')
             AND name = 'UserOid' AND is_nullable = 0)
BEGIN
  ALTER TABLE dbo.Kommentare ALTER COLUMN UserOid NVARCHAR(36) NULL;
  PRINT 'dbo.Kommentare.UserOid auf NULL-erlaubt gesetzt.';
END
ELSE PRINT 'dbo.Kommentare.UserOid ist bereits NULL-erlaubt.';

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.Anhaenge')
             AND name = 'HochgeladenVon' AND is_nullable = 0)
BEGIN
  ALTER TABLE dbo.Anhaenge ALTER COLUMN HochgeladenVon NVARCHAR(36) NULL;
  PRINT 'dbo.Anhaenge.HochgeladenVon auf NULL-erlaubt gesetzt.';
END
ELSE PRINT 'dbo.Anhaenge.HochgeladenVon ist bereits NULL-erlaubt.';
