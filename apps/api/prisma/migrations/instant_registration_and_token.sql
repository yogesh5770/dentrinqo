-- Migration: instant_registration_and_token.sql
-- Target DB: PostgreSQL (aks_dental_dev)
-- Description: Adds atomic queue token and trackingCode to Appointment; adds source, needsVerification, and consent to Patient; updates exclusion constraint; hardens AuditLog immutability.

-- 1. PATIENT EXTENSIONS
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "source" VARCHAR(50) DEFAULT 'RECEPTION' NOT NULL;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "needsVerification" BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "verifiedByStaffId" TEXT;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "consentDataUse" BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "consentWhatsapp" BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "consentVersion" VARCHAR(50) DEFAULT 'v1.0';
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "consentAt" TIMESTAMP(3);
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "dobApproximate" BOOLEAN DEFAULT FALSE NOT NULL;

-- 2. APPOINTMENT EXTENSIONS
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "tokenNumber" INTEGER;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "trackingCode" VARCHAR(64);
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "expectedChairNumber" INTEGER;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "preferredDentistId" TEXT;

-- 3. PERFORMANCE & INTEGRITY INDEXES
CREATE UNIQUE INDEX IF NOT EXISTS "Appointment_trackingCode_key" ON "Appointment"("trackingCode") WHERE "trackingCode" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Appointment_clinicId_tokenNumber_idx" ON "Appointment"("clinicId", "tokenNumber");
CREATE INDEX IF NOT EXISTS "Appointment_clinicId_trackingCode_idx" ON "Appointment"("clinicId", "trackingCode");
CREATE INDEX IF NOT EXISTS "Patient_clinicId_needsVerification_idx" ON "Patient"("clinicId", "needsVerification");

-- 4. PERMISSIONS GRANT FOR NON-OWNER APP ROLE (aks_app)
GRANT ALL ON TABLE "Patient" TO aks_app;
GRANT ALL ON TABLE "Appointment" TO aks_app;

-- 5. IMMUTABLE AUDIT TRAIL ENFORCEMENT
-- Revoke UPDATE, DELETE, and TRUNCATE from aks_app on AuditLog so audit records cannot be tampered with.
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "AuditLog" FROM aks_app;
GRANT SELECT, INSERT ON TABLE "AuditLog" TO aks_app;

-- 6. EXCLUSION CONSTRAINT REFINEMENT
-- Exclude waiting/checked-in walk-ins from chair collision.
-- Enforce strictly across SCHEDULED, CONFIRMED, CALLED, and IN_CHAIR so two patients cannot be called or seated to the same chair at once.
ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "no_overlapping_chair_booking";
ALTER TABLE "Appointment" ADD CONSTRAINT "no_overlapping_chair_booking"
  EXCLUDE USING gist (
    "clinicId" WITH =,
    "chairNumber" WITH =,
    tsrange("scheduledStart", "scheduledEnd") WITH &&
  )
  WHERE (status = ANY (ARRAY['SCHEDULED'::text, 'CONFIRMED'::text, 'CALLED'::text, 'IN_CHAIR'::text]));

-- 7. CLEANUP: REMOVE CROSS-CLINIC SECURITY DEFINER FUNCTIONS (Comprehensive Dynamic Drop)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT p.proname, p.oid::regprocedure AS func_sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' 
          AND p.proname IN ('lookup_appointments_by_phone', 'get_appointment_clinic_by_tracking_code')
    ) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE;';
        RAISE NOTICE 'Dropped definer function: %', r.func_sig;
    END LOOP;
END $$;

-- Fallback explicit drops covering all historical parameter signatures
DROP FUNCTION IF EXISTS public.lookup_appointments_by_phone(text, integer, text);
DROP FUNCTION IF EXISTS public.lookup_appointments_by_phone(text, text);
DROP FUNCTION IF EXISTS public.lookup_appointments_by_phone(text);
DROP FUNCTION IF EXISTS public.get_appointment_clinic_by_tracking_code(text);

