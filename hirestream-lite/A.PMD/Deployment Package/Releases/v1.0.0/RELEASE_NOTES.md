# HireStream v2.0.0 — Release Notes

**Release Date:** 2026-04-13
**Release Type:** major
**Previous Version:** v1.0.0

## Install

### First-time install:
```bash
tar -xzf hirestream-v2.0.0.tar.gz
cd hirestream-v2.0.0
sudo bash scripts/install.sh
```

### Upgrade existing:
```bash
tar -xzf hirestream-v2.0.0.tar.gz
cd hirestream-v2.0.0
bash scripts/upgrade.sh
```

### Hotfix only:
```bash
tar -xzf hirestream-v2.0.0.tar.gz
cd hirestream-v2.0.0
bash scripts/hotfix.sh
```

## Verify
```bash
curl http://localhost:5000/api/v1/admin/health
```

## Rollback
```bash
bash /opt/hirestream/scripts/rollback.sh
```
