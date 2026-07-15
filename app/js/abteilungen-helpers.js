/* deriveName: E-Mail (UPN) -> Anzeigename-Fallback. Identisch zum Backend
   (backend/services/abteilungen.js). Browser: global; Node/Test: module.exports. */
(function (root) {
  function deriveName(email) {
    if (!email) return '';
    const local = String(email).split('@')[0];
    const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
    return local.split('.').map((w) => w.split('-').map(cap).join('-')).filter(Boolean).join(' ').trim();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { deriveName };
  else root.deriveName = deriveName;
})(typeof window !== 'undefined' ? window : globalThis);

/* Drag-to-Pan für alle Gantt-Timelines (.gantt-scroll, .pt-scroll im Voll-
   Planer): Linksklick + Ziehen scrollt horizontal. Delegiert auf document,
   überlebt damit Re-Renders. Erst ab 4px Bewegung aktiv, damit normale
   Klicks/Textauswahl nicht leiden. Balken (.pt-bar) haben im Redesign einen
   eigenen Pointer-Drag zum Verschieben – dort NICHT pannen (Spec: Drag auf
   Balken = Bearbeiten, Drag auf freier Fläche = Pan). */
(function () {
  if (typeof document === 'undefined') return; // Node/Test
  let el = null, startX = 0, startLeft = 0, dragging = false;
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest && e.target.closest('.pt-bar')) return; // Balken = Bearbeiten
    el = e.target.closest && e.target.closest('.gantt-scroll, .pt-scroll');
    if (!el) return;
    startX = e.clientX; startLeft = el.scrollLeft; dragging = false;
  });
  document.addEventListener('mousemove', (e) => {
    if (!el) return;
    const dx = e.clientX - startX;
    if (!dragging && Math.abs(dx) < 4) return;
    if (!dragging) { dragging = true; el.classList.add('is-panning'); }
    el.scrollLeft = startLeft - dx;
    e.preventDefault(); // keine Textauswahl während des Ziehens
  });
  document.addEventListener('mouseup', () => {
    if (el) el.classList.remove('is-panning');
    el = null; dragging = false;
  });
})();
