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
    ihkErfolgHandler = () => zeigeImportErfolg(user);
    document.addEventListener('ihkImportErfolgreich', ihkErfolgHandler, { once: true });
  }

  function zeigeImportErfolg(user) {
    ihkErfolgHandler = null;
    setState(user.oid, 'done');
    baueKarte({
      label: 'Schritt 2 von 2 · Import',
      dotsHtml: DOTS_FERTIG,
      title: 'Alles eingerichtet!',
      text: 'Dein bisheriges Berichtsheft wurde erfolgreich importiert. Du bist startklar.',
      footerHtml: '',
    });
    setTimeout(() => {
      entferneKarte();
      zeigeFehlerMeldenCoachmark();
    }, 1800);
  }

  // Kein eigener dritter Schritt, kein Overlay: wechselt aufs Profil-Tab und
  // markiert den echten "Fehler melden"-Button mit einem Puls-Ring, begleitet
  // von einem Toast. Der Ring bleibt an, solange der Toast sichtbar ist, und
  // verschwindet erst mit ihm zusammen (statt nach einer fest codierten Zeit,
  // die sonst leicht aus dem Takt mit Toast.show()s eigener Dauer geraten kann).
  function zeigeFehlerMeldenCoachmark() {
    document.getElementById('tab-profil')?.click();
    const target = document.getElementById('btnFehlerMelden');
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('onboarding-ring-pulse', 'onboarding-ring-pulse--infinite');
    spotlightAuf(target.closest('.profil-section') || target);

    // Danach zurück ins Dashboard: das Onboarding ist damit vollständig
    // durchlaufen, es gibt nichts mehr, was der Azubi als Nächstes tun soll.
    const abschliessen = () => {
      target.classList.remove('onboarding-ring-pulse', 'onboarding-ring-pulse--infinite');
      entferneSpotlight();
      location.href = 'dashboard.html';
    };

    if (typeof Toast === 'undefined' || typeof Toast.info !== 'function') {
      setTimeout(abschliessen, 4300); // Fallback, falls Toast ausnahmsweise fehlt
      return;
    }
    Toast.info('Übrigens', 'Läuft mal etwas nicht wie erwartet? Über diesen Button kannst du uns jederzeit Fehler melden.');

    const container = document.querySelector('.toast-container');
    const toastEl = container?.lastElementChild;
    if (!container || !toastEl) { setTimeout(abschliessen, 4300); return; }
    const observer = new MutationObserver(() => {
      if (!container.contains(toastEl)) {
        abschliessen();
        observer.disconnect();
      }
    });
    observer.observe(container, { childList: true });
  }

  window.OnboardingIhkImport = {
    checkDashboard(user) {
      if (!istBerechtigt(user)) return;
      if (getState(user.oid) !== null) return; // schon gestartet oder fertig/übersprungen
      zeigeWillkommen(user);
    },
    checkProfil(user) {
      if (!istBerechtigt(user)) return;
      if (getState(user.oid) === 'step2') zeigeSchritt2(user);
    },
  };
})();
