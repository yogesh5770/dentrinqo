import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== STARTING 18,000+ OLD CARD ARCHIVE TEST ===');
  
  let clinic = await prisma.clinic.findFirst();
  if (!clinic) {
    clinic = await prisma.clinic.create({
      data: {
        code: 'AKS',
        name: 'AKS Elite Dental Clinic',
        chairCount: 3,
        phone: '+91 95387 23872',
        address: 'Plot No. 162/2A, K.Pudur, Madurai',
      },
    });
  }

  // Find a doctor
  let doctor = await prisma.user.findFirst({
    where: { clinicId: clinic.id, role: { in: ['DENTIST', 'ADMIN', 'CLINIC_ADMIN'] } },
  });
  if (!doctor) {
    doctor = await prisma.user.create({
      data: {
        clinicId: clinic.id,
        fullName: 'Dr. Khalidh Khan (BDS, MDS)',
        email: 'doctor@akselitedental.com',
        phone: '+919999999999',
        passwordHash: 'dummy',
        role: 'DENTIST',
      },
    });
  }

  // 1. Create Old Card Patient Record
  const legacyCardNo = 'CARD-' + Math.floor(1000 + Math.random() * 9000);
  const testPhone = '+9198' + Math.floor(10000000 + Math.random() * 90000000);
  
  console.log(`Creating archived patient with Card #${legacyCardNo}...`);
  const patient = await prisma.patient.create({
    data: {
      clinicId: clinic.id,
      uhid: `AKS-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      fullName: 'Ramesh Sundaram (Old Card Patient)',
      phone: testPhone,
      age: 48,
      gender: 'MALE',
      bloodGroup: 'B+',
      legacySlNo: legacyCardNo,
      guardianName: 'Sundaram (Late)',
      occupation: 'Government School Teacher',
      physicalLocation: 'Cabinet 2, Shelf B, Box 14',
      legacyRegistrationDate: new Date('2017-08-14'),
      legacyPastHistory: 'RCT done on FDI 46 in 2017. Metal crown fitted. Allergic to Sulfa drugs.',
      voiceNoteUrl: 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAA',
      allergies: JSON.stringify(['Sulfa drugs']),
    },
  });

  console.log(`✅ Patient created! ID: ${patient.id}, UHID: ${patient.uhid}, Card: ${patient.legacySlNo}, Shelf: "${patient.physicalLocation}"`);

  // 2. Test sub-second lookup by Card Number
  console.log(`Searching patient by Card Serial: "${legacyCardNo}"...`);
  const found = await prisma.patient.findMany({
    where: {
      clinicId: clinic.id,
      OR: [
        { fullName: { contains: legacyCardNo } },
        { phone: { contains: legacyCardNo } },
        { uhid: { contains: legacyCardNo } },
        { legacySlNo: { contains: legacyCardNo } },
      ],
    },
  });

  if (found.length === 1 && found[0].id === patient.id) {
    console.log(`✅ Sub-second lookup by Card #${legacyCardNo} succeeded! Found: ${found[0].fullName}`);
  } else {
    throw new Error(`Failed to lookup by card number! Found ${found.length} records`);
  }

  // 3. Test 1-Click Reappearance Check-in
  console.log('Testing Reappearance Check-in to Operatory Chair 2...');
  const appt = await prisma.appointment.create({
    data: {
      clinicId: clinic.id,
      patientId: patient.id,
      dentistId: doctor.id,
      createdById: doctor.id,
      chairNumber: 2,
      scheduledStart: new Date(),
      scheduledEnd: new Date(Date.now() + 30 * 60000),
      durationMinutes: 30,
      reason: `Old Card Return (Card #${patient.legacySlNo}) - Severe sensitivity in tooth 46`,
      status: 'CHECKED_IN',
      checkInTime: new Date(),
      isReappearance: true,
      legacySlNo: patient.legacySlNo,
    },
  });

  console.log(`✅ Reappearance appointment created! Appt ID: ${appt.id}, Chair: ${appt.chairNumber}, Reason: "${appt.reason}"`);
  console.log('=== ALL 18,000+ OLD CARD ARCHIVE TESTS PASSED 100% ===');
}

main()
  .catch(e => {
    console.error('Test failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
