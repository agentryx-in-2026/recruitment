/**
 * HireStream Matching Engine v2.
 *
 * 7-factor weighted scorer per the HPSEDC-approved spec
 * (PMD-Final wrapup/Architecture & Logic/HireStream_Matching_Engine.pdf):
 *
 *   Skills 30 · Experience 20 · Qualification 10 · Country 15
 *   Language 10 · Category 10 · Salary 5     (sum = 100)
 *
 * Weights, missing-criteria policy, and threshold are read from system
 * settings on every score request so admin can tune from the Parameters
 * Module without a redeploy. v1 (legacy 3-factor) is kept available via
 * the `matching.engine_version` setting so a regression can be rolled
 * back instantly.
 *
 * IELTS routing: when job.country is in IELTS_COUNTRIES, the Language
 * factor uses job.requiredIeltsBand vs candidate.ieltsBand. For other
 * countries, CEFR levels in jsonb are compared. The decision is purely
 * driven by job.country — the form doesn't need an extra knob.
 *
 * Missing-criteria policy: each factor has a configurable behaviour when
 * the job-side OR candidate-side input is missing. Three values:
 *   - "full"    → full marks (treat as neutral / no penalty)
 *   - "half"    → half the factor's weight (compromise)
 *   - "zero"    → zero marks (strict)
 * Defaults follow the §4 policy table in the spec.
 */

import { getSetting } from "./settings.service";

// ── Constants ───────────────────────────────────────────────────────
// Country names match country_info.name canonical values (v0.7.3.2). Both
// the old short aliases (UK / USA) and the canonical forms are accepted
// during the transition window so legacy in-flight jobs continue to score
// correctly; new jobs created via the country-validated API path will only
// ever use canonical names.
export const IELTS_COUNTRIES = new Set([
  "United Kingdom", "Australia", "New Zealand", "Canada", "Ireland", "United States of America",
  // Legacy aliases — kept for back-compat with rows created before v0.7.3.2.
  "UK", "USA",
]);

// Spec §3 default weights — sum must equal 100. Admin can tune via the
// `matching.weights` setting (JSON object with these same keys).
export const DEFAULT_WEIGHTS = {
  skill: 30,
  experience: 20,
  qualification: 10,
  country: 15,
  language: 10,
  category: 10,
  salary: 5,
} as const;

export type FactorKey = keyof typeof DEFAULT_WEIGHTS;
export type PolicyValue = "full" | "half" | "zero";

// v0.4.35.1: per-direction missing-criteria policy. The approved spec
// (HireStream_Matching_Engine.pdf §4) has DIFFERENT behaviour depending
// on which side is missing — e.g. Language is Full when the JOB didn't
// specify, but Zero when the CANDIDATE didn't claim a proficiency the
// job required ("gaps must surface"). A single value per factor couldn't
// express that, so each factor now carries two knobs:
//   - jobMissing       → award when the job didn't specify the criterion
//   - candidateMissing → award when the job DID specify but the candidate
//                        hasn't provided the data
// When BOTH are missing, the job-side check fires first (job didn't
// require it → not a constraint), so the jobMissing policy wins.
export interface PolicyPair { jobMissing: PolicyValue; candidateMissing: PolicyValue; }

// Defaults mirror the §4 table. "n/a" cells in the doc default to "full"
// (a missing direction that can't actually occur — e.g. country/category
// are required on jobs now, so jobMissing won't fire).
export const DEFAULT_POLICY: Record<FactorKey, PolicyPair> = {
  skill:         { jobMissing: "half", candidateMissing: "zero" },  // job sloppy → half; candidate has none → 0
  experience:    { jobMissing: "full", candidateMissing: "full" },  // 0 yrs required = no constraint
  qualification: { jobMissing: "full", candidateMissing: "half" },  // encourage profile completion w/o blocking
  country:       { jobMissing: "full", candidateMissing: "half" },  // empty prefs = disinterest, not zero
  language:      { jobMissing: "full", candidateMissing: "zero" },  // KEY: language gaps must surface
  category:      { jobMissing: "full", candidateMissing: "half" },  // candidate may have wide interests
  salary:        { jobMissing: "full", candidateMissing: "full" },  // salary often disclosed post-shortlist
};

// CEFR level ordering (used for comparison). Higher index = higher level.
const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const cefrIndex = (lvl: string | undefined | null): number => {
  if (!lvl) return -1;
  const i = CEFR_ORDER.indexOf(String(lvl).toUpperCase() as any);
  return i;
};

// ── Public types ────────────────────────────────────────────────────

export interface FactorResult {
  /** raw points earned, before normalisation */
  score: number;
  /** the weight (max points) for this factor */
  max: number;
  /** human-readable explanation surfaced in the UI */
  detail: string;
  /** for diagnostics — the policy that decided missing-input handling */
  policyApplied?: "full" | "half" | "zero" | null;
}

export interface ScoreBreakdown {
  total: number;
  engineVersion: "v1" | "v2";
  skill: FactorResult;
  experience: FactorResult;
  qualification: FactorResult;
  country: FactorResult;
  language: FactorResult;
  category: FactorResult;
  salary: FactorResult;
}

// ── Settings helpers ────────────────────────────────────────────────

async function loadWeights(): Promise<Record<FactorKey, number>> {
  try {
    const raw = await getSetting("matching.weights");
    if (raw && typeof raw === "object") {
      const merged: any = { ...DEFAULT_WEIGHTS };
      for (const k of Object.keys(DEFAULT_WEIGHTS) as FactorKey[]) {
        if (typeof (raw as any)[k] === "number") merged[k] = (raw as any)[k];
      }
      // Renormalise if admin saved a non-100 sum (defensive — the form
      // should enforce sum=100, but settings API is exposed too).
      const sum = (Object.values(merged) as number[]).reduce((a, b) => a + b, 0);
      if (sum !== 100 && sum > 0) {
        for (const k of Object.keys(merged)) merged[k] = (merged[k] / sum) * 100;
      }
      return merged;
    }
  } catch { /* fallthrough to defaults */ }
  return { ...DEFAULT_WEIGHTS };
}

const isPolicyValue = (v: any): v is PolicyValue => v === "full" || v === "half" || v === "zero";

async function loadPolicy(): Promise<Record<FactorKey, PolicyPair>> {
  try {
    const raw = await getSetting("matching.policy");
    if (raw && typeof raw === "object") {
      const merged: Record<FactorKey, PolicyPair> = JSON.parse(JSON.stringify(DEFAULT_POLICY));
      for (const k of Object.keys(DEFAULT_POLICY) as FactorKey[]) {
        const v = (raw as any)[k];
        if (isPolicyValue(v)) {
          // Legacy single-value shape (pre-v0.4.35.1): apply the same value
          // to BOTH directions so an old saved setting keeps working.
          merged[k] = { jobMissing: v, candidateMissing: v };
        } else if (v && typeof v === "object") {
          if (isPolicyValue(v.jobMissing)) merged[k].jobMissing = v.jobMissing;
          if (isPolicyValue(v.candidateMissing)) merged[k].candidateMissing = v.candidateMissing;
        }
      }
      return merged;
    }
  } catch { /* fallthrough */ }
  return JSON.parse(JSON.stringify(DEFAULT_POLICY));
}

async function loadEngineVersion(): Promise<"v1" | "v2"> {
  try {
    const v = await getSetting("matching.engine_version");
    if (v === "v1" || v === "v2") return v;
  } catch { /* fallthrough */ }
  return "v2";
}

/** Apply the missing-input policy: returns raw points for this factor. */
function applyMissingPolicy(weight: number, policy: "full" | "half" | "zero"): number {
  if (policy === "full") return weight;
  if (policy === "half") return Math.round(weight / 2);
  return 0;
}

// ── Per-factor scorers ──────────────────────────────────────────────

function scoreSkill(candidate: any, job: any, w: number, pol: PolicyPair): FactorResult {
  const candidateSkills = (candidate.skills || []).map((s: string) => String(s).toLowerCase());
  const jobSkills = (job.skills || []).map((s: string) => String(s).toLowerCase());
  if (jobSkills.length === 0) {
    return { score: applyMissingPolicy(w, pol.jobMissing), max: w, detail: "No skills specified on job", policyApplied: pol.jobMissing };
  }
  if (candidateSkills.length === 0) {
    return { score: applyMissingPolicy(w, pol.candidateMissing), max: w, detail: "Candidate has no skills listed", policyApplied: pol.candidateMissing };
  }
  const overlap = candidateSkills.filter((s: string) => jobSkills.includes(s));
  const score = Math.round((overlap.length / jobSkills.length) * w);
  const sample = overlap.slice(0, 5).join(", ") || "none";
  return { score, max: w, detail: `${overlap.length}/${jobSkills.length} skills match (${sample})` };
}

function scoreExperience(candidate: any, job: any, w: number, pol: PolicyPair): FactorResult {
  const required = Number(job.experience ?? 0);
  // HP-4b (UAT-03 Item 10): prefer the precise months value when present
  // (÷12 → years to compare against the job's years requirement); fall back to
  // the legacy years field for pre-migration candidates.
  const has = candidate.experienceMonths != null
    ? Number(candidate.experienceMonths) / 12
    : Number(candidate.experience ?? 0);
  if (!required) {
    // job didn't require experience → job-side missing
    return { score: applyMissingPolicy(w, pol.jobMissing), max: w, detail: "No experience required", policyApplied: pol.jobMissing };
  }
  const score = Math.round(Math.min(has / required, 1) * w);
  return {
    score, max: w,
    detail: `${has}/${required} years (${has >= required ? "meets requirement" : "below requirement"})`,
  };
}

// HP-4c: `below_matric` (no schooling / 5th / 8th, from the simplified flow) is
// the lowest real tier — so low-education candidates score against it instead of
// being treated as "qualification not set" (blank).
const QUAL_ORDER = ["below_matric", "school", "diploma", "bachelor", "master", "doctorate"] as const;
function scoreQualification(candidate: any, job: any, w: number, pol: PolicyPair): FactorResult {
  const req = (job.qualificationRequired || "").toLowerCase();
  const has = (candidate.qualificationLevel || "").toLowerCase();
  if (!req) {
    return { score: applyMissingPolicy(w, pol.jobMissing), max: w, detail: "No qualification required", policyApplied: pol.jobMissing };
  }
  if (!has) {
    return { score: applyMissingPolicy(w, pol.candidateMissing), max: w, detail: "Candidate qualification not set", policyApplied: pol.candidateMissing };
  }
  const ri = QUAL_ORDER.indexOf(req as any);
  const hi = QUAL_ORDER.indexOf(has as any);
  if (ri < 0 || hi < 0) {
    // Unrecognised value on either side — treat as candidate-side gap.
    return { score: applyMissingPolicy(w, pol.candidateMissing), max: w, detail: `Unrecognised level (job=${req}, candidate=${has})`, policyApplied: pol.candidateMissing };
  }
  if (hi >= ri) return { score: w, max: w, detail: `Candidate qualification (${has}) meets/exceeds required (${req})` };
  // One tier below → half the weight; otherwise → zero (linear feels too lenient for a 5-tier scale).
  if (ri - hi === 1) return { score: Math.round(w / 2), max: w, detail: `Candidate qualification (${has}) one tier below required (${req})` };
  return { score: 0, max: w, detail: `Candidate qualification (${has}) is ${ri - hi} tiers below required (${req})` };
}

function scoreCountry(candidate: any, job: any, w: number, pol: PolicyPair): FactorResult {
  const preferred = (candidate.preferredCountries || []).map((c: string) => String(c).toLowerCase());
  const jobCountry = String(job.country || "").toLowerCase();
  if (preferred.length === 0) {
    // Job always has a country, so the only missing side is the candidate's prefs.
    return { score: applyMissingPolicy(w, pol.candidateMissing), max: w, detail: "No country preference set", policyApplied: pol.candidateMissing };
  }
  if (preferred.includes(jobCountry)) {
    return { score: w, max: w, detail: `${job.country} is in preferred countries` };
  }
  return { score: 0, max: w, detail: `${job.country} not in preferred countries (${preferred.join(", ")})` };
}

/** Score the Language factor.
 *  - For IELTS countries, compare job.requiredIeltsBand vs candidate.ieltsBand.
 *  - For others, compare CEFR levels in languagesRequired vs languageProficiency.
 */
function scoreLanguage(candidate: any, job: any, w: number, pol: PolicyPair): FactorResult {
  const country = String(job.country || "");
  const isIeltsCountry = IELTS_COUNTRIES.has(country);

  if (isIeltsCountry) {
    const required = job.requiredIeltsBand !== null && job.requiredIeltsBand !== undefined ? Number(job.requiredIeltsBand) : null;
    const has = candidate.ieltsBand !== null && candidate.ieltsBand !== undefined ? Number(candidate.ieltsBand) : null;
    if (required === null) {
      // job-side missing — job didn't set a band. Both-missing also lands
      // here because we check job-side first → jobMissing policy wins.
      return { score: applyMissingPolicy(w, pol.jobMissing), max: w, detail: `No IELTS requirement set (${country})`, policyApplied: pol.jobMissing };
    }
    if (has === null) {
      // job DID require a band, candidate hasn't provided theirs → candidate-side gap.
      return { score: applyMissingPolicy(w, pol.candidateMissing), max: w, detail: `Candidate IELTS band not provided (${country} requires ${required})`, policyApplied: pol.candidateMissing };
    }
    if (has >= required) return { score: w, max: w, detail: `IELTS ${has} meets/exceeds required ${required}` };
    if (required - has <= 1) return { score: Math.round(w / 2), max: w, detail: `IELTS ${has} one band below required ${required}` };
    return { score: 0, max: w, detail: `IELTS ${has} more than one band below required ${required}` };
  }

  // CEFR path
  const required = (job.languagesRequired ?? {}) as Record<string, string>;
  const keys = Object.keys(required).filter((k) => !k.endsWith("_ielts"));
  if (keys.length === 0) {
    return { score: applyMissingPolicy(w, pol.jobMissing), max: w, detail: "No language requirement on job", policyApplied: pol.jobMissing };
  }
  const candLangs = (candidate.languageProficiency ?? {}) as Record<string, string>;
  if (!candLangs || Object.keys(candLangs).length === 0) {
    return { score: applyMissingPolicy(w, pol.candidateMissing), max: w, detail: "Candidate language proficiency not provided", policyApplied: pol.candidateMissing };
  }
  let met = 0;
  const misses: string[] = [];
  for (const lang of keys) {
    const reqLvl = required[lang];
    const candLvl = candLangs[lang];
    const ri = cefrIndex(reqLvl), ci = cefrIndex(candLvl);
    if (ri < 0) continue; // unrecognised job-side level — skip
    if (ci >= ri) met++;
    else misses.push(`${lang}:${candLvl || "?"}<${reqLvl}`);
  }
  if (keys.length === 0) return { score: w, max: w, detail: "Language requirement empty" };
  const score = Math.round((met / keys.length) * w);
  const detail = `${met}/${keys.length} language levels met${misses.length ? ` (${misses.join(", ")})` : ""}`;
  return { score, max: w, detail };
}

function scoreCategory(candidate: any, job: any, w: number, pol: PolicyPair): FactorResult {
  const preferred = (candidate.preferredCategories || []).map((c: string) => String(c).toLowerCase());
  const jobCat = String(job.category || "").toLowerCase();
  if (!jobCat) {
    // Job didn't set a category (shouldn't happen post-Phase-1, but defensive).
    return { score: applyMissingPolicy(w, pol.jobMissing), max: w, detail: "Job has no category set", policyApplied: pol.jobMissing };
  }
  if (preferred.length === 0) {
    return { score: applyMissingPolicy(w, pol.candidateMissing), max: w, detail: "No category preference set", policyApplied: pol.candidateMissing };
  }
  if (preferred.includes(jobCat)) {
    return { score: w, max: w, detail: `Job category "${jobCat}" matches candidate preferences` };
  }
  return { score: 0, max: w, detail: `Job category "${jobCat}" not in preferred (${preferred.join(", ")})` };
}

/** Rough USD-annual normaliser for the free-text salary field.
 *  Same trick as the server-side salary filter (FRS 1.15) — extract the
 *  first numeric run. Accepts the candidate's `preferredSalaryMin/Max`
 *  as already-USD-equivalent integers (the wizard saves them that way). */
function parseAnnualUsd(s: string | null | undefined): number {
  if (!s) return 0;
  const m = String(s).match(/[0-9][0-9,]*/);
  if (!m) return 0;
  const n = Number(m[0].replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Heuristic: numbers below 20k are likely monthly → annualise.
  return n < 20_000 ? n * 12 : n;
}

function scoreSalary(candidate: any, job: any, w: number, pol: PolicyPair): FactorResult {
  const min = Number(candidate.preferredSalaryMin ?? 0);
  const max = Number(candidate.preferredSalaryMax ?? 0);
  if (!min && !max) {
    // Candidate didn't state a salary preference → candidate-side missing.
    return { score: applyMissingPolicy(w, pol.candidateMissing), max: w, detail: "No salary preference set", policyApplied: pol.candidateMissing };
  }
  const jobPay = parseAnnualUsd(job.salary);
  if (!jobPay) {
    // Job salary blank/unparseable → job-side missing.
    return { score: applyMissingPolicy(w, pol.jobMissing), max: w, detail: "Job salary not parseable", policyApplied: pol.jobMissing };
  }
  // Inside range → full marks
  if ((!min || jobPay >= min) && (!max || jobPay <= max)) {
    return { score: w, max: w, detail: `Job pay $${jobPay.toLocaleString()} inside preferred range` };
  }
  // Above max but within 20% → half marks
  if (max && jobPay > max && jobPay <= max * 1.2) {
    return { score: Math.round(w / 2), max: w, detail: `Job pay $${jobPay.toLocaleString()} slightly above preferred max $${max.toLocaleString()}` };
  }
  // Below min but within 20% → half marks
  if (min && jobPay < min && jobPay >= min * 0.8) {
    return { score: Math.round(w / 2), max: w, detail: `Job pay $${jobPay.toLocaleString()} slightly below preferred min $${min.toLocaleString()}` };
  }
  return { score: 0, max: w, detail: `Job pay $${jobPay.toLocaleString()} outside preferred range` };
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Compute the 7-factor v2 breakdown. Reads weights + policy + engine
 * version from settings on every call so admin tuning is live-effect.
 */
export async function calculateMatchBreakdown(candidate: any, job: any): Promise<ScoreBreakdown> {
  const version = await loadEngineVersion();

  if (version === "v1") {
    // Backwards-compatible v1 path: only 3 factors, weights baked at
    // skill=50 / exp=30 / country=20. Use the v2 helpers for consistency
    // but with v1's weights and ignore the other factors.
    const skill = scoreSkill(candidate, job, 50, { jobMissing: "half", candidateMissing: "zero" });
    const experience = scoreExperience(candidate, job, 30, { jobMissing: "full", candidateMissing: "full" });
    const country = scoreCountry(candidate, job, 20, { jobMissing: "full", candidateMissing: "full" });
    const total = Math.min(100, Math.max(0, skill.score + experience.score + country.score));
    return {
      total, engineVersion: "v1",
      skill, experience, country,
      // Pad with zero-weight neutral results for the v2 shape — UI hides
      // them when max=0.
      qualification: { score: 0, max: 0, detail: "Not scored in v1" },
      language: { score: 0, max: 0, detail: "Not scored in v1" },
      category: { score: 0, max: 0, detail: "Not scored in v1" },
      salary: { score: 0, max: 0, detail: "Not scored in v1" },
    };
  }

  // v2 path
  const weights = await loadWeights();
  const policy = await loadPolicy();

  const skill = scoreSkill(candidate, job, weights.skill, policy.skill);
  const experience = scoreExperience(candidate, job, weights.experience, policy.experience);
  const qualification = scoreQualification(candidate, job, weights.qualification, policy.qualification);
  const country = scoreCountry(candidate, job, weights.country, policy.country);
  const language = scoreLanguage(candidate, job, weights.language, policy.language);
  const category = scoreCategory(candidate, job, weights.category, policy.category);
  const salary = scoreSalary(candidate, job, weights.salary, policy.salary);

  const raw = skill.score + experience.score + qualification.score + country.score
    + language.score + category.score + salary.score;
  const total = Math.min(100, Math.max(0, Math.round(raw)));

  return {
    total, engineVersion: "v2",
    skill, experience, qualification, country, language, category, salary,
  };
}

/** Convenience: total only. */
export async function calculateMatchScore(candidate: any, job: any): Promise<number> {
  const bd = await calculateMatchBreakdown(candidate, job);
  return bd.total;
}

/** Engine version metadata for the /api/v1/matching/version endpoint. */
export async function getEngineVersionInfo() {
  const version = await loadEngineVersion();
  const weights = await loadWeights();
  const policy = await loadPolicy();
  let threshold = 70;
  try {
    const t = await getSetting("matching.recommendation_threshold_pct");
    if (typeof t === "number") threshold = t;
  } catch { /* fallthrough */ }
  return {
    version,
    weights,
    policy,
    thresholdPct: threshold,
    ieltsCountries: Array.from(IELTS_COUNTRIES),
  };
}
