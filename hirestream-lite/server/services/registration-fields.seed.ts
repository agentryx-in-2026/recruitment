/**
 * Which registration fields HPSEDC may switch on and off.
 *
 * The ask: "make it so we can enable or disable fields, as they keep changing
 * their mind". This is the same contract as profession_requirements — they own
 * the policy, we own the shape — and the same idempotent seed: rows are INSERTED
 * if missing and never overwritten, so a redeploy cannot silently revert a
 * decision they made in the admin screen.
 *
 * ── What is deliberately NOT configurable ──────────────────────────────────
 * Full name, date of birth, gender, mobile, email, permanent address, PIN. A
 * portal that cannot identify or contact an applicant does not work, and a
 * config panel that lets an admin break the product is a worse product than one
 * that does not. Those fields are simply absent from this list.
 *
 * Two entries are OPTIONS rather than fields — `noPassportOption` and
 * `ecrUnknownOption`. Modelling a single choice inside a dropdown as its own row
 * is far simpler than a generic options editor, and it is exactly the granularity
 * HPSEDC asked for ("remove the ECNR third option").
 */
import { storage } from "../storage";
import { registrationFields } from "@shared/schema";
import { logger } from "../config/logger.config";

export interface FieldSeed {
  fieldKey: string; page: number; sectionKey: string;
  labelEn: string; labelHi: string; description: string;
  enabled: boolean; required: boolean;
  lockedEnabled?: boolean; lockedRequired?: boolean;
  displayOrder: number;
}

export const FIELD_SEEDS: FieldSeed[] = [
  // ── Page 1 · Identity documents ──────────────────────────────────
  {
    fieldKey: "passportExpiry", page: 1, sectionKey: "identity",
    labelEn: "Passport — date of expiry", labelHi: "पासपोर्ट — समाप्ति तिथि",
    description: "Needed to check the 6-month validity rule before deployment.",
    enabled: true, required: true, lockedEnabled: true, displayOrder: 10,
  },
  {
    fieldKey: "passportIssueDate", page: 1, sectionKey: "identity",
    labelEn: "Passport — date of issue", labelHi: "पासपोर्ट — जारी करने की तिथि",
    description: "Printed on the bio page. Not needed for matching.",
    enabled: true, required: false, displayOrder: 20,
  },
  {
    fieldKey: "passportPlaceOfIssue", page: 1, sectionKey: "identity",
    labelEn: "Passport — place of issue", labelHi: "पासपोर्ट — जारी करने का स्थान",
    description: "Printed on the bio page. Not needed for matching.",
    enabled: true, required: false, displayOrder: 30,
  },
  {
    fieldKey: "noPassportOption", page: 1, sectionKey: "identity",
    labelEn: "Option: I do not have a passport yet", labelHi: "विकल्प: मेरे पास अभी पासपोर्ट नहीं है",
    description: "OFF makes a passport number compulsory to apply. A passport is not needed to be shortlisted, only to be deployed, and passport-holding is low among HP blue-collar workers — turning this off will lose applicants who would have got one once a real job existed.",
    enabled: true, required: false, displayOrder: 40,
  },
  {
    fieldKey: "ecrStatus", page: 1, sectionKey: "identity",
    labelEn: "ECR / ECNR status", labelHi: "ECR / ECNR स्थिति",
    description: "Decides whether PoE emigration clearance applies later.",
    enabled: true, required: false, displayOrder: 50,
  },
  {
    fieldKey: "ecrUnknownOption", page: 1, sectionKey: "identity",
    labelEn: "ECR option: I am not sure", labelHi: "ECR विकल्प: मुझे पता नहीं",
    description: "OFF forces the candidate to answer ECR or ECNR. Cleaner data, but someone who genuinely cannot find it on their passport then has to guess.",
    enabled: false, required: false, displayOrder: 60,
  },
  {
    fieldKey: "aadhaarNumber", page: 1, sectionKey: "identity",
    labelEn: "Aadhaar number", labelHi: "आधार संख्या",
    description: "Verhoeff-checked. Also the only stable identity key for a candidate with no passport, so it is what stops the same person registering twice.",
    enabled: true, required: false, displayOrder: 70,
  },

  // ── Page 1 · Personal details ────────────────────────────────────
  {
    fieldKey: "fatherName", page: 1, sectionKey: "personal",
    labelEn: "Father's name", labelHi: "पिता का नाम",
    description: "Printed on the passport; required on MEA emigration paperwork.",
    enabled: true, required: true, displayOrder: 10,
  },
  {
    fieldKey: "motherName", page: 1, sectionKey: "personal",
    labelEn: "Mother's name", labelHi: "माता का नाम",
    description: "Printed on the passport; required on MEA emigration paperwork.",
    enabled: true, required: true, displayOrder: 20,
  },
  {
    fieldKey: "disability", page: 1, sectionKey: "personal",
    labelEn: "Disability declaration", labelHi: "दिव्यांगता घोषणा",
    description: "UAT-05 item 12. Turning it off stops collecting it entirely.",
    enabled: true, required: true, displayOrder: 30,
  },

  // ── Page 1 · Contact ─────────────────────────────────────────────
  {
    fieldKey: "whatsappNumber", page: 1, sectionKey: "contact",
    labelEn: "WhatsApp number", labelHi: "व्हाट्सएप नंबर",
    description: "UAT-05 item 5. Often a different SIM from the candidate's own.",
    enabled: true, required: true, displayOrder: 10,
  },

  // ── Page 1 · Address ─────────────────────────────────────────────
  {
    fieldKey: "homeTown", page: 1, sectionKey: "address",
    labelEn: "Home Town", labelHi: "गृह नगर",
    description: "UAT-05 item 16.",
    enabled: true, required: true, displayOrder: 10,
  },
  {
    fieldKey: "correspondenceAddress", page: 1, sectionKey: "address",
    labelEn: "Correspondence address", labelHi: "पत्राचार का पता",
    description: "OFF uses the permanent address for everything.",
    enabled: true, required: false, displayOrder: 20,
  },

  // ── Page 3 · Education ───────────────────────────────────────────
  {
    fieldKey: "eduBoard", page: 3, sectionKey: "education",
    labelEn: "Board / University", labelHi: "बोर्ड / विश्वविद्यालय",
    description: "HPBOSE, CBSE, ICSE, NIOS…",
    enabled: true, required: false, displayOrder: 10,
  },
  {
    fieldKey: "eduInstitution", page: 3, sectionKey: "education",
    labelEn: "School / institution", labelHi: "विद्यालय / संस्थान",
    description: "", enabled: true, required: false, displayOrder: 20,
  },
  {
    fieldKey: "eduYear", page: 3, sectionKey: "education",
    labelEn: "Year of passing", labelHi: "उत्तीर्ण वर्ष",
    description: "", enabled: true, required: false, displayOrder: 30,
  },
];

/** Insert missing rows only — an HPSEDC decision is never overwritten. */
export async function seedRegistrationFields(): Promise<void> {
  const db = storage.db;
  try {
    const existing = await db.select({ k: registrationFields.fieldKey }).from(registrationFields);
    const have = new Set(existing.map((r: { k: string }) => r.k));
    const missing = FIELD_SEEDS.filter((f) => !have.has(f.fieldKey));
    if (missing.length === 0) {
      logger.info(`Registration fields: all ${have.size} present`);
      return;
    }
    await db.insert(registrationFields).values(missing.map((f) => ({
      fieldKey: f.fieldKey, page: f.page, sectionKey: f.sectionKey,
      labelEn: f.labelEn, labelHi: f.labelHi, description: f.description,
      enabled: f.enabled, required: f.required,
      lockedEnabled: !!f.lockedEnabled, lockedRequired: !!f.lockedRequired,
      displayOrder: f.displayOrder,
    })) as any);
    logger.info(`Registration fields: ${missing.length} seeded (${missing.map((f) => f.fieldKey).join(", ")})`);
  } catch (err: any) {
    logger.error(`Registration fields seed failed: ${err?.message}`);
  }
}
