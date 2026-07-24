/* ====================================================================
   DEMO-SEED: Abteilungsdurchlauf des DH-Studenten „Jana Hofer"
   --------------------------------------------------------------------
   Legt sechs Beispiel-Zuweisungen (Abteilungen) für den Demo-User
   Jana Hofer an, damit die DH-Ansicht (abteilungsdurchlauf.html) mit
   Inhalt erscheint. Idempotent: löscht zuerst evtl. vorhandene Demo-
   Zuweisungen desselben Azubis.

   Azubi-OID (Jana Hofer) = 00000000-0000-0000-0000-000000000007
   Verantwortliche werden über die E-Mail referenziert (Spalte
   VerantwEmail, siehe backend/routes/zuweisungen.js) – die alte Spalte
   AusbilderOid existiert im aktuellen Schema nicht mehr:
     Matthias Lengerer (Prüfer)  = matthias.lengerer.demo@putzmeister.com
     Admin Verwaltung            = admin.demo@putzmeister.com

   Ausführen gegen die Berichtsheft-Datenbank, z. B.:
     node backend/db/run-sql.js backend/db/seed-dhstudent-demo.sql
   ==================================================================== */

SET NOCOUNT ON;

DECLARE @azubi        NVARCHAR(36)  = '00000000-0000-0000-0000-000000000007';       -- Jana Hofer
DECLARE @verantwAusb  NVARCHAR(255) = 'matthias.lengerer.demo@putzmeister.com';     -- Matthias Lengerer
DECLARE @verantwAdmin NVARCHAR(255) = 'admin.demo@putzmeister.com';                 -- Admin Verwaltung

-- Idempotenz: bestehende Zuweisungen dieses Demo-Azubis entfernen.
DELETE FROM dbo.Zuweisungen WHERE AzubiOid = @azubi;

INSERT INTO dbo.Zuweisungen (AzubiOid, VerantwEmail, Abteilung, Von, Bis) VALUES
  (@azubi, @verantwAusb,  N'Konstruktion',                 '2025-10-01', '2025-12-31'),
  (@azubi, @verantwAdmin, N'Fertigung & Montage',          '2026-01-05', '2026-03-27'),
  (@azubi, @verantwAusb,  N'Qualitätssicherung',           '2026-03-30', '2026-06-30'),
  (@azubi, @verantwAdmin, N'Versuch & Entwicklung',        '2026-07-01', '2026-09-30'),
  (@azubi, @verantwAusb,  N'Technische Projektplanung',    '2026-10-01', '2026-12-18'),
  (@azubi, @verantwAdmin, N'Auslandseinsatz · Werk China', '2027-01-06', '2027-03-27');

PRINT 'Seed: 6 Abteilungs-Zuweisungen für Jana Hofer angelegt.';
