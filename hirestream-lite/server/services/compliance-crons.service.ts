/**
 * audit 2026-07-06 (Batch 4B-2) — Compliance crons (MEA / Emigration Act):
 *   1. Document/credential expiry alerting (passport / PCC / medical) —
 *      the #1 cause of visa-stage collapse. Milestone-based (90/60/30/expired)
 *      so a candidate is warned once per crossing, never daily.
 *   2. Grievance SLA aging + auto-escalation — uses slaDaysForCategory()
 *      (the "future SLA-aging cron" its docblock promised). Escalates once.
 *   3. Automated 30/60/90-day welfare prompts to deployed workers, feeding
 *      the existing post-placement support flow.
 *
 * Pattern mirrors job-lifecycle.service.ts: node-cron daily at 21:00 UTC
 * (02:30 IST), each task exported as run*Once() for tests / manual admin runs,
 * each gated behind a system setting, each wrapped in try/catch with a
 * one-line summary log per run (never crashes the process).
 */

import cron from "node-cron";
import { storage } from "../storage";
import {
  candidates, users, grievances, placements, applications,
} from "@shared/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { logger } from "../config/logger.config";
import { getSetting } from "./settings.service";
import { notify } from "./notification.service";
import { slaDaysForCategory } from "./grievance-router.service";
import { logTransition } from "./audit-transitions.service";

const DAY_MS = 86_400_000;

// ── 1. Document / credential expiry alerting ─────────────────────────

// Medical fitness certificates don't carry an expiry column — validity is
// derived from medicalDate. Destination rules vary (GAMCA ~3 months for visa
// stamping, others up to a year); we use 1 year as the alerting horizon.
// Tune here if HPSEDC adopts a stricter destination-specific rule.
const MEDICAL_VALIDITY_DAYS = 365;

type ExpiryDocKey = "passport" | "pcc" | "medical";

const DOC_LABEL: Record<ExpiryDocKey, { en: string; hi: string }> = {
  passport: { en: "passport", hi: "पासपोर्ट" },
  pcc:      { en: "Police Clearance Certificate (PCC)", hi: "पुलिस क्लीयरेंस सर्टिफिकेट (PCC)" },
  medical:  { en: "medical fitness certificate", hi: "मेडिकल फिटनेस प्रमाणपत्र" },
};

/** Whole days until `expiry` (negative = already expired). Null if unparseable. */
function daysUntil(expiry: string | Date | null | undefined, now: Date): number | null {
  if (!expiry) return null;
  const d = new Date(expiry);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((d.getTime() - now.getTime()) / DAY_MS);
}

/**
 * Deepest milestone crossed for a document: the SMALLEST milestone m with
 * daysLeft <= m (milestone 0 = expired). Null when the doc is comfortably
 * valid — which also re-arms alerting after a renewal.
 */
export function crossedExpiryMilestone(daysLeft: number, milestones: number[]): number | null {
  let current: number | null = null;
  for (const m of milestones) {
    if (daysLeft <= m && (current === null || m < current)) current = m;
  }
  return current;
}

export interface ExpiryAlertsSummary { scanned: number; alerted: number; rearmed: number; durationMs: number; }

export async function runExpiryAlertsOnce(): Promise<ExpiryAlertsSummary> {
  const started = Date.now();
  const summary: ExpiryAlertsSummary = { scanned: 0, alerted: 0, rearmed: 0, durationMs: 0 };
  const db = storage.db;
  if (!db) return { ...summary, durationMs: Date.now() - started };

  try {
    const enabled = await getSetting<boolean>("compliance.expiry_alerts_enabled");
    if (enabled === false) {
      logger.info("expiry-alerts run: disabled via compliance.expiry_alerts_enabled — skipped");
      return { ...summary, durationMs: Date.now() - started };
    }
    const alertDays = Number(await getSetting("compliance.expiry_alert_days")) || 90;
    // Milestones: the configured window plus the standard 60/30/expired marks
    // (only those inside the window, so a smaller window means fewer pings).
    const milestones = Array.from(new Set([alertDays, 60, 30, 0].filter((m) => m <= alertDays))).sort((a, b) => b - a);
    const now = new Date();

    const rows = await db.select().from(candidates);
    for (const c of rows as any[]) {
      summary.scanned++;
      if (!c.userId) continue;

      // Derive each doc's expiry. Medical: medicalDate + validity horizon.
      const docs: Array<{ key: ExpiryDocKey; expiry: Date | null }> = [
        { key: "passport", expiry: c.passportExpiry ? new Date(c.passportExpiry) : null },
        { key: "pcc", expiry: c.pccExpiry ? new Date(c.pccExpiry) : null },
        {
          key: "medical",
          expiry: c.medicalDate
            ? new Date(new Date(c.medicalDate).getTime() + MEDICAL_VALIDITY_DAYS * DAY_MS)
            : null,
        },
      ];

      const sent: Record<string, number> = { ...(c.expiryAlertsSent ?? {}) };
      let changed = false;

      for (const { key, expiry } of docs) {
        const daysLeft = daysUntil(expiry, now);
        if (daysLeft === null) continue;
        const milestone = crossedExpiryMilestone(daysLeft, milestones);

        if (milestone === null) {
          // Doc renewed / comfortably valid again → clear state so future
          // expiry cycles alert afresh.
          if (key in sent) { delete sent[key]; changed = true; summary.rearmed++; }
          continue;
        }
        // Idempotency: only notify when a DEEPER milestone is crossed than the
        // one already alerted (or none alerted yet). Running daily re-sends nothing.
        const prev = sent[key];
        if (prev !== undefined && prev <= milestone) continue;

        const label = DOC_LABEL[key];
        const expiryStr = expiry!.toLocaleDateString("en-IN");
        const expired = milestone === 0 && daysLeft < 0;
        await notify({
          userId: c.userId,
          type: "compliance",
          title: expired
            ? `Your ${label.en} has expired — renew now`
            : `Your ${label.en} expires in ${daysLeft} days`,
          message: expired
            ? `Your ${label.en} expired on ${expiryStr}. Renew it immediately — an expired document blocks visa and emigration clearance for overseas placement.`
            : `Your ${label.en} expires on ${expiryStr} (${daysLeft} days left). Renew it now to avoid delays at the visa / emigration-clearance stage.`,
          titleHi: expired
            ? `आपका ${label.hi} समाप्त हो चुका है — तुरंत नवीनीकरण कराएँ`
            : `आपका ${label.hi} ${daysLeft} दिनों में समाप्त हो रहा है`,
          messageHi: expired
            ? `आपका ${label.hi} ${expiryStr} को समाप्त हो चुका है। कृपया तुरंत नवीनीकरण कराएँ — समाप्त दस्तावेज़ से विदेश में नौकरी के लिए वीज़ा और उत्प्रवास मंज़ूरी रुक जाती है।`
            : `आपका ${label.hi} ${expiryStr} को समाप्त हो रहा है (${daysLeft} दिन शेष)। वीज़ा / उत्प्रवास मंज़ूरी में देरी से बचने के लिए अभी नवीनीकरण कराएँ।`,
          severity: expired || milestone <= 30 ? "urgent" : "warning",
          autoSave: true,
          metadata: { docType: key, expiryDate: expiry!.toISOString().slice(0, 10), daysLeft, milestone },
        });
        sent[key] = milestone;
        changed = true;
        summary.alerted++;
      }

      if (changed) {
        await db.update(candidates).set({ expiryAlertsSent: sent }).where(eq(candidates.id, c.id));
      }
    }
  } catch (err) {
    logger.error(`expiry-alerts run failed: ${err}`);
  }
  summary.durationMs = Date.now() - started;
  logger.info(`expiry-alerts run: ${summary.scanned} candidates scanned, ${summary.alerted} alerts sent, ${summary.rearmed} re-armed in ${summary.durationMs}ms`);
  return summary;
}

// ── 2. Grievance SLA aging + escalation ──────────────────────────────

// action_taken is deliberately NOT SLA-aged: staff have acted and the ball is
// with the complainant to confirm/close — escalating there would punish the
// staff member who already responded. resolved/escalated are terminal here.
const SLA_ELIGIBLE_STATUSES = ["submitted", "under_review"];

export interface GrievanceSlaSummary { checked: number; escalated: number; durationMs: number; }

export async function runGrievanceSlaOnce(): Promise<GrievanceSlaSummary> {
  const started = Date.now();
  const summary: GrievanceSlaSummary = { checked: 0, escalated: 0, durationMs: 0 };
  const db = storage.db;
  if (!db) return { ...summary, durationMs: Date.now() - started };

  try {
    const enabled = await getSetting<boolean>("grievance.sla_cron_enabled");
    if (enabled === false) {
      logger.info("grievance-sla run: disabled via grievance.sla_cron_enabled — skipped");
      return { ...summary, durationMs: Date.now() - started };
    }
    const now = new Date();

    // sla_breached_at IS NULL is the once-only guard: a grievance escalates a
    // single time, even if staff later move it back to under_review.
    const open = await db.select().from(grievances)
      .where(and(inArray(grievances.status, SLA_ELIGIBLE_STATUSES), isNull(grievances.slaBreachedAt)));

    const admins = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.role, "admin"), eq(users.isActive, true)));
    const slaCache = new Map<string, number>();

    for (const g of open as any[]) {
      summary.checked++;
      if (!g.createdAt) continue;
      let slaDays = slaCache.get(g.category);
      if (slaDays === undefined) {
        slaDays = await slaDaysForCategory(g.category);
        slaCache.set(g.category, slaDays);
      }
      const ageDays = Math.floor((now.getTime() - new Date(g.createdAt).getTime()) / DAY_MS);
      if (ageDays <= slaDays) continue;

      await db.update(grievances)
        .set({ status: "escalated", slaBreachedAt: now })
        .where(eq(grievances.id, g.id));
      summary.escalated++;

      await logTransition({
        actorUserId: "system", actorRole: "system",
        entityType: "grievance", entityId: g.id, action: "auto_escalate",
        fromState: g.status, toState: "escalated",
        reason: `SLA breached: ${g.category} open ${ageDays} days (SLA ${slaDays})`,
      }).catch(() => {});

      // Notify the assignee (if any) + every active admin, deduplicated.
      const recipients = new Set<string>(admins.map((a: any) => a.id));
      if (g.assignedTo) recipients.add(g.assignedTo);
      for (const rid of Array.from(recipients)) {
        notify({
          userId: rid,
          type: "system",
          title: `Grievance SLA breached: ${String(g.subject).slice(0, 60)}`,
          message: `A ${g.category.replace(/_/g, " ")} grievance has been open for ${ageDays} days (SLA: ${slaDays} days). It has been auto-escalated and needs immediate attention.`,
          severity: "urgent",
          autoSave: true,
          metadata: { grievanceId: g.id, category: g.category, ageDays, slaDays },
        }).catch(() => {});
      }
    }
  } catch (err) {
    logger.error(`grievance-sla run failed: ${err}`);
  }
  summary.durationMs = Date.now() - started;
  logger.info(`grievance-sla run: ${summary.checked} open grievances checked, ${summary.escalated} escalated in ${summary.durationMs}ms`);
  return summary;
}

// ── 3. Automated 30/60/90-day welfare prompts ────────────────────────

const WELFARE_MILESTONES = [30, 60, 90] as const;

export interface WelfarePromptsSummary { scanned: number; prompted: number; durationMs: number; }

export async function runWelfarePromptsOnce(): Promise<WelfarePromptsSummary> {
  const started = Date.now();
  const summary: WelfarePromptsSummary = { scanned: 0, prompted: 0, durationMs: 0 };
  const db = storage.db;
  if (!db) return { ...summary, durationMs: Date.now() - started };

  try {
    const enabled = await getSetting<boolean>("welfare.auto_prompts_enabled");
    if (enabled === false) {
      logger.info("welfare-prompts run: disabled via welfare.auto_prompts_enabled — skipped");
      return { ...summary, durationMs: Date.now() - started };
    }
    const now = Date.now();

    // Deployed workers only. `completed` contracts are excluded — the 30/60/90
    // window targets workers currently abroad.
    const rows = await db
      .select({ placement: placements, application: applications, candidate: candidates })
      .from(placements)
      .innerJoin(applications, eq(placements.applicationId, applications.id))
      .innerJoin(candidates, eq(applications.candidateId, candidates.id))
      .where(inArray(placements.status, ["accepted", "active"]));

    for (const r of rows as any[]) {
      summary.scanned++;
      const p = r.placement;
      const userId = r.candidate?.userId;
      // Same anchor as the admin welfare-SLA monitor: startDate, falling back
      // to the acceptance record's createdAt when no start date was captured.
      const anchor = p.startDate ?? p.createdAt;
      if (!anchor || !userId) continue;
      const daysSince = Math.floor((now - new Date(anchor).getTime()) / DAY_MS);

      const sent: Record<string, string> = { ...(p.welfarePromptsSent ?? {}) };
      const recordedByMilestone: Record<number, any> = { 30: p.welfare30Day, 60: p.welfare60Day, 90: p.welfare90Day };
      const due = WELFARE_MILESTONES.filter((m) => daysSince >= m && sent[String(m)] === undefined);
      if (due.length === 0) continue;

      // Prompt only the DEEPEST due milestone (a 95-day-old placement that was
      // never prompted gets one 90-day prompt, not three back-dated ones), and
      // skip it if the check-in was already recorded by staff. Every due
      // milestone is marked either way, so it can never fire again.
      const toPrompt = [...due].reverse().find((m) => !recordedByMilestone[m]);
      const today = new Date().toISOString().slice(0, 10);
      for (const m of due) sent[String(m)] = m === toPrompt ? today : `skipped:${today}`;

      if (toPrompt) {
        await notify({
          userId,
          type: "welfare_checkin",
          title: `How are you? ${toPrompt}-day welfare check-in`,
          message: `You've been deployed in ${p.country} for ${toPrompt} days. HPSEDC wants to know you're OK. Please reply OK or NEED HELP from the Support section of your dashboard.`,
          titleHi: `आप कैसे हैं? ${toPrompt}-दिन की कल्याण जाँच`,
          messageHi: `आपको ${p.country} में तैनात हुए ${toPrompt} दिन हो गए हैं। HPSEDC जानना चाहता है कि आप ठीक हैं। कृपया अपने डैशबोर्ड के 'सहायता' अनुभाग से OK या NEED HELP भेजें।`,
          severity: "info",
          autoSave: true,
          // kind/placementId feed the client's post-placement support flow
          // (POST /api/v1/post-placement with kind=checkin).
          metadata: { placementId: p.id, milestone: toPrompt, kind: "welfare_checkin", country: p.country },
        });
        summary.prompted++;
      }

      await db.update(placements).set({ welfarePromptsSent: sent }).where(eq(placements.id, p.id));
    }
  } catch (err) {
    logger.error(`welfare-prompts run failed: ${err}`);
  }
  summary.durationMs = Date.now() - started;
  logger.info(`welfare-prompts run: ${summary.scanned} deployed placements scanned, ${summary.prompted} prompts sent in ${summary.durationMs}ms`);
  return summary;
}

// ── Scheduler ─────────────────────────────────────────────────────────

/** Run all three compliance tasks sequentially. Each task guards itself. */
export async function runComplianceCronsOnce(): Promise<void> {
  await runExpiryAlertsOnce();
  await runGrievanceSlaOnce();
  await runWelfarePromptsOnce();
}

let scheduled: ReturnType<typeof cron.schedule> | null = null;

export function startComplianceCrons() {
  if (scheduled) return;
  // 02:30 IST = 21:00 UTC — offset from the 20:30 UTC job-lifecycle run so the
  // two nightly sweeps don't contend.
  scheduled = cron.schedule("0 21 * * *", () => {
    runComplianceCronsOnce().catch((e) => logger.error(`compliance crons run failed: ${e}`));
  }, { timezone: "UTC" });
  logger.info("Compliance crons scheduled (21:00 UTC = 02:30 IST daily): expiry alerts, grievance SLA, welfare prompts");
}

export function stopComplianceCrons() {
  if (scheduled) { scheduled.stop(); scheduled = null; }
}
