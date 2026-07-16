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

async function loginAsCandidate() {
  const db = getDb();
  const hashedPw = await bcrypt.hash('Test@1234', 10);
  await db.insert(users).values({
    username: 'parse_test',
    email: 'parse@hirestream.test',
    password: hashedPw,
    role: 'candidate',
  });

  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send({
    username: 'parse_test',
    password: 'Test@1234',
  });
  return agent;
}

describe('POST /api/v1/resume/parse', () => {
  it('rejects unauthenticated → 401', async () => {
    const res = await request(app).post('/api/v1/resume/parse').send({ text: 'sample' });
    expect(res.status).toBe(401);
  });

  it('rejects missing text field → 400', async () => {
    const agent = await loginAsCandidate();
    const res = await agent.post('/api/v1/resume/parse').send({});
    expect(res.status).toBe(400);
  });

  it('extracts skills from resume text', async () => {
    const agent = await loginAsCandidate();
    const text = `
      John Doe
      Software Engineer
      Skills: React, Node.js, TypeScript, PostgreSQL, AWS, Docker
    `;
    const res = await agent.post('/api/v1/resume/parse').send({ text });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.extracted.skills).toEqual(
      expect.arrayContaining(['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'AWS', 'Docker'])
    );
  });

  it('extracts experience years from "5 years of experience"', async () => {
    const agent = await loginAsCandidate();
    const res = await agent.post('/api/v1/resume/parse').send({
      text: 'Experienced developer with 5 years of experience in fullstack development.',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.extracted.experience).toBe(5);
  });

  it('extracts experience from "10+ years exp"', async () => {
    const agent = await loginAsCandidate();
    const res = await agent.post('/api/v1/resume/parse').send({
      text: 'Senior architect, 10+ years exp leading distributed systems teams.',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.extracted.experience).toBe(10);
  });

  it('extracts email and phone', async () => {
    const agent = await loginAsCandidate();
    const res = await agent.post('/api/v1/resume/parse').send({
      text: 'Contact: jane@example.com, +91 9876543210',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.extracted.email).toBe('jane@example.com');
    expect(res.body.data.extracted.phone).toMatch(/9876543210/);
  });

  it('extracts degrees', async () => {
    const agent = await loginAsCandidate();
    const res = await agent.post('/api/v1/resume/parse').send({
      text: 'Education: B.Tech in CS from IIT Delhi, MBA from IIM Bangalore',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.extracted.degrees).toEqual(
      expect.arrayContaining(['B.Tech', 'MBA'])
    );
  });

  it('extracts preferred destination countries', async () => {
    const agent = await loginAsCandidate();
    const res = await agent.post('/api/v1/resume/parse').send({
      text: 'Open to opportunities in UAE, Canada, and Singapore.',
    });
    expect(res.status).toBe(200);
    // v0.7.4.2: resume parser normalises CV aliases ('UAE') → canonical
    // country_info names ('United Arab Emirates') so downstream matching
    // stays consistent. Input text still uses 'UAE' (what candidates write).
    expect(res.body.data.extracted.preferredCountries).toEqual(
      expect.arrayContaining(['United Arab Emirates', 'Canada', 'Singapore'])
    );
  });

  it('returns confidence scores', async () => {
    const agent = await loginAsCandidate();
    const res = await agent.post('/api/v1/resume/parse').send({
      text: 'React developer with 3 years experience. B.Tech from BITS.',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.confidence.skills).toBe('high');
    expect(res.body.data.confidence.experience).toBe('high');
    expect(res.body.data.confidence.degrees).toBe('high');
  });

  it('handles empty/short text gracefully', async () => {
    const agent = await loginAsCandidate();
    const res = await agent.post('/api/v1/resume/parse').send({ text: 'hello' });
    expect(res.status).toBe(200);
    expect(res.body.data.extracted.skills).toEqual([]);
    expect(res.body.data.extracted.degrees).toEqual([]);
  });
});
