// Live verification of AKSDENTAL@GMAIL.COM / aks@123, Staff Provisioning, WhatsApp Share & Password Change
const VPS_URL = 'http://13.201.121.18';

async function testStaffAndWhatsApp() {
  console.log(`======================================================================`);
  console.log(`Testing Live AKS Elite Dental System at: ${VPS_URL}`);
  console.log(`======================================================================\n`);

  // 1. Login with requested credentials: AKSDENTAL@GMAIL.COM / aks@123
  console.log('>>> [1/5] Testing Login as Hospital Admin: AKSDENTAL@GMAIL.COM / aks@123...');
  const adminLoginRes = await fetch(`${VPS_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      emailOrUsername: 'AKSDENTAL@GMAIL.COM',
      password: 'aks@123',
    }),
  });

  if (!adminLoginRes.ok) {
    throw new Error(`Admin login failed: ${adminLoginRes.status} ${await adminLoginRes.text()}`);
  }

  const adminAuth = await adminLoginRes.json();
  console.log('✅ Admin Login Succeeded!');
  console.log('Admin User:', adminAuth.user.fullName, `(${adminAuth.user.role})`);
  console.log('Email:', adminAuth.user.email);
  const adminToken = adminAuth.token;

  // 2. Admin Provisions a New Staff Member (Receptionist)
  console.log('\n>>> [2/5] Admin provisions a new staff member with WhatsApp credentials...');
  const newStaffEmail = `reception.staff.${Date.now()}@akselitedental.com`;
  const createStaffRes = await fetch(`${VPS_URL}/api/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fullName: 'Kavitha R.',
      phone: '+91 98401 77889',
      email: newStaffEmail,
      role: 'RECEPTIONIST',
      designation: 'Senior Front Desk Executive',
      department: 'Front Office',
      employeeId: 'AKS-EMP-009',
    }),
  });

  if (!createStaffRes.ok) {
    throw new Error(`Staff creation failed: ${createStaffRes.status} ${await createStaffRes.text()}`);
  }

  const createdStaff = await createStaffRes.json();
  console.log('✅ Staff Account Successfully Created in PostgreSQL on VPS SSD:');
  console.log('Name:', createdStaff.staff.fullName);
  console.log('Role:', createdStaff.staff.role);
  console.log('Email:', createdStaff.staff.email);
  console.log('Generated Temporary Password:', createdStaff.temporaryPassword);
  console.log('Clean Phone:', createdStaff.cleanPhone);
  console.log('WhatsApp Direct Click-to-Chat URL:', createdStaff.whatsappUrl);
  console.log('\nGenerated WhatsApp Message:\n' + createdStaff.whatsappText);

  // 3. New Staff Logs in with Generated Temporary Password
  console.log('\n>>> [3/5] New staff member logs in using generated temporary password...');
  const staffLoginRes = await fetch(`${VPS_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      emailOrUsername: newStaffEmail,
      password: createdStaff.temporaryPassword,
    }),
  });

  if (!staffLoginRes.ok) {
    throw new Error(`Staff login with temp password failed: ${staffLoginRes.status} ${await staffLoginRes.text()}`);
  }

  const staffAuth = await staffLoginRes.json();
  console.log('✅ Staff Login Succeeded with Temporary Password!');
  console.log('Must Change Password Flag:', staffAuth.user.mustChangePassword);
  const staffToken = staffAuth.token;

  // 4. Staff Changes Password in Dashboard using Old Password
  console.log('\n>>> [4/5] Staff changes password using old (temporary) password in dashboard...');
  const newPermanentPassword = 'KavithaSecurePass@2026';
  const changePassRes = await fetch(`${VPS_URL}/api/auth/change-password`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${staffToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      currentPassword: createdStaff.temporaryPassword,
      newPassword: newPermanentPassword,
    }),
  });

  if (!changePassRes.ok) {
    throw new Error(`Change password failed: ${changePassRes.status} ${await changePassRes.text()}`);
  }

  const changePassData = await changePassRes.json();
  console.log('✅ Password Changed Successfully:', changePassData.message);

  // 5. Staff Logs in with New Permanent Password
  console.log('\n>>> [5/5] Staff logs in with NEW permanent password...');
  const reLoginRes = await fetch(`${VPS_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      emailOrUsername: newStaffEmail,
      password: newPermanentPassword,
    }),
  });

  if (!reLoginRes.ok) {
    throw new Error(`Re-login with new password failed: ${reLoginRes.status} ${await reLoginRes.text()}`);
  }

  const reLoginAuth = await reLoginRes.json();
  console.log('✅ Staff Re-Login Succeeded with New Permanent Password!');
  console.log('Must Change Password Flag:', reLoginAuth.user.mustChangePassword);

  console.log('\n======================================================================');
  console.log('🎉 ALL REQUIREMENTS VERIFIED END-TO-END ON LIVE PRODUCTION VPS!');
  console.log('======================================================================');
}

testStaffAndWhatsApp().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
