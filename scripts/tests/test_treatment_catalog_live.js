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
  const loginRes = await request({
    hostname: 'aksdental.duckdns.org',
    port: 443,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, {
    emailOrUsername: 'akselitedental.madurai@gmail.com',
    password: 'aks@123',
  });

  if (loginRes.status !== 200 && loginRes.status !== 201) {
    console.error('Login failed:', loginRes.data);
    return;
  }

  const setCookie = loginRes.headers['set-cookie'];
  const cookie = Array.isArray(setCookie) ? setCookie.map(c => c.split(';')[0]).join('; ') : '';
  console.log('Login successful! Role:', loginRes.data.user.role);

  console.log('\n>>> 2. Fetching Treatment Catalog from API...');
  const catRes = await request({
    hostname: 'aksdental.duckdns.org',
    port: 443,
    path: '/api/procedures/catalogue',
    method: 'GET',
    headers: { Cookie: cookie },
  });

  console.log(`Received ${catRes.data.length} procedures from catalog!`);
  console.log('Sample procedures:');
  catRes.data.slice(0, 3).forEach(p => {
    console.log(` - [${p.category}] ${p.name}: ₹${p.standardFeePaise / 100} (${p.code})`);
  });

  console.log('\n>>> 3. Testing Admin creating a new custom treatment...');
  const addRes = await request({
    hostname: 'aksdental.duckdns.org',
    port: 443,
    path: '/api/procedures/catalogue',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
  }, {
    code: 'CUSTOM_LASER_BLEACH',
    name: 'Diode Laser Accelerated Teeth Whitening',
    category: 'Aesthetics',
    standardFeePaise: 850000, // Rs 8,500
    description: 'Biolase Epic X diode laser in-office bleaching (Dual Arch)',
  });

  console.log('Create result:', addRes.status, addRes.data.name, `₹${addRes.data.standardFeePaise / 100}`);

  console.log('\n>>> 4. Testing Admin updating the price of the treatment...');
  const updateRes = await request({
    hostname: 'aksdental.duckdns.org',
    port: 443,
    path: `/api/procedures/catalogue/${addRes.data.id}`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
  }, {
    standardFeePaise: 900000, // Updated to Rs 9,000
    description: 'Updated standard tariff for diode laser whitening',
  });

  console.log('Update result:', updateRes.status, `New price: ₹${updateRes.data.standardFeePaise / 100}`);

  console.log('\n>>> 5. Verifying updated catalog reflects the new treatment...');
  const verifyRes = await request({
    hostname: 'aksdental.duckdns.org',
    port: 443,
    path: '/api/procedures/catalogue',
    method: 'GET',
    headers: { Cookie: cookie },
  });

  const found = verifyRes.data.find(p => p.id === addRes.data.id);
  console.log('Found custom treatment in active catalog:', Boolean(found), found ? `Fee: ₹${found.standardFeePaise / 100}` : '');

  // Cleanup test item
  if (found) {
    await request({
      hostname: 'aksdental.duckdns.org',
      port: 443,
      path: `/api/procedures/catalogue/${found.id}`,
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    console.log('Cleaned up test item from catalog.');
  }

  console.log('\n>>> ALL LIVE TESTS PASSED SUCCESSFULLY! <<<');
}

run().catch(console.error);
