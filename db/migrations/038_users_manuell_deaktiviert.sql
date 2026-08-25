-- ============================================================
-- Migration 038 – Manuelle Deaktivierung übersteht den Entra-Sync
-- Ausführen gegen: Berichtsheft_Dev
--
-- Bisher: setzte man einen gruppen-verwalteten User (Prüfer/Azubi/
-- DH-Student) in der Nutzerverwaltung manuell auf Inaktiv, hob der
-- nächste Entra-Sync-Lauf das wieder auf (Aktiv=1), sofern die Person
-- noch Mitglied ihrer Entra-Gruppe war — die Deaktivierung "hielt" nur
-- für admin/developer (keine Gruppen-Verwaltung).
--
-- Diese Migration ergänzt ein Flag, das eine manuelle Deaktivierung vom
-- Sync ausnimmt. Reaktivierung dann ausschließlich durch erneutes
-- manuelles Setzen von Aktiv=1 (löscht das Flag wieder).
-- Idempotent.
-- ============================================================

IF COL_LENGTH('dbo.Users','ManuellDeaktiviert') IS NULL
BEGIN
  ALTER TABLE dbo.Users ADD
    ManuellDeaktiviert BIT NOT NULL CONSTRAINT DF_Users_ManuellDeaktiviert DEFAULT 0;
  PRINT 'Spalte ManuellDeaktiviert auf dbo.Users ergänzt.';
END
ELSE PRINT 'dbo.Users hat die Spalte ManuellDeaktiviert bereits.';
