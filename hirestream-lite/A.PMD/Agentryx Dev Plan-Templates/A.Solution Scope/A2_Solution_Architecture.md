# A2: Solution Architecture — {Project Name}
> **Template Version:** 2.0 | **Created By:** Solution Architect
> **Status:** Draft | **Date:** {YYYY-MM-DD}
> **Depends On:** A0 (Source Analysis), A1 (Solution Brief)

---

## 1. Architecture Style

| Field | Decision |
|-------|---------|
| **Architecture Type** | {Monolithic / Microservices / Serverless / Modular Monolith} |
| **Deployment Model** | {Single VM / Multi-VM / Containerized / Cloud-native} |
| **API Style** | {REST / GraphQL / gRPC / Hybrid} |
| **Rendering** | {SPA (CSR) / SSR / SSG / Hybrid} |
| **Rationale** | {Why this architecture fits this project} |

---

## 2. Technology Stack

> *Lock in technology choices. All module work (A3-A5) must use this stack.*

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| **Language** | {e.g. TypeScript} | {5.x} | {Type safety, full-stack consistency} |
| **Frontend** | {e.g. React} | {18.x} | {Component model, ecosystem} |
| **UI Kit** | {e.g. shadcn/ui + Radix} | {Latest} | {Accessible, composable} |
| **Styling** | {e.g. Tailwind CSS} | {3.x} | {Utility-first, rapid development} |
| **Routing (Client)** | {e.g. Wouter / React Router} | {X.x} | {Lightweight / Feature-rich} |
| **State / Fetching** | {e.g. TanStack Query} | {5.x} | {Server state caching, mutations} |
| **Forms** | {e.g. React Hook Form + Zod} | {7.x / 3.x} | {Validation on client + server} |
| **Backend** | {e.g. Express.js / Fastify} | {4.x} | {Mature, middleware ecosystem} |
| **ORM** | {e.g. Drizzle / Prisma} | {X.x} | {Type-safe queries, migrations} |
| **Database** | {e.g. PostgreSQL} | {16.x} | {ACID, JSON support, proven} |
| **Cache / Queue** | {e.g. Redis} | {7.x} | {Sessions, job queue, caching, pub/sub} |
| **Auth** | {e.g. Passport.js / custom JWT} | {X.x} | {Strategy pattern, extensible} |
| **Sessions** | {e.g. connect-redis / connect-pg-simple} | {-} | {Shared across workers} |
| **PDF Generation** | {e.g. Puppeteer / pdf-lib} | {-} | {HTML→PDF / Programmatic} |
| **Background Jobs** | {e.g. BullMQ / Agenda} | {-} | {Async email, SMS, PDF generation} |
| **Logging** | {e.g. Winston / Pino} | {-} | {Structured JSON, levels} |
| **Build / Dev** | {e.g. Vite + esbuild} | {5.x} | {Hot reload, fast builds} |
| **Process Manager** | {e.g. PM2} | {Latest} | {Cluster mode, auto-restart} |
| **Testing** | {e.g. Jest + Supertest + Playwright} | {-} | {Unit + API + E2E} |

### Stack Decision Matrix (Key Decisions Only)
| Decision | Option A | Option B | Selected | Why |
|----------|---------|---------|----------|-----|
| {e.g. PDF Engine} | {Puppeteer} | {pdf-lib} | {Puppeteer} | {HTML/CSS reuse, branded output, 3-5× faster dev} |
| {e.g. Session Store} | {Redis} | {PostgreSQL} | {Redis} | {Sub-ms lookups, shared rate limiting, pub/sub} |

---

## 3. System Architecture Diagram

> *Replace with actual architecture. Show all services, data stores, external APIs, and data flow.*

```
{ASCII or Mermaid diagram showing:
 - Client → Load Balancer/Nginx → Application (PM2) → Database
 - Application → Redis (sessions/cache/queue)
 - Application → External APIs
 - Background Workers → Database
 - File Storage location}
```

---

## 4. Data Architecture

### 4.1 Entity-Relationship Overview

> *High-level ER diagram showing major entities and their relationships. Detailed table schemas go in A3 (per module).*

```mermaid
erDiagram
    {ENTITY_A} ||--o{ {ENTITY_B} : "relationship"
    {ENTITY_A} ||--o{ {ENTITY_C} : "relationship"
```

### 4.2 Database Table Summary

> *List all tables — but detailed columns belong in A3 per module.*

| # | Table | Module | Purpose |
|---|-------|--------|---------|
| 1 | `users` | Auth (M1) | User accounts and authentication |
| 2 | `config_settings` | Admin Ops (standard) | Application configuration |
| 3 | `application_logs` | Admin Ops (standard) | Application event logs |
| 4 | `audit_log` | Admin Ops (standard) | Admin action audit trail |
| 5 | {project-specific tables...} | {Module ref} | {Purpose} |

### 4.3 Migration Strategy
| Aspect | Approach |
|--------|---------|
| **Tool** | {Drizzle Kit / Prisma Migrate / raw SQL} |
| **Process** | {drizzle-kit push (dev) → drizzle-kit generate (prod)} |
| **Rollback** | {Migration down scripts / manual rollback SQL} |

---

## 5. Authentication & Authorization Architecture

### 5.1 Auth Methods
| Method | Description | Implementation |
|--------|------------|---------------|
| {e.g. Email + Password} | {Standard registration with hashed password} | {bcrypt, 12 rounds} |
| {e.g. OTP} | {SMS/Email OTP verification} | {Time-limited code, X-minute TTL} |
| {e.g. SSO} | {External identity provider} | {OAuth2 / SAML redirect flow} |

### 5.2 Role-Based Access Control (RBAC)
| Role | Access Scope | Assigned By |
|------|-------------|------------|
| `super_admin` | Full system — config, logs, all users, all data | System seed / manual |
| `admin` | Application management, non-admin user management | Super Admin |
| {project-specific roles...} | {Scope description} | {How assigned} |

### 5.3 Auth Flow Diagram
```
{Diagram showing: Client → API → Auth Strategy → Session/Token → Database}
```

---

## 6. Security Architecture

### 6.1 Security Measures
| Requirement | Implementation |
|-------------|---------------|
| **HTTPS/TLS** | {Nginx SSL termination with Let's Encrypt} |
| **Password Hashing** | {bcrypt, X rounds} |
| **Input Validation** | {Zod schemas on all API inputs} |
| **Rate Limiting** | {express-rate-limit: X req/Y min per IP} |
| **Security Headers** | {Helmet middleware — CSP, X-Frame, HSTS} |
| **CORS** | {Whitelist specific origins} |
| **SQL Injection** | {Parameterized queries via ORM} |
| **XSS** | {React auto-escaping + CSP} |
| **RBAC** | {Middleware-enforced role checks} |
| **Audit Logging** | {All admin actions → audit_log table} |

### 6.2 OWASP Top 10 Coverage
| # | Vulnerability | Mitigation | Status |
|---|--------------|-----------|--------|
| 1 | Injection | {Parameterized via ORM} | ☐ |
| 2 | Broken Auth | {bcrypt + session + rate limit} | ☐ |
| 3 | Sensitive Data | {TLS + hashing + masked in logs} | ☐ |
| 4 | XXE | {JSON only, no XML} | ☐ |
| 5 | Broken Access | {RBAC middleware} | ☐ |

### 6.3 Compliance Requirements
| Standard | Applicability | Key Requirements |
|----------|--------------|-----------------|
| {e.g. GIGW / ISO 27001 / GDPR} | {Mandatory / Recommended} | {Key requirements affecting our design} |

---

## 7. External Integrations

| # | Service | Protocol | Purpose | Phase | Credentials Status |
|---|---------|----------|---------|-------|-------------------|
| 1 | {e.g. SMS Gateway} | {REST API} | {OTP, notifications} | {Phase X} | {Available / Pending / Unknown} |
| 2 | {e.g. Identity Provider} | {OAuth2} | {SSO / verification} | {Phase X} | {Pending} |

---

## 8. Performance Targets (from NFRs)

| Metric | Target | Architecture Decision Supporting It |
|--------|--------|-----------------------------------|
| Page Load | {< X seconds} | {Code splitting, lazy routes, CDN} |
| API Response (p95) | {< Xms} | {Indexed queries, Redis caching} |
| Concurrent Users | {X} | {PM2 cluster, connection pooling} |
| Uptime | {X%} | {PM2 auto-restart, health checks, standby VM} |

---

## 9. Deployment Architecture

> *How the application is deployed. Detailed infrastructure specs are in B8.*

```
{Diagram showing:
 - DNS → Nginx → PM2 Workers → Database
 - Backup strategy
 - Standby/failover if applicable}
```

### Environment Strategy
| Environment | URL | Purpose | Deploy Trigger |
|------------|-----|---------|---------------|
| Development | `localhost:{port}` | Local dev | Manual |
| Staging | `staging.{domain}` | UAT, testing | Git push to staging |
| Production | `{domain}` | Live | Manual approval |

---

## 10. Standard Modules (Included in Every Project)

> *These modules are automatically included per our pipeline standard. They are listed here for architecture awareness. Detailed specs are in B7 (Admin & Operations Module Standard).*

| Module | Purpose | Always Included? |
|--------|---------|-----------------|
| **Admin & Operations** | Super Admin dashboard, config management, log viewer, health monitoring | ✅ Mandatory |
| **Authentication & RBAC** | Login, register, session management, role enforcement | ✅ Mandatory |
| **Logging & Audit** | Structured logging, audit trail, log level control | ✅ Mandatory |
| **Error Handling** | Centralized error handler, consistent error responses | ✅ Mandatory |
| **Security Middleware** | Helmet, rate limiting, CORS, input validation | ✅ Mandatory |
| **Health Check** | `/health` and `/api/v1/admin/health` endpoints | ✅ Mandatory |

---

## 11. Architecture Decision Records (ADR)

> *Document significant technical decisions and their rationale.*

### ADR-001: {Decision Title}
| Field | Value |
|-------|-------|
| **Date** | {YYYY-MM-DD} |
| **Status** | {Proposed / Accepted / Deprecated} |
| **Context** | {What problem or choice prompted this decision?} |
| **Decision** | {What we decided} |
| **Rationale** | {Why we chose this over alternatives} |
| **Consequences** | {What this means for the project — positive and negative} |
| **Revisit Trigger** | {Under what conditions should we reconsider?} |

---

## 12. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {YYYY-MM-DD} | | Initial architecture |

---

> *This architecture drives ALL technical decisions in A3-A6 and the development pipeline. Module-level details (endpoints, table columns, file trees) belong in A3, NOT here. This document is system-level decisions only.*
