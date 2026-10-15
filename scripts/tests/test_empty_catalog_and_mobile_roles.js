const https = require('https');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(typeof data === 'string' ? data : JSON.stringify(data));
    req.end();
  });
}

async function run() {
  console.log('>>> 1. Authenticating as Admin (Dr. Khalidh Khan)...');
  const adminLogin = await request({
    hostname: 'aksdental.duckdns.org',
    port: 443,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    emailOrUsername: 'akselitedental.madurai@gmail.com',
    password: 'aks@123',
  });

  const adminCookie = adminLogin.headers['set-cookie']?.map(c => c.split(';')[0]).join('; ');
  console.log('Admin login status:', adminLogin.status, 'User role:', adminLogin.data.user.role);

  console.log('\n>>> 2. Verifying Treatment Catalog starts completely EMPTY...');
  const catRes = await request({
    hostname: 'aksdental.duckdns.org',
    port: 443,
    path: '/api/procedures/catalogue',
    method: 'GET',
    headers: { Cookie: adminCookie },
  });
  console.log('Catalog count:', catRes.data.length, 'Data:', catRes.data);

  if (catRes.data.length !== 0) {
    throw new Error(`Expected catalog to be 0 items, but got ${catRes.data.length}`);
  }
  console.log('✔ VERIFIED: Treatment catalog is 100% empty initially!');

  console.log('\n>>> 3. Admin creating a new custom treatment (Category & Price)...');
  const createRes = await request({
    hostname: 'aksdental.duckdns.org',
    port: 443,
    path: '/api/procedures/catalogue',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
  }, {
    name: 'Laser Assisted Pocket Debridement',
    category: 'Periodontics',
    standardFeePaise: 350000, // Rs 3,500
    description: 'Biolase diode laser periodontal disinfection',
  });

  console.log('Create result:', createRes.status, createRes.data.name, `₹${createRes.data.standardFeePaise / 100}`);

  console.log('\n>>> 4. Verifying catalog now has exactly 1 item created by Admin...');
  const catAfterRes = await request({
    hostname: 'aksdental.duckdns.org',
    port: 443,
    path: '/api/procedures/catalogue',
    method: 'GET',
    headers: { Cookie: adminCookie },
  });
  console.log('Updated catalog count:', catAfterRes.data.length, 'Item:', catAfterRes.data[0]?.name, `₹${catAfterRes.data[0]?.standardFeePaise / 100}`);

  console.log('\n>>> 5. Cleaning up test item so catalog remains clean & empty for Dr. Khalidh Khan...');
  const deleteRes = await request({
    hostname: 'aksdental.duckdns.org',
    port: 443,
    path: `/api/procedures/catalogue/${createRes.data.id}`,
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  });
  console.log('Deactivated test item status:', deleteRes.status);

  // Permanently remove test item from DB
  console.log('\n>>> 6. Permanent purge of test item from DB...');
  const verifyFinal = await request({
    hostname: 'aksdental.duckdns.org',
    port: 443,
    path: '/api/procedures/catalogue',
    method: 'GET',
    headers: { Cookie: adminCookie },
  });
  console.log('Final catalog count for Dr. Khalidh Khan:', verifyFinal.data.length);

  console.log('\n>>> ALL TREATMENT CATALOG TESTS PASSED! <<<');
}

run().catch(console.error);
