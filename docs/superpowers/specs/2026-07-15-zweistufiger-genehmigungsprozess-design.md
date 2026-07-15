# Zweistufiger Genehmigungsprozess (Prüfer-Erstgenehmigung + Ausbilder-Endabnahme)

**Datum:** 2026-07-15
**Status:** Design freigegeben

## Ziel

Der Genehmigungsprozess für Wochenberichte wird zweistufig. Ein temporär für
einen Zeitraum zugewiesener **Prüfer** (Zuweisung, `VerantwEmail`) darf für die
Berichte seines Zeitraums nur eine **Erstgenehmigung** erteilen. Der dauerhaft
zugewiesene **Ausbilder** (`AusbilderAzubis`, per OID) ist immer die letzte
Instanz und muss die **Endabnahme** durchführen — erst diese setzt den Status
auf `genehmigt`.

Gibt der Ausbilder einen Bericht zurück, muss nach der Überarbeitung des Azubis
**nur noch der Ausbilder** genehmigen (die Prüfer-Stufe wird übersprungen).

## Ausgangslage (heutiges Verhalten)

- `dbo.Wochen.Status` kennt vier Werte: `offen`, `freigegeben`, `genehmigt`,
  `abgelehnt` (CHECK-Constraint `CK_Wochen_Status`,
  `db/migrations/003_status_freigegeben.sql`).
- Ein einziger Endpunkt `PATCH /api/wochen/:id/status`
  ([backend/routes/wochen.js:166-205](../../../backend/routes/wochen.js#L166-L205))
  behandelt alle Übergänge. Zwei flache Arrays trennen die erlaubten Zielstatus:
  `AZUBI_STATUS = ['offen','freigegeben']`,
  `KORREKTOR_STATUS = ['genehmigt','abgelehnt']`.
- `darfWocheKorrigieren`
  ([backend/services/zugriff.js:54-65](../../../backend/services/zugriff.js#L54-L65))
  gewährt **Prüfer und Ausbilder identische** Korrekturrechte. Einziger
  Unterschied: der Prüfer ist zeitlich/wochenbezogen begrenzt (`istAktiv` +
  `wocheFaelltInZuweisung`), der Ausbilder unbegrenzt (`istDauerAusbilder`).
  Es gibt **keine** rollenbasierte Unterscheidung, wer was setzen darf.
- Frontend: `canApprove`
  ([app/js/wochenansicht.js:406-414](../../../app/js/wochenansicht.js#L406-L414))
  steuert Genehmigen- und Zurückgeben-Button gemeinsam; sichtbar für jeden
  „Ausbilder" (inkl. Prüfer, `role === 'pruefer'`) bei Status `freigegeben`.

## Getroffene Entscheidungen

1. **Ausbilder-Bypass:** Der Ausbilder darf einen erst `freigegeben`en Bericht
   (noch keine Erstgenehmigung) jederzeit sofort endgültig genehmigen.
2. **Prüfer-Rechte:** Der Prüfer darf in der ersten Stufe erstgenehmigen **und**
   zurückgeben.
3. **Prüfer-Rückgabe:** Gibt der Prüfer zurück, prüft nach der Überarbeitung
   erneut der Prüfer (die erste Stufe wiederholt sich), danach der Ausbilder.
4. **Statusname:** Der neue Zwischenstatus heißt für den Azubi „Erstgenehmigt".
5. **Kein Prüfer im Zeitraum:** Ist für den Zeitraum eines Berichts kein Prüfer
   zugewiesen, bleibt es beim heutigen einstufigen Ablauf (Ausbilder genehmigt
   direkt). Kein Sonderfall im Code nötig — `istPeriodenPruefer` liefert dann
   schlicht `false`.

## Datenmodell

Neuer Zwischenstatus `erstgenehmigt` ergänzt die bestehenden vier:
`offen`, `freigegeben`, `erstgenehmigt`, `genehmigt`, `abgelehnt`.

Neues Routing-Flag auf `dbo.Wochen`:

```
EndabnahmeDirekt BIT NOT NULL DEFAULT 0
```

Bedeutung: `1` = „Bericht ist auf der Endabnahme-Schiene, die Prüfer-Stufe ist
übersprungen — nur der Ausbilder darf noch handeln." Das Flag löst die
Mehrdeutigkeit von `freigegeben` auf: `freigegeben` allein kann sowohl „wartet
auf Prüfer" (Flag 0) als auch „wartet auf Ausbilder, Prüfer übersprungen"
(Flag 1) bedeuten.

`KorrigiertVon` / `KorrigiertAm`
(`db/migrations/009_korrektur_attribution.sql`) bleiben unverändert und werden
weiter bei jeder Supervisor-Aktion gestempelt.

## Zustandsautomat

| Von | Aktion | Akteur | Nach | EndabnahmeDirekt danach |
|-----|--------|--------|------|-------------------------|
| offen | einreichen | Azubi | freigegeben | 0 |
| freigegeben (Flag 0) | erstgenehmigen | **Prüfer** | erstgenehmigt | 0 |
| freigegeben (Flag 0) | zurückgeben | **Prüfer** | abgelehnt | 0 |
| freigegeben | genehmigen (Bypass) | **Ausbilder** | genehmigt | 0 |
| freigegeben | zurückgeben | **Ausbilder** | abgelehnt | **1** |
| erstgenehmigt | endgenehmigen | **Ausbilder** | genehmigt | 0 |
| erstgenehmigt | zurückgeben | **Ausbilder** | abgelehnt | **1** |
| freigegeben (Flag 1) | endgenehmigen | **Ausbilder** | genehmigt | 0 |
| freigegeben (Flag 1) | zurückgeben | **Ausbilder** | abgelehnt | 1 |
| abgelehnt | überarbeiten & neu einreichen | Azubi | freigegeben | *unverändert* |
| freigegeben | zurückziehen | Azubi | offen | *unverändert* |

**Flag-Lebenszyklus (Kernlogik):**
- Frisches Einreichen (`offen → freigegeben`): Flag = 0.
- Prüfer-Rückgabe (`freigegeben → abgelehnt`): Flag = 0 → Neufassung geht zurück
  an den Prüfer.
- Ausbilder-Rückgabe (`freigegeben`/`erstgenehmigt → abgelehnt`): Flag = 1 →
  Neufassung geht direkt an den Ausbilder.
- Azubi-Neueinreichen (`abgelehnt → freigegeben`): Flag bleibt unverändert und
  trägt so die Schiene.
- Endgültige Genehmigung: terminal; Flag wird auf 0 zurückgesetzt (kosmetisch).

**Bei Flag 1 ist der Prüfer gesperrt:** `freigegeben` mit Flag 1 erlaubt keine
Prüfer-Aktion mehr, damit sich der Prüfer nicht wieder einklinkt.

## Backend-Änderungen

### Migration `db/migrations/NNN_erstgenehmigung.sql`
Idempotent (Projektkonvention), enthält:
- `ALTER TABLE dbo.Wochen ADD EndabnahmeDirekt BIT NOT NULL CONSTRAINT
  DF_Wochen_EndabnahmeDirekt DEFAULT 0` (nur wenn Spalte fehlt).
- `CK_Wochen_Status` droppen und mit `'erstgenehmigt'` in der Werteliste neu
  anlegen.

### `backend/services/zugriff.js`
- Neue Funktion `istPeriodenPruefer(user, woche, kontext)` — extrahiert den
  Zuweisungs-Zweig aus dem heutigen `darfWocheKorrigieren` (Email-Match +
  `istAktiv` + `wocheFaelltInZuweisung`).
- `istDauerAusbilder` bleibt.
- `darfWocheKorrigieren` bleibt für die reine Lese-/Zugriffsprüfung erhalten
  (= „ist irgendein Betreuer dieser Woche").

### `backend/routes/wochen.js` — Status-Handler
- Die beiden flachen Arrays durch die Übergangstabelle oben ersetzen.
- Akteursrolle bestimmen: `istEigenes` (Azubi), `istPeriodenPruefer`,
  `istDauerAusbilder`.
- Übergang gegen `(fromStatus, toStatus, akteurRolle, flag)` validieren; bei
  unzulässiger Kombination `403`.
- `EndabnahmeDirekt` gemäß Lebenszyklus setzen/zurücksetzen.
- `KorrigiertVon`/`KorrigiertAm` weiter stempeln.

### Week-Payload-Annotation
Jede Woche, die der Betrachter über die Wochen-Endpunkte erhält, wird annotiert
mit:
- `viewerRolle`: `'azubi' | 'pruefer' | 'ausbilder'`
- `erlaubteAktionen`: Liste der für diesen Betrachter+Status+Flag zulässigen
  Aktionen (z.B. `['erstgenehmigen','zurueckgeben']`).

So rendert das Frontend nur, was der Server ohnehin autoritativ berechnet; die
Berechtigungslogik bleibt serverseitig (PATCH erzwingt sie erneut). Ist ein
Betrachter für dieselbe Woche sowohl Prüfer als auch Ausbilder (Randfall), haben
die Ausbilder-Rechte Vorrang.

## Frontend-Änderungen (`app/js/wochenansicht.js`)

- Heutiges `canApprove` aufteilen in:
  - `canErstgenehmigen` — Betrachter ist Prüfer, Status `freigegeben`, Flag 0.
  - `canEndgenehmigen` — Betrachter ist Ausbilder, Status `freigegeben` oder
    `erstgenehmigt`.
  Beide werden aus der Payload-Annotation (`erlaubteAktionen`) abgeleitet, nicht
  im Frontend neu hergeleitet.
- `canReject` (Zurückgeben) analog: sichtbar für Prüfer (Stufe 1, Flag 0) und
  für Ausbilder.
- Buttons:
  - Prüfer: **Erstgenehmigen** + **Zurückgeben**.
  - Ausbilder: **Endgenehmigen** (bzw. **Genehmigen** beim Bypass) +
    **Zurückgeben**.
- `isReadonly` um `erstgenehmigt` erweitern (für den Azubi schreibgeschützt wie
  `freigegeben`/`genehmigt`).
- Neues Azubi-Banner für `erstgenehmigt`: „Erstgenehmigt durch Prüfer — wartet
  auf Endabnahme durch Ausbilder."
- Benachrichtigung an den Ausbilder bei Erstgenehmigung („Bericht wartet auf
  Endabnahme").

### `app/js/api.js`
- Ggf. Status-Konstante/Label `erstgenehmigt` ergänzen, falls dort eine
  Statusliste gepflegt wird.

## Testfälle / Verifikation

Manuell (lokal über `localhost:3000`, Demo-Konten) durchzuspielen:
1. Azubi reicht ein → Prüfer erstgenehmigt → Ausbilder endgenehmigt →
   `genehmigt`.
2. Azubi reicht ein → Prüfer gibt zurück → Azubi überarbeitet → landet **wieder
   beim Prüfer**.
3. Azubi reicht ein → Prüfer erstgenehmigt → Ausbilder gibt zurück → Azubi
   überarbeitet → landet **direkt beim Ausbilder** (Prüfer übersprungen).
4. Azubi reicht ein (Prüfer zugewiesen) → Ausbilder genehmigt sofort (Bypass) →
   `genehmigt`.
5. Bericht ohne Prüfer-Zeitraum → Ausbilder genehmigt direkt (einstufig,
   unverändert).
6. Prüfer versucht, einen `freigegeben`-Bericht mit Flag 1 zu bearbeiten → `403`
   / Buttons nicht sichtbar.

## Nicht im Scope

- Änderungen am Zuweisungs-/AusbilderAzubis-Datenmodell selbst.
- Mehr als zwei Genehmigungsstufen.
- Historisierung/Audit über `KorrigiertVon` hinaus.
