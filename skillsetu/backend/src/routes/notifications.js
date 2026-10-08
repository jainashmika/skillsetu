// In-app notification centre with live Server-Sent Events stream (SRS 3.6.2) and preferences.
const express = require('express');
const { z } = require('zod');
const { one, all, run } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { bus } = require('../services/events');
const { ah } = require('../utils/errors');

const r = express.Router();
r.use(requireAuth);

r.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const unreadOnly = req.query.unread === 'true';
  const items = await all(`SELECT * FROM notifications WHERE user_id=? ${unreadOnly ? 'AND read_at IS NULL' : ''} ORDER BY id DESC LIMIT 30 OFFSET ?`, req.user.id, (page - 1) * 30);
  res.json({ items, unread: (await one('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read_at IS NULL', req.user.id)).c });
});
r.post('/:id/read', async (req, res) => { await run("UPDATE notifications SET read_at=datetime('now') WHERE id=? AND user_id=? AND read_at IS NULL", req.params.id, req.user.id); res.json({ ok: true }); });
r.post('/read-all', async (req, res) => { await run("UPDATE notifications SET read_at=datetime('now') WHERE user_id=? AND read_at IS NULL", req.user.id); res.json({ ok: true }); });
r.delete('/:id', async (req, res) => { await run('DELETE FROM notifications WHERE id=? AND user_id=?', req.params.id, req.user.id); res.json({ ok: true }); });

r.get('/stream', async (req, res) => {
  if (process.env.SERVERLESS) return res.status(204).end(); // long-lived streams are not supported on serverless hosts
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write(`event: hello\ndata: ${JSON.stringify({ unread: (await one('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read_at IS NULL', req.user.id)).c })}\n\n`);
  const fn = (n) => res.write(`event: notification\ndata: ${JSON.stringify(n)}\n\n`);
  bus.on(`notify:${req.user.id}`, fn);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); bus.off(`notify:${req.user.id}`, fn); });
});

r.get('/prefs', async (req, res) => {
  const p = (await one('SELECT * FROM notification_prefs WHERE user_id=?', req.user.id)) || { email_mode: 'immediate', sms_opt_in: 1, inapp: 1, job_alerts: 1 };
  res.json({ emailMode: p.email_mode, smsOptIn: !!p.sms_opt_in, inApp: !!p.inapp, jobAlerts: !!p.job_alerts });
});
r.put('/prefs', ah(async (req, res) => {
  const d = z.object({ emailMode: z.enum(['immediate', 'digest', 'off']), smsOptIn: z.boolean(), inApp: z.boolean(), jobAlerts: z.boolean() }).parse(req.body);
  await run(`INSERT INTO notification_prefs(user_id,email_mode,sms_opt_in,inapp,job_alerts) VALUES(?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET email_mode=excluded.email_mode, sms_opt_in=excluded.sms_opt_in, inapp=excluded.inapp, job_alerts=excluded.job_alerts`,
  req.user.id, d.emailMode, d.smsOptIn ? 1 : 0, d.inApp ? 1 : 0, d.jobAlerts ? 1 : 0);
  await run('INSERT INTO consents(user_id,purpose,granted) VALUES(?,?,?)', req.user.id, 'sms_notifications', d.smsOptIn ? 1 : 0);
  res.json(d);
}));

module.exports = r;
