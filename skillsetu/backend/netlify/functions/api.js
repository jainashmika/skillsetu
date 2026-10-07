// Netlify Function that runs the whole Express API (demo deployment).
// Storage is the function's temporary disk: demo data is re-seeded on each cold start and changes
// are not permanent. For a persistent deployment use Docker (see README).
process.env.SERVERLESS = 'true';
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.DATA_DIR = process.env.DATA_DIR || '/tmp/skillsetu';
process.env.EXPOSE_OTP = process.env.EXPOSE_OTP || 'true';
process.env.LOG_REQUESTS = 'false';
// Demo-only defaults so the site works without any configuration. Set real values in Netlify env vars.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'skillsetu-netlify-demo-secret-change-me';

const serverless = require('serverless-http');
const app = require('../../src/app');
const { one } = require('../../src/db');

if (!one("SELECT 1 FROM users WHERE role='admin'")) {
  require('../../src/db/seed').seed();
}
try { require('../../src/services/jobs').expireDue(); } catch { /* ignore */ }

const handler = serverless(app, {
  request(req) {
    // Requests arrive either as /api/... (redirect rewrite) or /.netlify/functions/api/...
    if (req.url.startsWith('/.netlify/functions/api')) req.url = `/api${req.url.slice('/.netlify/functions/api'.length)}` || '/api';
  },
});
module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const res = await handler(event, context);
  require('../../src/services/events').flush();
  return res;
};
