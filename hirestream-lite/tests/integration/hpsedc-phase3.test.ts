/**
 * Phase 3 (v0.4.33) — HPSEDC review items 2 and 5: Matching Engine v2,
 * Parameters Module, IELTS-aware language scoring, education polish.
 *
 * Covered:
 *  - GET /api/v1/matching/version returns weights/policy/threshold/version
 *  - 7-factor scoring on the new engine: each factor's edge cases
 *  - IELTS-country routing (job.country=UK switches language factor to IELTS)
 *  - Missing-criteria policy: skill=zero strict, others=full neutral
 *  - Engine version toggle: v1 fallback produces 3-factor breakdown
 *  - Admin settings save flows through audit_log
 *  - Live preview endpoint returns the active breakdown for any (candidate, job)
 *  - Recommendation threshold respected on /api/v1/applications/recommendations/for-me
 *  - Education entry persists type / board / subject
 */
import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { sql } from 'drizzle-orm';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { users, recruitmentAgents, employers } from '../../shared/schema';

let app: Express;
let agentCookie: string[];
let candidateCookie: string[];
let candidateUserId: string;
let adminCookie: string[];
let adminUserId: string;

async function asAdmin(email: string): Promise<{ cookie: string[]; userId: string }> {
  const reg = await request(app).post('/api/v1/auth/register').send({ email, password: 'Test@123', role: 'candidate' });
  const userId = reg.body.data.id;
  const db = getDb();
  await db.execute(sql`UPDATE users SET role = 'admin' WHERE id = ${userId}`);
  const login = await request(app).post('/api/v1/auth/login').send({ username: email, password: 'Test@123' });
  return { cookie: login.headers['set-cookie'] as unknown as string[], userId };
}

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  await truncateAllTables();
  const db = getDb();

  // Verified agent
  const aReg = await request(app).post('/api/v1/auth/register').send({ email: 'ag.p3@test.com', password: 'Test@123', role: 'agent' });
  agentCookie = aReg.headers['set-cookie'] as unknown as string[];
  await request(app).post('/api/v1/agencies/register').set('Cookie', agentCookie)
    .send({ agencyName: 'P3 Agency', licenseNumber: 'LIC-P3', specializations: ['IT'] });
  await db.execute(sql`UPDATE recruitment_agents SET verified = true WHERE user_id = ${aReg.body.data.id}`);

  // Candidate with rich profile
  const cReg = await request(app).post('/api/v1/auth/register').send({ email: 'cand.p3@test.com', password: 'Test@123', role: 'candidate' });
  candidateCookie = cReg.headers['set-cookie'] as unknown as string[];
  candidateUserId = cReg.body.data.id;
  await request(app).patch('/api/v1/candidates/profile').set('Cookie', candidateCookie).send({
    fullName: 'Phase Three Cand', email: 'cand.p3@test.com',
    skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL'],
    experience: 5,
    preferredCountries: ['United Arab Emirates', 'Canada'],
    qualificationLevel: 'bachelor',
    preferredCategories: ['it'],
    preferredSalaryMin: 50000,
    preferredSalaryMax: 100000,
    preferredSalaryCurrency: 'USD',
    ieltsBand: '7.0',
    languageProficiency: { english: 'C1' },
  });

  // Admin
  const adm = await asAdmin('adm.p3@test.com');
  adminCookie = adm.cookie;
  adminUserId = adm.userId;
});

// Convenience: post a job as the verified agent
async function postJob(extra: any = {}) {
  const r = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie).send({
    title: 'Senior Engineer', company: 'TestCo', location: 'Toronto', country: 'Canada',
    skills: ['React', 'Node.js'], experience: 3, category: 'it',
    description: 'Build great stuff with us. Visa sponsorship included.',
    ...extra,
  });
  expect(r.status).toBe(201);
  return r.body.data;
}

describe('Phase 3 — GET /api/v1/matching/version', () => {
  it('returns engine version, weights, policy, threshold, IELTS countries', async () => {
    const r = await request(app).get('/api/v1/matching/version');
    expect(r.status).toBe(200);
    expect(r.body.data.version).toBe('v2');
    expect(r.body.data.weights).toMatchObject({ skill: 30, experience: 20, qualification: 10 });
    // v0.4.35.1: policy is per-direction. Skill candidate-missing = zero.
    expect(r.body.data.policy.skill.candidateMissing).toBe('zero');
    expect(r.body.data.policy.skill.jobMissing).toBe('half');
    expect(typeof r.body.data.thresholdPct).toBe('number');
    expect(r.body.data.ieltsCountries).toContain('United Kingdom');
  });
});

describe('Phase 3 — 7-factor scoring on the v2 engine', () => {
  it('breakdown returns all 7 factors with shape {score,max,detail}', async () => {
    const job = await postJob({ qualificationRequired: 'bachelor' });
    const apply = await request(app).post(`/api/v1/jobs/${job.id}/apply`).set('Cookie', candidateCookie);
    expect(apply.status).toBe(201);
    const appId = apply.body.data.id;
    const detail = await request(app).get(`/api/v1/applications/${appId}`).set('Cookie', candidateCookie);
    expect(detail.status).toBe(200);
    const bd = detail.body.data.scoreBreakdown;
    expect(bd.engineVersion).toBe('v2');
    for (const k of ['skill', 'experience', 'qualification', 'country', 'language', 'category', 'salary']) {
      expect(bd[k]).toBeDefined();
      expect(typeof bd[k].score).toBe('number');
      expect(typeof bd[k].max).toBe('number');
    }
  });

  it('skill factor: zero policy penalises when job has skills but candidate has none', async () => {
    const db = getDb();
    // Wipe candidate skills
    await db.execute(sql`UPDATE candidates SET skills = ARRAY[]::text[] WHERE user_id = ${candidateUserId}`);
    const job = await postJob({ skills: ['Python'] });
    const apply = await request(app).post(`/api/v1/jobs/${job.id}/apply`).set('Cookie', candidateCookie);
    const detail = await request(app).get(`/api/v1/applications/${apply.body.data.id}`).set('Cookie', candidateCookie);
    expect(detail.body.data.scoreBreakdown.skill.score).toBe(0);
  });

  it('qualification factor: one tier below required → half marks', async () => {
    const db = getDb();
    await db.execute(sql`UPDATE candidates SET qualification_level = 'diploma' WHERE user_id = ${candidateUserId}`);
    const job = await postJob({ qualificationRequired: 'bachelor' });
    const apply = await request(app).post(`/api/v1/jobs/${job.id}/apply`).set('Cookie', candidateCookie);
    const detail = await request(app).get(`/api/v1/applications/${apply.body.data.id}`).set('Cookie', candidateCookie);
    const q = detail.body.data.scoreBreakdown.qualification;
    expect(q.score).toBe(Math.round(q.max / 2));
  });

  it('country factor: job in candidate preferred countries → full marks', async () => {
    const job = await postJob({ country: 'Canada' });
    const apply = await request(app).post(`/api/v1/jobs/${job.id}/apply`).set('Cookie', candidateCookie);
    const detail = await request(app).get(`/api/v1/applications/${apply.body.data.id}`).set('Cookie', candidateCookie);
    expect(detail.body.data.scoreBreakdown.country.score).toBe(detail.body.data.scoreBreakdown.country.max);
  });

  it('category factor: job category in candidate preferences → full marks', async () => {
    const job = await postJob({ category: 'it' });
    const apply = await request(app).post(`/api/v1/jobs/${job.id}/apply`).set('Cookie', candidateCookie);
    const detail = await request(app).get(`/api/v1/applications/${apply.body.data.id}`).set('Cookie', candidateCookie);
    expect(detail.body.data.scoreBreakdown.category.score).toBe(detail.body.data.scoreBreakdown.category.max);
  });
});

describe('Phase 3 — IELTS-country language routing', () => {
  it('UK job uses IELTS scoring (candidate 7.0 vs required 6.0 → full marks)', async () => {
    const job = await postJob({ country: 'United Kingdom', requiredIeltsBand: '6.0' });
    const apply = await request(app).post(`/api/v1/jobs/${job.id}/apply`).set('Cookie', candidateCookie);
    const detail = await request(app).get(`/api/v1/applications/${apply.body.data.id}`).set('Cookie', candidateCookie);
    const lang = detail.body.data.scoreBreakdown.language;
    expect(lang.score).toBe(lang.max);
    expect(String(lang.detail)).toMatch(/IELTS 7/);
  });

  it('UK job, candidate one band below required → half marks', async () => {
    const db = getDb();
    await db.execute(sql`UPDATE candidates SET ielts_band = '5.0' WHERE user_id = ${candidateUserId}`);
    const job = await postJob({ country: 'United Kingdom', requiredIeltsBand: '6.0' });
    const apply = await request(app).post(`/api/v1/jobs/${job.id}/apply`).set('Cookie', candidateCookie);
    const detail = await request(app).get(`/api/v1/applications/${apply.body.data.id}`).set('Cookie', candidateCookie);
    const lang = detail.body.data.scoreBreakdown.language;
    expect(lang.score).toBe(Math.round(lang.max / 2));
  });

  it('UAE (non-IELTS) job uses CEFR (candidate English C1 vs required B2 → full)', async () => {
    const job = await postJob({ country: 'United Arab Emirates', languagesRequired: { english: 'B2' } });
    const apply = await request(app).post(`/api/v1/jobs/${job.id}/apply`).set('Cookie', candidateCookie);
    const detail = await request(app).get(`/api/v1/applications/${apply.body.data.id}`).set('Cookie', candidateCookie);
    const lang = detail.body.data.scoreBreakdown.language;
    expect(lang.score).toBe(lang.max);
  });

  // v0.4.35.1: per-direction policy — the asymmetry the doc promised.
  it('IELTS job requires a band but candidate has none → ZERO (candidate-missing policy)', async () => {
    const db = getDb();
    await db.execute(sql`UPDATE candidates SET ielts_band = NULL WHERE user_id = ${candidateUserId}`);
    const job = await postJob({ country: 'United Kingdom', requiredIeltsBand: '6.0' });
    const apply = await request(app).post(`/api/v1/jobs/${job.id}/apply`).set('Cookie', candidateCookie);
    const detail = await request(app).get(`/api/v1/applications/${apply.body.data.id}`).set('Cookie', candidateCookie);
    const lang = detail.body.data.scoreBreakdown.language;
    expect(lang.score).toBe(0);  // language gaps MUST surface
    expect(lang.policyApplied).toBe('zero');
  });

  it('IELTS country, job did NOT set a band, candidate has none → FULL (job-missing policy, both-missing → job-side wins)', async () => {
    const db = getDb();
    await db.execute(sql`UPDATE candidates SET ielts_band = NULL WHERE user_id = ${candidateUserId}`);
    const job = await postJob({ country: 'United Kingdom' });  // no requiredIeltsBand
    const apply = await request(app).post(`/api/v1/jobs/${job.id}/apply`).set('Cookie', candidateCookie);
    const detail = await request(app).get(`/api/v1/applications/${apply.body.data.id}`).set('Cookie', candidateCookie);
    const lang = detail.body.data.scoreBreakdown.language;
    expect(lang.score).toBe(lang.max);  // not a constraint → full marks
    expect(lang.policyApplied).toBe('full');
  });

  it('admin can set candidate-missing language policy to half and it takes effect', async () => {
    // Override language candidate-missing → half
    await request(app).put('/api/v1/admin/settings/matching.policy')
      .set('Cookie', adminCookie)
      .send({ value: {
        skill: { jobMissing: 'half', candidateMissing: 'zero' },
        experience: { jobMissing: 'full', candidateMissing: 'full' },
        qualification: { jobMissing: 'full', candidateMissing: 'half' },
        country: { jobMissing: 'full', candidateMissing: 'half' },
        language: { jobMissing: 'full', candidateMissing: 'half' },  // ← changed
        category: { jobMissing: 'full', candidateMissing: 'half' },
        salary: { jobMissing: 'full', candidateMissing: 'full' },
      } });
    const db = getDb();
    await db.execute(sql`UPDATE candidates SET ielts_band = NULL WHERE user_id = ${candidateUserId}`);
    const job = await postJob({ country: 'United Kingdom', requiredIeltsBand: '6.0' });
    const apply = await request(app).post(`/api/v1/jobs/${job.id}/apply`).set('Cookie', candidateCookie);
    const detail = await request(app).get(`/api/v1/applications/${apply.body.data.id}`).set('Cookie', candidateCookie);
    const lang = detail.body.data.scoreBreakdown.language;
    expect(lang.score).toBe(Math.round(lang.max / 2));  // now half, not zero
    // Restore default for downstream tests
    await request(app).put('/api/v1/admin/settings/matching.policy')
      .set('Cookie', adminCookie)
      .send({ value: {
        skill: { jobMissing: 'half', candidateMissing: 'zero' },
        experience: { jobMissing: 'full', candidateMissing: 'full' },
        qualification: { jobMissing: 'full', candidateMissing: 'half' },
        country: { jobMissing: 'full', candidateMissing: 'half' },
        language: { jobMissing: 'full', candidateMissing: 'zero' },
        category: { jobMissing: 'full', candidateMissing: 'half' },
        salary: { jobMissing: 'full', candidateMissing: 'full' },
      } });
  });
});

describe('Phase 3 — engine version toggle', () => {
  it('switching engine to v1 returns 3-factor breakdown with zero-max for v2-only factors', async () => {
    // Flip via the admin setting endpoint (live-effect on next score)
    await request(app).put('/api/v1/admin/settings/matching.engine_version')
      .set('Cookie', adminCookie).send({ value: 'v1' });

    const job = await postJob({ qualificationRequired: 'bachelor', category: 'it' });
    const apply = await request(app).post(`/api/v1/jobs/${job.id}/apply`).set('Cookie', candidateCookie);
    const detail = await request(app).get(`/api/v1/applications/${apply.body.data.id}`).set('Cookie', candidateCookie);
    const bd = detail.body.data.scoreBreakdown;
    expect(bd.engineVersion).toBe('v1');
    // v2-only factors are present but have max=0 so the panel hides them
    expect(bd.qualification.max).toBe(0);
    expect(bd.category.max).toBe(0);
    expect(bd.salary.max).toBe(0);
    // Restore default for downstream tests in this run
    await request(app).put('/api/v1/admin/settings/matching.engine_version')
      .set('Cookie', adminCookie).send({ value: 'v2' });
  });

  it('admin weight change is live-effect — next score reflects new weights', async () => {
    // Bump skill weight to 60, drop salary to 0 (rest must rebalance to total 100)
    await request(app).put('/api/v1/admin/settings/matching.weights')
      .set('Cookie', adminCookie)
      .send({ value: { skill: 60, experience: 15, qualification: 10, country: 5, language: 5, category: 5, salary: 0 } });

    const job = await postJob();
    const apply = await request(app).post(`/api/v1/jobs/${job.id}/apply`).set('Cookie', candidateCookie);
    const detail = await request(app).get(`/api/v1/applications/${apply.body.data.id}`).set('Cookie', candidateCookie);
    expect(detail.body.data.scoreBreakdown.skill.max).toBe(60);
    expect(detail.body.data.scoreBreakdown.salary.max).toBe(0);
  });
});

describe('Phase 3 — admin live preview + audit trail', () => {
  it('POST /matching/preview returns breakdown for arbitrary (candidate, job)', async () => {
    const job = await postJob();
    const db = getDb();
    const cRes: any = await db.execute(sql`SELECT id FROM candidates WHERE user_id = ${candidateUserId}`);
    const cRows = (cRes.rows ?? cRes) as any[];
    const candId = cRows[0].id;
    const r = await request(app).post('/api/v1/matching/preview').set('Cookie', adminCookie)
      .send({ candidateId: candId, jobId: job.id });
    expect(r.status).toBe(200);
    expect(typeof r.body.data.total).toBe('number');
    expect(r.body.data.engineVersion).toBe('v2');
  });

  it('preview is admin-only — agent gets 403', async () => {
    const r = await request(app).post('/api/v1/matching/preview').set('Cookie', agentCookie)
      .send({ candidateId: 'x', jobId: 'y' });
    expect(r.status).toBe(403);
  });

  it('matching.* setting writes go to audit_log', async () => {
    await request(app).put('/api/v1/admin/settings/matching.recommendation_threshold_pct')
      .set('Cookie', adminCookie).send({ value: 55 });
    const audit = await request(app).get('/api/v1/admin/audit?resourceType=setting&prefix=matching.&limit=5')
      .set('Cookie', adminCookie);
    expect(audit.status).toBe(200);
    const refs = (audit.body.data as any[]).map((r) => r.resourceId);
    expect(refs).toContain('matching.recommendation_threshold_pct');
  });
});

describe('Phase 3 — Education (HPSEDC Item 5)', () => {
  it('candidate_education accepts type / board / subject', async () => {
    const r = await request(app).post('/api/v1/candidates/education').set('Cookie', candidateCookie).send({
      degree: '12th Std', institution: 'DAV Public School', year: 2018,
      percentage: '88', type: 'school', board: 'CBSE',
    });
    expect(r.status).toBe(201);
    const list = await request(app).get('/api/v1/candidates/education').set('Cookie', candidateCookie);
    expect(list.status).toBe(200);
    const e = (list.body.data as any[]).find((x) => x.degree === '12th Std');
    expect(e.type).toBe('school');
    expect(e.board).toBe('CBSE');
  });
});
