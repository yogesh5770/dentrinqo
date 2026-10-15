#!/usr/bin/env bash
set -e

DOMAIN="aksdental.duckdns.org"
WEB_DIR="/var/www/aks-web"
APP_DIR="/var/www/aks-elite-dental"

echo "======================================================================"
echo " Setting up DuckDNS Domain & Free SSL for: ${DOMAIN}"
echo "======================================================================"

echo ">>> [1/6] Extracting frontend assets to ${WEB_DIR}..."
mkdir -p ${WEB_DIR}
rm -rf ${WEB_DIR}/*
tar -xzf /home/ubuntu/aks-frontend.tar.gz -C ${WEB_DIR}
chown -R www-data:www-data ${WEB_DIR}

echo ">>> [2/6] Updating backend .env with DuckDNS domain..."
sed -i 's|CORS_ORIGIN=.*|CORS_ORIGIN="http://localhost:5173,https://aksdental.duckdns.org,http://aksdental.duckdns.org,https://akselitedental.pages.dev,http://13.201.121.18"|g' ${APP_DIR}/.env
sed -i 's|FRONTEND_URL=.*|FRONTEND_URL="https://aksdental.duckdns.org"|g' ${APP_DIR}/.env
grep -q "FRONTEND_URL=" ${APP_DIR}/.env || echo 'FRONTEND_URL="https://aksdental.duckdns.org"' >> ${APP_DIR}/.env

echo ">>> [3/6] Configuring Nginx to serve both Frontend & Backend API..."
cat << 'EOF' > /etc/nginx/sites-available/aks-dental
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name aksdental.duckdns.org 13.201.121.18 _;

    client_max_body_size 50M;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;

    # Frontend SPA Web App
    root /var/www/aks-web;
    index index.html;

    # Backend API Proxy
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static Assets with long cache
    location ~* \.(?:css|js|jpg|jpeg|gif|png|ico|cur|gz|svg|svgz|mp4|ogg|ogv|webm|htc|woff2|woff)$ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files $uri =404;
    }

    # Frontend SPA Route Fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

ln -sf /etc/nginx/sites-available/aks-dental /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-enabled/aks-api 2>/dev/null || true

nginx -t
systemctl reload nginx

echo ">>> [4/6] Installing Certbot and issuing Free SSL (Let's Encrypt)..."
DEBIAN_FRONTEND=noninteractive apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y certbot python3-certbot-nginx

echo ">>> [5/6] Obtaining SSL certificate for ${DOMAIN}..."
certbot --nginx \
    -d ${DOMAIN} \
    --non-interactive \
    --agree-tos \
    -m yogesh234456@gmail.com \
    --redirect

echo ">>> [6/6] Reloading PM2 and Nginx..."
cd ${APP_DIR}
pm2 reload aks-api --update-env
systemctl reload nginx

echo "======================================================================"
echo " 🎉 SUCCESS! AKS ELITE DENTAL CLINIC IS LIVE WITH HTTPS AT:"
echo " 🌐 https://${DOMAIN}"
echo "======================================================================"
