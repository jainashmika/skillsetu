// Database access layer. better-sqlite3 is synchronous and very fast for this workload;
// all SQL lives behind this module and the repositories so the engine can be swapped (NFR-109).
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });

const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

const json = (v, fallback = null) => {
  if (v === null || v === undefined || v === '') return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
};

module.exports = {
  db,
  json,
  one: (sql, ...p) => db.prepare(sql).get(...p),
  all: (sql, ...p) => db.prepare(sql).all(...p),
  run: (sql, ...p) => db.prepare(sql).run(...p),
  tx: (fn) => db.transaction(fn)(),
};
