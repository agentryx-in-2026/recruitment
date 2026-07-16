import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { recruitmentAgents, users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

// HP-3b: hermetic tenant-isolation suite. Self-seeds its A/B cast via the API
// (+ a direct verify update), so it depends on NO external seed — replacing the
// old orphaned suite. The test env runs marketplace mode (truncateAllTables),
// which exercises the PRESERVED multi-agency isolation that guards the
// "re-expand later" path even though HP ships single-agency.

let app: Express;

async function register(role: string, email: string): Promise<{ id: string; cookie: string[] }> {
  const r = await request(app).post('/api/v1/auth/register').send({ email, password: 'Test@123', role, fullName: 'Iso User' });
  if (r.status !== 201) throw new Error(`register ${email} failed: ${r.status} ${JSON.stringify(r.body)}`);
  return { id: r.body.data.id, cookie: r.headers['set-cookie'] as unknown as string[] };
}

const JOB = (title: string) => ({ title, company: 'IsoCo', location: 'Dubai', country: 'United Arab Emirates', skills: ['React'], experience: 2 });

describe('Tenant isolation (hermetic, single-agency-aware)', () => {
  // Agent A / B (each a verified agency with one job), candidate A / B.
  let agentA: { id: string; cookie: string[] }, agentB: { id: string; cookie: string[] };
  let candA: { id: string; cookie: string[] }, candB: { id: string; cookie: string[] };
  let jobAId: string, jobBId: string;

  beforeAll(() => { app = createTestApp(); });

  beforeEach(async () => {
    await truncateAllTables();
    const db = getDb();

    agentA = await register('agent', 'iso_agent_a@test.com');
    agentB = await register('agent', 'iso_agent_b@test.com');
    for (const [ag, name, lic] of [[agentA, 'Agency A', 'ISOA'], [agentB, 'Agency B', 'ISOB']] as const) {
      await request(app).post('/api/v1/agencies/register').set('Cookie', ag.cookie)
        .send({ agencyName: name, licenseNumber: lic, specializations: ['IT'] });
      await db.update(recruitmentAgents).set({ verified: true }).where(eq(recruitmentAgents.userId, ag.id));
    }

    const jA = await request(app).post('/api/v1/jobs').set('Cookie', agentA.cookie).send(JOB('Iso Job A'));
    const jB = await request(app).post('/api/v1/jobs').set('Cookie', agentB.cookie).send(JOB('Iso Job B'));
    jobAId = jA.body.data.id; jobBId = jB.body.data.id;

    candA = await register('candidate', 'iso_cand_a@test.com');
    candB = await register('candidate', 'iso_cand_b@test.com');
    await request(app).patch('/api/v1/candidates/profile').set('Cookie', candA.cookie).send({ fullName: 'Candidate Alpha', email: 'iso_cand_a@test.com' });
    await request(app).patch('/api/v1/candidates/profile').set('Cookie', candB.cookie).send({ fullName: 'Candidate Beta', email: 'iso_cand_b@test.com' });
  });

  // ── Candidate isolation ──────────────────────────────────────────────
  it('GET /candidates/profile returns only the caller’s profile', async () => {
    const rA = await request(app).get('/api/v1/candidates/profile').set('Cookie', candA.cookie);
    const rB = await request(app).get('/api/v1/candidates/profile').set('Cookie', candB.cookie);
    expect(rA.body.data.fullName).toBe('Candidate Alpha');
    expect(rB.body.data.fullName).toBe('Candidate Beta');
  });

  it('a candidate cannot PATCH another candidate’s profile (403/404)', async () => {
    const rA = await request(app).get('/api/v1/candidates/profile').set('Cookie', candA.cookie);
    const r = await request(app).patch(`/api/v1/candidates/${rA.body.data.id}/profile`).set('Cookie', candB.cookie).send({ fullName: 'HACKED' });
    expect([403, 404]).toContain(r.status);
  });

  // ── Agent / job isolation (the multi-agency guard for the expand path) ─
  it('GET /jobs?mine=true is scoped to the calling agent', async () => {
    const rA = await request(app).get('/api/v1/jobs?mine=true').set('Cookie', agentA.cookie);
    const titles = (rA.body.data || []).map((j: any) => j.title);
    expect(titles).toContain('Iso Job A');
    expect(titles).not.toContain('Iso Job B');
  });

  it('agent A cannot modify agent B’s job (403/404) and B’s job is unchanged', async () => {
    const r = await request(app).put(`/api/v1/jobs/${jobBId}`).set('Cookie', agentA.cookie).send({ title: 'HACKED' });
    expect([403, 404]).toContain(r.status);
    const recheck = await request(app).get(`/api/v1/jobs/${jobBId}`).set('Cookie', agentB.cookie);
    expect(recheck.body.data.title).toBe('Iso Job B');
  });
});
