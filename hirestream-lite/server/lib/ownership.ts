/**
 * Shared authorization helpers — "does this staff user own the job / the
 * application / this candidate's file?"  Extracted from the inline guard in
 * application.routes.ts (v0.4.4.0 self-audit) so the same rule can be reused
 * across routes instead of re-implemented per endpoint (audit 2026-07-06, S1/S2/S3/S7).
 *
 * Ownership model (matches the canonical PATCH /applications/:id/status):
 *   • admin / superadmin        → full access (supervisory reach)
 *   • agent                     → jobs where job.agentId === user.id
 *   • employer                  → jobs where job.employerId === user.id,
 *                                 plus derivative jobs created off their
 *                                 requisition (job.parentRequisitionId → parent.employerId)
 *   • anyone else (candidate…)  → never owns
 */
import { eq, and, or } from "drizzle-orm";
import { jobs, applications } from "@shared/schema";
import { getSetting } from "../services/settings.service";

type DB = NonNullable<typeof import("../storage")["storage"]["db"]>;
interface ActorLike { id: string; role: string }

export function isStaffSupervisor(role: string): boolean {
  return role === "admin" || role === "superadmin";
}

/**
 * Single-agency (HPSEDC) deployment fix, 2026-07-07: when agency self-
 * registration is OFF there is exactly ONE agency, so every `agent` is HPSEDC
 * staff and may act on ANY candidate/job/application (including candidates who
 * haven't applied to a job yet — e.g. recording their pre-departure compliance).
 * The per-job ownership check below only protects agent-vs-agent isolation,
 * which is meaningless with a single agency. In a multi-agency deployment
 * (capability ON) this returns false and the strict ownership check applies.
 */
async function agentActsAsSoleAgency(role: string): Promise<boolean> {
  if (role !== "agent") return false;
  try {
    const multiAgency = await getSetting<boolean>("capability.agency_self_registration");
    return multiAgency === false;
  } catch {
    return false;
  }
}

/** True if `user` owns the given job (see ownership model above). */
export async function userOwnsJob(db: DB, user: ActorLike, jobId: string): Promise<boolean> {
  if (isStaffSupervisor(user.role)) return true;
  if (await agentActsAsSoleAgency(user.role)) return true;
  const [job] = await db
    .select({ agentId: jobs.agentId, employerId: jobs.employerId, parentRequisitionId: jobs.parentRequisitionId })
    .from(jobs)
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!job) return false;
  if (user.role === "agent") return job.agentId === user.id;
  if (user.role === "employer") {
    if (job.employerId === user.id) return true;
    if (job.parentRequisitionId) {
      const [parent] = await db
        .select({ employerId: jobs.employerId })
        .from(jobs)
        .where(eq(jobs.id, job.parentRequisitionId))
        .limit(1);
      return !!parent && parent.employerId === user.id;
    }
  }
  return false;
}

/** True if `user` owns the job behind the given application. */
export async function userOwnsApplication(db: DB, user: ActorLike, applicationId: string): Promise<boolean> {
  if (isStaffSupervisor(user.role)) return true;
  if (await agentActsAsSoleAgency(user.role)) return true;
  const [app] = await db
    .select({ jobId: applications.jobId })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app?.jobId) return false;
  return userOwnsJob(db, user, app.jobId);
}

/**
 * True if `user` may act on this candidate's file — i.e. the candidate has at
 * least one application on a job the user owns. Supervisors always may.
 */
export async function userOwnsCandidate(db: DB, user: ActorLike, candidateId: string): Promise<boolean> {
  if (isStaffSupervisor(user.role)) return true;
  if (await agentActsAsSoleAgency(user.role)) return true;
  const rows = await db
    .select({ agentId: jobs.agentId, employerId: jobs.employerId, parentRequisitionId: jobs.parentRequisitionId })
    .from(applications)
    .innerJoin(jobs, eq(applications.jobId, jobs.id))
    .where(eq(applications.candidateId, candidateId));
  for (const j of rows) {
    if (user.role === "agent" && j.agentId === user.id) return true;
    if (user.role === "employer") {
      if (j.employerId === user.id) return true;
      if (j.parentRequisitionId) {
        const [parent] = await db
          .select({ employerId: jobs.employerId })
          .from(jobs)
          .where(eq(jobs.id, j.parentRequisitionId))
          .limit(1);
        if (parent && parent.employerId === user.id) return true;
      }
    }
  }
  return false;
}
