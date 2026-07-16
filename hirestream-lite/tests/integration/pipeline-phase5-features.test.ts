/**
 * Phase 5 — Feature completions (PWS §7.15, §7.18)
 *
 * Covers:
 *   • Clone job → creates a draft with all fields except applicants
 *   • Draft cap — server enforces jobs.max_drafts_per_user
 *   • Cloning an employer requisition preserves visibility=agents_only
 */

import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { sql } from 'drizzle-orm';
import { createTestApp, truncateAllTables, getDb } from '../helpers';

let app: Express;
let adminCookie: string[];
let agentCookie: string[];
let employerCookie: string[];

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
async function makeAgent(email: string, lic: string): Promise<string[]> {
  const reg = await request(app).post('/api/v1/auth/register').send({ email, password: 'Test@123', role: 'agent' });
  const cookie = reg.headers['set-cookie'] as unknown as string[];
  await request(app).post('/api/v1/agencies/register').set('Cookie', cookie).send({ agencyName: `Ag ${lic}`, licenseNumber: lic });
  const db = getDb();
  await db.execute(sql`UPDATE recruitment_agents SET verified = true WHERE license_number = ${lic}`);
  return cookie;
}
async function makeEmployer(email: string): Promise<string[]> {
  const reg = await request(app).post('/api/v1/auth/register').send({ email, password: 'Test@123', role: 'employer' });
  // v0.4.32: pre-verify so the publish gate doesn't block tests
  const db = getDb();
  await db.execute(sql`UPDATE employers SET verified = true WHERE user_id = ${reg.body.data.id}`);
  return reg.headers['set-cookie'] as unknown as string[];
}

beforeEach(async () => {
  await truncateAllTables();
  adminCookie = await makeAdmin('admin-p5b@test.com');
  agentCookie = await makeAgent('ag-p5b@test.com', 'LIC-P5B');
  employerCookie = await makeEmployer('emp-p5b@test.com');
  // Reset draft cap to default 20
  await request(app).put('/api/v1/admin/settings/jobs.max_drafts_per_user')
    .set('Cookie', adminCookie).send({ value: 20 });
});

describe('Phase 5 — Clone job (PWS §7.15)', () => {
  it('clone creates a new draft with copied fields', async () => {
    const src = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie).send({
      title: 'Original', company: 'SrcCo', location: 'Dubai', country: 'United Arab Emirates',
      description: 'original description', experience: 3, requirements: [], skills: ['Nursing'],
    });
    const srcId = src.body.data.id;

    const clone = await request(app).post(`/api/v1/jobs/${srcId}/clone`).set('Cookie', agentCookie);
    expect(clone.status).toBe(201);
    expect(clone.body.data.id).not.toBe(srcId);
    expect(clone.body.data.status).toBe('draft');
    expect(clone.body.data.title).toBe('Original');
    expect(clone.body.data.company).toBe('SrcCo');
    expect(clone.body.data.skills).toEqual(['Nursing']);
    expect(clone.body.data.parentRequisitionId).toBeNull();
    expect(clone.body.data.hiringDeadline).toBeNull();
  });

  it('agent cannot clone another agent\'s job', async () => {
    const otherCookie = await makeAgent('ag-p5b-other@test.com', 'LIC-P5B-OTHER');
    const src = await request(app).post('/api/v1/jobs').set('Cookie', otherCookie).send({
      title: 'Private', company: 'PrivCo', location: 'Dubai', country: 'United Arab Emirates',
      description: 'private', experience: 1, requirements: [], skills: ['X'],
    });
    const clone = await request(app).post(`/api/v1/jobs/${src.body.data.id}/clone`).set('Cookie', agentCookie);
    expect(clone.status).toBe(403);
  });

  it('cloning an employer requisition preserves visibility=agents_only', async () => {
    const req = await request(app).post('/api/v1/jobs').set('Cookie', employerCookie).send({
      title: 'Requisition', company: 'EmpCo', location: 'London', country: 'United Kingdom',
      description: 'req desc', experience: 2, requirements: [], skills: ['ICU'],
    });
    const clone = await request(app).post(`/api/v1/jobs/${req.body.data.id}/clone`).set('Cookie', employerCookie);
    expect(clone.status).toBe(201);
    expect(clone.body.data.visibility).toBe('agents_only');
    expect(clone.body.data.status).toBe('draft');
  });
});

describe('Phase 5 — Draft cap (PWS §7.18)', () => {
  it('blocks a 4th draft when setting is 3', async () => {
    await request(app).put('/api/v1/admin/settings/jobs.max_drafts_per_user')
      .set('Cookie', adminCookie).send({ value: 3 });

    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie).send({
        title: `Draft ${i}`, isDraft: true,
      });
      expect(res.status).toBeLessThan(400);
    }

    const blocked = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie).send({
      title: 'Draft 4', isDraft: true,
    });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.message).toContain('Draft limit');
  });

  it('setting 0 disables the cap', async () => {
    await request(app).put('/api/v1/admin/settings/jobs.max_drafts_per_user')
      .set('Cookie', adminCookie).send({ value: 0 });

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie).send({
        title: `Unlimited draft ${i}`, isDraft: true,
      });
      expect(res.status).toBeLessThan(400);
    }
  });

  it('published jobs do not count against the draft cap', async () => {
    await request(app).put('/api/v1/admin/settings/jobs.max_drafts_per_user')
      .set('Cookie', adminCookie).send({ value: 2 });

    // Publish 5 full jobs
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/v1/jobs').set('Cookie', agentCookie).send({
        title: `Published ${i}`, company: 'Co', location: 'Dubai', country: 'United Arab Emirates',
        description: 'ok', experience: 1, requirements: [], skills: ['x'], isDraft: false,
      });
    }
    // Draft cap still applies independently
    await request(app).post('/api/v1/jobs').set('Cookie', agentCookie).send({ title: 'D1', isDraft: true });
    await request(app).post('/api/v1/jobs').set('Cookie', agentCookie).send({ title: 'D2', isDraft: true });
    const third = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie).send({ title: 'D3', isDraft: true });
    expect(third.status).toBe(403);
  });
});
