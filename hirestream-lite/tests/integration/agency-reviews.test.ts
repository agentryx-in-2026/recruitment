import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import bcrypt from 'bcrypt';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { users, recruitmentAgents } from '../../shared/schema';
import { eq } from 'drizzle-orm';

let app: Express;

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  await truncateAllTables();
});

async function createUser(role: string, suffix = '1') {
  const db = getDb();
  const hashedPw = await bcrypt.hash('Test@1234', 10);
  const [u] = await db.insert(users).values({
    username: `${role}_${suffix}`,
    email: `${role}${suffix}@hirestream.test`,
    password: hashedPw,
    role,
  }).returning();
  return u;
}

async function loginAs(role: string, suffix = '1') {
  await createUser(role, suffix);
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({
    username: `${role}_${suffix}`,
    password: 'Test@1234',
  });
  return agent;
}

async function createAgency(verified = true) {
  const agentUser = await createUser('agent', 'a1');
  const db = getDb();
  const [agency] = await db.insert(recruitmentAgents).values({
    userId: agentUser.id,
    agencyName: 'Test Recruitment Agency',
    licenseNumber: 'HP-LIC-TEST-001',
    specializations: ['IT', 'Healthcare'],
    verified,
  }).returning();
  return agency;
}

// ── GET reviews — public endpoint ─────────────────────────────────────

describe('GET /api/v1/agencies/:id/reviews', () => {
  it('returns empty list when no reviews exist', async () => {
    const agency = await createAgency();
    const res = await request(app).get(`/api/v1/agencies/${agency.id}/reviews`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
    expect(res.body.averageRating).toBe(0);
  });

  it('returns reviews with computed average rating', async () => {
    const agency = await createAgency();
    const cAgent = await loginAs('candidate', 'c1');

    await cAgent.post(`/api/v1/agencies/${agency.id}/reviews`).send({ rating: 5, title: 'Great', review: 'Excellent service' });

    const res = await request(app).get(`/api/v1/agencies/${agency.id}/reviews`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.averageRating).toBe(5);
  });
});

// ── POST review ─────────────────────────────────────────────────────

describe('POST /api/v1/agencies/:id/reviews', () => {
  it('rejects unauthenticated → 401', async () => {
    const agency = await createAgency();
    const res = await request(app)
      .post(`/api/v1/agencies/${agency.id}/reviews`)
      .send({ rating: 5 });
    expect(res.status).toBe(401);
  });

  it('rejects non-candidate (agent) → 403', async () => {
    const agency = await createAgency();
    const aAgent = await loginAs('agent', 'a2');
    const res = await aAgent.post(`/api/v1/agencies/${agency.id}/reviews`).send({ rating: 5 });
    expect(res.status).toBe(403);
  });

  it('rejects out-of-range rating (0) → 400', async () => {
    const agency = await createAgency();
    const cAgent = await loginAs('candidate', 'c1');
    const res = await cAgent.post(`/api/v1/agencies/${agency.id}/reviews`).send({ rating: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects out-of-range rating (6) → 400', async () => {
    const agency = await createAgency();
    const cAgent = await loginAs('candidate', 'c1');
    const res = await cAgent.post(`/api/v1/agencies/${agency.id}/reviews`).send({ rating: 6 });
    expect(res.status).toBe(400);
  });

  it('rejects non-existent agency → 404', async () => {
    const cAgent = await loginAs('candidate', 'c1');
    const res = await cAgent.post(`/api/v1/agencies/00000000-0000-0000-0000-000000000000/reviews`).send({ rating: 5 });
    expect(res.status).toBe(404);
  });

  it('creates a valid review and updates aggregate rating', async () => {
    const agency = await createAgency();
    const cAgent = await loginAs('candidate', 'c1');

    const res = await cAgent.post(`/api/v1/agencies/${agency.id}/reviews`).send({
      rating: 4,
      title: 'Smooth process',
      review: 'Helpful and responsive throughout the placement.',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.rating).toBe(4);

    // Aggregate rating updated
    const db = getDb();
    const [updated] = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.id, agency.id));
    expect(updated.rating).toBe(4);
  });

  it('aggregate rating averages multiple reviews', async () => {
    const agency = await createAgency();
    const c1 = await loginAs('candidate', 'c1');
    const c2 = await loginAs('candidate', 'c2');

    await c1.post(`/api/v1/agencies/${agency.id}/reviews`).send({ rating: 5 });
    await c2.post(`/api/v1/agencies/${agency.id}/reviews`).send({ rating: 3 });

    const db = getDb();
    const [updated] = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.id, agency.id));
    expect(updated.rating).toBe(4); // (5+3)/2 rounded
  });
});

// ── GET /api/v1/agencies — public list of verified agencies ──────────

describe('GET /api/v1/agencies', () => {
  it('returns only verified agencies', async () => {
    await createAgency(true);
    // Create unverified agency
    const u2 = await createUser('agent', 'a2');
    const db = getDb();
    await db.insert(recruitmentAgents).values({
      userId: u2.id,
      agencyName: 'Unverified Agency',
      licenseNumber: 'HP-LIC-UNVER',
      verified: false,
    });

    const res = await request(app).get('/api/v1/agencies');
    expect(res.status).toBe(200);
    expect(res.body.data.every((a: any) => a.verified === true)).toBe(true);
  });
});
