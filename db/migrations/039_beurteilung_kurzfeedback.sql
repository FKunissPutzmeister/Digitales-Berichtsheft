-- ============================================================
-- Migration 039 – Kurzfeedback für kurze Zuweisungen (<= 14 Tage)
-- Ausführen gegen: Berichtsheft_Dev
--
-- Zweiter, leichtgewichtiger Beurteilungs-Typ: 3 Leitfragen als Freitext
-- statt der 10-Kriterien-Beurteilung, keine Note, kein Kenntnisnahme-/
-- Ausbildungsleiter-Schritt. Wiederverwendet dbo.Beurteilungen (Typ-Spalte)
-- statt einer Parallelstruktur, siehe Design-Spec
-- 2026-08-26-beurteilung-kurzfeedback-design.md. Idempotent.
-- ============================================================

IF COL_LENGTH('dbo.Beurteilungen', 'Typ') IS NULL
BEGIN
  ALTER TABLE dbo.Beurteilungen ADD
    Typ NVARCHAR(10) NOT NULL
      CONSTRAINT DF_Beurteilungen_Typ DEFAULT 'gross'
      CONSTRAINT CK_Beurteilungen_Typ CHECK (Typ IN ('gross', 'kurz')),
    KurzfeedbackEindruck         NVARCHAR(MAX) NULL,
    KurzfeedbackAuffaelligkeiten NVARCHAR(MAX) NULL,
    KurzfeedbackEmpfehlung       NVARCHAR(MAX) NULL;
  PRINT 'Spalten für Kurzfeedback auf dbo.Beurteilungen ergänzt.';
END
ELSE PRINT 'dbo.Beurteilungen hat die Spalte Typ bereits.';
