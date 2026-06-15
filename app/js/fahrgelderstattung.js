/* ===================================================================
   FAHRGELDERSTATTUNG.JS
   Eigenständige Seite unter der Sidebar-Kategorie „Sonstiges".
   Aktuell nur Platzhalter – der echte Funktionsumfang (Quellcode aus
   der bestehenden Fahrgeld-App) wird hier eingesetzt.
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-fahrgelderstattung', [{ label: 'Fahrgelderstattung', href: 'fahrgelderstattung.html' }]);
  if (!user) return;

  document.body.dataset.page = 'fahrgelderstattung';

  document.getElementById('mainContent').innerHTML = `
    <div class="page-header">
      <div class="page-header__left">
        <h1 class="page-title">Fahrgelderstattung</h1>
        <p class="page-subtitle">Monatliche Fahrgelderstattung erstellen.</p>
      </div>
    </div>

    <div class="card" style="padding:var(--sp-12);text-align:center">
      <div style="width:48px;height:48px;margin:0 auto var(--sp-4);color:var(--pm-grey-400)">
        ${Icon('document')}
      </div>
      <h2 style="font-family:var(--font-heading);font-size:var(--text-xl);font-weight:700;color:var(--pm-grey-900);margin:0 0 var(--sp-2)">
        Platzhalter
      </h2>
      <p style="font-size:var(--text-base);color:var(--pm-grey-600);margin:0 auto;max-width:46ch;line-height:var(--lh-relaxed)">
        Die Fahrgelderstattung wird hier umgesetzt. Der genaue Funktionsumfang folgt mit dem Quellcode.
      </p>
    </div>
  `;
});
