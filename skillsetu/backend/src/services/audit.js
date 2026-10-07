// Immutable, hash-chained audit trail (SRS 3.1.4 "append-only", 3.4.2 audit trails).
// Each row stores sha256(prev_hash + payload); tampering with any row breaks the chain.
const { one, all, run, db } = require('../db');
const { sha256 } = require('../utils/crypto');

const insert = db.prepare(`INSERT INTO audit_logs(actor_id,actor_role,action,entity,entity_id,details,ip,prev_hash,hash,created_at)
                           VALUES(?,?,?,?,?,?,?,?,?,?)`);
const payloadOf = (r) => JSON.stringify([r.actor_id, r.actor_role, r.action, r.entity, r.entity_id, r.details, r.ip, r.created_at]);

const append = db.transaction((e) => {
  const last = one('SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1');
  const prev = last ? last.hash : 'GENESIS';
  const row = {
    actor_id: e.actorId ?? null, actor_role: e.actorRole ?? null, action: e.action, entity: e.entity ?? null,
    entity_id: e.entityId != null ? String(e.entityId) : null,
    details: e.details ? JSON.stringify(e.details) : null, ip: e.ip ?? null,
    created_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
  };
  const hash = sha256(prev + payloadOf(row));
  insert.run(row.actor_id, row.actor_role, row.action, row.entity, row.entity_id, row.details, row.ip, prev, hash, row.created_at);
});

function audit(req, action, entity, entityId, details) {
  try {
    append({ actorId: req?.user?.id, actorRole: req?.user?.role || (req?.portal ? 'portal' : null), action, entity, entityId, details, ip: req?.ip });
  } catch (e) { console.error('[audit] failed', e.message); }
}

function verifyChain() {
  const rows = all('SELECT * FROM audit_logs ORDER BY id');
  let prev = 'GENESIS';
  for (const r of rows) {
    if (r.prev_hash !== prev || sha256(prev + payloadOf(r)) !== r.hash) return { valid: false, brokenAt: r.id, total: rows.length };
    prev = r.hash;
  }
  return { valid: true, total: rows.length, head: prev };
}
module.exports = { audit, append, verifyChain, _run: run };
