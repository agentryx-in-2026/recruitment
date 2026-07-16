import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, decimal, date, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { isValidAadhaar } from "./aadhaar";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").notNull().default("candidate"),
  email: text("email").notNull().unique(),
  aadhaarNumber: text("aadhaar_number"),
  aadhaarVerified: boolean("aadhaar_verified").default(false),
  phoneNumber: text("phone_number"),
  phoneVerified: boolean("phone_verified").default(false),
  himAccessId: text("him_access_id"),
  preferredLanguage: text("preferred_language").default("en"),
  isActive: boolean("is_active").default(true),
  lastLoginAt: timestamp("last_login_at"),
  notifyEmail: boolean("notify_email").default(true),
  notifySms: boolean("notify_sms").default(true),
  notifyInApp: boolean("notify_in_app").default(true),
  // 2FA (TOTP)
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  twoFactorSecret: text("two_factor_secret"),
  twoFactorRecoveryCodes: text("two_factor_recovery_codes").array(),
});

export const candidates = pgTable("candidates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  // Sex as printed on the passport — male | female | other. Required downstream
  // for emigration compliance (passport/visa/eMigrate, gender-specific ECR
  // rules) and matching; collected in the candidate profile, not at signup.
  sex: text("sex"),
  // HP-4c: date of birth + Aadhaar (as on documents). Captured in the "complete"
  // blue-collar Standard flow so a helper filling from the papers finishes the
  // whole profile. (users.aadhaarNumber is the auth/Aadhaar-integration field;
  // this is the profile datum that the candidate PATCH writes, alongside passport.)
  dateOfBirth: date("date_of_birth"),
  aadhaarNumber: text("aadhaar_number"),
  location: text("location"),
  experience: integer("experience").default(0),
  // HP-4a (UAT-03 Item 10): experience captured in MONTHS (e.g. 42). Nullable
  // + additive so the old `experience` (years) column keeps working during the
  // cutover; backfilled = experience × 12. New wizard writes months; the
  // matching-service reads months when present, else falls back to years×12.
  experienceMonths: integer("experience_months"),
  // HP-4c: which registration tier the candidate used, and whether they asked
  // HPSEDC to call them back (the Assisted tier — staff complete the profile).
  registrationTier: text("registration_tier"),          // assisted | standard | professional
  wantsCallback: boolean("wants_callback").default(false),
  // HP-5 (UAT-03 Item 13): countries this candidate was rejected for (visa/country
  // refusal — NOT an agency non-shortlist). Jobs in these countries are hidden from
  // the candidate's listings so they aren't shown a destination they can't go to.
  rejectedCountries: text("rejected_countries").array(),
  skills: text("skills").array(),
  preferredCountries: text("preferred_countries").array(),
  profileComplete: boolean("profile_complete").default(false),
  resumeUrl: text("resume_url"),
  // Photo URL (served from /uploads/photos/...) — candidates + agents both see
  // it; improves recognition in lists. Nullable; InitialsAvatar is the fallback.
  photoUrl: text("photo_url"),
  // Family details (HPSEDC v0.4.31 — Item 4). All nullable; not required at
  // registration but expected before placement paperwork is finalised.
  fatherName: text("father_name"),
  motherName: text("mother_name"),
  // Current/postal address fields (the address the candidate lives at today).
  // Captured separately from the free-text `location` (which holds city/state).
  // All nullable.
  addressLine1: text("address_line_1"),
  addressLine2: text("address_line_2"),
  city: text("city"),
  pinCode: text("pin_code"),
  // Permanent address — distinct from current address (v0.4.31, HPSEDC Item 4).
  // Many overseas placement docs (PCC, visa, emigration) need the candidate's
  // permanent home address even if they currently reside elsewhere for work or
  // study. All nullable; wizard offers "same as current" checkbox.
  permanentAddressLine1: text("permanent_address_line_1"),
  permanentAddressLine2: text("permanent_address_line_2"),
  permanentCity: text("permanent_city"),
  permanentPinCode: text("permanent_pin_code"),
  // Regulatory compliance (Emigration Act, MEA) + overseas-placement essentials
  passportNumber: text("passport_number"),
  passportExpiry: date("passport_expiry"),
  ecrStatus: text("ecr_status"),                  // ecr | ecnr | unknown
  pccStatus: text("pcc_status"),                  // submitted | pending | not_required
  pccExpiry: date("pcc_expiry"),
  medicalStatus: text("medical_status"),          // fit | pending | unfit
  medicalDate: date("medical_date"),
  ieltsBand: decimal("ielts_band"),
  languageProficiency: jsonb("language_proficiency"),
  pdoCompleted: boolean("pdo_completed").default(false),
  pdoDate: date("pdo_date"),
  pbbyInsuranceStatus: text("pbby_insurance_status"), // enrolled | pending | not_required
  pbbyPolicyNumber: text("pbby_policy_number"),
  // audit 2026-07-06 (Batch 4B): emergency contact / next-of-kin — required by
  // the MEA emigration paperwork (who does the embassy call if something goes
  // wrong overseas). All nullable; saved via the candidate profile PATCH.
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  emergencyContactRelation: text("emergency_contact_relation"),
  // audit 2026-07-06 (Batch 4B-2): expiry-alert cron state. Maps doc key →
  // last alerted milestone (days-remaining bucket: 90/60/30/0=expired), e.g.
  // {"passport": 60, "pcc": 0}. A key is cleared when the doc is renewed so
  // alerts re-arm; the cron only notifies when a DEEPER milestone is crossed,
  // which is what keeps the daily run from spamming the same warning forever.
  expiryAlertsSent: jsonb("expiry_alerts_sent").default({}),
  // PWS §2: agent outreach opt-in (default controlled by setting candidate.default_open_to_outreach)
  openToOutreach: boolean("open_to_outreach").notNull().default(true),
  // v0.4.33 (Phase 3, HPSEDC Item 2): Matching Engine v2 candidate-side
  // fields. All nullable so existing rows continue to score (missing-
  // criteria policy applies — see server/services/matching.service.ts).
  qualificationLevel: text("qualification_level"),        // school | diploma | bachelor | master | doctorate
  preferredCategories: text("preferred_categories").array(),  // subset of job-category keys
  preferredSalaryMin: integer("preferred_salary_min"),     // stored as annualised USD-equivalent integer
  preferredSalaryMax: integer("preferred_salary_max"),
  preferredSalaryCurrency: text("preferred_salary_currency"), // ISO 4217, e.g. USD / INR / AED
  createdAt: timestamp("created_at").defaultNow(),
});

export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  candidateId: varchar("candidate_id").references(() => candidates.id),
  // v0.4.31 (HPSEDC Item 7): expanded from cv/passport/certificate to
  // distinct slots per doc class so each gets its own ✓ indicator.
  // Allowed values: cv | passport | identity_proof | educational_certificate
  //                | experience_certificate | offer_letter | other
  // Legacy "certificate" values stay valid (server doesn't reject reads);
  // new uploads use the specific types.
  type: text("type").notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  verified: boolean("verified").default(false),
  verifiedBy: varchar("verified_by").references(() => users.id),
  // audit 2026-07-06 (Batch 4B): when the doc was verified/unverified. Set by
  // PATCH /candidates/documents/:id/verify alongside verified + verifiedBy.
  verifiedAt: timestamp("verified_at"),
});

export const jobs = pgTable("jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location").notNull(),
  country: text("country").notNull(),
  // v0.4.31 (HPSEDC Item 8): controlled-vocabulary role category drives
  // overseas-placement essentials (ECR/non-ECR eligibility, PDO curriculum,
  // PBBY premium tier) and Browse Jobs filtering. Nullable so existing
  // jobs continue to render; Job Poster form will require it on new posts.
  // Seed vocabulary in server/services/job-categories.seed.ts.
  category: text("category"),
  // v0.4.33 (Phase 3, HPSEDC Item 2): Matching Engine v2 job-side fields.
  // All nullable — when missing, the engine treats the factor as neutral
  // per the configurable Missing-Criteria policy. languagesRequired uses
  // CEFR levels (A1-C2) for non-IELTS countries; requiredIeltsBand is a
  // convenience field for IELTS countries (UK / AUS / NZ / CAN / IE) so
  // the matching engine doesn't have to dig into the jsonb to score.
  qualificationRequired: text("qualification_required"),    // school | diploma | bachelor | master | doctorate
  languagesRequired: jsonb("languages_required"),           // { english: "B2", arabic: "A1" } or { english_ielts: 6.0 }
  requiredIeltsBand: decimal("required_ielts_band"),
  salary: text("salary"),
  description: text("description"),
  requirements: text("requirements").array(),
  skills: text("skills").array(),
  experience: integer("experience_required").default(0),
  employerId: varchar("employer_id").references(() => users.id),
  agentId: varchar("agent_id").references(() => users.id),
  status: text("status").default("active"),
  // PWS §2: visibility and pipeline-linking columns
  visibility: text("visibility").notNull().default("public"),  // public | agents_only
  parentRequisitionId: varchar("parent_requisition_id"),        // FK -> jobs(id), self-ref
  pinnedAgentId: varchar("pinned_agent_id").references(() => users.id),
  // Requisition fields (employer's perspective on this job)
  targetHires: integer("target_hires").default(1),
  hiringDeadline: date("hiring_deadline"),
  priority: text("priority").default("standard"),     // standard | urgent | critical
  employerNotes: text("employer_notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  // Hot search path: candidates browse public jobs, agents see agents_only
  // requisitions — both filter on (visibility, status).
  index("idx_jobs_visibility_status").on(table.visibility, table.status),
]);

export const applications = pgTable("applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  candidateId: varchar("candidate_id").references(() => candidates.id),
  jobId: varchar("job_id").references(() => jobs.id),
  status: text("status").default("submitted"),
  matchScore: integer("match_score").default(0),
  rejectionFeedback: text("rejection_feedback"),
  // Employer-specific decision on this application (independent of pipeline status)
  employerDecision: text("employer_decision"),       // approved_for_interview | replacement_requested | selected_by_employer | rejected_by_employer
  employerDecisionAt: timestamp("employer_decision_at"),
  employerDecisionNotes: text("employer_decision_notes"),
  appliedAt: timestamp("applied_at").defaultNow(),
}, (t) => ({
  // audit 2026-07-06 (C4): DB-level duplicate-application guard. The route's
  // read-then-insert pre-check stays (friendlier message, defense in depth),
  // but only this unique index closes the race window.
  uniqCandidateJob: uniqueIndex("applications_candidate_job_idx").on(t.candidateId, t.jobId),
}));

export const recruitmentAgents = pgTable("recruitment_agents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  agencyName: text("agency_name").notNull(),
  licenseNumber: text("license_number").notNull(),
  specializations: text("specializations").array(),
  verified: boolean("verified").default(false),
  rating: integer("rating").default(0),
  placements: integer("placements").default(0),
  // v0.4.32 (HPSEDC Item 3): doc-review workflow metadata. Same shape as
  // employers so the admin UI can share components.
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  registeredAddressLine1: text("registered_address_line_1"),
  registeredAddressLine2: text("registered_address_line_2"),
  registeredCity: text("registered_city"),
  registeredState: text("registered_state"),
  registeredPinCode: text("registered_pin_code"),
  authorisedSignatoryName: text("authorised_signatory_name"),
  authorisedSignatoryDesignation: text("authorised_signatory_designation"),
  meaLicenseExpiry: date("mea_license_expiry"),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: varchar("verified_by").references(() => users.id),
  rejectionReason: text("rejection_reason"),
  submittedForReviewAt: timestamp("submitted_for_review_at"),
});

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  category: text("category").default("general"), // 'feature_flag' | 'maintenance' | 'integration' | 'general'
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

// FRS §3.1 / §2.8 — admin-configurable third-party integrations.
// One row per logical integration ("email", "sms", "aadhaar", "himaccess",
// "digilocker"). Secrets are AES-GCM encrypted at rest; non-secret config
// (host/port/sender-id/client-id) lives in plain JSON for easy admin editing.
// Services read from here first; env vars act only as a fallback for local dev.
export const providerConfig = pgTable("provider_config", {
  id: text("id").primaryKey(),               // "email" | "sms" | "aadhaar" | "himaccess" | "digilocker"
  providerType: text("provider_type").notNull(), // "smtp" | "sendgrid" | "twilio" | "msg91" | "uidai" | "himaccess-oauth" | ...
  enabled: boolean("enabled").notNull().default(false),
  config: jsonb("config").notNull().default({}),      // plain: host, port, from, senderId, clientId, endpoint
  secrets: jsonb("secrets").notNull().default({}),    // encrypted: {cipher, iv, tag} per secret field
  lastTestedAt: timestamp("last_tested_at"),
  lastTestStatus: text("last_test_status"),  // "ok" | "fail"
  lastTestError: text("last_test_error"),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

// PWS §5 — admin-editable notification templates, composite key (eventKey, recipientRole).
export const notificationTemplates = pgTable("notification_templates", {
  eventKey: text("event_key").notNull(),          // e.g. "application.shortlisted"
  recipientRole: text("recipient_role").notNull(), // candidate | agent | employer
  title: text("title").notNull(),
  body: text("body").notNull(),
  // audit 2026-07-06 (Batch 4B-2): optional Hindi variants. When present AND
  // the recipient's users.preferred_language = 'hi', fireEvent()/notify()
  // deliver these instead of the English title/body (fallback = English).
  titleHi: text("title_hi"),
  bodyHi: text("body_hi"),
  channels: text("channels").array().notNull(),
  hideEmployerName: boolean("hide_employer_name").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const agencyReviews = pgTable("agency_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").references(() => recruitmentAgents.id).notNull(),
  candidateUserId: varchar("candidate_user_id").references(() => users.id).notNull(),
  rating: integer("rating").notNull(), // 1-5
  title: text("title"),
  review: text("review"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  // audit 2026-07-06 (C17): one review per candidate per agency
  uniqAgencyCandidate: uniqueIndex("agency_reviews_agency_candidate_idx").on(t.agencyId, t.candidateUserId),
}));

export const employers = pgTable("employers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  companyName: text("company_name").notNull(),
  industry: text("industry"),
  location: text("location"),
  verified: boolean("verified").default(false),
  activeJobs: integer("active_jobs").default(0),
  // v0.4.32 (HPSEDC Item 1): full company verification surface so admin
  // can run KYB on a foreign-employer or domestic-principal before they
  // can publish a requisition. All nullable so existing seeded rows survive.
  cin: text("cin"),                                // Corporate Identification Number
  gst: text("gst"),                                // GSTIN
  pan: text("pan"),                                // PAN
  registeredAddressLine1: text("registered_address_line_1"),
  registeredAddressLine2: text("registered_address_line_2"),
  registeredCity: text("registered_city"),
  registeredState: text("registered_state"),
  registeredPinCode: text("registered_pin_code"),
  registeredCountry: text("registered_country"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  authorisedSignatoryName: text("authorised_signatory_name"),
  authorisedSignatoryDesignation: text("authorised_signatory_designation"),
  authorisedSignatoryIdType: text("authorised_signatory_id_type"),    // aadhaar | pan | passport | driving_licence
  authorisedSignatoryIdNumber: text("authorised_signatory_id_number"),
  // Verification metadata
  verifiedAt: timestamp("verified_at"),
  verifiedBy: varchar("verified_by").references(() => users.id),
  rejectionReason: text("rejection_reason"),
  submittedForReviewAt: timestamp("submitted_for_review_at"),
});

// v0.4.32 (HPSEDC Item 1): employer verification documents. Mirrors the
// candidate `documents` table but scopes by employerId so admin doc-review
// queue can render them per-applicant.
export const employerDocuments = pgTable("employer_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  employerId: varchar("employer_id").references(() => employers.id).notNull(),
  // Allowed values:
  //   cin_certificate | gst_certificate | pan_card | address_proof |
  //   signatory_id | labour_permission | agreement | other
  type: text("type").notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewNotes: text("review_notes"),
});

// v0.4.32 (HPSEDC Item 3): agency verification documents — the 9 doc
// classes HPSEDC listed for an MEA RA-licensed agency.
export const agencyDocuments = pgTable("agency_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").references(() => recruitmentAgents.id).notNull(),
  // Allowed values:
  //   mea_ra_license | incorporation_certificate | pan_card | gst_certificate |
  //   address_proof | signatory_id | labour_permission | experience_proof |
  //   agreement | other
  type: text("type").notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  status: text("status").notNull().default("pending"),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewNotes: text("review_notes"),
});

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  type: text("type").notNull(), // 'application_update', 'agency_verified', 'new_job_match', 'system'
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false),
  severity: text("severity").notNull().default("info"), // info | positive | warning | urgent
  dismissedAt: timestamp("dismissed_at"),   // user hit × → never resurfaces
  savedAt: timestamp("saved_at"),           // user bookmarked for later
  metadata: jsonb("metadata"), // flexible JSON for linking to jobs, applications, etc.
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Saved/Favorited Jobs ────────────────────────────────────────────
export const savedJobs = pgTable("saved_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  jobId: varchar("job_id").references(() => jobs.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── OTP Verification Codes ──────────────────────────────────────────
export const otpCodes = pgTable("otp_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  code: text("code").notNull(),
  purpose: text("purpose").notNull().default("login"), // login, register, password_reset
  expiresAt: timestamp("expires_at").notNull(),
  verified: boolean("verified").default(false),
  attempts: integer("attempts").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Password Reset Tokens ───────────────────────────────────────────
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Candidate Education ─────────────────────────────────────────────
export const candidateEducation = pgTable("candidate_education", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  candidateId: varchar("candidate_id").references(() => candidates.id).notNull(),
  degree: text("degree").notNull(),
  institution: text("institution").notNull(),
  year: integer("year"),
  percentage: decimal("percentage"),
  // v0.4.33 (Phase 3, HPSEDC Item 5): structure the education record so
  // the wizard can group entries into Schooling / Higher Education /
  // Certifications & Courses. `type` is nullable for backward-compat with
  // pre-v0.4.33 rows (treated as "university" in the UI as a sensible
  // default). `board` is for 10th/12th and is distinct from `institution`
  // (which captures the school name). `subject` is for the field of study
  // on degrees (e.g. "Computer Science", "Mechanical Engineering").
  type: text("type"),         // school | university | diploma | certification | course
  board: text("board"),       // CBSE / ICSE / HPBSE / Cambridge / IB / etc.
  subject: text("subject"),
  // HP-4a (UAT-03 Item 7): affiliating university/body, distinct from
  // `institution` (the school/college name). Nullable — pre-HP rows keep the
  // combined value in `institution` with `university` null.
  university: text("university"),
  // HP-4a (UAT-03 Item 6): did the candidate PASS this qualification? Default
  // true so existing rows are unaffected; the wizard exposes a checkbox.
  isPassed: boolean("is_passed").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Candidate Work Experience ───────────────────────────────────────
export const candidateExperience = pgTable("candidate_experience", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  candidateId: varchar("candidate_id").references(() => candidates.id).notNull(),
  company: text("company").notNull(),
  role: text("role").notNull(),
  years: integer("years").default(0),
  country: text("country"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Candidate Languages ─────────────────────────────────────────────
// HP-4a (UAT-03 Item 12): for blue-collar overseas placement, spoken-language
// proficiency (Hindi / English / Malayalam / Arabic / …) matters more than
// resume phrasing, so it's a first-class section — not buried in free text.
export const candidateLanguages = pgTable("candidate_languages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  candidateId: varchar("candidate_id").references(() => candidates.id).notNull(),
  language: text("language").notNull(),         // Hindi | English | Arabic | Malayalam | ...
  proficiency: text("proficiency").notNull(),   // elementary | intermediate | professional | native
  canRead: boolean("can_read").default(false),
  canWrite: boolean("can_write").default(false),
  canSpeak: boolean("can_speak").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Post-placement support (UAT-03 #16 + #19) ───────────────────────
// After a candidate is placed overseas, they can (a) raise a support ISSUE
// within the 3-month window and (b) file a monthly CHECK-IN ("still there /
// need help"). HPSEDC works the queue. One table, `kind` distinguishes them.
export const postPlacementSupport = pgTable("post_placement_support", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  candidateId: varchar("candidate_id").references(() => candidates.id).notNull(),
  placementId: varchar("placement_id"),
  kind: text("kind").notNull(),              // 'issue' | 'checkin'
  category: text("category"),                // issue: salary_unpaid | contract | safety | health | documents | other
  status: text("status").notNull().default("open"), // issue: open|in_progress|resolved · checkin: ok|needs_help
  message: text("message"),
  country: text("country"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});
export const insertPostPlacementSchema = createInsertSchema(postPlacementSupport).omit({
  id: true, candidateId: true, status: true, createdAt: true, updatedAt: true, resolvedAt: true,
}).extend({
  kind: z.enum(["issue", "checkin"]),
  category: z.string().trim().max(40).optional().nullable(),
  message: z.string().trim().max(2000).optional().nullable(),
  country: z.string().trim().max(60).optional().nullable(),
});

// ── Support messages (HP-6: Ask HPSEDC — async help thread) ─────────
// A running conversation between a candidate and HPSEDC support. Separate from
// the formal Grievance channel (which is regulated + SLA-tracked). This is the
// foundation for a reusable, AI-pluggable chat module: today a human answers
// from the admin inbox; later a Responder (Claude) or WhatsApp transport can
// plug in without changing this thread model.
export const supportMessages = pgTable("support_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  candidateId: varchar("candidate_id").references(() => candidates.id).notNull(),
  senderRole: text("sender_role").notNull(),        // 'candidate' | 'hpsedc'
  senderUserId: varchar("sender_user_id"),
  body: text("body").notNull(),
  readByAdmin: boolean("read_by_admin").default(false),
  readByCandidate: boolean("read_by_candidate").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Recruitment Drives ──────────────────────────────────────────────
export const recruitmentDrives = pgTable("recruitment_drives", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  agencyId: varchar("agency_id").references(() => recruitmentAgents.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  date: timestamp("date").notNull(),
  location: text("location").notNull(),
  targetRoles: text("target_roles").array(),
  expectedCandidates: integer("expected_candidates"),
  status: text("status").default("pending"), // pending, approved, rejected, completed, cancelled
  approvedBy: varchar("approved_by").references(() => users.id),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Candidates register/express interest in an approved recruitment drive (FRS:
// candidates can join drives). The owning agency sees the registrant list and
// invites/schedules interviews from it.
export const driveRegistrations = pgTable("drive_registrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driveId: varchar("drive_id").references(() => recruitmentDrives.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),  // the candidate user
  status: text("status").notNull().default("registered"), // registered | cancelled | invited | attended
  note: text("note"), // optional message from the candidate
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  uniqDriveUser: uniqueIndex("drive_registrations_drive_user_idx").on(t.driveId, t.userId),
}));

// ── Interviews ──────────────────────────────────────────────────────
export const interviews = pgTable("interviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  driveId: varchar("drive_id").references(() => recruitmentDrives.id),
  applicationId: varchar("application_id").references(() => applications.id).notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  location: text("location"),
  mode: text("mode").default("in_person"), // in_person, virtual
  result: text("result"),                  // selected | rejected | hold | null (pending)
  notes: text("notes"),
  // Structured interview feedback
  rating: integer("rating"),                     // 1..5
  strengths: text("strengths"),
  concerns: text("concerns"),
  recommendation: text("recommendation"),  // strong_yes | yes | maybe | no | strong_no
  // Structured scorecard — per-dimension ratings so the employer can give
  // more context than a single 1-5. Shape: { technical: 1-5, communication:
  // 1-5, culture: 1-5, english: 1-5, custom?: {...} }. All optional; the
  // admin-defined template dictates which dimensions are shown in the UI.
  scorecard: jsonb("scorecard"),
  conductedBy: varchar("conducted_by").references(() => users.id),
  // v0.4.34 (Phase 4): candidate-side interview workflow. When agent
  // schedules an interview, candidate sees the slot and can confirm /
  // request reschedule / decline. All nullable for back-compat.
  interviewerName: text("interviewer_name"),          // surfaced on candidate panel ("who will I meet")
  meetingLink: text("meeting_link"),                  // for mode="virtual" — zoom/meet/teams URL
  candidateConfirmedStatus: text("candidate_confirmed_status"), // null = no response | "confirmed" | "reschedule_requested" | "declined"
  candidateConfirmedAt: timestamp("candidate_confirmed_at"),
  candidateRescheduleReason: text("candidate_reschedule_reason"),
  candidateProposedAt: timestamp("candidate_proposed_at"),
  candidateDeclineReason: text("candidate_decline_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Placements ──────────────────────────────────────────────────────
export const placements = pgTable("placements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  applicationId: varchar("application_id").references(() => applications.id).notNull(),
  appointmentLetterUrl: text("appointment_letter_url"),
  startDate: timestamp("start_date"),
  country: text("country").notNull(),
  salary: text("salary"),
  status: text("status").default("offered"), // offered, accepted, declined, active, completed
  candidateResponse: text("candidate_response"), // accepted, declined
  declineReason: text("decline_reason"),
  // audit 2026-07-06 (Batch 4B): offer validity deadline. Set at offer creation
  // to now + placement.offer_validity_days; accept is rejected past this
  // moment (admin override). Nullable = no expiry (pre-existing offers).
  offerExpiresAt: timestamp("offer_expires_at"),
  visaStatus: text("visa_status"), // not_applied, applied, approved, rejected
  // audit 2026-07-06 (Batch 4B-2): eMigrate / PoE emigration-clearance tracking
  // for ECR candidates going to ECR-notified countries. INTERNAL tracking only —
  // there is no live eMigrate API; HPSEDC staff record the outcome they obtained
  // on the government eMigrate portal. null = not yet assessed.
  emigrationClearanceStatus: text("emigration_clearance_status"), // not_required | pending | cleared
  // readiness 2026-07-07: one-time "cleared for deployment" announcement marker.
  // Stamped (with a NULL guard) the first time computeReadiness() reports
  // isTravelReady for this placement; NULL = not yet announced. Prevents the
  // candidate/agent being re-notified every time a compliance field is touched.
  deploymentReadyNotifiedAt: timestamp("deployment_ready_notified_at"),
  // audit 2026-07-06 (Batch 4B-2): welfare-prompt cron state. Maps milestone →
  // ISO date the automated "How are you?" prompt was sent, e.g. {"30": "2026-07-07"}.
  // A milestone is prompted at most once per placement (idempotency marker).
  welfarePromptsSent: jsonb("welfare_prompts_sent").default({}),
  // Post-placement welfare follow-up (MEA requirement)
  welfare30Day: text("welfare_30_day"),             // ok | concerns | no_response | not_applicable
  welfare30DayAt: timestamp("welfare_30_day_at"),
  welfare30DayNotes: text("welfare_30_day_notes"),
  welfare60Day: text("welfare_60_day"),
  welfare60DayAt: timestamp("welfare_60_day_at"),
  welfare60DayNotes: text("welfare_60_day_notes"),
  welfare90Day: text("welfare_90_day"),
  welfare90DayAt: timestamp("welfare_90_day_at"),
  welfare90DayNotes: text("welfare_90_day_notes"),
  // Candidate-initiated welfare outreach (they can proactively write in)
  candidateWelfareNote: text("candidate_welfare_note"),
  candidateWelfareNoteAt: timestamp("candidate_welfare_note_at"),
  // Employer-contributed welfare note (how is the hire performing at destination)
  employerWelfareNote: text("employer_welfare_note"),
  employerWelfareNoteAt: timestamp("employer_welfare_note_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Grievances ──────────────────────────────────────────────────────
export const grievances = pgTable("grievances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  // category: agency_complaint | application_issue | technical_problem | policy_inquiry | fraud_report | other
  // fraud_report subtype drives the "report this job" flow (overseas-placement
  // fraud is an MEA priority; admin sees these in a dedicated watchlist tab).
  category: text("category").notNull(),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  status: text("status").default("submitted"), // submitted, under_review, action_taken, resolved, escalated
  // metadata.jobId / metadata.agencyId / metadata.reason let the admin click
  // through from a grievance straight to the offending record without re-typing.
  metadata: jsonb("metadata").default({}),
  adminNotes: text("admin_notes"),
  resolutionNotes: text("resolution_notes"),
  assignedTo: varchar("assigned_to").references(() => users.id),
  resolvedAt: timestamp("resolved_at"),
  // audit 2026-07-06 (Batch 4B-2): stamped once by the SLA-aging cron when the
  // grievance blows past its per-category SLA. Doubles as the re-escalation
  // guard — a breached grievance is never escalated (or re-notified) again.
  slaBreachedAt: timestamp("sla_breached_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Two-way discussion thread on a grievance — between the complainant and the
// assigned owner (admin/staff). authorRole stamps who said what so the UI can
// align bubbles. `internal` lets staff add a note the complainant doesn't see.
export const grievanceComments = pgTable("grievance_comments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  grievanceId: varchar("grievance_id").references(() => grievances.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  authorRole: text("author_role").notNull(), // candidate | agent | employer | admin | superadmin
  body: text("body").notNull(),
  internal: boolean("internal").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Audit Log ───────────────────────────────────────────────────────
export const auditLog = pgTable("audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  action: text("action").notNull(), // create, update, delete, verify, reject, login, logout
  resourceType: text("resource_type").notNull(), // user, agency, job, application, drive, grievance, setting
  resourceId: varchar("resource_id"),
  details: jsonb("details"), // before/after values for updates
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Job Import Batches ──────────────────────────────────────────────
// Smart Job Importer (admin bulk-post from Government Excel/CSV files).
// One row per committed import batch — the audit trail HPSEDC can point to
// when asked "where did these 300 postings come from?". Per-job provenance
// stays in audit_log (one entry per batch, resourceId = this row's id).
export const jobImports = pgTable("job_imports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  importedBy: varchar("imported_by").references(() => users.id),
  fileName: text("file_name"),
  rowCount: integer("row_count").notNull().default(0),
  createdCount: integer("created_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── FAQ ─────────────────────────────────────────────────────────────
export const faq = pgTable("faq", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  question: text("question").notNull(),
  questionHi: text("question_hi"), // Hindi translation
  answer: text("answer").notNull(),
  answerHi: text("answer_hi"), // Hindi translation
  category: text("category").notNull(), // registration, job_application, agencies, overseas_placement, technical_support
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Announcements ───────────────────────────────────────────────────
export const announcements = pgTable("announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  titleHi: text("title_hi"),
  body: text("body").notNull(),
  bodyHi: text("body_hi"),
  targetRole: text("target_role"), // null = all, or candidate, agent, employer
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  pinned: boolean("pinned").default(false),
  severity: text("severity").notNull().default("info"), // info (sky) | positive | warning (amber) | urgent (red)
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Training Events ─────────────────────────────────────────────────
export const trainingEvents = pgTable("training_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  date: timestamp("date").notNull(),
  location: text("location"),
  virtualLink: text("virtual_link"),
  targetAudience: text("target_audience"), // null = all, or candidate, agent
  maxParticipants: integer("max_participants"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// ═══════════════════════════════════════════════════════════════════
// INSERT / UPDATE SCHEMAS & TYPES
// ═══════════════════════════════════════════════════════════════════

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  role: true,
  email: true,
});

export const insertCandidateSchema = createInsertSchema(candidates).omit({
  id: true,
  createdAt: true,
}).extend({
  fullName: z.string().trim().min(1).max(120),
  email: z.string().trim().max(120),
  sex: z.enum(["male", "female", "other"]).optional().nullable(),
  location: z.string().trim().max(150).optional().nullable(),
  skills: z.array(z.string().trim().max(60)).max(50).optional().nullable(),
  preferredCountries: z.array(z.string().trim().max(60)).max(20).optional().nullable(),
});

// HTIS BUG-008 — employer "Create Date" (hiring deadline on the requisition
// form) accepted past dates. Enforced here so both the agent job-poster and
// the employer job-creation-form get the check.
const futureOrTodayDate = z.string().refine(
  (v) => !v || new Date(v) >= new Date(new Date().toDateString()),
  { message: "Date must be today or a future date." },
);

export const insertJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
}).extend({
  title: z.string().trim().min(2).max(120),
  company: z.string().trim().min(2).max(150),
  location: z.string().trim().min(1).max(80),
  country: z.string().trim().min(2).max(60),
  // v0.4.31 (HPSEDC Item 8): controlled-vocabulary category. Kept optional
  // at the shared-schema layer so legacy seed data and existing tests still
  // round-trip. Client-side forms (agent + employer) enforce it as required;
  // the route handler runs normaliseCategory() when the field is present.
  category: z.string().trim().min(1).max(60).optional().nullable(),
  salary: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  employerNotes: z.string().trim().max(2000).optional().nullable(),
  skills: z.array(z.string().trim().max(40)).max(30).optional().nullable(),
  experience: z.number().int().min(0).max(60).optional().nullable(),
  targetHires: z.number().int().min(1).max(500).optional().nullable(),
  hiringDeadline: z.union([futureOrTodayDate, z.null()]).optional(),
  // v0.4.36.1: jobs.required_ielts_band is a decimal → z.string() by
  // default, but the job-poster form sends a NUMBER. Coerce both.
  requiredIeltsBand: z.union([z.string(), z.number()]).optional().nullable()
    .transform((v) => (v === null || v === undefined || v === "" ? null : String(v))),
});

// Draft job: only title required, all other fields optional but still length-bounded.
export const draftJobSchema = createInsertSchema(jobs).omit({
  id: true,
  createdAt: true,
}).extend({
  title: z.string().trim().min(2).max(120),
  company: z.string().trim().max(150).optional().nullable(),
  location: z.string().trim().max(80).optional().nullable(),
  country: z.string().trim().max(60).optional().nullable(),
  salary: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  employerNotes: z.string().trim().max(2000).optional().nullable(),
  skills: z.array(z.string().trim().max(40)).max(30).optional().nullable(),
  experience: z.number().int().min(0).max(60).optional().nullable(),
  targetHires: z.number().int().min(1).max(500).optional().nullable(),
  hiringDeadline: z.union([futureOrTodayDate, z.null()]).optional(),
  requiredIeltsBand: z.union([z.string(), z.number()]).optional().nullable()
    .transform((v) => (v === null || v === undefined || v === "" ? null : String(v))),
}).partial({ company: true, location: true, country: true });

export const insertRecruitmentAgentSchema = createInsertSchema(recruitmentAgents).omit({
  id: true,
  verified: true,
  rating: true,
  placements: true,
  // v0.4.32: admin-controlled verification metadata is never client-supplied.
  verifiedAt: true,
  verifiedBy: true,
  rejectionReason: true,
  submittedForReviewAt: true,
}).extend({
  agencyName: z.string().trim().min(2).max(150),
  licenseNumber: z.string().trim().min(3).max(50),
  specializations: z.array(z.string().trim().max(60)).max(20).optional().nullable(),
});

// Phone regex — accepts an optional `+`, optional country code up to 3 digits,
// optional space/dash separators, and 6–12 digits of subscriber number. Meant
// to reject alphanumeric garbage (HTIS BUG-002: field was accepting
// `87698GBIUHJIUJN JN&^**& (*)*Y&%^`), not enforce a strict E.164 shape — the
// FRS promises "email/mobile" without prescribing format, and Indian + GCC
// numbers differ in length.
const phoneRegex = /^\+?[0-9][0-9\s\-]{5,18}[0-9]$/;
const currentYear = new Date().getFullYear();

export const updateCandidateSchema = createInsertSchema(candidates).omit({
  id: true,
  userId: true,
  createdAt: true,
  // v0.4.31: ecrStatus moved out of the omit list — the wizard's Identity
  // & Travel section now captures it directly. pccStatus, medicalStatus,
  // pdoCompleted, pbbyInsuranceStatus stay omitted as they're agent-managed.
  pccStatus: true,
  medicalStatus: true,
  pdoCompleted: true,
  pbbyInsuranceStatus: true,
}).partial().extend({
  // Overrides for field-level validation. The auto-generated schema from
  // drizzle only checks types; these add the business rules from the FRS.
  phone: z.string().trim().regex(phoneRegex, {
    message: "Phone must be digits only (optionally with +country code, spaces, or dashes). Example: +91 9876543210",
  }).optional().nullable(),
  // Passport-expiry cannot be in the past. Blocked server-side so a hand-crafted
  // PATCH (bypassing the client date-picker) still fails.
  passportExpiry: z.union([
    z.string().refine((v) => !v || new Date(v) >= new Date(new Date().toDateString()), {
      message: "Passport expiry must be today or a future date.",
    }),
    z.null(),
  ]).optional(),
  experience: z.number().int().min(0, { message: "Experience cannot be negative." }).max(60, { message: "Experience looks too high — please check." }).optional().nullable(),
  // HP-4b (UAT-03 Item 10): experience in months. Bounded 0..720 (60 years).
  experienceMonths: z.number().int().min(0, { message: "Experience cannot be negative." }).max(720, { message: "Experience looks too high — please check." }).optional().nullable(),
  // v0.4.36.1: `ielts_band` is a Postgres decimal → drizzle-zod infers
  // z.string(), but the wizard sends a NUMBER. That mismatch 400'd the
  // Personal-Info save (and, with no client onError handler, did it
  // silently). Coerce number-or-string → string so either input works.
  ieltsBand: z.union([z.string(), z.number()]).optional().nullable()
    .transform((v) => (v === null || v === undefined || v === "" ? null : String(v))),
  // Length guardrails — block arbitrarily long input (DB bloat / abuse). Generous
  // limits; well above any real value. Drizzle only type-checks these otherwise.
  fullName: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().max(120).optional().nullable(),
  sex: z.enum(["male", "female", "other"]).optional().nullable(),
  location: z.string().trim().max(150).optional().nullable(),
  fatherName: z.string().trim().max(120).optional().nullable(),
  motherName: z.string().trim().max(120).optional().nullable(),
  addressLine1: z.string().trim().max(200).optional().nullable(),
  addressLine2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  pinCode: z.string().trim().max(10).optional().nullable(),
  permanentAddressLine1: z.string().trim().max(200).optional().nullable(),
  permanentAddressLine2: z.string().trim().max(200).optional().nullable(),
  permanentCity: z.string().trim().max(80).optional().nullable(),
  permanentPinCode: z.string().trim().max(10).optional().nullable(),
  passportNumber: z.string().trim().max(20).optional().nullable(),
  // HP-4c: DOB must be a real past date (and not absurdly old). Server-checked
  // so a hand-crafted PATCH can't set a future/garbage birth date.
  dateOfBirth: z.union([
    z.string().refine((v) => !v || (new Date(v) < new Date() && new Date(v) > new Date("1940-01-01")), {
      message: "Enter a valid date of birth.",
    }),
    z.null(),
  ]).optional(),
  // Aadhaar is optional (skippable) but, when given, must be 12 digits AND pass
  // the Verhoeff checksum (HPSEDC 2026-07-07). Digits-only is normalised first
  // so a client that forgot to strip display spaces still validates.
  aadhaarNumber: z.preprocess(
    (v) => { if (typeof v !== "string") return v; const d = v.replace(/\D/g, ""); return d === "" ? undefined : d; },
    z.string().refine((v) => isValidAadhaar(v), { message: "Enter a valid 12-digit Aadhaar number." }).optional().nullable(),
  ),
  pbbyPolicyNumber: z.string().trim().max(60).optional().nullable(),
  // audit 2026-07-06 (Batch 4B): emergency contact / next-of-kin. Phone reuses
  // the same shape rule as the candidate's own phone; empty string clears.
  emergencyContactName: z.string().trim().max(120).optional().nullable(),
  emergencyContactPhone: z.union([
    z.literal(""),
    z.string().trim().regex(phoneRegex, {
      message: "Emergency contact phone must be digits only (optionally with +country code, spaces, or dashes).",
    }),
  ]).optional().nullable().transform((v) => (v === "" ? null : v)),
  emergencyContactRelation: z.string().trim().max(60).optional().nullable(),
  qualificationLevel: z.string().trim().max(40).optional().nullable(),
  preferredSalaryCurrency: z.string().trim().max(10).optional().nullable(),
  skills: z.array(z.string().trim().max(60)).max(50).optional().nullable(),
  preferredCountries: z.array(z.string().trim().max(60)).max(20).optional().nullable(),
  preferredCategories: z.array(z.string().trim().max(60)).max(30).optional().nullable(),
  preferredSalaryMin: z.number().int().min(0).max(100000000).optional().nullable(),
  preferredSalaryMax: z.number().int().min(0).max(100000000).optional().nullable(),
});

export const insertApplicationSchema = createInsertSchema(applications).omit({
  id: true,
  appliedAt: true,
  status: true,
  matchScore: true,
}).extend({
  rejectionFeedback: z.string().trim().max(2000).optional().nullable(),
  employerDecision: z.string().trim().max(100).optional().nullable(),
  employerDecisionNotes: z.string().trim().max(2000).optional().nullable(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  read: true,
  createdAt: true,
}).extend({
  title: z.string().trim().max(200),
  message: z.string().trim().max(2000),
});

// ── New table insert schemas ────────────────────────────────────────

export const insertEducationSchema = createInsertSchema(candidateEducation).omit({
  id: true,
  createdAt: true,
}).extend({
  degree: z.string().trim().min(1, "Degree is required.").max(120),
  institution: z.string().trim().min(1, "Institution is required.").max(200),
  // Year-of-passing bounds — HTIS BUG-003 flagged -2020 being accepted. Upper
  // bound allows +1 year for candidates who are currently in final year.
  year: z.number().int().min(1950, "Year cannot be before 1950.")
    .max(currentYear + 1, `Year cannot be after ${currentYear + 1}.`).optional().nullable(),
  // Percentage OR CGPA is stored here as a decimal string. 0–100 accepts both
  // (CGPA ranges 0–10 fall inside that window, and percentages of 0–100 do
  // too). Rejects negatives and out-of-range values.
  percentage: z.union([z.string(), z.number()]).optional().nullable().transform((v) => (v === null || v === undefined || v === "" ? null : String(v)))
    .refine((v) => v === null || (!Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100), {
      message: "Percentage / CGPA must be between 0 and 100 (or 0–10 on CGPA scale).",
    }),
});

export const insertExperienceSchema = createInsertSchema(candidateExperience).omit({
  id: true,
  createdAt: true,
}).extend({
  company: z.string().trim().min(1, "Company is required.").max(200),
  role: z.string().trim().min(1, "Role is required.").max(120),
  // HTIS BUG-004 — negative `years` accepted.
  years: z.number().int().min(0, "Years cannot be negative.").max(70, "Years looks unrealistic.").optional().nullable(),
  country: z.string().trim().max(80).optional().nullable(),
});

// HP-4b (UAT-03 Item 12): candidate language proficiency.
export const insertLanguageSchema = createInsertSchema(candidateLanguages).omit({
  id: true,
  createdAt: true,
}).extend({
  language: z.string().trim().min(1, "Language is required.").max(60),
  proficiency: z.enum(["elementary", "intermediate", "professional", "native"], {
    errorMap: () => ({ message: "Pick a proficiency level." }),
  }),
});

export const insertDriveSchema = createInsertSchema(recruitmentDrives).omit({
  id: true,
  status: true,
  approvedBy: true,
  rejectionReason: true,
  createdAt: true,
}).extend({
  title: z.string().trim().min(2).max(150),
  description: z.string().trim().max(3000).optional().nullable(),
  location: z.string().trim().min(1).max(120),
  targetRoles: z.array(z.string().trim().max(40)).max(30).optional().nullable(),
});

export const insertInterviewSchema = createInsertSchema(interviews).omit({
  id: true,
  result: true,
  notes: true,
  createdAt: true,
});

export const insertPlacementSchema = createInsertSchema(placements).omit({
  id: true,
  candidateResponse: true,
  declineReason: true,
  createdAt: true,
});

export const insertGrievanceSchema = createInsertSchema(grievances).omit({
  id: true,
  status: true,
  adminNotes: true,
  resolutionNotes: true,
  assignedTo: true,
  resolvedAt: true,
  createdAt: true,
}).extend({
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(10).max(3000),
  category: z.string().trim().max(40),
});

export const insertAuditLogSchema = createInsertSchema(auditLog).omit({
  id: true,
  createdAt: true,
});

export const insertFaqSchema = createInsertSchema(faq).omit({
  id: true,
  createdAt: true,
});

export const insertAnnouncementSchema = createInsertSchema(announcements).omit({
  id: true,
  createdAt: true,
});

export const insertTrainingEventSchema = createInsertSchema(trainingEvents).omit({
  id: true,
  createdAt: true,
});

// ── Types ───────────────────────────────────────────────────────────

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Candidate = typeof candidates.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type RecruitmentAgent = typeof recruitmentAgents.$inferSelect;
export type Employer = typeof employers.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type CandidateEducation = typeof candidateEducation.$inferSelect;
export type CandidateExperience = typeof candidateExperience.$inferSelect;
export type RecruitmentDrive = typeof recruitmentDrives.$inferSelect;
export type Interview = typeof interviews.$inferSelect;
export type Placement = typeof placements.$inferSelect;
export type Grievance = typeof grievances.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type Faq = typeof faq.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type TrainingEvent = typeof trainingEvents.$inferSelect;

// ── Internal notes on applicants (agent collaboration) ──────────────
export const applicationNotes = pgTable("application_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  applicationId: varchar("application_id").references(() => applications.id).notNull(),
  authorId: varchar("author_id").references(() => users.id).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Per-agent, per-candidate tags that persist across multiple applications
// from the same agency — e.g. "good-english", "available-gulf",
// "passport-expires-aug". Private to the agent who wrote them (other agents
// looking at the same candidate see their own tag set only).
export const candidateAgentTags = pgTable("candidate_agent_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  candidateId: varchar("candidate_id").references(() => candidates.id).notNull(),
  agentUserId: varchar("agent_user_id").references(() => users.id).notNull(),
  tag: text("tag").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Per-country reference card (admin-editable) — the single biggest UX
// differentiator for an overseas-placement portal. Shown on every job in
// that country so candidates have embassy contact, visa notes, labor-law
// basics, and rough cost-of-living without leaving the portal.
export const countryInfo = pgTable("country_info", {
  code: text("code").primaryKey(),           // ISO-3166 alpha-2, e.g. "AE", "SA", "DE"
  name: text("name").notNull(),              // "United Arab Emirates"
  embassyPhone: text("embassy_phone"),       // Indian Embassy in <country>
  embassyEmail: text("embassy_email"),
  embassyAddress: text("embassy_address"),
  embassyWebsite: text("embassy_website"),
  visaTimelineDays: integer("visa_timeline_days"),  // typical end-to-end days
  minWageNote: text("min_wage_note"),        // "Qatar minimum wage: QAR 1000/month + food+housing"
  laborLawSummary: text("labor_law_summary"),// 1-2 paragraph summary of worker protections
  costOfLivingNote: text("cost_of_living_note"), // rough ratio / caveats vs Himachal
  climateNote: text("climate_note"),         // "summer 45°C+; Ramadan work hours reduce"
  entryRequirements: text("entry_requirements"), // passport validity, police clearance, medical, etc.
  emergencyContact: text("emergency_contact"),   // MEA 24x7 helpline per region
  // v0.7.4.0 — soft enable/disable. When false, the country is hidden from
  // job-create dropdowns + rejected by the job-create validator, but the row
  // (and all historical jobs/candidates referencing it) is preserved. Used to
  // pause new postings to a destination without losing audit history.
  // audit 2026-07-06 (Batch 4B): is this an ECR destination (Emigration Check
  // Required — the 18 MEA-notified countries)? Drives the eMigrate/PoE
  // checklist step + reporting export (Wave 2). Admin-editable per country.
  isEcrCountry: boolean("is_ecr_country").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

// Candidate-initiated saved searches. Daily cron runs each saved search and
// emails a digest of new matches. Indeed / SEEK / Naukri's single biggest
// return-user retention mechanism.
export const savedSearches = pgTable("saved_searches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  filters: jsonb("filters").notNull(),           // {search, country, salaryTier, experienceTier, sortBy}
  frequency: text("frequency").notNull().default("weekly"),  // "daily" | "weekly" | "off"
  lastRunAt: timestamp("last_run_at"),
  lastMatchCount: integer("last_match_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Saved candidate-search segments (per agent) ─────────────────────
export const savedSegments = pgTable("saved_segments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  filters: jsonb("filters").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ── Email templates (admin-editable, merge-variable driven) ──────────
export const emailTemplates = pgTable("email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  description: text("description"),
  variables: jsonb("variables").default([]),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

export type ApplicationNote = typeof applicationNotes.$inferSelect;
export type SavedSegment = typeof savedSegments.$inferSelect;
export type EmailTemplate = typeof emailTemplates.$inferSelect;

// ── Candidate-submitted references (for background checks) ──────────
export const candidateReferences = pgTable("candidate_references", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  candidateId: varchar("candidate_id").references(() => candidates.id).notNull(),
  name: text("name").notNull(),
  relationship: text("relationship"),
  email: text("email"),
  phone: text("phone"),
  organization: text("organization"),
  contacted: boolean("contacted").default(false),
  contactedAt: timestamp("contacted_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type CandidateReference = typeof candidateReferences.$inferSelect;

// ── Mobile Auth: Refresh Token Rotation ─────────────────────────────
// JWT bearer-token flow for mobile clients. Access tokens are short-lived
// (15min) and stateless; refresh tokens are long-lived (30 days) and stored
// hashed in this table for rotation + reuse detection. See
// /PMD-Final wrapup/MobileApps/05_Backend_API_Adaptations.md §1.
export const mobileRefreshTokens = pgTable("mobile_refresh_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tokenHash: text("token_hash").notNull(),           // SHA-256 of the refresh token
  deviceId: text("device_id"),                        // e.g. "android-PixelOS-abc123"
  userAgent: text("user_agent"),
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  rotatedTo: varchar("rotated_to"),                   // FK → self (chain for refresh rotation)
});

// ── Mobile Push: Device Token Registration ──────────────────────────
// Stores FCM (Android) or APNs (iOS) device tokens. One user can have
// multiple devices. Stale tokens are cleaned on delivery failure. See
// /PMD-Final wrapup/MobileApps/05_Backend_API_Adaptations.md §4.
export const mobilePushTokens = pgTable("mobile_push_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  platform: text("platform").notNull(),               // 'android' | 'ios'
  token: text("token").notNull().unique(),             // the FCM or APNs token
  deviceId: text("device_id"),
  appVersion: text("app_version"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
});

export const insertMobileRefreshTokenSchema = createInsertSchema(mobileRefreshTokens).omit({
  id: true,
  issuedAt: true,
  revokedAt: true,
  rotatedTo: true,
});

export const insertMobilePushTokenSchema = createInsertSchema(mobilePushTokens).omit({
  id: true,
  createdAt: true,
  lastSeenAt: true,
});

export type MobileRefreshToken = typeof mobileRefreshTokens.$inferSelect;
export type MobilePushToken = typeof mobilePushTokens.$inferSelect;

// ── Operator Console: System Configuration ──────────────────────────
// One row per toggleable feature (synthetic monitor, LLM triage, daily
// digest, Loki, DocuMind, notifications). The Operator Console UI reads
// and writes these rows; tool scripts consult them at startup with env-var
// fallback. See Phase_04_PRD.md and /PMD-Final wrapup/Testing & Verificaion/
// Testing Framework & Architecture/01_EMBEDDED_TESTING_ARCHITECTURE.md.
//
// `feature` is the primary key (one canonical row per feature). `config` is
// feature-shaped JSONB validated by per-feature Zod schemas at the API layer.
// Secrets (API keys, webhook URLs) are stored plaintext in v1 — masked in
// API responses; column-level encryption is a Phase 5 follow-up if HPSEDC
// compliance flags it.
export const systemConfig = pgTable("system_config", {
  feature: text("feature").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
  updatedBy: varchar("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSystemConfigSchema = createInsertSchema(systemConfig).omit({
  updatedAt: true,
});

export type SystemConfig = typeof systemConfig.$inferSelect;
export type InsertSystemConfig = z.infer<typeof insertSystemConfigSchema>;
