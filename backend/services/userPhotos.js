'use strict';
/* Profilbilder aus dem Entra-Sync (dbo.UserPhotos). Getrennt von services/users.js,
   damit die dortigen SELECT * FROM Users-Stellen nicht durch das VARBINARY belastet werden. */
const { getPool, sql } = require('../db/connection');

async function upsertPhoto(oid, content, contentType) {
  const pool = await getPool();
  await pool.request()
    .input('oid', sql.NVarChar(36), oid)
    .input('content', sql.VarBinary(sql.MAX), content)
    .input('contentType', sql.NVarChar(50), contentType || 'image/jpeg')
    .query(`
      MERGE dbo.UserPhotos AS t
      USING (SELECT @oid AS Oid) AS s ON t.Oid = s.Oid
      WHEN MATCHED THEN UPDATE SET
        Content = @content, ContentType = @contentType, AktualisiertAm = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT (Oid, Content, ContentType)
        VALUES (@oid, @content, @contentType);
    `);
}

async function deletePhoto(oid) {
  const pool = await getPool();
  await pool.request().input('oid', sql.NVarChar(36), oid)
    .query('DELETE FROM dbo.UserPhotos WHERE Oid = @oid');
}

async function getPhoto(oid) {
  const pool = await getPool();
  const res = await pool.request().input('oid', sql.NVarChar(36), oid)
    .query('SELECT Content, ContentType, AktualisiertAm FROM dbo.UserPhotos WHERE Oid = @oid');
  return res.recordset[0] || null;
}

module.exports = { upsertPhoto, deletePhoto, getPhoto };
