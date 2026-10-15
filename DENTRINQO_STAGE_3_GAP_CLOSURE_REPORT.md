# Dentrinqo Stage 3 Gap Closure & Offsite Disaster Recovery Audit Report

**Document ID:** `DENTRINQO-STAGE-3-GAP-CLOSURE-REPORT`  
**Date:** October 15, 2026  
**Engineering Lead:** Antigravity AI Engineering  
**Target Environment:** Production VM (`137.23.45.243` / `FREVPS` in Oracle Cloud Mumbai `ap-mumbai-1`)  
**Stage 3 Verdict:** 🔴 **FAIL / NOT VERIFIED (Local Encryption & Restoration Verified; Remote Cloud Replication Not Executed)**  
**Rollout Status:** ⛔ **STAGE 1 REMAINS ON STRICT HOLD**  

---

## 1. Executive Summary & Root Cause of the Evidence Gap

In response to the Stage 3 review, an exhaustive audit of the actual production host (`137.23.45.243`), the running backup script (`/usr/local/bin/dentrinqo-backup.sh`), configuration files (`/etc/dentrinqo/`), and the previous test execution was conducted.

### Core Audit Finding:
The previous report demonstrated that **asymmetric CMS envelope encryption, offline private key isolation, cryptographic SHA-256 parity, and isolated database restoration all function with 100% data integrity when executed locally**.

**HOWEVER, the critical prerequisite of actual offsite cloud replication was NOT executed:**
1. **No remote storage bucket has been created or connected.**
2. **No encrypted archives have been uploaded to an offsite cloud provider.**
3. **The previous restoration test retrieved files from the production VM's local filesystem (`/tmp/backup_download` via `scp`), NOT from a remote cloud object store.**
4. **The backup script currently creates only local encrypted archives on the VM (`/var/backups/dentrinqo/`), because the cloud credentials file `/etc/dentrinqo/backup-upload.env` does not exist.**

If the production VM suffered catastrophic physical failure, storage volume loss, or account hypervisor termination today, **all backups would be lost along with the host**.

Therefore, the Stage 3 offsite disaster recovery milestone is officially reclassified as **FAIL / NOT VERIFIED (Remote Cloud Replication Incomplete)**. Stage 1 (Application Deployment) and Stage 2 (Nginx Configuration) remain strictly **ON HOLD**.

---

## 2. Forensic Component-by-Component Verification Matrix

| Verification Requirement | Implementation Status | Real Environment Evidence | Final Status |
| :--- | :--- | :--- | :---: |
| **1. Asymmetric Key Generation & Isolation** | **VERIFIED** | 4096-bit RSA certificate installed at `/etc/dentrinqo/backup-public.pem` (`0644`). Private key `backup-private.pem` resides strictly in offline vault (`vault/backup-private.pem`). Filesystem scan confirmed private key does not exist on VM. | 🟢 **PASS** |
| **2. Negative Decryption Test** | **VERIFIED** | Server cannot decrypt backups using public cert: `Could not read signing key from /etc/dentrinqo/backup-public.pem`. An adversary with root access cannot decrypt historical or active backups. | 🟢 **PASS** |
| **3. Automated Asymmetric Encryption** | **VERIFIED** | Live execution of `/usr/local/bin/dentrinqo-backup.sh` generated `db_aks_dental_*.sql.gz.enc` (32.6 KB) and `uploads_*.tar.gz.enc` (1.3 KB) with forensic JSON manifest. | 🟢 **PASS** |
| **4. Actual Remote Storage Provisioning** | **NOT EXECUTED** | No bucket exists in Oracle Cloud Object Storage or Cloudflare R2. No cloud resource has been provisioned. | 🔴 **NOT VERIFIED** |
| **5. Remote Cloud Upload** | **NOT EXECUTED** | `/etc/dentrinqo/backup-upload.env` does not exist on the VM (only `.template` exists). Step 5 of the backup script was skipped. No data left the VM. | 🔴 **NOT VERIFIED** |
| **6. Remote Retrieval via Restore Identity** | **NOT EXECUTED** | Files in the previous restoration test were transferred from `/tmp/backup_download` on the VM via `scp`, not downloaded from a remote object storage API. | 🔴 **NOT VERIFIED** |
| **7. Decryption & SHA-256 Parity** | **VERIFIED (Local File Source)** | Offline decryption via `backup-private.pem` yielded 100% identical SHA-256 hashes (`8442e11...` for DB, `82ca388...` for files) matching the source manifest. | 🟢 **PASS (Local)** / 🔴 **UNVERIFIED (Remote)** |
| **8. Isolated Database Restoration** | **VERIFIED (Local File Source)** | Restored into `dentrinqo_offsite_restore_test` on PostgreSQL: Clinics (2/2), Users (5/5), Patients (12/12), Appointments (14/14), Invoices (7/7). Tenant isolation verified. Sandbox cleanly dropped. | 🟢 **PASS (Local)** / 🔴 **UNVERIFIED (Remote)** |
| **9. Dead-Man's Switch Failure Alerting** | **VERIFIED** | Simulated DB dump failure halted script execution (`set -euo pipefail`) and suppressed heartbeat ping. | 🟢 **PASS** |
| **10. Zero-Cost Storage Verification** | **THEORETICALLY ELIGIBLE / OPERATIONALLY UNVERIFIED** | Tenancy is eligible for Always Free 10 GB Standard Object Storage, but because no bucket is configured, active zero-cost offsite storage is unproven. | 🟡 **UNVERIFIED** |

---

## 3. Deep Dive: Code and Host Inspection

### 3.1 Inspection of `/usr/local/bin/dentrinqo-backup.sh`
Inspection of the live script on `137.23.45.243` reveals why remote upload did not occur:

```bash
# Lines 47-68 of /usr/local/bin/dentrinqo-backup.sh:
CONFIG_FILE="/etc/dentrinqo/backup-upload.env"

# 5. Optional Cloud Sync via S3-Compatible API (Oracle Cloud Object Storage / R2)
if [ -f "${CONFIG_FILE}" ]; then
  echo "Sourcing cloud credentials from ${CONFIG_FILE}..." | tee -a "${LOG_FILE}"
  source "${CONFIG_FILE}"
  
  if [ -n "${S3_BUCKET:-}" ] && [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
    echo "Syncing encrypted archives to s3://${S3_BUCKET}..." | tee -a "${LOG_FILE}"
    python3 -c "
import os, sys, boto3
s3 = boto3.client('s3', ...)
...
"
  fi
fi
```

### 3.2 Inspection of `/etc/dentrinqo/`
```bash
$ ls -la /etc/dentrinqo/
total 24
drwxr-xr-x   2 root   root    4096 Oct 15 02:51 .
drwxr-xr-x 122 root   root   12288 Oct 15 02:46 ..
-rw-r--r--   1 root   root    1850 Oct 15 02:46 backup-public.pem
-rw-r--r--   1 ubuntu ubuntu   453 Oct 15 02:51 backup-upload.env.template
```
`/etc/dentrinqo/backup-upload.env` **does not exist**.

### 3.3 Inspection of Live Backup Execution Log (`/var/log/dentrinqo-backup.log`)
```
[2026-10-15T02:47:57Z] Starting Dentrinqo automated backup...
Dumping database aks_dental...
Archiving medical uploads...
Encrypting backup archives with Asymmetric OpenSSL CMS...
Encrypted DB: 32617 bytes (SHA256: a5810bb1c3cf67804517447121877000f9da7f4d1ec9d6ff247bd7566c11e530)
Encrypted Files: 1328 bytes (SHA256: 72bb3e557a4862fa35cc79d8a4c4d7b2255b353ea590c58fd7139e2581a5ee7a)
[2026-10-15T02:47:57Z] Dentrinqo automated backup completed successfully: /var/backups/dentrinqo/db_aks_dental_20261015_024757.sql.gz
```
Notice the complete absence of:
- `Sourcing cloud credentials...`
- `Syncing encrypted archives to s3://...`
- `Cloud upload to OCI Object Storage completed successfully.`

**Conclusion:** The backup script executed **only local dump and local asymmetric encryption**. It did not transmit any data over the network to remote storage.

---

## 4. Free-Tier Eligibility & Zero-Cost Assessment

1. **Oracle Cloud Account Eligibility:**
   - Tenancy: `ocid1.tenancy.oc1..aaaaaaaau4lpynjtqfg2xeosqei7lufap7wzxxfwseww6xcz3kc3ibtvlazq` in Mumbai (`ap-mumbai-1`).
   - The account is entitled to **Oracle Cloud Always Free Object Storage** (10 GB Standard + 10 GB Archive, 50,000 monthly requests, 10 TB monthly outbound data transfer).
   - Because our total daily backup volume under 30-day retention is **< 180 MB**, the usage will consume **< 2% of the free allowance**.
2. **Why Remote Zero-Cost Provisioning Has Not Occurred Yet:**
   - Autonomous creation of an OCI Object Storage bucket cannot be performed from the VM because the VM instance is not assigned an IAM Dynamic Group policy (`NotAuthorizedOrNotFound`).
   - In accordance with the strict restriction: *"Never provision a paid resource or enable automatic billing without explicit approval,"* Antigravity did not attempt to configure third-party paid accounts or guess credentials.
   - To make the zero-cost remote backup active, an OCI Customer Secret Key (S3-compatible Access Key / Secret Key) and the Tenancy Namespace must be provided to populate `/etc/dentrinqo/backup-upload.env`.

---

## 5. Remaining Security & Operational Risks

1. **Single Point of Failure (SPOF) on VM Storage:**
   - Currently, all encrypted backups reside on `/var/backups/dentrinqo/` on the single Oracle Cloud VM volume.
   - If the VM disk is corrupted or deleted, the database and attachment backups are permanently destroyed.
2. **RPO (Recovery Point Objective) Vulnerability:**
   - Until offsite synchronization is active, the disaster recovery guarantee is strictly limited to local host rollback, NOT catastrophic disaster recovery.
3. **Absence of Remote Retention Enforcement:**
   - Local retention (`find -mtime +14 -delete`) is functioning, but remote cloud WORM retention (OCI Retention Rules) cannot be enforced until the bucket exists.

---

## 6. What Is Required to Close This Gap and Achieve a PASS

To transform Stage 3 from **FAIL** to **PASS**, the following four physical steps must be executed:

```
[ Step A: Provision Free Bucket in OCI Console ]
  • Bucket Name: dentrinqo-backups-production
  • Compartment: root (or designated compartment)
  • Storage Tier: Standard (Always Free eligible)
  • Retention Rule: Time-Bound (30 Days)

[ Step B: Generate Least-Privilege Customer Secret Key ]
  • Identity: OCI User (e.g., dentrinqo-backup-agent)
  • Policy: OBJECT_CREATE, OBJECT_INSPECT only (No OBJECT_DELETE, No OBJECT_READ)
  • Generates: Access Key ID & Secret Access Key

[ Step C: Populate /etc/dentrinqo/backup-upload.env ]
  • Populate S3_ENDPOINT, S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
  • chmod 600, owned by root:root

[ Step D: Execute Live Cloud Verification Run ]
  1. Trigger /usr/local/bin/dentrinqo-backup.sh -> Confirm successful upload to OCI Object Storage.
  2. Attempt DeleteObject using upload credentials -> Confirm HTTP 403 Access Denied.
  3. Download *.enc objects from OCI Object Storage using separate restore credentials to isolated machine.
  4. Decrypt using offline backup-private.pem.
  5. Assert SHA-256 match against manifest.
  6. Restore into PostgreSQL sandbox database and verify 100% record parity.
```

---

## 7. Final Verdict

- **Stage 3 Verdict:** 🔴 **FAIL / NOT VERIFIED (Remote Cloud Offsite Replication Incomplete)**
- **Gate 0 (Scripts):** 🟢 **PASS (Local scripts hardened, peer auth active)**
- **Stage 1 (Application Deployment):** ⛔ **STRICT HOLD (Cannot be authorized until Stage 3 achieves PASS)**
- **Stage 2 (Nginx Upload Limit):** ⛔ **STRICT HOLD**
- **Production Launch Status:** 🔴 **NO-GO**

Antigravity will NOT request authorization for Stage 1 until the genuine remote offsite upload, cloud retrieval, offline decryption, and isolated database restoration are executed and verified with end-to-end cloud telemetry.
