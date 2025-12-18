#!/bin/bash
# Language App - Server Setup Script
# Run this on your DigitalOcean droplet (68.183.12.6)
# Usage: bash setup-server.sh

set -e  # Exit on error

echo "=== Language App Server Setup ==="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (sudo bash setup-server.sh)"
    exit 1
fi

# 1. Install dependencies
echo "[1/7] Installing system dependencies..."
apt update
apt install -y python3 python3-venv python3-dev git nginx

# 2. Create app directory
echo "[2/7] Creating app directory..."
mkdir -p /var/www/language_app
chown www-data:www-data /var/www/language_app

# 3. Clone repository (as www-data)
echo "[3/7] Cloning repository..."
if [ -d "/var/www/language_app/.git" ]; then
    echo "Repository already exists, pulling latest..."
    cd /var/www/language_app
    sudo -u www-data git pull
else
    sudo -u www-data git clone https://github.com/knutdrand/language_app.git /var/www/language_app
fi

# 4. Setup Python virtual environment
echo "[4/7] Setting up Python environment..."
cd /var/www/language_app/backend
sudo -u www-data python3 -m venv .venv
sudo -u www-data .venv/bin/pip install --upgrade pip
sudo -u www-data .venv/bin/pip install -r requirements.txt

# 5. Create data directory
echo "[5/7] Creating data directory..."
mkdir -p /var/www/language_app/backend/data
chown www-data:www-data /var/www/language_app/backend/data

# 6. Setup systemd service
echo "[6/7] Setting up systemd service..."
cp /var/www/language_app/deploy/language-app.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable language-app

# 7. Setup nginx
echo "[7/7] Setting up nginx..."
cp /var/www/language_app/deploy/language-app.nginx /etc/nginx/sites-available/language-app
ln -sf /etc/nginx/sites-available/language-app /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Create /var/www/language_app/backend/.env with your config"
echo "   (see deploy/server.env.template)"
echo ""
echo "2. Edit nginx config if using a domain:"
echo "   sudo nano /etc/nginx/sites-available/language-app"
echo ""
echo "3. Start the service:"
echo "   sudo systemctl start language-app"
echo ""
echo "4. Check status:"
echo "   sudo systemctl status language-app"
echo "   curl http://localhost:8001/health"
echo ""
echo "5. For SSL (if using domain):"
echo "   sudo apt install certbot python3-certbot-nginx"
echo "   sudo certbot --nginx -d language-api.yourdomain.com"
