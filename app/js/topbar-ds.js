/* ===================================================================
   TOPBAR-DS.JS – (stillgelegt)
   -------------------------------------------------------------------
   Der zweistufige Putzmeister-DS-Header wurde komplett entfernt — die
   Navigation, das Profil und die Benutzer-Anzeige leben jetzt
   ausschließlich in der linken Sidebar. Dieses Skript hält nur noch
   zwei Dinge am Leben, damit die anderen Seiten/Skripte nicht
   abreißen:

     1. wireMouseShine() — Mouse-Tracking-Glow für .lg-btn (Liquid-
        Glass-Buttons), die auf mehreren Seiten verwendet werden.
     2. window.setBreadcrumbs() — wird von sidebar.js → buildTopbar()
        weiterhin aufgerufen. Ohne diesen No-Op würde sidebar.js den
        Aufruf bis zu 10× neu probieren. Hier wird nichts gerendert.

   Der frühere Body-Klassen-Marker (has-ds-topbar / has-ds-header)
   wird nicht mehr gesetzt — dadurch greifen auch keine padding-top-
   Overrides mehr, und die Sidebar belegt von oben bis unten den
   gesamten Viewport.
   =================================================================== */
(function () {
  'use strict';

  /* Mouse-Tracking-Shine für .lg-btn — wird von Wochenansicht,
     Azubi-Planer u. a. verwendet. */
  function wireMouseShine() {
    document.body.addEventListener('mousemove', function (e) {
      var t = e.target;
      var lg = t.closest && t.closest('.lg-btn');
      if (!lg) return;
      var r = lg.getBoundingClientRect();
      lg.style.setProperty('--mouse-x', ((e.clientX - r.left) / r.width  * 100) + '%');
      lg.style.setProperty('--mouse-y', ((e.clientY - r.top)  / r.height * 100) + '%');
    });
  }

  /* No-Op: sidebar.js → buildTopbar() ruft das auf, um Breadcrumbs zu
     setzen. Da es keinen Header mehr gibt, verschluckt die Funktion die
     Daten still. */
  window.setBreadcrumbs = function () { /* no-op */ };

  function init() {
    wireMouseShine();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
