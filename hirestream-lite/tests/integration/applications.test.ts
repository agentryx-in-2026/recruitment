import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { recruitmentAgents, applications, interviews, placements } from '../../shared/schema';
import { eq, sql } from 'drizzle-orm';

let app: Express;
let agentCookie: string[];
let candidateCookie: string[];
let jobId: string;

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  await truncateAllTables();
  const db = getDb();

  // Setup agent with verified agency
  const agentReg = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'agent@test.com', password: 'Test@123', role: 'agent' });
  agentCookie = agentReg.headers['set-cookie'] as unknown as string[];

  await request(app)
    .post('/api/v1/agencies/register')
    .set('Cookie', agentCookie)
    .send({ agencyName: 'Agency', licenseNumber: 'LIC001', specializations: ['IT'] });
  await db.update(recruitmentAgents).set({ verified: true }).where(eq(recruitmentAgents.userId, agentReg.body.data.id));

  // Setup candidate
  const candReg = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'cand@test.com', password: 'Test@123', role: 'candidate' });
  candidateCookie = candReg.headers['set-cookie'] as unknown as string[];

  await request(app)
    .patch('/api/v1/candidates/profile')
    .set('Cookie', candidateCookie)
    .send({ fullName: 'Test Cand', email: 'cand@test.com', skills: ['React', 'Node.js'], experience: 3, preferredCountries: ['United Arab Emirates'] });

  // Create a job
  const jobRes = await request(app)
    .post('/api/v1/jobs')
    .set('Cookie', agentCookie)
    .send({ title: 'Dev', company: 'Corp', location: 'Dubai', country: 'United Arab Emirates', skills: ['React', 'Node.js'], experience: 2 });
  jobId = jobRes.body.data.id;
});

// ── Bulk Status Update ──────────────────────────────────────────────

describe('PATCH /api/v1/applications/bulk-status', () => {
  it('updates multiple applications at once', async () => {
    // Create second candidate
    const cand2 = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'cand2@test.com', password: 'Test@123', role: 'candidate' });
    const cand2Cookie = cand2.headers['set-cookie'] as unknown as string[];
    await request(app)
      .patch('/api/v1/candidates/profile')
      .set('Cookie', cand2Cookie)
      .send({ fullName: 'Cand Two', email: 'cand2@test.com', skills: ['Python'] });

    // Both apply
    const app1 = await request(app).post(`/api/v1/jobs/${jobId}/apply`).set('Cookie', candidateCookie);
    const app2 = await request(app).post(`/api/v1/jobs/${jobId}/apply`).set('Cookie', cand2Cookie);

    // Bulk shortlist
    const res = await request(app)
      .patch('/api/v1/applications/bulk-status')
      .set('Cookie', agentCookie)
      .send({ ids: [app1.body.data.id, app2.body.data.id], status: 'shortlisted' });

    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2);
    expect(res.body.data.status).toBe('shortlisted');
  });

  it('rejects empty ids array → 400', async () => {
    const res = await request(app)
      .patch('/api/v1/applications/bulk-status')
      .set('Cookie', agentCookie)
      .send({ ids: [], status: 'reviewed' });

    expect(res.status).toBe(400);
  });

  it('rejects invalid status → 400', async () => {
    const res = await request(app)
      .patch('/api/v1/applications/bulk-status')
      .set('Cookie', agentCookie)
      .send({ ids: ['some-id'], status: 'invalid' });

    expect(res.status).toBe(400);
  });

  it('rejects candidate → 403', async () => {
    const res = await request(app)
      .patch('/api/v1/applications/bulk-status')
      .set('Cookie', candidateCookie)
      .send({ ids: ['some-id'], status: 'reviewed' });

    expect(res.status).toBe(403);
  });
});

// ── Application Detail with Score Breakdown ─────────────────────────

describe('GET /api/v1/applications/:id', () => {
  it('returns application with score breakdown', async () => {
    const applyRes = await request(app)
      .post(`/api/v1/jobs/${jobId}/apply`)
      .set('Cookie', candidateCookie);

    const appId = applyRes.body.data.id;

    const res = await request(app)
      .get(`/api/v1/applications/${appId}`)
      .set('Cookie', candidateCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(appId);
    // v0.4.33: engine v2 weights are skill=30, experience=20, country=15;
    // candidate fully matches all three so each factor scores at max.
    expect(res.body.data.scoreBreakdown).toBeDefined();
    expect(res.body.data.scoreBreakdown.engineVersion).toBe('v2');
    expect(res.body.data.scoreBreakdown.skill.score).toBe(30);
    expect(res.body.data.scoreBreakdown.experience.score).toBe(20);
    expect(res.body.data.scoreBreakdown.country.score).toBe(15);
    // Other factors are neutral (full marks under default policy) — total
    // is capped at 100 regardless.
    expect(res.body.data.matchScore).toBe(100);
    expect(res.body.data.scoreBreakdown.total).toBe(100);
    expect(res.body.data.job).toHaveProperty('title');
    expect(res.body.data.candidate).toHaveProperty('fullName');
  });

  it('returns 404 for non-existent application', async () => {
    const res = await request(app)
      .get('/api/v1/applications/fake-id')
      .set('Cookie', candidateCookie);

    expect(res.status).toBe(404);
  });
});

// ── Recommendations ─────────────────────────────────────────────────

describe('GET /api/v1/applications/recommendations/for-me', () => {
  it('returns recommended jobs sorted by match score', async () => {
    // Create multiple jobs
    await request(app).post('/api/v1/jobs').set('Cookie', agentCookie)
      .send({ title: 'React Dev', company: 'AlphaCo', location: 'Dubai', country: 'United Arab Emirates', skills: ['React'], experience: 2 });
    await request(app).post('/api/v1/jobs').set('Cookie', agentCookie)
      .send({ title: 'Python Dev', company: 'BetaCo', location: 'Ottawa', country: 'Canada', skills: ['Python'], experience: 5 });
    await request(app).post('/api/v1/jobs').set('Cookie', agentCookie)
      .send({ title: 'Full Stack', company: 'GammaCo', location: 'Abu Dhabi', country: 'United Arab Emirates', skills: ['React', 'Node.js'], experience: 3 });

    const res = await request(app)
      .get('/api/v1/applications/recommendations/for-me')
      .set('Cookie', candidateCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);

    // Should include the original job too (4 total, all not applied)
    // Check sorted by match score descending
    for (let i = 1; i < res.body.data.length; i++) {
      expect(res.body.data[i - 1].matchScore).toBeGreaterThanOrEqual(res.body.data[i].matchScore);
    }

    // Each should have scoreBreakdown
    expect(res.body.data[0].scoreBreakdown).toBeDefined();
  });

  it('excludes jobs already applied to', async () => {
    // Apply to the default job
    await request(app)
      .post(`/api/v1/jobs/${jobId}/apply`)
      .set('Cookie', candidateCookie);

    // Create another job
    await request(app).post('/api/v1/jobs').set('Cookie', agentCookie)
      .send({ title: 'New Job', company: 'DeltaCo', location: 'Dubai', country: 'United Arab Emirates', skills: ['React'], experience: 1 });

    const res = await request(app)
      .get('/api/v1/applications/recommendations/for-me')
      .set('Cookie', candidateCookie);

    // Applied job should not appear
    const ids = res.body.data.map((j: any) => j.id);
    expect(ids).not.toContain(jobId);
    expect(res.body.data.length).toBe(1);
  });

  it('returns recommendations for new candidate (auto-profile created)', async () => {
    // Register fresh candidate — auto-creates profile now
    const fresh = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'fresh@test.com', password: 'Test@123', role: 'candidate' });
    const freshCookie = fresh.headers['set-cookie'] as unknown as string[];

    const res = await request(app)
      .get('/api/v1/applications/recommendations/for-me')
      .set('Cookie', freshCookie);

    expect(res.status).toBe(200);
    // With auto-profile, candidate has basic profile so may get recommendations
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('rejects agent → 403', async () => {
    const res = await request(app)
      .get('/api/v1/applications/recommendations/for-me')
      .set('Cookie', agentCookie);

    expect(res.status).toBe(403);
  });
});

// ── Interview Outcome (v0.4.13.0) ───────────────────────────────────
// Replaces the v0.4.12-era "Mark Selected" one-tap with a deliberate
// pass/fail + notes capture that also writes the interviews row.
describe('POST /api/v1/applications/:id/interview-outcome', () => {
  async function setupScheduledInterview(): Promise<string> {
    const applyRes = await request(app).post(`/api/v1/jobs/${jobId}/apply`).set('Cookie', candidateCookie);
    const appId = applyRes.body.data.id;
    for (const status of ['reviewed', 'shortlisted', 'interview_scheduled']) {
      const r = await request(app)
        .patch(`/api/v1/applications/${appId}/status`)
        .set('Cookie', agentCookie)
        .send({ status });
      expect(r.status).toBe(200);
    }
    return appId;
  }

  it('pass → transitions application to selected and writes interviews row', async () => {
    const appId = await setupScheduledInterview();

    const res = await request(app)
      .post(`/api/v1/applications/${appId}/interview-outcome`)
      .set('Cookie', agentCookie)
      .send({ result: 'pass', notes: 'Strong communicator', rating: 4 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('selected');

    const db = getDb();
    const [appRow] = await db.select().from(applications).where(eq(applications.id, appId)).limit(1);
    expect((appRow as any).status).toBe('selected');

    const ivRows = await db.select().from(interviews).where(eq(interviews.applicationId, appId));
    expect(ivRows.length).toBe(1);
    expect((ivRows[0] as any).result).toBe('selected');
    expect((ivRows[0] as any).notes).toBe('Strong communicator');
    expect((ivRows[0] as any).rating).toBe(4);
  });

  it('fail → transitions to rejected and stores notes as rejectionFeedback', async () => {
    const appId = await setupScheduledInterview();

    const res = await request(app)
      .post(`/api/v1/applications/${appId}/interview-outcome`)
      .set('Cookie', agentCookie)
      .send({ result: 'fail', notes: 'Not a fit for the role' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
    expect(res.body.data.rejectionFeedback).toBe('Not a fit for the role');

    const db = getDb();
    const ivRows = await db.select().from(interviews).where(eq(interviews.applicationId, appId));
    expect(ivRows.length).toBe(1);
    expect((ivRows[0] as any).result).toBe('rejected');
  });

  it('rejects an outcome before the interview is scheduled (status guard)', async () => {
    const applyRes = await request(app).post(`/api/v1/jobs/${jobId}/apply`).set('Cookie', candidateCookie);
    const appId = applyRes.body.data.id;

    const res = await request(app)
      .post(`/api/v1/applications/${appId}/interview-outcome`)
      .set('Cookie', agentCookie)
      .send({ result: 'pass' });

    expect(res.status).toBe(400);
  });

  it('rejects invalid result values (400)', async () => {
    const appId = await setupScheduledInterview();
    const res = await request(app)
      .post(`/api/v1/applications/${appId}/interview-outcome`)
      .set('Cookie', agentCookie)
      .send({ result: 'maybe' });
    expect(res.status).toBe(400);
  });

  it('rejects out-of-range rating (400)', async () => {
    const appId = await setupScheduledInterview();
    const res = await request(app)
      .post(`/api/v1/applications/${appId}/interview-outcome`)
      .set('Cookie', agentCookie)
      .send({ result: 'pass', rating: 9 });
    expect(res.status).toBe(400);
  });

  it('rejects a candidate trying to self-record (403)', async () => {
    const appId = await setupScheduledInterview();
    const res = await request(app)
      .post(`/api/v1/applications/${appId}/interview-outcome`)
      .set('Cookie', candidateCookie)
      .send({ result: 'pass' });
    expect(res.status).toBe(403);
  });

  it('v0.4.14: pass auto-creates a placement row (employer can issue offer immediately)', async () => {
    const appId = await setupScheduledInterview();
    const db = getDb();
    // No placement before
    const before = await db.select().from(placements).where(eq(placements.applicationId, appId));
    expect(before.length).toBe(0);

    const res = await request(app)
      .post(`/api/v1/applications/${appId}/interview-outcome`)
      .set('Cookie', agentCookie)
      .send({ result: 'pass' });
    expect(res.status).toBe(200);

    const after = await db.select().from(placements).where(eq(placements.applicationId, appId));
    expect(after.length).toBe(1);
    // Defaults pulled from the parent job
    expect((after[0] as any).country).toBe('United Arab Emirates');
    expect((after[0] as any).status).toBe('offered');
  });
});

// ── Placement auto-create + edit (v0.4.14.0) ────────────────────────
describe('Placement auto-create on status → selected', () => {
  async function applyAndAdvanceTo(status: string): Promise<string> {
    const applyRes = await request(app).post(`/api/v1/jobs/${jobId}/apply`).set('Cookie', candidateCookie);
    const appId = applyRes.body.data.id;
    const path = ['reviewed', 'shortlisted', 'interview_scheduled', 'selected'];
    for (const s of path) {
      const r = await request(app)
        .patch(`/api/v1/applications/${appId}/status`)
        .set('Cookie', agentCookie)
        .send({ status: s });
      expect(r.status).toBe(200);
      if (s === status) break;
    }
    return appId;
  }

  it('PATCH /:id/status → selected auto-creates placement with job defaults', async () => {
    const appId = await applyAndAdvanceTo('selected');
    const db = getDb();
    const rows = await db.select().from(placements).where(eq(placements.applicationId, appId));
    expect(rows.length).toBe(1);
    expect((rows[0] as any).country).toBe('United Arab Emirates');
    expect((rows[0] as any).status).toBe('offered');
  });

  it('is idempotent — does not double-create if status set to selected twice', async () => {
    const appId = await applyAndAdvanceTo('selected');
    // Toggle: rejected → selected again (admins or fall-back can do this)
    await request(app).patch(`/api/v1/applications/${appId}/status`)
      .set('Cookie', agentCookie).send({ status: 'rejected', rejectionFeedback: 'oops' });
    await request(app).patch(`/api/v1/applications/${appId}/status`)
      .set('Cookie', agentCookie).send({ status: 'selected' });

    const db = getDb();
    const rows = await db.select().from(placements).where(eq(placements.applicationId, appId));
    expect(rows.length).toBe(1); // still exactly one
  });

  it('bulk-status → selected auto-creates a placement per row', async () => {
    // Create a second candidate + application
    const c2 = await request(app).post('/api/v1/auth/register')
      .send({ email: 'cand2-pl@test.com', password: 'Test@123', role: 'candidate' });
    const c2Cookie = c2.headers['set-cookie'] as unknown as string[];
    await request(app).patch('/api/v1/candidates/profile').set('Cookie', c2Cookie)
      .send({ fullName: 'Two', email: 'cand2-pl@test.com', skills: ['React'] });

    const a1 = await request(app).post(`/api/v1/jobs/${jobId}/apply`).set('Cookie', candidateCookie);
    const a2 = await request(app).post(`/api/v1/jobs/${jobId}/apply`).set('Cookie', c2Cookie);

    const res = await request(app).patch('/api/v1/applications/bulk-status')
      .set('Cookie', agentCookie)
      .send({ ids: [a1.body.data.id, a2.body.data.id], status: 'selected' });
    expect(res.status).toBe(200);

    const db = getDb();
    const p1 = await db.select().from(placements).where(eq(placements.applicationId, a1.body.data.id));
    const p2 = await db.select().from(placements).where(eq(placements.applicationId, a2.body.data.id));
    expect(p1.length).toBe(1);
    expect(p2.length).toBe(1);
  });
});

describe('PATCH /api/v1/agent/placements/:id (edit details)', () => {
  async function makeSelectedPlacement(): Promise<string> {
    const applyRes = await request(app).post(`/api/v1/jobs/${jobId}/apply`).set('Cookie', candidateCookie);
    const appId = applyRes.body.data.id;
    for (const s of ['reviewed', 'shortlisted', 'interview_scheduled', 'selected']) {
      await request(app).patch(`/api/v1/applications/${appId}/status`)
        .set('Cookie', agentCookie).send({ status: s });
    }
    const db = getDb();
    const [p] = await db.select().from(placements).where(eq(placements.applicationId, appId));
    return (p as any).id;
  }

  it('agent owner can edit country/salary/startDate', async () => {
    const placementId = await makeSelectedPlacement();
    const res = await request(app)
      .patch(`/api/v1/agent/placements/${placementId}`)
      .set('Cookie', agentCookie)
      .send({ country: 'Saudi Arabia', salary: 'SAR 12,000 / month', startDate: '2026-07-15' });
    expect(res.status).toBe(200);
    expect(res.body.data.country).toBe('Saudi Arabia');
    expect(res.body.data.salary).toBe('SAR 12,000 / month');
    expect(res.body.data.startDate).toBeTruthy();
  });

  it('rejects empty country (400)', async () => {
    const placementId = await makeSelectedPlacement();
    const res = await request(app)
      .patch(`/api/v1/agent/placements/${placementId}`)
      .set('Cookie', agentCookie)
      .send({ country: '   ' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid startDate (400)', async () => {
    const placementId = await makeSelectedPlacement();
    const res = await request(app)
      .patch(`/api/v1/agent/placements/${placementId}`)
      .set('Cookie', agentCookie)
      .send({ startDate: 'not-a-date' });
    expect(res.status).toBe(400);
  });

  it('rejects empty body (400)', async () => {
    const placementId = await makeSelectedPlacement();
    const res = await request(app)
      .patch(`/api/v1/agent/placements/${placementId}`)
      .set('Cookie', agentCookie)
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects a candidate trying to edit (403)', async () => {
    const placementId = await makeSelectedPlacement();
    const res = await request(app)
      .patch(`/api/v1/agent/placements/${placementId}`)
      .set('Cookie', candidateCookie)
      .send({ country: 'Hack' });
    expect(res.status).toBe(403);
  });
});

// ── Employer placements scope (v0.4.14.0) ───────────────────────────
// Confirms the employer also sees placements on derivative jobs (jobs
// picked up by an agent off the employer's requisition). Before the fix
// the employer Placements tab only listed direct-employer jobs and
// missed every requisition-derived placement.
describe('GET /api/v1/agent/placements — employer derivative scope', () => {
  it('employer sees placements created on a derivative job from their requisition', async () => {
    const db = getDb();

    // Register an employer + post a requisition
    const empReg = await request(app).post('/api/v1/auth/register')
      .send({ email: 'emp-pl@test.com', password: 'Test@123', role: 'employer' });
    const empCookie = empReg.headers['set-cookie'] as unknown as string[];
    // v0.4.32: must verify before publish — same gate as production.
    await db.execute(sql`UPDATE employers SET verified = true WHERE user_id = ${empReg.body.data.id}`);

    const reqRes = await request(app).post('/api/v1/jobs')
      .set('Cookie', empCookie)
      .send({ title: 'Reactor', company: 'EmpCo', location: 'Dubai', country: 'United Arab Emirates', skills: ['React'], experience: 1 });
    const requisitionId = reqRes.body.data.id;

    // Agent picks up the requisition → derivative job (employer_id NULL on the derivative)
    const derivRes = await request(app).post('/api/v1/jobs')
      .set('Cookie', agentCookie)
      .send({
        title: 'Reactor (Picked)', company: 'EmpCo', location: 'Dubai', country: 'United Arab Emirates',
        skills: ['React'], experience: 1, parentRequisitionId: requisitionId,
      });
    const derivJobId = derivRes.body.data.id;

    // Candidate applies to the derivative, agent walks them to selected
    const applyRes = await request(app).post(`/api/v1/jobs/${derivJobId}/apply`).set('Cookie', candidateCookie);
    const appId = applyRes.body.data.id;
    for (const s of ['reviewed', 'shortlisted', 'interview_scheduled', 'selected']) {
      await request(app).patch(`/api/v1/applications/${appId}/status`).set('Cookie', agentCookie).send({ status: s });
    }

    // Placement should exist (auto-create) and be visible to the employer
    const placementRows = await db.select().from(placements).where(eq(placements.applicationId, appId));
    expect(placementRows.length).toBe(1);

    const list = await request(app).get('/api/v1/agent/placements').set('Cookie', empCookie);
    expect(list.status).toBe(200);
    const ids = (list.body.data ?? []).map((r: any) => r.placement.id);
    expect(ids).toContain((placementRows[0] as any).id);
  });
});
