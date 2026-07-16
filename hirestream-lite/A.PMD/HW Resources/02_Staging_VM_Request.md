# VM Provisioning Request — HireStream Staging Environment

**Project:** HireStream — Overseas Placement Portal (HPSEDC)  
**Requested By:** OSIPL Development Team  
**Date:** 2026-04-01  
**Priority:** High  
**Environment:** Staging / UAT

---

## 1. Request Summary

We require **two (2) Virtual Machines** for the staging and testing environment of the HireStream Overseas Placement Portal being developed for HPSEDC. Both VMs require the full software stack pre-installed and **sudo access** for the development team for application deployment, configuration, and troubleshooting.

---

## 2. VM Specifications

### VM 1 — Primary Staging Server

| Resource | Specification |
|:---|:---|
| **CPU** | 8 vCPU |
| **RAM** | 24 GB |
| **Storage** | 512 GB SSD |
| **OS** | Ubuntu 22.04 LTS Server (64-bit) |
| **Network** | Static IP, 100 Mbps+ |
| **Access** | SSH with **sudo privileges** |

### VM 2 — Secondary Testing Server

| Resource | Specification |
|:---|:---|
| **CPU** | 4 vCPU |
| **RAM** | 16 GB |
| **Storage** | 256 GB SSD |
| **OS** | Ubuntu 22.04 LTS Server (64-bit) |
| **Network** | Static IP, 100 Mbps+ |
| **Access** | SSH with **sudo privileges** |

---

## 3. Software to Pre-Install (Both VMs)

Please install the following software packages on **both VM 1 and VM 2**:

### 3.1 System Essentials

| # | Software | Install Command | Purpose |
|:---|:---|:---|:---|
| 1 | **Build Essentials** | `sudo apt install -y build-essential` | C/C++ compiler tools required by native Node.js modules |
| 2 | **curl & wget** | `sudo apt install -y curl wget` | Package downloads and API testing |
| 3 | **Git** | `sudo apt install -y git` | Source code deployment |
| 4 | **unzip / tar** | `sudo apt install -y unzip tar` | Archive extraction |
| 5 | **htop** | `sudo apt install -y htop` | System monitoring |
| 6 | **ufw** | `sudo apt install -y ufw` | Firewall management |

### 3.2 Application Runtime

| # | Software | Install Command | Purpose |
|:---|:---|:---|:---|
| 7 | **Node.js 20.x LTS** | `curl -fsSL https://deb.nodesource.com/setup_20.x \| sudo -E bash - && sudo apt install -y nodejs` | JavaScript application runtime |
| 8 | **PM2** (global) | `sudo npm install -g pm2` | Node.js process manager with cluster mode |

### 3.3 Web Server

| # | Software | Install Command | Purpose |
|:---|:---|:---|:---|
| 9 | **Nginx** | `sudo apt install -y nginx` | Reverse proxy, SSL termination, static file serving |
| 10 | **Certbot** | `sudo apt install -y certbot python3-certbot-nginx` | SSL/TLS certificate automation (Let's Encrypt) |

### 3.4 Database & Caching

| # | Software | Install Command | Purpose |
|:---|:---|:---|:---|
| 11 | **PostgreSQL 16** | `sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list' && wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc \| sudo apt-key add - && sudo apt update && sudo apt install -y postgresql-16` | Primary relational database |
| 12 | **Redis 7.x** | `sudo apt install -y redis-server` | Session store, job queue, caching, real-time pub/sub |

### 3.5 PDF Generation

| # | Software | Install Command | Purpose |
|:---|:---|:---|:---|
| 13 | **Chromium** (headless) | `sudo apt install -y chromium-browser` | Headless browser for Puppeteer PDF generation |
| 14 | **Chromium Dependencies** | `sudo apt install -y fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 libatk1.0-0 libcups2 libdbus-1-3 libgdk-pixbuf2.0-0 libnspr4 libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxrandr2 xdg-utils libgbm1 libpango-1.0-0 libcairo2` | System libraries required by headless Chromium |

### 3.6 Fonts (for PDF rendering and bilingual support)

| # | Software | Install Command | Purpose |
|:---|:---|:---|:---|
| 15 | **Hindi/Devanagari Fonts** | `sudo apt install -y fonts-deva fonts-noto fonts-noto-cjk` | Hindi language support in UI and PDFs |
| 16 | **Core Web Fonts** | `sudo apt install -y fonts-liberation fonts-dejavu-core` | Standard document fonts for PDF generation |

---

## 4. Network & Firewall Requirements

### 4.1 Inbound Ports to Open (Both VMs)

| Port | Protocol | Purpose |
|:---|:---|:---|
| **22** | TCP | SSH access (restrict to development team IPs if possible) |
| **80** | TCP | HTTP (Nginx — redirects to HTTPS) |
| **443** | TCP | HTTPS (Nginx — application access) |

### 4.2 Outbound Access Required (Both VMs)

The application integrates with external government services. The following outbound HTTPS (port 443) access is required:

- **UIDAI / Aadhaar API servers** — Identity verification
- **DigiLocker API** — Document retrieval
- **HIM Access SSO servers** — State government single sign-on
- **NIC/CDAC SMS Gateway** — OTP and notification SMS
- **Government SMTP relay** — Email notifications
- **Let's Encrypt ACME servers** — SSL certificate issuance/renewal
- **npm registry** (registry.npmjs.org) — Package installation
- **GitHub / GitLab** — Code deployment

---

## 5. Access Requirements

| Requirement | Details |
|:---|:---|
| **SSH Access** | Key-based SSH access for the OSIPL development team (2-3 users) |
| **Sudo Privileges** | **Required on both VMs** — needed for Nginx configuration, PostgreSQL administration, PM2 setup, firewall management, SSL certificate installation, and application deployment |
| **Inter-VM Connectivity** | Both VMs should be able to communicate with each other over the internal network (for backup sync and future DB migration) |

---

## 6. Purpose & Timeline

| Phase | VM Usage | Timeline |
|:---|:---|:---|
| **Staging & UAT** | All components on VM 1; VM 2 for parallel testing | Immediate |
| **Pre-Production** | Load testing, security audit, UAT sign-off | Before go-live |
| **Production** | Separate resource request will follow with production specifications | Post UAT approval |

> **Note:** Production VM specifications may differ based on staging performance observations and load testing results.

---

**Requested by:**  
OSIPL Development Team

**Approved by:**  
_______________________________  
(Project Manager / Authorized Signatory)

**Date:** _______________
