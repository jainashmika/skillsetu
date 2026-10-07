// Asynchronous activity event stream (SRS 3.5.1). Events are buffered in memory and flushed in
// batches so tracking clicks never blocks a request; this is the in-process stand-in for Kafka.
const { EventEmitter } = require('events');
const { db } = require('../db');

const bus = new EventEmitter();
bus.setMaxListeners(1000);

const buffer = [];
const insert = db.prepare('INSERT INTO activity_events(user_id,guest_id,role,event,job_id,meta,created_at) VALUES(?,?,?,?,?,?,?)');
const flushTx = db.transaction((rows) => { for (const r of rows) insert.run(...r); });
let stats = { emitted: 0, flushed: 0, lastFlushMs: 0 };

function track({ userId = null, guestId = null, role = null, event, jobId = null, meta = null }) {
  buffer.push([userId, guestId, role, event, jobId, meta ? JSON.stringify(meta) : null, new Date().toISOString().replace('T', ' ').slice(0, 19)]);
  stats.emitted++;
  if (buffer.length >= 200) flush();
}
function flush() {
  if (!buffer.length) return;
  const t = Date.now();
  const rows = buffer.splice(0, buffer.length);
  try { flushTx(rows); stats.flushed += rows.length; } catch (e) { console.error('[events] flush failed', e.message); }
  stats.lastFlushMs = Date.now() - t;
}
const timer = setInterval(flush, 1000);
timer.unref();

module.exports = { bus, track, flush, stats: () => ({ ...stats, buffered: buffer.length }) };
