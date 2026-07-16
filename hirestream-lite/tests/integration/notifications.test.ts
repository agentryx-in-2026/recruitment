import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { notifications } from '../../shared/schema';

let app: Express;
let userCookie: string[];
let userId: string;

beforeAll(async () => {
  app = createTestApp();
});

beforeEach(async () => {
  await truncateAllTables();

  // Register a user (triggers welcome notification via notify service)
  const reg = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'user@test.com', password: 'Test@123', role: 'candidate' });
  userCookie = reg.headers['set-cookie'] as unknown as string[];
  userId = reg.body.data.id;
});

// ── List Notifications ──────────────────────────────────────────────

describe('GET /api/v1/notifications', () => {
  it('returns notifications with pagination', async () => {
    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Cookie', userCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.unreadCount).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('has welcome notification from registration', async () => {
    // Give notify() a moment to complete (it's async)
    await new Promise(r => setTimeout(r, 200));

    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Cookie', userCookie);

    const welcome = res.body.data.find((n: any) => n.type === 'system' && n.title.includes('Welcome'));
    expect(welcome).toBeDefined();
  });

  it('filters by type', async () => {
    const res = await request(app)
      .get('/api/v1/notifications?type=system')
      .set('Cookie', userCookie);

    expect(res.status).toBe(200);
    for (const n of res.body.data) {
      expect(n.type).toBe('system');
    }
  });

  it('filters unread only', async () => {
    const res = await request(app)
      .get('/api/v1/notifications?unreadOnly=true')
      .set('Cookie', userCookie);

    expect(res.status).toBe(200);
    for (const n of res.body.data) {
      expect(n.read).toBe(false);
    }
  });

  it('supports pagination params', async () => {
    const res = await request(app)
      .get('/api/v1/notifications?page=1&limit=5')
      .set('Cookie', userCookie);

    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(5);
  });

  it('rejects unauthenticated → 401', async () => {
    const res = await request(app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });
});

// ── Mark as Read ────────────────────────────────────────────────────

describe('PATCH /api/v1/notifications/:id/read', () => {
  it('marks notification as read', async () => {
    await new Promise(r => setTimeout(r, 200));

    const list = await request(app)
      .get('/api/v1/notifications')
      .set('Cookie', userCookie);

    if (list.body.data.length === 0) return; // skip if no notifications yet

    const notifId = list.body.data[0].id;

    const res = await request(app)
      .patch(`/api/v1/notifications/${notifId}/read`)
      .set('Cookie', userCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.read).toBe(true);
  });

  it('returns 404 for non-existent notification', async () => {
    const res = await request(app)
      .patch('/api/v1/notifications/fake-id/read')
      .set('Cookie', userCookie);

    expect(res.status).toBe(404);
  });
});

// ── Mark All as Read ────────────────────────────────────────────────

describe('POST /api/v1/notifications/mark-all-read', () => {
  it('marks all as read → 200', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/mark-all-read')
      .set('Cookie', userCookie);

    expect(res.status).toBe(200);

    // Verify unread count is 0
    const list = await request(app)
      .get('/api/v1/notifications')
      .set('Cookie', userCookie);

    expect(list.body.unreadCount).toBe(0);
  });
});

// ── Preferences ─────────────────────────────────────────────────────

describe('GET /api/v1/notifications/preferences', () => {
  it('returns default preferences (all true)', async () => {
    const res = await request(app)
      .get('/api/v1/notifications/preferences')
      .set('Cookie', userCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(true);
    expect(res.body.data.sms).toBe(true);
    expect(res.body.data.inApp).toBe(true);
  });
});

describe('PATCH /api/v1/notifications/preferences', () => {
  it('updates email preference', async () => {
    const res = await request(app)
      .patch('/api/v1/notifications/preferences')
      .set('Cookie', userCookie)
      .send({ email: false });

    expect(res.status).toBe(200);

    // Verify it persisted
    const prefs = await request(app)
      .get('/api/v1/notifications/preferences')
      .set('Cookie', userCookie);

    expect(prefs.body.data.email).toBe(false);
  });

  it('updates multiple preferences at once', async () => {
    const res = await request(app)
      .patch('/api/v1/notifications/preferences')
      .set('Cookie', userCookie)
      .send({ email: false, sms: false });

    expect(res.status).toBe(200);
  });

  it('rejects empty body → 400', async () => {
    const res = await request(app)
      .patch('/api/v1/notifications/preferences')
      .set('Cookie', userCookie)
      .send({});

    expect(res.status).toBe(400);
  });
});

// ── Delete Notification ─────────────────────────────────────────────

describe('DELETE /api/v1/notifications/:id', () => {
  it('deletes a notification', async () => {
    await new Promise(r => setTimeout(r, 200));

    const list = await request(app)
      .get('/api/v1/notifications')
      .set('Cookie', userCookie);

    if (list.body.data.length === 0) return;

    const notifId = list.body.data[0].id;

    const res = await request(app)
      .delete(`/api/v1/notifications/${notifId}`)
      .set('Cookie', userCookie);

    expect(res.status).toBe(200);
  });
});
