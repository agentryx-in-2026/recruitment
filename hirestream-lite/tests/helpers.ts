import express from 'express';
import session from 'express-session';
import { passport } from '../server/config/passport.config';
import { mobileBearer } from '../server/middleware/mobileBearer.middleware';
import { storage } from '../server/storage';
import authRouter from '../server/routes/auth.routes';
import publicConfigRouter from '../server/routes/public-config.routes';
import candidateRouter from '../server/routes/candidate.routes';
import adminRouter from '../server/routes/admin.routes';
import adminOversightRouter from '../server/routes/admin-oversight.routes';
import agencyRouter from '../server/routes/agency.routes';
import jobRouter from '../server/routes/job.routes';
import notificationRouter from '../server/routes/notification.routes';
import documentRouter from '../server/routes/document.routes';
import applicationRouter from '../server/routes/application.routes';
import driveRouter from '../server/routes/drive.routes';
import reportsRouter from '../server/routes/admin/reports';
import auditRouter from '../server/routes/admin/audit';
import grievanceRouter from '../server/routes/grievance.routes';
import contentRouter from '../server/routes/content.routes';
import superadminRouter from '../server/routes/superadmin.routes';
import superadminOpsRouter from '../server/routes/superadmin-ops.routes';
import resumeParserRouter from '../server/routes/resume-parser.routes';
import agentProductivityRouter from '../server/routes/agent-productivity.routes';
import employerRouter from '../server/routes/employer.routes';
import matchingRouter from '../server/routes/matching.routes';
import candidateSelfServiceRouter from '../server/routes/candidate-self-service.routes';
import mobileAuthRouter from '../server/routes/mobile-auth.routes';
import mobilePushRouter from '../server/routes/mobile-push.routes';
import mobileConfigRouter from '../server/routes/mobile-config.routes';
import { errorHandler } from '../server/middleware/errorHandler.middleware';
import { sanitizeRequest } from '../server/middleware/sanitize.middleware';
import {
  users, candidates, documents, jobs, applications,
  recruitmentAgents, employers, notifications,
  candidateEducation, candidateExperience,
  recruitmentDrives, interviews, placements,
  grievances, auditLog, faq, announcements, trainingEvents,
  otpCodes, passwordResetTokens,
  mobileRefreshTokens, mobilePushTokens,
} from '../shared/schema';
import { sql } from 'drizzle-orm';

/**
 * Creates a fully configured Express app for integration testing.
 * Uses the test database (set in tests/setup.ts).
 */
export function createTestApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(sanitizeRequest);

  app.use(
    session({
      secret: 'test-session-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    })
  );

  app.use(mobileBearer);
  app.use(passport.initialize());
  app.use(passport.session());

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/config', publicConfigRouter);
  app.use('/api/v1/candidates', candidateRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/superadmin', superadminRouter);
  app.use('/api/v1/superadmin/ops', superadminOpsRouter);
  app.use('/api/v1/agencies', agencyRouter);
  app.use('/api/v1/jobs', jobRouter);
  app.use('/api/v1/notifications', notificationRouter);
  app.use('/api/v1/candidates/documents', documentRouter);
  app.use('/api/v1/applications', applicationRouter);
  app.use('/api/v1/drives', driveRouter);
  app.use('/api/v1/admin/reports', reportsRouter);
  app.use('/api/v1/admin/audit', auditRouter);
  app.use('/api/v1/admin/oversight', adminOversightRouter);
  app.use('/api/v1/grievances', grievanceRouter);
  app.use('/api/v1/content', contentRouter);
  app.use('/api/v1/resume', resumeParserRouter);
  app.use('/api/v1/agent', agentProductivityRouter);
  app.use('/api/v1/employer', employerRouter);
  app.use('/api/v1/matching', matchingRouter);
  app.use('/api/v1/me', candidateSelfServiceRouter);
  // Mobile API routes
  app.use('/api/v1/mobile/auth', mobileAuthRouter);
  app.use('/api/v1/mobile/push', mobilePushRouter);
  app.use('/api/v1/mobile', mobileConfigRouter);

  app.use(errorHandler);

  return app;
}

/**
 * Truncates all tables in the test database (order matters for FK constraints).
 * Fast: keeps schema, just removes data.
 */
export async function truncateAllTables(): Promise<void> {
  const db = storage.db;
  if (!db) throw new Error('No database connection — is TEST_DATABASE_URL set?');

  await db.execute(sql`
    TRUNCATE TABLE
      system_settings,
      agency_reviews,
      saved_jobs,
      password_reset_tokens,
      otp_codes,
      audit_log,
      announcements,
      training_events,
      faq,
      grievances,
      placements,
      interviews,
      recruitment_drives,
      candidate_experience,
      candidate_education,
      notifications,
      applications,
      documents,
      recruitment_agents,
      employers,
      candidates,
      jobs,
      mobile_refresh_tokens,
      mobile_push_tokens,
      users
    CASCADE
  `);

  // TRUNCATE users CASCADE wipes country_info too (because country_info
  // has a FK on updated_by → users.id). Re-seed the destinations tests
  // actually use, then reload the country validator's in-memory cache.
  // Without this, every job-create with a country fails as UNKNOWN_COUNTRY.
  const { countryInfo } = await import('../shared/schema');
  const { loadValidCountries } = await import('../server/services/country-validator.service');
  const TEST_COUNTRIES = [
    { code: 'AE', name: 'United Arab Emirates' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'US', name: 'United States of America' },
    { code: 'CA', name: 'Canada' },
    { code: 'DE', name: 'Germany' },
    { code: 'SA', name: 'Saudi Arabia' },
    { code: 'QA', name: 'Qatar' },
    { code: 'OM', name: 'Oman' },
    { code: 'KW', name: 'Kuwait' },
    { code: 'BH', name: 'Bahrain' },
    { code: 'SG', name: 'Singapore' },
    { code: 'AU', name: 'Australia' },
    { code: 'NZ', name: 'New Zealand' },
    { code: 'JP', name: 'Japan' },
    { code: 'MY', name: 'Malaysia' },
    { code: 'IL', name: 'Israel' },
    { code: 'MV', name: 'Maldives' },
    { code: 'IE', name: 'Ireland' },
  ];
  for (const c of TEST_COUNTRIES) {
    await db.insert(countryInfo).values({ code: c.code, name: c.name, isActive: true }).onConflictDoNothing();
  }
  await loadValidCountries();

  // HP-3: TRUNCATE wiped system_settings, resetting the capability flags to
  // their single-agency HP defaults (employer + agency self-registration OFF).
  // The inherited Jest suite exercises the PRESERVED multi-role marketplace
  // (it registers employer/agent users), so enable those capabilities in the
  // test env. updateSetting writes the DB row AND the in-memory settings cache
  // that the register gate reads. The disabled-default behaviour is covered
  // explicitly by tests/integration/capability-gating.test.ts.
  const { updateSetting } = await import('../server/services/settings.service');
  await updateSetting('capability.employer_self_registration', true);
  await updateSetting('capability.agency_self_registration', true);
  await updateSetting('capability.agency_mode', 'marketplace');
}

/**
 * Returns the raw drizzle db instance for direct queries in tests.
 */
export function getDb() {
  const db = storage.db;
  if (!db) throw new Error('No database connection — is TEST_DATABASE_URL set?');
  return db;
}
