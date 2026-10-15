# Dentrinqo Multi-Tenant Dental Clinic Management Platform

Dentrinqo is an enterprise-grade, multi-tenant SaaS for dental hospitals and dental clinics.

---

## 🏛 Directory Architecture

```
dentrinqo/
├── apps/
│   ├── api/                 # NestJS Modular Backend Monolith (Prisma ORM, PostgreSQL RLS)
│   └── web/                 # React 19 + TypeScript + Vite + Tailwind CSS Frontend
├── packages/
│   └── shared-types/        # Shared TypeScript interfaces & DTOs
├── scripts/
│   ├── onboard_new_hospital.py # Automated, zero-touch hospital onboarding engine
│   ├── ops/                 # Multi-clinic deployment (deploy_all_clinics.py), DB migrations & maintenance
│   └── tests/               # E2E journey, security, and live concurrency test suites
├── docs/
│   ├── reports/             # Clinical security, scheduling, and disaster recovery audits
│   └── architecture/        # System diagrams and database schemas
└── PRODUCTION_DEPLOYMENT.md  # Detailed server infrastructure guide
```

---

## 🏥 Automated Hospital Onboarding

Whenever you need to onboard a new hospital to your multi-tenant platform with 100% brand isolation, run:

```bash
python scripts/onboard_new_hospital.py \
    --name "Star Dental Care & Implant Centre" \
    --code "SDC" \
    --domain "stardental.duckdns.org" \
    --phone "+919876543210" \
    --chairs 1 \
    --city "Salem" \
    --address "Main Road, Salem" \
    --logo "C:/path/to/logo.png"
```

### What This Automates:
1. **PostgreSQL Multi-Tenant Provisioning:**
   - Creates the `Clinic` record scoped to exact operatory chairs.
   - Links the primary domain in `ClinicDomain`.
   - Generates 3 initial staff accounts (`admin@`, `doctor@`, `reception@`) with Argon2id passwords.
   - Seeds the 9 standard dental treatment catalog items under PostgreSQL RLS.
2. **100% Brand & Web Root Isolation:**
   - Creates `/var/www/<code-lower>-web/` on the server.
   - Deploys the latest production web bundle.
   - Installs the clinic's logo at `/brand/<code-lower>.png` and replaces root `/favicon.png`.
   - Generates custom Open Graph tags for WhatsApp link previews.
3. **Nginx & SSL Auto-Configuration:**
   - Creates an isolated server block in `/etc/nginx/sites-available/dental.conf`.
   - Configures `/api/` reverse proxy and 1-year immutable caching.
   - Configures HSTS (`Strict-Transport-Security`) and automatic port 80 -> HTTPS 301 redirects.
   - Automatically issues / expands Let's Encrypt SSL certificates.
4. **CORS Allowlist:**
   - Adds the new domain to `CORS_ORIGIN` and database lookup cache.

---

## 🌐 Active Production Hospitals

| Hospital | Domain | Chairs | Web Root Directory |
| :--- | :--- | :--- | :--- |
| **AK's Elite Dental** | `aksdental.duckdns.org` | 3 | `/var/www/aks-web/` |
| **Jacobs Dental Clinic** | `jacobdental.duckdns.org` | 1 | `/var/www/jacobs-web/` |
| **Fairy Dental Care** | `fairydentalcare.duckdns.org` | 1 | `/var/www/fairy-web/` |