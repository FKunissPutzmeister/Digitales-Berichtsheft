-- ============================================================
-- Migration 032 – Benachrichtigungs-Typ für die Löschvorwarnung
-- Ausführen gegen: Berichtsheft_Dev
--
-- Der Retention-Job (backend/services/retention.js) warnt 30 Tage vor dem
-- endgültigen Löschen eines Kontos. Dafür ein neuer Typ im CHECK-Constraint.
--
-- BEFUND VOR DER UMSETZUNG (2026-08-11): In dieser Datenbank existiert
-- CK_Benachrichtigungen_Typ ÜBERHAUPT NICHT — Migration 022 ist hier nie
-- gelaufen. Deshalb konnte der Typ 'erstgenehmigt' (backend/routes/wochen.js
-- ~Zeile 318) bisher geschrieben werden, obwohl Migration 022 ihn nicht
-- kennt; er steht in den Daten. Diese Migration FÜHRT den Constraint also
-- erstmals EIN, statt ihn zu erweitern. Bewusste Entscheidung: damit wird
-- wirksam, was Migration 022 dokumentiert, und ein künftiger Tippfehler im
-- Typ fällt hart auf, statt im best-effort-catch (catch (_) {} in
-- backend/routes/zuweisungen.js) still zu verschwinden.
--
-- Die Liste unten deckt alle 10 tatsächlich in dbo.Benachrichtigungen
-- vorkommenden Typen ab (geprüft am 2026-08-11):
--   abgelehnt, beurteilung_abgeschlossen, beurteilung_faellig,
--   erstgenehmigt, genehmigt, versetzung_entfernt, versetzung_geaendert,
--   versetzung_neu, vertretung_beendet, vertretung_neu
-- Das ALTER TABLE validiert den Bestand (Standard WITH CHECK) und geht
-- deshalb durch. Schlägt es dennoch fehl, nennt die Fehlermeldung den
-- verletzenden Wert — diesen Typ dann in die Liste aufnehmen, NICHT
-- WITH NOCHECK verwenden.
--
-- WocheId und ZuweisungId bleiben bei 'loeschung_geplant' NULL. Der
-- betroffene Nutzer steht in FromUserOid; sein Konto ist inaktiv und für die
-- Empfänger (KannPlanen) nicht in der Nutzerliste sichtbar, deshalb muss der
-- Name aus FromUserOid aufgelöst werden.
--
-- Basiert auf Migration 022 (inkl. Vertretungs-Typen). Idempotent.
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
                 'versetzung_neu','versetzung_geaendert','versetzung_entfernt',
                 'vertretung_neu','vertretung_beendet',
                 'loeschung_geplant'));
PRINT 'CK_Benachrichtigungen_Typ angelegt (11 Typen, inkl. loeschung_geplant).';
