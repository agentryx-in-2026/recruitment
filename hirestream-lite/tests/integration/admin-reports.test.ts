import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { recruitmentAgents, users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

let app: Express;
let adminCookie: string[];
let agentCookie: string[];
let candidateCookie: string[];

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  await truncateAllTables();
  const db = getDb();

  // Admin
  const adminReg = await request(app).post('/api/v1/auth/register')
    .send({ email: 'admin@test.com', password: 'Test@123', role: 'candidate' });
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, adminReg.body.data.id));
  const adminLogin = await request(app).post('/api/v1/auth/login')
    .send({ username: 'admin@test.com', password: 'Test@123' });
  adminCookie = adminLogin.headers['set-cookie'] as unknown as string[];

  // Agent with verified agency
  const agentReg = await request(app).post('/api/v1/auth/register')
    .send({ email: 'agent@test.com', password: 'Test@123', role: 'agent' });
  agentCookie = agentReg.headers['set-cookie'] as unknown as string[];
  await request(app).post('/api/v1/agencies/register').set('Cookie', agentCookie)
    .send({ agencyName: 'Test Agency', licenseNumber: 'LIC001', specializations: ['IT'] });
  await db.update(recruitmentAgents).set({ verified: true }).where(eq(recruitmentAgents.userId, agentReg.body.data.id));

  // Candidate
  const candReg = await request(app).post('/api/v1/auth/register')
    .send({ email: 'cand@test.com', password: 'Test@123', role: 'candidate' });
  candidateCookie = candReg.headers['set-cookie'] as unknown as string[];
  await request(app).patch('/api/v1/candidates/profile').set('Cookie', candidateCookie)
    .send({ fullName: 'Test Cand', email: 'cand@test.com', location: 'Shimla', skills: ['React', 'Node.js'], experience: 3 });

  // Create job + apply
  const job = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie)
    .send({ title: 'Dev', company: 'TechCorp', location: 'Dubai', country: 'United Arab Emirates', skills: ['React'], experience: 2 });
  await request(app).post(`/api/v1/jobs/${job.body.data.id}/apply`).set('Cookie', candidateCookie);
});

// ── Dashboard Stats ─────────────────────────────────────────────────

describe('GET /api/v1/admin/reports/dashboard', () => {
  it('returns real aggregated metrics', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/dashboard')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.users.total).toBeGreaterThanOrEqual(3); // admin + agent + candidate
    expect(res.body.data.users.candidates).toBeGreaterThanOrEqual(1);
    expect(res.body.data.agencies.total).toBe(1);
    expect(res.body.data.agencies.verified).toBe(1);
    expect(res.body.data.jobs.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.jobs.active).toBeGreaterThanOrEqual(1);
    expect(res.body.data.applications.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.applications.statusBreakdown).toBeDefined();
  });

  it('rejects non-admin → 403', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/dashboard')
      .set('Cookie', candidateCookie);
    expect(res.status).toBe(403);
  });
});

// ── Reports ─────────────────────────────────────────────────────────

describe('GET /api/v1/admin/reports/by-district', () => {
  it('returns candidates grouped by location', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/by-district')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const shimla = res.body.data.find((r: any) => r.district === 'Shimla');
    expect(shimla).toBeDefined();
    expect(shimla.candidates).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/v1/admin/reports/by-agency', () => {
  it('returns agency performance data', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/by-agency')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0]).toHaveProperty('agency_name');
    expect(res.body.data[0]).toHaveProperty('total_jobs');
    expect(res.body.data[0]).toHaveProperty('total_applications');
  });
});

describe('GET /api/v1/admin/reports/by-skill', () => {
  it('returns skill demand and supply', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/by-skill')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.demand).toBeDefined();
    expect(res.body.data.supply).toBeDefined();
    expect(Array.isArray(res.body.data.demand)).toBe(true);
    expect(Array.isArray(res.body.data.supply)).toBe(true);
  });
});

describe('GET /api/v1/admin/reports/by-placement-status', () => {
  it('returns application funnel', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/by-placement-status')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.funnel).toBeDefined();
    expect(res.body.data.summary).toHaveProperty('registered');
    expect(res.body.data.summary).toHaveProperty('applied');
    expect(res.body.data.summary).toHaveProperty('placed');
  });
});

describe('GET /api/v1/admin/reports/by-country', () => {
  it('returns jobs and applications by country', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/by-country')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    const uae = res.body.data.find((r: any) => r.country === 'United Arab Emirates');
    expect(uae).toBeDefined();
    expect(uae.total_jobs).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/v1/admin/reports/by-sector', () => {
  it('returns jobs grouped by company/sector', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reports/by-sector')
      .set('Cookie', adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0]).toHaveProperty('sector');
    expect(res.body.data[0]).toHaveProperty('total_jobs');
  });
});

// ── Security: strong password enforced ──────────────────────────────

describe('Security: Strong Password', () => {
  it('rejects weak password (no uppercase) → 400', async () => {
    const res = await request(app).post('/api/v1/auth/register')
      .send({ email: 'weak@test.com', password: 'abcdef1!', role: 'candidate' });
    expect(res.status).toBe(400);
  });

  it('rejects weak password (no special char) → 400', async () => {
    const res = await request(app).post('/api/v1/auth/register')
      .send({ email: 'weak@test.com', password: 'Abcdefg1', role: 'candidate' });
    expect(res.status).toBe(400);
  });

  it('rejects weak password (too short) → 400', async () => {
    const res = await request(app).post('/api/v1/auth/register')
      .send({ email: 'weak@test.com', password: 'Ab1!', role: 'candidate' });
    expect(res.status).toBe(400);
  });

  it('accepts strong password → 201', async () => {
    const res = await request(app).post('/api/v1/auth/register')
      .send({ email: 'strong@test.com', password: 'Str0ng@Pass', role: 'candidate' });
    expect(res.status).toBe(201);
  });
});
