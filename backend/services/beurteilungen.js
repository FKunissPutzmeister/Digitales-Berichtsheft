'use strict';
/* Persistenz + Logik für Beurteilungsbögen. Rechenkern wird aus dem
   Frontend-Kernmodul WIEDERVERWENDET (eine Wahrheit für die Mathematik). */
const { getPool, sql } = require('../db/connection');
const { berechne, ermittleTyp } = require('../../app/js/beurteilung-core.js');
const { ladeKorrekturKontext } = require('./zugriffContext');
const { verantwortlichFuerZuweisung, ymd } = require('./zugriff');
const { aktiveVertreteneEmails } = require('./vertretungen');
const unterschriftenSvc = require('./unterschriften');
const berufeSvc = require('./berufe');
const { mailBeurteilung } = require('./mail');

const heuteYmd = () => new Date().toISOString().slice(0, 10);

async function ladeZuweisung(pool, zuweisungId) {
  const r = await pool.request()
    .input('id', sql.Int, zuweisungId)
    .query('SELECT Id, AzubiOid, VerantwEmail, Abteilung, Von, Bis FROM dbo.Zuweisungen WHERE Id = @id');
  const z = r.recordset[0];
  if (!z) return null;
  return {
    id: z.Id, azubiOid: z.AzubiOid, verantwortlicherEmail: z.VerantwEmail,
    abteilung: z.Abteilung, von: z.Von, bis: z.Bis,
  };
}

// Darf der Nutzer die Beurteilung dieser Zuweisung bearbeiten?
async function darfBeurteilen(user, zuweisung, pool) {
  if (!zuweisung) return false;
  if (user.role === 'developer' || user.role === 'admin') return true;
  const kontext = await ladeKorrekturKontext(pool, user);
  return verantwortlichFuerZuweisung(user, zuweisung, kontext);
}

// Eng: darf NUR der zeitlich zugewiesene Prüfer (E-Mail-Match) ODER admin/
// developer bearbeiten. Anders als das bestehende, breitere darfBeurteilen
// (das über verantwortlichFuerZuweisung auch den dauerhaften Ausbilder
// einschließt) — der darf die Beurteilung zwar ANSEHEN, aber nicht mehr
// bearbeiten (siehe Design-Spec 2026-08-21). Rein synchron, keine DB nötig.
function darfBeurteilungBearbeiten(user, zuweisung) {
  if (user.role === 'developer' || user.role === 'admin') return true;
  if (!zuweisung) return false;
  const email = (user.email || '').toLowerCase();
  return !!email && (zuweisung.verantwortlicherEmail || '').toLowerCase() === email;
}

// Ermittelt den zuständigen Ausbildungsleiter für einen Azubi: dessen Beruf
// wird über den Berufe-Katalog auf einen Bereich abgebildet, dann wird der
// (einzige vorgesehene) Nutzer mit IstAusbildungsleiter=1 in diesem Bereich
// gesucht. null, wenn kein Katalog-Treffer ODER kein passend getaggter
// Nutzer existiert — beide Fälle werden von den Aufrufern gleich behandelt
// (dritter Schritt entfällt lautlos, siehe Design-Spec, Abschnitt Randfälle).
async function ermittleAusbildungsleiter(pool, azubiOid) {
  const r = await pool.request().input('oid', sql.NVarChar(36), azubiOid)
    .query('SELECT Beruf FROM dbo.Users WHERE Oid=@oid');
  const beruf = r.recordset[0]?.Beruf ?? null;
  const katalog = await berufeSvc.listBerufe();
  const bereich = berufeSvc.bereichFuerBeruf(beruf, katalog);
  if (!bereich) return null;
  const leiter = await pool.request().input('bereich', sql.NVarChar(20), bereich)
    .query('SELECT TOP 1 Oid FROM dbo.Users WHERE IstAusbildungsleiter=1 AND AusbildungsleiterBereich=@bereich ORDER BY Oid');
  return leiter.recordset[0]?.Oid ?? null;
}

// Bestimmt, in welchem der vier Modi das Frontend die Beurteilung anzeigen
// soll — EINE serverseitige Quelle statt (fehleranfälliger) Client-Heuristik.
// b = das Ergebnis von getByZuweisung (oder irgendein Objekt mit denselben
// AzubiOid/Status/AusbildungsleiterBestaetigtAm-Feldern).
async function ermittleModus(user, zuweisung, b, pool) {
  if (darfBeurteilungBearbeiten(user, zuweisung)) return 'bearbeiten';
  if (user.oid === b.AzubiOid) return 'azubi';
  if (b.Status === 'abgeschlossen' && !b.AusbildungsleiterBestaetigtAm && !b.ausbildungsleiterSchrittEntfaellt) {
    const ausbildungsleiterOid = await ermittleAusbildungsleiter(pool, b.AzubiOid);
    if (ausbildungsleiterOid && ausbildungsleiterOid === user.oid) return 'ausbildungsleiter';
  }
  return 'ansicht';
}

async function ladeKriterien(pool, beurteilungId) {
  const r = await pool.request()
    .input('bid', sql.Int, beurteilungId)
    .query('SELECT KriteriumKey, Punkte FROM dbo.BeurteilungKriterien WHERE BeurteilungId = @bid');
  return r.recordset.map(x => ({ kriteriumKey: x.KriteriumKey, punkte: x.Punkte }));
}

async function getByZuweisung(pool, zuweisungId) {
  const r = await pool.request()
    .input('zid', sql.Int, zuweisungId)
    .query(`SELECT Id, ZuweisungId, AzubiOid, Status, Typ, IndividuelleBeurteilung, GesamtPunkte, Note,
              KurzfeedbackEindruck, KurzfeedbackAuffaelligkeiten, KurzfeedbackEmpfehlung,
              GespraechAm, BeurteiltVon, AbgeschlossenAm, KenntnisnahmeVon, KenntnisnahmeAm,
              KorrigiertVon, KorrigiertAm, ErstelltAm, AktualisiertAm,
              BeurteilerUnterschriftExt, KenntnisnahmeUnterschriftExt,
              AusbildungsleiterBestaetigtVon, AusbildungsleiterBestaetigtAm, AusbildungsleiterUnterschriftExt
            FROM dbo.Beurteilungen WHERE ZuweisungId = @zid`);
  const b = r.recordset[0];
  if (!b) return null;
  b.kriterien = await ladeKriterien(pool, b.Id);
  // Personalunion: ist der Beurteiler selbst der zuständige Ausbildungsleiter
  // für diesen Azubi, entfällt der dritte Signaturschritt (keine doppelte
  // Unterschrift derselben Person).
  const ausbildungsleiterOid = b.BeurteiltVon ? await ermittleAusbildungsleiter(pool, b.AzubiOid) : null;
  b.ausbildungsleiterSchrittEntfaellt = !!ausbildungsleiterOid && ausbildungsleiterOid === b.BeurteiltVon;
  // Nur die *Ext-Spalten wurden geladen (nicht die *Bild-Spalten selbst — bis
  // zu 2 MB je Slot, hier nur als Vorhanden-Flag gebraucht). Bild/Ext werden
  // immer gemeinsam geschrieben, daher ist Ext-non-null gleichwertig zu
  // Bild-non-null. Die eigentlichen Bilder kommen über den Bild-Endpunkt.
  b.hatBeurteilerUnterschrift = !!b.BeurteilerUnterschriftExt;
  b.hatKenntnisnahmeUnterschrift = !!b.KenntnisnahmeUnterschriftExt;
  b.hatAusbildungsleiterUnterschrift = !!b.AusbildungsleiterUnterschriftExt;
  delete b.BeurteilerUnterschriftExt;
  delete b.KenntnisnahmeUnterschriftExt;
  delete b.AusbildungsleiterUnterschriftExt;
  return b;
}

async function listByAzubi(pool, azubiOid) {
  const r = await pool.request()
    .input('oid', sql.NVarChar(36), azubiOid)
    .query('SELECT ZuweisungId, Status, Typ, Note, GesamtPunkte, AbgeschlossenAm FROM dbo.Beurteilungen WHERE AzubiOid = @oid');
  return r.recordset;
}

// Rechnet Gesamt/Note aus kriterien = [{kriteriumKey,punkte}].
function rechne(kriterien) {
  const byKey = {};
  (kriterien || []).forEach(k => { byKey[k.kriteriumKey] = k.punkte; });
  return berechne(byKey);
}

// Kriterien für eine Beurteilung neu setzen (delete-then-insert, wie Tage/Wochen).
async function schreibeKriterien(tx, beurteilungId, kriterien) {
  await new sql.Request(tx).input('bid', sql.Int, beurteilungId)
    .query('DELETE FROM dbo.BeurteilungKriterien WHERE BeurteilungId = @bid');
  for (const k of (kriterien || [])) {
    if (k.punkte === null || k.punkte === undefined || k.punkte === '') continue;
    await new sql.Request(tx)
      .input('bid', sql.Int, beurteilungId)
      .input('key', sql.NVarChar(40), k.kriteriumKey)
      .input('pkt', sql.TinyInt, Math.max(0, Math.min(100, Math.round(Number(k.punkte)))))
      .query('INSERT INTO dbo.BeurteilungKriterien (BeurteilungId, KriteriumKey, Punkte) VALUES (@bid,@key,@pkt)');
  }
}

async function upsertEntwurf(pool, {
  zuweisungId, azubiOid, typ, kriterien, individuelleBeurteilung, gespraechAm,
  kurzfeedbackEindruck, kurzfeedbackAuffaelligkeiten, kurzfeedbackEmpfehlung,
}) {
  // Punkte/Note nur berechnen, wenn Kriterien mitgeschickt wurden (grosse
  // Beurteilung) — beim Kurzfeedback bleiben GesamtPunkte/Note NULL, ohne
  // dass diese Funktion selbst zwischen den beiden Typen unterscheiden muss:
  // jede Seite schickt ohnehin nur ihre eigenen Felder (siehe Route).
  //
  // Härtung: der BEREITS GESPEICHERTE Typ eines bestehenden Datensatzes ist
  // maßgeblich dafür, welches Feld-Set geschrieben wird — nicht das frisch
  // übergebene `typ`-Argument. Ohne diesen Vorab-Read könnte ein Request, der
  // (versehentlich oder absichtlich) sowohl `kriterien` als auch die 3
  // `kurzfeedback*`-Felder mitschickt, bei einem UPDATE das jeweils "falsche"
  // Set mitschreiben — z.B. bei einem Typ='kurz'-Datensatz echte
  // GesamtPunkte/Note berechnen und BeurteilungKriterien-Zeilen anlegen,
  // obwohl dessen eigener Typ das widerspricht. Für einen neuen Datensatz
  // (kein bestehend.recordset[0]) fällt effektiverTyp auf das übergebene
  // `typ` zurück — unverändertes Verhalten wie zuvor.
  const bestehend = await pool.request().input('zid', sql.Int, zuweisungId)
    .query('SELECT Typ FROM dbo.Beurteilungen WHERE ZuweisungId=@zid');
  const effektiverTyp = bestehend.recordset[0]?.Typ || typ || 'gross';
  const kriterienEffektiv = effektiverTyp === 'gross' ? kriterien : undefined;
  const kfEindruckEffektiv = effektiverTyp === 'kurz' ? kurzfeedbackEindruck : undefined;
  const kfAuffEffektiv = effektiverTyp === 'kurz' ? kurzfeedbackAuffaelligkeiten : undefined;
  const kfEmpfEffektiv = effektiverTyp === 'kurz' ? kurzfeedbackEmpfehlung : undefined;
  const calc = (kriterienEffektiv && kriterienEffektiv.length) ? rechne(kriterienEffektiv) : { gesamt: null, note: null };
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const up = await new sql.Request(tx)
      .input('zid', sql.Int, zuweisungId)
      .input('oid', sql.NVarChar(36), azubiOid)
      .input('typ', sql.NVarChar(10), effektiverTyp)
      .input('indiv', sql.NVarChar(sql.MAX), individuelleBeurteilung ?? null)
      .input('ges', sql.Decimal(5, 2), calc.gesamt)
      .input('note', sql.Decimal(2, 1), calc.note)
      .input('gespr', sql.Date, gespraechAm || null)
      .input('kfEindruck', sql.NVarChar(sql.MAX), kfEindruckEffektiv ?? null)
      .input('kfAuff', sql.NVarChar(sql.MAX), kfAuffEffektiv ?? null)
      .input('kfEmpf', sql.NVarChar(sql.MAX), kfEmpfEffektiv ?? null)
      .query(`
        MERGE dbo.Beurteilungen AS t
        USING (SELECT @zid AS ZuweisungId) AS s ON t.ZuweisungId = s.ZuweisungId
        WHEN MATCHED THEN UPDATE SET
          IndividuelleBeurteilung=@indiv, GesamtPunkte=@ges, Note=@note, GespraechAm=@gespr,
          KurzfeedbackEindruck=@kfEindruck, KurzfeedbackAuffaelligkeiten=@kfAuff, KurzfeedbackEmpfehlung=@kfEmpf,
          AktualisiertAm=SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (ZuweisungId, AzubiOid, Status, Typ, IndividuelleBeurteilung, GesamtPunkte, Note, GespraechAm,
          KurzfeedbackEindruck, KurzfeedbackAuffaelligkeiten, KurzfeedbackEmpfehlung)
          VALUES (@zid, @oid, 'entwurf', @typ, @indiv, @ges, @note, @gespr, @kfEindruck, @kfAuff, @kfEmpf)
        OUTPUT inserted.Id;
      `);
    const id = up.recordset[0].Id;
    await schreibeKriterien(tx, id, kriterienEffektiv);
    await tx.commit();
    return id;
  } catch (e) { await tx.rollback(); throw e; }
}

// Serverseitige Mitteilung (inkl. ZuweisungId; kein offener Client-POST).
// `runner` = Pool ODER laufende Transaktion – so kann der INSERT atomar
// gemeinsam mit dem Status-Update ausgeführt werden (siehe abschliessen).
async function erzeugeBenachrichtigung(runner, { userOid, typ, zuweisungId, fromUserOid }) {
  if (!userOid) return; // Empfänger ohne OID (nie eingeloggt) -> später self-healing
  await new sql.Request(runner)
    .input('userOid', sql.NVarChar(36), userOid)
    .input('typ', sql.NVarChar(40), typ)
    .input('zid', sql.Int, zuweisungId)
    .input('from', sql.NVarChar(36), fromUserOid || null)
    .query(`INSERT INTO dbo.Benachrichtigungen (UserOid, Typ, ZuweisungId, FromUserOid)
            VALUES (@userOid,@typ,@zid,@from)`);
}

const mailTypAbgeschlossen = (typ) => (typ === 'kurz' ? 'kurzfeedback_abgeschlossen' : 'beurteilung_abgeschlossen');
const mailTypFaellig = (typ) => (typ === 'kurz' ? 'kurzfeedback_faellig' : 'beurteilung_faellig');

// Empfänger für das "abgeschlossen"-Signal: immer der Azubi; beim
// Kurzfeedback zusätzlich die zuständige Ausbildungsleitung (rein
// informativ — anders als bei der großen Beurteilung gibt es dafür keinen
// eigenen Bestätigungsschritt, siehe Design-Spec §5).
async function ermittleAbschlussEmpfaenger(pool, b) {
  if (b.Typ !== 'kurz') return [b.AzubiOid];
  const ausbildungsleiterOid = await ermittleAusbildungsleiter(pool, b.AzubiOid);
  return [b.AzubiOid, ausbildungsleiterOid].filter(Boolean);
}

async function abschliessen(pool, id, autorOid, signatur) {
  const cur = await pool.request().input('id', sql.Int, id)
    .query('SELECT Id, ZuweisungId, AzubiOid, Typ FROM dbo.Beurteilungen WHERE Id=@id');
  const b = cur.recordset[0];
  if (!b) throw new Error('Beurteilung nicht gefunden.');
  const sigBytes = signatur ? unterschriftenSvc.dataUrlToBuffer(signatur.dataUrl) : null;
  if (signatur && !sigBytes) throw new Error('Ungültige Unterschrift.');
  unterschriftenSvc.pruefeGroesse(sigBytes);
  const sigExt = signatur ? unterschriftenSvc.normExt(signatur.extension) : null;
  const empfaengerOids = await ermittleAbschlussEmpfaenger(pool, b);
  // Status-Update UND Mitteilungen atomar: schlägt ein Benachrichtigungs-
  // INSERT fehl (z.B. CHECK-Constraint), wird auch der Abschluss zurückgerollt –
  // kein stiller Zustand "abgeschlossen ohne Mitteilung".
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('id', sql.Int, id)
      .input('von', sql.NVarChar(36), autorOid)
      .input('bild', sql.VarBinary(sql.MAX), sigBytes)
      .input('ext', sql.NVarChar(10), sigExt)
      .query(`UPDATE dbo.Beurteilungen SET Status='abgeschlossen',
                AbgeschlossenAm=SYSUTCDATETIME(), BeurteiltVon=@von,
                BeurteilerUnterschriftBild=@bild, BeurteilerUnterschriftExt=@ext,
                AktualisiertAm=SYSUTCDATETIME()
              WHERE Id=@id`);
    for (const empfOid of empfaengerOids) {
      await erzeugeBenachrichtigung(tx, {
        userOid: empfOid, typ: mailTypAbgeschlossen(b.Typ), zuweisungId: b.ZuweisungId, fromUserOid: autorOid,
      });
    }
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }
  // Persönliche Standard-Unterschrift aktualisieren — best effort, AUSSERHALB
  // der Transaktion: ein Fehlschlag hier darf den bereits committeten Abschluss
  // nicht zurückrollen (rein komfortbezogen, kein Blocker).
  if (signatur) {
    try { await unterschriftenSvc.speichereMeine(pool, autorOid, signatur); }
    catch (e) { console.error('[beurteilungen] speichereMeine (best effort):', e.message); }
  }
  // Mail NACH dem Commit und außerhalb der Transaktion: ein Versandfehler darf
  // den Abschluss nicht zurückrollen (mailBeurteilung wirft ohnehin nie).
  await mailBeurteilung(pool, empfaengerOids, mailTypAbgeschlossen(b.Typ),
    { zuweisungId: b.ZuweisungId, azubiOid: b.AzubiOid });
}

async function patchNachAbschluss(pool, id, {
  kriterien, individuelleBeurteilung, gespraechAm,
  kurzfeedbackEindruck, kurzfeedbackAuffaelligkeiten, kurzfeedbackEmpfehlung,
}, autorOid) {
  const cur = await pool.request().input('id', sql.Int, id)
    .query('SELECT Id, ZuweisungId, AzubiOid, Typ FROM dbo.Beurteilungen WHERE Id=@id');
  const b = cur.recordset[0];
  if (!b) throw new Error('Beurteilung nicht gefunden.');
  // b.Typ ist bereits geladen und für eine bestehende Zeile immer autoritativ
  // (Typ ist nach Anlage unveränderlich) — kein Vorab-Read nötig wie bei
  // upsertEntwurf, dort existierte die Zeile zum Zeitpunkt des Reads evtl. noch nicht.
  const kriterienEffektiv = b.Typ === 'gross' ? kriterien : undefined;
  const kfEindruckEffektiv = b.Typ === 'kurz' ? kurzfeedbackEindruck : undefined;
  const kfAuffEffektiv = b.Typ === 'kurz' ? kurzfeedbackAuffaelligkeiten : undefined;
  const kfEmpfEffektiv = b.Typ === 'kurz' ? kurzfeedbackEmpfehlung : undefined;
  const calc = (kriterienEffektiv && kriterienEffektiv.length) ? rechne(kriterienEffektiv) : { gesamt: null, note: null };
  const empfaengerOids = await ermittleAbschlussEmpfaenger(pool, b);
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input('id', sql.Int, id)
      .input('indiv', sql.NVarChar(sql.MAX), individuelleBeurteilung ?? null)
      .input('ges', sql.Decimal(5, 2), calc.gesamt)
      .input('note', sql.Decimal(2, 1), calc.note)
      .input('gespr', sql.Date, gespraechAm || null)
      .input('kfEindruck', sql.NVarChar(sql.MAX), kfEindruckEffektiv ?? null)
      .input('kfAuff', sql.NVarChar(sql.MAX), kfAuffEffektiv ?? null)
      .input('kfEmpf', sql.NVarChar(sql.MAX), kfEmpfEffektiv ?? null)
      .input('von', sql.NVarChar(36), autorOid)
      .query(`UPDATE dbo.Beurteilungen SET IndividuelleBeurteilung=@indiv, GesamtPunkte=@ges,
                Note=@note, GespraechAm=@gespr,
                KurzfeedbackEindruck=@kfEindruck, KurzfeedbackAuffaelligkeiten=@kfAuff, KurzfeedbackEmpfehlung=@kfEmpf,
                KorrigiertVon=@von, KorrigiertAm=SYSUTCDATETIME(),
                KenntnisnahmeVon=NULL, KenntnisnahmeAm=NULL,
                KenntnisnahmeUnterschriftBild=NULL, KenntnisnahmeUnterschriftExt=NULL,
                AusbildungsleiterBestaetigtVon=NULL, AusbildungsleiterBestaetigtAm=NULL,
                AusbildungsleiterUnterschriftBild=NULL, AusbildungsleiterUnterschriftExt=NULL,
                AktualisiertAm=SYSUTCDATETIME() WHERE Id=@id`);
    await schreibeKriterien(tx, id, kriterienEffektiv);
    for (const empfOid of empfaengerOids) {
      await erzeugeBenachrichtigung(tx, {
        userOid: empfOid, typ: mailTypAbgeschlossen(b.Typ), zuweisungId: b.ZuweisungId, fromUserOid: autorOid,
      });
    }
    await tx.commit();
  } catch (e) { await tx.rollback(); throw e; }
  await mailBeurteilung(pool, empfaengerOids, mailTypAbgeschlossen(b.Typ),
    { zuweisungId: b.ZuweisungId, azubiOid: b.AzubiOid });
}

async function kenntnisnahme(pool, id, azubiOid, signatur) {
  const sigBytes = signatur ? unterschriftenSvc.dataUrlToBuffer(signatur.dataUrl) : null;
  if (signatur && !sigBytes) throw new Error('Ungültige Unterschrift.');
  unterschriftenSvc.pruefeGroesse(sigBytes);
  const sigExt = signatur ? unterschriftenSvc.normExt(signatur.extension) : null;
  await pool.request()
    .input('id', sql.Int, id)
    .input('oid', sql.NVarChar(36), azubiOid)
    .input('bild', sql.VarBinary(sql.MAX), sigBytes)
    .input('ext', sql.NVarChar(10), sigExt)
    .query(`UPDATE dbo.Beurteilungen SET KenntnisnahmeVon=@oid, KenntnisnahmeAm=SYSUTCDATETIME(),
              KenntnisnahmeUnterschriftBild=@bild, KenntnisnahmeUnterschriftExt=@ext,
              AktualisiertAm=SYSUTCDATETIME() WHERE Id=@id AND AzubiOid=@oid`);
  if (signatur) {
    try { await unterschriftenSvc.speichereMeine(pool, azubiOid, signatur); }
    catch (e) { console.error('[beurteilungen] speichereMeine (best effort):', e.message); }
  }
}

// Dritter, eigenständiger Schritt: der zuständige Ausbildungsleiter bestätigt
// die Beurteilung — unabhängig davon, ob/wann der Azubi seine Kenntnisnahme
// gegeben hat (keine Reihenfolge-Pflicht, siehe Design-Spec).
async function ausbildungsleiterBestaetigen(pool, id, ausbildungsleiterOid, signatur) {
  const sigBytes = signatur ? unterschriftenSvc.dataUrlToBuffer(signatur.dataUrl) : null;
  if (signatur && !sigBytes) throw new Error('Ungültige Unterschrift.');
  unterschriftenSvc.pruefeGroesse(sigBytes);
  const sigExt = signatur ? unterschriftenSvc.normExt(signatur.extension) : null;
  await pool.request()
    .input('id', sql.Int, id)
    .input('von', sql.NVarChar(36), ausbildungsleiterOid)
    .input('bild', sql.VarBinary(sql.MAX), sigBytes)
    .input('ext', sql.NVarChar(10), sigExt)
    .query(`UPDATE dbo.Beurteilungen SET AusbildungsleiterBestaetigtVon=@von, AusbildungsleiterBestaetigtAm=SYSUTCDATETIME(),
              AusbildungsleiterUnterschriftBild=@bild, AusbildungsleiterUnterschriftExt=@ext,
              AktualisiertAm=SYSUTCDATETIME() WHERE Id=@id`);
  if (signatur) {
    try { await unterschriftenSvc.speichereMeine(pool, ausbildungsleiterOid, signatur); }
    catch (e) { console.error('[beurteilungen] speichereMeine (best effort):', e.message); }
  }
}

// Beendete Durchläufe des Nutzers ohne abgeschlossene Beurteilung -> Mitteilung anlegen (idempotent).
async function ermittleUndErzeugeFaellige(pool, user) {
  const email = String(user.email || '').toLowerCase();
  if (!email) return [];
  // Eigene Zuweisungen + die der aktuell Vertretenen (der Vertreter soll auch
  // deren fällige Beurteilungen sehen/erledigen). Alle per VerantwEmail.
  const delegiert = await aktiveVertreteneEmails(pool, user.oid);
  const emails = [...new Set([email, ...delegiert])];
  const req = pool.request().input('heute', sql.Date, heuteYmd());
  const params = emails.map((e, i) => { req.input(`e${i}`, sql.NVarChar(255), e); return `@e${i}`; });
  const r = await req
    .query(`
      SELECT z.Id AS ZuweisungId, z.Abteilung, z.Von, z.Bis, z.AzubiOid
      FROM dbo.Zuweisungen z
      LEFT JOIN dbo.Beurteilungen b ON b.ZuweisungId = z.Id AND b.Status = 'abgeschlossen'
      WHERE z.VerantwEmail IN (${params.join(',')}) AND z.Bis IS NOT NULL AND z.Bis < @heute AND b.Id IS NULL
      ORDER BY z.Bis DESC`);
  for (const z of r.recordset) {
    const exists = await pool.request()
      .input('userOid', sql.NVarChar(36), user.oid)
      .input('zid', sql.Int, z.ZuweisungId)
      .query(`SELECT TOP 1 Id FROM dbo.Benachrichtigungen
              WHERE UserOid=@userOid AND Typ='beurteilung_faellig' AND ZuweisungId=@zid`);
    if (!exists.recordset.length) {
      await erzeugeBenachrichtigung(pool, {
        userOid: user.oid, typ: 'beurteilung_faellig', zuweisungId: z.ZuweisungId, fromUserOid: null,
      });
      // Genau einmal je (Person, Zuweisung) — der exists-Check oben ist auch die
      // Sperre gegen wiederholte Erinnerungs-Mails bei jedem Login.
      await mailBeurteilung(pool, [user.oid], 'beurteilung_faellig', {
        zuweisungId: z.ZuweisungId, azubiOid: z.AzubiOid, abteilung: z.Abteilung, von: z.Von, bis: z.Bis,
      });
    }
  }
  return r.recordset.map(z => ({
    zuweisungId: z.ZuweisungId, abteilung: z.Abteilung, von: z.Von, bis: z.Bis, azubiOid: z.AzubiOid,
  }));
}

// Flache Liste aller Zuweisungen, die der Nutzer beurteilen darf (befristet
// per E-Mail + dauerhaft per AusbilderAzubis, inkl. Vertretungen — via
// ladeKorrekturKontext), mit Beurteilungsstatus. Speist den eigenen
// "Beurteilungen"-Reiter (Ausbilder/Prüfer/Admin/Developer — NICHT Azubi,
// der bleibt beim bestehenden Weg über die Durchlauf-Kacheln).
// Optionaler azubiOid-Filter (Admin/Developer + dauerhafte Ausbilder wählen
// im Reiter einen Azubi aus): schränkt IMMER nur innerhalb der ohnehin schon
// berechtigten Menge ein, weitet den Zugriff also nie aus.
async function listMeineBeurteilbaren(pool, user, azubiOid) {
  if (user.istAzubi || user.istDhStudent) return [];
  const global = user.role === 'developer' || user.role === 'admin';

  let where = '1=1';
  const r = pool.request();
  if (!global) {
    const kontext = await ladeKorrekturKontext(pool, user);
    const emails = [...new Set(kontext.zuweisungen.map(z => z.verantwortlicherEmail).filter(Boolean))];
    const dauerOids = kontext.dauerAusbilderAzubiOids || [];
    if (!emails.length && !dauerOids.length) return [];
    const emailParams = emails.map((e, i) => { r.input(`e${i}`, sql.NVarChar(255), e); return `@e${i}`; });
    const oidParams = dauerOids.map((o, i) => { r.input(`o${i}`, sql.NVarChar(36), o); return `@o${i}`; });
    const clauses = [];
    if (emailParams.length) clauses.push(`z.VerantwEmail IN (${emailParams.join(',')})`);
    if (oidParams.length) clauses.push(`z.AzubiOid IN (${oidParams.join(',')})`);
    // Klammern nötig: sonst würde ein nachträgliches "AND z.AzubiOid=@filterAzubiOid"
    // wegen SQL-Operatorpräzedenz (AND vor OR) nur an die zweite Klausel binden.
    where = `(${clauses.join(' OR ')})`;
  }
  if (azubiOid) {
    r.input('filterAzubiOid', sql.NVarChar(36), azubiOid);
    where += ' AND z.AzubiOid = @filterAzubiOid';
  }

  const result = await r.query(`
    SELECT z.Id AS ZuweisungId, z.AzubiOid, z.Abteilung, z.Von, z.Bis, u.Name AS AzubiName,
           b.Status AS BeurteilungStatus, b.Typ AS BeurteilungTyp
    FROM dbo.Zuweisungen z
    JOIN dbo.Users u ON u.Oid = z.AzubiOid
    LEFT JOIN dbo.Beurteilungen b ON b.ZuweisungId = z.Id
    WHERE ${where}
    ORDER BY z.Bis DESC, z.Von DESC
  `);
  return result.recordset.map(row => ({
    zuweisungId: row.ZuweisungId,
    azubiOid: row.AzubiOid,
    azubiName: row.AzubiName,
    abteilung: row.Abteilung,
    von: ymd(row.Von),
    bis: ymd(row.Bis),
    status: row.BeurteilungStatus === 'abgeschlossen' ? 'abgeschlossen' : 'offen',
    // Solange noch keine Beurteilungen-Zeile existiert (Typ ist dann NULL aus
    // dem LEFT JOIN), aus den Zuweisungsdaten selbst ableiten — so zeigt die
    // Liste den erwarteten Prozess auch VOR der ersten Entwurf-Anlage.
    typ: row.BeurteilungTyp || ermittleTyp(row.Von, row.Bis),
  }));
}

module.exports = {
  ladeZuweisung, darfBeurteilen, darfBeurteilungBearbeiten, ermittleAusbildungsleiter, ermittleModus, ermittleTyp,
  getByZuweisung, listByAzubi,
  upsertEntwurf, abschliessen, patchNachAbschluss, kenntnisnahme, ermittleUndErzeugeFaellige,
  listMeineBeurteilbaren, ausbildungsleiterBestaetigen,
};
