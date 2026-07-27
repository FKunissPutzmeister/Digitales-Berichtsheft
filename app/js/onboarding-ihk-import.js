/* ===================================================================
   ONBOARDING-IHK-IMPORT.JS – Kleiner Export/Import-Stepper für Azubis,
   die schon vor dem September-Jahrgangswechsel ein IHK-Berichtsheft
   geführt haben, plus ein kurzer Coachmark-Hinweis auf "Fehler melden".
   Wird explizit von dashboard.js (checkDashboard) und profil.js
   (checkProfil) aufgerufen, jeweils NACH dem Rendern der Seite, weil
   beide Aufrufer bereits den geladenen user haben.
   =================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  const STORAGE_PREFIX = 'onboarding:ihkImport:';

  // Azubis, deren allererstes Login vor diesem Stichtag liegt, hatten mit
  // hoher Wahrscheinlichkeit schon ein IHK-Berichtsheft (daher Import-Hinweis).
  // Der neue September-Jahrgang meldet sich danach zum ersten Mal an und
  // beginnt direkt in dieser App — für den ist der Hinweis nicht relevant.
  // Bewusst ein einmaliger, fest codierter Stichtag (kein wiederkehrender
  // Mechanismus): dieses Onboarding betrifft nur den Jahrgangswechsel 2026.
  const CUTOFF = new Date('2026-09-01T00:00:00Z');

  function istBerechtigt(user) {
    return !!(user && user.role === 'azubi' && user.ersteAnmeldung
      && new Date(user.ersteAnmeldung) < CUTOFF);
  }

  function getState(oid) {
    return localStorage.getItem(STORAGE_PREFIX + oid);
  }
  function setState(oid, value) {
    if (value === null) localStorage.removeItem(STORAGE_PREFIX + oid);
    else localStorage.setItem(STORAGE_PREFIX + oid, value);
  }

  function entferneKarte() {
    document.getElementById('onbCard')?.remove();
  }

  let spotlightSync = null;

  function setRect(el, left, top, width, height) {
    el.style.left   = Math.max(left, 0) + 'px';
    el.style.top    = Math.max(top, 0) + 'px';
    el.style.width  = Math.max(width, 0) + 'px';
    el.style.height = Math.max(height, 0) + 'px';
  }

  function entferneSpotlight() {
    document.getElementById('onbBlurWrap')?.remove();
    if (spotlightSync) {
      window.removeEventListener('scroll', spotlightSync, true);
      window.removeEventListener('resize', spotlightSync);
      spotlightSync = null;
    }
  }

  // Blendet den Hintergrund unscharf ab, bis auf das übergebene Zielelement
  // (bleibt scharf). Ohne Ziel wird die ganze Seite unscharf — dann zählt nur
  // die Onboarding-Karte selbst (sitzt per z-index über den Blur-Panels) als
  // "wesentliche Funktion", z.B. bei Willkommen/Schritt 1 ohne Seiten-Bezug.
  function spotlightAuf(ziel) {
    entferneSpotlight();
    const wrap = document.createElement('div');
    wrap.id = 'onbBlurWrap';
    const panels = [0, 1, 2, 3].map(() => {
      const p = document.createElement('div');
      p.className = 'onb-blur-panel';
      wrap.appendChild(p);
      return p;
    });
    document.body.appendChild(wrap);

    const update = () => {
      const vw = window.innerWidth, vh = window.innerHeight;
      if (!ziel || !ziel.isConnected) {
        setRect(panels[0], 0, 0, vw, vh);
        setRect(panels[1], 0, 0, 0, 0);
        setRect(panels[2], 0, 0, 0, 0);
        setRect(panels[3], 0, 0, 0, 0);
        return;
      }
      const r = ziel.getBoundingClientRect();
      const pad = 8;
      const x = Math.max(r.left - pad, 0);
      const y = Math.max(r.top - pad, 0);
      const w = Math.min(r.width + pad * 2, vw - x);
      const h = Math.min(r.height + pad * 2, vh - y);
      setRect(panels[0], 0, 0, vw, y);
      setRect(panels[1], 0, y + h, vw, vh - (y + h));
      setRect(panels[2], 0, y, x, h);
      setRect(panels[3], x + w, y, vw - (x + w), h);
    };
    update();
    spotlightSync = update;
    window.addEventListener('scroll', spotlightSync, true);
    window.addEventListener('resize', spotlightSync);
    setTimeout(update, 450); // nach evtl. smooth scrollIntoView nachjustieren
  }

  function baueKarte({ label, dotsHtml, title, text, footerHtml }) {
    entferneKarte();
    const card = document.createElement('div');
    card.className = 'onb-card';
    card.id = 'onbCard';
    card.innerHTML = `
      ${dotsHtml ? `<div class="onb-card__indicators">${dotsHtml}</div>` : ''}
      <div class="onb-card__label">${label}</div>
      <div class="onb-card__title">${title}</div>
      <div class="onb-card__text">${text}</div>
      <div class="onb-card__footer">${footerHtml}</div>
    `;
    document.body.appendChild(card);
    return card;
  }

  const DOTS_SCHRITT1 = `
    <div class="onb-dot onb-dot--active">1</div>
    <div class="onb-connector"></div>
    <div class="onb-dot onb-dot--upcoming">2</div>`;
  const DOTS_SCHRITT2 = `
    <div class="onb-dot onb-dot--done">✓</div>
    <div class="onb-connector onb-connector--done"></div>
    <div class="onb-dot onb-dot--active">2</div>`;
  const DOTS_FERTIG = `
    <div class="onb-dot onb-dot--done">✓</div>
    <div class="onb-connector onb-connector--done"></div>
    <div class="onb-dot onb-dot--done">✓</div>`;

  function gehZuImport(user) {
    setState(user.oid, 'step2');
    if (/profil\.html$/.test(location.pathname)) {
      document.getElementById('tab-import')?.click();
      zeigeSchritt2(user);
    } else {
      location.href = 'profil.html?tab=import';
    }
  }

  function zeigeWillkommen(user) {
    spotlightAuf(null);
    const card = baueKarte({
      label: 'Willkommen',
      dotsHtml: '',
      title: 'Willkommen im Berichtsheft!',
      text: 'Hier führst du dein Berichtsheft, siehst deinen Abteilungsdurchlauf inklusive Beurteilungen und kannst deine Fahrtgelderstattung erstellen.',
      footerHtml: `<button type="button" class="btn btn-primary btn-sm" id="onbWillkommenWeiter">Los geht's</button>`,
    });
    card.querySelector('#onbWillkommenWeiter').addEventListener('click', () => zeigeSchritt1(user));
  }

  function zeigeSchritt1(user) {
    spotlightAuf(null);
    const card = baueKarte({
      label: 'Schritt 1 von 2 · Export',
      dotsHtml: DOTS_SCHRITT1,
      title: 'Altes Berichtsheft exportieren',
      text: 'Lade zuerst dein bisheriges IHK-Berichtsheft von der IHK-Seite herunter. Die Anleitung dazu findest du im nächsten Schritt.',
      footerHtml: `
        <button type="button" class="btn btn-outline btn-sm" id="onbSkip">Bereits importiert</button>
        <button type="button" class="btn btn-primary btn-sm" id="onbWeiter">Weiter</button>`,
    });
    card.querySelector('#onbSkip').addEventListener('click', () => {
      setState(user.oid, 'done');
      entferneKarte();
      entferneSpotlight();
    });
    card.querySelector('#onbWeiter').addEventListener('click', () => gehZuImport(user));
  }

  // Öffnet die echte "IHK-Berichtsheft importieren"-Kachel und markiert die
  // darin verschachtelte Anleitung ("Wie bekomme ich den IHK-Ausbildungsnachweis?")
  // rot, statt nur vage auf "die Anleitung unten" zu verweisen — der Azubi
  // sieht so sofort, welches Element gemeint ist. Bleibt selbst zugeklappt,
  // damit der Azubi sie aktiv aufklappt (nur ein Hinweis, keine Bevormundung).
  // Die Markierung bleibt stehen, bis die Anleitung tatsächlich aufgeklappt
  // wird (kein Timeout) — erst der Klick zählt als "gesehen".
  function zeigeIhkAnleitung() {
    const kachel = document.getElementById('ihkSection');
    if (kachel) kachel.open = true;
    const tutorial = document.querySelector('#ihkSection .ztn-tutorial');
    const anleitung = tutorial?.querySelector('.ztn-tutorial__summary');
    if (anleitung) {
      anleitung.scrollIntoView({ behavior: 'smooth', block: 'center' });
      anleitung.classList.add('onboarding-ring-pulse', 'onboarding-ring-pulse--red', 'onboarding-ring-pulse--infinite');
      tutorial.addEventListener('toggle', () => {
        anleitung.classList.remove('onboarding-ring-pulse', 'onboarding-ring-pulse--red', 'onboarding-ring-pulse--infinite');
      }, { once: true });
    }
  }

  let ihkErfolgHandler = null;
  function entferneIhkErfolgListener() {
    if (ihkErfolgHandler) {
      document.removeEventListener('ihkImportErfolgreich', ihkErfolgHandler);
      ihkErfolgHandler = null;
    }
  }

  function zeigeSchritt2(user) {
    zeigeIhkAnleitung();
    spotlightAuf(document.getElementById('ihkSection'));
    const card = baueKarte({
      label: 'Schritt 2 von 2 · Import',
      dotsHtml: DOTS_SCHRITT2,
      title: 'Anleitung folgen',
      text: 'Öffne die rot markierte Anleitung „Wie bekomme ich den IHK-Ausbildungsnachweis?" — sie zeigt dir Schritt für Schritt, wie du dein aktuelles Berichtsheft von der IHK-Seite exportierst. Die exportierte PDF lädst du anschließend direkt hier hoch.',
      footerHtml: `<button type="button" class="btn btn-outline btn-sm" id="onbZurueck">Zurück</button>`,
    });
    card.querySelector('#onbZurueck').addEventListener('click', () => {
      entferneIhkErfolgListener();
      setState(user.oid, null);
      zeigeSchritt1(user);
    });

    // Kein manuelles "Fertig" mehr: der Import wird automatisch erkannt
    // (ihk-import.js meldet Erfolg per Event), statt den Azubi vorher
    // durchklicken zu lassen, ohne wirklich hochgeladen zu haben.
    entferneIhkErfolgListener();
    ihkErfolgHandler = (ev) => zeigeImportErfolgWeiter(user, ev.detail);
    document.addEventListener('ihkImportErfolgreich', ihkErfolgHandler, { once: true });
  }

  // ihk-import.js öffnet dabei bereits seinen EIGENEN Erfolgsdialog (mit
  // "Zur Wochenansicht"/"Schließen"). Der hat aber einen höheren z-index als
  // unsere Karte/Blur-Panels — läuft unser Hinweis währenddessen parallel,
  // sitzt er sichtbar "hinter" diesem Dialog fest und wirkt kaputt. Deshalb:
  // Dialog kurz schließen, EIGENE Bestätigung zeigen, und erst nach "Weiter"
  // den echten Dialog wieder freigeben (siehe zeigeImportErgebnis).
  function zeigeImportErfolgWeiter(user, summary) {
    ihkErfolgHandler = null;
    // Noch NICHT 'done' — erst wenn der Fehler-melden-Hinweis am Ende
    // tatsächlich durchlaufen wurde. So bleibt er "ausstehend" gespeichert,
    // falls der Azubi zwischendurch wegklickt, und wird beim nächsten
    // Profil-Besuch nachgeholt (siehe checkProfil), statt verloren zu gehen.
    setState(user.oid, 'fehlerHinweis');
    if (typeof Modal !== 'undefined') Modal.close('ihkImportModal');
    spotlightAuf(null);
    const anzahl = (summary && summary.uebernommen) || 0;
    const card = baueKarte({
      label: 'Schritt 2 von 2 · Import',
      dotsHtml: DOTS_FERTIG,
      title: 'Import abgeschlossen',
      text: `${anzahl} ${anzahl === 1 ? 'Woche wurde' : 'Wochen wurden'} importiert.`,
      footerHtml: `<button type="button" class="btn btn-primary btn-sm" id="onbWeiterZumErgebnis">Weiter</button>`,
    });
    card.querySelector('#onbWeiterZumErgebnis').addEventListener('click', () => {
      entferneKarte();
      zeigeImportErgebnis(user, summary);
    });
  }

  // Frühestes betroffenes Woche-Objekt (gleiche Sortierung wie in
  // ihk-import.js' renderSuccess) — wird für den "Zur Wochenansicht"-Sprung
  // gebraucht, den wir jetzt selbst nachbauen (siehe zeigeImportErgebnis).
  function ersteWoche(summary) {
    const wochen = (summary && summary.betroffeneWochen) || [];
    return wochen.slice().sort((a, b) => a.year - b.year || a.kw - b.kw)[0] || null;
  }

  // Ersetzt ein Element durch eine listener-freie Kopie (cloneNode kopiert
  // keine JS-Listener) — so lässt sich der Klick-Handler von ihk-import.js
  // sauber durch unseren eigenen ersetzen, ohne an dessen Timing/Reihenfolge
  // gebunden zu sein.
  function ersetzeOhneListener(el) {
    if (!el) return null;
    const ersatz = el.cloneNode(true);
    el.replaceWith(ersatz);
    return ersatz;
  }

  function zeigeImportErgebnis(user, summary) {
    if (typeof Modal !== 'undefined') Modal.open('ihkImportModal');
    // Blur bleibt aktiv (voller Seiten-Blur läuft schon) — der Dialog selbst
    // sitzt qua z-index ohnehin scharf darüber, ohne dass wir ihn gesondert
    // ausschneiden müssten.

    let ausgeloest = false;

    // "Zur Wochenansicht": springt jetzt direkt dorthin (macht, was der Button
    // verspricht, statt vorher noch woanders hin umzuleiten) — mit derselben
    // Ziel-KW, die ihk-import.js sonst selbst gesetzt hätte. Die Wochenansicht
    // zeigt dort einen kurzen Erklär-Hinweis (checkWochenansicht) und leitet
    // danach erst zum Fehler-melden-Hinweis ins Profil weiter, statt "in den
    // Rücken" zu springen.
    const gotoBtn = ersetzeOhneListener(document.getElementById('ihkGotoBtn'));
    gotoBtn?.addEventListener('click', () => {
      if (ausgeloest) return;
      ausgeloest = true;
      observer.disconnect();
      const woche = ersteWoche(summary);
      if (woche) {
        sessionStorage.setItem('gotoKW', String(woche.kw));
        sessionStorage.setItem('gotoYear', String(woche.year));
      }
      if (typeof Modal !== 'undefined') Modal.closeAll();
      setState(user.oid, 'wochenansichtHinweis');
      location.href = 'wochenansicht.html';
    });

    // Jeder andere Weg, den Dialog zu schließen (X, "Schließen", Klick aufs
    // Overlay, ESC) läuft letztlich über Modal.closeAll() → .open verschwindet.
    // Damit muss nur EIN Button (oben) eigens abgefangen werden, der Rest
    // wird hier generisch erkannt.
    const modalEl = document.getElementById('ihkImportModal');
    const observer = new MutationObserver(() => {
      if (ausgeloest) return;
      if (modalEl && !modalEl.classList.contains('open')) {
        ausgeloest = true;
        observer.disconnect();
        zeigeFehlerMeldenCoachmark(user); // kein bekanntes Ziel -> Standard (Wochenansicht)
      }
    });
    if (modalEl) observer.observe(modalEl, { attributes: true, attributeFilter: ['class'] });
  }

  // Kurzer Erklär-Hinweis auf der Wochenansicht, bevor es zum Fehler-melden-
  // Hinweis weitergeht — direkt nach dem Import zurück ins Profil zu springen
  // wirkte verwirrend, obwohl der Azubi gerade "Zur Wochenansicht" gewählt hat.
  function zeigeWochenansichtHinweis(user) {
    spotlightAuf(null);
    const card = baueKarte({
      label: 'Fast fertig',
      dotsHtml: '',
      title: 'Das ist die Wochenansicht',
      text: 'Hier trägst du künftig deine Tätigkeiten ein und reichst deine Berichtsheft-Wochen ein.',
      footerHtml: `<button type="button" class="btn btn-primary btn-sm" id="onbWochenansichtWeiter">Weiter</button>`,
    });
    card.querySelector('#onbWochenansichtWeiter').addEventListener('click', () => {
      entferneKarte();
      entferneSpotlight();
      setState(user.oid, 'fehlerHinweis');
      location.href = 'profil.html';
    });
  }

  // Kein eigener dritter Schritt, kein Overlay: wechselt aufs Profil-Tab und
  // markiert den echten "Fehler melden"-Button mit einem Puls-Ring, begleitet
  // von einer eigenen Karte mit "Alles klar"-Button — bewusst kein Toast mehr,
  // der von selbst abläuft: der Azubi bestätigt aktiv, dass er den Hinweis
  // gesehen hat, statt dass er ihm einfach unter der Zeit wegläuft.
  // Kann mehrfach laufen: direkt im Anschluss an den Import, und — falls der
  // Azubi vorher wegnavigiert ist — erneut beim nächsten Profil-Besuch
  // (checkProfil, dann ohne bekanntes zielSeite → Fallback auf Wochenansicht).
  function zeigeFehlerMeldenCoachmark(user, zielSeite) {
    const ziel = zielSeite || 'wochenansicht.html';
    document.getElementById('tab-profil')?.click();
    const target = document.getElementById('btnFehlerMelden');
    if (!target) { setState(user.oid, 'done'); location.href = ziel; return; } // Ziel fehlt: nicht haengen lassen
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('onboarding-ring-pulse', 'onboarding-ring-pulse--infinite');
    spotlightAuf(target.closest('.profil-section') || target);

    const card = baueKarte({
      label: 'Übrigens',
      dotsHtml: '',
      title: 'Fehler melden',
      text: 'Läuft mal etwas nicht wie erwartet? Über diesen Button kannst du uns jederzeit Fehler melden.',
      footerHtml: `<button type="button" class="btn btn-primary btn-sm" id="onbAllesKlar">Alles klar</button>`,
    });
    card.querySelector('#onbAllesKlar').addEventListener('click', () => {
      target.classList.remove('onboarding-ring-pulse', 'onboarding-ring-pulse--infinite');
      entferneSpotlight();
      entferneKarte();
      setState(user.oid, 'done');
      location.href = ziel;
    });
  }

  window.OnboardingIhkImport = {
    checkDashboard(user) {
      if (!istBerechtigt(user)) return;
      if (getState(user.oid) !== null) return; // schon gestartet oder fertig/übersprungen
      zeigeWillkommen(user);
    },
    checkProfil(user) {
      if (!istBerechtigt(user)) return;
      const state = getState(user.oid);
      if (state === 'step2') zeigeSchritt2(user);
      // 'wochenansichtHinweis' hier auch: falls der Azubi den Wochenansicht-
      // Hinweis übersprungen/verpasst hat (z.B. Tab geschlossen), trotzdem
      // nicht für immer verloren gehen lassen — direkt zum Fehler-melden-Hinweis.
      else if (state === 'fehlerHinweis' || state === 'wochenansichtHinweis') zeigeFehlerMeldenCoachmark(user);
    },
    checkWochenansicht(user) {
      if (!istBerechtigt(user)) return;
      if (getState(user.oid) === 'wochenansichtHinweis') zeigeWochenansichtHinweis(user);
    },
  };
})();
