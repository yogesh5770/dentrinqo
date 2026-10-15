-- Migration: dentist_unavailability_and_chair.sql
-- Target DB: PostgreSQL (aks_dental_dev)
-- Description: Adds assignedChairNumber to User; creates DentistUnavailability with multi-tenant RLS policy and aks_app grants.

-- 1. USER EXTENSION FOR DEFAULT OPERATORY CHAIR
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "assignedChairNumber" INTEGER;

-- 2. DENTIST UNAVAILABILITY TABLE
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
    CONSTRAINT "DentistUnavailability_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DentistUnavailability_dentistId_fkey" FOREIGN KEY ("dentistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DentistUnavailability_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- 3. INDEXES FOR HIGH-PERFORMANCE TIME-WINDOW LOOKUPS
CREATE INDEX IF NOT EXISTS "DentistUnavailability_clinicId_dentistId_startAt_endAt_idx" ON "DentistUnavailability"("clinicId", "dentistId", "startAt", "endAt");
CREATE INDEX IF NOT EXISTS "DentistUnavailability_clinicId_startAt_endAt_idx" ON "DentistUnavailability"("clinicId", "startAt", "endAt");

-- 4. ROW LEVEL SECURITY (RLS) FOR MULTI-TENANT ISOLATION
ALTER TABLE "DentistUnavailability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DentistUnavailability" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON "DentistUnavailability";
CREATE POLICY tenant_isolation_policy ON "DentistUnavailability"
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''))
  WITH CHECK ("clinicId" = NULLIF(current_setting('app.clinic_id', true), ''));

-- 5. PERMISSIONS GRANT FOR NON-OWNER APP ROLE (aks_app)
GRANT ALL ON TABLE "DentistUnavailability" TO aks_app;
