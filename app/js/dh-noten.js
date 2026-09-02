/* ===================================================================
   DH-NOTEN.JS – „Noten & Zeugnisse" für DH-Studenten (Rolle: dhstudent)
   -------------------------------------------------------------------
   Eigene Topbar-Shell ohne Sidebar (wie dh-profil.js / abteilungsdurchlauf.js),
   deshalb KEIN initPage/initLayout und kein SPA-Router. Die gesamte
   Darstellung kommt aus app/js/noten-ui.js — dieselbe Ansicht wie bei den
   Azubis, nur ohne Azubi-Auswahl.

   Hinweis für Tests: istDhStudent ist für 'developer' bewusst false
   (backend/services/users.js), diese Seite lässt sich also nicht durch
   einen Rollenwechsel prüfen — dafür seed-dhstudent-demo.sql + Dev-Login.
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

  await NotenUI.start({
    user,
    host: document.getElementById('mainContent'),
    mitAzubiWahl: false, // ein DH-Student sieht ausschließlich seine eigenen Noten
    spiegelHref: 'dh-noten-tabelle.html', // Notenspiegel in der DH-Shell
  });
});
