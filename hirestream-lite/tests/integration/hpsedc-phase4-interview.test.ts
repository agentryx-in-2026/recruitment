/**
 * Phase 4 — Candidate interview workflow (v0.4.34).
 *
 * Coverage:
 *  - GET /api/v1/me/interviews/:id returns interview details for owning candidate
 *  - POST confirm flips status to "confirmed" + notifies agent
 *  - POST reschedule validates reason length + future-only proposedAt + notifies agent
 *  - POST decline requires reason + flips status + notifies agent
 *  - Non-owning candidate cannot operate on someone else's interview
 *  - Agent's /jobs/:id/applicants response includes interview.candidateConfirmedStatus
 *  - .ics download still works after the workflow additions (regression)
 */
import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { sql } from 'drizzle-orm';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { interviews, applications, jobs as jobsTable, candidates, recruitmentAgents, placements, users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

let app: Express;
let agentCookie: string[];
let agentUserId: string;
let candidateCookie: string[];
let candidateUserId: string;
let candidateId: string;
let jobId: string;
let applicationId: string;
let interviewId: string;

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  await truncateAllTables();
  const db = getDb();

  const aReg = await request(app).post('/api/v1/auth/register').send({ email: 'ag.iv@test.com', password: 'Test@123', role: 'agent' });
  agentCookie = aReg.headers['set-cookie'] as unknown as string[];
  agentUserId = aReg.body.data.id;
  await request(app).post('/api/v1/agencies/register').set('Cookie', agentCookie)
    .send({ agencyName: 'IV Agency', licenseNumber: 'LIC-IV', specializations: ['IT'] });
  await db.execute(sql`UPDATE recruitment_agents SET verified = true WHERE user_id = ${agentUserId}`);

  const cReg = await request(app).post('/api/v1/auth/register').send({ email: 'cand.iv@test.com', password: 'Test@123', role: 'candidate' });
  candidateCookie = cReg.headers['set-cookie'] as unknown as string[];
  candidateUserId = cReg.body.data.id;
  await request(app).patch('/api/v1/candidates/profile').set('Cookie', candidateCookie)
    .send({ fullName: 'Interview Cand', email: 'cand.iv@test.com', skills: ['React'], experience: 3 });
  const cRow = (await db.execute(sql`SELECT id FROM candidates WHERE user_id = ${candidateUserId}`) as any).rows?.[0]
    ?? (await db.execute(sql`SELECT id FROM candidates WHERE user_id = ${candidateUserId}`) as any)[0];
  candidateId = cRow.id;

  const jobRes = await request(app).post('/api/v1/jobs').set('Cookie', agentCookie).send({
    title: 'Senior Engineer', company: 'TestCo', location: 'Toronto', country: 'Canada',
    skills: ['React'], experience: 2, category: 'it', description: 'Build stuff',
  });
  jobId = jobRes.body.data.id;

  const applyRes = await request(app).post(`/api/v1/jobs/${jobId}/apply`).set('Cookie', candidateCookie);
  applicationId = applyRes.body.data.id;

  // Insert an interview row directly — simulates what the agent's
  // "Schedule Interview" modal does. Schedule a week out so it counts
  // as future.
  const future = new Date(Date.now() + 7 * 86400 * 1000);
  const ivIns = await db.insert(interviews).values({
    applicationId,
    scheduledAt: future,
    mode: 'virtual',
    location: 'Zoom call',
    meetingLink: 'https://zoom.us/j/abc',
    interviewerName: 'Sarah Recruiter',
  }).returning();
  interviewId = ivIns[0].id;

  // Move application status to interview_scheduled
  await db.update(applications).set({ status: 'interview_scheduled' }).where(eq(applications.id, applicationId));
});

describe('Phase 4 — GET /api/v1/me/interviews/:id', () => {
  it('returns the interview for the owning candidate', async () => {
    const r = await request(app).get(`/api/v1/me/interviews/${interviewId}`).set('Cookie', candidateCookie);
    expect(r.status).toBe(200);
    expect(r.body.data.id).toBe(interviewId);
    expect(r.body.data.interviewerName).toBe('Sarah Recruiter');
    expect(r.body.data.meetingLink).toBe('https://zoom.us/j/abc');
  });

  it('a different candidate cannot fetch this interview', async () => {
    const otherReg = await request(app).post('/api/v1/auth/register').send({ email: 'other@test.com', password: 'Test@123', role: 'candidate' });
    const otherCookie = otherReg.headers['set-cookie'] as unknown as string[];
    await request(app).patch('/api/v1/candidates/profile').set('Cookie', otherCookie)
      .send({ fullName: 'Other', email: 'other@test.com' });
    const r = await request(app).get(`/api/v1/me/interviews/${interviewId}`).set('Cookie', otherCookie);
    expect(r.status).toBe(404);
  });
});

describe('Phase 4 — confirm / reschedule / decline', () => {
  it('POST confirm sets candidateConfirmedStatus and writes notification for agent', async () => {
    const r = await request(app).post(`/api/v1/me/interviews/${interviewId}/confirm`).set('Cookie', candidateCookie);
    expect(r.status).toBe(200);
    expect(r.body.data.candidateConfirmedStatus).toBe('confirmed');
    expect(r.body.data.candidateConfirmedAt).toBeTruthy();

    const notifs = await request(app).get('/api/v1/notifications').set('Cookie', agentCookie);
    expect(notifs.status).toBe(200);
    const titles = (notifs.body.data as any[]).map((n) => String(n.title));
    expect(titles.some((t) => t.includes('confirmed interview'))).toBe(true);
  });

  it('POST reschedule requires a reason (min 5 chars)', async () => {
    const r1 = await request(app).post(`/api/v1/me/interviews/${interviewId}/reschedule`)
      .set('Cookie', candidateCookie).send({ reason: 'ok' });
    expect(r1.status).toBe(400);

    const r2 = await request(app).post(`/api/v1/me/interviews/${interviewId}/reschedule`)
      .set('Cookie', candidateCookie).send({ reason: 'Visa appointment that day' });
    expect(r2.status).toBe(200);
    expect(r2.body.data.candidateConfirmedStatus).toBe('reschedule_requested');
    expect(r2.body.data.candidateRescheduleReason).toMatch(/Visa/);
  });

  it('POST reschedule rejects past proposedAt', async () => {
    const past = new Date(Date.now() - 86400 * 1000).toISOString();
    const r = await request(app).post(`/api/v1/me/interviews/${interviewId}/reschedule`)
      .set('Cookie', candidateCookie).send({ reason: 'Need different date', proposedAt: past });
    expect(r.status).toBe(400);
  });

  it('POST decline requires a reason and flips status', async () => {
    const r = await request(app).post(`/api/v1/me/interviews/${interviewId}/decline`)
      .set('Cookie', candidateCookie).send({ reason: 'Accepted another offer at a different company' });
    expect(r.status).toBe(200);
    expect(r.body.data.candidateConfirmedStatus).toBe('declined');
    expect(r.body.data.candidateDeclineReason).toMatch(/Accepted/);

    const notifs = await request(app).get('/api/v1/notifications').set('Cookie', agentCookie);
    const titles = (notifs.body.data as any[]).map((n) => String(n.title));
    expect(titles.some((t) => t.includes('declined interview'))).toBe(true);
  });
});

describe('Phase 4 — agent applicants endpoint surfaces interview status', () => {
  it('GET /jobs/:id/applicants includes interview.candidateConfirmedStatus after candidate confirms', async () => {
    await request(app).post(`/api/v1/me/interviews/${interviewId}/confirm`).set('Cookie', candidateCookie);
    const r = await request(app).get(`/api/v1/jobs/${jobId}/applicants`).set('Cookie', agentCookie);
    expect(r.status).toBe(200);
    const row = (r.body.data as any[]).find((a) => a.applicationId === applicationId);
    expect(row.interview).toBeDefined();
    expect(row.interview.candidateConfirmedStatus).toBe('confirmed');
    expect(row.interview.interviewerName).toBe('Sarah Recruiter');
  });

  it('agent sees reschedule reason after candidate requests one', async () => {
    await request(app).post(`/api/v1/me/interviews/${interviewId}/reschedule`)
      .set('Cookie', candidateCookie).send({ reason: 'Doctor appointment that morning' });
    const r = await request(app).get(`/api/v1/jobs/${jobId}/applicants`).set('Cookie', agentCookie);
    const row = (r.body.data as any[]).find((a) => a.applicationId === applicationId);
    expect(row.interview.candidateConfirmedStatus).toBe('reschedule_requested');
    expect(row.interview.candidateRescheduleReason).toMatch(/Doctor/);
  });
});

describe('Phase 4 — .ics export regression', () => {
  it('GET /api/v1/me/interviews/:id.ics returns valid calendar content', async () => {
    const r = await request(app).get(`/api/v1/me/interviews/${interviewId}.ics`).set('Cookie', candidateCookie);
    expect(r.status).toBe(200);
    expect(String(r.headers['content-type'] || '')).toMatch(/text\/calendar/);
    const body = String(r.text);
    expect(body).toMatch(/BEGIN:VCALENDAR/);
    expect(body).toMatch(/SUMMARY:Interview/);
    expect(body).toMatch(/END:VCALENDAR/);
  });
});

// v0.4.37 — agent responds to the candidate's reschedule request.
describe('Phase 4 — agent reschedule response', () => {
  async function requestReschedule(proposedAt?: string) {
    return request(app).post(`/api/v1/me/interviews/${interviewId}/reschedule`)
      .set('Cookie', candidateCookie)
      .send({ reason: 'Visa appointment that morning', proposedAt });
  }

  it('accept_proposed moves the interview to the candidate proposed time + clears the request + notifies candidate', async () => {
    const proposed = new Date(Date.now() + 10 * 86400000).toISOString();
    await requestReschedule(proposed);

    const r = await request(app).post(`/api/v1/agent/interviews/${interviewId}/respond-reschedule`)
      .set('Cookie', agentCookie).send({ action: 'accept_proposed' });
    expect(r.status).toBe(200);
    expect(r.body.data.candidateConfirmedStatus).toBeNull();
    // scheduledAt now equals the proposed time (to the minute)
    expect(new Date(r.body.data.scheduledAt).toISOString().slice(0, 16)).toBe(proposed.slice(0, 16));

    const notifs = await request(app).get('/api/v1/notifications').set('Cookie', candidateCookie);
    const titles = (notifs.body.data as any[]).map((n) => String(n.title));
    expect(titles).toContain('Interview rescheduled');
  });

  it('set_time reschedules to an agent-chosen future time', async () => {
    await requestReschedule();
    const newTime = new Date(Date.now() + 20 * 86400000).toISOString();
    const r = await request(app).post(`/api/v1/agent/interviews/${interviewId}/respond-reschedule`)
      .set('Cookie', agentCookie).send({ action: 'set_time', newTime });
    expect(r.status).toBe(200);
    expect(new Date(r.body.data.scheduledAt).toISOString().slice(0, 16)).toBe(newTime.slice(0, 16));
    expect(r.body.data.candidateConfirmedStatus).toBeNull();
  });

  it('set_time rejects a past time', async () => {
    await requestReschedule();
    const r = await request(app).post(`/api/v1/agent/interviews/${interviewId}/respond-reschedule`)
      .set('Cookie', agentCookie).send({ action: 'set_time', newTime: new Date(Date.now() - 86400000).toISOString() });
    expect(r.status).toBe(400);
  });

  it('keep_original clears the request but keeps the time', async () => {
    const before = await request(app).get(`/api/v1/me/interviews/${interviewId}`).set('Cookie', candidateCookie);
    const originalTime = before.body.data.scheduledAt;
    await requestReschedule();
    const r = await request(app).post(`/api/v1/agent/interviews/${interviewId}/respond-reschedule`)
      .set('Cookie', agentCookie).send({ action: 'keep_original' });
    expect(r.status).toBe(200);
    expect(r.body.data.candidateConfirmedStatus).toBeNull();
    expect(new Date(r.body.data.scheduledAt).toISOString()).toBe(new Date(originalTime).toISOString());
  });

  it('a different agent cannot respond (IDOR guard)', async () => {
    await requestReschedule();
    // Register a second agent who does not own this job
    const otherReg = await request(app).post('/api/v1/auth/register').send({ email: 'other-ag@test.com', password: 'Test@123', role: 'agent' });
    const otherCookie = otherReg.headers['set-cookie'] as unknown as string[];
    const db = getDb();
    await request(app).post('/api/v1/agencies/register').set('Cookie', otherCookie)
      .send({ agencyName: 'Other Agency', licenseNumber: 'LIC-OTHER', specializations: ['IT'] });
    await db.execute(sql`UPDATE recruitment_agents SET verified = true WHERE user_id = ${otherReg.body.data.id}`);
    const r = await request(app).post(`/api/v1/agent/interviews/${interviewId}/respond-reschedule`)
      .set('Cookie', otherCookie).send({ action: 'keep_original' });
    expect(r.status).toBe(403);
  });

  it('aggregate /agent/applicants exposes the interview reschedule status', async () => {
    await requestReschedule();
    const r = await request(app).get('/api/v1/agent/applicants').set('Cookie', agentCookie);
    expect(r.status).toBe(200);
    const row = (r.body.data as any[]).find((a) => a.applicationId === applicationId);
    expect(row.interview?.candidateConfirmedStatus).toBe('reschedule_requested');
  });
});

describe('Phase 4 — agent visa/passport status (placement)', () => {
  let placementId: string;

  beforeEach(async () => {
    const db = getDb();
    await db.update(applications).set({ status: 'placed' }).where(eq(applications.id, applicationId));
    const pIns = await db.insert(placements).values({ applicationId, country: 'Canada' }).returning();
    placementId = pIns[0].id;
  });

  it('agent updates visa status, candidate is notified', async () => {
    const r = await request(app).patch(`/api/v1/agent/placements/${placementId}/visa-status`)
      .set('Cookie', agentCookie).send({ visaStatus: 'applied', note: 'Embassy appt 12 June' });
    expect(r.status).toBe(200);
    expect(r.body.data.visaStatus).toBe('applied');

    const notifs = await request(app).get('/api/v1/notifications').set('Cookie', candidateCookie);
    const titles = (notifs.body.data as any[]).map((n) => String(n.title));
    expect(titles.some((t) => t.startsWith('Visa status'))).toBe(true);
  });

  it('rejects an invalid visa status', async () => {
    const r = await request(app).patch(`/api/v1/agent/placements/${placementId}/visa-status`)
      .set('Cookie', agentCookie).send({ visaStatus: 'maybe' });
    expect(r.status).toBe(400);
  });

  it('a different agent cannot update the visa status (IDOR guard)', async () => {
    const otherReg = await request(app).post('/api/v1/auth/register').send({ email: 'other-visa@test.com', password: 'Test@123', role: 'agent' });
    const otherCookie = otherReg.headers['set-cookie'] as unknown as string[];
    const db = getDb();
    await request(app).post('/api/v1/agencies/register').set('Cookie', otherCookie)
      .send({ agencyName: 'Other Visa Agency', licenseNumber: 'LIC-VISA-OTHER', specializations: ['IT'] });
    await db.execute(sql`UPDATE recruitment_agents SET verified = true WHERE user_id = ${otherReg.body.data.id}`);
    const r = await request(app).patch(`/api/v1/agent/placements/${placementId}/visa-status`)
      .set('Cookie', otherCookie).send({ visaStatus: 'approved' });
    expect(r.status).toBe(403);
  });

  it('candidate-detail endpoint surfaces placementId + visaStatus for the placed application', async () => {
    await request(app).patch(`/api/v1/agent/placements/${placementId}/visa-status`)
      .set('Cookie', agentCookie).send({ visaStatus: 'approved' });
    const r = await request(app).get(`/api/v1/agencies/candidates/${candidateId}`).set('Cookie', agentCookie);
    expect(r.status).toBe(200);
    const placedApp = (r.body.data.applications as any[]).find((a) => a.id === applicationId);
    expect(placedApp.placementId).toBe(placementId);
    expect(placedApp.visaStatus).toBe('approved');
  });

  it('records a history entry per change and surfaces it newest-first with the note', async () => {
    await request(app).patch(`/api/v1/agent/placements/${placementId}/visa-status`)
      .set('Cookie', agentCookie).send({ visaStatus: 'applied', note: 'Lodged at VFS' });
    await request(app).patch(`/api/v1/agent/placements/${placementId}/visa-status`)
      .set('Cookie', agentCookie).send({ visaStatus: 'approved', note: 'Stamped' });
    const r = await request(app).get(`/api/v1/agencies/candidates/${candidateId}`).set('Cookie', agentCookie);
    const placedApp = (r.body.data.applications as any[]).find((a) => a.id === applicationId);
    expect(placedApp.visaHistory.length).toBe(2);
    // newest first
    expect(placedApp.visaHistory[0].visaStatus).toBe('approved');
    expect(placedApp.visaHistory[0].note).toBe('Stamped');
    expect(placedApp.visaHistory[1].visaStatus).toBe('applied');
  });

  it('surfaces recorded welfare check-ins on the candidate-detail placement', async () => {
    await request(app).patch(`/api/v1/agent/placements/${placementId}/welfare`)
      .set('Cookie', agentCookie).send({ milestone: '30', status: 'ok', notes: 'Settled in well' });
    const r = await request(app).get(`/api/v1/agencies/candidates/${candidateId}`).set('Cookie', agentCookie);
    const placedApp = (r.body.data.applications as any[]).find((a) => a.id === applicationId);
    expect(placedApp.welfare.d30.status).toBe('ok');
    expect(placedApp.welfare.d30.notes).toBe('Settled in well');
    expect(placedApp.welfare.d60.status).toBeNull();
  });

  it('agent sets start date + appointment letter, candidate-detail surfaces them', async () => {
    const dateRes = await request(app).patch(`/api/v1/agent/placements/${placementId}`)
      .set('Cookie', agentCookie).send({ startDate: '2027-01-15' });
    expect(dateRes.status).toBe(200);
    const letterRes = await request(app).patch(`/api/v1/agent/placements/${placementId}/appointment-letter`)
      .set('Cookie', agentCookie).send({ appointmentLetterUrl: 'https://example.com/letter.pdf' });
    expect(letterRes.status).toBe(200);

    const r = await request(app).get(`/api/v1/agencies/candidates/${candidateId}`).set('Cookie', agentCookie);
    const placedApp = (r.body.data.applications as any[]).find((a) => a.id === applicationId);
    expect(placedApp.appointmentLetterUrl).toBe('https://example.com/letter.pdf');
    expect(placedApp.startDate).toBeTruthy();
  });

  it('a different agent cannot set the appointment letter (IDOR guard)', async () => {
    const otherReg = await request(app).post('/api/v1/auth/register').send({ email: 'other-letter@test.com', password: 'Test@123', role: 'agent' });
    const otherCookie = otherReg.headers['set-cookie'] as unknown as string[];
    const db = getDb();
    await request(app).post('/api/v1/agencies/register').set('Cookie', otherCookie)
      .send({ agencyName: 'Other Letter Agency', licenseNumber: 'LIC-LETTER-OTHER', specializations: ['IT'] });
    await db.execute(sql`UPDATE recruitment_agents SET verified = true WHERE user_id = ${otherReg.body.data.id}`);
    const r = await request(app).patch(`/api/v1/agent/placements/${placementId}/appointment-letter`)
      .set('Cookie', otherCookie).send({ appointmentLetterUrl: 'https://evil.example.com/x.pdf' });
    expect(r.status).toBe(403);
  });

  it('agent uploads a signed appointment-letter file; candidate can download it', async () => {
    const up = await request(app).post(`/api/v1/agent/placements/${placementId}/appointment-letter-file`)
      .set('Cookie', agentCookie)
      .attach('file', Buffer.from('%PDF-1.4 signed letter'), { filename: 'letter.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    expect(up.body.data.appointmentLetterUrl).toMatch(/^\/uploads\/hs\/placements\/docs\//);

    const dl = await request(app).get(`/api/v1/me/placements/${placementId}/appointment-letter`).set('Cookie', candidateCookie);
    expect(dl.status).toBe(200);
  });

  it('a different agent cannot upload an appointment-letter file (IDOR guard)', async () => {
    const otherReg = await request(app).post('/api/v1/auth/register').send({ email: 'other-file@test.com', password: 'Test@123', role: 'agent' });
    const otherCookie = otherReg.headers['set-cookie'] as unknown as string[];
    const db = getDb();
    await request(app).post('/api/v1/agencies/register').set('Cookie', otherCookie)
      .send({ agencyName: 'Other File Agency', licenseNumber: 'LIC-FILE-OTHER', specializations: ['IT'] });
    await db.execute(sql`UPDATE recruitment_agents SET verified = true WHERE user_id = ${otherReg.body.data.id}`);
    const r = await request(app).post(`/api/v1/agent/placements/${placementId}/appointment-letter-file`)
      .set('Cookie', otherCookie)
      .attach('file', Buffer.from('%PDF-1.4 x'), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(403);
  });
});

describe('Phase 2 — deployment phase (candidate tracker + HPSEDC oversight)', () => {
  let placementId: string;

  beforeEach(async () => {
    const db = getDb();
    await db.update(applications).set({ status: 'placed' }).where(eq(applications.id, applicationId));
    // status accepted = "deployed" → counted by compliance + welfare SLA. No
    // startDate on purpose, to exercise the welfare-SLA fallback.
    const pIns = await db.insert(placements).values({ applicationId, country: 'Canada', status: 'accepted' }).returning();
    placementId = pIns[0].id;
  });

  it('candidate gets their pre-departure dossier (checklist + visa + welfare)', async () => {
    const r = await request(app).get(`/api/v1/me/placements/${placementId}/deployment`).set('Cookie', candidateCookie);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data.checklist)).toBe(true);
    expect(r.body.data.checklist.length).toBeGreaterThanOrEqual(8);
    expect(r.body.data.summary).toHaveProperty('done');
    expect(r.body.data.summary).toHaveProperty('total');
    expect(r.body.data.visa).toHaveProperty('status');
    expect(r.body.data.welfare).toHaveProperty('d30');
  });

  it("another candidate cannot read someone else's deployment dossier", async () => {
    const otherReg = await request(app).post('/api/v1/auth/register').send({ email: 'other-cand@test.com', password: 'Test@123', role: 'candidate' });
    const otherCookie = otherReg.headers['set-cookie'] as unknown as string[];
    const r = await request(app).get(`/api/v1/me/placements/${placementId}/deployment`).set('Cookie', otherCookie);
    expect(r.status).toBe(404);
  });

  it('the checklist reflects an approved visa', async () => {
    await request(app).patch(`/api/v1/agent/placements/${placementId}/visa-status`)
      .set('Cookie', agentCookie).send({ visaStatus: 'approved' });
    const r = await request(app).get(`/api/v1/me/placements/${placementId}/deployment`).set('Cookie', candidateCookie);
    const visaItem = (r.body.data.checklist as any[]).find((i) => i.key === 'visa');
    expect(visaItem.status).toBe('done');
  });

  it('HPSEDC compliance shows the visa pipeline + flags placed-without-approved-visa', async () => {
    const db = getDb();
    const admReg = await request(app).post('/api/v1/auth/register').send({ email: 'adm-dep@test.com', password: 'Test@123', role: 'candidate' });
    const admCookie = admReg.headers['set-cookie'] as unknown as string[];
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, admReg.body.data.id));

    await request(app).patch(`/api/v1/agent/placements/${placementId}/visa-status`)
      .set('Cookie', agentCookie).send({ visaStatus: 'applied' });

    const r = await request(app).get('/api/v1/admin/oversight/compliance').set('Cookie', admCookie);
    expect(r.status).toBe(200);
    expect(r.body.data.visa.counts.applied).toBeGreaterThanOrEqual(1);
    // visa is "applied", not "approved" → flagged
    const flagged = (r.body.data.riskFlags.placedVisaNotApproved as any[]).some((x) => x.placementId === placementId);
    expect(flagged).toBe(true);
  });

  it('welfare SLA no longer drops placements with no start date', async () => {
    const db = getDb();
    const admReg = await request(app).post('/api/v1/auth/register').send({ email: 'adm-sla@test.com', password: 'Test@123', role: 'candidate' });
    const admCookie = admReg.headers['set-cookie'] as unknown as string[];
    await db.update(users).set({ role: 'admin' }).where(eq(users.id, admReg.body.data.id));

    const r = await request(app).get('/api/v1/admin/oversight/welfare-sla').set('Cookie', admCookie);
    expect(r.status).toBe(200);
    const listed = (r.body.data.missingStartDate as any[]).some((x) => x.placementId === placementId);
    expect(listed).toBe(true);
  });
});
