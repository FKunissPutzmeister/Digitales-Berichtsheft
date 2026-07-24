# Diagnose-Prompt: Warum wurden seit 2 Tagen keine neuen autofix-Branches erstellt?

Reiner Diagnose-Lauf, NOCH KEIN FIX. Ziel: an jeder Stelle der Kette
(Task Scheduler → Skript → API/DB → Claude Code → Git push) Evidenz sammeln,
um die tatsächliche Bruchstelle zu finden, bevor irgendetwas geändert wird.

---

```
Ich brauche eine reine Bestandsaufnahme im Ordner Digitales-Berichtsheft-
automation (und den zugehörigen Task-Scheduler-Task) – NOCH KEINE
Änderungen, nur Befunde sammeln und mir Punkt für Punkt berichten:

1. TASK SCHEDULER: Prüfe im Task Scheduler (bzw. per PowerShell
   Get-ScheduledTaskInfo) den Task für auto_fix_run.py. Wann war der letzte
   tatsächliche Ausführungszeitpunkt (LastRunTime) und was war das
   LastTaskResult (Exit-Code)? Ist der Task überhaupt noch aktiviert (Enabled)?
   Prüfe auch im Windows Event Log (Task Scheduler-Operational-Log) auf
   Fehlermeldungen zu diesem Task in den letzten 2 Tagen.

2. SKRIPT-LOG: Öffne die Logdatei von auto_fix_run.py. Gab es in den
   letzten 2 Tagen überhaupt Log-Einträge? Wenn ja: was genau steht dort
   (wie viele Fehlerberichte abgerufen, Exceptions/Tracebacks, HTTP-Status-
   Codes bei der API-Abfrage)? Wenn NEIN (keine neuen Einträge trotz
   aktivem Task): das deutet auf einen Absturz VOR dem ersten Log-Write hin.

3. TATSÄCHLICHE FEHLERLAGE: Frag unabhängig vom Skript direkt über die
   API/DB ab: Gab es in den letzten 2 Tagen überhaupt neue Fehlerberichte
   mit Schweregrad='hoch' und Erledigt=0, die nicht bereits in
   processed_ids.json als bearbeitet markiert sind? Nenne mir die Anzahl
   und ggf. IDs. Das ist der wichtigste Punkt: wenn es schlicht keine
   neuen kritischen Fehler gab, ist "keine neuen Branches" KEIN Bug,
   sondern korrektes Verhalten.

4. CLAUDE-CODE-AUTH: Prüfe, ob die Anmeldung von Claude Code auf diesem
   Server (Abo-Login) noch gültig ist – z.B. durch einen einfachen
   Test-Aufruf `claude -p "sag nur OK"` und Beobachtung, ob eine normale
   Antwort kommt oder ein Auth-/Session-Fehler.

5. GIT-ZUSTAND: Prüfe im Automation-Ordner `git status` – ist der
   Arbeitsbaum sauber? Gibt es einen hängengebliebenen Merge/Rebase,
   nicht committete Änderungen, oder einen Zustand, der weitere Commits/
   Branches verhindern würde?

Fasse mir am Ende klar zusammen, an welcher der 5 Stellen es hakt (oder ob
alles unauffällig ist und schlicht keine neuen Fehler auftraten). Bitte noch
NICHTS reparieren oder verändern – nur berichten.
```
