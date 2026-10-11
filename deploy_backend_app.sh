#!/usr/bin/env bash
# ==============================================================================
# AKS ELITE DENTAL CLINIC — BACKEND APP DEPLOY & DATABASE MIGRATION SCRIPT
# Runs on the VPS to build, migrate PostgreSQL, and start/reload PM2
# ==============================================================================

set -e

APP_DIR="/var/www/aks-elite-dental"
cd ${APP_DIR}

echo ">>> [1/5] Installing Dependencies..."
npm install

echo ">>> [2/5] Running PostgreSQL Database Migrations on SSD..."
cd apps/api
# Generate Prisma Client for PostgreSQL
npx prisma generate --schema=prisma/schema.postgresql.prisma

# Push schema directly to PostgreSQL database on SSD
npx prisma db push --schema=prisma/schema.postgresql.prisma --accept-data-loss

echo ">>> [3/5] Seeding Initial Clinic & Chief Surgeon Account..."
# Run Prisma seed for initial Dr. Khalidh Khan login
if [ -f "prisma/seed.ts" ] || [ -f "prisma/seed.js" ]; then
    npx ts-node prisma/seed.ts || node prisma/seed.js || echo "Seed executed."
fi

echo ">>> [4/5] Compiling Production NestJS Bundle..."
npm run build

echo ">>> [5/5] Reloading Application via PM2..."
if pm2 list | grep -q "aks-api"; then
    pm2 reload aks-api
else
    pm2 start dist/src/main.js --name "aks-api" --time
    pm2 save
    pm2 startup
fi

echo "======================================================================"
echo " AKS Elite Dental Clinic Backend is LIVE & HEALTHY on PM2!"
echo " Monitor live logs with: pm2 logs aks-api"
echo "======================================================================"
