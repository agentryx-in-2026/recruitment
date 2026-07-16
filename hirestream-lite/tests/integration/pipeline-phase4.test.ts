/**
 * Phase 4 — Cascading close + audit log (PWS §6 + §8)
 *
 * Covers:
 *   • Employer closing a requisition cascade-closes all derivatives
 *   • Candidates on derivative jobs receive neutral "position filled" notifications
 *   • Agent closing their own derivative does NOT cascade up
 *   • Every status transition writes to audit_log with actor/from/to/reason
 *   • Setting `requisition.cascade_close_derivatives = false` disables cascade
 */

import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { sql } from 'drizzle-orm';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { seedNotificationTemplates } from '../../server/services/notification-templates.seed';

let app: Express;
let adminCookie: string[];
let agentOneCookie: string[]; let agentOneUserId: string;
let agentTwoCookie: string[]; let agentTwoUserId: string;
let employerCookie: string[]; let employerUserId: string;
let candidateOneCookie: string[]; let candidateOneUserId: string;
let candidateTwoCookie: string[]; let candidateTwoUserId: string;
let requisitionId: string;
let derivativeOneId: string;
let derivativeTwoId: string;

beforeAll(async () => {
  app = createTestApp();
});

async function makeAdmin(email: string): Promise<string[]> {
  await request(app).post('/api/v1/auth/register').send({ email, password: 'Test@123', role: 'candidate' });
  const db = getDb();
  await db.execute(sql`UPDATE users SET role = 'admin' WHERE email = ${email}`);
  const login = await request(app).post('/api/v1/auth/login').send({ username: email, password: 'Test@123' });
  return login.headers['set-cookie'] as unknown as string[];
}

async function makeAgent(email: string, licenseNumber: string): Promise<{ cookie: string[]; userId: string }> {
  const reg = await request(app).post('/api/v1/auth/register').send({ email, password: 'Test@123', role: 'agent' });
  const cookie = reg.headers['set-cookie'] as unknown as string[];
  const userId = reg.body.data.id;
  await request(app).post('/api/v1/agencies/register').set('Cookie', cookie)
    .send({ agencyName: `Agency ${licenseNumber}`, licenseNumber });
  const db = getDb();
  await db.execute(sql`UPDATE recruitment_agents SET verified = true WHERE license_number = ${licenseNumber}`);
  return { cookie, userId };
}

async function makeEmployer(email: string): Promise<{ cookie: string[]; userId: string }> {
  const reg = await request(app).post('/api/v1/auth/register').send({ email, password: 'Test@123', role: 'employer' });
  const cookie = reg.headers['set-cookie'] as unknown as string[];
  const userId = reg.body.data.id;
  // v0.4.32: pre-verify so the publish gate doesn't block phase-4 flow tests
  const db = getDb();
  await db.execute(sql`UPDATE employers SET verified = true WHERE user_id = ${userId}`);
  return { cookie, userId };
}

async function makeCandidate(email: string): Promise<{ cookie: string[]; userId: string }> {
  const reg = await request(app).post('/api/v1/auth/register').send({ email, password: 'Test@123', role: 'candidate' });
  const cookie = reg.headers['set-cookie'] as unknown as string[];
  const userId = reg.body.data.id;
  await request(app).patch('/api/v1/candidates/profile').set('Cookie', cookie)
    .send({ fullName: email.split('@')[0], email, skills: ['Nursing'], experience: 3, preferredCountries: ['UK'] });
  return { cookie, userId };
}

beforeEach(async () => {
  await truncateAllTables();
  const db = getDb();
  await db.execute(sql`TRUNCATE TABLE notification_templates`);
  await seedNotificationTemplates();

  adminCookie = await makeAdmin('admin-p4@test.com');
  const a1 = await makeAgent('ag-p4-1@test.com', 'LIC-P4-1');
  agentOneCookie = a1.cookie; agentOneUserId = a1.userId;
  const a2 = await makeAgent('ag-p4-2@test.com', 'LIC-P4-2');
  agentTwoCookie = a2.cookie; agentTwoUserId = a2.userId;
  const emp = await makeEmployer('emp-p4@test.com');
  employerCookie = emp.cookie; employerUserId = emp.userId;
  const c1 = await makeCandidate('cand-p4-1@test.com');
  candidateOneCookie = c1.cookie; candidateOneUserId = c1.userId;
  const c2 = await makeCandidate('cand-p4-2@test.com');
  candidateTwoCookie = c2.cookie; candidateTwoUserId = c2.userId;

  // Reset pairing + cascade to defaults
  await request(app).put('/api/v1/admin/settings/requisition.pairing_mode')
    .set('Cookie', adminCookie).send({ value: 'open' });
  await request(app).put('/api/v1/admin/settings/requisition.cascade_close_derivatives')
    .set('Cookie', adminCookie).send({ value: true });

  // Employer posts a requisition
  const reqRes = await request(app).post('/api/v1/jobs').set('Cookie', employerCookie).send({
    title: 'Phase 4 Nurse', company: 'RoyalHealth PLC', location: 'London', country: 'United Kingdom',
    description: 'Cascade test requisition', experience: 2, requirements: [], skills: ['Nursing'],
  });
  requisitionId = reqRes.body.data.id;

  // Both agents pick up the req
  const pick1 = await request(app).post(`/api/v1/agent/requisitions/${requisitionId}/pickup`).set('Cookie', agentOneCookie);
  derivativeOneId = pick1.body.data.id;
  const pick2 = await request(app).post(`/api/v1/agent/requisitions/${requisitionId}/pickup`).set('Cookie', agentTwoCookie);
  derivativeTwoId = pick2.body.data.id;

  // One candidate applies to each derivative
  await request(app).post(`/api/v1/jobs/${derivativeOneId}/apply`).set('Cookie', candidateOneCookie);
  await request(app).post(`/api/v1/jobs/${derivativeTwoId}/apply`).set('Cookie', candidateTwoCookie);

  // Clear pre-existing notifications (welcome, apply confirmations) so we only measure cascade
  await db.execute(sql`DELETE FROM notifications`);
  await db.execute(sql`DELETE FROM audit_log`);
});

describe('Phase 4 — Cascade close (PWS §6)', () => {
  it('employer closing requisition cascade-closes both derivatives', async () => {
    const res = await request(app).patch(`/api/v1/jobs/${requisitionId}/status`)
      .set('Cookie', employerCookie).send({ status: 'closed' });
    expect(res.status).toBeLessThan(400);
    expect(res.body.cascadeClosedDerivatives).toHaveLength(2);

    const db = getDb();
    const rows: any = await db.execute(sql`SELECT id, status FROM jobs WHERE id IN (${sql.raw(`'${requisitionId}','${derivativeOneId}','${derivativeTwoId}'`)})`);
    const results = rows.rows ?? rows;
    for (const r of results) expect(r.status).toBe('closed');
  });

  it('candidates on derivatives receive job.closed notifications (neutral wording, no employer name)', async () => {
    await request(app).patch(`/api/v1/jobs/${requisitionId}/status`)
      .set('Cookie', employerCookie).send({ status: 'closed' });
    const db = getDb();
    const c1: any = await db.execute(sql`SELECT title, message FROM notifications WHERE user_id = ${candidateOneUserId} AND type = 'job.closed'`);
    const c2: any = await db.execute(sql`SELECT title, message FROM notifications WHERE user_id = ${candidateTwoUserId} AND type = 'job.closed'`);
    const c1Rows = c1.rows ?? c1;
    const c2Rows = c2.rows ?? c2;
    expect(c1Rows.length).toBeGreaterThanOrEqual(1);
    expect(c2Rows.length).toBeGreaterThanOrEqual(1);
    // Must NOT contain the employer company name
    for (const row of [...c1Rows, ...c2Rows]) {
      expect(row.message.toLowerCase()).not.toContain('royalhealth');
    }
  });

  it('agent closing their own derivative does NOT cascade upward', async () => {
    const res = await request(app).patch(`/api/v1/jobs/${derivativeOneId}/status`)
      .set('Cookie', agentOneCookie).send({ status: 'closed' });
    expect(res.status).toBeLessThan(400);
    expect(res.body.cascadeClosedDerivatives).toEqual([]);

    const db = getDb();
    const parent: any = await db.execute(sql`SELECT status FROM jobs WHERE id = ${requisitionId}`);
    const sibling: any = await db.execute(sql`SELECT status FROM jobs WHERE id = ${derivativeTwoId}`);
    expect((parent.rows ?? parent)[0].status).toBe('active');
    expect((sibling.rows ?? sibling)[0].status).toBe('active');
  });

  it('setting cascade_close_derivatives=false disables cascade', async () => {
    await request(app).put('/api/v1/admin/settings/requisition.cascade_close_derivatives')
      .set('Cookie', adminCookie).send({ value: false });
    const res = await request(app).patch(`/api/v1/jobs/${requisitionId}/status`)
      .set('Cookie', employerCookie).send({ status: 'closed' });
    expect(res.body.cascadeClosedDerivatives).toEqual([]);
    const db = getDb();
    const d1: any = await db.execute(sql`SELECT status FROM jobs WHERE id = ${derivativeOneId}`);
    expect((d1.rows ?? d1)[0].status).toBe('active');
  });
});

describe('Phase 4 — Audit log (PWS §8)', () => {
  it('job close writes an audit_log row with from/to and reason', async () => {
    await request(app).patch(`/api/v1/jobs/${requisitionId}/status`)
      .set('Cookie', employerCookie).send({ status: 'closed', reason: 'Position filled externally' });
    const db = getDb();
    const rows: any = await db.execute(sql`SELECT action, resource_id, details FROM audit_log WHERE resource_id = ${requisitionId}`);
    const r = (rows.rows ?? rows);
    const closeEntry = r.find((x: any) => x.action === 'requisition.status_change');
    expect(closeEntry).toBeDefined();
    expect(closeEntry.details.from).toBe('active');
    expect(closeEntry.details.to).toBe('closed');
    expect(closeEntry.details.reason).toBe('Position filled externally');
  });

  it('cascade close writes audit rows per derivative tagged cascade_close', async () => {
    await request(app).patch(`/api/v1/jobs/${requisitionId}/status`)
      .set('Cookie', employerCookie).send({ status: 'closed' });
    const db = getDb();
    const rows: any = await db.execute(sql`SELECT action, resource_id, details FROM audit_log WHERE action = 'job.cascade_close'`);
    const r = rows.rows ?? rows;
    expect(r.length).toBe(2);
    for (const entry of r) {
      expect(entry.details.parentRequisitionId).toBe(requisitionId);
      expect(entry.details.to).toBe('closed');
    }
  });

  it('application status change writes an audit_log row', async () => {
    // Find the application in derivativeOne
    const db = getDb();
    const appRows: any = await db.execute(sql`SELECT id FROM applications WHERE job_id = ${derivativeOneId}`);
    const applicationId = (appRows.rows ?? appRows)[0].id;

    await request(app).patch(`/api/v1/applications/${applicationId}/status`)
      .set('Cookie', agentOneCookie).send({ status: 'shortlisted' });

    const audit: any = await db.execute(sql`SELECT action, details FROM audit_log WHERE resource_id = ${applicationId}`);
    const a = (audit.rows ?? audit);
    const entry = a.find((x: any) => x.action === 'application.status_change');
    expect(entry).toBeDefined();
    expect(entry.details.to).toBe('shortlisted');
    expect(entry.details.actorRole).toBe('agent');
  });
});
