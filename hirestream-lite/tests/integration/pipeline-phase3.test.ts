/**
 * Phase 3 — Central notification engine (PWS §5)
 *
 * Covers:
 *   • Templates seed + admin edit round-trip
 *   • fireEvent dispatches to correct recipients per template
 *   • Employer-name scrubbing for candidate-facing negative events
 *   • Integration — real pipeline transitions fire the engine
 */

import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { sql } from 'drizzle-orm';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { seedNotificationTemplates } from '../../server/services/notification-templates.seed';
import { fireEvent } from '../../server/services/event-notifications.service';

let app: Express;
let adminCookie: string[];

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

beforeEach(async () => {
  await truncateAllTables();
  const db = getDb();
  await db.execute(sql`TRUNCATE TABLE notification_templates`);
  await seedNotificationTemplates();
  adminCookie = await makeAdmin('admin-p3@test.com');
});

describe('Phase 3 — Template seed + admin CRUD', () => {
  it('seeder produces templates for all 14 event keys', async () => {
    const res = await request(app).get('/api/v1/admin/notification-templates').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    const events = new Set(res.body.data.map((t: any) => t.eventKey));
    const expected = [
      "application.submitted","application.reviewed","application.shortlisted",
      "application.employer_approved","application.employer_rejected",
      "interview.scheduled","interview.completed",
      "application.selected","offer.issued","offer.accepted","offer.declined",
      "job.closed","job.auto_close_nudge","requisition.picked_up",
    ];
    for (const e of expected) expect(events.has(e)).toBe(true);
  });

  it('seeder is idempotent — rerun does not duplicate', async () => {
    await seedNotificationTemplates();
    const first = await request(app).get('/api/v1/admin/notification-templates').set('Cookie', adminCookie);
    await seedNotificationTemplates();
    await seedNotificationTemplates();
    const second = await request(app).get('/api/v1/admin/notification-templates').set('Cookie', adminCookie);
    expect(second.body.data.length).toBe(first.body.data.length);
  });

  it('admin can edit a template title/body', async () => {
    const put = await request(app)
      .put('/api/v1/admin/notification-templates/application.shortlisted/candidate')
      .set('Cookie', adminCookie)
      .send({ title: 'Custom candidate title', body: 'Custom candidate body' });
    expect(put.status).toBe(200);
    expect(put.body.data.title).toBe('Custom candidate title');
  });

  it('admin cannot create a template for an unknown recipient role', async () => {
    const put = await request(app)
      .put('/api/v1/admin/notification-templates/application.shortlisted/vendor')
      .set('Cookie', adminCookie)
      .send({ title: 'Nope' });
    expect(put.status).toBe(400);
  });
});

describe('Phase 3 — fireEvent direct', () => {
  async function seedActors() {
    // Create a candidate user row
    const cReg = await request(app).post('/api/v1/auth/register').send({ email: 'cand-p3@test.com', password: 'Test@123', role: 'candidate', fullName: 'Cand P3' });
    const candidateUserId = cReg.body.data.id;
    const aReg = await request(app).post('/api/v1/auth/register').send({ email: 'ag-p3@test.com', password: 'Test@123', role: 'agent' });
    const agentUserId = aReg.body.data.id;
    const eReg = await request(app).post('/api/v1/auth/register').send({ email: 'emp-p3@test.com', password: 'Test@123', role: 'employer' });
    const employerUserId = eReg.body.data.id;
    // Clear welcome/auto notifications created during registration so tests measure only fireEvent output
    const db = getDb();
    // v0.4.32: pre-verify the employer so the new publish gate doesn't block this test
    await db.execute(sql`UPDATE employers SET verified = true WHERE user_id = ${employerUserId}`);
    await db.execute(sql`DELETE FROM notifications`);
    return { candidateUserId, agentUserId, employerUserId };
  }

  it('dispatches candidate + agent notification on application.submitted', async () => {
    const { candidateUserId, agentUserId } = await seedActors();
    await fireEvent('application.submitted', {
      candidate: { id: 'x', userId: candidateUserId, fullName: 'Cand P3' },
      agent: { id: 'y', userId: agentUserId, agencyName: 'Ag' },
      job: { id: 'j', title: 'Nurse', company: 'Acme Hospital' },
    });
    const db = getDb();
    const candNotifs: any = await db.execute(sql`SELECT title, message FROM notifications WHERE user_id = ${candidateUserId}`);
    const agNotifs: any = await db.execute(sql`SELECT title, message FROM notifications WHERE user_id = ${agentUserId}`);
    const c = candNotifs.rows ?? candNotifs;
    const a = agNotifs.rows ?? agNotifs;
    expect(c.length).toBe(1);
    expect(a.length).toBe(1);
    expect(c[0].message).toContain('Nurse');
    expect(a[0].message).toContain('Cand P3');
  });

  it('scrubs employer company name from candidate message on negative events', async () => {
    const { candidateUserId, agentUserId, employerUserId } = await seedActors();
    await fireEvent('application.employer_rejected', {
      candidate: { id: 'x', userId: candidateUserId, fullName: 'Cand P3' },
      agent: { id: 'y', userId: agentUserId, agencyName: 'Ag' },
      employer: { id: 'z', userId: employerUserId, companyName: 'Secret Employer Corp' },
      job: { id: 'j', title: 'Nurse', company: 'Secret Employer Corp' },
    });
    const db = getDb();
    const cRes: any = await db.execute(sql`SELECT title, message FROM notifications WHERE user_id = ${candidateUserId}`);
    const aRes: any = await db.execute(sql`SELECT title, message FROM notifications WHERE user_id = ${agentUserId}`);
    const cRows = cRes.rows ?? cRes;
    const aRows = aRes.rows ?? aRes;
    // Candidate message must NOT contain the employer name
    expect(cRows[0].message.toLowerCase()).not.toContain('secret employer');
    // Agent message SHOULD be allowed to reference the candidate
    expect(aRows[0].message).toContain('Cand P3');
  });

  it('does not notify recipients missing from context', async () => {
    const { candidateUserId, agentUserId, employerUserId } = await seedActors();
    await fireEvent('application.shortlisted', {
      candidate: { id: 'x', userId: candidateUserId, fullName: 'Cand P3' },
      // no agent, no employer on purpose
      job: { id: 'j', title: 'Nurse', company: 'Acme' },
    });
    const db = getDb();
    // Filter out async "welcome" notifications produced by registration
    const agentNotifs: any = await db.execute(sql`SELECT user_id FROM notifications WHERE user_id = ${agentUserId} AND type LIKE 'application.%'`);
    const empNotifs: any = await db.execute(sql`SELECT user_id FROM notifications WHERE user_id = ${employerUserId} AND type LIKE 'application.%'`);
    expect((agentNotifs.rows ?? agentNotifs).length).toBe(0);
    expect((empNotifs.rows ?? empNotifs).length).toBe(0);
    const candNotifs: any = await db.execute(sql`SELECT user_id FROM notifications WHERE user_id = ${candidateUserId} AND type LIKE 'application.%'`);
    expect((candNotifs.rows ?? candNotifs).length).toBeGreaterThanOrEqual(1);
  });
});

describe('Phase 3 — Integration: status change fires events', () => {
  async function fullSetup() {
    // Verified agency + job + candidate + application in submitted state
    const agentReg = await request(app).post('/api/v1/auth/register').send({ email: 'ag-full@test.com', password: 'Test@123', role: 'agent' });
    const agentCookie = agentReg.headers['set-cookie'] as unknown as string[];
    const agentUserId = agentReg.body.data.id;
    await request(app).post('/api/v1/agencies/register').set('Cookie', agentCookie)
      .send({ agencyName: 'Full Agency', licenseNumber: 'LIC-FULL' });
    const db = getDb();
    await db.execute(sql`UPDATE recruitment_agents SET verified = true WHERE license_number = 'LIC-FULL'`);

    const candReg = await request(app).post('/api/v1/auth/register').send({ email: 'cand-full@test.com', password: 'Test@123', role: 'candidate' });
    const candCookie = candReg.headers['set-cookie'] as unknown as string[];
    const candUserId = candReg.body.data.id;
    await request(app).patch('/api/v1/candidates/profile').set('Cookie', candCookie)
      .send({ fullName: 'Full Cand', email: 'cand-full@test.com', skills: ['Nursing'], experience: 3, preferredCountries: ['UK'] });

    const jobRes = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie).send({
      title: 'Full Nurse', company: 'FullCo', location: 'London', country: 'United Kingdom',
      description: 'Full test job for integration', experience: 2, requirements: [], skills: ['Nursing'],
    });
    const jobId = jobRes.body.data.id;

    const applyRes = await request(app).post(`/api/v1/jobs/${jobId}/apply`).set('Cookie', candCookie);
    const applicationId = applyRes.body.data.id;
    return { agentCookie, agentUserId, candCookie, candUserId, jobId, applicationId };
  }

  it('agent shortlisting a candidate fires application.shortlisted event', async () => {
    const { agentCookie, candUserId, applicationId } = await fullSetup();
    // Clear any notifications created by the apply flow
    const db = getDb();
    await db.execute(sql`DELETE FROM notifications`);

    const patch = await request(app).patch(`/api/v1/applications/${applicationId}/status`)
      .set('Cookie', agentCookie).send({ status: 'shortlisted' });
    expect(patch.status).toBeLessThan(400);

    const res: any = await db.execute(sql`SELECT title, message, type FROM notifications WHERE user_id = ${candUserId}`);
    const rows = res.rows ?? res;
    const shortlistEvent = rows.find((r: any) => r.type === 'application.shortlisted');
    expect(shortlistEvent).toBeDefined();
    expect(shortlistEvent.message).toContain('Full Nurse');
  });
});
