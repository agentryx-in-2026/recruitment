# HireStream — Verification & UAT

**Purpose:** Formal scope verification and user acceptance testing (UAT) for the HireStream Overseas Placement Portal delivered by Agentryx to HTIS and HPSEDC.

**Source of truth:** `A.PMD/FRS/FRS.txt` + `A.PMD/FRS/Functional_Requirements_Specifications__HPSEDC_.pdf`

---

## Document Set

| # | Document | Purpose | Audience |
|---|----------|---------|----------|
| 1 | [01_FRS_Compliance_Matrix.md](01_FRS_Compliance_Matrix.md) | Primary scope-to-delivery traceability — every FRS requirement mapped to current build status | Agentryx · HTIS · HPSEDC |
| 2 | [02_UAT_Test_Scripts/](02_UAT_Test_Scripts/) | Step-by-step test walkthroughs per role | UAT testers |
| 3 | [03_Sign_Off_Register.md](03_Sign_Off_Register.md) | Formal sign-off log with timestamps | All parties |
| 4 | [04_Issues_Log.md](04_Issues_Log.md) | Defects found during verification with resolution tracking | All parties |
| 5 | [05_Beyond_FRS_Extras.md](05_Beyond_FRS_Extras.md) | Features delivered **over and above** the FRS — "20% beyond" value-add | Agentryx · HPSEDC |

---

## How to Use

### For HTIS reviewers (first-pass verification)
1. Read `01_FRS_Compliance_Matrix.md` — executive summary first, then scan sections of interest
2. For items marked ✅ Done — verify using the `Try It` references
3. For items marked 🟡 Partial — read the explanation; raise concern if unacceptable
4. For items marked ⛔ Blocked — note the external dependency required
5. Log findings in `04_Issues_Log.md` with item ID reference
6. Sign off in `03_Sign_Off_Register.md` once satisfied per section

### For HPSEDC (acceptance testing)
1. Use `02_UAT_Test_Scripts/` — chronological test flows per role
2. Mark each step Pass / Fail / N/A with optional comment
3. Final acceptance via `03_Sign_Off_Register.md`

### For Agentryx (dev team)
1. Keep `01_FRS_Compliance_Matrix.md` in sync with code changes
2. Update item status as features ship or are deprecated
3. Resolve issues logged in `04_Issues_Log.md` and mark them closed

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ Done | Feature implemented and available for verification |
| 🟡 Partial | Feature implemented with known gaps/limitations (noted per item) |
| ❌ Missing | Required by FRS but not implemented |
| ⛔ Blocked on external | Implementation ready (stub) but requires external credentials/partnership to activate |
| ⭐ Beyond FRS | Delivered beyond original scope — see `05_Beyond_FRS_Extras.md` |

---

## Sign-off Levels

Each verification item has three independent acceptance columns:

1. **HTIS** — Main contractor review (technical correctness, FRS adherence)
2. **HPSEDC Staging** — Government staging-environment verification
3. **HPSEDC Final** — Production acceptance and formal sign-off

An item is considered fully accepted only when **all three** columns are marked ✅.

---

## Web Portal (Planned)

This Markdown doc set is the **content spec**. A live web portal **Agentryx Verify** (deployed at `verify.agentryx.dev`) will expose the same content as an interactive checklist with:
- Progress bars per level
- Try-It-Live deep links to each feature
- Threaded comments
- PDF/CSV export for formal records
- Magic-link access (no login required for reviewers)

Until that portal is live, use these Markdown documents as the source of truth and log findings directly here.

---

## Version

| Field | Value |
|-------|-------|
| Document version | 1.0 |
| Corresponding build | HireStream v1.4.0 |
| Created | 2026-04-14 |
| Owner | Subhash Thakur (Agentryx) |
