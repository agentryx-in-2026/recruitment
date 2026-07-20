/**
 * Who changed what on a candidate profile, and when.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * Until 2026-07-19 a candidate could change their name, date of birth, Aadhaar
 * or passport number at ANY stage — including after selection, while a visa was
 * being issued against those exact values — and the change left no trace and
 * notified nobody. Research into comparable portals (Philippines DMW, eMigrate,
 * UIDAI) put HireStream at the "everything open, nothing recorded" extreme:
 * every comparator locks identity data or at minimum records the amendment.
 *
 * Whatever locking policy HPSEDC settle on, the trail has to exist first.
 * Without it there is no way to answer the only question that matters after
 * something goes wrong at an airport: when did this passport number change, and
 * who changed it?
 *
 * ── Two audiences, deliberately different thresholds ───────────────────────
 * EVERY change is written to audit_log — cheap, complete, and the thing an
 * investigation needs. Only MATERIAL changes notify a human, because a staff
 * channel that pings on every address tweak is a channel staff learn to ignore,
 * and then the passport-number alert goes unread with all the rest.
 */
import { eq, inArray, desc } from "drizzle-orm";
import { storage } from "../storage";
import { logger } from "../config/logger.config";
import { auditLog, applications, candidates } from "@shared/schema";
import { notify } from "./notification.service";

/**
 * Fields worth an alert rather than just a log line.
 *
 * These are the values that downstream artifacts are issued AGAINST: the offer
 * letter names a person, the visa carries a passport number, the PoE clearance
 * path is chosen by ECR status, the PCC was issued against an address. A silent
 * change desynchronises the portal from a document already in the world.
 */
const MATERIAL_FIELDS: Record<string, string> = {
  fullName: "Full name",
  dateOfBirth: "Date of birth",
  sex: "Gender",
  fatherName: "Father's name",
  motherName: "Mother's name",
  aadhaarNumber: "Aadhaar number",
  passportNumber: "Passport number",
  passportExpiry: "Passport expiry",
  passportIssueDate: "Passport issue date",
  passportPlaceOfIssue: "Passport place of issue",
  noPassportYet: "Passport held",
  ecrStatus: "ECR / ECNR status",
  permanentAddressLine1: "Permanent address",
  permanentDistrict: "Permanent district",
  permanentState: "Permanent state",
  permanentPinCode: "Permanent PIN code",
};

/** Stages at which something downstream has already been issued. */
const COMMITTED_STATUSES = ["selected", "placed"];

const norm = (v: any) => (v === undefined || v === "" ? null : v instanceof Date ? v.toISOString() : v);

export interface ProfileEditInput {
  candidateId: string;
  actorUserId: string;
  actorRole: string;
  before: Record<string, any>;
  after: Record<string, any>;
  ipAddress?: string;
}

export async function logProfileEdit(input: ProfileEditInput): Promise<void> {
  const db = storage.db;
  if (!db) return;
  try {
    // Diff only what the write actually touched. Comparing every column would
    // record noise from defaults and timestamps and bury the real change.
    const changes: Record<string, { from: any; to: any }> = {};
    for (const key of Object.keys(input.after)) {
      if (key === "updatedAt" || key === "createdAt") continue;
      const from = norm(input.before[key]);
      const to = norm(input.after[key]);
      if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from, to };
    }
    if (Object.keys(changes).length === 0) return;

    const material = Object.keys(changes).filter((k) => k in MATERIAL_FIELDS);

    await db.insert(auditLog).values({
      userId: input.actorUserId,
      action: "candidate.profile_update",
      resourceType: "candidate",
      resourceId: input.candidateId,
      ipAddress: input.ipAddress ?? null,
      details: {
        actorRole: input.actorRole,
        changes,
        materialFields: material,
      },
    } as any);

    if (material.length === 0) return;

    // Has anything been issued against these values yet? Before selection the
    // profile is still a draft and nobody needs telling; after it, staff are
    // holding paperwork that may now disagree with the portal.
    const apps = await db
      .select({ status: applications.status })
      .from(applications)
      .where(eq(applications.candidateId, input.candidateId));
    const committed = apps.some((a: any) => COMMITTED_STATUSES.includes(a.status));
    if (!committed) return;

    const [cand] = await db.select({ fullName: candidates.fullName })
      .from(candidates).where(eq(candidates.id, input.candidateId)).limit(1);
    const names = material.map((k) => MATERIAL_FIELDS[k]).join(", ");

    // Staff, not the employer: regenerating an offer letter or re-doing an
    // eMigrate clearance is a human decision. Pushing passport churn outward
    // automatically leaks noise and half-finished states to the employer.
    const { getSetting } = await import("./settings.service");
    const agencyUserId = await getSetting<string>("capability.default_agency_user_id");
    if (agencyUserId) {
      await notify({
        userId: agencyUserId,
        type: "system",
        title: `${cand?.fullName ?? "A selected candidate"} changed ${material.length === 1 ? "a key detail" : "key details"}`,
        message: `${names} changed after selection. Check any offer letter, PCC or visa paperwork already issued against the previous values.`,
      }).catch(() => {});
    }
    logger.info(`Profile audit: candidate ${input.candidateId} changed [${material.join(", ")}] post-selection.`);
  } catch (e: any) {
    logger.warn(`Profile audit failed for ${input.candidateId}: ${e?.message}`);
  }
}
