/**
 * The COMPACT pipeline — HPSEDC phase 1, and the PRODUCTION DEFAULT.
 *
 * The inherited suite pins pipeline.profile to 'full' in tests/helpers.ts,
 * because it walks the six-stage workflow as setup for interview-outcome,
 * placement and reporting tests. Without this file the shipped default would
 * therefore go completely untested — the same role capability-gating.test.ts
 * plays for the agency-mode default.
 *
 * What matters here is not that four stages exist — it is WHERE documents
 * become due. Compact interviews every applicant, so an interview is NOT a
 * narrowing point and must ask for nothing; selection is the narrow point and
 * must ask for everything, including the verification documents that the full
 * pipeline collects at a shortlist compact never runs.
 */
import { describe, beforeAll, beforeEach, afterAll, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { recruitmentAgents } from '../../shared/schema';
import { eq } from 'drizzle-orm';

let app: Express;
let agentCookie: string[];
let candidateCookie: string[];
let jobId: string;

beforeAll(async () => {
  app = createTestApp();
});

afterAll(async () => {
  // Leave the profile as the rest of the suite expects to find it.
  const { updateSetting } = await import('../../server/services/settings.service');
  await updateSetting('pipeline.profile', 'full');
});

beforeEach(async () => {
  await truncateAllTables();
  const db = getDb();
  // truncateAllTables wipes system_settings, so this must be re-applied per test.
  const { updateSetting } = await import('../../server/services/settings.service');
  await updateSetting('pipeline.profile', 'compact');

  const agentReg = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'agent-c@test.com', password: 'Test@123', role: 'agent' });
  agentCookie = agentReg.headers['set-cookie'] as unknown as string[];
  await request(app)
    .post('/api/v1/agencies/register')
    .set('Cookie', agentCookie)
    .send({ agencyName: 'HPSEDC', licenseNumber: 'LIC-C1', specializations: ['Construction'] });
  await db.update(recruitmentAgents).set({ verified: true }).where(eq(recruitmentAgents.userId, agentReg.body.data.id));

  const candReg = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'cand-c@test.com', password: 'Test@123', role: 'candidate' });
  candidateCookie = candReg.headers['set-cookie'] as unknown as string[];
  await request(app)
    .patch('/api/v1/candidates/profile')
    .set('Cookie', candidateCookie)
    .send({ fullName: 'Compact Cand', email: 'cand-c@test.com', skills: ['Welding'], experience: 3 });

  const jobRes = await request(app)
    .post('/api/v1/jobs')
    .set('Cookie', agentCookie)
    .send({ title: 'Welder', company: 'Gulf Co', location: 'Dubai', country: 'United Arab Emirates', skills: ['Welding'], experience: 2 });
  jobId = jobRes.body.data.id;
});

const applyForJob = async (): Promise<string> => {
  const r = await request(app).post(`/api/v1/jobs/${jobId}/apply`).set('Cookie', candidateCookie);
  return r.body.data.id;
};
const move = (id: string, status: string) =>
  request(app).patch(`/api/v1/applications/${id}/status`).set('Cookie', agentCookie).send({ status });
const obligationsFor = async (id: string) => {
  const r = await request(app).get('/api/v1/candidates/documents/obligations').set('Cookie', candidateCookie);
  return (r.body?.data?.obligations || []).find((o: any) => o.applicationId === id);
};

describe('Compact pipeline (HPSEDC phase 1)', () => {
  it('refuses the stages it does not run, and names the ones it does', async () => {
    const id = await applyForJob();
    for (const bad of ['reviewed', 'shortlisted']) {
      const r = await move(id, bad);
      expect(r.status).toBe(400);
      expect(String(r.body?.error?.message)).toMatch(/active pipeline/i);
    }
  });

  it('goes applied -> interview -> selected with no intermediate stage', async () => {
    const id = await applyForJob();
    expect((await move(id, 'interview_scheduled')).status).toBe(200);
    expect((await move(id, 'selected')).status).toBe(200);
  });

  it('still allows rejection — terminal states are profile-independent', async () => {
    const id = await applyForJob();
    expect((await move(id, 'rejected')).status).toBe(200);
  });

  it('asks for NOTHING at interview, because every applicant is interviewed', async () => {
    const id = await applyForJob();
    await move(id, 'interview_scheduled');
    expect(await obligationsFor(id)).toBeUndefined();
  });

  it('asks for verification AND deployment documents at selection', async () => {
    const id = await applyForJob();
    const iv = await move(id, 'interview_scheduled');
    expect(iv.status).toBe(200);
    const sel = await move(id, 'selected');
    expect(sel.status).toBe(200);
    const ob = await obligationsFor(id);
    expect(ob).toBeDefined();
    const keys = ob.required.map((d: any) => d.key);
    // The regression this guards: a non-cumulative deploy stage returns ONLY
    // the perishable pair, and the candidate is never asked for a passport.
    expect(keys).toEqual(expect.arrayContaining(['police_clearance', 'medical_certificate']));
    expect(keys).toEqual(expect.arrayContaining(['identity_proof', 'passport']));
  });
});
