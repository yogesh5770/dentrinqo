import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import {
  Stethoscope,
  User,
  CheckCircle2,
  Lock,
  Edit3,
  Calendar,
  AlertTriangle,
  History,
  FileText,
  ShieldCheck,
  PlusCircle,
  Save,
  Armchair,
  ClipboardList,
  Receipt,
  Printer,
  Activity,
  X,
  IndianRupee,
  Smile,
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
import { useClinicSync, triggerClinicSync } from '../../lib/sync';

interface DoctorDeskProps {
  defaultTab?: 'examination' | 'chart' | 'treatmentPlans' | 'procedures' | 'prescriptions' | 'imaging';
}

export const DoctorDesk: React.FC<DoctorDeskProps> = ({ defaultTab = 'examination' }) => {
  const [todayPatients, setTodayPatients] = useState<any[]>([]);
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);

  // Operatory Tab
  const [operatoryTab, setOperatoryTab] = useState<
    'examination' | 'chart' | 'treatmentPlans' | 'procedures' | 'prescriptions' | 'imaging'
  >(defaultTab);

  useEffect(() => {
    if (defaultTab) {
      setOperatoryTab(defaultTab);
    }
  }, [defaultTab]);

  // Consultation state
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [clinicalExamination, setClinicalExamination] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [isFinalized, setIsFinalized] = useState(false);
  const [consultationId, setConsultationId] = useState<string | null>(null);

  // Amendment state
  const [showAmendModal, setShowAmendModal] = useState(false);
  const [amendmentReason, setAmendmentReason] = useState('');
  const [amendedDiagnosis, setAmendedDiagnosis] = useState('');
  const [amendedNotes, setAmendedNotes] = useState('');

  // Billing modals
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<any | null>(null);
  const [printModalInvoice, setPrintModalInvoice] = useState<any | null>(null);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Quick Doctor Checkout & Procedure Send to Billing State
  const [quickCompleteOpen, setQuickCompleteOpen] = useState(false);
  const [quickProcedureCode, setQuickProcedureCode] = useState('CONSULTATION');
  const [quickProcedureName, setQuickProcedureName] = useState('General Dental Consultation');
  const [quickToothNumber, setQuickToothNumber] = useState<number | undefined>(undefined);
  const [quickFeeRupees, setQuickFeeRupees] = useState<number>(300);
  const [quickNotes, setQuickNotes] = useState('');
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const [treatmentCatalogue, setTreatmentCatalogue] = useState<any[]>([]);
  const [patientPlans, setPatientPlans] = useState<any[]>([]);

  const fetchDoctorQueue = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const data = await apiRequest<any[]>(`/appointments?date=${todayStr}`);
      setTodayPatients(data || []);
      if (data && data.length > 0 && !selectedAppt) {
        selectPatient(data[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctorQueue(false);
    apiRequest<any[]>('/procedures/catalogue')
      .then(res => setTreatmentCatalogue(res || []))
      .catch(console.error);
  }, []);

  useClinicSync(() => fetchDoctorQueue(true));

  const selectPatient = async (appt: any) => {
    setSelectedAppt(appt);
    setMessage(null);
    setLoading(true);

    try {
      const [consults, plans] = await Promise.all([
        apiRequest<any[]>(`/consultations/patient/${appt.patientId}`).catch(() => []),
        apiRequest<any[]>(`/treatment-plans/patient/${appt.patientId}`).catch(() => []),
      ]);
      setPatientPlans(plans || []);
      const matching = consults?.find(c => c.appointmentId === appt.id) || consults?.[0];

      if (matching) {
        setConsultationId(matching.id);
        setChiefComplaint(matching.chiefComplaint);
        setClinicalExamination(matching.clinicalExamination);
        setDiagnosis(matching.diagnosis);
        setClinicalNotes(matching.clinicalNotes || '');
        setIsFinalized(matching.isFinalized);
      } else {
        setConsultationId(null);
        setChiefComplaint(appt.reason || '');
        setClinicalExamination('');
        setDiagnosis('');
        setClinicalNotes('');
        setIsFinalized(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConsultation = async () => {
    if (!selectedAppt) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await apiRequest<any>('/consultations', {
        method: 'POST',
        body: JSON.stringify({
          patientId: selectedAppt.patientId,
          appointmentId: selectedAppt.id,
          chiefComplaint,
          clinicalExamination,
          diagnosis,
          clinicalNotes,
        }),
      });

      setConsultationId(res.id);
      setMessage('Clinical notes saved successfully.');
      triggerClinicSync('consultation_saved');
    } catch (err: any) {
      setMessage(err?.message || 'Error saving notes');
    } finally {
      setSaving(false);
    }
  };

  const handleFinalizeConsultation = async () => {
    if (!consultationId) {
      setMessage('Please save the clinical draft first.');
      return;
    }
    if (!window.confirm('Finalize this consultation record?')) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      await apiRequest(`/consultations/${consultationId}/finalize`, {
        method: 'PATCH',
      });
      setIsFinalized(true);
      setMessage('Consultation record finalized.');
      triggerClinicSync('consultation_finalized');
    } catch (err: any) {
      setMessage(err?.message || 'Error finalizing consultation');
    } finally {
      setSaving(false);
    }
  };

  const handleAmendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consultationId) return;
    setSaving(true);

    try {
      await apiRequest(`/consultations/${consultationId}/amend`, {
        method: 'POST',
        body: JSON.stringify({
          reason: amendmentReason,
          diagnosis: amendedDiagnosis || diagnosis,
          clinicalNotes: amendedNotes || clinicalNotes,
        }),
      });

      setShowAmendModal(false);
      setDiagnosis(amendedDiagnosis || diagnosis);
      setClinicalNotes(amendedNotes || clinicalNotes);
      setMessage('Consultation record updated successfully.');
      triggerClinicSync('consultation_amended');
    } catch (err: any) {
      alert(err?.message || 'Failed to update record');
    } finally {
      setSaving(false);
    }
  };

  const handleDoctorCompleteVisit = async () => {
    if (!selectedAppt) return;
    try {
      // 1. Check if unbilled procedures already exist for this patient
      const unbilled = await apiRequest<any[]>(`/procedures/patient/${selectedAppt.patientId}?unbilledOnly=true`).catch(() => []);
      
      if (unbilled && unbilled.length > 0) {
        await apiRequest(`/appointments/${selectedAppt.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'COMPLETED' }),
        });
        const totalRupees = Math.round(
          unbilled.reduce((sum, p) => sum + (p.treatmentPlanItem?.estimatedCostPaise || p.feePaise || 50000), 0) / 100
        );
        setMessage(`✅ Patient treatment marked COMPLETED with ${unbilled.length} procedure(s) (₹${totalRupees})! Queued for Reception Billing Desk.`);
        setSelectedAppt({ ...selectedAppt, status: 'COMPLETED' });
        fetchDoctorQueue(true);
        triggerClinicSync('doctor_completed_visit', {
          patientName: selectedAppt.patientName,
          patientId: selectedAppt.patientId,
          patientUhid: selectedAppt.patientUhid,
          patientPhone: selectedAppt.patientPhone,
          doctorName: selectedAppt.dentistName || 'Dr. Khalidh Khan',
          procedureName: unbilled[0]?.procedureName || 'Completed Clinical Treatment',
          toothNumber: unbilled[0]?.toothNumber,
          feeRupees: totalRupees,
        });
        return;
      }

      // 2. No procedures recorded yet -> open quick completion modal
      const defaultProc = treatmentCatalogue.find(
        c => (selectedAppt.reason && c.name.toLowerCase().includes(selectedAppt.reason.toLowerCase())) ||
             (diagnosis && c.name.toLowerCase().includes(diagnosis.toLowerCase()))
      );
      if (defaultProc) {
        setQuickProcedureCode(defaultProc.code);
        setQuickProcedureName(defaultProc.name);
        setQuickFeeRupees(Math.round(defaultProc.standardFeePaise / 100));
      } else {
        setQuickProcedureCode('CONSULTATION');
        setQuickProcedureName(selectedAppt.reason || 'General Dental Consultation');
        setQuickFeeRupees(300);
      }
      setQuickToothNumber(undefined);
      setQuickNotes(diagnosis || clinicalNotes || '');
      setQuickCompleteOpen(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to update status');
    }
  };

  const handleConfirmQuickComplete = async (withProcedure: boolean) => {
    if (!selectedAppt) return;
    setSubmittingCheckout(true);
    try {
      if (withProcedure && quickProcedureName) {
        await apiRequest('/procedures', {
          method: 'POST',
          body: JSON.stringify({
            patientId: selectedAppt.patientId,
            procedureCode: quickProcedureCode,
            procedureName: quickProcedureName,
            toothNumber: quickToothNumber ? Number(quickToothNumber) : undefined,
            notes: quickNotes.trim() || undefined,
            consultationId: consultationId || undefined,
          }),
        });
      }

      await apiRequest(`/appointments/${selectedAppt.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'COMPLETED' }),
      });

      setQuickCompleteOpen(false);
      const summaryMsg = withProcedure 
        ? `✅ Procedure "${quickProcedureName}" (₹${quickFeeRupees}) recorded & sent to Reception Billing Desk!`
        : `✅ Patient consultation marked COMPLETED and queued for checkout!`;
      setMessage(summaryMsg);
      setSelectedAppt({ ...selectedAppt, status: 'COMPLETED' });
      fetchDoctorQueue(true);
      triggerClinicSync('doctor_completed_visit', {
        patientName: selectedAppt.patientName,
        patientId: selectedAppt.patientId,
        patientUhid: selectedAppt.patientUhid,
        patientPhone: selectedAppt.patientPhone,
        doctorName: selectedAppt.dentistName || 'Dr. Khalidh Khan',
        procedureName: withProcedure ? quickProcedureName : 'General Consultation',
        toothNumber: quickToothNumber,
        feeRupees: withProcedure ? quickFeeRupees : 300,
      });
    } catch (err: any) {
      alert(err?.message || 'Failed to complete visit');
    } finally {
      setSubmittingCheckout(false);
    }
  };

  const handleChairsideCompletePlanItem = async (item: any) => {
    if (!selectedAppt) return;
    try {
      await apiRequest('/procedures', {
        method: 'POST',
        body: JSON.stringify({
          patientId: selectedAppt.patientId,
          procedureCode: item.procedureCode,
          procedureName: item.procedureName,
          toothNumber: item.toothNumber,
          treatmentPlanItemId: item.id,
          consultationId: consultationId || undefined,
          notes: `Completed in operatory chair under plan: ${item.planTitle}`,
        }),
      });

      const feeRupees = Math.round((item.estimatedCostPaise || 0) / 100);
      triggerClinicSync('treatment_completed_in_chair', {
        patientName: selectedAppt.patientName,
        patientId: selectedAppt.patientId,
        patientUhid: selectedAppt.patientUhid,
        patientPhone: selectedAppt.patientPhone,
        doctorName: selectedAppt.dentistName || 'Dr. Khalidh Khan',
        procedureName: item.procedureName,
        toothNumber: item.toothNumber,
        feeRupees,
      });

      setMessage(`✅ Procedure "${item.procedureName}" (₹${feeRupees}) recorded as COMPLETED in chair & sent to Reception Billing Desk!`);
      // Refresh treatment plans
      apiRequest<any[]>(`/treatment-plans/patient/${selectedAppt.patientId}`)
        .then(res => setPatientPlans(res || []))
        .catch(() => {});
      fetchDoctorQueue(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to complete procedure in chair');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="clinic-card p-5 bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <Stethoscope className="w-6 h-6 text-teal-600" />
            Doctor Consultation Desk
          </h2>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">
            Dr. Khalidh Khan (BDS, MDS) • Patient Consultations & Procedures
          </p>
        </div>

        {selectedAppt && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setInvoiceModalOpen(true)}
              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs py-2 px-4 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Receipt className="w-3.5 h-3.5" />
              Generate Invoice
            </button>
          </div>
        )}
      </div>

      {/* Mobile Operatory Patient Switcher Bar (< lg) */}
      <div className="lg:hidden clinic-card p-4 bg-white border border-slate-200 shadow-xs flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Active Consultation • {todayPatients.length} in queue
          </div>
          <div className="text-sm font-black text-slate-900 truncate mt-0.5">
            {selectedAppt ? selectedAppt.patientName : 'No patient selected'}
          </div>
          {selectedAppt && (
            <div className="text-xs text-slate-500 font-mono font-semibold">
              Chair {selectedAppt.chairNumber} • {selectedAppt.patientUhid}
            </div>
          )}
        </div>

        <button
          onClick={() => setMobileQueueOpen(!mobileQueueOpen)}
          className="shrink-0 px-3.5 py-2.5 bg-teal-50 hover:bg-teal-100 text-teal-900 rounded-xl font-black text-xs border border-teal-300 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
        >
          <ClipboardList className="w-4 h-4 text-teal-700" />
          <span>{mobileQueueOpen ? 'Close Queue' : 'Switch Patient'}</span>
        </button>
      </div>

      {/* Expandable Mobile Queue (< lg) */}
      {mobileQueueOpen && (
        <div className="lg:hidden clinic-card p-4 bg-slate-50 border border-teal-300 rounded-2xl shadow-sm space-y-2.5 animate-fadeIn">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <span className="font-black text-xs text-slate-800 uppercase tracking-wider">Select Patient from Queue</span>
            <span className="text-xs font-bold text-teal-800 bg-teal-100 px-2 py-0.5 rounded font-mono">
              {todayPatients.length} scheduled
            </span>
          </div>

          {todayPatients.length === 0 ? (
            <p className="text-xs text-slate-500 font-medium py-4 text-center">No patients scheduled today.</p>
          ) : (
            <div className="space-y-2 max-h-[380px] overflow-y-auto touch-scroll">
              {todayPatients.map(appt => {
                const isSelected = selectedAppt?.id === appt.id;
                return (
                  <div
                    key={appt.id}
                    onClick={() => {
                      selectPatient(appt);
                      setMobileQueueOpen(false);
                    }}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-teal-50 border-2 border-teal-600 shadow-xs ring-2 ring-teal-500/20'
                        : 'bg-white border-slate-200 active:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-slate-900 text-sm">{appt.patientName}</span>
                      <span className="font-mono text-xs text-teal-900 bg-teal-100 px-2 py-0.5 rounded font-black">
                        Chair {appt.chairNumber}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 font-mono font-bold mt-1">
                      {appt.patientUhid}
                    </div>
                    <div className="text-xs text-slate-700 font-medium mt-1 line-clamp-1">
                      {appt.reason}
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                      <span className="font-extrabold text-teal-700">{appt.status}</span>
                      <span className="font-mono text-slate-600 font-semibold">
                        {new Date(appt.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Today's Patient Queue (Desktop >= lg) */}
        <div className="hidden lg:block lg:col-span-4 space-y-4">
          <div className="clinic-card p-4 bg-white border border-slate-200 shadow-xs">
            <h3 className="font-black text-sm text-slate-900 mb-3 flex items-center justify-between">
              <span>Today's Patient Queue</span>
              <span className="text-xs text-teal-800 font-extrabold bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                {todayPatients.length} scheduled
              </span>
            </h3>

            {todayPatients.length === 0 ? (
              <p className="text-xs text-slate-500 font-medium py-8 text-center">No patients scheduled today.</p>
            ) : (
              <div className="space-y-2.5 max-h-[620px] overflow-y-auto">
                {todayPatients.map(appt => {
                  const isSelected = selectedAppt?.id === appt.id;
                  return (
                    <div
                      key={appt.id}
                      onClick={() => selectPatient(appt)}
                      className={`p-3.5 rounded-xl border text-xs cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-teal-50 border-2 border-teal-600 shadow-xs ring-2 ring-teal-500/20'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-slate-900 text-sm">{appt.patientName}</span>
                        <span className="font-mono text-xs text-teal-900 bg-teal-100 px-2 py-0.5 rounded font-black">
                          Chair {appt.chairNumber}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 font-mono font-bold mt-1">
                        {appt.patientUhid}
                      </div>
                      <div className="text-xs text-slate-700 font-medium mt-1 line-clamp-1">
                        {appt.reason}
                      </div>
                      <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                        <span className="font-extrabold text-teal-700">{appt.status}</span>
                        <span className="font-mono text-slate-600 font-semibold">
                          {new Date(appt.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Operatory Clinical Workspace */}
        <div className="lg:col-span-8">
          {selectedAppt ? (
            <div className="space-y-4">
              {/* Patient Banner */}
              <div className="clinic-card p-5 bg-white border border-slate-200 shadow-xs text-slate-900">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="font-black text-lg text-slate-900">{selectedAppt.patientName}</h3>
                      <span className="font-mono text-xs font-black text-teal-900 bg-teal-100 border border-teal-300 px-2.5 py-0.5 rounded-md">
                        {selectedAppt.patientUhid}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 font-semibold mt-1">
                      Phone: <a href={`tel:${selectedAppt.patientPhone}`} className="font-mono text-teal-700 hover:underline font-bold">{selectedAppt.patientPhone}</a> • Chair {selectedAppt.chairNumber} • Time: {new Date(selectedAppt.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedAppt.status !== 'COMPLETED' ? (
                      <button
                        type="button"
                        onClick={handleDoctorCompleteVisit}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer transition-all"
                        title="Mark patient procedure completed and notify reception billing desk"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Mark Completed (Send to Billing)</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                        Completed
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setInvoiceModalOpen(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer transition-all"
                      title="Generate official invoice & record payment for this patient"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Bill & Payment</span>
                    </button>

                    {isFinalized ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                        <Lock className="w-3.5 h-3.5 text-emerald-700" />
                        Finalized
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
                        Draft
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Operatory Chairside Treatment Plan Action Bar */}
              {patientPlans && patientPlans.length > 0 && (() => {
                const uncompletedItems: any[] = [];
                patientPlans.forEach(plan => {
                  (plan.items || []).forEach((item: any) => {
                    if (item.status !== 'COMPLETED') {
                      uncompletedItems.push({ ...item, planTitle: plan.title, planId: plan.id });
                    }
                  });
                });
                if (uncompletedItems.length === 0) return null;

                return (
                  <div className="clinic-card p-4 bg-gradient-to-r from-teal-50 via-emerald-50 to-teal-50 border border-teal-200 shadow-xs rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center font-black shrink-0">
                          <ClipboardList className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-black text-xs sm:text-sm text-teal-950 flex items-center gap-2">
                            <span>Chairside Treatment Plan</span>
                            <span className="text-[10px] font-mono bg-teal-200 text-teal-900 px-2 py-0.5 rounded-full font-black">
                              {uncompletedItems.length} Pending Procedure{uncompletedItems.length > 1 ? 's' : ''}
                            </span>
                          </h4>
                          <p className="text-[11px] text-teal-800 font-medium">
                            Click <strong className="text-emerald-800">"⚡ Complete in Chair"</strong> to record work; price and item immediately alert the Reception Billing Desk.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOperatoryTab('treatmentPlans')}
                        className="text-xs font-black text-teal-700 hover:text-teal-900 underline cursor-pointer shrink-0"
                      >
                        Manage Plans →
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {uncompletedItems.map(item => {
                        const itemFeeRupees = Math.round((item.estimatedCostPaise || 0) / 100);
                        return (
                          <div
                            key={item.id}
                            className="p-3 bg-white border border-teal-200/90 rounded-xl shadow-2xs flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="font-black text-slate-900 text-xs truncate flex items-center gap-1.5">
                                {item.toothNumber && (
                                  <span className="font-mono bg-teal-100 text-teal-900 px-1.5 py-0.5 rounded text-[10px] font-black shrink-0">
                                    #{item.toothNumber}
                                  </span>
                                )}
                                <span className="truncate">{item.procedureName}</span>
                              </div>
                              <div className="text-[11px] font-mono font-black text-emerald-700 mt-0.5">
                                ₹{itemFeeRupees.toLocaleString('en-IN')}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleChairsideCompletePlanItem(item)}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] rounded-lg shadow-xs cursor-pointer transition-all flex items-center gap-1 shrink-0"
                              title="Complete in chair & notify reception billing desk"
                            >
                              <Zap className="w-3 h-3 text-amber-300 fill-amber-300" />
                              <span>Complete (₹{itemFeeRupees})</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Operatory Sub-Tabs */}
              <div className="flex items-center gap-1 border-b border-slate-200 text-xs font-bold overflow-x-auto no-scrollbar touch-scroll whitespace-nowrap pb-0.5">
                <button
                  onClick={() => setOperatoryTab('examination')}
                  className={`flex items-center gap-1.5 py-2.5 px-4 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    operatoryTab === 'examination'
                      ? 'border-teal-600 text-teal-800 font-black bg-teal-50/60'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Activity className="w-4 h-4 text-teal-600" />
                  Clinical Notes
                </button>

                <button
                  onClick={() => setOperatoryTab('chart')}
                  className={`flex items-center gap-1.5 py-2.5 px-4 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    operatoryTab === 'chart'
                      ? 'border-teal-600 text-teal-800 font-black bg-teal-50/60'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Smile className="w-4 h-4 text-teal-600" />
                  Dental Chart (FDI)
                </button>

                <button
                  onClick={() => setOperatoryTab('treatmentPlans')}
                  className={`flex items-center gap-1.5 py-2.5 px-4 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    operatoryTab === 'treatmentPlans'
                      ? 'border-teal-600 text-teal-800 font-black bg-teal-50/60'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ClipboardList className="w-4 h-4 text-teal-600" />
                  Treatment Plans
                </button>

                <button
                  onClick={() => setOperatoryTab('procedures')}
                  className={`flex items-center gap-1.5 py-2.5 px-4 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    operatoryTab === 'procedures'
                      ? 'border-teal-600 text-teal-800 font-black bg-teal-50/60'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Stethoscope className="w-4 h-4 text-teal-600" />
                  Procedures
                </button>

                <button
                  onClick={() => setOperatoryTab('prescriptions')}
                  className={`flex items-center gap-1.5 py-2.5 px-4 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    operatoryTab === 'prescriptions'
                      ? 'border-teal-600 text-teal-800 font-black bg-teal-50/60'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-4 h-4 text-teal-600" />
                  Prescriptions (℞)
                </button>

                <button
                  onClick={() => setOperatoryTab('imaging')}
                  className={`flex items-center gap-1.5 py-2.5 px-4 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                    operatoryTab === 'imaging'
                      ? 'border-teal-600 text-teal-800 font-black bg-teal-50/60'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Activity className="w-4 h-4 text-teal-600" />
                  X-rays & Documents
                </button>
              </div>

              {/* TAB 1: Clinical Notes & Diagnosis */}
              {operatoryTab === 'examination' && (
                <div className="clinic-card p-6 bg-white border border-slate-200 shadow-xs space-y-5">
                  {message && (
                    <div className="p-3 bg-teal-50 border border-teal-200 text-teal-900 rounded-xl text-xs font-bold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      <span>{message}</span>
                    </div>
                  )}

                  <div className="space-y-4 text-xs">
                    <div>
                      <label className="block font-black text-slate-800 uppercase tracking-wider mb-1.5 text-xs">
                        Chief Complaint <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        rows={2}
                        disabled={isFinalized}
                        value={chiefComplaint}
                        onChange={e => setChiefComplaint(e.target.value)}
                        placeholder="e.g. Pain in lower right jaw for past 3 days..."
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-900 font-semibold focus:outline-none focus:border-teal-600 focus:bg-white disabled:bg-slate-100"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block font-black text-slate-800 uppercase tracking-wider mb-1.5 text-xs">
                          Clinical Findings
                        </label>
                        <textarea
                          rows={3}
                          disabled={isFinalized}
                          value={clinicalExamination}
                          onChange={e => setClinicalExamination(e.target.value)}
                          placeholder="e.g. Deep cavity on #46, tenderness to percussion..."
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-900 font-semibold focus:outline-none focus:border-teal-600 focus:bg-white disabled:bg-slate-100"
                        />
                      </div>

                      <div>
                        <label className="block font-black text-slate-800 uppercase tracking-wider mb-1.5 text-xs">
                          Diagnosis
                        </label>
                        <textarea
                          rows={3}
                          disabled={isFinalized}
                          value={diagnosis}
                          onChange={e => setDiagnosis(e.target.value)}
                          placeholder="e.g. Irreversible Pulpitis #46..."
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-900 font-semibold focus:outline-none focus:border-teal-600 focus:bg-white disabled:bg-slate-100"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-black text-slate-800 uppercase tracking-wider mb-1.5 text-xs">
                        Treatment Notes & Plan
                      </label>
                      <textarea
                        rows={3}
                        disabled={isFinalized}
                        value={clinicalNotes}
                        onChange={e => setClinicalNotes(e.target.value)}
                        placeholder="e.g. Advised Root Canal Treatment and Crown. Patient agreed to start treatment..."
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-slate-900 font-semibold focus:outline-none focus:border-teal-600 focus:bg-white disabled:bg-slate-100"
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {!isFinalized ? (
                        <>
                          <button
                            type="button"
                            onClick={handleSaveConsultation}
                            disabled={saving}
                            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-black text-xs py-2 px-4 rounded-xl border border-slate-300 transition-all cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                            {saving ? 'Saving...' : 'Save Notes'}
                          </button>

                          {consultationId && (
                            <button
                              type="button"
                              onClick={handleFinalizeConsultation}
                              disabled={saving}
                              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs py-2 px-4 rounded-xl shadow-xs transition-all cursor-pointer"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              Finalize Consultation
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            setAmendedDiagnosis(diagnosis);
                            setAmendedNotes(clinicalNotes);
                            setShowAmendModal(true);
                          }}
                          className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs py-2 px-4 rounded-xl shadow-xs transition-all cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit Record
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => setInvoiceModalOpen(true)}
                      className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs py-2 px-4 rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      Generate Invoice
                    </button>
                  </div>
                </div>
              )}

              {/* TAB: Dental Chart (FDI Odontogram) */}
              {operatoryTab === 'chart' && (
                <div className="clinic-card p-6 bg-white border border-slate-200 shadow-xs">
                  <FdiDentalChart
                    patientId={selectedAppt.patientId}
                    consultationId={consultationId || undefined}
                    readOnly={false}
                  />
                </div>
              )}

              {/* TAB 2: Treatment Plans */}
              {operatoryTab === 'treatmentPlans' && (
                <div className="clinic-card p-6 bg-white border border-slate-200 shadow-xs">
                  <TreatmentPlanManager
                    patientId={selectedAppt.patientId}
                    patientName={selectedAppt.patientName}
                    consultationId={consultationId || undefined}
                    readOnly={false}
                  />
                </div>
              )}

              {/* TAB 4: Procedures */}
              {operatoryTab === 'procedures' && (
                <div className="clinic-card p-6 bg-white border border-slate-200 shadow-xs">
                  <ProcedureLogger
                    patientId={selectedAppt.patientId}
                    consultationId={consultationId || undefined}
                    readOnly={false}
                    onOpenBillingWithProcedures={() => setInvoiceModalOpen(true)}
                  />
                </div>
              )}

              {/* TAB 5: Prescriptions (Rx) */}
              {operatoryTab === 'prescriptions' && (
                <div className="clinic-card p-6 bg-white border border-slate-200 shadow-xs">
                  <PrescriptionDesk
                    patientId={selectedAppt.patientId}
                    consultationId={consultationId || undefined}
                    readOnly={false}
                  />
                </div>
              )}

              {/* TAB: X-rays & Documents */}
              {operatoryTab === 'imaging' && (
                <div className="clinic-card p-6 bg-white border border-slate-200 shadow-xs">
                  <MedicalFilesGallery
                    patientId={selectedAppt.patientId}
                    patientName={selectedAppt.patientName}
                    patientUhid={selectedAppt.patientUhid}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="clinic-card p-12 text-center text-slate-500 bg-white border border-slate-200 shadow-xs">
              <Stethoscope className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-extrabold text-slate-800">No Patient Selected</p>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Select a patient from today's queue on the left to view clinical notes.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* EDIT MODAL */}
      {showAmendModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl text-slate-900">
            <h3 className="font-black text-slate-900 text-base mb-1 flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-amber-600" />
              Edit Consultation Record
            </h3>
            <p className="text-xs text-slate-600 font-medium mb-4">
              Enter reason for updating this record:
            </p>

            <form onSubmit={handleAmendSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-800 block mb-1">
                  Reason for Update <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Added X-ray findings note"
                  value={amendmentReason}
                  onChange={e => setAmendmentReason(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium focus:bg-white focus:border-teal-600"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">Diagnosis</label>
                <input
                  type="text"
                  value={amendedDiagnosis}
                  onChange={e => setAmendedDiagnosis(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium focus:bg-white focus:border-teal-600"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">Treatment Notes</label>
                <textarea
                  rows={3}
                  value={amendedNotes}
                  onChange={e => setAmendedNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium focus:bg-white focus:border-teal-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAmendModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Complete Visit & Send to Billing Modal */}
      {quickCompleteOpen && selectedAppt && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl text-slate-900 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-base text-slate-900">Complete Treatment & Send to Billing</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Record work done and notify reception checkout desk</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickCompleteOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between text-xs">
              <div>
                <span className="font-black text-slate-900">{selectedAppt.patientName}</span>
                <span className="ml-2 font-mono text-[11px] text-teal-800 font-bold bg-teal-100 px-2 py-0.5 rounded">
                  {selectedAppt.patientUhid}
                </span>
              </div>
              <span className="text-slate-500 font-medium">Chair {selectedAppt.chairNumber}</span>
            </div>

            {/* Quick Treatment Select Chips */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700">
                1-Click Quick Select
              </label>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {[
                  { name: 'Root Canal Treatment (RCT)', code: 'RCT-01', fee: 4500 },
                  { name: 'Scaling & Polishing', code: 'PRO-01', fee: 1500 },
                  { name: 'Composite / Light-Cure Filling', code: 'RES-01', fee: 1200 },
                  { name: 'Tooth Extraction', code: 'EXT-01', fee: 1000 },
                  { name: 'Ceramic Crown', code: 'CRN-01', fee: 5000 },
                  { name: 'Routine Dental Consultation', code: 'CONSULTATION', fee: 300 },
                ].map(opt => (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => {
                      setQuickProcedureName(opt.name);
                      setQuickProcedureCode(opt.code);
                      setQuickFeeRupees(opt.fee);
                    }}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      quickProcedureCode === opt.code
                        ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt.name} (₹{opt.fee})
                  </button>
                ))}
              </div>
            </div>

            {/* Procedure Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-black text-slate-800 mb-1">
                  Procedure Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={quickProcedureName}
                  onChange={e => setQuickProcedureName(e.target.value)}
                  placeholder="e.g. Root Canal Treatment..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 font-semibold focus:outline-none focus:border-teal-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block font-black text-slate-800 mb-1">
                  Tooth Number (Optional)
                </label>
                <input
                  type="number"
                  value={quickToothNumber || ''}
                  onChange={e => setQuickToothNumber(e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="e.g. 16, 21, 36, 46..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 font-semibold focus:outline-none focus:border-teal-600 focus:bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-black text-slate-800 mb-1">
                  Fee (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-500 font-bold">₹</span>
                  <input
                    type="number"
                    value={quickFeeRupees}
                    onChange={e => setQuickFeeRupees(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-7 pr-3 py-2 text-slate-900 font-black focus:outline-none focus:border-teal-600 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-black text-slate-800 mb-1">
                  Notes / Observations
                </label>
                <input
                  type="text"
                  value={quickNotes}
                  onChange={e => setQuickNotes(e.target.value)}
                  placeholder="e.g. Completed obturation..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-900 font-semibold focus:outline-none focus:border-teal-600 focus:bg-white"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
              <button
                type="button"
                disabled={submittingCheckout}
                onClick={() => handleConfirmQuickComplete(false)}
                className="w-full sm:w-auto px-4 py-2.5 text-slate-600 hover:text-slate-900 font-bold hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                Skip Procedure (Consultation Only)
              </button>

              <button
                type="button"
                disabled={submittingCheckout}
                onClick={() => handleConfirmQuickComplete(true)}
                className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submittingCheckout ? 'Saving...' : '⚡ Confirm & Send to Billing'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Modals for Selected Patient */}
      {selectedAppt && (
        <>
          <InvoiceModal
            isOpen={invoiceModalOpen}
            onClose={() => setInvoiceModalOpen(false)}
            appointmentId={selectedAppt.id}
            preSelectedPatient={{
              id: selectedAppt.patientId,
              fullName: selectedAppt.patientName,
              uhid: selectedAppt.patientUhid,
            }}
            onInvoiceCreated={created => {
              setInvoiceModalOpen(false);
              setPaymentModalInvoice(created);
              fetchDoctorQueue(true);
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
              fetchDoctorQueue(true);
              triggerClinicSync('payment_success');
            }}
          />

          <InvoicePrintModal
            isOpen={Boolean(printModalInvoice)}
            onClose={() => setPrintModalInvoice(null)}
            invoice={printModalInvoice}
          />
        </>
      )}
    </div>
  );
};