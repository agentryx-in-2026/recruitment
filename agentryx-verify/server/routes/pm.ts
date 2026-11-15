import { audit } from "../services/audit";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { db } from "../config/db";
import { pmDocuments, reviewers, auditLog } from "@shared/schema";
import { eq, asc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { UPLOAD_DIR } from "../middleware/upload";

/**
 * Product Management library — contract, requirements, design and training
 * documents. Every document carries an audience:
 *   admin    → admin + delivery
 *   internal → + Agentryx testers
 *   all      → every signed-in reviewer (HTIS, HPSEDC, observers)
 * The audience is enforced on the file route too, so a link copied by an admin
 * does not open for someone outside it.
 */
export const pmRouter = Router();

export const PM_DIR = path.join(UPLOAD_DIR, "verify", "pm");
if (!fs.existsSync(PM_DIR)) fs.mkdirSync(PM_DIR, { recursive: true });

export const PM_CATEGORIES = [
  "Contract & scope",
  "Requirements & coverage",
  "Design & architecture",
  "Plans & status",
  "Testing & quality",
  "Operations & security",
  "Demo & presentation",
  "Training material",
] as const;
const AUDIENCES = ["admin", "internal", "all"] as const;
type Audience = (typeof AUDIENCES)[number];

const ADMIN_ROLES = new Set(["admin", "delivery"]);
const INTERNAL_ROLES = new Set(["admin", "delivery", "agentryx"]);

function canSee(role: string | null | undefined, audience: string): boolean {
  if (!role) return false;
  if (ADMIN_ROLES.has(role)) return true;
  if (audience === "all") return true;
  if (audience === "internal") return INTERNAL_ROLES.has(role);
  return false;
}

async function me(req: Request) {
  if (!req.session.reviewerId) return null;
  const [r] = await db.select({ id: reviewers.id, role: reviewers.role }).from(reviewers).where(eq(reviewers.id, req.session.reviewerId));
  return r ?? null;
}

async function requireAdmin(req: Request, res: Response) {
  const r = await me(req);
  if (!r || !ADMIN_ROLES.has(r.role)) { res.status(403).json({ error: "Admin only" }); return null; }
  return r;
}

const ALLOWED: Record<string, string> = {
  "application/pdf": ".pdf",
  "text/html": ".html",
  "text/markdown": ".md",
  "text/plain": ".txt",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "video/mp4": ".mp4",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};
const EXT_MIME: Record<string, string> = Object.fromEntries(Object.entries(ALLOWED).map(([m, e]) => [e, m]));
EXT_MIME[".jpeg"] = "image/jpeg";

export function mimeFor(fileName: string, given?: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (given && ALLOWED[given]) return given;
  return EXT_MIME[ext] ?? "application/octet-stream";
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PM_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${path.extname(file.originalname).toLowerCase()}`),
  }),
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (EXT_MIME[ext]) cb(null, true);
    else cb(new Error("Allowed: PDF, HTML, Markdown, text, PNG, JPG, MP4, DOCX, PPTX, XLSX"));
  },
  limits: { fileSize: 300 * 1024 * 1024, files: 1 },
});

const publicRow = (d: any) => ({
  id: d.id, title: d.title, category: d.category, description: d.description,
  originalName: d.originalName, mimeType: d.mimeType, sizeBytes: d.sizeBytes,
  audience: d.audience, sortOrder: d.sortOrder, pinned: d.pinned, updatedAt: d.updatedAt,
});

// GET /api/pm/documents — what this reviewer may open (admins: everything).
pmRouter.get("/documents", requireAuth, async (req, res) => {
  const r = await me(req);
  const rows = await db.select().from(pmDocuments).orderBy(asc(pmDocuments.sortOrder), asc(pmDocuments.title));
  res.json({
    isAdmin: !!r && ADMIN_ROLES.has(r.role),
    categories: PM_CATEGORIES,
    documents: rows.filter((d) => canSee(r?.role, d.audience)).map(publicRow),
  });
});

// Tiny Markdown → HTML for the plan/architecture documents (headings, lists,
// tables, code, emphasis, links). Escapes HTML first; good enough to read.
function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) => esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<i>$1</i>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>');
  const out: string[] = [];
  const lines = md.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^```/.test(l)) {
      const buf: string[] = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(esc(lines[i++]));
      i++; out.push(`<pre><code>${buf.join("\n")}</code></pre>`); continue;
    }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      out.push("<table>" + rows.map((r, k) => "<tr>" + r.map((c) => k === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</table>");
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l); const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""))}</li>`);
      out.push(ordered ? `<ol>${items.join("")}</ol>` : `<ul>${items.join("")}</ul>`); continue;
    }
    if (/^---+\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
    if (/^>\s?/.test(l)) { out.push(`<blockquote>${inline(l.replace(/^>\s?/, ""))}</blockquote>`); i++; continue; }
    if (l.trim() === "") { i++; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,6}\s|```|\s*\||\s*([-*]|\d+\.)\s|>|---)/.test(lines[i])) para.push(inline(lines[i++]));
    out.push(`<p>${para.join(" ")}</p>`);
  }
  return out.join("\n");
}

const MD_PAGE = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title.replace(/</g, "&lt;")}</title>
<style>body{margin:0;background:#f6f7f9;color:#1d2433;font:15px/1.65 -apple-system,"Segoe UI",Roboto,Arial,sans-serif}
main{max-width:900px;margin:0 auto;background:#fff;padding:40px 48px;min-height:100vh;box-sizing:border-box}
h1,h2,h3{color:#1d3461;line-height:1.25}h1{font-size:30px}h2{font-size:22px;border-bottom:1px solid #e3e7ee;padding-bottom:6px;margin-top:32px}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:14px;display:block;overflow-x:auto}th,td{border:1px solid #e3e7ee;padding:6px 10px;text-align:left;vertical-align:top}th{background:#f2f4f8}
code{background:#f2f4f8;padding:1px 5px;border-radius:4px;font-size:13px}pre{background:#f2f4f8;padding:14px;border-radius:8px;overflow-x:auto}pre code{background:none;padding:0}
blockquote{border-left:4px solid #c9d3e6;margin:10px 0;padding:4px 14px;color:#4a5468}hr{border:0;border-top:1px solid #e3e7ee;margin:24px 0}
@media (max-width:640px){main{padding:24px 16px}}</style></head><body><main>${body}</main></body></html>`;

// GET /api/pm/documents/:id/file — opens the document in the browser.
// A link opened without a session (new browser, expired sign-in) goes to sign-in and back, not a bare error.
const authOrLogin = (req: Request, res: Response, next: () => void) => {
  if (req.session.reviewerId) return next();
  if (req.accepts(["html", "json"]) === "html") return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  res.status(401).json({ error: "Not authenticated" });
};
pmRouter.get("/documents/:id/file", authOrLogin, async (req, res) => {
  const r = await me(req);
  const [d] = await db.select().from(pmDocuments).where(eq(pmDocuments.id, req.params.id));
  if (!d || !canSee(r?.role, d.audience)) return res.status(404).type("text/plain").send("Not found");
  // Opened directly as a page (old links, Ask sources): show it inside the portal's document viewer.
  // The viewer's own frame, "Open in new tab" (?raw=1) and downloads get the file itself.
  // Only ?raw=1 (the viewer frame, its video player, Open in new tab, Download) gets the bare file.
  // Any other visit by a browser — however the link was opened — lands in the viewer.
  if (!req.query.raw) {
    if (req.accepts(["html", "json"]) !== "json") return res.redirect(302, `/docs/${d.id}`);
    return res.status(400).json({ error: "Use ?raw=1 for the file" });
  }
  res.setHeader("Cache-Control", "private, no-store");
  // One "viewed" event per opening (a playing video fetches many byte ranges; count only the first).
  const range = req.get("range");
  if (!range || /^bytes=0-/.test(range)) {
    if (!(req.session as any).lastDocView || (req.session as any).lastDocView.id !== d.id || Date.now() - (req.session as any).lastDocView.at > 60_000) {
      (req.session as any).lastDocView = { id: d.id, at: Date.now() };
      void audit(req, req.query.download === "1" ? "document.downloaded" : "document.viewed", { item: d.title, meta: { category: d.category } });
    }
  }
  const full = path.join(PM_DIR, path.basename(d.fileName));
  if (!fs.existsSync(full)) return res.status(404).type("text/plain").send("File missing");
  const safeName = d.originalName.replace(/[^\w.\- ()]+/g, "_");
  // May be shown in Verify's own viewer frame, never inside another site.
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  const pageCsp = "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: 'self'; frame-ancestors 'self'";
  if (d.mimeType === "text/markdown") {
    res.setHeader("Content-Security-Policy", pageCsp);
    return res.type("html").send(MD_PAGE(d.title, mdToHtml(fs.readFileSync(full, "utf8"))));
  }
  // Self-contained report pages may pull Google Fonts; allow just that.
  res.setHeader("Content-Security-Policy", d.mimeType === "text/html" ? pageCsp : "default-src 'self'; frame-ancestors 'self'");
  const inlineTypes = ["application/pdf", "text/html", "text/plain", "image/png", "image/jpeg", "video/mp4"];
  const asDownload = req.query.download === "1" || !inlineTypes.includes(d.mimeType);
  res.setHeader("Content-Disposition", `${asDownload ? "attachment" : "inline"}; filename="${safeName}"`);
  res.type(d.mimeType);
  res.sendFile(full); // supports Range, so videos can seek
});

// POST /api/pm/documents — admin upload (multipart: file, title, category, description, audience)
pmRouter.post("/documents", requireAuth, (req, res, next) => {
  upload.single("file")(req, res, (err: any) => err ? res.status(400).json({ error: err.message }) : next());
}, async (req, res) => {
  const admin = await requireAdmin(req, res);
  const f = (req as any).file as Express.Multer.File | undefined;
  if (!admin) { if (f) fs.unlink(f.path, () => {}); return; }
  if (!f) return res.status(400).json({ error: "Choose a file" });
  const title = String(req.body.title || "").trim() || f.originalname;
  const category = PM_CATEGORIES.includes(req.body.category) ? req.body.category : PM_CATEGORIES[0];
  const audience: Audience = AUDIENCES.includes(req.body.audience) ? req.body.audience : "admin";
  const [d] = await db.insert(pmDocuments).values({
    title, category, description: String(req.body.description || "").trim() || null,
    fileName: f.filename, originalName: f.originalname, mimeType: mimeFor(f.originalname, f.mimetype),
    sizeBytes: f.size, audience, sortOrder: 100, uploadedById: admin.id,
  }).returning();
  await audit(req, "document.uploaded", { item: d.title, meta: { category: d.category, audience } });
  res.json(publicRow(d));
});

// PATCH /api/pm/documents/:id — admin edits audience / title / category / description / order
pmRouter.patch("/documents/:id", requireAuth, async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const patch: any = { updatedAt: new Date() };
  if (req.body.audience !== undefined) {
    if (!AUDIENCES.includes(req.body.audience)) return res.status(400).json({ error: "audience must be admin, internal or all" });
    patch.audience = req.body.audience;
  }
  if (typeof req.body.title === "string" && req.body.title.trim()) patch.title = req.body.title.trim();
  if (typeof req.body.description === "string") patch.description = req.body.description.trim() || null;
  if (PM_CATEGORIES.includes(req.body.category)) patch.category = req.body.category;
  if (Number.isInteger(req.body.sortOrder)) patch.sortOrder = req.body.sortOrder;
  if (typeof req.body.pinned === "boolean") { patch.pinned = req.body.pinned; delete patch.updatedAt; }
  const [d] = await db.update(pmDocuments).set(patch).where(eq(pmDocuments.id, req.params.id)).returning();
  if (!d) return res.status(404).json({ error: "Not found" });
  await audit(req, "document.updated", { item: d.title, meta: req.body });
  res.json(publicRow(d));
});

// DELETE /api/pm/documents/:id — admin removes the document and its file
pmRouter.delete("/documents/:id", requireAuth, async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const [d] = await db.delete(pmDocuments).where(eq(pmDocuments.id, req.params.id)).returning();
  if (!d) return res.status(404).json({ error: "Not found" });
  fs.unlink(path.join(PM_DIR, path.basename(d.fileName)), () => {});
  await audit(req, "document.deleted", { item: d.title, meta: { category: d.category } });
  res.json({ ok: true });
});

// GET /api/pm/overview — project status for the Product management page (admin + delivery).
// Built from live data only: builds, UAT progress, the defect log, findings,
// questions, automated runs and recent releases (git history of each app).
pmRouter.get("/overview", requireAuth, async (req, res) => {
  const r = await me(req);
  if (!r || !ADMIN_ROLES.has(r.role)) return res.status(403).json({ error: "Admins only" });
  const { pool } = await import("../config/db");
  const { execFileSync } = await import("child_process");
  const ROOT = path.resolve(process.cwd(), "..");
  const APP_DIR: Record<string, string> = { "hirestream-lite": "hirestream-lite", "hirestream-mobile-v1.0": "hirestream-mobile" };

  const projects = (await pool.query("select id, slug, name, build_ref, contractor, client from projects where visible_to_non_admin order by sort_order")).rows;
  const out = [];
  for (const p of projects) {
    const cases = (await pool.query(
      `select count(*)::int total,
              count(*) filter (where s.decision = 'accepted')::int passed,
              count(*) filter (where s.decision = 'rejected')::int failed,
              count(*) filter (where s.decision = 'waived')::int waived,
              count(*) filter (where r.status = 'not_delivered')::int not_built
         from requirements r left join signoffs s on s.requirement_id = r.id and s.level = 'agentryx'
        where r.project_id = $1`, [p.id])).rows[0];
    const defects = (await pool.query(
      `select short_id, severity, status, description, resolution, updated_at from issues where project_id = $1
        order by (status in ('open','in_progress')) desc, case severity when 'blocker' then 0 when 'major' then 1 else 2 end, short_id`, [p.id])).rows;
    const findings = (await pool.query(
      `select count(*) filter (where status not in ('shipped','declined','duplicate','closed'))::int open, count(*)::int total from feedback_items where project_id = $1`, [p.id])).rows[0];
    const dir = APP_DIR[p.slug];
    let version: string | null = null, releases: { hash: string; date: string; subject: string }[] = [];
    if (dir) {
      try { version = JSON.parse(fs.readFileSync(path.join(ROOT, dir, "package.json"), "utf8")).version ?? null; } catch { /* */ }
      try {
        releases = execFileSync("git", ["-C", ROOT, "log", `-${Math.min(Math.max(Number(req.query.releases) || 8, 1), 50)}`, "--date=iso-strict", "--format=%h%x09%ad%x09%s", "--", dir], { timeout: 5000 })
          .toString().trim().split("\n").filter(Boolean).map((l) => { const [hash, date, subject] = l.split("\t"); return { hash, date, subject }; });
      } catch { /* */ }
    }
    out.push({ ...p, version, cases, defects, findings, releases });
  }
  const questions = (await pool.query("select count(*) filter (where status = 'open')::int waiting, count(*)::int total from ask_questions")).rows[0];
  const run = (await pool.query("select scope, status, passed, failed, started_at, finished_at from auto_runs order by started_at desc limit 1")).rows[0] ?? null;
  const docs = (await pool.query("select category, count(*)::int n, max(updated_at) as updated from pm_documents group by 1")).rows;
  res.json({ projects: out, questions, lastRun: run, docs });
});

// GET /api/pm/release/:hash — one release (commit): full message and files changed (admin + delivery).
pmRouter.get("/release/:hash", requireAuth, async (req, res) => {
  const r = await me(req);
  if (!r || !ADMIN_ROLES.has(r.role)) return res.status(403).json({ error: "Admins only" });
  const hash = String(req.params.hash);
  if (!/^[0-9a-f]{7,40}$/.test(hash)) return res.status(400).json({ error: "Bad commit id" });
  const { execFileSync } = await import("child_process");
  const ROOT = path.resolve(process.cwd(), "..");
  try {
    const meta = execFileSync("git", ["-C", ROOT, "show", "-s", "--date=iso-strict", "--format=%H%x00%an%x00%ad%x00%s%x00%b", hash], { timeout: 5000 }).toString();
    const [full, author, date, subject, body] = meta.split("\0");
    const stat = execFileSync("git", ["-C", ROOT, "show", "--numstat", "--format=", hash], { timeout: 5000 }).toString().trim().split("\n").filter(Boolean)
      .map((l) => { const [add, del, file] = l.split("\t"); return { add: Number(add) || 0, del: Number(del) || 0, file }; });
    res.json({ hash: full, author, date, subject, body: body.replace(/\n*Co-Authored-By:.*$/gims, "").trim(), files: stat.slice(0, 60), fileCount: stat.length,
      url: `https://github.com/agentryx-in-2026/recruitment/commit/${full}` });
  } catch { res.status(404).json({ error: "Release not found" }); }
});
