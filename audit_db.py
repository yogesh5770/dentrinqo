import urllib.request
import json

login_data = json.dumps({'email': 'akselitedental.madurai@gmail.com', 'password': 'aks@123'}).encode('utf-8')
req = urllib.request.Request('http://localhost:3001/api/auth/login', data=login_data, headers={'Content-Type': 'application/json'})
res = urllib.request.urlopen(req)
token = json.loads(res.read().decode('utf-8'))['token']

# List all staff
print("=== ALL STAFF MEMBERS ===")
req_users = urllib.request.Request('http://localhost:3001/api/users', headers={'Authorization': f'Bearer {token}'})
users = json.loads(urllib.request.urlopen(req_users).read().decode('utf-8'))
for u in users:
    print(f"  [{u.get('employeeId','?')}] {u.get('fullName')} | {u.get('email')} | {u.get('role')} | ID: {u.get('id')}")

# List all patients
print("\n=== ALL PATIENTS ===")
req_patients = urllib.request.Request('http://localhost:3001/api/patients?limit=100', headers={'Authorization': f'Bearer {token}'})
patients = json.loads(urllib.request.urlopen(req_patients).read().decode('utf-8'))
if isinstance(patients, dict):
    patient_list = patients.get('data', patients.get('patients', []))
else:
    patient_list = patients
for p in patient_list:
    print(f"  [{p.get('uhid','?')}] {p.get('fullName')} | {p.get('phone')} | {p.get('gender')} | ID: {p.get('id')}")

# List all appointments
print("\n=== ALL APPOINTMENTS ===")
try:
    req_appts = urllib.request.Request('http://localhost:3001/api/appointments?limit=100', headers={'Authorization': f'Bearer {token}'})
    appts = json.loads(urllib.request.urlopen(req_appts).read().decode('utf-8'))
    if isinstance(appts, dict):
        appt_list = appts.get('data', appts.get('appointments', []))
    else:
        appt_list = appts
    for a in appt_list:
        print(f"  {a.get('id','?')[:8]}... | Patient: {a.get('patientName', a.get('patient', {}).get('fullName', '?'))} | Status: {a.get('status','?')}")
    if not appt_list:
        print("  (none)")
except Exception as e:
    print(f"  Error: {e}")

# Check audit logs count
print("\n=== AUDIT LOGS COUNT ===")
try:
    req_audit = urllib.request.Request('http://localhost:3001/api/audit-logs?page=1&limit=5', headers={'Authorization': f'Bearer {token}'})
    audit = json.loads(urllib.request.urlopen(req_audit).read().decode('utf-8'))
    print(f"  Total pages: {audit.get('totalPages','?')}, First page entries: {len(audit.get('data', []))}")
except Exception as e:
    print(f"  Error: {e}")
