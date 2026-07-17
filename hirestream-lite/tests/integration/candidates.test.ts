import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, truncateAllTables } from '../helpers';

let app: Express;
let candidateCookie: string[];

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  await truncateAllTables();

  // Register candidate + create profile
  const reg = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'cand@test.com', password: 'Test@123', role: 'candidate' });
  candidateCookie = reg.headers['set-cookie'] as unknown as string[];

  await request(app)
    .patch('/api/v1/candidates/profile')
    .set('Cookie', candidateCookie)
    .send({ fullName: 'Test Candidate', email: 'cand@test.com', phone: '9876543210', location: 'Shimla', skills: ['React', 'Node.js'] });
});

// ── PDF Export ──────────────────────────────────────────────────────

describe('GET /api/v1/candidates/profile/pdf', () => {
  it('returns HTML profile document', async () => {
    const res = await request(app)
      .get('/api/v1/candidates/profile/pdf')
      .set('Cookie', candidateCookie);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Test Candidate');
    expect(res.text).toContain('HireStream');
  });

  it('includes education and experience in PDF', async () => {
    await request(app)
      .post('/api/v1/candidates/education')
      .set('Cookie', candidateCookie)
      .send({ degree: 'B.Tech', institution: 'IIT Mandi', year: 2020 });

    await request(app)
      .post('/api/v1/candidates/experience')
      .set('Cookie', candidateCookie)
      .send({ company: 'TCS', role: 'Developer', years: 3, country: 'United Arab Emirates' });

    const res = await request(app)
      .get('/api/v1/candidates/profile/pdf')
      .set('Cookie', candidateCookie);

    expect(res.text).toContain('B.Tech');
    expect(res.text).toContain('IIT Mandi');
    expect(res.text).toContain('TCS');
    expect(res.text).toContain('Developer');
  });

  it('rejects unauthenticated request → 401', async () => {
    const res = await request(app).get('/api/v1/candidates/profile/pdf');
    expect(res.status).toBe(401);
  });
});

// ── Education CRUD ──────────────────────────────────────────────────

describe('POST /api/v1/candidates/education', () => {
  it('adds education record → 201', async () => {
    const res = await request(app)
      .post('/api/v1/candidates/education')
      .set('Cookie', candidateCookie)
      .send({ degree: 'B.Tech', institution: 'IIT Mandi', year: 2020, percentage: '85.5' });

    expect(res.status).toBe(201);
    expect(res.body.data.degree).toBe('B.Tech');
    expect(res.body.data.institution).toBe('IIT Mandi');
  });

  it('rejects unauthenticated → 401', async () => {
    const res = await request(app)
      .post('/api/v1/candidates/education')
      .send({ degree: 'B.Tech', institution: 'IIT', year: 2020 });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/candidates/education', () => {
  it('returns empty list for new candidate', async () => {
    const res = await request(app)
      .get('/api/v1/candidates/education')
      .set('Cookie', candidateCookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns added records', async () => {
    await request(app)
      .post('/api/v1/candidates/education')
      .set('Cookie', candidateCookie)
      .send({ degree: 'B.Tech', institution: 'IIT', year: 2020 });

    await request(app)
      .post('/api/v1/candidates/education')
      .set('Cookie', candidateCookie)
      .send({ degree: 'M.Tech', institution: 'NIT', year: 2022 });

    const res = await request(app)
      .get('/api/v1/candidates/education')
      .set('Cookie', candidateCookie);

    expect(res.body.data).toHaveLength(2);
  });
});

describe('PUT /api/v1/candidates/education/:id', () => {
  it('updates an education record', async () => {
    const create = await request(app)
      .post('/api/v1/candidates/education')
      .set('Cookie', candidateCookie)
      .send({ degree: 'B.Tech', institution: 'IIT', year: 2020 });

    const res = await request(app)
      .put(`/api/v1/candidates/education/${create.body.data.id}`)
      .set('Cookie', candidateCookie)
      .send({ degree: 'B.Tech (Hons)', institution: 'IIT Mandi' });

    expect(res.status).toBe(200);
    expect(res.body.data.degree).toBe('B.Tech (Hons)');
  });

  it('returns 404 for non-existent record', async () => {
    const res = await request(app)
      .put('/api/v1/candidates/education/fake-id')
      .set('Cookie', candidateCookie)
      .send({ degree: 'MBA' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/candidates/education/:id', () => {
  it('deletes an education record', async () => {
    const create = await request(app)
      .post('/api/v1/candidates/education')
      .set('Cookie', candidateCookie)
      .send({ degree: 'B.Tech', institution: 'IIT', year: 2020 });

    const res = await request(app)
      .delete(`/api/v1/candidates/education/${create.body.data.id}`)
      .set('Cookie', candidateCookie);

    expect(res.status).toBe(200);

    // Verify gone
    const list = await request(app)
      .get('/api/v1/candidates/education')
      .set('Cookie', candidateCookie);
    expect(list.body.data).toHaveLength(0);
  });
});

// ── Experience CRUD ─────────────────────────────────────────────────

describe('POST /api/v1/candidates/experience', () => {
  it('adds experience record → 201', async () => {
    const res = await request(app)
      .post('/api/v1/candidates/experience')
      .set('Cookie', candidateCookie)
      .send({ company: 'TCS', role: 'Developer', years: 3, country: 'United Arab Emirates' });

    expect(res.status).toBe(201);
    expect(res.body.data.company).toBe('TCS');
    expect(res.body.data.role).toBe('Developer');
  });
});

describe('GET /api/v1/candidates/experience', () => {
  it('returns experience records', async () => {
    await request(app)
      .post('/api/v1/candidates/experience')
      .set('Cookie', candidateCookie)
      .send({ company: 'TCS', role: 'Developer', years: 3 });

    const res = await request(app)
      .get('/api/v1/candidates/experience')
      .set('Cookie', candidateCookie);

    expect(res.body.data).toHaveLength(1);
  });
});

describe('PUT /api/v1/candidates/experience/:id', () => {
  it('updates an experience record', async () => {
    const create = await request(app)
      .post('/api/v1/candidates/experience')
      .set('Cookie', candidateCookie)
      .send({ company: 'TCS', role: 'Developer', years: 3 });

    const res = await request(app)
      .put(`/api/v1/candidates/experience/${create.body.data.id}`)
      .set('Cookie', candidateCookie)
      .send({ role: 'Senior Developer', years: 5 });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('Senior Developer');
  });
});

describe('DELETE /api/v1/candidates/experience/:id', () => {
  it('deletes an experience record', async () => {
    const create = await request(app)
      .post('/api/v1/candidates/experience')
      .set('Cookie', candidateCookie)
      .send({ company: 'TCS', role: 'Developer', years: 3 });

    const res = await request(app)
      .delete(`/api/v1/candidates/experience/${create.body.data.id}`)
      .set('Cookie', candidateCookie);

    expect(res.status).toBe(200);
  });
});

// ── Profile Completion ──────────────────────────────────────────────

describe('GET /api/v1/candidates/profile/completion', () => {
  it('returns completion percentage', async () => {
    const res = await request(app)
      .get('/api/v1/candidates/profile/completion')
      .set('Cookie', candidateCookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('percentage');
    expect(res.body.data).toHaveProperty('missing');
    // UAT-05: 7 checkpoints. Was 9, two of which were an ID SCAN and a PASSPORT
    // SCAN — so a candidate who answered every question truthfully sat at 78%.
    // Documents are no longer a property of the candidate at all: they are owed
    // per APPLICATION at shortlist/selection (document-obligations.routes.ts).
    expect(res.body.data).toHaveProperty('total', 7);
    expect(res.body.data.checks.map((c: any) => c.name)).toEqual(
      ['fullName', 'email', 'phone', 'location', 'skills', 'education', 'experience']);
  });

  it('shows 71% with name+email+phone+location+skills (5/7)', async () => {
    // Profile already has name, email, phone, location, skills from beforeEach
    const res = await request(app)
      .get('/api/v1/candidates/profile/completion')
      .set('Cookie', candidateCookie);

    // 5 of 7 filled = 71.4% → rounds to 71%
    expect(res.body.data.percentage).toBe(71);
    expect(res.body.data.missing).toContain('education');
    expect(res.body.data.missing).toContain('experience');
    // Documents must NOT appear here any more.
    expect(res.body.data.missing).not.toContain('idDocument');
    expect(res.body.data.missing).not.toContain('passport');
  });

  it('shows 100% with ZERO documents — the 20,000:500 rule', async () => {
    // THE regression test for UAT-05. HPSEDC: "we get 20,000 applications and
    // only 500 are selected. Why collect 20,000 applicants' documents when they
    // are not needed until the candidate is selected?"
    //
    // This test used to upload an identity_proof AND a passport to reach 100%.
    // It now uploads NOTHING and must still reach 100% — if someone re-adds a
    // document checkpoint to completion, this fails, which is the point.
    await request(app)
      .post('/api/v1/candidates/education')
      .set('Cookie', candidateCookie)
      .send({ degree: 'B.Tech', institution: 'IIT', year: 2020 });

    await request(app)
      .post('/api/v1/candidates/experience')
      .set('Cookie', candidateCookie)
      .send({ company: 'Acme Constructions', role: 'Dev', years: 2 });

    const docs = await request(app).get('/api/v1/candidates/documents').set('Cookie', candidateCookie);
    expect(docs.body.data).toHaveLength(0);   // not one document uploaded

    const res = await request(app)
      .get('/api/v1/candidates/profile/completion')
      .set('Cookie', candidateCookie);

    expect(res.body.data.percentage).toBe(100);
    expect(res.body.data.missing).toHaveLength(0);
  });
});
