// OpenAPI 3 contract for external developers (SRS 3.1.3 "Swagger schema access", 3.4.3).
const job = { type: 'object', required: ['external_id', 'title', 'description'], properties: {
  external_id: { type: 'string', example: 'EXT-1001' }, company: { type: 'string' }, title: { type: 'string' }, description: { type: 'string', minLength: 30 }, sector: { type: 'string' },
  contract_type: { type: 'string', enum: ['full_time', 'part_time', 'contract', 'internship', 'apprenticeship'] }, work_format: { type: 'string', enum: ['onsite', 'remote', 'hybrid'] },
  city: { type: 'string' }, state: { type: 'string' }, ctc_min: { type: 'integer', description: 'INR per annum' }, ctc_max: { type: 'integer' }, experience_min: { type: 'number' }, experience_max: { type: 'number' },
  education_level: { type: 'integer', minimum: 0, maximum: 7 }, openings: { type: 'integer' }, deadline: { type: 'string', format: 'date' }, skills: { type: 'array', items: { type: 'string' } } } };
const sec = [{ ApiKey: [] }, { OAuth2: [] }];
const hdr = [{ name: 'Idempotency-Key', in: 'header', schema: { type: 'string' }, description: 'Repeat-safe writes: the same key returns the original response.' }, { name: 'X-Sandbox', in: 'header', schema: { type: 'string', enum: ['true'] }, description: 'Validate and transform only; nothing is stored.' }];
module.exports = {
  openapi: '3.0.3',
  info: { title: 'SkillSetu Partner API', version: '1.0.0', description: 'Push jobs from third-party portals into SkillSetu, read the public job feed and taxonomy. Authenticate with `X-API-Key` or an OAuth 2.0 client-credentials bearer token. Rate limits use a token bucket per portal; see `X-RateLimit-*` headers.' },
  servers: [{ url: '/api/v1' }],
  components: { securitySchemes: { ApiKey: { type: 'apiKey', in: 'header', name: 'X-API-Key' }, OAuth2: { type: 'oauth2', flows: { clientCredentials: { tokenUrl: '/api/v1/oauth/token', scopes: { 'jobs:write': 'Create and update jobs', 'jobs:read': 'Read your jobs' } } } } }, schemas: { Job: job } },
  paths: {
    '/oauth/token': { post: { summary: 'Get an access token (client_credentials)', requestBody: { content: { 'application/x-www-form-urlencoded': { schema: { type: 'object', properties: { grant_type: { type: 'string', example: 'client_credentials' }, client_id: { type: 'string', description: 'Your portal slug' }, client_secret: { type: 'string', description: 'Your API key' } } } } } }, responses: { 200: { description: 'Token' }, 401: { description: 'invalid_client' } } } },
    '/portal/status': { get: { summary: 'Integration health', security: sec, responses: { 200: { description: 'OK' } } } },
    '/portal/jobs': {
      get: { summary: 'List jobs synced by your portal', security: sec, responses: { 200: { description: 'OK' } } },
      post: { summary: 'Create or update a job (idempotent on external_id)', security: sec, parameters: hdr, requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } }, responses: { 201: { description: 'Created' }, 200: { description: 'Updated' }, 422: { description: 'Validation failed (payload parked in dead-letter queue)' }, 429: { description: 'Rate limited' } } },
    },
    '/portal/jobs/{externalId}': {
      put: { summary: 'Update a job', security: sec, parameters: [{ name: 'externalId', in: 'path', required: true, schema: { type: 'string' } }, ...hdr], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Job' } } } }, responses: { 200: { description: 'Updated' }, 404: { description: 'Unknown external_id' } } },
      delete: { summary: 'Close (archive) a job', security: sec, parameters: [{ name: 'externalId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Archived' } } },
    },
    '/portal/jobs/{externalId}/deadline': { patch: { summary: 'Extend the application deadline', security: sec, parameters: [{ name: 'externalId', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { deadline: { type: 'string', format: 'date' } } } } } }, responses: { 200: { description: 'OK' } } } },
    '/portal/jobs/bulk': { post: { summary: 'Bulk upsert (JSON array or CSV, max 500)', security: sec, parameters: hdr, requestBody: { content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Job' } } }, 'text/csv': { schema: { type: 'string' } } } }, responses: { 207: { description: 'Multi-status' } } } },
    '/jobs': { get: { summary: 'Public job feed (JSON, or XML with format=xml)', parameters: [{ name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'xml'] } }, { name: 'since', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } } },
    '/taxonomy/skills': { get: { summary: 'Standard skills with synonyms', responses: { 200: { description: 'OK' } } } },
  },
};
