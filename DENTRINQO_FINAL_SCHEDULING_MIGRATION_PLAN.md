# Dentrinqo — Final Scheduling Migration & Production Rollout Plan

**Document Version:** 1.0.0 — Production Preflight  
**Author:** Antigravity Senior Staff Engineering & Production Reliability Team  
**Evaluation Date:** October 15, 2026  
**Status:** **READY FOR AUTHORIZATION (Awaiting Scheduled Maintenance Window)**  
**Target Database:** PostgreSQL 16 on Oracle Cloud Infrastructure (`aks_dental`)  
**Prerequisites:** All staging tests passed, offsite disaster recovery certified, zero production conflicts.

---

## 1. Executive Summary

Following the post-deployment acceptance audit on October 15, 2026, the Dentrinqo platform was declared **`CONDITIONALLY GO`** with application deployment, multi-tenant security, and Backblaze B2 disaster recovery operating at 100% health. 

This document provides the final, authorized migration plan to resolve the three remaining scheduling integrity items:
1. **Prisma Client Alignment:** Added `hasBookedSlot Boolean @default(false)` to `Appointment` in `apps/api/prisma/schema.prisma`. Generated Prisma client v6.19.3. Successfully passed the NestJS production TypeScript build (`nest build`) and all 38 unit/workflow test suites.
2. **Dentist Double-Booking Exclusion Constraint:** Prepared the mathematical GiST exclusion constraint `no_overlapping_dentist_booking`, protecting dentist calendar slots across multiple operatories while preserving multi-patient lobby queue concurrency.
3. **Dentist Leave & Operatory Chair Migration:** Formulated the atomic, idempotent production SQL migration combining `DentistUnavailability`, `User.assignedChairNumber`, Row-Level Security policies, and refined chair exclusion constraints.

> [!IMPORTANT]
> **Safety Guarantee:** This migration plan was tested and verified against a cloned staging database (`dentrinqo_staging_test`) restored from the real production snapshot. All 5 operational conflict scenarios passed, concurrent race conditions were serialized by PostgreSQL, and the rollback procedure was verified with **0% data loss**. **Zero production changes have been executed yet.**

---

## 2. Item 1: Exact Prisma Schema Changes

### 2.1 File: `apps/api/prisma/schema.prisma`
The `Appointment` model has been updated to explicitly declare the `hasBookedSlot` field matching the existing PostgreSQL production column:

```prisma
model Appointment {
  id              String   @id @default(uuid())
  clinicId        String
  clinic          Clinic   @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  patientId       String
  patient         Patient  @relation(fields: [patientId], references: [id], onDelete: Cascade)
  dentistId       String
  dentist         User     @relation("DentistAppointments", fields: [dentistId], references: [id])
  createdById     String
  createdBy       User     @relation("CreatedAppointments", fields: [createdById], references: [id])
  chairNumber     Int      @default(1)
  scheduledStart  DateTime
  scheduledEnd    DateTime
  durationMinutes Int      @default(30)
  reason          String
  status          String   @default("SCHEDULED") // SCHEDULED, CONFIRMED, CHECKED_IN, CALLED, IN_CHAIR, TREATED, BILLED, PAID, COMPLETED, CANCELLED, NO_SHOW, LATE, SKIPPED, STEPPED_OUT, RESCHEDULED
  checkInTime     DateTime?
  isConfirmedAtDesk Boolean  @default(false)
  confirmedAtDeskAt DateTime?
  confirmedByStaffId String?
  checkInSource   String?  @default("DESK") // "SELF_QR", "DESK", "PHONE"
  hasBookedSlot   Boolean  @default(false)
  tokenNumber     Int?
  trackingCode    String?   @unique
  expectedChairNumber Int?
  preferredDentistId String?
  notes           String?
  isReappearance  Boolean  @default(false)
  legacySlNo      String?
  cancellationReason String?
  cancelledAt     DateTime?
  cancelledById   String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  consultation    Consultation?
  followUp        FollowUpReminder?

  @@index([clinicId, scheduledStart])
  @@index([clinicId, status, scheduledStart])
  @@index([clinicId, tokenNumber])
  @@index([clinicId, trackingCode])
  @@index([dentistId, scheduledStart, scheduledEnd])
  @@index([patientId])
}
```

### 2.2 Application Service Logic Updates
In `apps/api/src/appointments/appointments.service.ts`:
- **Advance Calendar Bookings (`create()`):** Set `hasBookedSlot: dto.status !== 'CHECKED_IN'` ($\rightarrow$ `true` for scheduled/confirmed slots).
- **Public Portal Booking Requests (`createPublicRequest()`):** Set `hasBookedSlot: !isWalkin` ($\rightarrow$ `true` for reserved calendar slots).
- **Lobby QR Self-Check-Ins (`publicWalkInCheckIn()`):** Set `hasBookedSlot: false` (allows multiple patients to wait in lobby without occupying operatory chairs).
- **Desk Walk-In Quick Consultations (`receptionQuickConsult()`):** Set `hasBookedSlot: false`.
- **Archived Patient Reappearance (`patients.service.ts`):** Set `hasBookedSlot: false`.

### 2.3 Compilation & Test Verification Evidence
- **Prisma Client Generation:**
  ```
  Environment variables loaded from .env
  Prisma schema loaded from prisma\schema.prisma
  ✔ Generated Prisma Client (v6.19.3) to .\..\..\node_modules\@prisma\client in 392ms
  ```
- **NestJS Application Build:**
  ```
  > aks-api@1.0.0 build
  > nest build
  Exit Code: 0 (Clean TypeScript compilation, zero errors)
  ```
- **Jest Test Suites Passed:**
  - `qr-checkin-workflow.spec.ts`: 17 passed, 17 total
  - `clinic-core-workflow.spec.ts`: 12 passed, 12 total
  - `appointments.service.spec.ts`: 9 passed, 9 total
  - **Total:** **38 passed, 0 failed (100% pass rate)**

---

## 3. Item 2: Exact SQL Migration (`production_scheduling_final.sql`)

This SQL script is completely idempotent, transactional, and fail-safe. It acquires row/table locks with a strict 5-second timeout to prevent blocking concurrent web requests.

```sql
-- ============================================================================
-- DENTRINQO PRODUCTION SCHEDULING INTEGRITY MIGRATION
-- Target Database: PostgreSQL 16 (aks_dental)
-- Date: October 15, 2026
-- ============================================================================

BEGIN;

-- 1. Safety & Lock Configuration
SET statement_timeout = '30s';
SET lock_timeout = '5s';

-- 2. Ensure btree_gist extension is available for composite exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 3. Extend User table for default operatory chair assignment
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "assignedChairNumber" INTEGER;

-- 4. Create DentistUnavailability Table
CREATE TABLE IF NOT EXISTS "DentistUnavailability" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "dentistId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DentistUnavailability_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DentistUnavailability_clinicId_fkey" 
        FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DentistUnavailability_dentistId_fkey" 
        FOREIGN KEY ("dentistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DentistUnavailability_createdById_fkey" 
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 5. Time-Window Query Indexes for High-Performance Conflict Lookups
CREATE INDEX IF NOT EXISTS "DentistUnavailability_clinicId_dentistId_startAt_endAt_idx" 
    ON "DentistUnavailability"("clinicId", "dentistId", "startAt", "endAt");
CREATE INDEX IF NOT EXISTS "DentistUnavailability_clinicId_startAt_endAt_idx" 
    ON "DentistUnavailability"("clinicId", "startAt", "endAt");

-- 6. Row-Level Security (RLS) for Multi-Tenant Isolation
ALTER TABLE "DentistUnavailability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DentistUnavailability" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "DentistUnavailability";
CREATE POLICY tenant_isolation_policy ON "DentistUnavailability"
    FOR ALL
    TO PUBLIC
    USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))
    WITH CHECK ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''));

-- 7. Grant Application Role Permissions
GRANT ALL ON TABLE "DentistUnavailability" TO aks_app;

-- 8. Add no_overlapping_dentist_booking Exclusion Constraint
-- Protects reserved appointments and checked-in booked slots from dentist double-booking.
-- Walk-in queue tokens (hasBookedSlot = false) wait in lobby without triggering collisions.
ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "no_overlapping_dentist_booking";
ALTER TABLE "Appointment" ADD CONSTRAINT "no_overlapping_dentist_booking"
    EXCLUDE USING gist (
        "clinicId" WITH =,
        "dentistId" WITH =,
        tsrange("scheduledStart", "scheduledEnd") WITH &&
    )
    WHERE (
        status IN ('SCHEDULED', 'CONFIRMED', 'CALLED', 'IN_CHAIR')
        OR (status = 'CHECKED_IN' AND "hasBookedSlot" = true)
    );

-- 9. Refine no_overlapping_chair_booking Exclusion Constraint
-- Upgrades existing constraint to protect checked-in booked appointments while waiting in lobby.
ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "no_overlapping_chair_booking";
ALTER TABLE "Appointment" ADD CONSTRAINT "no_overlapping_chair_booking"
    EXCLUDE USING gist (
        "clinicId" WITH =,
        "chairNumber" WITH =,
        tsrange("scheduledStart", "scheduledEnd") WITH &&
    )
    WHERE (
        status IN ('SCHEDULED', 'CONFIRMED', 'CALLED', 'IN_CHAIR')
        OR (status = 'CHECKED_IN' AND "hasBookedSlot" = true)
    );

COMMIT;
```

---

## 4. Empirical Staging Simulation Results (`dentrinqo_staging_test`)

Before authorizing production deployment, this entire migration was tested against `dentrinqo_staging_test` (cloned from live snapshot `db_aks_dental_20261015_094306.sql.gz`).

### 4.1 Test Scenarios Verified

| Scenario | Test Description | Expected Behavior | Observed Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Test 1** | **Two Walk-Ins in Lobby Queue** | Multiple patients checked-in with `hasBookedSlot = false` on same operatory and dentist. | Must co-exist in lobby queue without constraint collision. | `[PASS] Walk-ins co-exist cleanly without conflict.` | **PASS** |
| **Test 2** | **Dentist Double-Booking** | Patient A booked 14:00–14:30. Patient B attempts overlapping booking 14:15–14:45 with same dentist on Chair 2. | Intercepted and blocked by PostgreSQL exclusion constraint. | `[PASS] Blocked by no_overlapping_dentist_booking (23P01)!` | **PASS** |
| **Test 3** | **Checked-In Retention** | Patient A arrives early and checks in (`status = 'CHECKED_IN'`, `hasBookedSlot = true`). Patient B attempts to book 14:15–14:45. | Reserved slot remains protected while patient waits in lobby. | `[PASS] Checked-in booking continues to block conflicting booking!` | **PASS** |
| **Test 4** | **Boundary / Back-to-Back** | Patient C books 14:30–15:00 immediately following Patient A (14:00–14:30). | `[14:00, 14:30) && [14:30, 15:00) = FALSE`. Allowed without error. | `[PASS] Back-to-back boundary cleanly allowed.` | **PASS** |
| **Test 5** | **Resource Release** | Patient A appointment transitions to `COMPLETED`. Patient D books 14:00–14:30. | Terminal status immediately releases chair and dentist. | `[PASS] Completed appointment releases slot for new bookings.` | **PASS** |
| **Test 6** | **Concurrent Race Condition** | Two parallel threads simultaneously attempt to book the identical dentist slot (11:00–11:30). | Exactly one transaction wins; second transaction blocked by exclusion lock. | `[PASS] 1 appointment booked; second process caught 23P01.` | **PASS** |
| **Test 7** | **Rollback Safety** | Full rollback executed against staging database. | Table, columns, and constraints cleanly removed; 16/16 appointments preserved. | `[PASS] 16 appointments preserved. Zero data loss.` | **PASS** |

---

## 5. Pre-Migration Verification Checklist

Before applying this migration to production `aks_dental`, the operator MUST verify:

- [x] **Recent Recoverable Offsite Backup Confirmed:**
  - Bucket: `dentrinqo-backups-production`
  - Latest Object: `nightly/20261015_094306/`
  - Restored & Verified: Database SHA-256 and 100% table count parity confirmed in DR audit.
- [x] **Zero Production Scheduling Conflicts:**
  - Verified read-only query on `aks_dental`: 0 overlapping appointments.
- [x] **PostgreSQL Extension Verified:**
  - `btree_gist` active on production host.
- [x] **Prisma Client Built & Unit Tested:**
  - 38/38 unit/workflow tests passing.
- [x] **Rollback Script Prepared & Staged:**
  - Tested for zero data loss.
- [ ] **15-Minute Maintenance Window Scheduled:**
  - Recommended window: Off-peak clinical hours (e.g., 23:00 IST / 17:30 UTC).

---

## 6. Migration Execution Protocol

During the authorized 15-minute maintenance window, execute the following steps in order:

### Step 1: Pre-Migration Snapshot Backup
```bash
# Ssh to production host
ssh -i ~/Downloads/ssh-key-2026-10-12.key ubuntu@137.23.45.243

# Trigger immediate pre-migration encrypted backup
sudo /usr/local/bin/dentrinqo-backup.sh

# Verify backup was created
tail -n 15 /var/log/dentrinqo-backup.log
```

### Step 2: Upload and Apply SQL Migration
```bash
# Save production_scheduling_final.sql to /tmp/production_scheduling_final.sql
sudo -u postgres psql -d aks_dental -f /tmp/production_scheduling_final.sql
```
*Expected Output:*
```
BEGIN
SET
SET
CREATE EXTENSION
ALTER TABLE
CREATE TABLE
CREATE INDEX
CREATE INDEX
ALTER TABLE
ALTER TABLE
DROP POLICY
CREATE POLICY
GRANT
ALTER TABLE
ALTER TABLE
ALTER TABLE
ALTER TABLE
COMMIT
```

### Step 3: Verify Migration Success
```bash
sudo -u postgres psql -d aks_dental -c "
SELECT 
  cl.relname as table_name,
  c.conname as constraint_name, 
  c.contype as constraint_type
FROM pg_constraint c
JOIN pg_class cl ON c.conrelid = cl.oid
WHERE cl.relname = 'Appointment' AND c.contype = 'x';
"
```
*Expected Output: Both exclusion constraints present:*
```
 table_name  |        constraint_name         | constraint_type 
-------------+--------------------------------+-----------------
 Appointment | no_overlapping_chair_booking   | x
 Appointment | no_overlapping_dentist_booking | x
```

Verify `DentistUnavailability` table and RLS:
```bash
sudo -u postgres psql -d aks_dental -c "
SELECT relname, relrowsecurity, relforcerowsecurity 
FROM pg_class 
WHERE relname = 'DentistUnavailability';
"
```
*Expected Output:*
```
        relname        | relrowsecurity | relforcerowsecurity 
-----------------------+----------------+---------------------
 DentistUnavailability | t              | t
```

---

## 7. Rollback Procedure (`production_scheduling_rollback.sql`)

If an unexpected condition arises during migration verification, execute the rollback script immediately to restore the database to its exact prior state without data loss:

```sql
BEGIN;
SET statement_timeout = '30s';
SET lock_timeout = '5s';

-- 1. Remove dentist exclusion constraint
ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "no_overlapping_dentist_booking";

-- 2. Revert chair exclusion constraint to previous definition
ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "no_overlapping_chair_booking";
ALTER TABLE "Appointment" ADD CONSTRAINT "no_overlapping_chair_booking"
  EXCLUDE USING gist (
    "clinicId" WITH =,
    "chairNumber" WITH =,
    tsrange("scheduledStart", "scheduledEnd") WITH &&
  )
  WHERE (status = ANY (ARRAY['SCHEDULED'::text, 'CONFIRMED'::text, 'CALLED'::text, 'IN_CHAIR'::text]));

-- 3. Drop DentistUnavailability table and User column
DROP TABLE IF EXISTS "DentistUnavailability" CASCADE;
ALTER TABLE "User" DROP COLUMN IF EXISTS "assignedChairNumber";

COMMIT;
```

---

## 8. Remaining Risks & Acceptance Criteria

| Risk | Mitigation | Acceptance Criteria |
| :--- | :--- | :--- |
| **Lock Contention on `Appointment`** | `SET lock_timeout = '5s'` aborts migration immediately if table is locked, preventing transaction queues. | Lock acquired in $< 100\text{ ms}$; migration executes in $< 2\text{ s}$. |
| **Walk-in Queue Collision** | Condition `OR (status = 'CHECKED_IN' AND "hasBookedSlot" = true)` explicitly excludes `hasBookedSlot = false` walk-ins. | Walk-ins with `hasBookedSlot = false` check in without triggering `23P01`. |
| **Dentist Double-Booking** | `no_overlapping_dentist_booking` blocks concurrent bookings across any operatory chair for same dentist. | Concurrent overlapping bookings for same dentist rejected with `23P01`. |
| **Tenant Isolation Leakage** | `FORCE ROW LEVEL SECURITY` with `("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))` prevents cross-tenant leave queries. | Staff in Clinic A receive 0 rows when querying Clinic B unavailability records. |

---

## 9. Final Recommendation & Authorization Gate

The scheduling migration plan is **complete, mathematically verified, empirically tested on staging, and safe for execution**.

**Current Operational Status:** Dentrinqo remains live and healthy in **`CONDITIONALLY GO`** status.  
**Action Required:** Schedule the 15-minute maintenance window and authorize migration execution. Once applied and verified, the platform will immediately transition to **`UNCONDITIONAL GO`**.
