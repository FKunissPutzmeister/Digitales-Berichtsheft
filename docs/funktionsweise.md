# Digitales Berichtsheft — Funktionsweise & Abläufe

Diese Datei erklärt, **was die Anwendung fachlich tut**: wer sie nutzt, woher die
Nutzer kommen, welche Rechte sie haben, wie ein Berichtsheft von der Eingabe bis
zur Genehmigung läuft und was in Sonderfällen passiert.

Zielgruppe: Ausbildungsleitung, Administration, IT-Betrieb — jemand mit
Grundverständnis für SQL, IIS und Azure/Entra, aber ohne Kenntnis des Quellcodes.
Programmier-Details stehen bewusst **nicht** hier (dafür: `README.md`).

Stand: 2026-08-05

---

## 1. Was die Anwendung ist

Sie ersetzt das Papier-Berichtsheft für Auszubildende und DH-Studenten bei
Putzmeister. Ein Auszubildender erfasst seine Tätigkeiten wochen- oder
tageweise, gibt die Woche frei; Prüfer und Ausbilder nehmen sie ab. Drumherum
hängen: die Planung der Abteilungsdurchläufe, Beurteilungsbögen, die
Fahrgelderstattung, ein Import der Altdaten aus dem IHK-Portal und der Export
als PDF-Ausbildungsnachweis.

Technisch ist es eine Webanwendung: Browser → IIS → Node-Anwendung → SQL Server.
Alles läuft im Firmennetz, der Login geht über Azure/Entra ID.

---

## 2. Woher die Nutzer kommen

**Es gibt keine Benutzerverwaltung mit Passwörtern.** Konten entstehen auf zwei
Wegen, beide gespeist aus Entra ID:

**a) Automatischer Gruppen-Abgleich (der Regelfall).**
Alle 6 Stunden (konfigurierbar) fragt die Anwendung per Microsoft Graph drei
Entra-Sicherheitsgruppen ab — eine für Prüfer, eine für Azubis, eine für
DH-Studenten. Jedes Gruppenmitglied wird in der Nutzertabelle angelegt oder
aktualisiert. Wer in mehreren Gruppen ist, bekommt die höherwertige Rolle
(Prüfer > Azubi > DH-Student).

Der Abgleich holt dabei mehr als nur Name und Rolle:

| Was aus Entra kommt | Wozu es in der App wird |
| --- | --- |
| Anzeigename, E-Mail, Objekt-ID | Identität des Kontos |
| Gruppenmitgliedschaft | Rolle (Azubi / Prüfer / DH-Student) |
| Position / Jobtitel | Ausbildungsberuf (Präfix „Auszubildender" wird entfernt) |
| Abteilung („gewerblich" / „kaufmännisch") | Berichtsrhythmus: täglich bzw. wöchentlich |
| Profilfoto | Avatar in der Anwendung |
| **Vorgesetzter (Manager)** | **dauerhafte Ausbilder-Zuordnung** des Azubis |

Der letzte Punkt ist wichtig: Der in Entra eingetragene Manager eines Azubis
wird automatisch als dessen Ausbilder eingetragen. Existiert er noch nicht als
Nutzer, wird er als Prüfer angelegt.

**b) Beim ersten Login (Nachzügler-Fall).**
Meldet sich jemand an, dessen Konto noch nicht in der Datenbank steht, wird es
aus den Login-Daten sofort angelegt. So sperrt ein noch nicht gelaufener
Abgleich niemanden aus.

**Deaktivierung.** Wer aus allen drei Entra-Gruppen verschwindet, wird beim
nächsten Abgleich auf *inaktiv* gesetzt — nicht gelöscht. Ein inaktives Konto
kann sich nicht mehr anmelden (Abweisung bereits bei der Anmeldung). Alle Daten
bleiben erhalten und für Berechtigte sichtbar. Schlägt der Graph-Abruf fehl,
bricht der ganze Lauf ab und deaktiviert **niemanden** — damit ein Netz- oder
Rechteproblem nicht versehentlich halbe Jahrgänge aussperrt.

Demo-Konten (E-Mail-Muster `*.demo@…`) sind von der Deaktivierung ausgenommen.

---

## 3. Rollen und Rechte

Die Anwendung unterscheidet **Rollen** (eine pro Person) und **Zusatzrechte**
(Häkchen, mehrere möglich).

### Rollen

| Rolle | Woher | Bedeutung |
| --- | --- | --- |
| `azubi` | Entra-Gruppe / SSO-Anmeldung | Führt ein eigenes Berichtsheft |
| `dhstudent` | Entra-Gruppe | Kein Berichtsheft; sieht nur den eigenen Abteilungsdurchlauf und erhält Beurteilungen |
| `pruefer` | Entra-Gruppe / SSO-Anmeldung | Prüft Berichtshefte; gilt automatisch als „ausbilderfähig" |
| `admin` | nur manuell in der Datenbank | Darf alle Hefte **lesen** und jede Beurteilung schreiben — aber keine Wochen abnehmen und keine Nutzer/Abteilungen verwalten |
| `developer` | nur manuell in der Datenbank | Hat alle Rechte; die einzige Rolle, die Nutzer, Abteilungen, API-Schlüssel und Fehlerberichte verwalten darf |

Wichtig: Der Gruppen-Abgleich überschreibt `admin`, `developer` und
`dhstudent` **nie** mit einer Standardrolle. Diese Sonderrollen sind also stabil.

### Zusatzrechte

| Häkchen | Wirkung |
| --- | --- |
| **Ist Ausbilder** | Darf endgenehmigen und Beurteilungen schreiben. Bei Rolle `pruefer` implizit gesetzt. |
| **Kann planen** | Darf Abteilungsdurchläufe planen und die Berichtsheftverwaltung öffnen. |
| **Ist Azubi** | Führt zusätzlich ein eigenes Heft (z. B. ein Developer, der selbst Azubi ist). |

### Wer sieht welche Menüpunkte

| Menüpunkt | Sichtbar für |
| --- | --- |
| Dashboard | alle (Inhalt je Rolle unterschiedlich) |
| Wochenansicht | Azubis und alle Korrekturberechtigten |
| Jahresansicht | wie Wochenansicht, aber **nicht** für rein befristete Prüfer |
| Fahrgelderstattung | nur Azubis |
| Abteilungsdurchlauf | Azubis und Ausbilder mit dauerhafter Zuordnung |
| Abteilungs-Planer, Berichtsheftverwaltung | „Kann planen" |
| Nutzerverwaltung, Abteilungen, Fehlerberichte, IHK-Archiv | nur `developer` |

Das Ausblenden von Menüpunkten ist reine Bequemlichkeit — der Server prüft jede
Anfrage unabhängig davon nochmals selbst.

### Der „reine Prüfer"

Ein Sonderfall mit eigener, reduzierter Oberfläche: Rolle `pruefer`, aber **ohne**
dauerhafte Ausbilder-Zuordnung — also jemand, der Azubis nur während einer
befristeten Abteilungsstation betreut. Dieser Nutzer sieht statt „Meine Azubis"
seine **Prüfzeiträume**, hat keine Jahresansicht und kann nur *erstgenehmigen*,
nie endgenehmigen.

### Developer-Ansicht (Umschalter)

Ein kleiner Kreis von Entwicklern (feste E-Mail-Liste im Code) sieht in der
Seitenleiste einen Schalter „Developer-Ansicht". **Standard ist immer die
Azubi-Ansicht** — auch wenn in der Datenbank `developer` steht. Erst der Schalter
hebt die Ansicht für die laufende Sitzung an. So testen Entwickler mit echten
Nutzerrechten und sehen unfertige Funktionen nur bewusst.

---

## 4. Anmeldung

**Produktiv:** ausschließlich SAML 2.0 gegen Azure/Entra. Die Anwendung ist der
Service Provider, Entra der Identity Provider. Klick auf „Mit Microsoft
anmelden" → Entra-Login → die Anwendung erhält eine signierte Assertion mit
Objekt-ID, Name, E-Mail und Rolle, legt die Sitzung an und leitet weiter
(DH-Studenten direkt auf den Abteilungsdurchlauf, alle anderen aufs Dashboard).

**Sitzungen** liegen als Dateien auf dem Server und halten 7 Tage. Ein Neustart
der Anwendung loggt daher niemanden aus. Bei jedem einzelnen Aufruf wird der
Nutzer frisch aus der Datenbank gelesen — Rollen- oder Rechteänderungen wirken
also sofort, ohne Neuanmeldung.

**Nur außerhalb der Produktion** existiert zusätzlich ein passwortloser
Demo-Login, und der greift ausschließlich für Konten mit `.demo`-E-Mail. In
Produktion sind diese Endpunkte gar nicht vorhanden.

---

## 5. Wer darf welches Berichtsheft sehen und bearbeiten

Das ist die zentrale Regel der Anwendung — und sie hängt **nicht** an der Rolle,
sondern an drei Zugriffsquellen, die zusammengerechnet werden:

**1. Das eigene Heft.** Ein Azubi darf immer sein eigenes Heft sehen und (solange
nicht gesperrt) bearbeiten.

**2. Dauerhafte Ausbilder-Zuordnung.** Eine Person ist einem Azubi ohne
Zeitgrenze als Ausbilder zugeordnet — entweder automatisch über den
Entra-Manager oder manuell in der Nutzerverwaltung. Diese Person darf **alle**
Wochen dieses Azubis sehen und korrigieren, ohne Datumsgrenze. Sie ist es, die
*endgenehmigt*.

Nimmt ein Administrator eine automatisch entstandene Zuordnung weg, wird sie
dauerhaft ausgeschlossen — der nächste Entra-Abgleich legt sie nicht wieder an.

**3. Befristete Abteilungs-Zuweisung.** Im Abteilungs-Planer wird ein Azubi einer
Abteilung für einen Zeitraum zugewiesen, mit einer verantwortlichen Person
(hinterlegt über deren E-Mail-Adresse). Diese Person darf genau die Wochen
sehen und korrigieren, die **in ihren Zuweisungszeitraum fallen** — nicht das
ganze Heft.

**Nachlauffrist:** Nach dem Ende einer Zuweisung bleibt der Zugriff noch
**6 Wochen (42 Tage)** bestehen, damit Wochen kurz vor Stationsende noch
abgenommen werden können. Das Dashboard des Prüfers warnt, bis wann. Danach ist
keine Korrektur mehr möglich.

**Zusätzlich, dauerhaft:** Wer eine Woche einmal bearbeitet oder kommentiert hat,
behält Leserecht darauf — auch wenn Zuweisung und Nachlauf längst abgelaufen sind.
So bleibt nachvollziehbar, wer was abgenommen hat.

**Vertretungen.** Jede betreuende Person kann im eigenen Profil selbst eine
Vertretung eintragen (dauerhaft oder befristet). Solange diese aktiv ist, erbt
der Vertreter **alle** Zugriffsquellen des Vertretenen und sieht dessen Azubis
in der Auswahl. Nur eine Ebene — der Vertreter kann nicht weiterdelegieren. Als
Vertreter kommen nur betreuende Personen in Frage, keine Azubis oder
DH-Studenten. Beenden darf nur, wer die Vertretung vergeben hat.

**Admin und Developer** dürfen alle Hefte **lesen** — bewusst als Gesamtüberblick.
Das Berichtsheft **schreiben** (korrigieren, abnehmen) dürfen sie dagegen nur
über dieselben Zugriffsquellen wie jeder andere: dauerhafte Zuordnung oder aktive
Zuweisung. Eine Ausnahme gibt es bei **Beurteilungen** — die darf Admin und
Developer zu jeder Zuweisung schreiben und abschließen.

---

## 6. Der Berichtsheft-Ablauf

### Erfassen

Der Azubi arbeitet in der Wochenansicht: pro Tag Anwesenheit (anwesend,
Arbeitsunfähigkeit, sonstige Abwesenheit …), Ort (Betrieb, Schule, beides),
Ganz- oder Halbtag und der Tätigkeitstext als formatierbarer Text (Listen,
Tabellen, Bilder). Wochen mit täglichem Rhythmus haben Einträge pro Tag und Ort,
wöchentliche einen Wochentext.

Gespeichert wird automatisch im Hintergrund. Anhänge (bis 10 MB je Datei) können
an eine Woche gehängt werden, solange diese nicht gesperrt ist.

### Statusfolge

| Status | Wer handelt | Was passiert |
| --- | --- | --- |
| **offen** | Azubi | frei bearbeitbar |
| **freigegeben** | Azubi gibt frei | Inhalt gesperrt; Abgabedatum wird gestempelt. Zurückziehen ist möglich, solange niemand reagiert hat |
| **erstgenehmigt** | Prüfer | Vorprüfung erledigt; die dauerhaften Ausbilder werden benachrichtigt |
| **genehmigt** | Ausbilder | Endabnahme; endgültig gesperrt |
| **abgelehnt** | Prüfer oder Ausbilder | mit Begründung zurückgegeben; der Azubi kann wieder bearbeiten und erneut freigeben |

Zwei Regeln dahinter:

- **Ab „freigegeben" ist der Inhalt gesperrt.** Weder Azubi noch Prüfer können
  Texte oder Tage ändern. Erst eine Rückgabe macht die Woche wieder editierbar.
  Das ist eine IHK-Anforderung („nach Freigabe unveränderbar").
- **Wer speichert, kann keinen Status setzen.** Das normale Speichern ändert
  niemals den Status; Statuswechsel gehen über einen eigenen, rollengeprüften
  Weg. Ein Azubi kann sein Heft also nicht selbst genehmigen.

Gibt der **Ausbilder** eine Woche zurück, wird die Prüferstufe für diese Woche
übersprungen: der Azubi reicht erneut ein, und die Woche geht direkt zurück zur
Endabnahme. Sinn: die Vorprüfung nicht zweimal laufen lassen.

### Kommentieren

Nur wer die Woche aktiv korrigieren darf, kann kommentieren — auf Wochen- oder
Tagesebene. Die Begründung einer Rückgabe ist ein Kommentar besonderen Typs und
erscheint im Statusbanner beim Azubi. Löschen kann jeder nur seine eigenen
Kommentare.

---

## 7. Abteilungsdurchlauf (Planung)

Wer „Kann planen" hat, arbeitet im Abteilungs-Planer mit einer Zeitleiste:
Azubis und DH-Studenten werden Abteilungen und Zeiträumen zugeordnet, jeweils
mit einer verantwortlichen Person aus dem Abteilungskatalog.

Regeln:

- **Keine Überschneidungen.** Ein Azubi kann nicht gleichzeitig zwei Stationen
  haben; die Anwendung lehnt überlappende Zeiträume mit Hinweis auf die
  bestehende Zuweisung ab. Ein leeres End-Datum gilt als „unbegrenzt".
- Jede Zuweisung — neu, geändert, gelöscht — erzeugt eine Mitteilung an den
  Azubi und die betroffenen Verantwortlichen (alte und neue), inklusive deren
  aktiver Vertreter.
- Wird eine Zuweisung gelöscht, verschwindet die zugehörige Beurteilung mit ihr.
  Das ist bewusst so: sonst blieben Beurteilungen ohne Bezug und mit toten Links
  in den Mitteilungen zurück.
- Ein Azubi sieht seinen eigenen Durchlauf, ein Ausbilder den seiner betreuten
  Azubis — beide nur lesend.

Der **Abteilungskatalog** (Abteilungen, Kennzeichnung PMM, Verantwortliche) wird
in der Abteilungsverwaltung gepflegt; schreiben darf dort nur `developer`.

---

## 8. Beurteilungen

Nach jeder Station gehört eine Beurteilung dazu.

- **Fälligkeit** entsteht automatisch: Sobald eine Zuweisung abgelaufen ist und
  keine abgeschlossene Beurteilung dazu existiert, legt die Anwendung eine
  Mitteilung „Beurteilung fällig" für die verantwortliche Person an (einmalig,
  nicht wiederholt). Vertreter sehen die Fälligkeiten der Vertretenen mit.
- **Bewertung:** Kriterien in Blöcken, Punkte je Kriterium; Gesamtpunkte und
  Note werden berechnet, dazu ein Freitext und ein Gesprächsdatum. Zwischenstände
  werden als Entwurf gespeichert.
- **Berechtigt** ist, wer für die Zuweisung verantwortlich ist — datumsunabhängig.
  Anders als beim Berichtsheft gibt es hier bewusst keine Frist, denn eine
  Beurteilung entsteht typischerweise erst *nach* Ende der Station.
- **Abschließen** erzeugt eine Mitteilung an den Azubi. Der Azubi sieht die
  Beurteilung erst ab diesem Moment und bestätigt sie per **Kenntnisnahme** —
  das kann nur er selbst.
- **Nachträgliche Korrektur** ist möglich; sie wird mit Person und Zeitpunkt
  vermerkt und benachrichtigt den Azubi erneut.
- Ausgabe als PDF im Putzmeister-Layout.

---

## 9. Weitere Funktionen

**Fahrgelderstattung.** Nur für Azubis. Stammdaten (Name, Personalnummer,
Kostenstelle, Strecke, Tagessatz) liegen pro Azubi und werden im Formular
F6344-1 verwendet. Die Unterschrift kann gezeichnet, getippt oder als Bild
hochgeladen werden. Vorschau als originalgetreue Formularreplik, Ausgabe als
PDF/Excel.

**IHK-Import.** Ein Azubi kann sein bisheriges Berichtsheft als PDF aus dem
IHK-Portal hochladen; die Anwendung liest es im Browser aus und übernimmt die
Wochen inklusive des dort vergebenen Status. Zwei Einschränkungen, die in der
Praxis regelmäßig Fragen erzeugen:

- Das PDF braucht eine **Textebene**. Ein über „Microsoft Print to PDF"
  erzeugtes Dokument ist ein Bild und enthält keinen lesbaren Text — dann findet
  der Import nichts. Es muss der echte Export bzw. „Als PDF speichern" sein.
- Der Import kann **nur ins eigene Heft** schreiben und überschreibt niemals
  eine Woche, die in dieser Anwendung schon geprüft wurde.

Jedes importierte PDF wird serverseitig archiviert (nicht über das Web
erreichbar), damit ein Support-Fall später am Original geprüft werden kann.
Einsehbar nur für `developer`.

**Export.** Der Azubi kann sein Heft als PDF-Ausbildungsnachweis (Deckblatt +
Wochenblätter im IHK-Layout) und als vollständige JSON-Datei exportieren.

**Mitteilungen.** Ereignisse — freigegeben, erst-/endgenehmigt, zurückgegeben,
Beurteilung fällig oder abgeschlossen, Versetzung, Vertretung — erzeugen
Mitteilungen. Die Topbar zeigt die Zahl der ungelesenen, die Mitteilungsseite
den chronologischen Verlauf. Mitteilungen gehen zusätzlich an aktive Vertreter
des Empfängers.

**Fehlerberichte.** Fehler aus Browser und Server werden gesammelt und sind für
`developer` einsehbar; Einträge älter als 90 Tage werden täglich gelöscht.

**Programmatischer Zugriff (MCP).** Für einen externen Tages-Import gibt es eine
Schnittstelle mit persönlichen API-Schlüsseln. Der Schlüssel wird nur einmal bei
der Erstellung angezeigt, gespeichert wird nur sein Hashwert. Es gelten
**dieselben** Rechte wie in der Oberfläche. Schlüssel verwaltet `developer`,
Aufrufe werden protokolliert.

**Themes.** Hell/Dunkel plus zusätzliche Designs; Sonderdesigns sind auf Azubis
bzw. Entwickler beschränkt.

---

## 10. Automatische Abläufe im Hintergrund

| Wann | Was |
| --- | --- |
| beim Start und dann alle 6 h | Entra-Gruppen-Abgleich: Rollen, Berufe, Fotos, Manager-Zuordnungen, Deaktivierungen |
| täglich 02:00 Uhr | Berichtsheft-Backup: pro Azubi eine JSON-Datei in einen Tagesordner auf dem Server; Ordner älter als 30 Tage werden gelöscht |
| beim Start und dann täglich | Aufräumen der Fehlerberichte (älter als 90 Tage) |
| bei Bedarf | Ein Nachtlauf, der ausgefallen ist (Server war aus), wird beim nächsten Start nachgeholt |

Der Backup-Job hat **keine Oberfläche**. Ein Tagesordner enthält zusätzlich eine
Protokolldatei mit Anzahl und Fehlern.

### Wiederherstellung aus einem Backup — der ehrliche Weg

1. Ein Administrator holt die JSON-Datei des betroffenen Azubis vom Server.
2. Er gibt sie **der betroffenen Person**.
3. Diese spielt sie in **ihrem eigenen** Profil über „Wiederherstellen" ein.

Ein Administrator kann das **nicht** stellvertretend tun — der Dialog existiert
nur für Azubis und schreibt immer aufs eigene Konto; der Server weist fremde
Schreibzugriffe ab. Und der Dialog spielt nicht alles zurück: **Kommentare
fehlen**, und Wochen im Status *freigegeben*, *erstgenehmigt* oder *genehmigt*
werden übersprungen (Schutz eingereichter Stände). Die JSON-Datei enthält mehr
als der Dialog zurückschreiben kann — für den Rest bleibt manuelles Übertragen.
Datei-**Anhänge** sind im Backup gar nicht enthalten (sie liegen in der
Datenbank).

---

## 11. Sonderfälle und typische Fragen

**Was passiert, wenn ein Azubi ausgelernt ist?**
Das Feld „Ausbildungsende" ist reine Information; kein Job wertet es aus.
Wirksam wird der Austritt aus der Entra-Gruppe: Beim nächsten Abgleich wird das
Konto **inaktiv**, eine Anmeldung ist nicht mehr möglich, und ab diesem Tag
läuft eine Frist von **365 Tagen**. Danach löscht ein nächtlicher Job das Konto
und alle daran hängenden Daten endgültig — Wochen, Tage, Kommentare,
Beurteilungen, Zuweisungen, Anhänge, Profilfoto und die importierten IHK-PDFs.
Dieselbe Regel gilt für **alle** Rollen, auch für Prüfer und Ausbilder.

Erhalten bleibt allein der **Name** an Belegen in *fremden* Heften: die
Gegenzeichnung einer Woche, ein Ausbilder-Kommentar, das Ansprechpartner-Feld
einer Abteilungszuweisung. Ohne das wäre der Ausbildungsnachweis eines noch
aktiven Azubis entwertet, sobald sein damaliger Prüfer das Unternehmen verlässt.
Dieser Name verschwindet, wenn das Heft selbst gelöscht wird.

30 Tage vor der Löschung erhalten Ausbildungsleitung und Entwickler eine
Mitteilung. Ein Einzelfall lässt sich in der Nutzerverwaltung über „Löschung
zurückhalten bis" aufschieben (laufende Prüfungsanfechtung, Rechtsstreit).

Praktischer Rat unverändert: den PDF-Ausbildungsnachweis **vor** dem Austritt
erzeugen — danach kann der Azubi ihn nicht mehr selbst exportieren, und nach
Ablauf der Frist existieren die Daten nicht mehr.

**Ein Prüfer sagt, er sehe „seinen" Azubi nicht.**
Der Reihe nach prüfen: (1) Ist die Abteilungs-Zuweisung schon aktiv, oder liegt
sie noch in der Zukunft? (2) Ist sie abgelaufen und die 6-Wochen-Nachlauffrist
vorbei? (3) Stimmt die in der Zuweisung hinterlegte **E-Mail-Adresse** exakt mit
der des Prüfers überein? Der befristete Zugriff hängt an der E-Mail, nicht an der
Objekt-ID — das ist die häufigste Ursache. (4) Betrifft es eine Woche außerhalb
des Zuweisungszeitraums? Befristete Prüfer sehen bewusst nur ihr Zeitfenster.

**Ein Ausbilder sieht plötzlich alle Wochen eines Azubis.**
Dann besteht eine dauerhafte Zuordnung — meist automatisch entstanden, weil er in
Entra als Vorgesetzter des Azubis hinterlegt ist. Das ist beabsichtigt. Soll es
weg, in der Nutzerverwaltung abwählen; die Abwahl ist dauerhaft und wird vom
Abgleich nicht überschrieben.

**Ein Azubi kann seine eingereichte Woche nicht mehr korrigieren.**
Korrekt so. Entweder er zieht die Freigabe selbst zurück (nur solange noch
niemand reagiert hat), oder ein Prüfer/Ausbilder gibt die Woche mit Begründung
zurück.

**Rolle in der Datenbank geändert — muss sich der Nutzer neu anmelden?**
Nein. Rechte werden bei jedem Aufruf frisch gelesen. Ein Neuladen der Seite
genügt.

**Wer darf Nutzer, Abteilungen und API-Schlüssel verwalten?**
Ausschließlich die Rolle `developer`. Die Rolle `admin` darf trotz ihres Namens
weder Nutzer noch Abteilungen noch API-Schlüssel pflegen. Wer administrieren
soll, braucht `developer`.

**Kann jemand das Berichtsheft eines fremden Azubis manipulieren?**
Wochen korrigieren und abnehmen ist strikt an dauerhafte Zuordnung oder aktive
Zuweisung gebunden — auch für Admin und Developer. Lesen dürfen beide alles,
Beurteilungen auch schreiben.

**Warum bekommt ein Vertreter Mitteilungen, die ihn nicht betreffen?**
Weil Mitteilungen an eine betreuende Person auch an deren aktive Vertreter gehen.
Das ist gewollt; ohne das läuft die Vertretung ins Leere. Beenden kann die
Vertretung nur, wer sie eingerichtet hat.

**Ein neuer Azubi wurde in Entra angelegt, ist aber nicht in der App.**
Der Abgleich läuft alle 6 Stunden. Er kann sich aber sofort anmelden — sein Konto
wird dabei angelegt. Ohne Gruppenmitgliedschaft fehlen dann allerdings Beruf,
Berichtsrhythmus und Manager-Zuordnung, bis der Abgleich gelaufen ist.

---

## 12. Bekannte Grenzen

Damit niemand etwas erwartet, was die Anwendung nicht leistet:

- **Keine Vollständigkeitsprüfung.** Es gibt keine Auswertung „diese Wochen
  fehlen komplett" über den ganzen Ausbildungszeitraum und keine Erinnerung an
  nie eingereichte Wochen.
- **Kein Archiv.** Gelöscht heißt gelöscht — es gibt keine Langzeitkopie. Der
  nächtliche JSON-Snapshot in `backend/data/backups/` verfällt nach 30 Tagen und
  ist kein Archiv. Eine Datenschutz-Informationsseite fehlt in der Anwendung
  weiterhin.
- **Kein automatischer Abschluss zum Ausbildungsende** (siehe oben).
- **Keine E-Mail-Benachrichtigungen** — Mitteilungen erscheinen nur in der
  Anwendung.
- **Backup ohne Oberfläche und ohne Anhänge**, Wiederherstellung nur durch die
  betroffene Person selbst.
- **Befristete Zuweisungen hängen an E-Mail-Adressen.** Ändert sich eine
  E-Mail-Adresse, brechen die daran hängenden Zugriffe.

---

## 13. Betrieb in Kurzform

| Baustein | Was läuft |
| --- | --- |
| IIS | nimmt HTTPS an, leitet alles an die Node-Anwendung auf `localhost:3000` weiter, teilt ihr die HTTPS-Terminierung per Header mit |
| Node-Anwendung | als Windows-Dienst (`nssm`); liefert Oberfläche und Schnittstelle aus |
| SQL Server | alle Daten (Nutzer, Wochen, Tage, Kommentare, Anhänge, Zuweisungen, Beurteilungen, Mitteilungen, Fotos, API-Schlüssel, Fehler) |
| Entra ID | Anmeldung (SAML) und Rollenvergabe (Gruppen, per Graph abgefragt) |
| Dateien auf dem Server | Sitzungen, Nacht-Backups, archivierte IHK-PDFs — alle außerhalb des Webzugriffs |

Konfiguration (Datenbank, Sitzungsschlüssel, Graph-Zugangsdaten, Gruppen-IDs,
SAML-Einstellungen) liegt in einer `.env`-Datei auf dem Server. Sie wird **nicht**
mit dem Code verteilt; nach einer Änderung muss der Dienst neu gestartet werden.
Ohne gesetzten Sitzungsschlüssel startet die Anwendung in Produktion absichtlich
nicht. Schema-Änderungen erfolgen über nummerierte, wiederholbar ausführbare
SQL-Skripte.

---

## Verwandte Dokumente

- `README.md` — technischer Überblick, Schnittstellenliste, Tech-Stack
- `docs/2026-07-27-ihk-compliance-audit.md` — Prüfung gegen die IHK-Anforderungen
  (Quelle der in Abschnitt 12 genannten Lücken)
- `docs/dashboard-durchlauf-layout.md` — die zwei Layout-Varianten der
  Durchlauf-Übersicht
