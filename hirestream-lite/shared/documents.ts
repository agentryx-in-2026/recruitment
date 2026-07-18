/**
 * The document vocabulary — ONE definition, shared by client and server.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * There were THREE, and they disagreed:
 *   1. server/routes/document.routes.ts — an 8-item upload whitelist. The only
 *      thing actually ENFORCED. It had no medical, no PCC, no trade test.
 *   2. client/src/lib/reference-data.ts — COUNTRY_DOC_REQUIREMENTS +
 *      BASE_JOB_DOCUMENTS + DOC_TYPE_LABELS. Display-only, client-only. Its one
 *      consumer rendered a have/need list on the job page. The server never read
 *      it, so it told candidates the UK needs IELTS while nothing checked.
 *   3. server/services/deployment.service.ts — a compliance checklist that
 *      ignores the documents table entirely and scores off candidate STATUS
 *      columns (pccStatus, medicalStatus, pdoCompleted…).
 * Three lists, one of them enforced, none agreeing. UAT-05 item 21 cannot be
 * built on that, so this is the merge. `shared/` specifically: a client copy and
 * a server copy is how you get back to two lists in six months.
 *
 * ── Stages, and why item 9 lives here ───────────────────────────────────────
 * HPSEDC: "PCC and Medical Fitness should remain hidden initially and become
 * visible only after the candidate is shortlisted/selected."
 *
 * The old BASE_JOB_DOCUMENTS demanded medical_certificate AND police_clearance
 * from EVERY candidate for EVERY job — the exact thing item 9 reverses. So the
 * stage is a property OF THE DOCUMENT, not a rule bolted on beside it:
 *
 *   verify  (application status `shortlisted`)  — prove what you claimed.
 *   deploy  (application status `selected`)     — PCC + medical.
 *
 * Deploy-stage documents are the expensive, PERISHABLE ones: a Gulf medical is
 * ~Rs 1,500-3,000 and valid ~3 months, a PCC ~Rs 500 and ~6 months. Collected at
 * registration from 20,000 people they cost applicants Rs 4-7 crore of their own
 * money AND expire before the 500 who matter are selected — so we would have to
 * ask again. That is why they are gated, and why the gate is in the data.
 */

export type DocStage = "verify" | "deploy";

export interface DocTypeSpec {
  key: string;
  label: string;
  labelHi: string;
  stage: DocStage;
  /** False = arranged offline and tracked as a candidate status column, not a file. */
  uploadable: boolean;
  /** Legacy values kept valid so pre-existing rows still load; never offered as a new slot. */
  legacy?: boolean;
}

export const DOC_TYPES: DocTypeSpec[] = [
  // ── verify (shortlisted): prove the claims from registration ──────────
  { key: "identity_proof", label: "ID proof (Aadhaar / Voter ID)", labelHi: "पहचान प्रमाण (आधार / वोटर आईडी)", stage: "verify", uploadable: true },
  { key: "passport", label: "Passport (photo page)", labelHi: "पासपोर्ट (फोटो पृष्ठ)", stage: "verify", uploadable: true },
  { key: "educational_certificate", label: "Education certificate", labelHi: "शैक्षणिक प्रमाणपत्र", stage: "verify", uploadable: true },
  { key: "experience_certificate", label: "Work experience letter", labelHi: "कार्य अनुभव पत्र", stage: "verify", uploadable: true },
  { key: "cv", label: "CV / Resume", labelHi: "सीवी / रिज्यूमे", stage: "verify", uploadable: true },
  // profession-specific (UAT-05 item 21) — these are the keys professions.seed
  // references, and until now NONE of them were uploadable: the whitelist would
  // have 400'd every one.
  { key: "nursing_certificate", label: "Nursing degree / diploma certificate", labelHi: "नर्सिंग डिग्री / डिप्लोमा प्रमाणपत्र", stage: "verify", uploadable: true },
  { key: "nursing_council_registration", label: "Nursing Council registration certificate", labelHi: "नर्सिंग काउंसिल पंजीकरण प्रमाणपत्र", stage: "verify", uploadable: true },
  { key: "driving_licence", label: "Driving licence", labelHi: "ड्राइविंग लाइसेंस", stage: "verify", uploadable: true },
  { key: "badge_licence", label: "Badge / commercial licence", labelHi: "बैज / कमर्शियल लाइसेंस", stage: "verify", uploadable: true },
  { key: "iti_certificate", label: "ITI / trade certificate", labelHi: "आईटीआई / ट्रेड प्रमाणपत्र", stage: "verify", uploadable: true },
  { key: "training_certificate", label: "Training certificate", labelHi: "प्रशिक्षण प्रमाणपत्र", stage: "verify", uploadable: true },
  // country-specific
  { key: "trade_test", label: "Trade test result", labelHi: "ट्रेड टेस्ट परिणाम", stage: "verify", uploadable: true },
  { key: "ielts", label: "IELTS score report", labelHi: "IELTS स्कोर रिपोर्ट", stage: "verify", uploadable: true },

  // ── deploy (selected): UAT-05 item 9 ─────────────────────────────────
  { key: "police_clearance", label: "Police Clearance Certificate (PCC)", labelHi: "पुलिस क्लीयरेंस प्रमाणपत्र (PCC)", stage: "deploy", uploadable: true },
  { key: "medical_certificate", label: "Medical fitness certificate", labelHi: "मेडिकल फिटनेस प्रमाणपत्र", stage: "deploy", uploadable: true },
  { key: "offer_letter", label: "Offer letter", labelHi: "ऑफर लेटर", stage: "deploy", uploadable: true },

  // ── always allowed ───────────────────────────────────────────────────
  { key: "other", label: "Other document", labelHi: "अन्य दस्तावेज़", stage: "verify", uploadable: true },
  { key: "certificate", label: "Certificate", labelHi: "प्रमाणपत्र", stage: "verify", uploadable: true, legacy: true },
];

export const DOC_TYPE_KEYS = DOC_TYPES.map((d) => d.key);
const BY_KEY: Record<string, DocTypeSpec> = Object.fromEntries(DOC_TYPES.map((d) => [d.key, d]));

export function docSpec(key: string): DocTypeSpec | undefined { return BY_KEY[key]; }

export function docLabel(key: string, lang?: string): string {
  const s = BY_KEY[key];
  if (!s) return key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return lang?.startsWith("hi") ? s.labelHi : s.label;
}

/** The upload whitelist. Single source — document.routes.ts imports this. */
export function isValidDocType(key: string | null | undefined): boolean {
  return !!key && DOC_TYPE_KEYS.includes(key);
}

/**
 * Everyone shortlisted proves these, whatever the trade or the country.
 *
 * NOTE what is NOT here: medical_certificate and police_clearance. The old
 * BASE_JOB_DOCUMENTS listed both, i.e. it asked all 20,000 applicants for a
 * perishable certificate they pay for. That is item 9, and its fix is that they
 * are `stage: "deploy"` above.
 */
export const BASE_VERIFY_DOCS = [
  "identity_proof",
  "passport",
  "educational_certificate",
  "experience_certificate",
];

/** Selected candidates only. Item 9. */
export const DEPLOY_DOCS = ["police_clearance", "medical_certificate"];

/**
 * The country dimension — extras on top of BASE_VERIFY_DOCS.
 *
 * Carried over verbatim from the client-only table this replaces, MINUS the
 * medical/PCC that used to sit in its base set. It was never enforced anywhere;
 * now the server resolves it too.
 */
export const COUNTRY_VERIFY_DOCS: Record<string, string[]> = {
  "United Arab Emirates": ["educational_certificate"],
  "UAE": ["educational_certificate"],
  "Saudi Arabia": ["educational_certificate", "trade_test"],
  "Qatar": ["educational_certificate"],
  "Kuwait": ["educational_certificate"],
  "Oman": [],
  "Bahrain": [],
  "UK": ["ielts", "cv"],
  "United Kingdom": ["ielts", "cv"],
  "Germany": ["cv"],
  "Canada": ["ielts", "cv"],
  "Australia": ["ielts", "cv"],
  "Ireland": ["ielts", "cv"],
  "New Zealand": ["ielts", "cv"],
  "Singapore": ["cv"],
  "Japan": ["cv"],
  "USA": ["ielts", "cv"],
};

/**
 * Which of the candidate's trades this VACANCY actually cares about.
 *
 * Found by smoking the resolver against real data: a candidate shortlisted for a
 * MASON job was being asked for a Nursing Council registration, because the
 * union ran over every profession they hold. A mason vacancy does not care that
 * you are also a nurse.
 *
 * `profession_requirements.jobCategoryKeys` is the bridge to `jobs.category`.
 * It is a LIST because the relationship is many-to-many: mason, carpenter and
 * painter all map to construction_worker, and a welder maps to construction_worker,
 * factory_worker AND technician. It was a single key until an audit found the
 * document rules firing on 4 of 20 live vacancies because of it.
 *
 * A job with NO category matches nothing, so the candidate is asked for the base
 * + country set only. That under-asks rather than over-asks, deliberately:
 * `jobs.category` is nullable for legacy rows, and demanding a Council
 * registration for a job we cannot classify is worse than missing a trade
 * certificate an agent can request by hand. The Job Poster requires a category
 * on new posts.
 */
export function relevantProfessions(
  professionKeys: string[],
  professionReqs: Record<string, { jobCategoryKeys?: string[] | null }>,
  jobCategory?: string | null,
): string[] {
  if (!jobCategory) return [];
  return professionKeys.filter((pk) => (professionReqs[pk]?.jobCategoryKeys || []).includes(jobCategory));
}

export interface RequiredDocs {
  /** Must be uploaded before the stage is complete. */
  required: string[];
  /** Offered, not enforced. */
  optional: string[];
  /** Where each requirement came from — so the UI can say WHY it is being asked. */
  reasons: Record<string, string[]>;
}

/**
 * Resolve what a candidate owes at a stage.
 *
 *   verify  = base ∪ profession ∪ country ∪ vacancy
 *   deploy  = PCC + medical
 *
 * ── Why the union is here and not in registration ──────────────────────────
 * A requirement can depend on three things: the PROFESSION (nurse → Council
 * registration), the COUNTRY (UK → IELTS), and the VACANCY (this employer wants
 * a trade test). Only the first is known at registration — item 8 removed the
 * country question, and there is no job yet. All three are known at SHORTLIST,
 * against a named vacancy. So this resolves per (candidate, job), not per
 * candidate.
 */
export function resolveRequiredDocs(input: {
  stage: DocStage;
  /**
   * The candidate's professions that are RELEVANT TO THIS VACANCY — not every
   * trade they hold. Scope with `relevantProfessions()` before calling.
   */
  professionKeys: string[];
  /** profession_requirements rows, keyed by professionKey. */
  professionReqs: Record<string, { requiredDocs?: string[] | null; optionalDocs?: string[] | null }>;
  country?: string | null;
  /** jobs.additional_required_docs — the per-vacancy exception. */
  jobAdditional?: string[] | null;
}): RequiredDocs {
  const required = new Set<string>();
  const optional = new Set<string>();
  const reasons: Record<string, string[]> = {};
  const because = (key: string, why: string) => { (reasons[key] ||= []).push(why); };

  if (input.stage === "deploy") {
    for (const k of DEPLOY_DOCS) { required.add(k); because(k, "selected"); }
    return { required: [...required], optional: [], reasons };
  }

  for (const k of BASE_VERIFY_DOCS) { required.add(k); because(k, "base"); }

  for (const pk of input.professionKeys) {
    const req = input.professionReqs[pk];
    if (!req) continue;
    for (const k of req.requiredDocs || []) { required.add(k); because(k, `profession:${pk}`); }
    for (const k of req.optionalDocs || []) { if (!required.has(k)) optional.add(k); because(k, `profession:${pk}`); }
  }

  for (const k of COUNTRY_VERIFY_DOCS[input.country || ""] || []) { required.add(k); because(k, `country:${input.country}`); }

  for (const k of input.jobAdditional || []) { required.add(k); optional.delete(k); because(k, "vacancy"); }

  // A doc that is required by one source and optional by another is REQUIRED —
  // e.g. a welder's trade test is optional by profession but mandatory on a
  // Saudi vacancy. Required always wins.
  for (const k of required) optional.delete(k);

  return { required: [...required], optional: [...optional], reasons };
}
