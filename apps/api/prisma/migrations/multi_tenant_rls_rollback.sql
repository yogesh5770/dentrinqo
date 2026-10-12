-- ============================================================================
-- MULTI-TENANT SCHEMA & ROW-LEVEL SECURITY (RLS) ROLLBACK SCRIPT
-- Reverts fail-closed RLS policies, tables, and restored original constraints
-- ============================================================================

BEGIN;

-- 1. DISABLE & REMOVE RLS POLICIES ON ALL 26 TABLES
DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'Account', 'Appointment', 'AuditLog', 'CompletedProcedure', 'Consultation',
    'ConsultationAmendment', 'DailyQueueSequence', 'DentalChartEntry', 'FileAnnotation',
    'FollowUpReminder', 'Invoice', 'InvoiceItem', 'LabOrder', 'MedicalFile',
    'Patient', 'PatientConsent', 'Payment', 'Prescription', 'PrescriptionItem',
    'RefundAdjustment', 'TreatmentCatalogItem', 'TreatmentPlan', 'TreatmentPlanItem',
    'User', 'ClinicSequence', 'ClinicDisplayToken'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'tenant_isolation_policy', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'tenant_isolation', t);
      EXECUTE format('ALTER TABLE %I NO FORCE ROW LEVEL SECURITY;', t);
      EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('DROP INDEX IF EXISTS %I;', t || '_clinicId_idx');
    END IF;
  END LOOP;
END $$;

-- 2. DROP SUPPORT TABLES
DROP TABLE IF EXISTS "ClinicDisplayToken";
DROP TABLE IF EXISTS "ClinicDomain";
DROP TABLE IF EXISTS "ClinicSequence";

-- 3. RESTORE SINGLE UNIQUE CONSTRAINTS
DROP INDEX IF EXISTS "User_clinicId_username_key";
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username") WHERE "username" IS NOT NULL;

DROP INDEX IF EXISTS "Patient_clinicId_uhid_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Patient_uhid_key" ON "Patient"("uhid");

DROP INDEX IF EXISTS "Prescription_clinicId_prescriptionNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Prescription_prescriptionNumber_key" ON "Prescription"("prescriptionNumber");

DROP INDEX IF EXISTS "Invoice_clinicId_invoiceNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

DROP INDEX IF EXISTS "Payment_clinicId_receiptNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_receiptNumber_key" ON "Payment"("receiptNumber");

-- 4. REMOVE ADDED APPOINTMENT COLUMNS
ALTER TABLE "Appointment" DROP COLUMN IF EXISTS "isConfirmedAtDesk";
ALTER TABLE "Appointment" DROP COLUMN IF EXISTS "confirmedAtDeskAt";
ALTER TABLE "Appointment" DROP COLUMN IF EXISTS "confirmedByStaffId";
ALTER TABLE "Appointment" DROP COLUMN IF EXISTS "checkInSource";

-- 5. REMOVE ADDED CLINIC COLUMNS
ALTER TABLE "Clinic" DROP COLUMN IF EXISTS "lobbySecret";
ALTER TABLE "Clinic" DROP COLUMN IF EXISTS "lobbyCodeDigits";
ALTER TABLE "Clinic" DROP COLUMN IF EXISTS "lobbyCodeWindowSeconds";
ALTER TABLE "Clinic" DROP COLUMN IF EXISTS "requireLobbyCode";
ALTER TABLE "Clinic" DROP COLUMN IF EXISTS "requireDeskConfirmation";
ALTER TABLE "Clinic" DROP COLUMN IF EXISTS "isDoctorVerified";
ALTER TABLE "Clinic" DROP COLUMN IF EXISTS "isBillingVerified";

COMMIT;
