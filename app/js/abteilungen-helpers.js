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
