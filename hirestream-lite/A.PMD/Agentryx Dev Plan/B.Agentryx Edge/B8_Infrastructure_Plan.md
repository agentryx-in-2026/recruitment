# B8: Infrastructure & Resource Plan — {Project Name}
> **Template Version:** 1.0 | **Created By:** Solution Architect
> **Status:** Draft | **Date:** {YYYY-MM-DD}
> **Depends On:** A2 (Solution Architecture)

---

## 1. Deployment Model

| Field | Value |
|-------|-------|
| **Model** | {Single VM / Multi-VM / Cloud / Hybrid / Container-based} |
| **Environment** | {Staging / Production / Both} |
| **Hosting** | {On-premise data center / AWS / GCP / Azure / Self-managed VM} |

---

## 2. VM / Server Specifications

### VM 1 — {Role: Primary / Application / Database}
| Resource | Specification | Justification |
|----------|--------------|---------------|
| **CPU** | {X vCPU} | {Why this amount} |
| **RAM** | {X GB} | {Break down: App + DB + Cache + OS + headroom} |
| **Storage** | {X GB SSD} | {Break down: OS + data + uploads + backups + growth} |
| **OS** | {Ubuntu 22.04 LTS / CentOS / etc.} | {Why this OS} |
| **Network** | {100 Mbps / 1 Gbps} | {File upload/download throughput needs} |
| **Access** | {SSH with sudo} | {Required for deployment and administration} |

### VM 2 — {Role: Standby / Database / Secondary} (if applicable)
| Resource | Specification | Justification |
|----------|--------------|---------------|
| **CPU** | {X vCPU} | |
| **RAM** | {X GB} | |
| **Storage** | {X GB SSD} | |
| **OS** | {Same as VM 1} | |
| **Network** | {Same as VM 1} | |
| **Access** | {SSH with sudo} | |

---

## 3. RAM Allocation Breakdown (Primary VM)

| Component | Estimated RAM | Notes |
|-----------|-------------|-------|
| **Application Runtime** | {X GB} | {e.g. Node.js PM2 workers × memory each} |
| **Database** | {X GB} | {e.g. PostgreSQL shared_buffers = 25% of RAM} |
| **Cache / Broker** | {X MB} | {e.g. Redis memory allocation} |
| **Web Server** | {X MB} | {e.g. Nginx} |
| **PDF / Processing** | {X MB peak} | {e.g. Puppeteer/Chromium during generation} |
| **OS + Kernel** | {X GB} | {File system cache, system services} |
| **Headroom (25-30%)** | {X GB} | {Absorb traffic spikes} |
| **Total** | {X GB} | |

---

## 4. Storage Layout

### 4.1 Disk Partitioning
| Mount Point | Size | Purpose |
|-------------|------|---------|
| `/` | {X GB} | OS, system packages, application code |
| `/data` | {X GB} | Database data, uploads, backups |

### 4.2 Year 1 Storage Estimate
| Category | Calculation | Estimated Size |
|----------|------------|---------------|
| OS + Software | | {X GB} |
| Application Code | | {X GB} |
| Database | {users × avg row size × tables} | {X GB} |
| Uploaded Files | {users × files × avg size} | {X GB} |
| Backups (rolling) | {retention × backup size × frequency} | {X GB} |
| Logs | {retention days × daily log size} | {X GB} |
| **Total Year 1** | | {X GB} |
| **Available Headroom** | | {X GB (X% free)} |

---

## 5. Software Stack — Pre-Installation Checklist

### 5.1 System Essentials
| # | Software | Version | Install Command | Purpose |
|---|----------|---------|----------------|---------|
| 1 | Build Essentials | System | `sudo apt install -y build-essential` | Native module compilation |
| 2 | curl & wget | System | `sudo apt install -y curl wget` | Downloads, API testing |
| 3 | Git | Latest | `sudo apt install -y git` | Code deployment |
| 4 | htop | System | `sudo apt install -y htop` | System monitoring |
| 5 | ufw | System | `sudo apt install -y ufw` | Firewall management |

### 5.2 Application Runtime
| # | Software | Version | Install Command | Purpose |
|---|----------|---------|----------------|---------|
| 6 | {e.g. Node.js} | {20.x LTS} | {NodeSource install} | Application runtime |
| 7 | {e.g. PM2} | {Latest} | {npm install -g pm2} | Process manager |

### 5.3 Web Server & SSL
| # | Software | Version | Install Command | Purpose |
|---|----------|---------|----------------|---------|
| 8 | Nginx | Latest stable | `sudo apt install -y nginx` | Reverse proxy, SSL, static files |
| 9 | Certbot | Latest | `sudo apt install -y certbot python3-certbot-nginx` | SSL certificate automation |

### 5.4 Database & Cache
| # | Software | Version | Install Command | Purpose |
|---|----------|---------|----------------|---------|
| 10 | {e.g. PostgreSQL} | {16.x} | {PostgreSQL apt repo} | Primary database |
| 11 | {e.g. Redis} | {7.x} | `sudo apt install -y redis-server` | Session store, job queue, caching |

### 5.5 Processing Dependencies (Project-Specific)
| # | Software | Version | Install Command | Purpose |
|---|----------|---------|----------------|---------|
| 12 | {e.g. Chromium} | Latest | `sudo apt install -y chromium-browser` | Headless PDF generation |
| 13 | {e.g. System fonts} | - | `sudo apt install -y fonts-liberation fonts-noto` | PDF rendering fonts |

---

## 6. Network & Firewall

### 6.1 Inbound Ports
| Port | Protocol | Direction | Purpose |
|------|----------|-----------|---------|
| 22 | TCP | Inbound | SSH (restrict to team IPs) |
| 80 | TCP | Inbound | HTTP (redirect to HTTPS) |
| 443 | TCP | Inbound | HTTPS (application) |

### 6.2 Internal-Only Ports
| Port | Protocol | Purpose |
|------|----------|---------|
| {5432} | TCP | {PostgreSQL — localhost only} |
| {6379} | TCP | {Redis — localhost only} |
| {5000} | TCP | {Application — proxied via Nginx} |

### 6.3 Outbound Access Required
| Destination | Port | Purpose |
|-------------|------|---------|
| {List external APIs the app calls} | 443 | {Purpose} |
| Let's Encrypt ACME | 443 | SSL certificate renewal |
| npm registry | 443 | Package installation |
| GitHub/GitLab | 443 | Code deployment |

---

## 7. Backup Strategy

| Backup Type | Frequency | Retention | Destination |
|-------------|-----------|-----------|-------------|
| Database dump | {Every X hours} | {X days rolling} | {Local + remote} |
| Uploaded files | {Every X hours} | {Mirror} | {Remote sync} |
| Application config | {On each deploy} | {Git history} | {Repository} |
| VM Snapshot | {Weekly} | {X weeks} | {Data center} |

---

## 8. Monitoring & Health Checks

| Check | Method | Frequency | Alert Threshold |
|-------|--------|-----------|----------------|
| Application health | `GET /api/v1/health` | Every 5 min | Non-200 response |
| Disk usage | `df -h` | Every 15 min | >80% |
| Memory usage | `free -m` | Every 5 min | >85% |
| CPU usage | Load average | Every 5 min | Sustained >80% |
| SSL expiry | Certificate check | Weekly | <30 days |
| Backup status | Last timestamp check | Every backup cycle | Missing backup |

---

## 9. Standby / Failover Strategy (If Applicable)

| Aspect | Configuration |
|--------|--------------|
| **Standby Type** | {Cold / Warm / Hot / Active-Active} |
| **Sync Method** | {rsync / pg_basebackup / streaming replication} |
| **Sync Frequency** | {Every X hours} |
| **Failover** | {Manual / Automatic} |
| **Estimated Failover Time** | {X minutes} |
| **Maximum Data Loss** | {Up to X hours (last sync interval)} |
| **DNS Switch** | {CloudFlare / manual IP update / floating IP} |

---

## 10. Access Requirements

| Requirement | Details |
|-------------|---------|
| **SSH Users** | {Number of team members needing access} |
| **Sudo Privileges** | {Required / Limited sudo / No sudo} |
| **Inter-VM Connectivity** | {Required for backup sync / Not needed} |

---

## 11. Comparison with Reference Project (If Applicable)

| Resource | Reference Project | This Project | Justification for Change |
|----------|------------------|-------------|------------------------|
| CPU | {X vCPU} | {Y vCPU} | {Why different} |
| RAM | {X GB} | {Y GB} | {Why different} |
| Storage | {X GB} | {Y GB} | {Why different} |
| Machines | {1} | {2} | {Why different} |

---

## 12. Resource Request Summary

| # | Item | Specification | Quantity |
|---|------|--------------|---------|
| 1 | Virtual Machine | {specs} | {count} |
| 2 | Static IP | IPv4 | {count} |
| 3 | Domain/DNS | {domain} | {count} |
| 4 | Internal Network | LAN between VMs | {if applicable} |

---

## 13. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {YYYY-MM-DD} | | Initial resource plan |

---

> *This document must be created alongside A2 (Architecture). Infrastructure decisions affect architectural decisions and vice versa. Always size for the target workload with a minimum 25% headroom.*
