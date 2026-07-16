import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

let app: Express;
let adminCookie: string[];
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

  // Candidate
  const candReg = await request(app).post('/api/v1/auth/register')
    .send({ email: 'cand@test.com', password: 'Test@123', role: 'candidate' });
  candidateCookie = candReg.headers['set-cookie'] as unknown as string[];
});

// ═══════════════════════════════════════════════════════════════════
// GRIEVANCES
// ═══════════════════════════════════════════════════════════════════

describe('POST /api/v1/grievances', () => {
  it('submits grievance → 201', async () => {
    const res = await request(app).post('/api/v1/grievances').set('Cookie', candidateCookie)
      .send({ category: 'application_issue', subject: 'App stuck', description: 'My application is not moving' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('submitted');
  });

  it('rejects invalid category → 400', async () => {
    const res = await request(app).post('/api/v1/grievances').set('Cookie', candidateCookie)
      .send({ category: 'invalid', subject: 'Test', description: 'Test' });
    expect(res.status).toBe(400);
  });

  it('rejects missing fields → 400', async () => {
    const res = await request(app).post('/api/v1/grievances').set('Cookie', candidateCookie)
      .send({ category: 'other' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/grievances/my', () => {
  it('returns own grievances', async () => {
    await request(app).post('/api/v1/grievances').set('Cookie', candidateCookie)
      .send({ category: 'technical_problem', subject: 'Bug', description: 'Something broke' });
    const res = await request(app).get('/api/v1/grievances/my').set('Cookie', candidateCookie);
    expect(res.body.data.length).toBe(1);
  });
});

describe('GET /api/v1/grievances (admin)', () => {
  it('returns all grievances', async () => {
    await request(app).post('/api/v1/grievances').set('Cookie', candidateCookie)
      .send({ category: 'other', subject: 'Test', description: 'Test description with enough characters to pass validation' });
    const res = await request(app).get('/api/v1/grievances').set('Cookie', adminCookie);
    expect(res.body.data.length).toBe(1);
  });

  it('rejects non-admin → 403', async () => {
    const res = await request(app).get('/api/v1/grievances').set('Cookie', candidateCookie);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/grievances/:id (staff acts → complainant confirms)', () => {
  // Product model: staff drive the work (action_taken + resolution notes) but
  // do NOT self-resolve — the complainant closes the loop. See grievance.routes.ts.
  it('staff record action + notes; only the complainant can mark it resolved', async () => {
    const created = await request(app).post('/api/v1/grievances').set('Cookie', candidateCookie)
      .send({ category: 'application_issue', subject: 'Stuck', description: 'Help needed resolving this issue' });
    const gid = created.body.data.id;

    // Staff mark action_taken with resolution notes (staff-only fields).
    const staffRes = await request(app).patch(`/api/v1/grievances/${gid}`).set('Cookie', adminCookie)
      .send({ status: 'action_taken', resolutionNotes: 'Fixed the issue' });
    expect(staffRes.status).toBe(200);
    expect(staffRes.body.data.status).toBe('action_taken');
    expect(staffRes.body.data.resolutionNotes).toBe('Fixed the issue');

    // Staff cannot self-resolve — the complainant confirms the fix.
    const selfResolve = await request(app).patch(`/api/v1/grievances/${gid}`).set('Cookie', adminCookie)
      .send({ status: 'resolved' });
    expect(selfResolve.status).toBe(403);

    // The complainant closes the loop; resolvedAt is stamped, notes preserved.
    const closeRes = await request(app).patch(`/api/v1/grievances/${gid}`).set('Cookie', candidateCookie)
      .send({ status: 'resolved' });
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.status).toBe('resolved');
    expect(closeRes.body.data.resolutionNotes).toBe('Fixed the issue');
    expect(closeRes.body.data.resolvedAt).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════
// FAQ
// ═══════════════════════════════════════════════════════════════════

describe('POST /api/v1/content/faq (admin)', () => {
  it('creates FAQ entry → 201', async () => {
    const res = await request(app).post('/api/v1/content/faq').set('Cookie', adminCookie)
      .send({ question: 'How to register?', answer: 'Click Create Account', category: 'registration' });
    expect(res.status).toBe(201);
    expect(res.body.data.question).toBe('How to register?');
  });

  it('rejects non-admin → 403', async () => {
    const res = await request(app).post('/api/v1/content/faq').set('Cookie', candidateCookie)
      .send({ question: 'Q', answer: 'A', category: 'test' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/content/faq (public)', () => {
  it('returns active FAQs', async () => {
    await request(app).post('/api/v1/content/faq').set('Cookie', adminCookie)
      .send({ question: 'Q1', answer: 'A1', category: 'general' });
    await request(app).post('/api/v1/content/faq').set('Cookie', adminCookie)
      .send({ question: 'Q2', answer: 'A2', category: 'general' });

    const res = await request(app).get('/api/v1/content/faq');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
  });
});

describe('PUT + DELETE /api/v1/content/faq/:id', () => {
  it('updates and deletes FAQ', async () => {
    const created = await request(app).post('/api/v1/content/faq').set('Cookie', adminCookie)
      .send({ question: 'Old Q', answer: 'Old A', category: 'test' });

    const updated = await request(app).put(`/api/v1/content/faq/${created.body.data.id}`).set('Cookie', adminCookie)
      .send({ question: 'New Q' });
    expect(updated.body.data.question).toBe('New Q');

    const deleted = await request(app).delete(`/api/v1/content/faq/${created.body.data.id}`).set('Cookie', adminCookie);
    expect(deleted.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ═══════════════════════════════════════════════════════════════════

describe('POST /api/v1/content/announcements (admin)', () => {
  it('creates announcement → 201', async () => {
    const res = await request(app).post('/api/v1/content/announcements').set('Cookie', adminCookie)
      .send({ title: 'Portal Update', body: 'New features launched' });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Portal Update');
  });
});

describe('GET /api/v1/content/announcements (public)', () => {
  it('returns active announcements', async () => {
    await request(app).post('/api/v1/content/announcements').set('Cookie', adminCookie)
      .send({ title: 'Active', body: 'This is active' });
    const res = await request(app).get('/api/v1/content/announcements');
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// TRAINING EVENTS
// ═══════════════════════════════════════════════════════════════════

describe('POST /api/v1/content/training (admin)', () => {
  it('creates training event → 201', async () => {
    const res = await request(app).post('/api/v1/content/training').set('Cookie', adminCookie)
      .send({ title: 'Interview Skills Workshop', date: '2026-06-01T10:00:00Z', location: 'Shimla' });
    expect(res.status).toBe(201);
  });

  it('rejects non-admin → 403', async () => {
    const res = await request(app).post('/api/v1/content/training').set('Cookie', candidateCookie)
      .send({ title: 'Test', date: '2026-06-01' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/content/training (public)', () => {
  it('returns upcoming events', async () => {
    await request(app).post('/api/v1/content/training').set('Cookie', adminCookie)
      .send({ title: 'Future Event', date: '2027-01-01T10:00:00Z', location: 'Delhi' });
    const res = await request(app).get('/api/v1/content/training');
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// AUDIT LOG
// ═══════════════════════════════════════════════════════════════════

describe('GET /api/v1/admin/audit', () => {
  it('returns audit log with pagination (admin only)', async () => {
    const res = await request(app).get('/api/v1/admin/audit').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.pagination).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('rejects non-admin → 403', async () => {
    const res = await request(app).get('/api/v1/admin/audit').set('Cookie', candidateCookie);
    expect(res.status).toBe(403);
  });
});
