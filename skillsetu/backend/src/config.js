// Central configuration. Everything is overridable through environment variables (NFR-103, NFR-35).
require('dotenv').config({ quiet: true });
const path = require('path');
const crypto = require('crypto');

const env = process.env.NODE_ENV || 'development';
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function devKey(label) {
  // Deterministic dev-only keys so local runs work out of the box. Production MUST set real keys.
  return crypto.createHash('sha256').update(`skillsetu-dev-${label}`).digest('hex');
}

const config = {
  env,
  isProd: env === 'production',
  port: Number(process.env.PORT || 4000),
  dataDir,
  dbFile: process.env.DB_FILE || path.join(dataDir, `skillsetu.${env === 'test' ? 'test' : 'db'}.sqlite`),
  uploadDir: process.env.UPLOAD_DIR || path.join(dataDir, 'uploads'),
  backupDir: process.env.BACKUP_DIR || path.join(dataDir, 'backups'),
  jwtSecret: process.env.JWT_SECRET || devKey('jwt'),
  dataKey: process.env.DATA_ENCRYPTION_KEY || devKey('aes'),        // 64 hex chars => AES-256
  hmacKey: process.env.HMAC_KEY || devKey('hmac'),
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
  // In dev the OTP is also returned in API responses so the app can be tried without an SMS gateway.
  exposeOtp: process.env.EXPOSE_OTP ? process.env.EXPOSE_OTP === 'true' : env !== 'production',
  simulateTransientFailures: Number(process.env.SIMULATED_FAILURE_RATE || 0.15),
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:5173',
};

if (config.isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

module.exports = config;
