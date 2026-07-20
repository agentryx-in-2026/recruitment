/**
 * Which profile fields a candidate may still change, and why.
 *
 * ── The rule: evidence locks fields, stages do not ─────────────────────────
 * The obvious design is to freeze identity once a candidate reaches some stage.
 * It is the wrong axis for this portal. HPSEDC's applicants are largely
 * blue-collar, often filling the form on a helper's phone, with no support
 * channel beyond a phone number and a bus ride — and the portal deliberately
 * lets people apply BEFORE they own a passport ("I don't have a passport yet").
 * A stage-based freeze locks out exactly the person who was always going to get
 * their passport late, which is the normal path, not the exception.
 *
 * So a field locks when EVIDENCE has been verified against it. Upload your
 * passport; once HPSEDC verify that document, the fields printed on it stop
 * being free text and become a transcription of a checked artifact. Need a
 * change after that? A new document and a re-verification — which is what
 * actually happens in the world when a passport is reissued.
 *
 * This keeps responsibility with the candidate, as it should be: they assert
 * their own details, and the evidence they supply at selection is what binds
 * them. It also gives a reason a candidate can understand — "this matches your
 * passport" is a better answer than "you have reached stage 3".
 *
 * The selection snapshot (selection-snapshot.service.ts) is what makes this
 * safe: even where editing stays open, the record of what HPSEDC actually
 * selected can no longer be rewritten.
 *
 * ── The one carve-out ──────────────────────────────────────────────────────
 * `ecrStatus` is not a claim a candidate can reasonably be responsible for. It
 * decides whether statutory PoE emigration clearance applies, and if it is
 * wrong the candidate is offloaded at the airport — HPSEDC's failure under the
 * Emigration Act 1983, not theirs. It is also objectively readable from the
 * passport page. So once an application reaches selection it becomes a
 * staff-verified fact rather than a self-declaration.
 */
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { documents, applications, candidates } from "@shared/schema";

/**
 * Fields printed on a passport. Once a passport document is VERIFIED, these
 * must match it — the portal should not disagree with a document HPSEDC have
 * checked and are about to put on a visa application.
 */
const PASSPORT_BOUND_FIELDS = [
  "passportNumber", "passportIssueDate", "passportExpiry", "passportPlaceOfIssue",
  "noPassportYet", "fullName", "dateOfBirth", "sex",
];

/** Fields printed on a government identity document (Aadhaar / voter ID). */
const IDENTITY_BOUND_FIELDS = ["aadhaarNumber", "fatherName", "motherName"];

const COMMITTED_STATUSES = ["selected", "placed"];

export interface LockResult {
  /** Field names the candidate may no longer set themselves. */
  locked: string[];
  /** Why, keyed by field — shown to the candidate, so it must be plain. */
  reasons: Record<string, string>;
}

export async function lockedFieldsFor(candidateId: string): Promise<LockResult> {
  const db = storage.db;
  const locked: string[] = [];
  const reasons: Record<string, string> = {};
  if (!db) return { locked, reasons };

  const add = (fields: string[], why: string) => {
    for (const f of fields) {
      if (!locked.includes(f)) { locked.push(f); reasons[f] = why; }
    }
  };

  const docRows = await db
    .select({ type: documents.type, verified: documents.verified })
    .from(documents)
    .where(eq(documents.candidateId, candidateId));

  const verifiedTypes = new Set(
    docRows.filter((d: any) => d.verified).map((d: any) => String(d.type || "").toLowerCase()),
  );

  if (verifiedTypes.has("passport")) {
    add(PASSPORT_BOUND_FIELDS,
      "These come from your passport, which HPSEDC have checked. To change them, upload a new passport — they will verify it and update your details.");
  }
  if (verifiedTypes.has("identity_proof")) {
    add(IDENTITY_BOUND_FIELDS,
      "These come from the identity document HPSEDC have checked. To change them, upload a new one.");
  }

  // ECR: statutory, and HPSEDC's exposure rather than the candidate's.
  const apps = await db
    .select({ status: applications.status })
    .from(applications)
    .where(eq(applications.candidateId, candidateId));
  if (apps.some((a: any) => COMMITTED_STATUSES.includes(a.status))) {
    add(["ecrStatus"],
      "HPSEDC confirm your ECR / ECNR status from your passport once you are selected, because it decides whether emigration clearance applies. Contact them if it looks wrong.");
  }

  return { locked, reasons };
}

/**
 * Strip locked fields from an incoming patch.
 *
 * Returns what to write plus what was refused, so the route can tell the
 * candidate WHICH fields were ignored and why. Silently dropping them would be
 * the worst option: the save appears to succeed and the value reverts, which is
 * exactly the "is this broken?" confusion this portal has already produced.
 *
 * Staff bypass the lock entirely — they are the people who verify the evidence
 * in the first place, and every staff edit is audited identically.
 */
export async function applyProfileLock(
  candidateId: string,
  patch: Record<string, any>,
  actorRole: string,
): Promise<{ allowed: Record<string, any>; refused: string[]; reasons: Record<string, string>; meaningfulCount: number }> {
  if (actorRole !== "candidate") return { allowed: patch, refused: [], reasons: {}, meaningfulCount: Object.keys(patch).length };

  const { locked, reasons } = await lockedFieldsFor(candidateId);
  if (locked.length === 0) return { allowed: patch, refused: [], reasons: {}, meaningfulCount: Object.keys(patch).length };

  const allowed: Record<string, any> = {};
  const refused: string[] = [];
  const current = await storage.db!.select().from(candidates).where(eq(candidates.id, candidateId)).limit(1);
  const now: any = current[0] ?? {};

  for (const [k, v] of Object.entries(patch)) {
    if (!locked.includes(k)) { allowed[k] = v; continue; }
    // Re-sending an unchanged value is not an attempt to change anything — the
    // form PATCHes whole pages, so a locked field arrives on every save of the
    // page it sits on. Refusing those would make the page unsaveable.
    const same = JSON.stringify(now[k] ?? null) === JSON.stringify(v ?? null);
    if (same) continue;
    refused.push(k);
  }

  // Drop no-op keys before reporting. updateCandidateSchema always emits
  // `ieltsBand: null` via its transform, so `allowed` was never empty even when
  // every field the candidate actually tried to change had been refused — the
  // route then returned 200 for a request that changed nothing they asked for.
  const meaningful: Record<string, any> = {};
  for (const [k, v] of Object.entries(allowed)) {
    if (JSON.stringify(now[k] ?? null) !== JSON.stringify(v ?? null)) meaningful[k] = v;
  }

  const refusedReasons: Record<string, string> = {};
  for (const f of refused) refusedReasons[f] = reasons[f];
  return { allowed, refused, reasons: refusedReasons, meaningfulCount: Object.keys(meaningful).length };
}
