/* ===================================================================
   TOPBAR-DS.JS – Putzmeister Design-System-Topbar
   -------------------------------------------------------------------
   Injiziert die DS-Topbar (32 px, dunkelgrau, mit gelbem Bandakzent
   darunter) und verkabelt den Theme-Toggle mit dem globalen PMTheme.

   Wird NACH theme.js geladen (theme.js liegt im <head>).
   =================================================================== */
(function () {
  'use strict';

  // Login-Seite bekommt KEINE Topbar — dort soll der Login-Screen
  // ungestört wirken.
  function isLoginPage() {
    return document.body && document.body.classList.contains('login-page');
  }

  function buildTopbar() {
    var topbar = document.createElement('div');
    topbar.className = 'sc-topbar';
    topbar.setAttribute('role', 'banner');
    topbar.innerHTML =
      '<div class="sc-topbar__inner">' +
        '<div class="sc-topbar__left">' +
          '<span class="sc-topbar__brand">' +
            '<span class="sc-topbar__brand-prefix">Member of </span>' +
            '<strong>SANY</strong> Group' +
          '</span>' +
        '</div>' +
        '<div class="sc-topbar__right">' +
          '<div class="sc-topbar__theme" role="group" aria-label="Theme">' +
            '<button class="sc-topbar__theme-btn" data-theme="light" type="button" aria-label="Hell-Modus">' +
              '<svg viewBox="0 0 24 24" aria-hidden="true">' +
                '<circle cx="12" cy="12" r="4" fill="currentColor"/>' +
                '<path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>' +
              '</svg>' +
            '</button>' +
            '<button class="sc-topbar__theme-btn" data-theme="dark" type="button" aria-label="Dunkel-Modus">' +
              '<svg viewBox="0 0 24 24" aria-hidden="true">' +
                '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" fill="currentColor"/>' +
              '</svg>' +
            '</button>' +
          '</div>' +
          '<span class="sc-topbar__divider"></span>' +
          '<div class="sc-topbar__profile">' +
            '<button class="sc-topbar__profile-btn" type="button"' +
              ' id="scTopbarProfileBtn" aria-haspopup="menu" aria-expanded="false"' +
              ' aria-label="Profil-Menü öffnen">' +
              '<svg viewBox="0 0 24 24" aria-hidden="true">' +
                '<path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-4 0-8 2-8 6v2h16v-2c0-4-4-6-8-6z" fill="currentColor"/>' +
              '</svg>' +
            '</button>' +
            '<div class="sc-topbar__profile-menu" role="menu" aria-labelledby="scTopbarProfileBtn">' +
              '<div class="sc-topbar__profile-header">' +
                '<div class="sc-topbar__profile-avatar" id="scTopbarProfileAvatar">?</div>' +
                '<div class="sc-topbar__profile-info">' +
                  '<span class="sc-topbar__profile-name" id="scTopbarProfileName">…</span>' +
                  '<span class="sc-topbar__profile-role" id="scTopbarProfileRole">…</span>' +
                '</div>' +
              '</div>' +
              '<a href="profil.html" class="sc-topbar__profile-item" role="menuitem">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
                  '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>' +
                  '<circle cx="12" cy="7" r="4"/>' +
                '</svg>' +
                'Mein Profil' +
              '</a>' +
              '<button type="button" class="sc-topbar__profile-item sc-topbar__profile-item--danger"' +
                ' id="scTopbarLogoutBtn" role="menuitem">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
                  '<path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>' +
                '</svg>' +
                'Abmelden' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    return topbar;
  }

  /* ── Profil-Dropdown verkabeln ──────────────────────────────────
     Öffnen/Schließen per Klick, Schließen per ESC + Klick außerhalb.
     "Mein Profil" navigiert direkt; "Abmelden" ruft DB.logout()
     und leitet auf index.html weiter — identisch zur bestehenden
     Logout-Logik in app.js. */
  function wireProfileMenu(topbar) {
    var wrap = topbar.querySelector('.sc-topbar__profile');
    var btn  = topbar.querySelector('#scTopbarProfileBtn');
    var menu = topbar.querySelector('.sc-topbar__profile-menu');
    if (!wrap || !btn || !menu) return;

    function setOpen(open) {
      wrap.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    }
    function close() { setOpen(false); }
    function toggle(e) {
      e.stopPropagation();
      setOpen(!wrap.classList.contains('is-open'));
    }
    btn.addEventListener('click', toggle);
    menu.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    var logoutBtn = topbar.querySelector('#scTopbarLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        var db = getDB();
        if (db && typeof db.logout === 'function') db.logout();
        window.location.href = 'index.html';
      });
    }
  }

  /* ── DB-Lookup ─────────────────────────────────────────────────
     data.js deklariert DB via `const DB = {...}`. Top-level `const`-
     Deklarationen landen NICHT auf `window`, sind aber im globalen
     lexikalischen Scope erreichbar. Deshalb mit typeof prüfen. */
  function getDB() {
    try {
      // eslint-disable-next-line no-undef
      if (typeof DB !== 'undefined' && DB) return DB;
    } catch (e) {}
    return (typeof window !== 'undefined' && window.DB) ? window.DB : null;
  }

  /* ── Profil-Header dynamisch befüllen ──────────────────────────
     Datenmodell aus data.js:
       { id, name, email, role: 'azubi'|'ausbilder'|'admin', initials, ... }
     Wir nutzen das explizit gepflegte `initials`-Feld; fällt nur dann
     auf eine Berechnung aus dem Namen zurück, wenn es fehlt. */
  function fillProfileHeader(topbar) {
    var db = getDB();
    if (!db || typeof db.getCurrentUser !== 'function') return false;
    var user;
    try { user = db.getCurrentUser(); } catch (e) { return false; }
    if (!user) return false;

    var avatar = topbar.querySelector('#scTopbarProfileAvatar');
    var nameEl = topbar.querySelector('#scTopbarProfileName');
    var roleEl = topbar.querySelector('#scTopbarProfileRole');

    var fullName = user.name || '–';
    var initials = (user.initials || '').toString().trim();
    if (!initials) {
      initials = fullName.split(/\s+/)
        .filter(Boolean)
        .map(function (t) { return t.charAt(0); })
        .slice(0, 2)
        .join('')
        .toUpperCase() || '?';
    }
    if (avatar) avatar.textContent = initials;
    if (nameEl) nameEl.textContent = fullName;

    var roleMap = { azubi: 'Auszubildende/r', ausbilder: 'Ausbilder/in', admin: 'Administrator/in' };
    if (roleEl) roleEl.textContent = roleMap[user.role] || user.role || '';
    return true;
  }

  /* Versucht wiederholt zu befüllen, bis ein User vorhanden ist oder
     ein Timeout erreicht wird. Schützt vor Race-Conditions, wenn
     andere Skripte den User erst später per JS setzen. */
  function fillProfileHeaderWithRetry(topbar) {
    var attempts = 0;
    function tick() {
      if (fillProfileHeader(topbar)) return;
      if (++attempts < 10) setTimeout(tick, 100);
    }
    tick();
  }

  function syncThemeButtons(topbar) {
    if (!window.PMTheme) return;
    var current = window.PMTheme.get();
    topbar.querySelectorAll('.sc-topbar__theme-btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-theme') === current);
    });
  }

  function wireThemeToggle(topbar) {
    topbar.querySelectorAll('.sc-topbar__theme-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var t = btn.getAttribute('data-theme');
        if (window.PMTheme && (t === 'light' || t === 'dark')) {
          window.PMTheme.set(t);
        }
      });
    });
    window.addEventListener('pm-theme-change', function () { syncThemeButtons(topbar); });
    syncThemeButtons(topbar);
  }

  function removeOldThemeToggle() {
    /* Falls app.js den alten Toggle-Button bereits eingesetzt hat,
       entfernen wir ihn hier. Sicherheitsmaßnahme — das CSS blendet
       ihn ohnehin schon aus. */
    var old = document.getElementById('themeToggleBtn');
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  /* ── Mouse-Tracking-Shine für .lg-btn ─────────────────────────────
     Delegierter Listener auf document.body. Aktualisiert die
     --mouse-x / --mouse-y CSS-Variablen auf dem nächst-liegenden
     .lg-btn-Vorfahren — damit der radial-gradient::after dem Cursor
     folgt. Funktioniert auch für dynamisch nachgeladene Buttons. */
  function wireMouseShine() {
    document.body.addEventListener('mousemove', function (e) {
      var t = e.target;
      var lg = t.closest && t.closest('.lg-btn');
      if (!lg) return;
      var r = lg.getBoundingClientRect();
      lg.style.setProperty('--mouse-x', ((e.clientX - r.left) / r.width * 100) + '%');
      lg.style.setProperty('--mouse-y', ((e.clientY - r.top)  / r.height * 100) + '%');
    });
  }

  function init() {
    /* Mouse-Shine immer aktivieren — auch auf Login-Seite,
       damit der Anmelden-Button im Dark-Mode funkelt. */
    wireMouseShine();
    if (isLoginPage()) return;
    document.body.classList.add('has-ds-topbar');
    var topbar = buildTopbar();
    document.body.insertBefore(topbar, document.body.firstChild);
    wireThemeToggle(topbar);
    wireProfileMenu(topbar);
    fillProfileHeaderWithRetry(topbar);
    /* Verzögert prüfen, da app.js den alten Button asynchron einsetzen kann. */
    removeOldThemeToggle();
    setTimeout(removeOldThemeToggle, 0);
    setTimeout(removeOldThemeToggle, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
