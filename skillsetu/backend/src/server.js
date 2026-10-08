const config = require('./config');
const app = require('./app');
const { db, one } = require('./db');
const scheduler = require('./scheduler');
const events = require('./services/events');

if (!(await one("SELECT 1 FROM users WHERE role='admin'"))) {
  console.log('No data found - seeding demo data...');
  require('./db/seed').seed();
}
scheduler.start();
const server = app.listen(config.port, () => console.log(`SkillSetu API listening on http://localhost:${config.port} (${config.env})`));
function shutdown() { console.log('Shutting down...'); events.flush(); server.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(0), 5000).unref(); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
