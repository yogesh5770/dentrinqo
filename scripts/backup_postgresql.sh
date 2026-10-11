#!/usr/bin/env bash
# ==============================================================================
# Enterprise PostgreSQL Hardened Backup & Off-Site Replication Script
# Applicable to: AKS Elite Dental Clinic
# Standards: Restricted Unix permissions (0700/0600), custom-format compression,
#            archive integrity verification, AES-256 PBKDF2 encryption,
#            S3-compatible off-site sync, failure alerting, 30-day retention.
# ==============================================================================

set -euo pipefail

# 1. External Secure Configuration (Keeps credentials outside source code)
CONFIG_FILE="${BACKUP_CONFIG_FILE:-/etc/dental-backup.conf}"
if [ -f "${CONFIG_FILE}" ]; then
  # Ensure restricted permissions on config file
  CONFIG_PERMS=$(stat -c "%a" "${CONFIG_FILE}" 2>/dev/null || stat -f "%Lp" "${CONFIG_FILE}" 2>/dev/null || echo "unknown")
  if [ "${CONFIG_PERMS}" != "600" ] && [ "${CONFIG_PERMS}" != "400" ] && [ "${CONFIG_PERMS}" != "unknown" ]; then
    echo "WARNING: Config file ${CONFIG_FILE} permissions (${CONFIG_PERMS}) should be 0600. Fixing..."
    chmod 600 "${CONFIG_FILE}" 2>/dev/null || true
  fi
  # shellcheck source=/dev/null
  source "${CONFIG_FILE}"
fi

# 2. Configuration & Default Environment
CLINIC_NAME="${CLINIC_NAME:-aks-dental}"
DB_NAME="${DB_NAME:-aks_dental_prod}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/${CLINIC_NAME}}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
LOG_FILE="${BACKUP_DIR}/backup.log"

# Off-site S3 configuration
S3_ENABLED="${S3_ENABLED:-false}"
S3_DESTINATION="${S3_DESTINATION:-}"
S3_ENDPOINT_URL="${S3_ENDPOINT_URL:-}"
S3_REGION="${S3_REGION:-ap-south-1}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILENAME="${DB_NAME}_${TIMESTAMP}.dump"
BACKUP_FILEPATH="${BACKUP_DIR}/${BACKUP_FILENAME}"

# 3. Enforce Strict Directory Permissions & Ownership (POSIX 0700)
if [ ! -d "${BACKUP_DIR}" ]; then
  mkdir -p "${BACKUP_DIR}"
fi
chown -R postgres:postgres "${BACKUP_DIR}" 2>/dev/null || true
chmod 700 "${BACKUP_DIR}"

log_msg() {
  local msg="[$(date +'%Y-%m-%d %H:%M:%S')] $1"
  echo "$msg"
  echo "$msg" >> "${LOG_FILE}"
}

send_alert() {
  local error_reason="$1"
  log_msg "ALERT: ${error_reason}"
  if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    log_msg "Dispatching failure webhook alert to ${ALERT_WEBHOOK_URL}..."
    curl -s -X POST -H "Content-Type: application/json" \
      -d "{\"clinic\":\"${CLINIC_NAME}\",\"database\":\"${DB_NAME}\",\"status\":\"BACKUP_FAILED\",\"timestamp\":\"${TIMESTAMP}\",\"error\":\"${error_reason}\"}" \
      "${ALERT_WEBHOOK_URL}" >> "${LOG_FILE}" 2>&1 || true
  fi
}

log_msg "--------------------------------------------------------"
log_msg "Starting PostgreSQL backup for database: ${DB_NAME}"

# 4. Execute Custom-Format Dump (pg_dump -Fc)
START_TIME=$(date +%s)
export PGPASSWORD="${DB_PASSWORD:-}"

if [ -z "${DB_PASSWORD:-}" ] && id "postgres" >/dev/null 2>&1 && [ "$(id -un)" != "postgres" ]; then
  DUMP_EXEC="sudo -u postgres pg_dump -d ${DB_NAME}"
  VERIFY_EXEC="sudo -u postgres pg_restore"
else
  DUMP_EXEC="pg_dump -d ${DB_NAME}"
  VERIFY_EXEC="pg_restore"
fi

if ${DUMP_EXEC} -Fc -b -v --no-owner --no-privileges -f "${BACKUP_FILEPATH}" 2>> "${LOG_FILE}"; then
  
  # 5. Enforce Strict File Permissions (POSIX 0600)
  chmod 600 "${BACKUP_FILEPATH}"
  
  FILE_SIZE=$(du -h "${BACKUP_FILEPATH}" | cut -f1)
  DURATION=$(( $(date +%s) - START_TIME ))
  log_msg "Backup created successfully: ${BACKUP_FILEPATH} (Size: ${FILE_SIZE}, Time: ${DURATION}s)"
  
  # 6. Archive Integrity Verification
  log_msg "Verifying archive integrity via pg_restore header table-of-contents..."
  if ${VERIFY_EXEC} --list "${BACKUP_FILEPATH}" > /dev/null 2>&1; then
    log_msg "Integrity verification PASSED: valid PostgreSQL TOC header."
  else
    send_alert "Archive verification FAILED for ${BACKUP_FILENAME}! Header corrupted."
    exit 1
  fi

  # 7. Optional AES-256 Encryption (if BACKUP_ENCRYPT_PASSPHRASE is provided)
  UPLOAD_FILE="${BACKUP_FILEPATH}"
  if [ -n "${BACKUP_ENCRYPT_PASSPHRASE:-}" ]; then
    log_msg "Encrypting backup with AES-256-CBC (PBKDF2)..."
    if openssl enc -aes-256-cbc -salt -pbkdf2 \
      -in "${BACKUP_FILEPATH}" \
      -out "${BACKUP_FILEPATH}.enc" \
      -k "${BACKUP_ENCRYPT_PASSPHRASE}"; then
      chmod 600 "${BACKUP_FILEPATH}.enc"
      log_msg "Encrypted archive generated: ${BACKUP_FILEPATH}.enc"
      UPLOAD_FILE="${BACKUP_FILEPATH}.enc"
    else
      send_alert "Encryption step failed for ${BACKUP_FILENAME}!"
      exit 1
    fi
  fi

  # 8. Encrypted Off-Site Replication (S3 / Compatible Object Storage)
  if [ "${S3_ENABLED:-false}" = "true" ]; then
    if [ -z "${S3_DESTINATION:-}" ]; then
      send_alert "S3_ENABLED is true but S3_DESTINATION is empty."
      exit 1
    fi

    log_msg "Initiating off-site upload of $(basename "${UPLOAD_FILE}") to ${S3_DESTINATION}..."
    UPLOAD_SUCCESS=0

    if command -v aws >/dev/null 2>&1; then
      EXTRA_ARGS=()
      if [ -n "${S3_ENDPOINT_URL:-}" ]; then
        EXTRA_ARGS+=(--endpoint-url "${S3_ENDPOINT_URL}")
      fi
      if [ -n "${S3_REGION:-}" ]; then
        EXTRA_ARGS+=(--region "${S3_REGION}")
      fi
      if aws s3 cp "${UPLOAD_FILE}" "${S3_DESTINATION}/$(basename "${UPLOAD_FILE}")" "${EXTRA_ARGS[@]}" >> "${LOG_FILE}" 2>&1; then
        UPLOAD_SUCCESS=1
      fi
    elif command -v rclone >/dev/null 2>&1; then
      if rclone copyto "${UPLOAD_FILE}" "${S3_DESTINATION}/$(basename "${UPLOAD_FILE}")" >> "${LOG_FILE}" 2>&1; then
        UPLOAD_SUCCESS=1
      fi
    else
      log_msg "WARNING: Neither 'aws' CLI nor 'rclone' found in system PATH."
    fi

    if [ "${UPLOAD_SUCCESS}" -eq 1 ]; then
      log_msg "Off-site upload completed successfully to ${S3_DESTINATION}."
    else
      send_alert "Off-site backup upload failed for $(basename "${UPLOAD_FILE}") to ${S3_DESTINATION}!"
      exit 1
    fi
  else
    log_msg "Off-site backup sync skipped (S3_ENABLED=false)."
  fi

  # 9. Apply 30-Day Retention Policy (Purge expired snapshots, never active)
  log_msg "Applying retention policy: pruning snapshots older than ${RETENTION_DAYS} days..."
  find "${BACKUP_DIR}" -name "${DB_NAME}_*.dump*" -type f -mtime +"${RETENTION_DAYS}" -exec rm -f {} \;
  log_msg "Retention pruning completed."

else
  send_alert "pg_dump execution failed for ${DB_NAME}!"
  exit 1
fi

log_msg "PostgreSQL backup workflow completed successfully."
