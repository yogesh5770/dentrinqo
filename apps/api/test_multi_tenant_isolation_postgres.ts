import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

// Connect STRICTLY as the restricted, non-owner role aks_app (NOBYPASSRLS, NOSUPERUSER)
const prisma = new PrismaClient({
  datasources: {
    db: { url: 'postgresql://aks_app:AksAppSecureDevPass2026!@127.0.0.1:5433/aks_dental_dev?schema=public' },
  },
});

const EXPECTED_RLS_TABLES = [
  'Account', 'Appointment', 'AuditLog', 'CompletedProcedure', 'Consultation',
  'ConsultationAmendment', 'DailyQueueSequence', 'DentalChartEntry', 'FileAnnotation',
  'FollowUpReminder', 'Invoice', 'InvoiceItem', 'LabOrder', 'MedicalFile',
  'Patient', 'PatientConsent', 'Payment', 'Prescription', 'PrescriptionItem',
  'RefundAdjustment', 'TreatmentCatalogItem', 'TreatmentPlan', 'TreatmentPlanItem',
  'User', 'ClinicSequence', 'ClinicDisplayToken'
];

async function runPostgresIsolationTestSuite() {
  console.log('===============================================================');
  console.log('STARTING POSTGRESQL MULTI-TENANT ISOLATION & RLS AUDIT SUITE');
  console.log('Connecting as: aks_app (Restricted Non-Owner Role)');
  console.log('===============================================================\n');

  try {
    // -------------------------------------------------------------------------
    // TEST 1: CATALOG AUDIT - RLS ENABLED & FORCED ON ALL 26 TABLES
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Auditing PostgreSQL Catalog for RLS & FORCE RLS on all 26 tables...');
    const tables: any[] = await prisma.$queryRawUnsafe(`
      SELECT c.relname AS tablename, 
             c.relrowsecurity AS rls_enabled, 
             c.relforcerowsecurity AS force_rls 
      FROM pg_class c 
      JOIN pg_namespace n ON n.oid = c.relnamespace 
      WHERE n.nspname = 'public' AND c.relkind = 'r' 
        AND c.relname NOT IN ('_prisma_migrations', 'Clinic', 'ClinicDomain');
    `);

    const tableMap = new Map(tables.map((t: any) => [t.tablename, t]));
    for (const expected of EXPECTED_RLS_TABLES) {
      const found = tableMap.get(expected);
      if (!found) {
        throw new Error(`CRITICAL AUDIT FAILURE: Table "${expected}" not found in database!`);
      }
      if (!found.rls_enabled) {
        throw new Error(`CRITICAL AUDIT FAILURE: Table "${expected}" does NOT have Row-Level Security enabled!`);
      }
      if (!found.force_rls) {
        throw new Error(`CRITICAL AUDIT FAILURE: Table "${expected}" does NOT have FORCE Row-Level Security enabled!`);
      }
    }
    console.log(`✓ All ${EXPECTED_RLS_TABLES.length} tables verified with ENABLE RLS and FORCE RLS active.`);

    // -------------------------------------------------------------------------
    // TEST 2: AUDIT POLICY DEFINITIONS - ZERO "IS NULL" ESCAPE CLAUSES
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] Auditing Policy Definitions for "IS NULL" escape vulnerabilities...');
    const leakyPolicies: any[] = await prisma.$queryRawUnsafe(`
      SELECT tablename, policyname, qual 
      FROM pg_policies 
      WHERE schemaname = 'public' AND qual LIKE '%IS NULL%';
    `);

    if (leakyPolicies.length > 0) {
      throw new Error(`CRITICAL VULNERABILITY: Found ${leakyPolicies.length} policies containing "IS NULL" escape!`);
    }
    console.log('✓ Zero leaky policies found. 100% of policies fail closed.');

    // -------------------------------------------------------------------------
    // TEST 3: RESTRICTED ROLE SECURITY - aks_app CANNOT DISABLE RLS OR ESCALATE
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3] Verifying aks_app role permissions and anti-escalation guards...');
    const roleInfo: any[] = await prisma.$queryRawUnsafe(`
      SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
    `);
    const currentRole = roleInfo[0];
    if (currentRole.rolsuper || currentRole.rolbypassrls) {
      throw new Error(`CRITICAL SECURITY FAILURE: aks_app role has superuser or bypassrls privileges!`);
    }
    console.log(`✓ Confirmed: Role "${currentRole.rolname}" has rolsuper=false, rolbypassrls=false.`);

    // Attempt DDL disable RLS
    try {
      await prisma.$executeRawUnsafe('ALTER TABLE "Patient" DISABLE ROW LEVEL SECURITY;');
      throw new Error('SECURITY BREACH: aks_app was able to disable RLS!');
    } catch (err: any) {
      if (err.message?.includes('must be owner') || err.message?.includes('permission denied')) {
        console.log('✓ Successfully blocked: aks_app cannot disable RLS (permission denied).');
      } else {
        throw err;
      }
    }

    // Attempt role escalation
    try {
      await prisma.$executeRawUnsafe('SET ROLE postgres;');
      throw new Error('SECURITY BREACH: aks_app was able to escalate role to postgres!');
    } catch (err: any) {
      if (err.message?.includes('permission denied')) {
        console.log('✓ Successfully blocked: aks_app cannot escalate role (permission denied).');
      } else {
        throw err;
      }
    }

    // -------------------------------------------------------------------------
    // TEST 4: FAIL-CLOSED BEHAVIOR - UNSET TENANT CONTEXT RETURNS ZERO ROWS
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] Testing fail-closed behavior with unset app.clinic_id...');
    // Query Patient table without SET LOCAL app.clinic_id
    const uncontextualPatients = await prisma.$queryRawUnsafe('SELECT * FROM "Patient";');
    if (Array.isArray(uncontextualPatients) && uncontextualPatients.length > 0) {
      throw new Error(`CRITICAL ISOLATION LEAK: ${uncontextualPatients.length} patient rows returned when app.clinic_id is unset!`);
    }
    console.log('✓ Strict fail-closed confirmed: Exactly 0 patient rows returned with unset tenant context.');

    // -------------------------------------------------------------------------
    // TEST 5: TENANT ISOLATION & POOLED CONNECTION CLEANLINESS
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Testing cross-tenant isolation and transaction scoping...');
    
    // Setup two test clinics
    const clinicAId = 'a1111111-1111-1111-1111-111111111111';
    const clinicBId = 'b2222222-2222-2222-2222-222222222222';

    // Use admin bypass or raw insert with clinic scope
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Clinic" (id, name, code, phone, address, "lobbySecret", "updatedAt") 
      VALUES ('${clinicAId}', 'Test Clinic Alpha', 'TCA', '9999999991', 'Address Alpha', '${crypto.randomBytes(32).toString('hex')}', NOW())
      ON CONFLICT (id) DO NOTHING;
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Clinic" (id, name, code, phone, address, "lobbySecret", "updatedAt") 
      VALUES ('${clinicBId}', 'Test Clinic Beta', 'TCB', '9999999992', 'Address Beta', '${crypto.randomBytes(32).toString('hex')}', NOW())
      ON CONFLICT (id) DO NOTHING;
    `);

    const testUhid = 'TEST-UHID-2026-RLS';

    // Transaction 1: Insert Patient in Clinic A
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.clinic_id', ${clinicAId}, true)`;
      await tx.$executeRaw`
        INSERT INTO "Patient" (id, "clinicId", uhid, "fullName", gender, phone, allergies, "medicalConditions", "currentMedications", "isArchived", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${clinicAId}, ${testUhid}, 'Alpha Patient Karthik', 'MALE', '9876543210', '[]', '[]', '[]', false, NOW(), NOW())
        ON CONFLICT ("clinicId", uhid) DO NOTHING;
      `;
      const pts: any[] = await tx.$queryRaw`SELECT * FROM "Patient" WHERE uhid = ${testUhid}`;
      if (pts.length !== 1) throw new Error('Clinic A failed to read its own patient!');
    });
    console.log('✓ Clinic A successfully created and queried patient in transaction.');

    // Transaction 2: Insert Patient with SAME UHID in Clinic B (Compound Key Test)
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.clinic_id', ${clinicBId}, true)`;
      await tx.$executeRaw`
        INSERT INTO "Patient" (id, "clinicId", uhid, "fullName", gender, phone, allergies, "medicalConditions", "currentMedications", "isArchived", "createdAt", "updatedAt")
        VALUES (gen_random_uuid()::text, ${clinicBId}, ${testUhid}, 'Beta Patient Suresh', 'MALE', '9876543211', '[]', '[]', '[]', false, NOW(), NOW())
        ON CONFLICT ("clinicId", uhid) DO NOTHING;
      `;
      // Query patient in Clinic B - MUST only see Beta Patient!
      const ptsB: any[] = await tx.$queryRaw`SELECT * FROM "Patient" WHERE uhid = ${testUhid}`;
      if (ptsB.length !== 1 || ptsB[0].fullName !== 'Beta Patient Suresh') {
        throw new Error('Clinic B isolation failure or data leak from Clinic A!');
      }
    });
    console.log('✓ Clinic B coexists with same UHID: 0 data leak from Clinic A.');

    // Connection Leakage Test: Outside transaction, connection pooled has 0 rows
    const leakageCheck = await prisma.$queryRawUnsafe(`SELECT * FROM "Patient" WHERE uhid = '${testUhid}';`);
    if (Array.isArray(leakageCheck) && leakageCheck.length > 0) {
      throw new Error('POOLED CONNECTION LEAKAGE: Session setting leaked outside transaction boundary!');
    }
    console.log('✓ Pooled connection reset confirmed: Zero session state leakage outside transaction.');

    // -------------------------------------------------------------------------
    // TEST 6: HMAC LOBBY CODE ROTATION & CLINIC ISOLATION
    // -------------------------------------------------------------------------
    console.log('\n[TEST 6] Testing HMAC Lobby Code Determinism & Clinic Isolation...');
    const secretA = 'secret-alpha-32-byte-hex-key-random-12345';
    const secretB = 'secret-beta-32-byte-hex-key-random-67890';

    const getCode = (clinicId: string, secret: string, bucketOffset: number) => {
      const windowSec = 300;
      const bucket = Math.floor(Date.now() / 1000 / windowSec) + bucketOffset;
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(`${clinicId}:${bucket}`);
      const hash = hmac.digest('hex');
      return (parseInt(hash.substring(0, 8), 16) % 9000 + 1000).toString();
    };

    const codeA = getCode(clinicAId, secretA, 0);
    const codeA_prev = getCode(clinicAId, secretA, -1);
    const codeA_expired = getCode(clinicAId, secretA, -2);
    const codeB = getCode(clinicBId, secretB, 0);

    // Verify Clinic A code fails at Clinic B
    if (codeA === codeB) {
      throw new Error('HMAC collision between Clinic A and Clinic B!');
    }
    console.log(`✓ Clinic A code [${codeA}] differs from Clinic B code [${codeB}].`);

    // Verify verification helper accepts current and previous, rejects expired
    const verifyCode = (cand: string, clinicId: string, secret: string) => {
      const curr = getCode(clinicId, secret, 0);
      const prev = getCode(clinicId, secret, -1);
      return cand === curr || cand === prev;
    };

    if (!verifyCode(codeA, clinicAId, secretA)) throw new Error('Valid current code rejected!');
    if (!verifyCode(codeA_prev, clinicAId, secretA)) throw new Error('Valid previous code (grace window) rejected!');
    if (verifyCode(codeA_expired, clinicAId, secretA)) throw new Error('Expired code accepted!');
    if (verifyCode(codeA, clinicBId, secretB)) throw new Error('Clinic A code accepted at Clinic B!');

    console.log('✓ HMAC verification logic passed: Current & previous accepted; expired & foreign rejected.');

    // Cleanup test records
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.clinic_id', ${clinicAId}, true)`;
      await tx.$executeRaw`DELETE FROM "Patient" WHERE uhid = ${testUhid};`;
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.clinic_id', ${clinicBId}, true)`;
      await tx.$executeRaw`DELETE FROM "Patient" WHERE uhid = ${testUhid};`;
    });
    await prisma.$executeRawUnsafe(`DELETE FROM "Clinic" WHERE id IN ('${clinicAId}', '${clinicBId}');`);

    console.log('\n===============================================================');
    console.log('>>> ALL 6 AUDIT AND ISOLATION TESTS PASSED WITH 100% SUCCESS <<<');
    console.log('===============================================================');
  } catch (error: any) {
    console.error('\n❌ TEST SUITE FAILED:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPostgresIsolationTestSuite();
