# B7: Admin & Operations Module Standard
> **Template Version:** 1.0 | **Created By:** Solution Architect
> **Purpose:** Every application MUST include this module. It provides runtime configurability, log monitoring, and system observability through the application UI — eliminating the need for terminal access during daily operations.
> **Status:** MANDATORY — Include in every project's A3 Module Breakdown.

---

## 1. Module Purpose

The Admin & Operations Module is a **standard, reusable module** included in every application built under this pipeline. It provides:

1. **Runtime Configuration** — Change application behavior without redeployment
2. **Log Visualization** — Monitor server and application logs through the UI
3. **Dynamic Log Level Control** — Adjust logging verbosity from the UI
4. **System Health Monitoring** — View server resources, service status, and alerts
5. **User & Role Management** — Manage application users and their permissions

> *The goal: once deployed, the admin should NEVER need to SSH into the server for routine monitoring and configuration. The UI handles it.*

---

## 2. Access Control

### 2.1 Role Hierarchy
| Role | Access Level | Configuration | Logs | Monitoring | User Mgmt |
|------|-------------|--------------|------|-----------|-----------|
| **Super Admin** | Full system access | ✅ All variables | ✅ Server + App logs | ✅ Full system metrics | ✅ Create/edit/delete all users |
| **Admin** | Application management | ✅ App variables only | ✅ App logs only | ✅ App health only | ✅ Manage non-admin users |
| **Operator** (optional) | Monitoring only | ❌ View only | ✅ App logs (read-only) | ✅ View only | ❌ No access |

### 2.2 Super Admin Bootstrap
> *Every application must seed at least one Super Admin on first deployment.*

```
On first run:
1. Check if any Super Admin exists in database
2. If none → create default Super Admin from environment variables:
   - SUPER_ADMIN_EMAIL (from .env)
   - SUPER_ADMIN_PASSWORD (from .env, hashed with bcrypt)
3. Log: "Super Admin seeded: {email}"
4. Force password change on first login
```

---

## 3. Configuration Management (Feature: Config Panel)

### 3.1 Configuration Categories

Every application has configurable parameters organized into categories:

| Category | Scope | Examples | Restart Required? |
|----------|-------|---------|-------------------|
| **Application Settings** | App behavior | Site name, maintenance mode, default language, pagination size, session timeout | No — applied immediately |
| **Feature Flags** | Enable/disable features | Enable registration, enable notifications, enable AI features, maintenance mode | No — applied immediately |
| **Integration Settings** | External service config | SMTP host/port, SMS gateway URL, API keys (masked), webhook URLs | No — applied on next use |
| **Security Settings** | Auth & access | Rate limit thresholds, session duration, password policy, max login attempts | No — applied immediately |
| **Display Settings** | UI customization | Logo URL, theme colors, announcement banner text, footer text | No — applied immediately |

### 3.2 Configuration Data Model

```
config_settings table:
  id:           UUID (PK)
  category:     TEXT ('application' | 'feature_flag' | 'integration' | 'security' | 'display')
  key:          TEXT (unique, e.g. 'app.site_name', 'feature.enable_registration')
  value:        TEXT (stored as string, typed on retrieval)
  value_type:   TEXT ('string' | 'number' | 'boolean' | 'json')
  label:        TEXT (human-readable label for UI, e.g. 'Site Name')
  description:  TEXT (tooltip/help text)
  is_sensitive:  BOOLEAN (if true, mask in UI — e.g. API keys)
  is_readonly:  BOOLEAN (if true, cannot be changed via UI — only via .env)
  default_value: TEXT (factory default)
  updated_by:   UUID (FK → users)
  updated_at:   TIMESTAMP
```

### 3.3 Configuration UI Requirements

| Element | Specification |
|---------|--------------|
| **Layout** | Tabbed interface — one tab per category |
| **Edit** | Inline edit with save button per field, or bulk save per category |
| **Validation** | Client-side + server-side. Type-appropriate inputs (toggle for boolean, number input for numbers, etc.) |
| **Sensitive Values** | Display as `••••••••` with "Show" toggle. Require re-authentication to view/edit. |
| **Change History** | Log every config change: who, when, old value, new value → `config_audit_log` table |
| **Reset to Default** | Button per field to revert to `default_value` |
| **Search** | Filter/search across all config keys |
| **Export/Import** | Export current config as JSON. Import config JSON for environment migration. |

### 3.4 Configuration API

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| GET | `/api/v1/admin/config` | List all config (respect sensitivity masking) | Super Admin / Admin |
| GET | `/api/v1/admin/config/:category` | List config by category | Super Admin / Admin |
| PATCH | `/api/v1/admin/config/:key` | Update single config value | Super Admin (all) / Admin (app only) |
| POST | `/api/v1/admin/config/bulk` | Bulk update multiple config values | Super Admin |
| GET | `/api/v1/admin/config/export` | Export all config as JSON | Super Admin |
| POST | `/api/v1/admin/config/import` | Import config from JSON | Super Admin |
| GET | `/api/v1/admin/config/audit` | Config change history | Super Admin |

### 3.5 Config ↔ Environment Variable Priority

```
Priority (highest to lowest):
1. Environment variable (.env)     ← OVERRIDES everything (for secrets, deploy-specific)
2. Database config_settings value  ← Configurable via UI
3. default_value in config_settings ← Factory default
4. Hardcoded fallback in code      ← Last resort
```

> *Sensitive values (API keys, DB passwords) should ONLY come from .env — never stored in database. The config_settings table stores application-level config, not infrastructure secrets.*

---

## 4. Log Visualization (Feature: Log Viewer)

### 4.1 Log Types

The application produces two distinct log streams:

| Log Type | What It Captures | Source | Update Frequency |
|----------|-----------------|--------|-----------------|
| **Server Logs** | Infrastructure health — service status, PM2 worker state, Nginx access, PostgreSQL connection status, Redis connectivity, disk/memory/CPU usage | System + PM2 + service checks | On-demand (not streaming) |
| **Application Logs** | Business logic events — API requests, authentication events, errors, background job status, user actions, query performance | Winston/Pino logger in application code | On-demand (not streaming) |

### 4.2 Log Levels

| Level | Numeric | When Used | Color in UI | Default State |
|-------|---------|-----------|------------|--------------|
| **ERROR** | 0 | Unhandled exceptions, failed operations, integration failures | 🔴 Red | Always logged |
| **WARN** | 1 | Deprecation warnings, approaching rate limits, slow queries (>500ms) | 🟡 Yellow | Always logged |
| **INFO** | 2 | Normal operations — API requests, login events, config changes, CRUD operations | 🔵 Blue | Logged (production default) |
| **HTTP** | 3 | HTTP request/response details — method, URL, status code, response time | ⚪ Gray | Logged |
| **DEBUG** | 4 | Detailed diagnostic — variable values, query parameters, processing steps | 🟣 Purple | OFF in production |

### 4.3 Log Data Model

```
application_logs table:
  id:          UUID (PK)
  timestamp:   TIMESTAMP WITH TIMEZONE
  level:       TEXT ('error' | 'warn' | 'info' | 'http' | 'debug')
  category:    TEXT ('auth' | 'api' | 'job' | 'db' | 'integration' | 'system' | 'config')
  message:     TEXT
  metadata:    JSONB (request ID, user ID, endpoint, duration, error stack, etc.)
  source:      TEXT (file/module that generated the log)
  request_id:  TEXT (correlates all logs from a single request)
  user_id:     UUID (FK → users, nullable — for tracking who triggered the action)
  ip_address:  TEXT
  created_at:  TIMESTAMP (auto, indexed)
```

> **Important:** Logs are NOT streamed in real-time. The UI fetches logs on-demand when the admin opens the log viewer. This avoids WebSocket overhead and keeps it simple. A "Refresh" button and optional auto-refresh interval (every 10s/30s/60s) handles live monitoring needs.

### 4.4 Log Viewer UI Requirements

| Element | Specification |
|---------|--------------|
| **Two Tabs** | "Server Logs" and "Application Logs" |
| **Filter Bar** | Filter by: level, category, date range, user, search text |
| **Log Level Toggle** | Dropdown or checkbox group to show/hide levels (e.g. show only ERROR + WARN) |
| **Time Range** | Quick selectors: Last 15 min, 1 hour, 6 hours, 24 hours, 7 days, Custom range |
| **Search** | Full-text search within log messages |
| **Log Row Display** | `[TIMESTAMP] [LEVEL] [CATEGORY] Message` — click to expand and see full metadata (JSON) |
| **Color Coding** | Each level has a distinct color (see §4.2) |
| **Pagination** | Load 100 logs at a time with infinite scroll or pagination |
| **Export** | Download filtered logs as JSON or CSV |
| **Auto-Refresh** | Toggle: Off / 10s / 30s / 60s — refreshes the current view |
| **Clear Old Logs** | Super Admin can purge logs older than X days |

### 4.5 Log Viewer — Server Logs Tab

Server logs are NOT stored in the database — they're read on-demand from system sources:

| Check | Source | How Retrieved | Display |
|-------|--------|-------------|---------|
| **PM2 Worker Status** | `pm2 jlist` (JSON) | Execute command via child_process | Table: worker ID, status, CPU, memory, uptime, restarts |
| **Nginx Status** | `systemctl status nginx` + access log tail | Execute command + read last N lines from access log | Status badge + recent requests |
| **PostgreSQL Status** | `SELECT 1` health query + `pg_stat_activity` | Database query | Connection count, active queries, uptime |
| **Redis Status** | `redis-cli ping` + `redis-cli info memory` | Execute command | Status, memory used, connected clients |
| **Disk Usage** | `df -h /data` | Execute command | Used / Total / Percentage |
| **Memory Usage** | `free -m` | Execute command | Used / Total / Percentage |
| **CPU Usage** | `os.loadavg()` | Node.js os module | Load average (1m, 5m, 15m) |

### 4.6 Log API

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| GET | `/api/v1/admin/logs` | Query application logs (with filters) | Super Admin / Admin |
| GET | `/api/v1/admin/logs/server` | Get server status snapshot | Super Admin |
| GET | `/api/v1/admin/logs/level` | Get current log level | Super Admin / Admin |
| PATCH | `/api/v1/admin/logs/level` | Change active log level | Super Admin |
| DELETE | `/api/v1/admin/logs?before={date}` | Purge logs older than date | Super Admin |
| GET | `/api/v1/admin/logs/export` | Export filtered logs as JSON/CSV | Super Admin |

---

## 5. Dynamic Log Level Control (Feature: Log Level Manager)

### 5.1 How It Works

```
UI: Admin selects new log level from dropdown (e.g. DEBUG)
     │
     ▼
API: PATCH /api/v1/admin/logs/level  { "level": "debug" }
     │
     ▼
Server: Winston/Pino logger.level = 'debug'
        ↳ Takes effect IMMEDIATELY — no restart needed
        ↳ Log config change to audit: "Log level changed to DEBUG by admin@email"
     │
     ▼
UI: Confirmation toast: "Log level changed to DEBUG. More detailed logs will now be captured."
```

### 5.2 UI Controls
| Control | Specification |
|---------|--------------|
| **Current Level Display** | Badge showing current level with color |
| **Level Selector** | Dropdown: ERROR → WARN → INFO → HTTP → DEBUG |
| **Warning for DEBUG** | Show warning: "DEBUG level generates high log volume. Recommended for troubleshooting only. Consider reverting after diagnosis." |
| **Auto-Revert** | Optional: "Revert to INFO after X minutes" timer to prevent leaving DEBUG on accidentally |
| **Per-Category Override** | Advanced: set different log levels per category (e.g. `auth=debug, api=info, db=warn`) |

---

## 6. System Health Dashboard (Feature: Health Monitor)

### 6.1 Health Overview Card

A single-glance dashboard card showing system health:

```
┌─────────────────────────────────────────────────────────────┐
│  SYSTEM HEALTH                                    ● ONLINE  │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ App      │  │ Database │  │ Redis    │  │ Nginx    │    │
│  │ ● Online │  │ ● Online │  │ ● Online │  │ ● Online │    │
│  │ 6 workers│  │ 12 conns │  │ 45MB     │  │ Active   │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│                                                              │
│  CPU: ████░░░░░░ 38%    RAM: ██████░░░░ 62%                 │
│  Disk: ███░░░░░░░ 28%   Uptime: 14d 6h 23m                 │
│                                                              │
│  Last backup: 2 hours ago    SSL expires: 58 days           │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Health API

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| GET | `/api/v1/admin/health` | Full system health snapshot | Super Admin |
| GET | `/api/v1/health` | Simple health check (for uptime monitors) | Public (returns 200 OK or 503) |

### 6.3 Health Response Schema
```json
{
  "status": "healthy | degraded | unhealthy",
  "timestamp": "ISO-8601",
  "uptime": "14d 6h 23m",
  "services": {
    "application": { "status": "up", "workers": 6, "activeWorkers": 6, "memory": "1.2GB" },
    "database": { "status": "up", "connections": 12, "maxConnections": 100, "responseTime": "2ms" },
    "redis": { "status": "up", "memory": "45MB", "connectedClients": 6 },
    "nginx": { "status": "up" }
  },
  "system": {
    "cpu": { "loadAvg1m": 0.38, "loadAvg5m": 0.42, "cores": 8 },
    "memory": { "used": "14.8GB", "total": "24GB", "percentage": 62 },
    "disk": { "used": "142GB", "total": "512GB", "percentage": 28 }
  },
  "lastBackup": "ISO-8601",
  "sslExpiresAt": "ISO-8601"
}
```

---

## 7. User & Role Management (Feature: User Manager)

### 7.1 Capabilities
| Action | Super Admin | Admin |
|--------|------------|-------|
| View all users | ✅ | ✅ (non-admin only) |
| Create user | ✅ All roles | ✅ Non-admin roles only |
| Edit user profile | ✅ | ✅ (non-admin only) |
| Change user role | ✅ | ❌ |
| Activate/deactivate user | ✅ | ✅ (non-admin only) |
| Reset user password | ✅ | ✅ (non-admin only) |
| Delete user | ✅ (soft delete) | ❌ |
| View user activity log | ✅ | ✅ |

### 7.2 User Management API
| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| GET | `/api/v1/admin/users` | List all users (paginated, filterable) | Super Admin / Admin |
| GET | `/api/v1/admin/users/:id` | Get user details | Super Admin / Admin |
| POST | `/api/v1/admin/users` | Create user | Super Admin / Admin |
| PATCH | `/api/v1/admin/users/:id` | Update user details/role/status | Super Admin / Admin (restricted) |
| DELETE | `/api/v1/admin/users/:id` | Soft-delete user | Super Admin |
| POST | `/api/v1/admin/users/:id/reset-password` | Force password reset | Super Admin / Admin |

---

## 8. Audit Trail

> *Every administrative action must be logged for accountability.*

### 8.1 Audit Log Data Model
```
audit_log table:
  id:          UUID (PK)
  timestamp:   TIMESTAMP WITH TIMEZONE
  user_id:     UUID (FK → users — who performed the action)
  action:      TEXT ('config.update' | 'user.create' | 'user.delete' | 'log_level.change' | etc.)
  resource:    TEXT (what was affected — table name, config key, user ID)
  old_value:   JSONB (previous state)
  new_value:   JSONB (new state)
  ip_address:  TEXT
  user_agent:  TEXT
```

### 8.2 Audit API
| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| GET | `/api/v1/admin/audit` | Query audit log (with filters) | Super Admin |

---

## 9. Implementation Checklist

> *When implementing this module for a project, check off each component:*

| # | Component | Priority | Status |
|---|-----------|----------|--------|
| 1 | Super Admin seeding on first run | P0 | ☐ |
| 2 | Config settings table + CRUD API | P0 | ☐ |
| 3 | Config settings UI (tabbed, with search) | P0 | ☐ |
| 4 | Application log table + logging middleware | P0 | ☐ |
| 5 | Application log viewer UI (filters, search, color-coded) | P0 | ☐ |
| 6 | Server status API (PM2, PG, Redis, disk, memory, CPU) | P1 | ☐ |
| 7 | Server logs tab in log viewer UI | P1 | ☐ |
| 8 | Dynamic log level control (API + UI) | P1 | ☐ |
| 9 | Health dashboard card | P1 | ☐ |
| 10 | User management CRUD + UI | P0 | ☐ |
| 11 | Audit trail logging + viewer | P1 | ☐ |
| 12 | Config export/import | P2 | ☐ |
| 13 | Log export (JSON/CSV) | P2 | ☐ |
| 14 | Auto-revert log level timer | P2 | ☐ |

---

## 10. Database Tables Summary

This module adds the following tables to every project:

| Table | Purpose | Rows Estimate |
|-------|---------|--------------|
| `config_settings` | Application configuration key-value store | 20-100 rows (static) |
| `config_audit_log` | Config change history | Grows slowly (admin changes) |
| `application_logs` | Application event logs | Grows fast — needs retention policy |
| `audit_log` | Admin action trail | Grows moderately |

### Retention Policy
| Table | Default Retention | Configurable Via |
|-------|------------------|-----------------|
| `application_logs` | 30 days | Config: `logs.retention_days` |
| `config_audit_log` | 1 year | Config: `audit.retention_days` |
| `audit_log` | 1 year | Config: `audit.retention_days` |

---

## 11. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {YYYY-MM-DD} | | Initial template |

---

> *This module is NOT optional. Every application in the pipeline includes it as a standard module in A3 (Module Breakdown). It is the foundation of operational visibility and runtime flexibility.*
