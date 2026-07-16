/**
 * Smart Job Importer — HPSEDC receives job postings from the Government as
 * Excel (.xlsx/.xls) or CSV files; this module parses, validates and bulk-
 * posts them. Admin/superadmin only.
 *
 *   POST /preview  — multipart upload → smart column mapping + per-row
 *                    validation. Nothing is written; the client shows the
 *                    mapping/preview table and lets the admin adjust.
 *                    Accepts an optional `mapping` field (JSON) so the client
 *                    can re-preview the same file with corrected mappings.
 *   POST /commit   — client sends back the confirmed mapping + previewed
 *                    rows. Every row is RE-validated server-side (the client
 *                    payload is never trusted); valid, non-duplicate rows
 *                    become active public jobs owned by the HPSEDC agency.
 *   GET  /history  — recent import batches (job_imports audit trail).
 *
 * Validation reuses the same building blocks as the canonical job-create
 * path (POST /api/v1/jobs): country-validator service, job-categories seed,
 * and the jobs-table field limits from shared/schema.ts.
 */

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import path from "path";
import Papa from "papaparse";
import readXlsxFile from "read-excel-file/node";
import { protect } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/rbac.middleware";
import { storage } from "../storage";
import { logger } from "../config/logger.config";
import { jobs, jobImports, auditLog, recruitmentAgents, users } from "@shared/schema";
import { eq, desc, asc } from "drizzle-orm";
import { notify } from "../services/notification.service";
import {
  isLoaded as countriesLoaded,
  loadValidCountries,
  listValidCountries,
  isIndia,
} from "../services/country-validator.service";
import { normaliseCategory } from "../services/job-categories.seed";
import { getSetting } from "../services/settings.service";

const router = Router();
const adminOnly = requireRole(["admin", "superadmin"]);

// ── Upload constraints ──────────────────────────────────────────────
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_DATA_ROWS = 2000;

// Extension AND mimetype must both check out. Browsers are inconsistent
// about spreadsheet MIMEs (Windows+Excel reports .csv as vnd.ms-excel;
// some send octet-stream), so each extension carries its own allow-set —
// anything outside it is rejected with a 400 before parsing.
const EXT_MIMES: Record<string, Set<string>> = {
  ".csv": new Set(["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain", "application/octet-stream"]),
  ".xls": new Set(["application/vnd.ms-excel", "application/octet-stream"]),
  ".xlsx": new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip", "application/octet-stream"]),
};

function importFileFilter(_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const allowedMimes = EXT_MIMES[ext];
  if (!allowedMimes) return cb(new Error("Unsupported file type. Upload a .csv, .xlsx or .xls file."));
  if (!allowedMimes.has(file.mimetype)) {
    return cb(new Error(`File content type "${file.mimetype}" does not match a ${ext} spreadsheet.`));
  }
  cb(null, true);
}

// memoryStorage — the file is parsed in-process and never touches disk.
const importUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: importFileFilter,
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
});

// Multer errors → clean 400s (mirrors handleUploadErrors in upload.middleware,
// but with importer-specific copy and a 400 for oversize per module contract).
function handleImportUploadErrors(err: any, _req: Request, res: Response, next: NextFunction) {
  if (!err) return next();
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ success: false, error: { code: 400, message: "File too large. The import limit is 5 MB." } });
  }
  if (err instanceof multer.MulterError || typeof err.message === "string") {
    return res.status(400).json({ success: false, error: { code: 400, message: err.message || "Upload failed." } });
  }
  return next(err);
}

// ── Smart column mapping ────────────────────────────────────────────

export type TargetField =
  | "title" | "company" | "country" | "location" | "category" | "salary"
  | "targetHires" | "hiringDeadline" | "experience" | "qualificationRequired"
  | "description" | "requirements" | "skills";

export const TARGET_FIELDS: TargetField[] = [
  "title", "company", "country", "location", "category", "salary",
  "targetHires", "hiringDeadline", "experience", "qualificationRequired",
  "description", "requirements", "skills",
];

/** lowercase + strip everything non-alphanumeric — "No. of Positions" → "noofpositions" */
function normHeader(h: string): string {
  return String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Synonym dictionary, keys pre-normalised with normHeader().
const HEADER_SYNONYMS: Record<TargetField, string[]> = {
  title: ["title", "jobtitle", "designation", "post", "role", "position", "vacancytitle"],
  company: ["company", "companyname", "employer", "employername", "organisation", "organization", "firm", "principal"],
  country: ["country", "destination", "destinationcountry", "nation", "deploymentcountry"],
  location: ["location", "city", "place", "worklocation", "site"],
  category: ["category", "sector", "trade", "occupation", "jobcategory"],
  salary: ["salary", "wage", "pay", "ctc", "remuneration", "monthlysalary", "salaryoffered"],
  targetHires: ["vacancies", "positions", "openings", "noofpositions", "noofvacancies", "seats", "count", "headcount"],
  hiringDeadline: ["deadline", "hiringdeadline", "lastdate", "closingdate", "applyby", "validtill"],
  experience: ["experience", "exp", "yearsofexperience", "minexperience", "experienceyears"],
  qualificationRequired: ["qualification", "qualificationrequired", "education", "minqualification"],
  description: ["description", "details", "jobdescription", "jd", "remarks"],
  requirements: ["requirements", "eligibility", "criteria"],
  skills: ["skills", "keyskills"],
};

const SYNONYM_TO_FIELD = new Map<string, TargetField>();
for (const [field, syns] of Object.entries(HEADER_SYNONYMS) as [TargetField, string[]][]) {
  for (const s of syns) SYNONYM_TO_FIELD.set(s, field);
}

/**
 * Auto-map source headers → target fields. First header to claim a target
 * wins (a second "Salary"-ish column stays unmapped rather than clobbering).
 * `override` lets the client pin/clear specific headers (null = ignore).
 */
function buildMapping(headers: string[], override?: Record<string, string | null>): Record<string, TargetField | null> {
  const mapping: Record<string, TargetField | null> = {};
  const claimed = new Set<TargetField>();
  for (const h of headers) {
    let target: TargetField | null = null;
    if (override && Object.prototype.hasOwnProperty.call(override, h)) {
      const o = override[h];
      target = o && TARGET_FIELDS.includes(o as TargetField) ? (o as TargetField) : null;
    } else {
      target = SYNONYM_TO_FIELD.get(normHeader(h)) ?? null;
    }
    if (target && claimed.has(target)) target = null;
    if (target) claimed.add(target);
    mapping[h] = target;
  }
  return mapping;
}

// ── Cell normalisation helpers ──────────────────────────────────────

/**
 * CSV-injection defense: a cell starting with = + - @ TAB or CR executes as
 * a formula when the data is later re-exported and opened in Excel/Sheets.
 * Strip the leading trigger characters so stored values are inert.
 */
function defuseCell(v: string): string {
  return v.replace(/^[=+\-@\t\r]+/, "");
}

/** Any parsed cell (string / number / boolean / Date) → clean trimmed string. */
function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return defuseCell(String(v).trim()).trim();
}

/**
 * Tolerant date parser → ISO "YYYY-MM-DD" or null.
 * Accepts Date cells (xlsx), ISO strings, and Indian day-first dd/mm/yyyy
 * (also dd-mm-yyyy, dd.mm.yyyy). Falls back to Date.parse for verbose
 * formats ("15 March 2027"). Validates real calendar dates.
 */
function parseDateCell(v: unknown): string | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = cellToString(v);
  if (!s) return null;

  const toIso = (y: number, m: number, d: number): string | null => {
    if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    // Reject rollovers like 31/02 → 03/03
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return dt.toISOString().slice(0, 10);
  };

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // ISO
  if (m) return toIso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); // day-first (Indian convention)
  if (m) return toIso(+m[3], +m[2], +m[1]);
  const t = Date.parse(s);
  if (!isNaN(t)) {
    const dt = new Date(t);
    return toIso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  }
  return null;
}

/** Free-text qualification → the controlled vocabulary the matching engine scores. */
function normaliseQualification(s: string): string | null {
  const q = s.toLowerCase();
  if (/phd|doctor/.test(q)) return "doctorate";
  if (/master|mba|m\.?tech|m\.?sc|m\.?com|m\.?a\b/.test(q)) return "master";
  if (/bachelor|graduate|degree|b\.?tech|b\.?sc|b\.?com|b\.?a\b|b\.?e\b/.test(q)) return "bachelor";
  if (/diploma|iti|polytechnic/.test(q)) return "diploma";
  if (/school|matric|10th|12th|secondary|sslc|hsc/.test(q)) return "school";
  return null;
}

/** Dedupe key normaliser — lowercase, collapse whitespace. */
function normKeyPart(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function dedupeKey(title: string, country: string, company: string): string {
  return `${normKeyPart(title)}|${normKeyPart(country)}|${normKeyPart(company)}`;
}

// ── Row validation (shared by /preview and /commit) ─────────────────

export interface NormalizedRow {
  rowNumber: number;
  values: Partial<Record<TargetField, any>>;
  status: "valid" | "warning" | "error";
  issues: string[];
  /** duplicate of another row in the file OR of an existing active job — skipped at commit */
  duplicate?: boolean;
}

interface RawRow {
  rowNumber: number;
  values: Record<string, unknown>;
}

/**
 * Normalise + validate a batch of rows. Same function backs preview AND
 * commit, so a client can never smuggle a row past validation by editing
 * the preview payload. Tolerant by design: warnings keep the row importable
 * with a safe default; only missing/unresolvable title+country are errors.
 */
async function validateRows(rawRows: RawRow[]): Promise<NormalizedRow[]> {
  const db = storage.db!;
  if (!countriesLoaded()) await loadValidCountries();

  // Case-insensitive canonical country lookup — "saudi arabia" resolves to
  // the admin-curated spelling instead of failing on case.
  const countryByLower = new Map<string, string>();
  for (const c of listValidCountries()) countryByLower.set(c.toLowerCase(), c);

  // "Already posted" check: dedupe keys of every existing ACTIVE job.
  const existing = await db
    .select({ title: jobs.title, country: jobs.country, company: jobs.company })
    .from(jobs)
    .where(eq(jobs.status, "active"));
  const existingKeys = new Set(existing.map((j: { title: string | null; country: string | null; company: string | null }) => dedupeKey(j.title || "", j.country || "", j.company || "")));

  const seenInFile = new Map<string, number>(); // dedupe key → first rowNumber
  const out: NormalizedRow[] = [];

  for (const raw of rawRows) {
    const issues: string[] = [];
    let hasError = false;
    let duplicate = false;
    const v: Partial<Record<TargetField, any>> = {};
    const src = raw.values || {};

    const str = (f: TargetField) => cellToString(src[f]);

    // title — required
    let title = str("title");
    if (title.length > 120) { title = title.slice(0, 120); issues.push("Title longer than 120 characters — truncated."); }
    if (title.length < 2) { hasError = true; issues.push("Title is required."); }
    else v.title = title;

    // company — defaults to HPSEDC (warning, not error)
    let company = str("company");
    if (company.length > 150) { company = company.slice(0, 150); issues.push("Company longer than 150 characters — truncated."); }
    if (!company) { company = "HPSEDC"; issues.push('Company missing — defaulted to "HPSEDC".'); }
    v.company = company;

    // country — required, must resolve via the country validator
    const countryRaw = str("country");
    if (!countryRaw) {
      hasError = true;
      issues.push("Country is required.");
    } else if (isIndia(countryRaw)) {
      hasError = true;
      issues.push("India is not a valid destination — this is the overseas placement portal.");
    } else {
      const canonical = countryByLower.get(countryRaw.toLowerCase());
      if (!canonical) {
        hasError = true;
        issues.push(`Unknown destination country "${countryRaw}". Admin can add destinations in the Countries tab.`);
      } else {
        v.country = canonical;
      }
    }

    // location — defaults to country
    let location = str("location");
    if (location.length > 80) { location = location.slice(0, 80); issues.push("Location longer than 80 characters — truncated."); }
    if (!location && v.country) { location = v.country; issues.push("Location missing — defaulted to the destination country."); }
    if (location) v.location = location;

    // category — controlled vocabulary; unknown values are dropped (warning)
    const categoryRaw = str("category");
    if (categoryRaw) {
      const canonical = normaliseCategory(categoryRaw);
      if (canonical) v.category = canonical;
      else issues.push(`Unknown category "${categoryRaw}" — left blank.`);
    }

    // salary — free text
    let salary = str("salary");
    if (salary.length > 120) { salary = salary.slice(0, 120); issues.push("Salary longer than 120 characters — truncated."); }
    if (salary) v.salary = salary;

    // targetHires — positive int, default 1
    const hiresRaw = str("targetHires");
    let targetHires = 1;
    if (hiresRaw) {
      const n = parseInt(hiresRaw.replace(/[^\d]/g, ""), 10);
      if (Number.isFinite(n) && n >= 1) targetHires = Math.min(n, 500);
      else issues.push(`Could not read vacancies "${hiresRaw}" — defaulted to 1.`);
    }
    v.targetHires = targetHires;

    // hiringDeadline — ISO date; bad or past dates are dropped (warning)
    const deadlineRaw = src["hiringDeadline"];
    const deadlineStr = cellToString(deadlineRaw);
    if (deadlineStr) {
      const iso = parseDateCell(deadlineRaw);
      if (!iso) {
        issues.push(`Could not read deadline "${deadlineStr}" — dropped.`);
      } else if (iso < new Date().toISOString().slice(0, 10)) {
        issues.push(`Deadline ${iso} is in the past — dropped.`);
      } else {
        v.hiringDeadline = iso;
      }
    }

    // experience — years, int 0-60
    const expRaw = str("experience");
    if (expRaw) {
      const n = parseInt(expRaw.replace(/[^\d]/g, ""), 10);
      if (Number.isFinite(n) && n >= 0) v.experience = Math.min(n, 60);
      else issues.push(`Could not read experience "${expRaw}" — dropped.`);
    }

    // qualification — mapped onto the matching-engine vocabulary
    const qualRaw = str("qualificationRequired");
    if (qualRaw) {
      const q = normaliseQualification(qualRaw);
      if (q) v.qualificationRequired = q;
      else issues.push(`Unrecognised qualification "${qualRaw}" — left blank.`);
    }

    // description
    let description = str("description");
    if (description.length > 5000) { description = description.slice(0, 5000); issues.push("Description longer than 5000 characters — truncated."); }
    if (description) v.description = description;

    // requirements — array; accepts a pre-split array (commit round-trip) or a ; / newline separated string
    const reqSrc = src["requirements"];
    const reqParts = (Array.isArray(reqSrc) ? reqSrc.map(cellToString) : cellToString(reqSrc).split(/[;\n]/))
      .map((s) => defuseCell(s.trim()).trim().slice(0, 500))
      .filter(Boolean)
      .slice(0, 30);
    if (reqParts.length) v.requirements = reqParts;

    // skills — array; split on , or ;
    const skillsSrc = src["skills"];
    const skillParts = (Array.isArray(skillsSrc) ? skillsSrc.map(cellToString) : cellToString(skillsSrc).split(/[,;]/))
      .map((s) => defuseCell(s.trim()).trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 30);
    if (skillParts.length) v.skills = skillParts;

    // Dedupe — within the file, then against existing active jobs
    if (!hasError && v.title && v.country) {
      const key = dedupeKey(v.title, v.country, v.company || "");
      const firstRow = seenInFile.get(key);
      if (firstRow !== undefined) {
        duplicate = true;
        issues.push(`Duplicate of row ${firstRow} in this file — will be skipped.`);
      } else {
        seenInFile.set(key, raw.rowNumber);
        if (existingKeys.has(key)) {
          duplicate = true;
          issues.push("Already posted — an active job with the same title, company and country exists.");
        }
      }
    }

    out.push({
      rowNumber: raw.rowNumber,
      values: v,
      status: hasError ? "error" : issues.length > 0 ? "warning" : "valid",
      issues,
      duplicate,
    });
  }

  return out;
}

function summarise(rows: NormalizedRow[]) {
  return {
    total: rows.length,
    valid: rows.filter((r) => r.status === "valid").length,
    warnings: rows.filter((r) => r.status === "warning").length,
    errors: rows.filter((r) => r.status === "error").length,
  };
}

// ── File parsing ────────────────────────────────────────────────────

/** Parse the uploaded buffer into { headers, rows } where rows are cell arrays aligned to headers. */
async function parseUpload(file: Express.Multer.File): Promise<{ headers: string[]; rows: unknown[][] }> {
  const ext = path.extname(file.originalname || "").toLowerCase();

  if (ext === ".csv") {
    // papaparse with header:true is robust to quoted fields / embedded commas.
    const text = file.buffer.toString("utf-8");
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const headers = (parsed.meta.fields || []).map((h) => String(h).trim()).filter(Boolean);
    if (!headers.length) throw new Error("Could not find a header row in the CSV file.");
    const rows = parsed.data.map((rec) => headers.map((h) => rec[h]));
    return { headers, rows };
  }

  // .xlsx / .xls → read-excel-file (first sheet, first row = headers).
  // Legacy .xls (pre-2007 binary) isn't supported by the parser — the catch
  // in the route turns its throw into a clear 400 asking for .xlsx/.csv.
  // read-excel-file's Node types resolve to a branded Sheet type; treat it as
  // the array-of-rows it actually is.
  const grid = (await readXlsxFile(file.buffer)) as unknown as unknown[][];
  if (!grid.length) throw new Error("The spreadsheet is empty.");
  const headers = grid[0].map((c) => cellToString(c)).map((h) => h.trim());
  const rows = grid.slice(1)
    // drop fully-empty rows (trailing formatting rows are common in govt sheets)
    .filter((r) => r.some((c) => cellToString(c) !== ""));
  return { headers, rows };
}

// ── POST /preview ───────────────────────────────────────────────────
router.post("/preview", protect, adminOnly, importUpload.single("file"), async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 400, message: "No file uploaded. Attach a .csv or .xlsx file in the 'file' field." } });
    }
    if (req.file.size === 0) {
      return res.status(400).json({ success: false, error: { code: 400, message: "File is empty. Please choose a non-empty file." } });
    }

    let parsed: { headers: string[]; rows: unknown[][] };
    try {
      parsed = await parseUpload(req.file);
    } catch (e: any) {
      logger.warn(`job-import: parse failed for "${req.file.originalname}": ${e?.message}`);
      return res.status(400).json({
        success: false,
        error: { code: 400, message: `Could not parse "${req.file.originalname}". Legacy .xls files are not supported — save as .xlsx or .csv and retry. (${e?.message || "parse error"})` },
      });
    }

    if (parsed.rows.length === 0) {
      return res.status(400).json({ success: false, error: { code: 400, message: "No data rows found below the header row." } });
    }
    if (parsed.rows.length > MAX_DATA_ROWS) {
      return res.status(400).json({
        success: false,
        error: { code: 400, message: `File has ${parsed.rows.length} data rows — the import limit is ${MAX_DATA_ROWS} per batch. Split the file and import in parts.` },
      });
    }

    // Optional client mapping override (multipart text field, JSON object).
    let override: Record<string, string | null> | undefined;
    if (typeof req.body?.mapping === "string" && req.body.mapping.trim()) {
      try {
        const o = JSON.parse(req.body.mapping);
        if (o && typeof o === "object" && !Array.isArray(o)) override = o;
      } catch {
        return res.status(400).json({ success: false, error: { code: 400, message: "Invalid mapping JSON." } });
      }
    }

    const mapping = buildMapping(parsed.headers, override);

    // Apply the mapping: source cells → target-field keyed raw rows.
    // rowNumber is the spreadsheet row (header = row 1, first data row = 2).
    const rawRows: RawRow[] = parsed.rows.map((cells, i) => {
      const values: Record<string, unknown> = {};
      parsed.headers.forEach((h, col) => {
        const target = mapping[h];
        if (!target) return;
        const cell = cells[col];
        // first non-empty value wins if two columns map to the same field
        if (values[target] === undefined || cellToString(values[target]) === "") values[target] = cell;
      });
      return { rowNumber: i + 2, values };
    });

    const rows = await validateRows(rawRows);
    res.json({
      success: true,
      data: {
        fileName: req.file.originalname,
        headers: parsed.headers,
        mapping,
        targetFields: TARGET_FIELDS,
        rows,
        summary: summarise(rows),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /commit ────────────────────────────────────────────────────
router.post("/commit", protect, adminOnly, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });
    const adminId = (req.user as any).id as string;

    const { rows: clientRows, mapping, fileName } = (req.body ?? {}) as { rows?: any[]; mapping?: any; fileName?: string };
    if (!Array.isArray(clientRows) || clientRows.length === 0) {
      return res.status(400).json({ success: false, error: { code: 400, message: "No rows to import. Run a preview first." } });
    }
    if (clientRows.length > MAX_DATA_ROWS) {
      return res.status(400).json({ success: false, error: { code: 400, message: `Import limit is ${MAX_DATA_ROWS} rows per batch.` } });
    }

    // NEVER trust the client's status/issues — rebuild every row from its
    // values with the exact preview validation (dedupe checks included).
    const rawRows: RawRow[] = clientRows.map((r: any, i: number) => ({
      rowNumber: Number.isFinite(Number(r?.rowNumber)) ? Number(r.rowNumber) : i + 2,
      values: r?.values && typeof r.values === "object" && !Array.isArray(r.values) ? r.values : {},
    }));
    const validated = await validateRows(rawRows);

    // Attribution: configured owner → first verified agency (HPSEDC) → importing admin.
    let ownerId: string | null = null;
    const configured = String((await getSetting<string>("jobimport.default_agent_user_id")) || "").trim();
    if (configured) {
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, configured)).limit(1);
      if (u) ownerId = u.id;
      else logger.warn(`job-import: jobimport.default_agent_user_id "${configured}" not found — falling back`);
    }
    if (!ownerId) {
      const [agent] = await db.select({ userId: recruitmentAgents.userId }).from(recruitmentAgents)
        .where(eq(recruitmentAgents.verified, true))
        .orderBy(asc(recruitmentAgents.id))
        .limit(1);
      if (agent?.userId) ownerId = agent.userId;
    }
    if (!ownerId) ownerId = adminId;

    let created = 0, skipped = 0, failed = 0;
    const errors: { rowNumber: number; reason: string }[] = [];

    // Per-row insert with its own try/catch — one bad row must never abort
    // the rest of the batch.
    for (const row of validated) {
      if (row.status === "error") {
        skipped++;
        errors.push({ rowNumber: row.rowNumber, reason: row.issues[0] || "Validation failed." });
        continue;
      }
      if (row.duplicate) {
        skipped++;
        errors.push({ rowNumber: row.rowNumber, reason: row.issues.find((i) => i.includes("Duplicate") || i.includes("Already posted")) || "Duplicate." });
        continue;
      }
      try {
        const v = row.values;
        await db.insert(jobs).values({
          title: v.title!,
          company: v.company || "HPSEDC",
          location: v.location || v.country!,
          country: v.country!,
          category: v.category ?? null,
          salary: v.salary ?? null,
          description: v.description ?? null,
          requirements: v.requirements ?? null,
          skills: v.skills ?? null,
          experience: v.experience ?? 0,
          qualificationRequired: v.qualificationRequired ?? null,
          targetHires: v.targetHires ?? 1,
          hiringDeadline: v.hiringDeadline ?? null,
          agentId: ownerId,
          status: "active",
          visibility: "public",
        });
        created++;
      } catch (e: any) {
        failed++;
        errors.push({ rowNumber: row.rowNumber, reason: e?.message || "Insert failed." });
        logger.error(`job-import: row ${row.rowNumber} insert failed: ${e?.message}`);
      }
    }

    // Batch audit trail: job_imports record + one audit_log entry.
    const [batch] = await db.insert(jobImports).values({
      importedBy: adminId,
      fileName: typeof fileName === "string" ? fileName.slice(0, 255) : null,
      rowCount: validated.length,
      createdCount: created,
      skippedCount: skipped,
      failedCount: failed,
    }).returning();

    await db.insert(auditLog).values({
      userId: adminId,
      action: "import",
      resourceType: "job_import",
      resourceId: batch.id,
      details: {
        fileName: batch.fileName,
        mapping: mapping ?? null,
        ownerAgentId: ownerId,
        rowCount: validated.length,
        created, skipped, failed,
      } as any,
      ipAddress: req.ip,
    }).catch(() => { /* audit failure must not fail the import response */ });

    // Tell the owning agency jobs landed in its book (skip self-notification).
    if (created > 0 && ownerId !== adminId) {
      notify({
        userId: ownerId,
        type: "job_import",
        title: "Jobs imported",
        message: `${created} job posting(s) were bulk-imported by HPSEDC admin${batch.fileName ? ` from "${batch.fileName}"` : ""} and are now live under your agency.`,
        metadata: { jobImportId: batch.id, created },
      }).catch(() => {});
    }

    logger.info(`job-import: batch ${batch.id} by ${adminId} — created=${created} skipped=${skipped} failed=${failed} (owner=${ownerId})`);
    res.status(201).json({ success: true, data: { batchId: batch.id, created, skipped, failed, errors } });
  } catch (err) {
    next(err);
  }
});

// ── GET /history ────────────────────────────────────────────────────
router.get("/history", protect, adminOnly, async (req, res, next) => {
  try {
    const db = storage.db;
    if (!db) return res.status(500).json({ success: false, error: { code: 500, message: "Database not available" } });

    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "25")) || 25));
    const rows = await db
      .select({
        id: jobImports.id,
        fileName: jobImports.fileName,
        rowCount: jobImports.rowCount,
        createdCount: jobImports.createdCount,
        skippedCount: jobImports.skippedCount,
        failedCount: jobImports.failedCount,
        createdAt: jobImports.createdAt,
        importedBy: jobImports.importedBy,
        importedByName: users.username,
      })
      .from(jobImports)
      .leftJoin(users, eq(jobImports.importedBy, users.id))
      .orderBy(desc(jobImports.createdAt))
      .limit(limit);

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

router.use(handleImportUploadErrors);

export default router;
