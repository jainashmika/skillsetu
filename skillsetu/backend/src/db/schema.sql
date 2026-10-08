-- SkillSetu schema (SQLite). Mirrors the ER diagram in SRS Appendix A.
PRAGMA foreign_keys = ON;

-- ============ Users Accounts Authentication ============
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  role            TEXT NOT NULL CHECK (role IN ('seeker','employer','portal','admin')),
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone_hash      TEXT,                 -- HMAC for lookup (phone itself is encrypted)
  phone_enc       TEXT,                 -- AES-256-GCM (NFR-29/34)
  phone_masked    TEXT,                 -- for UI (NFR-31)
  password_hash   TEXT NOT NULL,        -- bcrypt
  status          TEXT NOT NULL DEFAULT 'pending_otp'
                    CHECK (status IN ('pending_otp','active','banned','pending_approval')),
  phone_verified  INTEGER NOT NULL DEFAULT 0,
  mfa_enabled     INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  password_changed_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  last_login_at   TEXT,
  language        TEXT NOT NULL DEFAULT 'en',
  created_at      TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_hash);

CREATE TABLE IF NOT EXISTS otps (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL,             -- activate | mfa | reset
  code_hash  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  consumed   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti        TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);

-- ============ Taxonomy (static reference data) ============
CREATE TABLE IF NOT EXISTS sectors (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS skills (           -- SkillSetList
  id        SERIAL PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  category  TEXT NOT NULL DEFAULT 'General',
  synonyms  TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS occupations (      -- JobsCatalog
  id        SERIAL PRIMARY KEY,
  title     TEXT NOT NULL UNIQUE,
  nco_code  TEXT,
  sector    TEXT,
  skill_ids TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS trainings (
  id        SERIAL PRIMARY KEY,
  title     TEXT NOT NULL,
  provider  TEXT NOT NULL,
  url       TEXT,
  duration  TEXT,
  skill_ids TEXT NOT NULL DEFAULT '[]'
);

-- ============ Employer ============
CREATE TABLE IF NOT EXISTS companies (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  gstin         TEXT,
  cin           TEXT,
  industry      TEXT,
  size          TEXT,
  website       TEXT,
  about         TEXT,
  logo_url      TEXT,
  city          TEXT,
  state         TEXT,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
     CHECK (verification_status IN ('unverified','pending','verified','manual_review','rejected')),
  verification_notes TEXT,
  verified_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE TABLE IF NOT EXISTS employer_users (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  company_role TEXT NOT NULL DEFAULT 'hr' CHECK (company_role IN ('owner','hr'))
);
CREATE TABLE IF NOT EXISTS company_documents (
  id         SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  path       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- ============ Job Seeker ============
CREATE TABLE IF NOT EXISTS seeker_profiles (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  slug             TEXT UNIQUE,
  headline         TEXT,
  about            TEXT,
  gender           TEXT,
  city             TEXT,
  state            TEXT,
  education_level  INTEGER NOT NULL DEFAULT 0,   -- ordinal, see taxonomy.EDU_LEVELS
  experience_years REAL NOT NULL DEFAULT 0,
  expected_ctc_min INTEGER,                      -- INR per annum
  expected_ctc_max INTEGER,
  preferred_locations TEXT NOT NULL DEFAULT '[]',
  preferred_work_format TEXT,                    -- onsite|remote|hybrid|any
  preferred_contract TEXT,
  sectors          TEXT NOT NULL DEFAULT '[]',
  languages        TEXT NOT NULL DEFAULT '[]',
  visibility       TEXT NOT NULL DEFAULT 'employers' CHECK (visibility IN ('public','employers','private')),
  aadhaar_enc      TEXT,
  aadhaar_masked   TEXT,
  ekyc_verified    INTEGER NOT NULL DEFAULT 0,
  digilocker_verified INTEGER NOT NULL DEFAULT 0,
  resume_path      TEXT,
  resume_name      TEXT,
  profile_level    INTEGER NOT NULL DEFAULT 1,   -- 3-level progressive profiling
  updated_at       TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_seeker_city ON seeker_profiles(city);
CREATE TABLE IF NOT EXISTS seeker_skills (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id   INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  level      TEXT NOT NULL DEFAULT 'intermediate',
  source     TEXT NOT NULL DEFAULT 'manual',
  confidence REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_seeker_skills_skill ON seeker_skills(skill_id);
CREATE TABLE IF NOT EXISTS educations (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qualification TEXT NOT NULL,
  level       INTEGER NOT NULL DEFAULT 0,
  field       TEXT,
  institution TEXT,
  year        INTEGER,
  grade       TEXT,
  verified    INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS experiences (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  company     TEXT,
  start_date  TEXT,
  end_date    TEXT,
  current     INTEGER NOT NULL DEFAULT 0,
  description TEXT
);

-- ============ Job Portal (third-party) ============
CREATE TABLE IF NOT EXISTS portals (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  owner_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  api_key_hash   TEXT,
  api_key_prefix TEXT,
  ip_whitelist   TEXT NOT NULL DEFAULT '[]',
  rate_limit_per_min INTEGER NOT NULL DEFAULT 60,
  field_mapping  TEXT NOT NULL DEFAULT '{}',
  adapter        TEXT NOT NULL DEFAULT 'generic',
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at     TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE TABLE IF NOT EXISTS sync_logs (
  id          SERIAL PRIMARY KEY,
  portal_id   INTEGER REFERENCES portals(id) ON DELETE CASCADE,
  direction   TEXT NOT NULL,           -- push | pull
  operation   TEXT NOT NULL,
  external_id TEXT,
  status_code INTEGER,
  ok          INTEGER NOT NULL,
  message     TEXT,
  duration_ms INTEGER,
  created_at  TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_sync_portal ON sync_logs(portal_id, created_at);
CREATE TABLE IF NOT EXISTS dead_letters (
  id          SERIAL PRIMARY KEY,
  portal_id   INTEGER REFERENCES portals(id) ON DELETE CASCADE,
  operation   TEXT NOT NULL,
  payload     TEXT NOT NULL,
  error       TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 1,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','discarded')),
  created_at  TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  last_attempt_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key        TEXT NOT NULL,
  portal_id  INTEGER NOT NULL,
  status     INTEGER NOT NULL,
  response   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (key, portal_id)
);

-- ============ Job Posting ============
CREATE TABLE IF NOT EXISTS jobs (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  posted_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  portal_id     INTEGER REFERENCES portals(id) ON DELETE SET NULL,
  external_id   TEXT,
  source        TEXT NOT NULL DEFAULT 'direct',
  external_company TEXT,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  sector        TEXT,
  occupation_id INTEGER REFERENCES occupations(id),
  contract_type TEXT NOT NULL DEFAULT 'full_time'
     CHECK (contract_type IN ('full_time','part_time','contract','internship','apprenticeship')),
  work_format   TEXT NOT NULL DEFAULT 'onsite' CHECK (work_format IN ('onsite','remote','hybrid')),
  city          TEXT,
  state         TEXT,
  ctc_min       INTEGER,
  ctc_max       INTEGER,
  experience_min REAL NOT NULL DEFAULT 0,
  experience_max REAL,
  education_level INTEGER NOT NULL DEFAULT 0,
  openings      INTEGER NOT NULL DEFAULT 1,
  deadline      TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
     CHECK (status IN ('draft','active','paused','expired','archived')),
  visibility    TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','registered')),
  views         INTEGER NOT NULL DEFAULT 0,
  published_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at    TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (portal_id, external_id)
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, published_at);
CREATE INDEX IF NOT EXISTS idx_jobs_city ON jobs(city);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_id);
CREATE TABLE IF NOT EXISTS job_skills (
  job_id   INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  required INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (job_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_job_skills_skill ON job_skills(skill_id);
CREATE TABLE IF NOT EXISTS job_status_history (
  id          SERIAL PRIMARY KEY,
  job_id      INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor_id    INTEGER,
  reason      TEXT,
  created_at  TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- ============ Interactions ============
CREATE TABLE IF NOT EXISTS applications (
  id          SERIAL PRIMARY KEY,
  job_id      INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  seeker_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'applied'
     CHECK (status IN ('applied','shortlisted','interview','offered','hired','rejected','withdrawn')),
  match_score REAL,
  cover_note  TEXT,
  created_at  TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  updated_at  TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE (job_id, seeker_id)
);
CREATE INDEX IF NOT EXISTS idx_app_seeker ON applications(seeker_id);
CREATE TABLE IF NOT EXISTS application_events (
  id             SERIAL PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  status         TEXT NOT NULL,
  note           TEXT,
  actor_id       INTEGER,
  created_at     TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE TABLE IF NOT EXISTS saved_jobs (          -- Job Seeker FavJob Posts ("Interested list")
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (user_id, job_id)
);
CREATE TABLE IF NOT EXISTS saved_searches (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  query      TEXT NOT NULL,
  alert      INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE TABLE IF NOT EXISTS talent_pools (
  id         SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE TABLE IF NOT EXISTS talent_pool_members (
  pool_id    INTEGER NOT NULL REFERENCES talent_pools(id) ON DELETE CASCADE,
  seeker_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (pool_id, seeker_id)
);

-- Current Job Seeker Recommendations / Employer Job Posting Recommended Job Seekers (materialised)
CREATE TABLE IF NOT EXISTS recommendations (
  seeker_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id     INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  score      REAL NOT NULL,
  breakdown  TEXT NOT NULL,
  computed_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (seeker_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_rec_job ON recommendations(job_id, score);

-- Job Seeker Behavior Log + Guest searches + Users Activities Log
CREATE TABLE IF NOT EXISTS activity_events (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER,
  guest_id   TEXT,
  role       TEXT,
  event      TEXT NOT NULL,   -- view_job | search | save_job | apply | post_job | candidate_search | login ...
  job_id     INTEGER,
  meta       TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_events(user_id, event);
CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_events(created_at);

-- ============ Notifications ============
CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_mode TEXT NOT NULL DEFAULT 'immediate' CHECK (email_mode IN ('immediate','digest','off')),
  sms_opt_in INTEGER NOT NULL DEFAULT 1,
  inapp      INTEGER NOT NULL DEFAULT 1,
  job_alerts INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS outbox (
  id          SERIAL PRIMARY KEY,
  channel     TEXT NOT NULL CHECK (channel IN ('email','sms')),
  user_id     INTEGER,
  to_addr     TEXT NOT NULL,
  subject     TEXT,
  body        TEXT NOT NULL,
  template    TEXT,
  dlt_template_id TEXT,
  status      TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','digest')),
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  sent_at     TEXT
);

-- ============ Content ============
CREATE TABLE IF NOT EXISTS news (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  summary     TEXT,
  body        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'Update',
  tags        TEXT NOT NULL DEFAULT '[]',
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  author_id   INTEGER,
  published_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE TABLE IF NOT EXISTS faqs (
  id        SERIAL PRIMARY KEY,
  question  TEXT NOT NULL,
  answer    TEXT NOT NULL,
  category  TEXT NOT NULL DEFAULT 'General',
  context   TEXT,             -- page key for context-sensitive help (NFR-77)
  video_url TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
/* fts5 replaced */
/* triggers replaced */
/* triggers replaced */
/* triggers replaced */

-- ============ Compliance & operations ============
CREATE TABLE IF NOT EXISTS consents (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER,
  guest_id   TEXT,
  purpose    TEXT NOT NULL,
  granted    INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

-- Transactions Security Audit Log: append-only, hash-chained
CREATE TABLE IF NOT EXISTS audit_logs (
  id         SERIAL PRIMARY KEY,
  actor_id   INTEGER,
  actor_role TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  TEXT,
  details    TEXT,
  ip         TEXT,
  prev_hash  TEXT NOT NULL,
  hash       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
/* triggers replaced */
/* triggers replaced */

CREATE TABLE IF NOT EXISTS access_logs (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER,
  email      TEXT,
  event      TEXT NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_access_time ON access_logs(created_at);

CREATE TABLE IF NOT EXISTS error_logs (
  id         SERIAL PRIMARY KEY,
  ref        TEXT NOT NULL,
  method     TEXT,
  path       TEXT,
  message    TEXT,
  stack      TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS security_events (
  id         SERIAL PRIMARY KEY,
  type       TEXT NOT NULL,            -- rate_limited | lockout | ip_blocked | suspicious_input
  severity   TEXT NOT NULL DEFAULT 'medium',
  ip         TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS report_schedules (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  dataset    TEXT NOT NULL,
  filters    TEXT NOT NULL DEFAULT '{}',
  format     TEXT NOT NULL DEFAULT 'csv',
  frequency  TEXT NOT NULL DEFAULT 'weekly',
  recipient  TEXT NOT NULL,
  last_run_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS backups (
  id         SERIAL PRIMARY KEY,
  file       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'full',
  size_bytes INTEGER,
  sha256     TEXT,
  verified   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
