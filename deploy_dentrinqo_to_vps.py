import subprocess
import os
import tarfile
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')

ROOT = r"C:\Users\yoges\.gemini\antigravity-ide\scratch\dentrinqo"
WEB_DIST = os.path.join(ROOT, "apps", "web", "dist")
API_DIST = os.path.join(ROOT, "apps", "api", "dist")
KEY_PATH = r"C:\Users\yoges\Downloads\ssh-key-2026-10-12.key"
HOST = "ubuntu@137.23.45.243"

TAR_WEB = os.path.join(ROOT, "web_dist.tar.gz")
TAR_API = os.path.join(ROOT, "api_dist.tar.gz")

print("==================================================================")
print("       DENTRINQO PRODUCTION DEPLOYMENT TO ORACLE VPS              ")
print("==================================================================")

# 1. Package Web dist
print(f"\n1. Packaging frontend from {WEB_DIST}...")
with tarfile.open(TAR_WEB, "w:gz") as tar:
    for root, dirs, files in os.walk(WEB_DIST):
        for file in files:
            full = os.path.join(root, file)
            rel = os.path.relpath(full, WEB_DIST)
            tar.add(full, arcname=rel)
print(f"✓ Created {TAR_WEB} ({os.path.getsize(TAR_WEB):,} bytes)")

# 2. Package API dist
print(f"\n2. Packaging backend from {API_DIST}...")
with tarfile.open(TAR_API, "w:gz") as tar:
    for root, dirs, files in os.walk(API_DIST):
        for file in files:
            full = os.path.join(root, file)
            rel = os.path.relpath(full, API_DIST)
            tar.add(full, arcname=rel)
print(f"✓ Created {TAR_API} ({os.path.getsize(TAR_API):,} bytes)")

# 3. Upload artifacts
print(f"\n3. Uploading build tarballs to VPS ({HOST})...")
cmd_scp = f'scp -i "{KEY_PATH}" -o StrictHostKeyChecking=no "{TAR_WEB}" "{TAR_API}" {HOST}:/tmp/'
res = subprocess.run(cmd_scp, shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace')
if res.returncode != 0:
    print("SCP FAILED:\n", res.stderr)
    sys.exit(1)
print("✓ Upload successful.")

# 4. Extract & Restart on VPS
print("\n4. Deploying to /var/www and restarting PM2 + Nginx on VPS...")
remote_bash = """
set -e
echo "--- Extracting API Dist ---"
sudo rm -rf /var/www/dental-api/dist/*
sudo tar -xzf /tmp/api_dist.tar.gz -C /var/www/dental-api/dist
sudo chown -R ubuntu:ubuntu /var/www/dental-api/dist

echo "--- Extracting AKS Web Dist ---"
sudo rm -rf /var/www/aks-web/*
sudo tar -xzf /tmp/web_dist.tar.gz -C /var/www/aks-web
sudo chown -R www-data:www-data /var/www/aks-web

echo "--- Extracting Jacobs Web Dist ---"
sudo rm -rf /var/www/jacobs-web/*
sudo tar -xzf /tmp/web_dist.tar.gz -C /var/www/jacobs-web
sudo chown -R www-data:www-data /var/www/jacobs-web

echo "--- Restarting PM2 dental-api ---"
pm2 restart dental-api

echo "--- Reloading Nginx ---"
sudo systemctl reload nginx

echo "--- Cleaning up /tmp ---"
rm -f /tmp/api_dist.tar.gz /tmp/web_dist.tar.gz

echo "DEPLOYMENT COMPLETED SUCCESSFULLY!"
"""

cmd_ssh = [
    'ssh', '-i', KEY_PATH,
    '-o', 'StrictHostKeyChecking=no',
    HOST,
    remote_bash
]
res = subprocess.run(cmd_ssh, capture_output=True, text=True, encoding='utf-8', errors='replace')
print("VPS STDOUT:\n", res.stdout)
if res.stderr:
    print("VPS STDERR:\n", res.stderr)

if res.returncode != 0:
    print("Deployment failed!")
    sys.exit(1)

# 5. Clean local tarballs
if os.path.exists(TAR_WEB):
    os.remove(TAR_WEB)
if os.path.exists(TAR_API):
    os.remove(TAR_API)

print("\n==================================================================")
print("✅ DENTRINQO SUCCESSFULLY DEPLOYED TO PRODUCTION VPS (137.23.45.243)")
print("==================================================================")
