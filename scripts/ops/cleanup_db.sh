#!/bin/bash
# Clean up ALL test/static data - keep only the admin user

# Delete test staff (all non-admin users)
sudo -u postgres psql -d aks_dental_prod -c "
DELETE FROM \"User\" WHERE email != 'akselitedental.madurai@gmail.com';
"

# Delete ALL test patients
sudo -u postgres psql -d aks_dental_prod -c "
DELETE FROM \"Patient\";
"

# Delete ALL audit logs (they reference test data)
sudo -u postgres psql -d aks_dental_prod -c "
DELETE FROM \"AuditLog\";
"

# Verify clean state
echo ""
echo "=== REMAINING USERS ==="
sudo -u postgres psql -d aks_dental_prod -c "SELECT \"employeeId\", \"fullName\", email, role FROM \"User\";"

echo ""
echo "=== REMAINING PATIENTS ==="
sudo -u postgres psql -d aks_dental_prod -c "SELECT COUNT(*) as patient_count FROM \"Patient\";"

echo ""
echo "=== REMAINING AUDIT LOGS ==="
sudo -u postgres psql -d aks_dental_prod -c "SELECT COUNT(*) as audit_count FROM \"AuditLog\";"

echo ""
echo "=== ALL TABLES ROW COUNTS ==="
sudo -u postgres psql -d aks_dental_prod -c "
SELECT 'User' as tbl, COUNT(*) FROM \"User\"
UNION ALL SELECT 'Patient', COUNT(*) FROM \"Patient\"
UNION ALL SELECT 'Appointment', COUNT(*) FROM \"Appointment\"
UNION ALL SELECT 'Consultation', COUNT(*) FROM \"Consultation\"
UNION ALL SELECT 'DentalChartEntry', COUNT(*) FROM \"DentalChartEntry\"
UNION ALL SELECT 'TreatmentPlan', COUNT(*) FROM \"TreatmentPlan\"
UNION ALL SELECT 'CompletedProcedure', COUNT(*) FROM \"CompletedProcedure\"
UNION ALL SELECT 'Prescription', COUNT(*) FROM \"Prescription\"
UNION ALL SELECT 'Invoice', COUNT(*) FROM \"Invoice\"
UNION ALL SELECT 'Payment', COUNT(*) FROM \"Payment\"
UNION ALL SELECT 'AuditLog', COUNT(*) FROM \"AuditLog\"
ORDER BY tbl;
"
