/**
 * Placement auto-create — v0.4.14.0 hotfix
 *
 * Background: before this fix, transitioning an application to "selected"
 * left the employer at a dead end. The UI said "Selected — issue offer
 * from Placements tab" but Placements tab only showed manually-seeded
 * rows. There was no UI to create a placement, so newly-selected
 * candidates never reached the offer-letter / appointment-letter flow.
 *
 * Fix: as soon as an application transitions to "selected", insert a
 * placeholder placement row. Defaults come from the parent job
 * (country, salary) so the employer doesn't even need to fill anything
 * to issue an offer letter — they can just Download Template PDF or Set
 * URL right away. The new PATCH /api/v1/agent/placements/:id endpoint
 * lets them refine country / salary / startDate later.
 *
 * Idempotent: if a placement row already exists for the application,
 * this is a no-op. Safe to call from every transition handler.
 */

import { storage } from "../storage";
import { placements, applications, jobs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../config/logger.config";
import { notify } from "./notification.service";
import { candidates } from "@shared/schema";

export interface PlacementAutoCreateResult {
  created: boolean;
  placementId?: string;
  reason?: string;
}

/**
 * Ensure a placement row exists for the given application.
 * - Caller should already have validated that the application is in
 *   "selected" status. We re-check here defensively so callers can pass
 *   the id without worrying about the current state.
 * - Safe to call multiple times — only inserts if no row exists.
 */
export async function ensurePlacementForApplication(
  applicationId: string
): Promise<PlacementAutoCreateResult> {
  const db = storage.db;
  if (!db) return { created: false, reason: "no_db" };

  try {
    // Already has a placement? Done.
    const existing = await db
      .select({ id: placements.id })
      .from(placements)
      .where(eq(placements.applicationId, applicationId))
      .limit(1);
    if (existing.length > 0) {
      return { created: false, placementId: existing[0].id, reason: "already_exists" };
    }

    // Defensive: only create when application is actually selected
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);
    if (!app) return { created: false, reason: "application_not_found" };
    if (app.status !== "selected") {
      return { created: false, reason: `application_status_${app.status}` };
    }

    // Pull job for defaults (country + salary)
    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, app.jobId!))
      .limit(1);

    // audit 2026-07-06 (Batch 4B): stamp the offer validity deadline (same
    // rule as the manual POST /drives/placements path). 0 days = no expiry.
    const { getSetting } = await import("./settings.service");
    const validityDays: number = await getSetting("placement.offer_validity_days");
    const offerExpiresAt = validityDays > 0 ? new Date(Date.now() + validityDays * 86400_000) : null;

    const [row] = await db
      .insert(placements)
      .values({
        applicationId,
        country: job?.country || "TBD",
        salary: job?.salary || null,
        appointmentLetterUrl: null,
        startDate: null,
        status: "offered",
        offerExpiresAt,
      })
      .returning();

    logger.info(
      `placement auto-created: ${row.id} for application ${applicationId} (country=${row.country})`
    );

    // Notify the candidate that they have an offer to act on. Best-effort.
    try {
      if (app.candidateId) {
        const [cand] = await db
          .select()
          .from(candidates)
          .where(eq(candidates.id, app.candidateId))
          .limit(1);
        if (cand?.userId && job) {
          await notify({
            userId: cand.userId,
            type: "application_update",
            title: "Offer issued",
            message: `An offer has been issued for "${job.title}" at ${job.company}. Please review on your dashboard.`,
            severity: "positive" as any,
            metadata: { applicationId, placementId: row.id, jobId: app.jobId },
          });
        }
      }
    } catch (e: any) {
      logger.warn(`placement auto-create notify failed: ${e?.message}`);
    }

    return { created: true, placementId: row.id };
  } catch (err: any) {
    logger.error(`ensurePlacementForApplication(${applicationId}) failed: ${err?.message}`);
    return { created: false, reason: "exception" };
  }
}
