/**
 * Controlled-vocabulary list of job categories used by:
 *  - Job Poster form (required dropdown)
 *  - Browse Jobs / Applications Pipeline filters
 *  - Match Engine v2 "Category" factor (HireStream Matching Engine spec §3)
 *
 * v0.4.31 — HPSEDC review listed 10 specific overseas-placement role
 * categories (Item 8). All 10 included verbatim. Additional categories are
 * added for the broader job mix HireStream supports. Admin can extend at
 * runtime via the `job.categories.extra` system setting.
 *
 * The list is intentionally short and aligned to overseas-placement
 * realities — ECR-eligibility maps cleanly to most of these. Generic
 * "Other" is the escape hatch.
 */

export interface JobCategory {
  /** stable internal key — stored in jobs.category */
  key: string;
  /** human-readable label rendered in dropdowns and badges */
  label: string;
  /** tier — drives ECR/non-ECR defaulting + PDO curriculum */
  tier: "blue_collar" | "skilled_trade" | "service" | "professional";
}

/** HPSEDC-listed categories (v0.4.31, HPSEDC Item 8). DO NOT remove these
 *  entries without coordinating with HPSEDC — testers verify each appears
 *  in the dropdown. */
export const HPSEDC_REQUIRED_CATEGORIES: JobCategory[] = [
  { key: "factory_worker",      label: "Factory Worker",      tier: "blue_collar" },
  { key: "construction_worker", label: "Construction Worker", tier: "blue_collar" },
  { key: "driver",              label: "Driver",              tier: "skilled_trade" },
  { key: "electrician",         label: "Electrician",         tier: "skilled_trade" },
  { key: "plumber",             label: "Plumber",             tier: "skilled_trade" },
  { key: "helper",              label: "Helper",              tier: "blue_collar" },
  { key: "technician",          label: "Technician",          tier: "skilled_trade" },
  { key: "hospitality_staff",   label: "Hospitality Staff",   tier: "service" },
  { key: "caregiver",           label: "Caregiver",           tier: "service" },
  { key: "warehouse_worker",    label: "Warehouse Worker",    tier: "blue_collar" },
];

/** Additional categories for the wider HireStream job mix. Admin can extend
 *  this list at runtime via `job.categories.extra` setting (JSON array). */
export const ADDITIONAL_CATEGORIES: JobCategory[] = [
  { key: "healthcare",   label: "Healthcare",   tier: "professional" },
  { key: "it",           label: "IT",           tier: "professional" },
  { key: "engineering",  label: "Engineering",  tier: "professional" },
  { key: "sales",        label: "Sales",        tier: "professional" },
  { key: "education",    label: "Education",    tier: "professional" },
  { key: "other",        label: "Other",        tier: "professional" },
];

export const JOB_CATEGORIES: JobCategory[] = [
  ...HPSEDC_REQUIRED_CATEGORIES,
  ...ADDITIONAL_CATEGORIES,
];

export const JOB_CATEGORY_KEYS = JOB_CATEGORIES.map((c) => c.key);

/** Validate a job.category value. Returns the canonical key if valid, or
 *  null if not. Case-insensitive, trims whitespace. Used by job-routes
 *  POST/PATCH validators. */
export function normaliseCategory(input: string | null | undefined): string | null {
  if (!input) return null;
  const k = String(input).trim().toLowerCase().replace(/\s+/g, "_");
  return JOB_CATEGORY_KEYS.includes(k) ? k : null;
}

/** Look up the display label for a category key. Falls back to title-casing
 *  the key when not found (covers legacy / admin-added values). */
export function categoryLabel(key: string | null | undefined): string {
  if (!key) return "—";
  const found = JOB_CATEGORIES.find((c) => c.key === key);
  if (found) return found.label;
  return key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
