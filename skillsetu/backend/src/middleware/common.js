// Cross-cutting middleware: structured request logging + metrics, rate limiting, lightweight
// intrusion detection, and the error handler that hides internals from users (NFR-66/67).
const crypto = require('crypto');
const { ZodError } = require('zod');
const { run } = require('../db');
const metrics = require('../services/metrics');
const { TokenBucket } = require('../utils/ds');
const { AppError, E } = require('../utils/errors');
const config = require('../config');

function requestLog(req, res, next) {
  const t = process.hrtime.bigint();
  req.id = crypto.randomUUID().slice(0, 8);
  res.setHeader('X-Request-Id', req.id);
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - t) / 1e6;
    const route = `${req.method} ${req.baseUrl || ''}${req.route?.path || (res.statusCode === 404 ? ' (unmatched)' : req.path)}`;
    metrics.record(route, ms, res.statusCode);
    if (config.env !== 'test' && process.env.LOG_REQUESTS !== 'false') {
      console.log(JSON.stringify({ t: new Date().toISOString(), id: req.id, m: req.method, p: req.originalUrl.split('?')[0], s: res.statusCode, ms: Number(ms.toFixed(1)), u: req.user?.id }));
    }
  });
  next();
}

const bucket = new TokenBucket();
function rateLimit(name, perMin) {
  return (req, res, next) => {
    if (config.env === 'test') return next();
    const key = `${name}:${req.ip}`;
    const r = bucket.take(key, perMin);
    res.setHeader('X-RateLimit-Limit', perMin); res.setHeader('X-RateLimit-Remaining', r.remaining);
    if (!r.ok) {
      res.setHeader('Retry-After', r.retryAfterSec);
      run('INSERT INTO security_events(type,severity,ip,detail) VALUES(?,?,?,?)', 'rate_limited', 'low', req.ip, `${name} ${req.method} ${req.originalUrl}`.slice(0, 200));
      return next(E.tooMany());
    }
    next();
  };
}

// Flags common injection payloads for security monitoring (NFR-45). Parameterised SQL and React
// escaping already neutralise these; this is detection, not the defence.
const SUSPICIOUS = /(<script|javascript:|onerror=|union\s+select|;\s*drop\s+table|'\s*or\s+'1'\s*=\s*'1|\.\.\/\.\.\/)/i;
function ids(req, _res, next) {
  const probe = `${decodeURIComponent(req.originalUrl || '')} ${req.body && typeof req.body === 'object' ? JSON.stringify(req.body).slice(0, 4000) : ''}`;
  if (SUSPICIOUS.test(probe)) run('INSERT INTO security_events(type,severity,ip,detail) VALUES(?,?,?,?)', 'suspicious_input', 'medium', req.ip, `${req.method} ${req.originalUrl}`.slice(0, 200));
  next();
}

function notFound(req, _res, next) { next(new AppError(404, 'This endpoint does not exist.', 'not_found')); }

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    const fields = {}; for (const i of err.issues) fields[i.path.join('.') || '_'] = i.message;
    return res.status(400).json({ error: 'validation_failed', message: Object.values(fields)[0] || 'Please check the highlighted fields.', fields });
  }
  if (err instanceof AppError) return res.status(err.status).json({ error: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large', message: 'The request is too large.' });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ error: 'file_too_large', message: 'File is too large (max 5 MB).' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_json', message: 'Request body is not valid JSON.' });
  const ref = crypto.randomUUID().slice(0, 8);
  try { run('INSERT INTO error_logs(ref,method,path,message,stack) VALUES(?,?,?,?,?)', ref, req.method, req.originalUrl, err.message, err.stack); } catch { /* ignore */ }
  if (config.env !== 'test') console.error(`[error ${ref}]`, err);
  res.status(500).json({ error: 'server_error', message: `Something went wrong on our side. Please try again. Reference: ${ref}` });
}

module.exports = { requestLog, rateLimit, ids, notFound, errorHandler, bucket };
