import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { recruitmentAgents, users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

let app: Express;
let agentCookie: string[];
let adminCookie: string[];
let candidateCookie: string[];
let agencyId: string;

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  await truncateAllTables();
  const db = getDb();

  // Agent with verified agency
  const agentReg = await request(app).post('/api/v1/auth/register')
    .send({ email: 'agent@test.com', password: 'Test@123', role: 'agent' });
  agentCookie = agentReg.headers['set-cookie'] as unknown as string[];

  await request(app).post('/api/v1/agencies/register').set('Cookie', agentCookie)
    .send({ agencyName: 'Test Agency', licenseNumber: 'LIC001', specializations: ['IT'] });

  const agencyRows = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, agentReg.body.data.id));
  await db.update(recruitmentAgents).set({ verified: true }).where(eq(recruitmentAgents.id, agencyRows[0].id));
  agencyId = agencyRows[0].id;

  // Admin — register as candidate, then update role to admin, then re-login
  const adminReg = await request(app).post('/api/v1/auth/register')
    .send({ email: 'admin@test.com', password: 'Test@123', role: 'candidate' });
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, adminReg.body.data.id));
  const adminLogin = await request(app).post('/api/v1/auth/login')
    .send({ username: 'admin@test.com', password: 'Test@123' });
  adminCookie = adminLogin.headers['set-cookie'] as unknown as string[];

  // Candidate with profile
  const candReg = await request(app).post('/api/v1/auth/register')
    .send({ email: 'cand@test.com', password: 'Test@123', role: 'candidate' });
  candidateCookie = candReg.headers['set-cookie'] as unknown as string[];
  await request(app).patch('/api/v1/candidates/profile').set('Cookie', candidateCookie)
    .send({ fullName: 'Test Cand', email: 'cand@test.com', skills: ['React'], experience: 3 });
});

async function createDrive(cookie: string[], overrides: any = {}) {
  return request(app).post('/api/v1/drives').set('Cookie', cookie).send({
    title: 'IT Recruitment Drive',
    description: 'Hiring developers',
    date: '2026-05-01T10:00:00Z',
    location: 'Delhi',
    targetRoles: ['Developer', 'Tester'],
    expectedCandidates: 50,
    ...overrides,
  });
}

// ── Drive CRUD ──────────────────────────────────────────────────────

describe('POST /api/v1/drives', () => {
  it('creates drive as verified agent → 201', async () => {
    const res = await createDrive(agentCookie);
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('IT Recruitment Drive');
    expect(res.body.data.status).toBe('pending');
  });

  it('rejects candidate → 403', async () => {
    const res = await createDrive(candidateCookie);
    expect(res.status).toBe(403);
  });

  it('rejects missing required fields → 400', async () => {
    const res = await request(app).post('/api/v1/drives').set('Cookie', agentCookie).send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/drives', () => {
  it('returns only approved drives by default', async () => {
    const drive = await createDrive(agentCookie);
    // Still pending — should not appear
    const res = await request(app).get('/api/v1/drives');
    expect(res.body.data.length).toBe(0);

    // Approve it
    await request(app).patch(`/api/v1/drives/${drive.body.data.id}/approve`).set('Cookie', adminCookie);

    const res2 = await request(app).get('/api/v1/drives');
    expect(res2.body.data.length).toBe(1);
  });

  it('filters by status', async () => {
    await createDrive(agentCookie);
    const res = await request(app).get('/api/v1/drives?status=pending');
    expect(res.body.data.length).toBe(1);
  });
});

describe('GET /api/v1/drives/my', () => {
  it('returns agent own drives', async () => {
    await createDrive(agentCookie);
    await createDrive(agentCookie, { title: 'Second Drive' });

    const res = await request(app).get('/api/v1/drives/my').set('Cookie', agentCookie);
    expect(res.body.data.length).toBe(2);
  });
});

describe('PATCH /api/v1/drives/:id', () => {
  it('edits pending drive', async () => {
    const drive = await createDrive(agentCookie);
    const res = await request(app).patch(`/api/v1/drives/${drive.body.data.id}`)
      .set('Cookie', agentCookie).send({ title: 'Updated Drive' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated Drive');
  });

  it('rejects editing approved drive → 400', async () => {
    const drive = await createDrive(agentCookie);
    await request(app).patch(`/api/v1/drives/${drive.body.data.id}/approve`).set('Cookie', adminCookie);

    const res = await request(app).patch(`/api/v1/drives/${drive.body.data.id}`)
      .set('Cookie', agentCookie).send({ title: 'Nope' });
    expect(res.status).toBe(400);
  });
});

// ── Admin Approval ──────────────────────────────────────────────────

describe('PATCH /api/v1/drives/:id/approve', () => {
  it('admin approves drive', async () => {
    const drive = await createDrive(agentCookie);
    const res = await request(app).patch(`/api/v1/drives/${drive.body.data.id}/approve`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
  });

  it('rejects non-admin → 403', async () => {
    const drive = await createDrive(agentCookie);
    const res = await request(app).patch(`/api/v1/drives/${drive.body.data.id}/approve`)
      .set('Cookie', agentCookie);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/drives/:id/reject', () => {
  it('admin rejects drive with reason', async () => {
    const drive = await createDrive(agentCookie);
    const res = await request(app).patch(`/api/v1/drives/${drive.body.data.id}/reject`)
      .set('Cookie', adminCookie).send({ reason: 'Incomplete information' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
    expect(res.body.data.rejectionReason).toBe('Incomplete information');
  });
});

// ── Interviews ──────────────────────────────────────────────────────

describe('POST /api/v1/drives/:driveId/interviews', () => {
  it('schedules interview and notifies candidate', async () => {
    // Create drive + approve + create job + apply
    const drive = await createDrive(agentCookie);
    await request(app).patch(`/api/v1/drives/${drive.body.data.id}/approve`).set('Cookie', adminCookie);

    const job = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie)
      .send({ title: 'Dev', company: 'Corp', location: 'Dubai', country: 'United Arab Emirates', skills: ['React'], experience: 2 });

    const app1 = await request(app).post(`/api/v1/jobs/${job.body.data.id}/apply`).set('Cookie', candidateCookie);

    const res = await request(app).post(`/api/v1/drives/${drive.body.data.id}/interviews`)
      .set('Cookie', agentCookie)
      .send({ applicationId: app1.body.data.id, scheduledAt: '2026-05-01T14:00:00Z', location: 'Delhi Office' });

    expect(res.status).toBe(201);
    expect(res.body.data.scheduledAt).toBeDefined();
    expect(res.body.data.location).toBe('Delhi Office');
  });
});

describe('PATCH /api/v1/drives/interviews/:id/result', () => {
  it('records selected result and updates application status', async () => {
    const drive = await createDrive(agentCookie);
    await request(app).patch(`/api/v1/drives/${drive.body.data.id}/approve`).set('Cookie', adminCookie);

    const job = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie)
      .send({ title: 'Dev', company: 'Corp', location: 'Dubai', country: 'United Arab Emirates', skills: ['React'], experience: 2 });

    const appRes = await request(app).post(`/api/v1/jobs/${job.body.data.id}/apply`).set('Cookie', candidateCookie);

    const interview = await request(app).post(`/api/v1/drives/${drive.body.data.id}/interviews`)
      .set('Cookie', agentCookie)
      .send({ applicationId: appRes.body.data.id, scheduledAt: '2026-05-01T14:00:00Z' });

    const res = await request(app).patch(`/api/v1/drives/interviews/${interview.body.data.id}/result`)
      .set('Cookie', agentCookie)
      .send({ result: 'selected', notes: 'Excellent candidate' });

    expect(res.status).toBe(200);
    expect(res.body.data.result).toBe('selected');

    // Verify application status changed to selected
    const appDetail = await request(app).get(`/api/v1/applications/${appRes.body.data.id}`).set('Cookie', candidateCookie);
    expect(appDetail.body.data.status).toBe('selected');
  });

  it('rejects invalid result → 400', async () => {
    const res = await request(app).patch('/api/v1/drives/interviews/fake-id/result')
      .set('Cookie', agentCookie).send({ result: 'maybe' });
    expect(res.status).toBe(400);
  });
});

// ── Placements ──────────────────────────────────────────────────────

describe('POST /api/v1/drives/placements', () => {
  it('creates placement for selected application', async () => {
    // Full pipeline: drive → approve → job → apply → interview → select
    const drive = await createDrive(agentCookie);
    await request(app).patch(`/api/v1/drives/${drive.body.data.id}/approve`).set('Cookie', adminCookie);

    const job = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie)
      .send({ title: 'Dev', company: 'Corp', location: 'Dubai', country: 'United Arab Emirates', skills: ['React'], experience: 2 });

    const appRes = await request(app).post(`/api/v1/jobs/${job.body.data.id}/apply`).set('Cookie', candidateCookie);

    const interview = await request(app).post(`/api/v1/drives/${drive.body.data.id}/interviews`)
      .set('Cookie', agentCookie).send({ applicationId: appRes.body.data.id, scheduledAt: '2026-05-01T14:00:00Z' });

    await request(app).patch(`/api/v1/drives/interviews/${interview.body.data.id}/result`)
      .set('Cookie', agentCookie).send({ result: 'selected' });

    // Now create placement
    const res = await request(app).post('/api/v1/drives/placements')
      .set('Cookie', agentCookie)
      .send({ applicationId: appRes.body.data.id, country: 'United Arab Emirates', salary: '3000 USD', startDate: '2026-06-01' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('offered');
    expect(res.body.data.country).toBe('United Arab Emirates');
  });

  it('rejects placement for non-selected application → 400', async () => {
    const job = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie)
      .send({ title: 'Dev', company: 'Corp', location: 'Dubai', country: 'United Arab Emirates', skills: ['React'], experience: 2 });
    const appRes = await request(app).post(`/api/v1/jobs/${job.body.data.id}/apply`).set('Cookie', candidateCookie);

    const res = await request(app).post('/api/v1/drives/placements')
      .set('Cookie', agentCookie)
      .send({ applicationId: appRes.body.data.id, country: 'United Arab Emirates' });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/v1/drives/placements/:id/accept', () => {
  it('candidate accepts placement → status becomes accepted', async () => {
    // Full pipeline to create placement
    const drive = await createDrive(agentCookie);
    await request(app).patch(`/api/v1/drives/${drive.body.data.id}/approve`).set('Cookie', adminCookie);
    const job = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie)
      .send({ title: 'Dev', company: 'Corp', location: 'Dubai', country: 'United Arab Emirates', skills: ['React'], experience: 2 });
    const appRes = await request(app).post(`/api/v1/jobs/${job.body.data.id}/apply`).set('Cookie', candidateCookie);
    const interview = await request(app).post(`/api/v1/drives/${drive.body.data.id}/interviews`)
      .set('Cookie', agentCookie).send({ applicationId: appRes.body.data.id, scheduledAt: '2026-05-01T14:00:00Z' });
    await request(app).patch(`/api/v1/drives/interviews/${interview.body.data.id}/result`)
      .set('Cookie', agentCookie).send({ result: 'selected' });
    const placement = await request(app).post('/api/v1/drives/placements').set('Cookie', agentCookie)
      .send({ applicationId: appRes.body.data.id, country: 'United Arab Emirates' });

    // Accept
    const res = await request(app).patch(`/api/v1/drives/placements/${placement.body.data.id}/accept`)
      .set('Cookie', candidateCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('accepted');
    expect(res.body.data.candidateResponse).toBe('accepted');
  });
});

describe('PATCH /api/v1/drives/placements/:id/decline', () => {
  it('candidate declines placement with reason', async () => {
    const drive = await createDrive(agentCookie);
    await request(app).patch(`/api/v1/drives/${drive.body.data.id}/approve`).set('Cookie', adminCookie);
    const job = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie)
      .send({ title: 'Dev', company: 'Corp', location: 'Dubai', country: 'United Arab Emirates', skills: ['React'], experience: 2 });
    const appRes = await request(app).post(`/api/v1/jobs/${job.body.data.id}/apply`).set('Cookie', candidateCookie);
    const interview = await request(app).post(`/api/v1/drives/${drive.body.data.id}/interviews`)
      .set('Cookie', agentCookie).send({ applicationId: appRes.body.data.id, scheduledAt: '2026-05-01T14:00:00Z' });
    await request(app).patch(`/api/v1/drives/interviews/${interview.body.data.id}/result`)
      .set('Cookie', agentCookie).send({ result: 'selected' });
    const placement = await request(app).post('/api/v1/drives/placements').set('Cookie', agentCookie)
      .send({ applicationId: appRes.body.data.id, country: 'United Arab Emirates' });

    const res = await request(app).patch(`/api/v1/drives/placements/${placement.body.data.id}/decline`)
      .set('Cookie', candidateCookie)
      .send({ reason: 'Personal reasons' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('declined');
    expect(res.body.data.declineReason).toBe('Personal reasons');
  });
});

// ── v0.4.17 IDOR guards ─────────────────────────────────────────────
// Before v0.4.17 these four endpoints had `protect` only and would let
// any authenticated user (including unrelated agents and candidates)
// schedule/record interviews and create/read placements on jobs they
// don't own. Each test below uses a SECOND agent (different user, no
// ownership of the test job) and expects 403.
describe('v0.4.17 IDOR guards on drive.routes', () => {
  // Reusable: create a separate verified agent whose job we'll attack.
  async function setupOtherAgent() {
    const db = getDb();
    const reg = await request(app).post('/api/v1/auth/register')
      .send({ email: 'other-agent@test.com', password: 'Test@123', role: 'agent' });
    const cookie = reg.headers['set-cookie'] as unknown as string[];
    await request(app).post('/api/v1/agencies/register').set('Cookie', cookie)
      .send({ agencyName: 'Other Agency', licenseNumber: 'LIC999', specializations: ['IT'] });
    await db.update(recruitmentAgents).set({ verified: true })
      .where(eq(recruitmentAgents.userId, reg.body.data.id));
    return cookie;
  }

  // The "victim" job + application owned by agentCookie.
  async function makeVictimApp() {
    const drive = await createDrive(agentCookie);
    await request(app).patch(`/api/v1/drives/${drive.body.data.id}/approve`).set('Cookie', adminCookie);
    const job = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie)
      .send({ title: 'Dev', company: 'Corp', location: 'Dubai', country: 'United Arab Emirates', skills: ['React'], experience: 2 });
    const appRes = await request(app).post(`/api/v1/jobs/${job.body.data.id}/apply`).set('Cookie', candidateCookie);
    return { driveId: drive.body.data.id, appId: appRes.body.data.id };
  }

  it('POST /:driveId/interviews — foreign agent gets 403', async () => {
    const otherAgent = await setupOtherAgent();
    const { driveId, appId } = await makeVictimApp();
    const res = await request(app).post(`/api/v1/drives/${driveId}/interviews`)
      .set('Cookie', otherAgent)
      .send({ applicationId: appId, scheduledAt: '2026-05-01T14:00:00Z' });
    expect(res.status).toBe(403);
  });

  it('POST /:driveId/interviews — candidate (non-agent) gets 403', async () => {
    const { driveId, appId } = await makeVictimApp();
    const res = await request(app).post(`/api/v1/drives/${driveId}/interviews`)
      .set('Cookie', candidateCookie)
      .send({ applicationId: appId, scheduledAt: '2026-05-01T14:00:00Z' });
    expect(res.status).toBe(403);
  });

  it('PATCH /interviews/:id/result — foreign agent gets 403', async () => {
    const otherAgent = await setupOtherAgent();
    const { driveId, appId } = await makeVictimApp();
    const iv = await request(app).post(`/api/v1/drives/${driveId}/interviews`)
      .set('Cookie', agentCookie)
      .send({ applicationId: appId, scheduledAt: '2026-05-01T14:00:00Z' });
    const res = await request(app).patch(`/api/v1/drives/interviews/${iv.body.data.id}/result`)
      .set('Cookie', otherAgent)
      .send({ result: 'rejected' });
    expect(res.status).toBe(403);
  });

  it('POST /placements — foreign agent gets 403', async () => {
    const otherAgent = await setupOtherAgent();
    const { driveId, appId } = await makeVictimApp();
    // Walk app to selected first (owner does this)
    const iv = await request(app).post(`/api/v1/drives/${driveId}/interviews`)
      .set('Cookie', agentCookie)
      .send({ applicationId: appId, scheduledAt: '2026-05-01T14:00:00Z' });
    await request(app).patch(`/api/v1/drives/interviews/${iv.body.data.id}/result`)
      .set('Cookie', agentCookie).send({ result: 'selected' });

    const res = await request(app).post('/api/v1/drives/placements')
      .set('Cookie', otherAgent)
      .send({ applicationId: appId, country: 'United Arab Emirates' });
    expect(res.status).toBe(403);
  });

  it('GET /placements/:id — unrelated candidate gets 403', async () => {
    const { driveId, appId } = await makeVictimApp();
    const iv = await request(app).post(`/api/v1/drives/${driveId}/interviews`)
      .set('Cookie', agentCookie)
      .send({ applicationId: appId, scheduledAt: '2026-05-01T14:00:00Z' });
    await request(app).patch(`/api/v1/drives/interviews/${iv.body.data.id}/result`)
      .set('Cookie', agentCookie).send({ result: 'selected' });
    const placement = await request(app).post('/api/v1/drives/placements')
      .set('Cookie', agentCookie).send({ applicationId: appId, country: 'United Arab Emirates' });

    // Register a totally unrelated candidate and try to read the placement
    const stranger = await request(app).post('/api/v1/auth/register')
      .send({ email: 'stranger@test.com', password: 'Test@123', role: 'candidate' });
    const strangerCookie = stranger.headers['set-cookie'] as unknown as string[];

    const res = await request(app).get(`/api/v1/drives/placements/${placement.body.data.id}`)
      .set('Cookie', strangerCookie);
    expect(res.status).toBe(403);
  });

  it('GET /placements/:id — owning candidate gets 200', async () => {
    const { driveId, appId } = await makeVictimApp();
    const iv = await request(app).post(`/api/v1/drives/${driveId}/interviews`)
      .set('Cookie', agentCookie)
      .send({ applicationId: appId, scheduledAt: '2026-05-01T14:00:00Z' });
    await request(app).patch(`/api/v1/drives/interviews/${iv.body.data.id}/result`)
      .set('Cookie', agentCookie).send({ result: 'selected' });
    const placement = await request(app).post('/api/v1/drives/placements')
      .set('Cookie', agentCookie).send({ applicationId: appId, country: 'United Arab Emirates' });

    const res = await request(app).get(`/api/v1/drives/placements/${placement.body.data.id}`)
      .set('Cookie', candidateCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.country).toBe('United Arab Emirates');
  });
});
