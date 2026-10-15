-- Migration: dentist_gist_exclusion.sql
-- Target DB: PostgreSQL (aks_dental_dev)
-- Description: Enforces that a dentist cannot be booked across multiple operatory chairs for overlapping times.
-- Matches the existing no_overlapping_chair_booking constraint.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "no_overlapping_dentist_booking";

ALTER TABLE "Appointment" ADD CONSTRAINT "no_overlapping_dentist_booking"
  EXCLUDE USING gist (
    "clinicId" WITH =,
    "dentistId" WITH =,
    tsrange("scheduledStart", "scheduledEnd") WITH &&
  )
  WHERE (status = ANY (ARRAY['SCHEDULED'::text, 'CONFIRMED'::text, 'CALLED'::text, 'IN_CHAIR'::text]));
