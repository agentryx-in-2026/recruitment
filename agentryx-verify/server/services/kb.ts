import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { pool } from "../config/db";

/**
 * Ask Agentryx knowledge base — splits every reference source into short,
 * linkable passages for full-text retrieval:
 *   guide  → each section of the three Lite user guides   (link: guide PDF)
 *   video  → each narrated chapter of the walkthroughs     (link: video at #t=sec)
 *   frs    → the contracted FRS, by heading                (link: FRS PDF)
 *   plan   → FRS coverage map rows, demo steps, fix list   (internal only)
 *   case   → every visible test case: steps + expected     (link: the case)
 *   doc    → other Documents-library files (SRS, architecture, plans), by
 *            heading or page, with the document's own audience (admin/internal/all)
 * Rebuild after guides, videos or cases change: scripts/build-kb.ts or the
 * admin "Rebuild knowledge" action.
 */
const R = "/home/subhash.thakur.india/Projects/Recruitment";
const LITE = `${R}/hirestream-lite`;
const GUIDE_SRC = `${LITE}/A.PMD/User Guides and Videos - Lite/source`;

type Chunk = { source_type: string; source_title: string; heading: string; body: string; url: string | null; audience: string };

const strip = (h: string) => h
  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
  .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|tr|h\d|div|figcaption|table)>/gi, "\n")
  .replace(/<td[^>]*>/gi, " | ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&mdash;/g, "—").replace(/&rarr;/g, "→")
  .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

async function docUrl(title: string): Promise<string | null> {
  const r = await pool.query("select id from pm_documents where title = $1 limit 1", [title]);
  return r.rows[0] ? `/api/pm/documents/${r.rows[0].id}/file` : null;
}

/** Split an HTML guide into passages at <h2>/<h3>, keeping the h2 as context. */
function guideChunks(html: string, guideTitle: string, url: string | null): Chunk[] {
  const out: Chunk[] = [];
  const parts = html.split(/(?=<h[23][\s>])/i);
  let h2 = "";
  for (const p of parts) {
    const m = p.match(/^<h([23])[^>]*>([\s\S]*?)<\/h\1>/i);
    if (!m) continue;
    const title = strip(m[2]);
    if (m[1] === "2") h2 = title;
    const body = strip(p.slice(m[0].length));
    if (body.length < 40) continue;
    out.push({ source_type: "guide", source_title: guideTitle, heading: m[1] === "2" ? title : `${h2} › ${title}`, body: body.slice(0, 3000), url, audience: "all" });
  }
  return out;
}

export async function rebuildKnowledgeBase(): Promise<Record<string, number>> {
  const chunks: Chunk[] = [];

  // Guides
  const guides: [string, string, string][] = [
    ["applicant.html", "Applicant User Guide", "Applicant User Guide"],
    ["agency.html", "HPSEDC as Super Agency — User Guide", "HPSEDC as Super Agency — User Guide"],
    ["admin.html", "Admin User Guide", "Admin User Guide"],
  ];
  for (const [file, title, pmTitle] of guides) {
    const p = `${GUIDE_SRC}/${file}`;
    if (fs.existsSync(p)) chunks.push(...guideChunks(fs.readFileSync(p, "utf8"), title, await docUrl(pmTitle)));
  }

  // Videos — one passage per narrated chapter, linked to its start time
  const narrPath = `${LITE}/tests/video-lite/narration.json`;
  const startsPath = `${LITE}/tests/video-lite/chapter-starts.json`;
  if (fs.existsSync(narrPath)) {
    const narr = JSON.parse(fs.readFileSync(narrPath, "utf8"));
    const starts = fs.existsSync(startsPath) ? JSON.parse(fs.readFileSync(startsPath, "utf8")) : {};
    const vids: Record<string, string> = { applicant: "Walkthrough video — Applicant", agency: "Walkthrough video — HPSEDC Super Agency", admin: "Walkthrough video — Admin" };
    for (const [role, chapters] of Object.entries<any[]>(narr)) {
      const base = await docUrl(vids[role]);
      chapters.forEach((ch, i) => {
        const t = starts[role]?.[ch.key];
        const mm = t != null ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}` : "";
        chunks.push({
          source_type: "video", source_title: vids[role],
          heading: `Chapter ${i + 1}: ${ch.title}${mm ? ` (starts ${mm})` : ""}`,
          body: String(ch.text).replace(/H P S E D C/g, "HPSEDC").replace(/E C R/g, "ECR").replace(/C S V/g, "CSV").replace(/P D F/g, "PDF"),
          url: base ? `${base}${t != null ? `#t=${t}` : ""}` : null, audience: "all",
        });
      });
    }
  }

  // FRS — by numbered heading
  const frsPath = `${LITE}/A.PMD/FRS/FRS.txt`;
  if (fs.existsSync(frsPath)) {
    const url = await docUrl("Functional Requirements Specification (FRS)");
    const text = fs.readFileSync(frsPath, "utf8").split(/\n/).filter((l) => !/\.{6,}/.test(l)).join("\n");
    const sections = text.split(/\n(?=\d\.\d?\s+[A-Z][^\n]{3,80}\n)/);
    for (const s of sections) {
      const lines = s.trim().split("\n");
      const body = lines.slice(1).join(" ").replace(/\s+/g, " ").trim();
      if (body.length < 60) continue;
      chunks.push({ source_type: "frs", source_title: "FRS (contracted)", heading: lines[0].trim(), body: body.slice(0, 3000), url, audience: "all" });
    }
  }

  // Coverage & demo plan (internal) — one passage per table row, plus sections
  const planPath = `${LITE}/A.PMD/FRS/Lite_FRS_Coverage_and_Demo_Plan.html`;
  if (fs.existsSync(planPath)) {
    const url = await docUrl("Lite FRS coverage & phase-1 demo plan");
    const html = fs.readFileSync(planPath, "utf8");
    for (const sec of html.split(/(?=<section)/i)) {
      const h = sec.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
      if (!h) continue;
      const heading = strip(h[1]);
      const rows = sec.match(/<tr(?![^>]*class="group")[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
      if (rows.length > 3) {
        for (const r of rows) {
          const t = strip(r);
          if (t.length > 30 && !/^Ref \| FRS|^# \| Role|^Addition/.test(t)) chunks.push({ source_type: "plan", source_title: "FRS coverage & demo plan", heading, body: t, url, audience: "internal" });
        }
      } else {
        const body = strip(sec.replace(/<h2[\s\S]*?<\/h2>/i, ""));
        if (body.length > 40) chunks.push({ source_type: "plan", source_title: "FRS coverage & demo plan", heading, body: body.slice(0, 3000), url, audience: "internal" });
      }
    }
  }

  // Documents library — anything not already covered above (guides, FRS, plan, videos, images)
  const covered = new Set(["Applicant User Guide", "HPSEDC as Super Agency — User Guide", "Admin User Guide", "Functional Requirements Specification (FRS)", "Lite FRS coverage & phase-1 demo plan"]);
  const docs = await pool.query("select id, title, mime_type, audience, file_name from pm_documents order by category, title");
  for (const d of docs.rows) {
    if (covered.has(d.title) || /^(video|image)\//.test(d.mime_type)) continue;
    const file = path.join(process.cwd(), "uploads", "verify", "pm", path.basename(d.file_name));
    if (!fs.existsSync(file)) continue;
    let text = "";
    try {
      if (d.mime_type === "application/pdf") text = execFileSync("pdftotext", ["-layout", file, "-"], { maxBuffer: 64 * 1024 * 1024 }).toString();
      else if (d.mime_type === "text/html") text = strip(fs.readFileSync(file, "utf8"));
      else text = fs.readFileSync(file, "utf8");
    } catch { continue; }
    const url = `/api/pm/documents/${d.id}/file`;
    if (d.mime_type === "application/pdf") {
      // PDFs: one passage per page (pdftotext separates pages with form feeds).
      text.split("\f").forEach((pg, i) => {
        const body = pg.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
        if (body.length >= 80) chunks.push({ source_type: "doc", source_title: d.title, heading: `Page ${i + 1}: ${body.split("\n").find((l) => l.trim().length > 12 && !/htistelecom|^\d+$/i.test(l))?.trim().slice(0, 90) ?? ""}`, body: body.slice(0, 3000), url: `${url}#page=${i + 1}`, audience: d.audience });
      });
      continue;
    }
    // Text documents: split at markdown or numbered headings; long sections in ~2,500-character windows.
    const parts = text.split(/\n(?=#{1,3} |\d+(?:\.\d+)*\.?\s+[A-Z][^\n]{3,90}\n)/);
    for (const part of parts) {
      const lines = part.trim().split("\n");
      const heading = lines[0].replace(/^#+\s*/, "").trim().slice(0, 120);
      const body = lines.slice(1).join("\n").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
      for (let i = 0; i < body.length; i += 2500) {
        const piece = body.slice(i, i + 2500);
        if (piece.length < 60) continue;
        chunks.push({ source_type: "doc", source_title: d.title, heading: i ? `${heading} (cont.)` : heading, body: piece, url, audience: d.audience });
      }
    }
  }

  // Test cases of the projects testers can see
  const cases = await pool.query(`
    select r.id, r.item_ref, r.section_title, r.description, r.test_steps, r.expected_result, r.notes, p.name as project
    from requirements r join projects p on p.id = r.project_id
    where p.visible_to_non_admin order by p.sort_order, r.sort_order`);
  for (const c of cases.rows) {
    chunks.push({
      source_type: "case", source_title: c.project,
      heading: `${c.item_ref} ${c.description}`,
      body: [c.section_title && `Part of: ${c.section_title}.`, c.test_steps && `Steps: ${c.test_steps}`, c.expected_result && `Expected: ${c.expected_result}`, c.notes].filter(Boolean).join(" "),
      url: `/cases/${c.id}`, audience: "all",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("delete from kb_chunks");
    for (const c of chunks) {
      await client.query("insert into kb_chunks (source_type, source_title, heading, body, url, audience) values ($1,$2,$3,$4,$5,$6)",
        [c.source_type, c.source_title, c.heading, c.body, c.url, c.audience]);
    }
    await client.query("commit");
  } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }

  return chunks.reduce((acc, c) => ({ ...acc, [c.source_type]: (acc[c.source_type] ?? 0) + 1 }), {} as Record<string, number>);
}

export type KbHit = { id: number; source_type: string; source_title: string; heading: string; body: string; url: string | null };

/** Full-text retrieval, filtered to what the reader may see. Falls back to OR-matching. */
export async function searchKb(q: string, internal: boolean, limit = 8, admin = false): Promise<KbHit[]> {
  const aud = admin ? ["all", "internal", "admin"] : internal ? ["all", "internal"] : ["all"];
  const run = (tsq: string) => pool.query(
    `select id, source_type, source_title, heading, body, url, ts_rank_cd(tsv, query) as rank
       from kb_chunks, ${tsq} query
      where tsv @@ query and audience = any($2)
      order by rank desc limit $3`, [q, aud, limit]);
  let r = await run("websearch_to_tsquery('english', $1)");
  if (r.rows.length < 3) {
    const words = q.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
    if (words.length) {
      const orQ = words.join(" | ");
      r = await pool.query(
        `select id, source_type, source_title, heading, body, url, ts_rank_cd(tsv, query) as rank
           from kb_chunks, to_tsquery('english', $1) query
          where tsv @@ query and audience = any($2)
          order by rank desc limit $3`, [orQ, aud, limit]);
    }
  }
  return r.rows.map(({ rank, ...h }: any) => h);
}
