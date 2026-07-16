/**
 * PWS §5 — Central event notification engine.
 *
 * Single entry point: fireEvent(eventKey, context) → looks up the admin-editable
 * templates for this event and delivers to the correct recipients. Templates are
 * stored in notification_templates and seeded with PWS defaults.
 *
 * Philosophy: route handlers describe what happened ("employer rejected shortlist"),
 * this service decides who hears about it and in what wording. That way the PWS
 * §5 matrix is enforced in one place instead of scattered across routes.
 */

import { storage } from "../storage";
import { notificationTemplates, notifications, candidates, recruitmentAgents, employers } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { notify } from "./notification.service";
import { logger } from "../config/logger.config";
import { getSetting } from "./settings.service";

export type RecipientRole = "candidate" | "agent" | "employer";

export interface EventContext {
  // The entity that triggered the event (lowest-level object available)
  job?: any;                // any agent job or employer requisition
  application?: any;
  placement?: any;
  interview?: any;
  // Resolved participants — any subset may be present
  candidate?: { id: string; userId?: string; fullName?: string; email?: string };
  agent?:     { id: string; userId?: string; agencyName?: string };
  employer?:  { id: string; userId?: string; companyName?: string };
  // Actor who caused the event (for audit)
  actorUserId?: string;
  actorRole?: string;
  // Extra interpolation vars
  extra?: Record<string, any>;
}

// Known event keys used by the PWS §5 matrix. Keep in sync with the seed.
// Severity assigned per event type. Drives the drawer color + banner urgency.
// Admin can still override per-template via the DB if a deployment disagrees.
export const EVENT_SEVERITY: Record<string, "info" | "positive" | "warning" | "urgent"> = {
  "application.submitted":         "info",
  "application.reviewed":          "info",
  "application.shortlisted":       "positive",
  "application.rejected":          "warning",
  "application.employer_approved": "positive",
  "application.employer_rejected": "urgent",
  "interview.scheduled":           "positive",
  "interview.completed":           "info",
  "application.selected":          "positive",
  "offer.issued":                  "positive",
  "offer.accepted":                "positive",
  "offer.declined":                "warning",
  "job.closed":                    "urgent",
  "job.auto_close_nudge":          "warning",
  "requisition.picked_up":         "info",
  "job.matches_your_profile":      "info",
};

// Events that auto-save so the user can't accidentally dismiss something
// consequential. Offers and interviews should stay around until handled.
export const AUTO_SAVE_EVENTS = new Set([
  "offer.issued", "offer.accepted",
  "application.selected",
  "interview.scheduled",
]);

export const EVENT_KEYS = [
  "application.submitted",
  "application.reviewed",
  "application.shortlisted",
  "application.rejected",
  "application.employer_approved",
  "application.employer_rejected",
  "interview.scheduled",
  "interview.completed",
  "application.selected",
  "offer.issued",
  "offer.accepted",
  "offer.declined",
  "job.closed",
  "job.auto_close_nudge",
  "requisition.picked_up",
  "job.matches_your_profile",
] as const;
export type EventKey = typeof EVENT_KEYS[number];

function interpolate(template: string, ctx: EventContext): string {
  // Replace {{path.to.field}} with value from ctx. Missing values render as "".
  return template.replace(/\{\{\s*([a-zA-Z0-9._]+)\s*\}\}/g, (_, path) => {
    const parts = path.split(".");
    let v: any = ctx;
    for (const p of parts) {
      if (v == null) return "";
      v = v[p];
    }
    return v == null ? "" : String(v);
  });
}

// Scrub employer's company name out of a rendered message. Used when a template
// is flagged hide_employer_name and the recipient is the candidate. Protects the
// PWS rule that the candidate never sees the employer in a negative event.
function scrubEmployerName(rendered: string, ctx: EventContext): string {
  const name = ctx.employer?.companyName || ctx.job?.company;
  if (!name) return rendered;
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return rendered.replace(new RegExp(escaped, "gi"), "the employer");
}

/**
 * Fire a pipeline event. Non-blocking: errors are logged, not thrown.
 */
export async function fireEvent(eventKey: EventKey, ctx: EventContext): Promise<void> {
  const db = storage.db;
  if (!db) return;

  try {
    const templates = await db.select().from(notificationTemplates)
      .where(and(eq(notificationTemplates.eventKey, eventKey), eq(notificationTemplates.enabled, true)));

    const hideEmployerSetting = await getSetting<boolean>("notifications.hide_employer_in_negatives");

    for (const tpl of templates) {
      const recipientRole = tpl.recipientRole as RecipientRole;

      // Resolve recipient user id from context
      let recipientUserId: string | undefined;
      if (recipientRole === "candidate") recipientUserId = ctx.candidate?.userId;
      else if (recipientRole === "agent") recipientUserId = ctx.agent?.userId;
      else if (recipientRole === "employer") recipientUserId = ctx.employer?.userId;
      if (!recipientUserId) continue;

      let title = interpolate(tpl.title, ctx);
      let body  = interpolate(tpl.body, ctx);
      // audit 2026-07-06 (Batch 4B-2): render the Hindi variants when the
      // template carries them — notify() decides per-recipient (preferred_
      // language) which language actually gets delivered.
      let titleHi = tpl.titleHi ? interpolate(tpl.titleHi, ctx) : undefined;
      let bodyHi  = tpl.bodyHi ? interpolate(tpl.bodyHi, ctx) : undefined;

      // Global setting + per-template flag must BOTH allow the employer name before
      // we keep it. For safety the default is strip-when-either-is-on.
      const mustScrub = recipientRole === "candidate" && (tpl.hideEmployerName || hideEmployerSetting);
      if (mustScrub) {
        title = scrubEmployerName(title, ctx);
        body  = scrubEmployerName(body, ctx);
        if (titleHi) titleHi = scrubEmployerName(titleHi, ctx);
        if (bodyHi)  bodyHi  = scrubEmployerName(bodyHi, ctx);
      }

      const severity = EVENT_SEVERITY[eventKey] ?? "info";
      const shouldAutoSave = AUTO_SAVE_EVENTS.has(eventKey) && recipientRole === "candidate";
      await notify({
        userId: recipientUserId,
        type: eventKey,
        title,
        message: body,
        titleHi,
        messageHi: bodyHi,
        severity,
        autoSave: shouldAutoSave,
        metadata: {
          eventKey,
          jobId: ctx.job?.id,
          applicationId: ctx.application?.id,
          placementId: ctx.placement?.id,
          actorUserId: ctx.actorUserId,
        },
      });
    }
  } catch (err) {
    logger.error(`fireEvent(${eventKey}) failed: ${err}`);
  }
}

/**
 * Resolve the participants (candidate/agent/employer) for a given application id.
 * Helpful sugar for route handlers that only have the application in hand.
 */
export async function resolveParticipantsFromApplication(applicationId: string): Promise<EventContext> {
  const db = storage.db;
  if (!db) return {};
  const { applications, jobs } = await import("@shared/schema");

  const [row] = await db
    .select({
      application: applications,
      job: jobs,
      candidate: candidates,
    })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .innerJoin(candidates, eq(applications.candidateId, candidates.id))
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!row) return {};

  const ctx: EventContext = {
    application: row.application,
    job: row.job,
    candidate: { id: row.candidate.id, userId: row.candidate.userId!, fullName: row.candidate.fullName, email: row.candidate.email },
  };

  // Resolve agent — prefer parent requisition's picked-up agent, else job.agentId
  if (row.job.agentId) {
    const [ag] = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, row.job.agentId)).limit(1);
    if (ag) ctx.agent = { id: ag.id, userId: ag.userId!, agencyName: ag.agencyName };
  }
  // Resolve employer from parent requisition if present, else from job.employerId
  const empLookupUserId = row.job.parentRequisitionId
    ? (await db.select().from(jobs).where(eq(jobs.id, row.job.parentRequisitionId)).limit(1))[0]?.employerId
    : row.job.employerId;
  if (empLookupUserId) {
    const [emp] = await db.select().from(employers).where(eq(employers.userId, empLookupUserId)).limit(1);
    if (emp) ctx.employer = { id: emp.id, userId: emp.userId!, companyName: emp.companyName };
  }

  return ctx;
}
