# Dentrinqo Smart Dual-Track Scheduling & Queue Engine — Verification Audit

**Document ID:** `DENTRINQO-SMART-SCHEDULING-VERIFICATION-AUDIT`  
**Date:** October 15, 2026  
**Auditor:** Antigravity AI Engineering (Staff Verification Specialist)  
**Target Repository:** `C:\Users\yoges\.gemini\antigravity-ide\scratch\dentrinqo\`  
**Target Specification:** [`DENTRINQO_SMART_SCHEDULING_AND_QUEUE_ARCHITECTURE.md`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/DENTRINQO_SMART_SCHEDULING_AND_QUEUE_ARCHITECTURE.md)  
**Audit Type:** Read-Only Verification Audit (Zero Code/DB Modifications)  
**Overall Status:** **CONDITIONAL PASS — 3 DEFECTS IDENTIFIED REQUIRING TARGETED FIXES**  

---

## 1. Executive Summary & Requirements Verification Matrix

Every claim made in the implementation report was independently inspected against actual source code, database migration files, controller routes, and test configurations.

| # | Audit Requirement | Status | Key Evidence / Primary Code Reference |
| :--- | :--- | :---: | :--- |
| **1** | **Dentist Overlap Prevention** | 🟡 **PARTIALLY VERIFIED** | Implemented at application level in [`AppointmentsService.checkConflict`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/appointments/appointments.service.ts#L204-L238). Database GiST exclusion script exists in [`dentist_gist_exclusion.sql`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/prisma/migrations/dentist_gist_exclusion.sql), but is **unapplied to the database**. Under concurrent race conditions, DB-level exclusion is not active. |
| **2** | **Chair Overlap Prevention** | 🟢 **PASS** | `checkConflict` checks chair collision independently of dentist (`lines 240-258`). DB exclusion constraint `no_overlapping_chair_booking` exists in [`instant_registration_and_token.sql`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/prisma/migrations/instant_registration_and_token.sql#L40-L47) and catches `23P01`. |
| **3** | **Appointment Availability** | 🔴 **FAIL** | Clinic operating hours and breaks are verified via [`ClinicHoursService.assertOpen`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/clinic/clinic-hours.service.ts#L560-L680). **However, dentist leave (`DentistUnavailability`) is NOT checked** in `create()` or `checkConflict()`. A patient can book an on-leave dentist. No chair turnaround buffer is configured. |
| **4** | **Dynamic Gap Calculation** | 🟡 **PARTIALLY VERIFIED** | Implemented in [`calculateAvailableGaps`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/appointments/appointments.service.ts#L3682-L3837). Correctly computes $\Delta G = T_{\text{next}} - \max(T_{\text{now}}, T_{\text{end}})$. **Flaw:** Query at line 3748 filters `scheduledStart > now`, creating a **grace-period blind spot** (10:00–10:10 AM) where absent patients are ignored and the chair appears prematurely open. |
| **5** | **No-Show Release** | 🔴 **FAIL** | Implemented in [`releaseLateSlot`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/appointments/appointments.service.ts#L3842-L3896). **Defects:** Line 3854 does NOT block releasing `CHECKED_IN` or `CALLED` patients (only checks `COMPLETED, CANCELLED, IN_CHAIR`). Does not enforce that the appointment is actually past the grace period (`now > start + grace`). Missing optimistic lock / `FOR UPDATE`. |
| **6** | **Queue Behavior** | 🟢 **PASS** | Online bookings (`SCHEDULED`) have `tokenNumber: null` and do not appear in the lobby queue. Walk-ins join lobby with token (`CHECKED_IN`) without seizing calendar capacity (excluded from GiST constraint). `updateStatus` blocks walk-ins from stealing upcoming bookings (`lines 830-847`). |
| **7** | **Database & Security** | 🟢 **PASS** | Multi-tenant isolation verified (`clinicId WITH =` in constraints and `prisma.forTenant`). Role-based access control `@Roles('CLINIC_ADMIN', 'RECEPTIONIST', 'DENTIST')` verified on all gap and release endpoints. Rate limiting on public endpoints verified. |
| **8** | **Tests & Concurrency** | 🟡 **PARTIALLY VERIFIED** | 103/103 tests pass across 13 suites. However, **100% of tests run against in-memory Jest mocks** (`mockPrisma`). Zero live PostgreSQL integration tests, zero true concurrency race tests, and zero real GiST exclusion triggers exist in the test suite. |

---

## 2. Detailed Technical Findings by Requirement

### Requirement 1: Dentist Overlap Prevention
- **Application Layer (Verified):**
  [`apps/api/src/appointments/appointments.service.ts`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/appointments/appointments.service.ts#L204-L238):
  ```typescript
  // 1. Dentist conflict check in checkConflict()
  const dentistConflict = await db.appointment.findFirst({
    where: {
      clinicId,
      dentistId,
      id: excludeApptId ? { not: excludeApptId } : undefined,
      status: { in: activeStatuses },
      AND: [
        { scheduledStart: { lt: end } },
        { scheduledEnd: { gt: start } },
      ],
    },
  });
  if (dentistConflict) {
    throw new ConflictException(`Dentist is already booked for patient...`);
  }
  ```
  In sequential execution, `checkConflict()` successfully prevents two appointments from reserving the same dentist for overlapping times.
- **Database Layer (Gap Identified):**
  [`apps/api/prisma/migrations/dentist_gist_exclusion.sql`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/prisma/migrations/dentist_gist_exclusion.sql#L1-L15):
  The SQL migration file defining `no_overlapping_dentist_booking` was created on disk, but has **not yet been applied to the active database**. In a true simultaneous concurrency race (two HTTP requests hitting `AppointmentsService.create()` in the exact same millisecond under `READ COMMITTED` isolation), both transactions can read null from `findFirst` and both commit successfully unless this database constraint is applied.

---

### Requirement 2: Chair Overlap Prevention
- **Independent Chair Check (Verified):**
  [`apps/api/src/appointments/appointments.service.ts:240-258`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/appointments/appointments.service.ts#L240-L258):
  ```typescript
  // 2. Operatory Chair conflict check
  const chairConflict = await db.appointment.findFirst({
    where: {
      clinicId,
      chairNumber,
      id: excludeApptId ? { not: excludeApptId } : undefined,
      status: { in: activeStatuses },
      AND: [
        { scheduledStart: { lt: end } },
        { scheduledEnd: { gt: start } },
      ],
    },
  });
  if (chairConflict) {
    throw new ConflictException(`Dental Operatory Chair #${chairNumber} is already reserved...`);
  }
  ```
  This check operates on `chairNumber` regardless of `dentistId`. If Dr. Priya is scheduled on Chair 1 from 10:00–10:30, and a booking is requested for Dr. Arun on Chair 1 from 10:15–10:45, it is rejected.
- **Database Level Enforcement (Verified):**
  `no_overlapping_chair_booking` exists in [`instant_registration_and_token.sql`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/prisma/migrations/instant_registration_and_token.sql#L41-L47) and `AppointmentsService.create()` catches PostgreSQL error `23P01`:
  ```typescript
  if (err.message?.includes('no_overlapping_chair_booking') || err.code === '23P01') {
    throw new ConflictException(`Dental Operatory Chair ${chair} is already occupied...`);
  }
  ```

---

### Requirement 3: Appointment Availability & The Missing Leave Check
- **Clinic Hours & Closures (Verified):**
  [`apps/api/src/clinic/clinic-hours.service.ts:560-680`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/clinic/clinic-hours.service.ts#L560-L680):
  `assertOpen()` thoroughly checks day-of-week operating hours, lunch/intermission breaks, active clinic-wide closures, and last walk-in cutoff times.
- **CRITICAL GAP: Dentist Unavailability Is Not Checked During Booking:**
  `ClinicHoursService` implements `isDentistUnavailable()` (lines 1221–1241) and `getDentistLeaveForSlot()` (lines 1246–1268). However:
  - In `AppointmentsService.create()` (lines 421–550): It calls `this.clinicHoursService.assertOpen()`, but **never calls `isDentistUnavailable()`**.
  - In `AppointmentsService.checkConflict()` (lines 204–258): It queries `Appointment`, but **never queries `DentistUnavailability`**.
  - **Result:** If Dr. Arun is registered on leave in `DentistUnavailability` from 9:00 AM to 5:00 PM tomorrow, an online patient or receptionist can still book appointments with Dr. Arun tomorrow. The system fails to reject the booking.
- **Chair Turnaround Buffer:**
  Appointments are scheduled flush (e.g. 10:00–10:30, 10:30–11:00). No 5-minute sterilization/turnaround buffer is enforced by code.

---

### Requirement 4: Dynamic Gap Calculation & The Grace-Period Blind Spot
- **Implementation (Verified):**
  [`apps/api/src/appointments/appointments.service.ts:3682-3837`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/appointments/appointments.service.ts#L3682-L3837):
  `calculateAvailableGaps()` accurately retrieves today's appointments in IST (`Asia/Kolkata`), checks `chairStatus` in clinic settings, identifies the current patient in treatment (`IN_CHAIR`, `CALLED`), calculates remaining treatment duration, and determines if $\Delta G \ge 30\text{m}$.
- **Flaw: The Grace-Period Blind Spot:**
  Line 3747–3749:
  ```typescript
  const upcomingOnChair = todayAppts.filter(a =>
    a.chairNumber === c &&
    ['SCHEDULED', 'CONFIRMED'].includes(a.status) &&
    new Date(a.scheduledStart).getTime() > now.getTime()
  );
  ```
  **The Bug Scenario:**
  1. Patient A is booked for 10:00–10:30 AM on Chair 1.
  2. The current time is 10:04 AM. Patient A is running 4 minutes late (well within the 10-minute grace period).
  3. Because `scheduledStart` (10:00 AM) is NOT strictly greater than `now` (10:04 AM), `upcomingOnChair` excludes Patient A!
  4. The next appointment found is Patient B at 10:30 AM.
  5. The engine reports Chair 1 as having an open gap of 26 minutes until 10:30 AM!
  6. A receptionist looking at the gap widget might seat a walk-in at 10:05 AM, right as Patient A walks through the clinic door at 10:06 AM!
  - **Required Fix:** Include appointments where `status IN ['SCHEDULED', 'CONFIRMED']` AND `scheduledEnd > now` (or `scheduledStart + gracePeriod > now`).

---

### Requirement 5: No-Show Release Safety Violations
- **Implementation (Verified):**
  [`apps/api/src/appointments/appointments.service.ts:3842-3896`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/appointments/appointments.service.ts#L3842-L3896):
  `releaseLateSlot()` operates within `prisma.forTenant`, records cancellation reason, appends audit notes, sets `status: 'NO_SHOW'`, and logs `APPOINTMENT_LATE_RELEASED`.
- **Defect 1: Checked-In Patients Can Be Released as No-Shows:**
  Line 3854:
  ```typescript
  if (['COMPLETED', 'CANCELLED', 'IN_CHAIR'].includes(appt.status)) {
    throw new BadRequestException(`Cannot release appointment with status ${appt.status}`);
  }
  ```
  If Patient A arrived at 9:55 AM, scanned the lobby QR code, and has `status: 'CHECKED_IN'` or `'CALLED'`, `releaseLateSlot()` **does not reject the request**! A receptionist could inadvertently mark a patient who is physically sitting in the waiting lobby as a `NO_SHOW`.
- **Defect 2: Elapsed Grace Period Not Enforced:**
  `releaseLateSlot()` does not verify `now.getTime() > new Date(appt.scheduledStart).getTime() + (clinic.maxLateMinutes || 10) * 60000`. Staff could trigger `releaseLateSlot` on an afternoon appointment in the morning.
- **Defect 3: Lack of Concurrency Protection (TOCTOU Race):**
  If a patient submits self-QR check-in at 10:10:00.100, and reception clicks "Release Chair" at 10:10:00.105, `releaseLateSlot()` performs an unversioned update without `SELECT ... FOR UPDATE` or `where: { id, status: 'SCHEDULED' }`. The patient's valid check-in can be overwritten by `NO_SHOW`.

---

### Requirement 6: Queue Behavior & Walk-In Isolation
- **Separation of Calendar vs Queue (Verified):**
  - Online bookings (`SCHEDULED`) are created with `tokenNumber = null`. They are excluded from reception lobby queue queries.
  - Walk-ins are created via `receptionQuickConsult` with `status: 'CHECKED_IN'` and an atomically incremented `tokenNumber`.
  - Because `CHECKED_IN` is deliberately omitted from `no_overlapping_chair_booking` (which only locks `SCHEDULED, CONFIRMED, CALLED, IN_CHAIR`), walk-in patients in the lobby do not create conflicting calendar bookings.
- **Protection Against Displacing Confirmed Bookings (Verified):**
  [`apps/api/src/appointments/appointments.service.ts:830-851`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/api/src/appointments/appointments.service.ts#L830-L851):
  When a receptionist attempts to seat a walk-in (`status -> IN_CHAIR`), `updateStatus()` queries for upcoming bookings on that chair:
  ```typescript
  if (upcomingBooking) {
    if (!dto.overrideConflict) {
      throw new ConflictException(
        `Chair #${targetChair} has an upcoming scheduled booking for "${upcomingBooking.patient?.fullName}" at ${bookingTimeStr}. Please select another chair or confirm override.`
      );
    }
  }
  ```
  A walk-in cannot silently displace an upcoming booked patient.

---

### Requirement 7: Database & Security Architecture
- **Tenant Isolation (Verified):**
  All database operations use `this.prisma.forTenant(clinicId, async (tx) => { ... })` and set PostgreSQL session config `app.clinic_id`.
  Both GiST exclusion constraints enforce `"clinicId" WITH =`.
- **Role Permissions (Verified):**
  - `GET /api/appointments/chair-gaps`: Protected by `@UseGuards(AuthGuard, RolesGuard)` and `@Roles('CLINIC_ADMIN', 'RECEPTIONIST', 'DENTIST')`.
  - `PATCH /api/appointments/:id/release-late-slot`: Protected by `@Roles('CLINIC_ADMIN', 'RECEPTIONIST', 'DENTIST')`.
  - Public routes (`public-checkin`, `public-booked-slots`) enforce rate limits via `@Throttle({ default: { limit: 60, ttl: 60000 } })`.

---

### Requirement 8: Testing Reality vs Test Execution
- **Unit Test Coverage (Verified):**
  - All 13 test suites and 103 tests pass.
  - `smart-scheduling-workflow.spec.ts` executes 6 test cases in 5.9 seconds.
- **The Testing Limitation (Evidence):**
  Inspection of `apps/api/src/appointments/smart-scheduling-workflow.spec.ts` reveals:
  ```typescript
  mockPrisma = {
    appointment: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((fn) => fn(mockPrisma)),
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  ```
  Every single test runs in-memory. **PostgreSQL itself is not running during Jest execution.**
  - The PostgreSQL `btree_gist` extension, `EXCLUDE USING gist` engine, and `23P01` error handlers are **never invoked during the test run**.
  - Concurrency collision tests were asserted by mocking `findFirst` to return an object rather than firing simultaneous asynchronous threads against a real database.

---

## 3. Prioritized Audit Findings

### Critical Priority (Must Fix Before Launch)
1. **CRIT-01: `releaseLateSlot` Can Inadvertently Cancel Already-Arrived Patients**  
   *Location:* `apps/api/src/appointments/appointments.service.ts:3854`  
   *Impact:* If a patient has status `CHECKED_IN` or `CALLED`, `releaseLateSlot` allows marking them `NO_SHOW`.  
   *Fix:* Restrict release strictly to unarrived statuses:  
   `if (appt.status !== 'SCHEDULED' && appt.status !== 'CONFIRMED') throw new BadRequestException(...)`

2. **CRIT-02: `releaseLateSlot` Does Not Verify Elapsed Grace Period**  
   *Location:* `apps/api/src/appointments/appointments.service.ts:3852`  
   *Impact:* An appointment scheduled for hours in the future can be cancelled as a no-show immediately.  
   *Fix:* Verify that `new Date().getTime() >= new Date(appt.scheduledStart).getTime() + (clinic.maxLateMinutes || 10) * 60000`.

### High Priority (Significant Operational Risk)
3. **HIGH-01: Dentist Leave (`DentistUnavailability`) Is Not Checked During Appointment Booking**  
   *Location:* `apps/api/src/appointments/appointments.service.ts:216` & `apps/api/src/appointments/appointments.service.ts:489`  
   *Impact:* Patients can book appointments with dentists who are registered on leave.  
   *Fix:* In `checkConflict()`, add:  
   `const isLeave = await this.clinicHoursService.isDentistUnavailable(clinicId, dentistId, start, end, db);`  
   `if (isLeave) throw new ConflictException('Dentist is on leave during this time slot.');`

4. **HIGH-02: Grace-Period Blind Spot in `calculateAvailableGaps`**  
   *Location:* `apps/api/src/appointments/appointments.service.ts:3748`  
   *Impact:* During the 10 minutes after scheduled start, unarrived booked patients are omitted from the upcoming list, falsely advertising their chair as free to walk-ins.  
   *Fix:* Include appointments where `status IN ['SCHEDULED', 'CONFIRMED']` and `scheduledStart + (clinic.maxLateMinutes || 10) * 60000 > now`.

### Medium Priority (Architecture & Concurrency)
5. **MED-01: `dentist_gist_exclusion.sql` Is Unapplied to Active Database**  
   *Location:* `apps/api/prisma/migrations/dentist_gist_exclusion.sql`  
   *Impact:* True concurrent simultaneous booking of the same dentist can race past application checks.  
   *Fix:* Execute `dentist_gist_exclusion.sql` on the staging/dev database when authorized.

6. **MED-02: Optimistic Concurrency Missing on No-Show Release**  
   *Location:* `apps/api/src/appointments/appointments.service.ts:3861`  
   *Impact:* Race condition between patient self-check-in and receptionist no-show release.  
   *Fix:* In `tx.appointment.update`, use `where: { id: appt.id, status: appt.status }` or acquire `SELECT id FROM "Appointment" WHERE id = $id FOR UPDATE`.

### Low Priority (Operational Polish)
7. **LOW-01: No Chair Turnaround / Sanitization Buffer**  
   *Location:* `apps/api/src/appointments/appointments.service.ts:428`  
   *Impact:* Appointments back-to-back with 0 seconds transition time.

---

## 4. Smallest Safe Fixes Specification (For Subsequent Authorization)

The following minimal diffs demonstrate the precise surgical edits required to resolve the identified defects without refactoring:

### Fix A: Patch `releaseLateSlot` (Resolves CRIT-01, CRIT-02, MED-02)
```typescript
// In apps/api/src/appointments/appointments.service.ts:
async releaseLateSlot(clinicId: string, id: string, reason: string, actor: any) {
  return this.prisma.forTenant(clinicId, async (tx) => {
    const appt = await tx.appointment.findFirst({
      where: { id, clinicId },
      include: {
        patient: { select: { fullName: true, phone: true } },
        dentist: { select: { fullName: true } },
        clinic: { select: { maxLateMinutes: true } },
      },
    });

    if (!appt) throw new NotFoundException('Appointment not found');

    // CRIT-01 Fix: Only allow releasing genuinely unarrived appointments
    if (appt.status !== 'SCHEDULED' && appt.status !== 'CONFIRMED') {
      throw new BadRequestException(
        `Cannot release appointment with status "${appt.status}". Only unarrived scheduled appointments can be released as No-Show.`
      );
    }

    // CRIT-02 Fix: Enforce arrival grace period has actually elapsed
    const now = new Date();
    const graceMinutes = appt.clinic?.maxLateMinutes ?? 10;
    const graceThreshold = new Date(new Date(appt.scheduledStart).getTime() + graceMinutes * 60000);
    if (now < graceThreshold) {
      const waitMins = Math.ceil((graceThreshold.getTime() - now.getTime()) / 60000);
      throw new BadRequestException(
        `Cannot release chair yet. Patient has ${waitMins} minute(s) remaining in the ${graceMinutes}-minute arrival grace period.`
      );
    }

    const releaseNote = `[GRACE PERIOD RELEASED - ${now.toLocaleTimeString()}]: ${reason || 'Patient absent past arrival grace period.'}`;

    // MED-02 Fix: Optimistic lock ensuring status has not changed to CHECKED_IN during request
    const updated = await tx.appointment.update({
      where: { id, status: appt.status },
      data: {
        status: 'NO_SHOW',
        notes: appt.notes ? `${appt.notes}\n${releaseNote}` : releaseNote,
        cancelledAt: now,
        cancelledById: actor?.userId || actor?.id || null,
        cancellationReason: reason || 'Late arrival grace period expired',
      },
      ...
```

### Fix B: Wire Dentist Leave Check into `checkConflict` (Resolves HIGH-01)
```typescript
// In apps/api/src/appointments/appointments.service.ts -> checkConflict():
// 0. Dentist Unavailability Check
const isDentistOnLeave = await this.clinicHoursService.isDentistUnavailable(
  clinicId,
  dentistId,
  start,
  end,
  db,
);
if (isDentistOnLeave) {
  throw new ConflictException(
    `Dentist is registered on leave / unavailable during this requested time slot.`
  );
}
```

### Fix C: Patch Grace-Period Blind Spot in `calculateAvailableGaps` (Resolves HIGH-02)
```typescript
// In apps/api/src/appointments/appointments.service.ts -> calculateAvailableGaps():
// Include upcoming appointments AND scheduled appointments currently in grace period
const upcomingOnChair = todayAppts.filter(a =>
  a.chairNumber === c &&
  ['SCHEDULED', 'CONFIRMED'].includes(a.status) &&
  new Date(a.scheduledStart).getTime() + 10 * 60000 > now.getTime()
);
```
