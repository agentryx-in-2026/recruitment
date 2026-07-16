#!/bin/bash

# HP Overseas Job Portal - VM Deployment Script
# Run this script on your VM after transferring the files

echo "🚀 Starting HP Overseas Job Portal deployment..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"
echo "✅ npm version: $(npm --version)"

# Check if deployment package exists and extract it
if [ -f "hp-job-portal-deployment.tar.gz" ]; then
    echo "📦 Extracting deployment package..."
    tar -xzf hp-job-portal-deployment.tar.gz
    if [ $? -ne 0 ]; then
        echo "❌ Failed to extract deployment package"
        exit 1
    fi
    echo "✅ Files extracted successfully"
else
    echo "⚠️  hp-job-portal-deployment.tar.gz not found in current directory"
    echo "   Make sure you uploaded the deployment package first"
    echo "   Current directory contents:"
    ls -la
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Build the application
echo "🔨 Building application for production..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build completed successfully!"

# Optional: Install PM2 for production management
read -p "Do you want to install PM2 for production management? (y/n): " install_pm2
if [ "$install_pm2" = "y" ] || [ "$install_pm2" = "Y" ]; then
    echo "📦 Installing PM2..."
    sudo npm install -g pm2
    echo "✅ PM2 installed. You can start the app with: pm2 start npm --name 'hp-job-portal' -- start"
fi

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "To start the application:"
echo "  npm start"
echo ""
echo "Or with PM2:"
echo "  pm2 start npm --name 'hp-job-portal' -- start"
echo ""
echo "The application will be available at:"
echo "  http://your-vm-ip:5000"
echo ""
echo "To check if it's running:"
echo "  curl http://localhost:5000"