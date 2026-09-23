const mysql = require('mysql2/promise');

const { config } = require('./config.js');

const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  ssl: config.db.ssl,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  dateStrings: true, // DATE volta como 'YYYY-MM-DD', sem timezone surpresa
  timezone: 'Z'
});

/** Executa uma query e devolve só as linhas. */
async function q(sql, params) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function pingDb() {
  const c = await pool.getConnection();
  try {
    await c.ping();
  } finally {
    c.release();
  }
}

module.exports = { pool, q, pingDb };
