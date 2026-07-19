/**
 * UAT-05 item 1 — email verification during candidate registration.
 *
 * The design decision under test: verification gates APPLYING, not signing in.
 * Locking a candidate out of an account they just created because a mail was
 * slow or landed in spam loses the applicant entirely, and HPSEDC's are largely
 * blue-collar, often on a shared or borrowed address. Applying is where a
 * reachable address starts to matter — it is how the interview call and the
 * offer letter reach them.
 *
 * The inherited suite turns this gate OFF in tests/helpers.ts (it registers and
 * applies in the same test, with no inbox), so this file is the only coverage
 * of the shipped default.
 */
import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { recruitmentAgents, otpCodes, users } from '../../shared/schema';
import { eq, desc } from 'drizzle-orm';

let app: Express;
let jobId: string;

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  await truncateAllTables();
  const db = getDb();
  const { updateSetting } = await import('../../server/services/settings.service');
  await updateSetting('registration.require_verified_email_to_apply', true);

  const agentReg = await request(app).post('/api/v1/auth/register')
    .send({ email: 'agent-ev@test.com', password: 'Test@123', role: 'agent' });
  const agentCookie = agentReg.headers['set-cookie'] as unknown as string[];
  await request(app).post('/api/v1/agencies/register').set('Cookie', agentCookie)
    .send({ agencyName: 'HPSEDC', licenseNumber: 'LIC-EV', specializations: ['Construction'] });
  await db.update(recruitmentAgents).set({ verified: true })
    .where(eq(recruitmentAgents.userId, agentReg.body.data.id));

  const jobRes = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie)
    .send({ title: 'Welder', company: 'Gulf Co', location: 'Dubai', country: 'United Arab Emirates', skills: ['Welding'], experience: 2 });
  jobId = jobRes.body.data.id;
});

const registerCandidate = async (email: string) => {
  const r = await request(app).post('/api/v1/auth/register')
    .send({ email, password: 'Test@123', role: 'candidate' });
  return { cookie: r.headers['set-cookie'] as unknown as string[], body: r.body };
};

describe('UAT-05 item 1 — email verification', () => {
  it('registers the user UNVERIFIED and issues a code', async () => {
    const email = 'cand-ev1@test.com';
    await registerCandidate(email);
    const db = getDb();
    const [u] = await db.select().from(users).where(eq(users.email, email));
    expect(u.emailVerified).toBe(false);
    const codes = await db.select().from(otpCodes).where(eq(otpCodes.email, email)).orderBy(desc(otpCodes.createdAt));
    expect(codes.length).toBeGreaterThan(0);
  });

  it('does NOT block signing in — that would lose the applicant entirely', async () => {
    const email = 'cand-ev2@test.com';
    await registerCandidate(email);
    const login = await request(app).post('/api/v1/auth/login')
      .send({ username: email, password: 'Test@123' });
    expect(login.status).toBe(200);
  });

  it('blocks applying until the address is confirmed, with a reason the UI can act on', async () => {
    const email = 'cand-ev3@test.com';
    const { cookie } = await registerCandidate(email);
    const res = await request(app).post(`/api/v1/jobs/${jobId}/apply`).set('Cookie', cookie);
    expect(res.status).toBe(403);
    expect(res.body?.error?.reason).toBe('EMAIL_NOT_VERIFIED');
  });

  it('verifying the code sets emailVerified — and does NOT touch phoneVerified', async () => {
    const email = 'cand-ev4@test.com';
    await registerCandidate(email);
    const db = getDb();
    const [code] = await db.select().from(otpCodes).where(eq(otpCodes.email, email)).orderBy(desc(otpCodes.createdAt));
    const res = await request(app).post('/api/v1/auth/verify-otp')
      .send({ email, otp: code.code, purpose: 'register' });
    expect(res.status).toBe(200);
    const [u] = await db.select().from(users).where(eq(users.email, email));
    expect(u.emailVerified).toBe(true);
    // The old code set phoneVerified here, with a comment calling it a reuse —
    // so confirming an EMAIL marked the PHONE verified. Separate claims.
    expect(u.phoneVerified).toBe(false);
  });

  it('lets the candidate apply once confirmed', async () => {
    const email = 'cand-ev5@test.com';
    const { cookie } = await registerCandidate(email);
    const db = getDb();
    const [code] = await db.select().from(otpCodes).where(eq(otpCodes.email, email)).orderBy(desc(otpCodes.createdAt));
    await request(app).post('/api/v1/auth/verify-otp').send({ email, otp: code.code, purpose: 'register' });
    const res = await request(app).post(`/api/v1/jobs/${jobId}/apply`).set('Cookie', cookie);
    expect(res.status).toBe(201);
  });

  it('a wrong code does not verify', async () => {
    const email = 'cand-ev6@test.com';
    await registerCandidate(email);
    const res = await request(app).post('/api/v1/auth/verify-otp')
      .send({ email, otp: '000000', purpose: 'register' });
    expect(res.status).toBe(401);
    const db = getDb();
    const [u] = await db.select().from(users).where(eq(users.email, email));
    expect(u.emailVerified).toBe(false);
  });

  it('is switchable off — HPSEDC can drop it if delivery proves unreliable', async () => {
    const { updateSetting } = await import('../../server/services/settings.service');
    await updateSetting('registration.require_verified_email_to_apply', false);
    const { cookie } = await registerCandidate('cand-ev7@test.com');
    const res = await request(app).post(`/api/v1/jobs/${jobId}/apply`).set('Cookie', cookie);
    expect(res.status).toBe(201);
  });
});
