# Setup-Prompt: Automatisiertes Fehler-Fixing (Claude Code Cronjob)

Dieser Prompt wird direkt in eine Claude-Code-Session **auf dem Server**
eingefügt, um die isolierte Automatisierung einzurichten. Kein PR-Flow –
Fixes landen als Branch auf origin, Review erfolgt lokal per `git checkout`.

---

```
Ich möchte auf diesem Server eine isolierte Automatisierung für automatisches
Fehler-Fixing einrichten, getrennt vom produktiv laufenden Checkout des
Digitalen Berichtshefts (der von nssm/IIS ausgeliefert wird).

WICHTIG – bevor du irgendetwas anlegst:
1. Finde zuerst heraus, welcher Ordner/Pfad aktuell produktiv von nssm/IIS
   ausgeliefert wird (z.B. über die nssm-Service-Konfiguration oder die
   IIS-Site-Bindings). Nenne mir diesen Pfad und lass mich bestätigen, dass
   du den richtigen gefunden hast, BEVOR du fortfährst.

Ziel-Setup, sobald der produktive Pfad bestätigt ist:

1. Lege einen NEUEN, eigenständigen Ordner als Geschwisterverzeichnis an,
   klar und eindeutig anders benannt als der Produktiv-Ordner – Suffix
   "-automation" (z.B. wenn Produktiv "Digitales-Berichtsheft" heißt, dann
   "Digitales-Berichtsheft-automation"). Klone das Repository
   FKunissPutzmeister/Digitales-Berichtsheft, Branch Digitales-Berichtsheft,
   frisch in diesen neuen Ordner.

2. Erstelle in diesem neuen Ordner ein Python-Skript (auto_fix_run.py), das:
   a) Über die interne API die offenen Fehlerberichte abruft
      (Quelle im Backend: backend/services/fehlerberichte.js, listErrors mit
      erledigt=false, schweregrad='hoch' – finde den passenden HTTP-Endpunkt
      dafür im Router/backend/server.js). WICHTIG: Dieser Lesezugriff auf die
      Datenbank/API ist ausschließlich Aufgabe des Python-Skripts und
      beschränkt sich strikt auf die Felder der Fehlerberichte (Quelle,
      Nachricht, Stack, Kontext, Zeitstempel) – keine anderen Tabellen,
      keine Nutzer-/Azubi-/Wochen-Daten. Claude Code selbst bekommt später
      NUR diese extrahierten Fehlermeldungs-Felder als Text im Prompt
      übergeben und erhält an keiner Stelle eigene Datenbank-Zugangsdaten,
      Connection-Strings oder DB-Client-Tools.
   b) Einen lokalen Zustand (z.B. JSON-Datei processed_ids.json im
      Automation-Ordner) führt, damit bereits bearbeitete Fehlerberichte
      nicht doppelt verarbeitet werden.
   c) Für jeden neuen offenen "hoch"-Fehlerbericht einen Prompt zusammenbaut
      (Nachricht, Stack, Kontext, Quelle) und `claude -p "<prompt>"` NICHT
      interaktiv im neuen Klon-Verzeichnis aufruft, mit der Anweisung, den
      Fehler zu analysieren, einen Fix im Code umzusetzen, einen neuen Branch
      "autofix/<fehlerbericht-id>-<kurzbeschreibung>" anzulegen und zu
      committen.
   d) Den Branch NUR zu origin pusht (git push origin autofix/...) – KEIN
      Pull Request, KEIN Merge, KEIN Push auf main/Digitales-Berichtsheft.
   e) Nach jedem Push einen Eintrag in eine zentrale Status-Datei
      "offene-fixes.md" im Automation-Ordner schreibt (oben anfügen, neueste
      zuerst): Branch-Name, Fehlerbericht-ID, Kurzbeschreibung des Fixes,
      Zeitstempel. Diese Datei ist die einzige "Benachrichtigung" – kein
      E-Mail-/Chat-Versand, da keine solche Anbindung existiert.
   f) Nach jedem Durchlauf zusätzlich ein technisches Log (Zeitstempel,
      geprüfte IDs, erstellte Branches, Fehler beim Ausführen) in eine
      Logdatei schreibt.

3. Richte im neuen Ordner eine Claude-Code-Projektkonfiguration
   (.claude/settings.json) ein, die im Automation-Kontext NUR erlaubt:
   Dateien lesen/editieren innerhalb dieses Ordners, `git add`, `git commit`,
   `git checkout -b <branch>`, `git push origin <branch>` (nur Feature-
   Branches, niemals main/Digitales-Berichtsheft, kein --force).
   Verbiete/verweigere: jeglichen Zugriff auf den produktiven Ordner-Pfad,
   Force-Push, Push auf main/Digitales-Berichtsheft, `nssm`/Service-Befehle,
   destruktive Kommandos (rm -rf, Löschen außerhalb des eigenen Ordners).
   Verbiete außerdem JEDEN direkten Datenbankzugriff für Claude Code selbst
   (kein Lesen von .env/DB-Connection-Strings, keine DB-Client-Aufrufe,
   kein mssql/sqlcmd-Tooling) – die Datenbank wird ausschließlich vom
   Python-Skript in Schritt 2a gelesen, nie von Claude Code direkt.

4. Richte einen Windows-Task-Scheduler-Task ein, der auto_fix_run.py
   Montag bis Freitag genau einmal täglich ausführt (Uhrzeit schlage mir
   vor, z.B. 07:00 Uhr, "Ausführen unabhängig davon ob Benutzer angemeldet
   ist"). Frag mich vor dem Anlegen des Tasks nochmal zur Bestätigung.

5. Schreib mir zum Schluss eine README.md in den Automation-Ordner, die
   erklärt:
   - Wie die Pipeline funktioniert (Ablauf a–f aus Punkt 2).
   - Dass es KEINEN Pull-Request-Flow gibt – Review erfolgt lokal:
     `git fetch origin` + `git checkout autofix/<name>` auf dem eigenen
     Arbeitsrechner, App lokal starten (node server.js, Port 3000) und den
     Fix im Browser visuell prüfen – wie beim bestehenden lokalen
     Test-Workflow.
   - Wo man nachschaut, ob es etwas zu prüfen gibt: "offene-fixes.md" im
     Automation-Ordner (per Remote-Zugriff/Dateifreigabe einsehbar, oder
     Inhalt regelmäßig kurz per RDP/Explorer draufschauen).
   - Dass nach lokaler Prüfung der Branch ganz normal per
     `git merge autofix/<name>` (oder Fast-Forward) in
     Digitales-Berichtsheft übernommen und gepusht wird – dieser Schritt
     bleibt bewusst manuell.
   - Dass Deployment in den produktiven Ordner weiterhin der bestehende
     manuelle Prozess ist (git pull + Service-Neustart im nssm-Checkout).
   - Dass Claude Code selbst KEINEN direkten Datenbankzugriff hat: die
     Fehlerberichte werden ausschließlich vom Python-Skript aus der DB/API
     gelesen und nur als reiner Text (Fehlermeldung, Stack, Kontext) an
     Claude Code übergeben. Claude Code bekommt zu keinem Zeitpunkt
     DB-Zugangsdaten, Connection-Strings oder DB-Client-Tools.
   - Wie man die Automatisierung deaktiviert (Task-Scheduler-Task
     deaktivieren).

Bitte NICHTS überspringen oder eigenmächtig vom Sicherheitskonzept
abweichen – insbesondere: niemals in den produktiven Ordner schreiben,
niemals auf main pushen, niemals den nssm-Service anfassen, niemals
automatisch einen Pull Request oder Merge erzeugen.
```

---

## Was sich gegenüber der ersten Fassung geändert hat

- Kein PR-Flow mehr (kein `gh`/GitHub-API-Aufruf, kein Token nötig).
- Branch wird nur nach `origin` gepusht – Review passiert lokal per
  `git checkout` + Browser, nicht durch Diff-Lesen auf GitHub.
- Neue Status-Datei `offene-fixes.md` als einfacher, lesbarer Hinweis
  darauf, was zur Prüfung bereitsteht.
- Merge in `Digitales-Berichtsheft` bleibt manuell, ebenso das Deployment
  in den produktiven Ordner (git pull + Service-Neustart) – unverändert
  zum bisherigen Prozess.
- Datenbankzugriff ist ausschließlich Sache des Python-Skripts und strikt
  auf die Fehlerberichte-Felder begrenzt; Claude Code selbst liest nie
  direkt aus der Datenbank und bekommt keine Zugangsdaten.
