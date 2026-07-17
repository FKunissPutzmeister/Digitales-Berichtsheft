'use strict';
/* Dauerhafte Ausbilder<->Azubi-Zuordnung (dbo.AusbilderAzubis).
   Getrennt vom befristeten Zuweisungs-/Zugriffskontext. */
const { getPool, sql } = require('../db/connection');
const { getUserByOid, buildReqUser } = require('./users');

// Zeilen mit Quelle='ausgeschlossen' sind bewusst entfernte Auto-Zuordnungen
// (siehe Migration 024) und zählen nirgends als aktive Zuordnung.
const AKTIV_FILTER = "aa.Quelle <> 'ausgeschlossen'";

// Aktuell zugewiesene Ausbilder eines Azubis (für das Modal). `quelle` steuert
// die "(automatisch aus Entra)"-Kennzeichnung im Frontend.
async function listFuerAzubi(azubiOid) {
  const pool = await getPool();
  const r = await pool.request()
    .input('azubiOid', sql.NVarChar(36), azubiOid)
    .query(`
      SELECT u.Oid AS oid, u.Name AS name, u.Email AS email, aa.Quelle AS quelle
      FROM dbo.AusbilderAzubis aa
      JOIN dbo.Users u ON u.Oid = aa.AusbilderOid
      WHERE aa.AzubiOid = @azubiOid AND ${AKTIV_FILTER}
      ORDER BY u.Name
    `);
  return r.recordset;
}

// Azubis, die einem Ausbilder dauerhaft zugeordnet sind (Umkehrung von
// listFuerAzubi). OID-basiert → unabhängig von der (fragilen) verantwEmail der
// befristeten Zuweisungen. Liefert volle Users-Zeilen für buildReqUser.
async function listAzubisFuerAusbilder(ausbilderOid) {
  const pool = await getPool();
  const r = await pool.request()
    .input('ausbilderOid', sql.NVarChar(36), ausbilderOid)
    .query(`
      SELECT u.*
      FROM dbo.AusbilderAzubis aa
      JOIN dbo.Users u ON u.Oid = aa.AzubiOid
      WHERE aa.AusbilderOid = @ausbilderOid AND u.Aktiv = 1 AND ${AKTIV_FILTER}
      ORDER BY u.Name
    `);
  return r.recordset;
}

// Hat der Nutzer irgendeine dauerhafte Zuordnung als Ausbilder? Bestimmt in
// requireAuth, ob ein Prüfer als "rein befristet" (reduzierte Sicht) oder als
// vollwertiger Ausbilder gilt.
async function hatDauerhafteZuordnung(ausbilderOid) {
  const pool = await getPool();
  const r = await pool.request()
    .input('oid', sql.NVarChar(36), ausbilderOid)
    .query(`SELECT TOP 1 1 AS x FROM dbo.AusbilderAzubis aa WHERE aa.AusbilderOid = @oid AND ${AKTIV_FILTER}`);
  return r.recordset.length > 0;
}

// Prüft: Ziel ist Azubi, alle OIDs sind ausbilderfähig. Keine DB-Schreibzugriffe.
async function validateZuordnung(azubiOid, ausbilderOids) {
  const azubi = await getUserByOid(azubiOid);
  if (!azubi) return { ok: false, status: 404, error: 'Azubi nicht gefunden.' };
  if (!buildReqUser(azubi).istAzubi) return { ok: false, status: 400, error: 'Ziel-Nutzer ist kein Azubi.' };
  for (const oid of ausbilderOids) {
    const row = await getUserByOid(oid);
    if (!row || !buildReqUser(row).istAusbilder) {
      return { ok: false, status: 400, error: `Nutzer ${oid} ist kein Ausbilder.` };
    }
  }
  return { ok: true };
}

// Setzt die vom Admin gewünschte Ausbilder-Menge eines Azubis (Checkbox-Liste
// der Nutzerverwaltung). KEIN blindes Replace mehr — statt bestehende
// 'auto'-Zeilen (vom Entra-Sync) einfach zu löschen und ggf. sofort wieder
// anzulegen, wird pro Zeile entschieden:
//   - bisherige 'manuell'-Zeile, jetzt abgewählt      → hart löschen
//   - bisherige 'auto'-Zeile, jetzt abgewählt         → auf 'ausgeschlossen'
//     setzen (Sync darf sie NIE wieder automatisch anlegen, siehe Migration 024)
//   - neu angehakte OID ohne bestehende Zeile          → INSERT Quelle='manuell'
//   - neu angehakte OID mit bestehender 'ausgeschlossen'-Zeile → auf 'manuell'
//     zurücksetzen (Admin bestätigt/reaktiviert die Zuordnung bewusst)
//   - unverändert angehakte 'auto'/'manuell'-Zeile      → unangetastet
async function setFuerAzubi(azubiOid, ausbilderOids) {
  const pool = await getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const bestehend = await new sql.Request(tx)
      .input('azubiOid', sql.NVarChar(36), azubiOid)
      .query('SELECT AusbilderOid, Quelle FROM dbo.AusbilderAzubis WHERE AzubiOid = @azubiOid');
    const bestehendMap = new Map(bestehend.recordset.map((r) => [r.AusbilderOid, r.Quelle]));
    const gewuenscht = new Set([...new Set(ausbilderOids)]);

    for (const [oid, quelle] of bestehendMap) {
      if (gewuenscht.has(oid)) continue; // unverändert angehakt (auto/manuell) → unangetastet
      if (quelle === 'auto') {
        await new sql.Request(tx)
          .input('azubiOid', sql.NVarChar(36), azubiOid)
          .input('oid', sql.NVarChar(36), oid)
          .query("UPDATE dbo.AusbilderAzubis SET Quelle = 'ausgeschlossen' WHERE AzubiOid = @azubiOid AND AusbilderOid = @oid");
      } else if (quelle === 'manuell') {
        await new sql.Request(tx)
          .input('azubiOid', sql.NVarChar(36), azubiOid)
          .input('oid', sql.NVarChar(36), oid)
          .query('DELETE FROM dbo.AusbilderAzubis WHERE AzubiOid = @azubiOid AND AusbilderOid = @oid');
      }
      // quelle === 'ausgeschlossen' war schon nicht angehakt → nichts zu tun
    }

    for (const oid of gewuenscht) {
      const quelle = bestehendMap.get(oid);
      if (!quelle) {
        await new sql.Request(tx)
          .input('azubiOid', sql.NVarChar(36), azubiOid)
          .input('oid', sql.NVarChar(36), oid)
          .query("INSERT INTO dbo.AusbilderAzubis (AzubiOid, AusbilderOid, Quelle) VALUES (@azubiOid, @oid, 'manuell')");
      } else if (quelle === 'ausgeschlossen') {
        await new sql.Request(tx)
          .input('azubiOid', sql.NVarChar(36), azubiOid)
          .input('oid', sql.NVarChar(36), oid)
          .query("UPDATE dbo.AusbilderAzubis SET Quelle = 'manuell' WHERE AzubiOid = @azubiOid AND AusbilderOid = @oid");
      }
    }

    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// Vom Entra-Sync genutzt (entraSync.js): pflegt AUSSCHLIESSLICH 'auto'-Zeilen
// eines Azubis, rührt 'manuell'/'ausgeschlossen'-Zeilen nie an.
//   - managerOid gesetzt, keine Zeile (egal welche Quelle) für dieses Paar
//     vorhanden → INSERT Quelle='auto'.
//   - managerOid gesetzt, Zeile existiert bereits (auto/manuell/ausgeschlossen)
//     → unangetastet (kein Duplikat, kein Downgrade einer bewussten Wahl).
//   - jede 'auto'-Zeile des Azubis, deren AusbilderOid NICHT dem aktuellen
//     managerOid entspricht (Manager gewechselt oder entfallen) → hart
//     gelöscht (reiner Sync-Artefakt, keine Erinnerung nötig).
// Bewusst OHNE sql.Transaction: entraSync.js ruft das für mehrere Azubis
// gleichzeitig auf (Batches von 5, Promise.all) — mehrere parallele
// Transaction-Objekte auf demselben Pool führten reproduzierbar zu
// "Transaction has been aborted." (Konkurrenz auf dem Pool). Die zwei
// Statements brauchen keine Atomarität: bricht der Prozess dazwischen ab,
// heilt der nächste Sync-Lauf den Zwischenzustand von selbst aus.
async function syncAutoZuordnung(azubiOid, managerOid) {
  const pool = await getPool();
  if (managerOid) {
    const bestehend = await pool.request()
      .input('azubiOid', sql.NVarChar(36), azubiOid)
      .input('managerOid', sql.NVarChar(36), managerOid)
      .query('SELECT TOP 1 1 AS x FROM dbo.AusbilderAzubis WHERE AzubiOid = @azubiOid AND AusbilderOid = @managerOid');
    if (bestehend.recordset.length === 0) {
      await pool.request()
        .input('azubiOid', sql.NVarChar(36), azubiOid)
        .input('managerOid', sql.NVarChar(36), managerOid)
        .query("INSERT INTO dbo.AusbilderAzubis (AzubiOid, AusbilderOid, Quelle) VALUES (@azubiOid, @managerOid, 'auto')");
    }
  }
  const req = pool.request().input('azubiOid', sql.NVarChar(36), azubiOid);
  let query = "DELETE FROM dbo.AusbilderAzubis WHERE AzubiOid = @azubiOid AND Quelle = 'auto'";
  if (managerOid) { req.input('managerOid', sql.NVarChar(36), managerOid); query += ' AND AusbilderOid <> @managerOid'; }
  await req.query(query);
}

module.exports = {
  listFuerAzubi, listAzubisFuerAusbilder, validateZuordnung, setFuerAzubi,
  syncAutoZuordnung, hatDauerhafteZuordnung,
};
