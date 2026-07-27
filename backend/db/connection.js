const sql = require('mssql');

// Wir cachen bewusst das *Verbindungs-Promise* (nicht erst den fertigen Pool).
// Sonst sehen mehrere gleichzeitige Requests (z. B. das Frontend feuert beim
// Laden parallel /api/auth/me + weitere Endpunkte) alle `pool === null` und
// rufen jeweils sql.connect() auf — mssql erlaubt aber nur EINE globale
// Verbindung und quittiert die Folgeaufrufe mit "Global connection already
// exists". Ein einziges geteiltes Promise verhindert diesen Connection-Storm.
let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    const config = {
      server:   process.env.DB_SERVER,
      database: process.env.DB_NAME,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      options: {
        // TLS auf der DB-Verbindung: Credentials + alle PII gehen verschlüsselt
        // über die Leitung (Schutz vor Sniffing/MITM). trustServerCertificate
        // bleibt an, weil SQL Express hier ein selbstsigniertes Zertifikat nutzt.
        encrypt: true,
        trustServerCertificate: true,
      },
    };
    console.log('[DB] Verbinde mit:', config.server, '/', config.database, '| User:', config.user);
    poolPromise = sql.connect(config)
      .then((pool) => {
        console.log('[DB] Verbindung erfolgreich');
        return pool;
      })
      .catch(async (err) => {
        // Fehlgeschlagene Verbindung (z. B. Timeout, DB kurz weg): Cache leeren
        // UND den halb-initialisierten globalen mssql-Pool schließen. Sonst
        // bleibt eine kaputte Verbindung hängen und JEDER Folge-Request
        // scheitert dauerhaft mit "Global connection already exists" — aus
        // einem einmaligen Aussetzer würde ein Dauerausfall der Auth.
        poolPromise = null;
        try { await sql.close(); } catch (_) { /* nichts zu schließen */ }
        throw err;
      });
  }
  return poolPromise;
}

module.exports = { getPool, sql };
