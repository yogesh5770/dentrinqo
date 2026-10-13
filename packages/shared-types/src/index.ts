// AKS Elite Dental Clinic - Shared Domain Types and Enums

export enum UserRole {
  CLINIC_ADMIN = 'CLINIC_ADMIN',
  DENTIST = 'DENTIST',
  RECEPTIONIST = 'RECEPTIONIST',
  ACCOUNTANT = 'ACCOUNTANT',
  OTHER_STAFF = 'OTHER_STAFF',
}

export enum AppPermission {
  // Appointments
  APPOINTMENTS_VIEW = 'appointments.view',
  APPOINTMENTS_CREATE = 'appointments.create',
  APPOINTMENTS_MANAGE = 'appointments.manage', // reschedule, cancel, check in, waiting queue, no-shows

  // Patients
  PATIENTS_VIEW = 'patients.view',
  PATIENTS_REGISTER = 'patients.register',
  PATIENTS_UPDATE = 'patients.update',

  // Clinical & Doctor
  CLINICAL_CONSULTATIONS_VIEW = 'clinical.consultations.view',
  CLINICAL_CONSULTATIONS_CREATE = 'clinical.consultations.create',
  CLINICAL_CONSULTATIONS_FINALIZE = 'clinical.consultations.finalize',
  CLINICAL_DENTAL_CHART_VIEW = 'clinical.dental_chart.view',
  CLINICAL_DENTAL_CHART_UPDATE = 'clinical.dental_chart.update',
  CLINICAL_TREATMENT_PLANS_MANAGE = 'clinical.treatment_plans.manage',
  CLINICAL_PROCEDURES_RECORD = 'clinical.procedures.record',
  CLINICAL_PRESCRIPTIONS_CREATE = 'clinical.prescriptions.create',
  CLINICAL_PRESCRIPTIONS_FINALIZE = 'clinical.prescriptions.finalize',
  CLINICAL_PRESCRIPTIONS_PRINT = 'clinical.prescriptions.print',
  CLINICAL_DOCUMENTS_UPLOAD = 'clinical.documents.upload',
  CLINICAL_DOCUMENTS_VIEW = 'clinical.documents.view',

  // Billing
  BILLING_INVOICES_VIEW = 'billing.invoices.view',
  BILLING_INVOICES_CREATE = 'billing.invoices.create',
  BILLING_PAYMENTS_RECORD = 'billing.payments.record',
  BILLING_RECEIPTS_PRINT = 'billing.receipts.print',
  BILLING_REFUNDS_APPROVE = 'billing.refunds.approve',
  BILLING_RECONCILIATION_MANAGE = 'billing.reconciliation.manage',

  // Follow-ups
  FOLLOWUPS_VIEW = 'followups.view',
  FOLLOWUPS_MANAGE = 'followups.manage',

  // Reports
  REPORTS_FINANCIAL_VIEW = 'reports.financial.view',

  // Administration
  STAFF_MANAGE = 'staff.manage',
  SERVICES_PRICING_MANAGE = 'services.pricing.manage',
  SETTINGS_MANAGE = 'settings.manage',
  AUDIT_LOGS_VIEW = 'audit_logs.view',
}

export const ALL_PERMISSIONS = Object.values(AppPermission);

export const DEFAULT_ROLE_PERMISSIONS: Record<string, AppPermission[]> = {
  CLINIC_ADMIN: ALL_PERMISSIONS,
  RECEPTIONIST: [
    AppPermission.APPOINTMENTS_VIEW,
    AppPermission.APPOINTMENTS_CREATE,
    AppPermission.APPOINTMENTS_MANAGE,
    AppPermission.PATIENTS_VIEW,
    AppPermission.PATIENTS_REGISTER,
    AppPermission.PATIENTS_UPDATE,
    AppPermission.BILLING_INVOICES_VIEW,
    AppPermission.BILLING_INVOICES_CREATE,
    AppPermission.BILLING_PAYMENTS_RECORD,
    AppPermission.BILLING_RECEIPTS_PRINT,
    AppPermission.FOLLOWUPS_VIEW,
    AppPermission.FOLLOWUPS_MANAGE,
  ],
  DENTIST: [
    AppPermission.APPOINTMENTS_VIEW,
    AppPermission.PATIENTS_VIEW,
    AppPermission.CLINICAL_CONSULTATIONS_VIEW,
    AppPermission.CLINICAL_CONSULTATIONS_CREATE,
    AppPermission.CLINICAL_CONSULTATIONS_FINALIZE,
    AppPermission.CLINICAL_DENTAL_CHART_VIEW,
    AppPermission.CLINICAL_DENTAL_CHART_UPDATE,
    AppPermission.CLINICAL_TREATMENT_PLANS_MANAGE,
    AppPermission.CLINICAL_PROCEDURES_RECORD,
    AppPermission.CLINICAL_PRESCRIPTIONS_CREATE,
    AppPermission.CLINICAL_PRESCRIPTIONS_FINALIZE,
    AppPermission.CLINICAL_PRESCRIPTIONS_PRINT,
    AppPermission.CLINICAL_DOCUMENTS_UPLOAD,
    AppPermission.CLINICAL_DOCUMENTS_VIEW,
    AppPermission.FOLLOWUPS_VIEW,
  ],
  ACCOUNTANT: [
    AppPermission.BILLING_INVOICES_VIEW,
    AppPermission.BILLING_INVOICES_CREATE,
    AppPermission.BILLING_PAYMENTS_RECORD,
    AppPermission.BILLING_RECEIPTS_PRINT,
    AppPermission.BILLING_RECONCILIATION_MANAGE,
    AppPermission.REPORTS_FINANCIAL_VIEW,
  ],
  OTHER_STAFF: [],
};

export function resolveUserPermissions(role: string, customPermissionsJsonOrArray?: string | string[] | null): string[] {
  if (role === 'CLINIC_ADMIN') {
    return ALL_PERMISSIONS;
  }

  const base = new Set<string>((DEFAULT_ROLE_PERMISSIONS[role] || []));

  if (customPermissionsJsonOrArray) {
    let customList: string[] = [];
    if (Array.isArray(customPermissionsJsonOrArray)) {
      customList = customPermissionsJsonOrArray;
    } else if (typeof customPermissionsJsonOrArray === 'string') {
      try {
        const parsed = JSON.parse(customPermissionsJsonOrArray);
        if (Array.isArray(parsed)) customList = parsed;
      } catch {
        // ignore parse error
      }
    }
    customList.forEach(p => base.add(p));
  }

  return Array.from(base);
}

export interface PermissionGroup {
  name: string;
  permissions: { key: AppPermission; label: string; description: string }[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    name: 'Appointments & Queue',
    permissions: [
      { key: AppPermission.APPOINTMENTS_VIEW, label: 'View Appointments', description: 'Access daily schedules and calendar' },
      { key: AppPermission.APPOINTMENTS_CREATE, label: 'Create Appointments', description: 'Schedule new patient visits' },
      { key: AppPermission.APPOINTMENTS_MANAGE, label: 'Manage Queue & Check-in', description: 'Check-in patients, seat in chair, cancel, reschedule' },
    ],
  },
  {
    name: 'Patients & Records',
    permissions: [
      { key: AppPermission.PATIENTS_VIEW, label: 'View Patients', description: 'Search and open patient demographic records' },
      { key: AppPermission.PATIENTS_REGISTER, label: 'Register Patients', description: 'Add new patient files with auto UHID' },
      { key: AppPermission.PATIENTS_UPDATE, label: 'Update Patient Details', description: 'Edit phone, address, and demographic information' },
    ],
  },
  {
    name: 'Clinical Care & Doctor Desk',
    permissions: [
      { key: AppPermission.CLINICAL_CONSULTATIONS_VIEW, label: 'View Consultations', description: 'Read past clinical notes and diagnoses' },
      { key: AppPermission.CLINICAL_CONSULTATIONS_CREATE, label: 'Conduct Consultations', description: 'Perform examinations and clinical notes' },
      { key: AppPermission.CLINICAL_CONSULTATIONS_FINALIZE, label: 'Finalize Consultations', description: 'Lock consultation records into medical history' },
      { key: AppPermission.CLINICAL_DENTAL_CHART_VIEW, label: 'View Dental Chart', description: 'Inspect interactive FDI odontogram' },
      { key: AppPermission.CLINICAL_DENTAL_CHART_UPDATE, label: 'Update Dental Chart', description: 'Record conditions on specific teeth & surfaces' },
      { key: AppPermission.CLINICAL_TREATMENT_PLANS_MANAGE, label: 'Manage Treatment Plans', description: 'Propose and accept multi-stage dental plans' },
      { key: AppPermission.CLINICAL_PROCEDURES_RECORD, label: 'Log Completed Procedures', description: 'Record executed clinical procedures' },
      { key: AppPermission.CLINICAL_PRESCRIPTIONS_CREATE, label: 'Draft Prescriptions', description: 'Prescribe medications and dosage advice' },
      { key: AppPermission.CLINICAL_PRESCRIPTIONS_FINALIZE, label: 'Finalize Prescriptions', description: 'Sign and issue official doctor prescriptions' },
      { key: AppPermission.CLINICAL_PRESCRIPTIONS_PRINT, label: 'Print Prescriptions', description: 'Generate printable prescription slips' },
      { key: AppPermission.CLINICAL_DOCUMENTS_UPLOAD, label: 'Upload X-Rays & Media', description: 'Upload IOPA, OPG, CBCT, and clinical photos' },
      { key: AppPermission.CLINICAL_DOCUMENTS_VIEW, label: 'View Medical Files', description: 'Access patient imaging and diagnostic scans' },
    ],
  },
  {
    name: 'Billing, Invoices & Collections',
    permissions: [
      { key: AppPermission.BILLING_INVOICES_VIEW, label: 'View Invoices', description: 'Access billing register and patient invoices' },
      { key: AppPermission.BILLING_INVOICES_CREATE, label: 'Generate Invoices', description: 'Create draft and final dental bills' },
      { key: AppPermission.BILLING_PAYMENTS_RECORD, label: 'Record Payments', description: 'Collect cash, UPI, card, and partial installments' },
      { key: AppPermission.BILLING_RECEIPTS_PRINT, label: 'Print Receipts', description: 'Download and print official tax invoices' },
      { key: AppPermission.BILLING_REFUNDS_APPROVE, label: 'Approve Refunds & Adjustments', description: 'Authorize bill adjustments and refunds' },
      { key: AppPermission.BILLING_RECONCILIATION_MANAGE, label: 'Payment Reconciliation', description: 'Reconcile daily settlements and accounts' },
    ],
  },
  {
    name: 'Follow-ups & Reports',
    permissions: [
      { key: AppPermission.FOLLOWUPS_VIEW, label: 'View Follow-ups', description: 'Check patients due for recall visits' },
      { key: AppPermission.FOLLOWUPS_MANAGE, label: 'Manage Follow-ups', description: 'Record call logs and schedule recalls' },
      { key: AppPermission.REPORTS_FINANCIAL_VIEW, label: 'Financial & Analytics Reports', description: 'View clinic revenue, collections & metrics' },
    ],
  },
  {
    name: 'Clinic Administration',
    permissions: [
      { key: AppPermission.STAFF_MANAGE, label: 'Manage Staff Accounts', description: 'Add, edit, deactivate staff & set roles' },
      { key: AppPermission.SERVICES_PRICING_MANAGE, label: 'Services & Pricing', description: 'Configure treatment catalogue and standard fees' },
      { key: AppPermission.SETTINGS_MANAGE, label: 'Clinic Settings', description: 'Modify hospital hours, details & chairs' },
      { key: AppPermission.AUDIT_LOGS_VIEW, label: 'Audit Logs', description: 'Review security compliance and activity trail' },
    ],
  },
];

export enum AppointmentStatus {
  SCHEDULED = 'SCHEDULED',
  CONFIRMED = 'CONFIRMED',
  CHECKED_IN = 'CHECKED_IN',
  IN_CHAIR = 'IN_CHAIR',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export enum ToothSurface {
  OCCLUSAL = 'OCCLUSAL',
  MESIAL = 'MESIAL',
  DISTAL = 'DISTAL',
  BUCCAL = 'BUCCAL',
  LINGUAL = 'LINGUAL',
  INCISAL = 'INCISAL',
  WHOLE_TOOTH = 'WHOLE_TOOTH',
}

export enum ToothCondition {
  HEALTHY = 'HEALTHY',
  CARIES = 'CARIES',
  FILLED_AMALGAM = 'FILLED_AMALGAM',
  FILLED_COMPOSITE = 'FILLED_COMPOSITE',
  CROWN = 'CROWN',
  VENEER = 'VENEER',
  MISSING = 'MISSING',
  IMPACTED = 'IMPACTED',
  ROOT_CANAL_TREATED = 'ROOT_CANAL_TREATED',
  IMPLANT = 'IMPLANT',
  FRACTURED = 'FRACTURED',
  PERIAPICAL_LESION = 'PERIAPICAL_LESION',
  MOBILITY = 'MOBILITY',
}

export enum TreatmentPlanStatus {
  PROPOSED = 'PROPOSED',
  ACCEPTED = 'ACCEPTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  DECLINED = 'DECLINED',
}

export enum ProcedureStatus {
  PLANNED = 'PLANNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum PrescriptionStatus {
  DRAFT = 'DRAFT',
  FINALIZED = 'FINALIZED',
  CANCELLED = 'CANCELLED',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentMethod {
  CASH = 'CASH',
  UPI = 'UPI',
  CARD = 'CARD',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

export enum FileCategory {
  XRAY_IOPA = 'XRAY_IOPA',
  XRAY_OPG = 'XRAY_OPG',
  CBCT = 'CBCT',
  CLINICAL_PHOTO = 'CLINICAL_PHOTO',
  LAB_REPORT = 'LAB_REPORT',
  PATIENT_DOCUMENT = 'PATIENT_DOCUMENT',
}

// User & Auth
export interface UserProfile {
  id: string;
  clinicId: string;
  email: string;
  fullName: string;
  role: UserRole;
  permissions: string[];
  phone?: string | null;
  designation?: string | null;
  department?: string | null;
  employeeId?: string | null;
  licenseNumber?: string | null;
  specialization?: string | null;
  mustChangePassword?: boolean;
  isActive: boolean;
  lastLoginAt?: string | null;
}

export interface AuthSession {
  user: UserProfile;
  token?: string;
}

// Patient
export interface PatientSummary {
  id: string;
  uhid: string;
  fullName: string;
  dateOfBirth?: string | null;
  age?: number | null;
  gender: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  bloodGroup?: string | null;
  allergies: string[];
  medicalConditions: string[];
  currentMedications: string[];
  notes?: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  appointmentCount?: number;
  consultationCount?: number;
  outstandingBalancePaise?: number;
}

// Appointment
export interface AppointmentItem {
  id: string;
  clinicId: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  patientUhid: string;
  dentistId: string;
  dentistName: string;
  chairNumber: number;
  scheduledStart: string;
  scheduledEnd: string;
  durationMinutes: number;
  reason: string;
  status: AppointmentStatus;
  checkInTime?: string | null;
  notes?: string | null;
  createdAt: string;
}

// Consultation
export interface ConsultationItem {
  id: string;
  patientId: string;
  dentistId: string;
  dentistName: string;
  appointmentId?: string | null;
  visitDate: string;
  chiefComplaint: string;
  clinicalExamination: string;
  diagnosis: string;
  clinicalNotes?: string | null;
  isFinalized: boolean;
  finalizedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// Clinic Information
export interface ClinicSettings {
  id: string;
  name: string;
  code: string;
  tagline?: string | null;
  phone: string;
  email?: string | null;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  timezone: string;
  currency: string;
  gstin?: string | null;
  chairCount: number;
  workingHours: {
    weekdays: string;
    sunday: string;
  };
}

// API Response Helper
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ==========================================
// Tracking Contract & Live Queue Telemetry
// ==========================================

export type TrackingDisplayState =
  | 'UNCONFIRMED_DESK'
  | 'WAITING'
  | 'NEXT'
  | 'CALLED'
  | 'IN_CHAIR'
  | 'TREATED'
  | 'BILLED'
  | 'PAID'
  | 'COMPLETED'
  | 'SKIPPED'
  | 'STEPPED_OUT'
  | 'EXPIRED';

export interface ActiveChairTelemetry {
  chairNumber: number;
  tokenNumber: number | null;
  isBusy: boolean;
  isCalling: boolean;
}

export interface PublicTrackingResponse {
  success: boolean;
  tokenNumber: number | null;
  status: string;
  displayState: TrackingDisplayState;
  chairNumber: number;
  expectedChairNumber: number | null;
  isImmediateSeat: boolean;
  isConfirmedAtDesk: boolean;
  isLateArrival?: boolean;
  isEmergency?: boolean;
  
  // CRITICAL CONTRACT RULE:
  // patientsAhead MUST be null for all non-waiting states (TREATED, BILLED, PAID, COMPLETED, CALLED, IN_CHAIR, etc.)
  // It is a valid number ONLY when displayState === 'WAITING' or 'NEXT'
  patientsAhead: number | null;
  
  approxWaitMinutes?: number | null;
  activeChairsServing: ActiveChairTelemetry[];
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
  scheduledStart: string | Date;
  nowServingToken?: number | null;
}

