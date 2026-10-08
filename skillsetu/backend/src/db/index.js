const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { require: true }
});

function convertQuery(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

const db = {
  pool,
  query: (text, params) => pool.query(convertQuery(text), params),
  prepare: (sql) => {
    const pgSql = convertQuery(sql);
    return {
      get: async (...params) => {
        const { rows } = await pool.query(pgSql, params.flat());
        return rows[0] || undefined;
      },
      all: async (...params) => {
        const { rows } = await pool.query(pgSql, params.flat());
        return rows;
      },
      run: async (...params) => {
        const { rowCount } = await pool.query(pgSql, params.flat());
        return { changes: rowCount };
      }
    };
  },
  transaction: (fn) => async (...args) => await fn(...args)
};

module.exports = {
  db,
  json: (v, fallback = null) => {
    if (v === null || v === undefined || v === '') return fallback;
    try { return JSON.parse(v); } catch { return fallback; }
  },
  one: async (sql, ...p) => await db.prepare(sql).get(...p),
  all: async (sql, ...p) => await db.prepare(sql).all(...p),
  run: async (sql, ...p) => await db.prepare(sql).run(...p),
  tx: async (fn) => { return await fn(); }
};
