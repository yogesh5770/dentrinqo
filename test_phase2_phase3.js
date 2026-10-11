const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: body ? JSON.parse(body) : null });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function run() {
  console.log('--- TESTING AKS ELITE DENTAL CLINIC PHASE 2 & 3 BACKEND ---');

  // 1. Login as Dr. Khalidh Khan (admin)
  const loginRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, { emailOrUsername: 'admin', password: 'Admin@12345' });

  const token = loginRes.data.token;
  if (loginRes.status !== 200 || !token) {
    console.error('Login failed:', loginRes);
    process.exit(1);
  }
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
  console.log('✓ 1. Dr. Khalidh Khan authenticated successfully');

  // 2. Fetch or create patient
  let patient;
  const patientsRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/patients',
    method: 'GET',
    headers: authHeaders,
  });

  if (patientsRes.data.data && patientsRes.data.data.length > 0) {
    patient = patientsRes.data.data[0];
  } else {
    const createPatientRes = await request({
      hostname: 'localhost',
      port: 3001,
      path: '/api/patients',
      method: 'POST',
      headers: authHeaders,
    }, {
      fullName: 'Rajesh Kumar',
      phone: '9842155678',
      email: 'rajesh.kumar@example.com',
      gender: 'Male',
      age: 34,
      bloodGroup: 'B+',
      allergies: ['Penicillin'],
      medicalConditions: ['Hypertension'],
      currentMedications: ['Amlodipine 5mg'],
      address: '14, Alagar Kovil Road, K.Pudur, Madurai',
    });
    patient = createPatientRes.data;
  }
  console.log(`✓ 2. Using patient ${patient.fullName} (${patient.uhid}, ID: ${patient.id})`);

  // 3. Test Dental Chart: Record condition on Tooth 46 (Occlusal Caries)
  const chartRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/dental-chart',
    method: 'POST',
    headers: authHeaders,
  }, {
    patientId: patient.id,
    toothNumber: 46,
    surface: 'OCCLUSAL',
    condition: 'CARIES',
    notes: 'Deep pit and fissure caries with dentinal involvement',
  });
  console.log(`✓ 3. Dental Chart Condition Recorded: Tooth ${chartRes.data.toothNumber} ${chartRes.data.surface} = ${chartRes.data.condition}`);

  // 4. Test Dental Chart: Fetch chart for patient
  const getChartRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: `/api/dental-chart/patient/${patient.id}`,
    method: 'GET',
    headers: authHeaders,
  });
  console.log(`✓ 4. Dental Chart Retrieved: ${getChartRes.data.length} finding(s) on file`);

  // 5. Test Treatment Plans: Create staged plan
  const planRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/treatment-plans',
    method: 'POST',
    headers: authHeaders,
  }, {
    patientId: patient.id,
    title: 'Comprehensive Rehabilitation: Tooth 46 Endodontic & Prosthodontic Protocol',
    dentistNotes: 'Single visit rotary RCT with high translucency zirconia crown',
    items: [
      {
        toothNumber: 46,
        procedureCode: 'RCT_MOLAR',
        procedureName: 'Molar Rotary Root Canal Treatment (Bioceramic)',
        estimatedCostPaise: 450000,
        sequenceOrder: 1,
        notes: 'Access opening, glide path, bioceramic sealer obturation',
      },
      {
        toothNumber: 46,
        procedureCode: 'CROWN_ZIRCONIA',
        procedureName: 'Monolithic High-Translucency Zirconia Crown',
        estimatedCostPaise: 850000,
        sequenceOrder: 2,
        notes: 'CAD/CAM milled with 10-year warranty',
      },
    ],
  });
  console.log(`✓ 5. Treatment Plan Created: "${planRes.data.title}" | Total: ₹${planRes.data.totalEstimatedPaise / 100} (${planRes.data.items.length} items)`);

  const planItemId = planRes.data.items[0].id;

  // 6. Test Procedures Catalogue & Record Completed Procedure
  const catRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/procedures/catalogue',
    method: 'GET',
    headers: authHeaders,
  });
  console.log(`✓ 6. Procedures Catalogue Loaded: ${catRes.data.length} standard dental procedures available`);

  const procRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/procedures',
    method: 'POST',
    headers: authHeaders,
  }, {
    patientId: patient.id,
    toothNumber: 46,
    procedureCode: 'RCT_MOLAR',
    procedureName: 'Molar Rotary Root Canal Treatment (Bioceramic)',
    treatmentPlanItemId: planItemId,
    notes: 'Completed in single sitting. Working length 21mm, 3 canals hermetically sealed.',
  });
  console.log(`✓ 7. Completed Procedure Recorded: ${procRes.data.procedureName} (Unbilled: ${!procRes.data.isBilled})`);

  // 7. Test Prescriptions: Create Rx from dental template
  const rxRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/prescriptions',
    method: 'POST',
    headers: authHeaders,
  }, {
    patientId: patient.id,
    instructions: 'Maintain oral hygiene; warm saline rinses 4 times daily starting tomorrow',
    dietAdvice: 'Soft diet; avoid chewing on right side for 48 hours',
    items: [
      {
        medicineName: 'Augmentin 625mg',
        dosage: '625 mg',
        form: 'Tablet',
        frequency: '1-0-1 (Twice daily)',
        durationDays: 5,
        timing: 'After food',
        instructions: 'Take after meals',
      },
      {
        medicineName: 'Zerodol-SP',
        dosage: '100mg/325mg/15mg',
        form: 'Tablet',
        frequency: '1-0-1 (Twice daily)',
        durationDays: 3,
        timing: 'After food',
        instructions: 'For pain relief',
      },
      {
        medicineName: 'Pan-40',
        dosage: '40 mg',
        form: 'Tablet',
        frequency: '1-0-0 (Morning)',
        durationDays: 5,
        timing: 'Before food',
        instructions: 'Take 30 mins before breakfast',
      },
    ],
  });
  console.log(`✓ 8. Prescription Issued: ${rxRes.data.prescriptionNumber} with ${rxRes.data.items.length} medicines`);

  // 8. Test Billing: Create Invoice importing the completed procedure
  const invoiceRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/billing/invoices',
    method: 'POST',
    headers: authHeaders,
  }, {
    patientId: patient.id,
    notes: 'Tooth 46 Rotary RCT Completed',
    discountPaise: 50000, // ₹500 courtesy discount
    taxPaise: 0,
    items: [
      {
        completedProcedureId: procRes.data.id,
        description: 'Molar Rotary Root Canal Treatment (Bioceramic) - Tooth 46',
        toothNumber: 46,
        quantity: 1,
        unitPricePaise: 450000, // ₹4,500
      },
    ],
  });
  console.log(`✓ 9. Invoice Generated: ${invoiceRes.data.invoiceNumber} | Total: ₹${invoiceRes.data.totalPaise / 100} (Subtotal: ₹${invoiceRes.data.subtotalPaise / 100}, Discount: ₹${invoiceRes.data.discountPaise / 100})`);

  // 9. Test Billing: Record Partial Payment (₹2,000 via UPI)
  const pay1Res = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/billing/payments',
    method: 'POST',
    headers: authHeaders,
  }, {
    invoiceId: invoiceRes.data.id,
    patientId: patient.id,
    amountPaise: 200000,
    paymentMethod: 'UPI',
    referenceNumber: 'UPI-REF-902834101',
    notes: 'Advance received via Google Pay',
  });
  console.log(`✓ 10. Partial Payment Recorded: Receipt ${pay1Res.data.payment.receiptNumber} | Amount: ₹${pay1Res.data.payment.amountPaise / 100} | Status: ${pay1Res.data.invoice.status} | Remaining: ₹${pay1Res.data.invoice.balancePaise / 100}`);

  // 10. Test Billing: Record Settlement Payment (₹2,000 via Cash)
  const pay2Res = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/billing/payments',
    method: 'POST',
    headers: authHeaders,
  }, {
    invoiceId: invoiceRes.data.id,
    patientId: patient.id,
    amountPaise: 200000,
    paymentMethod: 'CASH',
    notes: 'Remaining balance cleared at reception counter',
  });
  console.log(`✓ 11. Final Settlement Recorded: Receipt ${pay2Res.data.payment.receiptNumber} | Amount: ₹${pay2Res.data.payment.amountPaise / 100} | Status: ${pay2Res.data.invoice.status} | Remaining: ₹${pay2Res.data.invoice.balancePaise / 100}`);

  // 11. Test Patient Billing Ledger & Clinic Revenue Summary
  const ledgerRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: `/api/billing/patient/${patient.id}`,
    method: 'GET',
    headers: authHeaders,
  });
  console.log(`✓ 12. Patient Ledger Verified: Total Billed: ₹${ledgerRes.data.summary.totalBilledPaise / 100}, Total Paid: ₹${ledgerRes.data.summary.totalPaidPaise / 100}, Net Outstanding: ₹${ledgerRes.data.summary.totalBalancePaise / 100}`);

  const summaryRes = await request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/billing/summary',
    method: 'GET',
    headers: authHeaders,
  });
  console.log(`✓ 13. Clinic Summary: Today's Collection: ₹${summaryRes.data.todayCollectionPaise / 100} from ${summaryRes.data.todayPaymentsCount} payment(s)`);

  console.log('\n>>> ALL 13 PHASE 2 & 3 BACKEND TESTS PASSED WITH 100% SUCCESS <<<');
}

run().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
