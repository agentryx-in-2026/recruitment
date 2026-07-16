import { storage } from "../storage";
import { systemSettings } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../config/logger.config";

/**
 * System Settings Service — central read/write layer for runtime-configurable
 * behaviour. Reads are in-memory after first load (invalidated on write), so
 * hot-path endpoints (status change, match filtering, etc.) pay zero DB cost.
 *
 * Add new keys to DEFAULTS below; call `getSetting(key)` from any endpoint.
 */

export type SettingCategory = "pipeline" | "rejection" | "access" | "notifications" | "matching" | "lifecycle" | "uploads" | "security" | "capability" | "contact" | "compliance";

export interface SettingSpec {
  key: string;
  category: SettingCategory;
  label: string;
  description: string;
  type: "boolean" | "number" | "string" | "string_array" | "json";
  default: any;
  min?: number;
  max?: number;
  options?: string[]; // for string_array / enum-style settings
}

export const SETTING_SPECS: SettingSpec[] = [
  // ── Pipeline ─────────────────────────────────────────────────────────
  {
    key: "pipeline.allow_backward_transitions",
    category: "pipeline",
    label: "Allow backward status transitions",
    description: "Let recruiters move an application back (e.g. Shortlisted → Reviewed) without rejecting it first.",
    type: "boolean",
    default: true,
  },
  {
    key: "pipeline.require_reason_on_backward",
    category: "pipeline",
    label: "Require reason for backward moves",
    description: "Force a short note when a status is moved backward. Written to the audit log. Off during UAT; on for prod.",
    type: "boolean",
    default: false,
  },
  {
    key: "pipeline.terminal_states",
    category: "pipeline",
    label: "Terminal (locked) statuses",
    description: "Applications in these states can only be modified by an admin. Empty during UAT; set to [\"placed\", \"offer_accepted\"] before go-live.",
    type: "string_array",
    default: [], // UAT default: nothing locked. Lock placed + offer_accepted in prod.
    options: ["submitted", "reviewed", "shortlisted", "interview_scheduled", "selected", "placed", "rejected", "offer_accepted"],
  },
  {
    key: "pipeline.undo_window_minutes",
    category: "pipeline",
    label: "Undo window (minutes)",
    description: "How long after a status change an undo toast is available. Set 0 to disable.",
    type: "number",
    default: 15,
    min: 0,
    max: 120,
  },

  // ── Rejection ────────────────────────────────────────────────────────
  {
    key: "rejection.allow_revert",
    category: "rejection",
    label: "Allow un-rejecting a candidate",
    description: "Let recruiters reverse a rejection within the undo window. Audit logged.",
    type: "boolean",
    default: true,
  },
  {
    key: "rejection.require_reason",
    category: "rejection",
    label: "Require reason on rejection",
    description: "Force the recruiter to enter feedback before a rejection is saved. Off during UAT; on for prod (best practice + candidate experience).",
    type: "boolean",
    default: false,
  },

  // ── Access ───────────────────────────────────────────────────────────
  {
    key: "agency.require_verification_to_post",
    category: "access",
    label: "Require agency verification to publish jobs",
    description: "Unverified agents can draft jobs but cannot publish until HPSEDC approves their license.",
    type: "boolean",
    default: true,
  },
  {
    // v0.4.32 (HPSEDC Item 1): mirror gate for employers. Default ON so
    // staging is HPSEDC-compliant out of the box; admins can flip OFF
    // during early pilots if needed.
    key: "employer.require_verification_to_post",
    category: "access",
    label: "Require company verification to publish requisitions",
    description: "Unverified employers can save drafts but cannot publish requisitions until HPSEDC approves their company KYB.",
    type: "boolean",
    default: true,
  },
  {
    // HPSEDC tester report (2026-06-10): unverified agencies could browse and
    // open candidate profiles (PII) before HPSEDC approval — an FRS §2.5 /
    // privacy gap. Gate the candidate-browse endpoints behind verification,
    // mirroring agency.require_verification_to_post. Default ON.
    key: "agency.require_verification_to_view_candidates",
    category: "access",
    label: "Require agency verification to view candidate profiles",
    description: "Unverified agencies cannot search or open candidate profiles until HPSEDC approves their license.",
    type: "boolean",
    default: true,
  },
  {
    key: "drive.require_admin_approval",
    category: "access",
    label: "Require admin approval for drives",
    description: "When off, recruitment drives go live immediately without the HPSEDC approval gate.",
    type: "boolean",
    default: true,
  },

  // ── Capability (HP-3: single-agency / blue-collar fork gating) ────────
  // These flags DISABLE (never delete) the multi-role marketplace surface so
  // HireStream-HP runs as a single mega-agency (HPSEDC). The full multi-role
  // architecture stays intact behind them — flip these ON to re-expand into a
  // marketplace (external employers + agencies) with zero code changes.
  // Reference portal (separate DB) keeps its own values; these HP defaults do
  // not affect it.
  {
    key: "capability.employer_self_registration",
    category: "capability",
    label: "Allow employers to self-register",
    description: "When off, the 'Employer' role is hidden from signup and employer self-registration is rejected. HPSEDC manages employer entities directly. Turn on to re-open the marketplace to self-serve employers.",
    type: "boolean",
    default: false,
  },
  {
    key: "capability.agency_self_registration",
    category: "capability",
    label: "Allow agencies to self-register",
    description: "When off, the 'Agency' role is hidden from signup and agent self-onboarding is rejected. HPSEDC operates as the sole agency. Turn on to admit external recruitment agencies.",
    type: "boolean",
    default: false,
  },
  {
    key: "capability.agency_mode",
    category: "capability",
    label: "Agency operating mode",
    description: "'single' = one mega-agency (HPSEDC) owns all jobs/candidates. 'marketplace' = multiple agencies compete (the reference-portal model).",
    type: "string",
    default: "single",
    options: ["single", "marketplace"],
  },
  {
    key: "capability.default_agency_user_id",
    category: "capability",
    label: "Default (mega) agency user id",
    description: "In single mode, the agent user id that owns all jobs. Populated by the boot-time default-agency seed; do not edit by hand.",
    type: "string",
    default: "",
  },
  {
    // HP-4c: the 3rd registration tier (Assisted / callback). HPSEDC may not
    // want to offer a callback queue — this flag hides the option everywhere
    // (dashboard + /start) when off. When on, the option is presented as a
    // slower fallback that nudges the candidate to self-fill with help.
    key: "capability.assisted_callback_enabled",
    category: "capability",
    label: "Offer the 'HPSEDC will call me' registration option",
    description: "When ON, candidates who can't self-register can leave name+phone for an HPSEDC callback (the Assisted tier). Turn OFF to hide it entirely and require self-service (Standard/Professional).",
    type: "boolean",
    default: true,
  },
  {
    // The two self-service registration routes. Each can be turned off from
    // admin — the card is then hidden on the dashboard AND /start. At least one
    // route should stay enabled or candidates can't self-register.
    key: "capability.standard_registration_enabled",
    category: "capability",
    label: "Offer the Standard (blue-collar) registration route",
    description: "The simple picture-based /apply flow. Turn OFF to hide the 'Fill it myself' option.",
    type: "boolean",
    default: true,
  },
  {
    key: "capability.professional_registration_enabled",
    category: "capability",
    label: "Offer the Professional (degree/diploma) registration route",
    description: "The guided /apply/pro flow for degree-holders. Turn OFF to hide the 'I have a degree' option.",
    type: "boolean",
    default: true,
  },

  // ── Notifications ────────────────────────────────────────────────────
  {
    key: "notifications.auto_on_status_change",
    category: "notifications",
    label: "Auto-notify candidate on status change",
    description: "Send an in-portal notification (and email, if SMTP configured) whenever an application status is updated.",
    type: "boolean",
    default: true,
  },

  // ── Matching ─────────────────────────────────────────────────────────
  {
    key: "matching.recommendation_threshold_pct",
    category: "matching",
    label: "Recommendation threshold (%)",
    description: "Minimum match score for a job to appear in a candidate's 'Recommended for you' feed.",
    type: "number",
    default: 40,
    min: 0,
    max: 100,
  },
  {
    // v0.4.33 (Phase 3): engine version selector. v2 is the 7-factor scorer;
    // v1 is the legacy 3-factor for rollback. Admin Parameters Module
    // surfaces this as a radio toggle.
    key: "matching.engine_version",
    category: "matching",
    label: "Matching engine version",
    description: "Switch between v2 (7-factor, default) and v1 (legacy 3-factor) without redeploying.",
    type: "string",
    default: "v2",
  },
  {
    // v0.4.33 (Phase 3): JSON weight map with the 7 factor keys. Sum must
    // equal 100. Admin UI enforces sum-to-100 on save; the engine renorm-
    // alises defensively if the saved values drift.
    key: "matching.weights",
    category: "matching",
    label: "Matching weights",
    description: "Per-factor weights for the v2 engine. Must sum to 100. Defaults: skill 30, experience 20, qualification 10, country 15, language 10, category 10, salary 5.",
    type: "json",
    default: {
      skill: 30, experience: 20, qualification: 10, country: 15,
      language: 10, category: 10, salary: 5,
    },
  },
  {
    // v0.4.33 (Phase 3): missing-criteria policy per factor.
    // v0.4.35.1: per-direction — each factor has separate jobMissing +
    // candidateMissing knobs. Values "full" | "half" | "zero". Mirrors
    // HireStream_Matching_Engine.pdf §4. Legacy single-string shape is
    // auto-migrated by the engine's loadPolicy().
    key: "matching.policy",
    category: "matching",
    label: "Missing-criteria policy",
    description: "How the engine treats each factor when the job-side OR candidate-side input is missing. Per-direction: { jobMissing, candidateMissing } each full / half / zero.",
    type: "json",
    default: {
      skill:         { jobMissing: "half", candidateMissing: "zero" },
      experience:    { jobMissing: "full", candidateMissing: "full" },
      qualification: { jobMissing: "full", candidateMissing: "half" },
      country:       { jobMissing: "full", candidateMissing: "half" },
      language:      { jobMissing: "full", candidateMissing: "zero" },
      category:      { jobMissing: "full", candidateMissing: "half" },
      salary:        { jobMissing: "full", candidateMissing: "full" },
    },
  },
  {
    // v0.4.33 (Phase 3): show the explainability breakdown to candidates.
    // Admin can hide if HPSEDC ever decides candidates shouldn't see the
    // factor-level breakdown.
    key: "matching.show_breakdown_to_candidate",
    category: "matching",
    label: "Show match breakdown to candidate",
    description: "When ON, candidates see the 7-factor breakdown on Recommended Jobs and Application Detail. When OFF, only the total score is shown.",
    type: "boolean",
    default: true,
  },
  {
    key: "leaderboard.placement_weight",
    category: "matching",
    label: "Leaderboard: placement weight",
    description: "Multiplier for placements when computing the agency leaderboard score. Higher = leaderboard rewards volume.",
    type: "number",
    default: 10,
    min: 0,
    max: 100,
  },
  {
    key: "leaderboard.rating_weight",
    category: "matching",
    label: "Leaderboard: rating weight",
    description: "Multiplier for average candidate rating when computing the agency leaderboard score. Higher = rewards quality.",
    type: "number",
    default: 5,
    min: 0,
    max: 100,
  },

  // ── Application lifecycle ────────────────────────────────────────────
  // ── Pipeline & Workflow (PWS §2, §6, §7) ──────────────────────────
  {
    key: "requisition.pairing_mode",
    category: "pipeline",
    label: "Agent–employer pairing mode",
    description: "How agents are paired with employer requisitions. 'open' = any verified agent can pick up any requisition (default). 'pinned_only' = only agents explicitly pinned by the employer can pick up.",
    type: "string",
    default: "open",
    options: ["open", "pinned_only"],
  },
  {
    key: "candidate.default_open_to_outreach",
    category: "access",
    label: "New candidates opted-in to agent outreach by default",
    description: "When a candidate registers, should the 'open_to_outreach' flag be on by default? UAT: true. Production recommendation: false (candidate must opt in explicitly).",
    type: "boolean",
    default: true,
  },
  {
    key: "requisition.cascade_close_derivatives",
    category: "lifecycle",
    label: "Cascade-close derivative jobs on requisition close",
    description: "When an employer closes a requisition, automatically close all agent-posted derivative jobs linked to it. Candidates on those jobs get a neutral 'position filled' notification.",
    type: "boolean",
    default: true,
  },
  {
    key: "notifications.hide_employer_in_negatives",
    category: "notifications",
    label: "Hide employer name in candidate-facing negative messages",
    description: "When a candidate is rejected, not selected, or a position is filled, candidate-facing notifications never mention the employer by name. Keeps the agent as the sole visible liaison.",
    type: "boolean",
    default: true,
  },
  {
    key: "job.auto_close_nudge_days_before_deadline",
    category: "lifecycle",
    label: "Deadline-nudge window (days before)",
    description: "Owner is notified this many days before a job's hiring_deadline that the job will auto-close. Set 0 to disable the nudge.",
    type: "number",
    default: 3,
    min: 0,
    max: 30,
  },
  {
    key: "jobs.max_drafts_per_user",
    category: "access",
    label: "Maximum drafts per user",
    description: "Caps the number of draft jobs/requisitions a single agent or employer can hold. Prevents accidental draft sprawl.",
    type: "number",
    default: 20,
    min: 1,
    max: 200,
  },
  {
    key: "job.auto_expire_days",
    category: "lifecycle",
    label: "Auto-close jobs without hiring deadline (days)",
    description: "Jobs without an explicit hiringDeadline auto-close after this many days since creation. Jobs WITH a hiringDeadline close on that date. Set 0 to disable auto-close (manual close only). Requires a nightly cron — stub wired, not yet scheduled.",
    type: "number",
    default: 60,
    min: 0,
    max: 365,
  },
  {
    key: "application.auto_expire_days",
    category: "lifecycle",
    label: "Auto-expire stale applications (days)",
    description: "Applications sitting in Submitted / Reviewed for this many days will be flagged stale. Set 0 to disable. (Requires a nightly job to actually close them.)",
    type: "number",
    default: 90,
    min: 0,
    max: 365,
  },
  {
    key: "application.profile_completion_required_pct",
    category: "lifecycle",
    label: "Minimum profile completion to apply (%)",
    description: "Candidates below this profile completion % are blocked from applying. Set 0 to allow anyone to apply.",
    type: "number",
    default: 0,
    min: 0,
    max: 100,
  },

  // ── Access & limits ──────────────────────────────────────────────────
  {
    key: "agency.max_active_jobs",
    category: "access",
    label: "Maximum active jobs per agency",
    description: "Cap the number of simultaneously active job postings per agency. Set 0 for unlimited.",
    type: "number",
    default: 0,
    min: 0,
    max: 1000,
  },

  {
    // Smart Job Importer: which agent user owns bulk-imported jobs. Empty
    // (default) = resolve at commit time — the first verified agency's user
    // (HPSEDC mega-agency in single mode), else the importing admin.
    key: "jobimport.default_agent_user_id",
    category: "access",
    label: "Job importer — owner agent user id",
    description: "Agent user_id that owns jobs created by the Smart Job Importer. Leave empty to auto-resolve: the first verified agency (HPSEDC) or, if none, the importing admin.",
    type: "string",
    default: "",
  },

  // ── Notifications / SLAs ─────────────────────────────────────────────
  {
    key: "interview.reminder_lead_hours",
    category: "notifications",
    label: "Interview reminder lead time (hours)",
    description: "Send a reminder to both candidate and agent this many hours before a scheduled interview. Set 0 to disable. (Cron-driven.)",
    type: "number",
    default: 24,
    min: 0,
    max: 168,
  },
  {
    key: "grievance.escalation_days",
    category: "notifications",
    label: "Grievance auto-escalation (days)",
    description: "Grievances unresolved for this many days get auto-escalated to a senior admin. Set 0 to disable. (Cron-driven.)",
    type: "number",
    default: 7,
    min: 0,
    max: 60,
  },

  // ── Uploads ──────────────────────────────────────────────────────────
  {
    key: "uploads.max_file_size_mb",
    category: "uploads",
    label: "Max file size (MB)",
    description: "Largest document a candidate can upload. Applies to CV, passport, certificates alike.",
    type: "number",
    default: 5,
    min: 1,
    max: 50,
  },

  // ── Security ─────────────────────────────────────────────────────────
  {
    key: "auth.session_timeout_minutes",
    category: "security",
    label: "Session timeout (minutes)",
    description: "How long a user can stay idle before being signed out. HTIS T5 compliance sets this at 30 by default for government deployments.",
    type: "number",
    default: 30,
    min: 5,
    max: 480,
  },
  {
    key: "auth.password_min_length",
    category: "security",
    label: "Minimum password length",
    description: "Characters required for new passwords. Government security guidelines recommend ≥ 10.",
    type: "number",
    default: 8,
    min: 6,
    max: 32,
  },
  {
    key: "ratelimit.api_per_15min",
    category: "security",
    label: "API requests per 15-min window",
    description: "Per-IP cap on all /api/* requests. Set high for UAT (1000-2000), tighten for production (100-300). Applied live — no restart needed.",
    type: "number",
    default: 2000,
    min: 10,
    max: 50000,
  },
  {
    key: "ratelimit.auth_attempts_per_15min",
    category: "security",
    label: "Auth attempts per 15-min window",
    description: "Per-IP cap on failed login attempts to block brute-force. Successful logins don't count. Keep low in production (20-50).",
    type: "number",
    default: 200,
    min: 5,
    max: 2000,
  },
  {
    key: "ratelimit.sensitive_per_15min",
    category: "security",
    label: "Sensitive actions per 15-min window",
    description: "Per-IP cap on password-reset requests and OTP sends. Very tight in production (5-10) to prevent abuse.",
    type: "number",
    default: 50,
    min: 1,
    max: 500,
  },
  {
    key: "auth.single_session_per_user",
    category: "security",
    label: "Single session per user (kill other devices on login)",
    description: "When ON, logging in on a new device signs the user out of all other devices (HTIS T4 strict interpretation). When OFF (default), the same user can be logged in on phone + laptop concurrently — standard govt portal behavior (Aadhaar, Digilocker, Naukri all allow this). Turn ON before HTIS audit if they insist.",
    type: "boolean",
    default: false,
  },
  // ── Grievance routing + SLA ──────────────────────────────────────────
  {
    key: "grievance.technical_owner_user_id",
    category: "access",
    label: "Technical-grievance owner (user_id)",
    description: "When set, technical_problem grievances are auto-assigned to this user_id (typically an Agentryx delivery contact). Empty = falls back to admin queue. Find the user_id in superadmin → User Management.",
    type: "string",
    default: "",
  },
  {
    key: "grievance.sla_days_default",
    category: "access",
    label: "Grievance SLA — default days to resolve",
    description: "Days from submit to expected resolution for grievance categories without a specific override. Drives the aging badge color and (future) escalation cron.",
    type: "number",
    default: 7,
    min: 1,
    max: 90,
  },
  {
    key: "grievance.sla_days_application_issue",
    category: "access",
    label: "Grievance SLA — application_issue (agent first-responder)",
    description: "Agents have this many days to action a candidate's application_issue grievance before it escalates to admin.",
    type: "number",
    default: 3,
    min: 1,
    max: 30,
  },
  {
    key: "grievance.sla_days_technical",
    category: "access",
    label: "Grievance SLA — technical_problem",
    description: "Days the technical-grievance owner (Agentryx delivery) has to triage a tech complaint.",
    type: "number",
    default: 3,
    min: 1,
    max: 30,
  },
  {
    key: "grievance.sla_days_fraud",
    category: "access",
    label: "Grievance SLA — fraud_report (priority)",
    description: "Maximum days for HPSEDC admin to triage a fraud report. MEA expects fast response on overseas-placement fraud — keep this aggressive.",
    type: "number",
    default: 2,
    min: 1,
    max: 14,
  },
  // ── Interview lifecycle ──────────────────────────────────────────────
  {
    key: "interview.conducted_by",
    category: "pipeline",
    label: "Who conducts interviews",
    description: "Per FRS §2.7 / §6 — interviews can be conducted by the agent (pre-screen flow), the employer (post-shortlist gate), or either depending on the deployment. Drives which role's UI shows the 'Record Outcome' action on an interview_scheduled application. Default 'either' matches the FRS ambiguity — switch to 'employer_only' for a strict employer-led pipeline.",
    type: "string",
    default: "either",
    options: ["agent_only", "employer_only", "either"],
  },

  // ── Compliance & placement gates (audit 2026-07-06, Batch 4B) ────────
  {
    key: "compliance.enforce_passport_validity",
    category: "compliance",
    label: "Block applications on <6-month passport validity",
    description: "Most destinations require 6 months of passport validity. OFF (default) = the candidate sees a warning but can still apply. ON = applications are blocked until the passport is renewed.",
    type: "boolean",
    default: false,
  },
  {
    key: "compliance.gate_travel_on_pdo_pbby",
    category: "compliance",
    label: "ECR candidates: require PDO + PBBY before travel date",
    description: "For ECR-passport candidates, a travel/start date cannot be set until Pre-Departure Orientation is completed AND PBBY insurance is enrolled (Emigration Act requirement). Turn OFF only if HPSEDC tracks these outside the portal.",
    type: "boolean",
    default: true,
  },
  {
    key: "placement.require_letter_to_accept",
    category: "compliance",
    label: "Require appointment letter before offer accept",
    description: "Candidates cannot accept a placement offer until the appointment letter is uploaded (protects against undocumented verbal offers). Admins can still accept on the candidate's behalf as an override.",
    type: "boolean",
    default: true,
  },
  // ── Compliance crons (audit 2026-07-06, Batch 4B-2) ──────────────────
  {
    key: "compliance.expiry_alerts_enabled",
    category: "compliance",
    label: "Document-expiry alert cron",
    description: "Daily cron that warns candidates when their passport, PCC, or medical certificate is expired or approaching expiry (the #1 cause of visa-stage collapse). Alerts fire once per milestone (90/60/30 days + expired), never daily. Turn OFF to silence entirely.",
    type: "boolean",
    default: true,
  },
  {
    key: "compliance.expiry_alert_days",
    category: "compliance",
    label: "Expiry alert window (days)",
    description: "First warning fires when a document is within this many days of expiry. Further reminders fire only at the 60/30-day marks and at actual expiry.",
    type: "number",
    default: 90,
    min: 7,
    max: 365,
  },
  {
    key: "grievance.sla_cron_enabled",
    category: "notifications",
    label: "Grievance SLA-aging cron",
    description: "Daily cron that auto-escalates grievances still open past their per-category SLA (see the grievance.sla_days_* settings) and notifies the owner + HPSEDC admins. Each grievance escalates at most once.",
    type: "boolean",
    default: true,
  },
  {
    key: "welfare.auto_prompts_enabled",
    category: "notifications",
    label: "Automated 30/60/90-day welfare prompts",
    description: "Daily cron that sends deployed workers a 'How are you? Reply OK / NEED HELP' prompt at 30, 60 and 90 days after deployment, feeding the post-placement support queue. Each milestone prompts at most once per placement.",
    type: "boolean",
    default: true,
  },
  {
    key: "placement.offer_validity_days",
    category: "compliance",
    label: "Offer validity (days)",
    description: "Placement offers expire this many days after they are issued; expired offers cannot be accepted (admin override allowed). Set 0 to disable expiry on new offers.",
    type: "number",
    default: 7,
    min: 0,
    max: 90,
  },

  // ── Contact (public) ─────────────────────────────────────────────────
  // Surfaced unauthenticated via /config/public so the candidate UI can show
  // an official HPSEDC helpline (Fable-flagged as the top trust signal for a
  // govt + blue-collar audience). Empty by default — the UI shows the helpline
  // ONLY when HPSEDC fills a real number, so no fake number is ever displayed.
  {
    key: "contact.helpline_phone",
    category: "contact",
    label: "HPSEDC helpline number",
    description: "Public helpline shown to candidates (dashboard + footer) as a tap-to-call link. Leave empty to hide the helpline until a real number is available. E.g. 0177-2620331.",
    type: "string",
    default: "",
  },
  {
    key: "contact.helpline_hours",
    category: "contact",
    label: "HPSEDC helpline hours",
    description: "Optional caption under the helpline (e.g. 'Mon–Sat, 10 am – 5 pm'). Shown only when a helpline number is set.",
    type: "string",
    default: "",
  },
];

const defaultsByKey = new Map(SETTING_SPECS.map((s) => [s.key, s.default]));
const cache = new Map<string, any>();
let cacheLoaded = false;

async function loadAll() {
  if (!storage.db) return;
  const rows = await storage.db.select().from(systemSettings);
  for (const r of rows) cache.set(r.key, r.value);
  cacheLoaded = true;
}

/** Read a setting value, falling back to its default if unset. Fast (in-memory). */
export async function getSetting<T = any>(key: string): Promise<T> {
  if (!cacheLoaded) await loadAll();
  if (cache.has(key)) return cache.get(key) as T;
  return defaultsByKey.get(key) as T;
}

/** Read synchronously once cache is loaded (boot-time init). */
export function getSettingSync<T = any>(key: string): T {
  if (cache.has(key)) return cache.get(key) as T;
  return defaultsByKey.get(key) as T;
}

/** Read every setting + its spec (for the Admin UI). */
export async function getAllSettings() {
  if (!cacheLoaded) await loadAll();
  return SETTING_SPECS.map((s) => ({
    ...s,
    value: cache.has(s.key) ? cache.get(s.key) : s.default,
    isDefault: !cache.has(s.key),
  }));
}

/** Update a setting. Validates against the spec. Invalidates cache. */
export async function updateSetting(key: string, value: any, userId?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const spec = SETTING_SPECS.find((s) => s.key === key);
  if (!spec) return { ok: false, error: `Unknown setting: ${key}` };

  // Coerce + validate by type
  let v = value;
  if (spec.type === "boolean") v = !!value;
  else if (spec.type === "number") {
    v = Number(value);
    if (!Number.isFinite(v)) return { ok: false, error: "Must be a number" };
    if (spec.min !== undefined && v < spec.min) return { ok: false, error: `Must be ≥ ${spec.min}` };
    if (spec.max !== undefined && v > spec.max) return { ok: false, error: `Must be ≤ ${spec.max}` };
  } else if (spec.type === "string_array") {
    if (!Array.isArray(v)) return { ok: false, error: "Must be an array" };
    if (spec.options) {
      const bad = v.find((x) => !spec.options!.includes(String(x)));
      if (bad) return { ok: false, error: `Invalid option: ${bad}` };
    }
  } else if (spec.type === "string") {
    v = String(v);
    if (spec.options && !spec.options.includes(v)) {
      return { ok: false, error: `Must be one of: ${spec.options.join(", ")}` };
    }
  } else if (spec.type === "json") {
    // v0.4.33 (Phase 3): JSON values must be plain objects/arrays; no
    // class-validation here — caller-side schema applies (e.g. matching
    // engine validates sum-to-100 on its admin endpoint before calling).
    if (typeof v !== "object" || v === null) {
      return { ok: false, error: "Must be an object" };
    }
  }

  if (!storage.db) return { ok: false, error: "DB unavailable" };

  const existing = await storage.db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
  const previous = existing.length > 0 ? existing[0].value : null;
  if (existing.length > 0) {
    await storage.db.update(systemSettings).set({ value: v, updatedAt: new Date(), updatedBy: userId || null }).where(eq(systemSettings.key, key));
  } else {
    await storage.db.insert(systemSettings).values({ key, value: v, description: spec.description, category: spec.category, updatedBy: userId || null });
  }

  cache.set(key, v);
  logger.info(`Setting updated: ${key} by ${userId || "system"}`);

  // v0.4.33 (Phase 3): write to audit_log so the Matching Engine module
  // (and any other reviewer) can trace who changed what + when. Keeps the
  // audit trail simple — actor, key, before/after in details.
  if (userId) {
    try {
      const { auditLog } = await import("@shared/schema");
      await storage.db.insert(auditLog).values({
        userId,
        action: "update",
        resourceType: "setting",
        resourceId: key,
        details: { key, before: previous, after: v } as any,
      }).catch(() => { /* audit failures must never block the setting save */ });
    } catch { /* audit-only path, swallow */ }
  }

  return { ok: true };
}

/** Initialise cache on server boot. Safe to call multiple times. */
export async function initSettings() {
  await loadAll();
  logger.info(`Settings loaded: ${cache.size} stored, ${SETTING_SPECS.length - cache.size} using defaults`);
}
