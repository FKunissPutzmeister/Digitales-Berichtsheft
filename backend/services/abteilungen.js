'use strict';
/* =====================================================================
   ABTEILUNGS-KATALOG-SERVICE.
   Dieser Abschnitt: reine Logik (Namensableitung, E-Mail-Normalisierung,
   Validierung). DB-Zugriffsfunktionen folgen weiter unten (Task 3).
   ===================================================================== */
const { getPool, sql } = require('../db/connection');

// E-Mail (UPN) -> Anzeigename-Fallback bis Azure den echten Namen liefert.
// "ruediger.breuning@x" -> "Ruediger Breuning"; Bindestriche bleiben.
function deriveName(email) {
  if (!email) return '';
  const local = String(email).split('@')[0];
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  return local
    .split('.')
    .map((word) => word.split('-').map(cap).join('-'))
    .filter(Boolean)
    .join(' ')
    .trim();
}

// UPN einheitlich klein + getrimmt speichern/vergleichen.
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const NAME_MAX = 120;

// Validierung fürs Anlegen (name Pflicht) bzw. Patch (partial: name optional,
// aber mind. ein bekanntes Feld). Unbekannte Felder -> invalid.
function validateAbteilung(fields, { partial = false } = {}) {
  const known = ['name', 'istPmm', 'aktiv'];
  const keys = Object.keys(fields || {});
  if (keys.length === 0) return { ok: false, error: 'Keine Felder angegeben' };
  for (const k of keys) if (!known.includes(k)) return { ok: false, error: `Unbekanntes Feld: ${k}` };
  if (!partial || 'name' in fields) {
    if (typeof fields.name !== 'string' || !fields.name.trim()) return { ok: false, error: 'Name ist Pflicht' };
    if (fields.name.length > NAME_MAX) return { ok: false, error: `Name max. ${NAME_MAX} Zeichen` };
  }
  if ('istPmm' in fields && typeof fields.istPmm !== 'boolean') return { ok: false, error: 'istPmm muss boolean sein' };
  if ('aktiv' in fields && typeof fields.aktiv !== 'boolean') return { ok: false, error: 'aktiv muss boolean sein' };
  return { ok: true };
}

function validateVerantwEmail(email) {
  const e = normalizeEmail(email);
  if (!e || !e.includes('@')) return { ok: false, error: 'Gültige E-Mail erforderlich' };
  return { ok: true };
}

module.exports = { deriveName, normalizeEmail, validateAbteilung, validateVerantwEmail };
