# Claude Code Agent — Staging VM Setup Brief

**Paste everything below (between the `---BEGIN---` and `---END---` markers) as the first prompt to a Claude Code agent running on the target VM.**

The agent should work through it top-to-bottom, asking the operator only for the values flagged `{{ASK}}`.

---BEGIN---

You are setting up two Node.js apps on a fresh Ubuntu 22.04+ VM: **HireStream** (HPSEDC overseas placement portal) and **Agentryx Verify** (UAT sign-off portal that tracks HireStream deliverables). They are independent processes on the same VM, fronted by nginx with Let's Encrypt TLS, managed by PM2, backed by PostgreSQL 14+.

## Authoritative reference

The full manual walkthrough lives in the HireStream repo at `A.PMD/Deployment Package/02_Staging_VM_Setup.md`. Read that file first after cloning. These instructions mirror it but are structured so you (the agent) can execute them.

## Before you start — ask the operator for

1. `{{DOMAIN_HIRESTREAM}}` — fully-qualified domain for HireStream (e.g. `hirestream.example.dev`). DNS A-record must already point at this VM.
2. `{{DOMAIN_VERIFY}}` — fully-qualified domain for Agentryx Verify (e.g. `verify.example.dev`). DNS A-record must already point at this VM.
3. `{{LETSENCRYPT_EMAIL}}` — email for Let's Encrypt renewal notices.
4. `{{GIT_METHOD}}` — either `ssh` (operator has added this VM's SSH key to GitHub — preferred) or `https` (operator will provide a short-lived PAT).
5. `{{PAT}}` — only if `{{GIT_METHOD}}=https`. Classic PAT with `repo` scope from GitHub account `microaistudio`. **Tell the operator to revoke it after push.**
6. `{{SESSION_SECRET_HIRESTREAM}}` and `{{SESSION_SECRET_VERIFY}}` — two different long random strings. If the operator doesn't have them, generate with `openssl rand -hex 32` and show the values.

Do not proceed until you have all of these. Do not make up placeholder domains.

## Sanity checks before you begin

Run these. If any fail, stop and report:

```bash
lsb_release -a              # expect Ubuntu 22.04 or newer
free -h                     # expect ≥ 4 GB RAM
df -h /                     # expect ≥ 20 GB free
id                          # confirm sudo group membership
dig +short {{DOMAIN_HIRESTREAM}}  # must resolve to this VM's public IP
dig +short {{DOMAIN_VERIFY}}      # must resolve to this VM's public IP
```

## Step 1 — Base system

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential nginx postgresql postgresql-contrib certbot python3-certbot-nginx

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # expect v20.x

# PM2
sudo npm install -g pm2
pm2 startup systemd -u $USER --hp $HOME
# Run the sudo command PM2 prints back to you
```

## Step 2 — PostgreSQL

```bash
sudo -u postgres psql <<'SQL'
CREATE USER hirestream WITH PASSWORD 'hirestream';
CREATE DATABASE hirestream OWNER hirestream;
CREATE DATABASE hirestream_test OWNER hirestream;
CREATE DATABASE agentryx_verify OWNER hirestream;
SQL
```

Verify:

```bash
sudo -u postgres psql -c '\l' | grep -E 'hirestream|agentryx_verify'   # expect 3 rows
```

## Step 3 — Clone both repos

Create `~/Projects` and clone side-by-side. The directory names **must** be `HireStream` and `AgentryxVerify` (capitalization matters — paths in docs assume this):

```bash
mkdir -p ~/Projects && cd ~/Projects
```

If `{{GIT_METHOD}}=ssh`:

```bash
git clone git@github.com:microaistudio/hirestream.git HireStream
git clone git@github.com:microaistudio/agentryx-verify.git AgentryxVerify
```

If `{{GIT_METHOD}}=https`:

```bash
git clone https://microaistudio:{{PAT}}@github.com/microaistudio/hirestream.git HireStream
git clone https://microaistudio:{{PAT}}@github.com/microaistudio/agentryx-verify.git AgentryxVerify

# Strip the PAT back out of the remote so it's not sitting in .git/config
git -C ~/Projects/HireStream remote set-url origin https://github.com/microaistudio/hirestream.git
git -C ~/Projects/AgentryxVerify remote set-url origin https://github.com/microaistudio/agentryx-verify.git
```

## Step 4 — Install HireStream

```bash
cd ~/Projects/HireStream
npm install

cat > .env <<ENV
DATABASE_URL=postgresql://hirestream:hirestream@localhost:5432/hirestream
TEST_DATABASE_URL=postgresql://hirestream:hirestream@localhost:5432/hirestream_test
NODE_ENV=production
PORT=5000
APP_URL=https://{{DOMAIN_HIRESTREAM}}
ALLOWED_ORIGINS=https://{{DOMAIN_HIRESTREAM}}
SESSION_SECRET={{SESSION_SECRET_HIRESTREAM}}
# UAT-friendly during bring-up — tighten before go-live (see Step 10)
AUTH_RATE_LIMIT_MAX=200
ENV

npx drizzle-kit push --force
npx tsx scripts/seed.ts

npm run build
pm2 start dist/index.js --name hirestream
pm2 save
```

Verify the process is alive:

```bash
pm2 status                              # hirestream should be online
curl -sI http://127.0.0.1:5000/ | head -1  # expect HTTP/1.1 200 or 302
```

If it crashes, check `pm2 logs hirestream --lines 50` and stop.

## Step 5 — Install Agentryx Verify

```bash
cd ~/Projects/AgentryxVerify
npm install

cat > .env <<ENV
NODE_ENV=production
PORT=5002
DATABASE_URL=postgresql://hirestream:hirestream@localhost:5432/agentryx_verify
SESSION_SECRET={{SESSION_SECRET_VERIFY}}
APP_URL=https://{{DOMAIN_VERIFY}}
ALLOW_EMAIL_LOGIN=true
ENV

npx drizzle-kit push --force
npx tsx scripts/seed.ts             # FRS contracted scope (145 items)
npx tsx scripts/seed-v15-extras.ts  # beyond-FRS enhancements (83 items, 6 sections)

npm run build
pm2 start dist/index.js --name agentryx-verify
pm2 save
```

Verify:

```bash
pm2 status                              # agentryx-verify online
curl -sI http://127.0.0.1:5002/ | head -1
```

## Step 6 — Nginx vhost (HTTP only for now)

Write `/etc/nginx/sites-available/hirestream.conf`:

```nginx
server {
    listen 80;
    server_name {{DOMAIN_HIRESTREAM}};
    client_max_body_size 20m;
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name {{DOMAIN_VERIFY}};
    location / {
        proxy_pass http://127.0.0.1:5002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable + reload:

```bash
sudo ln -sf /etc/nginx/sites-available/hirestream.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## Step 7 — TLS via Let's Encrypt

```bash
sudo certbot --nginx \
  -d {{DOMAIN_HIRESTREAM}} \
  -d {{DOMAIN_VERIFY}} \
  --agree-tos -m {{LETSENCRYPT_EMAIL}} --redirect --non-interactive
```

Certbot rewrites the nginx config to add TLS + HTTP→HTTPS redirects. Renewal runs automatically via systemd timer; verify:

```bash
sudo systemctl list-timers | grep certbot   # expect a next-run time
```

## Step 8 — End-to-end smoke test

```bash
curl -sI https://{{DOMAIN_HIRESTREAM}}/        | head -1   # expect 200 or 302
curl -sI https://{{DOMAIN_VERIFY}}/            | head -1   # expect 200 or 302
curl -s https://{{DOMAIN_HIRESTREAM}}/api/health 2>/dev/null || true
```

Open each URL in a browser and log in with demo accounts:

**HireStream** (`https://{{DOMAIN_HIRESTREAM}}/auth`)

| Role | Username | Password |
|---|---|---|
| Super Admin | `superadmin` | `hpsedc@super2026` |
| Admin | `demo_admin` | `test123` |
| Agency | `demo_agent` | `test123` |
| Employer | `demo_employer` | `test123` |
| Candidate | `demo_candidate` | `test123` |

**Agentryx Verify** (`https://{{DOMAIN_VERIFY}}/login`)

| Role | Username | Password |
|---|---|---|
| Admin (all pipelines) | `admin` | `ulan@2026` |
| Agentryx Internal | `agentryx` | `ulan` |
| HTIS Reviewer | `htis` | `test123` |
| HPSEDC Staging | `hpsedc` | `test456` |
| HPSEDC Final UAT | `uat` | `test789` |

Non-admin Verify reviewers should see **only their own tab** — other pipeline stages are hidden. If they see all four tabs, the role-scoping regression check failed; investigate `client/src/pages/ProjectView.tsx` `LEVELS.filter(...)` block.

## Step 9 — Updating after future git pushes

```bash
# HireStream
cd ~/Projects/HireStream && git pull && npm install && npm run build && pm2 restart hirestream --update-env

# Agentryx Verify
cd ~/Projects/AgentryxVerify && git pull && npm install && npm run build && pm2 restart agentryx-verify --update-env
```

For schema changes also run `npx drizzle-kit push --force` before `npm run build`.

## Step 10 — Pre-production hardening checklist

Do **not** leave the VM in UAT defaults when you flip to production. Walk through this with the operator:

**HireStream `.env`:**
- [ ] `AUTH_RATE_LIMIT_MAX=20`
- [ ] `COOKIE_SECURE=true` (or remove — it defaults to true in `NODE_ENV=production`)
- [ ] Rotate `SESSION_SECRET` again if it was ever shared in chat

**HireStream application:**
- [ ] Change `superadmin` password from `hpsedc@super2026`
- [ ] Change all demo_* passwords or deactivate those accounts
- [ ] Admin → System Config → review the 21 runtime settings. At minimum flip the 4 pre-prod toggles listed in `A.PMD/Dev Plan Architecture & Phasing/06_System_Configuration_Reference.md`
- [ ] Configure SMTP if email notifications are needed
- [ ] Schedule `pg_dump` nightly backups

**Agentryx Verify `.env`:**
- [ ] Rotate `SESSION_SECRET`
- [ ] Once SMTP is wired and magic-links work, set `ALLOW_EMAIL_LOGIN=false` to force magic-link auth

**Agentryx Verify application:**
- [ ] Change `admin` password from `ulan@2026`

## Reporting back to the operator

When done, give the operator:
1. Both HTTPS URLs with a confirmed 200 response.
2. `pm2 status` output showing both processes online.
3. Anything that failed or was skipped (especially items from Step 10).
4. The new `superadmin` and `admin` passwords **if you rotated them** — via whatever secure channel the operator prefers, never in chat history.

If any step fails, stop and surface the error with the full command output. Do not paper over failures — a half-deployed pipeline is worse than a clean abort.

---END---
