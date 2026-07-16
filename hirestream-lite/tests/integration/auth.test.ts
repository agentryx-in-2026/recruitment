import { describe, beforeAll, beforeEach, afterAll, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { otpCodes, passwordResetTokens, users } from '../../shared/schema';
import { eq } from 'drizzle-orm';

let app: Express;

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  await truncateAllTables();
});

// ── Registration ────────────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  it('creates a new user with valid data → 201', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@example.com', password: 'Test@123', role: 'candidate' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.email).toBe('test@example.com');
    expect(res.body.data.role).toBe('candidate');
    expect(res.body.data.password).toBeUndefined();
  });

  it('hashes the password (not stored as plaintext)', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'hash@example.com', password: 'Test@123', role: 'candidate' });

    const db = getDb();
    const rows = await db.select().from(users).where(eq(users.email, 'hash@example.com'));
    expect(rows[0].password).not.toBe('Test@123');
    expect(rows[0].password.startsWith('$2')).toBe(true); // bcrypt hash
  });

  it('rejects missing email → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ password: 'Test@123', role: 'candidate' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid email format → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'Test@123', role: 'candidate' });
    expect(res.status).toBe(400);
  });

  it('rejects password shorter than 6 characters → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@example.com', password: '12345', role: 'candidate' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid role → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@example.com', password: 'Test@123', role: 'superadmin' });
    expect(res.status).toBe(400);
  });

  // security 2026-07-07 (A07-1): duplicate registration no longer returns a
  // distinguishable 409 "User already exists" (email enumeration). It returns
  // the same 201 success shape WITHOUT a user object or session, and the
  // duplicate is still not created.
  it('duplicate email → neutral 201, no session, no account created/changed', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'dup@example.com', password: 'Test@123', role: 'candidate' });

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'dup@example.com', password: 'Other@456', role: 'agent' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data?.id).toBeUndefined(); // no user object → no login

    // The original account is untouched: old password works, new one doesn't.
    const okLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'dup@example.com', password: 'Test@123' });
    expect(okLogin.status).toBe(200);
    const badLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'dup@example.com', password: 'Other@456' });
    expect(badLogin.status).toBe(401);
  });

  it('accepts all three public roles', async () => {
    for (const role of ['candidate', 'agent', 'employer']) {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: `${role}@example.com`, password: 'Test@123', role });
      expect(res.status).toBe(201);
    }
  });
});

// ── Login ───────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'login@example.com', password: 'Test@123', role: 'candidate' });
  });

  it('logs in with correct credentials → 200', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'login@example.com', password: 'Test@123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.email).toBe('login@example.com');
  });

  it('rejects wrong password → 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'login@example.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('rejects non-existent user → 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'nobody@example.com', password: 'Test@123' });
    expect(res.status).toBe(401);
  });

  it('rejects empty body → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({});
    expect(res.status).toBe(400);
  });
});

// ── Current User ────────────────────────────────────────────────────

describe('GET /api/v1/auth/me', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });
});

// ── Logout ──────────────────────────────────────────────────────────

describe('POST /api/v1/auth/logout', () => {
  it('returns 200 on logout', async () => {
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(200);
  });
});

// ── OTP (real) ──────────────────────────────────────────────────────

describe('POST /api/v1/auth/send-otp', () => {
  it('sends OTP for valid email → 200', async () => {
    const res = await request(app)
      .post('/api/v1/auth/send-otp')
      .send({ email: 'otp@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('creates OTP record in database', async () => {
    await request(app)
      .post('/api/v1/auth/send-otp')
      .send({ email: 'otp@example.com' });

    const db = getDb();
    const rows = await db.select().from(otpCodes).where(eq(otpCodes.email, 'otp@example.com'));
    expect(rows.length).toBe(1);
    expect(rows[0].code).toHaveLength(6);
    expect(rows[0].verified).toBe(false);
  });

  it('rejects invalid email → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/send-otp')
      .send({ email: 'not-email' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/verify-otp', () => {
  it('verifies correct OTP → 200', async () => {
    // Send OTP first
    await request(app)
      .post('/api/v1/auth/send-otp')
      .send({ email: 'verify@example.com' });

    // Get the OTP from database
    const db = getDb();
    const rows = await db.select().from(otpCodes).where(eq(otpCodes.email, 'verify@example.com'));
    const otp = rows[0].code;

    // Verify it
    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'verify@example.com', otp });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects wrong OTP → 401', async () => {
    await request(app)
      .post('/api/v1/auth/send-otp')
      .send({ email: 'wrong@example.com' });

    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'wrong@example.com', otp: '000000' });

    expect(res.status).toBe(401);
  });

  it('rejects OTP for non-existent request → 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'none@example.com', otp: '123456' });

    expect(res.status).toBe(401);
  });
});

// ── Password Reset ──────────────────────────────────────────────────

describe('POST /api/v1/auth/request-password-reset', () => {
  it('returns 200 even for non-existent email (prevents enumeration)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/request-password-reset')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('creates reset token for existing user', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'reset@example.com', password: 'Old@Pass1', role: 'candidate' });

    await request(app)
      .post('/api/v1/auth/request-password-reset')
      .send({ email: 'reset@example.com' });

    const db = getDb();
    const rows = await db.select().from(passwordResetTokens);
    expect(rows.length).toBe(1);
    expect(rows[0].token).toBeTruthy();
    expect(rows[0].used).toBe(false);
  });
});

describe('POST /api/v1/auth/reset-password', () => {
  it('resets password with valid token', async () => {
    // Register user
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'resetpw@example.com', password: 'Old@Pass1', role: 'candidate' });

    // Request reset
    await request(app)
      .post('/api/v1/auth/request-password-reset')
      .send({ email: 'resetpw@example.com' });

    // Get token from DB
    const db = getDb();
    const rows = await db.select().from(passwordResetTokens);
    const token = rows[0].token;

    // Reset password
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'newTest@123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify new password works
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'resetpw@example.com', password: 'newTest@123' });

    expect(loginRes.status).toBe(200);
  });

  it('rejects invalid token → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'invalid-token', newPassword: 'newTest@123' });

    expect(res.status).toBe(400);
  });
});

// ── SSO & Aadhaar Stubs ─────────────────────────────────────────────

describe('GET /api/v1/auth/sso/himaccess', () => {
  it('returns 501 not implemented', async () => {
    const res = await request(app).get('/api/v1/auth/sso/himaccess');
    expect(res.body.error.code).toBe(501);
  });
});

describe('POST /api/v1/auth/verify-aadhaar', () => {
  it('returns 501 not implemented', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-aadhaar')
      .send({ aadhaarNumber: '123456789012' });
    expect(res.body.error.code).toBe(501);
  });

  it('rejects invalid aadhaar length → 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-aadhaar')
      .send({ aadhaarNumber: '12345' });
    expect(res.status).toBe(400);
  });
});
