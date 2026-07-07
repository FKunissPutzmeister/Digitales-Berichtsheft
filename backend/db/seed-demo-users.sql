SET NOCOUNT ON;
MERGE dbo.Users AS t USING (VALUES
  ('00000000-0000-0000-0000-000000000001', N'Florian Kuniß',     'florian.kuniss.demo@putzmeister.com', 'azubi',     0,0, N'Mechatroniker',                     '2024-09-01','2027-08-31',N'wöchentlich'),
  ('00000000-0000-0000-0000-000000000002', N'Matthias Lengerer', 'matthias.lengerer.demo@putzmeister.com','pruefer', 0,0, NULL, NULL, NULL, N'wöchentlich'),
  ('00000000-0000-0000-0000-000000000003', N'Florian Kern',      'florian.kern.demo@putzmeister.com',   'azubi',   0,0, N'Fachinformatiker für Systemintegration','2025-09-01','2028-08-31',N'wöchentlich'),
  ('00000000-0000-0000-0000-000000000004', N'Admin Verwaltung',  'admin.demo@putzmeister.com',        'admin',     1,0, NULL, NULL, NULL, N'wöchentlich'),
  ('00000000-0000-0000-0000-000000000005', N'Lena Müller',       'lena.mueller.demo@putzmeister.com', 'azubi',     0,0, N'Industriekauffrau',                 '2024-09-01','2027-08-31',N'wöchentlich'),
  ('00000000-0000-0000-0000-000000000006', N'Jonas Becker',      'jonas.becker.demo@putzmeister.com', 'azubi',     0,0, N'Mechatroniker',                     '2023-09-01','2026-08-31',N'täglich'),
  ('00000000-0000-0000-0000-000000000007', N'Jana Hofer',        'jana.hofer.demo@putzmeister.com',   'dhstudent', 0,0, N'DH Maschinenbau',                   '2025-10-01','2028-09-30',N'wöchentlich'),
  ('00000000-0000-0000-0000-000000000099', N'Developer Demo',    'dev.demo@putzmeister.com',          'developer', 0,0, NULL, NULL, NULL, N'wöchentlich')
) AS s(Oid,Name,Email,Role,KannPlanen,IstAusbilder,Beruf,AusbildungBeginn,AusbildungEnde,BerichtTyp)
ON t.Oid = s.Oid
WHEN MATCHED THEN UPDATE SET Name=s.Name, Email=s.Email, Role=s.Role, KannPlanen=s.KannPlanen,
  IstAusbilder=s.IstAusbilder, Beruf=s.Beruf, AusbildungBeginn=s.AusbildungBeginn,
  AusbildungEnde=s.AusbildungEnde, BerichtTyp=s.BerichtTyp, Aktiv=1, AktualisiertAm=SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (Oid,Name,Email,Role,KannPlanen,IstAusbilder,Beruf,AusbildungBeginn,AusbildungEnde,BerichtTyp)
  VALUES (s.Oid,s.Name,s.Email,s.Role,s.KannPlanen,s.IstAusbilder,s.Beruf,s.AusbildungBeginn,s.AusbildungEnde,s.BerichtTyp);
PRINT 'Demo-User geseedet.';
