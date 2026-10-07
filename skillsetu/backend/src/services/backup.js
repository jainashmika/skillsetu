// Automated backups (NFR-60, 138-142): online SQLite backups, SHA-256 checksums, automated
// integrity verification by opening each backup and running PRAGMA integrity_check.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { db, run, all } = require('../db');
const config = require('../config');
const { sha256 } = require('../utils/crypto');

async function backup(kind = 'full') {
  fs.mkdirSync(config.backupDir, { recursive: true });
  const file = path.join(config.backupDir, `skillsetu-${kind}-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
  await db.backup(file);
  const buf = fs.readFileSync(file);
  const sum = sha256(buf);
  let verified = 0;
  try { const b = new Database(file, { readonly: true }); verified = b.pragma('integrity_check', { simple: true }) === 'ok' ? 1 : 0; b.close(); } catch { verified = 0; }
  run('INSERT INTO backups(file,kind,size_bytes,sha256,verified) VALUES(?,?,?,?,?)', path.basename(file), kind, buf.length, sum, verified);
  // retention: keep the newest 14
  const old = all('SELECT id, file FROM backups ORDER BY id DESC LIMIT -1 OFFSET 14');
  for (const o of old) { try { fs.unlinkSync(path.join(config.backupDir, o.file)); } catch { /* already gone */ } run('DELETE FROM backups WHERE id=?', o.id); }
  return { file: path.basename(file), size: buf.length, sha256: sum, verified: !!verified };
}
module.exports = { backup };
