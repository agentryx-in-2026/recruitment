/**
 * PWS §7.20 — Auto-match notifications.
 *
 * Called after a public job is created (agent-posted or derivative). Finds
 * candidates whose profile overlaps the job's skills and preferred country,
 * and dispatches the "job.matches_your_profile" event. Throttled to once per
 * candidate per day: we check audit_log for prior same-event dispatches.
 */

import { storage } from "../storage";
import { candidates, notifications } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";
import { fireEvent } from "./event-notifications.service";
import { logger } from "../config/logger.config";

const MIN_SKILL_OVERLAP = 2;       // candidate must share >= this many skills
const DAILY_CAP_PER_CANDIDATE = 1; // only one match-alert per candidate per 24h

export async function fireAutoMatchForJob(job: any): Promise<number> {
  const db = storage.db;
  if (!db) return 0;
  if (job.visibility !== "public" || job.status !== "active") return 0;

  try {
    const jobSkills = Array.isArray(job.skills) ? job.skills.map((s: any) => String(s).toLowerCase()) : [];
    if (jobSkills.length === 0) return 0;

    // Candidates opted in AND share at least one preferred country with the job's country.
    // Array overlap is expressed via the && operator in Postgres.
    const candidateRows: any = await db.execute(sql`
      SELECT c.id, c.user_id, c.full_name, c.email, c.skills, c.preferred_countries
      FROM candidates c
      WHERE c.open_to_outreach = true
        AND c.user_id IS NOT NULL
        AND c.skills IS NOT NULL
        AND (
          c.preferred_countries IS NULL
          OR ${job.country}::text = ANY(c.preferred_countries)
        )
    `);
    const rows: any[] = candidateRows.rows ?? candidateRows;

    let firedCount = 0;
    for (const c of rows) {
      const candSkills: string[] = (c.skills ?? []).map((s: any) => String(s).toLowerCase());
      const overlap = candSkills.filter((s) => jobSkills.includes(s)).length;
      if (overlap < MIN_SKILL_OVERLAP) continue;

      // Throttle: check if this candidate got a match-alert in the last 24h
      const cutoff = new Date(Date.now() - 86400000);
      const recent: any = await db.select().from(notifications)
        .where(and(
          eq(notifications.userId, c.user_id),
          eq(notifications.type, "job.matches_your_profile"),
        ));
      const recentRows = Array.isArray(recent) ? recent : [];
      const capped = recentRows.filter((n: any) => n.createdAt && new Date(n.createdAt) > cutoff).length >= DAILY_CAP_PER_CANDIDATE;
      if (capped) continue;

      await fireEvent("job.matches_your_profile", {
        job,
        candidate: { id: c.id, userId: c.user_id, fullName: c.full_name, email: c.email },
      });
      firedCount++;
    }

    if (firedCount > 0) {
      logger.info(`auto-match: job ${job.id} notified ${firedCount} candidate(s) (overlap >= ${MIN_SKILL_OVERLAP})`);
    }
    return firedCount;
  } catch (err) {
    logger.error(`auto-match failed for job ${job?.id}: ${err}`);
    return 0;
  }
}
