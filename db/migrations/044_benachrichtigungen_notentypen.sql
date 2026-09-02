-- ============================================================
-- Migration 044 – Benachrichtigungs-Typ für Noten & Zeugnisse
-- Ausführen gegen: Berichtsheft_Dev
--
-- CK_Benachrichtigungen_Typ (Stand Migration 040: 13 Typen) kennt
-- 'noten_eintrag_neu' noch nicht — ohne diese Migration scheitert der
-- Mitteilungs-INSERT beim Anlegen eines Eintrags der Art Zeugnis,
-- Zwischen-, Abschluss- oder Semesterprüfung an der CHECK-Constraint.
-- Weil der Fanout in backend/routes/noten.js best-effort ist (try/catch
-- pro Empfänger, Muster routes/zuweisungen.js), fällt das nicht als
-- Fehler auf: die Mitteilung fehlt dann einfach.
-- Siehe Design-Spec
-- docs/superpowers/specs/2026-09-01-noten-zeugnisse-design.md
--
-- Basiert auf Migration 040 — die Liste wird nur ERWEITERT, nie
-- verengt (siehe Kommentar in 019_erstgenehmigung.sql).
--
-- Bezugsfeld ist FromUserOid = OID des Azubi/DH-Studenten. Ein Feld für
-- die Eintrags-Id gibt es bewusst nicht (die Tabelle trägt nur WocheId,
-- ZuweisungId und FromUserOid) — das Frontend verlinkt deshalb auf
-- noten.html?azubi=<oid>, nicht auf den einzelnen Eintrag.
-- Idempotent.
-- ============================================================

IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_Benachrichtigungen_Typ'
             AND parent_object_id = OBJECT_ID('dbo.Benachrichtigungen'))
BEGIN
  ALTER TABLE dbo.Benachrichtigungen DROP CONSTRAINT CK_Benachrichtigungen_Typ;
  PRINT 'CK_Benachrichtigungen_Typ (alt) entfernt.';
END
ELSE PRINT 'CK_Benachrichtigungen_Typ existierte nicht - wird erstmals eingefuehrt.';

ALTER TABLE dbo.Benachrichtigungen ADD CONSTRAINT CK_Benachrichtigungen_Typ
  CHECK (Typ IN ('genehmigt','abgelehnt','erstgenehmigt',
                 'beurteilung_faellig','beurteilung_abgeschlossen',
                 'kurzfeedback_faellig','kurzfeedback_abgeschlossen',
                 'versetzung_neu','versetzung_geaendert','versetzung_entfernt',
                 'vertretung_neu','vertretung_beendet',
                 'loeschung_geplant',
                 'noten_eintrag_neu'));
PRINT 'CK_Benachrichtigungen_Typ angelegt (14 Typen, inkl. Noten).';
