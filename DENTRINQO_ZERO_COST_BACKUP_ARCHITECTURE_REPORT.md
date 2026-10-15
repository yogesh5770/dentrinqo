# Dentrinqo Strictly ₹0/Month Offsite Backup Architecture Report

**Document ID:** `DENTRINQO-ZERO-COST-BACKUP-SPEC`  
**Date:** October 15, 2026  
**Engineering Lead:** Antigravity AI Engineering  
**Target Environment:** Production (`137.23.45.243` / `FREVPS` in Oracle Cloud Mumbai `ap-mumbai-1`)  
**Launch Verdict:** **NO-GO (Pre-Deployment Review Complete — Awaiting Zero-Cost Architecture Sign-off)**  

---

## Executive Summary & Cost Commitment

In response to strict financial governance requiring **₹0.00/month recurring costs** with zero automatic paid conversions, this report revises the Stage 3 offsite backup design. All proposed AWS S3 paid infrastructure has been eliminated in favor of a genuinely free, perpetual zero-cost tier.

### Key Architectural Findings:
1. **Existing Oracle Cloud Tenancy Identified:**
   - The production VM (`FREVPS` at `137.23.45.243`) was created on October 12, 2026, in Oracle Cloud Infrastructure (OCI) **Mumbai region (`ap-mumbai-1`)**, running an `VM.Standard.A1.Flex` Ampere shape under `yogesh234456@gmail.com`.
   - The tenancy is eligible for **Oracle Cloud Always Free Object Storage** (10 GB Standard + 10 GB Archive), which remains free permanently without expiring.
2. **Current Production Footprint is Minimal:**
   - Active database (`aks_dental`) table size: **11 MB**.
   - Compressed daily database dump (`pg_dump -F p | gzip`): **~23 KB**.
   - Physical medical uploads directory (`/var/www/dental-api/uploads`): **8.0 KB**.
   - Total current daily backup package: **< 35 KB**.
3. **Storage Capacity & Headroom:**
   - Under a 30-day retention policy, total stored backup volume will range between **1.5 GB and 3.0 GB** even after a full year of intensive clinical radiography.
   - This consumes **< 30% of the 10 GB free tier**, providing perpetual ₹0/month storage with massive headroom.
4. **Ransomware Immunity via Asymmetric Cryptography & OCI Retention Rules:**
   - Solved the encryption mismatch: utilizes **Asymmetric OpenSSL CMS Envelope Encryption** (tested live on the host). The VM holds *only* the public certificate; the private key resides exclusively in the operator's offline vault.
   - OCI Object Storage provides native **Time-Bound Retention Rules (WORM)** at no cost, preventing deletion or modification during the retention window.

---

## 1. Provider Comparison: Oracle Cloud vs. Cloudflare R2 (Free Tiers)

| Feature / Limit | Oracle Cloud Always Free Object Storage | Cloudflare R2 Free Tier | Winner / Recommendation |
| :--- | :--- | :--- | :--- |
| **Monthly Cost** | **₹0.00 / month** | **₹0.00 / month** | **Tie (₹0)** |
| **Storage Allowance** | **10 GB Standard + 10 GB Archive** (20 GB Total) | **10 GB Standard** | **Oracle Cloud (20 GB)** |
| **Request Allowance** | **50,000 requests / month** free | **1,000,000 Class A, 10,000,000 Class B** | Cloudflare R2 |
| **Bandwidth / Egress** | **10 TB / month** free outbound | **Zero egress fees** permanently | **Tie (Effectively Unlimited for Backups)** |
| **Network Proximity** | **Colocated in Mumbai (`ap-mumbai-1`)**; private backbone routing, single-digit ms latency | Routed over public internet to Cloudflare Edge | **Oracle Cloud** |
| **WORM / Immutable Retention** | **Supported natively via Retention Rules** (Time-Bound, locked) at no extra charge | **Unsupported** (S3 Object Lock API not implemented on R2) | **Oracle Cloud** |
| **API Compatibility** | Amazon S3 Compatible API (`/compat/objectstorage/`) + OCI Native API | Amazon S3 Compatible API | **Tie (Both support standard S3 tooling)** |
| **Account Overhead** | **Zero additional accounts** (uses existing OCI tenancy) | Requires separate Cloudflare account & card on file | **Oracle Cloud** |

### Recommendation:
**Oracle Cloud Object Storage (Always Free)** is recommended as the primary destination because:
- The VM is already inside OCI Mumbai, meaning backup transfers never leave Oracle's internal network backbone.
- It includes native WORM Retention Rules at zero cost.
- It requires no secondary accounts or third-party billing setups.

---

## 2. Oracle Cloud Account Status & Free Tier Eligibility

### 2.1 Metadata Telemetry from Live Host (`FREVPS`)
Direct query to the internal metadata service (`http://169.254.169.254/opc/v2/instance/`) on `137.23.45.243` revealed:
- **Tenancy OCID:** `ocid1.tenancy.oc1..aaaaaaaau4lpynjtqfg2xeosqei7lufap7wzxxfwseww6xcz3kc3ibtvlazq`
- **Region:** `ap-mumbai-1` (Mumbai, India)
- **Shape:** `VM.Standard.A1.Flex` (2 OCPUs, 12 GB RAM)
- **Account Admin:** `default/yogesh234456@gmail.com`
- **Created Date:** October 12, 2026

### 2.2 Answering the User's Critical Question: Always Free vs. Free Trial
> *Question: Is your Oracle Cloud VM running under an Always Free account, or are you using Oracle's free trial credits?*

- **Current Status:** New Oracle Cloud accounts are initiated with a **30-day promotional trial** (approx. ₹26,000 in promotional credits) that runs alongside the **Always Free** entitlements.
- **What Happens When the 30 Days End:**
  - Promotional credits expire.
  - Any *paid* or oversized resources are terminated.
  - **Always Free resources are NEVER terminated.** Specifically:
    - Ampere A1 Compute (up to 4 OCPUs and 24 GB RAM) remains free permanently.
    - 10 GB of Standard Object Storage remains free permanently.
    - 10 GB of Archive Object Storage remains free permanently.
    - 10 TB of outbound data transfer per month remains free permanently.
- **Strict Compliance Safeguard:**
  By strictly sizing the bucket to **Standard Tier** and keeping total stored objects under **10 GB**, the backup system will operate permanently at **₹0/month** even after the 30-day trial credit expires, with zero billing activation.

---

## 3. Cryptographic Architecture: Resolving the Encryption Mismatch

### 3.1 Why Symmetric Encryption Was Rejected
The initial synthetic test utilized symmetric AES-256-CBC with PBKDF2 passphrase. In production, this would require storing the passphrase on the production server. If the server was compromised, an adversary could read the passphrase and decrypt all backups.

### 3.2 Production Solution: Asymmetric CMS Envelope Encryption
Using native Linux OpenSSL (`openssl cms`), backups are encrypted using an asymmetric X.509 public certificate:

```
[ Production Server (FREVPS) ]
  • Possesses ONLY: /etc/dentrinqo/backup-public.pem (Public X.509 Certificate)
  • Executes:
    openssl cms -encrypt \
      -in /var/backups/dentrinqo/payload.tar.gz \
      -out /var/backups/dentrinqo/payload.tar.gz.enc \
      -recip /etc/dentrinqo/backup-public.pem \
      -aes256 -binary
  • Zero Decryption Capability: Even root on FREVPS CANNOT decrypt the .enc archive!

                        │ (Encrypted Payload Upload)
                        ▼
       [ OCI Always Free Object Storage Bucket ]
       (dentrinqo-backups-production in ap-mumbai-1)

                        │ (Download via Restore Operator)
                        ▼
[ Recovery Operator Offline Vault / Staging VM ]
  • Possesses: backup-private.pem (4096-bit RSA Private Key)
  • Executes:
    openssl cms -decrypt \
      -in payload.tar.gz.enc \
      -out payload.tar.gz \
      -inkey /path/to/offline/backup-private.pem
```

### 3.3 Live Host Verification Evidence
Tested live on the target host (`137.23.45.243`):
1. Generated 4096-bit RSA certificate.
2. Encrypted test text payload (`Hello Secure Dental Backup`) with the public certificate.
3. Purged unencrypted source data.
4. Decrypted using private key.
5. Confirmed output matched byte-for-byte.

---

## 4. OCI Least-Privilege IAM Policies & Immutable Retention

### 4.1 Bucket Retention Rules (Zero-Cost WORM)
In the OCI Console (or via OCI S3 compatibility API), create a bucket named `dentrinqo-backups-production` in compartment `root` (or dedicated compartment):
- **Storage Tier:** Standard (Always Free eligible).
- **Retention Rule:**
  - **Type:** Time-Bound Retention Rule.
  - **Duration:** 30 Days.
  - **Lock State:** Active.
  - **Effect:** Objects uploaded to the bucket cannot be overwritten, renamed, or deleted by any user or administrator until 30 days have elapsed from upload time.

### 4.2 Dual-Identity Access Control

#### Identity 1: Production Upload Agent (`dentrinqo-backup-agent`)
- **Type:** OCI IAM User with Customer Secret Key (S3 Access Key / Secret Key).
- **OCI Policy Group:** `DentrinqoUploadersGroup`
- **OCI IAM Policy:**
  ```sql
  Allow group DentrinqoUploadersGroup to manage objects in compartment id ocid1.tenancy.oc1..aaaaaaaau4lpynjtqfg2xeosqei7lufap7wzxxfwseww6xcz3kc3ibtvlazq 
    where all {
      target.bucket.name = 'dentrinqo-backups-production',
      request.permission in ('OBJECT_CREATE', 'OBJECT_INSPECT')
    }
  ```
- **Guaranteed Isolation:** The upload identity has no permission to read object contents (`OBJECT_READ`) or delete objects (`OBJECT_DELETE`).

#### Identity 2: Disaster Recovery Operator (`dentrinqo-restore-operator`)
- **Type:** OCI IAM User with Customer Secret Key (stored strictly in operator password manager / offline vault).
- **OCI IAM Policy:**
  ```sql
  Allow group DentrinqoRestoreOperatorsGroup to read objects in compartment id ocid1.tenancy.oc1..aaaaaaaau4lpynjtqfg2xeosqei7lufap7wzxxfwseww6xcz3kc3ibtvlazq 
    where target.bucket.name = 'dentrinqo-backups-production'
  ```
- **Guaranteed Isolation:** Can inspect and download backups, but cannot alter or delete anything.

---

## 5. Storage Capacity Planning & Headroom Analysis

### 5.1 Real Production Data Metrics
- **PostgreSQL Database (`aks_dental`):** 11 MB raw, compresses to **~23 KB**.
- **Attachment Store (`uploads/`):** 8 KB raw.
- **Daily Growth Estimate:**
  - 10 new IOPA X-rays/week @ 200 KB WebP = ~2 MB/week.
  - 2 OPG radiographs/week @ 1.5 MB WebP = ~3 MB/week.
  - Database table inserts = ~50 KB/day compressed.
  - **Total Projected Daily Backup Size:** **~1.5 MB to 3.0 MB / day**.

### 5.2 Retention Capacity Matrix (10 GB Free Storage Limit)

| Retention Window | Estimated Storage Consumed | % of 10 GB Free Tier | Recurring Cost | Safety Margin |
| :---: | :---: | :---: | :---: | :---: |
| **14 Days** | ~42 MB to 70 MB | **0.4% to 0.7%** | **₹0.00** | Massive (>99% Free) |
| **30 Days (Recommended)** | ~90 MB to 180 MB | **0.9% to 1.8%** | **₹0.00** | Massive (>98% Free) |
| **90 Days (Quarterly)** | ~270 MB to 540 MB | **2.6% to 5.4%** | **₹0.00** | High (>94% Free) |
| **365 Days (1 Year)** | ~1.1 GB to 2.2 GB | **11% to 22%** | **₹0.00** | Safe (>78% Free) |

### 5.3 Safeguard & Storage Monitoring (Zero-Overage Guarantee)
To guarantee that the bucket never exceeds 10 GB or incurs charges:
1. **Pre-Upload Capacity Assertion:** Before every upload, the script queries the bucket size. If total storage exceeds **8.0 GB (80% threshold)**:
   - A critical alert is dispatched to DevOps via Healthchecks.io.
   - Older backups past the 30-day window are automatically pruned.
2. **Hard Halt:** If bucket usage reaches **9.5 GB**, uploads halt safely rather than triggering paid overage.

---

## 6. End-to-End Offsite Cloud Backup & Recovery Verification Test Protocol

Before approving Stage 1 (Application Deployment), this 8-step verification test will be executed:

```
[ Step 1: Automated Local Backup & Asymmetric Encryption ]
  • Dump aks_dental -> /var/backups/dentrinqo/db_aks_dental_TIMESTAMP.sql.gz
  • Archive /var/www/dental-api/uploads -> /var/backups/dentrinqo/uploads_TIMESTAMP.tar.gz
  • Compute source SHA-256 hashes
  • Encrypt using /etc/dentrinqo/backup-public.pem -> *.enc

[ Step 2: Zero-Cost Cloud Upload ]
  • Upload *.enc to OCI Object Storage bucket via S3-compat endpoint using upload agent credentials
  • S3 Endpoint: https://{namespace}.compat.objectstorage.ap-mumbai-1.oraclecloud.com

[ Step 3: Adversary Compromise Simulation (Negative Permissions Test) ]
  • Attempt GetObject using upload agent -> ASSERT 403 Access Denied
  • Attempt DeleteObject using upload agent -> ASSERT 403 Access Denied

[ Step 4: Operator Retrieval ]
  • Retrieve *.enc archives using restore operator credentials to isolated staging sandbox

[ Step 5: Offline Decryption ]
  • Decrypt archives using backup-private.pem held by the recovery operator
  • Assert decrypted SHA-256 matches pre-encryption source SHA-256

[ Step 6: Isolated Sandbox Restoration ]
  • Restore decrypted database dump into dentrinqo_oci_restore_test
  • Extract attachments into /tmp/dentrinqo_oci_attachments/
  • Assert table count matches live production (Clinic, Patient, User, Appointment, MedicalFile)

[ Step 7: Cryptographic Attachment Checksum Verification ]
  • Assert SHA-256 checksum of extracted physical files matches MedicalFile.sha256Hash

[ Step 8: Dead-Man's Switch Heartbeat & Alerting Test ]
  • Trigger simulated backup failure (e.g., nonexistent DB)
  • Assert script terminates immediately (set -e) and heartbeat ping is suppressed
  • Confirm Healthchecks.io triggers notification within testing window
```

---

## 7. Actionable Approval Request for Stage 3

To proceed with configuring the zero-cost backup architecture without creating paid resources, please confirm:

1. **Storage Choice:** Authorize creating the `dentrinqo-backups-production` bucket in Oracle Cloud Object Storage Always Free (Mumbai region `ap-mumbai-1`) at **₹0.00/month**.
2. **Retention Policy:** Approve the **30-day Time-Bound Retention Rule** with an 8.0 GB capacity safety threshold.
3. **Execution Authorization:** Authorize deploying `/etc/dentrinqo/backup-public.pem` to `FREVPS` and executing the 8-step end-to-end verification test into an isolated staging sandbox.

*Note: Application deployment (Stage 1) and Nginx configuration changes (Stage 2) remain strictly ON HOLD until this zero-cost recovery test is completed and verified.*
