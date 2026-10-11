-- ==============================================================================
-- PRE-LAUNCH AUDIT & DATA CLEANUP PROPOSAL (DRY RUN / SAFE TRANSACTION)
-- Standards: Zero automatic execution. Preserves financial audit trails.
--            Never deletes production records without explicit approval.
-- ==============================================================================

BEGIN;

-- 1. IDENTIFY RECORDS PROPOSED FOR ARCHIVAL / RESET

-- Proposed Patient Records for Archival:
-- [AKS-2026-0001] Yogesh T (Phone: 8248345770, ID: 71bb1990-a4c7-405c-9670-a3048c035c04)
-- Note: Soft-archive (isArchived = TRUE) rather than hard DELETE to maintain relational integrity.
UPDATE "Patient"
SET 
  "isArchived" = true,
  "notes" = COALESCE("notes", '') || ' [ARCHIVED PRE-LAUNCH AUDIT TEST PATIENT]'
WHERE "phone" = '8248345770';

-- Proposed Appointments for Archival:
-- ID: 7feac147-719a-443f-8bb4-005205eff192 (Status: COMPLETED)
UPDATE "Appointment"
SET 
  "status" = 'CANCELLED',
  "notes" = COALESCE("notes", '') || ' [ARCHIVED PRE-LAUNCH AUDIT TEST APPOINTMENT]'
WHERE "patientId" IN (SELECT id FROM "Patient" WHERE "phone" = '8248345770');

-- Proposed Financial Records Preservation:
-- Invoice: INV-2026-0001 (Amount: 20000 paise / Rs 200.00)
-- Under Section 44AA of Income Tax Act and GST rules, tax invoices must NEVER be hard deleted.
-- The record is marked as VOIDED with an immutable audit rationale.
UPDATE "Invoice"
SET 
  "status" = 'VOIDED',
  "notes" = COALESCE("notes", '') || ' [PRE-LAUNCH AUDIT]: Test invoice soft-voided prior to commercial go-live. Tax record preserved.'
WHERE "invoiceNumber" = 'INV-2026-0001';

-- Proposed Payment Record:
-- Payment: RCP-2026-0002 (Amount: 20000 paise / Rs 200.00, Method: UPI)
UPDATE "Payment"
SET 
  "notes" = COALESCE("notes", '') || ' [PRE-LAUNCH AUDIT]: Test payment entry linked to voided test invoice INV-2026-0001.'
WHERE "receiptNumber" = 'RCP-2026-0002';

-- 2. AUDIT LOGGING:
-- Record explicit pre-launch cleanup event in AuditLog
INSERT INTO "AuditLog" (
  "id", "clinicId", "actorId", "actorRole", "action", "entityType", "entityId", "details", "createdAt"
)
SELECT 
  gen_random_uuid(),
  c.id,
  u.id,
  'CLINIC_ADMIN',
  'PRE_LAUNCH_CLEANUP_PROPOSAL_VERIFIED',
  'System',
  c.id,
  '{"summary": "Pre-launch test patient soft-archived, test invoice marked VOIDED, financial history preserved", "status": "PENDING_APPROVAL"}',
  NOW()
FROM "Clinic" c
JOIN "User" u ON u."clinicId" = c.id
WHERE u."role" = 'CLINIC_ADMIN'
LIMIT 1;

-- 3. VERIFY PROPOSED POST-CLEANUP STATE:
SELECT 
  (SELECT count(*) FROM "Clinic") as active_clinics,
  (SELECT count(*) FROM "User" WHERE "isActive" = true) as active_staff,
  (SELECT count(*) FROM "Patient" WHERE "isArchived" = false) as active_patients,
  (SELECT count(*) FROM "Patient" WHERE "isArchived" = true) as archived_test_patients,
  (SELECT count(*) FROM "Invoice" WHERE "status" != 'VOIDED') as active_invoices,
  (SELECT count(*) FROM "Invoice" WHERE "status" = 'VOIDED') as voided_test_invoices,
  (SELECT count(*) FROM "AuditLog") as total_audit_records;

-- SAFETY INTERLOCK: ROLLBACK BY DEFAULT
-- This guarantees this script will NOT modify production data when tested.
-- Explicit approval required before changing ROLLBACK to COMMIT.
ROLLBACK;
