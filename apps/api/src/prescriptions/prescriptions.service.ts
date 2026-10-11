import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePrescriptionDto, PrescriptionItemDto } from './prescription.dto';

export const DENTAL_FORMULARY_TEMPLATES: {
  category: string;
  items: PrescriptionItemDto[];
}[] = [
  {
    category: 'Standard Endodontic / Post-Extraction Regimen',
    items: [
      {
        medicineName: 'Augmentin 625mg',
        dosage: '625 mg',
        form: 'Tablet',
        frequency: '1-0-1 (Twice daily)',
        durationDays: 5,
        timing: 'After food',
        instructions: 'Complete full course. Take after breakfast and dinner.',
      },
      {
        medicineName: 'Zerodol-SP',
        dosage: '100mg/325mg/15mg',
        form: 'Tablet',
        frequency: '1-0-1 (Twice daily)',
        durationDays: 3,
        timing: 'After food',
        instructions: 'Analgesic + anti-inflammatory. Take after meals.',
      },
      {
        medicineName: 'Pan-40 (Pantoprazole)',
        dosage: '40 mg',
        form: 'Tablet',
        frequency: '1-0-0 (Morning)',
        durationDays: 5,
        timing: 'Before food',
        instructions: 'Take 30 mins before breakfast to prevent gastric irritation.',
      },
    ],
  },
  {
    category: 'Acute Odontogenic Infection / Periapical Abscess',
    items: [
      {
        medicineName: 'Amoxicillin 500mg',
        dosage: '500 mg',
        form: 'Capsule',
        frequency: '1-1-1 (Thrice daily)',
        durationDays: 5,
        timing: 'After food',
        instructions: 'Take every 8 hours with water.',
      },
      {
        medicineName: 'Metrogyl 400 (Metronidazole)',
        dosage: '400 mg',
        form: 'Tablet',
        frequency: '1-1-1 (Thrice daily)',
        durationDays: 5,
        timing: 'After food',
        instructions: 'Anaerobic coverage. Strictly avoid alcohol during treatment.',
      },
      {
        medicineName: 'Ketorol-DT',
        dosage: '10 mg',
        form: 'Dispersible Tablet',
        frequency: 'SOS (Max 3 times daily)',
        durationDays: 3,
        timing: 'After food',
        instructions: 'Disperse in 1 teaspoonful of water. For acute pain.',
      },
    ],
  },
  {
    category: 'Periodontal & Gingival Care Protocol',
    items: [
      {
        medicineName: 'Clohex Plus (Chlorhexidine 0.2%)',
        dosage: '10 ml',
        form: 'Mouthwash',
        frequency: '1-0-1 (Twice daily)',
        durationDays: 14,
        timing: 'After brushing',
        instructions: 'Swish 10ml undiluted for 60 seconds; do not rinse with water or eat for 30 mins.',
      },
      {
        medicineName: 'Dologel-CT Oral Gel',
        dosage: 'Pea-sized amount',
        form: 'Oral Gel',
        frequency: '1-1-1 (Thrice daily)',
        durationDays: 5,
        timing: 'Local application',
        instructions: 'Gently massage onto painful gums with clean fingertip.',
      },
    ],
  },
];

@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  getTemplates() {
    return DENTAL_FORMULARY_TEMPLATES;
  }

  async create(clinicId: string, dto: CreatePrescriptionDto, actor: any) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, clinicId },
    });
    if (!patient) throw new NotFoundException('Patient record not found');

    // Generate unique prescription number: RX-YYYY-COUNT
    const currentYear = new Date().getFullYear();
    const count = await this.prisma.prescription.count();
    const prescriptionNumber = `RX-${currentYear}-${String(count + 1).padStart(4, '0')}`;

    const prescription = await this.prisma.prescription.create({
      data: {
        patientId: dto.patientId,
        dentistId: actor.userId,
        consultationId: dto.consultationId || null,
        prescriptionNumber,
        status: 'FINALIZED',
        finalizedAt: new Date(),
        instructions: dto.instructions?.trim() || null,
        dietAdvice: dto.dietAdvice?.trim() || null,
        items: {
          create: dto.items.map(item => ({
            medicineName: item.medicineName.trim(),
            dosage: item.dosage.trim(),
            form: item.form.trim(),
            frequency: item.frequency.trim(),
            durationDays: item.durationDays,
            timing: item.timing.trim(),
            instructions: item.instructions?.trim() || null,
          })),
        },
      },
      include: {
        items: true,
        dentist: { select: { fullName: true, specialization: true, licenseNumber: true } },
        patient: { select: { fullName: true, uhid: true, age: true, gender: true, phone: true, allergies: true } },
      },
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'PRESCRIPTION_CREATED',
      entityType: 'Prescription',
      entityId: prescription.id,
      details: {
        prescriptionNumber,
        patientUhid: patient.uhid,
        itemsCount: prescription.items.length,
      },
    });

    return prescription;
  }

  async findByPatient(clinicId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId },
    });
    if (!patient) throw new NotFoundException('Patient record not found');

    return this.prisma.prescription.findMany({
      where: { patientId },
      include: {
        items: true,
        dentist: { select: { fullName: true, specialization: true, licenseNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(clinicId: string, id: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id },
      include: {
        items: true,
        dentist: { select: { fullName: true, specialization: true, licenseNumber: true } },
        patient: {
          select: {
            clinicId: true,
            fullName: true,
            uhid: true,
            age: true,
            gender: true,
            phone: true,
            address: true,
            allergies: true,
            medicalConditions: true,
          },
        },
      },
    });

    if (!prescription || prescription.patient?.clinicId !== clinicId) {
      throw new NotFoundException('Prescription not found');
    }

    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
    });

    return {
      ...prescription,
      clinic,
    };
  }
}
