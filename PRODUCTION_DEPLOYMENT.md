# AKS ELITE DENTAL CLINIC MANAGEMENT SYSTEM
## Production Deployment Architecture: Cloudflare Pages + SSD VPS (PostgreSQL)

**Clinic:** AKS Elite Dental Clinic  
**Chief Doctor & Owner:** Dr. Khalidh Khan (BDS, MDS)  
**Location:** 14, Alagar Kovil Main Road, K.Pudur, Madurai, Tamil Nadu  
**Architecture:** Decoupled Edge Frontend + Hardened SSD Backend & Database  

---

### 1. Production Architecture Overview

```
                      ┌──────────────────────────────────────────────┐
                      │              CLOUDFLARE EDGE                 │
                      │     https://app.akselitedental.com           │
                      │   (React 19 / Vite / Global CDN / 0ms Egress) │
                      └──────────────────────┬───────────────────────┘
                                             │
                          Secure HTTPS Calls │ (VITE_API_URL)
                          with Bearer Token  │
                                             ▼
                      ┌──────────────────────────────────────────────┐
                      │          SSD CLOUD VPS ($12 / MONTH)         │
                      │        Ubuntu 24.04 LTS (2 GB RAM, 60 GB SSD) │
                      │        Bangalore (BLR) Datacenter (<30ms)     │
                      ├──────────────────────────────────────────────┤
                      │  • Nginx Reverse Proxy (SSL / Certbot)       │
                      │    https://api.akselitedental.com            │
                      │  • Node.js 20 LTS + PM2 (NestJS API :3001)   │
                      │  • PostgreSQL 16 on Local High-Speed SSD     │
                      │  • Nightly Automated Gzip Backups (02:00 AM) │
                      └──────────────────────────────────────────────┘
```

---

### 2. Part A: Deploying Frontend to Cloudflare Pages (Free & Instant)

Cloudflare Pages provides global CDN edge caching, automatic HTTPS certificates, DDoS protection, and zero egress fees.

#### Configuration Settings in Cloudflare Pages:
| Setting | Value |
|---|---|
| **Framework preset** | `Vite` |
| **Root directory** | `apps/web` |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Environment Variable** | `VITE_API_URL` = `https://api.akselitedental.com` |

#### Built-in Edge Optimizations Already Included:
- `apps/web/public/_redirects`: Enforces single-page app (SPA) routing so visiting `/doctor`, `/billing`, or `/patients/:id` never returns a 404.
- `apps/web/public/_headers`: Applies strict security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`).

---

### 3. Part B: Deploying Backend & PostgreSQL on the VPS SSD

#### Step 1: Provision the VPS
- Choose the **$12 / month plan** (2 GB Memory, 2 vCPUs, 60 GB SSD).
- Region: **Bangalore (BLR)** or **Singapore (SGP)** for the fastest connection from Madurai, Tamil Nadu.
- Operating System: **Ubuntu 24.04 LTS (x64)**.

#### Step 2: One-Click Environment Setup
Connect to the server via SSH:
```bash
ssh root@YOUR_SERVER_IP
```

Run the automated setup script `deploy_vps_ubuntu.sh`:
```bash
bash deploy_vps_ubuntu.sh
```

This script automatically:
1. Creates a **2GB SSD swap file** to guarantee the server never runs out of memory.
2. Installs **Node.js 20 LTS**, **npm**, **pnpm**, and **PM2**.
3. Installs and secures **PostgreSQL 16** with a dedicated database `aks_dental_prod`.
4. Configures **Nginx** reverse proxy to forward traffic from port 80/443 to the NestJS daemon on port 3001.
5. Sets up an automated **nightly database backup cron job** running at 2:00 AM IST to `/var/backups/aks_dental/` with automatic 30-day retention.
6. Enforces **UFW Firewall** rules (allowing only SSH, HTTP, and HTTPS).

#### Step 3: Deploy Application Code & Run Migrations
Run the application deployment script `deploy_backend_app.sh`:
```bash
cd /var/www/aks-elite-dental
bash deploy_backend_app.sh
```

This runs:
- `npx prisma db push --schema=prisma/schema.postgresql.prisma` to create all PostgreSQL tables on the SSD.
- Starts the NestJS service with zero downtime using PM2 (`pm2 start dist/src/main.js --name aks-api`).
- Configures PM2 to automatically reboot after server restarts (`pm2 startup && pm2 save`).

#### Step 4: Issue Free SSL Certificate (HTTPS)
Once your domain DNS `api.akselitedental.com` points to the VPS IP address:
```bash
certbot --nginx -d api.akselitedental.com
```

---

### 4. Database Schema on the SSD (100% Dynamic, Zero Mocks)

Every entity is permanently stored in PostgreSQL on the server's local NVMe SSD:

| Table | Real-World Clinical Function | Dynamic Storage |
|---|---|---|
| `Clinic` | Clinic profile, license, GSTIN, chair count (3 chairs), operating hours | PostgreSQL |
| `User` | Doctor, receptionist, accountant accounts with Argon2id password hashes | PostgreSQL |
| `Patient` | Demographics, UHID (`AKS-YYYY-XXXX`), allergies, medical conditions | PostgreSQL |
| `Appointment` | Chair reservations, scheduled times, chair status transitions | PostgreSQL |
| `Consultation` | Chief complaint, clinical findings, diagnosis, tamper-evident lock | PostgreSQL |
| `ConsultationAmendment` | Auditable amendment trail when a locked visit is modified | PostgreSQL |
| `DentalChartEntry` | 32 permanent & 20 primary teeth findings tagged by surface | PostgreSQL |
| `TreatmentPlan` & `Items` | Staged multi-visit treatment plans with estimated fees | PostgreSQL |
| `CompletedProcedure` | Chairside procedures performed in operatory (`isBilled` flag) | PostgreSQL |
| `Prescription` & `Items` | Digital prescriptions, medicines, dosages, timings, diet advice | PostgreSQL |
| `Invoice` & `Items` | Milestone tax invoices with itemized clinical services | PostgreSQL |
| `Payment` | Cash/UPI/Card receipts (`RCP-YYYY-XXXX`) and balance updates | PostgreSQL |
| `AuditLog` | Permanent regulatory audit trail of all clinic operations | PostgreSQL |

---

### 5. Automated Backup & Recovery Guarantee

To protect patient records and financial ledgers against any disaster:
- **Nightly SSD Backup:** Runs daily at 02:00 AM IST via `/usr/local/bin/aks_backup_db.sh`.
- **Gzip Compression:** Databases are dumped using `pg_dump` and compressed into `.sql.gz` archives in `/var/backups/aks_dental/`.
- **SSD Space Safety:** Older backups (>30 days) are automatically pruned to prevent SSD exhaustion.
- **1-Command Restore:** In the event of emergency recovery:
  ```bash
  gunzip -c /var/backups/aks_dental/aks_dental_backup_YYYY-MM-DD.sql.gz | sudo -u postgres psql aks_dental_prod
  ```
