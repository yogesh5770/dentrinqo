-- Dentrinqo Pre-Deployment Migration Rollback: Remove idempotencyKey from Prescription
-- Purpose: Revert changes made in 20261015120000_add_prescription_idempotency_key

DROP INDEX IF EXISTS "Prescription_clinicId_idempotencyKey_key";
ALTER TABLE "Prescription" DROP COLUMN IF EXISTS "idempotencyKey";
