import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import {
  User,
  Phone,
  Calendar,
  Clock,
  ShieldAlert,
  HeartPulse,
  Stethoscope,
  ArrowLeft,
  FileText,
  Activity,
  PlusCircle,
  CheckCircle2,
  ClipboardList,
  Receipt,
  CreditCard,
  Printer,
  Camera,
  Archive,
  Mic,
  Volume2,
  Zap,
} from 'lucide-react';
import { TreatmentPlanManager } from '../treatment-plans/TreatmentPlanManager';
import { ProcedureLogger } from '../procedures/ProcedureLogger';
import { PrescriptionDesk } from '../prescriptions/PrescriptionDesk';
import { FdiDentalChart } from '../dental-chart/FdiDentalChart';
import { InvoiceModal } from '../billing/InvoiceModal';
import { PaymentModal } from '../billing/PaymentModal';
import { InvoicePrintModal } from '../billing/InvoicePrintModal';
import { MedicalFilesGallery } from '../imaging/MedicalFilesGallery';
import { PatientConsentDesk } from '../consent/PatientConsentDesk';
import { CaseSheetPhysicalArchive } from './CaseSheetPhysicalArchive';
import { QuickReconsultModal } from '../../components/QuickReconsultModal';
import { useClinicSync, triggerClinicSync } from '../../lib/sync';
import { useAuth } from '../../hooks/useAuth';

export const PatientDetail: React.FC<{ onOpenBookingForPatient?: (patient: any) => void }> = ({
  onOpenBookingForPatient,
}) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [patient, setPatient] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  // Active Tab - 6 clinical tabs including Physical Archive
  const [activeTab, setActiveTab] = useState<'clinical' | 'archive' | 'imaging' | 'prescriptions' | 'billing' | 'consent'>('clinical');
  const [clinicalSubTab, setClinicalSubTab] = useState<'chart' | 'plans' | 'procedures' | 'consultations' | 'appointments'>('chart');

  // Billing state
  const [billingData, setBillingData] = useState<any | null>(null);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<any | null>(null);
  const [printModalInvoice, setPrintModalInvoice] = useState<any | null>(null);
  const [reconsultModalOpen, setReconsultModalOpen] = useState(false);

  const fetchPatient = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await apiRequest(`/patients/${id}`);
      setPatient(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchBilling = async () => {
    if (!id) return;
    try {
      const bData = await apiRequest(`/billing/patient/${id}`);
      setBillingData(bData);
    } catch (err) {
      console.error('Failed to load billing ledger:', err);
    }
  };

  useEffect(() => {
    if (id) {
      fetchPatient(false);
      fetchBilling();
    }
  }, [id]);

  useClinicSync(() => {
    if (id) {
      fetchPatient(true);
      fetchBilling();
    }
  });

  if (loading) {
    return <div className="p-12 text-center text-xs font-bold text-slate-500">Loading patient medical chart...</div>;
  }

  if (!patient) {
    return (
      <div className="p-12 text-center">
        <p className="text-slate-800 font-black text-sm">Patient record not found</p>
        <button
          onClick={() => navigate('/patients')}
          className="mt-3 text-xs text-teal-700 font-extrabold underline cursor-pointer"
        >
          Return to directory
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <button
        onClick={() => navigate('/patients')}
        className="flex items-center gap-1.5 text-xs font-extrabold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4 text-teal-600" />
        Back to Patient Directory
      </button>

      {/* Patient 360 Header Card */}
      <div className="clinic-card p-6 bg-white border border-slate-200 text-slate-900 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-teal-600 flex items-center justify-center text-white font-black text-2xl shadow-xs">
              {patient.fullName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900">{patient.fullName}</h2>
                <span className="font-mono text-xs font-black bg-teal-100 text-teal-900 border border-teal-300 px-2.5 py-0.5 rounded-md">
                  {patient.uhid}
                </span>
                {patient.legacySlNo && (
                  <span className="font-mono text-xs font-black bg-amber-400 text-amber-950 border border-amber-500 px-2.5 py-0.5 rounded-md shadow-2xs flex items-center gap-1">
                    <Archive className="w-3.5 h-3.5 text-amber-900" />
                    Card #{patient.legacySlNo}
                  </span>
                )}
                {patient.voiceNoteUrl && (
                  <span className="text-[11px] font-black text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                    Voice Note Dictated
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs font-bold text-slate-700">
                <span>{patient.age ? `${patient.age} yrs` : 'Age N/A'} • {patient.gender}</span>
                <span>•</span>
                <span>Blood: <strong className="text-slate-900">{patient.bloodGroup || 'Not recorded'}</strong></span>
                <span>•</span>
                <span className="flex items-center gap-1 text-teal-800 font-mono font-black">
                  <Phone className="w-3.5 h-3.5" />
                  {patient.phone}
                </span>
              </div>
              {patient.address && (
                <p className="text-xs text-slate-500 font-medium mt-1">{patient.address}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setReconsultModalOpen(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-xs py-2.5 px-4 rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
              title="Immediate Re-Consultation Check-In to Chair"
            >
              <Stethoscope className="w-3.5 h-3.5 text-white" />
              <span>Re-Consult Today</span>
            </button>
            <button
              onClick={() => onOpenBookingForPatient && onOpenBookingForPatient(patient)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs py-2.5 px-4 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5" />
              Book Appointment
            </button>
            <button
              onClick={() => navigate('/doctor')}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs py-2.5 px-4 rounded-xl border border-slate-300 transition-all cursor-pointer"
            >
              <Stethoscope className="w-3.5 h-3.5 text-teal-600" />
              Doctor Consultation
            </button>
          </div>
        </div>

        {/* Critical Alerts Banner inside Patient Banner */}
        {(patient.allergies?.length > 0 || patient.medicalConditions?.length > 0) && (
          <div className="mt-5 pt-4 border-t border-slate-200 flex flex-wrap items-center gap-3">
            {patient.allergies && (Array.isArray(patient.allergies) ? patient.allergies.length > 0 : Boolean(patient.allergies)) && (
              <div className="flex items-center gap-1.5 bg-rose-100 border border-rose-300 text-rose-900 px-3 py-1 rounded-lg text-xs font-black">
                <ShieldAlert className="w-4 h-4 text-rose-700" />
                <span>Drug Allergies: {Array.isArray(patient.allergies) ? patient.allergies.join(', ') : patient.allergies}</span>
              </div>
            )}
            {patient.medicalConditions && (Array.isArray(patient.medicalConditions) ? patient.medicalConditions.length > 0 : Boolean(patient.medicalConditions)) && (
              <div className="flex items-center gap-1.5 bg-amber-100 border border-amber-300 text-amber-900 px-3 py-1 rounded-lg text-xs font-black">
                <HeartPulse className="w-4 h-4 text-amber-700" />
                <span>Conditions: {Array.isArray(patient.medicalConditions) ? patient.medicalConditions.join(', ') : patient.medicalConditions}</span>
              </div>
            )}
            {patient.currentMedications && (Array.isArray(patient.currentMedications) ? patient.currentMedications.length > 0 : Boolean(patient.currentMedications)) && (
              <div className="text-xs text-slate-700 font-bold">
                Meds: <em>{Array.isArray(patient.currentMedications) ? patient.currentMedications.join(', ') : patient.currentMedications}</em>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Tabs Bar - Fully Responsive Segmented Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 rounded-2xl border border-slate-200 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('clinical')}
          className={`flex items-center gap-1.5 py-2 px-3 sm:px-3.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeTab === 'clinical'
              ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-bold'
          }`}
        >
          <ClipboardList className="w-4 h-4 text-teal-600 shrink-0" />
          <span>Clinical Care & Procedures</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('archive')}
          className={`flex items-center gap-1.5 py-2 px-3 sm:px-3.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeTab === 'archive'
              ? 'bg-amber-500 text-white shadow-xs font-black'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-bold'
          }`}
        >
          <Archive className="w-4 h-4 shrink-0" />
          <span>Physical Card & Archive</span>
          {patient.legacySlNo && (
            <span className="ml-1 px-2 py-0.5 rounded-md bg-white text-amber-950 font-mono text-[10px] font-black">
              #{patient.legacySlNo}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('imaging')}
          className={`flex items-center gap-1.5 py-2 px-3 sm:px-3.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeTab === 'imaging'
              ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-bold'
          }`}
        >
          <Camera className="w-4 h-4 text-teal-600 shrink-0" />
          <span>X-Rays & Imaging</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('prescriptions')}
          className={`flex items-center gap-1.5 py-2 px-3 sm:px-3.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeTab === 'prescriptions'
              ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-bold'
          }`}
        >
          <FileText className="w-4 h-4 text-teal-600 shrink-0" />
          <span>Prescriptions (℞)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('billing')}
          className={`flex items-center gap-1.5 py-2 px-3 sm:px-3.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeTab === 'billing'
              ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-bold'
          }`}
        >
          <Receipt className="w-4 h-4 text-teal-600 shrink-0" />
          <span>Ledger & Invoices</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('consent')}
          className={`flex items-center gap-1.5 py-2 px-3 sm:px-3.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
            activeTab === 'consent'
              ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-bold'
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-teal-600 shrink-0" />
          <span>Digital Consent (DPDP)</span>
        </button>
      </div>

      {/* TAB 1: Clinical Care & Procedures (Sub-grouped) */}
      {activeTab === 'clinical' && (
        <div className="space-y-4">
          {/* Sub-tab pills - Fully Responsive */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200 text-xs font-black mb-4">
            <button
              type="button"
              onClick={() => setClinicalSubTab('chart')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                clinicalSubTab === 'chart'
                  ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80 font-black'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-bold'
              }`}
            >
              Dental Chart (FDI)
            </button>
            <button
              type="button"
              onClick={() => setClinicalSubTab('plans')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                clinicalSubTab === 'plans'
                  ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80 font-black'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-bold'
              }`}
            >
              Treatment Plans
            </button>
            <button
              type="button"
              onClick={() => setClinicalSubTab('procedures')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                clinicalSubTab === 'procedures'
                  ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80 font-black'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-bold'
              }`}
            >
              Completed Procedures
            </button>
            <button
              type="button"
              onClick={() => setClinicalSubTab('consultations')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                clinicalSubTab === 'consultations'
                  ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80 font-black'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-bold'
              }`}
            >
              Consultation Notes ({patient.consultations?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setClinicalSubTab('appointments')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                clinicalSubTab === 'appointments'
                  ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80 font-black'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-bold'
              }`}
            >
              Appointments ({patient.appointments?.length || 0})
            </button>
          </div>

          {clinicalSubTab === 'chart' && (
            <div className="clinic-card p-6 bg-white border border-slate-200 shadow-xs">
              <FdiDentalChart
                patientId={patient.id}
                readOnly={false}
              />
            </div>
          )}

          {clinicalSubTab === 'plans' && (
            <div className="clinic-card p-6 bg-white border border-slate-200 shadow-xs">
              <TreatmentPlanManager
                patientId={patient.id}
                onProcedureCompleted={() => {
                  fetchPatient();
                  fetchBilling();
                }}
              />
            </div>
          )}

          {clinicalSubTab === 'procedures' && (
            <div className="clinic-card p-6 bg-white border border-slate-200 shadow-xs">
              <ProcedureLogger
                patientId={patient.id}
                onOpenBillingWithProcedures={() => {
                  setInvoiceModalOpen(true);
                }}
              />
            </div>
          )}

          {clinicalSubTab === 'consultations' && (
            <div className="space-y-4">
              {(!patient.consultations || patient.consultations.length === 0) ? (
                <div className="clinic-card p-8 text-center text-xs text-slate-500 font-semibold bg-white border border-slate-200">
                  No previous clinical consultations recorded for this patient.
                </div>
              ) : (
                patient.consultations.map((c: any) => (
                  <div key={c.id} className="clinic-card p-5 space-y-3 bg-white border border-slate-200 shadow-xs">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-slate-900">
                          Visit Date: {new Date(c.visitDate).toLocaleDateString('en-IN')}
                        </span>
                        <span className="text-xs text-slate-600 font-bold">• {c.dentistName}</span>
                      </div>
                      {c.isFinalized ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Locked
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-full">
                          Draft
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="font-black text-slate-700 uppercase tracking-wider text-xs">Chief Complaint</span>
                        <p className="text-slate-900 mt-1 font-semibold">{c.chiefComplaint}</p>
                      </div>
                      <div>
                        <span className="font-black text-slate-700 uppercase tracking-wider text-xs">Clinical Diagnosis</span>
                        <p className="text-teal-900 mt-1 font-extrabold">{c.diagnosis}</p>
                      </div>
                    </div>

                    {c.clinicalExamination && (
                      <div className="text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                        <span className="font-black text-slate-700 uppercase tracking-wider text-xs block">
                          Examination Findings
                        </span>
                        <p className="text-slate-800 mt-1 font-medium">{c.clinicalExamination}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {clinicalSubTab === 'appointments' && (
            <div className="clinic-card bg-white border border-slate-200 overflow-hidden shadow-xs">
              {(!patient.appointments || patient.appointments.length === 0) ? (
                <div className="p-8 text-center text-xs text-slate-500 font-semibold">
                  No appointments found for this patient.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-800 font-black text-xs uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Date & Time</th>
                      <th className="py-3 px-4">Treating Doctor</th>
                      <th className="py-3 px-4">Chair</th>
                      <th className="py-3 px-4">Reason</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {patient.appointments.map((a: any) => (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {new Date(a.scheduledStart).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-slate-900 font-bold">{a.dentistName}</td>
                        <td className="py-3 px-4 font-bold text-teal-800">Chair {a.chairNumber}</td>
                        <td className="py-3 px-4 text-slate-700 font-medium">{a.reason}</td>
                        <td className="py-3 px-4">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-slate-100 text-slate-800 border border-slate-300">
                            {a.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Physical Paper Case Sheet Archive & Reappearance */}
      {activeTab === 'archive' && (
        <CaseSheetPhysicalArchive
          patient={patient}
          onRefreshPatient={() => {
            fetchPatient();
            fetchBilling();
          }}
        />
      )}

      {/* TAB 3: Digital Dental Imaging & X-Rays */}
      {activeTab === 'imaging' && (
        <MedicalFilesGallery
          patientId={patient.id}
          patientName={patient.fullName}
          patientUhid={patient.uhid}
        />
      )}

      {/* TAB 4: Prescriptions */}
      {activeTab === 'prescriptions' && (
        <div className="clinic-card p-6 bg-white border border-slate-200 shadow-xs">
          <PrescriptionDesk
            patientId={patient.id}
            patientAllergies={patient.allergies}
          />
        </div>
      )}

      {/* TAB 4: Billing & Financial Ledger */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          {/* Patient Outstanding Ledger Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="clinic-card p-5 bg-blue-50/60 border border-blue-200 text-blue-950">
              <span className="text-xs font-black text-blue-800 uppercase tracking-wider">
                Total Lifetime Billed
              </span>
              <p className="text-2xl font-black font-mono mt-1 text-blue-950">
                ₹{((billingData?.summary?.totalBilledPaise || 0) / 100).toLocaleString('en-IN')}
              </p>
            </div>

            <div className="clinic-card p-5 bg-emerald-50/60 border border-emerald-200 text-emerald-950">
              <span className="text-xs font-black text-emerald-800 uppercase tracking-wider">
                Total Paid / Settled
              </span>
              <p className="text-2xl font-black font-mono mt-1 text-emerald-900">
                ₹{((billingData?.summary?.totalPaidPaise || 0) / 100).toLocaleString('en-IN')}
              </p>
            </div>

            <div className={`clinic-card p-5 ${
              (billingData?.summary?.totalBalancePaise || 0) > 0
                ? 'bg-amber-50/60 border border-amber-300 text-amber-950'
                : 'bg-slate-50 border border-slate-200 text-slate-800'
            }`}>
              <span className="text-xs font-black text-amber-800 uppercase tracking-wider">
                Current Outstanding Balance
              </span>
              <p className={`text-2xl font-black font-mono mt-1 ${
                (billingData?.summary?.totalBalancePaise || 0) > 0 ? 'text-amber-900' : 'text-slate-600'
              }`}>
                ₹{((billingData?.summary?.totalBalancePaise || 0) / 100).toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h4 className="font-black text-slate-900 text-sm">Patient Invoices ({billingData?.invoices?.length || 0})</h4>
            <button
              onClick={() => setInvoiceModalOpen(true)}
              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs py-2 px-4 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Create Tax Invoice
            </button>
          </div>

          {(!billingData?.invoices || billingData.invoices.length === 0) ? (
            <div className="clinic-card p-8 text-center text-xs text-slate-500 font-semibold bg-white border border-slate-200">
              No invoices generated for this patient yet.
            </div>
          ) : (
            <div className="clinic-card bg-white border border-slate-200 overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-800 font-black text-xs uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Total (₹)</th>
                    <th className="py-3 px-4 text-right">Paid (₹)</th>
                    <th className="py-3 px-4 text-right">Balance (₹)</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {billingData.invoices.map((inv: any) => (
                    <tr key={inv.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-teal-800">{inv.invoiceNumber}</td>
                      <td className="py-3 px-4 text-slate-700 font-mono font-medium">
                        {new Date(inv.createdAt).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-extrabold text-slate-900">
                        ₹{(inv.totalPaise / 100).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-800 font-extrabold">
                        ₹{(inv.paidPaise / 100).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-extrabold">
                        <span className={inv.balancePaise > 0 ? 'text-amber-700' : 'text-slate-400'}>
                          ₹{(inv.balancePaise / 100).toLocaleString('en-IN')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase ${
                          inv.status === 'PAID'
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : inv.status === 'PARTIAL'
                            ? 'bg-amber-100 text-amber-900 border border-amber-300'
                            : 'bg-slate-100 text-slate-800 border border-slate-300'
                        }`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        {inv.balancePaise > 0 && (
                          <button
                            onClick={() => setPaymentModalInvoice(inv)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
                          >
                            Collect Payment
                          </button>
                        )}
                        <button
                          onClick={() => setPrintModalInvoice(inv)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-xs py-1.5 px-3 rounded-lg transition-colors cursor-pointer"
                        >
                          Print
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: Digital Informed Consent Forms */}
      {activeTab === 'consent' && (
        <PatientConsentDesk
          patientId={patient.id}
          patientName={patient.fullName}
          patientUhid={patient.uhid}
          patientPhone={patient.phone}
          clinicName={patient.clinic?.name || user?.clinic?.name || 'Dental Clinic'}
        />
      )}

      {/* Global Modals for Patient */}
      <InvoiceModal
        isOpen={invoiceModalOpen}
        onClose={() => setInvoiceModalOpen(false)}
        preSelectedPatient={patient}
        onInvoiceCreated={created => {
          setInvoiceModalOpen(false);
          fetchBilling();
          setPaymentModalInvoice(created);
          triggerClinicSync('invoice_created');
        }}
        onCollectExistingPayment={inv => {
          setInvoiceModalOpen(false);
          setPaymentModalInvoice(inv);
        }}
      />

      <PaymentModal
        isOpen={Boolean(paymentModalInvoice)}
        onClose={() => setPaymentModalInvoice(null)}
        invoice={paymentModalInvoice}
        onPaymentSuccess={() => {
          const inv = paymentModalInvoice;
          setPaymentModalInvoice(null);
          setPrintModalInvoice(inv);
          fetchBilling();
          triggerClinicSync('payment_recorded');
        }}
      />

      <InvoicePrintModal
        isOpen={Boolean(printModalInvoice)}
        onClose={() => setPrintModalInvoice(null)}
        invoice={printModalInvoice}
      />

      {/* Quick Re-Consultation Modal for this Patient */}
      <QuickReconsultModal
        isOpen={reconsultModalOpen}
        onClose={() => setReconsultModalOpen(false)}
        preloadedPatient={patient}
        onPatientSelected={() => {
          fetchPatient(true);
        }}
      />
    </div>
  );
};