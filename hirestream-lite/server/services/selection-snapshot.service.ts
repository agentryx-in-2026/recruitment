/**
 * Freeze who a candidate was at the moment they were selected.
 *
 * ── The problem this solves ────────────────────────────────────────────────
 * A candidate profile is a living document — people get passports, renew
 * certificates, change phone numbers. A SELECTION is the opposite: a decision
 * taken by HPSEDC and an employer against one particular version of that
 * document. Until now the portal kept only the living version, so a candidate
 * could change their trade, their name or their passport number after being
 * chosen and nothing anywhere recorded what had actually been agreed to.
 *
 * Every mainstream ATS treats a submitted application as an immutable snapshot
 * for this reason. Government overseas-employment portals go further and lock
 * identity outright (Philippines DMW locks name and date of birth to a helpdesk
 * ticket; UIDAI allows a date of birth to change once in a lifetime).
 *
 * ── Why a snapshot instead of a lock ───────────────────────────────────────
 * Locking is expensive for THIS population. HPSEDC's candidates are largely
 * blue-collar, often filling the form with a helper's phone, with no support
 * channel beyond a phone number and a bus ride. A locked field means an office
 * visit, and a good number of people simply stop.
 *
 * The snapshot removes most of the reason to lock. If the decision is recorded
 * immutably, a later edit can no longer destroy it — so the candidate keeps
 * responsibility for their own data, staff get told when something material
 * moves, and the evidence at document-verification time is what finally binds
 * the record. Locks then only need to cover what is genuinely statutory.
 *
 * Idempotent: the first selection wins. Re-selecting, or a status bounce, must
 * not overwrite the original decision — that would defeat the entire purpose.
 */
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { logger } from "../config/logger.config";
import {
  applications, candidates, candidateEducation, candidateExperience,
  candidateLanguages, candidateProfessions,
} from "@shared/schema";

export async function captureSelectionSnapshot(applicationId: string): Promise<void> {
  const db = storage.db;
  if (!db) return;
  try {
    const [app] = await db.select().from(applications).where(eq(applications.id, applicationId)).limit(1);
    if (!app) return;
    // First selection wins — never overwrite the recorded decision.
    if (app.selectionSnapshot) return;

    const candidateId = app.candidateId;
    const [profile] = await db.select().from(candidates).where(eq(candidates.id, candidateId)).limit(1);
    if (!profile) return;

    const [education, experience, languages, professions] = await Promise.all([
      db.select().from(candidateEducation).where(eq(candidateEducation.candidateId, candidateId)),
      db.select().from(candidateExperience).where(eq(candidateExperience.candidateId, candidateId)),
      db.select().from(candidateLanguages).where(eq(candidateLanguages.candidateId, candidateId)),
      db.select().from(candidateProfessions).where(eq(candidateProfessions.candidateId, candidateId)),
    ]);

    await db.update(applications).set({
      selectionSnapshot: {
        capturedAt: new Date().toISOString(),
        // Identity and the fields downstream paperwork is issued against.
        // Deliberately NOT the whole row: preferences and cosmetics change
        // freely and freezing them would just make the diff noisy.
        profile: {
          fullName: profile.fullName,
          dateOfBirth: profile.dateOfBirth,
          sex: profile.sex,
          fatherName: profile.fatherName,
          motherName: profile.motherName,
          aadhaarNumber: profile.aadhaarNumber,
          passportNumber: profile.passportNumber,
          passportIssueDate: profile.passportIssueDate,
          passportExpiry: profile.passportExpiry,
          passportPlaceOfIssue: profile.passportPlaceOfIssue,
          noPassportYet: profile.noPassportYet,
          ecrStatus: profile.ecrStatus,
          phone: profile.phone,
          whatsappNumber: profile.whatsappNumber,
          email: profile.email,
          permanentAddressLine1: profile.permanentAddressLine1,
          permanentDistrict: profile.permanentDistrict,
          permanentState: profile.permanentState,
          permanentPinCode: profile.permanentPinCode,
          qualificationLevel: profile.qualificationLevel,
          experienceMonths: profile.experienceMonths,
        },
        professions: professions.map((p: any) => ({
          professionKey: p.professionKey, experienceMonths: p.experienceMonths,
          specificSkills: p.specificSkills, addonData: p.addonData,
        })),
        education: education.map((e: any) => ({
          degree: e.degree, institution: e.institution, board: e.board, year: e.year,
        })),
        experience: experience.map((x: any) => ({
          company: x.company, role: x.role, years: x.years,
        })),
        languages: languages.map((l: any) => ({
          language: l.language, proficiency: l.proficiency, writtenProficiency: l.writtenProficiency,
        })),
      },
    } as any).where(eq(applications.id, applicationId));

    logger.info(`Selection snapshot captured for application ${applicationId}`);
  } catch (e: any) {
    // Best-effort: never roll back a selection a staff user has already seen
    // succeed. A missing snapshot is recoverable; a failed selection is not.
    logger.warn(`Selection snapshot failed for ${applicationId}: ${e?.message}`);
  }
}
