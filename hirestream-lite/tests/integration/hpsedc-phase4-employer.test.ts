/**
 * Phase 4 (real) — Employer dashboard rework: requisition-centric stats
 * + agency scorecard (v0.4.35).
 *
 * Coverage:
 *  - GET /api/v1/employer/requisitions returns Phase 4 fields
 *    (agentsPickedUp, daysSincePosted, daysToFirstPlacement) alongside
 *    the existing stats
 *  - Multiple agents picking up the same requisition increment
 *    agentsPickedUp correctly
 *  - GET /api/v1/employer/agency-scorecard aggregates per-agency stats
 *    across all employer requisitions
 *  - ?requisitionId= scope filter works
 *  - Conversion + placement-rate math correct
 *  - Non-employer / non-admin gets 403 on scorecard
 *  - Employer cannot see another employer's scorecard data
 */
import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { sql } from 'drizzle-orm';
import { createTestApp, truncateAllTables, getDb } from '../helpers';

let app: Express;
let employerCookie: string[];
let employerUserId: string;
let agent1Cookie: string[];
let agent1UserId: string;
let agent2Cookie: string[];
let agent2UserId: string;
let candidateCookies: string[][] = [];
let candidateIds: string[] = [];

beforeAll(async () => {
  app = createTestApp();
});

async function makeAgent(email: string, license: string): Promise<{ cookie: string[]; userId: string }> {
  const reg = await request(app).post('/api/v1/auth/register').send({ email, password: 'Test@123', role: 'agent' });
  const cookie = reg.headers['set-cookie'] as unknown as string[];
  const userId = reg.body.data.id;
  await request(app).post('/api/v1/agencies/register').set('Cookie', cookie)
    .send({ agencyName: `Agency ${license}`, licenseNumber: license, specializations: ['IT'] });
  const db = getDb();
  await db.execute(sql`UPDATE recruitment_agents SET verified = true WHERE user_id = ${userId}`);
  return { cookie, userId };
}

async function makeCandidate(email: string): Promise<{ cookie: string[]; userId: string; candidateId: string }> {
  const reg = await request(app).post('/api/v1/auth/register').send({ email, password: 'Test@123', role: 'candidate' });
  const cookie = reg.headers['set-cookie'] as unknown as string[];
  const userId = reg.body.data.id;
  await request(app).patch('/api/v1/candidates/profile').set('Cookie', cookie)
    .send({ fullName: email.split('@')[0], email, skills: ['React'], experience: 3 });
  const db = getDb();
  const cRes: any = await db.execute(sql`SELECT id FROM candidates WHERE user_id = ${userId}`);
  const candidateId = (cRes.rows ?? cRes)[0].id;
  return { cookie, userId, candidateId };
}

beforeEach(async () => {
  await truncateAllTables();
  const db = getDb();

  // Employer (verified — so they can publish)
  const empReg = await request(app).post('/api/v1/auth/register').send({ email: 'emp.p4@test.com', password: 'Test@123', role: 'employer' });
  employerCookie = empReg.headers['set-cookie'] as unknown as string[];
  employerUserId = empReg.body.data.id;
  await db.execute(sql`UPDATE employers SET verified = true WHERE user_id = ${employerUserId}`);

  const a1 = await makeAgent('ag1.p4@test.com', 'LIC-P4-001');
  agent1Cookie = a1.cookie; agent1UserId = a1.userId;
  const a2 = await makeAgent('ag2.p4@test.com', 'LIC-P4-002');
  agent2Cookie = a2.cookie; agent2UserId = a2.userId;

  candidateCookies = [];
  candidateIds = [];
  for (const e of ['c1.p4@test.com', 'c2.p4@test.com', 'c3.p4@test.com', 'c4.p4@test.com']) {
    const c = await makeCandidate(e);
    candidateCookies.push(c.cookie);
    candidateIds.push(c.candidateId);
  }
});

async function postRequisition(): Promise<string> {
  const r = await request(app).post('/api/v1/jobs').set('Cookie', employerCookie).send({
    title: 'ICU Nurse', company: 'NHS', location: 'London', country: 'United Kingdom',
    skills: ['Nursing'], experience: 2, category: 'caregiver', targetHires: 2,
    description: 'NHS ICU role.',
  });
  expect(r.status).toBe(201);
  return r.body.data.id;
}

async function pickup(agentCookie: string[], requisitionId: string): Promise<string> {
  // Pickup is modelled as the agent creating a derivative job with
  // parentRequisitionId. Matches the seed-time mechanic in pipeline-phase2.
  const r = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie).send({
    title: 'ICU Nurse (Picked)', company: 'NHS', location: 'London', country: 'United Kingdom',
    skills: ['Nursing'], experience: 2, category: 'caregiver',
    description: 'Derivative job.',
    parentRequisitionId: requisitionId,
  });
  expect(r.status).toBe(201);
  return r.body.data.id;
}

async function apply(candidateCookie: string[], jobId: string): Promise<string> {
  const r = await request(app).post(`/api/v1/jobs/${jobId}/apply`).set('Cookie', candidateCookie);
  expect(r.status).toBe(201);
  return r.body.data.id;
}

describe('Phase 4 — GET /api/v1/employer/requisitions (new stats)', () => {
  it('returns Phase 4 fields: agentsPickedUp, daysSincePosted, daysToFirstPlacement', async () => {
    const reqId = await postRequisition();
    await pickup(agent1Cookie, reqId);
    await pickup(agent2Cookie, reqId);
    const r = await request(app).get('/api/v1/employer/requisitions').set('Cookie', employerCookie);
    expect(r.status).toBe(200);
    const row = (r.body.data as any[]).find((x) => x.id === reqId);
    expect(row.stats.agentsPickedUp).toBe(2);
    expect(row.stats.daysSincePosted).toBeGreaterThanOrEqual(0);
    expect(row.stats.daysToFirstPlacement).toBeNull();  // no placements yet
  });

  it('progressPct math is correct against targetHires', async () => {
    const reqId = await postRequisition();
    const derivId = await pickup(agent1Cookie, reqId);
    const appId = await apply(candidateCookies[0], derivId);
    // Mark this application "selected" (1 of 2 target hires)
    const db = getDb();
    await db.execute(sql`UPDATE applications SET status = 'selected' WHERE id = ${appId}`);
    const r = await request(app).get('/api/v1/employer/requisitions').set('Cookie', employerCookie);
    const row = (r.body.data as any[]).find((x) => x.id === reqId);
    expect(row.stats.selected).toBe(1);
    expect(row.stats.progressPct).toBe(50);  // 1 selected / 2 target = 50%
  });
});

describe('Phase 4 — GET /api/v1/employer/agency-scorecard', () => {
  it('aggregates submissions per agency across all employer requisitions', async () => {
    const reqId = await postRequisition();
    const deriv1 = await pickup(agent1Cookie, reqId);
    const deriv2 = await pickup(agent2Cookie, reqId);
    await apply(candidateCookies[0], deriv1);
    await apply(candidateCookies[1], deriv1);
    await apply(candidateCookies[2], deriv2);

    const r = await request(app).get('/api/v1/employer/agency-scorecard').set('Cookie', employerCookie);
    expect(r.status).toBe(200);
    const ag1 = (r.body.data as any[]).find((x) => x.agencyName.includes('LIC-P4-001'));
    const ag2 = (r.body.data as any[]).find((x) => x.agencyName.includes('LIC-P4-002'));
    expect(ag1.submitted).toBe(2);
    expect(ag2.submitted).toBe(1);
    // Both verified per setup
    expect(ag1.verified).toBe(true);
    expect(ag2.verified).toBe(true);
  });

  it('conversion% counts shortlisted+interview+selected+placed / submitted', async () => {
    const reqId = await postRequisition();
    const deriv = await pickup(agent1Cookie, reqId);
    const a1 = await apply(candidateCookies[0], deriv);
    const a2 = await apply(candidateCookies[1], deriv);
    const a3 = await apply(candidateCookies[2], deriv);
    const a4 = await apply(candidateCookies[3], deriv);
    const db = getDb();
    await db.execute(sql`UPDATE applications SET status = 'shortlisted' WHERE id = ${a1}`);
    await db.execute(sql`UPDATE applications SET status = 'interview_scheduled' WHERE id = ${a2}`);
    await db.execute(sql`UPDATE applications SET status = 'placed' WHERE id = ${a3}`);
    // a4 stays submitted

    const r = await request(app).get('/api/v1/employer/agency-scorecard').set('Cookie', employerCookie);
    const ag1 = (r.body.data as any[]).find((x) => x.agencyName.includes('LIC-P4-001'));
    expect(ag1.submitted).toBe(4);
    expect(ag1.shortlisted).toBe(1);
    expect(ag1.interview).toBe(1);
    expect(ag1.placed).toBe(1);
    // Conversion = (1+1+0+1)/4 = 75%
    expect(ag1.conversionPct).toBe(75);
    // Placement rate = 1/4 = 25%
    expect(ag1.placementRatePct).toBe(25);
  });

  it('?requisitionId= scope filter limits aggregation to one requisition', async () => {
    const reqA = await postRequisition();
    const reqB = await postRequisition();
    const derivA = await pickup(agent1Cookie, reqA);
    const derivB = await pickup(agent1Cookie, reqB);
    await apply(candidateCookies[0], derivA);
    await apply(candidateCookies[1], derivA);
    await apply(candidateCookies[2], derivB);

    const all = await request(app).get('/api/v1/employer/agency-scorecard').set('Cookie', employerCookie);
    const allAg1 = (all.body.data as any[]).find((x) => x.agencyName.includes('LIC-P4-001'));
    expect(allAg1.submitted).toBe(3);

    const scoped = await request(app).get(`/api/v1/employer/agency-scorecard?requisitionId=${reqA}`).set('Cookie', employerCookie);
    const scopedAg1 = (scoped.body.data as any[]).find((x) => x.agencyName.includes('LIC-P4-001'));
    expect(scopedAg1.submitted).toBe(2);
  });

  it('non-employer roles get 403', async () => {
    const r = await request(app).get('/api/v1/employer/agency-scorecard').set('Cookie', agent1Cookie);
    expect(r.status).toBe(403);
  });

  it("employer cannot see another employer's data", async () => {
    const reqId = await postRequisition();
    const deriv = await pickup(agent1Cookie, reqId);
    await apply(candidateCookies[0], deriv);

    // Register a second employer
    const emp2 = await request(app).post('/api/v1/auth/register').send({ email: 'emp2.p4@test.com', password: 'Test@123', role: 'employer' });
    const emp2Cookie = emp2.headers['set-cookie'] as unknown as string[];
    const db = getDb();
    await db.execute(sql`UPDATE employers SET verified = true WHERE user_id = ${emp2.body.data.id}`);

    const r = await request(app).get('/api/v1/employer/agency-scorecard').set('Cookie', emp2Cookie);
    expect(r.status).toBe(200);
    // emp2 has zero requisitions → empty scorecard
    expect((r.body.data as any[]).length).toBe(0);
  });
});
