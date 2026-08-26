/* ===================================================================
   JOKE-PEEK.JS – Kleiner, abgesprochener Streich: schaut alle paar
   Minuten kurz aus einer Bildschirmecke und verschwindet wieder.
   NUR lokaler Dev-Server, NUR der Demo-Account florian.kern.demo,
   rein optisch (pointer-events: none → blockiert keine Klicks).
   Wird ausschließlich von api.js aus _maybeJokePeek() nachgeladen.

   Entfernen (rückstandslos):
     1. Diese Datei löschen.
     2. In api.js: Funktion _maybeJokePeek() + ihre Aufrufstellen
        (fetchCurrentUser, login) entfernen.
     3. app/img/_joke/ löschen.
   Kein Server-State, keine DB-Änderung, kein Rest nach dem Löschen.
   =================================================================== */
(function () {
  if (window.__jokePeekActive) return;
  window.__jokePeekActive = true;

  const INTERVALL_MS = 3 * 60 * 1000; // alle 3 Minuten
  const SICHTBAR_MS = 3000;           // 3s zu sehen
  const VERSTECKT = 'translate(140%, 45%) rotate(10deg)';
  const SICHTBAR = 'translate(8%, 8%) rotate(-4deg)';

  const el = document.createElement('img');
  el.src = 'img/_joke/joke.png';
  el.alt = '';
  el.style.cssText =
    'position:fixed;bottom:-10px;right:-20px;width:150px;height:auto;' +
    'z-index:999999;pointer-events:none;opacity:0;' +
    `transform:${VERSTECKT};transition:transform 1s ease,opacity 1s ease;`;
  document.body.appendChild(el);

  function peek() {
    el.style.opacity = '1';
    el.style.transform = SICHTBAR;
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = VERSTECKT;
    }, SICHTBAR_MS);
  }

  setTimeout(peek, 15000);           // erster Peek kurz nach dem Laden
  setInterval(peek, INTERVALL_MS);
})();
