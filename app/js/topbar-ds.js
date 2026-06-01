/* ===================================================================
   TOPBAR-DS.JS – (stillgelegt)
   -------------------------------------------------------------------
   Der zweistufige Putzmeister-DS-Header wurde komplett entfernt — die
   Navigation, das Profil und die Benutzer-Anzeige leben jetzt
   ausschließlich in der linken Sidebar.

   Der frühere Mouse-Tracking-Shine (wireMouseShine) gehörte zum
   Liquid-Glass-Button-System (.lg-btn). Diese Buttons wurden überall
   durch die normalen .btn-Varianten ersetzt, daher ist der Shine
   entfallen.

   Verbleibt nur noch window.setBreadcrumbs() — wird von sidebar.js →
   buildTopbar() weiterhin aufgerufen. Ohne diesen No-Op würde sidebar.js
   den Aufruf bis zu 10× neu probieren. Hier wird nichts gerendert.
   =================================================================== */
(function () {
  'use strict';

  /* No-Op: sidebar.js → buildTopbar() ruft das auf, um Breadcrumbs zu
     setzen. Da es keinen Header mehr gibt, verschluckt die Funktion die
     Daten still. */
  window.setBreadcrumbs = function () { /* no-op */ };
})();
