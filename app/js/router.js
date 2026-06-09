/* ===================================================================
   ROUTER.JS – Client-Side SPA Navigation
   Fängt Sidebar-Links ab und tauscht nur #mainContent aus.
   Sidebar, Topbar und Shell-Elemente bleiben unverändert im DOM.

   Ablauf pro Navigation:
     1. Zielseite per fetch laden (parallel zur Exit-Animation)
     2. #mainContent-Inhalt tauschen
     3. Fehlende Stylesheets und externe Scripts (z. B. Quill-CDN) laden
     4a. Erstes Laden: Script als <script src> Tag einfügen (Global-Scope)
         → const/var/let-Deklarierungen werden global zugänglich
     4b. Folgenavigationen: Script per new Function() in isoliertem Scope
         → verhindert const-Redeclaration-Fehler beim erneuten Ausführen
     5. DOMContentLoaded-Patch: Handler werden sofort als Microtask
        aufgerufen, da der DOM beim SPA-Wechsel bereits geladen ist
     6. initPage-Patch: überspringt Sidebar-Rebuild; aktualisiert nur
        aktiven Nav-Link und Breadcrumbs
   =================================================================== */

(function () {
  'use strict';

  /* Scripts, die auf jeder Seite geladen sind und beim SPA-Wechsel
     NICHT nochmal ausgeführt werden sollen. */
  const SHARED = new Set([
    'api.js', 'icons.js', 'topbar-ds.js', 'app.js',
    'sidebar.js', 'router.js', 'theme.js',
  ]);

  /* Lokale Scripts, die bereits als <script>-Tag in den DOM injiziert
     wurden. Beim zweiten Besuch derselben Seite wird new Function()
     genutzt, da die Globals schon gesetzt sind. */
  const _loadedLocalScripts = new Set();

  let _currentPage = location.pathname.split('/').pop() || 'dashboard.html';
  let _busy = false;

  /* ── Öffentliche Init-Methode (wird von buildSidebar aufgerufen) ── */
  function initRouter(sidebar) {
    history.replaceState({ spa: true, page: _currentPage }, '', location.href);

    sidebar.addEventListener('click', function (e) {
      const a = e.target.closest('a[href]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.includes('://') || href.startsWith('mailto')) return;
      e.preventDefault();
      if (_busy || href === _currentPage) return;
      go(href, true);
    });

    window.addEventListener('popstate', function (e) {
      if (!e.state?.spa) return;
      const page = e.state.page;
      if (page && page !== _currentPage) go(page, false);
    });
  }

  /* ── Kernnavigation ── */
  async function go(href, pushState) {
    _busy = true;

    const mainContent = document.getElementById('mainContent');
    if (!mainContent) { fallback(href); return; }

    if (typeof Modal !== 'undefined') Modal.closeAll();

    /* Neue Seite im Hintergrund laden — parallel zur Exit-Animation */
    const fetchPromise = fetch(href + '?_spa=1')
      .then(r => r.ok ? r.text() : null)
      .catch(() => null);

    /* Exit-Animation */
    const wrapper = document.querySelector('.main-wrapper');
    const noMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (wrapper && !noMotion) {
      wrapper.style.transition = 'opacity 110ms ease, transform 110ms ease';
      wrapper.style.opacity    = '0';
      wrapper.style.transform  = 'translateY(-5px)';
      await sleep(120);
    }

    const html = await fetchPromise;
    if (!html) { fallback(href); return; }

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const newMain = doc.getElementById('mainContent');
    if (!newMain) { fallback(href); return; }

    /* Fehlende Stylesheets aus der neuen Seite nachladen */
    const loadedSheets = new Set(
      Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href)
    );
    for (const link of doc.querySelectorAll('link[rel="stylesheet"]')) {
      const abs = new URL(link.getAttribute('href'), location.href).href;
      if (!loadedSheets.has(abs)) {
        const el = document.createElement('link');
        el.rel  = 'stylesheet';
        el.href = abs;
        document.head.appendChild(el);
      }
    }

    /* Scripts der neuen Seite ermitteln (Reihenfolge beibehalten) */
    const pageScripts = Array.from(doc.querySelectorAll('body script[src]'))
      .filter(s => {
        const name = (s.getAttribute('src') || '').split('/').pop().split('?')[0];
        return !SHARED.has(name);
      })
      .map(s => s.getAttribute('src'));

    /* Content tauschen */
    delete document.body.dataset.page;
    mainContent.innerHTML = newMain.innerHTML;
    document.title = doc.querySelector('title')?.textContent || document.title;
    window.scrollTo(0, 0);

    if (pushState) history.pushState({ spa: true, page: href }, '', href);
    _currentPage = href;

    /* Enter-Animation */
    if (wrapper && !noMotion) {
      wrapper.style.transition = '';
      wrapper.style.opacity    = '';
      wrapper.style.transform  = '';
      wrapper.style.animation  = 'none';
      wrapper.getBoundingClientRect(); // reflow erzwingen
      wrapper.style.animation  = 'vt-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both';
      wrapper.addEventListener('animationend', () => {
        wrapper.style.animation = '';
      }, { once: true });
    } else if (wrapper) {
      wrapper.style.opacity   = '';
      wrapper.style.transform = '';
    }

    /* Patches einmalig für diese Navigation setzen:
       – DOMContentLoaded: bereits gefeuert → Handler sofort als Microtask
       – initPage: überspringt Sidebar-Rebuild, gibt gecachten User zurück */
    const origAddEL = document.addEventListener.bind(document);
    document.addEventListener = function (type, fn, opts) {
      if (type === 'DOMContentLoaded') {
        Promise.resolve().then(() => fn());
        return;
      }
      return origAddEL(type, fn, opts);
    };

    const origInitPage = window.initPage;
    window.initPage = async function (navId, breadcrumbs) {
      window.initPage = origInitPage;
      document.querySelectorAll('#sidebar .sidebar__link')
        .forEach(l => l.classList.remove('active'));
      document.getElementById(navId)?.classList.add('active');
      if (typeof window.setBreadcrumbs === 'function') {
        window.setBreadcrumbs(breadcrumbs || []);
      }
      return DB.getCurrentUser() || await DB.fetchCurrentUser();
    };

    /* Seiten-Scripts in Reihenfolge ausführen */
    for (const src of pageScripts) {
      await runScript(src);
    }

    /* addEventListener nach einem Tick zurücksetzen —
       DOMContentLoaded-Microtasks laufen zuerst durch. */
    setTimeout(() => { document.addEventListener = origAddEL; }, 0);

    _busy = false;
  }

  /* ── Script-Ausführung ── */
  async function runScript(src) {
    /* Externe Scripts (CDN): als <script>-Tag einfügen, wenn noch nicht geladen */
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
      const absUrl = new URL(src, location.href).href;
      const already = Array.from(document.querySelectorAll('script[src]'))
        .some(s => s.src === absUrl);
      if (!already) {
        await new Promise((resolve, reject) => {
          const s    = document.createElement('script');
          s.src      = absUrl;
          s.onload   = resolve;
          s.onerror  = reject;
          document.head.appendChild(s);
        });
      }
      return;
    }

    const cleanSrc = src.split('?')[0];
    const absUrl   = new URL(cleanSrc, location.href).href;

    if (!_loadedLocalScripts.has(absUrl)) {
      /* Erstes Laden: als <script src> Tag einfügen.
         Läuft in Global-Scope → const/let/var werden global zugänglich.
         Notwendig, damit Inter-Script-Abhängigkeiten funktionieren
         (z. B. zeitnachweis-upload.js → profil.js). */
      _loadedLocalScripts.add(absUrl);
      await new Promise((resolve) => {
        const s    = document.createElement('script');
        s.src      = cleanSrc + '?_spa=1';
        s.onload   = resolve;
        s.onerror  = () => { console.error('[Router] Load-Fehler:', cleanSrc); resolve(); };
        document.head.appendChild(s);
      });
    } else {
      /* Folgenavigationen: als Text fetchen und in isoliertem Scope
         (new Function) ausführen. Globals aus dem ersten Laden sind
         bereits gesetzt; new Function verhindert SyntaxError durch
         erneute const-Deklarierungen. */
      let text;
      try {
        const res = await fetch(cleanSrc + '?_spa=' + Date.now());
        text = await res.text();
      } catch (e) {
        console.error('[Router] Script-Fetch fehlgeschlagen:', src, e);
        return;
      }
      try {
        // eslint-disable-next-line no-new-func
        new Function(text)();
      } catch (e) {
        console.error('[Router] Ausführungsfehler:', src, e);
      }
    }
  }

  function fallback(href) {
    try { sessionStorage.setItem('navTransition', '1'); } catch (_) {}
    window.location.href = href;
    _busy = false;
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  window.initRouter = initRouter;
})();
