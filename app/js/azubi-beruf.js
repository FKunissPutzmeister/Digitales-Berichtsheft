/* Beruf-Filter für die Azubi-Auswahl (renderAzubiSelect in app.js).
   Ausbilder der technischen Azubis betreuen Industriemechaniker und
   Mechatroniker gemischt; vor der Azubi-Wahl lässt sich die Liste auf einen
   der beiden Berufe einschränken. Reine Logik ohne DOM.
   Browser: global AzubiBeruf; Node/Test: module.exports. */
(function (root) {
  // Beruf ist Freitext aus Entra (jobTitle) — daher Muster statt Gleichheit:
  // „Industriemechanikerin", „industriemechaniker/-in", englische Titel.
  const GRUPPEN = [
    { key: 'industriemechaniker', label: 'Industriemechaniker', muster: /industriemechani|industrial\s*mechanic/i },
    { key: 'mechatroniker',       label: 'Mechatroniker',       muster: /mechatroni/i },
  ];
  const ALLE = { key: 'alle', label: 'Alle' };
  // Auffang für generische Titel („Technical apprentice"), damit niemand
  // hinter dem Filter verschwindet. Erscheint nur, solange es solche gibt.
  const SONSTIGE = { key: 'sonstige', label: 'Sonstige' };

  function gruppeVon(beruf) {
    const s = String(beruf || '');
    const g = GRUPPEN.find(x => x.muster.test(s));
    return g ? g.key : SONSTIGE.key;
  }

  // Auswahl für das Beruf-Dropdown, oder null = kein Filter. Angeboten nur,
  // wenn die Liste wirklich beide Berufe mischt — sonst gäbe es nichts zu
  // trennen, und alle übrigen Ausbilder sehen die Auswahl unverändert.
  function filterOptionen(azubis) {
    const vorhanden = new Set((azubis || []).map(a => gruppeVon(a.beruf)));
    if (!GRUPPEN.every(g => vorhanden.has(g.key))) return null;
    const optionen = [ALLE].concat(GRUPPEN.map(g => ({ key: g.key, label: g.label })));
    if (vorhanden.has(SONSTIGE.key)) optionen.push(SONSTIGE);
    return optionen;
  }

  function filtere(azubis, key) {
    const liste = (azubis || []).slice();
    if (!key || key === ALLE.key) return liste;
    return liste.filter(a => gruppeVon(a.beruf) === key);
  }

  // Welcher Filter gilt? Der gespeicherte Wunsch — es sei denn, der gerade
  // gezeigte Azubi gehört nicht dazu (Direktlink, „Zu prüfen"): dann dessen
  // Gruppe, sonst stünde er nicht in seinem eigenen Dropdown.
  function wirksamerFilter(azubis, gewuenscht, currentId) {
    const optionen = filterOptionen(azubis);
    if (!optionen) return null;
    let key = optionen.some(o => o.key === gewuenscht) ? gewuenscht : ALLE.key;
    if (key !== ALLE.key && currentId != null) {
      const cur = azubis.find(a => String(a.id) === String(currentId));
      if (cur) {
        const eigene = gruppeVon(cur.beruf);
        if (eigene !== key) key = eigene;
      }
    }
    return key;
  }

  const api = { ALLE: ALLE.key, gruppeVon, filterOptionen, filtere, wirksamerFilter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node/Tests
  root.AzubiBeruf = api;                                                      // Browser
})(typeof window !== 'undefined' ? window : globalThis);
