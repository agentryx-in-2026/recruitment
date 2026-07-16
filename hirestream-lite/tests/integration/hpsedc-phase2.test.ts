/**
 * Phase 2 (v0.4.32) — HPSEDC review items 1 and 3.
 *
 * Coverage:
 *  - Employer KYB profile lifecycle: stub → fill fields → upload docs →
 *    submit-for-review (requires required fields + at least one doc) →
 *    admin approves → employer can publish requisitions.
 *  - Admin reject path: reason flows back to the user via notification.
 *  - Agency KYB lifecycle: same shape, gated on MEA RA Licence doc.
 *  - Per-document approve/reject including admin reviewNotes.
 *  - Job-posting gate: setting `employer.require_verification_to_post`
 *    blocks an unverified employer from publishing but allows drafts.
 *
 * Each test runs against a fresh app + clean DB.
 */
import { describe, beforeAll, beforeEach, it, expect, afterAll } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { employers, recruitmentAgents, systemSettings, users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

let app: Express;
let employerCookie: string[];
let agentCookie: string[];
let adminCookie: string[];

const TEST_FILE_DIR = path.resolve(process.cwd(), 'tests/fixtures');
const TEST_FILE_PATH = path.join(TEST_FILE_DIR, 'phase2-kyb-doc.pdf');

beforeAll(async () => {
  app = createTestApp();
  await fs.mkdir(TEST_FILE_DIR, { recursive: true });
  await fs.writeFile(TEST_FILE_PATH, Buffer.from('%PDF-1.4 phase2 KYB fixture'));
});

afterAll(async () => {
  try { await fs.unlink(TEST_FILE_PATH); } catch { /* ignore */ }
});

beforeEach(async () => {
  await truncateAllTables();
  // Default: turn the verify-to-post gate ON for these tests so we exercise
  // the failure path. Individual tests flip it OFF when they don't want the
  // gate to interfere.
  const db = getDb();
  await db.insert(systemSettings).values({
    key: 'employer.require_verification_to_post',
    value: true as any,
    category: 'access',
  }).onConflictDoNothing();

  // Employer
  const empReg = await request(app).post('/api/v1/auth/register')
    .send({ email: 'emp.p2@test.com', password: 'Test@123', role: 'employer' });
  employerCookie = empReg.headers['set-cookie'] as unknown as string[];

  // Agent (+ agency registered, will be verified by per-test as needed)
  const agtReg = await request(app).post('/api/v1/auth/register')
    .send({ email: 'agt.p2@test.com', password: 'Test@123', role: 'agent' });
  agentCookie = agtReg.headers['set-cookie'] as unknown as string[];
  await request(app).post('/api/v1/agencies/register').set('Cookie', agentCookie)
    .send({ agencyName: 'P2 Agency', licenseNumber: 'LIC-P2', specializations: ['IT'] });

  // Admin — register as candidate, flip role in DB, then login again
  // (registerSchema only allows candidate/agent/employer for new accounts).
  const admReg = await request(app).post('/api/v1/auth/register')
    .send({ email: 'admin.p2@test.com', password: 'Test@123', role: 'candidate' });
  await db.update(users).set({ role: 'admin' }).where(eq(users.id, admReg.body.data.id));
  const admLogin = await request(app).post('/api/v1/auth/login')
    .send({ username: 'admin.p2@test.com', password: 'Test@123' });
  adminCookie = admLogin.headers['set-cookie'] as unknown as string[];
});

// ── Employer KYB lifecycle ──────────────────────────────────────────
describe('HPSEDC Item 1 — Employer KYB', () => {
  it('GET /employer/profile auto-stubs an employer row for new accounts', async () => {
    const r = await request(app).get('/api/v1/employer/profile').set('Cookie', employerCookie);
    expect(r.status).toBe(200);
    expect(r.body.data.userId).toBeTruthy();
    expect(r.body.data.verified).toBe(false);
  });

  it('PATCH /employer/profile persists KYB fields', async () => {
    const r = await request(app).patch('/api/v1/employer/profile').set('Cookie', employerCookie).send({
      companyName: 'Phase2 Corp Pvt Ltd',
      cin: 'U72200KA2020PTC123456',
      pan: 'AAAAA1234A',
      contactEmail: 'hr@phase2.test',
      authorisedSignatoryName: 'Test Signatory',
    });
    expect(r.status).toBe(200);
    expect(r.body.data.companyName).toBe('Phase2 Corp Pvt Ltd');
    expect(r.body.data.cin).toBe('U72200KA2020PTC123456');
  });

  it('POST /employer/documents accepts mandated types and rejects bogus ones', async () => {
    // ensure profile is stubbed
    await request(app).get('/api/v1/employer/profile').set('Cookie', employerCookie);

    const ok = await request(app).post('/api/v1/employer/documents')
      .set('Cookie', employerCookie)
      .field('type', 'cin_certificate')
      .attach('file', TEST_FILE_PATH);
    expect(ok.status).toBe(201);
    expect(ok.body.data.type).toBe('cin_certificate');

    const bad = await request(app).post('/api/v1/employer/documents')
      .set('Cookie', employerCookie)
      .field('type', 'not_a_real_doc')
      .attach('file', TEST_FILE_PATH);
    expect(bad.status).toBe(400);
  });

  it('submit-for-review requires core fields + at least one doc', async () => {
    // Untouched: should fail with missing fields
    let r = await request(app).post('/api/v1/employer/submit-for-review').set('Cookie', employerCookie);
    expect(r.status).toBe(400);

    // Fill required fields but no docs yet
    await request(app).patch('/api/v1/employer/profile').set('Cookie', employerCookie).send({
      companyName: 'Phase2 Corp', cin: 'CIN1', pan: 'PAN1',
      contactEmail: 'hr@p2.test', authorisedSignatoryName: 'Sig',
      registeredCountry: 'Saudi Arabia',
    });
    r = await request(app).post('/api/v1/employer/submit-for-review').set('Cookie', employerCookie);
    expect(r.status).toBe(400);
    expect(String(r.body.error?.message || '')).toMatch(/document/i);

    // Upload a doc — submit succeeds
    await request(app).post('/api/v1/employer/documents').set('Cookie', employerCookie)
      .field('type', 'pan_card').attach('file', TEST_FILE_PATH);
    r = await request(app).post('/api/v1/employer/submit-for-review').set('Cookie', employerCookie);
    expect(r.status).toBe(200);

    // The row should now have submittedForReviewAt set
    const profile = await request(app).get('/api/v1/employer/profile').set('Cookie', employerCookie);
    expect(profile.body.data.submittedForReviewAt).toBeTruthy();
  });

  it('admin sees the employer in the queue and can approve with notification', async () => {
    // Bring the employer to "submitted"
    await request(app).get('/api/v1/employer/profile').set('Cookie', employerCookie);
    await request(app).patch('/api/v1/employer/profile').set('Cookie', employerCookie).send({
      companyName: 'Phase2 Corp', cin: 'CIN1', pan: 'PAN1',
      contactEmail: 'hr@p2.test', authorisedSignatoryName: 'Sig',
      registeredCountry: 'Saudi Arabia',
    });
    await request(app).post('/api/v1/employer/documents').set('Cookie', employerCookie)
      .field('type', 'pan_card').attach('file', TEST_FILE_PATH);
    await request(app).post('/api/v1/employer/submit-for-review').set('Cookie', employerCookie);

    const list = await request(app).get('/api/v1/admin/employers').set('Cookie', adminCookie);
    expect(list.status).toBe(200);
    expect((list.body.data as any[]).length).toBe(1);
    const empId = list.body.data[0].id;

    const detail = await request(app).get(`/api/v1/admin/employers/${empId}`).set('Cookie', adminCookie);
    expect(detail.status).toBe(200);
    expect(detail.body.data.documents.length).toBe(1);

    const verify = await request(app).patch(`/api/v1/admin/employers/${empId}/verify`)
      .set('Cookie', adminCookie).send({ verified: true });
    expect(verify.status).toBe(200);
    expect(verify.body.data.verified).toBe(true);
    expect(verify.body.data.verifiedAt).toBeTruthy();

    // Employer notification should land
    const notifs = await request(app).get('/api/v1/notifications').set('Cookie', employerCookie);
    expect(notifs.status).toBe(200);
    const types = (notifs.body.data as any[]).map((n) => n.type);
    expect(types).toContain('employer_verified');
  });

  it('admin reject path stores reason and notifies employer', async () => {
    await request(app).get('/api/v1/employer/profile').set('Cookie', employerCookie);
    await request(app).patch('/api/v1/employer/profile').set('Cookie', employerCookie).send({
      companyName: 'Phase2 Corp', cin: 'CIN1', pan: 'PAN1',
      contactEmail: 'hr@p2.test', authorisedSignatoryName: 'Sig',
      registeredCountry: 'Saudi Arabia',
    });
    await request(app).post('/api/v1/employer/documents').set('Cookie', employerCookie)
      .field('type', 'pan_card').attach('file', TEST_FILE_PATH);
    await request(app).post('/api/v1/employer/submit-for-review').set('Cookie', employerCookie);
    const list = await request(app).get('/api/v1/admin/employers').set('Cookie', adminCookie);
    const empId = list.body.data[0].id;

    const reject = await request(app).patch(`/api/v1/admin/employers/${empId}/verify`)
      .set('Cookie', adminCookie).send({ verified: false, rejectionReason: 'PAN card image is illegible.' });
    expect(reject.status).toBe(200);
    expect(reject.body.data.rejectionReason).toBe('PAN card image is illegible.');

    const notifs = await request(app).get('/api/v1/notifications').set('Cookie', employerCookie);
    const lastEmployerNotif = (notifs.body.data as any[]).find((n) => n.type === 'employer_verified');
    expect(lastEmployerNotif).toBeTruthy();
    expect(String(lastEmployerNotif.message)).toMatch(/illegible/i);
  });

  it('per-doc admin review (approve / reject with notes)', async () => {
    await request(app).get('/api/v1/employer/profile').set('Cookie', employerCookie);
    const upRes = await request(app).post('/api/v1/employer/documents').set('Cookie', employerCookie)
      .field('type', 'pan_card').attach('file', TEST_FILE_PATH);
    const docId = upRes.body.data.id;
    const empId = upRes.body.data.employerId;

    const r = await request(app).patch(`/api/v1/admin/employers/${empId}/documents/${docId}`)
      .set('Cookie', adminCookie)
      .send({ status: 'rejected', reviewNotes: 'Blurry — re-scan and re-upload.' });
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('rejected');
    expect(r.body.data.reviewNotes).toBe('Blurry — re-scan and re-upload.');
  });
});

// ── Job-posting gate ────────────────────────────────────────────────
describe('HPSEDC Item 1 — Post-Job gate', () => {
  const baseJob = {
    title: 'Welder', company: 'Acme', location: 'Dubai', country: 'United Arab Emirates',
    description: 'Welding offshore', experience: 2, skills: ['Welding'], category: 'driver',
  };

  it('unverified employer → publish blocked but draft allowed', async () => {
    const publish = await request(app).post('/api/v1/jobs').set('Cookie', employerCookie).send(baseJob);
    expect(publish.status).toBe(403);

    const draft = await request(app).post('/api/v1/jobs').set('Cookie', employerCookie).send({ ...baseJob, isDraft: true });
    expect(draft.status).toBe(201);
    expect(draft.body.data.status).toBe('draft');
  });

  it('verified employer → publish allowed', async () => {
    // Hand-verify directly in DB for speed (full lifecycle covered above)
    const db = getDb();
    await request(app).get('/api/v1/employer/profile').set('Cookie', employerCookie);
    await db.update(employers).set({ verified: true })
      .where(eq(employers.userId, (await db.select().from(employers).limit(1))[0].userId!));

    const publish = await request(app).post('/api/v1/jobs').set('Cookie', employerCookie).send(baseJob);
    expect(publish.status).toBe(201);
    expect(publish.body.data.status).toBe('active');
  });
});

// ── Agency KYB lifecycle ─────────────────────────────────────────────
describe('HPSEDC Item 3 — Agency KYB', () => {
  it('agency submit-for-review requires MEA RA Licence doc', async () => {
    let r = await request(app).post('/api/v1/agencies/submit-for-review').set('Cookie', agentCookie);
    expect(r.status).toBe(400);
    expect(String(r.body.error?.message || '')).toMatch(/MEA RA/i);

    // Upload a non-license doc → still rejected
    await request(app).post('/api/v1/agencies/documents').set('Cookie', agentCookie)
      .field('type', 'pan_card').attach('file', TEST_FILE_PATH);
    r = await request(app).post('/api/v1/agencies/submit-for-review').set('Cookie', agentCookie);
    expect(r.status).toBe(400);

    // Upload the licence → submit succeeds
    await request(app).post('/api/v1/agencies/documents').set('Cookie', agentCookie)
      .field('type', 'mea_ra_license').attach('file', TEST_FILE_PATH);
    r = await request(app).post('/api/v1/agencies/submit-for-review').set('Cookie', agentCookie);
    expect(r.status).toBe(200);
  });

  it('admin approves agency with notification', async () => {
    await request(app).post('/api/v1/agencies/documents').set('Cookie', agentCookie)
      .field('type', 'mea_ra_license').attach('file', TEST_FILE_PATH);
    await request(app).post('/api/v1/agencies/submit-for-review').set('Cookie', agentCookie);

    const list = await request(app).get('/api/v1/admin/agencies').set('Cookie', adminCookie);
    const agencyId = (list.body.data as any[]).find((a) => !a.verified).id;

    const verify = await request(app).patch(`/api/v1/admin/agencies/${agencyId}/verify`)
      .set('Cookie', adminCookie).send({ verified: true });
    expect(verify.status).toBe(200);
    expect(verify.body.data.verified).toBe(true);
    expect(verify.body.data.verifiedAt).toBeTruthy();

    const notifs = await request(app).get('/api/v1/notifications').set('Cookie', agentCookie);
    const types = (notifs.body.data as any[]).map((n) => n.type);
    expect(types).toContain('agency_verified');
  });

  it('admin can list and review individual agency docs', async () => {
    const upRes = await request(app).post('/api/v1/agencies/documents').set('Cookie', agentCookie)
      .field('type', 'mea_ra_license').attach('file', TEST_FILE_PATH);
    const docId = upRes.body.data.id;
    const agencyId = upRes.body.data.agencyId;

    const docs = await request(app).get(`/api/v1/admin/agencies/${agencyId}/documents`).set('Cookie', adminCookie);
    expect(docs.status).toBe(200);
    expect((docs.body.data as any[]).length).toBe(1);

    const r = await request(app).patch(`/api/v1/admin/agencies/${agencyId}/documents/${docId}`)
      .set('Cookie', adminCookie)
      .send({ status: 'approved', reviewNotes: 'Verified against MEA list.' });
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('approved');
  });

  it('agent cannot delete an already-approved doc', async () => {
    const upRes = await request(app).post('/api/v1/agencies/documents').set('Cookie', agentCookie)
      .field('type', 'mea_ra_license').attach('file', TEST_FILE_PATH);
    const docId = upRes.body.data.id;
    const agencyId = upRes.body.data.agencyId;

    await request(app).patch(`/api/v1/admin/agencies/${agencyId}/documents/${docId}`)
      .set('Cookie', adminCookie).send({ status: 'approved' });

    const del = await request(app).delete(`/api/v1/agencies/documents/${docId}`).set('Cookie', agentCookie);
    expect(del.status).toBe(400);
    expect(String(del.body.error?.message || '')).toMatch(/approved/i);
  });
});
