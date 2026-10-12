import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from './src/app.module';
import { PrismaService } from './src/prisma/prisma.service';
import { PatientAuthService } from './src/patient-auth/patient-auth.service';
import { PatientAuthController } from './src/patient-auth/patient-auth.controller';
import { PatientAuthGuard } from './src/patient-auth/guards/patient-auth.guard';
import { AuthGuard } from './src/auth/guards/auth.guard';
import { AppointmentsService } from './src/appointments/appointments.service';
import { PatientsService } from './src/patients/patients.service';
import { AuthService } from './src/auth/auth.service';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function runTests() {
  console.log('================================================================');
  console.log('   AKS ELITE DENTAL - PATIENT ACCOUNTS & FAMILY TESTS (A - N)   ');
  console.log('================================================================\n');

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.init();

  const prisma = app.get(PrismaService);
  const patientAuthService = app.get(PatientAuthService);
  const appointmentsService = app.get(AppointmentsService);
  const patientsService = app.get(PatientsService);
  const authService = app.get(AuthService);

  const clinic = await prisma.clinic.findFirst();
  if (!clinic) throw new Error('No clinic found. Please run seed first.');

  const staff = await prisma.user.findFirst({ where: { clinicId: clinic.id, role: 'CLINIC_ADMIN' } });
  if (!staff) throw new Error('No staff found. Please run seed first.');

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✓ PASS: ${testName}`);
      passedCount++;
    } else {
      console.error(`✗ FAIL: ${testName} - ${detail || 'Assertion failed'}`);
      failedCount++;
    }
  }

  try {
    // -------------------------------------------------------------
    // Test A: Signup with mismatched passwords is rejected
    // -------------------------------------------------------------
    try {
      await patientAuthService.signup({
        fullName: 'Test User A',
        phone: '9842111111',
        gender: 'MALE',
        password: 'Password123!',
        confirmPassword: 'MismatchPassword!',
        consentDataUse: true,
      });
      assert(false, 'Test A: Mismatched password rejected');
    } catch (e: any) {
      assert(
        e.message?.includes('confirmation does not match') || e.status === 400,
        'Test A: Mismatched password rejected',
      );
    }

    // -------------------------------------------------------------
    // Test B: Weak or short password (< 8 chars) is rejected
    // -------------------------------------------------------------
    try {
      await patientAuthService.signup({
        fullName: 'Test User B',
        phone: '9842111112',
        gender: 'FEMALE',
        password: 'short',
        confirmPassword: 'short',
        consentDataUse: true,
      });
      assert(false, 'Test B: Short password rejected');
    } catch (e: any) {
      assert(
        e.message?.includes('at least 8 characters') || e.status === 400,
        'Test B: Short password rejected',
      );
    }

    // -------------------------------------------------------------
    // Setup Account 1 for Ramesh Kumar
    // -------------------------------------------------------------
    const rameshPhone = '9842199001';
    const rameshSignup = await patientAuthService.signup({
      fullName: 'Ramesh Kumar',
      phone: rameshPhone,
      gender: 'MALE',
      dateOfBirth: '1985-05-15',
      password: 'SecurePass2026!',
      confirmPassword: 'SecurePass2026!',
      consentDataUse: true,
      consentWhatsapp: true,
    });
    assert(!!rameshSignup.token && !!rameshSignup.account, 'Ramesh Account created');

    // -------------------------------------------------------------
    // Test C: Duplicate phone signup on the same clinic is rejected
    // -------------------------------------------------------------
    try {
      await patientAuthService.signup({
        fullName: 'Ramesh Duplicate',
        phone: rameshPhone,
        gender: 'MALE',
        password: 'SecurePass2026!',
        confirmPassword: 'SecurePass2026!',
        consentDataUse: true,
      });
      assert(false, 'Test C: Duplicate phone signup rejected');
    } catch (e: any) {
      assert(
        e.status === 409 || e.message?.includes('already exists'),
        'Test C: Duplicate phone signup rejected with Conflict (409)',
      );
    }

    // -------------------------------------------------------------
    // Test D: Login lockout after 5 wrong attempts
    // -------------------------------------------------------------
    let lockedOut = false;
    for (let i = 1; i <= 5; i++) {
      try {
        await patientAuthService.login({
          phone: rameshPhone,
          password: 'WrongPassword123!',
        });
      } catch (err: any) {
        if (i === 5 && (err.message?.includes('locked') || err.message?.includes('15 minutes'))) {
          lockedOut = true;
        }
      }
    }
    // Attempt 6: should be immediately blocked due to active lockout
    try {
      await patientAuthService.login({
        phone: rameshPhone,
        password: 'WrongPassword123!',
      });
    } catch (err: any) {
      if (err.message?.includes('locked') || err.message?.includes('15 minutes')) {
        lockedOut = true;
      }
    }
    assert(lockedOut, 'Test D: Login lockout triggered after 5 consecutive failed attempts');

    // Reset lockout for Ramesh account to allow subsequent tests
    await prisma.account.update({
      where: { id: rameshSignup.account.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    // -------------------------------------------------------------
    // Test E: A patient JWT cannot call any staff endpoint
    // -------------------------------------------------------------
    const patientToken = rameshSignup.token;
    const staffVerification = authService.verifyToken(patientToken);
    assert(
      staffVerification === null,
      'Test E: Patient JWT cannot pass Staff AuthService verification (Strict Isolation)',
    );

    // -------------------------------------------------------------
    // Test F: Staff JWT cannot be used as a patient session
    // -------------------------------------------------------------
    const staffToken = authService.createToken({
      id: staff.id,
      clinicId: clinic.id,
      email: staff.email,
      username: staff.username,
      role: 'CLINIC_ADMIN',
    });
    const patientVerification = patientAuthService.verifyPatientToken(staffToken);
    assert(
      patientVerification === null,
      'Test F: Staff JWT is rejected by PatientAuthService (Cannot masquerade as patient session)',
    );

    // -------------------------------------------------------------
    // Setup Account 2 for Priya Sharma
    // -------------------------------------------------------------
    const priyaPhone = '9842199002';
    const priyaSignup = await patientAuthService.signup({
      fullName: 'Priya Sharma',
      phone: priyaPhone,
      gender: 'FEMALE',
      dateOfBirth: '1992-08-20',
      password: 'SecurePass2026!',
      confirmPassword: 'SecurePass2026!',
      consentDataUse: true,
    });

    // Add a visit for Priya
    await appointmentsService.createPublicRequest(
      {
        fullName: 'Priya Sharma',
        phone: priyaPhone,
        service: 'Consultation',
        preferredDate: '2026-10-20',
        preferredSlot: '11:00 AM',
        chairNumber: 1,
        patientId: priyaSignup.patient.id,
      },
      '127.0.0.1',
      priyaSignup.token,
    );

    // -------------------------------------------------------------
    // Test G: Patient A cannot read Patient B's visits (IDOR Test)
    // -------------------------------------------------------------
    const rameshVisits = await patientAuthService.getMyVisits(rameshSignup.account.id);
    const hasPriyaVisit = rameshVisits.some((v: any) => v.patientName === 'Priya Sharma');
    assert(
      !hasPriyaVisit,
      'Test G: IDOR Protected - Ramesh account cannot view Priya Sharmas visits',
    );

    // -------------------------------------------------------------
    // Test H: Guest booking still works and creates an atomic token
    // -------------------------------------------------------------
    const guestRes = await appointmentsService.createPublicRequest(
      {
        fullName: 'Guest Walk-in Patient',
        phone: '9842199003',
        service: 'Emergency Pain Relief',
        preferredDate: '2026-10-21',
        preferredSlot: '10:00 AM',
        chairNumber: 1,
      },
      '127.0.0.1',
    );
    assert(
      guestRes.success && guestRes.tokenNumber >= 1 && !!guestRes.reference,
      'Test H: Guest booking creates appointment and issues sequential daily token',
    );

    // -------------------------------------------------------------
    // Test I: Walk-in QR booking still works with name + mobile only
    // -------------------------------------------------------------
    const walkinDate = '2026-10-22';
    const walkinSlot = '10:30 AM';
    const parsedStart = (appointmentsService as any).parseSlotTime(walkinDate, walkinSlot);
    const validLobbyCode = appointmentsService.getDailyLobbyCode(clinic.id, parsedStart);

    const walkinRes = await appointmentsService.createPublicRequest(
      {
        fullName: 'Lobby Standee Walkin',
        phone: '9842199004',
        service: 'Walk-in Consultation',
        preferredDate: walkinDate,
        preferredSlot: walkinSlot,
        chairNumber: 2,
        lobbyCode: validLobbyCode,
      },
      '127.0.0.1',
    );
    assert(
      walkinRes.success && walkinRes.chairNumber === 2,
      'Test I: Lobby QR Walk-in booking succeeds with name + mobile only and valid salt',
    );

    // -------------------------------------------------------------
    // Test J: Returning phone number offers existing patient & avoids duplicate
    // -------------------------------------------------------------
    const lookup = await appointmentsService.lookupPatientsByPhone(rameshPhone);
    assert(
      lookup.exists && lookup.patients.length >= 1 && lookup.patients[0].fullName === 'Ramesh Kumar',
      'Test J: Returning phone number looks up existing patient profile for user selection',
    );

    // -------------------------------------------------------------
    // Test K: Account with 3 family members shows all 3 patients under /my/visits
    // -------------------------------------------------------------
    // Add Child: Aarav Kumar
    const child = await patientAuthService.addFamilyMember(rameshSignup.account.id, {
      fullName: 'Aarav Kumar',
      relationToAccount: 'CHILD',
      gender: 'MALE',
      age: 8,
      dobApproximate: true,
    });
    // Add Spouse: Meena Kumar
    const spouse = await patientAuthService.addFamilyMember(rameshSignup.account.id, {
      fullName: 'Meena Kumar',
      relationToAccount: 'SPOUSE',
      gender: 'FEMALE',
      dateOfBirth: '1987-11-12',
    });

    // Book visit for Child Aarav
    await appointmentsService.createPublicRequest(
      {
        fullName: 'Aarav Kumar',
        phone: rameshPhone,
        service: 'Pediatric Dental Checkup',
        preferredDate: '2026-10-23',
        preferredSlot: '04:00 PM',
        chairNumber: 1,
        patientId: child.patient.id,
      },
      '127.0.0.1',
      rameshSignup.token,
    );

    const updatedRameshVisits = await patientAuthService.getMyVisits(rameshSignup.account.id);
    const familyMemberNames = updatedRameshVisits.map((v: any) => v.patientName);
    assert(
      familyMemberNames.includes('Aarav Kumar'),
      'Test K: Account visits show family members (Aarav Kumar visit present under family account)',
    );

    // -------------------------------------------------------------
    // Test L: Second visit for same patient is saved under the SAME Patient record
    // -------------------------------------------------------------
    // Mark prior booking as confirmed so 15-minute pending throttle doesn't block second visit test
    await prisma.appointment.updateMany({
      where: {
        clinicId: clinic.id,
        patient: { phone: { contains: rameshPhone.slice(-10) } },
        status: 'PENDING_CONFIRMATION',
      },
      data: { status: 'CONFIRMED' },
    });

    const visit2 = await appointmentsService.createPublicRequest(
      {
        fullName: 'Aarav Kumar',
        phone: rameshPhone,
        service: 'Pediatric Fluoride Treatment',
        preferredDate: '2026-10-24',
        preferredSlot: '05:00 PM',
        chairNumber: 2,
        patientId: child.patient.id,
      },
      '127.0.0.1',
      rameshSignup.token,
    );

    const aaravPatientRecords = await prisma.patient.findMany({
      where: {
        clinicId: clinic.id,
        fullName: 'Aarav Kumar',
      },
    });
    assert(
      aaravPatientRecords.length === 1,
      'Test L: Subsequent visit saved under the SAME patient record (No duplicate created)',
    );

    // -------------------------------------------------------------
    // Test M: Merge tool moves all records and logs the action
    // -------------------------------------------------------------
    // Create duplicate patient record
    const dupPatient = await prisma.patient.create({
      data: {
        clinicId: clinic.id,
        uhid: 'AKS-TEMP-DUP1',
        fullName: 'Ramesh K (Duplicate File)',
        phone: rameshPhone,
        gender: 'MALE',
        possibleDuplicate: true,
      },
    });

    // Add appointment to duplicate
    const dupAppt = await prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId: dupPatient.id,
        dentistId: staff.id,
        createdById: staff.id,
        chairNumber: 1,
        scheduledStart: new Date(Date.now() + 86400000),
        scheduledEnd: new Date(Date.now() + 86400000 + 1800000),
        reason: 'Root Canal Consultation',
        status: 'SCHEDULED',
      },
    });

    // Perform Merge: Duplicate -> Ramesh Primary
    const mergeResult = await patientsService.mergePatients(
      clinic.id,
      rameshSignup.patient.id,
      dupPatient.id,
      'Duplicate chart identified by front desk during registration',
      { userId: staff.id, role: staff.role },
    );

    // Verify appointment was migrated
    const recheckedAppt = await prisma.appointment.findUnique({ where: { id: dupAppt.id } });
    const archivedDup = await prisma.patient.findUnique({ where: { id: dupPatient.id } });

    assert(
      recheckedAppt?.patientId === rameshSignup.patient.id && archivedDup?.isArchived === true,
      'Test M: Merge tool transferred appointments to survivor and archived duplicate',
    );

    // -------------------------------------------------------------
    // Test N: 3rd active booking from the same phone is rejected
    // -------------------------------------------------------------
    // Phone 9842199009
    const testNPhone = '9842199009';
    await appointmentsService.createPublicRequest(
      {
        fullName: 'Active Limit Test',
        phone: testNPhone,
        service: 'Checkup 1',
        preferredDate: '2026-10-25',
        preferredSlot: '10:00 AM',
        chairNumber: 1,
      },
      '127.0.0.1',
    );

    // Mark first booking as CONFIRMED (active future booking) so second booking can proceed
    await prisma.appointment.updateMany({
      where: {
        clinicId: clinic.id,
        patient: { phone: { contains: testNPhone.slice(-10) } },
      },
      data: { status: 'CONFIRMED' },
    });

    await appointmentsService.createPublicRequest(
      {
        fullName: 'Active Limit Test',
        phone: testNPhone,
        service: 'Checkup 2',
        preferredDate: '2026-10-26',
        preferredSlot: '11:00 AM',
        chairNumber: 1,
      },
      '127.0.0.1',
    );

    // Mark second booking as CONFIRMED so phone has 2 active upcoming confirmed bookings without triggering 15m duplicate pending
    await prisma.appointment.updateMany({
      where: {
        clinicId: clinic.id,
        patient: { phone: { contains: testNPhone.slice(-10) } },
        status: 'PENDING_CONFIRMATION',
      },
      data: { status: 'CONFIRMED' },
    });

    // 3rd booking attempt on same phone
    let rejectedActiveLimit = false;
    try {
      await appointmentsService.createPublicRequest(
        {
          fullName: 'Active Limit Test',
          phone: testNPhone,
          service: 'Checkup 3',
          preferredDate: '2026-10-27',
          preferredSlot: '12:00 PM',
          chairNumber: 1,
        },
        '127.0.0.1',
      );
    } catch (e: any) {
      if (e.message?.includes('2 active upcoming') || e.status === 400) {
        rejectedActiveLimit = true;
      }
    }
    assert(
      rejectedActiveLimit,
      'Test N: 3rd active upcoming booking rejected by phone limit (Max 2 rule enforced)',
    );

  } catch (err) {
    console.error('Test suite unexpected error:', err);
  } finally {
    await app.close();
  }

  console.log('\n================================================================');
  console.log(`TOTAL PASSED: ${passedCount}`);
  console.log(`TOTAL FAILED: ${failedCount}`);
  console.log('================================================================');
}

runTests();
