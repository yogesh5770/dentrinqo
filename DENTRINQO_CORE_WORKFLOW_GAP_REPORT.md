# Dentrinqo Core Clinic Workflows: Audit & Gap Analysis Report

**Document ID:** `DENTRINQO-CORE-WORKFLOW-GAP-REPORT`  
**Date:** October 15, 2026  
**Engineering Lead:** Antigravity AI Engineering  
**Repository:** `apps/api` and `apps/web` (`dentrinqo`)  
**Scope:** Phase 1 Product Workflow Audit (Dentist & Chair Management, Leave, Appointments, QR Check-in, Queue)  

---

## 1. Executive Summary

As instructed, advanced offsite backup replication is **DEFERRED**. The immediate engineering priority is completing and hardening Dentrinqo's core clinic workflows:
1. Dentist staff accounts and chair assignments.
2. Receptionist-managed dentist holidays, leave, and temporary unavailability.
3. Online and reception appointment booking with capacity enforcement.
4. Fixed clinic QR check-in and walk-in registration with token generation.
5. Queue lifecycle states (`CHECKED_IN` -> `CALLED` -> `IN_CHAIR` -> `TREATED` / `COMPLETED`).
6. Conflict-free automatic dentist and chair assignment.

### Current Baseline Status
- **Automated Unit & Workflow Test Suites:** 11 passed, 11 total (85 tests passing).
- **Core Architecture:** NestJS API with Prisma ORM, PostgreSQL RLS, and React SPA frontend.
- **Production Safety:** All local testing operates on development database instances or mocked Prisma unit suites; no production data or services are modified.

---

## 2. Feature-by-Feature Gap Analysis

### 2.1 Dentist Staff Accounts and Chair Assignments (P0)
- **What Already Exists:**
  - `User` model (`role: 'DENTIST'`) with fields for `fullName`, `specialization`, `licenseNumber`, `department`.
  - `Clinic.chairCount` (integer, default 3).
  - `Appointment.chairNumber` (integer, 1..10).
- **What Works According to Tests:**
  - Internal scheduling conflict detection (`checkConflict`) prevents double-booking a chair or a dentist for overlapping time windows.
- **What Was Missing / Incomplete:**
  - `User` lacked an explicit `assignedChairNumber` column. Dentists were mapped to chairs implicitly by creation order (`dIndex + 1`), which broke when dentists had specific operatory assignments.
  - No dedicated API endpoint for a receptionist or clinic admin to assign a chair to a dentist or view dentist chair mappings.
- **Data Integrity & Concurrency Risks:**
  - If two dentists are assigned the same chair simultaneously, chair collision can occur unless strict mutual exclusion is enforced during assignment.
- **Minimum Required Changes:**
  - Added `assignedChairNumber Int?` to `User` in `schema.prisma`.
  - Add API endpoint `PATCH /api/users/:id/chair` (or inside user update) restricted to `CLINIC_ADMIN` and `RECEPTIONIST`.
  - Update `getCandidateChairsForSlot` to prioritize the dentist's `assignedChairNumber`.

---

### 2.2 Receptionist-Managed Dentist Availability, Leave, and Holidays (P0)
- **What Already Exists:**
  - `Clinic.isOnLeave` and `Clinic.leaveReason` (which was clinic-wide, incorrectly halting check-ins for the entire clinic).
  - `ClinicClosure` model (for full clinic holidays/closures like Diwali, Sundays, maintenance).
- **What Works According to Tests:**
  - `ClinicHoursService.assertOpen` checks clinic working hours and full clinic closures.
- **What Was Missing / Incomplete:**
  - **Critical Architectural Flaw:** Dentist availability was conflated with clinic availability. If Dr. Arun was on leave tomorrow, the clinic had to either toggle `Clinic.isOnLeave` (halting all operations) or create a clinic-wide closure.
  - Missing per-dentist unavailability model (`DentistUnavailability`) with start/end timestamps, reason, and notes.
  - When a receptionist marks Dr. Arun on leave:
    - New bookings for Dr. Arun must be blocked.
    - Existing appointments scheduled with Dr. Arun during his leave must be flagged for receptionist review.
    - His assigned chair must NOT automatically transfer to another dentist unless explicitly configured.
    - Other active dentists in the clinic must continue operating normally.
- **Data Integrity & Concurrency Risks:**
  - Race condition between a patient booking Dr. Arun online and the receptionist marking Dr. Arun on leave simultaneously.
- **Minimum Required Changes:**
  - Added `DentistUnavailability` model to `schema.prisma`.
  - Add API endpoints:
    - `POST /api/dentist-unavailability` (Create leave: holiday, sick leave, emergency).
    - `GET /api/dentist-unavailability` (List upcoming leaves for clinic).
    - `DELETE /api/dentist-unavailability/:id` (Cancel leave).
  - Check `DentistUnavailability` inside `checkConflict()` and `getCandidateChairsForSlot()`.
  - Query existing overlapping appointments upon leave creation and append `[DENTIST ON LEAVE: Action Required]` to notes or status.

---

### 2.3 Appointment Booking and Capacity Enforcement (P0)
- **What Already Exists:**
  - `POST /api/appointments` (Receptionist booking).
  - `POST /api/appointments/public-book` and `POST /api/appointments/public-request` (Online patient booking).
  - `checkConflict()` validating dentist and chair overlap.
  - PostgreSQL GiST exclusion constraint `no_overlapping_chair_booking` on `(clinicId, chairNumber, tsrange(scheduledStart, scheduledEnd))` for active statuses (`SCHEDULED`, `CONFIRMED`, `CALLED`, `IN_CHAIR`).
- **What Works According to Tests:**
  - Rejects overlapping bookings for the same dentist.
  - Rejects overlapping bookings for the same operatory chair.
  - Duplicate-submission protection (15-minute phone throttle).
- **What Was Missing / Incomplete:**
  - `public-book` did not filter out dentists on leave.
  - Two simultaneous requests for the final available chair slot relied solely on GiST exclusion error handling without explicit serializable reservation in some paths.
- **Minimum Required Changes:**
  - Integrate `DentistUnavailability` into slot calculation and conflict checks.
  - Ensure transaction retry loop cleanly handles GiST exclusion code `23P01`.

---

### 2.4 QR Check-In & Walk-In Registration (P0)
- **What Already Exists:**
  - `POST /api/appointments/public-checkin`:
    - Identifier resolution: Booking reference (`AKS-2026-XXXX`), 10-digit mobile number, or UHID.
    - Early arrival rule: Rejects check-in > 2 hours early.
    - Late arrival rule: Rejects check-in past `clinic.maxLateMinutes` (default 45 mins) and directs to reception.
    - Slightly late arrival: Appends `[LATE ARRIVAL: X mins past start]`.
    - Idempotency: Repeated scans return existing token without re-incrementing sequence.
    - Concurrency lock: Row lock `SELECT id FROM "Appointment" WHERE id = $id FOR UPDATE`.
  - Walk-In Registration:
    - Transaction-level advisory lock: `SELECT pg_advisory_xact_lock(hashtext(clinicId), hashtext(normalizedPhone))`.
    - Auto UHID sequence allocation.
    - Double-click protection: If patient already has an active checked-in appointment today, returns existing token.
- **What Works According to Tests:**
  - All 12 scenarios in `qr-checkin-workflow.spec.ts` passing.
- **What Was Missing / Incomplete:**
  - Walk-in dentist resolution was picking the first dentist by creation date without checking if that dentist was on leave today.
- **Minimum Required Changes:**
  - Filter out dentists with active `DentistUnavailability` during walk-in doctor allocation.

---

### 2.5 Queue Tokens and State Transitions (P0)
- **What Already Exists:**
  - `DailyQueueSequence` generating atomic sequential tokens per clinic per day in `Asia/Kolkata` timezone.
  - Status transitions: `SCHEDULED` -> `CHECKED_IN` -> `CALLED` -> `IN_CHAIR` -> `TREATED` / `COMPLETED`.
  - Guarding against calling two patients to the same chair simultaneously in `updateStatus`:
    - Checks `status in ['CALLED', 'IN_CHAIR']` on target chair.
    - If occupied, throws `ConflictException: Chair #X already has another patient called or seated`.
- **What Works According to Tests:**
  - Status updates and desk confirmation verified in unit tests.
- **What Was Missing / Incomplete:**
  - Explicit state-machine validation: Preventing illegal skips (e.g., cannot transition directly from `CANCELLED` to `IN_CHAIR` or from `SCHEDULED` directly to `COMPLETED` without check-in).
  - Explicit support for `SKIPPED`, `STEPPED_OUT`, and `NO_SHOW` re-queuing.
- **Minimum Required Changes:**
  - Add state transition validation table to `AppointmentsService.updateStatus`.

---

### 2.6 Automatic Dentist and Chair Assignment (P0)
- **What Already Exists:**
  - `getCandidateChairsForSlot`:
    - Finds on-duty chairs (excluding chairs toggled off in `chairStatus`).
    - Excludes chairs with conflicting bookings.
    - Prioritizes preferred doctor's chair.
    - Balances load by fewest bookings on that date.
- **What Works According to Tests:**
  - Free chair selection and conflict avoidance.
- **What Was Missing / Incomplete:**
  - When a preferred dentist is selected, their default `assignedChairNumber` was not explicitly queried.
  - When a dentist is marked on leave, their assigned chair should remain reserved or released based on clinic configuration.
- **Minimum Required Changes:**
  - Use `dentist.assignedChairNumber` in `getCandidateChairsForSlot`.
  - Ensure unassigned walk-ins pick from available active dentists who are on duty.

---

## 3. Data Integrity & Concurrency Risk Matrix

| Risk Scenario | Current Mitigation | Hardened Target Behavior |
| :--- | :--- | :--- |
| **Two simultaneous bookings for the final chair slot** | PostgreSQL GiST exclusion constraint `no_overlapping_chair_booking` raises `23P01`. | Application catches `23P01`, retries next candidate chair, or returns clean `409 Conflict`. |
| **Duplicate QR scan within 100ms** | Row lock `SELECT ... FOR UPDATE` serializes requests. Second request reads updated status. | Verified in `qr-checkin-workflow.spec.ts` (Scenario 7). |
| **Concurrent walk-in registration with same phone** | Advisory lock `pg_advisory_xact_lock(hashtext(clinicId), hashtext(phone))`. | Verified in `qr-checkin-workflow.spec.ts` (Scenario 11). |
| **Dentist marked on leave while appointments exist** | None (Previously lacked model). | Query overlapping appointments; flag with `[ACTION REQUIRED: Dentist on Leave]`; notify receptionist in queue UI. |
| **Attempting to seat patient in occupied chair** | `updateStatus` queries for existing occupant in `CALLED` or `IN_CHAIR`. | Throws `409 Conflict` with patient name and overrun warning. |
| **Cross-clinic data leakage via tracking code or QR** | RLS tenant isolation policy + strict `clinicId` filters on all queries. | Verified in `appointments-security.spec.ts`. |

---

## 4. Implementation Plan (Prioritized Order)

### P0.1: Database Schema & Migration
- [x] Add `assignedChairNumber` to `User` in `schema.prisma`.
- [x] Add `DentistUnavailability` model to `schema.prisma`.
- [ ] Create SQL migration with Row Level Security (RLS) enabled on `DentistUnavailability`.
- [ ] Run `npx prisma generate` (Completed).

### P0.2: Dentist Availability & Leave Service
- [ ] Create `DentistUnavailabilityModule`, `Controller`, and `Service` (or integrate into `ClinicModule`).
- [ ] Endpoints:
  - `POST /api/dentists/:id/unavailability`: Create leave window (validates start < end, checks existing appointments).
  - `GET /api/dentists/:id/unavailability`: List leave for a dentist.
  - `GET /api/dentists/unavailability`: List all clinic dentist unavailabilities for date range.
  - `DELETE /api/dentists/unavailability/:id`: Remove leave window.
- [ ] Flag affected appointments: When leave is created, find all overlapping `SCHEDULED` or `CONFIRMED` appointments and append review notice.

### P0.3: Core Booking & Auto-Assignment Hardening
- [ ] Update `checkConflict`: Check `DentistUnavailability` for the requested dentist and slot.
- [ ] Update `getCandidateChairsForSlot`: Respect `assignedChairNumber`.
- [ ] Update `public-book` & `publicWalkInCheckIn`: Exclude unavailable dentists.

### P0.4: Queue State Machine Validation
- [ ] Enforce valid state transitions in `updateStatus`:
  - `SCHEDULED` -> `CONFIRMED`, `CHECKED_IN`, `CANCELLED`, `NO_SHOW`, `RESCHEDULED`
  - `CONFIRMED` -> `CHECKED_IN`, `CANCELLED`, `NO_SHOW`, `RESCHEDULED`
  - `CHECKED_IN` -> `CALLED`, `SKIPPED`, `STEPPED_OUT`, `CANCELLED`
  - `CALLED` -> `IN_CHAIR`, `SKIPPED`, `STEPPED_OUT`, `CHECKED_IN`
  - `IN_CHAIR` -> `TREATED`, `COMPLETED`, `CALLED`
  - `TREATED` -> `BILLED`, `COMPLETED`
  - Terminal states: `COMPLETED`, `CANCELLED`, `NO_SHOW` (cannot transition without explicit reopen).

### P0.5: Comprehensive Workflow Test Suite
- [ ] Write `apps/api/src/appointments/clinic-core-workflow.spec.ts` covering:
  1. Two simultaneous requests for the final available chair slot.
  2. Duplicate and concurrent QR check-in.
  3. Concurrent walk-in registration.
  4. Dentist leave overlapping existing appointments (flags for review).
  5. Booking attempt for a dentist on leave (rejected).
  6. Occupied chair exclusion from assignment.
  7. No suitable chair or dentist available (clean 409).
  8. Concurrent attempts to seat patients in the same chair.
  9. Appointment cancellation and rescheduling with state validation.
  10. Cross-clinic isolation enforcement.

### P1: Usability & Notification Improvements
- [ ] Reception dashboard display of dentist leave badges and affected appointment alerts.
- [ ] Audit log verification for all leave and state change events.

---

## 5. Risk Assessment: Deferring Offsite Backup Replication

> [!WARNING]
> **Production Host Dependency Risk:**
> Because advanced offsite cloud replication has been deferred to prioritize product workflows, all active database and attachment backups reside solely on the local filesystem (`/var/backups/dentrinqo/`) of the Oracle Cloud production VM (`137.23.45.243`).
> 
> If the production VM suffers hardware failure, disk volume corruption, or cloud tenancy termination before offsite replication is completed in Phase 3, **all local backups will be lost with the host**. Basic automated nightly local backups and asymmetric CMS encryption remain active, but true disaster recovery requires the eventual provisioning of remote cloud storage.
