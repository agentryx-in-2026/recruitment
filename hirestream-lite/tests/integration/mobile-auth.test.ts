/**
 * Mobile Auth API Integration Tests
 *
 * Tests for /api/v1/mobile/auth/* and /api/v1/mobile/* endpoints.
 * Covers: login, register, refresh rotation, reuse detection, logout,
 * forgot-password, version check, config, bearer auth on protected routes,
 * and push token registration.
 *
 * Backend items: B1.1, B1.2, B1.3, B2.1, B3.1
 * See: /PMD-Final wrapup/MobileApps/05_Backend_API_Adaptations.md
 */

import { describe, beforeEach, it, expect } from '@jest/globals';
import supertest from 'supertest';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { users, mobileRefreshTokens, mobilePushTokens } from '../../shared/schema';
import { eq, and, isNull } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const app = createTestApp();
const request = supertest(app);

// Test user data
const TEST_USER = {
  email: 'mobile-test@example.com',
  password: 'TestPass1!',
  role: 'candidate' as const,
  fullName: 'Mobile Test User',
};

const JWT_SECRET = process.env.JWT_SECRET || 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

describe('Mobile Auth API (/api/v1/mobile/auth)', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  // ── Helper: register and get tokens ───────────────────────────────
  async function registerAndLogin() {
    const res = await request
      .post('/api/v1/mobile/auth/register')
      .send({
        email: TEST_USER.email,
        password: TEST_USER.password,
        role: TEST_USER.role,
        fullName: TEST_USER.fullName,
      });
    return res.body.data;
  }

  // ── B1.1: Login ───────────────────────────────────────────────────

  describe('POST /login', () => {
    it('should return access + refresh tokens on valid credentials', async () => {
      // First register a user
      await registerAndLogin();

      const res = await request
        .post('/api/v1/mobile/auth/login')
        .send({ username: TEST_USER.email, password: TEST_USER.password });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe(TEST_USER.email);
      // Password must NOT be in the response
      expect(res.body.data.user.password).toBeUndefined();

      // Verify the access token is a valid JWT
      const decoded = jwt.verify(res.body.data.accessToken, JWT_SECRET) as any;
      expect(decoded.typ).toBe('mobile_access');
      expect(decoded.role).toBe('candidate');
    });

    it('should reject invalid credentials', async () => {
      await registerAndLogin();

      const res = await request
        .post('/api/v1/mobile/auth/login')
        .send({ username: TEST_USER.email, password: 'WrongPass1!' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject non-existent user', async () => {
      const res = await request
        .post('/api/v1/mobile/auth/login')
        .send({ username: 'nobody@example.com', password: 'Whatever1!' });

      expect(res.status).toBe(401);
    });
  });

  // ── B1.1: Register ────────────────────────────────────────────────

  describe('POST /register', () => {
    it('should create user and return tokens', async () => {
      const res = await request
        .post('/api/v1/mobile/auth/register')
        .send({
          email: TEST_USER.email,
          password: TEST_USER.password,
          role: TEST_USER.role,
          fullName: TEST_USER.fullName,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      expect(res.body.data.user.email).toBe(TEST_USER.email);
      expect(res.body.data.user.role).toBe('candidate');
    });

    it('should reject duplicate email', async () => {
      await registerAndLogin();

      const res = await request
        .post('/api/v1/mobile/auth/register')
        .send({
          email: TEST_USER.email,
          password: TEST_USER.password,
          role: TEST_USER.role,
        });

      expect(res.status).toBe(409);
    });

    it('should reject weak password', async () => {
      const res = await request
        .post('/api/v1/mobile/auth/register')
        .send({
          email: 'weak@example.com',
          password: '123',
          role: 'candidate',
        });

      expect(res.status).toBe(400);
    });
  });

  // ── B1.2: Refresh Token Rotation ──────────────────────────────────

  describe('POST /refresh', () => {
    it('should rotate tokens and return new pair', async () => {
      const { refreshToken } = await registerAndLogin();

      const res = await request
        .post('/api/v1/mobile/auth/refresh')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
      // New refresh token should be different from old
      expect(res.body.data.refreshToken).not.toBe(refreshToken);
    });

    it('should reject used (rotated) refresh token — reuse detection', async () => {
      const { refreshToken } = await registerAndLogin();

      // First refresh — should succeed
      const res1 = await request
        .post('/api/v1/mobile/auth/refresh')
        .send({ refreshToken });
      expect(res1.status).toBe(200);

      // Second refresh with the SAME (now rotated) token — reuse detection
      const res2 = await request
        .post('/api/v1/mobile/auth/refresh')
        .send({ refreshToken });
      expect(res2.status).toBe(401);
      expect(res2.body.error?.message || '').toMatch(/reuse/i);
    });

    it('should reject invalid refresh token', async () => {
      const res = await request
        .post('/api/v1/mobile/auth/refresh')
        .send({ refreshToken: 'a'.repeat(64) });

      expect(res.status).toBe(401);
    });
  });

  // ── B1.3: Logout ──────────────────────────────────────────────────

  describe('POST /logout', () => {
    it('should revoke refresh token', async () => {
      const { refreshToken } = await registerAndLogin();

      const res = await request
        .post('/api/v1/mobile/auth/logout')
        .send({ refreshToken });

      expect(res.status).toBe(200);
      expect(res.body.data.ok).toBe(true);

      // Token should no longer work for refresh
      const refreshRes = await request
        .post('/api/v1/mobile/auth/refresh')
        .send({ refreshToken });
      expect(refreshRes.status).toBe(401);
    });
  });

  // ── Forgot Password ──────────────────────────────────────────────

  describe('POST /forgot-password', () => {
    it('should return 200 even for non-existent email (anti-enumeration)', async () => {
      const res = await request
        .post('/api/v1/mobile/auth/forgot-password')
        .send({ email: 'nobody@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ── Bearer Auth on Protected Routes ──────────────────────────────

  describe('Bearer token authentication', () => {
    it('should access protected route with valid bearer token', async () => {
      const { accessToken } = await registerAndLogin();

      const res = await request
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(TEST_USER.email);
    });

    it('should reject expired access token', async () => {
      // Register to get a user in the DB
      const { user } = await registerAndLogin();

      // Sign a token that expires immediately
      const expiredToken = jwt.sign(
        { sub: user.id, role: 'candidate', typ: 'mobile_access' },
        JWT_SECRET,
        { expiresIn: 0 },
      );

      // Wait a tiny moment for expiry
      await new Promise(r => setTimeout(r, 100));

      const res = await request
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('token_expired');
    });

    it('should reject malformed bearer token', async () => {
      const res = await request
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not-a-valid-jwt');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('invalid_token');
    });
  });

  // ── Token cap enforcement ────────────────────────────────────────

  describe('Refresh token cap (max 5 per user)', () => {
    it('should revoke oldest tokens when cap exceeded', async () => {
      // Register a user
      const firstLogin = await registerAndLogin();
      const db = getDb();

      // Get the user ID
      const [user] = await db.select().from(users).where(eq(users.email, TEST_USER.email)).limit(1);

      // Login 5 more times (total 6 tokens: 1 from register + 5 logins)
      for (let i = 0; i < 5; i++) {
        await request
          .post('/api/v1/mobile/auth/login')
          .send({ username: TEST_USER.email, password: TEST_USER.password });
      }

      // Check active token count
      const activeTokens = await db
        .select()
        .from(mobileRefreshTokens)
        .where(and(
          eq(mobileRefreshTokens.userId, user.id),
          isNull(mobileRefreshTokens.revokedAt),
        ));

      expect(activeTokens.length).toBeLessThanOrEqual(5);
    });
  });
});

// ── B3.1: Version + Config endpoints ────────────────────────────────

describe('Mobile Config API (/api/v1/mobile)', () => {
  describe('GET /version', () => {
    it('should return version info', async () => {
      const res = await request.get('/api/v1/mobile/version');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.minSupported).toBeDefined();
      expect(res.body.data.latest).toBeDefined();
      expect(typeof res.body.data.forceUpdate).toBe('boolean');
    });
  });

  describe('GET /config', () => {
    it('should return feature flags', async () => {
      const res = await request.get('/api/v1/mobile/config');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.flags).toBeDefined();
      expect(typeof res.body.data.flags.photoUploadEnabled).toBe('boolean');
      expect(typeof res.body.data.flags.pushNotificationsEnabled).toBe('boolean');
    });
  });
});

// ── B2.1: Push Token Registration ───────────────────────────────────

describe('Mobile Push API (/api/v1/mobile/push)', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  async function registerAndGetToken() {
    const res = await request
      .post('/api/v1/mobile/auth/register')
      .send({
        email: TEST_USER.email,
        password: TEST_USER.password,
        role: TEST_USER.role,
        fullName: TEST_USER.fullName,
      });
    return res.body.data;
  }

  describe('POST /register', () => {
    it('should register a push token for authenticated user', async () => {
      const { accessToken } = await registerAndGetToken();

      const res = await request
        .post('/api/v1/mobile/push/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          platform: 'android',
          token: 'fcm-device-token-12345',
          deviceId: 'android-pixel-abc',
          appVersion: '1.0.0',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.ok).toBe(true);
    });

    it('should reject unauthenticated push registration', async () => {
      const res = await request
        .post('/api/v1/mobile/push/register')
        .send({
          platform: 'android',
          token: 'fcm-device-token-12345',
        });

      expect(res.status).toBe(401);
    });

    it('should upsert token on re-registration', async () => {
      const { accessToken } = await registerAndGetToken();
      const pushToken = 'fcm-device-token-upsert';

      // Register once
      await request
        .post('/api/v1/mobile/push/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ platform: 'android', token: pushToken });

      // Register again with same token (e.g. after app restart)
      const res = await request
        .post('/api/v1/mobile/push/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ platform: 'android', token: pushToken });

      expect(res.status).toBe(200);

      // Should still be only one row
      const db = getDb();
      const rows = await db
        .select()
        .from(mobilePushTokens)
        .where(eq(mobilePushTokens.token, pushToken));
      expect(rows.length).toBe(1);
    });
  });

  describe('DELETE /register', () => {
    it('should remove a push token', async () => {
      const { accessToken } = await registerAndGetToken();
      const pushToken = 'fcm-device-token-delete';

      // Register
      await request
        .post('/api/v1/mobile/push/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ platform: 'android', token: pushToken });

      // Delete
      const res = await request
        .delete('/api/v1/mobile/push/register')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ token: pushToken });

      expect(res.status).toBe(200);
      expect(res.body.data.ok).toBe(true);

      // Should be gone
      const db = getDb();
      const rows = await db
        .select()
        .from(mobilePushTokens)
        .where(eq(mobilePushTokens.token, pushToken));
      expect(rows.length).toBe(0);
    });
  });
});
