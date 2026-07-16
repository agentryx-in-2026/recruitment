import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import bcrypt from 'bcrypt';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { users, auditLog } from '../../shared/schema';
import { eq } from 'drizzle-orm';

let app: Express;

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  await truncateAllTables();
});

// Helper: create a user with a specific role and return an authenticated agent
async function createAndLogin(role: string, suffix = '1') {
  const db = getDb();
  const hashedPw = await bcrypt.hash('Test@1234', 10);
  await db.insert(users).values({
    username: `${role}_${suffix}`,
    email: `${role}${suffix}@hirestream.test`,
    password: hashedPw,
    role,
  });

  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({
    username: `${role}_${suffix}`,
    password: 'Test@1234',
  });
  return agent;
}

// ── GUARD: only superadmin may access ────────────────────────────────

describe('Super Admin guard', () => {
  it('rejects unauthenticated requests → 401', async () => {
    const res = await request(app).get('/api/v1/superadmin/users');
    expect(res.status).toBe(401);
  });

  it('rejects regular admin → 403', async () => {
    const agent = await createAndLogin('admin');
    const res = await agent.get('/api/v1/superadmin/users');
    expect(res.status).toBe(403);
  });

  it('rejects candidate → 403', async () => {
    const agent = await createAndLogin('candidate');
    const res = await agent.get('/api/v1/superadmin/users');
    expect(res.status).toBe(403);
  });

  it('allows superadmin → 200', async () => {
    const agent = await createAndLogin('superadmin');
    const res = await agent.get('/api/v1/superadmin/users');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ── USER MANAGEMENT ──────────────────────────────────────────────────

describe('GET /api/v1/superadmin/users', () => {
  it('returns all users with password fields stripped', async () => {
    const agent = await createAndLogin('superadmin');
    await createAndLogin('candidate', '2');
    await createAndLogin('agent', '3');

    const res = await agent.get('/api/v1/superadmin/users');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    for (const u of res.body.data) {
      expect(u.password).toBeUndefined();
      expect(u).toHaveProperty('id');
      expect(u).toHaveProperty('email');
      expect(u).toHaveProperty('role');
    }
  });

  it('filters by role query param', async () => {
    const agent = await createAndLogin('superadmin');
    await createAndLogin('candidate', '2');
    await createAndLogin('agent', '3');

    const res = await agent.get('/api/v1/superadmin/users?role=candidate');
    expect(res.status).toBe(200);
    expect(res.body.data.every((u: any) => u.role === 'candidate')).toBe(true);
  });
});

describe('POST /api/v1/superadmin/users', () => {
  it('creates a new admin user', async () => {
    const agent = await createAndLogin('superadmin');
    const res = await agent.post('/api/v1/superadmin/users').send({
      username: 'new_admin',
      email: 'newadmin@hirestream.test',
      password: 'Strong@Pass123',
      role: 'admin',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('new_admin');
    expect(res.body.data.role).toBe('admin');
    expect(res.body.data.password).toBeUndefined();
  });

  it('creates another superadmin', async () => {
    const agent = await createAndLogin('superadmin');
    const res = await agent.post('/api/v1/superadmin/users').send({
      username: 'super2',
      email: 'super2@hirestream.test',
      password: 'Strong@Pass123',
      role: 'superadmin',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('superadmin');
  });

  it('rejects invalid role → 400', async () => {
    const agent = await createAndLogin('superadmin');
    const res = await agent.post('/api/v1/superadmin/users').send({
      username: 'evil',
      email: 'evil@x.test',
      password: 'Strong@Pass123',
      role: 'godmode',
    });
    expect(res.status).toBe(400);
  });

  it('rejects missing fields → 400', async () => {
    const agent = await createAndLogin('superadmin');
    const res = await agent.post('/api/v1/superadmin/users').send({ username: 'incomplete' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/v1/superadmin/users/:id/role', () => {
  it('promotes a candidate to admin', async () => {
    const agent = await createAndLogin('superadmin');
    await createAndLogin('candidate', '2');

    const db = getDb();
    const [target] = await db.select().from(users).where(eq(users.username, 'candidate_2'));

    const res = await agent
      .patch(`/api/v1/superadmin/users/${target.id}/role`)
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('admin');
  });

  it('rejects invalid role → 400', async () => {
    const agent = await createAndLogin('superadmin');
    await createAndLogin('candidate', '2');
    const db = getDb();
    const [target] = await db.select().from(users).where(eq(users.username, 'candidate_2'));

    const res = await agent
      .patch(`/api/v1/superadmin/users/${target.id}/role`)
      .send({ role: 'kingofworld' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/v1/superadmin/users/:id/active', () => {
  it('disables a user', async () => {
    const agent = await createAndLogin('superadmin');
    await createAndLogin('candidate', '2');
    const db = getDb();
    const [target] = await db.select().from(users).where(eq(users.username, 'candidate_2'));

    const res = await agent
      .patch(`/api/v1/superadmin/users/${target.id}/active`)
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('rejects non-boolean isActive → 400', async () => {
    const agent = await createAndLogin('superadmin');
    await createAndLogin('candidate', '2');
    const db = getDb();
    const [target] = await db.select().from(users).where(eq(users.username, 'candidate_2'));

    const res = await agent
      .patch(`/api/v1/superadmin/users/${target.id}/active`)
      .send({ isActive: 'yes' });
    expect(res.status).toBe(400);
  });
});

// ── STATS ────────────────────────────────────────────────────────────

describe('GET /api/v1/superadmin/stats', () => {
  it('returns role distribution + system info', async () => {
    const agent = await createAndLogin('superadmin');
    await createAndLogin('candidate', '2');
    await createAndLogin('agent', '3');

    const res = await agent.get('/api/v1/superadmin/stats');
    expect(res.status).toBe(200);
    expect(res.body.data.totalUsers).toBeGreaterThanOrEqual(3);
    expect(res.body.data.byRole).toBeDefined();
    expect(res.body.data.byRole.candidate).toBeGreaterThanOrEqual(1);
    expect(res.body.data.byRole.superadmin).toBeGreaterThanOrEqual(1);
    expect(res.body.data).toHaveProperty('uptime');
    expect(res.body.data).toHaveProperty('nodeVersion');
  });
});

// ── DB RESET — confirmation guard ────────────────────────────────────

describe('POST /api/v1/superadmin/reset', () => {
  it('rejects without confirmation phrase → 400', async () => {
    const agent = await createAndLogin('superadmin');
    const res = await agent.post('/api/v1/superadmin/reset').send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/confirmation/i);
  });

  it('rejects wrong confirmation phrase → 400', async () => {
    const agent = await createAndLogin('superadmin');
    const res = await agent.post('/api/v1/superadmin/reset').send({ confirmation: 'wrong' });
    expect(res.status).toBe(400);
  });

  // Note: not testing actual reset execution — would wipe test DB mid-suite.
  // The endpoint exists and is gated correctly.
});

// ── AUDIT LOG — verify superadmin actions are logged ─────────────────

describe('Audit log on Super Admin actions', () => {
  // Audit middleware fires the insert async (.catch without await), so tests
  // that check the audit_log table need a small settle delay after the request.
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 200));

  it('logs user creation to audit_log table', async () => {
    const agent = await createAndLogin('superadmin');
    await agent.post('/api/v1/superadmin/users').send({
      username: 'audit_test_user',
      email: 'audit@hirestream.test',
      password: 'Strong@Pass123',
      role: 'admin',
    });
    await settle();

    const db = getDb();
    const logs = await db.select().from(auditLog);
    expect(logs.length).toBeGreaterThanOrEqual(1);
    const createLog = logs.find((l: any) => l.action === 'create' && l.resourceType === 'superadmin');
    expect(createLog).toBeDefined();
    expect(createLog!.userId).toBeDefined();
  });

  it('logs role change to audit_log', async () => {
    const agent = await createAndLogin('superadmin');
    await createAndLogin('candidate', '2');
    const db = getDb();
    const [target] = await db.select().from(users).where(eq(users.username, 'candidate_2'));

    await agent
      .patch(`/api/v1/superadmin/users/${target.id}/role`)
      .send({ role: 'admin' });
    await settle();

    const logs = await db.select().from(auditLog);
    const updateLog = logs.find((l: any) => l.action === 'update' && l.resourceType === 'superadmin');
    expect(updateLog).toBeDefined();
  });
});
