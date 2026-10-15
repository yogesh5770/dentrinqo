#!/usr/bin/env bash
set -e

APP_DIR="/var/www/aks-elite-dental"
echo ">>> [1/7] Extracting backend code to ${APP_DIR}..."
mkdir -p ${APP_DIR}
rm -rf ${APP_DIR}/dist
tar --overwrite -xzf /home/ubuntu/aks-backend.tar.gz -C ${APP_DIR}
cd ${APP_DIR}

echo ">>> [2/7] Writing Production .env file..."
cat << 'EOF' > ${APP_DIR}/.env
PORT=3001
NODE_ENV=production
DATABASE_URL="postgresql://aks_admin:AksEliteDentalPass2026!@localhost:5432/aks_dental_prod?schema=public"
JWT_SECRET="aks-elite-jwt-secure-super-key-madurai-2026-production"
COOKIE_SECRET="aks-cookie-secret-production-random-key-902834"
SESSION_EXPIRY_SECONDS=28800
CORS_ORIGIN="http://localhost:5173,https://akselitedental.pages.dev,https://app.akselitedental.com,http://13.201.121.18"
EOF

echo ">>> [3/7] Configuring PostgreSQL Prisma schema..."
# Copy postgresql schema as primary schema.prisma
cp ${APP_DIR}/prisma/schema.postgresql.prisma ${APP_DIR}/prisma/schema.prisma

echo ">>> [4/7] Installing production dependencies on Linux..."
npm install

echo ">>> [5/7] Pushing schema to PostgreSQL on SSD..."
npx prisma generate
npx prisma db push --accept-data-loss

echo ">>> [6/7] Seeding Clinic & Staff Accounts in PostgreSQL..."
npx ts-node prisma/seed.ts

echo ">>> [7/7] Compiling NestJS and starting with PM2..."
npm run build
pm2 delete aks-api 2>/dev/null || true
pm2 start dist/src/main.js --name "aks-api" --time
pm2 save
pm2 startup systemd -u ubuntu --hp /home/ubuntu || true

echo "======================================================================"
echo " AKS ELITE DENTAL BACKEND IS LIVE ON PORT 3001 & NGINX PORT 80!"
echo "======================================================================"
pm2 status
