-- ============================================================
-- Migration 001 – Wöchentliche Textfelder + tägliche Quill-Felder
-- Ausführen gegen: Berichtsheft_Dev
-- ============================================================

-- dbo.Wochen: Typ, wöchentliche Ort-Wahl, Textblöcke Betrieb/Schule/Unterweisung
ALTER TABLE dbo.Wochen
  ADD Typ                 NVARCHAR(20)  NULL,
      WochenOrt           NVARCHAR(20)  NULL,
      UnterweisungAktiv   BIT           NOT NULL
          CONSTRAINT DF_Wochen_UnterweisungAktiv DEFAULT 0,
      BetriebEintrag      NVARCHAR(MAX) NULL,
      SchuleEintrag       NVARCHAR(MAX) NULL,
      UnterweisungEintrag NVARCHAR(MAX) NULL;

-- dbo.Tage: tägliche Quill-Textfelder (täglicher Berichtsmodus)
ALTER TABLE dbo.Tage
  ADD BetriebEintrag      NVARCHAR(MAX) NULL,
      SchuleEintrag       NVARCHAR(MAX) NULL,
      UnterweisungEintrag NVARCHAR(MAX) NULL;
