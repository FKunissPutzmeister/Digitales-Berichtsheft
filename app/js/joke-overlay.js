/* ===================================================================
   JOKE-OVERLAY.JS – Kleiner, abgesprochener Kollegen-Streich.
   NUR lokaler Dev-Server, NUR ein Account, rein optisch (pointer-events:
   none → blockiert keine Klicks). Wird ausschließlich von api.js aus
   _maybeStreich() nachgeladen, wenn Bedingungen passen.

   Entfernen (rückstandslos):
     1. Diese Datei löschen.
     2. In api.js: Funktion _maybeStreich() + ihre zwei Aufrufstellen
        (fetchCurrentUser, login) entfernen.
     3. app/img/_joke/ löschen.
   Kein Server-State, keine DB-Änderung, kein Rest nach dem Löschen.
   =================================================================== */
(function () {
  if (document.getElementById('joke-overlay-container')) return;

  const container = document.createElement('div');
  container.id = 'joke-overlay-container';
  container.style.cssText =
    'position:fixed;inset:0;z-index:999999;pointer-events:none;overflow:hidden;';

  const COUNT = 22;
  for (let i = 0; i < COUNT; i++) {
    const img = document.createElement('img');
    img.src = 'img/_joke/joke.png';
    img.alt = '';
    const size = 110 + Math.random() * 170;
    const top = Math.random() * 100;
    const left = Math.random() * 100;
    const rot = Math.random() * 50 - 25;
    img.style.cssText =
      `position:absolute;top:${top}%;left:${left}%;width:${size}px;height:auto;` +
      `transform:translate(-50%,-50%) rotate(${rot}deg);opacity:.93;` +
      'filter:drop-shadow(0 4px 10px rgba(0,0,0,.35));';
    container.appendChild(img);
  }
  document.body.appendChild(container);
})();
