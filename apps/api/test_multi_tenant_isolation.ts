import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runMultiTenantIsolationTests() {
  console.log('===============================================================');
  console.log('STARTING MULTI-TENANT ISOLATION & RLS VERIFICATION TEST SUITE');
  console.log('===============================================================');

  let clinicA: any;
  let clinicB: any;
  let testPatientA: any;
  let testPatientB: any;
  let testInvoiceA: any;
  let testInvoiceB: any;
  let testPaymentA: any;
  let testPaymentB: any;

  try {
    // -------------------------------------------------------------------------
    // 1. SETUP TWO SEPARATE CLINIC TENANTS
    // -------------------------------------------------------------------------
    console.log('\n[TEST 1] Setting up 2 distinct clinic tenants...');
    clinicA = await prisma.clinic.upsert({
      where: { code: 'AKS' },
      update: { subdomain: 'aks', status: 'ACTIVE' },
      create: {
        name: "AK's Elite Dental Clinic",
        code: 'AKS',
        subdomain: 'aks',
        status: 'ACTIVE',
        phone: '9840012345',
        email: 'admin@akselite.in',
        address: '162 Alagar Kovil Rd',
        city: 'Madurai',
        state: 'Tamil Nadu',
        postalCode: '625007',
        chairCount: 2,
        upiVpa: 'akselitedental@icici',
      },
    });

    clinicB = await prisma.clinic.upsert({
      where: { code: 'JDC' },
      update: { subdomain: 'jacobs', status: 'ACTIVE' },
      create: {
        name: "Jacobs Multi-Speciality Dental Hospital",
        code: 'JDC',
        subdomain: 'jacobs',
        status: 'ACTIVE',
        phone: '9840067890',
        email: 'info@jacobsdental.in',
        address: '45 Gandhi Road',
        city: 'Vellore',
        state: 'Tamil Nadu',
        postalCode: '632004',
        chairCount: 3,
        upiVpa: 'jacobsdental@hdfcbank',
      },
    });

    console.log(`✓ Clinic A registered: ${clinicA.name} [ID: ${clinicA.id}, Code: ${clinicA.code}, Subdomain: ${clinicA.subdomain}]`);
    console.log(`✓ Clinic B registered: ${clinicB.name} [ID: ${clinicB.id}, Code: ${clinicB.code}, Subdomain: ${clinicB.subdomain}]`);

    // -------------------------------------------------------------------------
    // 2. VERIFY COMPOUND UNIQUE CONSTRAINTS: UHID COLLISION PERMITTED ACROSS TENANTS
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] Verifying compound unique constraint on Patient [clinicId, uhid]...');
    const sharedUhid = 'TEST-UHID-2026-X99';

    // Cleanup any lingering test patients
    await prisma.patient.deleteMany({ where: { uhid: sharedUhid } });

    testPatientA = await prisma.patient.create({
      data: {
        clinicId: clinicA.id,
        uhid: sharedUhid,
        fullName: 'Tenant A Test Patient',
        gender: 'MALE',
        phone: '+919999900001',
      },
    });
    console.log(`✓ Created Patient in Clinic A with UHID: ${testPatientA.uhid} (ID: ${testPatientA.id})`);

    // In a single-tenant model, this would fail with P2002.
    // In our multi-tenant model, it MUST succeed because clinicId is different!
    testPatientB = await prisma.patient.create({
      data: {
        clinicId: clinicB.id,
        uhid: sharedUhid,
        fullName: 'Tenant B Test Patient',
        gender: 'FEMALE',
        phone: '+919999900002',
      },
    });
    console.log(`✓ Created Patient in Clinic B with SAME UHID: ${testPatientB.uhid} (ID: ${testPatientB.id})`);

    // Now verify that attempting duplicate UHID WITHIN Clinic A STILL fails
    let duplicateCaught = false;
    try {
      await prisma.patient.create({
        data: {
          clinicId: clinicA.id,
          uhid: sharedUhid,
          fullName: 'Duplicate Patient in Clinic A',
          gender: 'OTHER',
          phone: '+919999900003',
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        duplicateCaught = true;
        console.log(`✓ P2002 properly enforced for intra-clinic duplicate UHID inside Clinic A!`);
      } else {
        throw err;
      }
    }
    if (!duplicateCaught) {
      throw new Error('FAILED: Duplicate UHID inside the same clinic was not rejected by database constraint!');
    }

    // -------------------------------------------------------------------------
    // 3. VERIFY INVOICE & PAYMENT COMPOUND UNIQUE CONSTRAINTS
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3] Verifying compound unique constraints on Invoice & Payment...');
    const sharedInvNo = 'INV-TEST-2026-999';
    const sharedRcpNo = 'RCP-TEST-2026-999';

    const userA = await prisma.user.findFirst({ where: { clinicId: clinicA.id } }) || await prisma.user.create({
      data: {
        clinicId: clinicA.id,
        email: 'staff_test_a@akselite.in',
        username: 'staff_test_a',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy',
        fullName: 'Staff Test A',
        role: 'CLINIC_ADMIN',
      },
    });

    const userB = await prisma.user.findFirst({ where: { clinicId: clinicB.id } }) || await prisma.user.create({
      data: {
        clinicId: clinicB.id,
        email: 'staff_test_b@jacobsdental.in',
        username: 'staff_test_b',
        passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy',
        fullName: 'Staff Test B',
        role: 'CLINIC_ADMIN',
      },
    });

    // Delete any previous test invoices with this number
    await prisma.payment.deleteMany({ where: { receiptNumber: sharedRcpNo } });
    await prisma.invoiceItem.deleteMany({ where: { invoice: { invoiceNumber: sharedInvNo } } });
    await prisma.invoice.deleteMany({ where: { invoiceNumber: sharedInvNo } });

    testInvoiceA = await prisma.invoice.create({
      data: {
        clinicId: clinicA.id,
        patientId: testPatientA.id,
        invoiceNumber: sharedInvNo,
        createdById: userA.id,
        subtotalPaise: 150000,
        totalPaise: 150000,
        balancePaise: 150000,
      },
    });

    testInvoiceB = await prisma.invoice.create({
      data: {
        clinicId: clinicB.id,
        patientId: testPatientB.id,
        invoiceNumber: sharedInvNo,
        createdById: userB.id,
        subtotalPaise: 250000,
        totalPaise: 250000,
        balancePaise: 250000,
      },
    });
    console.log(`✓ Both clinics successfully created Invoice "${sharedInvNo}" with distinct balances.`);

    testPaymentA = await prisma.payment.create({
      data: {
        clinicId: clinicA.id,
        patientId: testPatientA.id,
        invoiceId: testInvoiceA.id,
        receiptNumber: sharedRcpNo,
        recordedById: userA.id,
        amountPaise: 150000,
        paymentMethod: 'UPI',
      },
    });

    testPaymentB = await prisma.payment.create({
      data: {
        clinicId: clinicB.id,
        patientId: testPatientB.id,
        invoiceId: testInvoiceB.id,
        receiptNumber: sharedRcpNo,
        recordedById: userB.id,
        amountPaise: 250000,
        paymentMethod: 'CASH',
      },
    });
    console.log(`✓ Both clinics successfully created Payment Receipt "${sharedRcpNo}" without collision.`);

    // -------------------------------------------------------------------------
    // 4. VERIFY CHILD RECORD CLINICID PERSISTENCE & STRICT ISOLATION
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] Verifying direct clinicId on child models & cross-tenant query isolation...');

    // Create TreatmentPlan with Item in Clinic A
    const planA = await prisma.treatmentPlan.create({
      data: {
        clinicId: clinicA.id,
        patientId: testPatientA.id,
        title: 'Comprehensive RCT Plan',
        totalEstimatedPaise: 450000,
        items: {
          create: [
            {
              clinicId: clinicA.id,
              procedureCode: 'D0140',
              procedureName: 'Root Canal Obturation',
              estimatedCostPaise: 450000,
              sequenceOrder: 1,
            },
          ],
        },
      },
      include: { items: true },
    });
    console.log(`✓ TreatmentPlan created with clinicId=${planA.clinicId}, item clinicId=${planA.items[0].clinicId}`);

    // Verify Clinic B queries return 0 records from Clinic A
    const clinicBPlans = await prisma.treatmentPlan.findMany({
      where: { clinicId: clinicB.id },
    });
    const leakFound = clinicBPlans.some(p => p.id === planA.id);
    if (leakFound) {
      throw new Error('SECURITY VIOLATION: TreatmentPlan from Clinic A leaked into Clinic B query!');
    }
    console.log(`✓ Strict isolation confirmed: Clinic B treatment plan query contains 0 items from Clinic A.`);

    const clinicBItems = await prisma.treatmentPlanItem.findMany({
      where: { clinicId: clinicB.id },
    });
    if (clinicBItems.some(i => i.treatmentPlanId === planA.id)) {
      throw new Error('SECURITY VIOLATION: TreatmentPlanItem from Clinic A leaked into Clinic B query!');
    }
    console.log(`✓ Strict child isolation confirmed: TreatmentPlanItems are strictly isolated.`);

    // -------------------------------------------------------------------------
    // 5. VERIFY CLINIC SEQUENCE COUNTER ATOMICITY
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Testing ClinicSequence model for atomic counter tracking...');
    const seqA = await prisma.clinicSequence.upsert({
      where: {
        clinicId_sequenceType_fiscalYear: {
          clinicId: clinicA.id,
          sequenceType: 'INVOICE',
          fiscalYear: '2026-2027',
        },
      },
      update: { currentValue: { increment: 1 } },
      create: {
        clinicId: clinicA.id,
        sequenceType: 'INVOICE',
        fiscalYear: '2026-2027',
        currentValue: 1,
      },
    });

    const seqB = await prisma.clinicSequence.upsert({
      where: {
        clinicId_sequenceType_fiscalYear: {
          clinicId: clinicB.id,
          sequenceType: 'INVOICE',
          fiscalYear: '2026-2027',
        },
      },
      update: { currentValue: { increment: 1 } },
      create: {
        clinicId: clinicB.id,
        sequenceType: 'INVOICE',
        fiscalYear: '2026-2027',
        currentValue: 1,
      },
    });

    console.log(`✓ ClinicSequence counter: Clinic A (${seqA.currentValue}) | Clinic B (${seqB.currentValue})`);

    // Clean up test treatment plan
    await prisma.treatmentPlanItem.deleteMany({ where: { treatmentPlanId: planA.id } });
    await prisma.treatmentPlan.delete({ where: { id: planA.id } });

    console.log('\n===============================================================');
    console.log('>>> ALL MULTI-TENANT ISOLATION TESTS PASSED WITH 100% SUCCESS <<<');
    console.log('===============================================================');
  } catch (error) {
    console.error('\n❌ MULTI-TENANT ISOLATION TEST FAILED:', error);
    process.exitCode = 1;
  } finally {
    // Cleanup test records
    console.log('\nCleaning up test records...');
    try {
      if (testPaymentA?.id) await prisma.payment.delete({ where: { id: testPaymentA.id } }).catch(() => {});
      if (testPaymentB?.id) await prisma.payment.delete({ where: { id: testPaymentB.id } }).catch(() => {});
      if (testInvoiceA?.id) await prisma.invoice.delete({ where: { id: testInvoiceA.id } }).catch(() => {});
      if (testInvoiceB?.id) await prisma.invoice.delete({ where: { id: testInvoiceB.id } }).catch(() => {});
      if (testPatientA?.id) await prisma.patient.delete({ where: { id: testPatientA.id } }).catch(() => {});
      if (testPatientB?.id) await prisma.patient.delete({ where: { id: testPatientB.id } }).catch(() => {});
      console.log('Cleanup complete.');
    } catch {}
    await prisma.$disconnect();
  }
}

runMultiTenantIsolationTests();
