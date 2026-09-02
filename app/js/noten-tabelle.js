/* ===================================================================
   NOTEN-TABELLE.JS — Shell des Notenspiegels für die Sidebar-Ansicht
   (Azubis, Ausbilder, Ausbildungsleitung).

   Unterseite von noten.html, erreichbar über den Knopf „Notenspiegel"
   dort — bewusst OHNE eigenen Sidebar-Eintrag, wie beurteilung.html.
   Deshalb bleibt 'nav-noten' der markierte Reiter, und der Router muss
   nichts wissen: er fängt nur Klicks innerhalb von #sidebar ab
   (app/js/router.js), ein Link mitten in der Seite ist ein normaler
   Seitenaufruf.

   Die Darstellung steckt in app/js/noten-tabelle-ui.js, weil
   DH-Studenten dieselbe Tabelle in einer Shell ohne Sidebar brauchen
   (app/js/dh-noten-tabelle.js).
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-noten', [
    { label: 'Noten & Zeugnisse', href: 'noten.html' },
    { label: 'Notenspiegel', href: 'noten-tabelle.html' },
  ]);
  if (!user) return;

  // Dasselbe Tor wie auf der Pflegeseite (app/js/noten.js): wer weder
  // eigene Noten führt noch Azubis dauerhaft betreut, hat hier nichts zu
  // sehen. Reine Prüfer kommen nur über befristete Zuweisungen an Azubis —
  // und die geben bei Noten bewusst keinen Zugriff (backend/services/noten.js).
  const alsBetreuer = user.istAusbilder && (!user.istReinerPruefer || user.istAusbildungsleiter);
  if (!user.istAzubi && !alsBetreuer && user.role !== 'developer' && user.role !== 'admin') {
    window.location.href = 'dashboard.html';
    return;
  }

  document.body.dataset.page = 'noten-tabelle';
  await NotenTabelleUI.start({
    user,
    host: document.getElementById('mainContent'),
    mitAzubiWahl: true,
    zurueckHref: 'noten.html',
  });
});
