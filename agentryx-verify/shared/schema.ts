import {
  pgTable, text, varchar, timestamp, integer, boolean, jsonb, pgEnum,
  uniqueIndex, index, primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";

const id = () => varchar("id", { length: 21 }).primaryKey().$defaultFn(() => nanoid());
const now = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

// ── Enums ───────────────────────────────────────────────────────────
export const reviewerRoleEnum = pgEnum("reviewer_role", [
  "delivery", "agentryx", "htis", "hpsedc_staging", "hpsedc_final", "observer", "admin",
]);
export const signoffLevelEnum = pgEnum("signoff_level", [
  "agentryx", "htis", "hpsedc_staging", "hpsedc_final",
]);
export const signoffDecisionEnum = pgEnum("signoff_decision", [
  "accepted", "rejected", "waived",
]);
export const issueStatusEnum = pgEnum("issue_status", [
  "open", "in_progress", "needs_info", "resolved", "closed", "wont_fix",
]);
export const issueSeverityEnum = pgEnum("issue_severity", [
  "blocker", "major", "minor", "trivial",
]);
export const requirementStatusEnum = pgEnum("requirement_status", [
  "delivered", "partial", "not_delivered", "deferred", "n_a",
]);
export const feedbackTypeEnum = pgEnum("feedback_type", [
  "new_feature", "enhancement", "bug", "ux", "similar_sw", "other",
]);
export const feedbackStatusEnum = pgEnum("feedback_status", [
  "submitted", "triaged", "planned", "in_progress", "shipped", "declined", "duplicate", "closed",
]);
export const sprintStatusEnum = pgEnum("sprint_status", [
  "draft", "in_progress", "deployed", "closed",
]);

// ── Projects ────────────────────────────────────────────────────────
export const projects = pgTable("projects", {
  id: id(),
  slug: varchar("slug", { length: 80 }).notNull(),
  name: text("name").notNull(),
  buildRef: varchar("build_ref", { length: 40 }).notNull(),
  contractor: text("contractor"),
  client: text("client"),
  description: text("description"),
  matrixSourcePath: text("matrix_source_path"),
  // Lower = earlier in the Home list. Drives order independent of createdAt,
  // so the HTIS smoke-checklist can sit at position 2 without touching its
  // creation timestamp.
  sortOrder: integer("sort_order").notNull().default(0),
  // Admin-controlled visibility flag. When false, non-admin reviewers (HTIS /
  // HPSEDC staging / HPSEDC final / observers) don't see this project in the
  // Home list or project detail. Admin + delivery always see it and can flip.
  visibleToNonAdmin: boolean("visible_to_non_admin").notNull().default(true),
  createdAt: now(),
}, (t) => ({ slugIdx: uniqueIndex("projects_slug_idx").on(t.slug) }));

// ── Reviewers (people who can sign off / comment) ───────────────────
export const reviewers = pgTable("reviewers", {
  id: id(),
  username: varchar("username", { length: 40 }),
  email: varchar("email", { length: 200 }).notNull(),
  name: text("name").notNull(),
  organization: text("organization"),
  role: reviewerRoleEnum("role").notNull(),
  passwordHash: text("password_hash"),
  createdAt: now(),
}, (t) => ({
  emailIdx: uniqueIndex("reviewers_email_idx").on(t.email),
  usernameIdx: uniqueIndex("reviewers_username_idx").on(t.username),
}));

// ── Project ↔ Reviewer membership ───────────────────────────────────
export const projectReviewers = pgTable("project_reviewers", {
  projectId: varchar("project_id", { length: 21 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  reviewerId: varchar("reviewer_id", { length: 21 }).notNull().references(() => reviewers.id, { onDelete: "cascade" }),
  createdAt: now(),
}, (t) => ({ pk: primaryKey({ columns: [t.projectId, t.reviewerId] }) }));

// ── Requirements (rows of the compliance matrix) ────────────────────
export const requirements = pgTable("requirements", {
  id: id(),
  projectId: varchar("project_id", { length: 21 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  itemRef: varchar("item_ref", { length: 16 }).notNull(), // e.g. "1.18"
  section: integer("section").notNull(),
  sectionTitle: text("section_title").notNull(),
  description: text("description").notNull(),
  status: requirementStatusEnum("status").notNull().default("delivered"),
  evidence: text("evidence"),
  testSteps: text("test_steps"),
  expectedResult: text("expected_result"),
  notes: text("notes"),
  // External tracker IDs that reference this row (e.g. ['BUG-002']). Drives the
  // amber highlight + pill render in the requirement list.
  externalRefs: text("external_refs").array().notNull().default(sql`'{}'::text[]`),
  // Origin of the row. 'frs' = matrix parse; 'htis_new' = HTIS-reported field
  // defect appended to the matrix; 'htis_smoke' = HTIS generic QA smoke row.
  source: varchar("source", { length: 20 }).notNull().default("frs"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: now(),
}, (t) => ({
  projectItemIdx: uniqueIndex("requirements_project_item_idx").on(t.projectId, t.itemRef),
  sectionIdx: index("requirements_section_idx").on(t.projectId, t.section),
}));

// ── Sign-offs (one row per requirement × level) ─────────────────────
export const signoffs = pgTable("signoffs", {
  id: id(),
  requirementId: varchar("requirement_id", { length: 21 }).notNull().references(() => requirements.id, { onDelete: "cascade" }),
  level: signoffLevelEnum("level").notNull(),
  decision: signoffDecisionEnum("decision").notNull(),
  reviewerId: varchar("reviewer_id", { length: 21 }).notNull().references(() => reviewers.id),
  comment: text("comment"),
  signedAt: now(),
}, (t) => ({
  uniq: uniqueIndex("signoffs_req_level_idx").on(t.requirementId, t.level),
}));

// ── Comments (free-form thread per requirement) ─────────────────────
export const comments = pgTable("comments", {
  id: id(),
  requirementId: varchar("requirement_id", { length: 21 }).notNull().references(() => requirements.id, { onDelete: "cascade" }),
  reviewerId: varchar("reviewer_id", { length: 21 }).notNull().references(() => reviewers.id),
  body: text("body").notNull(),
  createdAt: now(),
}, (t) => ({ reqIdx: index("comments_req_idx").on(t.requirementId) }));

// ── Attachments (polymorphic: signoff | comment) ────────────────────
export const attachments = pgTable("attachments", {
  id: id(),
  ownerType: varchar("owner_type", { length: 16 }).notNull(),   // "signoff" | "comment"
  ownerId: varchar("owner_id", { length: 21 }).notNull(),
  filename: varchar("filename", { length: 128 }).notNull(),     // stored filename on disk
  originalName: varchar("original_name", { length: 256 }).notNull(),
  mimetype: varchar("mimetype", { length: 64 }).notNull(),
  filesize: integer("filesize").notNull(),
  uploadedBy: varchar("uploaded_by", { length: 21 }).notNull().references(() => reviewers.id),
  createdAt: now(),
}, (t) => ({ ownerIdx: index("attachments_owner_idx").on(t.ownerType, t.ownerId) }));

// ── Issues (defect log) ─────────────────────────────────────────────
export const issues = pgTable("issues", {
  id: id(),
  projectId: varchar("project_id", { length: 21 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  shortId: varchar("short_id", { length: 16 }).notNull(), // e.g. "HS-001"
  itemRef: varchar("item_ref", { length: 16 }), // optional link to requirement
  severity: issueSeverityEnum("severity").notNull(),
  status: issueStatusEnum("status").notNull().default("open"),
  reportedById: varchar("reported_by_id", { length: 21 }).references(() => reviewers.id),
  description: text("description").notNull(),
  resolution: text("resolution"),
  createdAt: now(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniq: uniqueIndex("issues_project_short_idx").on(t.projectId, t.shortId),
}));

// ── Feedback / ideas inbox (Verify reviewers submit enhancement ideas) ──
// Distinct from `issues` (defect log): feedback is forward-looking — "this
// could be better if…", "we should add…", "similar to how Greenhouse does X".
// Attachments reuse the polymorphic `attachments` table with ownerType="feedback".
export const feedbackItems = pgTable("feedback_items", {
  id: id(),
  referenceCode: varchar("reference_code", { length: 24 }).notNull(), // e.g. "FB-2026-0001"
  projectId: varchar("project_id", { length: 21 }).references(() => projects.id, { onDelete: "set null" }),
  submitterReviewerId: varchar("submitter_reviewer_id", { length: 21 }).notNull().references(() => reviewers.id),
  type: feedbackTypeEnum("type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  area: varchar("area", { length: 40 }), // candidate | agent | employer | admin | platform
  similarTo: text("similar_to"),         // only used when type=similar_sw
  status: feedbackStatusEnum("status").notNull().default("submitted"),
  priority: varchar("priority", { length: 16 }).notNull().default("normal"),
  assignedToId: varchar("assigned_to_id", { length: 21 }).references(() => reviewers.id),
  adminNotes: text("admin_notes"),
  linkedToItemRef: varchar("linked_to_item_ref", { length: 24 }), // e.g. "C1.42"
  createdAt: now(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  codeIdx: uniqueIndex("feedback_code_idx").on(t.referenceCode),
  projectIdx: index("feedback_project_idx").on(t.projectId),
  statusIdx: index("feedback_status_idx").on(t.status),
}));

export const feedbackComments = pgTable("feedback_comments", {
  id: id(),
  feedbackId: varchar("feedback_id", { length: 21 }).notNull().references(() => feedbackItems.id, { onDelete: "cascade" }),
  reviewerId: varchar("reviewer_id", { length: 21 }).notNull().references(() => reviewers.id),
  body: text("body").notNull(),
  createdAt: now(),
}, (t) => ({ fbIdx: index("feedback_comments_fb_idx").on(t.feedbackId) }));

// ── Sprint releases — tracks which fixes shipped in each dev sprint so the
// UAT portal can surface "🔁 re-verify" badges on previously-rejected signoffs
// once the fix is deployed. Closes the loop between tester feedback and
// delivery team re-deploys without wiping or rewriting existing signoffs.
export const projectSprints = pgTable("project_sprints", {
  id: id(),
  projectId: varchar("project_id", { length: 21 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),                              // e.g. "Sprint 1 — tester fixes April 2026"
  buildRef: varchar("build_ref", { length: 40 }),            // set on deploy; becomes project.buildRef
  notes: text("notes"),                                      // markdown-ish release notes
  // Requirement itemRefs (e.g. "1.4", "2.13") that were fixed in this sprint.
  // Stored as text[] so admins can edit without FK churn; joined to requirements
  // at read time for the badge logic.
  fixedItemRefs: text("fixed_item_refs").array().notNull().default(sql`'{}'::text[]`),
  status: sprintStatusEnum("status").notNull().default("draft"),
  createdByReviewerId: varchar("created_by_reviewer_id", { length: 21 }).notNull().references(() => reviewers.id),
  // Can't use the shared `now()` helper here — it hardcodes the column name to
  // `created_at`, and I want this column to be `started_at` to make the sprint
  // lifecycle fields (startedAt / deployedAt / closedAt) consistent.
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  deployedAt: timestamp("deployed_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
}, (t) => ({
  projIdx: index("project_sprints_project_idx").on(t.projectId),
}));

// ── Magic links (auth) ──────────────────────────────────────────────
export const magicLinks = pgTable("magic_links", {
  id: id(),
  token: varchar("token", { length: 64 }).notNull(),
  reviewerId: varchar("reviewer_id", { length: 21 }).notNull().references(() => reviewers.id, { onDelete: "cascade" }),
  projectId: varchar("project_id", { length: 21 }).references(() => projects.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: now(),
}, (t) => ({ tokenIdx: uniqueIndex("magic_links_token_idx").on(t.token) }));

// ── Audit log ───────────────────────────────────────────────────────
export const auditLog = pgTable("audit_log", {
  id: id(),
  projectId: varchar("project_id", { length: 21 }).references(() => projects.id),
  reviewerId: varchar("reviewer_id", { length: 21 }).references(() => reviewers.id),
  action: text("action").notNull(),
  meta: jsonb("meta"),
  createdAt: now(),
});

// ── Relations ───────────────────────────────────────────────────────
export const projectsRelations = relations(projects, ({ many }) => ({
  requirements: many(requirements),
  reviewers: many(projectReviewers),
  issues: many(issues),
}));
export const requirementsRelations = relations(requirements, ({ one, many }) => ({
  project: one(projects, { fields: [requirements.projectId], references: [projects.id] }),
  signoffs: many(signoffs),
  comments: many(comments),
}));
export const signoffsRelations = relations(signoffs, ({ one }) => ({
  requirement: one(requirements, { fields: [signoffs.requirementId], references: [requirements.id] }),
  reviewer: one(reviewers, { fields: [signoffs.reviewerId], references: [reviewers.id] }),
}));

// ── Insert schemas ──────────────────────────────────────────────────
export const insertReviewerSchema = createInsertSchema(reviewers).omit({ id: true, createdAt: true });
export const insertRequirementSchema = createInsertSchema(requirements).omit({ id: true, createdAt: true });
export const insertSignoffSchema = createInsertSchema(signoffs).omit({ id: true, signedAt: true });
export const insertCommentSchema = createInsertSchema(comments).omit({ id: true, createdAt: true });
export const insertIssueSchema = createInsertSchema(issues).omit({ id: true, createdAt: true, updatedAt: true });

export type Project = typeof projects.$inferSelect;
export type Requirement = typeof requirements.$inferSelect;
export type Signoff = typeof signoffs.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Issue = typeof issues.$inferSelect;
export type Reviewer = typeof reviewers.$inferSelect;

// ── Product Management library ──────────────────────────────────────
// Contract, requirements, design and training documents, filed by category.
// `audience` decides who can open each one:
//   admin    → admin + delivery only (e.g. the signed Work Order)
//   internal → + Agentryx testers (e.g. FRS coverage map with open defects)
//   all      → every reviewer, incl. HTIS and HPSEDC (e.g. user guides)
// Files live under uploads/pm/ and are served only through the access check.
export const pmDocuments = pgTable("pm_documents", {
  id: id(),
  title: text("title").notNull(),
  category: varchar("category", { length: 60 }).notNull(),
  description: text("description"),
  fileName: text("file_name").notNull(),          // stored name under uploads/pm/
  originalName: text("original_name").notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  sizeBytes: integer("size_bytes").notNull().default(0),
  audience: varchar("audience", { length: 16 }).notNull().default("admin"),
  sortOrder: integer("sort_order").notNull().default(0),
  uploadedById: varchar("uploaded_by_id", { length: 21 }).references(() => reviewers.id),
  createdAt: now(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ catIdx: index("pm_documents_category_idx").on(t.category, t.sortOrder) }));
