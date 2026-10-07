// Express application wiring. Kept separate from server.js so tests can import it.
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const swaggerUi = require('swagger-ui-express');
const config = require('./config');
const { authenticate } = require('./middleware/auth');
const { requestLog, rateLimit, ids, notFound, errorHandler } = require('./middleware/common');
const { publicDir } = require('./middleware/upload');
const openapi = require('./openapi');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(compression({ filter: (req, res) => !req.path.endsWith('/stream') && compression.filter(req, res) }));
app.use(express.json({ limit: '1mb' }));
app.use(requestLog);
app.use('/api', rateLimit('global', 600), ids, authenticate);

app.use(['/uploads', '/api/uploads'], express.static(publicDir, { maxAge: '7d', fallthrough: false }));
app.get('/api/openapi.json', (_req, res) => res.json(openapi));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'SkillSetu API' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/public', require('./routes/public'));
app.use('/api/seeker', require('./routes/seeker'));
app.use('/api/employer', require('./routes/employer'));
app.use('/api/portal', require('./routes/portal'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/v1', require('./routes/v1'));
app.use('/api', notFound);

// Serve the built frontend when present (single-container deployment).
const web = process.env.WEB_DIST || path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(web)) {
  app.use(express.static(web, { maxAge: '1h', index: false }));
  app.get(/^\/(?!api|uploads).*/, (_req, res) => res.sendFile(path.join(web, 'index.html')));
}
app.use(errorHandler);
module.exports = app;
