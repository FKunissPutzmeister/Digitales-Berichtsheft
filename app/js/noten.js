/* ===================================================================
   NOTEN.JS — Shell „Noten & Zeugnisse" für die Sidebar-Ansicht
   (Azubis und Ausbilder/Ausbildungsleitung).

   Die eigentliche Darstellung steckt in app/js/noten-ui.js, weil
   DH-Studenten dieselbe Ansicht in einer eigenen Shell ohne Sidebar
   brauchen (app/js/dh-noten.js).

   Re-entrant halten: der SPA-Router (app/js/router.js) führt diese Datei
   beim zweiten Besuch erneut in new Function() aus — kein Zustand
   außerhalb dieses Handlers.
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-noten', [{ label: 'Noten & Zeugnisse', href: 'noten.html' }]);
  if (!user) return;

  // Wer weder eigene Noten führt noch Azubis betreut, hat hier nichts zu
  // sehen. Reine Prüfer bekommen nur über befristete Zuweisungen Zugriff –
  // und die geben bei Noten bewusst KEINEN (backend/services/noten.js).
  const alsBetreuer = user.istAusbilder && (!user.istReinerPruefer || user.istAusbildungsleiter);
  if (!user.istAzubi && !alsBetreuer && user.role !== 'developer' && user.role !== 'admin') {
    window.location.href = 'dashboard.html';
    return;
  }

  document.body.dataset.page = 'noten';
  await NotenUI.start({ user, host: document.getElementById('mainContent'), mitAzubiWahl: true });
});
