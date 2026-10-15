-- Rollback: dentist_unavailability_and_chair_rollback.sql
-- Target DB: PostgreSQL (aks_dental_dev)
-- Description: Reverses dentist_unavailability_and_chair.sql by dropping DentistUnavailability and reverting assignedChairNumber.

DROP POLICY IF EXISTS tenant_isolation_policy ON "DentistUnavailability";
DROP TABLE IF EXISTS "DentistUnavailability" CASCADE;
ALTER TABLE "User" DROP COLUMN IF EXISTS "assignedChairNumber";
