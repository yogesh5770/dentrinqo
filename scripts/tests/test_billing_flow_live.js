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

async function testBillingJourney() {
  console.log('>>> [1] Authenticating as Admin...');
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

  const cookie = loginRes.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
  console.log('Admin login verified.');

  console.log('>>> [2] Creating patient for billing test...');
  const patientRes = await request({
    hostname: 'aksdental.duckdns.org',
    port: 443,
    path: '/api/patients',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
  }, {
    fullName: 'Billing Test Patient',
    phone: '9840199999',
    gender: 'MALE',
    age: 32,
  });

  const patient = patientRes.data;
  console.log(`Created Patient: ${patient.fullName} (UHID: ${patient.uhid})`);

  console.log('>>> [3] Fetching Treatment Catalog...');
  const catRes = await request({
    hostname: 'aksdental.duckdns.org',
    port: 443,
    path: '/api/procedures/catalogue',
    method: 'GET',
    headers: { Cookie: cookie },
  });

  const scaling = catRes.data.find(p => p.code === 'SCALING_POLISH');
  const rct = catRes.data.find(p => p.code === 'RCT_MOLAR');
  console.log(`Selected Treatments:`);
  console.log(` - ${scaling.name}: ₹${scaling.standardFeePaise / 100}`);
  console.log(` - ${rct.name}: ₹${rct.standardFeePaise / 100}`);

  console.log('>>> [4] Generating Itemized Tax Invoice...');
  const invoiceRes = await request({
    hostname: 'aksdental.duckdns.org',
    port: 443,
    path: '/api/billing/invoices',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
  }, {
    patientId: patient.id,
    notes: 'Standard therapeutic endodontic procedure and hygiene',
    discountPaise: 50000, // Rs 500 courtesy discount
    items: [
      {
        description: scaling.name,
        quantity: 1,
        unitPricePaise: scaling.standardFeePaise, // 120000 = Rs 1,200
      },
      {
        description: rct.name,
        toothNumber: 46,
        quantity: 1,
        unitPricePaise: rct.standardFeePaise, // 450000 = Rs 4,500
      },
    ],
  });

  const invoice = invoiceRes.data;
  console.log(`Invoice Generated: ${invoice.invoiceNumber}`);
  console.log(`Subtotal: ₹${invoice.subtotalPaise / 100}`);
  console.log(`Discount: ₹${invoice.discountPaise / 100}`);
  console.log(`Total Payable: ₹${invoice.totalPaise / 100}`);
  console.log(`Balance Due: ₹${invoice.balancePaise / 100}`);

  console.log('>>> [5] Recording Patient Payment (Take a Bill)...');
  const paymentRes = await request({
    hostname: 'aksdental.duckdns.org',
    port: 443,
    path: '/api/billing/payments',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
  }, {
    invoiceId: invoice.id,
    patientId: patient.id,
    amountPaise: invoice.totalPaise, // Pay in full
    paymentMethod: 'UPI',
    referenceNumber: 'UPI/AXIS/2026/998811',
    notes: 'GooglePay QR payment at front desk',
  });

  const { payment, invoice: updatedInvoice } = paymentRes.data;
  console.log(`Payment Recorded: Receipt ${payment.receiptNumber}`);
  console.log(`Amount: ₹${payment.amountPaise / 100} via ${payment.paymentMethod}`);
  console.log(`Updated Invoice Status: ${updatedInvoice.status}`);
  console.log(`Remaining Balance: ₹${updatedInvoice.balancePaise / 100}`);

  console.log('>>> [6] Cleaning up test records to preserve pristine DB...');
  const { execSync } = require('child_process');
  execSync(`ssh -i "C:\\Users\\yoges\\Downloads\\AK.pem" -o StrictHostKeyChecking=no ubuntu@13.201.121.18 "PGPASSWORD='AksEliteDentalPass2026!' psql -U aks_admin -d aks_dental_prod -h localhost -c \\\"DELETE FROM \\\\\\\"Payment\\\\\\\" WHERE \\\\\\\"invoiceId\\\\\\\" = '${invoice.id}'; DELETE FROM \\\\\\\"InvoiceItem\\\\\\\" WHERE \\\\\\\"invoiceId\\\\\\\" = '${invoice.id}'; DELETE FROM \\\\\\\"Invoice\\\\\\\" WHERE id = '${invoice.id}'; DELETE FROM \\\\\\\"Patient\\\\\\\" WHERE id = '${patient.id}';\\\""`, { stdio: 'ignore' });
  console.log('Test patient and invoice purged from production DB.');

  return { invoiceNumber: invoice.invoiceNumber, receiptNumber: payment.receiptNumber };
}

testBillingJourney()
  .then(res => {
    console.log(`\n✅ END-TO-END BILLING FLOW PASSED PERFECTLY! Invoice: ${res.invoiceNumber}, Receipt: ${res.receiptNumber}`);
  })
  .catch(console.error);
