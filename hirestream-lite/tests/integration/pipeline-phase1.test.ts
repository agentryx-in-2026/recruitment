/**
 * Phase 1 — Data model tests
 *
 * Covers PWS §2 (core data model) + §7 (flexible settings).
 * Verifies the schema additions and the new system settings exist,
 * are default-populated correctly, and round-trip via the admin API.
 *
 * This test deliberately does NOT exercise visibility enforcement —
 * that's Phase 2's job. We only assert the foundation.
 */

import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { sql } from 'drizzle-orm';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { jobs, candidates, systemSettings } from '../../shared/schema';

let app: Express;
let adminCookie: string[];

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  await truncateAllTables();

  // Seed an admin for settings round-trip tests
  await request(app).post('/api/v1/auth/register')
    .send({ email: 'seed.admin@test.com', password: 'Test@123', role: 'candidate' });
  // Promote to admin via direct DB update (admin promotion UI is out of scope for Phase 1)
  const db = getDb();
  await db.execute(sql`UPDATE users SET role = 'admin' WHERE email = 'seed.admin@test.com'`);

  const login = await request(app).post('/api/v1/auth/login')
    .send({ username: 'seed.admin@test.com', password: 'Test@123' });
  adminCookie = login.headers['set-cookie'] as unknown as string[];
});

describe('Phase 1 — Data model foundation (PWS §2)', () => {
  describe('Jobs table schema', () => {
    it('has a visibility column with default "public"', async () => {
      const db = getDb();
      const cols = await db.execute(sql`
        SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'jobs' AND column_name = 'visibility'
      `);
      const row = (cols as any).rows?.[0] ?? (cols as any)[0];
      expect(row).toBeDefined();
      expect(row.data_type).toBe('text');
      expect(row.is_nullable).toBe('NO');
      expect(row.column_default).toContain("'public'");
    });

    it('has a nullable parent_requisition_id column (self-FK pattern)', async () => {
      const db = getDb();
      const cols = await db.execute(sql`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'jobs' AND column_name = 'parent_requisition_id'
      `);
      const row = (cols as any).rows?.[0] ?? (cols as any)[0];
      expect(row).toBeDefined();
      expect(row.is_nullable).toBe('YES');
    });

    it('has a nullable pinned_agent_id column referencing users', async () => {
      const db = getDb();
      const cols = await db.execute(sql`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'jobs' AND column_name = 'pinned_agent_id'
      `);
      const row = (cols as any).rows?.[0] ?? (cols as any)[0];
      expect(row).toBeDefined();
      expect(row.is_nullable).toBe('YES');
    });

    it('new jobs created without explicit visibility default to "public"', async () => {
      const db = getDb();
      // Direct insert bypassing API (API enforcement is Phase 2)
      const [job] = await db.insert(jobs).values({
        title: 'Schema test job',
        company: 'Test Co',
        location: 'Dubai',
        country: 'United Arab Emirates',
      }).returning();
      expect(job.visibility).toBe('public');
      expect(job.parentRequisitionId).toBeNull();
      expect(job.pinnedAgentId).toBeNull();
    });

    it('accepts visibility = agents_only on insert', async () => {
      const db = getDb();
      const [job] = await db.insert(jobs).values({
        title: 'Employer requisition',
        company: 'Gulf Health Group',
        location: 'Riyadh',
        country: 'Saudi Arabia',
        visibility: 'agents_only',
      }).returning();
      expect(job.visibility).toBe('agents_only');
    });

    it('has an index on (visibility, status) for the hot search path', async () => {
      const db = getDb();
      const idx = await db.execute(sql`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'jobs' AND indexname = 'idx_jobs_visibility_status'
      `);
      const rows = (idx as any).rows ?? idx;
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  describe('Candidates table schema', () => {
    it('has open_to_outreach column defaulting to true', async () => {
      const db = getDb();
      const cols = await db.execute(sql`
        SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'candidates' AND column_name = 'open_to_outreach'
      `);
      const row = (cols as any).rows?.[0] ?? (cols as any)[0];
      expect(row).toBeDefined();
      expect(row.data_type).toBe('boolean');
      expect(row.is_nullable).toBe('NO');
      expect(String(row.column_default)).toMatch(/true/);
    });

    it('new candidates default to open_to_outreach = true', async () => {
      const db = getDb();
      await request(app).post('/api/v1/auth/register')
        .send({ email: 'candidate-phase1@test.com', password: 'Test@123', role: 'candidate', fullName: 'Phase One' });
      const result: any = await db.execute(sql`
        SELECT open_to_outreach FROM candidates WHERE email = 'candidate-phase1@test.com'
      `);
      const rows = result.rows ?? result;
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].open_to_outreach).toBe(true);
    });
  });
});

describe('Phase 1 — Flexible system settings (PWS §2)', () => {
  const expectedSettings = [
    { key: 'requisition.pairing_mode', default: 'open', type: 'string' },
    { key: 'candidate.default_open_to_outreach', default: true, type: 'boolean' },
    { key: 'requisition.cascade_close_derivatives', default: true, type: 'boolean' },
    { key: 'notifications.hide_employer_in_negatives', default: true, type: 'boolean' },
    { key: 'job.auto_close_nudge_days_before_deadline', default: 3, type: 'number' },
    { key: 'jobs.max_drafts_per_user', default: 20, type: 'number' },
    { key: 'job.auto_expire_days', default: 60, type: 'number' },
  ];

  it('exposes all 7 new pipeline/workflow settings in the admin settings endpoint', async () => {
    const res = await request(app).get('/api/v1/admin/settings').set('Cookie', adminCookie);
    expect(res.status).toBe(200);
    const settings: any[] = res.body.data;
    for (const { key, default: expectedDefault, type } of expectedSettings) {
      const match = settings.find((s) => s.key === key);
      expect(match).toBeDefined();
      expect(match.type).toBe(type);
      expect(match.default).toEqual(expectedDefault);
      expect(match.value).toEqual(expectedDefault);
      expect(match.isDefault).toBe(true);
    }
  });

  it('requisition.pairing_mode rejects values outside the allowed enum', async () => {
    const res = await request(app).put('/api/v1/admin/settings/requisition.pairing_mode')
      .set('Cookie', adminCookie)
      .send({ value: 'chaos' });
    // Should fail validation (400/422/ok=false).
    // Exact status depends on the admin route; accept either 4xx or body.ok=false.
    expect([400, 422].includes(res.status) || res.body?.ok === false).toBe(true);
  });

  it('requisition.pairing_mode accepts valid values and round-trips', async () => {
    const put = await request(app).put('/api/v1/admin/settings/requisition.pairing_mode')
      .set('Cookie', adminCookie)
      .send({ value: 'pinned_only' });
    expect(put.status).toBeLessThan(400);

    const get = await request(app).get('/api/v1/admin/settings').set('Cookie', adminCookie);
    const setting = get.body.data.find((s: any) => s.key === 'requisition.pairing_mode');
    expect(setting.value).toBe('pinned_only');
    expect(setting.isDefault).toBe(false);
  });

  it('cascade_close_derivatives boolean flips cleanly', async () => {
    const put = await request(app).put('/api/v1/admin/settings/requisition.cascade_close_derivatives')
      .set('Cookie', adminCookie)
      .send({ value: false });
    expect(put.status).toBeLessThan(400);

    const get = await request(app).get('/api/v1/admin/settings').set('Cookie', adminCookie);
    const setting = get.body.data.find((s: any) => s.key === 'requisition.cascade_close_derivatives');
    expect(setting.value).toBe(false);
  });
});

describe('Phase 1 — Regression: existing routes still work', () => {
  it('POST /api/v1/jobs still creates an agent-posted job with visibility=public by default', async () => {
    // Turn off the verification gate so the test can focus on the schema concern
    await request(app).put('/api/v1/admin/settings/agency.require_verification_to_post')
      .set('Cookie', adminCookie).send({ value: false });

    // Register an agent
    const agentReg = await request(app).post('/api/v1/auth/register')
      .send({ email: 'regress-agent@test.com', password: 'Test@123', role: 'agent' });
    const agentCookie = agentReg.headers['set-cookie'] as unknown as string[];

    const res = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie).send({
      title: 'Regression job',
      company: 'Regression Co',
      location: 'Dubai',
      country: 'United Arab Emirates',
      description: 'A regression test job to confirm default visibility survives the migration.',
      experience: 2,
      requirements: [],
      skills: ['Nursing'],
    });
    expect(res.status).toBeLessThan(300);
    expect(res.body.data.visibility).toBe('public');
    expect(res.body.data.parentRequisitionId).toBeNull();
  });
});
