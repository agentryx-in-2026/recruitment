import { describe, beforeAll, beforeEach, it, expect } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { createTestApp, truncateAllTables, getDb } from '../helpers';
import { documents } from '../../shared/schema';

let app: Express;
let candidateCookie: string[];

// Create a small test PDF-like file
const TEST_FILE_DIR = path.resolve(process.cwd(), 'tests/fixtures');
const TEST_FILE_PATH = path.join(TEST_FILE_DIR, 'test-cv.pdf');

beforeAll(async () => {
  app = createTestApp();

  // Ensure the committed fixture exists; create it only if missing. Do NOT
  // delete it in afterAll — test-cv.pdf is a committed asset (a fresh clone
  // ships it), and unlinking it here would stage a spurious deletion after
  // every `npm test` run.
  await fs.mkdir(TEST_FILE_DIR, { recursive: true });
  try {
    await fs.access(TEST_FILE_PATH);
  } catch {
    await fs.writeFile(TEST_FILE_PATH, Buffer.from('%PDF-1.4 test content'));
  }
});

beforeEach(async () => {
  await truncateAllTables();

  // Register a candidate and get session cookie
  const regRes = await request(app)
    .post('/api/v1/auth/register')
    .send({ email: 'candidate@test.com', password: 'Test@123', role: 'candidate' });

  candidateCookie = regRes.headers['set-cookie'] as unknown as string[];

  // Create candidate profile (required for document upload)
  await request(app)
    .patch('/api/v1/candidates/profile')
    .set('Cookie', candidateCookie)
    .send({ fullName: 'Test Candidate', email: 'candidate@test.com' });
});

describe('POST /api/v1/candidates/documents', () => {
  it('uploads a file → 201', async () => {
    const res = await request(app)
      .post('/api/v1/candidates/documents')
      .set('Cookie', candidateCookie)
      .field('type', 'cv')
      .attach('file', TEST_FILE_PATH);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.type).toBe('cv');
    expect(res.body.data.fileName).toBe('test-cv.pdf');
    expect(res.body.data.fileUrl).toMatch(/^\/uploads\//);
  });

  it('rejects upload without authentication → 401', async () => {
    const res = await request(app)
      .post('/api/v1/candidates/documents')
      .field('type', 'cv')
      .attach('file', TEST_FILE_PATH);

    expect(res.status).toBe(401);
  });

  it('rejects upload without a file → 400', async () => {
    const res = await request(app)
      .post('/api/v1/candidates/documents')
      .set('Cookie', candidateCookie)
      .field('type', 'cv');

    expect(res.status).toBe(400);
  });

  it('rejects invalid document type → 400', async () => {
    const res = await request(app)
      .post('/api/v1/candidates/documents')
      .set('Cookie', candidateCookie)
      .field('type', 'invalid_type')
      .attach('file', TEST_FILE_PATH);

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/candidates/documents', () => {
  it('returns empty list for new candidate → 200', async () => {
    const res = await request(app)
      .get('/api/v1/candidates/documents')
      .set('Cookie', candidateCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  it('returns uploaded documents', async () => {
    // Upload a file first
    await request(app)
      .post('/api/v1/candidates/documents')
      .set('Cookie', candidateCookie)
      .field('type', 'cv')
      .attach('file', TEST_FILE_PATH);

    const res = await request(app)
      .get('/api/v1/candidates/documents')
      .set('Cookie', candidateCookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].type).toBe('cv');
  });

  it('rejects unauthenticated request → 401', async () => {
    const res = await request(app).get('/api/v1/candidates/documents');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/candidates/documents/:id/download', () => {
  it('downloads an uploaded file', async () => {
    // Upload first
    const uploadRes = await request(app)
      .post('/api/v1/candidates/documents')
      .set('Cookie', candidateCookie)
      .field('type', 'cv')
      .attach('file', TEST_FILE_PATH);

    const docId = uploadRes.body.data.id;

    const res = await request(app)
      .get(`/api/v1/candidates/documents/${docId}/download`)
      .set('Cookie', candidateCookie);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('test-cv.pdf');
  });

  it('returns 404 for non-existent document', async () => {
    const res = await request(app)
      .get('/api/v1/candidates/documents/nonexistent-id/download')
      .set('Cookie', candidateCookie);

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/candidates/documents/:id', () => {
  it('deletes an uploaded document', async () => {
    // Upload first
    const uploadRes = await request(app)
      .post('/api/v1/candidates/documents')
      .set('Cookie', candidateCookie)
      .field('type', 'cv')
      .attach('file', TEST_FILE_PATH);

    const docId = uploadRes.body.data.id;

    const res = await request(app)
      .delete(`/api/v1/candidates/documents/${docId}`)
      .set('Cookie', candidateCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify it's gone
    const listRes = await request(app)
      .get('/api/v1/candidates/documents')
      .set('Cookie', candidateCookie);

    expect(listRes.body.data).toHaveLength(0);
  });

  it('returns 404 for non-existent document', async () => {
    const res = await request(app)
      .delete('/api/v1/candidates/documents/nonexistent-id')
      .set('Cookie', candidateCookie);

    expect(res.status).toBe(404);
  });

  it('prevents deleting another candidate\'s document', async () => {
    // Upload as candidate 1
    const uploadRes = await request(app)
      .post('/api/v1/candidates/documents')
      .set('Cookie', candidateCookie)
      .field('type', 'cv')
      .attach('file', TEST_FILE_PATH);

    const docId = uploadRes.body.data.id;

    // Register candidate 2
    const reg2 = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'other@test.com', password: 'Test@123', role: 'candidate' });

    const otherCookie = reg2.headers['set-cookie'] as unknown as string[];

    // Create profile for candidate 2
    await request(app)
      .patch('/api/v1/candidates/profile')
      .set('Cookie', otherCookie)
      .send({ fullName: 'Other Candidate', email: 'other@test.com' });

    // Try to delete candidate 1's doc as candidate 2
    const res = await request(app)
      .delete(`/api/v1/candidates/documents/${docId}`)
      .set('Cookie', otherCookie);

    expect(res.status).toBe(403);
  });
});
