import { describe, beforeAll, it, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '../server/routes';

describe('Auth Endpoints', () => {
  let app: express.Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    await registerRoutes(app);
  });

  it('should reject login without credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({});
    expect(res.status).toBe(400);
  });
  
  it('should reject registration with invalid data', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'invalid',
      password: 'short',
      name: 'User',
      username: 'usr'
    });
    expect(res.status).toBe(400);
  });
});
