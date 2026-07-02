/* Seed: 31 Abteilungen + Verantwortliche (E-Mail, lowercase).
   Idempotent: legt nur an, was fehlt. */
SET NOCOUNT ON;

DECLARE @cat TABLE (Name NVARCHAR(120), IstPmm BIT, Email NVARCHAR(255));

INSERT INTO @cat (Name, IstPmm, Email) VALUES
 (N'Lehrwerkstatt', 0, 'marco.rossi@putzmeister.com'),
 (N'Montage', 0, 'marco.rossi@putzmeister.com'),
 (N'Empfang', 0, 'sandra.pereira@putzmeister.com'),
 (N'Empfang', 0, 'katja.riester@putzmeister.com'),
 (N'Empfang', 0, 'thomas.look@putzmeister.com'),
 (N'Telefonzentrale', 0, 'sandra.pereira@putzmeister.com'),
 (N'Telefonzentrale', 0, 'katja.riester@putzmeister.com'),
 (N'Telefonzentrale', 0, 'thomas.look@putzmeister.com'),
 (N'Posteingang und -Verteilung', 0, 'thomas.look@putzmeister.com'),
 (N'Posteingang und -Verteilung', 0, 'elena-geanina.rusu@putzmeister.com'),
 (N'Qualitätssicherung', 0, 'karlheinz.roedler@putzmeister.com'),
 (N'Qualitätssicherung', 0, 'korhan.demirbilek@putzmeister.com'),
 (N'Wareneingangskontrolle', 0, 'karlheinz.roedler@putzmeister.com'),
 (N'Wareneingangskontrolle', 0, 'korhan.demirbilek@putzmeister.com'),
 (N'Werkzeuglager', 0, 'michael.haefner@putzmeister.com'),
 (N'Werkzeuglager', 0, 'matthias.bulling@putzmeister.com'),
 (N'Werkzeuglager', 0, 'barbara.rapp@putzmeister.com'),
 (N'Fertigungssteuerung', 0, 'timo.lechler@putzmeister.com'),
 (N'Fertigungssteuerung', 0, 'barbara.rapp@putzmeister.com'),
 (N'Produktmanagement', 0, 'patrick.hildenbrand@putzmeister.com'),
 (N'Produktmanagement', 0, 'christian.plavac@putzmeister.com'),
 (N'Einkauf', 0, 'frank.wenzel@putzmeister.com'),
 (N'Einkauf', 0, 'sebastian.grieb@putzmeister.com'),
 (N'Einkauf', 0, 'christian.weyermann@putzmeister.com'),
 (N'Einkauf', 0, 'nadine.koller@putzmeister.com'),
 (N'Disposition', 0, 'jacqueline.schnizler@putzmeister.com'),
 (N'Disposition', 0, 'maik.flammer@putzmeister.com'),
 (N'Finanz- und Rechnungswesen', 0, 'clemens.thrum@putzmeister.com'),
 (N'Finance and Risk Management', 0, 'hanns-carl.riethmueller@putzmeister.com'),
 (N'Personalwesen', 0, 'anika.kailer@putzmeister.com'),
 (N'Personalwesen', 0, 'linda.ebner@putzmeister.com'),
 (N'Personalwesen', 0, 'kai.knillmann@putzmeister.com'),
 (N'Entgeltabrechnung', 0, 'anika.kailer@putzmeister.com'),
 (N'Entgeltabrechnung', 0, 'linda.ebner@putzmeister.com'),
 (N'Entgeltabrechnung', 0, 'kai.knillmann@putzmeister.com'),
 (N'Service EMEA', 0, 'nadine.lechler@putzmeister.com'),
 (N'Service EMEA', 0, 'frank.riderer@putzmeister.com'),
 (N'Sales Planning', 0, 'stefanie.kuhn@putzmeister.com'),
 (N'Sales Planning', 0, 'torsten.werner@putzmeister.com'),
 (N'Machines CT', 0, 'alessandra.giamouridis@putzmeister.com'),
 (N'Machines CT', 0, 'joey-melina.janicsek@putzmeister.com'),
 (N'Machines CT', 0, 'eva.kernchen@putzmeister.com'),
 (N'Parts CT', 0, 'alessandra.giamouridis@putzmeister.com'),
 (N'Parts CT', 0, 'joey-melina.janicsek@putzmeister.com'),
 (N'Parts CT', 0, 'eva.kernchen@putzmeister.com'),
 (N'Logistik Management', 0, 'marian.deregowski@putzmeister.com'),
 (N'Logistik Management', 0, 'stephan.frank@putzmeister.com'),
 (N'Logistik Management', 0, 'tanja.broeder@putzmeister.com'),
 (N'Marketing PMH', 0, 'ann-kathrin.gehr@putzmeister.com'),
 (N'Marketing PMH', 0, 'julia.haag@putzmeister.com'),
 (N'Marketing PMH', 0, 'michael.walder@putzmeister.com'),
 (N'IT', 0, 'matthias.lengerer@putzmeister.com'),
 (N'Wareneingang PMM', 1, 'ruediger.breuning@putzmeister.com'),
 (N'Versand PMM', 1, 'ruediger.breuning@putzmeister.com'),
 (N'Einkauf PMM', 1, 'marcus.anderson@putzmeister.com'),
 (N'Dispo PMM', 1, 'marcus.anderson@putzmeister.com'),
 (N'FST PMM', 1, 'thomas.ruecker@putzmeister.com'),
 (N'APS PMM', 1, 'simone.schuett@putzmeister.com'),
 (N'Vertrieb PMM', 1, 'markus.hybl@putzmeister.com'),
 (N'QS PMM', 1, 'markus.hybl@putzmeister.com');

-- Abteilungen anlegen (fehlende)
INSERT INTO dbo.Abteilungen (Name, IstPmm, Aktiv)
SELECT DISTINCT c.Name, c.IstPmm, 1
FROM @cat c
WHERE NOT EXISTS (SELECT 1 FROM dbo.Abteilungen a WHERE a.Name = c.Name);

-- Verantwortliche anlegen (fehlende)
INSERT INTO dbo.AbteilungVerantwortliche (AbteilungId, Email)
SELECT a.Id, c.Email
FROM @cat c
JOIN dbo.Abteilungen a ON a.Name = c.Name
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.AbteilungVerantwortliche v
  WHERE v.AbteilungId = a.Id AND v.Email = c.Email
);

PRINT 'Abteilungs-Seed abgeschlossen.';

