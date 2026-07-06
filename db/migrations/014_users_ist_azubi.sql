-- ============================================================
-- Migration 014 – dbo.Users.IstAzubi (zusätzliches Azubi-Tag)
-- Ausführen gegen: Berichtsheft_Dev
--
-- Erlaubt einen Nutzer, der NICHT die Rolle 'azubi' hat (z.B. 'developer'),
-- zusätzlich als Azubi zu führen: eigenes Berichtsheft schreiben, im
-- Azubi-Planer/Listen erscheinen, dauerhaften Ausbilder zugewiesen bekommen.
-- Analog zum bestehenden Flag IstAusbilder. Login-JIT-Upsert fasst die Spalte
-- NICHT an (admin-gepflegt). Idempotent.
-- ============================================================
IF COL_LENGTH('dbo.Users', 'IstAzubi') IS NULL
BEGIN
  ALTER TABLE dbo.Users ADD IstAzubi BIT NOT NULL CONSTRAINT DF_Users_IstAzubi DEFAULT 0;
  PRINT 'Spalte dbo.Users.IstAzubi angelegt.';
END
ELSE PRINT 'dbo.Users.IstAzubi existiert bereits.';
