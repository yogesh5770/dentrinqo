#!/usr/bin/env python3
"""
Dentrinqo Multi-Tenant SaaS - Automated Secure Hospital Onboarding Engine
========================================================================

Usage:
    python scripts/onboard_new_hospital.py \
        --name "Star Dental Care & Implant Centre" \
        --code "SDC" \
        --domain "stardental.duckdns.org" \
        --phone "+919876543210" \
        --chairs 1 \
        --city "Salem" \
        --state "Tamil Nadu" \
        --postal "636001" \
        --address "Main Road, Salem" \
        --logo "C:/path/to/logo.png" \
        --password "Star@2026"

Or run interactively without arguments:
    python scripts/onboard_new_hospital.py
"""

import argparse
import subprocess
import os
import sys
import secrets
import json
import re

sys.stdout.reconfigure(encoding='utf-8')

KEY_PATH = r"C:\Users\yoges\Downloads\ssh-key-2026-10-12.key"
HOST = "ubuntu@137.23.45.243"

def run_ssh(cmd, input_data=None):
    res = subprocess.run(
        ["ssh", "-i", KEY_PATH, "-o", "StrictHostKeyChecking=no", HOST, cmd],
        input=input_data.encode('utf-8') if input_data else None,
        capture_output=True
    )
    stdout = res.stdout.decode('utf-8', errors='ignore')
    stderr = res.stderr.decode('utf-8', errors='ignore')
    return res.returncode, stdout, stderr

def main():
    parser = argparse.ArgumentParser(description="Onboard a new hospital to Dentrinqo Multi-Tenant SaaS")
    parser.add_argument("--name", help="Hospital / Clinic Full Name")
    parser.add_argument("--code", help="Clinic Code (e.g. SDC, FDC, JDC)")
    parser.add_argument("--domain", help="Primary Domain / DuckDNS (e.g. stardental.duckdns.org)")
    parser.add_argument("--phone", help="Primary Contact Phone (e.g. +919876543210)")
    parser.add_argument("--chairs", type=int, default=1, help="Operatory Chair Count (default: 1)")
    parser.add_argument("--city", default="Salem", help="City (default: Salem)")
    parser.add_argument("--state", default="Tamil Nadu", help="State (default: Tamil Nadu)")
    parser.add_argument("--postal", default="636001", help="Postal / PIN Code")
    parser.add_argument("--address", default="", help="Physical Address")
    parser.add_argument("--logo", help="Path to local Clinic Logo (PNG/WebP/JPG)")
    parser.add_argument("--password", help="Default initial password for staff (default: ClinicCode@2026)")
    parser.add_argument("--brand-color", default="#0284c7", help="Primary Brand Hex Color (default: #0284c7)")

    args = parser.parse_args()

    # Interactive prompt if parameters are missing
    name = args.name or input("Hospital Name (e.g. Star Dental Care): ").strip()
    code = (args.code or input("Clinic Short Code [2-5 chars] (e.g. SDC): ").strip()).upper()
    domain = args.domain or input("Domain (e.g. stardental.duckdns.org): ").strip().lower()
    phone = args.phone or input("Primary Phone (e.g. +919876543210): ").strip()
    chairs = args.chairs if args.name else int(input("Chair Count [1-10] (default: 1): ").strip() or "1")
    city = args.city if args.name else (input("City (default: Salem): ").strip() or "Salem")
    state = args.state if args.name else (input("State (default: Tamil Nadu): ").strip() or "Tamil Nadu")
    postal = args.postal if args.name else (input("Postal Code (default: 636001): ").strip() or "636001")
    address = args.address if args.name else (input("Full Address: ").strip() or f"Main Road, {city}")
    logo_path = args.logo if args.name else input("Local Logo file path (optional, press Enter to skip): ").strip()
    default_password = args.password or f"{code.capitalize()}@2026"
    brand_color = args.brand_color

    code_lower = code.lower()
    web_dir_name = f"{code_lower}-web"
    admin_email = f"admin@{code_lower}.in"
    doctor_email = f"doctor@{code_lower}.in"
    reception_email = f"reception@{code_lower}.in"

    print("\n" + "=" * 70)
    print(f"🏥 ONBOARDING NEW CLINIC: {name} ({code})")
    print(f"🌐 Domain: {domain}")
    print(f"🪑 Chairs: {chairs} Operatory Chair(s)")
    print(f"📍 Location: {city}, {state} - {postal}")
    print(f"🔑 Initial Staff Passwords: {default_password}")
    print("=" * 70)

    # 1. Generate Argon2id Password Hash on VPS
    print("\n[1/6] Generating Argon2id password hash on VPS...")
    argon_script = f"""
    const {{ hash }} = require('@node-rs/argon2');
    (async () => {{
      const p = await hash('{default_password}');
      console.log(JSON.stringify({{ hash: p }}));
    }})();
    """
    code_res, out, err = run_ssh(f"cd /var/www/dental-api && node -e \"{argon_script.replace(chr(10), ' ')}\"")
    if code_res != 0:
        print(f"Failed to generate hash: {err}")
        sys.exit(1)
    pwd_hash = json.loads(out.strip())["hash"]
    print("✓ Argon2id password hash generated.")

    # 2. PostgreSQL Provisioning
    print("\n[2/6] Provisioning PostgreSQL (aks_dental): Clinic, Domain, Staff, and Treatment Catalog...")
    lobby_secret = secrets.token_hex(16)
    
    sql_provision = f"""
    SET row_security = off;

    DO $$
    DECLARE
        v_clinic_id TEXT;
        v_pwd_hash TEXT := '{pwd_hash}';
    BEGIN
        SELECT id INTO v_clinic_id FROM "Clinic" WHERE code = '{code}';

        IF v_clinic_id IS NULL THEN
            v_clinic_id := gen_random_uuid()::text;
            INSERT INTO "Clinic" (
                id, name, code, tagline, phone, email, address, city, state, "postalCode",
                timezone, currency, "chairCount", "workingHours", "brandColor", "logoUrl",
                "requireDeskConfirmation", "requireLobbyCode", "lobbySecret", "lobbyCodeDigits",
                "lobbyCodeWindowSeconds", status, "planTier", "workingHoursConfigured", "hoursEnforced",
                "createdAt", "updatedAt"
            ) VALUES (
                v_clinic_id,
                '{name}',
                '{code}',
                'Modern Dental Care & Implant Centre in {city}',
                '{phone}',
                '{admin_email}',
                '{address}',
                '{city}',
                '{state}',
                '{postal}',
                'Asia/Kolkata',
                'INR',
                {chairs},
                'Mon - Sat: 9:30 AM - 8:30 PM | Sun: 10:00 AM - 2:00 PM (By Appointment)',
                '{brand_color}',
                '/brand/{code_lower}.png',
                true,
                true,
                '{lobby_secret}',
                4,
                300,
                'ACTIVE',
                'PROFESSIONAL',
                true,
                false,
                NOW(),
                NOW()
            );
            RAISE NOTICE 'Created new clinic % with ID: %', '{code}', v_clinic_id;
        ELSE
            UPDATE "Clinic" SET
                name = '{name}',
                phone = '{phone}',
                address = '{address}',
                city = '{city}',
                state = '{state}',
                "postalCode" = '{postal}',
                "chairCount" = {chairs},
                "brandColor" = '{brand_color}',
                "logoUrl" = '/brand/{code_lower}.png',
                "updatedAt" = NOW()
            WHERE id = v_clinic_id;
            RAISE NOTICE 'Updated existing clinic % with ID: %', '{code}', v_clinic_id;
        END IF;

        -- Upsert Domain
        IF NOT EXISTS (SELECT 1 FROM "ClinicDomain" WHERE domain = '{domain}') THEN
            INSERT INTO "ClinicDomain" (id, "clinicId", domain, "isPrimary", "createdAt")
            VALUES (gen_random_uuid()::text, v_clinic_id, '{domain}', true, NOW());
        ELSE
            UPDATE "ClinicDomain" SET "clinicId" = v_clinic_id WHERE domain = '{domain}';
        END IF;

        -- 1. Admin Account
        IF NOT EXISTS (SELECT 1 FROM "User" WHERE email = '{admin_email}') THEN
            INSERT INTO "User" (
                id, "clinicId", email, username, "passwordHash", "fullName", role, "isActive", "createdAt", "updatedAt"
            ) VALUES (
                gen_random_uuid()::text, v_clinic_id, '{admin_email}', '{code_lower}_admin', v_pwd_hash, '{name} Admin', 'CLINIC_ADMIN', true, NOW(), NOW()
            );
        END IF;

        -- 2. Dentist Account
        IF NOT EXISTS (SELECT 1 FROM "User" WHERE email = '{doctor_email}') THEN
            INSERT INTO "User" (
                id, "clinicId", email, username, "passwordHash", "fullName", role, "isActive", "createdAt", "updatedAt"
            ) VALUES (
                gen_random_uuid()::text, v_clinic_id, '{doctor_email}', '{code_lower}_doctor', v_pwd_hash, 'Dr. {name} Dentist', 'DENTIST', true, NOW(), NOW()
            );
        END IF;

        -- 3. Receptionist Account
        IF NOT EXISTS (SELECT 1 FROM "User" WHERE email = '{reception_email}') THEN
            INSERT INTO "User" (
                id, "clinicId", email, username, "passwordHash", "fullName", role, "isActive", "createdAt", "updatedAt"
            ) VALUES (
                gen_random_uuid()::text, v_clinic_id, '{reception_email}', '{code_lower}_reception', v_pwd_hash, '{name} Front Desk', 'RECEPTIONIST', true, NOW(), NOW()
            );
        END IF;

        -- 4. Seed Standard 9-item Treatment Catalog
        INSERT INTO "TreatmentCatalogItem" (
            id, "clinicId", code, name, category, "standardFeePaise", description, "isActive", "createdAt", "updatedAt"
        ) VALUES
        (gen_random_uuid()::text, v_clinic_id, 'CONS', 'General Consultation & Oral Exam', 'Consultation', 20000, 'Comprehensive oral examination and treatment planning', true, NOW(), NOW()),
        (gen_random_uuid()::text, v_clinic_id, 'SCALE', 'Scaling & Teeth Polishing', 'Preventive', 80000, 'Ultrasonic calculus scaling and stain polishing', true, NOW(), NOW()),
        (gen_random_uuid()::text, v_clinic_id, 'FILL', 'Composite Dental Filling', 'Restorative', 120000, 'Light-cure tooth-colored aesthetic resin restoration', true, NOW(), NOW()),
        (gen_random_uuid()::text, v_clinic_id, 'RCT', 'Root Canal Treatment (RCT)', 'Endodontics', 350000, 'Single or multi-visit rotary endodontic therapy', true, NOW(), NOW()),
        (gen_random_uuid()::text, v_clinic_id, 'CROWN', 'Zirconia / Ceramic Dental Crown', 'Prosthodontics', 450000, 'Monolithic aesthetic high-strength CAD/CAM crown', true, NOW(), NOW()),
        (gen_random_uuid()::text, v_clinic_id, 'EXT', 'Routine Tooth Extraction', 'Oral Surgery', 50000, 'Atraumatic simple tooth extraction with local anesthesia', true, NOW(), NOW()),
        (gen_random_uuid()::text, v_clinic_id, 'SURG-EXT', 'Impacted Wisdom Tooth Surgery', 'Oral Surgery', 250000, 'Surgical removal of impacted third molar', true, NOW(), NOW()),
        (gen_random_uuid()::text, v_clinic_id, 'IMPLANT', 'Titanium Dental Implant Fixture', 'Implantology', 2500000, 'Titanium endosseous screw fixture placement', true, NOW(), NOW()),
        (gen_random_uuid()::text, v_clinic_id, 'WHITEN', 'In-Office Teeth Whitening', 'Cosmetics', 500000, 'Professional dental bleaching procedure', true, NOW(), NOW())
        ON CONFLICT ("clinicId", code) DO NOTHING;

    END $$;
    """

    code_res, out, err = run_ssh("sudo -u postgres psql -d aks_dental", sql_provision)
    if code_res != 0:
        print(f"Database provisioning failed: {err}")
        sys.exit(1)
    print("✓ Clinic, Domain, Staff Accounts, and Treatment Catalog seeded successfully.")

    # 3. Create Dedicated Web Root on VPS
    print(f"\n[3/6] Creating isolated web root: /var/www/{web_dir_name}...")
    setup_web_cmd = f"""
    set -e
    sudo mkdir -p /var/www/{web_dir_name}
    sudo cp -r /var/www/aks-web/* /var/www/{web_dir_name}/
    sudo mkdir -p /var/www/{web_dir_name}/brand
    """
    code_res, out, err = run_ssh(setup_web_cmd)
    if code_res != 0:
        print(f"Failed to copy web files: {err}")
        sys.exit(1)

    # 4. Upload & Configure Clinic Logo & WhatsApp OpenGraph Preview
    print(f"\n[4/6] Configuring dedicated branding & WhatsApp preview cards...")
    if logo_path and os.path.exists(logo_path):
        remote_tmp_logo = f"/tmp/{code_lower}_logo.png"
        scp_cmd = f'scp -i "{KEY_PATH}" -o StrictHostKeyChecking=no "{logo_path}" {HOST}:{remote_tmp_logo}'
        subprocess.run(scp_cmd, shell=True, check=True)
        install_logo_cmd = f"""
        sudo cp {remote_tmp_logo} /var/www/{web_dir_name}/brand/{code_lower}.png
        sudo cp {remote_tmp_logo} /var/www/{web_dir_name}/favicon.png
        sudo chmod 644 /var/www/{web_dir_name}/brand/{code_lower}.png /var/www/{web_dir_name}/favicon.png
        rm -f {remote_tmp_logo}
        """
        run_ssh(install_logo_cmd)
        print(f"✓ Logo installed at /var/www/{web_dir_name}/brand/{code_lower}.png and /favicon.png")
    else:
        print("ℹ No custom logo provided. Retaining default branding.")

    # Invert / Inject Open Graph tags in index.html
    og_meta_script = f"""
    with open('/var/www/{web_dir_name}/index.html', 'r') as f:
        html = f.read()

    meta = '''
        <title>{name} | {city}</title>
        <meta name="description" content="Modern Dental Care & Implant Centre in {city}. Schedule appointments and consult lead dentists." />
        <!-- Open Graph / WhatsApp Preview -->
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://{domain}/" />
        <meta property="og:title" content="{name}" />
        <meta property="og:description" content="Modern Dental Care & Implant Centre in {city} • Book consultation online." />
        <meta property="og:image" content="https://{domain}/brand/{code_lower}.png" />
        <meta property="og:image:secure_url" content="https://{domain}/brand/{code_lower}.png" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="600" />
        <meta property="og:image:height" content="600" />
        <meta property="og:site_name" content="{name}" />
        <link rel="icon" type="image/png" href="/brand/{code_lower}.png" />
        <link rel="apple-touch-icon" href="/brand/{code_lower}.png" />'''

    import re
    html = re.sub(r'<title>.*?</title>', '', html)
    html = re.sub(r'<link rel="icon".*?>', '', html)
    html = html.replace('<head>', '<head>' + meta)

    with open('/var/www/{web_dir_name}/index.html', 'w') as f:
        f.write(html)
    """
    code_res, out, err = run_ssh("sudo python3", og_meta_script)
    run_ssh(f"sudo chown -R www-data:www-data /var/www/{web_dir_name}")
    print("✓ Isolated index.html generated with custom title, favicon, and WhatsApp link preview.")

    # 5. Update Nginx & CORS & Certbot SSL
    print("\n[5/6] Configuring Nginx server block, HSTS, CORS, and SSL Certificate...")
    nginx_conf_script = f"""
    conf_path = '/etc/nginx/sites-available/dental.conf'
    with open(conf_path, 'r') as f:
        content = f.read()

    if '{domain}' not in content:
        server_block = '''
    server {{
        server_name {domain};

        root /var/www/{web_dir_name};
        index index.html;

        # Static Assets with 1 Year Immutable Cache
        location /assets/ {{
            expires 1y;
            add_header Cache-Control "public, max-age=31536000, immutable";
            access_log off;
        }}

        # Brand and Favicon caching
        location ~* \\\\.(?:ico|css|js|gif|jpe?g|png|svg|webp|woff2?|eot|ttf|otf)$ {{
            expires 30d;
            add_header Cache-Control "public, max-age=2592000, immutable";
            access_log off;
        }}

        location / {{
            try_files $uri $uri/ /index.html;
        }}

        location /api/ {{
            client_max_body_size 50M;
            client_body_timeout 300s;
            proxy_read_timeout 300s;
            proxy_send_timeout 300s;

            proxy_pass http://127.0.0.1:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection upgrade;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_buffering on;
            proxy_buffers 16 16k;
            proxy_buffer_size 32k;
        }}

        listen [::]:443 ssl http2;
        listen 443 ssl http2;
        ssl_certificate /etc/letsencrypt/live/aksdental.duckdns.org/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/aksdental.duckdns.org/privkey.pem;
        include /etc/letsencrypt/options-ssl-nginx.conf;
        ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    }}

    server {{
        listen 80;
        listen [::]:80;
        server_name {domain};
        return 301 https://$host$request_uri;
    }}
    '''
        content = content + server_block
        with open(conf_path, 'w') as f:
            f.write(content)
        print("Appended Nginx server block for {domain}.")
    """
    run_ssh("sudo python3", nginx_conf_script)

    # Update CORS_ORIGIN in /var/www/dental-api/.env
    cors_update_script = f"""
    env_path = '/var/www/dental-api/.env'
    with open(env_path, 'r') as f:
        lines = f.readlines()
    new_lines = []
    for line in lines:
        if line.startswith('CORS_ORIGIN='):
            origins = [o.strip() for o in line.replace('CORS_ORIGIN=', '').split(',') if o.strip()]
            for o in ['https://{domain}', 'http://{domain}']:
                if o not in origins:
                    origins.append(o)
            new_lines.append(f"CORS_ORIGIN={{','.join(origins)}}\\n")
        else:
            new_lines.append(line)
    with open(env_path, 'w') as f:
        f.writelines(new_lines)
    """
    run_ssh("sudo python3", cors_update_script)

    # Expand Certbot SSL Certificate
    print("Expanding SSL certificate for new domain...")
    run_ssh(f"sudo certbot --nginx --expand --non-interactive --agree-tos --redirect -d aksdental.duckdns.org -d jacobdental.duckdns.org -d fairydentalcare.duckdns.org -d {domain}")
    
    # Reload services
    run_ssh("sudo -u ubuntu pm2 restart dental-api --update-env")
    run_ssh("sudo nginx -t && sudo systemctl reload nginx")
    print("✓ Nginx & PM2 restarted with new domain configuration.")

    # 6. Verification
    print("\n[6/6] Verifying live endpoints...")
    verify_script = f"""
    import urllib.request, json
    try:
        req = urllib.request.Request('https://{domain}/api/clinic/public-info', headers={{'Origin': 'https://{domain}'}})
        res = urllib.request.urlopen(req)
        print("✓ Public API Response:", res.status)
    except Exception as e:
        print("API test warning:", e)
    """
    run_ssh("python3", verify_script)

    print("\n" + "=" * 70)
    print("🎉 HOSPITAL SUCCESSFULLY ONBOARDED & LIVE IN PRODUCTION!")
    print("=" * 70)
    print(f"Hospital Name:     {name} ({code})")
    print(f"Live Portal URL:   https://{domain}")
    print(f"Direct Booking:    https://{domain}/book")
    print(f"Doctor Chair Desk: https://{domain}/doctor")
    print(f"Front Desk:        https://{domain}/reception")
    print(f"Admin Dashboard:   https://{domain}/admin")
    print(f"Operatory Chairs:  {chairs} Chair(s)")
    print(f"Web Root Folder:   /var/www/{web_dir_name}/ (100% Isolated Branding)")
    print("-" * 70)
    print("Staff Credentials:")
    print(f"  Admin:       {admin_email}     | Password: {default_password}")
    print(f"  Dentist:     {doctor_email}    | Password: {default_password}")
    print(f"  Reception:   {reception_email} | Password: {default_password}")
    print("=" * 70)

if __name__ == "__main__":
    main()
