import subprocess

AKS_HOST = "13.201.121.18"
AKS_KEY = r"C:\Users\yoges\Downloads\AK.pem"
LOCAL_SQL = r"C:\Users\yoges\.gemini\antigravity-ide\scratch\aks-elite-dental-management\apps\api\prisma\migrations\multi_tenant_rls.sql"

print("1. Uploading multi_tenant_rls.sql to VPS...")
subprocess.run(
    ["scp", "-i", AKS_KEY, "-o", "StrictHostKeyChecking=no", LOCAL_SQL, f"ubuntu@{AKS_HOST}:/tmp/multi_tenant_rls.sql"],
    check=True
)

cmd = """
set -e
echo "=== 2. Row counts BEFORE migration on aks_dental_dev ==="
sudo -u postgres psql -d aks_dental_dev -t -c "
SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;
"

echo "=== 3. Executing multi_tenant_rls.sql on aks_dental_dev ==="
sudo -u postgres psql -d aks_dental_dev -f /tmp/multi_tenant_rls.sql

echo "=== 4. Row counts AFTER migration on aks_dental_dev ==="
sudo -u postgres psql -d aks_dental_dev -t -c "
SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;
"

echo "=== 5. Checking RLS & FORCE flags on all 26 tables ==="
sudo -u postgres psql -d aks_dental_dev -c "
SELECT c.relname AS tablename, 
       c.relrowsecurity AS rls_enabled, 
       c.relforcerowsecurity AS force_rls 
FROM pg_class c 
JOIN pg_namespace n ON n.oid = c.relnamespace 
WHERE n.nspname = 'public' AND c.relkind = 'r' 
  AND c.relname NOT IN ('_prisma_migrations', 'Clinic')
ORDER BY c.relname;
"

echo "=== 6. Checking Policy Definitions (Audit for any IS NULL escape) ==="
sudo -u postgres psql -d aks_dental_dev -c "
SELECT tablename, policyname, qual 
FROM pg_policies 
WHERE schemaname = 'public' AND qual LIKE '%IS NULL%';
"
"""

res = subprocess.run(
    ["ssh", "-i", AKS_KEY, "-o", "StrictHostKeyChecking=no", f"ubuntu@{AKS_HOST}", cmd],
    capture_output=True,
    text=True
)
print("STDOUT:\n", res.stdout)
if res.stderr:
    print("STDERR:\n", res.stderr)
