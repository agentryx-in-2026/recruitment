import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { db, pool } from "../server/config/db";
import { pmDocuments } from "../shared/schema";
import { eq } from "drizzle-orm";
import { PM_DIR, mimeFor } from "../server/routes/pm";

/**
 * Seeds the Product Management library with the phase-1 reference set.
 * Copies each source file into uploads/verify/pm/. Idempotent by title:
 * an existing row keeps its audience (the admin may have changed it) and only
 * its file is refreshed.
 *   npx tsx scripts/seed-pm.ts
 */
const R = "/home/subhash.thakur.india/Projects/Recruitment";
const LITE = `${R}/hirestream-lite/A.PMD`;
const GUIDES = `${LITE}/User Guides and Videos - Lite`;

const DOCS: { title: string; category: string; audience: "admin" | "internal" | "all"; src: string; description: string }[] = [
  { title: "Work Order — page 1", category: "Contract & scope", audience: "admin", src: `${R}/PMD-Final wrapup/FRS-SOW-SRS - Job order/Work_Order_Page_01.jpeg`, description: "HPSEDC work order (scan)." },
  { title: "Work Order — page 2", category: "Contract & scope", audience: "admin", src: `${R}/PMD-Final wrapup/FRS-SOW-SRS - Job order/Work_Order_Page_02.jpeg`, description: "HPSEDC work order (scan)." },
  { title: "Functional Requirements Specification (FRS)", category: "Contract & scope", audience: "all", src: `${LITE}/FRS/Functional_Requirements_Specifications__HPSEDC_.pdf`, description: "The contracted FRS for the Overseas Placement Portal and Mobile Application." },
  { title: "Lite FRS coverage & phase-1 demo plan", category: "Requirements & coverage", audience: "internal", src: `${LITE}/FRS/Lite_FRS_Coverage_and_Demo_Plan.html`, description: "How Lite meets each FRS item, the 22-step demo sequence, and the fix list before UAT." },
  { title: "SRS / System Design Document (Milestone 1)", category: "Requirements & coverage", audience: "internal", src: `${R}/PMD-Final wrapup/Approval & Delivery Documents/Milestone-1 (40%) Design Approval/01_SRS_System_Design_Document.pdf`, description: "Design approval document submitted for Milestone 1 (40%)." },
  { title: "System Architecture (full platform, Mar 2026)", category: "Design & architecture", audience: "internal", src: `${LITE}/Dev Plan Architecture & Phasing/01_System_Architecture.md`, description: "Architecture of the full HireStream platform; Lite runs a subset with agencies and employers switched off." },
  { title: "Development Plan (full platform, Mar 2026)", category: "Plans & status", audience: "internal", src: `${LITE}/Dev Plan Architecture & Phasing/02_Development_Plan.md`, description: "Original phased development plan for the full platform." },
  { title: "Applicant User Guide", category: "Training material", audience: "all", src: `${GUIDES}/01_Applicant_User_Guide.pdf`, description: "Registering, applying and preparing to travel." },
  { title: "HPSEDC as Super Agency — User Guide", category: "Training material", audience: "all", src: `${GUIDES}/02_HPSEDC_Super_Agency_User_Guide.pdf`, description: "Day-to-day work of the Overseas Placement Cell." },
  { title: "Admin User Guide", category: "Training material", audience: "all", src: `${GUIDES}/03_Admin_User_Guide.pdf`, description: "Oversight, configuration, compliance and go-live checklist." },
  { title: "Walkthrough video — Applicant", category: "Training material", audience: "all", src: `${GUIDES}/Videos/1-Applicant-Walkthrough.mp4`, description: "11 min, narrated, English subtitles." },
  { title: "Walkthrough video — HPSEDC Super Agency", category: "Training material", audience: "all", src: `${GUIDES}/Videos/2-HPSEDC-Super-Agency-Walkthrough.mp4`, description: "9 min, narrated, English subtitles." },
  { title: "Walkthrough video — Admin", category: "Training material", audience: "all", src: `${GUIDES}/Videos/3-Admin-Walkthrough.mp4`, description: "9 min, narrated, English subtitles." },
];

async function main() {
  let order = 0;
  for (const d of DOCS) {
    order += 10;
    if (!fs.existsSync(d.src)) { console.log(`  ! missing, skipped: ${d.src}`); continue; }
    const ext = path.extname(d.src).toLowerCase();
    const stored = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
    fs.copyFileSync(d.src, path.join(PM_DIR, stored));
    const sizeBytes = fs.statSync(d.src).size;
    const [existing] = await db.select().from(pmDocuments).where(eq(pmDocuments.title, d.title));
    if (existing) {
      fs.unlink(path.join(PM_DIR, path.basename(existing.fileName)), () => {});
      await db.update(pmDocuments).set({ fileName: stored, originalName: path.basename(d.src), mimeType: mimeFor(d.src), sizeBytes, updatedAt: new Date() }).where(eq(pmDocuments.id, existing.id));
      console.log(`  refreshed  ${d.title}`);
    } else {
      await db.insert(pmDocuments).values({ title: d.title, category: d.category, description: d.description, fileName: stored, originalName: path.basename(d.src), mimeType: mimeFor(d.src), sizeBytes, audience: d.audience, sortOrder: order });
      console.log(`  added      ${d.title}  [${d.audience}]`);
    }
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
