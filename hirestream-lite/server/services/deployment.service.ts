/**
 * Pre-departure / deployment checklist — the single source of truth for
 * "what stands between an accepted offer and the candidate boarding the
 * plane". Derived entirely from existing data (candidate compliance fields
 * + placement), so every role renders the same truth:
 *   - Candidate sees it as their Pre-Departure Tracker
 *   - Employer sees a read-only readiness summary
 *   - HPSEDC/admin oversight aggregates it
 *
 * Best-practice steps follow the Emigration Act / MEA eMigrate lifecycle.
 */
export type DeployStatus = "done" | "in_progress" | "action_needed" | "pending";
export interface DeployItem {
  key: string;
  label: string;
  status: DeployStatus;
  owner: "you" | "agency";
  detail?: string | null;
  // Deployment-Readiness (2026-07-07): `applicable` = does this item count for
  // THIS candidate (e.g. PDO/PBBY only for ECR; visa/appointment only once a
  // placement exists). `blocking` = a hard requirement that gates travel (vs the
  // travel-date step itself, which is the outcome, not a prerequisite).
  applicable: boolean;
  blocking: boolean;
  // For action_needed items: "blocker" (hard — passport expired/missing, visa
  // rejected → red) vs "warning" (soft — passport expiring within 6 months →
  // amber). Absent on non-action_needed items.
  severity?: "blocker" | "warning";
}

const VISA_LABEL: Record<string, string> = {
  not_applied: "Not applied yet",
  applied: "Application submitted",
  approved: "Approved",
  rejected: "Rejected",
};

// audit 2026-07-06 (Batch 4B): 6-month passport-validity rule. Most
// destination countries refuse entry (and eMigrate refuses clearance) when the
// passport expires within 6 months of travel. Returns:
//   null               → no issue (or no expiry on file — absence is handled
//                        by the caller, e.g. the "passport on file" check)
//   "expired"          → already expired at referenceDate
//   "within_6_months"  → valid, but expires within 6 months of referenceDate
export type PassportValidityIssue = null | "expired" | "within_6_months";
export function passportValidityIssue(
  passportExpiry: string | Date | null | undefined,
  referenceDate: string | Date = new Date(),
): PassportValidityIssue {
  if (!passportExpiry) return null;
  const expiry = new Date(passportExpiry);
  if (Number.isNaN(expiry.getTime())) return null;
  const ref = new Date(referenceDate);
  if (expiry < ref) return "expired";
  const sixMonthsOut = new Date(ref);
  sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);
  if (expiry < sixMonthsOut) return "within_6_months";
  return null;
}

// audit 2026-07-06 (Batch 4B): PDO/PBBY travel gate for ECR candidates
// (Emigration Act — both are mandatory before an ECR worker departs).
// Returns a human-readable list of what's missing, or null when clear /
// not applicable (non-ECR candidates are never gated).
export function ecrTravelGateIssue(candidate: any): string | null {
  if (candidate?.ecrStatus !== "ecr") return null;
  const missing: string[] = [];
  if (!candidate.pdoCompleted) missing.push("Pre-Departure Orientation (PDO)");
  if (candidate.pbbyInsuranceStatus !== "enrolled") missing.push("PBBY insurance enrolment");
  return missing.length ? missing.join(" and ") : null;
}

// audit 2026-07-06 (Batch 4B-2): optional context the callers resolve outside
// this pure function (it deliberately takes no DB dependency).
export interface DeploymentChecklistOpts {
  // Is the placement's destination one of the MEA-notified ECR countries?
  // (country_info.is_ecr_country — resolved by the route from the placement's
  // country.) Drives the conditional eMigrate/PoE emigration-clearance step.
  destinationIsEcr?: boolean;
}

// readiness 2026-07-16: a placement whose offer is settled — the candidate said
// yes and the deployment is real. Was inlined as ["accepted","active","completed"]
// in SIX places, which is exactly how they drifted apart: the admin fleet and the
// agency detail page reported different readiness for the same candidate.
// "placed" is the APPLICATION vocabulary leaking into placements (live data has
// one); tolerated here because the failure is silent and the confusion is easy.
export const SETTLED_PLACEMENT_STATUSES = ["accepted", "active", "completed", "placed"];

// The one placement a candidate's readiness is scored against. Prefer a settled
// placement, then any live one, and only fall back to a declined row if that's
// all there is — a declined offer must never mask a real deployment.
export function pickPrimaryPlacement(ps: any[]): any {
  if (!ps?.length) return null;
  const newestFirst = [...ps].sort(
    (a: any, b: any) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  );
  return newestFirst.find((p: any) => SETTLED_PLACEMENT_STATUSES.includes(String(p.status)))
    ?? newestFirst.find((p: any) => p.status !== "declined")
    ?? newestFirst[0]
    ?? null;
}

export function buildDeploymentChecklist(candidate: any, placement: any, opts?: DeploymentChecklistOpts): DeployItem[] {
  const c = candidate ?? {};
  const p = placement ?? {};
  // "placed" is the APPLICATION vocabulary, not the placement one (placements are
  // offered|accepted|declined|active|completed). The two get confused easily —
  // live data already carries a placement stuck at "placed" — and the failure was
  // silent: an unrecognised status just meant "offer not accepted", so a candidate
  // who IS placed showed "Offer accepted" outstanding forever. Treated as settled.
  const offerAccepted = SETTLED_PLACEMENT_STATUSES.includes(String(p.status));
  const visa = p.visaStatus as string | null | undefined;
  // A placement exists once the candidate has an offer to deploy against. Items
  // that only make sense post-offer (offer/visa/appointment/travel) don't count
  // toward readiness until then, so a freshly-registered candidate's score
  // reflects only their document compliance.
  // readiness 2026-07-16: a DECLINED offer is settled, not outstanding. It used
  // to score "pending" forever, so a candidate who turned an offer down was
  // permanently docked and shown "Offer accepted" under What's-left. Post-offer
  // items stop applying once the offer is declined — there's nothing to deploy.
  const declined = p.status === "declined";
  const hasPlacement = !!(p && p.id) && !declined;
  // ECR determination gates PDO / PBBY / PoE. `ecrStatus` is null, "" or
  // "unknown" on most rows, and treating those as "not ECR" silently DROPPED
  // three Emigration-Act steps and inflated readiness — a candidate could be
  // badged travel-ready with the question that decides those steps unanswered.
  // Now the determination is its own scored item (below) so "unknown" reads as
  // honestly incomplete rather than invisibly skipped.
  const isEcr = c.ecrStatus === "ecr";
  const ecrDetermined = c.ecrStatus === "ecr" || c.ecrStatus === "ecnr";
  const emigrationApplicable = !!(opts?.destinationIsEcr && isEcr);

  return [
    {
      key: "offer", label: "Offer accepted", owner: "you",
      status: offerAccepted ? "done" : "pending",
      applicable: hasPlacement, blocking: true,
    },
    {
      key: "ecr_status", label: "ECR / ECNR status determined", owner: "agency",
      status: ecrDetermined ? "done" : "pending",
      detail: c.ecrStatus === "ecr" ? "ECR — emigration clearance rules apply"
        : c.ecrStatus === "ecnr" ? "ECNR — no emigration clearance needed"
        : "Decides whether PDO, PBBY and PoE clearance apply",
      applicable: true, blocking: true,
    },
    // audit 2026-07-06 (Batch 4B): "passport exists" is not enough — an
    // expired (or soon-expiring) passport blocks visa + eMigrate clearance.
    // Surface it as action_needed with a clear label instead of a false "done".
    (() => {
      const issue = passportValidityIssue(c.passportExpiry);
      const validTo = c.passportExpiry ? new Date(c.passportExpiry).toLocaleDateString("en-IN") : null;
      const base = { key: "passport", owner: "you" as const, applicable: true, blocking: true };
      if (!c.passportNumber) {
        return { ...base, label: "Passport on file", status: "action_needed" as DeployStatus, detail: null, severity: "blocker" as const };
      }
      if (issue === "expired") {
        return { ...base, label: "Passport expired — renew now", status: "action_needed" as DeployStatus, detail: `Expired ${validTo}`, severity: "blocker" as const };
      }
      if (issue === "within_6_months") {
        // Soft warning — the passport is still valid today, but renew before it
        // becomes a hard blocker at the 6-month line.
        return { ...base, label: "Passport expires within 6 months — renew", status: "action_needed" as DeployStatus, detail: `Valid to ${validTo} — most countries require 6 months validity`, severity: "warning" as const };
      }
      return { ...base, label: "Passport on file", status: "done" as DeployStatus, detail: validTo ? `Valid to ${validTo}` : null };
    })(),
    // readiness 2026-07-16: "not_required" is a SETTLED state, not an unmet one.
    // It previously fell through to "pending", so a candidate whose PCC HPSEDC
    // had explicitly waived was still shown "Police clearance (PCC)" under
    // What's-left and docked readiness %. Same rule the emigration item below
    // has always used: nothing more to do → done.
    (() => {
      const base = { key: "pcc", label: "Police clearance (PCC)", owner: "you" as const, applicable: true, blocking: true };
      if (c.pccStatus === "not_required") {
        return { ...base, status: "done" as DeployStatus, detail: "Not required for this placement" };
      }
      // "verified" isn't written by any current UI, but older rows may carry it.
      if (["submitted", "verified"].includes(c.pccStatus)) {
        // An on-file PCC that has EXPIRED was scoring "done" while
        // compliance-crons.service.ts was simultaneously nagging the candidate
        // about it. Same treatment as an expired passport: a real blocker.
        const exp = c.pccExpiry ? new Date(c.pccExpiry) : null;
        if (exp && !isNaN(exp.getTime()) && exp < new Date(new Date().toDateString())) {
          return {
            ...base, label: "Police clearance (PCC) expired — renew",
            status: "action_needed" as DeployStatus,
            detail: `Expired ${exp.toLocaleDateString("en-IN")}`,
            severity: "blocker" as const,
          };
        }
        return { ...base, status: "done" as DeployStatus, detail: null };
      }
      return { ...base, status: "pending" as DeployStatus, detail: null };
    })(),
    // "unfit" is a hard stop, not a to-do: it was scored identically to "pending",
    // so a medically-unfit candidate looked merely incomplete rather than blocked.
    (() => {
      const base = { key: "medical", label: "Medical fitness", owner: "you" as const, applicable: true, blocking: true };
      if (c.medicalStatus === "fit") {
        return { ...base, status: "done" as DeployStatus, detail: null };
      }
      if (c.medicalStatus === "unfit") {
        return {
          ...base, label: "Medical fitness — declared unfit",
          status: "action_needed" as DeployStatus,
          detail: "Cannot deploy until a fresh fitness certificate is issued",
          severity: "blocker" as const,
        };
      }
      return { ...base, status: "pending" as DeployStatus, detail: null };
    })(),
    {
      key: "visa", label: "Visa / passport assistance", owner: "agency",
      status: visa === "approved" ? "done" : visa === "applied" ? "in_progress" : visa === "rejected" ? "action_needed" : "pending",
      detail: visa ? VISA_LABEL[visa] ?? visa : null,
      applicable: hasPlacement, blocking: true,
      ...(visa === "rejected" ? { severity: "blocker" as const } : {}),
    },
    {
      key: "pdo", label: "Pre-departure orientation (PDO)", owner: "agency",
      status: c.pdoCompleted ? "done" : "pending",
      applicable: isEcr, blocking: true,
    },
    {
      key: "pbby", label: "PBBY insurance", owner: "agency",
      // not_required → settled, same rule as PCC above.
      status: ["enrolled", "not_required"].includes(c.pbbyInsuranceStatus) ? "done" : "pending",
      detail: c.pbbyInsuranceStatus === "not_required" ? "Marked not required by HPSEDC" : null,
      applicable: isEcr, blocking: true,
    },
    // audit 2026-07-06 (Batch 4B-2): eMigrate / PoE emigration clearance —
    // shown ONLY when the destination is an ECR-notified country AND the
    // candidate holds an ECR passport (an ECR worker departing to an ECR
    // country without PoE clearance is unlawful under the Emigration Act).
    // INTERNAL tracking only: there is no live eMigrate API integration —
    // HPSEDC staff record the outcome obtained on the government portal via
    // PATCH /placements/:id/emigration-clearance.
    ...((emigrationApplicable ? [{
      key: "emigration",
      label: "Emigration clearance (PoE / eMigrate)",
      owner: "agency" as const,
      status: (p.emigrationClearanceStatus === "cleared" || p.emigrationClearanceStatus === "not_required"
        ? "done"
        : p.emigrationClearanceStatus === "pending" ? "in_progress" : "pending") as DeployStatus,
      detail: p.emigrationClearanceStatus === "cleared" ? "Cleared by Protector of Emigrants"
        : p.emigrationClearanceStatus === "not_required" ? "Marked not required by HPSEDC"
        : p.emigrationClearanceStatus === "pending" ? "Application in progress on eMigrate"
        : "Required — ECR passport travelling to an ECR country",
      applicable: true, blocking: true,
    }] : []) as DeployItem[]),
    {
      key: "appointment", label: "Appointment letter", owner: "agency",
      status: p.appointmentLetterUrl ? "done" : "pending",
      applicable: hasPlacement, blocking: true,
    },
    {
      // The travel/start date is the OUTCOME of being ready, not a prerequisite,
      // so it's non-blocking (excluded from the readiness denominator).
      key: "travel", label: "Travel / start date", owner: "agency",
      status: p.startDate ? "done" : "pending",
      detail: p.startDate ? new Date(p.startDate).toLocaleDateString("en-IN") : null,
      applicable: hasPlacement, blocking: false,
    },
  ];
}

// readiness 2026-07-16: this legacy summary counted EVERY item — including ones
// that don't apply to the candidate and the non-blocking travel date. So an ECNR
// candidate was scored against PDO + PBBY (ECR-only steps they can never
// complete) and capped at ~78% while computeReadiness()'s ring said 100%. Same
// filter as computeReadiness (applicable && blocking) so the two can't disagree.
export function readinessSummary(items: DeployItem[]) {
  const scored = items.filter((i) => i.applicable && i.blocking);
  const done = scored.filter((i) => i.status === "done").length;
  const actionNeeded = scored.filter((i) => i.status === "action_needed").length;
  return {
    done,
    total: scored.length,
    pct: scored.length ? Math.round((done / scored.length) * 100) : 0,
    actionNeeded,
  };
}

// ── Deployment Readiness (2026-07-07) ────────────────────────────────
// A single, ECR-/placement-aware readiness object driving the ring meter,
// the "Cleared for Deployment" badge, the tiered stepper, and the admin
// fleet view. Scored only over APPLICABLE, BLOCKING items (the travel-date
// step is the goal, not counted). An expired passport (action_needed) keeps
// a candidate out of travel-ready even at 100% of the other items.
export type ReadinessStage =
  | "registered" | "documents" | "compliance" | "deployment" | "travel_ready";

export interface Readiness {
  pct: number;                 // 0-100 across applicable blocking items
  done: number;
  total: number;
  actionNeeded: number;        // blockers + warnings combined (back-compat)
  blockers: number;            // hard problems → red ring (expired passport, visa rejected)
  warnings: number;            // soft problems → amber ring (passport expiring soon)
  pending: { key: string; label: string; owner: "you" | "agency" }[];
  isTravelReady: boolean;      // needs an accepted offer + everything cleared
  isComplianceReady: boolean;  // candidate-level docs done (pre-offer milestone)
  stage: ReadinessStage;
  items: DeployItem[];
}

export function computeReadiness(candidate: any, placement: any, opts?: DeploymentChecklistOpts): Readiness {
  const items = buildDeploymentChecklist(candidate, placement, opts);
  const scored = items.filter((i) => i.applicable && i.blocking);
  const done = scored.filter((i) => i.status === "done").length;
  const total = scored.length;
  const actionItems = scored.filter((i) => i.status === "action_needed");
  const actionNeeded = actionItems.length;
  const warnings = actionItems.filter((i) => i.severity === "warning").length;
  const blockers = actionNeeded - warnings; // hard problems (default when severity absent)
  const pending = scored.filter((i) => i.status !== "done")
    .map((i) => ({ key: i.key, label: i.label, owner: i.owner }));
  const pct = total ? Math.round((done / total) * 100) : 0;

  const p = placement ?? {};
  const hasOffer = !!(p && p.id) && SETTLED_PLACEMENT_STATUSES.includes(String(p.status));
  const allClear = total > 0 && done === total && actionNeeded === 0;
  const isTravelReady = allClear && hasOffer;

  // Candidate-level document compliance (passport valid + PCC + medical, plus
  // PDO/PBBY for ECR) — reachable before any offer exists.
  const candidateDocKeys = ["passport", "pcc", "medical", "pdo", "pbby"];
  const candidateDocs = scored.filter((i) => candidateDocKeys.includes(i.key));
  const isComplianceReady = candidateDocs.length > 0
    && candidateDocs.every((i) => i.status === "done");

  let stage: ReadinessStage = "registered";
  if (isTravelReady) stage = "travel_ready";
  else if (hasOffer) stage = "deployment";
  else if (isComplianceReady) stage = "compliance";
  else if (done > 0) stage = "documents";

  return { pct, done, total, actionNeeded, blockers, warnings, pending, isTravelReady, isComplianceReady, stage, items };
}
