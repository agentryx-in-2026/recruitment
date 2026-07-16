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

async function loginAsSuperadmin() {
  const db = getDb();
  const hashedPw = await bcrypt.hash('Test@1234', 10);
  await db.insert(users).values({
    username: 'su_v121',
    email: 'su_v121@hirestream.test',
    password: hashedPw,
    role: 'superadmin',
  });
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ username: 'su_v121', password: 'Test@1234' });
  return agent;
}

describe('GET /api/v1/superadmin/flags', () => {
  it('rejects non-superadmin → 403', async () => {
    const db = getDb();
    const hashedPw = await bcrypt.hash('Test@1234', 10);
    await db.insert(users).values({ username: 'adm', email: 'adm@t.test', password: hashedPw, role: 'admin' });
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ username: 'adm', password: 'Test@1234' });

    const res = await agent.get('/api/v1/superadmin/flags');
    expect(res.status).toBe(403);
  });

  it('returns all feature flags with defaults on first call', async () => {
    const agent = await loginAsSuperadmin();
    const res = await agent.get('/api/v1/superadmin/flags');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(7);

    const keys = res.body.data.map((f: any) => f.key);
    expect(keys).toContain('feature.captcha_enabled');
    expect(keys).toContain('system.maintenance_mode');
  });

  it('flags have category field', async () => {
    const agent = await loginAsSuperadmin();
    const res = await agent.get('/api/v1/superadmin/flags');
    const maintenanceFlag = res.body.data.find((f: any) => f.key === 'system.maintenance_mode');
    expect(maintenanceFlag.category).toBe('maintenance');

    const featureFlag = res.body.data.find((f: any) => f.key === 'feature.captcha_enabled');
    expect(featureFlag.category).toBe('feature_flag');
  });
});

describe('PATCH /api/v1/superadmin/flags/:key', () => {
  it('toggles a feature flag', async () => {
    const agent = await loginAsSuperadmin();
    await agent.get('/api/v1/superadmin/flags'); // ensure defaults

    const res = await agent
      .patch('/api/v1/superadmin/flags/feature.captcha_enabled')
      .send({ value: false });

    expect(res.status).toBe(200);
    expect(res.body.data.value).toBe(false);
  });

  it('toggles maintenance mode', async () => {
    const agent = await loginAsSuperadmin();
    await agent.get('/api/v1/superadmin/flags');

    const res = await agent
      .patch('/api/v1/superadmin/flags/system.maintenance_mode')
      .send({ value: true });

    expect(res.status).toBe(200);
    expect(res.body.data.value).toBe(true);

    // Toggle off again so it doesn't affect other tests
    await agent.patch('/api/v1/superadmin/flags/system.maintenance_mode').send({ value: false });
  });

  it('404 on unknown flag', async () => {
    const agent = await loginAsSuperadmin();
    const res = await agent
      .patch('/api/v1/superadmin/flags/nonexistent.flag')
      .send({ value: true });
    expect(res.status).toBe(404);
  });

  it('400 when value missing', async () => {
    const agent = await loginAsSuperadmin();
    await agent.get('/api/v1/superadmin/flags');
    const res = await agent
      .patch('/api/v1/superadmin/flags/feature.captcha_enabled')
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/superadmin/integrations', () => {
  it('returns integration status list', async () => {
    const agent = await loginAsSuperadmin();
    const res = await agent.get('/api/v1/superadmin/integrations');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(6);

    const keys = res.body.data.map((i: any) => i.key);
    expect(keys).toEqual(expect.arrayContaining(['smtp', 'sms', 'aadhaar', 'him_access', 'captcha', 'database']));
  });

  it('database integration shows as connected (test DB is live)', async () => {
    const agent = await loginAsSuperadmin();
    const res = await agent.get('/api/v1/superadmin/integrations');
    const db = res.body.data.find((i: any) => i.key === 'database');
    expect(db.configured).toBe(true);
  });
});

describe('GET /api/v1/superadmin/settings', () => {
  it('returns grouped env snapshot', async () => {
    const agent = await loginAsSuperadmin();
    const res = await agent.get('/api/v1/superadmin/settings');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const groupNames = res.body.data.map((g: any) => g.group);
    expect(groupNames).toEqual(expect.arrayContaining(['Runtime', 'Database', 'Session']));
  });

  it('redacts sensitive values', async () => {
    const agent = await loginAsSuperadmin();
    const res = await agent.get('/api/v1/superadmin/settings');

    const dbGroup = res.body.data.find((g: any) => g.group === 'Database');
    const dbUrl = dbGroup.items.find((i: any) => i.key === 'DATABASE_URL');
    // Should be redacted (not contain "postgresql://" or "hirestream:hirestream")
    expect(dbUrl.value).not.toContain('postgresql://');
    expect(dbUrl.value).not.toContain('hirestream:hirestream');
  });
});

describe('GET /api/v1/superadmin/logs', () => {
  it('returns logs (or empty if file not present)', async () => {
    const agent = await loginAsSuperadmin();
    const res = await agent.get('/api/v1/superadmin/logs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('accepts filter params', async () => {
    const agent = await loginAsSuperadmin();
    const res = await agent.get('/api/v1/superadmin/logs?level=error&limit=50');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/v1/superadmin/audit', () => {
  it('returns audit log entries', async () => {
    const agent = await loginAsSuperadmin();
    // Create some audit entries by making superadmin actions
    await agent.get('/api/v1/superadmin/flags'); // ensures defaults, doesn't audit
    await agent.patch('/api/v1/superadmin/flags/feature.captcha_enabled').send({ value: true });

    await new Promise((r) => setTimeout(r, 200)); // settle async audit write

    const res = await agent.get('/api/v1/superadmin/audit');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('filters by action', async () => {
    const agent = await loginAsSuperadmin();
    const res = await agent.get('/api/v1/superadmin/audit?action=update');
    expect(res.status).toBe(200);
    res.body.data.forEach((l: any) => expect(l.action).toBe('update'));
  });

  it('filters by resourceType', async () => {
    const agent = await loginAsSuperadmin();
    const res = await agent.get('/api/v1/superadmin/audit?resourceType=superadmin');
    expect(res.status).toBe(200);
    res.body.data.forEach((l: any) => expect(l.resourceType).toBe('superadmin'));
  });
});
