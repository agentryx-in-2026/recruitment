import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { recruitmentAgents } from '../../shared/schema';
import { eq } from 'drizzle-orm';

let app: Express;
let agentCookie: string[];
let candidateCookie: string[];
let agentUserId: string;

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  await truncateAllTables();
  const db = getDb();

  // Register agent
  const agentReg = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'agent@test.com', password: 'Test@123', role: 'agent' });
  agentCookie = agentReg.headers['set-cookie'] as unknown as string[];
  agentUserId = agentReg.body.data.id;

  // Register agency + verify it
  await request(app)
    .post('/api/v1/agencies/register')
    .set('Cookie', agentCookie)
    .send({ agencyName: 'Test Agency', licenseNumber: 'LIC001', specializations: ['IT'] });

  await db.update(recruitmentAgents).set({ verified: true }).where(eq(recruitmentAgents.userId, agentUserId));

  // Register candidate with profile
  const candReg = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'cand@test.com', password: 'Test@123', role: 'candidate' });
  candidateCookie = candReg.headers['set-cookie'] as unknown as string[];

  await request(app)
    .patch('/api/v1/candidates/profile')
    .set('Cookie', candidateCookie)
    .send({ fullName: 'Test Candidate', email: 'cand@test.com', skills: ['React', 'Node.js'], experience: 3, preferredCountries: ['United Arab Emirates'] });
});

async function createJob(cookie: string[], overrides: any = {}) {
  return request(app)
    .post('/api/v1/jobs')
    .set('Cookie', cookie)
    .send({
      title: 'Software Developer',
      company: 'TechCorp',
      location: 'Dubai',
      country: 'United Arab Emirates',
      salary: '3000 USD',
      description: 'Full stack developer needed',
      skills: ['React', 'Node.js'],
      experience: 2,
      ...overrides,
    });
}

// ── Create Job ──────────────────────────────────────────────────────

describe('POST /api/v1/jobs', () => {
  it('creates job as verified agent → 201', async () => {
    const res = await createJob(agentCookie);
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Software Developer');
    expect(res.body.data.status).toBe('active');
  });

  it('rejects job creation by candidate → 403', async () => {
    const res = await createJob(candidateCookie);
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated → 401', async () => {
    const res = await request(app).post('/api/v1/jobs').send({ title: 'Test' });
    expect(res.status).toBe(401);
  });
});

// ── Search Jobs ─────────────────────────────────────────────────────

describe('GET /api/v1/jobs', () => {
  beforeEach(async () => {
    await createJob(agentCookie, { title: 'React Developer', country: 'United Arab Emirates', skills: ['React'] });
    await createJob(agentCookie, { title: 'Python Engineer', country: 'Canada', skills: ['Python'] });
    await createJob(agentCookie, { title: 'Node.js Backend', country: 'United Arab Emirates', skills: ['Node.js'] });
  });

  it('returns all active jobs', async () => {
    const res = await request(app).get('/api/v1/jobs');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(3);
  });

  it('filters by free text search (q)', async () => {
    const res = await request(app).get('/api/v1/jobs?q=React');
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].title).toContain('React');
  });

  it('filters by country', async () => {
    // v0.7.4.2: filter value matches canonical country_info name (jobs are now
    // created with 'United Arab Emirates' rather than the old 'UAE' alias).
    const res = await request(app).get('/api/v1/jobs?country=United+Arab+Emirates');
    expect(res.body.data.length).toBe(2);
  });

  it('supports pagination', async () => {
    const res = await request(app).get('/api/v1/jobs?page=1&limit=2');
    expect(res.body.data.length).toBe(2);
    expect(res.body.pagination.totalPages).toBe(2);

    const res2 = await request(app).get('/api/v1/jobs?page=2&limit=2');
    expect(res2.body.data.length).toBe(1);
  });

  it('returns X-Total-Count header', async () => {
    const res = await request(app).get('/api/v1/jobs');
    expect(res.headers['x-total-count']).toBe('3');
  });
});

// ── Get Single Job ──────────────────────────────────────────────────

describe('GET /api/v1/jobs/:id', () => {
  it('returns job by id', async () => {
    const created = await createJob(agentCookie);
    const res = await request(app).get(`/api/v1/jobs/${created.body.data.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Software Developer');
  });

  it('returns 404 for non-existent job', async () => {
    const res = await request(app).get('/api/v1/jobs/fake-id');
    expect(res.status).toBe(404);
  });
});

// ── Edit Job ────────────────────────────────────────────────────────

describe('PUT /api/v1/jobs/:id', () => {
  it('updates job as owner', async () => {
    const created = await createJob(agentCookie);
    const res = await request(app)
      .put(`/api/v1/jobs/${created.body.data.id}`)
      .set('Cookie', agentCookie)
      .send({ title: 'Senior React Developer', salary: '5000 USD' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Senior React Developer');
    expect(res.body.data.salary).toBe('5000 USD');
  });

  it('rejects edit by non-owner → 403', async () => {
    const created = await createJob(agentCookie);
    const res = await request(app)
      .put(`/api/v1/jobs/${created.body.data.id}`)
      .set('Cookie', candidateCookie)
      .send({ title: 'Hacked' });

    expect(res.status).toBe(403);
  });
});

// ── Deactivate Job ──────────────────────────────────────────────────

describe('PATCH /api/v1/jobs/:id/status', () => {
  it('deactivates a job', async () => {
    const created = await createJob(agentCookie);
    const res = await request(app)
      .patch(`/api/v1/jobs/${created.body.data.id}/status`)
      .set('Cookie', agentCookie)
      .send({ status: 'inactive' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('inactive');
  });

  it('deactivated job not in search results', async () => {
    const created = await createJob(agentCookie);
    await request(app)
      .patch(`/api/v1/jobs/${created.body.data.id}/status`)
      .set('Cookie', agentCookie)
      .send({ status: 'inactive' });

    const search = await request(app).get('/api/v1/jobs');
    expect(search.body.data.length).toBe(0);
  });

  it('rejects invalid status', async () => {
    const created = await createJob(agentCookie);
    const res = await request(app)
      .patch(`/api/v1/jobs/${created.body.data.id}/status`)
      .set('Cookie', agentCookie)
      .send({ status: 'deleted' });

    expect(res.status).toBe(400);
  });
});

// ── Applicants ──────────────────────────────────────────────────────

describe('GET /api/v1/jobs/:id/applicants', () => {
  it('returns applicants for a job', async () => {
    const created = await createJob(agentCookie);
    const jobId = created.body.data.id;

    // Apply as candidate
    await request(app)
      .post(`/api/v1/jobs/${jobId}/apply`)
      .set('Cookie', candidateCookie);

    const res = await request(app)
      .get(`/api/v1/jobs/${jobId}/applicants`)
      .set('Cookie', agentCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].candidate.fullName).toBe('Test Candidate');
    expect(res.body.data[0].matchScore).toBeGreaterThan(0);
  });

  it('rejects non-owner from viewing applicants → 403', async () => {
    const created = await createJob(agentCookie);
    const res = await request(app)
      .get(`/api/v1/jobs/${created.body.data.id}/applicants`)
      .set('Cookie', candidateCookie);

    expect(res.status).toBe(403);
  });
});

// ── Apply to Job ────────────────────────────────────────────────────

describe('POST /api/v1/jobs/:id/apply', () => {
  it('applies to job as candidate → 201', async () => {
    const created = await createJob(agentCookie);
    const res = await request(app)
      .post(`/api/v1/jobs/${created.body.data.id}/apply`)
      .set('Cookie', candidateCookie);

    expect(res.status).toBe(201);
    expect(res.body.data.matchScore).toBeGreaterThan(0);
  });

  it('calculates real match score (not random)', async () => {
    // Candidate has skills: ['React', 'Node.js'], exp: 3, preferred: ['United Arab Emirates']
    // Job has skills: ['React', 'Node.js'], exp: 2, country: 'United Arab Emirates'
    // Expected: 50 (skill) + 30 (exp) + 20 (country) = 100
    const created = await createJob(agentCookie);
    const res = await request(app)
      .post(`/api/v1/jobs/${created.body.data.id}/apply`)
      .set('Cookie', candidateCookie);

    expect(res.body.data.matchScore).toBe(100);
  });

  it('rejects duplicate application → 409', async () => {
    const created = await createJob(agentCookie);
    await request(app)
      .post(`/api/v1/jobs/${created.body.data.id}/apply`)
      .set('Cookie', candidateCookie);

    const res = await request(app)
      .post(`/api/v1/jobs/${created.body.data.id}/apply`)
      .set('Cookie', candidateCookie);

    expect(res.status).toBe(409);
  });

  it('rejects application by agent → 403', async () => {
    const created = await createJob(agentCookie);
    const res = await request(app)
      .post(`/api/v1/jobs/${created.body.data.id}/apply`)
      .set('Cookie', agentCookie);

    expect(res.status).toBe(403);
  });

  it('rejects application to non-existent job → 404', async () => {
    const res = await request(app)
      .post('/api/v1/jobs/fake-id/apply')
      .set('Cookie', candidateCookie);

    expect(res.status).toBe(404);
  });
});
