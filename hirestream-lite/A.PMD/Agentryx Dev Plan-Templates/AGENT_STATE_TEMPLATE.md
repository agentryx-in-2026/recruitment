# AGENT_STATE — {Project Name}

<!--
PURPOSE: This document is the AI agent's memory. It is the SINGLE SOURCE OF TRUTH
for project state. When context is lost (new conversation, session timeout, agent switch),
reading this file restores full project awareness.

USAGE:
1. AI agent reads this file FIRST at the start of every conversation
2. After every major development milestone, this file is updated
3. Humans do NOT need to read this — if a human wants status, ask the AI to
   summarize from this document

UPDATE TRIGGERS:
- Module completed and tested → update COMPLETED section
- Architecture decision made → update DECISIONS section
- New files created → update FILE MAP
- Phase gate passed → update CURRENT STATE
- Blocker encountered or resolved → update BLOCKERS section

NEVER DELETE COMPLETED ITEMS — they are the project's memory.
-->

---

## IDENTITY

```yaml
project_name: "{Project Name}"
project_code: "{PROJ-XXX}"
client: "{Client Organization}"
repo_path: "{/absolute/path/to/project}"
domain_staging: "{staging.domain.dev}"
domain_production: "{domain.gov.in}"
created: "YYYY-MM-DD"
last_updated: "YYYY-MM-DD HH:MM"
updated_by: "{agent/human}"
```

---

## TECH STACK

```yaml
language: TypeScript
frontend: React 18 + Vite + shadcn/ui
backend: Express.js + Drizzle ORM
database: PostgreSQL 16 (local)
cache: Redis 7 (sessions, BullMQ, rate limiting)
auth: Passport.js + express-session + connect-redis
pdf: Puppeteer (headless Chromium)
process_manager: PM2 (cluster mode, 4-6 workers)
web_server: Nginx (reverse proxy + SSL)
logging: Winston (structured JSON, dynamic levels)
testing: Jest + Supertest + Playwright
build: Vite (frontend) + esbuild (backend)
```

---

## CURRENT STATE

```yaml
overall_completion: "X%"
current_phase: "Phase X of Y — {Phase Name}"
current_sprint: "Sprint X"
status: "On Track | At Risk | Blocked"
last_milestone: "{Phase X Gate — PASSED on YYYY-MM-DD}"
next_milestone: "{Phase Y Gate — target YYYY-MM-DD}"
blockers: "None | {description}"
```

---

## COMPLETED (verified, tested, deployed)

<!--
List every completed item with:
- Module ID from A3
- What was built (key files)
- Test status
- Date completed
Only mark items here AFTER they are fully tested and working.
-->

### Infrastructure (M0)
```yaml
status: COMPLETE
completed: "YYYY-MM-DD"
items:
  - security_middleware: # helmet, CORS, rate limiting
      files: [server/middleware/security.ts]
      tested: true
  - error_handler:
      files: [server/middleware/errorHandler.ts]
      tested: true
  - logging:
      files: [server/config/logger.ts]
      level: "info" # current production log level
      tested: true
  - health_check:
      endpoint: "GET /api/v1/health"
      files: [server/routes/health.ts]
      tested: true
```

### Authentication (M-AUTH)
```yaml
status: COMPLETE | IN_PROGRESS | NOT_STARTED
completed: "YYYY-MM-DD"
items:
  - registration:
      endpoint: "POST /api/v1/auth/register"
      files: [server/routes/auth.ts, client/src/pages/Register.tsx]
      validation: "Zod schema — email, password (8+ chars), name"
      tested: true
  - login:
      endpoint: "POST /api/v1/auth/login"
      files: [server/routes/auth.ts, client/src/pages/Login.tsx]
      tested: true
  - session_management:
      store: "Redis via connect-redis"
      timeout: "60 minutes (configurable via admin)"
      tested: true
  - rbac:
      roles: [super_admin, admin, agency, candidate]
      middleware: server/middleware/rbac.ts
      tested: true
```

### Admin & Operations (M-ADMIN)
```yaml
status: COMPLETE | IN_PROGRESS | NOT_STARTED
items:
  - config_management:
      status: COMPLETE | NOT_STARTED
      endpoints: [GET /api/v1/admin/config, PATCH /api/v1/admin/config/:key]
      ui: client/src/pages/admin/ConfigPanel.tsx
  - log_viewer:
      status: COMPLETE | NOT_STARTED
      endpoints: [GET /api/v1/admin/logs, GET /api/v1/admin/logs/server]
      ui: client/src/pages/admin/LogViewer.tsx
  - health_dashboard:
      status: COMPLETE | NOT_STARTED
      endpoint: GET /api/v1/admin/health
      ui: client/src/pages/admin/HealthDashboard.tsx
  - user_management:
      status: COMPLETE | NOT_STARTED
      endpoints: [GET/POST/PATCH/DELETE /api/v1/admin/users]
      ui: client/src/pages/admin/UserManagement.tsx
  - audit_trail:
      status: COMPLETE | NOT_STARTED
      table: audit_log
```

### {Module M1}: {Name}
```yaml
status: COMPLETE | IN_PROGRESS | NOT_STARTED
completed: "YYYY-MM-DD"
items:
  - feature_1:
      endpoint: "METHOD /api/v1/resource"
      files: [server/routes/resource.ts, client/src/pages/Resource.tsx]
      tested: true
```

<!-- Repeat for every module in A3. Keep adding as modules are completed. -->

---

## IN PROGRESS

<!--
What is currently being worked on RIGHT NOW.
When work is completed -> move to COMPLETED section.
-->

```yaml
active_work:
  - module: "M2 — {Module Name}"
    completion: "60%"
    working_on: "{Specific task — e.g., application matching API}"
    blocked_by: "None | {blocker description}"
    files_modified:
      - server/routes/applications.ts
      - client/src/pages/Applications.tsx
    next_step: "{What to do next — e.g., add filter by status}"
    
  - module: "M-ADMIN.2 — Log Viewer"
    completion: "30%"
    working_on: "Server status API"
    blocked_by: "None"
```

---

## NOT STARTED

<!--
Modules from A3 that haven't been touched yet.
Remove from here and add to IN PROGRESS when work begins.
-->

```yaml
remaining:
  - module: "M3 — {Name}"
    phase: 2
    depends_on: [M1, M2]
    estimated_effort: "X days"
    
  - module: "M4 — {Name}"
    phase: 3
    depends_on: [M-AUTH]
    estimated_effort: "X days"
```

---

## KEY DECISIONS (DO NOT REVERSE WITHOUT EXPLICIT DISCUSSION)

<!--
Critical architecture and design decisions that were debated and finalized.
AI agents: DO NOT suggest alternatives to these. They were decided for documented reasons.
If a human asks to reconsider, that's fine — but the AI should not independently propose changes.
-->

```yaml
decisions:
  - id: "DEC-001"
    decision: "{e.g., Use Puppeteer for PDF generation, not pdf-lib}"
    date: "YYYY-MM-DD"
    rationale: "{Why — e.g., HTML/CSS template reuse, branded output, 3-5x faster dev. 300MB RAM is negligible on 32GB machine}"
    alternatives_rejected: ["{pdf-lib — manual layout, slower to develop}"]
    
  - id: "DEC-002"
    decision: "{e.g., Use Redis for sessions, not PostgreSQL}"
    date: "YYYY-MM-DD"
    rationale: "{Sub-ms lookups, shared rate limiting across PM2 workers, BullMQ job queue, pub/sub for notifications}"
    alternatives_rejected: ["{connect-pg-simple — adequate but misses queue/pubsub/cache}"]

  - id: "DEC-003"
    decision: "{e.g., Single-VM all-in-one architecture}"
    date: "YYYY-MM-DD"
    rationale: "{Matches HP Tourism pattern, simpler ops, 8 CPU + 24-32GB is sufficient}"
    alternatives_rejected: ["{Separate App + DB VMs — unnecessary at this scale}"]
```

---

## DATABASE STATE

```yaml
orm: Drizzle
schema_file: "shared/schema.ts"
migration_tool: "drizzle-kit"
tables_total: 0
tables:
  - name: users
    status: CREATED | MIGRATED | HAS_DATA
    columns: [id, email, password_hash, name, role, ...]
    
  - name: config_settings
    status: CREATED | NOT_CREATED
    
  - name: application_logs
    status: CREATED | NOT_CREATED

# Add every table from the schema as it's created
```

---

## FILE MAP

<!--
Key file locations. AI agents use this to navigate the codebase
without searching. Update as new files are created.
-->

```yaml
project_root: "{/absolute/path/to/project}"

config:
  env: ".env"
  env_example: ".env.example"
  package_json: "package.json"
  tsconfig: "tsconfig.json"
  drizzle_config: "drizzle.config.ts"
  vite_config: "vite.config.ts"
  pm2_config: "ecosystem.config.cjs"
  nginx_config: "/etc/nginx/sites-available/{project}"

schema:
  database: "shared/schema.ts"
  validators: "shared/validators/"

backend:
  entry: "server/index.ts"
  routes: "server/routes/"
  middleware: "server/middleware/"
  services: "server/services/"
  config: "server/config/"

frontend:
  entry: "client/src/main.tsx"
  app: "client/src/App.tsx"
  pages: "client/src/pages/"
  components: "client/src/components/"
  hooks: "client/src/hooks/"
  styles: "client/src/index.css"

tests:
  unit: "tests/unit/"
  integration: "tests/integration/"
  e2e: "tests/e2e/"

docs:
  planning: "A.PMD/Agentryx Dev Plan/A.Project Scope/"
  delivery: "A.PMD/Agentryx Dev Plan/B.Standard Scope/"
  project_mgmt: "A.PMD/Agentryx Dev Plan/P.Project Management/"
  hw_resources: "A.PMD/HW Resources/"
  frs: "A.PMD/FRS/"

data:
  uploads: "/data/uploads/"
  backups: "/data/backups/"
  logs: "/var/log/{project}/"
```

---

## ENVIRONMENT

```yaml
development:
  node_version: "20.x"
  database_url: "postgresql://user:pass@localhost:5432/dbname"
  redis_url: "redis://localhost:6379"
  port: 5000
  log_level: "debug"

staging:
  vm_ip: "{IP}"
  domain: "{staging.domain.dev}"
  database: "local PostgreSQL"
  redis: "local Redis"
  ssl: "Let's Encrypt via Certbot"
  pm2_workers: 4

production:
  vm_ip: "{IP}"
  domain: "{domain.gov.in}"
  database: "local PostgreSQL"
  redis: "local Redis"
  ssl: "Let's Encrypt via Certbot"
  pm2_workers: 6
```

---

## INTEGRATIONS STATUS

```yaml
integrations:
  - name: "HIM Access SSO"
    status: "PENDING_CREDENTIALS | HAVE_CREDENTIALS | IMPLEMENTED | TESTED"
    fallback: "{email/OTP auth}"
    blocker: "{Credentials not received from client}"
    
  - name: "SMS Gateway (NIC/CDAC)"
    status: "PENDING_CREDENTIALS"
    fallback: "{Email notifications only}"
    
  - name: "Aadhaar/UIDAI"
    status: "PENDING_CREDENTIALS"
    fallback: "{Manual identity upload}"
    
  - name: "SMTP (Email)"
    status: "CONFIGURED | NOT_CONFIGURED"
    provider: "{NIC relay / CDAC / custom}"
```

---

## KNOWN ISSUES & WORKAROUNDS

```yaml
issues:
  - id: "ISS-001"
    description: "{Description of the issue}"
    severity: "Critical | Major | Minor"
    workaround: "{Current workaround if any}"
    fix_planned: "Phase X | Backlog"
    
  # Remove issues when fixed. Add a note in COMPLETED section.
```

---

## BLOCKERS (ACTIVE)

```yaml
blockers:
  - id: "BLK-001"
    description: "{What is blocked}"
    blocking: ["M2", "M4"]  # which modules are affected
    waiting_on: "{Who/what — e.g., Client IT to provide API key}"
    since: "YYYY-MM-DD"
    escalated: true | false
    
  # When resolved: remove from here, note resolution in COMPLETED section
  # If no blockers: blockers: []
```

---

## WHAT TO DO NEXT

<!--
Ordered list of what the AI agent should work on in the next session.
This is the "resume from here" instruction.
-->

```yaml
next_actions:
  - priority: 1
    action: "{e.g., Implement M2 Job Management — CRUD endpoints + UI}"
    module: "M2"
    reference: "A5_PRD_Phase2.md — Section 2.1"
    prereqs_met: true
    
  - priority: 2
    action: "{e.g., Build Log Viewer UI for M-ADMIN.2}"
    module: "M-ADMIN.2"
    reference: "B7 — Section 4"
    prereqs_met: true
    
  - priority: 3
    action: "{e.g., Set up BullMQ for async email/SMS}"
    module: "M0"
    reference: "A2 — Architecture Decision DEC-002"
    prereqs_met: true
```

---

## CHANGE LOG

<!--
Append-only log. Every update to this AGENT_STATE is recorded here.
Most recent entries at the TOP.
-->

```yaml
changes:
  - date: "YYYY-MM-DD HH:MM"
    by: "agent | human"
    summary: "What changed in this update"
    modules_affected: ["M-AUTH", "M1"]
    
  - date: "YYYY-MM-DD HH:MM"
    by: "agent"
    summary: "Initial AGENT_STATE created. Project at 0% — infrastructure setup phase."
    modules_affected: []
```

---

<!--
INSTRUCTIONS FOR AI AGENTS:

1. READ this file at the start of EVERY conversation about this project.
2. DO NOT suggest changing anything in the DECISIONS section without human request.
3. When completing work:
   a. Move items from IN_PROGRESS → COMPLETED
   b. Update CURRENT STATE percentages
   c. Update FILE MAP with new files
   d. Update DATABASE STATE with new tables
   e. Add entry to CHANGE LOG
   f. Update WHAT TO DO NEXT
4. When encountering a blocker:
   a. Add to BLOCKERS section
   b. Note which modules are affected
   c. Suggest workaround if possible
5. This file uses YAML code blocks for machine-parseable sections.
   Maintain this format — do not convert to tables or prose.
6. If a human asks "where are we?" — read this file and summarize.
7. If a human asks for a status report — read this file and generate P2 format.
-->
