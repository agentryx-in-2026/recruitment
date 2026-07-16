# HireStream — Hardware & Data Center Resource Plan
**Project:** Overseas Placement Portal (HPSEDC)  
**Version:** 1.0 | **Date:** 2026-04-01  
**Status:** 📋 Ready for Resource Request Submission

---

## 1. Executive Summary

HireStream requires **two (2) identical Virtual Machines** from the HPSEDC data center. One machine will serve as the **active production server** running all application components (Nginx, Node.js, PostgreSQL, file storage), and the second will remain as a **warm standby** for disaster recovery and failover, ensuring the FRS-mandated **99.9% uptime SLA**.

This follows the same **single-VM, all-in-one architecture** pattern successfully deployed for the HP Tourism Portal, with upgraded specifications to accommodate HireStream's additional workload (file uploads, PDF generation, AI resume parsing, notification services).

---

## 2. Machine Specifications

### 2.1 Machine Configuration (×2 Identical)

| Resource | Specification | Justification |
|:---|:---|:---|
| **CPU** | 8 vCPU | PM2 cluster (4-6 Node.js workers) + PostgreSQL + Nginx + background jobs (backup cron, notification dispatch) + PDF generation headroom |
| **RAM** | 32 GB | Node.js workers (~300MB × 6 = 1.8GB) + PostgreSQL shared_buffers (8GB) + OS/kernel cache (4GB) + file I/O buffers + substantial headroom for peak loads |
| **Storage** | 512 GB SSD | OS (~10GB) + application code (~1GB) + PostgreSQL data (~20GB projected) + uploaded files (~30GB Year 1) + backups (~50GB rolling) + logs + 400GB+ growth headroom |
| **OS** | Ubuntu 22.04 LTS (or latest LTS) | Long-term support, consistency with HP Tourism setup |
| **Network** | 1 Gbps NIC (minimum 100 Mbps) | File upload/download throughput, inter-VM communication |

### 2.2 Comparison with HP Tourism

| Resource | HP Tourism (Current) | HireStream (Requested) | Delta | Reason for Upgrade |
|:---|:---|:---|:---|:---|
| **CPU** | 8 vCPU | 8 vCPU | Same | Sufficient — PM2 cluster distributes load across cores |
| **RAM** | 16 GB | **32 GB** | **+16 GB** | File processing (PDF generation, CV parsing), larger PostgreSQL buffer pool for complex queries (13+ tables, JOIN-heavy matching algorithm), notification service memory |
| **Storage** | 512 GB SSD | 512 GB SSD | Same | Sufficient — 5-6K candidate files well within capacity |
| **Count** | 1 machine | **2 machines** | **+1** | Standby/failover for 99.9% uptime SLA compliance |

### 2.3 Why 32 GB RAM (vs HP Tourism's 16 GB)

HireStream has several additional memory consumers that HP Tourism did not:

| Component | Estimated RAM Usage | Notes |
|:---|:---|:---|
| **Node.js PM2 Workers (×6)** | ~1.8 GB | Each worker ~300MB with loaded modules |
| **PostgreSQL** | ~10 GB | `shared_buffers` (8GB) + `work_mem` + connections + WAL buffers. 13+ tables with complex JOINs benefit from larger buffer pool |
| **Nginx** | ~100 MB | Reverse proxy + SSL + static file caching |
| **PDF Generation (Puppeteer/Chromium)** | ~300 MB peak | Branded HTML/CSS → PDF rendering for candidate profiles, reports, appointment letters |
| **Redis** | ~200 MB | Session caching, background job queue (BullMQ), rate limiting store, pub/sub for real-time notifications |
| **File Upload Buffers** | ~500 MB peak | Multer buffers for concurrent CV/document uploads (5MB × parallel uploads) |
| **OS + Kernel Caches** | ~4 GB | File system cache, kernel buffers, system services |
| **Headroom (25%)** | ~7 GB | Absorb traffic spikes, prevent OOM kills during peak load |
| **Total** | **~26 GB active** | 32 GB provides comfortable 6GB headroom |

> With 16 GB, we'd be running at ~80% memory utilization under moderate load — too tight for production with an uptime SLA. **32 GB gives us the safety margin a government production system needs.**

---

## 3. Deployment Architecture (Active Machine)

All components run on a **single VM**, identical to the HP Tourism deployment pattern:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ACTIVE VM (8 vCPU / 32 GB / 512 GB)             │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    NGINX (Port 80/443)                        │   │
│  │  • SSL Termination (Let's Encrypt / Certbot)                 │   │
│  │  • Static file serving (React SPA from /dist)                │   │
│  │  • Reverse proxy → localhost:5000 (/api/*)                   │   │
│  │  • Gzip compression, rate limiting at L7                     │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                              │                                       │
│  ┌──────────────────────────▼───────────────────────────────────┐   │
│  │              NODE.JS APPLICATION (PM2 Cluster)                │   │
│  │  • 4-6 workers on Port 5000                                   │   │
│  │  • Express.js API (/api/v1/*)                                 │   │
│  │  • Vite-built React SPA (production static)                   │   │
│  │  • Passport.js auth (sessions via Redis)                      │   │
│  │  • Multer file uploads → /data/uploads/                       │   │
│  │  • Puppeteer PDF generation (HTML/CSS → PDF)                  │   │
│  │  • BullMQ job queue (async email/SMS/PDF via Redis)           │   │
│  │  • Winston structured logging → /var/log/hirestream/          │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                              │                                       │
│  ┌──────────────────────────▼───────────────────────────────────┐   │
│  │                    REDIS 7 (Port 6379)                        │   │
│  │  • Session store (express-session + connect-redis)            │   │
│  │  • BullMQ job queue backend (email, SMS, PDF generation)      │   │
│  │  • Rate limiting shared store (across PM2 workers)            │   │
│  │  • API response caching (dashboard stats, job listings)       │   │
│  │  • Pub/sub for real-time notification push                    │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                              │                                       │
│  ┌──────────────────────────▼───────────────────────────────────┐   │
│  │                 POSTGRESQL 16 (Port 5432)                     │   │
│  │  • Database: hirestream                                       │   │
│  │  • 13+ tables (users, candidates, jobs, applications,         │   │
│  │    documents, recruitment_drives, interviews, placements,     │   │
│  │    grievances, notifications, audit_log, faq_content,         │   │
│  │    announcements, training_events)                            │   │
│  │  • shared_buffers = 8GB                                       │   │
│  │  • Automated pg_dump backup every 6 hours                     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    FILE STORAGE                               │   │
│  │  /data/uploads/       → Candidate CVs, certificates, passports│   │
│  │  /data/backups/       → Rolling pg_dump archives (7 days)     │   │
│  │  /var/log/hirestream/ → Application logs (rotated)            │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    CRON JOBS                                   │   │
│  │  • pg_dump backup: Every 6 hours                              │   │
│  │  • Log rotation: Daily (logrotate)                            │   │
│  │  • SSL renewal: Monthly (certbot)                             │   │
│  │  • Backup sync to Standby VM: Every 6 hours (rsync/scp)      │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Standby Machine Strategy

The second VM serves as a **warm standby** — not actively serving traffic, but ready to take over within minutes.

### 4.1 Standby Configuration

| Aspect | Configuration |
|:---|:---|
| **Software** | Identical stack installed (Nginx, Node.js, PM2, PostgreSQL) |
| **Application Code** | Synced from Active VM via git pull / rsync (on each deploy) |
| **Database** | Receives pg_dump backup every 6 hours from Active VM via scp/rsync |
| **Uploads** | Receives file sync every 6 hours from Active VM |
| **State** | PM2 stopped / PostgreSQL stopped (not actively running) |
| **DNS** | Same Cloudflare DNS — manual IP switch for failover |

### 4.2 Failover Procedure

```
Active VM Failure Detected (monitoring alert or manual check)
    │
    ▼
1. SSH into Standby VM
2. Restore latest pg_dump: psql hirestream < latest_backup.sql
3. Start PostgreSQL: systemctl start postgresql
4. Start Application: pm2 start ecosystem.config.js
5. Update Cloudflare DNS → point to Standby VM IP
6. Verify: curl https://hirestream.osipl.dev/api/v1/admin/health
    │
    ▼
Estimated Failover Time: 15-30 minutes (manual)
Maximum Data Loss: Up to 6 hours (last backup interval)
```

### 4.3 Future Enhancement: Active-Active (If Needed)

If HireStream grows beyond expectations, the standby can be promoted to an active DB server:

```
Phase 1 (Current Plan):     Phase 2 (Future, if needed):
┌────────┐  ┌────────┐      ┌────────┐  ┌────────┐
│Active  │  │Standby │      │  App   │  │  DB +  │
│(All-in-│  │(Cold   │  →   │ Server │  │Storage │
│ one)   │  │ copy)  │      │(Nginx +│  │(PG +   │
│        │  │        │      │Node.js)│  │Files)  │
└────────┘  └────────┘      └────────┘  └────────┘
```

This transition requires **zero hardware changes** — same 2 machines, just redistributed roles.

---

## 5. Software Stack on Active VM

| Software | Version | Purpose | Installation |
|:---|:---|:---|:---|
| **Ubuntu** | 22.04 LTS | Operating System | Base image |
| **Nginx** | Latest stable | Reverse proxy, SSL, static files | `apt install nginx` |
| **Node.js** | 20.x LTS | Application runtime | NodeSource repo |
| **PM2** | Latest | Process manager, cluster mode | `npm install -g pm2` |
| **PostgreSQL** | 16.x | Primary database | PostgreSQL apt repo |
| **Redis** | 7.x | Session store, job queue, caching, rate limiting, pub/sub | `apt install redis-server` |
| **Chromium** | Latest stable | Headless browser for Puppeteer PDF generation | `apt install chromium-browser` |
| **Certbot** | Latest | SSL certificate automation | `apt install certbot` |
| **Git** | Latest | Code deployment | `apt install git` |
| **logrotate** | System | Log rotation | Pre-installed |
| **rsync** | System | Backup sync to standby | Pre-installed |

### Software NOT Required

| Software | Reason for Exclusion |
| **Docker / Kubernetes** | Unnecessary for single-app VM deployment. Direct PM2 management is simpler and matches HP Tourism pattern. |
| **Neon DB** | Using local PostgreSQL. Data stays on-premise within HPSEDC data center. |
| **pdf-lib** | Using Puppeteer instead — HTML/CSS templates produce higher quality branded PDFs with 3-5× faster development. 300MB RAM cost is negligible on 32 GB machine. |

---

## 6. Storage Layout

### 6.1 Disk Partitioning Recommendation

| Mount Point | Size | Purpose |
|:---|:---|:---|
| `/` | 50 GB | OS, system packages, application code, logs |
| `/data` | 462 GB | PostgreSQL data, uploaded files, backups |

> Separating `/data` ensures OS issues don't fill up the data partition and vice versa. If the data center provides a single partition, the application directories should still be organized under `/data/` for clarity.

### 6.2 Storage Consumption Estimate (Year 1)

| Category | Calculation | Estimated Size |
|:---|:---|:---|
| **OS + Software** | Ubuntu + packages | ~10 GB |
| **Application Code** | Source + node_modules + dist | ~1 GB |
| **PostgreSQL Data** | 6K users, 13+ tables, indexes | ~5-10 GB |
| **Uploaded Files** | ~6K candidates × ~5 files × ~2MB avg | ~60 GB |
| **Database Backups** | 7-day rolling × 4/day × ~200MB each | ~5.6 GB |
| **Application Logs** | Rotated, 30-day retention | ~5 GB |
| **Total Year 1** | | **~90 GB** |
| **Available Headroom** | | **~420 GB (82% free)** |

> At this growth rate, 512 GB SSD is sufficient for **5+ years** of operation without cleanup.

---

## 7. Network & Firewall Requirements

### 7.1 Ports to Open

| Port | Protocol | Direction | Purpose |
|:---|:---|:---|:---|
| **22** | TCP | Inbound | SSH management access (restrict to admin IPs) |
| **80** | TCP | Inbound | HTTP (redirects to HTTPS via Nginx) |
| **6379** | TCP | **Internal only** | Redis (bind to localhost, NOT exposed externally) |
| **443** | TCP | Inbound | HTTPS (primary application access) |
| **5432** | TCP | **Internal only** | PostgreSQL (bind to localhost, NOT exposed externally) |
| **5000** | TCP | **Internal only** | Node.js app (proxied via Nginx, NOT exposed externally) |

### 7.2 Outbound Access Required

| Destination | Port | Purpose |
|:---|:---|:---|
| **UIDAI API** (Aadhaar) | 443 | Identity verification |
| **DigiLocker API** | 443 | Document retrieval |
| **HIM Access SSO** | 443 | State government SSO |
| **NIC/CDAC SMS Gateway** | 443/API | OTP + notification SMS |
| **Government SMTP Relay** | 587/465 | Email notifications |
| **Let's Encrypt (ACME)** | 443 | SSL certificate renewal |
| **GitHub/GitLab** | 443 | Code deployment (git pull) |

### 7.3 Inter-VM Communication (Active ↔ Standby)

| Port | Protocol | Purpose |
|:---|:---|:---|
| **22** | TCP | rsync/scp for backup transfer |

---

## 8. PostgreSQL Configuration Recommendations

Optimized for 32 GB RAM and 8 vCPU:

```ini
# /etc/postgresql/16/main/postgresql.conf

# Memory
shared_buffers = 8GB              # 25% of RAM
effective_cache_size = 24GB       # 75% of RAM
work_mem = 64MB                   # Per-operation sort/hash memory
maintenance_work_mem = 2GB        # For VACUUM, CREATE INDEX

# Connections
max_connections = 100             # PM2 workers × connections per worker + admin
                                  # (6 workers × 10 connections = 60 + headroom)

# WAL & Checkpoints
wal_buffers = 64MB
checkpoint_completion_target = 0.9
max_wal_size = 2GB

# Query Planning
random_page_cost = 1.1            # SSD-optimized (default 4.0 is for HDD)
effective_io_concurrency = 200    # SSD-optimized

# Logging
log_min_duration_statement = 500  # Log queries taking >500ms
log_checkpoints = on
log_connections = on
```

---

## 9. Monitoring & Alerting

### 9.1 Health Checks

| Check | Method | Frequency |
|:---|:---|:---|
| **Application Health** | `GET /api/v1/admin/health` | Every 5 min |
| **Nginx Status** | `systemctl status nginx` | Every 5 min |
| **PostgreSQL Status** | `systemctl status postgresql` | Every 5 min |
| **Disk Usage** | `df -h /data` alert at 80% | Every 15 min |
| **Memory Usage** | `free -m` alert at 85% | Every 5 min |
| **CPU Usage** | `top -bn1` alert at sustained 80% | Every 5 min |
| **PM2 Workers** | `pm2 status` — alert if any crashed | Every 1 min |
| **SSL Expiry** | `certbot certificates` | Weekly |
| **Backup Status** | Check latest pg_dump timestamp | Every 6 hours |

### 9.2 Recommended Monitoring Stack

Simple, lightweight monitoring suitable for a government project:

```bash
# Option 1: Simple cron-based monitoring (recommended for simplicity)
# Cron script checks health endpoints, sends alert email if down

# Option 2: PM2 built-in monitoring
pm2 install pm2-server-monit    # Basic server metrics in PM2 dashboard
```

---

## 10. Backup Strategy

| Backup Type | Frequency | Retention | Destination |
|:---|:---|:---|:---|
| **Database (pg_dump)** | Every 6 hours | 7 days rolling (28 copies) | `/data/backups/db/` on Active + sync to Standby |
| **Uploaded Files** | Every 6 hours (rsync) | Mirror | Sync to Standby VM `/data/uploads/` |
| **Application Config** | On each deploy | Git history | Git repository |
| **Full VM Snapshot** | Weekly (if data center supports) | 4 weeks | Data center snapshot storage |

### Backup Cron (Active VM)

```bash
# /etc/cron.d/hirestream-backup

# Database backup every 6 hours
0 */6 * * * hirestream pg_dump -U hirestream hirestream | gzip > /data/backups/db/hirestream_$(date +\%Y\%m\%d_\%H\%M).sql.gz

# Cleanup backups older than 7 days
30 */6 * * * hirestream find /data/backups/db/ -name "*.sql.gz" -mtime +7 -delete

# Sync backups + uploads to Standby VM
45 */6 * * * hirestream rsync -avz /data/backups/ standby-vm:/data/backups/
50 */6 * * * hirestream rsync -avz /data/uploads/ standby-vm:/data/uploads/
```

---

## 11. Resource Request Summary

### What to Request from Data Center

| # | Item | Specification | Quantity |
|:---|:---|:---|:---|
| 1 | **Virtual Machine** | 8 vCPU, 32 GB RAM, 512 GB SSD | **2** |
| 2 | **Public IP Address** | Static IPv4 | **1** (Active VM; Standby gets one during failover) |
| 3 | **Internal Network** | LAN connectivity between the 2 VMs | **1** |
| 4 | **DNS Entry** | `hirestream.osipl.dev` → Public IP | Already configured (Cloudflare) |
| 5 | **Firewall Rules** | Ports 22, 80, 443 inbound; outbound to APIs (see §7) | Per §7 |
| 6 | **SSH Access** | Admin SSH keys for deployment team | As per policy |
| 7 | **OS Image** | Ubuntu 22.04 LTS Server | Standard |

### Cost Comparison with HP Tourism

| | HP Tourism | HireStream | Justification |
|:---|:---|:---|:---|
| **Machines** | 1 | 2 | Standby for 99.9% uptime SLA |
| **CPU (each)** | 8 vCPU | 8 vCPU | Same workload pattern |
| **RAM (each)** | 16 GB | 32 GB | Additional: file processing, PDF gen, larger DB buffer pool, 13+ table JOINs |
| **Storage (each)** | 512 GB | 512 GB | Same |
| **Incremental** | — | **+1 machine, +16GB RAM** | Minimal incremental cost for significantly better reliability |

---

## 12. Technical Decision Log

| Decision | Choice | Alternative Considered | Rationale |
|:---|:---|:---|:---|
| **Architecture** | Single-VM, all-in-one | Separated App + DB VMs | Matches HP Tourism pattern; simpler ops; 8 CPU + 32 GB is sufficient for workload |
| **Database** | Local PostgreSQL 16 | Neon (cloud PostgreSQL) | Data stays on-premise within HPSEDC data center; no external dependency; full control |
| **Session Store** | Redis (`connect-redis`) | PostgreSQL (`connect-pg-simple`) | Sub-millisecond session lookups, shared rate limiting across PM2 workers, pub/sub for real-time notifications, caching for dashboard stats — all for ~200 MB RAM (0.6% of 32 GB) |
| **PDF Engine** | Puppeteer (headless Chromium) | pdf-lib (pure JS) | HTML/CSS → PDF enables template reuse from React components, branded government letterhead, complex table layouts, charts in reports. 3-5× faster to develop. ~300MB RAM during generation is negligible on 32 GB machine |
| **Background Jobs** | BullMQ (Redis-backed) | Synchronous processing | Email/SMS/PDF generation runs asynchronously — API returns instantly. User doesn't wait 2-3 seconds for SMTP to complete before seeing confirmation |
| **Process Manager** | PM2 (cluster mode) | systemd / Docker | PM2 provides zero-downtime reloads, automatic restarts, cluster mode, built-in monitoring. Proven in HP Tourism |
| **Standby Strategy** | Warm standby, manual failover | Active-active / auto-failover | Appropriate for 99.9% SLA. Auto-failover adds significant complexity (keepalived, floating IPs) — overkill for this scale |
| **Containerization** | None (bare metal services) | Docker / Kubernetes | Unnecessary overhead for single-app deployment. Direct service management is simpler and familiar |

---

## 13. Revision History

| Version | Date | Author | Changes |
|:---|:---|:---|:---|
| 1.0 | 2026-04-01 | HireStream Dev Team | Initial hardware resource plan based on FRS, architecture review, and HP Tourism baseline comparison |
