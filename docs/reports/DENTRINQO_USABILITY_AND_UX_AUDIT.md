# Dentrinqo Usability & UX Architecture Audit

**Document ID:** `DENTRINQO-USABILITY-AND-UX-AUDIT`  
**Date:** October 15, 2026  
**Auditor:** Antigravity AI Engineering  
**Repository:** `apps/web` (`dentrinqo`)  
**Target Audience:** Clinic Owners, Dentists, Receptionists, Dental Assistants, and Patients  
**Status:** **AUDIT COMPLETE — PROPOSALS AWAITING AUTHORIZATION**  

---

## 1. Executive Summary & Core Usability Principle

A dental practice management system should not require technical expertise or extensive staff training. The software must make the **correct clinical and administrative action obvious** to the person using it:

> **The Dentrinqo Usability Rule:**  
> *Make the complicated operations (database transactions, capacity limits, RLS, sequential tokens, concurrency locks) happen automatically behind the scenes, and make the next action immediately clear to the user.*

Receptionists should not navigate through five screens to check in one patient. Dentists should not have to leave their clinical workspace to check procedure billing. Clinic owners should not need to export spreadsheets to see daily revenue.

---

## 2. Task 1: Audit of Current Frontend Implementation

### 2.1 Current Role-Specific Screens & Routing
Code Inspection: [`apps/web/src/App.tsx`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/web/src/App.tsx#L101-L170) & [`apps/web/src/features/dashboard/DashboardRouter.tsx`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/web/src/features/dashboard/DashboardRouter.tsx#L34-L75)

| User Role | Current Entry Screen | Component File | Current Workflow Capabilities |
| :--- | :--- | :--- | :--- |
| **Receptionist** | Reception Dashboard | [`ReceptionDashboard.tsx`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/web/src/features/dashboard/ReceptionDashboard.tsx) | Live queue tabs (`WAITING_LOBBY`, `IN_TREATMENT`, `READY_BILLING`), desk presence confirmation, quick consultation modal, chair toggling, quick checkout. |
| **Dentist** | Dentist Operatory Dashboard | [`DentistDashboard.tsx`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/web/src/features/dashboard/DentistDashboard.tsx) & [`DoctorDesk.tsx`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/web/src/features/consultations/DoctorDesk.tsx) | 4 stat counters, waiting patient cards, "Seat in Chair & Start" action, FDI dental charting, consultation notes, treatment plans, prescriptions. |
| **Clinic Owner / Admin** | Admin Executive Desk | [`AdminDashboard.tsx`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/web/src/features/dashboard/AdminDashboard.tsx) & [`AdminDesk.tsx`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/web/src/features/admin/AdminDesk.tsx) | Operational stats, daily collections summary, staff account list, chair status controls, audit log viewer, clinic configuration. |
| **Patient** | Public Portal | [`PublicBookingView.tsx`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/web/src/features/public/PublicBookingView.tsx) & [`PublicCheckInView.tsx`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/web/src/features/public/PublicCheckInView.tsx) | Self-booking calendar, standee QR check-in, walk-in registration, live turn tracker (`PublicTrackView.tsx`) with audio chime. |

---

## 3. Code-Verified Usability Problems & Friction Points

Through rigorous code inspection of `apps/web`, six high-friction usability issues were identified:

### Friction Point 1: Blocking Browser Dialogs (`window.alert` & `window.confirm`)
- **Code Locations:**
  - `ReceptionDashboard.tsx`: Line 244 (`alert(err.message)`), Line 397 (`alert(err.message)`), Line 404 (`if (!window.confirm(...))`).
  - `DentistDashboard.tsx`: Line 62 (`alert(err.message)`).
  - `DoctorDesk.tsx`: Line 204 (`alert('No patients available to seat.')`), Line 220 (`alert(err.message)`).
- **Usability Impact:** Native browser dialogs completely freeze the browser event loop, cannot be styled, hide behind window layers on tablets, look antiquated, and convey no clinical context.
- **Solution:** Replace all native alerts with an elegant, non-blocking in-app notification system and structured confirmation modals.

### Friction Point 2: Missing Reception UI for Dentist Leave & Doctor Holidays
- **Code Inspection:**
  - The backend provides `DentistUnavailability` model and `/api/clinic/dentist-unavailability` endpoints.
  - However, in `apps/web`, [`ClinicHoursClosureModal.tsx`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/web/src/components/ClinicHoursClosureModal.tsx#L1-L60) only manages clinic-wide closures (closing the entire hospital).
  - There is currently **zero visual interface** in the frontend for a receptionist to:
    1. Mark an individual doctor on leave (e.g. Dr. Arun on vacation tomorrow).
    2. View the list of appointments flagged with `[ACTION REQUIRED: Dr. ... on leave]`.
    3. Reschedule or reassign those patients with one click.
- **Solution:** Add a "Doctor Leave & Schedules" tab to `ClinicHoursClosureModal` or `ReceptionDashboard` that lists affected appointments and allows bulk or 1-click reassignment.

### Friction Point 3: Disconnected Patient Handoff from Dentist Dashboard to Doctor Desk
- **Code Inspection:**
  - In [`DentistDashboard.tsx`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/web/src/features/dashboard/DentistDashboard.tsx#L191-L200):
    ```typescript
    onClick={() => {
      handleUpdateStatus(appt.id, 'IN_CHAIR');
      navigate('/doctor');
    }}
    ```
  - In [`DoctorDesk.tsx`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/web/src/features/consultations/DoctorDesk.tsx#L235-L250): It searches today's appointments without checking `useSearchParams()`.
- **Usability Impact:** When the doctor clicks "Seat in Chair & Start", the app navigates to `/doctor` without passing the appointment ID. If multiple chairs or patients exist, the doctor must re-find and click the patient again.
- **Solution:** Update navigation to `/doctor?appointmentId=${appt.id}` and update `DoctorDesk.tsx` to automatically select that appointment on load.

### Friction Point 4: Third-Party External QR Image Dependency
- **Code Inspection:**
  - `ReceptionDashboard.tsx:133-134`:
    `const checkinQrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=" + encodeURIComponent(checkInUrl);`
  - `AdminDashboard.tsx:74-75`: Same external API call.
- **Usability Impact:** If clinic internet has intermittent connectivity, firewall restrictions, or `api.qrserver.com` has latency, the standee QR code displays a broken image icon.
- **Solution:** Replace external image URL with a client-side SVG QR code generator (0 network requests, instant rendering).

### Friction Point 5: Raw Technical Error Messages Displayed to Patients
- **Code Inspection:**
  - In [`PublicCheckInView.tsx`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/web/src/features/public/PublicCheckInView.tsx#L205-L210):
    ```typescript
    catch (err: any) {
      const msg = err.message || 'Check-in failed.';
      setError(msg);
    }
    ```
- **Usability Impact:** If the server returns database-level errors (e.g. `raw SQL row-lock acquisition failed` or `exclusion_violation`), patients in the clinic lobby see raw technical errors.
- **Solution:** Implement a human-friendly error dictionary mapping technical error codes to clear instructions (e.g. *"We could not verify your check-in automatically. Please show your reference to the reception desk"*).

### Friction Point 6: Lack of Reception Keyboard Shortcuts for High-Volume Work
- **Usability Impact:** Receptionists handle dozens of patient interactions per hour while speaking on the phone or attending to walk-ins. Requiring mouse navigation for every routine task slows down clinic operations.
- **Solution:** Add keyboard shortcuts (`Alt+C` for Check-In, `Alt+W` for Walk-In, `Alt+N` for New Patient, `Alt+B` for New Booking, `Escape` to close modals).

---

## 4. Recommended Role-Specific Screen Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DENTRINQO ROLE ADAPTATION                       │
├────────────────────────────────────────────────────────────────────────┤
│ 1. RECEPTIONIST DESK                                                   │
│    ┌───────────────────────────────────┬─────────────────────────────┐ │
│    │ [ + New Booking ] [ + Walk-In ]   │ Operatory Chairs Status     │ │
│    ├───────────────────────────────────┼─────────────────────────────┤ │
│    │ Live Today's Schedule & Queue:    │ Chair #1: Dr. Arun (In Use) │ │
│    │ • Waiting in Lobby (Tokens)       │ Chair #2: Dr. Priya (Free)  │ │
│    │ • In Treatment (Chairs)           │ Chair #3: Scaling (Free)    │ │
│    │ • Ready for Billing (Procedures)  ├─────────────────────────────┤ │
│    │ • Doctor Leave Alerts (Action Req)│ Quick Patient Search (Phone)│ │
│    └───────────────────────────────────┴─────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────┤
│ 2. DENTIST CLINICAL DESK                                               │
│    ┌───────────────────────────────────┬─────────────────────────────┐ │
│    │ Hero Card: Current Seated Patient │ Medical Alerts Banner       │ │
│    │ [ Ravi Kumar - Chair 1 - Token 4 ]│ ⚠️ Penicillin Allergy        │ │
│    ├───────────────────────────────────┼─────────────────────────────┤ │
│    │ Clinical Tabs (0ms Keep-Alive):   │ Quick Actions:              │ │
│    │ • Dental Chart (FDI Teeth)        │ [ + Add Procedure ]         │ │
│    │ • Clinical Notes (Dictation)      │ [ Write Prescription ]      │ │
│    │ • Treatment Plan (Procedures)     │ [ Complete & Send to Bill ] │ │
│    └───────────────────────────────────┴─────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────┤
│ 3. CLINIC OWNER DASHBOARD                                              │
│    ┌─────────────────────────────────────────────────────────────────┐ │
│    │ Today's Revenue: ₹14,500  |  Waiting Avg: 12 min  | Chairs: 85% │ │
│    ├─────────────────────────────────┬───────────────────────────────┤ │
│    │ Overdue Follow-ups & Recalls    │ Doctor Schedule & Leave       │ │
│    │ 12 patients due for review      │ Dr. Arun (Leave: Tomorrow)    │ │
│    └─────────────────────────────────┴───────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Click-by-Click Optimized Workflows

### Workflow 1: Arriving Patient Self QR Check-In (Patient)
1. **Action:** Patient points smartphone camera at reception acrylic standee QR code.
2. **Screen Opens:** [`/check-in`](file:///C:/Users/yoges/.gemini/antigravity-ide/scratch/dentrinqo/apps/web/src/features/public/PublicCheckInView.tsx) pre-loaded with clinic branding and name.
3. **Step 1:** Patient enters their 10-digit mobile number or booking reference (e.g. `AKS-2026-A1B2`).
4. **Step 2:** Clicks `[ Check In ]`.
5. **Confirmation:** Screen transitions immediately to green success card showing:
   - **Queue Token:** `#A012`
   - **Status:** *Waiting in Lobby*
   - **Patients Ahead:** *2 patients ahead of you*
   - **Assigned Operatory:** *Chair 2 (Dr. Priya Mani)*
   - Audio beep confirms turn tracking is active.

---

### Workflow 2: Receptionist Walk-In Registration (Receptionist)
1. **Shortcut:** Receptionist presses `Alt+W` or clicks `[ + Walk-In Patient ]`.
2. **Modal Opens:** Clean 4-field quick form:
   - Full Name
   - Mobile Number (10 digits)
   - Age / Gender
   - Reason for Visit (defaults to *Toothache / Consultation*)
3. **Action:** Clicks `[ Register & Issue Token ]`.
4. **Behind the Scenes:**
   - PostgreSQL advisory lock acquires instantly on phone.
   - Patient UHID generated (`AKS-2026-0042-9A`).
   - Daily Queue Sequence increments atomically (`Token #A013`).
   - Active on-duty doctor assigned (excluding any doctor on leave).
5. **UI Update (0ms):** Modal closes; toast notification displays:  
   *“✓ Token #A013 issued to Murugan Raja. Added to waiting lobby.”*

---

### Workflow 3: Dentist Consultation to Completed Treatment (Dentist)
1. **Dentist Screen:** Opens Dentist Dashboard or Doctor Desk.
2. **Action:** Clicks `[ Seat in Chair & Start ]` next to the top waiting patient.
3. **Workspace Opens:** Loads patient's dental chart, medical alerts (e.g. *Diabetic, Penicillin Allergy*), and chief complaint.
4. **During Treatment:**
   - Dentist clicks tooth 36 on FDI Chart -> Marks *Composite Restoration*.
   - Dictates or types brief clinical note.
5. **Completion:** Dentist clicks `[ Complete & Send to Billing ]`.
6. **Behind the Scenes:**
   - Procedure logged with standard fee (e.g. ₹1,200).
   - Appointment status updates to `TREATED`.
   - Real-time event broadcasts to Reception and Billing desks.
7. **Next Step:** System automatically asks:  
   *“Treatment completed. Would you like to create an e-Prescription or schedule a 7-day follow-up?”*

---

### Workflow 4: Treatment-Linked Reception Checkout (Receptionist / Accountant)
1. **Receptionist Alert:** A subtle audio chime plays; the `Ready for Billing` badge updates to `(1)`.
2. **Action:** Receptionist clicks the patient in the queue tab.
3. **Modal Opens:** Pre-filled invoice displays:
   - *Tooth 36: Composite Restoration — ₹1,200*
   - *(Zero fabricated charges. Only actual completed procedures are listed.)*
4. **Payment Entry:**
   - Receptionist selects payment mode: `[ Cash ]`, `[ UPI / QR ]`, or `[ Card ]`.
   - Enters amount received (supports partial payments, e.g. ₹1,000 paid, ₹200 balance).
5. **Action:** Clicks `[ Settle & Print Receipt ]`.
6. **Result:** Appointment marks `COMPLETED`; chair frees up; thermal receipt prints instantly.

---

### Workflow 5: Dentist Leave & Impacted Appointment Rescheduling (Receptionist)
1. **Action:** Receptionist opens `[ Doctor Leave & Schedules ]`.
2. **Form:**
   - Selects Doctor: *Dr. Arun Kumar*
   - Selects Date Range: *Tomorrow, Oct 16 (Full Day)*
   - Reason: *Dental Conference*
3. **Click `[ Preview Impact ]`:** System displays:  
   *“Dr. Arun Kumar has 4 confirmed appointments scheduled for Oct 16:”*
   - 10:00 AM — Ramesh Kumar (Scaling) -> *Suggested: Dr. Priya (Chair 2 Free)*
   - 11:30 AM — Kavitha Devi (Crown) -> *Suggested: Reschedule to Oct 17*
   - 02:00 PM — Anand Mohan (Root Canal)
   - 04:30 PM — Sneha R (Follow-up)
4. **Action:** Receptionist clicks `[ Reassign to Dr. Priya ]` or `[ Send Reschedule SMS/WhatsApp ]`.
5. **Confirmation:** System records the leave, blocks new online bookings for Dr. Arun, and updates appointment notes with `[ACTION REQUIRED]`.

---

## 6. Consistent Terminology & Plain-English Glossary

Technical software terms confuse clinic staff and panic patients. Dentrinqo interfaces must adhere to this standardized dictionary:

| Prohibited Technical Term | Approved User-Facing Term | User Context |
| :--- | :--- | :--- |
| *Resource Allocation* | **Dentist and Chair Assignment** | Scheduling & operatory settings |
| *Encounter / Encounter State* | **Visit / Consultation Status** | Clinical desk & patient history |
| *Queue Sequence Upsert* | **Issue Queue Token** | Reception check-in |
| *Resource Conflict / 409* | **Time Slot Unavailable** | Booking calendar |
| *Transaction Failed / Rollback* | **Could not save. Please try again.** | Any form submission failure |
| *Dentist Unavailability Configuration* | **Doctor Leave & Holidays** | Clinic schedule settings |
| *Idempotency Conflict* | **Patient is already checked in** | Repeated QR scans |
| *Exclusion Constraint 23P01* | **All operatory chairs are occupied** | Capacity limits |
| *GiST Overlap Error* | **Doctor is already booked for another patient** | Dentist conflict |
| *Deactivated User Status Cache* | **Staff account is inactive** | Authentication & login |

---

## 7. Accessibility, Visual Hierarchy & Device Ergonomics

### 7.1 WCAG 2.1 AA Compliance
- **Text Contrast:** Ensure all body text meets a minimum contrast ratio of **4.5:1** against white or slate backgrounds (using `text-slate-800` or `text-slate-900` instead of light gray `text-slate-400`).
- **Touch Ergonomics:** All touch targets on reception tablets must be at least **44 × 44 pixels** with a minimum 8px margin.
- **Color Independence:** Status indicators must never rely on color alone. Every badge must include **Icon + Text + Color**:
  - `WAITING`: Amber clock icon + "Waiting in Lobby"
  - `IN_CHAIR`: Teal armchair icon + "In Treatment (Chair 1)"
  - `TREATED`: Blue checkmark icon + "Ready for Billing"
  - `COMPLETED`: Emerald check-circle icon + "Completed & Paid"
  - `ON_LEAVE`: Red calendar-x icon + "On Leave"

### 7.2 Reception Hardware Optimization
- High-volume screens (`ReceptionDashboard`, `DoctorDesk`) must support ordinary clinic hardware (1366×768 resolution monitors, non-retina displays, touch-enabled all-in-one POS terminals).
- Modals must be scrollable within the viewport (`max-h-[85vh] overflow-y-auto`) so action buttons are never cut off on small monitors.

---

## 8. Prioritized Usability Enhancements

### Phase 1: High-Impact Usability Fixes (P0 — Immediate)
1. **Eliminate Native Browser Alerts:**
   - Create a lightweight in-app toast notification hook (`useToast`) and confirmation dialog (`ConfirmModal`) to replace `window.alert()` and `window.confirm()`.
2. **Seamless Doctor Queue Handoff:**
   - Pass `?appointmentId=${appt.id}` when clicking "Seat in Chair & Start" in `DentistDashboard.tsx`.
   - Update `DoctorDesk.tsx` to read the query param and auto-select the patient.
3. **Friendly Error Translator:**
   - Add a centralized `formatUserFriendlyError(err)` helper to translate raw database exceptions into actionable clinic guidance.
4. **Client-Side SVG QR Generator:**
   - Replace external `api.qrserver.com` calls with embedded SVG generation in `ReceptionDashboard.tsx` and `AdminDashboard.tsx`.

### Phase 2: Receptionist & Doctor Ergonomics (P1 — Next)
1. **Doctor Leave & Affected Appointments Drawer:**
   - Add a dedicated "Doctor Leave" tab to `ClinicHoursClosureModal` that consumes the `/api/clinic/dentist-unavailability` endpoints, lists overlapping appointments, and provides 1-click rescheduling.
2. **Reception Keyboard Shortcuts:**
   - Add `useHotkeys` listener on `ReceptionDashboard`: `Alt+C` (Check-In), `Alt+W` (Walk-In), `Alt+B` (Booking), `Alt+F` (Search).
3. **Doctor Desk Patient Banner:**
   - Display prominent red medical alert badges (*Allergies, Cardiac, Diabetic*) prominently above the dental chart.

### Phase 3: Clinical Continuity & Financial UX (P2 — Follow-up)
1. **Interactive Patient Timeline:**
   - Redesign `PatientDetail.tsx` into a unified continuity timeline connecting Appointment -> Consultation -> Treatment Plan -> Completed Procedures -> Invoices.
2. **One-Click Recall Reminders:**
   - In `FollowUpsView.tsx`, add a 1-click WhatsApp/SMS template launcher for patients overdue for 6-month cleaning or incomplete root canals.

---

## 9. Testable Acceptance Criteria

| ID | User Journey | Verifiable Acceptance Criteria |
| :--- | :--- | :--- |
| **UX-01** | **Reception Check-In** | Clicking "Check In" on an appointment completes check-in and updates queue without opening extra pages or showing browser alert. |
| **UX-02** | **Doctor Desk Handoff** | Clicking "Seat in Chair & Start" in `DentistDashboard` immediately opens `DoctorDesk` with that patient selected and dental chart active. |
| **UX-03** | **Doctor Leave Alert** | When a doctor is marked on leave, the receptionist sees the exact count of affected appointments and can reassign them from one drawer. |
| **UX-04** | **Offline QR Code** | Disconnecting the internet in browser dev tools still renders the check-in standee QR code correctly. |
| **UX-05** | **No Native Alerts** | Zero calls to `window.alert()` or `window.confirm()` in user-facing workflows. |
| **UX-06** | **Friendly Error Handling** | Intentionally submitting an expired lobby code or conflicting slot displays a polite explanation with suggested next steps. |
| **UX-07** | **Zero Invented Charges** | Generating an invoice for a patient with 0 completed procedures shows a clear notice rather than generating an empty or fabricated bill. |
