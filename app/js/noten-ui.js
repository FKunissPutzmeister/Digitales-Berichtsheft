/* ===================================================================
   NOTEN-UI.JS — geteilte Darstellung für „Noten & Zeugnisse"
   Design-Specs:
     docs/superpowers/specs/2026-09-01-noten-zeugnisse-design.md
     docs/superpowers/specs/2026-09-02-noten-abschnitte-credits-design.md
   Gestaltung: Entwurf B (Liste) — oben die Zeiträume als Schalter,
   links die Fächer des Zeitraums, rechts die Einträge des Fachs.

   Wird von ZWEI Shells benutzt, weil DH-Studenten keine Sidebar haben,
   sondern eine eigene .dh-topbar-Shell (siehe dh-profil.html):
     app/js/noten.js      → Azubi- und Ausbilder-Ansicht (mit Sidebar)
     app/js/dh-noten.js   → DH-Shell (ohne Azubi-Auswahl)

   Drei Ebenen seit Migration 046:
     Abschnitt (Ausbildungsjahr | SoSe/WiSe) → Fach-Ordner → Prüfungen

   Diese Seite RECHNET NICHTS: keine Durchschnitte, keine Credit-Summen.
   Das macht ausschließlich der Notenspiegel (noten-tabelle*.js). Hier
   stehen nur die Einzelwerte eines Eintrags.

   Einträge öffnen sich IN der Liste (Akkordeon), nicht in einem Panel
   oder Dialog. Bearbeiten macht aus dem aufgeklappten Bereich ein
   Formular an Ort und Stelle. Immer nur ein Eintrag ist offen.

   Re-entrant: der SPA-Router (app/js/router.js) führt Seiten-Scripts beim
   zweiten Besuch erneut in new Function() aus, #mainContent bleibt dabei
   DASSELBE Element. Der Zustand liegt deshalb in start(), und alle
   Listener hängen an einem AbortController, den der nächste start()
   abbricht — sonst liefen Klicks doppelt.
   =================================================================== */
(function (global) {
  'use strict';

  const N = global.Noten;
  const esc = global.escapeHtml;
  const MODAL_ABSCHNITT = 'notenAbschnittModal';
  const MODAL_ORDNER = 'notenOrdnerModal';
  const KLAPP_MS = 220;

  const fmtKurz = (iso) => (iso ? DateUtil.formatDate(String(iso).slice(0, 10), { year: '2-digit' }) : '–');
  const fmtLang = (iso) => (iso ? DateUtil.formatDate(String(iso).slice(0, 10), { day: 'numeric', month: 'long' }) : '–');

  // Strich-Symbole im Stil von icons.js (24er-Raster, currentColor).
  const I = {
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    zurueck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    klammer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m21 11-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8L13.2 3.2a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6L15 6.6"/></svg>',
    datei: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-5-5-8.5 8.5"/></svg>',
    stift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
    eimer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
    spiegel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 8.5h8M8 12h8M8 15.5h5"/></svg>',
  };

  /* "1 Fach" / "3 Fächer" statt "3 Fach/Fächer". */
  function mehrzahl(anzahl, eins, viele) {
    return Number(anzahl) + ' ' + (Number(anzahl) === 1 ? eins : viele);
  }

  /* Die Farbwahl des Fach-Dialogs: die Töne der Palette plus "keine Farbe".
     Echte Radio-Buttons, keine Klick-Divs — damit kommen Tastatur
     (Pfeiltasten innerhalb der Gruppe), Screenreader und das
     "genau eines"-Verhalten ohne eigenen Code.

     Der Wert ist der HEXWERT: die API speichert Hex. Leerer Wert = keine
     Farbe.

     Trägt das Fach noch einen Ton der FRÜHEREN Palette, steht genau dieser
     Ton als erstes, vorausgewähltes Feld da. Er ist sonst nicht mehr
     wählbar — ohne dieses Feld wäre beim Umbenennen nichts gewählt und die
     Farbe ginge beim Speichern stillschweigend verloren. */
  function farbwahlHtml(aktuell) {
    const gewaehlt = (N.normalisiereFarbe(aktuell) || '');
    const feld = (wert, titel, inhalt) => `<label class="noten-farbwahl__feld" title="${esc(titel)}">
        <input type="radio" name="notenOrdnerFarbe" value="${esc(wert)}"${wert === gewaehlt ? ' checked' : ''}>
        ${inhalt}
        <span class="sr-only">${esc(titel)}</span>
      </label>`;
    const tupfer = (hex) => `<span class="noten-farbwahl__tupfer" aria-hidden="true" style="background:${hex}"></span>`;

    const keine = feld('', 'Keine Farbe',
      '<span class="noten-farbwahl__tupfer noten-farbwahl__tupfer--keine" aria-hidden="true"></span>');
    const bisher = N.istAlteFarbe(gewaehlt) ? feld(gewaehlt, 'Bisherige Farbe', tupfer(gewaehlt)) : '';
    const toene = N.FACH_FARBEN.map(f => feld(f.hex, f.label, tupfer(f.hex))).join('');
    return keine + bisher + toene;
  }

  /* Der Punkt in Fachfarbe. Die Farbe geht in ein style-Attribut —
     deshalb NUR über N.istHexFarbe, sonst könnte ein gespeicherter Wert
     weitere CSS-Deklarationen einschmuggeln. Ohne Farbe: neutraler Punkt. */
  function punkt(farbe) {
    return N.istHexFarbe(farbe)
      ? `<span class="nb-dot" style="background:${farbe.trim()}" aria-hidden="true"></span>`
      : '<span class="nb-dot nb-dot--ohne" aria-hidden="true"></span>';
  }

  function artLabel(id) {
    const a = N.artById(id);
    return a ? a.label : id;
  }

  const hat = (wert) => wert !== null && wert !== undefined && wert !== '';

  /* ── Modal-Gerüst (nur noch für Zeitraum und Fach) ─────────────── */
  // Jedes Mal frisch aufbauen: so stimmen die selected-Attribute der
  // <select>-Felder, ohne über _pmInstance.setValue nachsteuern zu müssen
  // (PMSelect verwandelt jedes .form-control-select automatisch).
  function baueModal(id, titel, bodyHtml, footerHtml) {
    const alt = document.getElementById(id);
    if (alt) alt.remove();
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.id = id;
    ov.innerHTML = `<div class="modal">
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

  /* ── Einstiegspunkt ─────────────────────────────────────────────── */
  /**
   * @param {object} opts
   *   user         – der eingeloggte Nutzer (aus initPage/requireAuth)
   *   host         – Container-Element (#mainContent)
   *   mitAzubiWahl – true in der Sidebar-Shell: Ausbilder bekommen die
   *                  Übersichtsliste. In der DH-Shell false (der
   *                  DH-Student sieht nur sich).
   *   spiegelHref  – Ziel des Notenspiegel-Knopfes
   */
  async function start(opts) {
    const { user, host } = opts;
    const mitAzubiWahl = opts.mitAzubiWahl !== false;
    const spiegelHref = opts.spiegelHref || 'noten-tabelle.html';

    // Ein zweiter start() auf demselben Host (SPA-Router) räumt die
    // Listener des ersten ab.
    if (host._notenAbbruch) host._notenAbbruch.abort();
    const abbruch = new AbortController();
    host._notenAbbruch = abbruch;
    const signal = abbruch.signal;

    // Azubis/DH-Studenten sehen nur sich; für alle anderen ist die
    // Übersichtsliste der Einstieg.
    const nurEigene = !mitAzubiWahl || (!!user.istAzubi && !user.istAusbilder && !user.istAusbildungsleiter);
    // Schreiben darf nur der Eigentümer, also entscheidet SEINE Rolle über
    // die Formularfelder.
    const istDh = user.role === 'dhstudent';
    const zeitraumWort = istDh ? 'Semester' : 'Ausbildungsjahr';

    let azubis = [];
    let viewAzubiId = user.oid;
    let daten = null;
    let ansicht = 'detail'; // 'detail' | 'uebersicht'

    /* Zustand der Ansicht. abschnittId/ordnerId überleben jedes Neuladen
       der Daten; was es nicht mehr gibt, fällt in waehleGueltige() auf
       einen sinnvollen Nachbarn zurück. */
    const ui = {
      abschnittId: undefined,   // undefined = noch nichts gewählt, null = "Ohne Zuordnung"
      ordnerId: null,
      offenId: null,            // aufgeklappter Eintrag
      modus: null,              // null | 'ansicht' | 'bearbeiten' | 'neu'
      nav: 'fach',              // nur schmal: 'liste' (Fächer) | 'fach'
      entwurf: [],              // gewählte Dateien eines NEUEN Eintrags: { id, file, url }
    };
    let entwurfZaehler = 0;
    const schmal = () => !!(global.matchMedia && global.matchMedia('(max-width: 899px)').matches);
    if (schmal()) ui.nav = 'liste';

    /* ── Daten ────────────────────────────────────────────────────── */
    async function ladeDaten() {
      daten = await DB.getNoten(viewAzubiId === user.oid ? null : viewAzubiId);
    }

    const darf = () => !!(daten && daten.darfBearbeiten);
    // Chronologisch von links nach rechts, die Auffanggruppe ganz hinten.
    const gruppen = () => {
      const g = N.gruppiereOrdnerNachAbschnitt(daten.abschnitte, daten.ordner);
      const echte = g.filter(x => x.id !== null).reverse();
      return echte.concat(g.filter(x => x.id === null));
    };
    const findeAbschnitt = (id) => (daten.abschnitte || []).find(a => a.id === id) || null;
    const findeOrdner = (id) => (daten.ordner || []).find(o => o.id === id) || null;
    const findeEintrag = (id) => {
      for (const o of (daten.ordner || [])) {
        const e = (o.eintraege || []).find(x => x.id === id);
        if (e) return e;
      }
      return null;
    };
    const gruppeVon = (liste, id) => liste.find(g => g.id === id) || null;

    function waehleGueltige() {
      const liste = gruppen();
      // Standard: der jüngste Zeitraum MIT Einträgen – die Jahre 1–3 gibt es
      // von Anfang an, und Fächer laufen leer in die Folgejahre mit.
      let g = ui.abschnittId === undefined ? null : gruppeVon(liste, ui.abschnittId);
      if (!g) {
        const echte = liste.filter(x => x.id !== null);
        const mitEintraegen = echte.filter(x => x.ordner.some(o => (o.eintraege || []).length));
        g = mitEintraegen[mitEintraegen.length - 1] || echte[0] || liste[0] || null;
        ui.abschnittId = g ? g.id : undefined;
      }
      const ordner = g ? g.ordner : [];
      if (!ordner.some(o => o.id === ui.ordnerId)) {
        const mitInhalt = ordner.find(o => (o.eintraege || []).length);
        ui.ordnerId = (mitInhalt || ordner[0] || {}).id ?? null;
      }
      if (ui.offenId && !findeEintrag(ui.offenId)) { ui.offenId = null; if (ui.modus !== 'neu') ui.modus = null; }
      return { liste, g, ordner };
    }

    /* ── Bausteine ────────────────────────────────────────────────── */
    function zeileInnen(e) {
      const n = (e.belege || []).length;
      const dok = n ? `<span class="nb-row__dok" title="${mehrzahl(n, 'Beleg', 'Belege')}">${I.klammer}${n > 1 ? n : ''}<span class="sr-only">${mehrzahl(n, 'Beleg', 'Belege')}</span></span>` : '';
      let neben = '';
      if (hat(e.punkte)) neben = `<span class="nb-row__neben">${N.formatPunkte(e.punkte)} P.</span>`;
      else if (hat(e.credits)) neben = `<span class="nb-row__neben">${N.formatCredits(e.credits)} CP</span>`;
      const status = (e.status && e.status !== 'bestanden') ? N.statusLabel(e.status) : '';
      const unter = [status, e.bemerkung || ''].filter(Boolean).join(' · ');
      const b = N.istBestandenOhneNote(e);
      return `<span class="nb-row__titel"><b>${esc(e.titel)}</b>
          <span class="nb-row__art-klein">${esc(artLabel(e.art))}</span>
          ${unter ? `<span class="nb-row__bem">${esc(unter)}</span>` : ''}</span>
        <span class="nb-row__art nb-col-art">${esc(artLabel(e.art))}</span>
        <span class="nb-row__datum">${fmtKurz(e.datum)}</span>
        <span class="nb-row__dokspalte">${dok}</span>
        <span class="nb-row__note">${neben}<span class="nb-note${b ? ' nb-note--b' : ''}"${b ? ' title="bestanden, ohne Note"' : ''}>${esc(N.noteText(e))}</span></span>`;
    }

    function docListe(belege, darfLoeschen) {
      if (!belege.length) return '<p class="nb-docs-leer">Noch kein Dokument.</p>';
      return `<ul class="nb-docs">${belege.map(b => {
        const url = DB.notenBelegDownloadUrl(b.id);
        const typ = (N.endungVon(b.dateiname) || '').toUpperCase().slice(0, 4);
        const kachel = N.istBildVorschau(b.dateiname)
          ? `<img src="${esc(url)}" alt="" loading="lazy">` : esc(typ);
        return `<li class="nb-doc">
          <span class="nb-doc__kachel">${kachel}</span>
          <a class="nb-doc__open" href="${esc(url)}" target="_blank" rel="noopener">
            <span class="nb-doc__name">${esc(b.dateiname)}</span>
            <span class="nb-doc__meta">${N.istPdf(b.dateiname) ? 'PDF' : esc(typ)} · ${N.formatBytes(b.groesseBytes)}</span></a>
          ${darfLoeschen ? `<button type="button" class="btn btn-ghost btn-icon nb-icon" data-beleg-weg="${b.id}"
              aria-label="${esc(b.dateiname)} löschen" title="Löschen">${I.x}</button>` : ''}
        </li>`;
      }).join('')}</ul>`;
    }

    // Gewählte, noch nicht hochgeladene Dateien eines neuen Eintrags.
    function entwurfListe() {
      if (!ui.entwurf.length) return '<p class="nb-docs-leer">Noch kein Dokument.</p>';
      return `<ul class="nb-docs">${ui.entwurf.map(d => {
        const typ = (N.endungVon(d.file.name) || '').toUpperCase().slice(0, 4);
        const kachel = d.url ? `<img src="${esc(d.url)}" alt="">` : esc(typ);
        return `<li class="nb-doc">
          <span class="nb-doc__kachel">${kachel}</span>
          <span class="nb-doc__open"><span class="nb-doc__name">${esc(d.file.name)}</span>
            <span class="nb-doc__meta">${N.istPdf(d.file.name) ? 'PDF' : esc(typ)} · ${N.formatBytes(d.file.size)}</span></span>
          <button type="button" class="btn btn-ghost btn-icon nb-icon" data-entwurf-weg="${d.id}"
              aria-label="${esc(d.file.name)} entfernen" title="Entfernen">${I.x}</button>
        </li>`;
      }).join('')}</ul>`;
    }

    /* EIN echtes Datei-Feld, nur optisch versteckt. Auf dem iPad öffnet es das
       Systemmenü (Foto-Mediathek · Foto aufnehmen · Datei auswählen). Den
       iPadOS-Dokumentscanner kann eine Webseite nicht starten (WebKit bietet
       ihn nicht an) – ein Scan aus der Dateien-App kommt über „Datei auswählen".
       capture bewusst NICHT: das überspringt das Menü und öffnet nur die Kamera. */
    const docKnoepfe = () => `<div class="nb-doc-add">
        <label class="btn btn-outline nb-file">${I.datei}<span>Dokument</span>
          <input type="file" accept="application/pdf,image/*,.heic,.heif" multiple data-upload></label>
      </div>`;

    function detailHtml(e) {
      const kann = darf();
      const zeilen = [['Datum', fmtLang(e.datum)]];
      if (hat(e.punkte)) zeilen.push(['Punkte', `${N.formatPunkte(e.punkte)} von ${hat(e.maxPunkte) ? N.formatPunkte(e.maxPunkte) : N.PUNKTE_MAX}`]);
      if (hat(e.credits)) zeilen.push(['Credits', `${N.formatCredits(e.credits)} CP`]);
      if (e.status) zeilen.push(['Status', esc(N.statusLabel(e.status))]);
      if (e.aktualisiertAm) zeilen.push(['Geändert', fmtKurz(e.aktualisiertAm)]);
      return `<div class="nb-detail">
        <div class="nb-detail__links">
          <dl class="nb-dl">${zeilen.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
          ${e.bemerkung ? `<div class="nb-sektion"><h4 class="nb-label">Bemerkung</h4><p class="nb-bem">${esc(e.bemerkung)}</p></div>` : ''}
        </div>
        <div class="nb-sektion nb-detail__rechts"><h4 class="nb-label">Dokumente</h4>
          <div data-docs>${docListe(e.belege || [], kann)}</div>
          ${kann ? docKnoepfe() : ''}
        </div>
        ${kann ? `<div class="nb-detail__fuss">
          <button type="button" class="btn btn-ghost nb-leise-rot" data-act="loeschen">${I.eimer}Löschen</button>
          <span class="nb-spacer"></span>
          <button type="button" class="btn btn-outline" data-act="bearbeiten">${I.stift}Bearbeiten</button>
        </div>` : ''}
      </div>`;
    }

    function formHtml(e) {
      const neu = !e;
      const standardArt = istDh ? 'semesterpruefung' : 'klassenarbeit';
      const art = e ? e.art : standardArt;
      const arten = N.ARTEN.map(a => `<option value="${a.id}"${a.id === art ? ' selected' : ''}>${esc(a.label)}</option>`).join('');
      const stat = e && e.status ? e.status : 'bestanden';
      const status = N.STATUS_WERTE.map(s => `<option value="${s.id}"${s.id === stat ? ' selected' : ''}>${esc(s.label)}</option>`).join('');
      const nurB = !!(e && N.istBestandenOhneNote(e));
      const wert = (v) => (hat(v) ? esc(v) : '');
      return `<form class="nb-form" novalidate data-form="${neu ? 'neu' : e.id}">
        <div class="nb-detail">
          <div class="nb-detail__links nb-felder">
            <label class="nb-feld nb-feld--breit"><span>Titel<span class="nb-pflicht" aria-hidden="true">*</span></span>
              <input class="nb-input" name="titel" aria-required="true" maxlength="${N.TITEL_MAX}" autocomplete="off" value="${e ? esc(e.titel) : ''}"></label>
            <label class="nb-feld"><span>Art</span>
              <select class="nb-input" name="art" data-pm-skip>${arten}</select></label>
            <label class="nb-feld"><span>Datum</span>
              <input class="nb-input" type="date" name="datum" value="${e && e.datum ? esc(e.datum) : ''}"></label>
            ${istDh ? `<div class="nb-feld nb-feld--breit" role="radiogroup" aria-label="Bewertung"><span>Bewertung</span>
              <div class="nb-radios">
                <label class="nb-radio"><input type="radio" name="bewertung" value="note"${nurB ? '' : ' checked'}><span>Note</span></label>
                <label class="nb-radio"><input type="radio" name="bewertung" value="bestanden"${nurB ? ' checked' : ''}><span>nur bestanden (b)</span></label>
              </div></div>` : ''}
            <label class="nb-feld" data-feld="note"${nurB ? ' hidden' : ''}><span>Note<span class="nb-pflicht" aria-hidden="true">*</span></span>
              <input class="nb-input nb-note-input" name="note" aria-required="true" inputmode="decimal" autocomplete="off"
                     value="${e && hat(e.note) ? esc(N.formatNote(e.note)) : ''}"></label>
            ${istDh ? `<label class="nb-feld"><span>Credits</span>
                <input class="nb-input" type="number" name="credits" min="0" max="${N.CREDITS_MAX}" step="0.5" value="${e ? wert(e.credits) : ''}"></label>
              <label class="nb-feld"><span>Status</span>
                <select class="nb-input" name="status" data-pm-skip${nurB ? ' disabled' : ''}>${status}</select></label>`
            : `<label class="nb-feld" data-feld="punkte"><span>IHK-Punkte</span>
                <input class="nb-input" type="number" name="punkte" min="0" max="${N.PUNKTE_MAX}" step="0.5" value="${e ? wert(e.punkte) : ''}"></label>`}
            <label class="nb-feld nb-feld--breit"><span>Bemerkung</span>
              <textarea class="nb-input" name="bemerkung" rows="2" maxlength="${N.BEMERKUNG_MAX}">${e ? esc(e.bemerkung || '') : ''}</textarea></label>
          </div>
          <div class="nb-sektion nb-detail__rechts"><h4 class="nb-label">Dokumente</h4>
            <div data-docs>${neu ? entwurfListe() : docListe(e.belege || [], true)}</div>
            ${docKnoepfe()}
          </div>
          <p class="nb-fehler" role="alert" hidden></p>
          <div class="nb-detail__fuss">
            <span class="nb-spacer"></span>
            <button type="button" class="btn btn-ghost" data-act="abbrechen">Abbrechen</button>
            <button type="submit" class="btn btn-primary">Speichern</button>
          </div>
        </div>
      </form>`;
    }

    function eintragHtml(e, offen) {
      const inhalt = offen ? (ui.modus === 'bearbeiten' ? formHtml(e) : detailHtml(e)) : '';
      return `<li class="nb-eintrag" data-eintrag="${e.id}" data-offen="${offen ? '1' : '0'}"${offen && ui.modus === 'bearbeiten' ? ' data-modus="bearbeiten"' : ''}>
        <button type="button" class="nb-row" data-zeile="${e.id}" aria-expanded="${offen ? 'true' : 'false'}" aria-controls="nbKlapp${e.id}">${zeileInnen(e)}</button>
        <div class="nb-klapp" id="nbKlapp${e.id}"><div class="nb-klapp__innen">${inhalt}</div></div>
      </li>`;
    }

    const neuZeileHtml = (offen) => `<li class="nb-eintrag nb-eintrag--neu" data-eintrag="neu" data-offen="${offen ? '1' : '0'}" data-modus="neu">
        <div class="nb-klapp"><div class="nb-klapp__innen">
          <h3 class="nb-label nb-neu-titel">Neuer Eintrag</h3>${formHtml(null)}</div></div>
      </li>`;

    /* ── Rendern ──────────────────────────────────────────────────── */
    function renderUebersicht() {
      ansicht = 'uebersicht';
      const zeilen = azubis.map(a => `<button type="button" class="nb-row nb-row--azubi" data-azubi="${esc(a.oid)}">
          <span class="nb-row__titel"><b>${esc(displayName(a.name))}</b></span>
          <span class="nb-z nb-col-art">${esc(a.role === 'dhstudent' ? 'DH-Student' : 'Azubi')}</span>
          <span class="nb-z">${esc(a.abschnittAktuell || '–')}</span>
          <span class="nb-zahl">${a.anzahlEintraege}</span>
          <span class="nb-z nb-r">${a.letzterEintrag ? fmtKurz(a.letzterEintrag) : '–'}</span>
        </button>`).join('');
      host.innerHTML = `<div class="nb">
        <div class="nb-kopf"><div class="nb-kopf__titel"><h1 class="page-title nb-h1">Noten &amp; Zeugnisse</h1></div></div>
        <div class="card nb-flaeche nb-azubis">
          ${azubis.length ? `<div class="nb-rows nb-rows--azubis">
            <div class="nb-rows__kopf"><span class="nb-label">Name</span><span class="nb-label nb-col-art">Art</span>
              <span class="nb-label">Aktueller Zeitraum</span><span class="nb-label nb-r">Einträge</span>
              <span class="nb-label nb-r">Letzter Eintrag</span></div>
            ${zeilen}</div>`
          : '<div class="nb-leer"><p>Keine Azubis zugeordnet.</p></div>'}
        </div>
      </div>`;
    }

    function kopfHtml(liste) {
      const fremd = !nurEigene && viewAzubiId !== user.oid;
      const person = fremd ? azubis.find(a => a.oid === viewAzubiId) : null;
      const crumb = nurEigene ? ''
        : `<button type="button" class="nb-crumb" data-act="uebersicht">${I.zurueck}Alle Azubis</button>`;
      const titel = person
        ? `${esc(displayName(person.name))}<span class="nb-sub">Noten &amp; Zeugnisse</span>`
        : 'Noten &amp; Zeugnisse';
      const seg = liste.map(g => `<button type="button" role="tab" data-abschnitt="${g.id === null ? 'ohne' : g.id}"
          aria-selected="${g.id === ui.abschnittId}">${g.label === null ? 'Ohne Zuordnung' : esc(g.label)}</button>`).join('');
      const spiegelZiel = fremd ? `${spiegelHref}?azubi=${encodeURIComponent(viewAzubiId)}` : spiegelHref;
      return `<div class="nb-kopf">
        <div class="nb-kopf__titel">${crumb}<h1 class="page-title nb-h1">${titel}</h1></div>
        <span class="nb-spacer"></span>
        <div class="nb-kopf__zeitraum">
          ${liste.length ? `<div class="nb-seg-scroll"><div class="nb-seg" role="tablist" aria-label="Zeitraum">${seg}</div></div>` : ''}
          ${darf() && N.abschnittKandidaten(user.role, daten.abschnitte).length ? `<button type="button" class="btn btn-ghost btn-icon nb-icon" data-act="abschnitt-neu"
              aria-label="${zeitraumWort} hinzufügen" title="${zeitraumWort} hinzufügen">${I.plus}</button>` : ''}
        </div>
        ${liste.length ? `<a class="btn btn-outline nb-spiegel" href="${esc(spiegelZiel)}">${I.spiegel}Notenspiegel</a>` : ''}
      </div>`;
    }

    function faecherHtml(g, ordner) {
      const kann = darf() && g && g.id !== null;
      const items = ordner.map(o => {
        const n = (o.eintraege || []).length;
        return `<li><button type="button" class="nb-fach-item" data-ordner="${o.id}" aria-current="${o.id === ui.ordnerId}">
          ${punkt(o.farbe)}
          <span class="nb-fach-item__name">${esc(o.name)}</span>
          <span class="nb-fach-item__n">${n || ''}</span></button></li>`;
      }).join('');
      const zeitraum = g ? (g.label === null ? 'Ohne Zuordnung' : g.label) : '';
      return `<div class="nb-faecher__kopf"><h2 class="nb-label">Fächer</h2>
          ${kann ? `<button type="button" class="btn btn-ghost btn-icon nb-icon" data-act="fach-neu"
              aria-label="Fach anlegen" title="Fach anlegen">${I.plus}</button>` : ''}</div>
        ${ordner.length ? `<ul class="nb-fachlist">${items}</ul>` : ''}
        ${kann && istDh ? `<div class="nb-faecher__fuss">
          <button type="button" class="nb-textknopf" data-act="abschnitt-loeschen">${esc(zeitraum)} löschen</button></div>` : ''}`;
    }

    function fachHtml(g, ordner) {
      const kann = darf();
      if (!g) return '';
      if (!ordner.length) {
        return `<div class="nb-leer"><p><strong>${esc(g.label === null ? 'Ohne Zuordnung' : g.label)}</strong> hat noch keine Fächer.</p>
          ${kann && g.id !== null ? `<button type="button" class="btn btn-outline" data-act="fach-neu">${I.plus}Fach anlegen</button>` : ''}</div>`;
      }
      const o = findeOrdner(ui.ordnerId);
      if (!o) return '';
      const list = o.eintraege || [];
      const offenId = ui.modus === 'neu' ? null : ui.offenId;
      const zeilen = list.map(e => eintragHtml(e, e.id === offenId)).join('');
      const neu = ui.modus === 'neu' ? neuZeileHtml(true) : '';
      const leer = (!list.length && !neu)
        ? `<div class="nb-leer"><p><strong>${esc(o.name)}</strong> hat noch keine Einträge.</p>
            ${kann ? `<button type="button" class="btn btn-outline" data-act="neu">${I.plus}Ersten Eintrag anlegen</button>` : ''}</div>` : '';
      return `<div class="nb-fach__kopf">
          <button type="button" class="btn btn-ghost btn-icon nb-icon nb-back" data-act="zurueck" aria-label="Zurück zu den Fächern">${I.zurueck}</button>
          ${punkt(o.farbe)}
          <h2 class="nb-fach__name">${esc(o.name)}</h2>
          <span class="nb-fach__n">${mehrzahl(list.length, 'Eintrag', 'Einträge')}</span>
          <span class="nb-spacer"></span>
          ${kann ? `<button type="button" class="btn btn-ghost btn-icon nb-icon" data-act="fach-bearbeiten" aria-label="Fach bearbeiten" title="Fach bearbeiten">${I.stift}</button>
            <button type="button" class="btn btn-ghost btn-icon nb-icon" data-act="fach-loeschen" aria-label="Fach löschen" title="Fach löschen">${I.eimer}</button>
            <button type="button" class="btn btn-primary nb-neu" data-act="neu">${I.plus}Eintrag</button>` : ''}
        </div>
        ${(list.length || neu) ? `<div class="nb-rows">
          <div class="nb-rows__kopf" aria-hidden="true"><span class="nb-label">Titel</span><span class="nb-label nb-col-art">Art</span>
            <span class="nb-label">Datum</span><span></span><span class="nb-label nb-r">Note</span></div>
          <ul class="nb-liste">${neu}${zeilen}</ul></div>` : leer}`;
    }

    function renderDetail() {
      ansicht = 'detail';
      const { liste, g, ordner } = waehleGueltige();
      const leer = !liste.length;
      host.innerHTML = `<div class="nb">
        ${kopfHtml(liste)}
        ${leer ? `<div class="card nb-flaeche"><div class="nb-leer">
            <p>${darf() ? `Noch kein ${zeitraumWort} angelegt.` : 'Hier erscheinen die Noten, sobald sie eingetragen wurden.'}</p>
            ${darf() ? `<button type="button" class="btn btn-primary" data-act="abschnitt-neu">${I.plus}${zeitraumWort} anlegen</button>` : ''}
          </div></div>`
        : `<div class="card nb-flaeche nb-work" data-nav="${ui.nav}">
            <aside class="nb-col nb-faecher" aria-label="Fächer">${faecherHtml(g, ordner)}</aside>
            <section class="nb-col nb-fach" aria-label="Einträge">${fachHtml(g, ordner)}</section>
          </div>`}
      </div>`;
      passeHoehe();
      bindeFormular();
    }

    /* Die Arbeitsfläche füllt das Fenster bis unten; Fächer und Einträge
       scrollen in sich, Kopf und Zeitraum-Schalter bleiben stehen. Gemessen
       statt fest gerechnet, weil die beiden Shells verschieden hohe
       Kopfzeilen haben. */
    function passeHoehe() {
      const w = host.querySelector('.nb-work');
      if (!w) return;
      const oben = w.getBoundingClientRect().top + (global.scrollY || 0);
      const unten = parseFloat(getComputedStyle(host).paddingBottom) || 0;
      w.style.height = `max(420px, calc(100dvh - ${Math.round(oben + unten)}px))`;
    }

    function renderFach() {
      const el = host.querySelector('.nb-fach');
      if (!el) { renderDetail(); return; }
      const { g, ordner } = waehleGueltige();
      el.innerHTML = fachHtml(g, ordner);
      bindeFormular();
    }

    function render() {
      if (ansicht === 'uebersicht') renderUebersicht();
      else renderDetail();
    }

    // Fehlt eine Migration oder ist der Server nicht erreichbar, darf die
    // Seite nicht einfach leer bleiben.
    function renderFehler(err) {
      host.innerHTML = `<div class="nb">
        <div class="nb-kopf"><div class="nb-kopf__titel"><h1 class="page-title nb-h1">Noten &amp; Zeugnisse</h1></div></div>
        <div class="card nb-flaeche"><div class="nb-leer">
          <p><strong>Die Noten konnten nicht geladen werden.</strong></p>
          <p>${esc(err && err.message ? err.message : 'Unbekannter Fehler')}</p>
        </div></div></div>`;
    }

    /* Azubis haben immer das 1.–3. Ausbildungsjahr; das 4. kommt über „+".
       ponytail: legt fehlende Jahre beim Öffnen der EIGENEN Noten an (einmalig,
       409 = gibt es schon). */
    async function sichereStandardJahre() {
      if (!darf() || istDh) return false;
      const da = new Set((daten.abschnitte || []).filter(a => a.typ === 'ausbildungsjahr').map(a => Number(a.nr)));
      const fehlt = [1, 2, 3].filter(n => !da.has(n));
      for (const nr of fehlt) {
        try { await DB.addNotenAbschnitt({ typ: 'ausbildungsjahr', nr }); } catch (e) { if (e.status !== 409) throw e; }
      }
      return fehlt.length > 0;
    }

    async function zeigeDetail() {
      try {
        await ladeDaten();
        if (await sichereStandardJahre()) await ladeDaten();
      } catch (err) { renderFehler(err); return; }
      ansicht = 'detail';
      renderDetail();
    }

    async function neuLaden() {
      try { await ladeDaten(); } catch (err) { Toast.error('Noten', err.message); return; }
      render();
    }

    /* ── Auf- und Zuklappen ───────────────────────────────────────── */
    const liVon = (id) => host.querySelector(`.nb-eintrag[data-eintrag="${id}"]`);

    function klappZu(li) {
      if (!li || li.dataset.offen !== '1') return;
      li.dataset.offen = '0';
      li.removeAttribute('data-modus');
      const knopf = li.querySelector('.nb-row');
      if (knopf) knopf.setAttribute('aria-expanded', 'false');
      // Neue, leere Zeile: nach dem Zuklappen ganz entfernen.
      const istNeu = li.dataset.eintrag === 'neu';
      setTimeout(() => {
        if (li.dataset.offen === '1') return;
        if (istNeu) {
          const ul = li.parentElement;
          li.remove();
          if (ul && !ul.children.length) renderFach();
        } else {
          const innen = li.querySelector('.nb-klapp__innen');
          if (innen) innen.innerHTML = '';
        }
      }, KLAPP_MS);
    }

    function klappAuf(li, html) {
      li.querySelector('.nb-klapp__innen').innerHTML = html;
      const knopf = li.querySelector('.nb-row');
      if (knopf) knopf.setAttribute('aria-expanded', 'true');
      void li.offsetHeight; // Startzustand festschreiben, sonst springt es ohne Übergang auf
      li.dataset.offen = '1';
      bindeFormular();
      setTimeout(() => li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), KLAPP_MS);
    }

    function verwirfEntwurf() {
      ui.entwurf.forEach(d => { if (d.url) URL.revokeObjectURL(d.url); });
      ui.entwurf = [];
    }

    function schliesseOffenen() {
      if (ui.modus === 'neu') { klappZu(liVon('neu')); verwirfEntwurf(); }
      else if (ui.offenId) klappZu(liVon(ui.offenId));
      ui.offenId = null;
      ui.modus = null;
    }

    function oeffne(id) {
      if (ui.offenId === id && ui.modus !== 'neu') { schliesseOffenen(); return; }
      schliesseOffenen();
      const e = findeEintrag(id);
      const li = liVon(id);
      if (!e || !li) return;
      ui.offenId = id;
      ui.modus = 'ansicht';
      klappAuf(li, detailHtml(e));
    }

    function bearbeiten() {
      const e = findeEintrag(ui.offenId);
      const li = liVon(ui.offenId);
      if (!e || !li) return;
      ui.modus = 'bearbeiten';
      li.dataset.modus = 'bearbeiten';
      li.querySelector('.nb-klapp__innen').innerHTML = formHtml(e);
      bindeFormular();
      const t = li.querySelector('[name="titel"]');
      if (t) t.focus({ preventScroll: true });
    }

    function zurAnsicht() {
      const e = findeEintrag(ui.offenId);
      const li = liVon(ui.offenId);
      if (!e || !li) return;
      ui.modus = 'ansicht';
      li.removeAttribute('data-modus');
      li.querySelector('.nb-klapp__innen').innerHTML = detailHtml(e);
      const k = li.querySelector('.nb-row');
      if (k) k.focus({ preventScroll: true });
    }

    function neuerEintrag() {
      if (ui.modus === 'neu') {
        const t = host.querySelector('.nb-eintrag--neu [name="titel"]');
        if (t) t.focus();
        return;
      }
      schliesseOffenen();
      ui.modus = 'neu';
      let ul = host.querySelector('.nb-liste');
      if (!ul) {
        // Leeres Fach: die Liste entsteht erst mit der neuen Zeile.
        renderFach();
        ul = host.querySelector('.nb-liste');
        const li = liVon('neu');
        if (li) { const t = li.querySelector('[name="titel"]'); if (t) t.focus({ preventScroll: true }); }
        return;
      }
      ul.insertAdjacentHTML('afterbegin', neuZeileHtml(false));
      const li = liVon('neu');
      void li.offsetHeight;
      li.dataset.offen = '1';
      bindeFormular();
      const t = li.querySelector('[name="titel"]');
      if (t) t.focus({ preventScroll: true });
      li.scrollIntoView({ block: 'nearest' });
    }

    /* ── Formular ─────────────────────────────────────────────────── */
    /* Punkte → Note LIVE, wie bisher: die Note wird nur überschrieben,
       wenn sie leer ist oder zuvor selbst aus Punkten gefüllt wurde — eine
       getippte Note gehört dem Nutzer (dieselbe Regel wie in
       core.zusammenfuehreEintrag). */
    let noteAusPunktenLive = false;

    function bindeFormular() {
      const form = host.querySelector('.nb-form');
      if (!form) return;
      const e = form.dataset.form === 'neu' ? null : findeEintrag(Number(form.dataset.form));
      noteAusPunktenLive = !!(e && e.noteAusPunkten);
      aktualisiereFelder(form);
    }

    function aktualisiereFelder(form) {
      const art = N.artById(form.art.value);
      const punkteFeld = form.querySelector('[data-feld="punkte"]');
      if (punkteFeld) punkteFeld.hidden = !(art && art.zeigtPunkte);
      if (istDh) {
        const nur = (form.querySelector('input[name="bewertung"]:checked') || {}).value === 'bestanden';
        form.querySelector('[data-feld="note"]').hidden = nur;
        if (nur) { form.note.value = ''; form.status.value = 'bestanden'; }
        form.status.disabled = nur;
      }
    }

    function punkteGeaendert(form) {
      const p = N.parsePunkte(form.punkte.value);
      if (p === null) return;
      const abgeleitet = N.noteAusPunkten(p, { dh: false });
      if (abgeleitet === null) return;
      if (form.note.value.trim() === '' || noteAusPunktenLive) {
        form.note.value = N.formatNote(abgeleitet);
        noteAusPunktenLive = true;
      }
    }

    function formularDaten(form) {
      const art = form.art.value;
      const zeigtPunkte = !istDh && !!(N.artById(art) && N.artById(art).zeigtPunkte);
      const nurB = istDh && (form.querySelector('input[name="bewertung"]:checked') || {}).value === 'bestanden';
      return {
        titel: form.titel.value,
        art,
        datum: form.datum.value,
        note: nurB || form.note.value.trim() === '' ? null : form.note.value.trim(),
        punkte: (!zeigtPunkte || !form.punkte || form.punkte.value === '') ? null : form.punkte.value,
        // Credits und Status nur mitschicken, wenn sie fachlich greifen —
        // sonst weist core.pruefeEintrag den Eintrag zu Recht ab.
        credits: istDh && form.credits.value !== '' ? form.credits.value : null,
        status: istDh ? (nurB ? 'bestanden' : form.status.value) : null,
        bemerkung: form.bemerkung.value.trim() || null,
      };
    }

    function zeigeFehler(form, text) {
      const p = form.querySelector('.nb-fehler');
      if (!p) return;
      p.textContent = text || '';
      p.hidden = !text;
    }

    async function speichern(form) {
      const werte = formularDaten(form);
      const problem = N.pruefeEintrag(werte, user.role);
      // Pflichtfelder (Titel, Note): Feld markieren + ein Toast, kein Hinweistext.
      const fehlt = {
        titel: !String(werte.titel || '').trim(),
        note: N.pruefeEintrag(Object.assign({}, werte, { titel: 'x' }), user.role) === 'Note fehlt.',
      };
      Object.keys(fehlt).forEach(f => {
        const feld = form.querySelector(`[name="${f}"]`);
        if (feld) feld.setAttribute('aria-invalid', String(fehlt[f]));
      });
      if (fehlt.titel || fehlt.note) {
        zeigeFehler(form, '');
        Toast.error('Eintrag', fehlt.titel && fehlt.note ? 'Titel und Note fehlen.' : fehlt.titel ? 'Titel fehlt.' : 'Note fehlt.');
        form.querySelector('[aria-invalid="true"]').focus();
        return;
      }
      if (problem) { zeigeFehler(form, problem); return; }
      zeigeFehler(form, '');
      const knopf = form.querySelector('button[type="submit"]');
      if (knopf) knopf.disabled = true;
      try {
        if (ui.modus === 'neu') {
          const neu = await DB.addNotenEintrag(ui.ordnerId, werte);
          const dateien = ui.entwurf.map(d => d.file);
          verwirfEntwurf();
          ui.modus = 'ansicht';
          ui.offenId = neu.id;
          if (dateien.length) await ladeHoch(neu.id, dateien);
          Toast.success('Eintrag', 'Eintrag angelegt.');
        } else {
          await DB.patchNotenEintrag(ui.offenId, werte);
          ui.modus = 'ansicht';
          Toast.success('Eintrag', 'Eintrag gespeichert.');
        }
        await neuLaden();
        const li = liVon(ui.offenId);
        if (li) { const k = li.querySelector('.nb-row'); if (k) k.focus({ preventScroll: true }); }
      } catch (err) {
        zeigeFehler(form, err.message);
        if (knopf) knopf.disabled = false;
      }
    }

    /* ── Belege ───────────────────────────────────────────────────── */
    // Prüfen, verkleinern (iPad-Fotos auf 2000 px, JPEG), hochladen.
    async function ladeHoch(eintragId, dateien) {
      let ok = 0;
      for (const datei of dateien) {
        if (!N.endungErlaubt(datei.name)) {
          Toast.error('Dokument', `„${datei.name}": Dateityp nicht erlaubt.`);
          continue;
        }
        try {
          const klein = await N.verkleinereBild(datei);
          if (klein.size > N.MAX_BELEG_BYTES) {
            Toast.error('Dokument', `„${datei.name}" ist größer als 10 MB.`);
            continue;
          }
          await DB.uploadNotenBeleg(eintragId, klein);
          ok++;
        } catch (err) {
          Toast.error('Dokument', err.message);
        }
      }
      return ok;
    }

    /* Nach einem Upload/Löschen nur die Dokumente und die Zeile des offenen
       Eintrags auffrischen — ein Neuaufbau würde ein offenes Formular samt
       Eingaben verwerfen. */
    function frischeEintrag(id) {
      const e = findeEintrag(id);
      const li = liVon(id);
      if (!e || !li) return;
      const knopf = li.querySelector('.nb-row');
      if (knopf) knopf.innerHTML = zeileInnen(e);
      const docs = li.querySelector('[data-docs]');
      if (docs) docs.innerHTML = docListe(e.belege || [], darf());
    }

    async function dateienGewaehlt(input) {
      const dateien = [...(input.files || [])];
      input.value = ''; // damit dieselbe Datei erneut gewählt werden kann
      if (!dateien.length) return;
      if (ui.modus === 'neu') {
        // Neuer Eintrag: erst merken, nach dem Speichern hochladen.
        dateien.forEach(file => {
          if (!N.endungErlaubt(file.name)) { Toast.error('Dokument', `„${file.name}": Dateityp nicht erlaubt.`); return; }
          ui.entwurf.push({ id: ++entwurfZaehler, file, url: N.istBildVorschau(file.name) ? URL.createObjectURL(file) : null });
        });
        const docs = host.querySelector('.nb-eintrag--neu [data-docs]');
        if (docs) docs.innerHTML = entwurfListe();
        return;
      }
      const id = ui.offenId;
      if (!id) return;
      const ok = await ladeHoch(id, dateien);
      if (ok) Toast.success('Dokument', ok === 1 ? 'Dokument hinzugefügt.' : `${ok} Dokumente hinzugefügt.`);
      try { await ladeDaten(); } catch (err) { Toast.error('Noten', err.message); return; }
      frischeEintrag(id);
    }

    async function loescheBeleg(belegId) {
      const e = findeEintrag(ui.offenId);
      const beleg = e && (e.belege || []).find(b => b.id === belegId);
      const weiter = await Confirm.loeschen({
        titel: 'Dokument löschen?',
        text: beleg ? `„${beleg.dateiname}" wird endgültig entfernt.` : 'Das Dokument wird endgültig entfernt.',
      });
      if (!weiter) return;
      try {
        await DB.deleteNotenBeleg(belegId);
        await ladeDaten();
        frischeEintrag(ui.offenId);
      } catch (err) { Toast.error('Dokument', err.message); }
    }

    async function loescheEintrag() {
      const e = findeEintrag(ui.offenId);
      if (!e) return;
      const n = (e.belege || []).length;
      const weiter = await Confirm.loeschen({
        titel: 'Eintrag löschen?',
        text: `„${e.titel}" wird endgültig entfernt.`,
        liste: n ? [n === 1 ? '1 Dokument wird mitgelöscht' : `${n} Dokumente werden mitgelöscht`] : [],
      });
      if (!weiter) return;
      try {
        await DB.deleteNotenEintrag(e.id);
        ui.offenId = null;
        ui.modus = null;
        Toast.success('Eintrag', 'Eintrag gelöscht.');
        await neuLaden();
      } catch (err) { Toast.error('Eintrag', err.message); }
    }

    /* ── Zeitraum anlegen / löschen ───────────────────────────────── */
    // Umbenennen gibt es nicht: ein Zeitraum IST sein (Typ, Nummer).
    async function naechstesJahr() {
      const frei = N.abschnittKandidaten(user.role, daten.abschnitte).filter(k => k.typ === 'ausbildungsjahr');
      if (!frei.length) return;
      const nr = Math.min(...frei.map(k => k.nr));
      try {
        const neu = await DB.addNotenAbschnitt({ typ: 'ausbildungsjahr', nr });
        // Die Fächer des Vorjahrs mitnehmen.
        const vorjahr = (daten.abschnitte || []).find(a => a.typ === 'ausbildungsjahr' && Number(a.nr) === nr - 1);
        if (neu && vorjahr) {
          for (const o of (daten.ordner || []).filter(x => x.abschnittId === vorjahr.id)) {
            await DB.addNotenOrdner({ name: o.name, abschnittId: neu.id, zaehltInSchnitt: o.zaehltInSchnitt, farbe: o.farbe }).catch(() => {});
          }
        }
        if (neu && neu.id !== undefined) { ui.abschnittId = neu.id; ui.ordnerId = null; }
        ui.offenId = null; ui.modus = null;
        await zeigeDetail();
      } catch (e) { Toast.error(zeitraumWort, e.message); }
    }

    function abschnittModal() {
      if (!istDh) { naechstesJahr(); return; }
      const kandidaten = N.abschnittKandidaten(user.role, daten.abschnitte);
      if (!kandidaten.length) {
        Toast.error(zeitraumWort, 'Es sind schon alle Zeiträume angelegt.');
        return;
      }
      const vorwahl = N.vorauswahlAbschnitt(user.role, kandidaten);
      const optionen = kandidaten.map((k) => {
        const gewaehlt = !!vorwahl && k.typ === vorwahl.typ && k.nr === vorwahl.nr;
        return `<option value="${k.typ}:${k.nr}"${gewaehlt ? ' selected' : ''}>${esc(N.abschnittLabel(k.typ, k.nr))}</option>`;
      }).join('');

      const ov = baueModal(MODAL_ABSCHNITT, `${zeitraumWort} hinzufügen`, `
        <div class="noten-form">
        <div class="form-group">
          <label class="form-label" for="notenAbschnittWahl">${zeitraumWort}</label>
          <select class="form-control" id="notenAbschnittWahl">${optionen}</select>
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
          const neu = await DB.addNotenAbschnitt({ typ, nr });
          Modal.close(MODAL_ABSCHNITT);
          Toast.success('Zeitraum', `${N.abschnittLabel(typ, nr)} angelegt.`);
          if (neu && neu.id !== undefined) { ui.abschnittId = neu.id; ui.ordnerId = null; }
          ui.offenId = null; ui.modus = null;
          await zeigeDetail();
        } catch (e) { Toast.error('Zeitraum', e.message); }
      });
    }

    async function loescheAbschnitt(abschnitt) {
      if (!abschnitt) return;
      const name = abschnitt.label || N.abschnittLabel(abschnitt.typ, abschnitt.nr) || 'Zeitraum';
      const fertig = async (text) => {
        Toast.success('Zeitraum', text);
        ui.abschnittId = undefined; ui.ordnerId = null; ui.offenId = null; ui.modus = null;
        await zeigeDetail();
      };
      try {
        // Erster Versuch ohne Kaskade: der Server antwortet mit 409 und den
        // Zahlen, wenn Fächer darin liegen.
        await DB.deleteNotenAbschnitt(abschnitt.id);
        await fertig(`${name} gelöscht.`);
      } catch (e) {
        if (e.status !== 409) { Toast.error('Zeitraum', e.message); return; }
        const info = e.daten || {};
        // Nur nennen, was der Server tatsächlich gezählt hat.
        const teile = [];
        if (Number.isFinite(info.ordner)) teile.push(mehrzahl(info.ordner, 'Fach', 'Fächer'));
        if (info.eintraege) teile.push(mehrzahl(info.eintraege, 'Eintrag', 'Einträge'));
        if (info.belege) teile.push(mehrzahl(info.belege, 'Dokument', 'Dokumente'));
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
          await fertig(`${name} samt Inhalt gelöscht.`);
        } catch (e2) { Toast.error('Zeitraum', e2.message); }
      }
    }

    /* ── Fach anlegen / bearbeiten ────────────────────────────────── */
    // Spätere Ausbildungsjahre (nur Azubis; DH-Semester haben jeweils eigene Module).
    function folgeJahre(abschnittId) {
      const a = findeAbschnitt(abschnittId);
      if (!a || a.typ !== 'ausbildungsjahr') return [];
      return (daten.abschnitte || []).filter(x => x.typ === 'ausbildungsjahr' && Number(x.nr) > Number(a.nr));
    }
    function folgeFaecher(abschnittId, name) {
      const ids = new Set(folgeJahre(abschnittId).map(a => a.id));
      const key = N.normalisiereOrdnerName(name).toLowerCase();
      return (daten.ordner || []).filter(o => ids.has(o.abschnittId) && N.normalisiereOrdnerName(o.name).toLowerCase() === key);
    }

    function ordnerModal(abschnittId, ordner) {
      const ist = !!ordner;
      // Beim Bearbeiten lässt sich das Fach in einen anderen Zeitraum
      // verschieben. Ein Fach OHNE Zeitraum (Altdaten) bekommt einen leeren
      // Platzhalter, damit Speichern es nicht ungefragt verschiebt.
      const ohneZeitraum = abschnittId === null || abschnittId === undefined;
      const zeitraumOptionen = (ohneZeitraum ? '<option value="" selected>– bitte wählen –</option>' : '')
        + N.sortiereAbschnitte(daten.abschnitte || []).map(a =>
          `<option value="${a.id}"${a.id === abschnittId ? ' selected' : ''}>${esc(a.label || N.abschnittLabel(a.typ, a.nr))}</option>`).join('');

      const ov = baueModal(MODAL_ORDNER, ist ? 'Fach bearbeiten' : 'Fach anlegen', `
        <div class="noten-form">
        <div class="form-group">
          <label class="form-label" for="notenOrdnerName">Name</label>
          <input class="form-control" id="notenOrdnerName" type="text" maxlength="${N.ORDNERNAME_MAX}"
                 placeholder="${istDh ? 'z.B. Maschinendynamik' : 'z.B. Englisch'}"
                 value="${ist ? esc(ordner.name) : ''}">
        </div>
        <div class="form-group">
          <span class="form-label" id="notenOrdnerFarbeLabel">Farbe</span>
          <div class="noten-farbwahl" role="radiogroup" aria-labelledby="notenOrdnerFarbeLabel">
            ${farbwahlHtml(ist ? ordner.farbe : null)}
          </div>
        </div>
        ${ist ? `<div class="form-group">
          <label class="form-label" for="notenOrdnerAbschnitt">Zeitraum</label>
          <select class="form-control" id="notenOrdnerAbschnitt">${zeitraumOptionen}</select>
        </div>
        <div class="form-group">
          <label class="pm-switch-row">
            <span class="pm-switch">
              <input type="checkbox" id="notenOrdnerZaehlt" class="pm-switch__input"${ordner.zaehltInSchnitt ? ' checked' : ''}>
              <span class="pm-switch__track" aria-hidden="true"><span class="pm-switch__thumb"></span></span>
            </span>
            <span>Zählt im Notenspiegel zum Durchschnitt</span>
          </label>
        </div>` : ''}
        </div>`, `
        <button type="button" class="btn btn-secondary" data-modal-close>Abbrechen</button>
        <button type="button" class="btn btn-primary" id="notenOrdnerSpeichern">${ist ? 'Speichern' : 'Anlegen'}</button>`);

      Modal.open(MODAL_ORDNER);
      const nameFeld = ov.querySelector('#notenOrdnerName');
      nameFeld.focus();
      const speichere = async () => {
        const name = nameFeld.value;
        const problem = N.pruefeOrdnerName(name);
        if (problem) { Toast.error('Fach', problem); return; }
        // Leerer Wert = keine Farbe. Beim PATCH ausdrücklich null und nicht
        // undefined, sonst liesse sich eine Farbe nie wieder abwählen.
        const farbe = (ov.querySelector('input[name="notenOrdnerFarbe"]:checked') || {}).value || null;
        try {
          if (ist) {
            const gewaehlt = parseInt(ov.querySelector('#notenOrdnerAbschnitt').value, 10);
            if (isNaN(gewaehlt)) { Toast.error('Fach', 'Bitte einen Zeitraum wählen.'); return; }
            const zaehltInSchnitt = ov.querySelector('#notenOrdnerZaehlt').checked;
            await DB.patchNotenOrdner(ordner.id, { name, zaehltInSchnitt, abschnittId: gewaehlt, farbe });
            // Dasselbe Fach in den folgenden Jahren zieht Name und Farbe mit.
            for (const z of folgeFaecher(ordner.abschnittId, ordner.name)) {
              await DB.patchNotenOrdner(z.id, { name, farbe }).catch(() => {});
            }
            ui.abschnittId = gewaehlt;
          } else {
            const neu = await DB.addNotenOrdner({ name, abschnittId, zaehltInSchnitt: true, farbe });
            if (neu && neu.id !== undefined) ui.ordnerId = neu.id;
            // Fächer laufen meist weiter: auch in den folgenden Jahren anlegen,
            // wegfallende löscht man dort einfach (409 = gibt es dort schon).
            for (const a of folgeJahre(abschnittId)) {
              await DB.addNotenOrdner({ name, abschnittId: a.id, zaehltInSchnitt: true, farbe }).catch(() => {});
            }
            ui.nav = 'fach';
          }
          Modal.close(MODAL_ORDNER);
          Toast.success('Fach', ist ? 'Fach geändert.' : 'Fach angelegt.');
          ui.offenId = null; ui.modus = null;
          await zeigeDetail();
        } catch (e) {
          Toast.error('Fach', e.message);
        }
      };
      ov.querySelector('#notenOrdnerSpeichern').addEventListener('click', speichere);
      nameFeld.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); speichere(); } });
    }

    async function loescheOrdner(ordner) {
      if (!ordner) return;
      const fertig = async (text) => {
        Toast.success('Fach', text);
        ui.ordnerId = null; ui.offenId = null; ui.modus = null;
        if (schmal()) ui.nav = 'liste';
        await zeigeDetail();
      };
      try {
        await DB.deleteNotenOrdner(ordner.id);
        await fertig('Fach gelöscht.');
      } catch (e) {
        if (e.status !== 409) { Toast.error('Fach', e.message); return; }
        const info = e.daten || {};
        const teile = [];
        if (Number.isFinite(info.eintraege)) teile.push(mehrzahl(info.eintraege, 'Eintrag', 'Einträge'));
        if (info.belege) teile.push(mehrzahl(info.belege, 'Dokument', 'Dokumente'));
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
          await fertig('Fach samt Einträgen gelöscht.');
        } catch (e2) { Toast.error('Fach', e2.message); }
      }
    }

    /* ── Ereignisse ───────────────────────────────────────────────── */
    async function waehleAzubi(oid) {
      viewAzubiId = oid;
      setPersistedAzubiId(viewAzubiId);
      Object.assign(ui, { abschnittId: undefined, ordnerId: null, offenId: null, modus: null, nav: schmal() ? 'liste' : 'fach' });
      verwirfEntwurf();
      await zeigeDetail();
    }

    host.addEventListener('click', (ev) => {
      if (!host.querySelector('.nb')) return;
      const t = ev.target.closest('[data-act],[data-abschnitt],[data-ordner],[data-zeile],[data-azubi],[data-beleg-weg],[data-entwurf-weg]');
      if (!t || !host.contains(t)) return;
      const d = t.dataset;
      if (d.azubi) { waehleAzubi(d.azubi); return; }
      if (d.abschnitt) {
        const id = d.abschnitt === 'ohne' ? null : Number(d.abschnitt);
        if (id === ui.abschnittId) return;
        verwirfEntwurf();
        Object.assign(ui, { abschnittId: id, ordnerId: null, offenId: null, modus: null, nav: schmal() ? 'liste' : 'fach' });
        renderDetail();
        return;
      }
      if (d.ordner) {
        const id = Number(d.ordner);
        verwirfEntwurf();
        Object.assign(ui, { ordnerId: id, offenId: null, modus: null, nav: 'fach' });
        renderDetail();
        return;
      }
      if (d.zeile) { oeffne(Number(d.zeile)); return; }
      if (d.belegWeg) { loescheBeleg(Number(d.belegWeg)); return; }
      if (d.entwurfWeg) {
        const id = Number(d.entwurfWeg);
        const weg = ui.entwurf.find(x => x.id === id);
        if (weg && weg.url) URL.revokeObjectURL(weg.url);
        ui.entwurf = ui.entwurf.filter(x => x.id !== id);
        const docs = host.querySelector('.nb-eintrag--neu [data-docs]');
        if (docs) docs.innerHTML = entwurfListe();
        return;
      }
      switch (d.act) {
        case 'uebersicht': schliesseOffenen(); renderUebersicht(); break;
        case 'abschnitt-neu': abschnittModal(); break;
        case 'abschnitt-loeschen': loescheAbschnitt(findeAbschnitt(ui.abschnittId)); break;
        case 'fach-neu': ordnerModal(ui.abschnittId, null); break;
        case 'fach-bearbeiten': { const o = findeOrdner(ui.ordnerId); if (o) ordnerModal(o.abschnittId, o); break; }
        case 'fach-loeschen': loescheOrdner(findeOrdner(ui.ordnerId)); break;
        case 'zurueck':
          schliesseOffenen();
          ui.nav = 'liste';
          renderDetail();
          break;
        case 'neu': neuerEintrag(); break;
        case 'bearbeiten': bearbeiten(); break;
        case 'loeschen': loescheEintrag(); break;
        case 'abbrechen':
          if (ui.modus === 'bearbeiten') zurAnsicht();
          else schliesseOffenen();
          break;
        default: break;
      }
    }, { signal });

    host.addEventListener('submit', (ev) => {
      const form = ev.target.closest('.nb-form');
      if (!form) return;
      ev.preventDefault();
      speichern(form);
    }, { signal });

    host.addEventListener('change', (ev) => {
      const t = ev.target;
      if (t.matches('[data-upload]')) { dateienGewaehlt(t); return; }
      const form = t.closest('.nb-form');
      if (form && (t.name === 'art' || t.name === 'bewertung')) aktualisiereFelder(form);
    }, { signal });

    host.addEventListener('input', (ev) => {
      const t = ev.target;
      const form = t.closest('.nb-form');
      if (!form) return;
      if (t.name === 'punkte') punkteGeaendert(form);
      if (t.name === 'note') noteAusPunktenLive = false; // ab hier getippt, nicht berechnet
      if (t.name === 'titel' || t.name === 'note' || t.name === 'datum') zeigeFehler(form, '');
      if (t.getAttribute('aria-invalid') === 'true') t.removeAttribute('aria-invalid');
      if (t.name === 'punkte') { const n = form.querySelector('[name="note"]'); if (n) n.removeAttribute('aria-invalid'); }
    }, { signal });

    /* Esc: Bearbeiten → zurück zur Ansicht, neuer Eintrag → verwerfen,
       offener Eintrag → zuklappen. Ein offener Dialog hat Vorrang —
       deshalb in der Capture-Phase: sonst schließt Modal.init den Dialog
       zuerst und dieser Handler klappt zusätzlich den Eintrag zu. */
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || !host.querySelector('.nb')) return;
      if (document.querySelector('.modal-overlay.open')) return;
      if (ui.modus === 'bearbeiten') { ev.preventDefault(); zurAnsicht(); return; }
      if (ui.modus) {
        ev.preventDefault();
        const zurueck = ui.offenId;
        schliesseOffenen();
        const li = zurueck && liVon(zurueck);
        if (li) { const k = li.querySelector('.nb-row'); if (k) k.focus({ preventScroll: true }); }
      }
    }, { signal, capture: true });

    let groesseTimer = null;
    global.addEventListener('resize', () => {
      clearTimeout(groesseTimer);
      groesseTimer = setTimeout(() => { if (host.querySelector('.nb-work')) passeHoehe(); }, 120);
    }, { signal });

    /* ── Start ────────────────────────────────────────────────────── */
    if (!nurEigene) {
      try {
        azubis = await DB.getNotenAzubis({ mitSchnitt: true });
      } catch (e) {
        azubis = [];
      }
      // Direkteinstieg aus einer Mitteilung: noten.html?azubi=<oid>
      const ausUrl = new URLSearchParams(location.search).get('azubi');
      // Wer selbst Azubi ist, landet auf den EIGENEN Noten (dort darf er
      // schreiben) – die gemerkte Auswahl anderer Seiten zählt nur für reine Betreuer.
      const gemerkt = ausUrl || (user.istAzubi ? null : getPersistedAzubiId());
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
