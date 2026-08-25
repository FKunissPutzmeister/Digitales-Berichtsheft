'use strict';
/* ===================================================================
   WARTUNGSMODUS
   Schaltet die Anwendung für Umzüge/Wartungsfenster hart ab: API und
   MCP antworten mit 503, das Frontend zeigt eine Meldung statt eines
   Anmeldeknopfs.

   Eingeschaltet über WARTUNG=1 in backend/.env (Neustart nötig, wie bei
   allen anderen Werten dort).

   ⚠ Warum auch LESENDE Zugriffe gesperrt werden: Eine reine Schreib-
   sperre lässt die Oberfläche weiterlaufen und Fehler nur beim Speichern
   auftauchen — der Nutzer merkt es erst, nachdem er etwas eingetippt hat.
   Alles zu sperren ist ehrlicher; api.js fängt den 503 zentral ab.

   ⚠ Warum der Vergleich in Kleinschreibung läuft: Express routet per
   Default case-INsensitiv. Ein Guard, der nur auf "/api" prüft, wäre
   über "/API/wochen" umgehbar — die Anfrage landet trotzdem bei der
   Route. Gleiche Falle wie beim static-guard.
   =================================================================== */

// Gesperrte Präfixe. Ein Treffer verlangt entweder exakte Gleichheit oder
// einen Schrägstrich dahinter — sonst würde "/apidoku" mitgesperrt.
const GESPERRTE_PRAEFIXE = ['/api', '/mcp'];

// Ausnahmen, die auch im Wartungsmodus erreichbar bleiben müssen:
//  · saml/status — sonst erfährt die Login-Seite nichts von der Wartung
//    und zeigt statt der Meldung einen unspezifischen Fehler.
//  · logout — wer noch eine Sitzung hat, soll sauber hinauskommen.
// Der SSO-Einstieg (saml/login) steht bewusst NICHT hier: Über ein
// Lesezeichen käme man sonst an der gesperrten Login-Seite vorbei herein.
const AUSNAHMEN = ['/api/auth/saml/status', '/api/auth/logout'];

const MELDUNG = 'Das Digitale Berichtsheft wird gerade auf einen neuen Server '
  + 'übertragen und ist währenddessen nicht verfügbar. Alle bisher eingetragenen '
  + 'Daten werden vollständig übernommen. Bitte versuche es später erneut.';

/* env → ist der Modus an? Bewusst nur exakt "1": ein Tippfehler wie
   WARTUNG=false soll die Anwendung nicht versehentlich abschalten. */
function istWartungAktiv(env = process.env) {
  return String(env.WARTUNG == null ? '' : env.WARTUNG).trim() === '1';
}

/* true = diese Anfrage im Wartungsmodus abweisen. */
function istGesperrterPfad(pfad) {
  const p = String(pfad == null ? '' : pfad).toLowerCase();
  if (AUSNAHMEN.some((a) => p === a || p === a + '/')) return false;
  return GESPERRTE_PRAEFIXE.some((praefix) => p === praefix || p.startsWith(praefix + '/'));
}

/* Express-Middleware-Fabrik. `aktiv` wird beim Start ausgewertet und
   übergeben, damit der Zustand pro Prozess feststeht (und der Test ihn
   ohne Umweg über process.env setzen kann). */
function wartungsGuard({ aktiv } = {}) {
  return function guard(req, res, next) {
    if (!aktiv || !istGesperrterPfad(req.path)) return next();
    // Retry-After hält Zwischenspeicher und Suchindizes davon ab, den
    // 503 als dauerhaften Zustand zu behandeln (3600 s = eine Stunde).
    res.set('Retry-After', '3600');
    res.status(503).json({ error: MELDUNG, wartung: true });
  };
}

module.exports = { istWartungAktiv, istGesperrterPfad, wartungsGuard, MELDUNG };
