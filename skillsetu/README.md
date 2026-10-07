# SkillSetu: AI-Driven Job Matching Platform

A full-stack implementation of the *Software Requirements Specification for the AI-Driven Job Matching Platform* (YEI programme). Job seekers, employers, third-party job portals and administrators each get their own workspace; an offline AI engine matches people to jobs and explains every score.

**Stack:** React 19 + Vite + Tailwind (frontend) · Node.js 22 + Express (API) · SQLite via better-sqlite3 (swappable data layer) · Docker.

## Run it

### Option A: Docker (one command)
```bash
docker compose up --build
```
Open http://localhost:8080. Demo data is seeded on first start.

### Option B: Node.js 20+ locally
```bash
npm run install:all          # installs backend + frontend
npm run dev:api              # terminal 1 -> API on http://localhost:4000
npm run dev:web              # terminal 2 -> app on http://localhost:5173
```
Run tests with `npm test`. Reset demo data with `npm --prefix backend run reset` (then restart the API).

### Option C: Netlify (live demo link)
The repo includes `netlify.toml`: the React app is served as static files and the whole Express API runs as one Netlify Function.

1. Push this folder to a GitHub repository (or drag-and-drop is **not** enough, because the API needs a build).
2. In Netlify: **Add new site > Import an existing project**, pick the repo. Netlify reads `netlify.toml`, so leave the build settings as they are and click **Deploy**.
3. Optional: in **Site configuration > Environment variables** set `JWT_SECRET`, `DATA_ENCRYPTION_KEY` (64 hex chars) and `HMAC_KEY` to your own random values.

Or from your computer: `npm i -g netlify-cli`, then `netlify deploy --build --prod` inside this folder.

Limits of the Netlify demo: functions have no permanent disk, so the database lives in temporary storage and is re-seeded with demo data whenever the function cold-starts (changes are not kept for long). Live notification pop-ups are off (notifications still appear in the bell after a refresh), and background jobs such as email sending run only when an admin clicks "Process now". For a persistent deployment use Docker (Option A) on any VPS, Render or Railway.

### Demo accounts
| Role | Email | Password |
|---|---|---|
| Job seeker | priya@example.in | Seeker@123 |
| Employer (owner) | hr@finlytics.in | Employer@123 |
| Job portal | api@naukri-demo.in | Portal@123 |
| Administrator (MFA on) | admin@skillsetu.in | Admin@123 |

There is no real SMS gateway, so in demo mode the one-time code is shown on screen (yellow box). The login page has one-click buttons for each demo account.

Sample checksum-valid IDs for trying verification: GSTIN `29ABCDE1234F1ZW` (company page has a "Use sample" button) and Aadhaar `234123412346` (sandbox only).

## What is implemented (SRS traceability)

| SRS section | Where |
|---|---|
| 3.1.1 Seeker registration, OTP activation, 3-level progressive profile, AI resume parsing (PDF/DOCX/TXT) with confidence scores, visibility toggle, shareable URL + QR | `routes/auth.js`, `routes/seeker.js`, `services/resumeParser.js`, `pages/seeker/Profile.jsx` |
| 3.1.2 Employer registration, GSTIN/CIN verification with retry and manual fallback, Verified badge, logo/documents, multiple HR users per company, dashboard | `routes/employer.js`, `services/integrations/gov.js` |
| 3.1.3 / 3.4.1 Portal push API with API keys + OAuth 2.0 client credentials, IP whitelist, token-bucket rate limits, adapters (Naukri / foundit / NCS / generic), idempotency keys, sandbox mode, bulk CSV/JSON, sync logs, dead-letter queue, Swagger | `routes/v1.js`, `routes/portal.js`, `services/integrations/*`, `/api/docs` |
| 3.1.4 Admin: approve/ban/unlock/reset users, moderation, taxonomy (skills with synonyms, sectors, occupations, trainings) with LRU cache, hash-chained append-only audit log | `routes/admin.js`, `services/audit.js` |
| 3.1.5 / 5.2.1 bcrypt, password policy, account lockout, MFA (mandatory for admins), RBAC, JWT with revocation, configurable session timeout, access logs, DigiLocker OIDC sign-in (sandbox) | `routes/auth.js`, `middleware/auth.js` |
| 3.2.1 / 3.2.4 Job form, Schema.org JobPosting JSON-LD, state machine (draft → active ⇄ paused → archived, auto-expiry), status history | `services/jobs.js` |
| 3.2.2 / 3.2.3 Inverted index + BM25 search with synonym expansion, facets, filters, saved searches + alerts, saved jobs | `services/matching/searchIndex.js` |
| 3.3.1 Match score from skills (taxonomy overlap + TF-IDF cosine), education (Indian qualification acronyms), experience, location, salary; admin weights and threshold; confidence; KNN retrieval | `services/matching/engine.js` |
| 3.3.2 Hybrid recommender: content + item-item collaborative filtering + matrix factorisation (SGD) + CTR prior | `services/matching/recommender.js` |
| 3.3.3 Reverse matching, Top-N heap, strengths/gaps, min-qualification filters, talent pools, privacy scrubbing | `routes/employer.js`, `utils/ds.js` |
| 3.4.2 Aadhaar e-KYC (Verhoeff, encrypted, masked) and DigiLocker certificate checks with circuit breakers | `services/integrations/gov.js` |
| 3.5 Activity event stream, labour-market analytics (hiring rate, CTC trends, state-wise, skill gap), AI match accuracy (precision/recall), system metrics (p50/p95/p99, CPU, memory), custom reports streamed to CSV/PDF/JSON, scheduled reports | `services/analytics.js`, `services/reports.js`, `services/metrics.js` |
| 3.6 Email (templates, immediate/digest), in-app (Server-Sent Events, read/unread), SMS (TRAI DLT template IDs, opt-in), outbox worker with retries | `services/notify.js`, `routes/notifications.js` |
| 3.7 News CMS with profile-targeted ordering, FAQ/help centre with SQLite FTS5 full-text search (incl. labour laws) | `routes/public.js`, admin Content page |
| 4.1 Guest browsing, DPDP cookie/consent banner, responsive mobile-first UI, English/Hindi/Kannada | `components/Layout.jsx`, `lib/i18n.jsx` |
| 5.2.2 AES-256-GCM field encryption with key versioning, HMAC lookups, masking, secure deletion, data export | `utils/crypto.js`, `/api/auth/account` |
| 5.2.3 Security events (rate limiting, lockouts, IP blocks, injection detection), Helmet headers | `middleware/common.js` |
| 5.3 / 5.6 Friendly errors with reference IDs, error logs, retries, automated backups with SHA-256 + integrity check, retention jobs | `services/backup.js`, `scheduler.js` |
| 5.4 WCAG: skip link, labels, focus rings, ARIA, reduced motion, keyboard navigation | throughout the frontend |
| 5.5 Modular structure, env-based config, Docker, automated tests | `Dockerfile`, `backend/tests` |

**Mocked by design** (no credentials needed): GSTN, MCA21, UIDAI e-KYC, DigiLocker, SMS and email providers. They sit behind adapter modules with realistic latency and transient failures, so swapping in real APIs means replacing one function each.

## Project structure
```
backend/
  src/app.js, server.js, scheduler.js, openapi.js, config.js
  src/db/          schema.sql (mirrors the ER diagram), seed.js
  src/middleware/  auth (JWT, RBAC), common (logging, rate limit, errors), upload
  src/routes/      auth, public, seeker, employer, portal, admin, notifications, v1 (partner API)
  src/services/    matching/ (engine, vectorizer, recommender, searchIndex), integrations/, jobs, notify, analytics, reports, audit, ...
  tests/           API + engine tests (vitest + supertest)
frontend/
  src/pages/       public pages, seeker/, employer/, portal/, admin/
  src/components/  Layout, ui (MatchMeter, JobCard, ...)
  src/lib/         api client, auth context, i18n
```
