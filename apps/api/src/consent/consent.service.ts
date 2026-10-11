import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateConsentDto } from './consent.dto';

export interface ConsentTemplate {
  type: string;
  title: string;
  category: string;
  summary: string;
  terms: string;
}

@Injectable()
export class ConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  getTemplates(): ConsentTemplate[] {
    return [
      {
        type: 'GENERAL_DENTAL',
        title: 'General Dental Examination & Local Anesthesia Consent',
        category: 'Routine Care',
        summary: 'Standard informed consent for diagnostic examination, cleanings, and local anesthetic administration.',
        terms: `1. I hereby authorize the treating dentists to perform clinical examination, dental radiography (X-rays), oral prophylaxis, and necessary routine dental procedures.\n2. I understand that local anesthesia may be administered to control pain during treatment. Possible rare side effects of local anesthesia include temporary numbness, minor swelling, or localized bruising.\n3. I have disclosed my complete medical history, including all known allergies, heart conditions, blood pressure, diabetes, bleeding disorders, and current medications.\n4. I agree to follow all post-treatment care instructions provided by the clinic staff.`,
      },
      {
        type: 'ROOT_CANAL',
        title: 'Endodontic Therapy (Root Canal Treatment) Informed Consent',
        category: 'Endodontics',
        summary: 'Informed consent detailing RCT procedure, post-obturation restoration, and potential risks.',
        terms: `1. I understand that Root Canal Therapy (RCT) is intended to save a natural tooth whose pulp tissue is diseased, infected, or damaged.\n2. Procedure & Visits: The procedure involves cleaning, disinfecting, and hermetically sealing the internal root canals. Treatment may require multiple visits depending on the severity of infection.\n3. Crown Requirement: I understand that an endodontically treated tooth becomes brittle and requires a protective coronal restoration (core build-up and ceramic/zirconia crown) to prevent fracture.\n4. Risks & Alternatives: While success rates are high (90-95%), unforeseen complications may include calcified canals, instrument separation, persistent apical infection, or root fracture, which may necessitate apicoectomy or extraction.\n5. Alternative: The primary alternative to RCT is surgical extraction with replacement via implant, bridge, or denture.`,
      },
      {
        type: 'EXTRACTION_SURGICAL',
        title: 'Tooth Extraction & Minor Oral Surgery Consent',
        category: 'Oral Surgery',
        summary: 'Surgical consent for routine extraction, impaction removal, bone grafting, or minor oral surgical interventions.',
        terms: `1. I authorize the oral surgeon / dentist to extract the indicated tooth/teeth and perform necessary wound debridement, bone contouring, and suturing.\n2. Post-Operative Risks: Potential risks include bleeding, localized pain, swelling, transient trismus (limited jaw opening), dry socket (alveolar osteitis), and adjacent tooth restoration dislodgement.\n3. Nerve Proximity (Lower Molars): For mandibular molars and wisdom teeth, I understand the proximity to the inferior alveolar and lingual nerves; temporary or, in rare cases, prolonged numbness of the lip, chin, or tongue may occur.\n4. Post-Op Care: I agree not to smoke, drink through a straw, or perform vigorous rinsing for 24 hours post-extraction, and will take prescribed medications as directed.`,
      },
      {
        type: 'DENTAL_IMPLANT',
        title: 'Dental Implant Placement & Prosthetic Reconstruction Consent',
        category: 'Implantology',
        summary: 'Comprehensive informed consent for titanium implant fixture placement, osseointegration, and crown placement.',
        terms: `1. Purpose: Placement of an endosseous biocompatible implant fixture to replace missing natural tooth root(s).\n2. Healing & Osseointegration: I acknowledge that osseointegration requires a healing period (typically 2 to 6 months) before final prosthetic loading. Success requires strict oral hygiene.\n3. Risks: Potential complications include surgical infection, nerve impingement, sinus membrane perforation, peri-implantitis, or non-integration requiring fixture removal and site grafting.\n4. Patient Responsibility: Smoking, uncontrolled diabetes, and poor plaque control significantly increase implant failure rates. I agree to attend all scheduled follow-up evaluations.`,
      },
      {
        type: 'WHATSAPP_DATA',
        title: 'Digital Patient Communication & Data Privacy Consent (DPDP Act)',
        category: 'Legal & Privacy',
        summary: 'Consent for digital record storage, clinic notifications, and WhatsApp appointment communications.',
        terms: `1. Digital Health Records: In accordance with the Digital Personal Data Protection (DPDP) Act, 2023/2025, I consent to the secure digital storage of my dental health records, X-rays, and invoices on the clinic's encrypted database.\n2. Communication: I consent to receiving appointment reminders, treatment estimates, digital prescriptions, and invoice receipts via WhatsApp and SMS to my registered mobile phone number.\n3. Patient Rights: I understand that I retain the legal right to access my digital medical records, request corrections, or withdraw communication preferences by written notice to the clinic administration.\n4. Confidentiality: The clinic will not sell, rent, or disclose my personal health information to unauthorized third-party advertisers.`,
      },
    ];
  }

  async findByPatient(clinicId: string, patientId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId },
    });
    if (!patient) throw new NotFoundException('Patient record not found');

    return this.prisma.patientConsent.findMany({
      where: { clinicId, patientId },
      orderBy: { signedAt: 'desc' },
    });
  }

  async create(clinicId: string, dto: CreateConsentDto, actor: any, ip?: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, clinicId },
    });
    if (!patient) throw new NotFoundException('Patient record not found');

    const consent = await this.prisma.patientConsent.create({
      data: {
        clinicId,
        patientId: dto.patientId,
        consentType: dto.consentType,
        title: dto.title.trim(),
        termsText: dto.termsText.trim(),
        signerName: dto.signerName.trim(),
        signerRelationship: dto.signerRelationship || 'SELF',
        signerPhone: dto.signerPhone?.trim() || patient.phone,
        signatureBase64: dto.signatureBase64,
        doctorName: dto.doctorName?.trim() || actor.fullName,
        ipAddress: ip || null,
        signedAt: new Date(),
        version: '1.0',
      },
    });

    await this.auditService.log({
      clinicId,
      actorId: actor.userId,
      actorRole: actor.role,
      action: 'PATIENT_CONSENT_SIGNED',
      entityType: 'PatientConsent',
      entityId: consent.id,
      details: {
        patientUhid: patient.uhid,
        consentType: consent.consentType,
        signerName: consent.signerName,
        relationship: consent.signerRelationship,
      },
    });

    return consent;
  }
}
