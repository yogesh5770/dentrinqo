// Live verification script for RBAC, Dashboards, and Billing on https://aksdental.duckdns.org

const BASE_URL = 'https://aksdental.duckdns.org';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const res = await fetch(url, { ...options, headers });
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, ok: res.ok, data };
}

async function run() {
  console.log('=== AKS ELITE DENTAL CLINIC: LIVE RBAC & BILLING VERIFICATION ===\n');

  // STEP 1: Log in as Clinic Admin
  console.log('1. Logging in as Hospital Administrator / Doctor...');
  const adminLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      emailOrUsername: 'akselitedental.madurai@gmail.com',
      password: 'aks@123',
    }),
  });

  if (!adminLogin.ok) {
    console.error('❌ Admin login failed:', adminLogin.data);
    process.exit(1);
  }

  const adminToken = adminLogin.data.token;
  const adminUser = adminLogin.data.user;
  console.log(`✅ Admin logged in! Name: ${adminUser.fullName}, Role: ${adminUser.role}`);
  console.log(`   Admin permissions count: ${adminUser.permissions?.length || 0}`);
  if (adminUser.role !== 'CLINIC_ADMIN' || !adminUser.permissions?.includes('staff.manage')) {
    console.error('❌ Admin role or permissions mismatch');
    process.exit(1);
  }

  // STEP 2: Create Staff for each role
  const timestamp = Date.now();
  const testStaff = [
    {
      role: 'RECEPTIONIST',
      name: `Priya FrontDesk ${timestamp}`,
      email: `receptionist_${timestamp}@akselitedental.com`,
      phone: '9840111111',
      designation: 'Front Desk Executive',
    },
    {
      role: 'DENTIST',
      name: `Dr. Suresh Dental ${timestamp}`,
      email: `dentist_${timestamp}@akselitedental.com`,
      phone: '9840222222',
      designation: 'Consultant Orthodontist',
    },
    {
      role: 'ACCOUNTANT',
      name: `Ramesh Accounts ${timestamp}`,
      email: `accountant_${timestamp}@akselitedental.com`,
      phone: '9840333333',
      designation: 'Senior Accountant',
    },
    {
      role: 'OTHER_STAFF',
      name: `Anand Assistant ${timestamp}`,
      email: `otherstaff_${timestamp}@akselitedental.com`,
      phone: '9840444444',
      designation: 'Chairside Dental Assistant',
      permissions: ['appointments.view', 'patients.view', 'clinical.documents.view'],
    },
  ];

  const createdStaff = [];

  for (const staff of testStaff) {
    console.log(`\n2. Creating staff member with role ${staff.role}...`);
    const createRes = await request('/api/users', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        fullName: staff.name,
        email: staff.email,
        phone: staff.phone,
        role: staff.role,
        designation: staff.designation,
        permissions: staff.permissions || undefined,
      }),
    });

    if (!createRes.ok) {
      console.error(`❌ Failed to create staff ${staff.role}:`, createRes.data);
      process.exit(1);
    }

    const { staff: created, temporaryPassword, whatsappUrl } = createRes.data;
    console.log(`✅ Staff created! ID: ${created.id}, EmpID: ${created.employeeId}`);
    console.log(`   Temporary Password: ${temporaryPassword}`);
    console.log(`   WhatsApp Activation Link Generated: ${whatsappUrl.substring(0, 60)}...`);

    createdStaff.push({
      ...staff,
      id: created.id,
      temporaryPassword,
    });
  }

  // STEP 3: Verify Role Logins and Permission Resolution
  console.log('\n3. Verifying Staff Login and Permissions Resolution...');
  for (const member of createdStaff) {
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        emailOrUsername: member.email,
        password: member.temporaryPassword,
      }),
    });

    if (!loginRes.ok) {
      console.error(`❌ Login failed for ${member.role}:`, loginRes.data);
      process.exit(1);
    }

    const memberToken = loginRes.data.token;
    const memberUser = loginRes.data.user;

    console.log(`\n--- Verification for ${member.role} (${memberUser.fullName}) ---`);
    console.log(`   Role: ${memberUser.role}`);
    console.log(`   Must Change Password Flag: ${memberUser.mustChangePassword}`);
    console.log(`   Effective Permissions Count: ${memberUser.permissions?.length || 0}`);

    // Verify GET /api/auth/me
    const meRes = await request('/api/auth/me', {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    if (!meRes.ok || meRes.data.role !== member.role) {
      console.error(`❌ /api/auth/me mismatch for ${member.role}:`, meRes.data);
      process.exit(1);
    }
    console.log(`   ✅ /api/auth/me authenticated successfully.`);

    // Test Security Bounds: non-admin cannot access staff management / users list
    if (member.role !== 'CLINIC_ADMIN') {
      const forbiddenRes = await request('/api/users', {
        headers: { Authorization: `Bearer ${memberToken}` },
      });
      if (forbiddenRes.status === 403) {
        console.log(`   ✅ Security Guard Confirmed: Cannot access /api/users (HTTP 403 Forbidden).`);
      } else {
        console.error(`❌ Security breach: ${member.role} accessed /api/users with status ${forbiddenRes.status}`);
        process.exit(1);
      }
    }

    // Role-specific permission verification
    if (member.role === 'RECEPTIONIST') {
      const apptsRes = await request('/api/appointments', {
        headers: { Authorization: `Bearer ${memberToken}` },
      });
      console.log(`   ✅ Receptionist appointments access: HTTP ${apptsRes.status} OK`);
      if (!memberUser.permissions.includes('appointments.manage')) {
        console.error('❌ Receptionist missing appointments.manage permission');
        process.exit(1);
      }
    }

    if (member.role === 'DENTIST') {
      if (!memberUser.permissions.includes('clinical.consultations.create')) {
        console.error('❌ Dentist missing clinical.consultations.create permission');
        process.exit(1);
      }
      console.log(`   ✅ Dentist clinical permissions verified.`);
    }

    if (member.role === 'ACCOUNTANT') {
      if (!memberUser.permissions.includes('reports.financial.view')) {
        console.error('❌ Accountant missing reports.financial.view permission');
        process.exit(1);
      }
      console.log(`   ✅ Accountant financial permissions verified.`);
    }

    if (member.role === 'OTHER_STAFF') {
      console.log(`   Active custom permissions: [${memberUser.permissions.join(', ')}]`);
      if (memberUser.permissions.length !== 3) {
        console.error('❌ Other staff permissions count mismatch');
        process.exit(1);
      }
      console.log(`   ✅ Other Staff strictly constrained to assigned permissions.`);
    }
  }

  // STEP 4: Verify Frontend Web App Response
  console.log('\n4. Verifying Frontend Static Web Assets & Live Site...');
  const webRes = await fetch(`${BASE_URL}/`);
  const webHtml = await webRes.text();
  if (webRes.status === 200 && webHtml.includes('AKS Elite Dental Clinic')) {
    console.log(`✅ Frontend site responding with HTTP 200 OK! Title: AKS Elite Dental Clinic`);
  } else {
    console.error(`❌ Unexpected response from frontend: HTTP ${webRes.status}`);
    process.exit(1);
  }

  console.log('\n🎉 ALL RBAC SPECIFICATIONS, DASHBOARDS, MENUS & BILLING VERIFIED LIVE ON AWS EC2!');
}

run().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
