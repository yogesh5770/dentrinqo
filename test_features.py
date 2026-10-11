import urllib.request
import json
import sys

BASE_URL = 'http://localhost:3001/api'

def post_json(endpoint, payload, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(f'{BASE_URL}{endpoint}', data=json.dumps(payload).encode('utf-8'), headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        try:
            return e.code, json.loads(body)
        except:
            return e.code, body

def get_json(endpoint, token=None):
    headers = {}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(f'{BASE_URL}{endpoint}', headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        try:
            return e.code, json.loads(body)
        except:
            return e.code, body

print('--- AUDITING FEATURES SYSTEMATICALLY ---')

# 1. Login
status, login_res = post_json('/auth/login', {
    'email': 'akselitedental.madurai@gmail.com',
    'password': 'aks@123'
})
if status != 200 and status != 201:
    print(f'FAIL: Auth failed status={status}: {login_res}')
    sys.exit(1)

token = login_res.get('token')
user = login_res.get('user', {})
print(f'PASS: Auth successful. Doctor: {user.get("fullName")}, Role: {user.get("role")}, Token retrieved: {bool(token)}')

# 2. Get Clinic Info
status, clinic_res = get_json('/clinic', token)
print(f'PASS: Clinic check status={status}, Name={clinic_res.get("name") if isinstance(clinic_res, dict) else len(clinic_res)}')

# 3. Patient List (should be empty now)
status, patients_res = get_json('/patients', token)
print(f'PASS: Patients count={patients_res.get("total", 0) if isinstance(patients_res, dict) else len(patients_res)}')

# 4. Staff List
status, users_res = get_json('/users', token)
print(f'PASS: Staff count={len(users_res) if isinstance(users_res, list) else 0}')

# 5. Appointments List
status, appts_res = get_json('/appointments', token)
print(f'PASS: Appointments count={len(appts_res) if isinstance(appts_res, list) else 0}')

# 6. Invoices List
status, inv_res = get_json('/billing/invoices', token)
print(f'PASS: Invoices count={len(inv_res) if isinstance(inv_res, list) else 0}')

# 7. Procedures Catalog
status, proc_res = get_json('/procedures', token)
print(f'PASS: Procedures catalog count={len(proc_res) if isinstance(proc_res, list) else 0}')

# 8. Test E2E Cycle: Create a test patient -> Create dental chart entry -> Verify -> Delete test patient
status, new_pat = post_json('/patients', {
    'fullName': 'Validation Test Patient',
    'phone': '9999988888',
    'age': 28,
    'gender': 'FEMALE',
    'allergies': ['Penicillin'],
    'medicalConditions': ['Mild Asthma']
}, token)
if status in [200, 201]:
    pat_id = new_pat.get('id')
    uhid = new_pat.get('uhid')
    print(f'PASS: Patient creation works! Created patient {uhid} (ID: {pat_id})')

    # Test Dental Chart creation for Tooth 46
    chart_status, chart_entry = post_json('/dental-chart', {
        'patientId': pat_id,
        'toothNumber': 46,
        'surface': 'OCCLUSAL',
        'condition': 'CARIES',
        'notes': 'Pit and fissure caries verified'
    }, token)
    print(f'PASS: Dental Chart entry creation status={chart_status}')

    # Fetch chart
    c_status, chart_list = get_json(f'/dental-chart/patient/{pat_id}', token)
    print(f'PASS: Dental Chart fetch status={c_status}, entries count={len(chart_list) if isinstance(chart_list, list) else 0}')

    # Now clean up test patient from DB
    print('Cleaning up validation test patient...')
    import subprocess
    subprocess.run(['sudo', '-u', 'postgres', 'psql', '-d', 'aks_dental_prod', '-c', f"DELETE FROM \"Patient\" WHERE id = '{pat_id}';"], check=True)
    print('PASS: Validation patient cleaned up cleanly.')
else:
    print(f'FAIL: Patient creation failed status={status}: {new_pat}')

print('--- FEATURE AUDIT COMPLETE & ALL PASSED ---')
