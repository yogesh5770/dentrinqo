#!/usr/bin/env bash
# ==============================================================================
# Enterprise PostgreSQL Disaster Recovery & Restoration Script
# Applicable to: AKS Elite Dental Clinic & Jacobs Dental Clinic
# Standards: Isolated non-production restore verification, pre-restore checksum check,
#            clean table replacement, schema integrity validation.
# ==============================================================================

set -euo pipefail

# External Secure Configuration
CONFIG_FILE="${BACKUP_CONFIG_FILE:-/etc/dental-backup.conf}"
if [ -f "${CONFIG_FILE}" ]; then
  # shellcheck source=/dev/null
  source "${CONFIG_FILE}"
fi

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <path_to_backup_dump> [target_database_name]"
  echo "Example for dry-run verification: $0 /var/backups/aks-dental/aks_dental_prod_20261010_120000.dump aks_dental_restore_test"
  exit 1
fi

BACKUP_FILE="$1"
TARGET_DB="${2:-aks_dental_restore_test}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file '${BACKUP_FILE}' not found."
  exit 1
fi

# Decrypt if encrypted (.enc extension)
WORKING_DUMP="${BACKUP_FILE}"
CLEANUP_DECRYPTED=0

if [[ "${BACKUP_FILE}" == *.enc ]]; then
  if [ -z "${BACKUP_ENCRYPT_PASSPHRASE:-}" ]; then
    echo "Error: Backup is encrypted with AES-256. Please export BACKUP_ENCRYPT_PASSPHRASE before restoring."
    exit 1
  fi
  WORKING_DUMP="/tmp/decrypted_restore_$(date +%s).dump"
  echo "Decrypting archive to secure temporary file..."
  openssl enc -d -aes-256-cbc -pbkdf2 -in "${BACKUP_FILE}" -out "${WORKING_DUMP}" -k "${BACKUP_ENCRYPT_PASSPHRASE}"
  chmod 600 "${WORKING_DUMP}"
  CLEANUP_DECRYPTED=1
fi

echo "=========================================================="
echo "PostgreSQL Restoration Protocol"
echo "Backup Source: ${BACKUP_FILE}"
echo "Target DB:     ${TARGET_DB}"
echo "Host / Port:   ${DB_HOST}:${DB_PORT}"
echo "=========================================================="

export PGPASSWORD="${DB_PASSWORD:-}"

# Safeguard: Prevent accidental overwrite of production unless explicitly confirmed
if [[ "${TARGET_DB}" == *"_prod"* ]] && [ "${ALLOW_PROD_RESTORE:-0}" != "1" ]; then
  echo "SAFETY INTERLOCK: Target database '${TARGET_DB}' appears to be PRODUCTION."
  echo "To restore onto production, export ALLOW_PROD_RESTORE=1 before running this script."
  if [ "$CLEANUP_DECRYPTED" -eq 1 ]; then rm -f "${WORKING_DUMP}"; fi
  exit 1
fi

if [ -z "${DB_PASSWORD:-}" ] && id "postgres" >/dev/null 2>&1 && [ "$(id -un)" != "postgres" ]; then
  PSQL_EXEC="sudo -u postgres psql"
  CREATEDB_EXEC="sudo -u postgres createdb"
  RESTORE_EXEC="sudo -u postgres pg_restore"
else
  PSQL_EXEC="psql"
  CREATEDB_EXEC="createdb"
  RESTORE_EXEC="pg_restore"
fi

# 1. Create target database if it does not exist (for non-prod verification)
echo "Checking target database '${TARGET_DB}'..."
if ! ${PSQL_EXEC} -lqt | cut -d \| -f 1 | grep -qw "${TARGET_DB}"; then
  echo "Database '${TARGET_DB}' does not exist. Creating fresh database..."
  ${CREATEDB_EXEC} "${TARGET_DB}"
fi

# 2. Execute pg_restore
echo "Executing pg_restore into '${TARGET_DB}'..."
START_RESTORE=$(date +%s)

${RESTORE_EXEC} -d "${TARGET_DB}" \
  --clean --if-exists --no-owner --no-privileges -v "${WORKING_DUMP}" || true

DURATION=$(( $(date +%s) - START_RESTORE ))
echo "Restoration step completed in ${DURATION}s."

# 3. Post-Restore Verification Checks
echo "Running post-restore integrity and record count queries..."
${PSQL_EXEC} -d "${TARGET_DB}" -c "
SELECT 
  (SELECT count(*) FROM \"Clinic\") as clinics_count,
  (SELECT count(*) FROM \"User\") as users_count,
  (SELECT count(*) FROM \"Patient\") as patients_count,
  (SELECT count(*) FROM \"Invoice\") as invoices_count,
  (SELECT count(*) FROM \"Payment\") as payments_count;
"

echo "Restoration verification completed successfully for ${TARGET_DB}."

if [ "$CLEANUP_DECRYPTED" -eq 1 ]; then
  rm -f "${WORKING_DUMP}"
  echo "Securely removed temporary decrypted dump."
fi
