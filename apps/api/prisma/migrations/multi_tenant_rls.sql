-- ============================================================================
-- MULTI-TENANT SCHEMA & ROW-LEVEL SECURITY (RLS) MIGRATION SCRIPT
-- Scopes all 25 clinical and administrative models to direct "clinicId"
-- Enforces compound unique constraints and PostgreSQL RLS tenant isolation
-- ============================================================================

BEGIN;

-- 1. ADD CLINIC ATTRIBUTES
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "subdomain" TEXT;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "planTier" TEXT NOT NULL DEFAULT 'PROFESSIONAL';
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "upiVpa" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Clinic_subdomain_key" ON "Clinic"("subdomain") WHERE "subdomain" IS NOT NULL;

-- 2. ADD clinicId TO ALL 14 CHILD MODELS
ALTER TABLE "Consultation" ADD COLUMN IF NOT EXISTS "clinicId" TEXT;
ALTER TABLE "ConsultationAmendment" ADD COLUMN IF NOT EXISTS "clinicId" TEXT;
ALTER TABLE "DentalChartEntry" ADD COLUMN IF NOT EXISTS "clinicId" TEXT;
ALTER TABLE "TreatmentPlan" ADD COLUMN IF NOT EXISTS "clinicId" TEXT;
ALTER TABLE "TreatmentPlanItem" ADD COLUMN IF NOT EXISTS "clinicId" TEXT;
ALTER TABLE "CompletedProcedure" ADD COLUMN IF NOT EXISTS "clinicId" TEXT;
ALTER TABLE "Prescription" ADD COLUMN IF NOT EXISTS "clinicId" TEXT;
ALTER TABLE "PrescriptionItem" ADD COLUMN IF NOT EXISTS "clinicId" TEXT;
ALTER TABLE "MedicalFile" ADD COLUMN IF NOT EXISTS "clinicId" TEXT;
ALTER TABLE "FileAnnotation" ADD COLUMN IF NOT EXISTS "clinicId" TEXT;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "clinicId" TEXT;
ALTER TABLE "RefundAdjustment" ADD COLUMN IF NOT EXISTS "clinicId" TEXT;
ALTER TABLE "FollowUpReminder" ADD COLUMN IF NOT EXISTS "clinicId" TEXT;

-- 3. BACKFILL clinicId FROM PARENT TABLES
UPDATE "Consultation" c SET "clinicId" = p."clinicId" FROM "Patient" p WHERE c."patientId" = p.id AND c."clinicId" IS NULL;
UPDATE "ConsultationAmendment" ca SET "clinicId" = c."clinicId" FROM "Consultation" c WHERE ca."consultationId" = c.id AND ca."clinicId" IS NULL;
UPDATE "DentalChartEntry" d SET "clinicId" = p."clinicId" FROM "Patient" p WHERE d."patientId" = p.id AND d."clinicId" IS NULL;
UPDATE "TreatmentPlan" t SET "clinicId" = p."clinicId" FROM "Patient" p WHERE t."patientId" = p.id AND t."clinicId" IS NULL;
UPDATE "TreatmentPlanItem" ti SET "clinicId" = t."clinicId" FROM "TreatmentPlan" t WHERE ti."treatmentPlanId" = t.id AND ti."clinicId" IS NULL;
UPDATE "CompletedProcedure" cp SET "clinicId" = p."clinicId" FROM "Patient" p WHERE cp."patientId" = p.id AND cp."clinicId" IS NULL;
UPDATE "Prescription" pr SET "clinicId" = p."clinicId" FROM "Patient" p WHERE pr."patientId" = p.id AND pr."clinicId" IS NULL;
UPDATE "PrescriptionItem" pi SET "clinicId" = pr."clinicId" FROM "Prescription" pr WHERE pi."prescriptionId" = pr.id AND pi."clinicId" IS NULL;
UPDATE "MedicalFile" mf SET "clinicId" = p."clinicId" FROM "Patient" p WHERE mf."patientId" = p.id AND mf."clinicId" IS NULL;
UPDATE "FileAnnotation" fa SET "clinicId" = mf."clinicId" FROM "MedicalFile" mf WHERE fa."medicalFileId" = mf.id AND fa."clinicId" IS NULL;
UPDATE "InvoiceItem" ii SET "clinicId" = i."clinicId" FROM "Invoice" i WHERE ii."invoiceId" = i.id AND ii."clinicId" IS NULL;
UPDATE "RefundAdjustment" ra SET "clinicId" = i."clinicId" FROM "Invoice" i WHERE ra."invoiceId" = i.id AND ra."clinicId" IS NULL;
UPDATE "FollowUpReminder" fur SET "clinicId" = p."clinicId" FROM "Patient" p WHERE fur."patientId" = p.id AND fur."clinicId" IS NULL;

-- Fallback backfill for any orphaned rows using the primary clinic
DO $$
DECLARE
  default_clinic_id TEXT;
BEGIN
  SELECT id INTO default_clinic_id FROM "Clinic" LIMIT 1;
  IF default_clinic_id IS NOT NULL THEN
    UPDATE "Consultation" SET "clinicId" = default_clinic_id WHERE "clinicId" IS NULL;
    UPDATE "ConsultationAmendment" SET "clinicId" = default_clinic_id WHERE "clinicId" IS NULL;
    UPDATE "DentalChartEntry" SET "clinicId" = default_clinic_id WHERE "clinicId" IS NULL;
    UPDATE "TreatmentPlan" SET "clinicId" = default_clinic_id WHERE "clinicId" IS NULL;
    UPDATE "TreatmentPlanItem" SET "clinicId" = default_clinic_id WHERE "clinicId" IS NULL;
    UPDATE "CompletedProcedure" SET "clinicId" = default_clinic_id WHERE "clinicId" IS NULL;
    UPDATE "Prescription" SET "clinicId" = default_clinic_id WHERE "clinicId" IS NULL;
    UPDATE "PrescriptionItem" SET "clinicId" = default_clinic_id WHERE "clinicId" IS NULL;
    UPDATE "MedicalFile" SET "clinicId" = default_clinic_id WHERE "clinicId" IS NULL;
    UPDATE "FileAnnotation" SET "clinicId" = default_clinic_id WHERE "clinicId" IS NULL;
    UPDATE "InvoiceItem" SET "clinicId" = default_clinic_id WHERE "clinicId" IS NULL;
    UPDATE "RefundAdjustment" SET "clinicId" = default_clinic_id WHERE "clinicId" IS NULL;
    UPDATE "FollowUpReminder" SET "clinicId" = default_clinic_id WHERE "clinicId" IS NULL;
  END IF;
END $$;

-- 4. SET NOT NULL ON clinicId
ALTER TABLE "Consultation" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "ConsultationAmendment" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "DentalChartEntry" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "TreatmentPlan" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "TreatmentPlanItem" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "CompletedProcedure" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "Prescription" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "PrescriptionItem" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "MedicalFile" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "FileAnnotation" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "InvoiceItem" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "RefundAdjustment" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "FollowUpReminder" ALTER COLUMN "clinicId" SET NOT NULL;

-- 5. CONVERT UNIQUE CONSTRAINTS TO COMPOUND CLINIC-SCOPED CONSTRAINTS
-- User (clinicId, username)
DROP INDEX IF EXISTS "User_username_key";
CREATE UNIQUE INDEX IF NOT EXISTS "User_clinicId_username_key" ON "User"("clinicId", "username") WHERE "username" IS NOT NULL;

-- Patient (clinicId, uhid)
DROP INDEX IF EXISTS "Patient_uhid_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Patient_clinicId_uhid_key" ON "Patient"("clinicId", "uhid");

-- Prescription (clinicId, prescriptionNumber)
DROP INDEX IF EXISTS "Prescription_prescriptionNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Prescription_clinicId_prescriptionNumber_key" ON "Prescription"("clinicId", "prescriptionNumber");

-- Invoice (clinicId, invoiceNumber)
DROP INDEX IF EXISTS "Invoice_invoiceNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_clinicId_invoiceNumber_key" ON "Invoice"("clinicId", "invoiceNumber");

-- Payment (clinicId, receiptNumber)
DROP INDEX IF EXISTS "Payment_receiptNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_clinicId_receiptNumber_key" ON "Payment"("clinicId", "receiptNumber");

-- 6. CREATE ClinicSequence TABLE IF NOT EXISTS
CREATE TABLE IF NOT EXISTS "ClinicSequence" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL REFERENCES "Clinic"("id") ON DELETE CASCADE,
  "sequenceType" TEXT NOT NULL,
  "fiscalYear" TEXT,
  "currentValue" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClinicSequence_clinicId_sequenceType_fiscalYear_key" 
  ON "ClinicSequence"("clinicId", "sequenceType", "fiscalYear");
CREATE INDEX IF NOT EXISTS "ClinicSequence_clinicId_sequenceType_idx" 
  ON "ClinicSequence"("clinicId", "sequenceType");

-- 7. ENABLE ROW LEVEL SECURITY (RLS) ON ALL 25 MODELS
DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'User', 'Account', 'Patient', 'Appointment', 'Consultation',
    'ConsultationAmendment', 'DentalChartEntry', 'TreatmentPlan', 'TreatmentPlanItem',
    'CompletedProcedure', 'Prescription', 'PrescriptionItem', 'MedicalFile',
    'FileAnnotation', 'Invoice', 'InvoiceItem', 'Payment', 'RefundAdjustment',
    'FollowUpReminder', 'AuditLog', 'TreatmentCatalogItem', 'LabOrder',
    'PatientConsent', 'DailyQueueSequence', 'ClinicSequence'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I("clinicId");', t || '_clinicId_idx', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'tenant_isolation_policy', t);
    EXECUTE format('
      CREATE POLICY %I ON %I
      FOR ALL
      USING ("clinicId" = NULLIF(current_setting(''app.clinic_id'', true), '''') OR current_setting(''app.clinic_id'', true) IS NULL)
      WITH CHECK ("clinicId" = NULLIF(current_setting(''app.clinic_id'', true), ''''));
    ', 'tenant_isolation_policy', t);
  END LOOP;
END $$;

COMMIT;
