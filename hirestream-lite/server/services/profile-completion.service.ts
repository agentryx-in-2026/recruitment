/**
 * "How complete is this application?" — ONE definition.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * There were two copies of this calculation and they had already drifted:
 *   - GET /candidates/profile/completion — 9 checks, demanding an ID scan AND a
 *     passport scan specifically.
 *   - POST /jobs/:id/apply — 8 checks inline, with a generic "any document".
 * So the percentage the dashboard showed a candidate and the percentage the
 * apply gate judged them by were different numbers with the same name. The
 * apply gate is inert at the default setting (0), which is the only reason
 * nobody noticed.
 *
 * ── What it measures now (UAT-05) ──────────────────────────────────────────
 * APPLICATION COMPLETE — "have you answered the form" — and nothing else.
 *
 * Documents are deliberately NOT here. They are owed per APPLICATION at
 * shortlist and selection (document-obligations.routes.ts), because HPSEDC
 * asked why 20,000 applicants should produce documents only 500 will need. A
 * candidate who answers every question is 100% complete; whether they are
 * DEPLOYMENT READY is a different question about a different subject (an
 * application, not a person) and has a different answer per job.
 */

import { storage } from "../storage";
import { candidates, candidateEducation, candidateExperience, candidateProfessions } from "@shared/schema";
import { eq, and, count, gt } from "drizzle-orm";

export interface CompletionResult {
  percentage: number;
  completed: number;
  total: number;
  missing: string[];
  checks: { name: string; done: boolean }[];
}

/** The 7 checkpoints. Exactly what /register asks for — no more, no less. */
export async function computeCompletion(candidateId: string): Promise<CompletionResult> {
  const db = storage.db;
  const profileRows = await db.select().from(candidates).where(eq(candidates.id, candidateId)).limit(1);
  const profile = profileRows[0];
  if (!profile) {
    return { percentage: 0, completed: 0, total: 7, missing: ["fullName", "email", "phone", "location", "skills", "education", "experience"], checks: [] };
  }

  const [profCount, eduCount, expCount, profMonths] = await Promise.all([
    db.select({ c: count() }).from(candidateProfessions).where(eq(candidateProfessions.candidateId, candidateId)),
    db.select({ c: count() }).from(candidateEducation).where(eq(candidateEducation.candidateId, candidateId)),
    db.select({ c: count() }).from(candidateExperience).where(eq(candidateExperience.candidateId, candidateId)),
    db.select({ c: count() }).from(candidateProfessions)
      .where(and(eq(candidateProfessions.candidateId, candidateId), gt(candidateProfessions.experienceMonths, 0))),
  ]);

  const checks = [
    { name: "fullName", done: Boolean(profile.fullName && profile.fullName !== "Unknown") },
    { name: "email", done: Boolean(profile.email) },
    { name: "phone", done: Boolean(profile.phone) },
    { name: "location", done: Boolean(profile.location) },
    // Either surface counts: candidate_professions is the new one (item 15),
    // skills[] the legacy one /register still mirrors. A pre-v0.4.0 profile must
    // not suddenly read as incomplete.
    { name: "skills", done: (profCount[0]?.c ?? 0) > 0 || Boolean(profile.skills && profile.skills.length > 0) },
    { name: "education", done: (eduCount[0]?.c ?? 0) > 0 },
    {
      name: "experience",
      done: (expCount[0]?.c ?? 0) > 0 || (profMonths[0]?.c ?? 0) > 0
        || (profile.experienceMonths ?? 0) > 0 || (profile.experience ?? 0) > 0,
    },
  ];

  const completed = checks.filter((c) => c.done).length;
  return {
    percentage: Math.round((completed / checks.length) * 100),
    completed,
    total: checks.length,
    missing: checks.filter((c) => !c.done).map((c) => c.name),
    checks,
  };
}
