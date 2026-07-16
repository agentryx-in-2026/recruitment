/**
 * Grievance auto-router.
 *
 * Maps a (category, metadata) pair to the user_id that should own the
 * grievance, instead of dumping every complaint into the admin's queue.
 *
 * Rules (FRS §2.6 + operational refinements from the May 25 design pass):
 *
 *   application_issue + metadata.applicationId
 *      → the AGENT who owns the application's job. They can move the
 *        status / unblock the candidate in one click. If we can't resolve
 *        the agent (orphan application, parent requisition only, etc.) we
 *        fall through to admin.
 *
 *   technical_problem
 *      → the user configured via system_settings.grievance.technical_owner_user_id
 *        (typically an Agentryx delivery contact). Admin stays cc'd via the
 *        full-list view (superadmin god-view always sees it too). Falls back
 *        to admin if the setting isn't configured.
 *
 *   fraud_report
 *      → admin (priority — already auto-adds to the fraud watchlist in
 *        v0.8.0 via report-job flow; this just makes admin the owner).
 *
 *   agency_complaint, policy_inquiry, other
 *      → admin (regulatory / policy / triage).
 *
 * If the resolver returns null, the route handler leaves assigned_to NULL —
 * any admin can claim from the unassigned queue.
 */

import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { applications, jobs, users } from "@shared/schema";
import { logger } from "../config/logger.config";
import { getSetting } from "./settings.service";

export type GrievanceCategory =
  | "application_issue"
  | "recruitment_problem"   // single-agency reframe (replaces agency_complaint)
  | "workplace_abuse"       // deployed-worker abuse: unpaid wages, passport held, unsafe
  | "technical_problem"
  | "policy_inquiry"
  | "fraud_report"
  | "other"
  | "agency_complaint";     // legacy — accepted for historical rows

export interface AutoRouteResult {
  assignedToUserId: string | null;
  reason: string;  // human-readable, written to grievance.admin_notes
}

/** Returns the user_id that should own this grievance, plus a one-line reason
 *  that gets stamped on `admin_notes` so any operator can see WHY it routed
 *  where it did. Never throws — failures default to admin queue. */
export async function autoRouteGrievance(
  category: GrievanceCategory | string,
  metadata: Record<string, any> = {},
): Promise<AutoRouteResult> {
  const db = storage.db;
  if (!db) return { assignedToUserId: null, reason: "DB unavailable — routed to admin queue" };

  try {
    if (category === "application_issue") {
      const appId = String(metadata?.applicationId || "").trim();
      if (appId) {
        // Resolve job → agent_id (which IS a users.id). Returning the user_id
        // directly because `grievances.assigned_to` references users(id).
        const rows = await db
          .select({ agentId: jobs.agentId })
          .from(applications)
          .innerJoin(jobs, eq(jobs.id, applications.jobId))
          .where(eq(applications.id, appId))
          .limit(1);
        const agentId = rows[0]?.agentId;
        if (agentId) {
          return {
            assignedToUserId: agentId,
            reason: `auto-routed: application_issue on application ${appId.slice(0, 8)} → agent who owns the job`,
          };
        }
      }
      return {
        assignedToUserId: null,
        reason: "application_issue with no resolvable application/agent — routed to admin queue",
      };
    }

    if (category === "technical_problem") {
      const techOwnerId = (await getSetting<string>("grievance.technical_owner_user_id")) || "";
      if (techOwnerId.trim()) {
        // Confirm the user exists + still has a valid role; otherwise admin.
        const [u] = await db.select().from(users).where(eq(users.id, techOwnerId.trim())).limit(1);
        if (u) {
          return {
            assignedToUserId: u.id,
            reason: `auto-routed: technical_problem → ${u.username} (configured grievance.technical_owner_user_id)`,
          };
        }
        logger.warn(`grievance.technical_owner_user_id="${techOwnerId}" doesn't resolve to a user — falling back to admin`);
      }
      return {
        assignedToUserId: null,
        reason: "technical_problem — configure grievance.technical_owner_user_id setting to auto-route; admin queue for now",
      };
    }

    // fraud_report, recruitment_problem, workplace_abuse, policy_inquiry, other
    // (+ legacy agency_complaint) → admin queue. fraud_report and workplace_abuse
    // are the priority buckets HPSEDC must act on fastest (tout/fee fraud and
    // deployed-worker safety); the admin grievances tab surfaces them first.
    // We don't pin to a specific admin user_id because there's usually >1 and
    // the admin grievances tab handles the unassigned bucket as a queue.
    return {
      assignedToUserId: null,
      reason: `auto-routed: ${category} → admin queue (no specific owner)`,
    };
  } catch (err: any) {
    logger.error(`autoRouteGrievance failed: ${err?.message || err}`);
    return { assignedToUserId: null, reason: "auto-route error — defaulted to admin queue" };
  }
}

/** Resolves the per-category SLA in days. Used by the (future) SLA-aging
 *  cron + by the UI to render aging badges. Defaults are sane; admin can
 *  tune via settings. */
export async function slaDaysForCategory(category: string): Promise<number> {
  const overrides: Record<string, string> = {
    application_issue: "grievance.sla_days_application_issue",
    technical_problem: "grievance.sla_days_technical",
    fraud_report:      "grievance.sla_days_fraud",
  };
  const settingKey = overrides[category];
  if (settingKey) {
    const v = await getSetting<number>(settingKey);
    if (typeof v === "number" && v > 0) return v;
  }
  const fallback = await getSetting<number>("grievance.sla_days_default");
  return typeof fallback === "number" && fallback > 0 ? fallback : 7;
}
