-- ============================================================================
-- DENTRINQO PRODUCTION SCHEDULING INTEGRITY MIGRATION
-- Target Database: PostgreSQL 16 (aks_dental)
-- Date: October 15, 2026
-- ============================================================================

BEGIN;

-- 1. Safety & Lock Configuration
SET statement_timeout = '30s';
SET lock_timeout = '5s';

-- 2. Ensure btree_gist extension is available for composite exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 3. Extend User table for default operatory chair assignment
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "assignedChairNumber" INTEGER;

-- 4. Create DentistUnavailability Table
CREATE TABLE IF NOT EXISTS "DentistUnavailability" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "dentistId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DentistUnavailability_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DentistUnavailability_clinicId_fkey" 
        FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DentistUnavailability_dentistId_fkey" 
        FOREIGN KEY ("dentistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DentistUnavailability_createdById_fkey" 
        FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 5. Time-Window Query Indexes for High-Performance Conflict Lookups
CREATE INDEX IF NOT EXISTS "DentistUnavailability_clinicId_dentistId_startAt_endAt_idx" 
    ON "DentistUnavailability"("clinicId", "dentistId", "startAt", "endAt");
CREATE INDEX IF NOT EXISTS "DentistUnavailability_clinicId_startAt_endAt_idx" 
    ON "DentistUnavailability"("clinicId", "startAt", "endAt");

-- 6. Row-Level Security (RLS) for Multi-Tenant Isolation
ALTER TABLE "DentistUnavailability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DentistUnavailability" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "DentistUnavailability";
CREATE POLICY tenant_isolation_policy ON "DentistUnavailability"
    FOR ALL
    TO PUBLIC
    USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))
    WITH CHECK ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''));

-- 7. Grant Application Role Permissions
GRANT ALL ON TABLE "DentistUnavailability" TO aks_app;

-- 8. Add no_overlapping_dentist_booking Exclusion Constraint
-- Protects reserved appointments and checked-in booked slots from dentist double-booking.
-- Walk-in queue tokens (hasBookedSlot = false) wait in lobby without triggering collisions.
ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "no_overlapping_dentist_booking";
ALTER TABLE "Appointment" ADD CONSTRAINT "no_overlapping_dentist_booking"
    EXCLUDE USING gist (
        "clinicId" WITH =,
        "dentistId" WITH =,
        tsrange("scheduledStart", "scheduledEnd") WITH &&
    )
    WHERE (
        status IN ('SCHEDULED', 'CONFIRMED', 'CALLED', 'IN_CHAIR')
        OR (status = 'CHECKED_IN' AND "hasBookedSlot" = true)
    );

-- 9. Refine no_overlapping_chair_booking Exclusion Constraint
-- Upgrades existing constraint to protect checked-in booked appointments while waiting in lobby.
ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "no_overlapping_chair_booking";
ALTER TABLE "Appointment" ADD CONSTRAINT "no_overlapping_chair_booking"
    EXCLUDE USING gist (
        "clinicId" WITH =,
        "chairNumber" WITH =,
        tsrange("scheduledStart", "scheduledEnd") WITH &&
    )
    WHERE (
        status IN ('SCHEDULED', 'CONFIRMED', 'CALLED', 'IN_CHAIR')
        OR (status = 'CHECKED_IN' AND "hasBookedSlot" = true)
    );

COMMIT;
