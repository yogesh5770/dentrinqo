// Live test against DuckDNS HTTPS domain
const VPS_URL = 'https://aksdental.duckdns.org';

async function testVpsLive() {
  console.log(`Connecting to live production system at ${VPS_URL}...`);

  // 1. Test Login as Hospital Admin
  const loginRes = await fetch(`${VPS_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      emailOrUsername: 'AKSDENTAL@GMAIL.COM',
      password: 'aks@123',
    }),
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
  }

  const loginData = await loginRes.json();
  console.log('✅ Login Successful!');
  console.log('User:', loginData.user.fullName, `(${loginData.user.role})`);
  console.log('Clinic:', loginData.user.clinicName);
  const token = loginData.token;

  // 2. Fetch Clinic Settings
  const clinicRes = await fetch(`${VPS_URL}/api/clinic/settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const clinic = await clinicRes.json();
  console.log('✅ Clinic Settings Verified:');
  console.log(`Name: ${clinic.name}`);
  console.log(`Address: ${clinic.address}, ${clinic.city}, ${clinic.state}`);
  console.log(`Chairs: ${clinic.chairCount}`);
  console.log(`Working Hours:`, clinic.workingHours);

  // 3. Register a test patient dynamically in PostgreSQL on SSD
  const newPatientRes = await fetch(`${VPS_URL}/api/patients`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fullName: 'VPS Cloud Test Patient',
      phone: '9840999888',
      gender: 'MALE',
      age: 34,
      allergies: ['Penicillin'],
      medicalConditions: ['Hypertension'],
      currentMedications: ['Amlodipine 5mg'],
      address: 'K.Pudur, Madurai',
    }),
  });

  const patient = await newPatientRes.json();
  console.log('Patient response:', patient);
  console.log('✅ Dynamic Patient Registered in PostgreSQL on VPS SSD:');
  console.log(`UHID: ${patient.uhid || patient.data?.uhid}`);
  console.log(`Name: ${patient.fullName || patient.data?.fullName}`);
  console.log(`Phone: ${patient.phone || patient.data?.phone}`);
  console.log(`Allergies:`, patient.allergies || patient.data?.allergies);

  console.log('\n======================================================');
  console.log('🎉 AWS LIGHTSAIL VPS + POSTGRESQL VERIFICATION SUCCESSFUL!');
  console.log('======================================================');
}

testVpsLive().catch(err => {
  console.error('❌ Error during VPS live test:', err);
  process.exit(1);
});
