/* ===================================================================
   LOGIN.JS
   =================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  // Bereits eingeloggt?
  const existing = await DB.fetchCurrentUser();
  if (existing) {
    window.location.href = 'dashboard.html';
    return;
  }

  const form = document.getElementById('loginForm');
  const errorBox = document.getElementById('loginError');
  const errorText = document.getElementById('loginErrorText');
  const loginBtn = document.getElementById('loginBtn');
  const pwToggle = document.getElementById('passwordToggle');
  const pwInput = document.getElementById('password');

  pwToggle?.addEventListener('click', () => {
    const isPassword = pwInput.type === 'password';
    pwInput.type = isPassword ? 'text' : 'password';
    pwToggle.innerHTML = isPassword
      ? `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
      : `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
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
        window.location.href = 'dashboard.html';
      } else {
        showError('Ungültige E-Mail-Adresse.');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Anmelden';
      }
    } catch {
      showError('Anmeldung fehlgeschlagen. Bitte prüfe deine E-Mail-Adresse.');
      loginBtn.disabled = false;
      loginBtn.textContent = 'Anmelden';
    }
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
});
