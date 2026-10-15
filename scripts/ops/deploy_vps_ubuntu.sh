#!/usr/bin/env bash
# ==============================================================================
# AKS ELITE DENTAL CLINIC — PRODUCTION VPS DEPLOYMENT AUTOMATOR
# OS: Ubuntu 22.04 / 24.04 LTS (x64)
# Target: 2GB RAM / 2 vCPU / 60GB SSD VPS
# Clinic: AKS Elite Dental Clinic, Dr. Khalidh Khan (BDS, MDS), Madurai
# ==============================================================================

set -e
export DEBIAN_FRONTEND=noninteractive

echo "======================================================================"
echo " Starting Automated Production Deployment for AKS Elite Dental Clinic"
echo "======================================================================"

# 1. Update system packages
echo ">>> [1/9] Updating system packages..."
apt-get update -y
apt-get install -y curl wget git build-essential nginx certbot python3-certbot-nginx ufw

# 2. Configure 2GB Swap file on SSD for rock-solid stability
echo ">>> [2/9] Configuring 2GB SSD swap space..."
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "vm.swappiness=20" >> /etc/sysctl.conf
    echo "vm.vfs_cache_pressure=50" >> /etc/sysctl.conf
    sysctl -p
    echo "Swap configured successfully."
else
    echo "Swap file already exists, skipping."
fi

# 3. Install Node.js 20 LTS & PM2
echo ">>> [3/9] Installing Node.js 20 LTS & PM2..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
npm install -g pm2

echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# 4. Install & Configure PostgreSQL 16 on SSD
echo ">>> [4/9] Installing and configuring PostgreSQL on SSD..."
apt-get install -y postgresql postgresql-contrib

DB_NAME="aks_dental_prod"
DB_USER="aks_admin"
DB_PASS="AksEliteDentalPass2026!"

systemctl start postgresql
systemctl enable postgresql

# Create database and user if not exists
sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1 || \
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME};"

sudo -u postgres psql -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}'; END IF; END \$\$;"
sudo -u postgres psql -c "ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASS}';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
sudo -u postgres psql -c "ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};"

echo "PostgreSQL configured with database: ${DB_NAME}"

# 5. Application Directory Setup
echo ">>> [5/9] Setting up Application Directory..."
APP_DIR="/var/www/aks-elite-dental"
mkdir -p ${APP_DIR}
mkdir -p /var/backups/aks_dental
chown -R ubuntu:ubuntu ${APP_DIR}

# 6. Automated Daily Database Backup Script & Cron
echo ">>> [6/9] Configuring Automated Nightly Database Backups..."
cat << 'BACKUP_SCRIPT' > /usr/local/bin/aks_backup_db.sh
#!/bin/bash
BACKUP_DIR="/var/backups/aks_dental"
DATE=$(date +'%Y-%m-%d_%H%M%S')
BACKUP_FILE="${BACKUP_DIR}/aks_dental_backup_${DATE}.sql.gz"

mkdir -p ${BACKUP_DIR}
sudo -u postgres pg_dump aks_dental_prod | gzip > "${BACKUP_FILE}"

# Enforce file permissions
chmod 600 "${BACKUP_FILE}"

# Retain only last 30 days of daily backups to preserve SSD space
find ${BACKUP_DIR} -name "aks_dental_backup_*.sql.gz" -mtime +30 -delete

echo "[$(date)] Backup completed: ${BACKUP_FILE}" >> /var/log/aks_backup.log
BACKUP_SCRIPT

chmod +x /usr/local/bin/aks_backup_db.sh

# Run daily at 02:00 AM IST
(crontab -l 2>/dev/null | grep -v "aks_backup_db.sh" ; echo "0 2 * * * /usr/local/bin/aks_backup_db.sh") | crontab -

# 7. Configure Nginx Reverse Proxy (responds to domain, server IP and wildcard)
echo ">>> [7/9] Configuring Nginx reverse proxy..."
cat << 'NGINX_CONF' > /etc/nginx/sites-available/aks-api
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name api.akselitedental.com 13.201.121.18 _;

    client_max_body_size 50M;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 90;
    }
}
NGINX_CONF

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/aks-api /etc/nginx/sites-enabled/aks-api
nginx -t && systemctl reload nginx

# 8. Configure Firewall (UFW)
echo ">>> [8/9] Configuring Firewall (UFW)..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw allow 3001/tcp
ufw --force enable

echo "======================================================================"
echo " VPS SERVER ENVIRONMENT READY FOR AKS ELITE DENTAL CLINIC!"
echo "======================================================================"
