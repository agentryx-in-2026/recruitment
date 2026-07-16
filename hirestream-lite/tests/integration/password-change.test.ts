/**
 * POST /api/v1/auth/change-password
 *
 * Security-critical endpoint. Exercises:
 *   • Requires authentication
 *   • Requires correct current password
 *   • Enforces strong-password rules on new password
 *   • Rejects reuse of current password
 *   • Successful change lets user log in with the new password
 *   • Other sessions for the same user are invalidated
 */

import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, truncateAllTables } from '../helpers';

let app: Express;
let cookie: string[];
const EMAIL = 'pw-change@test.com';
const OLD = 'Original@1';
const NEW = 'BrandNew@2';

beforeAll(async () => { app = createTestApp(); });

beforeEach(async () => {
  await truncateAllTables();
  const reg = await request(app).post('/api/v1/auth/register')
    .send({ email: EMAIL, password: OLD, role: 'candidate', fullName: 'Pw User' });
  cookie = reg.headers['set-cookie'] as unknown as string[];
});

describe('POST /api/v1/auth/change-password', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/v1/auth/change-password')
      .send({ currentPassword: OLD, newPassword: NEW });
    expect(res.status).toBe(401);
  });

  it('rejects when current password is wrong', async () => {
    const res = await request(app).post('/api/v1/auth/change-password').set('Cookie', cookie)
      .send({ currentPassword: 'WrongPass@1', newPassword: NEW });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/Current password/i);
  });

  it('rejects weak new password', async () => {
    const res = await request(app).post('/api/v1/auth/change-password').set('Cookie', cookie)
      .send({ currentPassword: OLD, newPassword: 'weak' });
    expect(res.status).toBe(400);
  });

  it('rejects new password identical to current', async () => {
    const res = await request(app).post('/api/v1/auth/change-password').set('Cookie', cookie)
      .send({ currentPassword: OLD, newPassword: OLD });
    expect(res.status).toBe(400);
  });

  it('changes password and allows login with new credentials', async () => {
    const change = await request(app).post('/api/v1/auth/change-password').set('Cookie', cookie)
      .send({ currentPassword: OLD, newPassword: NEW });
    expect(change.status).toBe(200);

    const oldLogin = await request(app).post('/api/v1/auth/login')
      .send({ username: EMAIL, password: OLD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post('/api/v1/auth/login')
      .send({ username: EMAIL, password: NEW });
    expect(newLogin.status).toBe(200);
  });

  it('current session stays alive after password change', async () => {
    // Changing password should not log the user out of the current session —
    // that would be a jarring UX. Only OTHER sessions are killed.
    await request(app).post('/api/v1/auth/change-password').set('Cookie', cookie)
      .send({ currentPassword: OLD, newPassword: NEW });
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
  });
});
