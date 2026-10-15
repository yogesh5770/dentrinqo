#!/usr/bin/env python3
"""
Dentrinqo Multi-Tenant SaaS - Universal Multi-Clinic Deployer
============================================================
Deploys updated frontend and backend builds to the VPS and automatically
syncs all existing clinic web roots (/var/www/*-web) while safely preserving
each clinic's unique branding, favicon, and WhatsApp OpenGraph tags.

Usage:
    python scripts/ops/deploy_all_clinics.py
"""

import subprocess
import os
import tarfile
import sys

sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
WEB_DIST = os.path.join(ROOT, "apps", "web", "dist")
API_DIST = os.path.join(ROOT, "apps", "api", "dist")
KEY_PATH = r"C:\Users\yoges\Downloads\ssh-key-2026-10-12.key"
HOST = "ubuntu@137.23.45.243"

TAR_WEB = os.path.join(ROOT, "scratch", "web_dist.tar.gz")
TAR_API = os.path.join(ROOT, "scratch", "api_dist.tar.gz")

os.makedirs(os.path.join(ROOT, "scratch"), exist_ok=True)

print("=" * 70)
print("      DENTRINQO UNIVERSAL MULTI-CLINIC PRODUCTION DEPLOYMENT       ")
print("=" * 70)

# Check build directories
if not os.path.exists(WEB_DIST) or not os.path.exists(os.path.join(WEB_DIST, "index.html")):
    print(f"ERROR: Frontend build not found at {WEB_DIST}. Run 'npm run build' in apps/web first.")
    sys.exit(1)

if not os.path.exists(API_DIST) or not os.path.exists(os.path.join(API_DIST, "main.js")):
    print(f"ERROR: Backend build not found at {API_DIST}. Run 'npm run build' in apps/api first.")
    sys.exit(1)

# 1. Package Web dist
print(f"\n[1/4] Packaging frontend from {WEB_DIST}...")
with tarfile.open(TAR_WEB, "w:gz") as tar:
    for r, dirs, files in os.walk(WEB_DIST):
        for f in files:
            full = os.path.join(r, f)
            rel = os.path.relpath(full, WEB_DIST)
            tar.add(full, arcname=rel)
print(f"✓ Created {TAR_WEB} ({os.path.getsize(TAR_WEB):,} bytes)")

# 2. Package API dist
print(f"\n[2/4] Packaging backend from {API_DIST}...")
with tarfile.open(TAR_API, "w:gz") as tar:
    for r, dirs, files in os.walk(API_DIST):
        for f in files:
            full = os.path.join(r, f)
            rel = os.path.relpath(full, API_DIST)
            tar.add(full, arcname=rel)
print(f"✓ Created {TAR_API} ({os.path.getsize(TAR_API):,} bytes)")

# 3. Upload artifacts
print(f"\n[3/4] Uploading build tarballs to VPS ({HOST})...")
cmd_scp = f'scp -i "{KEY_PATH}" -o StrictHostKeyChecking=no "{TAR_WEB}" "{TAR_API}" {HOST}:/tmp/'
res = subprocess.run(cmd_scp, shell=True, capture_output=True, text=True, encoding='utf-8', errors='replace')
if res.returncode != 0:
    print("SCP FAILED:\n", res.stderr)
    sys.exit(1)
print("✓ Upload successful.")

# 4. Deploy & sync across all clinics
print("\n[4/4] Deploying to backend and synchronizing all clinic web roots...")

deploy_script = """
import os, glob, shutil, subprocess, tarfile, re

print("--- 1. Updating Dental API ---")
api_dist = "/var/www/dental-api/dist"
shutil.rmtree(api_dist, ignore_errors=True)
os.makedirs(api_dist, exist_ok=True)
with tarfile.open("/tmp/api_dist.tar.gz", "r:gz") as tar:
    tar.extractall(api_dist)
subprocess.run(["sudo", "chown", "-R", "ubuntu:ubuntu", api_dist], check=True)
print("✓ Backend dist updated.")

print("--- 2. Unpacking Fresh Frontend Build ---")
tmp_web = "/tmp/new_web_dist"
shutil.rmtree(tmp_web, ignore_errors=True)
os.makedirs(tmp_web, exist_ok=True)
with tarfile.open("/tmp/web_dist.tar.gz", "r:gz") as tar:
    tar.extractall(tmp_web)

with open(os.path.join(tmp_web, "index.html"), "r") as f:
    fresh_html = f.read()

# Extract fresh JS and CSS script/link tags
script_tags = re.findall(r'<script.*?</script>', fresh_html)
css_tags = re.findall(r'<link rel="stylesheet".*?>', fresh_html)

# Find all clinic web roots: /var/www/*-web
clinic_roots = sorted(glob.glob("/var/www/*-web"))
print(f"Found {len(clinic_roots)} clinic web roots: {[os.path.basename(c) for c in clinic_roots]}")

for croot in clinic_roots:
    cname = os.path.basename(croot)
    print(f"  -> Updating {cname}...")

    # 1. Update /assets folder
    croot_assets = os.path.join(croot, "assets")
    shutil.rmtree(croot_assets, ignore_errors=True)
    shutil.copytree(os.path.join(tmp_web, "assets"), croot_assets)

    # 2. Update index.html script & css references while strictly preserving existing metadata & OpenGraph tags
    index_path = os.path.join(croot, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r") as f:
            existing_html = f.read()

        # Update script tags
        existing_html = re.sub(r'<script type="module" crossorigin src="/assets/[^"]+"></script>', '', existing_html)
        existing_html = re.sub(r'<link rel="stylesheet" crossorigin href="/assets/[^"]+">', '', existing_html)

        # Inject new tags before </head> or </body>
        for css in css_tags:
            existing_html = existing_html.replace('</head>', f'    {css}\n  </head>')
        for scr in script_tags:
            existing_html = existing_html.replace('</body>', f'    {scr}\n  </body>')

        with open(index_path, "w") as f:
            f.write(existing_html)
    else:
        shutil.copy(os.path.join(tmp_web, "index.html"), index_path)

    # 3. Ensure permissions
    subprocess.run(["sudo", "chown", "-R", "www-data:www-data", croot], check=True)

# Clean up temporary build
shutil.rmtree(tmp_web, ignore_errors=True)
print("✓ All clinic web roots synchronized with new assets.")

print("--- 3. Restarting PM2 dental-api ---")
subprocess.run(["sudo", "-u", "ubuntu", "pm2", "restart", "dental-api", "--update-env"], check=True)

print("--- 4. Testing & Reloading Nginx ---")
subprocess.run(["sudo", "nginx", "-t"], check=True)
subprocess.run(["sudo", "systemctl", "reload", "nginx"], check=True)

# Remove uploaded tarballs
if os.path.exists("/tmp/api_dist.tar.gz"): os.remove("/tmp/api_dist.tar.gz")
if os.path.exists("/tmp/web_dist.tar.gz"): os.remove("/tmp/web_dist.tar.gz")

print("✓ Deployment complete and verified across all clinics.")
"""

cmd_ssh = [
    'ssh', '-i', KEY_PATH,
    '-o', 'StrictHostKeyChecking=no',
    HOST,
    'sudo python3'
]

proc = subprocess.run(cmd_ssh, input=deploy_script.encode('utf-8'), capture_output=True)
print("STDOUT:\n", proc.stdout.decode('utf-8', errors='ignore'))
if proc.stderr:
    print("STDERR:\n", proc.stderr.decode('utf-8', errors='ignore'))

if proc.returncode != 0:
    print("Deployment failed!")
    sys.exit(1)

# Clean up local tarballs
if os.path.exists(TAR_WEB): os.remove(TAR_WEB)
if os.path.exists(TAR_API): os.remove(TAR_API)

print("=" * 70)
print("🎉 ALL HOSPITALS DEPLOYED AND LIVE WITH LATEST BUNDLES!")
print("=" * 70)
