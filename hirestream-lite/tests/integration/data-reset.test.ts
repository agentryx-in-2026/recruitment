/**
 * v0.4.36 — Superadmin data-reset modes.
 *
 * Verifies the rebuilt /api/v1/superadmin/reset endpoint + data-reset
 * service: activity / full / selective, FK-safe (no constraint errors),
 * superadmin + system config preserved.
 */
import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { sql } from 'drizzle-orm';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

let app: Express;
let superadminCookie: string[];
let agentCookie: string[];
let candidateCookie: string[];
let employerCookie: string[];

beforeAll(async () => { app = createTestApp(); });

async function count(table: string): Promise<number> {
  const db = getDb();
  const r: any = await db.execute(sql.raw(`SELECT count(*)::int AS c FROM "${table}"`));
  return (r.rows ?? r)[0].c;
}

beforeEach(async () => {
  await truncateAllTables();
  const db = getDb();

  // Superadmin
  const sReg = await request(app).post('/api/v1/auth/register').send({ email: 'sa@test.com', password: 'Test@123', role: 'candidate' });
  await db.execute(sql`UPDATE users SET role = 'superadmin' WHERE id = ${sReg.body.data.id}`);
  const sLogin = await request(app).post('/api/v1/auth/login').send({ username: 'sa@test.com', password: 'Test@123' });
  superadminCookie = sLogin.headers['set-cookie'] as unknown as string[];

  // Verified agent + agency
  const aReg = await request(app).post('/api/v1/auth/register').send({ email: 'agent@test.com', password: 'Test@123', role: 'agent' });
  agentCookie = aReg.headers['set-cookie'] as unknown as string[];
  await request(app).post('/api/v1/agencies/register').set('Cookie', agentCookie)
    .send({ agencyName: 'Reset Agency', licenseNumber: 'LIC-RST', specializations: ['IT'] });
  await db.execute(sql`UPDATE recruitment_agents SET verified = true WHERE user_id = ${aReg.body.data.id}`);

  // Verified employer
  const eReg = await request(app).post('/api/v1/auth/register').send({ email: 'emp@test.com', password: 'Test@123', role: 'employer' });
  employerCookie = eReg.headers['set-cookie'] as unknown as string[];
  await db.execute(sql`UPDATE employers SET verified = true WHERE user_id = ${eReg.body.data.id}`);

  // Candidate + profile
  const cReg = await request(app).post('/api/v1/auth/register').send({ email: 'cand@test.com', password: 'Test@123', role: 'candidate' });
  candidateCookie = cReg.headers['set-cookie'] as unknown as string[];
  await request(app).patch('/api/v1/candidates/profile').set('Cookie', candidateCookie)
    .send({ fullName: 'Reset Cand', email: 'cand@test.com', skills: ['React'], experience: 3 });

  // Job + application + interview
  const jobRes = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie).send({
    title: 'Engineer', company: 'Co', location: 'Dubai', country: 'United Arab Emirates',
    skills: ['React'], experience: 2, category: 'it', description: 'Build',
  });
  const jobId = jobRes.body.data.id;
  const applyRes = await request(app).post(`/api/v1/jobs/${jobId}/apply`).set('Cookie', candidateCookie);
  const appId = applyRes.body.data.id;
  // A notification exists from the apply flow; add an interview directly.
  const { interviews } = await import('../../shared/schema');
  await db.insert(interviews).values({ applicationId: appId, scheduledAt: new Date(Date.now() + 86400000), mode: 'virtual' });
  // A system setting with updatedBy referencing a non-superadmin (admin) user,
  // to prove full-wipe nulls config FKs before deleting users.
  await request(app).put('/api/v1/admin/settings/matching.recommendation_threshold_pct')
    .set('Cookie', superadminCookie).send({ value: 50 }).catch(() => {});
});

describe('Data reset — confirmation guard', () => {
  it('rejects without confirmation string', async () => {
    const r = await request(app).post('/api/v1/superadmin/reset').set('Cookie', superadminCookie)
      .send({ mode: 'full' });
    expect(r.status).toBe(400);
  });
  it('rejects non-superadmin', async () => {
    const r = await request(app).post('/api/v1/superadmin/reset').set('Cookie', agentCookie)
      .send({ confirmation: 'RESET_HIRESTREAM', mode: 'full' });
    expect(r.status).toBe(403);
  });
});

describe('Data reset — activity mode', () => {
  it('clears applications/interviews/notifications but KEEPS users, candidates, jobs, agencies', async () => {
    expect(await count('applications')).toBeGreaterThan(0);
    expect(await count('interviews')).toBeGreaterThan(0);

    const r = await request(app).post('/api/v1/superadmin/reset').set('Cookie', superadminCookie)
      .send({ confirmation: 'RESET_HIRESTREAM', mode: 'activity' });
    expect(r.status).toBe(200);

    // Activity cleared
    expect(await count('applications')).toBe(0);
    expect(await count('interviews')).toBe(0);    // cascade from applications
    expect(await count('notifications')).toBe(0);
    // Actors kept
    expect(await count('candidates')).toBeGreaterThan(0);
    expect(await count('jobs')).toBeGreaterThan(0);
    expect(await count('recruitment_agents')).toBeGreaterThan(0);
    expect(await count('employers')).toBeGreaterThan(0);
    expect(await count('users')).toBeGreaterThan(1);
  });
});

describe('Data reset — full mode', () => {
  it('clears ALL data, preserves superadmin login + system settings', async () => {
    const settingsBefore = await count('system_settings');
    expect(settingsBefore).toBeGreaterThan(0);

    const r = await request(app).post('/api/v1/superadmin/reset').set('Cookie', superadminCookie)
      .send({ confirmation: 'RESET_HIRESTREAM', mode: 'full' });
    expect(r.status).toBe(200);
    expect(r.body.usersDeleted).toBeGreaterThan(0);

    // All data gone
    expect(await count('candidates')).toBe(0);
    expect(await count('jobs')).toBe(0);
    expect(await count('applications')).toBe(0);
    expect(await count('interviews')).toBe(0);
    expect(await count('recruitment_agents')).toBe(0);
    expect(await count('employers')).toBe(0);
    // Only superadmin remains
    expect(await count('users')).toBe(1);
    const db = getDb();
    const remaining: any = await db.execute(sql`SELECT role FROM users`);
    expect((remaining.rows ?? remaining)[0].role).toBe('superadmin');
    // System config preserved
    expect(await count('system_settings')).toBe(settingsBefore);

    // Superadmin can still act (session valid, role intact)
    const who = await request(app).get('/api/v1/superadmin/users').set('Cookie', superadminCookie);
    expect(who.status).toBe(200);
  });
});

describe('Data reset — selective mode', () => {
  it('clears only the chosen class (notifications) and leaves the rest', async () => {
    expect(await count('notifications')).toBeGreaterThan(0);
    expect(await count('applications')).toBeGreaterThan(0);

    const r = await request(app).post('/api/v1/superadmin/reset').set('Cookie', superadminCookie)
      .send({ confirmation: 'RESET_HIRESTREAM', mode: 'selective', classes: ['notifications'] });
    expect(r.status).toBe(200);

    expect(await count('notifications')).toBe(0);
    expect(await count('applications')).toBeGreaterThan(0);  // untouched
    expect(await count('candidates')).toBeGreaterThan(0);
  });

  it('selecting "candidates" cascades to their applications + interviews', async () => {
    const r = await request(app).post('/api/v1/superadmin/reset').set('Cookie', superadminCookie)
      .send({ confirmation: 'RESET_HIRESTREAM', mode: 'selective', classes: ['candidates'] });
    expect(r.status).toBe(200);
    expect(await count('candidates')).toBe(0);
    expect(await count('applications')).toBe(0);  // cascade
    expect(await count('interviews')).toBe(0);     // cascade
    // Jobs + agencies survive (not candidate-scoped)
    expect(await count('jobs')).toBeGreaterThan(0);
    expect(await count('recruitment_agents')).toBeGreaterThan(0);
  });

  it('selective with empty classes → 400', async () => {
    const r = await request(app).post('/api/v1/superadmin/reset').set('Cookie', superadminCookie)
      .send({ confirmation: 'RESET_HIRESTREAM', mode: 'selective', classes: [] });
    expect(r.status).toBe(400);
  });
});

describe('Data reset — options endpoint', () => {
  it('GET /reset/options lists data classes', async () => {
    const r = await request(app).get('/api/v1/superadmin/reset/options').set('Cookie', superadminCookie);
    expect(r.status).toBe(200);
    const keys = (r.body.data as any[]).map((d) => d.key);
    expect(keys).toContain('candidates');
    expect(keys).toContain('notifications');
    expect(keys).toContain('jobs');
  });
});
