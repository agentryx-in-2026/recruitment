/**
 * Phase 2 — Visibility enforcement + agent pickup flow
 *
 * Covers PWS §3 (visibility matrix) and §7 (flexible pairing mode).
 * Exercises the full journey:
 *   1. Employer posts requisition (auto-tagged visibility=agents_only)
 *   2. Candidate's /api/v1/jobs does NOT include it
 *   3. Agent's /api/v1/agent/requisitions DOES include it
 *   4. Agent picks up → derivative job appears to candidates
 *   5. Pairing-mode switch changes visibility
 */

import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { sql } from 'drizzle-orm';
import { createTestApp, truncateAllTables, getDb } from '../helpers';

let app: Express;
let adminCookie: string[];
let agentCookie: string[];
let agentUserId: string;
let agentTwoCookie: string[];
let agentTwoUserId: string;
let employerCookie: string[];
let employerUserId: string;
let candidateCookie: string[];
let requisitionId: string;

beforeAll(async () => {
  app = createTestApp();
});

async function makeAdmin(email: string, password: string): Promise<string[]> {
  await request(app).post('/api/v1/auth/register').send({ email, password, role: 'candidate' });
  const db = getDb();
  await db.execute(sql`UPDATE users SET role = 'admin' WHERE email = ${email}`);
  const login = await request(app).post('/api/v1/auth/login').send({ username: email, password });
  return login.headers['set-cookie'] as unknown as string[];
}

async function makeAgent(email: string, password: string, licenseNumber: string): Promise<{ cookie: string[]; userId: string }> {
  const reg = await request(app).post('/api/v1/auth/register').send({ email, password, role: 'agent' });
  const cookie = reg.headers['set-cookie'] as unknown as string[];
  const userId = reg.body.data.id;
  await request(app).post('/api/v1/agencies/register').set('Cookie', cookie)
    .send({ agencyName: `Agency ${licenseNumber}`, licenseNumber });
  const db = getDb();
  await db.execute(sql`UPDATE recruitment_agents SET verified = true WHERE license_number = ${licenseNumber}`);
  return { cookie, userId };
}

async function makeEmployer(email: string, password: string): Promise<{ cookie: string[]; userId: string }> {
  const reg = await request(app).post('/api/v1/auth/register').send({ email, password, role: 'employer' });
  const cookie = reg.headers['set-cookie'] as unknown as string[];
  const userId = reg.body.data.id;
  // v0.4.32: employer must be verified to publish requisitions. The
  // employers row is auto-created at registration with verified=false;
  // flip it here so the visibility-flow tests can post without the gate.
  const db = getDb();
  await db.execute(sql`UPDATE employers SET verified = true WHERE user_id = ${userId}`);
  return { cookie, userId };
}

async function makeCandidate(email: string, password: string): Promise<string[]> {
  const reg = await request(app).post('/api/v1/auth/register').send({ email, password, role: 'candidate' });
  return reg.headers['set-cookie'] as unknown as string[];
}

beforeEach(async () => {
  await truncateAllTables();

  adminCookie = await makeAdmin('admin-p2@test.com', 'Test@123');
  const a1 = await makeAgent('agent-p2@test.com', 'Test@123', 'LIC-P2-001');
  agentCookie = a1.cookie; agentUserId = a1.userId;
  const a2 = await makeAgent('agent-p2-b@test.com', 'Test@123', 'LIC-P2-002');
  agentTwoCookie = a2.cookie; agentTwoUserId = a2.userId;
  const emp = await makeEmployer('employer-p2@test.com', 'Test@123');
  employerCookie = emp.cookie; employerUserId = emp.userId;
  candidateCookie = await makeCandidate('candidate-p2@test.com', 'Test@123');

  // Reset pairing mode to default (open) for each test
  await request(app).put('/api/v1/admin/settings/requisition.pairing_mode')
    .set('Cookie', adminCookie).send({ value: 'open' });

  // Employer posts a requisition
  const reqRes = await request(app).post('/api/v1/jobs').set('Cookie', employerCookie).send({
    title: 'ICU Nurse',
    company: 'Royal London Hospital',
    location: 'London',
    country: 'United Kingdom',
    description: 'NHS ICU position with visa sponsorship and accommodation.',
    experience: 2,
    targetHires: 3,
    skills: ['Nursing', 'ICU Care'],
    requirements: [],
  });
  requisitionId = reqRes.body.data.id;
});

describe('Phase 2 — Auto-visibility on create (PWS §3)', () => {
  it('employer-posted job is stored as visibility=agents_only', async () => {
    const db = getDb();
    const result: any = await db.execute(sql`SELECT visibility FROM jobs WHERE id = ${requisitionId}`);
    const rows = result.rows ?? result;
    expect(rows[0].visibility).toBe('agents_only');
  });

  it('agent-posted job is stored as visibility=public', async () => {
    const res = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie).send({
      title: 'Dubai Welder', company: 'GulfOps Ltd', location: 'Dubai', country: 'United Arab Emirates',
      description: 'Gulf welding role', experience: 3, requirements: [], skills: ['Welding'],
    });
    expect(res.status).toBeLessThan(300);
    expect(res.body.data.visibility).toBe('public');
  });
});

describe('Phase 2 — Candidate cannot see employer requisitions (PWS §3)', () => {
  it('candidate GET /api/v1/jobs excludes visibility=agents_only', async () => {
    const res = await request(app).get('/api/v1/jobs').set('Cookie', candidateCookie);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((j: any) => j.id);
    expect(ids).not.toContain(requisitionId);
  });

  it('anonymous GET /api/v1/jobs excludes visibility=agents_only', async () => {
    const res = await request(app).get('/api/v1/jobs');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((j: any) => j.id);
    expect(ids).not.toContain(requisitionId);
  });
});

describe('Phase 2 — Agents see requisitions via /api/v1/agent/requisitions (PWS §3)', () => {
  it('agent endpoint returns open requisitions in open mode', async () => {
    const res = await request(app).get('/api/v1/agent/requisitions').set('Cookie', agentCookie);
    expect(res.status).toBe(200);
    expect(res.body.data.some((r: any) => r.id === requisitionId)).toBe(true);
    expect(res.body.pairingMode).toBe('open');
  });

  it('candidate hitting agent endpoint gets 403', async () => {
    const res = await request(app).get('/api/v1/agent/requisitions').set('Cookie', candidateCookie);
    expect(res.status).toBe(403);
  });
});

describe('Phase 2 — Pickup creates derivative job (PWS §2, §3)', () => {
  it('pickup creates a new job with parentRequisitionId set and visibility=public', async () => {
    const res = await request(app).post(`/api/v1/agent/requisitions/${requisitionId}/pickup`).set('Cookie', agentCookie);
    expect(res.status).toBe(201);
    expect(res.body.data.parentRequisitionId).toBe(requisitionId);
    expect(res.body.data.visibility).toBe('public');
    expect(res.body.data.agentId).toBe(agentUserId);
    expect(res.body.data.title).toBe('ICU Nurse');
  });

  it('candidate sees the derivative but not the original requisition', async () => {
    await request(app).post(`/api/v1/agent/requisitions/${requisitionId}/pickup`).set('Cookie', agentCookie);
    const res = await request(app).get('/api/v1/jobs').set('Cookie', candidateCookie);
    const ids = res.body.data.map((j: any) => j.id);
    expect(ids).not.toContain(requisitionId);
    const derivative = res.body.data.find((j: any) => j.parentRequisitionId === requisitionId);
    expect(derivative).toBeDefined();
    expect(derivative.visibility).toBe('public');
  });

  it('same agent cannot pick up the same requisition twice', async () => {
    await request(app).post(`/api/v1/agent/requisitions/${requisitionId}/pickup`).set('Cookie', agentCookie);
    const second = await request(app).post(`/api/v1/agent/requisitions/${requisitionId}/pickup`).set('Cookie', agentCookie);
    expect(second.status).toBe(409);
  });

  it('multiple agents can each pick up the same requisition (open mode)', async () => {
    const pick1 = await request(app).post(`/api/v1/agent/requisitions/${requisitionId}/pickup`).set('Cookie', agentCookie);
    const pick2 = await request(app).post(`/api/v1/agent/requisitions/${requisitionId}/pickup`).set('Cookie', agentTwoCookie);
    expect(pick1.status).toBe(201);
    expect(pick2.status).toBe(201);
    expect(pick1.body.data.id).not.toBe(pick2.body.data.id);
    // Both derivatives must point to the same parent
    expect(pick1.body.data.parentRequisitionId).toBe(requisitionId);
    expect(pick2.body.data.parentRequisitionId).toBe(requisitionId);
  });
});

describe('Phase 2 — Pinned-only pairing mode (PWS §7)', () => {
  it('in pinned_only mode without a pin, no agent sees the requisition', async () => {
    await request(app).put('/api/v1/admin/settings/requisition.pairing_mode')
      .set('Cookie', adminCookie).send({ value: 'pinned_only' });

    const res = await request(app).get('/api/v1/agent/requisitions').set('Cookie', agentCookie);
    expect(res.body.data.some((r: any) => r.id === requisitionId)).toBe(false);
  });

  it('in pinned_only mode WITH a pin, only pinned agent can pick up', async () => {
    await request(app).put('/api/v1/admin/settings/requisition.pairing_mode')
      .set('Cookie', adminCookie).send({ value: 'pinned_only' });
    // Pin the requisition to agent one directly via DB (employer UI for this comes in Phase 5)
    const db = getDb();
    await db.execute(sql`UPDATE jobs SET pinned_agent_id = ${agentUserId} WHERE id = ${requisitionId}`);

    const listOne = await request(app).get('/api/v1/agent/requisitions').set('Cookie', agentCookie);
    expect(listOne.body.data.some((r: any) => r.id === requisitionId)).toBe(true);

    const listTwo = await request(app).get('/api/v1/agent/requisitions').set('Cookie', agentTwoCookie);
    expect(listTwo.body.data.some((r: any) => r.id === requisitionId)).toBe(false);

    const pick = await request(app).post(`/api/v1/agent/requisitions/${requisitionId}/pickup`).set('Cookie', agentTwoCookie);
    expect(pick.status).toBe(403);

    const pickPinned = await request(app).post(`/api/v1/agent/requisitions/${requisitionId}/pickup`).set('Cookie', agentCookie);
    expect(pickPinned.status).toBe(201);
  });

  it('in open mode WITH a pin, still only the pinned agent can pick up', async () => {
    const db = getDb();
    await db.execute(sql`UPDATE jobs SET pinned_agent_id = ${agentUserId} WHERE id = ${requisitionId}`);

    const pickOther = await request(app).post(`/api/v1/agent/requisitions/${requisitionId}/pickup`).set('Cookie', agentTwoCookie);
    expect(pickOther.status).toBe(403);

    const pickPinned = await request(app).post(`/api/v1/agent/requisitions/${requisitionId}/pickup`).set('Cookie', agentCookie);
    expect(pickPinned.status).toBe(201);
  });
});

describe('Phase 2 — Pickup guards (PWS §2)', () => {
  it('cannot pick up a job that is not agents_only (i.e. an already-public agent job)', async () => {
    const postRes = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie).send({
      title: 'Standalone Job', company: 'DirectCo', location: 'Dubai', country: 'United Arab Emirates',
      description: 'Agent sourced demand', experience: 2, requirements: [], skills: ['x'],
    });
    const pick = await request(app).post(`/api/v1/agent/requisitions/${postRes.body.data.id}/pickup`).set('Cookie', agentTwoCookie);
    expect(pick.status).toBe(400);
  });

  it('candidate cannot hit pickup endpoint', async () => {
    const pick = await request(app).post(`/api/v1/agent/requisitions/${requisitionId}/pickup`).set('Cookie', candidateCookie);
    expect(pick.status).toBe(403);
  });

  it('anonymous cannot hit pickup endpoint', async () => {
    const pick = await request(app).post(`/api/v1/agent/requisitions/${requisitionId}/pickup`);
    expect(pick.status).toBe(401);
  });

  it('unverified agent cannot pick up', async () => {
    const db = getDb();
    await db.execute(sql`UPDATE recruitment_agents SET verified = false WHERE user_id = ${agentUserId}`);
    const pick = await request(app).post(`/api/v1/agent/requisitions/${requisitionId}/pickup`).set('Cookie', agentCookie);
    expect(pick.status).toBe(403);
  });
});
