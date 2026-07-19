/**
 * Recruitment pipeline profiles.
 *
 * ── Why a profile and not a second state machine ────────────────────────────
 * HPSEDC phase 1 does not run the marketplace workflow the portal was first
 * built for. Agencies are dormant; HPSEDC act as a single super-agency, receive
 * government job batches, and interview EVERY applicant rather than screening
 * to a shortlist first. So there is no "reviewed" desk-check and no
 * "shortlisted" step — you apply, you are interviewed, you are selected.
 *
 * The tempting move is a parallel pipeline with its own statuses. That would be
 * a mistake: `submitted`/`interview_scheduled`/`selected`/`placed` are
 * referenced in ~53 places across routes, reports, notifications and the
 * document engine, and a second vocabulary would mean touching all of them and
 * keeping two sets in sync forever.
 *
 * A profile instead RESTRICTS the existing vocabulary. Compact uses a subset of
 * the same statuses in the same order, so every existing consumer keeps working
 * untouched, there is no migration, no backfill, and switching back is one
 * setting. What a profile owns is narrow and explicit: which statuses are
 * offered, what they are called, and where documents become due.
 *
 * ── The trap this file exists to close ──────────────────────────────────────
 * Document staging was keyed to the funnel narrowing at `shortlisted`. Remove
 * shortlisting and the narrowing point moves to `selected` — but the deploy
 * stage was written assuming verification ALREADY happened upstream, so it
 * returns only PCC and medical. Wire compact naively and a selected candidate is
 * asked for a police clearance and a medical certificate and never once for
 * their passport or trade certificate. It under-asks in silence, which is the
 * failure mode that costs you a deployment at the airport, not at the desk.
 * Hence `documentsCumulative` — see resolveRequiredDocs.
 */

export type PipelineProfile = "full" | "compact";

export interface PipelineStage {
  /** The application status stored in the DB — NOT a new value. */
  status: string;
  label: string;
  labelHi: string;
}

export interface PipelineDefinition {
  key: PipelineProfile;
  label: string;
  description: string;
  /** Forward order. Terminal states (rejected/withdrawn) are handled separately. */
  stages: PipelineStage[];
  /**
   * The status at which the candidate is asked for documents. Before this
   * point nothing is owed — that IS the 20,000:500 saving, and UAT-05 item 9.
   */
  documentsFrom: string;
  /**
   * When true, reaching `documentsFrom` asks for the verification documents
   * AND the deployment ones together, because the candidate never passed
   * through a separate verify stage that would have collected the first set.
   */
  documentsCumulative: boolean;
}

export const PIPELINES: Record<PipelineProfile, PipelineDefinition> = {
  /**
   * The original marketplace workflow — agencies screen to a shortlist, then
   * interview, then select. Kept intact for when individual agencies are
   * enabled in a later phase.
   */
  full: {
    key: "full",
    label: "Screened — 6 stages",
    description:
      "Applied -> Reviewed -> Shortlisted -> Interview -> Selected -> Placed. Agencies screen to a shortlist before interviewing, and documents are requested from the shortlist onward. For when individual agencies are enabled.",
    stages: [
      { status: "submitted", label: "Applied", labelHi: "आवेदन किया" },
      { status: "reviewed", label: "Reviewed", labelHi: "समीक्षा की गई" },
      { status: "shortlisted", label: "Shortlisted", labelHi: "शॉर्टलिस्ट" },
      { status: "interview_scheduled", label: "Interview", labelHi: "साक्षात्कार" },
      { status: "selected", label: "Selected", labelHi: "चयनित" },
      { status: "placed", label: "Placed", labelHi: "नियुक्त" },
    ],
    // Shortlisting is the narrowing point, so verification starts there and the
    // perishable PCC/medical wait until selection.
    documentsFrom: "shortlisted",
    documentsCumulative: false,
  },

  /**
   * HPSEDC phase 1. Everyone who applies is interviewed; selection happens on
   * the interview. Four stages, no desk review, no shortlist.
   */
  compact: {
    key: "compact",
    label: "Direct — 4 stages",
    description:
      "Applied -> Interview -> Selected -> Placed. Every applicant is interviewed and selection follows the interview, so there is no desk review or shortlist. Documents are requested only from selected candidates. HPSEDC phase 1.",
    stages: [
      { status: "submitted", label: "Applied", labelHi: "आवेदन किया" },
      { status: "interview_scheduled", label: "Interview", labelHi: "साक्षात्कार" },
      { status: "selected", label: "Selected", labelHi: "चयनित" },
      { status: "placed", label: "Placed", labelHi: "नियुक्त" },
    ],
    // Interviews are universal here, so they are NOT a narrowing point and must
    // not trigger a document ask — that would put every applicant through the
    // cost the staging exists to avoid. Selection is the narrow point.
    documentsFrom: "selected",
    documentsCumulative: true,
  },
};

export const DEFAULT_PIPELINE: PipelineProfile = "compact";

export function getPipeline(profile?: string | null): PipelineDefinition {
  return PIPELINES[(profile as PipelineProfile) ?? DEFAULT_PIPELINE] ?? PIPELINES[DEFAULT_PIPELINE];
}

/** Forward-order statuses for a profile, e.g. for progress bars and validation. */
export function stageOrder(profile?: string | null): string[] {
  return getPipeline(profile).stages.map((s) => s.status);
}

/** Human label for a status under the active profile (falls back to the status). */
export function stageLabel(status: string, profile?: string | null, lang = "en"): string {
  const s = getPipeline(profile).stages.find((x) => x.status === status);
  if (!s) return status;
  return lang === "hi" ? s.labelHi : s.label;
}

/**
 * Is this status reachable under the active profile?
 *
 * Terminal states stay valid in every profile — an application can always be
 * rejected or withdrawn, whatever the forward path looks like.
 */
export const TERMINAL_STATUSES = ["rejected", "withdrawn"];

export function isStatusAllowed(status: string, profile?: string | null): boolean {
  return TERMINAL_STATUSES.includes(status) || stageOrder(profile).includes(status);
}

/**
 * Which document stage is due at this status, or null if nothing is owed yet.
 *
 * Returns "deploy" at and after the profile's documentsFrom point; under a
 * cumulative profile the caller must also include the verify set (the
 * `cumulative` flag says so) because no separate verify stage ever ran.
 */
export function documentStageFor(
  status: string | null | undefined,
  profile?: string | null,
): { stage: "verify" | "deploy"; cumulative: boolean } | null {
  if (!status) return null;
  const p = getPipeline(profile);
  const order = stageOrder(profile);
  const at = order.indexOf(status);
  const from = order.indexOf(p.documentsFrom);
  if (at === -1 || from === -1 || at < from) return null;

  if (p.documentsCumulative) {
    // Compact: everything becomes due together at selection.
    return { stage: "deploy", cumulative: true };
  }
  // Full: verify from the shortlist, deploy once selected.
  const deployAt = order.indexOf("selected");
  return at >= deployAt ? { stage: "deploy", cumulative: false } : { stage: "verify", cumulative: false };
}
