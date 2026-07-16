// ── Qualification identity (UAT-03 #5, 2026-07-16) ───────────────────
// Shared by client and server ON PURPOSE. The picker hides qualifications the
// candidate already holds, and the server rejects them with a 409 — if those two
// disagreed even slightly, the form would offer an option that the save then
// refuses. (The readiness engine had exactly that bug: one rule inlined in six
// places, drifted apart, two surfaces reporting different answers.)
//
// Collapses the ways one qualification gets written:
//   "12th", "12th (Science)", "12th  Grade.", "12TH" -> "12th"
// The parenthetical is deliberately dropped — stream/trade/specialisation lives
// in the Subject/Field box, so "12th (Science)" and "12th (Arts)" are the same
// qualification held once, not two entries.
//
// SCOPE: exact-match-after-normalising, by design (agreed 2026-07-16). It catches
// the picker's canonical values and near-misses in typed ones, but NOT semantic
// duplicates — "First Aid Training" vs "Basic First Aid Workshop" are different
// strings and both will save. Closing that needs fuzzy/AI matching, which is
// Phase II. Don't bolt more regexes on here chasing it; the rules get unreadable
// and still lose. Free-typed courses are where this leaks.
export function normalizeQualification(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(grade|class|std|standard|course|certificate|certification|diploma in)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
