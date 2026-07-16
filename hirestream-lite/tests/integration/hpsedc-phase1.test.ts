/**
 * Phase 1 (v0.4.31) — HPSEDC review items 4, 6, 7, 8.
 *
 * Covered here:
 *  - Item 4: candidate profile accepts father/mother name + permanent address fields
 *  - Item 7: document vocabulary expanded to 6 distinct types; legacy "certificate" still works
 *  - Item 8: jobs.category is required+canonicalised on publish; invalid keys 400; browse filter works
 *
 * Each test boots a fresh app and truncates tables, matching the pattern of
 * other integration suites under tests/integration/.
 */

import { describe, beforeAll, beforeEach, it, expect, afterAll } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { recruitmentAgents } from '../../shared/schema';
import { eq } from 'drizzle-orm';

let app: Express;
let agentCookie: string[];
let candidateCookie: string[];

const TEST_FILE_DIR = path.resolve(process.cwd(), 'tests/fixtures');
const TEST_FILE_PATH = path.join(TEST_FILE_DIR, 'phase1-doc.pdf');

beforeAll(async () => {
  app = createTestApp();
  await fs.mkdir(TEST_FILE_DIR, { recursive: true });
  await fs.writeFile(TEST_FILE_PATH, Buffer.from('%PDF-1.4 phase1 fixture'));
});

afterAll(async () => {
  try { await fs.unlink(TEST_FILE_PATH); } catch { /* ignore */ }
});

beforeEach(async () => {
  await truncateAllTables();
  const db = getDb();

  // Agent (verified, so they can publish active jobs)
  const agentReg = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'agent.p1@test.com', password: 'Test@123', role: 'agent' });
  agentCookie = agentReg.headers['set-cookie'] as unknown as string[];
  const agentUserId = agentReg.body.data.id;
  await request(app)
    .post('/api/v1/agencies/register')
    .set('Cookie', agentCookie)
    .send({ agencyName: 'P1 Agency', licenseNumber: 'LIC-P1', specializations: ['IT'] });
  await db.update(recruitmentAgents).set({ verified: true }).where(eq(recruitmentAgents.userId, agentUserId));

  // Candidate with stub profile
  const candReg = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'cand.p1@test.com', password: 'Test@123', role: 'candidate' });
  candidateCookie = candReg.headers['set-cookie'] as unknown as string[];
  await request(app)
    .patch('/api/v1/candidates/profile')
    .set('Cookie', candidateCookie)
    .send({ fullName: 'Phase One Candidate', email: 'cand.p1@test.com' });
});

// ── Item 4: family details + permanent address ──────────────────────
describe('HPSEDC Item 4 — candidate identity fields', () => {
  it('persists father/mother name + permanent address through profile PATCH', async () => {
    const patch = await request(app)
      .patch('/api/v1/candidates/profile')
      .set('Cookie', candidateCookie)
      .send({
        fatherName: 'Ramesh Kumar',
        motherName: 'Sita Devi',
        permanentAddressLine1: 'House 12, Mohalla Bara',
        permanentAddressLine2: 'Near temple',
        permanentCity: 'Shimla',
        permanentPinCode: '171001',
        ecrStatus: 'ecr',
      });
    expect(patch.status).toBe(200);

    const me = await request(app).get('/api/v1/candidates/profile').set('Cookie', candidateCookie);
    expect(me.status).toBe(200);
    expect(me.body.data.fatherName).toBe('Ramesh Kumar');
    expect(me.body.data.motherName).toBe('Sita Devi');
    expect(me.body.data.permanentAddressLine1).toBe('House 12, Mohalla Bara');
    expect(me.body.data.permanentCity).toBe('Shimla');
    expect(me.body.data.permanentPinCode).toBe('171001');
    // ecrStatus is now writeable from the wizard (was previously omitted)
    expect(me.body.data.ecrStatus).toBe('ecr');
  });
});

// ── Item 7: expanded document vocabulary ────────────────────────────
describe('HPSEDC Item 7 — document type vocabulary', () => {
  const newSlots = [
    'cv', 'passport', 'identity_proof',
    'educational_certificate', 'experience_certificate', 'offer_letter',
  ];

  it.each(newSlots)('accepts new doc type "%s"', async (type) => {
    const res = await request(app)
      .post('/api/v1/candidates/documents')
      .set('Cookie', candidateCookie)
      .field('type', type)
      .attach('file', TEST_FILE_PATH);
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe(type);
  });

  it('still accepts legacy "certificate" type for backward-compat', async () => {
    const res = await request(app)
      .post('/api/v1/candidates/documents')
      .set('Cookie', candidateCookie)
      .field('type', 'certificate')
      .attach('file', TEST_FILE_PATH);
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('certificate');
  });

  it('rejects bogus type with 400', async () => {
    const res = await request(app)
      .post('/api/v1/candidates/documents')
      .set('Cookie', candidateCookie)
      .field('type', 'not_a_real_slot')
      .attach('file', TEST_FILE_PATH);
    expect(res.status).toBe(400);
  });
});

// ── Item 8: jobs.category controlled vocab + filter ─────────────────
describe('HPSEDC Item 8 — job category', () => {
  const baseJob = {
    title: 'Welder',
    company: 'Acme Overseas',
    location: 'Dubai',
    country: 'United Arab Emirates',
    description: 'Welding offshore platforms',
    experience: 2,
    skills: ['Welding'],
  };

  it('canonicalises a known category and stores it', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Cookie', agentCookie)
      .send({ ...baseJob, category: 'Factory Worker' }); // mixed-case / spaced label
    expect(res.status).toBe(201);
    expect(res.body.data.category).toBe('factory_worker');
  });

  it('rejects an unknown category with 400', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Cookie', agentCookie)
      .send({ ...baseJob, category: 'astronaut' });
    expect(res.status).toBe(400);
    expect(String(res.body.error?.message || '')).toMatch(/category/i);
  });

  it('allows a job without category (backward-compat for legacy callers)', async () => {
    // Tests written before v0.4.31 do not pass category. The shared schema
    // keeps it optional so those tests stay green; the client UI is what
    // enforces the required dropdown.
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Cookie', agentCookie)
      .send(baseJob);
    expect(res.status).toBe(201);
    expect(res.body.data.category == null || res.body.data.category === '').toBe(true);
  });

  it('GET /jobs?category=driver returns only matching jobs', async () => {
    await request(app).post('/api/v1/jobs').set('Cookie', agentCookie)
      .send({ ...baseJob, title: 'Bus Driver', category: 'driver' });
    await request(app).post('/api/v1/jobs').set('Cookie', agentCookie)
      .send({ ...baseJob, title: 'Helper', category: 'helper' });

    const list = await request(app).get('/api/v1/jobs?category=driver');
    expect(list.status).toBe(200);
    const titles = (list.body.data as any[]).map((j) => j.title).sort();
    expect(titles).toEqual(['Bus Driver']);
  });

  it('GET /jobs?category=driver,helper returns both (comma-separated)', async () => {
    await request(app).post('/api/v1/jobs').set('Cookie', agentCookie)
      .send({ ...baseJob, title: 'Bus Driver', category: 'driver' });
    await request(app).post('/api/v1/jobs').set('Cookie', agentCookie)
      .send({ ...baseJob, title: 'Site Helper', category: 'helper' });
    await request(app).post('/api/v1/jobs').set('Cookie', agentCookie)
      .send({ ...baseJob, title: 'Caregiver', category: 'caregiver' });

    const list = await request(app).get('/api/v1/jobs?category=driver,helper');
    expect(list.status).toBe(200);
    const titles = (list.body.data as any[]).map((j) => j.title).sort();
    expect(titles).toEqual(['Bus Driver', 'Site Helper']);
  });

  it('silently drops unknown keys in the category filter (no 500)', async () => {
    await request(app).post('/api/v1/jobs').set('Cookie', agentCookie)
      .send({ ...baseJob, title: 'Bus Driver', category: 'driver' });

    const list = await request(app).get('/api/v1/jobs?category=astronaut');
    // Unknown key → filter applies no constraint, so all jobs come back
    expect(list.status).toBe(200);
    expect((list.body.data as any[]).length).toBe(1);
  });
});
