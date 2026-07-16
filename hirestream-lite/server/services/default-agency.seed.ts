/**
 * HP-3b: seeds the single HPSEDC "mega-agency".
 *
 * HireStream-HP runs as a single agency (see capability.agency_mode). Rather
 * than delete the multi-agency machinery, we keep it and seed exactly ONE
 * verified agency — HPSEDC — that owns all jobs. Adding more agencies later is
 * just more rows + flipping capability.agency_self_registration ON.
 *
 * Idempotent: safe to run on every boot. It (a) ensures the operator user +
 * recruitment_agents row exist, and (b) records the operator user id in the
 * capability.default_agency_user_id setting so the app can resolve "the default
 * agency" without hard-coding a UUID.
 *
 * The operator password comes from DEFAULT_AGENCY_PASSWORD (fall back to the
 * shared staging password with a warning — rotate it before go-live).
 */

import bcrypt from "bcrypt";
import { storage } from "../storage";
import { users, recruitmentAgents } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../config/logger.config";
import { getSetting, updateSetting } from "./settings.service";

const AGENCY_USERNAME = "hpsedc_agency";
const AGENCY_EMAIL = "agency@hpsedc.gov.in";
const AGENCY_NAME = "HPSEDC — Overseas Placement Cell";
const AGENCY_LICENSE = "HP/GOVT/OEP/001";

export async function seedDefaultAgency(): Promise<void> {
  const db = storage.db;
  if (!db) return;

  // 1. Ensure the operator user exists (role=agent).
  let [user] = await db.select().from(users).where(eq(users.username, AGENCY_USERNAME)).limit(1);
  if (!user) {
    const rawPassword = process.env.DEFAULT_AGENCY_PASSWORD || "test123";
    if (!process.env.DEFAULT_AGENCY_PASSWORD) {
      logger.warn(`Default agency seeded with the fallback password — set DEFAULT_AGENCY_PASSWORD and rotate before go-live.`);
    }
    const hashed = await bcrypt.hash(rawPassword, 12);
    [user] = await db.insert(users).values({
      username: AGENCY_USERNAME,
      email: AGENCY_EMAIL,
      password: hashed,
      role: "agent",
    }).returning();
    logger.info(`Default agency operator user created: ${user.id}`);
  }

  // 2. Ensure the verified recruitment_agents row exists for that user.
  const [existingAgency] = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, user.id)).limit(1);
  if (!existingAgency) {
    await db.insert(recruitmentAgents).values({
      userId: user.id,
      agencyName: AGENCY_NAME,
      licenseNumber: AGENCY_LICENSE,
      verified: true,
      verifiedAt: new Date(),
      contactEmail: AGENCY_EMAIL,
    });
    logger.info(`Default agency (${AGENCY_NAME}) created + verified for user ${user.id}`);
  }

  // 3. Record the operator user id so the app can resolve the default agency.
  const current = await getSetting<string>("capability.default_agency_user_id");
  if (current !== user.id) {
    await updateSetting("capability.default_agency_user_id", user.id);
    logger.info(`capability.default_agency_user_id → ${user.id}`);
  }
}

/** Resolve the default (mega) agency operator user id, or null if unset. */
export async function getDefaultAgencyUserId(): Promise<string | null> {
  const id = await getSetting<string>("capability.default_agency_user_id");
  return id || null;
}
