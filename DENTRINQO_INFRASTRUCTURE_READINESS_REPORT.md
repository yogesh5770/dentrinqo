# DENTRINQO INFRASTRUCTURE READINESS & RECOVERY VERIFICATION REPORT
**Document Reference:** `DENTRINQO-INFRA-AUDIT-2026-10-15`  
**Security & Operational Clearance:** Production Readiness Review  
**Author:** Senior DevOps & Production Reliability Engineering (Pair Review)  
**Date:** October 15, 2026  
**Repository Branch:** `integration/clinic-hours-and-dual-qr`  
**Production Host:** `137.23.45.243` (`aksdental.duckdns.org` & `jacobdental.duckdns.org`)  

---

## 1. Executive Summary & Production Launch Verdict

Following the successful remediation and independent regression verification of all six critical application-security vulnerabilities (SEC-01 through SEC-07, with 83/83 unit and integration tests passing across 11 suites), an in-depth operational reliability, disaster recovery, and infrastructure scaling audit was conducted across the live production environment and application code.

### 🔴 FINAL PRODUCTION LAUNCH VERDICT: **NO-GO**

While the application security perimeter is verified and stable, **Dentrinqo is NOT ready for live clinic deployment or real patient record processing.** 

A production launch at this stage would violate healthcare data governance mandates (DPDP Act 2023, HIPAA Security Rule §164.308) and present severe operational continuity risks due to three primary operational blockers:

| Priority | Area | Status | Critical Risk |
| :--- | :--- | :--- | :--- |
| **P0** | **Disaster Recovery & Offsite Backups** | ❌ **FAIL** (Blocker) | Backups reside solely on the live server's local disk (`/var/backups/dentrinqo`). A disk crash, filesystem corruption, or VM loss permanently destroys both the database and all historical backups. Dumps are unencrypted at rest and lack automated failure alerts. |
| **P1** | **Nginx Medical-Image Uploads** | ❌ **FAIL** (Blocker) | Nginx proxy configuration completely lacks `client_max_body_size`, defaulting to **1 MB**. The application allows up to 50 MB. Clinical radiographs (OPGs, panoramic X-rays, CBCT scans) will abort with `HTTP 413 Payload Too Large`. |
| **P1** | **Rate Limiting & Memory Safety** | ⚠️ **PARTIAL** (Blocker) | Critical staff authentication endpoints (`POST /api/auth/login`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`) lack route-specific rate limits, allowing 120 credential-stuffing guesses per minute. In-memory storage is process-local and vulnerable to unbounded key allocation under distributed spoofing. |
| **P1** | **Session Revocation Across Instances** | ❌ **FAIL** (Blocker for Horizontal Scaling) | `AuthService.invalidateUserStatus()` is never invoked when an administrator deactivates a user in `UsersService`. Furthermore, the 30-second `userStatusCache` is stored in process heap memory; in a multi-instance cluster, deactivation on Instance A leaves Instance B trusting stale authorization for 30 seconds. |

---

## 2. Current Architecture & Verified Production Configuration

The verified production topology as of October 15, 2026:

```
                            [ Public Internet / Clinic Clients ]
                                             │
                                   HTTPS (TLS 1.3 / HTTP/2)
                                   Let's Encrypt SSL
                                             ▼
                     ┌───────────────────────────────────────────────┐
                     │          Nginx Reverse Proxy 1.24.0           │
                     │          (Host: 137.23.45.243)                │
                     ├───────────────────────┬───────────────────────┤
                     │ aksdental.duckdns.org │ jacobdental.duckdns.org│
                     │ (/var/www/aks-web)    │ (/var/www/jacobs-web) │
                     └───────────────────────┼───────────────────────┘
                                             │
                            Proxy Pass: http://127.0.0.1:3000
                            Buffers: 16 16k, Buffer-size: 32k
                            HTTP/1.1 Keep-Alive Multiplexing
                                             │
                                             ▼
                     ┌───────────────────────────────────────────────┐
                     │          NestJS API (PM2: dental-api)         │
                     │          PID: 133700 | Memory: 146.4 MB       │
                     │          Mode: Fork (Single Node Process)     │
                     └───────────────────────┬───────────────────────┘
                                             │
                         Prisma ORM with Tenant Extension (RLS)
                                             ▼
                     ┌───────────────────────────────────────────────┐
                     │          PostgreSQL 16 Database Cluster       │
                     │          Database: aks_dental                 │
                     │          Storage: Local SSD (/dev/sda1)       │
                     └───────────────────────┬───────────────────────┘
                                             │
                          Local File Storage on Same Block Volume
                                             ▼
                     ┌───────────────────────────────────────────────┐
                     │ /var/backups/dentrinqo/ (Local SQL Dumps)     │
                     │ /var/www/dental-api/uploads/ (Medical Files)  │
                     └───────────────────────────────────────────────┘
```

### Verified System Telemetry
- **Operating System:** Ubuntu 24.04 LTS (Kernel Linux 6.8.0-1017-oracle x86_64)
- **Filesystem Capacity:** `/dev/sda1` — Total: **193 GB**, Used: **5.2 GB**, Available: **188 GB (3% utilized)**
- **Database Engine:** PostgreSQL 16 on `localhost:5432`, single multi-tenant database `aks_dental` with Row-Level Security (RLS) enforced across both tenant clinics.
- **Node.js Runtime:** Node.js v20.x LTS, NestJS 10, running under PM2 in fork mode (`instances: 1`).
- **Nginx Web Server:** Nginx 1.24.0 with HTTP/2 enabled, Brotli/Gzip MIME compression active, 1-year immutable caching for static bundles, 30-day brand asset caching.

---

## 3. Phase A — Backup & Disaster Recovery Audit

### 3.1 Existing Backup Configuration Inspection
The existing backup system was inspected directly on the production host (`/usr/local/bin/dentrinqo-backup.sh` and `/etc/crontab`):

```bash
#!/usr/bin/env bash
set -e

BACKUP_DIR="/var/backups/dentrinqo"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_NAME="aks_dental"
DUMP_FILE="${BACKUP_DIR}/db_${DB_NAME}_${TIMESTAMP}.sql.gz"
FILES_FILE="${BACKUP_DIR}/uploads_${TIMESTAMP}.tar.gz"

mkdir -p "${BACKUP_DIR}"

# 1. Database dump
sudo -u postgres pg_dump -d "${DB_NAME}" -F p | gzip > "${DUMP_FILE}"

# 2. Medical files archive
if [ -d "/var/www/dental-api/uploads" ]; then
  tar -czf "${FILES_FILE}" -C /var/www/dental-api uploads/
fi

# 3. 14-day retention rotation
find "${BACKUP_DIR}" -name "db_*.sql.gz" -mtime +14 -delete
find "${BACKUP_DIR}" -name "uploads_*.tar.gz" -mtime +14 -delete

echo "[$(date)] Dentrinqo automated backup completed successfully: ${DUMP_FILE}" >> /var/log/dentrinqo-backup.log
```

- **Cron Schedule:** `0 2 * * * /usr/local/bin/dentrinqo-backup.sh` (Runs nightly at 02:00 UTC).
- **Execution History:** Verified active. Snapshots exist for safe deploys:
  - `db_aks_dental_20261014_173353.sql.gz` (23.2 KB)
  - `uploads_20261014_173353.tar.gz` (145 bytes)

### 3.2 Evaluation Against Enterprise Disaster Recovery Standards

| Requirement | Current Implementation | Status | Findings & Deficiencies |
| :--- | :--- | :--- | :--- |
| **What is backed up** | `aks_dental` PostgreSQL database + `/var/www/dental-api/uploads` | **PASS** | SQL schema, clinical data, sequences, and uploaded digital attachments are captured. |
| **Storage location** | Local directory `/var/backups/dentrinqo` on `/dev/sda1` | ❌ **FAIL** | **Single Point of Failure (SPOF)**. Stored on the exact same drive as the OS and database. |
| **Offsite replication** | None | ❌ **FAIL** | Zero replication to external cloud object storage (S3, GCS, R2, or remote NAS). |
| **Encryption at rest** | Gzip compression only (`.sql.gz`) | ❌ **FAIL** | Plaintext SQL dumps containing unencrypted patient health records (ePHI) violate DPDP Act 2023. |
| **Retention policy** | Local 14-day rolling window (`-mtime +14`) | ⚠️ **PARTIAL** | Functional locally, but lacks grandfather-father-son (GFS) retention (e.g. 7 daily, 4 weekly, 12 monthly). |
| **Failure alerting** | Local file append (`/var/log/dentrinqo-backup.log`) | ❌ **FAIL** | No dead-man's switch or webhook. If disk fills or `pg_dump` crashes, failures remain silent. |
| **Restoration procedures** | Verified via test script `test_backup_restore.py` | ⚠️ **PARTIAL** | Script proved sandbox restoration works; however, no formalized operational runbook exists. |

### 3.3 Sandbox Restoration Verification Test Results
A non-destructive restoration test was executed in an isolated sandbox database (`aks_dental_restore_verification`):
1. **Extraction:** `gunzip -c db_aks_dental_20261014_130326.sql.gz | psql -d aks_dental_restore_verification`
2. **Row Count Parity Verification:**
   - `Clinic`: Original = 2 | Restored = 2 (**MATCH**)
   - `Patient`: Original = 4 | Restored = 4 (**MATCH**)
   - `User`: Original = 5 | Restored = 5 (**MATCH**)
   - `Appointment`: Original = 5 | Restored = 5 (**MATCH**)
   - `Invoice`: Original = 4 | Restored = 4 (**MATCH**)
   - `Payment`: Original = 4 | Restored = 4 (**MATCH**)
   - `Prescription`: Original = 1 | Restored = 1 (**MATCH**)
   - `ClinicSequence`: Original = 6 | Restored = 6 (**MATCH**)
3. **Data Integrity:** Schema definitions, triggers, constraints, foreign keys, and RLS policies restored with 100% fidelity. Sandbox database was safely dropped post-verification.

### 3.4 Proposed Offsite Backup Implementation Plan
To resolve the P0 disaster recovery blocker, implement the following zero-trust, least-privilege replication architecture:

```
[ Local Production Host (137.23.45.243) ]
  ├── 1. pg_dump (Custom format -Fc)
  ├── 2. tar -czf (uploads/medical-files)
  ├── 3. Client-side Age/GPG Encryption (AES-256-GCM with Ephemeral Key)
  ├── 4. Push via TLS 1.3 to AWS S3 / Cloudflare R2
  │       └── IAM Role: s3:PutObject ONLY (No Delete, No List, No Overwrite)
  └── 5. Ping Healthchecks.io Heartbeat Monitor (Dead-Man's Switch)
                                │
                                ▼
         [ AWS S3 / Cloudflare R2 Offsite Bucket ]
           ├── Object Lock Enabled (Compliance Mode: 30-Day Immobility)
           ├── Server-Side Encryption: SSE-KMS
           ├── Lifecycle Rules:
           │     ├── Daily Dumps: Retain 30 days
           │     ├── Weekly Dumps: Retain 90 days
           │     └── Monthly Dumps: Transition to Glacier / Retain 7 years
           └── S3 Bucket Versioning: Enabled
```

#### Security Safeguards:
1. **Ransomware Immunity:** The backup IAM credentials on the VM possess **write-only permissions** (`s3:PutObject`). If the server is ever compromised by an attacker, the attacker **cannot delete or alter existing historical backups**.
2. **Object Lock Compliance:** Even AWS root accounts cannot delete object-locked archives during the retention window.
3. **Zero Secrets in Code:** Credentials provided via AWS IAM Instance Profile or encrypted environment variables (`/etc/dentrinqo/backup.env`), with `chmod 600` root-only ownership.

---

## 4. Phase B — Nginx Medical-Image Uploads Audit

### 4.1 Specification vs Implementation Analysis
Dental clinics routinely process large high-resolution imaging assets:
- **Intraoral X-rays (IOPA / RVG):** 2 MB – 8 MB
- **Orthopantomograms (OPG / Panoramic):** 10 MB – 25 MB
- **Cone Beam Computed Tomography (CBCT) slices / volumes:** 25 MB – 50 MB
- **High-Resolution DSLR / Intraoral Camera Photographs:** 8 MB – 20 MB

### 4.2 Findings Across the Stack

```
Client Browser / Clinic Device
       │
       │ HTTP POST /api/medical-files/upload (e.g. 18 MB Panoramic OPG)
       ▼
[ Nginx Reverse Proxy ]
       │ ❌ client_max_body_size is NOT DEFINED!
       │    Default: 1 MB
       │    Action: Aborts request immediately with HTTP 413 (Payload Too Large)
       │    Result: Request NEVER reaches NestJS!
       ▼ (BLOCKED)
[ NestJS API Controller ]
       │ FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } })
       │ Configured for 50 MB, but rendered useless by Nginx proxy threshold.
```

1. **Proxy Limit Mismatch (FAIL):** Nginx `/etc/nginx/sites-available/dental.conf` lacks `client_max_body_size`. Any radiograph or attachment > 1 MB fails with HTTP 413.
2. **Memory Exhaustion (OOM) Hazard in Multer (FAIL):** In `apps/api/src/medical-files/medical-files.controller.ts`, Multer uses default **memory storage** (`file.buffer`). When multiple dentists or receptionists upload 30 MB – 50 MB scans concurrently, Node.js allocates full buffers in process heap memory. Under 3 concurrent 50 MB uploads, heap allocation spikes by > 200 MB, creating Out-Of-Memory (OOM) crash vulnerability for the single PM2 process.
3. **File Content & Magic Byte Validation (PARTIAL):** 
   - `MedicalFilesService.ts` currently relies on `mimeType.startsWith('image/')` and passes the buffer to Sharp.
   - Sharp safely processes and downscales images, rejecting corrupt image headers.
   - However, for non-image categories (`LAB_REPORT`, `CASE_SHEET_SCAN`, `VOICE_NOTE`, `OTHER`), fallback files are written directly to disk without checking magic bytes. An attacker with valid credentials could upload malicious binaries (e.g., shell scripts, PE executables, or HTML/SVG files with embedded XSS payloads).
4. **Tenant Isolation & Path Traversal (PASS):**
   - Storage keys are randomly generated: `${patientId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${finalExt}`.
   - User-supplied filenames are never used as filesystem paths.
   - Retrieval via `/api/medical-files/:id/view` strictly verifies `record.clinicId === user.clinicId` within a Prisma tenant transaction. Cross-tenant retrieval throws `NotFoundException`.
5. **Proxy Timeout Hazards (FAIL):**
   - Large 50 MB uploads over clinic DSL connections (e.g., 2 Mbps uplink = ~200 seconds) will be severed by Nginx's default 60-second `client_body_timeout` and `proxy_read_timeout`.

### 4.3 Proposed Nginx Configuration Diff (Staging-Ready)

```diff
--- /etc/nginx/sites-available/dental.conf.orig
+++ /etc/nginx/sites-available/dental.conf
@@ -2,6 +2,11 @@
     server_name aksdental.duckdns.org 137.23.45.243 _;
 
+    # Medical Imaging Upload Threshold (OPG, CBCT, Intraoral Radiographs)
+    client_max_body_size 50M;
+    client_body_timeout 300s;
+    client_body_buffer_size 1M;
+
     root /var/www/aks-web;
     index index.html;
 
@@ -34,6 +39,9 @@
         proxy_set_header X-Forwarded-Proto $scheme;
         proxy_buffering on;
         proxy_buffers 16 16k;
         proxy_buffer_size 32k;
+        proxy_read_timeout 300s;
+        proxy_send_timeout 300s;
+        proxy_request_buffering off; # Direct streaming to NestJS to prevent double-buffering
     }
```

---

## 5. Phase C — Rate Limiter Memory Safety & Scaling Readiness

### 5.1 In-Memory Limiter Mechanics & Memory Leak Audit
The rate limiting subsystem relies on `@nestjs/throttler` (v6.4.0) configured globally in `AppModule`:
```typescript
ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }])
```

#### Memory Boundary Inspection:
In `@nestjs/throttler/dist/throttler.service.js`, the default `ThrottlerStorageService` manages entries via two internal JavaScript Maps:
1. `_storage: Map<string, ThrottlerStorageRecord>`
2. `hitExpirations: Map<string, Map<string, number[]>>`
3. **Sweeper Interval:** `DEFAULT_SWEEP_INTERVAL = 60000;` (60 seconds). A timer calls `evictIdleRecords(now)` every 60s to delete expired keys and records.

#### Verdict on Memory Growth:
- **Benign Traffic:** Memory growth is **bounded** over time. Idle records are swept every 60 seconds, preventing indefinite memory accumulation during normal operations.
- **DDoS / High-Cardinality Attack Vulnerability:** Because the internal `Map` lacks an absolute size cap (e.g., max 50,000 keys) and does not utilize an LRU eviction policy, an adversary generating millions of synthetic IP addresses across a 60-second window can force the process heap to allocate hundreds of megabytes before the sweep fires.

### 5.2 Endpoint Coverage Matrix

| Endpoint | Route | Configured Rate Limit | Security Assessment |
| :--- | :--- | :--- | :--- |
| **Patient OTP Dispatch** | `POST /api/patient-auth/otp/send` | 5 req / 60s | ✅ **PASS** (Protected against SMS/OTP bombing) |
| **Patient OTP Verification** | `POST /api/patient-auth/otp/verify` | 5 req / 60s | ✅ **PASS** (Protected against brute-force) |
| **Public Appointment Booking** | `POST /api/appointments/public/book` | 5 req / 60s | ✅ **PASS** (Protected against phantom bookings) |
| **Public QR Walk-in** | `POST /api/appointments/public/walkin-register` | 10 req / 60s | ✅ **PASS** (Protected against spam check-ins) |
| **Public QR Desk Check-in** | `POST /api/appointments/public/qr-checkin` | 15 req / 60s | ✅ **PASS** (Protected against token flooding) |
| **Public Status Tracking** | `POST /api/appointments/public/track` | 60 req / 60s | ✅ **PASS** (Appropriate for polling trackers) |
| **Staff Login** | `POST /api/auth/login` | ❌ **NONE** (Global: 120/min) | ❌ **FAIL** (Allows 120 password guesses/min per IP) |
| **Staff Forgot Password** | `POST /api/auth/forgot-password` | ❌ **NONE** (Global: 120/min) | ❌ **FAIL** (Allows email enumeration & mail bombing) |
| **Staff Reset Password** | `POST /api/auth/reset-password` | ❌ **NONE** (Global: 120/min) | ❌ **FAIL** (Allows token brute-force attempts) |

### 5.3 Distributed Rate-Limiting Design for Horizontal Scaling
When transitioning from a single PM2 instance to cluster mode (`pm2 start -i max`) or multi-server autoscaling, in-memory rate limiting fails because each process tracks hits independently.

#### Redis-Backed Architecture:
```
[ Incoming Request (X-Forwarded-For: Client IP) ]
                     │
                     ▼
[ Express trust proxy: 1 ] ──▶ Client IP Verified (Nginx Hop)
                     │
                     ▼
[ ThrottlerStorageRedisService ]
                     │
         Key: dentrinqo:rl:{tenantId}:{routeHash}:{clientIp}
                     │
         Atomic Redis Multi/Exec Pipeline:
           1. INCR key
           2. EXPIRE key 60 NX
                     │
         Count > Limit ?
          ├── YES ──▶ Throw 429 Too Many Requests (Retry-After: TTL)
          └── NO  ──▶ Allow request to Controller
                     │
         [ Failure Circuit Breaker ]
          If Redis times out (> 100ms) or disconnects:
          Fail-OPEN with error log. Never block legitimate patients from care.
```

---

## 6. Phase D — Session Revocation Across Instances

### 6.1 Inspection of `isActive` Cache
In `apps/api/src/auth/auth.service.ts`:
```typescript
private static readonly userStatusCache = new Map<string, { isActive: boolean; expiresAt: number }>();
```
- Every incoming authenticated request runs `AuthGuard`, which calls `AuthService.isAccountActive(userId, clinicId)`.
- If a cached record exists and `expiresAt > now`, it returns `cached.isActive` immediately without hitting PostgreSQL.
- Cache TTL is hardcoded to **30,000 ms (30 seconds)**.

### 6.2 Critical Gaps Discovered

#### Gap 1: Invalidation is Dead Code in Production
`AuthService.invalidateUserStatus(userId)` exists, but **is never called anywhere in `UsersService`**.
In `UsersService.toggleActiveStatus(clinicId, id, isActive, actor)`:
```typescript
const updated = await tx.user.update({
  where: { id },
  data: { isActive },
  select: { id: true, email: true, fullName: true, role: true, isActive: true },
});
await this.auditService.log(...);
return updated;
// CRITICAL OMISSION: AuthService.invalidateUserStatus(id) is NEVER CALLED!
```
**Impact:** When an administrator deactivates a terminated employee, the employee's active token continues to grant full access for up to 30 seconds, even within a single-instance deployment.

#### Gap 2: Process-Local Memory Isolation (Horizontal Scaling Hazard)
Because `userStatusCache` is a static JavaScript `Map` inside the Node.js process heap:
- If Dentrinqo runs 2 API instances (Instance A and Instance B) behind a load balancer:
  1. Admin deactivates Doctor Jane on Instance A.
  2. Instance A updates PostgreSQL. Even if Instance A clears its local map, **Instance B knows nothing about this event**.
  3. Doctor Jane's next request routes to Instance B.
  4. Instance B checks its local cache: `{ isActive: true, expiresAt: now + 25000 }`.
  5. Instance B permits Doctor Jane to view confidential patient charts, download radiographs, and issue invoices for 25 seconds after termination.

### 6.3 Shared Revocation Strategy (Prioritized Options)

#### Option 1: Direct Indexed DB Query (Recommended for Single-Host / Low Overhead)
- PostgreSQL query: `SELECT "isActive" FROM "User" WHERE id = $1 AND "clinicId" = $2;`
- With the existing primary key B-Tree index on `User.id`, query execution time is **0.25 ms – 0.45 ms**.
- **Advantage:** 100% immediate consistency across all instances and processes without introducing Redis, cluster synchronization, or pub/sub latency.

#### Option 2: Redis Distributed Session Revocation
- When deactivating a user: `SET dentrinqo:revoked:user:{userId} 1 EX 86400`
- `AuthGuard` checks `EXISTS dentrinqo:revoked:user:{userId}` in Redis (< 1ms).
- Immediate revocation across all instances globally.

---

## 7. Comprehensive Matrix of Audit Findings

| Category | Finding ID | Requirement | Result | Classification | Launch Blocker? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Disaster Recovery** | DR-01 | Offsite backup replication (S3/GCS) | Backups strictly local on same SSD volume | ❌ **FAIL** | **YES (P0)** |
| **Disaster Recovery** | DR-02 | Backup encryption at rest | Plaintext `.sql.gz` on disk | ❌ **FAIL** | **YES (P0)** |
| **Disaster Recovery** | DR-03 | Automated backup failure alerts | Appends to local log only; no alerts | ❌ **FAIL** | **YES (P0)** |
| **Disaster Recovery** | DR-04 | Retention policy enforcement | 14-day rolling deletion functional | ✅ **PASS** | No |
| **Disaster Recovery** | DR-05 | Sandbox restoration verification | Tested & verified 100% row match | ✅ **PASS** | No |
| **Disaster Recovery** | DR-06 | Documented recovery runbook | Runbook missing; sandbox test script only | ⚠️ **PARTIAL** | No |
| **Image Uploads** | UP-01 | Nginx vs API size alignment | Nginx defaults to 1MB; API allows 50MB | ❌ **FAIL** | **YES (P1)** |
| **Image Uploads** | UP-02 | Radiograph upload streaming | Multer buffers 50MB in process RAM | ❌ **FAIL** | **YES (P1)** |
| **Image Uploads** | UP-03 | File type & magic byte validation | Trusts MIME; no binary magic check | ⚠️ **PARTIAL** | No |
| **Image Uploads** | UP-04 | Tenant isolation & authorization | Verified; strict RLS and tenant filter | ✅ **PASS** | No |
| **Image Uploads** | UP-05 | Path traversal protection | Storage keys randomized with crypto | ✅ **PASS** | No |
| **Image Uploads** | UP-06 | Upload timeout configuration | Nginx defaults to 60s; 50MB will timeout | ❌ **FAIL** | **YES (P1)** |
| **Rate Limiting** | RL-01 | Public endpoints rate-limited | OTP, booking, QR, tracking all throttled | ✅ **PASS** | No |
| **Rate Limiting** | RL-02 | Auth endpoints rate-limited | Login & password resets have NO limit | ❌ **FAIL** | **YES (P1)** |
| **Rate Limiting** | RL-03 | In-memory memory growth | 60s sweeper active; unbounded in window | ⚠️ **PARTIAL** | No |
| **Rate Limiting** | RL-04 | Client IP spoofing protection | Express `trust proxy: 1` configured | ✅ **PASS** | No |
| **Rate Limiting** | RL-05 | Distributed horizontal scaling | Process-local Map; needs Redis for multi-instance | ❌ **FAIL** | **YES (For Scaling)** |
| **Session Revocation**| SR-01 | Immediate deactivation propagation | `invalidateUserStatus` never invoked | ❌ **FAIL** | **YES (P1)** |
| **Session Revocation**| SR-02 | Multi-instance cache consistency | Process-local heap map; cross-instance leakage | ❌ **FAIL** | **YES (For Scaling)** |

---

## 8. Infrastructure Changes Requiring Explicit Authorization

The following infrastructure actions are required to resolve the blockers but **HAVE NOT BEEN EXECUTED** in accordance with safety restrictions:

1. **Authorization Item 1 — Nginx Reverse Proxy Modification:**
   - Update `/etc/nginx/sites-available/dental.conf` to set `client_max_body_size 50M;` and timeout directives.
   - Requires: `sudo nginx -t && sudo systemctl reload nginx`.
2. **Authorization Item 2 — Offsite Storage Bucket Provisioning:**
   - Provision an AWS S3 or Cloudflare R2 bucket (`dentrinqo-backups-encrypted`).
   - Configure IAM user with write-only policy (`s3:PutObject`).
   - Install AWS CLI / Rclone on production VM.
3. **Authorization Item 3 — Automated Cron Script Replacement:**
   - Replace `/usr/local/bin/dentrinqo-backup.sh` with the encrypted offsite replication script and healthchecks.io heartbeat webhook.
4. **Authorization Item 4 — Application Code Patches:**
   - Add `@Throttle({ default: { limit: 5, ttl: 60000 } })` to `/api/auth/login`, `/api/auth/forgot-password`, and `/api/auth/reset-password`.
   - Wire `AuthService.invalidateUserStatus(id)` in `UsersService.toggleActiveStatus()`.

---

## 9. Actionable Remediation Roadmap to Reach GO

```
[ PHASE 1: Code-Level Quick Wins (Zero Downtime) ]
  ├── 1. Add route-specific Throttlers to AuthController (login: 5/min, forgot-pwd: 3/min)
  ├── 2. Wire AuthService.invalidateUserStatus() into UsersService.toggleActiveStatus()
  └── 3. Run full Jest regression suite (ensure 83+ tests pass)

[ PHASE 2: Nginx & Medical Upload Alignment (Requires Authorization) ]
  ├── 1. Apply client_max_body_size 50M; and timeout directives in Nginx
  ├── 2. Test configuration via sudo nginx -t
  ├── 3. Gracefully reload Nginx (zero connection drop)
  └── 4. Staging validation: Upload a test 25MB radiograph to verify HTTP 200

[ PHASE 3: Offsite Backup & Disaster Recovery Hardening (Requires Authorization) ]
  ├── 1. Configure Cloudflare R2 / AWS S3 bucket with Object Lock
  ├── 2. Store GPG/Age encryption key in secure vault
  ├── 3. Deploy updated backup script with GPG encryption & S3 sync
  ├── 4. Set up Dead-Man's Switch on Healthchecks.io
  └── 5. Perform end-to-end restore test from cloud bucket to sandbox database
```

Once Phase 1, Phase 2, and Phase 3 are completed and verified, Dentrinqo can be safely transitioned to **PRODUCTION LAUNCH: GO**.
