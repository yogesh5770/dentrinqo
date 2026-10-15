-- Dentrinqo Pre-Deployment Migration: Add optional idempotencyKey to Prescription
-- Purpose: Protect against duplicate prescription issuance from network retries, timeout reconnections, and concurrent HTTP requests
-- Safe for Live Data: Uses nullable TEXT column and partial unique index; permits multiple NULLs for legitimate historical records and future non-keyed prescriptions.

ALTER TABLE "Prescription" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Prescription_clinicId_idempotencyKey_key" 
ON "Prescription" ("clinicId", "idempotencyKey") 
WHERE "idempotencyKey" IS NOT NULL;
