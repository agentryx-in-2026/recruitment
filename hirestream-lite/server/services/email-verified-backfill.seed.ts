/**
 * Grandfather accounts that predate email verification — UAT-05 item 1.
 *
 * Verification gates APPLYING. Accounts created before the feature existed were
 * never given a chance to confirm, so switching the gate on retroactively locks
 * them out of applying for something they did nothing wrong to lose.
 *
 * ── Why this is a boot seed and not a one-off ───────────────────────────────
 * The original backfill was a psql command run by hand against the UAT database
 * on 2026-07-19. That fixed the box it was typed on and nothing else: a fresh
 * deploy, a restored dump, or HPSEDC's production instance would come up with
 * every pre-existing user unverified and blocked at apply, with no error a
 * candidate could act on. An audit caught it precisely because all 113
 * timestamps were identical — the signature of a manual fix living in no
 * migration.
 *
 * ── Why a one-shot marker rather than a date cutoff ────────────────────────
 * The obvious implementation — grandfather everyone older than the first
 * verified user — is subtly wrong. If verification is ever switched OFF for a
 * period, real unverified users accumulate; the next boot would then treat them
 * as legacy and mark them verified, silently disabling the feature for exactly
 * the people it was meant to cover. A marker in system_settings makes this run
 * exactly once per database, whatever happens afterwards.
 */
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import { logger } from "../config/logger.config";

const MARKER_KEY = "_internal.email_verified_backfill_done";

export async function backfillEmailVerified(): Promise<void> {
  const db = storage.db;
  if (!db) return;

  // Schema push may not have run yet; boot must not depend on that ordering.
  const col: any = await db.execute(sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email_verified' LIMIT 1
  `);
  if (!col?.rows?.length) return;

  const done: any = await db.execute(sql`
    SELECT 1 FROM system_settings WHERE key = ${MARKER_KEY} LIMIT 1
  `);
  if (done?.rows?.length) return;

  const result: any = await db.execute(sql`
    UPDATE users
       SET email_verified = true,
           email_verified_at = COALESCE(email_verified_at, now())
     WHERE email_verified IS NOT TRUE
  `);

  await db.execute(sql`
    INSERT INTO system_settings (key, value, description, category)
    VALUES (${MARKER_KEY}, 'true',
            'One-shot: pre-verification accounts were grandfathered. Never re-run — see email-verified-backfill.seed.ts.',
            'internal')
    ON CONFLICT (key) DO NOTHING
  `);

  const n = result?.rowCount ?? 0;
  logger.info(`Email-verification backfill: grandfathered ${n} pre-existing account(s) (one-shot).`);
}
