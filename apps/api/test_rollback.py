import subprocess

AKS_HOST = "13.201.121.18"
AKS_KEY = r"C:\Users\yoges\Downloads\AK.pem"
LOCAL_ROLLBACK_SQL = r"C:\Users\yoges\.gemini\antigravity-ide\scratch\aks-elite-dental-management\apps\api\prisma\migrations\multi_tenant_rls_rollback.sql"

print("1. Uploading multi_tenant_rls_rollback.sql to VPS...")
subprocess.run(
    ["scp", "-i", AKS_KEY, "-o", "StrictHostKeyChecking=no", LOCAL_ROLLBACK_SQL, f"ubuntu@{AKS_HOST}:/tmp/multi_tenant_rls_rollback.sql"],
    check=True
)

cmd = """
set -e
echo "=== 2. Creating rollback test database aks_dental_rollback_test ==="
sudo -u postgres psql -c "DROP DATABASE IF EXISTS aks_dental_rollback_test;"
sudo -u postgres psql -c "CREATE DATABASE aks_dental_rollback_test OWNER aks_admin;"
sudo -u postgres pg_dump -d aks_dental_prod | sudo -u postgres psql -d aks_dental_rollback_test > /dev/null

echo "=== 3. Row counts on fresh clone ==="
sudo -u postgres psql -d aks_dental_rollback_test -t -c "
SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;
" > /tmp/counts_before.txt

echo "=== 4. Applying migration on clone ==="
sudo -u postgres psql -d aks_dental_rollback_test -f /tmp/multi_tenant_rls.sql > /dev/null

echo "=== 5. Applying rollback on clone ==="
sudo -u postgres psql -d aks_dental_rollback_test -f /tmp/multi_tenant_rls_rollback.sql > /dev/null

echo "=== 6. Row counts AFTER rollback ==="
sudo -u postgres psql -d aks_dental_rollback_test -t -c "
SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;
" > /tmp/counts_after.txt

echo "=== 7. Comparing counts before and after ==="
diff -u /tmp/counts_before.txt /tmp/counts_after.txt && echo "PERFECT MATCH: Zero data loss during migration and rollback!"

echo "=== 8. Cleaning up test database ==="
sudo -u postgres psql -c "DROP DATABASE aks_dental_rollback_test;"
"""

res = subprocess.run(
    ["ssh", "-i", AKS_KEY, "-o", "StrictHostKeyChecking=no", f"ubuntu@{AKS_HOST}", cmd],
    capture_output=True,
    text=True
)
print("STDOUT:\n", res.stdout)
if res.stderr:
    print("STDERR:\n", res.stderr)
