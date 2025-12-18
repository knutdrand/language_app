#!/bin/bash
# Language App - Update Script
# Run this to deploy latest changes from GitHub
# Usage: sudo bash update-server.sh

set -e

echo "=== Updating Language App ==="

cd /var/www/language_app

# Pull latest changes
echo "[1/4] Pulling latest changes..."
sudo -u www-data git pull

# Update dependencies if needed
echo "[2/4] Updating dependencies..."
cd backend
sudo -u www-data .venv/bin/pip install -r requirements.txt

# Restart service
echo "[3/4] Restarting service..."
systemctl restart language-app

# Check status
echo "[4/4] Checking status..."
sleep 2
systemctl status language-app --no-pager
echo ""
curl -s http://localhost:8001/health
echo ""
echo "=== Update Complete ==="
