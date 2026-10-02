/* E-Mails – Versandprotokoll (developer-only): wer hat welche Mail wann bekommen.
   Daten: GET /api/dev/mails (dbo.MailProtokoll, Migration 049). Nutzt die Listen-Styles
   aus fehlerberichte.css. */
document.addEventListener('DOMContentLoaded', async () => {
  const user = await initPage('nav-mails', [{ label: 'E-Mails', href: 'mails.html' }]);
  if (!user) return;
  if (user.role !== 'developer') { window.location.href = 'dashboard.html'; return; }
  document.body.dataset.page = 'mails';

  const main = document.getElementById('mainContent');
  const esc = window.escapeHtml;
  let alle = [];
  let suche = '';
  let nurFehler = false;

  const HAKEN = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 12.5 9.5 18 20 6.5"/></svg>';
  const KREUZ = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function zeile(m) {
    return `
      <div class="fb-row">
        <div class="fb-row__head">
          <span title="${m.Erfolg ? 'Gesendet' : 'Fehlgeschlagen'}" aria-label="${m.Erfolg ? 'Gesendet' : 'Fehlgeschlagen'}" style="display:inline-flex;color:${m.Erfolg ? 'var(--status-genehmigt)' : 'var(--status-abgelehnt)'}">${m.Erfolg ? HAKEN : KREUZ}</span>
          ${renderAvatar({ name: m.EmpfName || m.An, oid: m.EmpfOid }, 'avatar--sm')}
          <span class="fb-user" title="${esc(m.An)}"><strong>${esc(m.EmpfName ? displayName(m.EmpfName) : m.An)}</strong></span>
          <span class="fb-time">${esc(new Date(m.Zeitpunkt).toLocaleString('de-DE'))}</span>
          ${m.Anlass ? `<span class="badge badge--grey">${esc(m.Anlass)}</span>` : ''}
          ${m.Modus !== 'live' ? `<span class="fb-count">Modus ${esc(m.Modus)}</span>` : ''}
        </div>
        <div class="fb-row__msg">${esc(m.Betreff)}</div>
        ${m.Fehler ? `<div class="fb-row__msg" style="color:var(--status-abgelehnt)">${esc(m.Fehler)}</div>` : ''}
      </div>`;
  }

  function liste() {
    const q = suche.trim().toLowerCase();
    const rows = alle.filter((m) => (!nurFehler || !m.Erfolg)
      && (!q || [m.An, m.EmpfName, m.Betreff, m.Anlass].some((v) => String(v || '').toLowerCase().includes(q))));
    document.getElementById('mailListe').innerHTML = rows.length
      ? rows.map(zeile).join('')
      : '<p class="fb-empty">Keine Mails.</p>';
  }

  function render() {
    const fehler = alle.filter((m) => !m.Erfolg).length;
    main.innerHTML = `
      <div class="page-header"><div class="page-header__left"><h1 class="page-title">E-Mails</h1>
        <p class="fb-time">${alle.length} ${alle.length === 1 ? 'Mail' : 'Mails'}${fehler ? `, davon ${fehler} fehlgeschlagen` : ''}</p></div>
        <div class="fb-header-controls">
          <input type="search" class="fb-filter-sev" id="mailSuche" placeholder="Name, Adresse, Betreff …" value="${esc(suche)}">
          <label class="fb-filter"><input type="checkbox" id="mailNurFehler" ${nurFehler ? 'checked' : ''}> Nur Fehler</label>
        </div>
      </div>
      <div class="fb-list" id="mailListe"></div>`;
    document.getElementById('mailSuche').addEventListener('input', (e) => { suche = e.target.value; liste(); });
    document.getElementById('mailNurFehler').addEventListener('change', (e) => { nurFehler = e.target.checked; liste(); });
    liste();
  }

  try {
    alle = await apiFetch('/dev/mails?limit=2000');
  } catch (e) {
    main.innerHTML = `<div class="card"><div class="card__body"><p style="color:var(--color-error)">Laden fehlgeschlagen: ${esc(e.message)}</p></div></div>`;
    return;
  }
  render();
});
