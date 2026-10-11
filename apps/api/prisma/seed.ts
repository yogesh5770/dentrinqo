import { PrismaClient } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding AKS Elite Dental Clinic production database (Clean Production State)...');

  // 1. Create or Update Clinic Profile with Official Contact
  const clinic = await prisma.clinic.upsert({
    where: { code: 'AKS' },
    update: {
      name: "AK's Elite Dental Clinic and Multi-Speciality Dental Hospital",
      tagline: 'Precision Dentistry and Gentle Healthcare For All Generations',
      phone: '+91 95387 23872',
      email: 'akselitedental.madurai@gmail.com',
      address: 'Plot No. 162/2A, Alagar Complex, 5th Meenakshi Amman Nagar Main Road, K.Pudur',
      city: 'Madurai',
      state: 'Tamil Nadu',
      postalCode: '625007',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      workingHours: JSON.stringify({
        weekdays: '9:30 AM - 9:00 PM',
        sunday: '10:30 AM - 2:00 PM',
      }),
      chairCount: 3,
    },
    create: {
      name: "AK's Elite Dental Clinic and Multi-Speciality Dental Hospital",
      code: 'AKS',
      tagline: 'Precision Dentistry and Gentle Healthcare For All Generations',
      phone: '+91 95387 23872',
      email: 'akselitedental.madurai@gmail.com',
      address: 'Plot No. 162/2A, Alagar Complex, 5th Meenakshi Amman Nagar Main Road, K.Pudur',
      city: 'Madurai',
      state: 'Tamil Nadu',
      postalCode: '625007',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      workingHours: JSON.stringify({
        weekdays: '9:30 AM - 9:00 PM',
        sunday: '10:30 AM - 2:00 PM',
      }),
      chairCount: 3,
    },
  });

  // 2. Hash Password for Owner Super Admin
  const adminPasswordHash = await hash('aks@123');

  // 3. Clean out all dummy patients, appointments, billing records, charts, and logs for 100% clean production
  console.log('Purging test/dummy clinical and billing records...');
  await prisma.payment.deleteMany({});
  await prisma.invoiceItem.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.completedProcedure.deleteMany({});
  await prisma.treatmentPlanItem.deleteMany({});
  await prisma.treatmentPlan.deleteMany({});
  await prisma.prescription.deleteMany({});
  await prisma.dentalChartEntry.deleteMany({});
  await prisma.consultationAmendment.deleteMany({});
  await prisma.consultation.deleteMany({});
  await prisma.followUpReminder.deleteMany({});
  await prisma.medicalFile.deleteMany({});
  await prisma.appointment.deleteMany({});
  await prisma.patient.deleteMany({});
  await prisma.auditLog.deleteMany({});

  // 4. Remove all old/seeded users except if one already matches the new email
  console.log('Purging old staff/admin accounts to keep strictly 1 owner admin...');
  await prisma.user.deleteMany({
    where: {
      email: { not: 'akselitedental.madurai@gmail.com' },
    },
  });

  // 5. Create or Update Single Clinic Owner / Super Admin
  const adminUser = await prisma.user.upsert({
    where: { email: 'akselitedental.madurai@gmail.com' },
    update: {
      username: 'admin',
      role: 'CLINIC_ADMIN',
      fullName: 'Dr. Khalidh Khan (BDS, MDS)',
      phone: '+91 95387 23872',
      designation: 'Clinic Owner & Chief Dental Surgeon',
      department: 'Administration & Dental Surgery',
      specialization: 'Chief Endodontist & Implantologist',
      licenseNumber: 'TN-DENT-84920',
      passwordHash: adminPasswordHash,
      isActive: true,
      mustChangePassword: false,
    },
    create: {
      clinicId: clinic.id,
      email: 'akselitedental.madurai@gmail.com',
      username: 'admin',
      fullName: 'Dr. Khalidh Khan (BDS, MDS)',
      phone: '+91 95387 23872',
      role: 'CLINIC_ADMIN',
      designation: 'Clinic Owner & Chief Dental Surgeon',
      department: 'Administration & Dental Surgery',
      specialization: 'Chief Endodontist & Implantologist',
      licenseNumber: 'TN-DENT-84920',
      passwordHash: adminPasswordHash,
      isActive: true,
      mustChangePassword: false,
    },
  });

  console.log('----------------------------------------------------');
  console.log(' AKS ELITE DENTAL CLINIC - PRODUCTION READY');
  console.log('----------------------------------------------------');
  console.log('Clinic Name :', clinic.name);
  console.log('Admin Email :', adminUser.email);
  console.log('Username    :', adminUser.username);
  console.log('Phone       :', adminUser.phone);
  console.log('Role        : CLINIC_ADMIN (Hospital Owner)');
  console.log('Password    : aks@123');
  console.log('Dummy Data  : 0 patients, 0 dummy staff, 100% clean');
  console.log('----------------------------------------------------');
}

main()
  .catch(e => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });