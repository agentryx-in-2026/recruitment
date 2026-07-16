import { config } from 'dotenv';
import path from 'path';

// Load .env file BEFORE anything else
config({ path: path.resolve(process.cwd(), '.env') });

// Ensure we are in test environment
process.env.NODE_ENV = 'test';

// Use test database — override DATABASE_URL so the app uses hirestream_test
if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must be defined in .env for tests');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// Seed minimal country_info + load the validator cache before any test runs.
// Reason: v0.7.3.2 added jobs.country validation against country_info; if the
// test DB's country_info is empty (which it is on fresh test runs) or the
// validator cache hasn't loaded, EVERY job-create with a non-empty country
// gets rejected as UNKNOWN_COUNTRY and ~170 tests fail with cryptic
// "Cannot read .id of undefined" errors.
//
// Test-friendly minimal seed: just the country names tests actually use. Idempotent.
beforeAll(async () => {
  const { storage } = await import('../server/storage');
  const { countryInfo } = await import('../shared/schema');
  const { loadValidCountries } = await import('../server/services/country-validator.service');
  const db = (storage as any).db;
  if (!db) return; // MemStorage fallback; nothing to seed
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

  // HP-3: the inherited multi-role suite registers employer/agent users, which
  // the register gate blocks under HP's single-agency defaults. Enable the
  // capability flags in the test env (baseline for suites that don't truncate;
  // truncateAllTables re-enables them after each wipe). Disabled-default
  // behaviour is covered by tests/integration/capability-gating.test.ts.
  const { updateSetting } = await import('../server/services/settings.service');
  await updateSetting('capability.employer_self_registration', true);
  await updateSetting('capability.agency_self_registration', true);
  await updateSetting('capability.agency_mode', 'marketplace');
});
