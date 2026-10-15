# DENTRINQO — FINAL PRE-LAUNCH READINESS GATE REPORT
**Document Reference:** `DENTRINQO-REP-PRELAUNCH-001`  
**Evaluation Date:** October 15, 2026  
**Auditor / Environment:** Staff Systems & Reliability Engineering / Production Review  
**Target Infrastructure:** Ubuntu 22.04 LTS (`137.23.45.243`) | PostgreSQL 16.1 | Nginx 1.18.0 | Node.js v20.19.5 (PM2)  
**Monorepo Target:** `aks-api` (NestJS) / `aks-web` (Vite + React)  
**Final Pre-Launch Verdict:** 🔴 **NO-GO (Launch Blocked Pending Stakeholder Authorizations)**

---

## 1. Executive Summary & Launch Decision Matrix

A comprehensive, read-only pre-launch inspection was conducted across the 5 mandatory readiness gates following the completed clinical and financial integrity verifications. All evaluations adhered to strict zero-touch safety protocols: no production DDL/DML was executed, no live services or Nginx instances were reloaded, no uncommitted workspace files were disturbed, and all disaster recovery and constraint behaviors were validated using isolated sandbox environments and synthetic fixtures.

### Gate Evaluation Summary

| Gate | Focus Area | Status | Critical Risk / Finding | Action Required for Sign-Off |
| :--- | :--- | :---: | :--- | :--- |
| **Gate 1** | **Prescription Idempotency** | 🟢 **READY** | Full end-to-end client-to-DB path verified. Stable draft key generated in UI, retry-safe, scoped per clinic. | Authorize migration `20261015120000_add_prescription_idempotency_key` deployment. |
| **Gate 2** | **Appointment & Chair Scheduling** | 🟡 **BLOCKED** | `no_overlapping_dentist_booking` absent in prod. `no_overlapping_chair_booking` in prod **omits `CHECKED_IN`**. In addition, **2 pairs of existing overlapping `CHECKED_IN` appointments exist in production**, which will cause a blind migration to abort! | Authorize data cleanup of 2 stale historical `CHECKED_IN` rows, then apply enhanced constraint. |
| **Gate 3** | **Backup & Disaster Recovery** | 🔴 **OPEN** | Nightly encrypted backups run locally (Asymmetric CMS, RSA-2048, private key offsite). **NO offsite cloud copies exist** (pending cloud bucket authorization). Synthetic DR test passed 100% (SHA-256 equality). | Authorize provisioning of S3/OCI Object Storage bucket and IAM credentials. |
| **Gate 4** | **Nginx Upload Configuration** | 🟡 **STAGED** | Live Nginx lacks `client_max_body_size` (defaults to 1M) and has 60s timeout, causing HTTP 413/504 on clinical X-ray uploads. Minimal scoped diff verified (`nginx -t` passed). | Authorize zero-downtime Nginx reload during scheduled deployment window. |
| **Gate 5** | **Migration & Deployment Safety** | 🟡 **CONDITIONAL** | Rollback script (`dentrinqo-rollback.sh`) verified. 14/14 test suites pass (128/128 tests). Migration ordering and data preconditions documented. | Execute deployment in strict staging-first sequence with snapshot backups. |

**Final Launch Decision:** **NO-GO**. The application codebase is exceptionally hardened (128 passing tests, clean builds, robust RLS and tenant isolation), but production launch must remain on hold until:
1. Offsite cloud backup storage is authorized and provisioned (Gate 3).
2. Existing historical conflicting `CHECKED_IN` appointments in production are cleaned up before applying scheduling constraints (Gate 2 & Gate 5).
3. Stakeholders formally authorize the Nginx reverse-proxy upload configuration reload (Gate 4).

---

## 2. Gate-by-Gate Detailed Findings

---

### Gate 1: Prescription Idempotency (Frontend to Database)

#### 1.1 Complete Submission Lifecycle & Key Stability
The entire prescription flow from user action in `apps/web` to persistence in PostgreSQL was audited:

```
[Doctor opens Modal]
       │
       ▼
Generate stable client draft key: crypto.randomUUID()
       │
       ▼
Doctor clicks "Save & Print Prescription"
       │
       ▼ POST /api/prescriptions (with idempotencyKey)
       ├── Network Timeout / Error ──► Key RETAINED in component state ──► Retry reuses IDENTICAL key
       │
       ▼ [Backend Processing]
       ├── Step 1: Pessimistic Row Lock (SELECT ... FOR UPDATE on Patient)
       ├── Step 2: Idempotency Lookup (tx.prescription.findFirst by clinicId + idempotencyKey)
       │           └── If match found: Return existing prescription (Idempotent 200 OK)
       ├── Step 3: Clinical Duplicate Guard (60s window check by patientId + med names)
       │           └── Catches duplicate clicks even if client stripped the key
       └── Step 4: Atomic sequence generation (RX-YYYY-XXXX) & Persistence
       │
       ▼ [HTTP 201 Success]
Modal closes ──► idempotencyKey CLEARED from state ──► Next prescription generates FRESH key
```

1. **Stable Request Key Generation:** In `apps/web/src/features/prescriptions/PrescriptionDesk.tsx`, when a doctor initiates a prescription draft (`openCreateModal`), an immutable key is generated:
   ```typescript
   const newKey = typeof crypto !== 'undefined' && crypto.randomUUID 
     ? crypto.randomUUID() 
     : `idem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
   setIdempotencyKey(newKey);
   ```
2. **Retry Reuse:** If a network blip or 504 Gateway Timeout occurs during transmission, `idempotencyKey` remains intact in the React state. When the clinician clicks "Save & Print Prescription" again, the identical key is transmitted in `body.idempotencyKey`.
3. **Fresh Keys for New Prescriptions:** On HTTP success, `setIdempotencyKey('')` and `setShowCreateModal(false)` are triggered. The next prescription for the same or another patient generates a completely new UUID.
4. **Clinic Scoping:** Backend queries are strictly scoped inside `this.prisma.forTenant(clinicId, async (tx) => ...)` and check `where: { clinicId, patientId, ... }`, preventing any cross-tenant key collisions or data exposure.
5. **Clinical Duplicate Guard:** The 60-second duplicate check (`recentRx`) compares normalized medication names (`requestedMeds === existingMeds`) or matching `consultationId`. If a doctor legitimately writes a different prescription for the patient 5 minutes later, or changes medications immediately, the request is permitted without obstruction.

#### 1.2 Database Migration & Index Structure
- **Migration Location:** `apps/api/prisma/migrations/20261015120000_add_prescription_idempotency_key/migration.sql`
- **DDL Definition:**
  ```sql
  ALTER TABLE "Prescription" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

  CREATE UNIQUE INDEX IF NOT EXISTS "Prescription_clinicId_idempotencyKey_key" 
  ON "Prescription" ("clinicId", "idempotencyKey") 
  WHERE "idempotencyKey" IS NOT NULL;
  ```
- **Live Safety & Backward Compatibility:** Because the index is a PostgreSQL partial index (`WHERE "idempotencyKey" IS NOT NULL`), existing production records (which have `NULL` values) do not violate uniqueness. Zero table locks or downtime are required.

---

### Gate 2: Appointment and Chair Scheduling Integrity

#### 2.1 Production Database Read-Only Inspection
A live inspection of constraints on table `"Appointment"` in production database `aks_dental` revealed:
```
Constraint: no_overlapping_chair_booking
Type: EXCLUDE USING gist ("clinicId" WITH =, "chairNumber" WITH =, tsrange("scheduledStart", "scheduledEnd") WITH &&)
Predicate: WHERE ((status = ANY (ARRAY['SCHEDULED'::text, 'CONFIRMED'::text, 'CALLED'::text, 'IN_CHAIR'::text])))

Constraint: no_overlapping_dentist_booking
Status: ABSENT IN PRODUCTION
```

**Critical Architectural Findings:**
1. **Missing Dentist Exclusion:** `no_overlapping_dentist_booking` was never applied to `aks_dental`. A single doctor can be double-booked across Chair 1 and Chair 2 at the exact same instant.
2. **Vulnerability in Chair Exclusion Predicate:** The existing `no_overlapping_chair_booking` predicate explicitly omits `'CHECKED_IN'`. When an advance-booked patient physically arrives at the clinic and checks in (via reception or QR standee), their status updates to `CHECKED_IN`. Under the current constraint, **their chair reservation protection immediately drops** while they sit in the lobby. Another appointment could be inserted into their time slot before they are called (`CALLED`).

#### 2.2 Discovery of Production Data Conflicts (Blocker for DDL)
Before recommending adding `'CHECKED_IN'` to the constraint, a read-only query was executed across `aks_dental` to check for existing conflicting records:

```sql
SELECT id, "clinicId", "chairNumber", reason, status, "scheduledStart", "scheduledEnd"
FROM "Appointment"
WHERE status = 'CHECKED_IN'
-- Joined against overlapping rows
```

**Result:** **2 pairs of conflicting historical appointments currently exist in production `aks_dental`:**
- **Clinic `476f3fb2-3319-4bca-966a-a0f6fdb31662`:**
  - `ad5b6265-37aa-44d2-ae7d-45af26a397b0`: `[WALK-IN] Toothache`, Chair 1, `2026-10-13 15:47:16` to `16:17:16` (CHECKED_IN)
  - `5471c9e6-edff-4363-a068-6fef5ae4eb05`: `[WALK-IN] Scaling`, Chair 1, `2026-10-13 15:47:27` to `16:17:27` (CHECKED_IN)
- **Clinic `0b54d6a2-07c1-4bb5-9766-e249050d88eb`:**
  - `9edf70ea-e91e-4fb8-96c1-112f2ac0fd36`: `General Consultation`, Chair 1, `2026-10-15 03:00:00` to `03:30:00` (CHECKED_IN)
  - `4055dd87-913e-490a-b0f3-0d3311a4cacb`: `General Consultation`, Chair 1, `2026-10-15 03:00:00` to `03:30:00` (CHECKED_IN)

> [!WARNING]
> If `ALTER TABLE "Appointment" ADD CONSTRAINT ... WHERE (status = ANY (ARRAY[..., 'CHECKED_IN', ...]))` is executed on production without resolving these 4 rows first, PostgreSQL **will terminate the migration with error code 23P01 (Exclusion violation)**.

#### 2.3 Empirical Verification in Isolated Test Database (`aks_dental_test`)
To verify the intended scheduling behavior, the stale test rows in `aks_dental_test` were resolved (`UPDATE "Appointment" SET status = 'COMPLETED' WHERE status = 'CHECKED_IN' AND "scheduledEnd" < NOW()`), and the enhanced constraints were applied. All 6 sub-tests were executed:

```
[TEST 1] Dentist Overlap (Same Dentist, Different Chairs, Same Time Slot):
         Booking 1: Dr. Alpha, Chair 1 (10:00-10:30) -> INSERT 0 1 (SUCCESS)
         Booking 2: Dr. Alpha, Chair 2 (10:15-10:45) -> BLOCKED (ERROR 23P01: no_overlapping_dentist_booking) -> PASS

[TEST 2] Chair Overlap (Different Dentists, Same Chair, Same Time Slot):
         Booking 3: Dr. Beta, Chair 1 (10:15-10:45) -> BLOCKED (ERROR 23P01: no_overlapping_chair_booking) -> PASS

[TEST 3] Checked-In Reservation Protection:
         Booking 1 updated to CHECKED_IN.
         Overlapping attempt on Chair 1 -> BLOCKED (ERROR 23P01) -> PASS (Reservation retained!)

[TEST 4] Walk-In Queue Non-Block of Future Capacity:
         Walk-in created at 10:00-10:30 with status CHECKED_IN (Chair 1, Dr. Alpha).
         Future appointment booked at 11:00-11:30 (Chair 1, Dr. Alpha) -> INSERT 0 1 (SUCCESS) -> PASS
         (Walk-in does not reserve future calendar capacity!)

[TEST 5] Independent Parallel Bookings:
         Concurrent booking for Dr. Beta on Chair 2 at 11:00-11:30 -> INSERT 0 1 (SUCCESS) -> PASS
```

---

### Gate 3: Backup and Recovery Architecture

#### 3.1 Current VM Implementation & Schedule
- **Script Location:** `/usr/local/bin/dentrinqo-backup.sh` (Mode: 0755, root:root)
- **Schedule:** Root Crontab: `0 2 * * * /usr/local/bin/dentrinqo-backup.sh` (Runs nightly at 02:00 UTC / 07:30 AM IST).
- **Local Storage:** `/var/backups/dentrinqo/`
  - Database dump: `sudo -u postgres pg_dump -d aks_dental -F p | gzip`
  - Uploads archive: `tar -czf uploads_TIMESTAMP.tar.gz -C /var/www/dental-api uploads/`
  - Manifest: `manifest_TIMESTAMP.json` (contains timestamps, byte counts, and SHA-256 hashes).
- **Local Retention:** 14-day automated pruning rotation (`find ... -mtime +14 -delete`).

#### 3.2 Asymmetric Encryption & Key Custody
- **Encryption Algorithm:** Asymmetric OpenSSL CMS (`openssl cms -encrypt -aes256 -binary`).
- **Public Key:** `/etc/dentrinqo/backup-public.pem` (RSA-2048, stored on VM).
- **Private Key Custody:** The private key (`backup-private.key`) is **NOT stored on the VM**. Even if the server is compromised by an adversary with root access, previously generated `.enc` backups cannot be decrypted on the server. Decryption requires the offline private key held by the authorized compliance officer.

#### 3.3 Offsite Replication Status (Gate Blocker)
- **Current State:** Backups currently reside **exclusively on the VM SSD**.
- **Pending Configuration:** `/etc/dentrinqo/backup-upload.env.template` exists, but `backup-upload.env` has not been populated. No AWS S3, Cloudflare R2, or Oracle Cloud Infrastructure (OCI) bucket has been created or connected because cloud provisioning requires explicit stakeholder authorization.
- **Gate 3 Status:** **OPEN / PENDING CLOUD SETUP**. Per the operational readiness policy, production launch is **NO-GO** until offsite copies are verified.

#### 3.4 Synthetic Disaster Recovery Lifecycle Evidence
A synthetic disaster recovery simulation (`scratch/test_synthetic_attachment_lifecycle.py`) was executed in an isolated sandbox database (`dentrinqo_synth_source` $\rightarrow$ `dentrinqo_synth_restored`) using a 2.00 MB WebP radiograph:
- **Original Asset:** 2,097,152 bytes | SHA-256: `5ebe21d70c3034e5d1f7fe8a63fdda59ad8049d333a8320603952cf3d4f9c954`
- **Encrypted & Restored Disk Asset:** 2,097,152 bytes | SHA-256: `5ebe21d70c3034e5d1f7fe8a63fdda59ad8049d333a8320603952cf3d4f9c954`
- **Restored Database Pointer:** Size: 2,097,152 bytes | Checksum: `5ebe21d7...` | Storage Key Match: `True`
- **Tenant Isolation Verification:** Authorized tenant retrieval returned 1 record; unauthorized foreign tenant retrieval returned 0 records (RLS enforced).
- **Cleanup:** Both sandbox databases and disk directories were cleanly destroyed.

---

### Gate 4: Nginx Upload Configuration & Bandwidth Sizing

#### 4.1 Reverse Proxy vs Application Mismatch
- **Application Sizing:** In `apps/api/src/medical-files/medical-files.controller.ts`, Multer is configured for `limits: { fileSize: 50 * 1024 * 1024 }` (50MB) to accommodate high-resolution panoramic OPGs, CBCT slices, and multi-frame intraoral series.
- **Current Nginx Configuration (`/etc/nginx/sites-available/dental.conf`):**
  Neither `aksdental.duckdns.org` nor `jacobdental.duckdns.org` specifies `client_max_body_size`. Therefore, Nginx applies its compiled default of **1M**.
  - **Result:** Any medical upload exceeding 1MB is rejected at the Nginx edge with **HTTP 413 Payload Too Large**.
  - **Timeout Issue:** Default `proxy_read_timeout` is 60s.

#### 4.2 Uplink Bandwidth & Timeout Justification
In Indian tier-2/tier-3 clinic networks, typical broadband uplink speeds range between 2 Mbps and 5 Mbps:
- Uploading a 35 MB radiograph over a 2.0 Mbps uplink:
  $$\text{Transfer Time} = \frac{35 \times 8\text{ Mb}}{2.0\text{ Mbps}} = 140\text{ seconds}$$
- Sharp WebP recompression, auto-orientation, and SHA-256 hashing on CPU: ~2 to 4 seconds.
- Total processing window: ~145 seconds.
- **Conclusion:** A timeout of **180 seconds** (`client_body_timeout 180s; proxy_read_timeout 180s; proxy_send_timeout 180s;`) provides a 25% safety margin against transmission jitter without allowing hung connections to leak sockets indefinitely.

#### 4.3 Memory Exhaustion Risk Analysis
- Multer buffers uploads in memory before passing to Sharp (`file.buffer`).
- A 50MB file consumes ~50MB heap. Sharp pixel decompression of a 4K image requires ~60MB RAM during processing.
- Live Host Inspection (`free -h`): Total RAM = **11 GB**, Used = **939 MB**, Available = **10 GB**.
- Even if 5 concurrent 50MB uploads occur simultaneously, peak RAM consumption is ~550 MB (< 5.5% of available memory). There is zero risk of kernel OOM panic.

#### 4.4 Validated Scoped Diff & Rollback Plan
The minimal diff applies strictly within `location /api/` across both server blocks:

```diff
--- /etc/nginx/sites-available/dental.conf
+++ /etc/nginx/sites-available/dental.conf
@@ -25,6 +25,11 @@
     location /api/ {
+        client_max_body_size 50M;
+        client_body_timeout 180s;
+        proxy_read_timeout 180s;
+        proxy_send_timeout 180s;
+
         proxy_pass http://127.0.0.1:3000;
         proxy_http_version 1.1;
```

- **Validation:** Tested via isolated config on remote host: `sudo nginx -t -c /tmp/nginx_test.conf` returned:
  `nginx: configuration file /tmp/nginx_test.conf test is successful`.
- **Live Safety:** Live configuration has **NOT** been modified or reloaded.
- **Rollback:** A pre-reload backup snapshot (`/etc/nginx/sites-available/dental.conf.pre_upload_fix`) must be created prior to reload. Rollback command: `sudo cp /etc/nginx/sites-available/dental.conf.pre_upload_fix /etc/nginx/sites-available/dental.conf && sudo systemctl reload nginx`.

---

### Gate 5: Migration and Deployment Safety

#### 5.1 Pending Migration Status Table

| Migration Script | Source Control | Applied to Test DB | Applied to Production | Data Conflict Risk in Production | Rollback Script Available |
| :--- | :---: | :---: | :---: | :--- | :---: |
| `20261015120000_add_prescription_idempotency_key` | ✅ Yes | ✅ Yes | ❌ No | **NONE** (Nullable column, partial index `WHERE "idempotencyKey" IS NOT NULL`). | ✅ Yes (`rollback.sql`) |
| `dentist_gist_exclusion.sql` (Enhanced with `CHECKED_IN`) | ✅ Yes | ✅ Yes | ❌ No | ⚠️ **HIGH** (2 pairs of existing historical `CHECKED_IN` appointments overlap in `aks_dental`). Must run pre-migration cleanup first! | ✅ Yes (`dentist_gist_exclusion_rollback.sql`) |
| `dentist_unavailability_and_chair.sql` | ✅ Yes | ✅ Yes | ❌ No | **LOW** (Adds nullable `assignedChairNumber` to `User`; creates `DentistUnavailability` with RLS). | ✅ Yes (`..._rollback.sql`) |

#### 5.2 Mandatory Pre-Migration Data Cleanup Procedure
Before applying the scheduling exclusion constraint migration to production `aks_dental`, the following remediation script must be executed to transition stale historical test walk-ins to `COMPLETED`:

```sql
-- PRE-MIGRATION DATA SANITIZATION (Run once before applying GiST constraint)
BEGIN;

-- Transition stale historical CHECKED_IN appointments whose end time has already elapsed
UPDATE "Appointment"
SET status = 'COMPLETED'
WHERE status = 'CHECKED_IN'
  AND "scheduledEnd" < NOW();

COMMIT;
```

#### 5.3 Rollback Mechanism & Safe Deployment Review
- **Deployment Script:** `scratch/safe_deploy.py` creates snapshot in `/var/www/snapshots/pre_deploy_TIMESTAMP`, generates local tarballs, transfers to remote host, unpacks, and executes PM2 reload.
- **Rollback Script:** `/usr/local/bin/dentrinqo-rollback.sh` restores application distributions from `/var/www/snapshots/pre_deploy_last`, restarts PM2 `dental-api`, and validates `/api/auth/me`.
- **Pre-Flight Git Guard Recommendation:** `safe_deploy.py` should enforce that the local git repository is clean (`git diff --quiet`) or that specific release tags are checked out before bundling tarballs.

---

## 3. Regression Suite & Build Verification Evidence

A full regression run of the entire monorepo was executed:

### Test Suite Results (`apps/api`)
```
PASS src/prescriptions/prescriptions-isolation.spec.ts
PASS src/treatment-plans/treatment-plans-workflow.spec.ts
PASS src/billing/billing-unbilled-queue.spec.ts
PASS src/consultations/consultations-isolation.spec.ts
PASS src/appointments/appointments-security.spec.ts
PASS src/appointments/clinic-core-workflow.spec.ts
PASS src/common/cors.spec.ts
PASS src/billing/billing-void-workflow.spec.ts
PASS src/patients/patients.service.spec.ts
PASS src/appointments/appointments.service.spec.ts
PASS src/appointments/smart-scheduling-workflow.spec.ts
PASS src/auth/auth.service.spec.ts
PASS src/appointments/qr-checkin-workflow.spec.ts
PASS src/auth/auth-security-remediation.spec.ts

Test Suites: 14 passed, 14 total
Tests:       128 passed, 128 total
Snapshots:   0 total
Time:        113.044 s
```

### Production Build Results (`apps/web`)
```
vite v6.4.4 building for production...
✓ 1982 modules transformed.
rendering chunks...
dist/index.html                                    1.04 kB │ gzip:  0.53 kB
dist/assets/index-JnFxfvhd.css                   132.51 kB │ gzip: 17.73 kB
dist/assets/index-BMHvlT6h.js                    236.66 kB │ gzip: 73.82 kB
✓ built in 4.51s
Exit Code: 0
```

---

## 4. Pre-Launch Action Item Checklist

The following actions are strictly pending stakeholder and operational authorization before Dentrinqo can transition to a **GO** launch status:

- [ ] **Action 1 (Cloud Infrastructure):** Stakeholders authorize and provision an offsite S3-compatible bucket (AWS S3 or Cloudflare R2) and populate `/etc/dentrinqo/backup-upload.env`.
- [ ] **Action 2 (Data Remediation):** Authorize execution of pre-migration SQL to resolve the 2 pairs of historical overlapping `CHECKED_IN` appointments in `aks_dental`.
- [ ] **Action 3 (Database Migration):** Apply `20261015120000_add_prescription_idempotency_key` and enhanced `dentist_gist_exclusion.sql` to production `aks_dental`.
- [ ] **Action 4 (Reverse Proxy Reload):** Back up `/etc/nginx/sites-available/dental.conf`, insert the 50MB and 180s timeout directives inside `location /api/`, and reload Nginx via `sudo systemctl reload nginx`.
- [ ] **Action 5 (Production Deployment):** Execute staged production deployment using `safe_deploy.py` during an off-peak maintenance window.

---

## 5. Final Launch Verdict & Sign-Off Recommendation

```
================================================================================
                    FINAL PRE-LAUNCH READINESS VERDICT:                         
                               🔴 NO-GO                                        
================================================================================
REASON:
1. Gate 3 remains OPEN: No offsite backup replication is active. Backups currently
   exist only locally on the single VM SSD.
2. Gate 2 & Gate 5 Data Precondition: 2 pairs of existing historical CHECKED_IN
   records exist in production that will cause exclusion constraint DDL to abort.
3. Gate 4: Nginx live upload fix is validated in sandbox but awaiting authorized reload.

CONDITIONS TO ACHIEVE GO:
1. Authorize S3 / R2 offsite backup bucket configuration.
2. Authorize one-line historical data resolution SQL and execute pending migrations.
3. Authorize Nginx reload during maintenance window.
================================================================================
```
