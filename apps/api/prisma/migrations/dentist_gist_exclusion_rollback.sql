-- Migration Rollback: dentist_gist_exclusion_rollback.sql
-- Target DB: PostgreSQL (aks_dental_dev)
-- Description: Drops no_overlapping_dentist_booking GiST exclusion constraint.

ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "no_overlapping_dentist_booking";
