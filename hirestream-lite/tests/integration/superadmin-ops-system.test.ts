import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import { passport } from '../../server/config/passport.config';
import { sanitizeRequest } from '../../server/middleware/sanitize.middleware';
import authRouter from '../../server/routes/auth.routes';
import superadminOpsSystemRouter from '../../server/routes/superadmin-ops-system.routes';
import { errorHandler } from '../../server/middleware/errorHandler.middleware';
import { truncateAllTables, getDb } from '../helpers';
import { users } from '../../shared/schema';

let app: express.Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(sanitizeRequest);
  app.use(session({
    secret: 'test-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  }));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/superadmin/ops', superadminOpsSystemRouter);
  app.use(errorHandler);
});

beforeEach(async () => {
  await truncateAllTables();
});

async function loginSA() {
  const db = getDb();
  await db.insert(users).values({
    username: 'sa_sys',
    email: 'sa_sys@hirestream.test',
    password: await bcrypt.hash('Test@1234', 10),
    role: 'superadmin',
  });
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({ username: 'sa_sys', password: 'Test@1234' });
  return agent;
}

describe('GET /api/v1/superadmin/ops/resources', () => {
  it('rejects non-superadmin → 403', async () => {
    const db = getDb();
    await db.insert(users).values({
      username: 'adm_sys', email: 'a@s.test',
      password: await bcrypt.hash('Test@1234', 10), role: 'admin',
    });
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ username: 'adm_sys', password: 'Test@1234' });
    const res = await agent.get('/api/v1/superadmin/ops/resources');
    expect(res.status).toBe(403);
  });

  it('returns CPU, memory, disk, OS info', async () => {
    const agent = await loginSA();
    const res = await agent.get('/api/v1/superadmin/ops/resources');
    expect(res.status).toBe(200);
    expect(res.body.data.cpu).toBeDefined();
    expect(res.body.data.cpu.cores).toBeGreaterThan(0);
    expect(res.body.data.memory.total_gb).toBeGreaterThan(0);
    expect(Array.isArray(res.body.data.disk)).toBe(true);
    expect(res.body.data.os.platform).toBeDefined();
    expect(Array.isArray(res.body.data.history)).toBe(true);
  });
});

describe('GET /api/v1/superadmin/ops/system', () => {
  it('returns process summary, top processes, listening ports', async () => {
    const agent = await loginSA();
    const res = await agent.get('/api/v1/superadmin/ops/system');
    expect(res.status).toBe(200);
    expect(res.body.data.process_summary).toBeDefined();
    expect(Array.isArray(res.body.data.top_by_cpu)).toBe(true);
    expect(Array.isArray(res.body.data.top_by_memory)).toBe(true);
    expect(Array.isArray(res.body.data.listening_ports)).toBe(true);
  }, 30000);
});

describe('POST /api/v1/superadmin/ops/sql/execute', () => {
  it('rejects non-SELECT queries', async () => {
    const agent = await loginSA();
    const res = await agent.post('/api/v1/superadmin/ops/sql/execute')
      .send({ query: "DELETE FROM users" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/blocked keyword/i);
  });

  it('rejects DROP TABLE', async () => {
    const agent = await loginSA();
    const res = await agent.post('/api/v1/superadmin/ops/sql/execute')
      .send({ query: "DROP TABLE users" });
    expect(res.status).toBe(400);
  });

  it('rejects multi-statement queries', async () => {
    const agent = await loginSA();
    const res = await agent.post('/api/v1/superadmin/ops/sql/execute')
      .send({ query: "SELECT 1; SELECT 2" });
    expect(res.status).toBe(400);
  });

  it('rejects queries that do not start with SELECT/WITH/EXPLAIN', async () => {
    const agent = await loginSA();
    const res = await agent.post('/api/v1/superadmin/ops/sql/execute')
      .send({ query: "FOOBAR users" });
    expect(res.status).toBe(400);
  });

  it('executes valid SELECT', async () => {
    const agent = await loginSA();
    const res = await agent.post('/api/v1/superadmin/ops/sql/execute')
      .send({ query: "SELECT 1 AS num" });
    expect(res.status).toBe(200);
    expect(res.body.data[0].num).toBe(1);
    expect(res.body.elapsed_ms).toBeGreaterThanOrEqual(0);
  });

  it('executes EXPLAIN', async () => {
    const agent = await loginSA();
    const res = await agent.post('/api/v1/superadmin/ops/sql/execute')
      .send({ query: "EXPLAIN SELECT * FROM users" });
    expect(res.status).toBe(200);
  });

  it('rejects empty query', async () => {
    const agent = await loginSA();
    const res = await agent.post('/api/v1/superadmin/ops/sql/execute').send({ query: "" });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/superadmin/ops/backups', () => {
  it('lists backups (may be empty)', async () => {
    const agent = await loginSA();
    const res = await agent.get('/api/v1/superadmin/ops/backups');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.backup_dir).toBeDefined();
  });
});

describe('POST /api/v1/superadmin/ops/backups/create', () => {
  it('rejects without confirmation', async () => {
    const agent = await loginSA();
    const res = await agent.post('/api/v1/superadmin/ops/backups/create').send({});
    expect(res.status).toBe(400);
  });

  // Note: not testing actual pg_dump execution here — that requires the
  // pg_dump binary on PATH and would take 5-10 seconds per test.
  // The endpoint exists and is gated correctly.
});

describe('GET /api/v1/superadmin/ops/trends', () => {
  it('returns submissions, placements, registrations', async () => {
    const agent = await loginSA();
    const res = await agent.get('/api/v1/superadmin/ops/trends');
    expect(res.status).toBe(200);
    expect(res.body.data.submissions).toBeDefined();
    expect(res.body.data.placements).toBeDefined();
    expect(res.body.data.registrations).toBeDefined();
    expect(Array.isArray(res.body.data.submissions)).toBe(true);
  });
});
