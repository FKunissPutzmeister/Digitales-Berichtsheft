# Update-Prompt: Ein einziger wiederverwendeter autofix-Branch

Folge-Anpassung zu [2026-07-20-autofix-setup-prompt.md](2026-07-20-autofix-setup-prompt.md).
Grund: das ursprüngliche Skript legte pro Fehlerbericht-ID einen eigenen Branch
an ("autofix/<id>-<kurzbeschreibung>"), was zu Branch-Wildwuchs führte –
verstärkt dadurch, dass leicht unterschiedliche Stacks/Nachrichten für
denselben wiederkehrenden Fehler mehrere Fehlerbericht-IDs (unterschiedliche
Fingerprints) erzeugen. Ab jetzt: EIN fest benannter Branch `autofix`, der bei
jedem Lauf auf den aktuellen Stand von Digitales-Berichtsheft rebased und dann
per Force-Push aktualisiert wird.

Trade-off: mehrere noch ungeprüfte Fixes landen gebündelt auf demselben
Branch, bis review't/gemergt wird – weniger Isolation pro Fix, dafür kein
Branch-Wildwuchs mehr.

---

```
Bitte pass die bestehende Fehler-Fix-Automatisierung im Ordner
Digitales-Berichtsheft-automation wie folgt an:

1. Ändere auto_fix_run.py: statt für jeden neuen offenen "hoch"-Fehlerbericht
   einen NEUEN Branch "autofix/<id>-<kurzbeschreibung>" anzulegen, wird ab
   sofort IMMER derselbe, fest benannte Branch "autofix" verwendet:
   a) Zu Beginn jedes Laufs: `git fetch origin`, dann lokal
      `git checkout -B autofix origin/autofix` falls der Branch remote
      existiert, sonst `git checkout -B autofix origin/Digitales-Berichtsheft`.
   b) `git rebase origin/Digitales-Berichtsheft` – falls der Branch bereits
      vollständig in Digitales-Berichtsheft gemergt wurde, ist das ein No-Op
      (der Branch entspricht dann einfach wieder dem aktuellen Hauptstand).
   c) Für jeden neuen offenen "hoch"-Fehlerbericht (weiterhin über
      processed_ids.json dedupliziert) ruft `claude -p` wie bisher auf, aber
      OHNE dass ein eigener Branch angelegt wird – der Fix wird direkt als
      neuer Commit auf dem bereits ausgecheckten "autofix"-Branch abgelegt.
   d) Am Ende des Laufs: `git push --force-with-lease origin autofix`
      (Force nötig wegen des Rebase in Schritt b – weiterhin NIEMALS
      main/Digitales-Berichtsheft direkt pushen oder Force-Push dorthin).

2. Passe die Einträge in "offene-fixes.md" an: da der Branch-Name jetzt
   immer "autofix" ist, trage pro Fix stattdessen Commit-Hash,
   Fehlerbericht-ID, Kurzbeschreibung und Zeitstempel ein (neueste oben).

3. Passe .claude/settings.json entsprechend an: erlaube weiterhin nur
   `git push origin <branch>`, aber jetzt inklusive `--force-with-lease`
   NUR für den Branch "autofix" – Force-Push auf main/Digitales-Berichtsheft
   bleibt weiterhin verboten.

4. Aktualisiere die README.md im Automation-Ordner entsprechend: ein
   einziger wiederverwendeter Branch "autofix" statt einem Branch pro Fund;
   lokale Review weiterhin per `git fetch` + `git checkout autofix`; nach
   Merge in Digitales-Berichtsheft baut sich der Branch beim nächsten Lauf
   automatisch wieder frisch vom aktuellen Hauptstand auf.

Bitte am bestehenden Sicherheitskonzept nichts ändern: kein direkter
Zugriff auf den produktiven Ordner, kein Push/Merge nach
Digitales-Berichtsheft, kein Datenbankzugriff durch Claude Code selbst.
```
