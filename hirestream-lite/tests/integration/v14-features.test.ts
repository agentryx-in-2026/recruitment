import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import { passport } from '../../server/config/passport.config';
import { sanitizeRequest } from '../../server/middleware/sanitize.middleware';
import authRouter from '../../server/routes/auth.routes';
import twoFaRouter from '../../server/routes/twofa.routes';
import agencyRouter from '../../server/routes/agency.routes';
import { errorHandler } from '../../server/middleware/errorHandler.middleware';
import { truncateAllTables, getDb } from '../helpers';
import { users, recruitmentAgents } from '../../shared/schema';

let app: express.Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(sanitizeRequest);
  app.use(session({
    secret: 'test-session-secret', resave: false, saveUninitialized: false,
    cookie: { secure: false },
  }));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/2fa', twoFaRouter);
  app.use('/api/v1/agencies', agencyRouter);
  app.use(errorHandler);
});

beforeEach(async () => {
  await truncateAllTables();
});

async function loginAs(role: string, suffix = '1') {
  const db = getDb();
  await db.insert(users).values({
    username: `${role}_${suffix}`,
    email: `${role}${suffix}@hirestream.test`,
    password: await bcrypt.hash('Test@1234', 10),
    role,
  });
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ username: `${role}_${suffix}`, password: 'Test@1234' });
  return agent;
}

// ── 2FA ──

describe('GET /api/v1/2fa/status', () => {
  it('rejects unauthenticated → 401', async () => {
    const res = await request(app).get('/api/v1/2fa/status');
    expect(res.status).toBe(401);
  });

  it('shows disabled by default', async () => {
    const agent = await loginAs('candidate');
    const res = await agent.get('/api/v1/2fa/status');
    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(false);
  });
});

describe('POST /api/v1/2fa/setup', () => {
  it('returns secret + QR code', async () => {
    const agent = await loginAs('candidate');
    const res = await agent.post('/api/v1/2fa/setup');
    expect(res.status).toBe(200);
    expect(res.body.data.secret).toMatch(/^[A-Z2-7]+$/);
    expect(res.body.data.qr_code).toMatch(/^data:image\/png;base64,/);
    expect(res.body.data.manual_entry_key).toBe(res.body.data.secret);
    expect(res.body.data.issuer).toBe('HireStream');
  });

  it('rejects if already enabled', async () => {
    const db = getDb();
    await db.insert(users).values({
      username: 'enabled_user',
      email: 'en@hirestream.test',
      password: await bcrypt.hash('Test@1234', 10),
      role: 'candidate',
      twoFactorEnabled: true,
      twoFactorSecret: 'JBSWY3DPEHPK3PXP',
    });
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ username: 'enabled_user', password: 'Test@1234' });

    const res = await agent.post('/api/v1/2fa/setup');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/2fa/verify-and-enable', () => {
  it('rejects without setup', async () => {
    const agent = await loginAs('candidate');
    const res = await agent.post('/api/v1/2fa/verify-and-enable').send({ token: '123456' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid token', async () => {
    const agent = await loginAs('candidate');
    await agent.post('/api/v1/2fa/setup');
    const res = await agent.post('/api/v1/2fa/verify-and-enable').send({ token: '000000' });
    expect(res.status).toBe(400);
  });

  it('rejects missing token', async () => {
    const agent = await loginAs('candidate');
    const res = await agent.post('/api/v1/2fa/verify-and-enable').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/2fa/disable', () => {
  it('rejects when 2FA not enabled', async () => {
    const agent = await loginAs('candidate');
    const res = await agent.post('/api/v1/2fa/disable').send({ token: '123456' });
    expect(res.status).toBe(400);
  });
});

// ── Agency Leaderboard ──

describe('GET /api/v1/agencies/leaderboard/top', () => {
  it('returns empty list when no verified agencies', async () => {
    const res = await request(app).get('/api/v1/agencies/leaderboard/top');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('ranks verified agencies by composite score (placements * 10 + rating * 5)', async () => {
    const db = getDb();

    // Create 3 agent users + agencies
    const [u1] = await db.insert(users).values({
      username: 'a1', email: 'a1@t.test',
      password: await bcrypt.hash('P', 10), role: 'agent',
    }).returning();
    const [u2] = await db.insert(users).values({
      username: 'a2', email: 'a2@t.test',
      password: await bcrypt.hash('P', 10), role: 'agent',
    }).returning();
    const [u3] = await db.insert(users).values({
      username: 'a3', email: 'a3@t.test',
      password: await bcrypt.hash('P', 10), role: 'agent',
    }).returning();

    await db.insert(recruitmentAgents).values([
      { userId: u1.id, agencyName: 'Top Agency', licenseNumber: 'L1', verified: true, placements: 100, rating: 5 },
      { userId: u2.id, agencyName: 'Mid Agency', licenseNumber: 'L2', verified: true, placements: 50, rating: 4 },
      { userId: u3.id, agencyName: 'Unverified Agency', licenseNumber: 'L3', verified: false, placements: 200, rating: 5 },
    ]);

    const res = await request(app).get('/api/v1/agencies/leaderboard/top');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2); // unverified excluded
    expect(res.body.data[0].agencyName).toBe('Top Agency');
    expect(res.body.data[0].rank).toBe(1);
    expect(res.body.data[1].rank).toBe(2);
    expect(res.body.data[0].score).toBeGreaterThan(res.body.data[1].score);
  });

  it('includes badges based on thresholds', async () => {
    const db = getDb();
    const [u] = await db.insert(users).values({
      username: 'top_placer', email: 'tp@t.test',
      password: await bcrypt.hash('P', 10), role: 'agent',
    }).returning();
    await db.insert(recruitmentAgents).values({
      userId: u.id, agencyName: 'Top Placer Agency', licenseNumber: 'TP1',
      verified: true, placements: 60, rating: 4,
    });

    const res = await request(app).get('/api/v1/agencies/leaderboard/top');
    expect(res.body.data[0].badges).toContain('top_placer');
  });
});
