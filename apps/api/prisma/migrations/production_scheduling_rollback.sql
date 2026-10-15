-- ============================================================================
-- DENTRINQO PRODUCTION SCHEDULING ROLLBACK SCRIPT
-- Target Database: PostgreSQL 16 (aks_dental)
-- Date: October 15, 2026
-- ============================================================================

BEGIN;

-- Safety & Lock Configuration
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
