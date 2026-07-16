/**
 * Saved-search digest cron. Runs daily at 07:30 UTC (13:00 IST) — same
 * time-zone reasoning as job-lifecycle: hit the user's morning inbox.
 * Each candidate with an active saved search gets ONE email listing new
 * jobs that match their filters since the last run.
 */

import cron from "node-cron";
import { storage } from "../storage";
import { savedSearches, jobs, users, candidates } from "@shared/schema";
import { and, eq, gt, ilike, or, sql } from "drizzle-orm";
import { logger } from "../config/logger.config";
import { sendEmail } from "./email.service";
import { notify } from "./notification.service";
import { env } from "../config/env.config";

type SearchFilters = {
  search?: string;
  country?: string;
  salaryTier?: string;
  experienceTier?: string;
};

function isDue(frequency: string, lastRunAt: Date | null): boolean {
  if (frequency === "off") return false;
  if (!lastRunAt) return true;
  const hrs = (Date.now() - lastRunAt.getTime()) / 36e5;
  if (frequency === "daily") return hrs >= 22;
  if (frequency === "weekly") return hrs >= 22 * 7;
  return false;
}

async function matchJobs(filters: SearchFilters, sinceUtc: Date): Promise<any[]> {
  const db = storage.db!;
  const conds: any[] = [
    eq(jobs.visibility, "public"),
    eq(jobs.status, "active"),
    gt(jobs.createdAt, sinceUtc),
  ];
  if (filters.country && filters.country !== "all") {
    conds.push(ilike(jobs.country, filters.country));
  }
  if (filters.search) {
    conds.push(or(
      ilike(jobs.title, `%${filters.search}%`),
      ilike(jobs.company, `%${filters.search}%`),
    )!);
  }
  const rows = await db.select().from(jobs).where(and(...conds)).limit(25);
  return rows;
}

export async function runSavedSearchesOnce(): Promise<{ processed: number; emailed: number }> {
  const db = storage.db;
  if (!db) return { processed: 0, emailed: 0 };

  const active = await db.select().from(savedSearches).where(
    sql`${savedSearches.frequency} <> 'off'`,
  );
  let emailed = 0;
  for (const ss of active) {
    try {
      if (!isDue(ss.frequency as string, ss.lastRunAt as any)) continue;
      const since = ss.lastRunAt ?? new Date(Date.now() - 7 * 86400000);
      const matches = await matchJobs(ss.filters as any, since);

      await db.update(savedSearches).set({
        lastRunAt: new Date(),
        lastMatchCount: matches.length,
      }).where(eq(savedSearches.id, ss.id));

      if (matches.length === 0) continue;

      const [user] = await db.select().from(users).where(eq(users.id, ss.userId)).limit(1);
      if (!user?.email) continue;

      const [cand] = await db.select().from(candidates).where(eq(candidates.userId, ss.userId)).limit(1);
      const firstName = (cand?.fullName || user.username || "").split(/\s+/)[0] || "there";

      const baseUrl = env.APP_URL.replace(/\/$/, "");
      const rows = matches.slice(0, 10).map((j: any) =>
        `<tr><td style="padding:8px;border-bottom:1px solid #eee"><a href="${baseUrl}/jobs/${j.id}" style="color:#1a56db;text-decoration:none"><strong>${j.title}</strong></a><br><span style="color:#6b7280;font-size:12px">${j.company} — ${j.location}, ${j.country}${j.salary ? " · " + j.salary : ""}</span></td></tr>`
      ).join("");

      await sendEmail({
        to: user.email,
        subject: `${matches.length} new match${matches.length > 1 ? "es" : ""} for "${ss.name}" on HireStream`,
        text: `Hi ${firstName},\n\n${matches.length} new jobs match your saved search "${ss.name}".\n\n` +
              matches.slice(0, 10).map((j: any) => `• ${j.title} — ${j.company}, ${j.country}${j.salary ? " · " + j.salary : ""}\n  ${baseUrl}/jobs/${j.id}`).join("\n\n") +
              `\n\nTo change frequency or stop these emails, visit ${baseUrl}/`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:16px"><h2 style="color:#1a56db">HireStream</h2><p>Hi ${firstName},</p><p><strong>${matches.length} new jobs</strong> match your saved search "<em>${ss.name}</em>".</p><table style="width:100%;border-collapse:collapse;margin:12px 0">${rows}</table><p style="color:#6b7280;font-size:12px">Change frequency in your dashboard → Saved Searches.</p></div>`,
      });
      // Also drop an in-app notification so it's visible even if email fails silently.
      notify({
        userId: ss.userId,
        type: "job.matches_your_profile",
        title: `${matches.length} new match${matches.length > 1 ? "es" : ""} for "${ss.name}"`,
        message: `Check your dashboard — ${matches.length} newly posted jobs match your saved search.`,
        severity: "info",
        metadata: { savedSearchId: ss.id, matchCount: matches.length },
      }).catch(() => {});
      emailed++;
    } catch (err) {
      logger.warn(`saved-searches digest for ${ss.id} failed: ${(err as Error).message}`);
    }
  }
  logger.info(`Saved-searches digest: processed=${active.length}, emailed=${emailed}`);
  return { processed: active.length, emailed };
}

let scheduled: ReturnType<typeof cron.schedule> | null = null;
export function startSavedSearchesCron() {
  if (scheduled) return;
  // 07:30 UTC = 13:00 IST — candidates' afternoon check on WhatsApp/email.
  scheduled = cron.schedule("30 7 * * *", () => {
    runSavedSearchesOnce().catch((e) => logger.error(`saved-searches cron failed: ${e}`));
  });
  logger.info("Saved-searches digest cron scheduled (07:30 UTC = 13:00 IST daily)");
}
