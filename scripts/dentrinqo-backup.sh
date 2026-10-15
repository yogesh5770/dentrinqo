#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/dentrinqo"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_NAME="aks_dental"
DUMP_FILE="${BACKUP_DIR}/db_${DB_NAME}_${TIMESTAMP}.sql.gz"
FILES_FILE="${BACKUP_DIR}/uploads_${TIMESTAMP}.tar.gz"
LOG_FILE="/var/log/dentrinqo-backup.log"
CONFIG_FILE="/etc/dentrinqo/backup-upload.env"
PUBLIC_KEY="/etc/dentrinqo/backup-public.pem"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Starting Dentrinqo automated backup..." | tee -a "${LOG_FILE}"

# 1. Database dump via PostgreSQL peer authentication
echo "Dumping database ${DB_NAME}..." | tee -a "${LOG_FILE}"
sudo -u postgres pg_dump -d "${DB_NAME}" -F p | gzip > "${DUMP_FILE}"
DB_SIZE=$(stat -c%s "${DUMP_FILE}")
DB_HASH=$(sha256sum "${DUMP_FILE}" | cut -d' ' -f1)

# 2. Medical files archive
echo "Archiving medical uploads..." | tee -a "${LOG_FILE}"
if [ -d "/var/www/dental-api/uploads" ]; then
  tar -czf "${FILES_FILE}" -C /var/www/dental-api uploads/
else
  mkdir -p /var/www/dental-api/uploads
  tar -czf "${FILES_FILE}" -C /var/www/dental-api uploads/
fi
FILES_SIZE=$(stat -c%s "${FILES_FILE}")
FILES_HASH=$(sha256sum "${FILES_FILE}" | cut -d' ' -f1)

# 3. Asymmetric CMS Envelope Encryption
if [ -f "${PUBLIC_KEY}" ]; then
  echo "Encrypting backup archives with Asymmetric OpenSSL CMS..." | tee -a "${LOG_FILE}"
  openssl cms -encrypt -in "${DUMP_FILE}" -out "${DUMP_FILE}.enc" -recip "${PUBLIC_KEY}" -aes256 -binary
  openssl cms -encrypt -in "${FILES_FILE}" -out "${FILES_FILE}.enc" -recip "${PUBLIC_KEY}" -aes256 -binary
  chmod 600 "${DUMP_FILE}.enc" "${FILES_FILE}.enc"
  
  ENC_DB_SIZE=$(stat -c%s "${DUMP_FILE}.enc")
  ENC_DB_HASH=$(sha256sum "${DUMP_FILE}.enc" | cut -d' ' -f1)
  ENC_FILES_SIZE=$(stat -c%s "${FILES_FILE}.enc")
  ENC_FILES_HASH=$(sha256sum "${FILES_FILE}.enc" | cut -d' ' -f1)
  echo "Encrypted DB: ${ENC_DB_SIZE} bytes (SHA256: ${ENC_DB_HASH})" | tee -a "${LOG_FILE}"
  echo "Encrypted Files: ${ENC_FILES_SIZE} bytes (SHA256: ${ENC_FILES_HASH})" | tee -a "${LOG_FILE}"
else
  echo "ERROR: Public key ${PUBLIC_KEY} not found!" | tee -a "${LOG_FILE}"
  exit 1
fi

# 4. Generate JSON metadata manifest
cat <<MANIFEST > "${BACKUP_DIR}/manifest_${TIMESTAMP}.json"
{
  "timestamp": "${TIMESTAMP}",
  "database": "${DB_NAME}",
  "db_dump_file": "${DUMP_FILE}",
  "db_size_bytes": ${DB_SIZE},
  "db_sha256": "${DB_HASH}",
  "files_archive": "${FILES_FILE}",
  "files_size_bytes": ${FILES_SIZE},
  "files_sha256": "${FILES_HASH}",
  "encrypted_db_sha256": "${ENC_DB_HASH:-none}",
  "encrypted_files_sha256": "${ENC_FILES_HASH:-none}"
}
MANIFEST

# 5. Cloud Sync via S3-Compatible Backblaze B2
if [ -f "${CONFIG_FILE}" ]; then
  echo "Sourcing cloud credentials from ${CONFIG_FILE}..." | tee -a "${LOG_FILE}"
  set -a
  source "${CONFIG_FILE}"
  set +a
  
  if [ -n "${S3_BUCKET:-}" ] && [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
    echo "Syncing encrypted archives to s3://${S3_BUCKET}..." | tee -a "${LOG_FILE}"
    python3 /usr/local/bin/dentrinqo-s3-upload.py "${TIMESTAMP}" "${DUMP_FILE}.enc" "${FILES_FILE}.enc" "${BACKUP_DIR}/manifest_${TIMESTAMP}.json" 2>&1 | tee -a "${LOG_FILE}"
  fi
fi

# 6. Local retention rotation (Prune local backups older than 14 days)
find "${BACKUP_DIR}" -name "db_*.sql.gz" -mtime +14 -delete 2>/dev/null || true
find "${BACKUP_DIR}" -name "uploads_*.tar.gz" -mtime +14 -delete 2>/dev/null || true
find "${BACKUP_DIR}" -name "*.enc" -mtime +14 -delete 2>/dev/null || true
find "${BACKUP_DIR}" -name "manifest_*.json" -mtime +14 -delete 2>/dev/null || true

# 7. External Alerting Heartbeat
if [ -n "${HEALTHCHECKS_UUID:-}" ]; then
  curl -fsS --retry 3 "https://hc-ping.com/${HEALTHCHECKS_UUID}" >/dev/null 2>&1 || true
fi

echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] Dentrinqo automated backup completed successfully: ${DUMP_FILE}" | tee -a "${LOG_FILE}"
