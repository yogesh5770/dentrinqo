# DENTRINQO PRODUCTION READINESS AUDIT — PHASE 1
**Audit Date:** October 14, 2026  
**Auditor:** Senior SaaS Security & Healthcare Application Architect  
**Repository:** `C:\Users\yoges\.gemini\antigravity-ide\scratch\dentrinqo\`  
**Target Environment:** Multi-Tenant Healthcare Dental SaaS (Dentrinqo)  
**Database:** PostgreSQL 16 (with Fail-Closed Row-Level Security)  
**Operating Mode:** Read-Only Codebase & Configuration Audit  

---

## 1. Executive Verdict: **FAIL (CONDITIONAL LAUNCH BLOCKERS IDENTIFIED)**

While the walk-in concurrency advisory lock and billing consultation fee fixes have successfully eliminated double-booking races and synthetic ₹300 charges, **Dentrinqo is NOT ready for production deployment**. 

This comprehensive audit has uncovered **3 CRITICAL security vulnerabilities** and **4 HIGH operational risks** that expose patient Protected Health Information (PHI), allow unauthenticated patient record tampering, leak secrets in server logs, and present catastrophic single-point-of-failure data loss risks.

### Summary of Major Launch Blockers:
1. **CRITICAL — Unauthenticated PHI Disclosure via Public Status Endpoint**:  
   `GET /api/appointments/public-status/:identifier` accepts an arbitrary 10-digit phone number or short 5-character ID and returns unmasked patient full names, UHIDs, phone numbers, scheduled dentist names, visit reasons (clinical complaints), and whether intake medical conditions/allergies exist, with **zero authentication**.
2. **CRITICAL — Unauthenticated Medical Chart Modification (Intake Tampering)**:  
   `POST /api/appointments/public-intake/:reference` uses the vulnerable lookup above to resolve patients. Any unauthenticated caller who knows or guesses a phone number can overwrite patient allergies, cardiac conditions, diabetes status, pregnancy status, and emergency contact details.
3. **CRITICAL — Cross-Tenant Patient Existence Oracle & RLS Bypass Attempt**:  
   In `publicLookup` and `publicSelfCheckIn`, the backend queries across all tenant clinics in the database without `clinicId` context, leaking patient existence across unrelated dental clinics. Under PostgreSQL RLS, direct `this.prisma.appointment.findFirst` calls fail closed, breaking kiosk resolution.
4. **HIGH — Password Reset Plain Token Logged & Stored Plaintext**:  
   `AuthService.forgotPassword` prints generated reset tokens directly to stdout (`this.logger.log`), allowing log aggregators and developers to hijack accounts. Tokens are also stored in plaintext in the database rather than hashed with SHA-256.
5. **HIGH — Hardcoded JWT Secret Fallback in Patient Auth**:  
   `PatientAuthService` contains a hardcoded fallback secret (`'aks-elite-jwt-secure-super-key-madurai-2026-production'`) if `SESSION_SECRET` is unset, opening patient accounts to token forgery.
6. **HIGH — Immediate Data Loss Risk on Host Disaster**:  
   Backups run solely to local server storage (`/var/backups/dentrinqo`). There is no offsite replication (S3/external), no encryption at rest, and no failure alerting. If the host disk fails, all clinical databases and medical file archives are permanently lost.
7. **HIGH — Nginx 1MB Upload Bottleneck vs 50MB Medical Files**:  
   Nginx reverse proxy lacks `client_max_body_size`, causing dental OPGs, panoramic radiographs, and CBCT scans over 1MB to fail with `413 Request Entity Too Large`.

---

## 2. Technology Stack & Verification Context

| Layer | Component | Implementation Status | Verified Behavior |
| :--- | :--- | :--- | :--- |
| **API Framework** | NestJS 10 + Express | TypeScript, Modular Architecture | Global validation pipe, ThrottlerGuard enabled |
| **Database ORM** | Prisma Client 5.x | PostgreSQL Schema | `forTenant()` transaction context with `set_config('app.clinic_id', ...)` |
| **Database Engine** | PostgreSQL 16 | Multi-tenant Isolated DBs (`aks_dental`, `aks_dental_test`) | `FORCE ROW LEVEL SECURITY` on 26 tables; role `aks_app` has `rolbypassrls = false` |
| **Authentication** | Custom HMAC-SHA256 JWT | Stateless signed tokens | Argon2 password hashing; 8h staff / 30d patient session |
| **Reverse Proxy** | Nginx | Reverse proxy + Certbot SSL | HTTPS enforced; missing security headers; default 1MB upload cap |
| **Frontend** | React 18 + Vite | SPA | Multi-tenant dashboard, Reception desk, Doctor operatory, Billing desk |

---

## 3. Critical & High Severity Findings Matrix

| Finding ID | Severity | Category | File & Code Location | Impact | Status |
| :--- | :---: | :--- | :--- | :--- | :---: |
| **SEC-01** | **CRITICAL** | Patient Privacy | [`appointments.service.ts:2123-2262`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/appointments/appointments.service.ts#L2123-L2262) | Full patient PII/PHI (Name, UHID, Phone, Reason) exposed to unauthenticated callers via phone number or 5-char ID. | **FAIL** |
| **SEC-02** | **CRITICAL** | Clinical Integrity | [`appointments.service.ts:2945-2990`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/appointments/appointments.service.ts#L2945-L2990) | Unauthenticated callers can overwrite allergies, cardiac history, and emergency contacts on patient chart. | **FAIL** |
| **SEC-03** | **CRITICAL** | Multi-Tenancy | [`appointments.service.ts:1920-1939`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/appointments/appointments.service.ts#L1920-L1939) | Cross-tenant patient existence leakage by looping over all clinics without tenant context. | **FAIL** |
| **SEC-04** | **HIGH** | Auth & Logging | [`auth.service.ts:210-228`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/auth/auth.service.ts#L210-L228) | Plaintext password reset token printed to server logs; plain token stored in database. | **FAIL** |
| **SEC-05** | **HIGH** | Authentication | [`patient-auth.service.ts:42-48`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/patient-auth/patient-auth.service.ts#L42-L48) | Hardcoded fallback secret string enables patient JWT token forgery if environment variable unset. | **FAIL** |
| **OPS-01** | **HIGH** | Disaster Recovery | Server `/usr/local/bin/dentrinqo-backup.sh` | Local-only SSD backups without offsite S3 sync, encryption, or failure notifications. Single-point-of-failure. | **FAIL** |
| **OPS-02** | **HIGH** | Infrastructure | Server `/etc/nginx/sites-enabled/` | Default 1MB request body limit causes dental imaging uploads (OPG/X-rays up to 50MB) to fail with 413. | **FAIL** |
| **SEC-06** | **MEDIUM** | Information Leak | [`http-exception.filter.ts:18-22`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/common/filters/http-exception.filter.ts#L18-L22) | Raw database exception messages and table schema syntax reflected back in HTTP 500 JSON. | **FAIL** |
| **OPS-03** | **MEDIUM** | Scaling & Denial of Service | [`appointments.service.ts:1361-1375`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/appointments/appointments.service.ts#L1361-L1375) | In-memory rate limiting maps lack eviction (memory leak) and fail across multi-instance deployments. | **PARTIAL** |
| **SEC-07** | **MEDIUM** | Session Revocation | [`auth.guard.ts:25-30`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/auth/guards/auth.guard.ts#L25-L30) | Deactivated or terminated staff accounts retain valid 8-hour API access until JWT expiration. | **PARTIAL** |

---

## 4. Phase A — Patient Privacy & Public Endpoint Security

### Public Endpoint Audit Matrix

| Route | HTTP Method | Public Access | Data Exposed | Authorization / Verification | Privacy Assessment | Status |
| :--- | :---: | :---: | :--- | :--- | :--- | :---: |
| `/api/appointments/track/:code` | `GET` | Yes | Token, Queue position, Chair #, Clinic details, **Patient Phone (Unmasked)** | 128-bit random hex code | Phone number should be masked (e.g. `+91******3210`). | **PARTIAL** |
| `/api/appointments/public-status/:identifier` | `GET` | Yes | **Full Name, Phone, UHID, Dentist Name, Visit Reason, Allergies Presence** | Phone number or 5-char hex ID | **Severe PII/PHI leak**. Allows trivial phone-number scraping and patient enumeration. | **FAIL** |
| `/api/appointments/public-lookup` | `POST` | Yes | Token #, Status, Queue Ahead Count | Normalized 10-digit phone + optional token | When phone-only lookup is allowed, leaks patient visit today. Loops all clinics if host clinic missing. | **PARTIAL** |
| `/api/appointments/public-intake/:reference` | `POST` | Yes | Accepts Allergies, Medical Conditions, Emergency Contact | Relies on `public-status` lookup | **Unauthenticated chart tampering**. Strangers can inject fake medical allergies. | **FAIL** |
| `/api/appointments/public-request` | `POST` | Yes | Confirmation reference | Rate-limited (5/min), IP checked | Pre-booking creation. Requires desk confirmation. | **PASS** |
| `/api/appointments/public-book` | `POST` | Yes | Reference, Token # | Rate-limited (15/min), Fail-closed advisory lock | Safe walk-in & booking handler. | **PASS** |
| `/api/appointments/public-checkin` | `POST` | Yes | Token #, Assigned Chair, Queue count | Booking reference or 10-digit phone + optional lobby code | Scoped to tenant. Mandatory row-lock serialization. | **PASS** |
| `/api/appointments/public-chair-status` | `GET` | Yes | Active chairs, occupancy flag, token # | Clinic code or display token | Displays waiting room TV metrics; no patient PII returned. | **PASS** |
| `/api/appointments/public-booked-slots` | `GET` | Yes | Start time, duration of booked slots | Clinic code + date | Timestamps only; zero patient names or notes exposed. | **PASS** |
| `/api/clinic/public-info` | `GET` | Yes | Clinic name, address, working hours, phone | Host header / clinic code | General clinic contact card. UPI and staff email omitted. | **PASS** |
| `/api/clinic/marketing-info` | `GET` | Yes | Minimal clinic public profile | Host header / clinic code | Safe for external websites. | **PASS** |
| `/api/medical-files/:id/view` | `GET` | **No** | Dental X-rays, clinical photos | `@UseGuards(AuthGuard, RolesGuard)` | Properly restricted to authenticated staff. | **PASS** |
| `/api/medical-files/:id/download` | `GET` | **No** | Full resolution imaging | `@UseGuards(AuthGuard, RolesGuard)` | Properly restricted to authenticated staff. | **PASS** |
| `/api/patient-auth/signup` | `POST` | Yes | Patient auth session cookie | Password length, DPDP consent required | Host clinic verified. | **PASS** |
| `/api/patient-auth/login` | `POST` | Yes | Patient auth session cookie | Phone + Password | Lockout protection, host clinic verified. | **PASS** |
| `/api/patient-auth/me` | `GET` | **No** | Family members, profile | `@UseGuards(PatientAuthGuard)` | Restricted to authenticated patient account. | **PASS** |
| `/api/patient-auth/visits` | `GET` | **No** | Visit history for account | `@UseGuards(PatientAuthGuard)` | Scoped strictly to accountId + clinicId. IDOR safe. | **PASS** |

### Verified Defect Details: SEC-01 & SEC-02
- **File:** [`apps/api/src/appointments/appointments.service.ts`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/appointments/appointments.service.ts#L2123-L2262)
- **Reproduction:**  
  Send an unauthenticated request: `curl http://localhost:3000/api/appointments/public-status/9876543210`  
  Response returned:
  ```json
  {
    "success": true,
    "patientName": "Venkatesh Rao",
    "patientUhid": "AKS-2026-0001",
    "patientPhone": "+919876543210",
    "dentistName": "Dr. Khalidh",
    "reason": "[WALK-IN] Severe tooth pain lower right molar",
    "hasIntakeCompleted": true
  }
  ```
- **Remediation:**  
  1. Deprecate and remove phone-number lookup from `GET /api/appointments/public-status/:identifier`.
  2. Require high-entropy 128-bit unguessable tokens for public tracking (`/track/:code`).
  3. Never return unmasked patient full name, phone number, or clinical reasons on unauthenticated endpoints.
  4. Require patient portal authentication or one-time SMS verification to view medical details or submit health intake.

---

## 5. Phase B — Multi-Tenant Isolation & PostgreSQL RLS

### PostgreSQL RLS Table Policy Verification

An automated verification was executed against the isolated test database `aks_dental_test` using direct database connections as non-owner application role `aks_app`:

```sql
RESET app.clinic_id;
SELECT count(*) FROM "Patient"; -- Returned: 0
SELECT count(*) FROM "Appointment"; -- Returned: 0
SELECT count(*) FROM "Invoice"; -- Returned: 0
SELECT count(*) FROM "Payment"; -- Returned: 0
SELECT count(*) FROM "Prescription"; -- Returned: 0
SELECT count(*) FROM "MedicalFile"; -- Returned: 0
SELECT count(*) FROM "LabOrder"; -- Returned: 0
SELECT count(*) FROM "TreatmentPlan"; -- Returned: 0
SELECT count(*) FROM "Consultation"; -- Returned: 0
```

Direct insert without `app.clinic_id` tested:
```
NOTICE: SUCCESS: Direct insert without tenant session correctly blocked: new row violates row-level security policy for table "Patient"
```

### Table-by-Table Isolation Controls Matrix

| Table Name | `clinicId` Column | RLS Enabled | FORCE RLS | Isolation Policy | Role `aks_app` Bypass | Verified Status |
| :--- | :---: | :---: | :---: | :--- | :---: | :---: |
| `Clinic` | N/A (Root) | No | No | Tenant catalog; filtered by `id`, `code`, or `domain` | N/A | **PASS** |
| `ClinicDomain` | `clinicId` | No | No | Host/Domain routing directory | N/A | **PASS** |
| `User` | `clinicId` | Yes | Yes | `USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))` | Blocked (`rolbypassrls=f`) | **PASS** |
| `Patient` | `clinicId` | Yes | Yes | `USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))` | Blocked (`rolbypassrls=f`) | **PASS** |
| `Appointment` | `clinicId` | Yes | Yes | `USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))` | Blocked (`rolbypassrls=f`) | **PASS** |
| `DailyQueueSequence` | `clinicId` | Yes | Yes | `USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))` | Blocked (`rolbypassrls=f`) | **PASS** |
| `ClinicSequence` | `clinicId` | Yes | Yes | `USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))` | Blocked (`rolbypassrls=f`) | **PASS** |
| `Consultation` | `clinicId` | Yes | Yes | `USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))` | Blocked (`rolbypassrls=f`) | **PASS** |
| `TreatmentPlan` | `clinicId` | Yes | Yes | `USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))` | Blocked (`rolbypassrls=f`) | **PASS** |
| `CompletedProcedure`| `clinicId` | Yes | Yes | `USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))` | Blocked (`rolbypassrls=f`) | **PASS** |
| `Prescription` | `clinicId` | Yes | Yes | `USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))` | Blocked (`rolbypassrls=f`) | **PASS** |
| `MedicalFile` | `clinicId` | Yes | Yes | `USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))` | Blocked (`rolbypassrls=f`) | **PASS** |
| `FileAnnotation` | `clinicId` | Yes | Yes | `USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))` | Blocked (`rolbypassrls=f`) | **PASS** |
| `DentalChartEntry` | `clinicId` | Yes | Yes | `USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))` | Blocked (`rolbypassrls=f`) | **PASS** |
| `Invoice` | `clinicId` | Yes | Yes | `USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))` | Blocked (`rolbypassrls=f`) | **PASS** |
| `InvoiceItem` | `clinicId` | Yes | Yes | `USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))` | Blocked (`rolbypassrls=f`) | **PASS** |
| `Payment` | `clinicId` | Yes | Yes | `USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))` | Blocked (`rolbypassrls=f`) | **PASS** |
| `RefundAdjustment` | `clinicId` | Yes | Yes | `USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))` | Blocked (`rolbypassrls=f`) | **PASS** |
| `LabOrder` | `clinicId` | Yes | Yes | `USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))` | Blocked (`rolbypassrls=f`) | **PASS** |
| `AuditLog` | `clinicId` | Yes | Yes | `USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))` | Blocked (`rolbypassrls=f`) | **PASS** |

### Verified RLS Gap: SEC-03
- **File:** [`apps/api/src/appointments/appointments.service.ts:2300-2315`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/appointments/appointments.service.ts#L2300-L2315)
- **Defect:** In `publicSelfCheckIn`, when resolving clinic from an input identifier:
  ```typescript
  const matchingAppt = await this.prisma.appointment.findFirst({
    where: { OR: [ { patient: { phone: { contains: cleanIdent } } }, { patient: { uhid: cleanIdent } } ] },
    include: { clinic: true },
  });
  ```
  This query runs directly on `this.prisma` without `forTenant()`. Under PostgreSQL with RLS, because `app.clinic_id` is unset, this query always returns `null`, preventing legitimate patients from resolving their clinic if no domain or clinic code was passed.
- **Remediation:** Kiosk check-in must strictly resolve the tenant from the host domain (`req.hostname`), QR parameter (`clinicCode`), or standee kiosk configuration, never by scanning all tenants without context.

---

## 6. Phase C — Clinical Workflow & Financial Integrity

### Workflow Tracing & Invariant Verification

```
[Reception Desk]
   ├── Search Patient / Register Patient (UHID generated atomically)
   ├── Appointment Scheduled / Check-in QR Scanned
   │     └── PostgreSQL Row Lock (`FOR UPDATE`) / Advisory Lock
   │     └── Atomic Daily Queue Sequence (`DailyQueueSequence` increment)
   └── Presence Confirmed at Desk (`isConfirmedAtDesk = true`)
            ↓
[Doctor Operatory Workspace]
   ├── Call Patient to Chair (`CALLED`) -> Seated (`IN_CHAIR`)
   │     └── Dual-chair conflict check prevents calling 2 patients to same chair
   ├── Clinical Examination, Dental Charting & Diagnosis
   ├── Treatment Plan Formulated (Staged procedures with fees)
   └── Doctor Marks Procedures Completed (`CompletedProcedure` record created)
            ↓
[Billing Desk Checkout]
   ├── Patient appears in `getUnbilledQueue` with actual doctor procedures
   ├── INVARIANT VERIFIED: If 0 procedures completed, displays ₹0 (NO fake ₹300 charge)
   ├── Create Itemized Tax Invoice:
   │     ├── Sequential Number generated atomically: `${clinicCode}-INV-YYYY-XXXX`
   │     ├── Completed procedures marked `isBilled: true`
   │     └── 15-second double-click debounce prevents duplicate billing
   ├── Record Payment (Cash, UPI, Card, NetBanking)
   │     └── Receipt Number generated atomically: `${clinicCode}-REC-YYYY-XXXX`
   └── Invoice Voiding:
         ├── Restricted to `CLINIC_ADMIN` and `ACCOUNTANT`
         ├── Procedures unmarked (`isBilled: false`) so they can be re-billed
         └── Audit log generated; payments preserved in immutable audit history
```

### Financial Checks Summary

| Audit Item | Expected Invariant | Verified Implementation | Assessment |
| :--- | :--- | :--- | :---: |
| **Consultation Fee Fabrication** | Never create artificial ₹300 fee when patient seated | `billing.service.ts:601-620` returns `procedures: []` and `totalEstimatedPaise: 0` | **PASS** |
| **Empty Treatment Plan** | Distinguish between pending plan vs 0-fee plan | `BillingDesk.tsx` displays *"Doctor treatment plan pending"* and `Create Bill` | **PASS** |
| **Zero-Value Invoice** | Confirmation required before issuing ₹0 bill | `InvoiceModal.tsx` requires positive amount confirmation | **PASS** |
| **Double Billing Claim** | Cannot bill same procedure on two separate invoices | `billing.service.ts:39-47` queries `isBilled: true` and rejects with HTTP 400 | **PASS** |
| **Sequential Invoice Numbers** | No gaps or duplicates in fiscal year sequence | `nextSequence(clinicId, 'INVOICE', year)` via atomic PostgreSQL upsert | **PASS** |
| **Void Audit Trail** | Voids must preserve ledger without hard-deleting rows | `billing.service.ts:391-458` sets `status: 'VOIDED'`, unbills procedures, preserves receipts | **PASS** |

---

## 7. Phase D — Authentication, Authorization & Session Security

### Findings & Security Analysis

1. **Password Reset Token Logging (SEC-04 - HIGH):**  
   In [`apps/api/src/auth/auth.service.ts:223`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/auth/auth.service.ts#L223):
   ```typescript
   this.logger.log(`Password reset token generated for ${user.email}: ${resetToken}`);
   ```
   Reset tokens must never be written to stdout or logs. Tokens must also be hashed with SHA-256 before persisting in the `User` table.
2. **Hardcoded Fallback Secret in PatientAuthService (SEC-05 - HIGH):**  
   In [`apps/api/src/patient-auth/patient-auth.service.ts:44`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/patient-auth/patient-auth.service.ts#L44):
   ```typescript
   this.secretKey = 'aks-elite-jwt-secure-super-key-madurai-2026-production';
   ```
   If `SESSION_SECRET` is missing, `PatientAuthService` does not halt startup like `AuthService`, but silently uses this hardcoded string, allowing attackers to forge patient portal tokens.
3. **Session Revocation Gap for Terminated Staff (SEC-07 - MEDIUM):**  
   [`auth.guard.ts:25`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/auth/guards/auth.guard.ts#L25) validates JWT signatures statelessly without checking whether `user.isActive` is still true in the database or cache. Terminated employees retain access until their 8-hour token expires.
4. **Unhandled Database Exception Information Disclosure (SEC-06 - MEDIUM):**  
   In [`apps/api/src/common/filters/http-exception.filter.ts:21`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/common/filters/http-exception.filter.ts#L21):
   `message = exception.message;` reflects raw PostgreSQL constraint and query syntax errors to the client.
5. **Swagger Documentation Exposed in Production:**  
   [`apps/api/src/main.ts:108`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/main.ts#L108) unconditionally mounts Swagger UI at `/api/docs`. In production, this should be disabled or protected behind admin authentication.

---

## 8. Phase E — Backups & Disaster Recovery

### Infrastructure Backup Audit

The live remote server configuration at `137.23.45.243` was inspected via read-only SSH commands.

- **Active Cron Job:**
  ```bash
  0 2 * * * /usr/local/bin/dentrinqo-backup.sh
  ```
- **Backup Execution Script (`/usr/local/bin/dentrinqo-backup.sh`):**
  - Dumps database using `pg_dump -d aks_dental -F p | gzip > /var/backups/dentrinqo/db_aks_dental_YYYYMMDD_HHMMSS.sql.gz`
  - Archives medical files using `tar -czf /var/backups/dentrinqo/uploads_YYYYMMDD_HHMMSS.tar.gz -C /var/www/dental-api uploads/`
  - Prunes local backups older than 14 days (`-mtime +14 -delete`)

### Critical Disaster Recovery Risks (OPS-01)

| Control | Expected Production Standard | Current State on Server | Risk Level | Assessment |
| :--- | :--- | :--- | :---: | :---: |
| **Off-Site Replication** | Daily sync to remote S3 bucket in secondary cloud region | **Missing**. Backups stored ONLY on local `/var/backups/dentrinqo` disk. | **HIGH** | **FAIL** |
| **At-Rest Encryption** | Dumps encrypted with AES-256-CBC using PBKDF2 before storage | **Missing**. Plain gzip archives stored on disk. | **MEDIUM** | **FAIL** |
| **Failure Alerting** | Webhook / SMS / email notification if dump fails | **Missing**. Errors go to local log only; no alert triggers on failure. | **HIGH** | **FAIL** |
| **Restoration Testing** | Verified restoration to sandbox database | Tested previously in sandbox `aks_dental_restore_verification` (counts matched). | **MEDIUM** | **PASS** |
| **Medical File Attachment Restoration** | Verified file integrity after extraction | Archive created; end-to-end checksum verification unperformed. | **LOW** | **NOT VERIFIED** |

---

## 9. Phase F — Production Operations & Scaling

1. **In-Memory Rate Limiting (OPS-03):**  
   The application uses static in-memory `Map` objects (`AppointmentsService.lookupRateLimits`, `trackRateLimits`, `ipFailures`) and NestJS `ThrottlerModule` in-memory storage. This design does not share state across multiple instances. If Dentrinqo scales to multiple processes or containers, rate limits will be multiplied, and process restarts will reset failure counters. A shared Redis store is required for horizontal scaling.
2. **Nginx Upload Limit Bottleneck (OPS-02):**  
   Nginx reverse proxy lacks an explicit `client_max_body_size` directive, defaulting to 1MB. The API accepts medical files up to 50MB. Uploads larger than 1MB fail at Nginx with HTTP 413.
3. **Missing HTTP Security Headers:**  
   The Nginx configuration lacks essential security headers:
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains` (HSTS)
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: SAMEORIGIN`
   - `Content-Security-Policy`

---

## 10. Recommended Remediation Plan (Prioritized by Severity)

### P0 — Immediate Launch Blockers (Must Fix Before Any Production Deployment)
1. **Fix SEC-01 & SEC-02 (Patient Privacy & Intake Tampering):**
   - In [`apps/api/src/appointments/appointments.controller.ts`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/appointments/appointments.controller.ts), remove public mobile number lookup from `publicStatus`.
   - In `getPublicStatus`, strip all PII (`patientName`, `patientPhone`, `patientUhid`, `reason`).
   - Restrict `submitPublicIntake` to authenticated patient sessions or verified 128-bit single-use intake tokens.
2. **Fix SEC-03 (Cross-Tenant RLS Lookup):**
   - Remove the cross-clinic scanning loop in `publicLookup` and `publicSelfCheckIn`.
   - Require explicit tenant resolution via hostname, subdomain, or clinic code.
3. **Fix SEC-04 & SEC-05 (Auth & Secrets Hardening):**
   - Remove `this.logger.log` containing `resetToken` in `AuthService.forgotPassword`.
   - Store SHA-256 hash of password reset tokens in database (`resetPasswordTokenHash`).
   - Remove hardcoded fallback secret in `PatientAuthService`; halt startup if `SESSION_SECRET` is unset.
4. **Fix OPS-01 (Off-Site Backup & Alerting):**
   - Activate `/etc/dental-backup.conf` with S3 credentials or configure automated `rclone` / `aws s3 sync` to an offsite S3 bucket.
   - Configure failure alerting webhook (Telegram / Slack / Discord / PagerDuty).

### P1 — Staging Hardening (Resolve Before Staging Sign-Off)
5. **Fix OPS-02 (Nginx Upload Size):**
   - Add `client_max_body_size 50M;` to `/etc/nginx/sites-enabled/*` to support clinical radiographs.
   - Add security headers (`HSTS`, `X-Content-Type-Options`, `X-Frame-Options`).
6. **Fix SEC-06 (Exception Filter Information Leakage):**
   - Update `AllExceptionsFilter` to return a sanitized generic error message for unhandled non-HTTP exceptions in production.
7. **Fix SEC-07 (Deactivated Staff Session Revocation):**
   - Add a lightweight check in `AuthGuard` (or cached Redis set) verifying `user.isActive !== false`.

### P2 — Horizontal Scaling Preparation (Prior to Multi-Instance Launch)
8. **Fix OPS-03 (Distributed Rate Limiting):**
   - Replace static `Map` rate limiters with Redis-backed rate limiting (`ioredis` + `@nest-lab/throttler-storage-redis`).

---

## 11. Final Auditor Conclusion

Dentrinqo's core concurrency engine, PostgreSQL RLS schema, daily queue sequencing, and billing integrity are structurally sound and well-engineered. However, the identified **unauthenticated patient data exposure endpoints (`public-status` / `public-intake`)**, **plaintext token logging**, **missing off-site backup replication**, and **Nginx upload limit mismatch** are critical launch blockers.

**Verdict: NOT APPROVED FOR PRODUCTION.**  
Resolve the P0 blockers, run regression verification, and validate in staging before considering production deployment.
