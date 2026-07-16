/**
 * readiness 2026-07-07: one-time "cleared for deployment" announcement.
 *
 * deployment.service.ts is deliberately pure (no DB dependency) — this small
 * sibling owns the side-effectful half: load a placement, compute its
 * readiness, and if the candidate just became travel-ready, notify the
 * candidate + the owning agent exactly once (placements.deployment_ready_
 * notified_at is the idempotency marker, stamped with a NULL guard so
 * concurrent flips can't double-announce).
 *
 * Callers invoke it fire-and-forget (`.catch(() => {})`) from every handler
 * that can flip readiness to ready — it must never block the main response.
 */
import { and, eq, isNull } from "drizzle-orm";
import { applications, candidates, countryInfo, jobs, placements } from "@shared/schema";
import { logger } from "../config/logger.config";
import { computeReadiness } from "./deployment.service";
import { notify } from "./notification.service";

export async function maybeNotifyDeploymentReady(db: any, placementId: string): Promise<void> {
  if (!db) return;
  const [row] = await db
    .select({ placement: placements, application: applications, candidate: candidates, job: jobs })
    .from(placements)
    .innerJoin(applications, eq(placements.applicationId, applications.id))
    .innerJoin(candidates, eq(applications.candidateId, candidates.id))
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .where(eq(placements.id, placementId))
    .limit(1);
  if (!row) return;
  if (row.placement.deploymentReadyNotifiedAt) return; // already announced

  // Destination ECR flag drives the conditional eMigrate/PoE readiness item.
  const [ci] = await db.select({ isEcrCountry: countryInfo.isEcrCountry }).from(countryInfo)
    .where(eq(countryInfo.name, row.placement.country)).limit(1);
  const readiness = computeReadiness(row.candidate, row.placement, { destinationIsEcr: !!ci?.isEcrCountry });
  if (!readiness.isTravelReady) return;

  // Stamp FIRST with a NULL guard — whoever wins the UPDATE sends the (single)
  // announcement; a concurrent caller gets zero rows back and stays silent.
  const stamped = await db.update(placements)
    .set({ deploymentReadyNotifiedAt: new Date() })
    .where(and(eq(placements.id, placementId), isNull(placements.deploymentReadyNotifiedAt)))
    .returning({ id: placements.id });
  if (!stamped.length) return;

  const metadata = { placementId, applicationId: row.application.id, jobId: row.job.id };

  // Candidate (bilingual — citizen-facing).
  if (row.candidate.userId) {
    notify({
      userId: row.candidate.userId,
      type: "application_update",
      title: "Cleared for deployment",
      message: `You are cleared for deployment — every pre-departure requirement for "${row.job.title}" in ${row.placement.country} is complete. HPSEDC will confirm your travel date.`,
      titleHi: "आप रवानगी के लिए क्लियर हैं",
      messageHi: `आप रवानगी के लिए क्लियर हैं — ${row.placement.country} में "${row.job.title}" के लिए सभी पूर्व-प्रस्थान आवश्यकताएँ पूरी हो गई हैं। HPSEDC आपकी यात्रा तिथि की पुष्टि करेगा।`,
      severity: "positive",
      autoSave: true, // milestone — don't let it be accidentally dismissed
      metadata,
    }).catch(() => { /* best-effort */ });
  }

  // Owning agent — they set the travel/start date next.
  if (row.job.agentId) {
    notify({
      userId: row.job.agentId,
      type: "application_update",
      title: `Candidate cleared for deployment: ${row.candidate.fullName}`,
      message: `${row.candidate.fullName} has completed every pre-departure requirement for "${row.job.title}" (${row.placement.country}). Confirm the travel/start date.`,
      severity: "positive",
      metadata: { ...metadata, candidateId: row.candidate.id },
    }).catch(() => { /* best-effort */ });
  }

  logger.info(`Deployment-ready announced for placement ${placementId} (candidate ${row.candidate.id})`);
}

// Candidate-level trigger (e.g. the agent compliance PATCH edits passport/PCC/
// medical/PDO/PBBY fields that feed EVERY placement's readiness) — re-check
// each of the candidate's placements. Sequential on purpose: the per-placement
// guard makes it idempotent, and the fleet per candidate is tiny.
export async function maybeNotifyDeploymentReadyForCandidate(db: any, candidateId: string): Promise<void> {
  if (!db) return;
  const rows = await db
    .select({ id: placements.id })
    .from(placements)
    .innerJoin(applications, eq(placements.applicationId, applications.id))
    .where(eq(applications.candidateId, candidateId));
  for (const r of rows as { id: string }[]) {
    await maybeNotifyDeploymentReady(db, r.id);
  }
}
