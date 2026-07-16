# HP Overseas Job Portal - System Requirements

## Server Requirements

### Minimum System Specifications
- **CPU**: 1 vCPU (2+ recommended)
- **RAM**: 512MB (1GB+ recommended)
- **Storage**: 2GB free space
- **OS**: Ubuntu 18.04+, CentOS 7+, or any Linux distribution with Node.js support

### Software Dependencies

#### Required Software
1. **Node.js** (version 18.0.0 or higher)
2. **npm** (comes with Node.js)

#### Optional (but recommended)
1. **PM2** - Process manager for production
2. **Nginx** - Reverse proxy for domain/SSL setup
3. **Git** - For code deployment

## Installation Commands

### Ubuntu/Debian Systems
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install Nginx (optional)
sudo apt install nginx

# Install Git (optional)
sudo apt install git
```

### CentOS/RHEL Systems
```bash
# Update system
sudo yum update -y

# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install Nginx (optional)
sudo yum install nginx

# Install Git (optional)
sudo yum install git
```

## Network Requirements

### Firewall Ports
- **Port 5000** - Application default port (configurable)
- **Port 80** - HTTP (if using Nginx)
- **Port 443** - HTTPS (if using SSL)

### Firewall Configuration
```bash
# Ubuntu/Debian (UFW)
sudo ufw allow 5000
sudo ufw allow 80
sudo ufw allow 443

# CentOS/RHEL (Firewalld)
sudo firewall-cmd --permanent --add-port=5000/tcp
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --reload
```

## Application Dependencies

All Node.js dependencies are automatically installed via:
```bash
npm install
```

The `package.json` file contains all required packages including:
- React frontend framework
- Express.js backend server
- Vite build tool
- UI component libraries
- TypeScript support

## Performance Recommendations

### For Small Deployments (Demo/Testing)
- 1 vCPU, 1GB RAM
- Single server instance

### For Production Use
- 2+ vCPU, 2GB+ RAM
- Load balancer for multiple instances
- Database server (PostgreSQL)
- Redis for session storage
- SSL certificate

## Monitoring

### System Monitoring
```bash
# Check system resources
htop
df -h
free -h

# Check application status (with PM2)
pm2 status
pm2 logs
```

### Application Logs
Logs are available through:
- PM2: `pm2 logs hp-job-portal`
- Direct: Application outputs to console

## Security Considerations

1. **Keep Node.js updated** to latest LTS version
2. **Configure firewall** to only allow necessary ports
3. **Use SSL/TLS** for production deployment
4. **Regular system updates** for security patches
5. **Non-root user** for running the application

## Backup Requirements

For demo version:
- Source code backup (Git repository recommended)
- Configuration files (.env if used)

For production version:
- Database backups
- Application data
- SSL certificates
- Configuration files