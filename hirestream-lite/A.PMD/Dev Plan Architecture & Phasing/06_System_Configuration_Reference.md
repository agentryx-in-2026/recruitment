# HireStream — System Configuration Reference

**Version:** 1.0 (matches portal v1.5.0)
**Owner:** HPSEDC Admin (runtime mutable)

The HireStream portal ships with **21 runtime-configurable settings** across 8 categories. Admins with role `admin` or `superadmin` change any of them from **Admin Dashboard → System Config** tab. Changes take effect on the very next API request — no deploy required.

Each setting is stored in the `system_settings` table with key, value (jsonb), description, category, `updated_at`, and `updated_by` for audit. Reading is in-memory cached (loaded once per process); writes invalidate the cache instantly.

---

## UAT vs Production: recommended 4-toggle pre-prod checklist

Before the portal goes live at HPSEDC, open System Config and:

1. **Pipeline → Terminal (locked) statuses** → add `placed` and `offer_accepted` chips
2. **Pipeline → Require reason for backward moves** → ON
3. **Rejection → Require reason on rejection** → ON
4. **Lifecycle → Minimum profile completion to apply (%)** → set per HPSEDC policy (typical: 50–80)

That's it. Everything else is either already at a safe production default, or a number to tune based on observed traffic.

---

## The 21 settings

### Category: Pipeline

| Key | Type | UAT default | Prod recommended | What it does |
|---|---|---|---|---|
| `pipeline.allow_backward_transitions` | boolean | true | true | Let recruiters move an application backward without rejecting it |
| `pipeline.require_reason_on_backward` | boolean | false | **true** | Force a short note on backward moves → audit log |
| `pipeline.terminal_states` | string[] | `[]` | `["placed", "offer_accepted"]` | These statuses are locked for regular agents — admin override only |
| `pipeline.undo_window_minutes` | number | 15 | 15 | How long a soft "Undo" toast is available. 0 = disabled |

### Category: Rejection

| Key | Type | UAT | Prod | Effect |
|---|---|---|---|---|
| `rejection.allow_revert` | boolean | true | true | Un-reject is possible within undo window |
| `rejection.require_reason` | boolean | false | **true** | Force recruiter feedback text |

### Category: Access & Gating

| Key | Type | UAT | Prod | Effect |
|---|---|---|---|---|
| `agency.require_verification_to_post` | boolean | true | true | Unverified agents cannot publish jobs |
| `drive.require_admin_approval` | boolean | true | true | Drives require HPSEDC admin approval before going live |
| `agency.max_active_jobs` | number | 0 (unlimited) | *(HPSEDC decides)* | Per-agency cap on concurrently active postings |

### Category: Notifications & SLAs

| Key | Type | UAT | Prod | Effect |
|---|---|---|---|---|
| `notifications.auto_on_status_change` | boolean | true | true | Auto-notify candidate on every status change |
| `interview.reminder_lead_hours` | number | 24 | 24 | Send reminder this many hours before interview (cron) |
| `grievance.escalation_days` | number | 7 | 7 | Grievances unresolved > N days auto-escalated (cron) |

### Category: Matching & Discovery

| Key | Type | UAT | Prod | Effect |
|---|---|---|---|---|
| `matching.recommendation_threshold_pct` | number | 40 | 40–60 | Min match score for job to appear in "Recommended for you" |
| `leaderboard.placement_weight` | number | 10 | 10 | Multiplier on placement count in leaderboard score |
| `leaderboard.rating_weight` | number | 5 | 5 | Multiplier on avg rating in leaderboard score |

### Category: Application Lifecycle

| Key | Type | UAT | Prod | Effect |
|---|---|---|---|---|
| `application.auto_expire_days` | number | 90 | 90 | Applications stale > N days are flagged (needs nightly cron) |
| `application.profile_completion_required_pct` | number | 0 | **50–80** | Candidates below this % blocked from applying |

### Category: File Uploads

| Key | Type | UAT | Prod | Effect |
|---|---|---|---|---|
| `uploads.max_file_size_mb` | number | 5 | 5 | Largest single document upload |

### Category: Security & Sessions

| Key | Type | UAT | Prod | Effect |
|---|---|---|---|---|
| `auth.session_timeout_minutes` | number | 30 | 30 (HTIS T5) | Idle timeout. Read at boot |
| `auth.password_min_length` | number | 8 | 10 (govt policy) | Chars required for new passwords |
| `ratelimit.auth_attempts_per_15min` | number | 5 | 5 | Brute-force throttle per IP |

---

## How to add a new setting (developer notes)

1. Add the spec to `SETTING_SPECS` in [`server/services/settings.service.ts`](../../server/services/settings.service.ts).
2. Consume it anywhere via `await getSetting("your.key.here")`.
3. The admin UI renders it automatically — no frontend change required.
4. Document it here.

---

## Audit trail

Every write to `system_settings` records the user (`updated_by`) and timestamp (`updated_at`). The Admin Ops Console surfaces these in the audit log panel.
