# Dentrinqo P0 Security Remediation & Verification Report

**Date:** October 14, 2026  
**Auditor / Architect:** Senior Application Security Engineer & NestJS/PostgreSQL Architect  
**Repository Branch:** `integration/clinic-hours-and-dual-qr`  
**Monorepo Path:** `C:\Users\yoges\.gemini\antigravity-ide\scratch\dentrinqo\`  
**Target Environment:** Staging Pre-Deployment  
**Monorepo Build Status:** `SUCCESS` (0 errors across `@aks/shared-types`, `aks-api`, `aks-web`)  
**API Test Suite Status:** `11 / 11 Passed` (83 / 83 unit & integration tests passing)  

---

## 1. Executive Summary & Launch Recommendation

Following the Production Readiness Audit, six critical security findings were remediated and verified under strict test isolation. All application-level vulnerabilities involving **public patient information disclosure (SEC-01)**, **unauthenticated clinical chart modification (SEC-02)**, **cross-tenant existence leakage (SEC-03)**, **password-reset token exposure (SEC-04)**, **hardcoded JWT fallback secrets (SEC-05)**, and **deactivated staff access retention (SEC-07)** have been remediated with fail-closed security controls.

### Launch Status
> [!CAUTION]
> **Production Launch Recommendation: HOLD DEPLOYMENT**  
> While all application-level P0/P1 security vulnerabilities are **FIXED AND VERIFIED**, production launch remains blocked by infrastructure and operational prerequisites:
> 1. **OPS-01 (Local-Only Backups):** Automated offsite encrypted backups, retention, failure alerts, and verified database restoration have not yet been executed in staging.
> 2. **OPS-02 (Proxy Upload Limit):** Nginx `client_max_body_size` must be aligned with application-level limits (50 MB) for medical attachments.
> 3. **OPS-03 (Distributed Rate Limiting):** A shared Redis store is required before horizontal multi-instance deployment.

---

## 2. Security Remediation Matrix

| Finding ID | Priority | Description | Remediation Action | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | 🔴 P0 | Public Patient Information Disclosure | Removed phone-number lookups; stripped all PII & clinical data; masked phone numbers in tracking; added cache-control headers. | **FIXED AND VERIFIED** |
| **SEC-02** | 🔴 P0 | Unauthenticated Clinical Chart Modification | Required cryptographic single-use signed intake tokens; bound to clinic/patient/appt; enforced atomic consumption & replay protection. | **FIXED AND VERIFIED** |
| **SEC-03** | 🔴 P0 | Cross-Tenant Existence Leakage | Removed multi-clinic scanning loops in `publicLookup`, `publicSelfCheckIn`, `trackByCode`, and `getPublicStatus`; enforced fail-closed clinic resolution. | **FIXED AND VERIFIED** |
| **SEC-04** | 🔴 P0 | Password Reset Token Exposure | Removed stdout token logging; stored SHA-256 hash in DB; returned generic responses; enforced atomic single-use consumption with row lock. | **FIXED AND VERIFIED** |
| **SEC-05** | 🔴 P0 | Hardcoded JWT Fallback Secret | Removed fallback string in `PatientAuthService`; enforced fail-closed startup validation requiring `SESSION_SECRET` length >= 32 chars. | **FIXED AND VERIFIED** |
| **SEC-07** | 🟠 P1 | Deactivated Accounts Retain Access | Integrated `isActive` check into `AuthGuard` with a 30s TTL cache & invalidation mechanism to immediately revoke deactivated staff sessions. | **FIXED AND VERIFIED** |

---

## 3. Deep-Dive Remediation Details

### Finding SEC-01: Public Patient Information Disclosure
* **Root Cause:**
  `GET /api/appointments/public-status/:identifier` accepted 8-15 digit phone numbers and 5-character ID substrings, returning the patient's full name, phone number, UHID, assigned dentist, clinical visit reason, and medical intake completeness status. Furthermore, `trackByCode` returned the patient's raw unmasked phone number.
* **Remediation Implemented:**
  1. `getPublicStatus` strictly rejects phone-number queries with `BadRequestException('Direct mobile-number lookup is prohibited for patient privacy...')`.
  2. `getPublicStatus` requires clinic context or booking reference with clinic code prefix, querying exact appointment/tracking ID under tenant RLS.
  3. All sensitive PII and medical fields were removed from the public response object. The endpoint now returns **only** minimal queue metadata: `reference`, `status`, `tokenNumber`, `currentlyAhead`, `activeChairsServing`, `chairNumber` (if called/in chair), `scheduledStart`, `durationMinutes`, and public clinic contact information. Fields `patientName`, `patientPhone`, `patientUhid`, `dentistName`, `reason`, and `hasIntakeCompleted` are strictly omitted.
  4. `trackByCode` masks patient phone numbers to `+91 ****** XXXX`, never exposing the full number.
  5. Added `@Header('Cache-Control', 'no-store, no-cache, must-revalidate, private')` and `@Header('Pragma', 'no-cache')` to prevent intermediate proxies or browser caches from storing tracking data.
* **Files Modified:**
  - `apps/api/src/appointments/appointments.service.ts`
  - `apps/api/src/appointments/appointments.controller.ts`

---

### Finding SEC-02: Unauthenticated Clinical Chart Modification
* **Root Cause:**
  `POST /api/appointments/public-intake/:reference` allowed anyone with a booking reference or phone number to overwrite a patient's medical conditions, allergies, and clinical notes without authentication, token verification, or replay protection.
* **Remediation Implemented:**
  1. Implemented cryptographic intake tokens (`generateIntakeToken`, `verifyIntakeToken`) using HMAC-SHA256, bound to `patientId`, `clinicId`, `appointmentId`, `action: 'INTAKE_SUBMISSION'`, a 128-bit random nonce, and a 24-hour expiration window.
  2. `submitPublicIntake` requires a valid signed single-use intake token or an authenticated patient session (`role: 'PATIENT'`). Unauthenticated or forged requests are rejected with `UnauthorizedException`.
  3. Patient and clinic IDs are derived strictly from verified cryptographic token claims, completely eliminating parameter tampering vulnerabilities.
  4. Replay and concurrency protection: inside a PostgreSQL tenant transaction, the appointment row is locked (`SELECT id FROM "Appointment" WHERE id = $apptId FOR UPDATE`), and `AuditLog` is inspected for `action: 'INTAKE_TOKEN_CONSUMED'`. Repeated submission attempts fail closed with `ConflictException`.
  5. Updated booking flows (`createPublicRequest`, `publicWalkInCheckIn`, `publicSelfCheckIn`) and the frontend (`PublicBookingView.tsx`) to generate, pass, and consume the signed token seamlessly.
* **Files Modified:**
  - `apps/api/src/appointments/appointments.service.ts`
  - `apps/api/src/appointments/appointments.controller.ts`
  - `apps/web/src/features/public/PublicBookingView.tsx`

---

### Finding SEC-03: Cross-Tenant Existence Leakage
* **Root Cause:**
  `publicLookup`, `publicSelfCheckIn`, `trackByCode`, and `getPublicStatus` contained fallback loops that iterated over all clinics (`prisma.clinic.findMany`) or executed queries without tenant scoping (`prisma.appointment.findFirst`), inferring clinic tenant authorization directly from a patient's phone number or UHID.
* **Remediation Implemented:**
  1. Removed all cross-clinic scanning loops in `publicLookup`, `publicSelfCheckIn`, `trackByCode`, and `getPublicStatus`.
  2. Enforced trusted clinic context resolution from request hostname domain, QR standee code, or explicit clinic reference prefix (e.g. `AKSA-2026-XXXXX`). If clinic context is absent or invalid, requests fail closed immediately.
  3. Removed unscoped `prisma.appointment.findFirst` calls in self check-in; tenant authorization is never inferred from patient phone numbers.
* **Files Modified:**
  - `apps/api/src/appointments/appointments.service.ts`
  - `apps/api/src/appointments/appointments.controller.ts`
  - `apps/api/src/appointments/appointments.service.spec.ts`

---

### Finding SEC-04: Password Reset Token Handling
* **Root Cause:**
  `AuthService.forgotPassword` logged raw reset tokens to stdout via `this.logger.log`, exposed the raw token in development API responses, and stored the raw token in plaintext in `User.resetPasswordToken`. `resetPasswordWithToken` checked the plaintext token without concurrency locks.
* **Remediation Implemented:**
  1. Removed stdout logging of raw reset tokens and reset URLs.
  2. Tokens are generated using `crypto.randomBytes(32).toString('hex')` (256 bits of entropy).
  3. Stored only the SHA-256 cryptographic hash (`crypto.createHash('sha256').update(rawToken).digest('hex')`) in `User.resetPasswordToken`.
  4. Always return a generic response (`'If an active account exists with this email address, password reset instructions have been generated.'`) regardless of email existence to prevent user enumeration.
  5. `resetPasswordWithToken` hashes the submitted token with SHA-256, verifies expiration, acquires a PostgreSQL row lock (`SELECT id FROM "User" WHERE id = $userId FOR UPDATE`), updates the password hash, and atomically sets `resetPasswordToken: null` and `resetPasswordExpiry: null`.
  6. Replay attempts and concurrent requests fail closed with `BadRequestException`.
* **Files Modified:**
  - `apps/api/src/auth/auth.service.ts`

---

### Finding SEC-05: Hardcoded JWT Fallback Secret
* **Root Cause:**
  `PatientAuthService` contained a fallback string (`'aks-elite-jwt-secure-super-key-madurai-2026-production'`) used when `process.env.SESSION_SECRET` was undefined or shorter than 32 characters, permitting session forgery if misconfigured.
* **Remediation Implemented:**
  1. Removed the hardcoded fallback secret.
  2. Implemented fail-closed startup validation matching `AuthService`: if `SESSION_SECRET` is missing or shorter than 32 characters, the application logs an error and throws `FATAL SECURITY CONFIGURATION ERROR`, halting startup immediately.
  3. Verified that tokens signed with the removed fallback key are strictly rejected.
* **Files Modified:**
  - `apps/api/src/patient-auth/patient-auth.service.ts`

---

### Finding SEC-07: Deactivated Accounts Retain Access
* **Root Cause:**
  `AuthGuard` verified only JWT signature and expiration, never validating whether the authenticated staff account was active (`User.isActive`), allowing deactivated staff to continue accessing protected endpoints for up to 8 hours.
* **Remediation Implemented:**
  1. Added `isAccountActive(userId, clinicId)` check to `AuthGuard`.
  2. Implemented an in-memory status cache with a 30-second TTL to avoid database thrashing on high request volumes, accompanied by an explicit cache invalidation method (`AuthService.invalidateUserStatus(userId)`).
  3. If `user.isActive === false` or the user record is deleted, `AuthGuard` throws `UnauthorizedException('Account deactivated or disabled. Session revoked.')`.
* **Files Modified:**
  - `apps/api/src/auth/auth.service.ts`
  - `apps/api/src/auth/guards/auth.guard.ts`

---

## 4. Verification Evidence & Automated Test Results

### Automated API Test Suites Execution
* **Command:** `npm run test:api` (`jest` across workspace `aks-api`)
* **Total Test Suites:** 11 / 11 Passed
* **Total Tests:** 83 / 83 Passed
* **Execution Time:** ~19.2 seconds

```text
PASS src/auth/auth-security-remediation.spec.ts (12.362 s)
  Dentrinqo P0 Security Remediation: Auth & Token Security
    SEC-05: Hardcoded JWT Fallback Secret Remediation
      ✓ PatientAuthService MUST throw fatal configuration error if SESSION_SECRET is missing (12 ms)
      ✓ PatientAuthService MUST throw fatal configuration error if SESSION_SECRET is shorter than 32 chars (1 ms)
      ✓ PatientAuthService instantiates successfully with strong secret >= 32 chars (1 ms)
      ✓ PatientAuthService MUST reject tokens signed with the removed hardcoded fallback key (1 ms)
    SEC-04: Password Reset Token Security & Plaintext Elimination
      ✓ forgotPassword stores ONLY a SHA-256 hash in the database, never the raw token (3 ms)
      ✓ forgotPassword returns a generic response for non-existent emails to prevent enumeration (1 ms)
      ✓ resetPasswordWithToken successfully consumes token when valid (231 ms)
      ✓ resetPasswordWithToken rejects replay / re-use of consumed token (205 ms)
      ✓ resetPasswordWithToken rejects expired reset tokens (4 ms)
      ✓ resetPasswordWithToken rejects invalid or tampered tokens (4 ms)
    SEC-07: Deactivated Accounts Access Revocation
      ✓ AuthGuard permits requests from active staff accounts (2 ms)
      ✓ AuthGuard IMMEDIATELY rejects requests when account has been deactivated (isActive = false) (1 ms)
      ✓ AuthGuard rejects requests when user account record has been deleted (1 ms)

PASS src/appointments/appointments-security.spec.ts (17.482 s)
  Dentrinqo P0 Security Remediation: Appointments, Public Status, Intake & Tenant Isolation
    SEC-01: Public Patient Information Disclosure Remediation
      ✓ getPublicStatus MUST reject direct phone-number queries (12 ms)
      ✓ getPublicStatus returns ONLY minimal queue metrics and STRIPS sensitive patient PII and clinical reasons (3 ms)
      ✓ trackByCode masks patient phone numbers and never exposes full phone to public requests (2 ms)
    SEC-02: Public Clinical Intake Modification & Replay Protection
      ✓ submitPublicIntake MUST REJECT unauthenticated requests lacking an intake token (2 ms)
      ✓ submitPublicIntake MUST REJECT forged or tampered intake tokens (1 ms)
      ✓ submitPublicIntake MUST REJECT expired intake tokens (1 ms)
      ✓ submitPublicIntake accepts valid signed single-use token and updates clinical history safely (2 ms)
      ✓ submitPublicIntake MUST REJECT replay attempts using the same consumed token (3 ms)
    SEC-03: Cross-Tenant Existence Leakage Remediation
      ✓ publicLookup rejects requests without clinic context and NEVER scans other clinics (1 ms)
      ✓ publicSelfCheckIn MUST NOT infer tenant authorization from a patient phone number across clinics (1 ms)
      ✓ trackByCode MUST REJECT requests when clinic context is absent instead of scanning all clinics (1 ms)
      ✓ Cross-clinic discovery prevention: Clinic B context cannot find Clinic A appointments (1 ms)

PASS src/common/cors.spec.ts (14.324 s)
PASS src/billing/billing-void-workflow.spec.ts (14.506 s)
PASS src/consultations/consultations-isolation.spec.ts (14.575 s)
PASS src/prescriptions/prescriptions-isolation.spec.ts (14.484 s)
PASS src/appointments/qr-checkin-workflow.spec.ts (15.061 s)
PASS src/billing/billing-unbilled-queue.spec.ts (14.889 s)
PASS src/auth/auth.service.spec.ts (15.144 s)
PASS src/patients/patients.service.spec.ts (15.83 s)
PASS src/appointments/appointments.service.spec.ts (17.816 s)

Test Suites: 11 passed, 11 total
Tests:       83 passed, 83 total
Snapshots:   0 total
Time:        19.228 s
Ran all test suites.
```

---

### Monorepo Full Build Verification
* **Command:** `npm run build`
* **Result:** Successful production build across all workspaces:
  - `@aks/shared-types`: `tsc` compiled cleanly.
  - `aks-api`: `nest build` completed with 0 errors.
  - `aks-web`: `tsc -b && vite build` built in 5.19s with 0 errors.

---

### Database Migration Status
* **Database Target:** Isolated PostgreSQL database `aks_dental_test` on `ubuntu@137.23.45.243`.
* **Schema Verification:**
  - `User.resetPasswordToken` column is PostgreSQL type `text`. The 64-character hex SHA-256 digest fits natively.
  - `User.isActive` column is PostgreSQL type `boolean`.
  - `AuditLog` table with `clinicId`, `action`, `entityType`, `entityId`, `details`, and `createdAt` is already present.
* **Migration Required:** **NONE.** No destructive DDL or schema migrations were required. Production database `aks_dental` was completely untouched.

---

## 5. Modified Files Summary

```text
apps/api/src/appointments/appointments.controller.ts    (SEC-01 cache headers, SEC-02 intake token support)
apps/api/src/appointments/appointments.service.ts       (SEC-01 PII removal, SEC-02 intake tokens, SEC-03 loop removal)
apps/api/src/appointments/appointments.service.spec.ts  (SEC-03 clinic context check-in test)
apps/api/src/appointments/appointments-security.spec.ts  (NEW: SEC-01, SEC-02, SEC-03 regression suite)
apps/api/src/auth/auth.service.ts                       (SEC-04 token hashing & row locking, SEC-07 isAccountActive)
apps/api/src/auth/guards/auth.guard.ts                  (SEC-07 active account verification)
apps/api/src/auth/auth-security-remediation.spec.ts     (NEW: SEC-04, SEC-05, SEC-07 regression suite)
apps/api/src/patient-auth/patient-auth.service.ts       (SEC-05 removal of fallback key, fail-closed startup)
apps/web/src/features/public/PublicBookingView.tsx      (SEC-02 frontend intake token integration)
```

---

## 6. Remaining Production Launch Blockers (Infrastructure & Operations)

Although all application-security findings (SEC-01 through SEC-05, and SEC-07) are completely remediated and verified, the following operational and infrastructure findings must be completed before any production release:

1. **OPS-01: Encrypted Offsite Backups & Tested Restoration**
   - Configure cron-driven encrypted database and attachment backups to a separate failure domain (AWS S3 or Google Cloud Storage).
   - Enforce lifecycle retention policy (e.g. 30-day daily, 12-month monthly).
   - Configure failure alerting (Slack / PagerDuty / Email).
   - Perform a mock disaster-recovery restoration in an isolated staging environment and verify record and attachment integrity.
2. **OPS-02: Nginx Request Body Size Configuration**
   - Increase Nginx `client_max_body_size` from 1 MB to 50 MB on the API reverse proxy.
   - Verify that application-level file size and MIME-type validation safely process legitimate OPG dental X-rays and CBCT scans.
3. **OPS-03: Shared Rate Limiting for Multi-Instance Deployments**
   - Replace or back the in-memory `@nestjs/throttler` and in-memory rate-limit Maps with Redis before running more than one API instance behind a load balancer.

---

**Report Certification:**  
All application-level security findings have been resolved in strict accordance with the prioritized remediation plan. Unrelated changes, billing fixes, and concurrency advisory locks have been preserved. No production data or live infrastructure was altered.
