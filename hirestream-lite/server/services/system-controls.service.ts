/**
 * System Controls — super-admin-only runtime operational toggles:
 *   • Full-site maintenance lockdown (with bypass key + ETA + custom message)
 *   • Application submission pipeline (pause new applications)
 *   • Job posting pipeline (pause new job posts)
 *
 * Stored in the existing `system_settings` table under the "maintenance"
 * category so it shares the audit trail (updated_by / updated_at).
 * In-memory cached like other settings; any change invalidates.
 */

import { storage } from "../storage";
import { systemSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../config/logger.config";

export interface SystemControls {
  // Full lockdown
  fullLockdownEnabled: boolean;
  lockdownMessage: string;
  lockdownBypassKey: string;
  lockdownEta: string | null;         // ISO timestamp
  showEta: boolean;
  showDowntime: boolean;
  lockdownEnabledAt: string | null;   // ISO timestamp — used to compute duration
  // Applications pipeline
  applicationsPaused: boolean;
  applicationsPauseMessage: string;
  // Job posting pipeline
  jobPostingPaused: boolean;
  jobPostingPauseMessage: string;
}

const DEFAULTS: SystemControls = {
  fullLockdownEnabled: false,
  lockdownMessage: "HireStream is undergoing scheduled maintenance. Please try again shortly.",
  lockdownBypassKey: "2026",
  lockdownEta: null,
  showEta: true,
  showDowntime: true,
  lockdownEnabledAt: null,
  applicationsPaused: false,
  applicationsPauseMessage: "Application submissions are temporarily paused while we update the matching engine.",
  jobPostingPaused: false,
  jobPostingPauseMessage: "New job postings are paused. Existing jobs continue to accept applications.",
};

const KEY = "system.controls";
let cache: SystemControls | null = null;

export async function getControls(): Promise<SystemControls> {
  if (cache) return cache;
  if (!storage.db) return DEFAULTS;
  const [row] = await storage.db.select().from(systemSettings).where(eq(systemSettings.key, KEY));
  cache = { ...DEFAULTS, ...((row?.value as any) ?? {}) };
  return cache!;
}

export async function updateControls(patch: Partial<SystemControls>, userId?: string): Promise<SystemControls> {
  const current = await getControls();
  // Stamp "enabledAt" when lockdown flips on (so we can show uptime)
  if (patch.fullLockdownEnabled === true && !current.fullLockdownEnabled) {
    patch.lockdownEnabledAt = new Date().toISOString();
  } else if (patch.fullLockdownEnabled === false) {
    patch.lockdownEnabledAt = null;
  }
  const next = { ...current, ...patch };

  if (!storage.db) throw new Error("DB unavailable");
  const [row] = await storage.db.select().from(systemSettings).where(eq(systemSettings.key, KEY));
  if (row) {
    await storage.db.update(systemSettings)
      .set({ value: next as any, updatedAt: new Date(), updatedBy: userId ?? null })
      .where(eq(systemSettings.key, KEY));
  } else {
    await storage.db.insert(systemSettings).values({
      key: KEY, value: next as any, description: "System Controls (maintenance & pipelines)",
      category: "maintenance" as any, updatedBy: userId ?? null,
    });
  }
  cache = next;
  logger.info(`system.controls updated by ${userId ?? "system"}: ${Object.keys(patch).join(", ")}`);
  return next;
}

export async function initControls() {
  await getControls();
  logger.info(`System controls loaded (full-lockdown: ${cache?.fullLockdownEnabled ? "ON" : "off"})`);
}
