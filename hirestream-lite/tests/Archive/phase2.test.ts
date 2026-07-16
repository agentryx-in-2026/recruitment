import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { registerRoutes } from '../server/routes';
import session from 'express-session';
import passport from 'passport';
import { storage } from '../server/storage';
import { users, candidates, recruitmentAgents, jobs, applications } from '../shared/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

const app = express();
app.use(express.json());

let cookieAdmin: string;
let cookieCandidate: string;
let cookieAgent: string;

beforeAll(async () => {
    // Setup Express application specifically for integration testing
    app.use(session({
      secret: "test_secret",
      resave: false,
      saveUninitialized: false,
    }));
    app.use(passport.initialize());
    app.use(passport.session());
    await registerRoutes(app);

    // Clean up completely before tests to prevent collision
    if (storage.db) {
       await storage.db.delete(applications);
       await storage.db.delete(jobs);
       await storage.db.delete(recruitmentAgents);
       await storage.db.delete(candidates);
       await storage.db.delete(users);
    }

    // 1. Register candidate
    const regCand = await request(app)
      .post('/api/v1/auth/register')
      .send({ password: 'password123', email: 'c2@test.com', role: 'candidate' });
      
    if (regCand.status !== 201) console.error("Reg Cand Failed:", regCand.body);

    let loginCand = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'c2@test.com', password: 'password123' });
    
    if (loginCand.status !== 200) console.error("Login Cand Failed:", loginCand.body);
    cookieCandidate = loginCand.headers['set-cookie']?.[0] || "";

    // 2. Register agent
    const regAgent = await request(app)
      .post('/api/v1/auth/register')
      .send({ password: 'password123', email: 'a2@test.com', role: 'agent' });
      
    if (regAgent.status !== 201) console.error("Reg Agent Failed:", regAgent.body);
    
    let loginAgent = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'a2@test.com', password: 'password123' });
      
    if (loginAgent.status !== 200) console.error("Login Agent Failed:", loginAgent.body);
    cookieAgent = loginAgent.headers['set-cookie']?.[0] || "";

    // 3. Admin override in DB
    // Hack: Wait, registerSchema does not allow role="admin" (enum is ["candidate", "agent", "employer"]).
    // Therefore, register as "employer" or "candidate" directly via storage with hashed pass, OR use bypass
    const hashed = await bcrypt.hash('password123', 12);
    const adminUser = await storage.createUser({ 
       username: 'admin2@test.com', 
       password: hashed, 
       email: 'admin2@test.com', 
       role: 'admin' 
    });
    
    let loginAdmin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin2@test.com', password: 'password123' });
    cookieAdmin = loginAdmin.headers['set-cookie']?.[0] || "";
});

describe('M1: Candidate Profiles', () => {
  it('should patch candidate profile', async () => {
    const res = await request(app)
      .patch('/api/v1/candidates/profile')
      .set('Cookie', cookieCandidate)
      .send({
        skills: ["Node", "React", "C++"],
        experience: 5
      });
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.skills).toContain("Node");
    expect(res.body.data.experience).toBe(5);
  });

  it('should get candidate profile', async () => {
    const res = await request(app)
      .get('/api/v1/candidates/profile')
      .set('Cookie', cookieCandidate);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.skills).toContain("Node");
  });
});

describe('M2: Agency Management', () => {
  it('should register agency with license', async () => {
    const res = await request(app)
      .post('/api/v1/agencies/register')
      .set('Cookie', cookieAgent)
      .send({
        agencyName: "Global Placements",
        licenseNumber: "LICENSE-XYZ"
      });
    
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.licenseNumber).toBe("LICENSE-XYZ");
    expect(res.body.data.verified).toBe(false);
  });
});

describe('M3: Job Management', () => {
  it('should reject unverified agency from posting jobs', async () => {
    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Cookie', cookieAgent)
      .send({
        title: "Software Engineer",
        company: "Tech Corp",
        location: "Dubai",
        country: "United Arab Emirates",
        salary: "Open"
      });
    
    expect(res.status).toBe(403);
    expect(res.body.message).toContain("must be verified");
  });

  it('should allow verified agency to post jobs', async () => {
    // Manually verify agent via database
    const user = await storage.getUserByUsername('a2@test.com');
    await storage.db.update(recruitmentAgents).set({ verified: true }).where(eq(recruitmentAgents.userId, user!.id));

    const res = await request(app)
      .post('/api/v1/jobs')
      .set('Cookie', cookieAgent)
      .send({
        title: "Software Engineer",
        company: "Tech Corp",
        location: "Dubai",
        country: "United Arab Emirates",
        salary: "$5000",
      });
    
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe("Software Engineer");
  });

  it('should list active jobs', async () => {
     const res = await request(app)
       .get('/api/v1/jobs')
       .set('Cookie', cookieCandidate);

     expect(res.status).toBe(200);
     expect(res.body.success).toBe(true);
     expect(res.body.data.length).toBeGreaterThan(0);
     expect(res.body.data[0].title).toBe("Software Engineer");
  });
});

describe('M4: Job Applications', () => {
  it('should allow candidate to apply to a job', async () => {
     // Get active jobs
     const jobsRes = await request(app).get('/api/v1/jobs').set('Cookie', cookieCandidate);
     const jobId = jobsRes.body.data[0].id;
     
     // Candidate applying to job
     const applyRes = await request(app)
       .post(`/api/v1/jobs/${jobId}/apply`)
       .set('Cookie', cookieCandidate);
       
     expect(applyRes.status).toBe(201);
     expect(applyRes.body.success).toBe(true);
     expect(applyRes.body.data.status).toBe("submitted");
     expect(applyRes.body.data.jobId).toBe(jobId);
  });
  
  it('should prevent duplicate applications', async () => {
     const jobsRes = await request(app).get('/api/v1/jobs').set('Cookie', cookieCandidate);
     const jobId = jobsRes.body.data[0].id;
     
     const applyRes = await request(app)
       .post(`/api/v1/jobs/${jobId}/apply`)
       .set('Cookie', cookieCandidate);
       
     expect(applyRes.status).toBe(400); // Bad Request because already applied
     expect(applyRes.body.success).toBe(false);
  });
});

describe('M2-Extended: Agency Self-Service', () => {
  it('should return agent own agency details via /me', async () => {
    const res = await request(app)
      .get('/api/v1/agencies/me')
      .set('Cookie', cookieAgent);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.agencyName).toBe("Global Placements");
  });

  it('should reject /me for non-agent roles', async () => {
    const res = await request(app)
      .get('/api/v1/agencies/me')
      .set('Cookie', cookieCandidate);

    expect(res.status).toBe(403);
  });
});

describe('Admin: Agency Approval Workflow', () => {
  it('should list all agencies for admin review', async () => {
    const res = await request(app)
      .get('/api/v1/admin/agencies')
      .set('Cookie', cookieAdmin);
      
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('should verify an agency via admin approval', async () => {
    // Get agencies list
    const listRes = await request(app)
      .get('/api/v1/admin/agencies')
      .set('Cookie', cookieAdmin);
    
    const agencyId = listRes.body.data[0].id;

    // First set to unverified (reset from M3 test that verified it)
    await request(app)
      .patch(`/api/v1/admin/agencies/${agencyId}/verify`)
      .set('Cookie', cookieAdmin)
      .send({ verified: false });

    // Confirm it's unverified
    const unverifiedRes = await request(app)
      .get('/api/v1/agencies/me')
      .set('Cookie', cookieAgent);
    expect(unverifiedRes.body.data.verified).toBe(false);

    // Admin approves
    const approveRes = await request(app)
      .patch(`/api/v1/admin/agencies/${agencyId}/verify`)
      .set('Cookie', cookieAdmin)
      .send({ verified: true });
      
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.verified).toBe(true);
    
    // Agent can now see verified status
    const verifiedRes = await request(app)
      .get('/api/v1/agencies/me')
      .set('Cookie', cookieAgent);
    expect(verifiedRes.body.data.verified).toBe(true);
  });

  it('should reject invalid verify payload', async () => {
    const listRes = await request(app)
      .get('/api/v1/admin/agencies')
      .set('Cookie', cookieAdmin);
    const agencyId = listRes.body.data[0].id;

    const res = await request(app)
      .patch(`/api/v1/admin/agencies/${agencyId}/verify`)
      .set('Cookie', cookieAdmin)
      .send({ verified: "yes" }); // invalid: not boolean

    expect(res.status).toBe(400);
  });
});

describe('M5: Notifications', () => {
  let notificationId: string;

  it('should fetch notifications for user', async () => {
    // Generate a test notification first using direct DB or rely on the job apply one
    // Since we applied for a job in M4 using candidate user, there should be an application_update notification
    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Cookie', cookieCandidate);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Because M4 ran earlier, this user should have a notification from it!
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].type).toBe("application_update");
    expect(res.body.data[0].read).toBe(false);
    
    notificationId = res.body.data[0].id;
  });

  it('should mark a notification as read', async () => {
    const res = await request(app)
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set('Cookie', cookieCandidate);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.read).toBe(true);
  });

  it('should mark all notifications as read', async () => {
    const res = await request(app)
      .post('/api/v1/notifications/mark-all-read')
      .set('Cookie', cookieCandidate);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const checkRes = await request(app)
      .get('/api/v1/notifications')
      .set('Cookie', cookieCandidate);

    expect(checkRes.body.unreadCount).toBe(0);
  });
});

afterAll(async () => {
  if (storage.db) {
    const { notifications } = await import('../shared/schema');
    await storage.db.delete(notifications);
    await storage.db.delete(applications);
    await storage.db.delete(jobs);
    await storage.db.delete(recruitmentAgents);
    await storage.db.delete(candidates);
    await storage.db.delete(users);
  }
});
