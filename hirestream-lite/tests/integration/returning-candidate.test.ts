/**
 * The RETURNING candidate — the journey, not the feature.
 *
 * Every other suite here tests a feature in isolation on a fresh actor. This
 * one walks a single candidate through the whole arc: register, fill the form,
 * submit, leave, sign back in, and open the form again. That second visit is
 * where this project keeps breaking, and no amount of per-feature coverage
 * caught any of it:
 *
 *  · `profileComplete` was stripped from updateCandidateSchema by the
 *    mass-assignment fix and set by no route afterwards, so a candidate who
 *    finished the form was redirected back into it. Forever. Green suite.
 *  · The review page counted itself complete only while the cursor was on it,
 *    so a returning candidate saw "90% · Review 0%" and had to submit again.
 *  · Education came back blank on a second visit and the save then wrote those
 *    blanks over the real answers.
 *
 * All three were invisible because the seeded cast had profileComplete written
 * straight into the database — the demo data hid the bug from the demo. So the
 * assertions below deliberately use a candidate built THROUGH THE API, exactly
 * as the form builds one.
 */
import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { recruitmentAgents, candidates, users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

let app: Express;
let cookie: string[];
let email: string;

const fillTheForm = async () => {
  // Page 1
  await request(app).patch('/api/v1/candidates/profile').set('Cookie', cookie)
    .send({ fullName: 'Returning Candidate', email, phone: '9876543210', location: 'Shimla, Himachal Pradesh',
            dateOfBirth: '1994-05-05', sex: 'male', homeTown: 'Rampur',
            permanentAddressLine1: 'Ward 4', permanentDistrict: 'Shimla',
            permanentState: 'Himachal Pradesh', permanentPinCode: '172001' });
  // Page 2
  const profRes = await request(app).put('/api/v1/professions/mine').set('Cookie', cookie)
    .send({ professions: [{ professionKey: 'mason', experienceMonths: 48, specificSkills: [], addonData: {} }] });
  if (profRes.status >= 400) throw new Error(`professions save failed: ${profRes.status} ${JSON.stringify(profRes.body).slice(0,200)}`);
  await request(app).post('/api/v1/candidates/languages').set('Cookie', cookie)
    .send({ language: 'Hindi', proficiency: 'native', writtenProficiency: 'intermediate' });
  // Page 3
  await request(app).post('/api/v1/candidates/education').set('Cookie', cookie)
    .send({ degree: '10th pass', type: 'school', board: 'HPBOSE', institution: 'Govt High School', year: 2010, isPassed: true });
  await request(app).post('/api/v1/candidates/experience').set('Cookie', cookie)
    .send({ company: 'Local contractor', role: 'Mason', years: 4 });
  // Page 4 — what the Submit button sends
  return request(app).patch('/api/v1/candidates/profile').set('Cookie', cookie).send({ profileComplete: true });
};

beforeAll(async () => { app = createTestApp(); });

beforeEach(async () => {
  await truncateAllTables();
  const db = getDb();
  email = 'returning@test.com';

  const agentReg = await request(app).post('/api/v1/auth/register')
    .send({ email: 'agent-rc@test.com', password: 'Test@123', role: 'agent' });
  const agentCookie = agentReg.headers['set-cookie'] as unknown as string[];
  await request(app).post('/api/v1/agencies/register').set('Cookie', agentCookie)
    .send({ agencyName: 'HPSEDC', licenseNumber: 'LIC-RC', specializations: ['Construction'] });
  await db.update(recruitmentAgents).set({ verified: true })
    .where(eq(recruitmentAgents.userId, agentReg.body.data.id));

  const reg = await request(app).post('/api/v1/auth/register')
    .send({ email, password: 'Test@123', role: 'candidate' });
  cookie = reg.headers['set-cookie'] as unknown as string[];
});

describe('A candidate who comes back', () => {
  it('is NOT complete before filling the form', async () => {
    const r = await request(app).get('/api/v1/candidates/profile').set('Cookie', cookie);
    expect(Boolean(r.body?.data?.profileComplete)).toBe(false);
  });

  it('IS complete after finishing it — the flag the redirect reads must actually flip', async () => {
    await fillTheForm();
    const r = await request(app).get('/api/v1/candidates/profile').set('Cookie', cookie);
    // If this fails, every new candidate is trapped in a redirect loop between
    // the dashboard and the form, and no feature test will tell you.
    expect(r.body?.data?.profileComplete).toBe(true);
  });

  it('is still complete after signing out and back in', async () => {
    await fillTheForm();
    await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    const login = await request(app).post('/api/v1/auth/login')
      .send({ username: email, password: 'Test@123' });
    expect(login.status).toBe(200);
    const fresh = login.headers['set-cookie'] as unknown as string[];
    const r = await request(app).get('/api/v1/candidates/profile').set('Cookie', fresh);
    expect(r.body?.data?.profileComplete).toBe(true);
  });

  it('reports 100% completion — the number the form shows the candidate', async () => {
    await fillTheForm();
    const r = await request(app).get('/api/v1/candidates/profile/completion').set('Cookie', cookie);
    if (r.body?.data?.percentage !== 100) {
      throw new Error(`completion ${r.body?.data?.percentage}% missing=${JSON.stringify(r.body?.data?.missing)} checks=${JSON.stringify(r.body?.data?.checks)}`);
    }
    expect(r.body?.data?.percentage).toBe(100);
  });

  it('still has its answers on the second visit — nothing comes back blank', async () => {
    await fillTheForm();
    const [edu, langs, profs] = await Promise.all([
      request(app).get('/api/v1/candidates/education').set('Cookie', cookie),
      request(app).get('/api/v1/candidates/languages').set('Cookie', cookie),
      request(app).get('/api/v1/professions/mine').set('Cookie', cookie),
    ]);
    // Education used not to be fetched by the form at all, so these values came
    // back empty and the next save wrote the blanks over them.
    expect(edu.body?.data?.[0]?.institution).toBe('Govt High School');
    expect(edu.body?.data?.[0]?.year).toBe(2010);
    expect(langs.body?.data?.[0]?.proficiency).toBe('native');
    expect(langs.body?.data?.[0]?.writtenProficiency).toBe('intermediate');
    expect(profs.body?.data?.[0]?.professionKey).toBe('mason');
  });

  it('editing after submission does not un-complete the profile', async () => {
    await fillTheForm();
    await request(app).patch('/api/v1/candidates/profile').set('Cookie', cookie)
      .send({ homeTown: 'Rampur Bushahr' });
    const r = await request(app).get('/api/v1/candidates/profile').set('Cookie', cookie);
    expect(r.body?.data?.profileComplete).toBe(true);
    expect(r.body?.data?.homeTown).toBe('Rampur Bushahr');
  });

  it('a candidate who loses a required answer stops being complete', async () => {
    await fillTheForm();
    const db = getDb();
    const [c] = await db.select().from(candidates).where(eq(candidates.email, email));
    // Staff clearing a field must be reflected, not papered over — the flag is
    // computed, not a sticky bit.
    await db.update(candidates).set({ phone: null }).where(eq(candidates.id, c.id));
    await request(app).patch('/api/v1/candidates/profile').set('Cookie', cookie).send({ homeTown: 'Rampur' });
    const r = await request(app).get('/api/v1/candidates/profile').set('Cookie', cookie);
    expect(r.body?.data?.profileComplete).toBe(false);
  });
});
