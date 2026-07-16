# HP Overseas Job Portal - VM Deployment Guide

## Prerequisites on Your VM

1. **Node.js** (version 18 or higher)
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Git** (to clone the repository)
   ```bash
   sudo apt-get install git
   ```

3. **PM2** (for process management)
   ```bash
   npm install -g pm2
   ```

## Deployment Steps

### 1. Prepare the Application for Production

The app is already configured to work in production mode. The key files are:
- `package.json` - Contains all dependencies
- `vite.config.ts` - Handles frontend build and backend serving
- `server/index.ts` - Main server file

### 2. Clone/Upload Your Code to VM

Option A - If using Git:
```bash
git clone <your-repository-url>
cd hp-overseas-job-portal
```

Option B - If uploading directly:
```bash
# Upload your project folder to the VM
scp -r ./your-project-folder user@your-vm-ip:/path/to/deployment/
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Build for Production
```bash
npm run build
```

### 5. Start the Application

Option A - Simple start:
```bash
npm start
```

Option B - Using PM2 (recommended for production):
```bash
pm2 start npm --name "hp-job-portal" -- start
pm2 save
pm2 startup
```

### 6. Configure Reverse Proxy (Optional but Recommended)

If you want to use a custom domain or run on port 80/443, set up Nginx:

```nginx
# /etc/nginx/sites-available/hp-job-portal
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/hp-job-portal /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Environment Configuration

The application uses these environment variables (all optional for demo):
- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment mode (set to 'production')

Create a `.env` file if needed:
```bash
NODE_ENV=production
PORT=5000
```

## Firewall Configuration

Make sure your VM allows traffic on the required port:
```bash
# For Ubuntu/Debian
sudo ufw allow 5000
# Or if using Nginx on port 80
sudo ufw allow 80
sudo ufw allow 443
```

## Monitoring and Logs

With PM2, you can monitor the application:
```bash
pm2 status          # Check status
pm2 logs hp-job-portal  # View logs
pm2 restart hp-job-portal  # Restart app
pm2 stop hp-job-portal     # Stop app
```

## Accessing Your Application

Once deployed, access your application at:
- Direct: `http://your-vm-ip:5000`
- With Nginx: `http://your-domain.com`

## Notes

- This demo version uses in-memory storage, so data resets on restart
- For production use, you'd want to add a real database (PostgreSQL)
- All the UI and workflows will work exactly as in the demo
- The application is responsive and works on mobile devices