# Staging VM Setup — HireStream + Agentryx Verify

**Goal:** reproduce the full stack (HireStream portal + Agentryx Verify) on a fresh Ubuntu 22.04+ VM.

**Assumed resources:**
- Ubuntu 22.04 LTS or newer
- 4 GB RAM minimum, 20 GB disk
- Root or sudo access
- A domain you control (both subdomains A-record to this VM)

---

## 1. Base system

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git build-essential nginx postgresql postgresql-contrib certbot python3-certbot-nginx

# Node 20 (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PM2 process manager
sudo npm install -g pm2
pm2 startup systemd -u $USER --hp $HOME
```

## 2. PostgreSQL

```bash
sudo -u postgres psql <<'SQL'
CREATE USER hirestream WITH PASSWORD 'hirestream';
CREATE DATABASE hirestream OWNER hirestream;
CREATE DATABASE hirestream_test OWNER hirestream;
CREATE DATABASE agentryx_verify OWNER hirestream;
SQL
```

## 3. Clone both repos

```bash
mkdir -p ~/Projects && cd ~/Projects

# Use SSH (requires your SSH key on GitHub)
git clone git@github.com:AGENTRYX/hirestream.git HireStream
git clone git@github.com:AGENTRYX/agentryx-verify.git AgentryxVerify
```

## 4. HireStream

```bash
cd ~/Projects/HireStream

# Install dependencies
npm install

# Create .env (adjust values for this VM)
cat > .env <<'ENV'
DATABASE_URL=postgresql://hirestream:hirestream@localhost:5432/hirestream
NODE_ENV=production
PORT=5000
TEST_DATABASE_URL=postgresql://hirestream:hirestream@localhost:5432/hirestream_test
APP_URL=https://hirestream.STAGING-DOMAIN.dev
ALLOWED_ORIGINS=https://hirestream.STAGING-DOMAIN.dev
# COOKIE_SECURE=false        # uncomment if serving HTTP before TLS is issued
# AUTH_RATE_LIMIT_MAX=200    # UAT-friendly; tighten to 20 for prod
ENV

# Push schema to DB + seed demo data
npx drizzle-kit push --force
npx tsx scripts/seed.ts

# Build + start under PM2
npm run build
pm2 start dist/index.js --name hirestream
pm2 save
```

## 5. Agentryx Verify

```bash
cd ~/Projects/AgentryxVerify

npm install

cat > .env <<'ENV'
NODE_ENV=production
PORT=5002
DATABASE_URL=postgresql://hirestream:hirestream@localhost:5432/agentryx_verify
SESSION_SECRET=change-this-to-a-long-random-string
APP_URL=https://verify.STAGING-DOMAIN.dev
ALLOW_EMAIL_LOGIN=true
ENV

npx drizzle-kit push --force
npx tsx scripts/seed.ts
npx tsx scripts/seed-v15-extras.ts

npm run build
pm2 start dist/index.js --name agentryx-verify
pm2 save
```

## 6. Nginx vhost

Create `/etc/nginx/sites-available/hirestream.conf`:

```nginx
# Redirect legacy/typo domains here if desired

server {
    listen 80;
    server_name hirestream.STAGING-DOMAIN.dev;
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
    server_name verify.STAGING-DOMAIN.dev;
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

Enable + reload + TLS:

```bash
sudo ln -sf /etc/nginx/sites-available/hirestream.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Issue certs (DNS must already resolve to this VM)
sudo certbot --nginx \
  -d hirestream.STAGING-DOMAIN.dev \
  -d verify.STAGING-DOMAIN.dev \
  --agree-tos -m YOUR_EMAIL
```

## 7. Verify it's up

```bash
pm2 status
curl -sI https://hirestream.STAGING-DOMAIN.dev/
curl -sI https://verify.STAGING-DOMAIN.dev/
```

## 8. Seeded accounts (remember to change these for staging/prod)

**HireStream** (`https://hirestream.STAGING-DOMAIN.dev/auth`):
- `superadmin` / `hpsedc@super2026` — full system control
- `demo_admin` / `test123` — HPSEDC admin view
- `demo_agent` / `test123` — recruitment agency
- `demo_employer` / `test123` — overseas employer
- `demo_candidate` / `test123` — job seeker

**Agentryx Verify** (`https://verify.STAGING-DOMAIN.dev/login`):
- `admin` / `ulan@2026` — sees all sign-off pipelines
- `agentryx` / `ulan` — Agentryx internal review stage
- `htis` / `test123` — HTIS review stage
- `hpsedc` / `test456` — HPSEDC staging stage
- `uat` / `test789` — HPSEDC final UAT stage

## 9. Updating after a git push

```bash
# HireStream
cd ~/Projects/HireStream && git pull && npm install && npm run build && pm2 restart hirestream --update-env

# Agentryx Verify
cd ~/Projects/AgentryxVerify && git pull && npm install && npm run build && pm2 restart agentryx-verify --update-env
```

For schema changes, also run `npx drizzle-kit push --force` before the build.

## 10. Production checklist (before go-live)

**HireStream:**
- [ ] Rotate `SESSION_SECRET` to a long random string
- [ ] Change superadmin password from `hpsedc@super2026`
- [ ] Change all demo passwords (or disable the demo accounts)
- [ ] Set `AUTH_RATE_LIMIT_MAX=20` in `.env`
- [ ] Set `COOKIE_SECURE=true` (or remove — defaults to true when `NODE_ENV=production`)
- [ ] Admin → System Config → flip 4 pre-prod toggles (see `06_System_Configuration_Reference.md`)
- [ ] Test SMTP if you want email notifications working
- [ ] PostgreSQL backups scheduled (`pg_dump` nightly)

**Agentryx Verify:**
- [ ] Rotate `SESSION_SECRET`
- [ ] Change `admin` password
- [ ] Set `ALLOW_EMAIL_LOGIN=false` once SMTP is wired and magic-link flow is active

---

**Total setup time on a fresh VM:** ~25 minutes if DNS is already pointed.
