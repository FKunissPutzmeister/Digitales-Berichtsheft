/* ===================================================================
   DH-NOTEN-TABELLE.JS — Notenspiegel für DH-Studenten (Rolle: dhstudent)
   -------------------------------------------------------------------
   Eigene Topbar-Shell ohne Sidebar (wie dh-noten.js), deshalb KEIN
   initPage und kein SPA-Router. Die Tabelle selbst kommt aus
   app/js/noten-tabelle-ui.js — dieselbe Ansicht wie bei den Azubis, nur
   ohne Azubi-Auswahl und mit den DH-Spalten (Credits, Status), die sich
   aus der Rolle des Eigentümers ergeben.

   Hinweis für Tests: istDhStudent ist für 'developer' bewusst false
   (backend/services/users.js) — diese Seite lässt sich nicht durch einen
   Rollenwechsel prüfen, dafür seed-dhstudent-demo.sql + Dev-Login.
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await DB.fetchCurrentUser();
  if (!user) { window.location.href = 'index.html'; return; }
  if (!user.istDhStudent) {
    window.location.replace(typeof landingPageFor === 'function' ? landingPageFor(user) : 'dashboard.html');
    return;
  }

  applyAvatar(document.getElementById('dhAvatar'), user);
  document.getElementById('dhThemeToggle')?.addEventListener('click', () => {
    if (!window.PMTheme) return;
    window.PMTheme.set(window.PMTheme.get() === 'dark' ? 'light' : 'dark');
  });

  await NotenTabelleUI.start({
    user,
    host: document.getElementById('mainContent'),
    mitAzubiWahl: false, // ein DH-Student sieht ausschließlich seine eigenen Noten
    zurueckHref: 'dh-noten.html',
  });
});
