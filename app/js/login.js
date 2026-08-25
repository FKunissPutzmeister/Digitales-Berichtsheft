/* ===================================================================
   LOGIN.JS
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  // Start-/Landeseite je Rolle: DH-Studenten direkt in den Abteilungsdurchlauf,
  // alle anderen aufs Dashboard.
  const landingFor = (user) => (user && user.role === 'dhstudent') ? 'abteilungsdurchlauf.html' : 'dashboard.html';

  const form = document.getElementById('loginForm');
  const errorBox = document.getElementById('loginError');
  const errorText = document.getElementById('loginErrorText');
  const loginBtn = document.getElementById('loginBtn');

  // Microsoft-SSO: aktiv, sobald das Backend SAML konfiguriert meldet.
  // demoLogin sagt, ob der passwortlose Demo-Login existiert (nur außerhalb
  // der Produktion) — wenn nicht, wird der komplette Demo-Block ausgeblendet.
  const msBtn = document.getElementById('msLoginBtn');
  const ssoHint = document.getElementById('ssoHint');
  const base = (window.location.port === '5500')
    ? `http://${window.location.hostname}:3000/api` : '/api';
  let samlReady = false;
  let demoLogin = false;
  let wartung = false;
  let wartungUrl = null;
  try {
    const r = await fetch(`${base}/auth/saml/status`, { credentials: 'include' });
    if (!r.ok) console.warn('[saml] status-Endpoint antwortete nicht OK:', r.status);
    if (r.ok) {
      const status = await r.json();
      samlReady = status.configured === true;
      demoLogin = status.demoLogin !== false;
      wartung = status.wartung === true;
      wartungUrl = typeof status.wartungUrl === 'string' ? status.wartungUrl : null;
    }
  } catch { samlReady = false; }

  // Wartungsmodus (WARTUNG=1 im Backend): Meldung einblenden und ALLE
  // Anmeldewege entfernen. Der Server weist ohnehin jeden Versuch mit 503
  // ab — ein sichtbarer Knopf würde nur einen Fehler produzieren, statt zu
  // erklären, was los ist. Der Demo-Block bleibt unangetastet unsichtbar.
  if (wartung) {
    const box = document.getElementById('loginWartung');
    if (box) box.style.display = 'flex';
    // "Bitte anmelden" wäre jetzt eine Aufforderung, die ins Leere läuft.
    const sub = document.querySelector('.login-card__sub');
    if (sub) sub.textContent = 'Zurzeit nicht verfügbar';

    // Dauerhafter Umzug: andere Aussage als bei einem Wartungsfenster — hier
    // soll der Nutzer nicht später wiederkommen, sondern jetzt woanders hin.
    if (wartungUrl) {
      const titel = document.getElementById('loginWartungTitel');
      const text = document.getElementById('loginWartungText');
      const link = document.getElementById('loginWartungLink');
      if (sub) sub.textContent = 'Umgezogen';
      if (titel) titel.textContent = 'Das Berichtsheft ist umgezogen';
      if (text) {
        text.textContent = 'Diese Adresse wird nicht mehr verwendet. Alle Daten sind '
          + 'vollständig übernommen — bitte melde dich ab sofort hier an und aktualisiere '
          + 'dein Lesezeichen.';
      }
      if (link) {
        link.href = wartungUrl;                 // Backend lässt nur http(s) durch
        link.textContent = wartungUrl.replace(/^https?:\/\//i, '');
        link.hidden = false;
      }
    }
    for (const el of [msBtn, ssoHint, document.querySelector('.login-divider'),
                      document.getElementById('loginForm'),
                      document.getElementById('loginDemo')]) {
      if (el) el.style.display = 'none';
    }
    return;   // nichts weiter verdrahten: es gibt hier nichts mehr zu bedienen
  }

  // Bereits eingeloggt? Bewusst ERST hier, nach dem Statuscheck: /auth/me
  // antwortet im Wartungsmodus mit 503, und api.js legt daraufhin seine
  // Vollbild-Meldung über die Seite. Auf der Login-Seite wäre die doppelt
  // gemoppelt — der Kasten oben erklärt es bereits und passt ins Layout.
  const existing = await DB.fetchCurrentUser();
  if (existing) {
    window.location.href = landingFor(existing);
    return;
  }

  msBtn?.addEventListener('click', () => {
    if (samlReady) {
      window.location.href = `${base}/auth/saml/login`;
    } else {
      ssoHint?.classList.add('visible');
    }
  });

  // Demo-Bereich ist im HTML per style="display:none" versteckt (kein Aufblitzen
  // in Produktion) und wird nur bei vorhandenem Demo-Login freigeschaltet.
  if (demoLogin) {
    for (const el of [document.querySelector('.login-divider'),
                      document.getElementById('loginForm'),
                      document.getElementById('loginDemo')]) {
      if (el) el.style.display = '';
    }
  }

  // Demo-Zugänge ein-/ausklappen
  const demoWrap = document.getElementById('loginDemo');
  const demoToggle = document.getElementById('demoToggle');
  const demoList = document.getElementById('demoList');
  const demoLabel = demoToggle?.querySelector('.login-demo__toggle-label');
  demoToggle?.addEventListener('click', () => {
    const open = demoWrap.classList.toggle('open');
    demoToggle.setAttribute('aria-expanded', String(open));
    demoList.hidden = !open;
    if (demoLabel) demoLabel.textContent = open ? 'Demo-Zugänge ausblenden' : 'Demo-Zugänge anzeigen';
  });

  function showError(msg) {
    errorText.textContent = msg;
    errorBox.classList.add('visible');
  }
  function hideError() {
    errorBox.classList.remove('visible');
  }

  async function doLogin(email) {
    loginBtn.disabled = true;
    loginBtn.innerHTML = '<span class="spinner"></span> Anmelden…';
    try {
      const user = await DB.login(email);
      if (user) {
        window.location.href = landingFor(user);
        return;
      }
      showError('Ungültige E-Mail-Adresse.');
    } catch (e) {
      // Server-Meldung durchreichen (z.B. "Nur Demo-Konten können sich ohne SSO anmelden.")
      showError(e.message || 'Anmeldung fehlgeschlagen. Bitte prüfe deine E-Mail-Adresse.');
    }
    loginBtn.disabled = false;
    loginBtn.textContent = 'Als Demo-Konto anmelden';
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();
    const email = document.getElementById('email').value;
    if (!email) {
      showError('Bitte E-Mail eingeben.');
      return;
    }
    await doLogin(email);
  });

  // Demo-Logins
  document.querySelectorAll('.demo-login-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      hideError();
      const email = btn.dataset.email;
      document.getElementById('email').value = email;
      await doLogin(email);
    });
  });

  // Fehlgeschlagener SAML-Handshake leitet mit ?error=sso zurück.
  if (new URLSearchParams(window.location.search).get('error') === 'sso') {
    showError('Microsoft-Anmeldung fehlgeschlagen. Bitte erneut versuchen oder Demo-Zugang nutzen.');
  }
});
