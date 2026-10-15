import urllib.request
import json
import urllib.error

login_data = json.dumps({'email': 'akselitedental.madurai@gmail.com', 'password': 'aks@123'}).encode('utf-8')
req = urllib.request.Request('http://localhost:3001/api/auth/login', data=login_data, headers={'Content-Type': 'application/json'})
res = urllib.request.urlopen(req)
token = json.loads(res.read().decode('utf-8'))['token']

headers = {'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'}

# 1. Delete test staff members (keep only admin)
test_staff_ids = [
    '4d68fd52-30c0-4d3d-96da-c715cadd8890',  # M. Priya (test)
    'a8ecdf86-4cf2-443b-b38b-c7fc29f225e1',  # Dr. Kavitha Ramesh (test)
]

for sid in test_staff_ids:
    try:
        req_del = urllib.request.Request(f'http://localhost:3001/api/users/{sid}', method='DELETE', headers=headers)
        urllib.request.urlopen(req_del)
        print(f'Deleted staff: {sid}')
    except urllib.error.HTTPError as e:
        print(f'Staff delete {sid}: HTTP {e.code} - {e.read().decode("utf-8")}')

# 2. Delete test patients
test_patient_ids = [
    '27208b17-6892-472c-8b02-a65de3f96bf0',  # Rajesh Kumar (test)
    'b8e7d14f-ee98-48f8-8c2e-f0b7b2a6524c',  # Meena Sundaram (test)
]

for pid in test_patient_ids:
    try:
        req_del = urllib.request.Request(f'http://localhost:3001/api/patients/{pid}', method='DELETE', headers=headers)
        urllib.request.urlopen(req_del)
        print(f'Deleted patient: {pid}')
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        print(f'Patient delete {pid}: HTTP {e.code} - {body}')

# 3. Verify clean state
print('\n=== REMAINING STAFF ===')
req_users = urllib.request.Request('http://localhost:3001/api/users', headers=headers)
users = json.loads(urllib.request.urlopen(req_users).read().decode('utf-8'))
for u in users:
    print(f"  [{u.get('employeeId','?')}] {u.get('fullName')} | {u.get('email')} | {u.get('role')}")

print('\n=== REMAINING PATIENTS ===')
req_patients = urllib.request.Request('http://localhost:3001/api/patients?limit=100', headers=headers)
patients = json.loads(urllib.request.urlopen(req_patients).read().decode('utf-8'))
patient_list = patients.get('data', patients.get('patients', [])) if isinstance(patients, dict) else patients
for p in patient_list:
    print(f"  [{p.get('uhid','?')}] {p.get('fullName')}")
if not patient_list:
    print("  (none - clean)")
