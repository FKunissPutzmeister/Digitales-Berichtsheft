# Systembeschreibung: Digitales Berichtsheft
*(Ausbildungs- und Studierendenverwaltung – Anlage zur IT-Information)*

Stand: 2026-09-11

## 1. Zweck der Anwendung

Die Anwendung ersetzt das bisher über das IHK-Online-Portal geführte
Berichtsheft für Auszubildende und dual Studierende, dessen Abschaltung
durch die IHK den Wechsel erforderlich macht. Sie bildet den gesamten
Ausbildungsnachweis-Prozess ab:
Erfassung der Tätigkeiten, Freigabe durch den Auszubildenden, Prüfung und
Genehmigung durch Ausbilder bzw. Prüfer. Ergänzend deckt sie folgende
Bereiche ab:

- Planung der Abteilungsdurchläufe (Einsatzplanung während der Ausbildung)
- Beurteilungsbögen nach jeder Station
- Fahrgelderstattung (nur für Auszubildende)
- Übernahme bestehender Berichtshefte aus dem IHK-Portal
- Ausgabe des fertigen Ausbildungsnachweises als PDF

## 2. Veränderung der Arbeitsverfahren und -methoden

Die fachlichen Arbeitsschritte selbst ändern sich nicht: weiterhin werden
Tätigkeiten dokumentiert, Stationen geplant, Beurteilungen erstellt und
Fahrtkosten abgerechnet. Es ändert sich das Medium, in dem das geschieht:

- Das Berichtsheft wird nicht mehr im IHK-Online-Portal geführt (dieses wird
  von der IHK abgeschaltet), sondern in der neuen Anwendung erfasst,
  freigegeben und genehmigt.
- Die Planung der Abteilungsdurchläufe erfolgt nicht mehr in einzelnen
  Excel-Dateien, sondern in einem zentralen Abteilungsplaner der Anwendung.
- Beurteilungsbögen und die Fahrgelderstattung, bisher auf Papierformularen,
  werden digital erfasst und als PDF ausgegeben.

## 3. Betroffener Personenkreis

- **Auszubildende** – führen ihr Berichtsheft, erhalten Fahrgelderstattung
  und Beurteilungen
- **Dual Studierende** – kein eigenes Berichtsheft, aber Abteilungsdurchlauf
  und Beurteilungen
- **Prüfer und Ausbilder** – prüfen und genehmigen Berichtshefte, erstellen
  Beurteilungen
- **Administration** (IT / Ausbildungsleitung) – eingeschränkte
  Verwaltungsrechte, siehe Abschnitt 6

## 4. Verarbeitete Daten

Aus dem unternehmensweiten Nutzerverzeichnis werden je Konto übernommen:
Name, E-Mail-Adresse, interne Kennung, Position/Jobtitel (zur Ableitung des
Ausbildungsberufs), Abteilung, Profilfoto sowie der hinterlegte Vorgesetzte
(zur automatischen Ausbilderzuordnung).

Darüber hinaus in der Anwendung selbst: Tätigkeitsberichte,
Anwesenheits-/Abwesenheitsangaben, Kommentare zu Berichtsheft-Einträgen,
Beurteilungsergebnisse sowie – ausschließlich für Auszubildende – Stammdaten
zur Fahrgelderstattung (Personalnummer, Kostenstelle, Wegstrecke,
Tagessatz). Technische Fehlermeldungen aus Browser und Anwendung werden
zusätzlich zur Fehlerbehebung gesammelt und nach 90 Tagen automatisch
gelöscht.

## 5. Datenherkunft und Aktualisierung

Die Kontodaten werden automatisiert alle 6 Stunden mit dem
unternehmensweiten Nutzerverzeichnis abgeglichen. Scheidet eine Person aus
den zuständigen Verzeichnisgruppen aus, wird ihr Konto beim nächsten
Abgleich gesperrt (nicht sofort gelöscht, siehe Abschnitt 8); ein aktives
Konto entsteht ebenso automatisiert bei Aufnahme in die entsprechende
Gruppe.

## 6. Zugriffsrechte

Der Zugriff auf ein Berichtsheft ist unabhängig von der Rolle strikt an drei
Quellen gebunden:

1. das eigene Heft (Auszubildender),
2. eine dauerhafte Ausbilder-Zuordnung (i. d. R. der disziplinarische
   Vorgesetzte),
3. eine befristete, im Abteilungsplaner hinterlegte Zuweisung für den
   Zeitraum einer Station (mit 6 Wochen Nachlauffrist nach deren Ende).

Verwaltungs-Sonderrechte (Nutzer-, Abteilungs- und Schlüsselverwaltung) sind
auf einen sehr kleinen IT-Personenkreis beschränkt. Auch dieser
Personenkreis darf Berichtshefte nur lesen, nicht ohne reguläre Zuordnung
bearbeiten oder abnehmen.

## 7. Nachvollziehbarkeit

Jeder Statuswechsel eines Berichtshefts (freigegeben, geprüft, genehmigt,
zurückgegeben) sowie jeder Kommentar wird mit Person und Zeitpunkt
festgehalten und ist für die jeweils zugriffsberechtigten Personen
einsehbar. Es gibt **keine** automatisierte Auswertung von
Bearbeitungszeiten, Vollständigkeit oder sonstigen Kennzahlen zur Leistungs-
oder Verhaltenskontrolle; die Anwendung erinnert Auszubildende nicht an
fehlende Einträge und erstellt hierzu keine Statistiken.

## 8. Aufbewahrung und Löschung

Scheidet eine Person endgültig aus dem Unternehmen aus, wird ihr Konto
zunächst gesperrt und nach 365 Tagen automatisch inklusive aller
zugehörigen Daten (Berichtsheft, Kommentare, Beurteilungen, Anhänge,
Profilfoto) gelöscht. Ausbildungsleitung und IT werden 30 Tage vor der
Löschung informiert. Ein tägliches technisches Backup wird nach 30 Tagen
automatisch entfernt und dient ausschließlich der kurzfristigen
Wiederherstellung durch die betroffene Person selbst.

## 9. Technischer Betrieb

Die Anwendung läuft ausschließlich im Firmennetz auf unternehmenseigenen
Servern; es wird kein externer Cloud-Dienst zur Datenverarbeitung genutzt.
Die Anmeldung erfolgt über das bestehende unternehmensweite
Single-Sign-On-Verfahren; eine separate Passwortverwaltung existiert nicht.
Für einen einzelnen technischen Datenimport steht zusätzlich eine
programmatische Schnittstelle mit persönlichen, protokollierten
Zugriffsschlüsseln zur Verfügung; sie räumt keine weitergehenden Rechte ein
als die Bedienoberfläche.
