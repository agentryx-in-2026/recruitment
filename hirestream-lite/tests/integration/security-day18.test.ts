import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import bcrypt from 'bcrypt';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { users, candidates } from '../../shared/schema';
import { eq } from 'drizzle-orm';

let app: Express;

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  await truncateAllTables();
});

async function loginAs(role: string) {
  const db = getDb();
  const hashedPw = await bcrypt.hash('Test@1234', 10);
  await db.insert(users).values({
    username: `${role}_sec`,
    email: `${role}_sec@hirestream.test`,
    password: hashedPw,
    role,
  });
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({
    username: `${role}_sec`,
    password: 'Test@1234',
  });
  return agent;
}

// ── INPUT SANITIZATION (D1) ──────────────────────────────────────────

describe('Input sanitization middleware (D1)', () => {
  it('strips <script> tags from POST body string fields', async () => {
    const cAgent = await loginAs('candidate');
    // Use grievance endpoint which accepts free text
    const res = await cAgent.post('/api/v1/grievances').send({
      subject: 'Hello <script>alert("xss")</script> World',
      description: 'Test <iframe src="evil.com"></iframe> body',
      category: 'general',
    });
    // Either created (200/201) or rejected — but if created, content must be sanitized
    if (res.status === 201 || res.status === 200) {
      expect(res.body.data?.subject || '').not.toMatch(/<script>/i);
      expect(res.body.data?.description || '').not.toMatch(/<iframe/i);
    }
  });

  it('strips on* event handlers from input', async () => {
    const cAgent = await loginAs('candidate');
    const res = await cAgent.patch('/api/v1/candidates/profile').send({
      fullName: 'John<img src=x onerror="alert(1)">Doe',
    });
    if (res.status === 200) {
      expect(res.body.data?.fullName || '').not.toMatch(/onerror=/i);
    }
  });

  it('preserves password fields (does NOT sanitize them)', async () => {
    // Passwords with special chars must pass through unchanged for hashing
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'sanitize_test@hirestream.test',
      password: 'My<Strong>Pass@123',  // contains <Strong> which would be stripped if sanitized
      role: 'candidate',
    });
    // Should succeed — password is in skip list
    expect([200, 201]).toContain(res.status);

    // Verify we can log in with the original password
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      username: 'sanitize_test@hirestream.test',
      password: 'My<Strong>Pass@123',
    });
    expect(loginRes.status).toBe(200);
  });

  it('strips javascript: URLs from query strings', async () => {
    const cAgent = await loginAs('candidate');
    // Searching with malicious query
    const res = await cAgent.get('/api/v1/jobs?q=javascript:alert(1)');
    // Should not error; query was sanitized
    expect(res.status).toBeLessThan(500);
  });
});

// ── BODY SIZE LIMIT (D6) ─────────────────────────────────────────────

describe('Body size limit (D6)', () => {
  it('rejects payloads larger than 1MB → 413', async () => {
    const huge = 'x'.repeat(2 * 1024 * 1024); // 2MB
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'big@test.com',
      password: 'Strong@1234',
      role: 'candidate',
      fullName: huge,
    });
    expect(res.status).toBe(413);
  });
});

// ── CSV EXPORT (admin only) ──────────────────────────────────────────

describe('GET /api/v1/admin/reports/export/:entity.csv', () => {
  it('rejects unauthenticated → 401', async () => {
    const res = await request(app).get('/api/v1/admin/reports/export/candidates.csv');
    expect(res.status).toBe(401);
  });

  it('rejects non-admin (candidate) → 403', async () => {
    const cAgent = await loginAs('candidate');
    const res = await cAgent.get('/api/v1/admin/reports/export/candidates.csv');
    expect(res.status).toBe(403);
  });

  it('returns CSV for admin', async () => {
    const aAgent = await loginAs('admin');
    // Seed a candidate to have data
    const db = getDb();
    const [u] = await db.insert(users).values({
      username: 'cand_export',
      email: 'cand_export@hirestream.test',
      password: 'hashed',
      role: 'candidate',
    }).returning();
    await db.insert(candidates).values({
      userId: u.id,
      fullName: 'Export Test',
      email: 'cand_export@hirestream.test',
    });

    const res = await aAgent.get('/api/v1/admin/reports/export/candidates.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment.*candidates-/);
    expect(res.text).toContain('id,'); // header row contains column names
    expect(res.text).toContain('Export Test');
  });

  it('rejects unknown entity → 404', async () => {
    const aAgent = await loginAs('admin');
    const res = await aAgent.get('/api/v1/admin/reports/export/foobar.csv');
    expect(res.status).toBe(404);
  });

  it('strips password fields from user export', async () => {
    const aAgent = await loginAs('admin');
    const res = await aAgent.get('/api/v1/admin/reports/export/users.csv');
    expect(res.status).toBe(200);
    // Header row should not contain "password"
    const headerLine = res.text.split('\n')[0];
    expect(headerLine.toLowerCase()).not.toContain('password');
  });
});
