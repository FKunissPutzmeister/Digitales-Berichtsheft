const sql = require('mssql');

let pool = null;

async function getPool() {
  if (!pool) {
    const config = {
      server:   process.env.DB_SERVER,
      database: process.env.DB_NAME,
      user:     process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      options: {
        trustServerCertificate: true,
        encrypt: false,
      },
    };
    console.log('[DB] Verbinde mit:', config.server, '/', config.database, '| User:', config.user);
    pool = await sql.connect(config);
    console.log('[DB] Verbindung erfolgreich');
  }
  return pool;
}

module.exports = { getPool, sql };
