/**
 * PWS §4 / §5 / §7 — Nightly job lifecycle:
 *   1. Close jobs where hiring_deadline < today
 *   2. Close jobs without deadline older than job.auto_expire_days
 *   3. Nudge owners job.auto_close_nudge_days_before_deadline days ahead of deadline
 *
 * Runs via node-cron at 02:00 IST (20:30 UTC) daily. Exported as
 * runJobLifecycleOnce() so tests and manual admin actions can invoke it on demand.
 */

import cron from "node-cron";
import { storage } from "../storage";
import { jobs, applications, candidates, recruitmentAgents, employers } from "@shared/schema";
import { and, eq, isNotNull, isNull, sql, lt } from "drizzle-orm";
import { logger } from "../config/logger.config";
import { getSetting } from "./settings.service";
import { fireEvent } from "./event-notifications.service";
import { logTransition } from "./audit-transitions.service";

export interface LifecycleRunSummary {
  closedByDeadline: string[];
  closedByStaleness: string[];
  nudged: string[];
  durationMs: number;
}

async function ownerContext(db: any, job: any) {
  let agent: any, employer: any;
  if (job.agentId) {
    const [ag] = await db.select().from(recruitmentAgents).where(eq(recruitmentAgents.userId, job.agentId)).limit(1);
    if (ag) agent = { id: ag.id, userId: ag.userId, agencyName: ag.agencyName };
  }
  if (job.employerId) {
    const [emp] = await db.select().from(employers).where(eq(employers.userId, job.employerId)).limit(1);
    if (emp) employer = { id: emp.id, userId: emp.userId, companyName: emp.companyName };
  }
  return { agent, employer };
}

async function notifyCandidatesOnJobClose(db: any, job: any, actorCtx: any) {
  const apps = await db.select().from(applications).where(eq(applications.jobId, job.id));
  for (const a of apps) {
    if (!a.candidateId) continue;
    const [cand] = await db.select().from(candidates).where(eq(candidates.id, a.candidateId)).limit(1);
    if (!cand?.userId) continue;
    await fireEvent("job.closed", {
      job, application: a,
      candidate: { id: cand.id, userId: cand.userId, fullName: cand.fullName, email: cand.email },
      ...actorCtx,
    });
  }
}

export async function runJobLifecycleOnce(): Promise<LifecycleRunSummary> {
  const started = Date.now();
  const summary: LifecycleRunSummary = { closedByDeadline: [], closedByStaleness: [], nudged: [] } as any;
  const db = storage.db;
  if (!db) return { ...summary, durationMs: Date.now() - started };

  try {
    const autoExpireDays = Number(await getSetting("job.auto_expire_days")) || 0;
    const nudgeDays = Number(await getSetting("job.auto_close_nudge_days_before_deadline")) || 0;
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0]; // yyyy-mm-dd

    // 1. Close jobs where deadline has passed
    const expiredByDeadline = await db.select().from(jobs)
      .where(and(eq(jobs.status, "active"), isNotNull(jobs.hiringDeadline), lt(jobs.hiringDeadline, todayStr as any)));
    for (const j of expiredByDeadline) {
      await db.update(jobs).set({ status: "closed" }).where(eq(jobs.id, j.id));
      summary.closedByDeadline.push(j.id);
      await logTransition({
        actorUserId: "system", actorRole: "system",
        entityType: j.visibility === "agents_only" ? "requisition" : "job",
        entityId: j.id, action: "auto_close",
        fromState: "active", toState: "closed",
        reason: `hiring deadline ${j.hiringDeadline} passed`,
      });
      const actors = await ownerContext(db, j);
      await notifyCandidatesOnJobClose(db, j, actors);
    }

    // 2. Close jobs without a deadline older than auto_expire_days
    if (autoExpireDays > 0) {
      const cutoff = new Date(today.getTime() - autoExpireDays * 86400000);
      const staleRows = await db.select().from(jobs)
        .where(and(
          eq(jobs.status, "active"),
          isNull(jobs.hiringDeadline),
          lt(jobs.createdAt, cutoff),
        ));
      for (const j of staleRows) {
        await db.update(jobs).set({ status: "closed" }).where(eq(jobs.id, j.id));
        summary.closedByStaleness.push(j.id);
        await logTransition({
          actorUserId: "system", actorRole: "system",
          entityType: j.visibility === "agents_only" ? "requisition" : "job",
          entityId: j.id, action: "auto_close",
          fromState: "active", toState: "closed",
          reason: `inactive for ${autoExpireDays} days (no hiring deadline set)`,
        });
        const actors = await ownerContext(db, j);
        await notifyCandidatesOnJobClose(db, j, actors);
      }
    }

    // 3. Nudge owners N days before deadline
    if (nudgeDays > 0) {
      const nudgeDate = new Date(today.getTime() + nudgeDays * 86400000);
      const nudgeDateStr = nudgeDate.toISOString().split("T")[0];
      // jobs whose deadline is EXACTLY nudgeDateStr (avoid spamming daily)
      const toNudge: any = await db.execute(sql`
        SELECT * FROM jobs
        WHERE status = 'active' AND hiring_deadline::text = ${nudgeDateStr}
      `);
      const rows = toNudge.rows ?? toNudge;
      for (const j of rows) {
        const jobNormalized = {
          ...j,
          hiringDeadline: j.hiring_deadline ?? j.hiringDeadline,
          agentId: j.agent_id ?? j.agentId,
          employerId: j.employer_id ?? j.employerId,
        };
        const actors = await ownerContext(db, jobNormalized);
        await fireEvent("job.auto_close_nudge", {
          job: jobNormalized,
          ...actors,
          extra: { daysLeft: nudgeDays },
        });
        summary.nudged.push(j.id);
      }
    }

    const durationMs = Date.now() - started;
    logger.info(`job-lifecycle run: ${summary.closedByDeadline.length} deadline-closes, ${summary.closedByStaleness.length} stale-closes, ${summary.nudged.length} nudges in ${durationMs}ms`);
    return { ...summary, durationMs };
  } catch (err) {
    logger.error(`job-lifecycle run failed: ${err}`);
    return { ...summary, durationMs: Date.now() - started };
  }
}

let scheduled: ReturnType<typeof cron.schedule> | null = null;

export function startJobLifecycleCron() {
  if (scheduled) return;
  // 02:00 IST = 20:30 UTC
  scheduled = cron.schedule("30 20 * * *", () => {
    runJobLifecycleOnce().catch((e) => logger.error(`cron run failed: ${e}`));
  }, { timezone: "UTC" });
  logger.info("Job lifecycle cron scheduled (20:30 UTC = 02:00 IST daily)");
}

export function stopJobLifecycleCron() {
  if (scheduled) { scheduled.stop(); scheduled = null; }
}
