// Typed application errors. Messages here are safe to show users (NFR-66).
class AppError extends Error {
  constructor(status, message, code = 'error', details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
const E = {
  bad: (msg, details) => new AppError(400, msg, 'bad_request', details),
  unauth: (msg = 'Please sign in to continue.') => new AppError(401, msg, 'unauthenticated'),
  forbidden: (msg = 'You do not have access to this.') => new AppError(403, msg, 'forbidden'),
  notFound: (what = 'Item') => new AppError(404, `${what} not found.`, 'not_found'),
  conflict: (msg) => new AppError(409, msg, 'conflict'),
  locked: (msg) => new AppError(423, msg, 'locked'),
  tooMany: (msg = 'Too many requests. Please slow down and try again shortly.') => new AppError(429, msg, 'rate_limited'),
  unavailable: (msg) => new AppError(503, msg, 'unavailable'),
};
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
module.exports = { AppError, E, ah };
