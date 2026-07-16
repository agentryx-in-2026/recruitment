# UAT Test Scripts

Chronological step-by-step test walkthroughs per role. These are the basis for the Agentryx Verify portal's guided walk-through mode.

## Planned Files

- `01_Candidate_UAT.md` — Register → profile → apply → track → receive offer
- `02_Agency_UAT.md` — Register agency → post job → review applicants → schedule drive → shortlist → record interview
- `03_Employer_UAT.md` — Review applications → shortlist → interview → select → issue appointment
- `04_Officer_UAT.md` — Approve agency → approve drive → review grievance → generate report

## Format (per script)

Each script follows this pattern:

```markdown
### Step 1 — {action}
**Pre-condition:** {what should be true before this step}
**Action:** {what tester does}
**Expected:** {what should happen}
**Compliance item:** {ID from 01_FRS_Compliance_Matrix.md}
**Result:** ☐ Pass ☐ Fail ☐ N/A
**Notes:**

```

## Status

These scripts will be drafted once the primary compliance matrix ([01_FRS_Compliance_Matrix.md](../01_FRS_Compliance_Matrix.md)) is signed off by HTIS, so that items referenced by the scripts align with the accepted scope.
