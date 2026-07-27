-- ============================================================
-- Migration 026 – dbo.Users.ErsteAnmeldung (Zeitpunkt des ersten Logins)
-- Ausführen gegen: Berichtsheft_Dev
--
-- Wird beim Login-JIT-Upsert EINMALIG gesetzt (COALESCE, nie wieder
-- überschrieben) — im Unterschied zu LetzterLogin, das bei jedem Login
-- aktualisiert wird. Grundlage für das IHK-Import-Onboarding: Azubis, die
-- sich bereits vor dem September-Jahrgangswechsel angemeldet haben, gelten
-- als "bestehend" (hatten ein IHK-Berichtsheft) und sehen den Hinweis;
-- Azubis, deren erste Anmeldung erst danach liegt, nicht. Idempotent.
-- ============================================================
IF COL_LENGTH('dbo.Users', 'ErsteAnmeldung') IS NULL
BEGIN
  ALTER TABLE dbo.Users ADD ErsteAnmeldung DATETIME2 NULL;
  PRINT 'Spalte dbo.Users.ErsteAnmeldung angelegt.';
END
ELSE PRINT 'dbo.Users.ErsteAnmeldung existiert bereits.';
