/**
 * v0.4.36 (testing tooling): authoritative data-reset service.
 *
 * Replaces the stale, half-broken inline reset in superadmin.routes.ts.
 * The old one used wrong table-name strings ("drives", "auditLogs",
 * "education"…) and missed every table added in Phases 2-4 — including
 * FK-child tables (interviews, placements, application_notes) that
 * silently blocked the parent deletes. Result: "Reset" reported success
 * while leaving most data behind.
 *
 * This service uses `TRUNCATE … CASCADE` so the database resolves the FK
 * graph itself — truncating a parent (e.g. candidates) automatically
 * clears every dependent (documents, applications, interviews, …). No
 * hand-maintained deletion order to drift out of sync with the schema.
 *
 * Three modes:
 *   - "activity"  → clear transactional data, keep the actors (users,
 *                   candidates, agencies, employers, jobs)
 *   - "full"      → clear ALL data; preserve superadmin login + system
 *                   config (settings, integrations, templates, country info)
 *   - "selective" → caller passes data-class keys; each maps to a root
 *                   table whose CASCADE pulls its dependents
 *
 * Always runs in a transaction — any error rolls the whole thing back.
 */
import { storage } from "../storage";
import { sql } from "drizzle-orm";
import { logger } from "../config/logger.config";

// Data classes for the selective mode + UI checkboxes. Each lists the
// ROOT table(s); TRUNCATE CASCADE clears everything that references them.
export const DATA_CLASSES: Record<string, { label: string; tables: string[]; note: string }> = {
  applications: { label: "Applications & pipeline", tables: ["applications"], note: "Cascades to interviews, placements, application notes" },
  notifications: { label: "Notifications",          tables: ["notifications"], note: "All in-app notifications" },
  grievances:   { label: "Grievances",              tables: ["grievances"], note: "Complaints / support tickets" },
  drives:       { label: "Recruitment drives",      tables: ["recruitment_drives"], note: "Drives + their interviews" },
  saved:        { label: "Saved jobs & searches",   tables: ["saved_jobs", "saved_searches", "saved_segments"], note: "Candidate bookmarks + saved filters" },
  reviews:      { label: "Agency reviews",          tables: ["agency_reviews"], note: "Candidate ratings of agencies" },
  candidates:   { label: "Candidates",              tables: ["candidates"], note: "Cascades to their docs, education, experience, applications, references" },
  agencies:     { label: "Agencies",                tables: ["recruitment_agents"], note: "Cascades to agency docs, reviews, drives" },
  employers:    { label: "Employers",               tables: ["employers"], note: "Cascades to employer KYB docs" },
  jobs:         { label: "Jobs / requisitions",     tables: ["jobs"], note: "Cascades to applications on those jobs" },
};

// Every data table that a FULL wipe removes. CASCADE handles children, but
// we list the full set so deletedCounts is complete + predictable.
const FULL_WIPE_TABLES = [
  "candidates", "recruitment_agents", "employers", "jobs", "applications",
  "notifications", "grievances", "recruitment_drives", "saved_jobs",
  "saved_searches", "saved_segments", "agency_reviews", "documents",
  "candidate_education", "candidate_experience", "candidate_references",
  "candidate_agent_tags", "agency_documents", "employer_documents",
  "application_notes", "interviews", "placements", "audit_log",
  "training_events", "faq", "announcements",
];

// Transactional data only — keeps the actors + their profiles + jobs.
const ACTIVITY_TABLES = [
  "applications", "notifications", "grievances", "recruitment_drives",
  "saved_jobs", "saved_searches", "saved_segments", "agency_reviews",
  "audit_log",
];

// Per-user auth ephemera — cleared alongside the users themselves.
const USER_EPHEMERA = [
  "otp_codes", "password_reset_tokens", "mobile_refresh_tokens", "mobile_push_tokens",
];

// Preserved config tables that carry a user FK — null those refs before
// deleting non-superadmin users so the delete can't trip a constraint.
const CONFIG_USER_REFS: { table: string; column: string }[] = [
  { table: "system_settings", column: "updated_by" },
  { table: "provider_config", column: "updated_by" },
  { table: "email_templates", column: "updated_by" },
  { table: "country_info", column: "updated_by" },
];

export type ResetMode = "activity" | "full" | "selective";

export interface ResetOptions {
  mode: ResetMode;
  /** for selective mode — keys of DATA_CLASSES */
  classes?: string[];
}

export interface ResetResult {
  mode: ResetMode;
  tablesTruncated: string[];
  rowsDeleted: Record<string, number>;
  usersDeleted: number;
}

function quoteIdent(name: string): string {
  // table names are our own lowercase snake_case constants — but quote
  // defensively so a reserved word can't break the statement.
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unsafe table name: ${name}`);
  return `"${name}"`;
}

/** Resolve which tables a given mode/options will truncate. */
export function resolveTables(opts: ResetOptions): string[] {
  if (opts.mode === "activity") return [...ACTIVITY_TABLES];
  if (opts.mode === "full") return [...FULL_WIPE_TABLES];
  // selective
  const picked = (opts.classes || []).flatMap((c) => DATA_CLASSES[c]?.tables ?? []);
  return Array.from(new Set(picked));
}

export async function resetData(opts: ResetOptions): Promise<ResetResult> {
  const db = storage.db;
  if (!db) throw new Error("Database not available");

  const tables = resolveTables(opts);
  if (tables.length === 0) {
    throw new Error("No tables resolved for reset — pick at least one data class.");
  }

  const rowsDeleted: Record<string, number> = {};
  let usersDeleted = 0;

  await db.transaction(async (tx: any) => {
    // Capture pre-truncation counts for the report.
    for (const t of tables) {
      try {
        const r: any = await tx.execute(sql.raw(`SELECT count(*)::int AS c FROM ${quoteIdent(t)}`));
        rowsDeleted[t] = (r.rows ?? r)[0]?.c ?? 0;
      } catch { rowsDeleted[t] = 0; }
    }

    // One CASCADE truncate handles the whole FK subtree for the chosen set.
    const list = tables.map(quoteIdent).join(", ");
    await tx.execute(sql.raw(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`));

    if (opts.mode === "full") {
      // Null preserved-config user refs so non-superadmin user deletion
      // can't fail on a dangling FK.
      for (const { table, column } of CONFIG_USER_REFS) {
        try {
          await tx.execute(sql.raw(`UPDATE ${quoteIdent(table)} SET ${quoteIdent(column)} = NULL`));
        } catch { /* table/column may not exist in older DBs — tolerate */ }
      }
      // Clear per-user auth ephemera, then delete every non-superadmin user.
      const ephemera = USER_EPHEMERA.map(quoteIdent).join(", ");
      await tx.execute(sql.raw(`TRUNCATE TABLE ${ephemera} RESTART IDENTITY CASCADE`));
      const delRes: any = await tx.execute(sql`DELETE FROM users WHERE role <> 'superadmin' RETURNING id`);
      usersDeleted = (delRes.rows ?? delRes)?.length ?? 0;
    }
  });

  logger.warn(`Data reset (${opts.mode}) executed — tables: ${tables.join(", ")}; users removed: ${usersDeleted}`);
  return { mode: opts.mode, tablesTruncated: tables, rowsDeleted, usersDeleted };
}
