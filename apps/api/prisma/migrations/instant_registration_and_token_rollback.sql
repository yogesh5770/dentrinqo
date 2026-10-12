-- Rollback Migration: instant_registration_and_token_rollback.sql
-- Target DB: PostgreSQL
--
-- IMPORTANT SAFETY NOTICE:
-- This rollback script is SAFE ONLY on a fresh database copy or an environment where
-- overlapping CHECKED_IN rows do not exist in the Appointment table.
-- Cross-clinic SECURITY DEFINER functions are INTENTIONALLY NOT RESTORED to prevent
-- reintroducing security and RLS bypass vulnerabilities.

-- 1. PRE-CHECK: Abort if re-adding the legacy constraint would fail due to overlapping walk-in records
DO $$
DECLARE
    overlap_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO overlap_count
    FROM "Appointment" a1
    JOIN "Appointment" a2 ON a1."clinicId" = a2."clinicId" 
                         AND a1."chairNumber" = a2."chairNumber"
                         AND a1.id <> a2.id
                         AND tsrange(a1."scheduledStart", a1."scheduledEnd") && tsrange(a2."scheduledStart", a2."scheduledEnd")
    WHERE a1.status = ANY (ARRAY['SCHEDULED'::text, 'CONFIRMED'::text, 'CHECKED_IN'::text, 'IN_CHAIR'::text])
      AND a2.status = ANY (ARRAY['SCHEDULED'::text, 'CONFIRMED'::text, 'CHECKED_IN'::text, 'IN_CHAIR'::text]);

    IF overlap_count > 0 THEN
        RAISE EXCEPTION 'ROLLBACK ABORTED: Found % overlapping appointment records under the legacy filter (e.g. concurrent CHECKED_IN walk-ins). Re-applying the broader exclusion constraint would cause DDL failure. Clean up or archive overlapping records before applying rollback.', overlap_count;
    END IF;
END $$;

-- 2. Restore AuditLog permissions if necessary
GRANT UPDATE, DELETE, TRUNCATE ON TABLE "AuditLog" TO aks_app;

-- 3. Restore previous exclusion constraint (including CHECKED_IN)
ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "no_overlapping_chair_booking";
ALTER TABLE "Appointment" ADD CONSTRAINT "no_overlapping_chair_booking"
  EXCLUDE USING gist (
    "clinicId" WITH =,
    "chairNumber" WITH =,
    tsrange("scheduledStart", "scheduledEnd") WITH &&
  )
  WHERE (status = ANY (ARRAY['SCHEDULED'::text, 'CONFIRMED'::text, 'CHECKED_IN'::text, 'IN_CHAIR'::text]));

-- 4. Drop indexes
DROP INDEX IF EXISTS "Patient_clinicId_needsVerification_idx";
DROP INDEX IF EXISTS "Appointment_clinicId_trackingCode_idx";
DROP INDEX IF EXISTS "Appointment_clinicId_tokenNumber_idx";
DROP INDEX IF EXISTS "Appointment_trackingCode_key";

-- 5. Drop columns
ALTER TABLE "Appointment" DROP COLUMN IF EXISTS "preferredDentistId";
ALTER TABLE "Appointment" DROP COLUMN IF EXISTS "expectedChairNumber";
ALTER TABLE "Appointment" DROP COLUMN IF EXISTS "trackingCode";
ALTER TABLE "Appointment" DROP COLUMN IF EXISTS "tokenNumber";

ALTER TABLE "Patient" DROP COLUMN IF EXISTS "dobApproximate";
ALTER TABLE "Patient" DROP COLUMN IF EXISTS "consentAt";
ALTER TABLE "Patient" DROP COLUMN IF EXISTS "consentVersion";
ALTER TABLE "Patient" DROP COLUMN IF EXISTS "consentWhatsapp";
ALTER TABLE "Patient" DROP COLUMN IF EXISTS "consentDataUse";
ALTER TABLE "Patient" DROP COLUMN IF EXISTS "verifiedByStaffId";
ALTER TABLE "Patient" DROP COLUMN IF EXISTS "verifiedAt";
ALTER TABLE "Patient" DROP COLUMN IF EXISTS "needsVerification";
ALTER TABLE "Patient" DROP COLUMN IF EXISTS "source";
