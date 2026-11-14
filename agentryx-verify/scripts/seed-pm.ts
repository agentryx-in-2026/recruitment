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
const W = `${R}/PMD-Final wrapup`;

const DOCS: { title: string; category: string; audience: "admin" | "internal" | "all"; src: string; description: string }[] = [
  { title: "Work Order — page 1", category: "Contract & scope", audience: "admin", src: `${R}/PMD-Final wrapup/FRS-SOW-SRS - Job order/Work_Order_Page_01.jpeg`, description: "HPSEDC work order (scan)." },
  { title: "Work Order — page 2", category: "Contract & scope", audience: "admin", src: `${R}/PMD-Final wrapup/FRS-SOW-SRS - Job order/Work_Order_Page_02.jpeg`, description: "HPSEDC work order (scan)." },
  { title: "Functional Requirements Specification (FRS)", category: "Contract & scope", audience: "all", src: `${LITE}/FRS/Functional_Requirements_Specifications__HPSEDC_.pdf`, description: "The contracted FRS for the Overseas Placement Portal and Mobile Application." },
  { title: "Lite FRS coverage & phase-1 demo plan", category: "Requirements & coverage", audience: "internal", src: `${LITE}/FRS/Lite_FRS_Coverage_and_Demo_Plan.html`, description: "How Lite meets each FRS item, the 22-step demo sequence, and the fix list before UAT." },
  { title: "SRS / System Design Document (Milestone 1)", category: "Requirements & coverage", audience: "internal", src: `${R}/PMD-Final wrapup/Approval & Delivery Documents/Milestone-1 (40%) Design Approval/01_SRS_System_Design_Document.pdf`, description: "Design approval document submitted for Milestone 1 (40%)." },
  { title: "System Architecture (full platform, Mar 2026)", category: "Design & architecture", audience: "internal", src: `${LITE}/Dev Plan Architecture & Phasing/01_System_Architecture.md`, description: "Architecture of the full HireStream platform; Lite runs a subset with agencies and employers switched off." },
  { title: "Development Plan (full platform, Mar 2026)", category: "Plans & status", audience: "internal", src: `${LITE}/Dev Plan Architecture & Phasing/02_Development_Plan.md`, description: "Original phased development plan for the full platform." },
  // ── Contract & scope ──
  { title: "Project Profile — HPSEDC Overseas Placement Portal", category: "Contract & scope", audience: "internal", src: `${W}/00.Project Profile/HireStream_HPSEDC-Overseas-Placement-Portal_Project-Profile_v1.0.pdf`, description: "One-document profile of the engagement: client, scope, team, stack and milestones." },
  { title: "Milestone 1 (40%) — approval pack index", category: "Contract & scope", audience: "admin", src: `${W}/Approval & Delivery Documents/Milestone-1 (40%) Design Approval/00_README_Index.pdf`, description: "What was submitted for the design-approval payment gate." },
  { title: "Milestone 1 — forwarding letter", category: "Contract & scope", audience: "admin", src: `${W}/Approval & Delivery Documents/Milestone-1 (40%) Design Approval/02_Forwarding_Letter.pdf`, description: "Covering letter to HPSEDC for the Milestone-1 submission." },
  { title: "Milestone 1 — design approval sign-off form", category: "Contract & scope", audience: "admin", src: `${W}/Approval & Delivery Documents/Milestone-1 (40%) Design Approval/03_Design_Approval_Signoff.pdf`, description: "Sign-off form for the design (SRS) approval." },
  { title: "Milestone 1 — deliverables checklist", category: "Contract & scope", audience: "admin", src: `${W}/Approval & Delivery Documents/Milestone-1 (40%) Design Approval/04_Milestone1_Deliverables_Checklist.pdf`, description: "Checklist of Milestone-1 deliverables." },
  { title: "Tech stack", category: "Contract & scope", audience: "internal", src: `${W}/Infra-Texh Stack & HW Spec/HireStream_Tech_Stack.pdf`, description: "Languages, frameworks, database and hosting used." },
  { title: "Infrastructure provisioning request", category: "Contract & scope", audience: "internal", src: `${W}/Infra-Texh Stack & HW Spec/HireStream_Infra_Provisioning_Request.pdf`, description: "Servers and resources requested for staging and production." },
  // ── Requirements & coverage ──
  { title: "End-to-end workflow (final, staging)", category: "Requirements & coverage", audience: "internal", src: `${LITE}/E2E_Workflow__Final_STG.md`, description: "The authoritative applicant-to-placement pipeline, aligned to the FRS, with configuration switches and gaps." },
  { title: "FRS compliance matrix (full platform, Apr 2026)", category: "Requirements & coverage", audience: "internal", src: `${LITE}/Dev Plan Architecture & Phasing/Verification & UAT/01_FRS_Compliance_Matrix.md`, description: "Item-by-item FRS compliance of the full platform." },
  { title: "Beyond-FRS extras", category: "Requirements & coverage", audience: "internal", src: `${LITE}/Dev Plan Architecture & Phasing/Verification & UAT/05_Beyond_FRS_Extras.md`, description: "Features delivered above the contracted scope." },
  // ── Design & architecture ──
  { title: "Pipeline and workflow specification", category: "Design & architecture", audience: "internal", src: `${LITE}/Dev Plan Architecture & Phasing/Sprint 2 — Pipeline & Workflow/01_Pipeline_Workflow_Specification.md`, description: "Application stages, transitions and who may move them." },
  { title: "Matching engine", category: "Design & architecture", audience: "internal", src: `${W}/Architecture & Logic/HireStream_Matching_Engine.pdf`, description: "How candidates are scored and matched to jobs." },
  { title: "System configuration reference", category: "Design & architecture", audience: "internal", src: `${LITE}/Dev Plan Architecture & Phasing/06_System_Configuration_Reference.md`, description: "Every system setting and what it switches." },
  { title: "API reference", category: "Design & architecture", audience: "internal", src: `${LITE}/Operations/02_API_Reference.md`, description: "The portal's REST API." },
  { title: "Mobile app — scope", category: "Design & architecture", audience: "internal", src: `${W}/MobileApps/Mobile App  Architecture/01_SCOPE.md`, description: "What the FRS-mandated mobile app covers." },
  { title: "Mobile app — strategy and stack", category: "Design & architecture", audience: "internal", src: `${W}/MobileApps/Mobile App  Architecture/02_STRATEGY_AND_STACK.md`, description: "React Native + Expo approach, Android first." },
  // ── Plans & status ──
  { title: "Master execution plan (full platform)", category: "Plans & status", audience: "internal", src: `${LITE}/Dev Plan Architecture & Phasing/04_Master_Execution_Plan.md`, description: "Phases, workstreams and sequencing." },
  { title: "Development task monitor (full platform)", category: "Plans & status", audience: "internal", src: `${LITE}/Dev Plan Architecture & Phasing/05_DEV_TASK_Monitor.md`, description: "Task-by-task build tracker." },
  { title: "Staging readiness phase plan", category: "Plans & status", audience: "internal", src: `${W}/Architecture & Logic/STAGING_Readiness_Phase_Plan.md`, description: "Steps to make staging ready for HPSEDC testing." },
  { title: "Future enhancements", category: "Plans & status", audience: "internal", src: `${LITE}/Dev Plan Architecture & Phasing/09_Future_Enhancements.md`, description: "Backlog of improvements beyond the current phase." },
  { title: "Mobile apps — development update", category: "Plans & status", audience: "internal", src: `${W}/MobileApps/Final_Mobile_Apps_Dev_Update.md`, description: "Where the mobile app build stands." },
  { title: "Mobile app (Android) — status", category: "Plans & status", audience: "internal", src: `${W}/MobileApps/Android/02_STATUS.md`, description: "Android build status." },
  // ── Testing & quality ──
  { title: "HireStream UAT final report", category: "Testing & quality", audience: "internal", src: `${W}/Corrections & Bug Fixes/HireStream_UAT_Final_Report.pdf`, description: "Result of the earlier UAT round and the fixes made." },
  { title: "Test scenarios — manual testing", category: "Testing & quality", audience: "internal", src: `${LITE}/Testing & User Documents/02_Test_Scenarios_Manual_Testing.md`, description: "Scenario list for manual testing." },
  { title: "HTIS testing methodology", category: "Testing & quality", audience: "internal", src: `${LITE}/Testing & User Documents/05_HTIS_Testing_Methodology.html`, description: "How HTIS reviews and signs off each build." },
  { title: "Notifications test plan (HTIS)", category: "Testing & quality", audience: "internal", src: `${LITE}/Notifications_Test_Plan_for_HTIS.html`, description: "Test plan for e-mail, SMS and in-app notifications." },
  { title: "Mobile app — quick testing guide", category: "Testing & quality", audience: "all", src: `${W}/MobileApps/HireStream_Mobile_Quick_Testing_Guide.pdf`, description: "Installing and testing the Android app." },
  // ── Operations & security ──
  { title: "Deployment guide", category: "Operations & security", audience: "internal", src: `${LITE}/Deployment Package/01_Deployment_Guide.md`, description: "How the portal is built and deployed." },
  { title: "Production runbook", category: "Operations & security", audience: "internal", src: `${LITE}/Operations/01_Production_Runbook.md`, description: "Day-to-day operation and incident steps." },
  { title: "Security audit (OWASP), Jul 2026", category: "Operations & security", audience: "admin", src: `${LITE}/Security_Audit_OWASP_2026-07-07.md`, description: "OWASP-based audit of the codebase and the fixes." },
  { title: "Codebase audit, Jul 2026", category: "Operations & security", audience: "admin", src: `${LITE}/Codebase_Audit_2026-07-06.md`, description: "Code quality and risk review." },
  { title: "Security master checklist", category: "Operations & security", audience: "admin", src: `${LITE}/Deployment Package/Security Audit/00_Security_Master_Checklist_HireStream.md`, description: "Controls checklist used before go-live." },
  // ── Demo & presentation ──
  { title: "Secretary demo script", category: "Demo & presentation", audience: "internal", src: `${LITE}/Demo/Secretary_Demo_Script.html`, description: "25-minute live demo for the Secretary: nine scenes, accounts, clicks, what to say, likely questions and fallbacks." },
  { title: "Ministry job batch (demo file)", category: "Demo & presentation", audience: "internal", src: `${LITE}/Demo/Ministry_job_batch_demo.csv`, description: "Six vacancies for the Import Jobs step; one row has no country, so the importer rejects it." },
  // ── Training material ──
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
