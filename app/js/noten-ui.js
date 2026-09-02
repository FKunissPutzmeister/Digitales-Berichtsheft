/* ===================================================================
   NOTEN-UI.JS — geteilte Darstellung für „Noten & Zeugnisse"
   Design-Specs:
     docs/superpowers/specs/2026-09-01-noten-zeugnisse-design.md
     docs/superpowers/specs/2026-09-02-noten-abschnitte-credits-design.md

   Wird von ZWEI Shells benutzt, weil DH-Studenten keine Sidebar haben,
   sondern eine eigene .dh-topbar-Shell (siehe dh-profil.html):
     app/js/noten.js      → Azubi- und Ausbilder-Ansicht (mit Sidebar)
     app/js/dh-noten.js   → DH-Shell (ohne Azubi-Auswahl)

   Drei Ebenen seit Migration 046:
     Abschnitt (Ausbildungsjahr | SoSe/WiSe) → Fach-Ordner → Prüfungen
   Ø und Credit-Summe fallen JE ABSCHNITT an; einen Durchschnitt über
   alles gibt es bewusst nicht mehr.

   Nur Browser. Die shell-agnostische RECHENlogik liegt in
   app/js/noten-core.js (window.Noten) — die requirt auch das Backend,
   deshalb darf dort kein DOM-Code stehen. Gruppierung, Ø und Credit-Summe
   kommen von dort (gruppiereOrdnerNachAbschnitt), nicht aus dieser Datei.

   Re-entrant: der SPA-Router (app/js/router.js) führt Seiten-Scripts beim
   zweiten Besuch erneut in new Function() aus. Der komplette Zustand liegt
   deshalb in start() und nicht auf Modulebene.
   =================================================================== */
(function (global) {
  'use strict';

  const N = global.Noten;
  const esc = global.escapeHtml;
  const MODAL_ABSCHNITT = 'notenAbschnittModal';
  const MODAL_ORDNER = 'notenOrdnerModal';
  const MODAL_EINTRAG = 'notenEintragModal';

  const fmtDatum = (iso) => (iso ? DateUtil.formatDate(iso, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–');

  // "Ø 2,3 · 7 Noten" — die Anzahl steht bewusst daneben, damit die Zahl
  // nachprüfbar ist (Einträge ohne Note zählen nirgends mit, auch das "b").
  function schnittText(schnitt, anzahl) {
    if (schnitt === null || schnitt === undefined) return 'keine Note';
    return `Ø ${N.formatNote(schnitt)} · ${anzahl} ${anzahl === 1 ? 'Note' : 'Noten'}`;
  }

  /* "1 Fach" / "3 Fächer" statt "3 Fach/Fächer". Die Löschen-Rückfrage ist
     genau der Ort, an dem jemand die Zahlen liest — dort darf die Sprache
     nicht nach Formular klingen. */
  function mehrzahl(anzahl, eins, viele) {
    return Number(anzahl) + ' ' + (Number(anzahl) === 1 ? eins : viele);
  }

  function artLabel(id) {
    const a = N.artById(id);
    return a ? a.label : id;
  }

  // Alle Einträge eines Abschnitts (über seine Ordner) — für die Frage, ob
  // überhaupt Credits eingetragen sind.
  //
  // NICHT für die Anzahl hinter dem Ø: die zählt N.abschnittAnzahlNoten,
  // weil sie dieselbe Filterung braucht wie der Ø selbst. Hier stand
  // vorher anzahlMitNote(alleEintraege) — das zählte auch die Noten aus
  // Fächern mit „zählt nicht in den Ø" mit, sodass neben einem Ø aus fünf
  // Werten die Zahl sieben stehen konnte.
  function eintraegeVon(ordner) {
    return (ordner || []).flatMap(o => (o.eintraege || []));
  }

  /* ── Klappzustand ─────────────────────────────────────────────────
     Zeiträume und Fächer lassen sich zuklappen. Der Zustand MUSS
     gespeichert werden, weil renderDetail() bei jedem Speichern,
     Löschen und Beleg-Upload den ganzen Inhalt neu baut — ein
     zugeklappter Zeitraum würde sonst jedes Mal wieder aufspringen und
     das Zuklappen wäre praktisch wertlos.

     Gemerkt wird nur, was ZUgeklappt ist: neu angelegte Zeiträume sind
     damit automatisch offen, ohne dass sie jemand einträgt.

     Ein Schlüssel für alle Personen genügt, weil Ids tabellenweit
     eindeutig sind; das Präfix trennt Zeitraum ("a") von Fach ("o").
     localStorage kann werfen (privates Fenster, gesperrte Site-Daten) —
     deshalb überall try/catch, siehe app/js/theme.js. */
  const ZUGEKLAPPT_KEY = 'notenZugeklappt';

  function ladeZugeklappt() {
    try {
      const roh = JSON.parse(localStorage.getItem(ZUGEKLAPPT_KEY) || '[]');
      return new Set(Array.isArray(roh) ? roh : []);
    } catch (e) { return new Set(); }
  }

  function speichereZugeklappt(menge) {
    try { localStorage.setItem(ZUGEKLAPPT_KEY, JSON.stringify([...menge])); } catch (e) { /* nicht kritisch */ }
  }

  const abschnittSchluessel = (id) => 'a' + (id === null || id === undefined ? 'ohne' : id);
  const ordnerSchluessel = (id) => 'o' + id;

  /* ── Bausteine ──────────────────────────────────────────────────── */

  function belegHtml(b, darfBearbeiten) {
    const url = DB.notenBelegDownloadUrl(b.id);
    const vorschau = N.istBildVorschau(b.dateiname);
    // HEIC/HEIF kann Edge/Chrome nicht dekodieren — statt einer kaputten
    // Vorschau den Download-Hinweis zeigen.
    const hinweis = (!vorschau && !N.istPdf(b.dateiname))
      ? '<span class="noten-beleg__hinweis">Vorschau nicht möglich – zum Ansehen herunterladen</span>' : '';
    return `<div class="noten-beleg">
      <a class="noten-beleg__link" href="${url}" target="_blank" rel="noopener" title="${esc(b.dateiname)}">
        <span class="noten-beleg__icon">${Icon(N.istPdf(b.dateiname) ? 'document' : 'paperclip', { size: 18 })}</span>
        <span class="noten-beleg__name">${esc(b.dateiname)}</span>
        <span class="noten-beleg__size">${N.formatBytes(b.groesseBytes)}</span>
      </a>
      ${hinweis}
      ${darfBearbeiten ? `<button type="button" class="btn btn-icon btn-ghost noten-beleg__del"
          data-beleg="${b.id}" aria-label="Beleg löschen" title="Beleg löschen">${Icon('trash', { size: 16 })}</button>` : ''}
    </div>`;
  }

  /* Die Notenspalte eines Eintrags. Drei Zustände wie im DUALIS-Notenspiegel:
       Zahl        – eine echte Note
       b           – bestanden OHNE Note (Status bestanden, Note leer)
       –           – noch nichts eingetragen
     "b" ist deshalb kein Notenwert, sondern eine Kombination — siehe
     istBestandenOhneNote() in noten-core.js. */
  function noteZelle(e) {
    if (N.istBestandenOhneNote(e)) {
      return `<div class="noten-eintrag__note noten-eintrag__note--b"
                   title="bestanden, ohne Note">b</div>`;
    }
    return `<div class="noten-eintrag__note">${N.formatNote(e.note)}</div>`;
  }

  /* Credits mit ihrem Beitrag zur Semestersumme. Ein Modul mit Status
     "offen" trägt seine Credits sichtbar, aber NICHT in der Summe — ohne
     diesen Hinweis sieht die Summe unten falsch aus. */
  function creditsText(e) {
    if (e.credits === null || e.credits === undefined) return '';
    const s = N.statusById(e.status);
    const zaehlt = !!(s && s.zaehltCredits);
    return `<span class="noten-eintrag__credits${zaehlt ? '' : ' noten-eintrag__credits--aus'}"
                  title="${zaehlt ? 'zählt in die Credit-Summe' : 'zählt NICHT in die Credit-Summe (nur bestandene Module)'}"
            >${N.formatCredits(e.credits)} CP${zaehlt ? '' : ' (zählt nicht)'}</span>`;
  }

  function statusBadge(e) {
    // "bestanden" ist der Normalfall und braucht kein Etikett.
    if (!e.status || e.status === 'bestanden') return '';
    return `<span class="badge badge--grey">${esc(N.statusLabel(e.status))}</span>`;
  }

  function eintragHtml(e, darfBearbeiten) {
    // IHK-Punkte gibt es nur noch bei Azubi-Prüfungen (Migration 046).
    let punkte = '';
    if (e.punkte !== null && e.punkte !== undefined) {
      const titel = e.noteAusPunkten ? ' title="Note aus den Punkten berechnet"' : '';
      punkte = `<span class="noten-eintrag__punkte"${titel}>${N.formatPunkte(e.punkte)} Punkte</span>`;
    }
    const geaendert = e.aktualisiertAm
      ? `<span class="noten-eintrag__stempel" title="Zuletzt geändert">geändert ${fmtDatum(e.aktualisiertAm)}</span>` : '';
    return `<li class="noten-eintrag" data-eintrag="${e.id}">
      ${noteZelle(e)}
      <div class="noten-eintrag__main">
        <div class="noten-eintrag__kopf">
          <span class="noten-eintrag__titel">${esc(e.titel)}</span>
          <span class="badge badge--grey">${esc(artLabel(e.art))}</span>
          ${statusBadge(e)}
        </div>
        <div class="noten-eintrag__meta">
          <span>${fmtDatum(e.datum)}</span>
          ${creditsText(e)}
          ${punkte}
          ${geaendert}
        </div>
        ${e.bemerkung ? `<p class="noten-eintrag__bemerkung">${esc(e.bemerkung)}</p>` : ''}
        ${e.belege.length ? `<div class="noten-belege">${e.belege.map(b => belegHtml(b, darfBearbeiten)).join('')}</div>` : ''}
      </div>
      ${darfBearbeiten ? `<div class="noten-eintrag__aktionen">
        <button type="button" class="btn btn-icon btn-ghost" data-bearbeiten="${e.id}"
                aria-label="Eintrag bearbeiten" title="Bearbeiten">${Icon('edit', { size: 18 })}</button>
        <button type="button" class="btn btn-icon btn-ghost" data-loeschen="${e.id}"
                aria-label="Eintrag löschen" title="Löschen">${Icon('trash', { size: 18 })}</button>
      </div>` : ''}
    </li>`;
  }

  function ordnerHtml(o, darfBearbeiten, zugeklappt) {
    const schnitt = N.ordnerSchnitt(o.eintraege);
    const anzahl = N.anzahlMitNote(o.eintraege);
    const offen = !zugeklappt.has(ordnerSchluessel(o.id));
    const eintraege = o.eintraege.length
      ? `<ul class="noten-liste">${o.eintraege.map(e => eintragHtml(e, darfBearbeiten)).join('')}</ul>`
      : `<p class="noten-ordner__leer">Noch keine Einträge in diesem Fach.</p>`;
    return `<details class="noten-ordner" data-ordner="${o.id}"${offen ? ' open' : ''}>
      <summary class="noten-ordner__kopf">
        <span class="noten-ordner__name">${esc(o.name)}</span>
        <span class="noten-ordner__schnitt">${schnittText(schnitt, anzahl)}</span>
        ${o.zaehltInSchnitt ? '' : '<span class="badge badge--grey" title="Dieses Fach fließt nicht in den Semester-/Jahresdurchschnitt ein">nicht im Ø</span>'}
        ${darfBearbeiten ? `<span class="noten-ordner__aktionen">
          <button type="button" class="btn btn-sm btn-outline" data-neuer-eintrag="${o.id}">Eintrag hinzufügen</button>
          <button type="button" class="btn btn-icon btn-ghost" data-ordner-bearbeiten="${o.id}"
                  aria-label="Fach bearbeiten" title="Fach bearbeiten">${Icon('edit', { size: 18 })}</button>
          <button type="button" class="btn btn-icon btn-ghost" data-ordner-loeschen="${o.id}"
                  aria-label="Fach löschen" title="Fach löschen">${Icon('trash', { size: 18 })}</button>
        </span>` : ''}
      </summary>
      <div class="noten-ordner__body">${eintraege}</div>
    </details>`;
  }

  /* Ein Abschnitt = die äußere Karte. Kopfzeile trägt die beiden Kennzahlen
     dieses Zeitraums: Noten-Ø und Credit-Summe. Die Credit-Summe erscheint
     nur, wenn überhaupt Credits eingetragen sind — bei Azubis gibt es
     keine, dort wäre "0,0 CP" nur Rauschen.

     class="card": die Fläche kommt von .card, damit jedes Skin
     (glass/silk/hyperspace/…) seine Karten-Optik anwendet, statt dass diese
     Seite eine zweite Wahrheit aufbaut. Siehe Kommentar in noten.css. */
  function abschnittHtml(g, darfBearbeiten, zugeklappt) {
    const alleEintraege = eintraegeVon(g.ordner);
    const hatCredits = alleEintraege.some(e => e.credits !== null && e.credits !== undefined);
    const inhalt = g.ordner.length
      ? `<div class="noten-fach-liste">${g.ordner.map(o => ordnerHtml(o, darfBearbeiten, zugeklappt)).join('')}</div>`
      : `<p class="noten-abschnitt__leer">${darfBearbeiten
          ? 'Noch keine Fächer in diesem Zeitraum.'
          : 'Keine Fächer eingetragen.'}</p>`;

    // Die Auffanggruppe (label === null) hat keine Id und lässt sich deshalb
    // weder löschen noch mit neuen Fächern füllen.
    const istAuffang = g.id === null;
    const offen = !zugeklappt.has(abschnittSchluessel(g.id));
    // Zugeklappt ist die Fächerzahl die einzige Auskunft über den Inhalt.
    const menge = g.ordner.length === 1 ? '1 Fach' : `${g.ordner.length} Fächer`;

    /* BEWUSST kein <details>/<summary>, obwohl das Auf- und Zuklappen dort
       gratis käme: bei <details> ist die GESAMTE Kopfzeile das Bedienelement.
       Umklappen soll aber nur der Pfeil — ein Klick auf „2. Ausbildungsjahr"
       oder auf die Kennzahlen darf nichts tun. Das gegen <details>
       durchzusetzen hieße, dessen Standardverhalten bei Maus UND Tastatur
       abzufangen; ein eigener Knopf mit aria-expanded ist ehrlicher.
       Sichtbarkeit hängt an data-offen (siehe noten.css) statt am
       [hidden]-Attribut — das wird von jeder eigenen display-Regel
       überstimmt und ist hier schon einmal zur Falle geworden. */
    const koerperId = 'notenAbschnitt' + (istAuffang ? 'Ohne' : g.id);
    return `<section class="card noten-abschnitt" data-abschnitt="${istAuffang ? 'ohne' : g.id}"
             data-offen="${offen ? '1' : '0'}">
      <div class="noten-abschnitt__kopf">
        <button type="button" class="noten-abschnitt__pfeil"
                data-klapp="${istAuffang ? 'ohne' : g.id}"
                aria-expanded="${offen ? 'true' : 'false'}" aria-controls="${koerperId}"
                aria-label="${offen ? 'Zeitraum zuklappen' : 'Zeitraum aufklappen'}"
                title="${offen ? 'Zuklappen' : 'Aufklappen'}"></button>
        <h2 class="noten-abschnitt__label">${g.label === null ? 'Ohne Zuordnung' : esc(g.label)}</h2>
        <span class="noten-abschnitt__schnitt">${schnittText(g.schnitt, N.abschnittAnzahlNoten(g.ordner))}</span>
        ${hatCredits ? `<span class="noten-abschnitt__credits" title="Summe der Credits bestandener Module">
          ${N.formatCredits(g.credits)} CP</span>` : ''}
        <span class="noten-abschnitt__menge">${menge}</span>
        ${darfBearbeiten && !istAuffang ? `<span class="noten-abschnitt__aktionen">
          <button type="button" class="btn btn-sm btn-outline" data-neues-fach="${g.id}">
            ${Icon('add', { size: 16 })} Fach hinzufügen</button>
          <button type="button" class="btn btn-icon btn-ghost" data-abschnitt-loeschen="${g.id}"
                  aria-label="Zeitraum löschen" title="Zeitraum löschen">${Icon('trash', { size: 18 })}</button>
        </span>` : ''}
      </div>
      <div class="noten-abschnitt__body" id="${koerperId}">${inhalt}</div>
    </section>`;
  }

  /* ── Modal-Gerüst ───────────────────────────────────────────────── */
  // Jedes Mal frisch aufbauen: so stimmen die selected-Attribute der
  // <select>-Felder, ohne über _pmInstance.setValue nachsteuern zu müssen
  // (PMSelect verwandelt jedes .form-control-select automatisch).
  function baueModal(id, titel, bodyHtml, footerHtml) {
    const alt = document.getElementById(id);
    if (alt) alt.remove();
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = id;
    ov.innerHTML = `<div class="modal modal--lg">
      <div class="modal__header">
        <h2 class="modal__title">${esc(titel)}</h2>
        <button class="modal__close" type="button" data-modal-close aria-label="Schließen">×</button>
      </div>
      <div class="modal__body">${bodyHtml}</div>
      <div class="modal__footer">${footerHtml}</div>
    </div>`;
    document.body.appendChild(ov);
    if (typeof Modal !== 'undefined' && Modal.init) Modal.init();
    if (global.PMSelect && global.PMSelect.enhance) global.PMSelect.enhance();
    return ov;
  }

  /* Die Auswahlliste konkreter Zeiträume kommt aus noten-core.js
     (abschnittKandidaten) — EIN Dropdown, wie die Semesterwahl im
     DUALIS-Notenspiegel ("Semester: SoSe 2026"). Bewusst nicht zwei
     gekoppelte Selects (Halbjahr + Jahr): dann müsste bei jeder Änderung
     die Jahresliste neu gebaut und PMSelect neu angewendet werden.
     Der Wert des <option> ist "typ:nr". */

  /* ── Einstiegspunkt ─────────────────────────────────────────────── */
  /**
   * @param {object} opts
   *   user         – der eingeloggte Nutzer (aus initPage/requireAuth)
   *   host         – Container-Element (#mainContent)
   *   mitAzubiWahl – true in der Sidebar-Shell: Ausbilder bekommen die
   *                  Übersichtsliste und die Azubi-Auswahl. In der
   *                  DH-Shell false (der DH-Student sieht nur sich).
   */
  async function start(opts) {
    const { user, host } = opts;
    const mitAzubiWahl = opts.mitAzubiWahl !== false;
    // Ziel des Notenspiegel-Knopfes. Die DH-Shell hat ihre eigene Seite,
    // weil sie keine Sidebar lädt (dh-noten-tabelle.html).
    const spiegelHref = opts.spiegelHref || 'noten-tabelle.html';

    // Kann der Nutzer überhaupt fremde Noten sehen? Azubis/DH-Studenten
    // sehen nur sich; für alle anderen ist die Übersichtsliste der Einstieg.
    const nurEigene = !mitAzubiWahl || (!!user.istAzubi && !user.istAusbilder && !user.istAusbildungsleiter);
    // Schreiben darf nur der Eigentümer, also entscheidet SEINE Rolle über
    // die Formularfelder.
    const istDh = user.role === 'dhstudent';

    let azubis = [];
    let viewAzubiId = user.oid;
    let daten = null;
    const zugeklappt = ladeZugeklappt();

    /* ── Laden ────────────────────────────────────────────────────── */
    async function ladeDaten() {
      daten = await DB.getNoten(viewAzubiId === user.oid ? null : viewAzubiId);
    }

    /* ── Rendern ──────────────────────────────────────────────────── */
    function renderUebersicht() {
      const zeilen = azubis.map(a => `<tr class="noten-uebersicht__zeile" data-azubi="${esc(a.oid)}" tabindex="0">
          <td>${esc(displayName(a.name))}</td>
          <td>${esc(a.role === 'dhstudent' ? 'DH-Student' : 'Azubi')}</td>
          <td class="noten-uebersicht__zahl">${a.anzahlEintraege}</td>
          <td class="noten-uebersicht__zahl">${a.anzahlAbschnitte}</td>
          <td>${a.letzterEintrag ? fmtDatum(a.letzterEintrag) : '–'}</td>
          <td class="noten-uebersicht__zahl">
            ${a.schnittAktuell === null || a.schnittAktuell === undefined ? '–' : N.formatNote(a.schnittAktuell)}
            ${a.abschnittAktuell ? `<span class="noten-uebersicht__sub">${esc(a.abschnittAktuell)}</span>` : ''}
          </td>
        </tr>`).join('');
      host.innerHTML = `
        <div class="page-header">
          <div class="page-header__left">
            <h1 class="page-title">Noten &amp; Zeugnisse</h1>
            <p class="page-subtitle">Schulnoten und Zeugnisse der von dir betreuten Azubis und DH-Studenten.</p>
          </div>
        </div>
        <div class="card">
          <div class="card__body">
            ${azubis.length ? `<div class="noten-tabelle-wrap">
              <table class="noten-uebersicht">
                <thead><tr>
                  <th>Name</th><th>Art</th>
                  <th class="noten-uebersicht__zahl">Einträge</th>
                  <th class="noten-uebersicht__zahl">Zeiträume</th>
                  <th>Letzter Eintrag</th>
                  <th class="noten-uebersicht__zahl">Ø aktueller Zeitraum</th>
                </tr></thead>
                <tbody>${zeilen}</tbody>
              </table>
            </div>` : `<div class="empty-state">
              <div class="empty-state__icon">${Icon('cap', { size: 48 })}</div>
              <p class="empty-state__title">Keine Azubis zugeordnet</p>
              <p class="empty-state__text">Hier erscheinen die Azubis und DH-Studenten, für die du dauerhaft
                zuständig bist. Eine befristete Abteilungs-Zuweisung genügt dafür bewusst nicht.</p>
            </div>`}
          </div>
        </div>`;
      host.querySelectorAll('[data-azubi]').forEach(tr => {
        const oeffne = () => { viewAzubiId = tr.dataset.azubi; setPersistedAzubiId(viewAzubiId); zeigeDetail(); };
        tr.addEventListener('click', oeffne);
        tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); oeffne(); } });
      });
    }

    function renderDetail() {
      const darfBearbeiten = !!daten.darfBearbeiten;
      // EINE Gruppierung, und die liegt in noten-core.js — samt Ø und
      // Credit-Summe je Abschnitt. Die Route liefert beides absichtlich flach.
      const gruppen = N.gruppiereOrdnerNachAbschnitt(daten.abschnitte, daten.ordner);
      const anlegenLabel = istDh ? 'Semester hinzufügen' : 'Ausbildungsjahr hinzufügen';

      const zurueck = nurEigene ? '' :
        `<button type="button" class="btn btn-ghost btn-sm" id="notenZurueck">← Alle Azubis</button>`;
      const wahl = (!nurEigene && azubis.length)
        ? renderAzubiSelect(azubis.map(a => ({ id: a.oid, name: displayName(a.name) })), viewAzubiId)
        : '';

      /* Der Notenspiegel ist eine eigene Seite (Voll-Load, kein Router —
         der fängt nur Klicks in #sidebar ab), deshalb ein echter <a>: so
         gehen Mittelklick und „in neuem Tab öffnen" wie erwartet.
         Ohne einen einzigen Zeitraum gäbe es nichts zu zeigen, dann bleibt
         der Knopf weg statt auf eine leere Tabelle zu führen. Die gewählte
         Person muss mit, sonst zeigt die Tabelle den falschen Menschen. */
      const spiegelZiel = (!nurEigene && viewAzubiId !== user.oid)
        ? `${spiegelHref}?azubi=${encodeURIComponent(viewAzubiId)}`
        : spiegelHref;
      const knoepfe = [
        darfBearbeiten
          ? `<button type="button" class="btn btn-primary" id="notenNeuerAbschnitt">
              ${Icon('add', { size: 18 })} ${anlegenLabel}</button>` : '',
        gruppen.length
          ? `<a class="btn btn-outline" href="${esc(spiegelZiel)}">
              ${Icon('clipboard', { size: 18 })} Notenspiegel</a>` : '',
      ].filter(Boolean).join('');
      // Leere Leiste = nur der Außenabstand von .noten-kopf-aktionen.
      const kopfAktionen = knoepfe ? `<div class="noten-kopf-aktionen">${knoepfe}</div>` : '';

      // Die Haupt-Handlung steht links unter dem Titel, am Anfang der
      // Leserichtung. Eine Gesamt-Ø-Kachel gibt es nicht mehr: gerechnet
      // wird je Zeitraum, und die Zahl steht in dessen Kopfzeile.
      // page-header__actions (nicht __right) — nur diese Klasse existiert in
      // layout.css; ein erfundener Name fällt lautlos auf Block-Layout zurück.
      host.innerHTML = `
        <div class="page-header">
          <div class="page-header__left">
            ${zurueck}
            <h1 class="page-title">Noten &amp; Zeugnisse</h1>
            <p class="page-subtitle">${darfBearbeiten
              ? (istDh
                ? 'Lege je Semester deine Fächer an und trage dort Note, Credits und Status ein.'
                : 'Lege je Ausbildungsjahr deine Fächer an und hänge dort Noten und Belege ein.')
              : 'Ansicht der eingetragenen Schulnoten – schreibgeschützt.'}</p>
            ${kopfAktionen}
          </div>
        </div>
        ${wahl}
        ${gruppen.length
          ? `<div class="noten-abschnitt-liste">${gruppen.map(g => abschnittHtml(g, darfBearbeiten, zugeklappt)).join('')}</div>`
          : `<p class="noten-leer">${darfBearbeiten
              ? (istDh
                ? 'Noch keine Semester – fange mit dem aktuellen an, zum Beispiel „SoSe 2026".'
                : 'Noch keine Ausbildungsjahre – fange mit dem aktuellen an.')
              : 'Hier erscheinen die Noten, sobald sie eingetragen wurden.'}</p>`}`;

      bindeDetail(darfBearbeiten);
    }

    function bindeDetail(darfBearbeiten) {
      /* Zeitraum: nur der Pfeil klappt um. Kein Neuzeichnen — der Zustand
         wird direkt am DOM gesetzt, damit die Seite nicht springt. */
      host.querySelectorAll('[data-klapp]').forEach(knopf => knopf.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const karte = knopf.closest('.noten-abschnitt');
        if (!karte) return;
        const offen = karte.dataset.offen !== '1';
        karte.dataset.offen = offen ? '1' : '0';
        knopf.setAttribute('aria-expanded', offen ? 'true' : 'false');
        knopf.setAttribute('aria-label', offen ? 'Zeitraum zuklappen' : 'Zeitraum aufklappen');
        knopf.title = offen ? 'Zuklappen' : 'Aufklappen';
        const schluessel = 'a' + karte.dataset.abschnitt;
        if (offen) zugeklappt.delete(schluessel); else zugeklappt.add(schluessel);
        speichereZugeklappt(zugeklappt);
      }));

      /* Fächer sind weiter <details>: dort klappt die ganze Kopfzeile.
         Das toggle-Ereignis blubbert NICHT (HTML-Spezifikation), der
         Vergleich auf e.target bleibt trotzdem drin, damit ein späteres
         Umbauen der Struktur keine Zustände vermischt. */
      host.querySelectorAll('.noten-ordner[data-ordner]').forEach(el =>
        el.addEventListener('toggle', (e) => {
          if (e.target !== el) return;
          const schluessel = ordnerSchluessel(el.dataset.ordner);
          if (el.open) zugeklappt.delete(schluessel); else zugeklappt.add(schluessel);
          speichereZugeklappt(zugeklappt);
        }));

      const zurueck = document.getElementById('notenZurueck');
      if (zurueck) zurueck.addEventListener('click', () => renderUebersicht());

      const select = document.getElementById('azubiSelect');
      if (select) select.addEventListener('change', async (e) => {
        viewAzubiId = e.target.value;
        setPersistedAzubiId(viewAzubiId);
        await zeigeDetail();
      });

      if (!darfBearbeiten) return;

      const neu = document.getElementById('notenNeuerAbschnitt');
      if (neu) neu.addEventListener('click', () => abschnittModal());

      host.querySelectorAll('[data-abschnitt-loeschen]').forEach(b => b.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        loescheAbschnitt(findeAbschnitt(+b.dataset.abschnittLoeschen));
      }));
      host.querySelectorAll('[data-neues-fach]').forEach(b => b.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        ordnerModal(+b.dataset.neuesFach, null);
      }));
      host.querySelectorAll('[data-ordner-bearbeiten]').forEach(b => b.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        const o = findeOrdner(+b.dataset.ordnerBearbeiten);
        if (o) ordnerModal(o.abschnittId, o);
      }));
      host.querySelectorAll('[data-ordner-loeschen]').forEach(b => b.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        loescheOrdner(findeOrdner(+b.dataset.ordnerLoeschen));
      }));
      host.querySelectorAll('[data-neuer-eintrag]').forEach(b => b.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        eintragModal(+b.dataset.neuerEintrag, null);
      }));
      host.querySelectorAll('[data-bearbeiten]').forEach(b => b.addEventListener('click', () => {
        const gefunden = findeEintrag(+b.dataset.bearbeiten);
        if (gefunden) eintragModal(gefunden.ordnerId, gefunden);
      }));
      host.querySelectorAll('[data-loeschen]').forEach(b => b.addEventListener('click', () => {
        loescheEintrag(findeEintrag(+b.dataset.loeschen));
      }));
      host.querySelectorAll('[data-beleg]').forEach(b => b.addEventListener('click', (e) => {
        e.preventDefault();
        loescheBeleg(+b.dataset.beleg);
      }));
    }

    const findeAbschnitt = (id) => (daten.abschnitte || []).find(a => a.id === id) || null;
    const findeOrdner = (id) => (daten.ordner || []).find(o => o.id === id) || null;
    const findeEintrag = (id) => {
      for (const o of (daten.ordner || [])) {
        const e = (o.eintraege || []).find(x => x.id === id);
        if (e) return e;
      }
      return null;
    };

    // Fehlt eine Migration oder ist der Server nicht erreichbar, darf die
    // Seite nicht einfach leer bleiben — sonst sieht der Azubi nur weiß.
    function renderFehler(err) {
      host.innerHTML = `
        <div class="page-header"><div class="page-header__left">
          <h1 class="page-title">Noten &amp; Zeugnisse</h1>
        </div></div>
        <div class="card"><div class="card__body"><div class="empty-state">
          <div class="empty-state__icon">${Icon('warning', { size: 48 })}</div>
          <p class="empty-state__title">Die Noten konnten nicht geladen werden</p>
          <p class="empty-state__text">${esc(err && err.message ? err.message : 'Unbekannter Fehler')}</p>
        </div></div></div>`;
    }

    async function zeigeDetail() {
      try {
        await ladeDaten();
      } catch (err) {
        renderFehler(err);
        return;
      }
      renderDetail();
    }

    /* ── Zeitraum anlegen ─────────────────────────────────────────── */
    // Umbenennen gibt es nicht: ein Zeitraum IST sein (Typ, Nummer).
    function abschnittModal() {
      // Das Jahresfenster wandert mit dem Kalender mit — es muss niemand
      // jährlich Semester nachtragen (Begründung in noten-core.js).
      const kandidaten = N.abschnittKandidaten(user.role, daten.abschnitte);
      if (!kandidaten.length) {
        Toast.error(istDh ? 'Semester' : 'Ausbildungsjahr', 'Es sind schon alle Zeiträume angelegt.');
        return;
      }
      // Vorausgewählt ist das LAUFENDE Semester bzw. das niedrigste noch
      // freie Ausbildungsjahr — nicht der Listenkopf, der wäre das
      // Vorlauf-Semester (Begründung in noten-core.js).
      const vorwahl = N.vorauswahlAbschnitt(user.role, kandidaten);
      const optionen = kandidaten.map((k) => {
        const gewaehlt = !!vorwahl && k.typ === vorwahl.typ && k.nr === vorwahl.nr;
        return `<option value="${k.typ}:${k.nr}"${gewaehlt ? ' selected' : ''}>${esc(N.abschnittLabel(k.typ, k.nr))}</option>`;
      }).join('');

      const ov = baueModal(MODAL_ABSCHNITT, istDh ? 'Semester hinzufügen' : 'Ausbildungsjahr hinzufügen', `
        <div class="noten-form">
        <div class="form-group">
          <label class="form-label" for="notenAbschnittWahl">${istDh ? 'Semester' : 'Ausbildungsjahr'}</label>
          <select class="form-control" id="notenAbschnittWahl">${optionen}</select>
          <p class="form-hint">${istDh
            ? 'Nur die Hochschulsemester – für die Praxisphasen im Betrieb gibt es keine Noten. Bereits angelegte Semester stehen nicht in der Liste.'
            : 'Bereits angelegte Jahre stehen nicht in der Liste.'}</p>
        </div>
        </div>`, `
        <button type="button" class="btn btn-secondary" data-modal-close>Abbrechen</button>
        <button type="button" class="btn btn-primary" id="notenAbschnittSpeichern">Anlegen</button>`);

      Modal.open(MODAL_ABSCHNITT);
      ov.querySelector('#notenAbschnittSpeichern').addEventListener('click', async () => {
        const [typ, nrText] = String(ov.querySelector('#notenAbschnittWahl').value).split(':');
        const nr = Number(nrText);
        const problem = N.pruefeAbschnitt(typ, nr, user.role);
        if (problem) { Toast.error('Zeitraum', problem); return; }
        try {
          await DB.addNotenAbschnitt({ typ, nr });
          Modal.close(MODAL_ABSCHNITT);
          Toast.success('Zeitraum', `${N.abschnittLabel(typ, nr)} angelegt.`);
          await zeigeDetail();
        } catch (e) { Toast.error('Zeitraum', e.message); }
      });
    }

    async function loescheAbschnitt(abschnitt) {
      if (!abschnitt) return;
      const name = abschnitt.label || N.abschnittLabel(abschnitt.typ, abschnitt.nr) || 'Zeitraum';
      try {
        // Erster Versuch ohne Kaskade: der Server antwortet mit 409 und den
        // Zahlen, wenn Fächer darin liegen.
        await DB.deleteNotenAbschnitt(abschnitt.id);
        Toast.success('Zeitraum', `${name} gelöscht.`);
        await zeigeDetail();
      } catch (e) {
        if (e.status !== 409) { Toast.error('Zeitraum', e.message); return; }
        const info = e.daten || {};
        // Nur nennen, was der Server tatsächlich gezählt hat — eine erfundene
        // Null wäre in einer Löschen-Rückfrage die falsche Auskunft.
        const teile = [];
        if (Number.isFinite(info.ordner)) teile.push(mehrzahl(info.ordner, 'Fach', 'Fächer'));
        if (info.eintraege) teile.push(mehrzahl(info.eintraege, 'Eintrag', 'Einträge'));
        if (info.belege) teile.push(mehrzahl(info.belege, 'Beleg', 'Belege'));
        const weiter = await Confirm.loeschen({
          titel: `${name} löschen?`,
          text: 'Dieser Zeitraum ist nicht leer. Mitgelöscht werden:',
          liste: teile,
          hinweis: 'Das lässt sich nicht zurücknehmen.',
          bestaetigen: 'Alles löschen',
        });
        if (!weiter) return;
        try {
          await DB.deleteNotenAbschnitt(abschnitt.id, { kaskade: true });
          Toast.success('Zeitraum', `${name} samt Inhalt gelöscht.`);
          await zeigeDetail();
        } catch (e2) { Toast.error('Zeitraum', e2.message); }
      }
    }

    /* ── Fach anlegen / bearbeiten ────────────────────────────────── */
    function ordnerModal(abschnittId, ordner) {
      const ist = !!ordner;
      // Beim Bearbeiten lässt sich das Fach in einen anderen Zeitraum
      // verschieben — praktisch, wenn man es im falschen angelegt hat.
      //
      // Ein Fach OHNE Zeitraum (Auffanggruppe "Ohne Zuordnung", entstanden
      // aus Altdaten) bekommt einen leeren Platzhalter als Vorauswahl.
      // Sonst stünde dort stillschweigend der erste Zeitraum und ein Klick
      // auf Speichern würde das Fach ungefragt dorthin verschieben.
      const ohneZeitraum = abschnittId === null || abschnittId === undefined;
      const zeitraumOptionen = (ohneZeitraum
          ? '<option value="" selected>– bitte wählen –</option>' : '')
        + N.sortiereAbschnitte(daten.abschnitte || []).map(a =>
        `<option value="${a.id}"${a.id === abschnittId ? ' selected' : ''}>${esc(a.label || N.abschnittLabel(a.typ, a.nr))}</option>`).join('');

      const ov = baueModal(MODAL_ORDNER, ist ? 'Fach bearbeiten' : 'Fach hinzufügen', `
        <div class="noten-form">
        <div class="form-group">
          <label class="form-label" for="notenOrdnerName">Name des Fachs oder Moduls</label>
          <input class="form-control" id="notenOrdnerName" type="text" maxlength="${N.ORDNERNAME_MAX}"
                 placeholder="${istDh ? 'z.B. Maschinendynamik, Studienarbeit II' : 'z.B. Englisch, Software, Zeugnisse'}"
                 value="${ist ? esc(ordner.name) : ''}">
          <p class="form-hint">Ein Fach gehört genau einem Zeitraum – im nächsten legst du es erneut an.
            So bleibt der Durchschnitt je Zeitraum sauber getrennt.</p>
        </div>
        <div class="form-group">
          <label class="form-label" for="notenOrdnerAbschnitt">Zeitraum</label>
          <select class="form-control" id="notenOrdnerAbschnitt">${zeitraumOptionen}</select>
          ${ohneZeitraum ? '<p class="form-hint">Dieses Fach ist noch keinem Zeitraum zugeordnet – bitte einen wählen.</p>' : ''}
        </div>
        <div class="form-group">
          <label class="pm-switch-row">
            <span class="pm-switch">
              <input type="checkbox" id="notenOrdnerZaehlt" class="pm-switch__input"
                     ${!ist || ordner.zaehltInSchnitt ? 'checked' : ''}>
              <span class="pm-switch__track" aria-hidden="true"><span class="pm-switch__thumb"></span></span>
            </span>
            <span>Zählt in den Durchschnitt des Zeitraums</span>
          </label>
          <p class="form-hint">Für ein Fach wie „Zeugnisse" ausschalten: dessen Noten stehen schon in den
            Fachordnern und würden den Durchschnitt doppelt gewichten. Der Fach-Ø wird trotzdem angezeigt.</p>
        </div>
        </div>`, `
        <button type="button" class="btn btn-secondary" data-modal-close>Abbrechen</button>
        <button type="button" class="btn btn-primary" id="notenOrdnerSpeichern">Speichern</button>`);

      Modal.open(MODAL_ORDNER);
      ov.querySelector('#notenOrdnerName').focus();
      ov.querySelector('#notenOrdnerSpeichern').addEventListener('click', async () => {
        const name = ov.querySelector('#notenOrdnerName').value;
        const problem = N.pruefeOrdnerName(name);
        if (problem) { Toast.error('Fach', problem); return; }
        const gewaehlt = parseInt(ov.querySelector('#notenOrdnerAbschnitt').value, 10);
        if (isNaN(gewaehlt)) { Toast.error('Fach', 'Bitte einen Zeitraum wählen.'); return; }
        const zaehltInSchnitt = ov.querySelector('#notenOrdnerZaehlt').checked;
        try {
          if (ist) await DB.patchNotenOrdner(ordner.id, { name, zaehltInSchnitt, abschnittId: gewaehlt });
          else await DB.addNotenOrdner({ name, abschnittId: gewaehlt, zaehltInSchnitt });
          Modal.close(MODAL_ORDNER);
          Toast.success('Fach', ist ? 'Fach geändert.' : 'Fach angelegt.');
          await zeigeDetail();
        } catch (e) {
          Toast.error('Fach', e.message);
        }
      });
    }

    async function loescheOrdner(ordner) {
      if (!ordner) return;
      try {
        await DB.deleteNotenOrdner(ordner.id);
        Toast.success('Fach', 'Fach gelöscht.');
        await zeigeDetail();
      } catch (e) {
        if (e.status !== 409) { Toast.error('Fach', e.message); return; }
        const info = e.daten || {};
        const eintraege = info.eintraege;
        const belege = info.belege ?? 0;
        const teile = [];
        if (Number.isFinite(eintraege)) teile.push(mehrzahl(eintraege, 'Eintrag', 'Einträge'));
        if (belege) teile.push(mehrzahl(belege, 'Beleg', 'Belege'));
        const weiter = await Confirm.loeschen({
          titel: `Fach „${ordner.name}" löschen?`,
          text: 'Dieses Fach ist nicht leer. Mitgelöscht werden:',
          liste: teile,
          hinweis: 'Das lässt sich nicht zurücknehmen.',
          bestaetigen: 'Alles löschen',
        });
        if (!weiter) return;
        try {
          await DB.deleteNotenOrdner(ordner.id, { kaskade: true });
          Toast.success('Fach', 'Fach samt Einträgen gelöscht.');
          await zeigeDetail();
        } catch (e2) { Toast.error('Fach', e2.message); }
      }
    }

    /* ── Eintrag anlegen / bearbeiten ─────────────────────────────── */
    function eintragModal(ordnerId, eintrag) {
      // Beim Anlegen ist die Eintrags-Id noch unbekannt; Belege lassen sich
      // erst nach dem Speichern anhängen. Deshalb hält das Modal seinen
      // eigenen Zustand und schaltet nach dem ersten Speichern um.
      let aktuelleId = eintrag ? eintrag.id : null;
      // Merkt sich, ob die Note gerade AUS PUNKTEN gefüllt wurde. Nur dann
      // darf die Live-Umrechnung sie überschreiben — eine getippte Note
      // gehört dem Nutzer.
      let noteAusPunktenLive = !!(eintrag && eintrag.noteAusPunkten);
      const standardArt = istDh ? 'semesterpruefung' : 'klassenarbeit';

      const artOptions = N.ARTEN.map(a => {
        const gewaehlt = eintrag ? eintrag.art === a.id : a.id === standardArt;
        return `<option value="${a.id}"${gewaehlt ? ' selected' : ''}>${esc(a.label)}</option>`;
      }).join('');
      const statusOptions = N.STATUS_WERTE.map(s => {
        const gewaehlt = eintrag ? eintrag.status === s.id : s.id === 'bestanden';
        return `<option value="${s.id}"${gewaehlt ? ' selected' : ''}>${esc(s.label)}</option>`;
      }).join('');
      const nurBestanden = !!(eintrag && N.istBestandenOhneNote(eintrag));

      const ov = baueModal(MODAL_EINTRAG, eintrag ? 'Eintrag bearbeiten' : 'Neuer Eintrag', `
        <div class="noten-form">
        <div class="form-group">
          <label class="form-label" for="notenTitel">Titel</label>
          <input class="form-control" id="notenTitel" type="text" maxlength="${N.TITEL_MAX}"
                 placeholder="${istDh ? 'z.B. Klausur Maschinendynamik' : 'z.B. Klassenarbeit Textanalyse'}"
                 value="${eintrag ? esc(eintrag.titel) : ''}">
        </div>
        <div class="noten-form-reihe">
          <div class="form-group">
            <label class="form-label" for="notenArt">Art</label>
            <select class="form-control" id="notenArt">${artOptions}</select>
          </div>
          <div class="form-group">
            <label class="form-label" for="notenDatum">Datum</label>
            <input class="form-control" id="notenDatum" type="date" value="${eintrag ? esc(eintrag.datum) : ''}">
          </div>
        </div>
        <!-- Nur für DH-Studenten: "b" wie im DUALIS-Notenspiegel. Es ist kein
             Notenwert, sondern eine leere Note bei Status "bestanden" —
             deshalb ein Umschalter und kein Sonderzeichen im Notenfeld. -->
        <div class="form-group" id="notenBewertungGruppe">
          <label class="form-label">Bewertung</label>
          <div class="noten-radio-reihe">
            <label class="noten-radio">
              <input type="radio" name="notenBewertung" value="note" ${nurBestanden ? '' : 'checked'}>
              <span>Note eintragen</span>
            </label>
            <label class="noten-radio">
              <input type="radio" name="notenBewertung" value="bestanden" ${nurBestanden ? 'checked' : ''}>
              <span>nur bestanden (b)</span>
            </label>
          </div>
        </div>
        <div class="noten-form-reihe">
          <div class="form-group" id="notenNoteGruppe">
            <label class="form-label" for="notenNote">Note</label>
            <input class="form-control" id="notenNote" type="text" inputmode="decimal" placeholder="z.B. 2,3"
                   value="${eintrag && eintrag.note !== null ? esc(N.formatNote(eintrag.note)) : ''}">
            <p class="form-hint" id="notenNoteHinweis">Komma oder Punkt, ${N.formatNote(N.NOTE_MIN)}
              bis ${N.formatNote(N.NOTE_MAX_FUER_ROLLE(user.role))}.</p>
          </div>
          <div class="form-group" id="notenPunkteGruppe">
            <label class="form-label" for="notenPunkte">IHK-Punkte</label>
            <input class="form-control" id="notenPunkte" type="number" min="0" max="${N.PUNKTE_MAX}" step="0.5"
                   value="${eintrag && eintrag.punkte !== null && eintrag.punkte !== undefined ? esc(eintrag.punkte) : ''}">
            <p class="form-hint" id="notenPunkteHinweis"></p>
          </div>
        </div>
        <div class="noten-form-reihe" id="notenDhReihe">
          <div class="form-group" id="notenCreditsGruppe">
            <label class="form-label" for="notenCredits">Credits</label>
            <input class="form-control" id="notenCredits" type="number" min="0" max="${N.CREDITS_MAX}" step="0.5"
                   value="${eintrag && eintrag.credits !== null && eintrag.credits !== undefined ? esc(eintrag.credits) : ''}">
            <p class="form-hint" id="notenCreditsHinweis">Zählen in die Semestersumme, sobald der Status
              „bestanden" ist.</p>
          </div>
          <div class="form-group" id="notenStatusGruppe">
            <label class="form-label" for="notenStatus">Status</label>
            <select class="form-control" id="notenStatus">${statusOptions}</select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="notenBemerkung">Bemerkung <span class="form-label__optional">(optional)</span></label>
          <textarea class="form-control" id="notenBemerkung" rows="2" maxlength="${N.BEMERKUNG_MAX}">${eintrag ? esc(eintrag.bemerkung || '') : ''}</textarea>
        </div>
        <div class="form-group" id="notenBelegGruppe">
          <label class="form-label">Belege</label>
          <div id="notenBelegListe" class="noten-belege"></div>
          <!-- ZWEI Felder, weil sie sich in genau einem Attribut unterscheiden
               müssen und ein Feld nicht beides kann:

               notenBelegInput  – ohne capture. Auf dem iPad öffnet das das
                 VOLLE Auswahlfenster (Fotos / Foto aufnehmen / Dateien
                 durchsuchen). Über "Dateien durchsuchen" kommt auch ein
                 Dokumentenscan aus der Dateien-App herein, und wo iPadOS
                 einen Scan-Eintrag im Auswahlfenster anbietet, erscheint er
                 nur ohne einengendes accept.

               notenBelegKamera – mit capture="environment". Das überspringt
                 das Auswahlfenster und öffnet die Rückkamera SOFORT. Kein
                 multiple: eine Aufnahme ist ein Bild.

             Den iPadOS-Dokumentenscanner selbst kann eine Webseite NICHT
             aufrufen — capture kennt nur "user" und "environment", beides
             liefert ein Foto. Wer Kantenerkennung und Mehrseiten-PDF
             braucht, scannt in der Dateien-App und wählt hier aus. -->
          <input type="file" id="notenBelegInput" hidden multiple accept="${N.ACCEPT_BELEG}">
          <input type="file" id="notenBelegKamera" hidden accept="image/*" capture="environment">
          <div class="noten-beleg-aktionen">
            <button type="button" class="btn btn-outline btn-sm" id="notenBelegBtn">
              ${Icon('upload', { size: 18 })} Scan oder Datei wählen</button>
            <!-- icons.js ist auto-generiert und hat keine Kamera; Inline-SVG im
                 gleichen Stil (24er-Raster, 1,5 Strichstärke, currentColor) —
                 dasselbe Vorgehen wie bei den .dh-topbar-Symbolen. -->
            <button type="button" class="btn btn-outline btn-sm" id="notenBelegKameraBtn" hidden>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                   stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 9.5c0-1.2.97-2.17 2.17-2.17h1.4c.7 0 1.35-.36 1.72-.96l.62-1.01c.36-.6 1.01-.96 1.72-.96h2.74c.7 0 1.36.36 1.72.96l.62 1.01c.37.6 1.02.96 1.72.96h1.4c1.2 0 2.17.97 2.17 2.17v7.34c0 1.2-.97 2.16-2.17 2.16H5.17A2.17 2.17 0 0 1 3 16.84z"/>
                <circle cx="12" cy="13" r="3.2"/>
              </svg>
              Foto aufnehmen</button>
          </div>
          <p class="form-hint" id="notenBelegHinweis">Auf dem iPad öffnet „Scan oder Datei wählen" die
            Auswahl mit „Dateien durchsuchen" – dort liegt auch ein Dokumentenscan aus der Dateien-App
            (dort über „…" → „Dokumente scannen"). „Foto aufnehmen" geht direkt auf die Kamera.
            Max. 10 MB je Datei.</p>
        </div>
        </div>`, `
        <button type="button" class="btn btn-secondary" data-modal-close>${eintrag ? 'Abbrechen' : 'Schließen'}</button>
        <button type="button" class="btn btn-primary" id="notenEintragSpeichern">Speichern</button>`);

      const feld = (id) => ov.querySelector('#' + id);
      const bewertung = () => {
        const gewaehlt = ov.querySelector('input[name="notenBewertung"]:checked');
        return gewaehlt ? gewaehlt.value : 'note';
      };

      // Rollenabhängige Felder ein Mal fest ausblenden: Credits und Status
      // sind DH-Sache, IHK-Punkte Azubi-Sache. Beides gleichzeitig weist
      // schon core.pruefeEintrag ab — hier wird es gar nicht angeboten.
      feld('notenBewertungGruppe').hidden = !istDh;
      feld('notenDhReihe').hidden = !istDh;

      /* Punktefeld nur bei Azubi-Prüfungen: Klassenarbeiten haben keine
         IHK-Punkte, und DH-Studenten seit Migration 046 gar keine mehr. */
      function aktualisiereArtAbhaengiges() {
        const art = N.artById(feld('notenArt').value);
        const zeigtPunkte = !istDh && !!(art && art.zeigtPunkte);
        feld('notenPunkteGruppe').hidden = !zeigtPunkte;
        aktualisiereBewertung();
      }

      /* „nur bestanden (b)" heißt: keine Note, Status zwingend bestanden.
         Das Statusfeld wird dann gesperrt, statt es widersprüchlich
         bedienbar zu lassen. */
      function aktualisiereBewertung() {
        const nur = istDh && bewertung() === 'bestanden';
        feld('notenNoteGruppe').hidden = nur;
        if (nur) {
          feld('notenNote').value = '';
          feld('notenStatus').value = 'bestanden';
          const inst = feld('notenStatus')._pmInstance;
          if (inst && inst.setValue) inst.setValue('bestanden');
        }
        feld('notenStatus').disabled = nur;
        const wrapper = feld('notenStatus').closest('.pm-select');
        if (wrapper) wrapper.classList.toggle('pm-select--disabled', nur);
        aktualisierePunkteHinweis();
      }

      /* LIVE-Umrechnung Punkte → Note, nicht erst beim Speichern.
         Sie greift nur noch beim Azubi: DH-Studenten tragen seit Migration
         046 keine Punkte mehr ein, die DHBW-Tabelle ist stillgelegt.

         Die Note wird nur überschrieben, wenn sie leer ist oder zuvor selbst
         aus Punkten gefüllt wurde — eine getippte Note gehört dem Nutzer und
         behält ihren Vorrang (dieselbe Regel wie in
         core.zusammenfuehreEintrag). */
      function aktualisierePunkteHinweis() {
        const hinweis = feld('notenPunkteHinweis');
        if (feld('notenPunkteGruppe').hidden) { hinweis.textContent = ''; return; }
        const rohPunkte = feld('notenPunkte').value;
        const p = N.parsePunkte(rohPunkte);
        if (p === null) {
          hinweis.textContent = rohPunkte.trim() === ''
            ? '' : `Höchstens ${N.PUNKTE_MAX} Punkte, halbe Punkte erlaubt.`;
          return;
        }
        const abgeleitet = N.noteAusPunkten(p, { dh: false });
        if (abgeleitet === null) { hinweis.textContent = ''; return; }
        const noteFeld = feld('notenNote');
        if (noteFeld.value.trim() === '' || noteAusPunktenLive) {
          noteFeld.value = N.formatNote(abgeleitet);
          noteAusPunktenLive = true;
          hinweis.textContent = `Note ${N.formatNote(abgeleitet)} aus den Punkten übernommen – überschreibbar.`;
        } else {
          hinweis.textContent = `${p} Punkte entsprechen Note ${N.formatNote(abgeleitet)}.`;
        }
      }

      /* Der Umkehrweg Note → Punkte ist NICHT eindeutig: eine Note deckt
         immer eine Punktespanne ab (Note 1,9 sind 87 bis 88 Punkte). Statt
         eine Punktzahl zu erfinden, die so nie auf dem Zeugnis stand, wird
         die Spanne als Hinweis gezeigt. */
      function aktualisiereNoteHinweis() {
        const basis = `Komma oder Punkt, ${N.formatNote(N.NOTE_MIN)} bis ${N.formatNote(N.NOTE_MAX_FUER_ROLLE(user.role))}.`;
        const hinweis = feld('notenNoteHinweis');
        if (istDh || feld('notenPunkteGruppe').hidden) { hinweis.textContent = basis; return; }
        const n = N.parseNote(feld('notenNote').value);
        if (n === null) { hinweis.textContent = basis; return; }
        const treffer = [];
        for (let p = 0; p <= N.PUNKTE_MAX; p++) {
          if (N.noteAusPunkten(p, { dh: false }) === n) treffer.push(p);
        }
        hinweis.textContent = treffer.length
          ? `${basis} Note ${N.formatNote(n)} entspricht ${treffer.length === 1
              ? `${treffer[0]} Punkten` : `${treffer[0]}–${treffer[treffer.length - 1]} Punkten`}.`
          : basis;
      }

      function aktualisiereCreditsHinweis() {
        if (!istDh) return;
        const s = N.statusById(feld('notenStatus').value);
        feld('notenCreditsHinweis').textContent = (s && s.zaehltCredits)
          ? 'Zählen in die Semestersumme.'
          : `Zählen NICHT in die Semestersumme – nur bestandene Module werden addiert.`;
      }

      function zeigeBelege() {
        const liste = feld('notenBelegListe');
        const belege = (aktuelleId && findeEintrag(aktuelleId)) ? findeEintrag(aktuelleId).belege : [];
        liste.innerHTML = belege.length ? belege.map(b => belegHtml(b, true)).join('')
          : '<p class="form-hint">Noch keine Belege.</p>';
        liste.querySelectorAll('[data-beleg]').forEach(b => b.addEventListener('click', async (e) => {
          e.preventDefault();
          await loescheBeleg(+b.dataset.beleg, { ohneRender: true });
          zeigeBelege();
        }));
        // Vor dem ersten Speichern gibt es keine Eintrags-Id, an die ein
        // Beleg hängen könnte — beide Wege müssen gesperrt sein.
        feld('notenBelegBtn').disabled = !aktuelleId;
        feld('notenBelegKameraBtn').disabled = !aktuelleId;
        if (!aktuelleId) {
          feld('notenBelegHinweis').textContent = 'Erst speichern – danach können Belege angehängt werden.';
        }
      }

      feld('notenArt').addEventListener('change', aktualisiereArtAbhaengiges);
      feld('notenPunkte').addEventListener('input', aktualisierePunkteHinweis);
      feld('notenStatus').addEventListener('change', aktualisiereCreditsHinweis);
      feld('notenNote').addEventListener('input', () => {
        // Ab hier ist die Note getippt, nicht berechnet.
        noteAusPunktenLive = false;
        aktualisiereNoteHinweis();
      });
      ov.querySelectorAll('input[name="notenBewertung"]').forEach(r =>
        r.addEventListener('change', aktualisiereBewertung));

      aktualisiereArtAbhaengiges();
      aktualisiereNoteHinweis();
      aktualisiereCreditsHinweis();
      zeigeBelege();

      /* Der Kamera-Knopf erscheint nur auf Touchgeräten. Am Desktop öffnet
         capture bloß denselben Dateidialog — ein Knopf "Foto aufnehmen", der
         einen Dateidialog aufmacht, verspricht etwas Falsches.
         (pointer: coarse) statt einer Breitenabfrage: das 11"-iPad liegt bei
         834/1194 px und rutscht durch jedes px-Raster, siehe
         docs/ios-touch-verhalten.md.) */
      const kameraBtn = feld('notenBelegKameraBtn');
      const hatFinger = !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches);
      kameraBtn.hidden = !hatFinger;

      feld('notenBelegBtn').addEventListener('click', () => feld('notenBelegInput').click());
      kameraBtn.addEventListener('click', () => feld('notenBelegKamera').click());

      // Beide Felder laufen in denselben Ablauf: prüfen, verkleinern, hochladen.
      const nimmDateien = async (e) => {
        const dateien = [...e.target.files];
        e.target.value = ''; // damit dieselbe Datei erneut gewählt werden kann
        for (const datei of dateien) {
          if (!N.endungErlaubt(datei.name)) {
            Toast.error('Beleg', `„${datei.name}": Dateityp nicht erlaubt.`);
            continue;
          }
          try {
            // iPad-Fotos vor dem Upload verkleinern (2000 px, JPEG) – HEIC
            // scheitert am Decoder und geht unverändert durch.
            const klein = await N.verkleinereBild(datei);
            if (klein.size > N.MAX_BELEG_BYTES) {
              Toast.error('Beleg', `„${datei.name}" ist größer als 10 MB.`);
              continue;
            }
            await DB.uploadNotenBeleg(aktuelleId, klein);
            Toast.success('Beleg', `„${datei.name}" hinzugefügt.`);
          } catch (err) {
            Toast.error('Beleg', err.message);
          }
        }
        await ladeDaten();
        zeigeBelege();
        // Nach einem Beleg-Upload soll die Seite hinter dem Modal stimmen,
        // ohne das offene Modal zu verlieren (renderDetail baut #mainContent
        // neu, das Modal hängt am body und bleibt erhalten).
        renderDetail();
      };
      feld('notenBelegInput').addEventListener('change', nimmDateien);
      feld('notenBelegKamera').addEventListener('change', nimmDateien);

      feld('notenEintragSpeichern').addEventListener('click', async () => {
        const art = feld('notenArt').value;
        const zeigtPunkte = !istDh && !!(N.artById(art) && N.artById(art).zeigtPunkte);
        const nurBest = istDh && bewertung() === 'bestanden';
        const daten2 = {
          titel: feld('notenTitel').value,
          art,
          datum: feld('notenDatum').value,
          note: nurBest || feld('notenNote').value.trim() === '' ? null : feld('notenNote').value.trim(),
          punkte: (!zeigtPunkte || feld('notenPunkte').value === '') ? null : feld('notenPunkte').value,
          // Credits und Status nur mitschicken, wenn sie fachlich greifen —
          // sonst weist core.pruefeEintrag den Eintrag zu Recht ab.
          credits: istDh && feld('notenCredits').value !== '' ? feld('notenCredits').value : null,
          status: istDh ? (nurBest ? 'bestanden' : feld('notenStatus').value) : null,
          bemerkung: feld('notenBemerkung').value.trim() || null,
        };
        const problem = N.pruefeEintrag(daten2, user.role);
        if (problem) { Toast.error('Eintrag', problem); return; }
        try {
          if (aktuelleId) {
            await DB.patchNotenEintrag(aktuelleId, daten2);
            Modal.close(MODAL_EINTRAG);
            Toast.success('Eintrag', 'Eintrag gespeichert.');
            await zeigeDetail();
          } else {
            const neu = await DB.addNotenEintrag(ordnerId, daten2);
            aktuelleId = neu.id;
            await ladeDaten();
            renderDetail();
            zeigeBelege();
            // Das Modal bleibt offen, damit direkt Belege angehängt werden
            // können — dann muss es aber auch sagen, dass es jetzt einen
            // bestehenden Eintrag bearbeitet. Ein weiterer Klick auf
            // Speichern ist ab hier ein PATCH, kein zweiter Eintrag.
            const titelEl = ov.querySelector('.modal__title');
            if (titelEl) titelEl.textContent = 'Eintrag bearbeiten';
            feld('notenBelegHinweis').textContent = 'Eintrag gespeichert – jetzt können Belege angehängt werden.';
            Toast.success('Eintrag', 'Eintrag angelegt. Belege können jetzt angehängt werden.');
          }
        } catch (e) {
          Toast.error('Eintrag', e.message);
        }
      });

      Modal.open(MODAL_EINTRAG);
      feld('notenTitel').focus();
    }

    async function loescheEintrag(eintrag) {
      if (!eintrag) return;
      const weiter = await Confirm.loeschen({
        titel: 'Eintrag löschen?',
        text: `„${eintrag.titel}" wird endgültig entfernt.`,
        liste: eintrag.belege.length
          ? [eintrag.belege.length === 1
              ? '1 Beleg wird mitgelöscht'
              : mehrzahl(eintrag.belege.length, 'Beleg', 'Belege') + ' werden mitgelöscht']
          : [],
      });
      if (!weiter) return;
      try {
        await DB.deleteNotenEintrag(eintrag.id);
        Toast.success('Eintrag', 'Eintrag gelöscht.');
        await zeigeDetail();
      } catch (e) { Toast.error('Eintrag', e.message); }
    }

    async function loescheBeleg(id, opts2 = {}) {
      const beleg = (daten.ordner || []).flatMap(o => o.eintraege || [])
        .flatMap(e => e.belege || []).find(b => b.id === id);
      const weiter = await Confirm.loeschen({
        titel: 'Beleg löschen?',
        text: beleg
          ? `„${beleg.dateiname}" wird endgültig entfernt.`
          : 'Der Beleg wird endgültig entfernt.',
      });
      if (!weiter) return;
      try {
        await DB.deleteNotenBeleg(id);
        if (opts2.ohneRender) { await ladeDaten(); }
        else { await zeigeDetail(); }
      } catch (e) { Toast.error('Beleg', e.message); }
    }

    /* ── Start ────────────────────────────────────────────────────── */
    if (!nurEigene) {
      try {
        azubis = await DB.getNotenAzubis({ mitSchnitt: true });
      } catch (e) {
        azubis = [];
      }
      // Direkteinstieg aus einer Mitteilung: noten.html?azubi=<oid>
      const ausUrl = new URLSearchParams(location.search).get('azubi');
      const gemerkt = ausUrl || getPersistedAzubiId();
      const treffer = azubis.find(a => a.oid === gemerkt);
      if (treffer) {
        viewAzubiId = treffer.oid;
        await zeigeDetail();
        return;
      }
      // Ein Ausbilder, der selbst kein Azubi ist, startet in der Übersicht.
      if (!user.istAzubi) { renderUebersicht(); return; }
    }
    await zeigeDetail();
  }

  global.NotenUI = { start };
})(window);
