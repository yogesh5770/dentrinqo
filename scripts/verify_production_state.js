const https = require('https');

async function testEndpoint() {
  console.log('Testing Production Authentication and Database State at https://aksdental.duckdns.org...');

  const loginData = JSON.stringify({
    emailOrUsername: 'akselitedental.madurai@gmail.com',
    password: 'aks@123',
  });

  const req = https.request('https://aksdental.duckdns.org/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginData),
    },
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('Login Status Code:', res.statusCode);
      const json = JSON.parse(body);
      console.log('Login Response:', JSON.stringify(json, null, 2));

      if (json.token) {
        checkMe(json.token);
      }
    });
  });

  req.on('error', (e) => console.error('Request error:', e));
  req.write(loginData);
  req.end();
}

function checkMe(token) {
  const req = https.request('https://aksdental.duckdns.org/api/auth/me', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('/auth/me Status:', res.statusCode);
      console.log('/auth/me Data:', JSON.stringify(JSON.parse(body), null, 2));
      checkStaff(token);
    });
  });
  req.end();
}

function checkStaff(token) {
  const req = https.request('https://aksdental.duckdns.org/api/users', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('/users Status:', res.statusCode);
      const staff = JSON.parse(body);
      console.log('Total Staff Members in DB:', Array.isArray(staff) ? staff.length : staff);
      console.log('Staff list:', JSON.stringify(staff, null, 2));
      checkPatients(token);
    });
  });
  req.end();
}

function checkPatients(token) {
  const req = https.request('https://aksdental.duckdns.org/api/patients', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('/patients Status:', res.statusCode);
      const patients = JSON.parse(body);
      console.log('Total Patients in DB:', Array.isArray(patients) ? patients.length : patients);
      console.log('Patients list:', JSON.stringify(patients, null, 2));
      testOldLogins();
    });
  });
  req.end();
}

function testOldLogins() {
  console.log('\nVerifying that old dummy accounts are rejected (401 Unauthorized)...');
  const dummyAccounts = [
    { id: 'aksdental@gmail.com', pass: 'aks@123' },
    { id: 'reception01', pass: 'Reception@12345' },
    { id: 'dentist01', pass: 'Dentist@12345' },
  ];

  dummyAccounts.forEach(acc => {
    const postData = JSON.stringify({ emailOrUsername: acc.id, password: acc.pass });
    const req = https.request('https://aksdental.duckdns.org/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      console.log(`Testing old login [${acc.id}] -> Status: ${res.statusCode} (Expected: 401)`);
    });
    req.write(postData);
    req.end();
  });
}

testEndpoint();
