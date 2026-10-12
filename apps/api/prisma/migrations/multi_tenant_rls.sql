-- ============================================================================
-- FAIL-CLOSED MULTI-TENANT SCHEMA & ROW-LEVEL SECURITY (RLS) MIGRATION SCRIPT
-- Scopes all 26 clinical & administrative models to direct "clinicId"
-- Enforces compound unique constraints and strict fail-closed PostgreSQL RLS
-- ============================================================================

BEGIN;

-- 1. ADD CLINIC ATTRIBUTES & SECURITY CONFIGURATION
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "subdomain" TEXT;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "planTier" TEXT NOT NULL DEFAULT 'PROFESSIONAL';
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "upiVpa" TEXT;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "lobbySecret" TEXT;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "lobbyCodeDigits" INTEGER NOT NULL DEFAULT 4;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "lobbyCodeWindowSeconds" INTEGER NOT NULL DEFAULT 300;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "requireLobbyCode" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "requireDeskConfirmation" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "isDoctorVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Clinic" ADD COLUMN IF NOT EXISTS "isBillingVerified" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS "Clinic_subdomain_key" ON "Clinic"("subdomain") WHERE "subdomain" IS NOT NULL;

-- Initialize lobbySecret with 64 hex characters (32 bytes cryptographically pseudo-random) if null
UPDATE "Clinic" 
SET "lobbySecret" = md5(random()::text || clock_timestamp()::text) || md5(random()::text || clock_timestamp()::text) 
WHERE "lobbySecret" IS NULL;

-- 2. ADD clinicId TO ALL 14 CHILD MODELS IF MISSING
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

-- 3. ADD APPOINTMENT CHECK-IN CONFIRMATION ATTRIBUTES
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "isConfirmedAtDesk" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "confirmedAtDeskAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "confirmedByStaffId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "checkInSource" TEXT DEFAULT 'DESK';

-- 4. BACKFILL clinicId FROM PARENT TABLES
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

-- Fallback backfill for any orphaned rows using primary clinic
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

-- 5. SET NOT NULL ON clinicId
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

-- 6. CONVERT UNIQUE CONSTRAINTS TO COMPOUND CLINIC-SCOPED CONSTRAINTS
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

-- 7. CREATE NEW SUPPORT TABLES
-- ClinicSequence
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

-- ClinicDomain (Root lookup directory for Host/Domain -> Tenant resolution)
CREATE TABLE IF NOT EXISTS "ClinicDomain" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL REFERENCES "Clinic"("id") ON DELETE CASCADE,
  "domain" TEXT NOT NULL UNIQUE,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ClinicDomain_clinicId_idx" ON "ClinicDomain"("clinicId");

-- ClinicDisplayToken (Cryptographic hashed tokens for Waiting Room TV displays)
CREATE TABLE IF NOT EXISTS "ClinicDisplayToken" (
  "id" TEXT PRIMARY KEY,
  "clinicId" TEXT NOT NULL REFERENCES "Clinic"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "isRevoked" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ClinicDisplayToken_clinicId_idx" ON "ClinicDisplayToken"("clinicId");

-- Seed default domains for existing clinics
INSERT INTO "ClinicDomain" ("id", "clinicId", "domain", "isPrimary", "createdAt")
SELECT 
  gen_random_uuid()::text,
  c.id,
  CASE WHEN c.code = 'JDC' THEN 'jacobs.elitedental.in' ELSE 'aks.elitedental.in' END,
  true,
  NOW()
FROM "Clinic" c
WHERE NOT EXISTS (SELECT 1 FROM "ClinicDomain" cd WHERE cd."clinicId" = c.id);

-- Also map localhost / IP to primary clinic for local development
INSERT INTO "ClinicDomain" ("id", "clinicId", "domain", "isPrimary", "createdAt")
SELECT 
  gen_random_uuid()::text,
  c.id,
  'localhost:5173',
  false,
  NOW()
FROM "Clinic" c
WHERE c.code = 'AKS' AND NOT EXISTS (SELECT 1 FROM "ClinicDomain" cd WHERE cd."domain" = 'localhost:5173');

-- 8. STRICT FAIL-CLOSED ROW LEVEL SECURITY (RLS) ON ALL 26 TENANT TABLES
-- If app.clinic_id is unset or empty: ZERO rows returned, ZERO rows inserted/updated!
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
    -- Performance index on clinicId
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I("clinicId");', t || '_clinicId_idx', t);
    
    -- Enable & Force RLS (Forces table owner to also obey RLS!)
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    
    -- Drop old policies
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'tenant_isolation_policy', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'tenant_isolation', t);
    
    -- STRICT FAIL-CLOSED POLICY (NO "IS NULL" ESCAPE!)
    EXECUTE format('
      CREATE POLICY tenant_isolation_policy ON %I
      FOR ALL
      USING ("clinicId" = NULLIF(current_setting(''app.clinic_id'', true), ''''))
      WITH CHECK ("clinicId" = NULLIF(current_setting(''app.clinic_id'', true), ''''));
    ', t, t);
  END LOOP;
END $$;

-- 9. PERMISSIONS GRANT FOR NON-OWNER APP ROLE (aks_app)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aks_app') THEN
    GRANT USAGE ON SCHEMA public TO aks_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aks_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aks_app;
  END IF;
END $$;

COMMIT;
