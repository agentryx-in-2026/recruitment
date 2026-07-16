/**
 * PWS §8 — Thin helper around the existing audit_log for pipeline transitions.
 *
 * Every routable state change (job status, application status, placement, etc.)
 * should go through this helper so we have a single, admin-searchable transition
 * log. Details live in the existing `details` JSONB column so we don't alter
 * the audit_log schema.
 */

import { storage } from "../storage";
import { auditLog } from "@shared/schema";
import { logger } from "../config/logger.config";

export interface TransitionInput {
  actorUserId: string;
  actorRole: string;
  entityType: "application" | "job" | "requisition" | "placement" | "interview" | "agency" | "grievance";
  entityId: string;
  action: string;             // e.g. "status_change", "cascade_close", "reopen"
  fromState?: string | null;
  toState?: string | null;
  reason?: string;
  ipAddress?: string;
  extra?: Record<string, any>;
}

/**
 * Record a transition. Non-throwing — logs errors instead of failing the request.
 */
export async function logTransition(t: TransitionInput): Promise<void> {
  const db = storage.db;
  if (!db) return;
  try {
    await db.insert(auditLog).values({
      userId: t.actorUserId,
      action: `${t.entityType}.${t.action}`,
      resourceType: t.entityType,
      resourceId: t.entityId,
      ipAddress: t.ipAddress ?? null,
      details: {
        actorRole: t.actorRole,
        from: t.fromState ?? null,
        to: t.toState ?? null,
        reason: t.reason ?? null,
        ...(t.extra ?? {}),
      } as any,
    });
  } catch (err) {
    logger.error(`logTransition(${t.entityType}:${t.entityId} ${t.action}) failed: ${err}`);
  }
}
