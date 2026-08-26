/* ===================================================================
   DH-MITTEILUNGEN.JS – Glocke in der DH-Topbar (Rolle: dhstudent)
   -------------------------------------------------------------------
   Die DH-Shell hat keine Sidebar und kein Dashboard-Widget, über das
   Mitteilungen sonst laufen. Diese Glocke schließt die Lücke: sie zeigt
   dieselben Backend-Benachrichtigungen wie mitteilungen.html und nutzt
   bewusst deren Markup (.mt-item …) samt css/mitteilungen.css, damit der
   Stil zum Rest der Anwendung passt.

   Sichtbare Typen (aus dbo.Benachrichtigungen):
     versetzung_neu / _geaendert / _entfernt  → Abteilungsplanung
     beurteilung_abgeschlossen                → fertige Beurteilung
   Die Versetzungs-Typen filtert mitteilungen.html bewusst heraus („nur in
   der Glocke") – für DH-Studenten sind genau sie die relevante Nachricht.
   =================================================================== */
(() => {
  const ICON = {
    ok:   '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    er:   '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    info: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M22 12h-6l-2 3h-4l-2-3H2"/><path stroke-linecap="round" stroke-linejoin="round" d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
    warn: '<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l2.5 1.5"/></svg>',
  };

  // Typ → Darstellung. Unbekannte Typen (z. B. wochenbezogene aus der
  // Azubi-Welt) werden bewusst ausgelassen statt mit „KW null/null" angezeigt.
  const TYPEN = {
    versetzung_neu:            { tone: 'info', label: 'Abteilung',   titel: 'Neue Abteilung geplant',        href: () => 'abteilungsdurchlauf.html' },
    versetzung_geaendert:      { tone: 'warn', label: 'Abteilung',   titel: 'Abteilungszeitraum geändert',   href: () => 'abteilungsdurchlauf.html' },
    versetzung_entfernt:       { tone: 'er',   label: 'Abteilung',   titel: 'Abteilung entfernt',            href: () => 'abteilungsdurchlauf.html' },
    beurteilung_abgeschlossen: { tone: 'ok',   label: 'Beurteilung', titel: 'Neue Beurteilung liegt vor',
                                 href: (b) => `beurteilung.html?zuw=${encodeURIComponent(b.zuweisungId || '')}` },
    kurzfeedback_abgeschlossen: { tone: 'ok',   label: 'Kurzfeedback', titel: 'Neues Kurzfeedback liegt vor',
                                 href: (b) => `beurteilung.html?zuw=${encodeURIComponent(b.zuweisungId || '')}` },
  };

  function relTime(ts) {
    if (!ts) return '';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'gerade eben';
    if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
    if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
    if (s < 86400 * 2) return 'gestern';
    if (s < 86400 * 7) return `vor ${Math.floor(s / 86400)} Tagen`;
    return new Date(ts).toLocaleDateString('de-DE');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn   = document.getElementById('dhNotifBtn');
    const panel = document.getElementById('dhNotifPanel');
    const liste = document.getElementById('dhNotifList');
    const badge = document.getElementById('dhNotifBadge');
    const alle  = document.getElementById('dhNotifAlle');
    if (!btn || !panel || !liste) return;

    const esc = window.escapeHtml;
    let items = [];

    async function laden() {
      let roh = [];
      try { roh = await DB.getBenachrichtigungenFuerUser(); } catch (e) { roh = []; }
      items = roh
        .filter(b => TYPEN[b.type])
        .sort((x, y) => (y.timestamp || 0) - (x.timestamp || 0));
      render();
    }

    function render() {
      const ungelesen = items.filter(b => !b.gelesen).length;
      if (badge) {
        badge.textContent = ungelesen > 9 ? '9+' : String(ungelesen);
        badge.hidden = ungelesen === 0;
      }
      btn.setAttribute('aria-label', ungelesen
        ? `Mitteilungen, ${ungelesen} ungelesen`
        : 'Mitteilungen');
      if (alle) alle.hidden = ungelesen === 0;

      liste.innerHTML = items.length
        ? items.map(itemHtml).join('')
        : '<div class="mt-empty">Noch keine Mitteilungen.</div>';
    }

    function itemHtml(b) {
      const t = TYPEN[b.type];
      const unread = !b.gelesen;
      const chip = t.tone === 'ok' ? 'ok' : t.tone === 'er' ? 'er' : t.tone === 'info' ? 'info' : '';
      return `
        <a class="mt-item${unread ? ' mt-item--unread' : ''}" href="${t.href(b)}" data-notif-id="${b.id}">
          <span class="mt-item__icon mt-item__icon--${t.tone}">${ICON[t.tone]}</span>
          <span class="mt-item__body">
            <span class="mt-item__title">${esc(t.titel)}</span>
            <span class="mt-item__meta">
              <span class="mt-item__chip${chip ? ' mt-item__chip--' + chip : ''}">${esc(t.label)}</span>
              <span>${esc(relTime(b.timestamp))}</span>
            </span>
          </span>
          ${unread ? '<span class="mt-item__dot" aria-hidden="true"></span>' : ''}
        </a>`;
    }

    function oeffnen(auf) {
      panel.hidden = !auf;
      btn.setAttribute('aria-expanded', String(auf));
      if (auf) laden();   // beim Öffnen frisch holen, nicht nur beim Laden der Seite
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      oeffnen(panel.hidden);
    });

    // Klick auf eine Mitteilung: erst als gelesen markieren, dann navigieren.
    // Ohne await ginge die Navigation dem PATCH voraus und der Punkt bliebe.
    liste.addEventListener('click', async (e) => {
      const a = e.target.closest('.mt-item');
      if (!a) return;
      const id = Number(a.dataset.notifId);
      if (!Number.isFinite(id)) return;
      e.preventDefault();
      try { await DB.markBenachrichtigungGelesen(id); } catch (_) { /* Navigation trotzdem */ }
      window.location.href = a.getAttribute('href');
    });

    alle?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try { await DB.markAlleBenachrichtigungenGelesen(); } catch (_) { /* still rendern */ }
      items = items.map(b => ({ ...b, gelesen: true }));
      render();
    });

    panel.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => { if (!panel.hidden) oeffnen(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.hidden) { oeffnen(false); btn.focus(); }
    });

    laden();   // Badge steht schon vor dem ersten Öffnen
  });
})();
