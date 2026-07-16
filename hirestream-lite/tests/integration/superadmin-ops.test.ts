import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import bcrypt from 'bcrypt';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { users } from '../../shared/schema';

let app: Express;

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  await truncateAllTables();
});

async function loginSA() {
  const db = getDb();
  await db.insert(users).values({
    username: 'sa_ops',
    email: 'sa_ops@hirestream.test',
    password: await bcrypt.hash('Test@1234', 10),
    role: 'superadmin',
  });
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ username: 'sa_ops', password: 'Test@1234' });
  return agent;
}

describe('GET /api/v1/superadmin/ops/overview', () => {
  it('rejects non-superadmin → 403', async () => {
    const db = getDb();
    await db.insert(users).values({
      username: 'adm_ops', email: 'a@t.test',
      password: await bcrypt.hash('Test@1234', 10), role: 'admin',
    });
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ username: 'adm_ops', password: 'Test@1234' });
    const res = await agent.get('/api/v1/superadmin/ops/overview');
    expect(res.status).toBe(403);
  });

  it('returns health, process, memory, dependencies', async () => {
    const agent = await loginSA();
    const res = await agent.get('/api/v1/superadmin/ops/overview');
    expect(res.status).toBe(200);
    expect(res.body.data.health).toBeDefined();
    expect(res.body.data.health.score).toBeGreaterThanOrEqual(0);
    expect(res.body.data.health.score).toBeLessThanOrEqual(100);
    expect(res.body.data.process).toBeDefined();
    expect(res.body.data.process.pid).toBeGreaterThan(0);
    expect(res.body.data.memory.heap_used_mb).toBeGreaterThan(0);
    expect(res.body.data.dependencies.database).toBeDefined();
  });

  it('alerts contain top entries', async () => {
    const agent = await loginSA();
    const res = await agent.get('/api/v1/superadmin/ops/overview');
    expect(res.body.data.alerts).toBeDefined();
    expect(Array.isArray(res.body.data.alerts.top)).toBe(true);
  });
});

describe('GET /api/v1/superadmin/ops/signals', () => {
  it('returns signals list with summary counts', async () => {
    const agent = await loginSA();
    const res = await agent.get('/api/v1/superadmin/ops/signals');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.summary).toBeDefined();
    expect(typeof res.body.summary.total).toBe('number');
  });

  it('signals have required fields', async () => {
    const agent = await loginSA();
    const res = await agent.get('/api/v1/superadmin/ops/signals');
    res.body.data.forEach((s: any) => {
      expect(s).toHaveProperty('id');
      expect(s).toHaveProperty('severity');
      expect(s).toHaveProperty('title');
      expect(['critical', 'warning', 'info']).toContain(s.severity);
    });
  });
});

describe('GET /api/v1/superadmin/ops/pipeline', () => {
  it('returns 7-stage pipeline', async () => {
    const agent = await loginSA();
    const res = await agent.get('/api/v1/superadmin/ops/pipeline');
    expect(res.status).toBe(200);
    expect(res.body.data.stages.length).toBe(7);
    expect(res.body.data.stages[0].name).toBe('Registered');
    expect(res.body.data.stages[6].name).toBe('Placed');
  });

  it('first stage has no conversion rate', async () => {
    const agent = await loginSA();
    const res = await agent.get('/api/v1/superadmin/ops/pipeline');
    expect(res.body.data.stages[0].conversion).toBe(null);
  });
});

describe('GET /api/v1/superadmin/ops/lookup', () => {
  it('returns empty when query too short', async () => {
    const agent = await loginSA();
    const res = await agent.get('/api/v1/superadmin/ops/lookup?q=a');
    expect(res.status).toBe(200);
    expect(res.body.data.users).toEqual([]);
  });

  it('finds user by username', async () => {
    const agent = await loginSA();
    const db = getDb();
    await db.insert(users).values({
      username: 'lookup_target',
      email: 'lookup@hirestream.test',
      password: await bcrypt.hash('Test@1234', 10),
      role: 'candidate',
    });
    const res = await agent.get('/api/v1/superadmin/ops/lookup?q=lookup');
    expect(res.status).toBe(200);
    expect(res.body.data.users.length).toBeGreaterThan(0);
    expect(res.body.data.users[0].username).toContain('lookup');
  });

  it('strips passwords from user results', async () => {
    const agent = await loginSA();
    const db = getDb();
    await db.insert(users).values({
      username: 'lookup_pw',
      email: 'lp@hirestream.test',
      password: await bcrypt.hash('Test@1234', 10),
      role: 'candidate',
    });
    const res = await agent.get('/api/v1/superadmin/ops/lookup?q=lookup_pw');
    expect(res.body.data.users[0].password).toBeUndefined();
  });
});

describe('GET /api/v1/superadmin/ops/reports', () => {
  it('lists 8 pre-built reports', async () => {
    const agent = await loginSA();
    const res = await agent.get('/api/v1/superadmin/ops/reports');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(8);
    const keys = res.body.data.map((r: any) => r.key);
    expect(keys).toContain('candidates_by_district');
    expect(keys).toContain('placement_funnel');
    expect(keys).toContain('system_summary');
  });

  it('runs system_summary report', async () => {
    const agent = await loginSA();
    const res = await agent.get('/api/v1/superadmin/ops/reports/system_summary');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const row = res.body.data[0];
    expect(row).toHaveProperty('total_users');
    expect(row).toHaveProperty('total_candidates');
  });

  it('returns 404 for unknown report', async () => {
    const agent = await loginSA();
    const res = await agent.get('/api/v1/superadmin/ops/reports/nonexistent');
    expect(res.status).toBe(404);
  });
});
