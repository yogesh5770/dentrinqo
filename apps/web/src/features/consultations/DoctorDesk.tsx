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
  Send,
  Archive,
} from 'lucide-react';
import { TreatmentPlanManager } from '../treatment-plans/TreatmentPlanManager';
import { ProcedureLogger } from '../procedures/ProcedureLogger';
import { PrescriptionDesk } from '../prescriptions/PrescriptionDesk';
import { FdiDentalChart } from '../dental-chart/FdiDentalChart';
import { InvoiceModal } from '../billing/InvoiceModal';
import { PaymentModal } from '../billing/PaymentModal';
import { InvoicePrintModal } from '../billing/InvoicePrintModal';
import { MedicalFilesGallery } from '../imaging/MedicalFilesGallery';
import { QuickReconsultModal } from '../../components/QuickReconsultModal';
import { SpeechToTextDictation } from '../../components/SpeechToTextDictation';
import { NewPatientModal } from '../patients/NewPatientModal';
import { useClinicSync, triggerClinicSync } from '../../lib/sync';
import { useAuth } from '../../hooks/useAuth';

interface DoctorDeskProps {
  defaultTab?: 'examination' | 'chart' | 'treatmentPlans' | 'procedures' | 'prescriptions' | 'imaging';
}

export const DoctorDesk: React.FC<DoctorDeskProps> = ({ defaultTab = 'examination' }) => {
  const { user } = useAuth();
  const doctorDisplayName = user?.fullName || 'Attending Doctor';
  const [todayPatients, setTodayPatients] = useState<any[]>([]);
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);

  // Quick Serial # Re-Consultation & Old Record Digitize State
  const [reconsultModalOpen, setReconsultModalOpen] = useState(false);
  const [reconsultInitialSerial, setReconsultInitialSerial] = useState('');
  const [digitizeModalOpen, setDigitizeModalOpen] = useState(false);
  const [digitizeInitialSerial, setDigitizeInitialSerial] = useState('');
  const [quickSerialInput, setQuickSerialInput] = useState('');

  const handleQuickSerialLookup = (serial: string) => {
    if (!serial.trim()) return;
    setReconsultInitialSerial(serial.trim());
    setReconsultModalOpen(true);
    setQuickSerialInput('');
  };

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

  const [queueTab, setQueueTab] = useState<'WAITING_IN_CLINIC' | 'ALL_TODAY'>('WAITING_IN_CLINIC');
  const [submittingSendToReception, setSubmittingSendToReception] = useState(false);
  const [totalChairs, setTotalChairs] = useState<number>(() => user?.clinic?.chairCount || 1);
  const [selectedChair, setSelectedChair] = useState<number | 'ALL'>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('doctor_selected_chair') : null;
    return saved ? (saved === 'ALL' ? 'ALL' : Number(saved)) : (user?.clinic?.chairCount === 1 ? 1 : 'ALL');
  });

  const fetchClinicSettings = async () => {
    try {
      const data = await apiRequest<any>('/clinic/settings');
      if (data && data.chairCount) {
        setTotalChairs(data.chairCount);
        if (data.chairCount === 1) {
          setSelectedChair(1);
          if (typeof window !== 'undefined') localStorage.setItem('doctor_selected_chair', '1');
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchClinicSettings();
  }, []);

  const handleSelectChair = (chair: number | 'ALL') => {
    const finalChair = totalChairs === 1 ? 1 : chair;
    setSelectedChair(finalChair);
    if (typeof window !== 'undefined') {
      localStorage.setItem('doctor_selected_chair', String(finalChair));
    }
  };

  const handleCallNextPatient = async (targetAppt?: any) => {
    const waitingList = todayPatients.filter((a: any) =>
      ['CHECKED_IN', 'CALLED'].includes(a.status) &&
      (selectedChair !== 'ALL' ? a.chairNumber === selectedChair : true)
    );
    const apptToCall = targetAppt || waitingList[0];
    if (!apptToCall) {
      alert('No patients currently waiting in the lobby for this operatory chair.');
      return;
    }

    try {
      const chairNum = selectedChair !== 'ALL' ? Number(selectedChair) : (apptToCall.chairNumber || 1);
      await apiRequest(`/appointments/${apptToCall.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'IN_CHAIR', chairNumber: chairNum }),
      });
      triggerClinicSync('appt_IN_CHAIR', { appointmentId: apptToCall.id, chairNumber: chairNum });
      const updated = { ...apptToCall, status: 'IN_CHAIR', chairNumber: chairNum };
      selectPatient(updated);
      fetchDoctorQueue(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to call patient to chair');
    }
  };

  const fetchDoctorQueue = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const data = await apiRequest<any[]>(`/appointments?date=${todayStr}`);
      setTodayPatients(data || []);

      if (data && data.length > 0 && !selectedAppt) {
        // Priority 1: Patient currently IN_CHAIR for this chair
        const chairInChair = data.find((a: any) =>
          a.status === 'IN_CHAIR' && (totalChairs === 1 || selectedChair === 'ALL' || a.chairNumber === selectedChair)
        );
        // Priority 2: Next waiting patient in lobby (CHECKED_IN / CALLED) for this chair
        const chairWaiting = data.find((a: any) =>
          ['CHECKED_IN', 'CALLED'].includes(a.status) && (totalChairs === 1 || selectedChair === 'ALL' || a.chairNumber === selectedChair)
        );
        // Priority 3: Any in-chair or waiting patient across clinic
        const anyInClinic = data.find((a: any) => ['IN_CHAIR', 'CALLED', 'CHECKED_IN'].includes(a.status));

        if (chairInChair) {
          selectPatient(chairInChair);
        } else if (chairWaiting) {
          selectPatient(chairWaiting);
        } else if (anyInClinic) {
          selectPatient(anyInClinic);
        } else {
          // CRITICAL ARCHITECTURAL FIX: NEVER auto-select absent/scheduled patients!
          setSelectedAppt(null);
        }
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

  useClinicSync((ev) => {
    fetchDoctorQueue(true);
    if (!ev || ev.reason === 'clinic_settings_updated') {
      fetchClinicSettings();
    }
  });

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

  const clearChairScreen = () => {
    setSelectedAppt(null);
    setConsultationId(null);
    setChiefComplaint('');
    setClinicalExamination('');
    setDiagnosis('');
    setClinicalNotes('');
    setIsFinalized(false);
    setMessage(null);
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
    if (!selectedAppt || submittingCheckout || saving) return;
    if (selectedAppt.status === 'COMPLETED') {
      alert('This patient visit is already completed and sent to the Billing Desk.');
      return;
    }
    setSubmittingCheckout(true);
    try {
      // 1. Auto-save consultation examination notes if doctor typed anything
      if (chiefComplaint || diagnosis || clinicalNotes) {
        try {
          await apiRequest('/consultations', {
            method: 'POST',
            body: JSON.stringify({
              patientId: selectedAppt.patientId,
              appointmentId: selectedAppt.id,
              chiefComplaint: chiefComplaint || selectedAppt.reason || 'General Dental Consultation',
              clinicalExamination,
              diagnosis,
              clinicalNotes,
              isFinalized: true,
            }),
          });
          setIsFinalized(true);
        } catch (e) {
          // ignore duplicate save
        }
      }

      // 2. Check if unbilled procedures already exist for this patient
      const unbilled = await apiRequest<any[]>(`/procedures/patient/${selectedAppt.patientId}?unbilledOnly=true`).catch(() => []);
      
      if (unbilled && unbilled.length > 0) {
        await apiRequest(`/appointments/${selectedAppt.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'COMPLETED' }),
        });
        const totalRupees = Math.round(
          unbilled.reduce((sum, p) => sum + (p.treatmentPlanItem?.estimatedCostPaise || p.feePaise || 50000), 0) / 100
        );
        setMessage(`✅ Patient treatment marked COMPLETED with ${unbilled.length} procedure(s) (₹${totalRupees})! Sent to Reception Billing Desk.`);
        
        // Dispatch live sync alerts to reception
        triggerClinicSync('doctor_completed_visit', {
          patientName: selectedAppt.patientName,
          patientId: selectedAppt.patientId,
          patientUhid: selectedAppt.patientUhid,
          patientPhone: selectedAppt.patientPhone,
          doctorName: selectedAppt.dentistName || doctorDisplayName,
          procedureName: unbilled[0]?.procedureName || 'Completed Clinical Treatment',
          toothNumber: unbilled[0]?.toothNumber,
          feeRupees: totalRupees,
        });
        triggerClinicSync('doctor_sent_to_reception', {
          appointmentId: selectedAppt.id,
          patientName: selectedAppt.patientName,
          patientUhid: selectedAppt.patientUhid,
          patientPhone: selectedAppt.patientPhone,
          chairNumber: selectedAppt.chairNumber,
          dentistName: selectedAppt.dentistName || doctorDisplayName,
        });

        // Auto-advance queue to next waiting patient in lobby
        const updatedQueue = todayPatients.map(a => a.id === selectedAppt.id ? { ...a, status: 'COMPLETED' } : a);
        setTodayPatients(updatedQueue);
        const nextWaiting = updatedQueue.find(a => ['CHECKED_IN', 'CALLED'].includes(a.status) && a.id !== selectedAppt.id);
        if (nextWaiting) {
          selectPatient(nextWaiting);
        } else {
          setSelectedAppt({ ...selectedAppt, status: 'COMPLETED' });
        }
        fetchDoctorQueue(true);
        return;
      }

      // 3. No procedures recorded yet -> open quick completion modal with preselected procedure
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
    } finally {
      setSubmittingCheckout(false);
    }
  };

  const handleConfirmQuickComplete = async (withProcedure: boolean) => {
    if (!selectedAppt || submittingCheckout) return;
    if (selectedAppt.status === 'COMPLETED') {
      setQuickCompleteOpen(false);
      alert('This patient visit is already completed and sent to the Billing Desk.');
      return;
    }
    setSubmittingCheckout(true);
    try {
      // 1. Auto-save consultation examination notes if filled
      if (chiefComplaint || diagnosis || clinicalNotes) {
        try {
          await apiRequest('/consultations', {
            method: 'POST',
            body: JSON.stringify({
              patientId: selectedAppt.patientId,
              appointmentId: selectedAppt.id,
              chiefComplaint: chiefComplaint || selectedAppt.reason || 'General Dental Consultation',
              clinicalExamination,
              diagnosis,
              clinicalNotes,
              isFinalized: true,
            }),
          });
          setIsFinalized(true);
        } catch (e) {
          // ignore duplicate save
        }
      }

      // 2. Record procedure if specified
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

      // 3. Mark appointment COMPLETED to instantly free operatory chair
      await apiRequest(`/appointments/${selectedAppt.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'COMPLETED' }),
      });

      setQuickCompleteOpen(false);
      const feeRupees = withProcedure ? quickFeeRupees : 300;
      const summaryMsg = withProcedure 
        ? `✅ Procedure "${quickProcedureName}" (₹${quickFeeRupees}) recorded & sent to Reception Billing Desk!`
        : `✅ Patient consultation marked COMPLETED and sent to Reception Billing Desk!`;
      setMessage(summaryMsg);

      // 4. Dispatch live alerts to Reception Desk
      triggerClinicSync('doctor_completed_visit', {
        patientName: selectedAppt.patientName,
        patientId: selectedAppt.patientId,
        patientUhid: selectedAppt.patientUhid,
        patientPhone: selectedAppt.patientPhone,
        doctorName: selectedAppt.dentistName || doctorDisplayName,
        procedureName: withProcedure ? quickProcedureName : 'General Consultation',
        toothNumber: quickToothNumber,
        feeRupees,
      });
      triggerClinicSync('doctor_sent_to_reception', {
        appointmentId: selectedAppt.id,
        patientName: selectedAppt.patientName,
        patientUhid: selectedAppt.patientUhid,
        patientPhone: selectedAppt.patientPhone,
        chairNumber: selectedAppt.chairNumber,
        dentistName: selectedAppt.dentistName || doctorDisplayName,
      });

      // 5. Auto-advance to next waiting patient in lobby
      const updatedQueue = todayPatients.map(a => a.id === selectedAppt.id ? { ...a, status: 'COMPLETED' } : a);
      setTodayPatients(updatedQueue);
      const nextWaiting = updatedQueue.find(a => ['CHECKED_IN', 'CALLED'].includes(a.status) && a.id !== selectedAppt.id);
      if (nextWaiting) {
        selectPatient(nextWaiting);
      } else {
        setSelectedAppt({ ...selectedAppt, status: 'COMPLETED' });
      }
      fetchDoctorQueue(true);
    } catch (err: any) {
      alert(err?.message || 'Failed to complete visit');
    } finally {
      setSubmittingCheckout(false);
    }
  };

  const handleSendPatientToReception = async () => {
    if (!selectedAppt || submittingSendToReception) return;
    if (selectedAppt.status === 'COMPLETED') {
      alert('This patient visit is already completed and sent to the Billing Desk.');
      return;
    }
    setSubmittingSendToReception(true);
    try {
      // 1. Auto-save consultation examination if filled
      if (chiefComplaint || diagnosis || clinicalNotes) {
        try {
          await apiRequest('/consultations', {
            method: 'POST',
            body: JSON.stringify({
              patientId: selectedAppt.patientId,
              appointmentId: selectedAppt.id,
              chiefComplaint: chiefComplaint || selectedAppt.reason || 'General Dental Consultation',
              clinicalExamination,
              diagnosis,
              clinicalNotes,
              isFinalized: true,
            }),
          });
        } catch (e) {
          // ignore duplicate save
        }
      }

      // 2. Mark appointment completed so chair is instantly freed
      await apiRequest(`/appointments/${selectedAppt.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'COMPLETED' }),
      });

      // 3. Dispatch live clinic sync to notify Reception Desk
      triggerClinicSync('doctor_sent_to_reception', {
        appointmentId: selectedAppt.id,
        patientName: selectedAppt.patientName,
        patientUhid: selectedAppt.patientUhid,
        patientPhone: selectedAppt.patientPhone,
        chairNumber: selectedAppt.chairNumber,
        dentistName: selectedAppt.dentistName || 'Duty Dentist',
      });

      setMessage(`📤 Patient "${selectedAppt.patientName}" sent to Reception Desk for checkout & billing! Operatory Chair #${selectedAppt.chairNumber} is now free.`);

      // 4. Update queue state and auto-advance to next checked-in patient
      const updatedQueue = todayPatients.map(a => a.id === selectedAppt.id ? { ...a, status: 'COMPLETED' } : a);
      setTodayPatients(updatedQueue);

      const nextWaiting = updatedQueue.find(a => ['CHECKED_IN', 'CALLED'].includes(a.status) && a.id !== selectedAppt.id);
      if (nextWaiting) {
        selectPatient(nextWaiting);
      } else {
        setSelectedAppt({ ...selectedAppt, status: 'COMPLETED' });
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to send patient to Reception Desk');
    } finally {
      setSubmittingSendToReception(false);
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
        doctorName: selectedAppt.dentistName || doctorDisplayName,
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
      <div className="clinic-card p-5 bg-white border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2.5">
              <Stethoscope className="w-6 h-6 text-teal-600" />
              Doctor Consultation Desk
            </h2>
            <span className="text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-900 border border-teal-200 px-2 py-0.5 rounded-full">
              Live Operatory
            </span>
          </div>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">
            {doctorDisplayName} • Clinical examination, treatment & electronic billing
          </p>
        </div>

        {/* Operatory Room / Chair Selector */}
        <div className="flex flex-wrap items-center gap-2">
          {totalChairs === 1 ? (
            <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 text-teal-900 px-3.5 py-1.5 rounded-xl text-xs font-black shadow-2xs">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-pulse"></span>
              Operatory Chair 1 (Active Unit)
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => handleSelectChair('ALL')}
                className={`px-3 py-1.5 rounded-lg font-black transition cursor-pointer ${
                  selectedChair === 'ALL'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Operatories
              </button>
              {Array.from({ length: totalChairs }, (_, i) => i + 1).map((chairNum) => (
                <button
                  key={chairNum}
                  type="button"
                  onClick={() => handleSelectChair(chairNum)}
                  className={`px-3 py-1.5 rounded-lg font-black transition cursor-pointer ${
                    selectedChair === chairNum
                      ? 'bg-teal-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Chair {chairNum}
                </button>
              ))}
            </div>
          )}

          {selectedAppt && (
            <button
              onClick={() => setInvoiceModalOpen(true)}
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs py-2 px-3.5 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Receipt className="w-3.5 h-3.5" />
              Invoice
            </button>
          )}
        </div>
      </div>

      {/* Mobile Operatory Patient Switcher Bar (< lg) */}
      {(() => {
        const inClinicPatients = todayPatients.filter(a =>
          ['CHECKED_IN', 'CALLED', 'IN_CHAIR'].includes(a.status) &&
          (totalChairs === 1 || selectedChair === 'ALL' || a.chairNumber === selectedChair)
        );
        const upcomingPatients = todayPatients.filter(a =>
          ['SCHEDULED', 'CONFIRMED'].includes(a.status) &&
          (totalChairs === 1 || selectedChair === 'ALL' || a.chairNumber === selectedChair)
        );
        const displayedPatients = queueTab === 'WAITING_IN_CLINIC' ? inClinicPatients : upcomingPatients;

        return (
          <>
            <div className="lg:hidden clinic-card p-4 bg-white border border-slate-200 shadow-xs flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-wider text-teal-800 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Active Consultation • {inClinicPatients.length} in clinic
                </div>
                <div className="text-sm font-black text-slate-900 truncate mt-0.5">
                  {selectedAppt ? selectedAppt.patientName : 'No patient in chair'}
                </div>
                {selectedAppt && (
                  <div className="text-xs text-slate-500 font-mono font-semibold">
                    TOKEN #{selectedAppt.tokenNumber || '—'} • Chair {totalChairs === 1 ? 1 : (selectedAppt.chairNumber || 1)} • {selectedAppt.patientUhid}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setReconsultModalOpen(true)}
                  className="px-2.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-black text-xs flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95"
                  title="Card Serial Number Re-Consultation"
                >
                  <Stethoscope className="w-3.5 h-3.5 text-white" />
                  <span>Card Lookup</span>
                </button>
                <button
                  onClick={() => setMobileQueueOpen(!mobileQueueOpen)}
                  className="px-3 py-2 bg-teal-50 hover:bg-teal-100 text-teal-900 rounded-xl font-black text-xs border border-teal-300 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                >
                  <ClipboardList className="w-4 h-4 text-teal-700" />
                  <span>{mobileQueueOpen ? 'Close' : 'Queue'}</span>
                </button>
              </div>
            </div>

            {/* Expandable Mobile Queue (< lg) */}
            {mobileQueueOpen && (
              <div className="lg:hidden clinic-card p-4 bg-slate-50 border border-teal-300 rounded-2xl shadow-sm space-y-2.5 animate-fadeIn">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="font-black text-xs text-slate-800 uppercase tracking-wider">Select Patient from Queue</span>
                  <div className="flex items-center gap-1 bg-slate-200 p-0.5 rounded-lg text-[10px]">
                    <button
                      type="button"
                      onClick={() => setQueueTab('WAITING_IN_CLINIC')}
                      className={`px-2 py-0.5 rounded font-black cursor-pointer ${queueTab === 'WAITING_IN_CLINIC' ? 'bg-white text-teal-900 shadow-2xs' : 'text-slate-600'}`}
                    >
                      In Clinic ({inClinicPatients.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setQueueTab('ALL_TODAY')}
                      className={`px-2 py-0.5 rounded font-black cursor-pointer ${queueTab === 'ALL_TODAY' ? 'bg-white text-teal-900 shadow-2xs' : 'text-slate-600'}`}
                    >
                      Upcoming ({upcomingPatients.length})
                    </button>
                  </div>
                </div>

                {displayedPatients.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500 font-medium">
                    {queueTab === 'WAITING_IN_CLINIC'
                      ? 'No patients waiting in clinic right now. Patients checked in at Reception will appear here.'
                      : 'No scheduled upcoming appointments remaining today.'}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[380px] overflow-y-auto touch-scroll">
                    {displayedPatients.map(appt => {
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
                            <span className="font-mono text-xs text-amber-950 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md font-black">
                              TOKEN #{appt.tokenNumber || '—'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 font-mono font-bold mt-1">
                            Chair {totalChairs === 1 ? 1 : (appt.chairNumber || 1)} • {appt.patientUhid}
                          </div>
                          <div className="text-xs text-slate-700 font-medium mt-1 line-clamp-1">
                            {appt.reason || 'General Dental Consultation'}
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
          </>
        );
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Today's Patient Queue (Desktop >= lg) */}
        {(() => {
          const inClinicPatients = todayPatients.filter(a =>
            ['CHECKED_IN', 'CALLED', 'IN_CHAIR'].includes(a.status) &&
            (totalChairs === 1 || selectedChair === 'ALL' || a.chairNumber === selectedChair)
          );
          const upcomingPatients = todayPatients.filter(a =>
            ['SCHEDULED', 'CONFIRMED'].includes(a.status) &&
            (totalChairs === 1 || selectedChair === 'ALL' || a.chairNumber === selectedChair)
          );
          const displayedPatients = queueTab === 'WAITING_IN_CLINIC' ? inClinicPatients : upcomingPatients;
          const nextWaitingPatient = inClinicPatients.find(a => ['CHECKED_IN', 'CALLED'].includes(a.status));

          return (
            <div className="hidden lg:block lg:col-span-4 space-y-4">
              {/* Quick Serial # Re-Consult Widget */}
              <div className="p-3 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 rounded-2xl text-white shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs flex items-center gap-1.5">
                    <Stethoscope className="w-3.5 h-3.5 text-amber-200" />
                    Card # Re-Consultation
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDigitizeInitialSerial('');
                      setDigitizeModalOpen(true);
                    }}
                    className="text-[10px] font-black bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded-lg transition cursor-pointer"
                  >
                    + New Card
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={quickSerialInput}
                    onChange={e => setQuickSerialInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleQuickSerialLookup(quickSerialInput);
                      }
                    }}
                    placeholder="Card Serial Number..."
                    className="flex-1 bg-white text-slate-900 font-mono font-black text-xs px-2.5 py-1.5 rounded-xl border-0 focus:outline-none placeholder-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => handleQuickSerialLookup(quickSerialInput)}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl shadow-xs transition cursor-pointer active:scale-95"
                  >
                    Search
                  </button>
                </div>
              </div>

              {/* Patient Queue Card */}
              <div className="clinic-card p-4 bg-white border border-slate-200 shadow-xs space-y-3">
                {/* Header & Tabs */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-black text-sm text-slate-900">Operatory Queue</h3>
                    <p className="text-[11px] text-slate-500 font-medium">
                      {totalChairs === 1 ? 'Operatory Chair 1 queue' : (selectedChair !== 'ALL' ? `Chair #${selectedChair} queue` : 'All clinic chairs')}
                    </p>
                  </div>
                  <span className="text-[10px] font-black uppercase text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                    Live Queue
                  </span>
                </div>

                {/* Big Action: Call Next Patient to Chair */}
                {nextWaitingPatient && (
                  <button
                    type="button"
                    onClick={() => handleCallNextPatient(nextWaitingPatient)}
                    className="w-full py-2.5 px-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-black text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Armchair className="w-4 h-4" />
                    <span>📢 Call Token #{nextWaitingPatient.tokenNumber || '—'} ({nextWaitingPatient.patientName}) to Chair</span>
                  </button>
                )}

                <div className="flex p-1 bg-slate-100 rounded-xl gap-1">
                  <button
                    type="button"
                    onClick={() => setQueueTab('WAITING_IN_CLINIC')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      queueTab === 'WAITING_IN_CLINIC'
                        ? 'bg-white text-teal-900 shadow-xs font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>🏥 In Clinic</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                      inClinicPatients.length > 0 ? 'bg-amber-100 text-amber-900' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {inClinicPatients.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueTab('ALL_TODAY')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      queueTab === 'ALL_TODAY'
                        ? 'bg-white text-teal-900 shadow-xs font-black'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>📅 Upcoming (Not Arrived)</span>
                    <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full font-bold">
                      {upcomingPatients.length}
                    </span>
                  </button>
                </div>

                {displayedPatients.length === 0 ? (
                  <div className="py-8 px-4 text-center">
                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-2">
                      <User className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-slate-800">
                      {queueTab === 'WAITING_IN_CLINIC' ? 'No Patients in Waiting Lobby' : 'No Upcoming Bookings Today'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                      {queueTab === 'WAITING_IN_CLINIC'
                        ? 'Patients physically checked in at Front Desk will appear here with Token numbers.'
                        : 'No additional scheduled visits booked for today.'}
                    </p>
                    {queueTab === 'WAITING_IN_CLINIC' && upcomingPatients.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setQueueTab('ALL_TODAY')}
                        className="mt-3 text-xs font-bold text-teal-700 hover:text-teal-800 underline cursor-pointer"
                      >
                        View {upcomingPatients.length} scheduled visits (Not arrived yet)
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[620px] overflow-y-auto">
                    {queueTab === 'ALL_TODAY' && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 font-medium">
                        ⚠️ These patients have booked appointments, but have <strong>not arrived</strong> at the clinic yet.
                      </div>
                    )}
                    {displayedPatients.map(appt => {
                      const isSelected = selectedAppt?.id === appt.id;
                      const isInChair = appt.status === 'IN_CHAIR';
                      const isCheckedIn = appt.status === 'CHECKED_IN';
                      const isCalled = appt.status === 'CALLED';

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
                            <span className="font-black text-slate-900 text-sm truncate mr-2">{appt.patientName}</span>
                            <span className={`font-mono text-xs px-2 py-0.5 rounded-md font-black shrink-0 ${
                              isInChair
                                ? 'bg-teal-600 text-white shadow-2xs'
                                : isCheckedIn
                                ? 'bg-amber-400 text-slate-950 shadow-2xs'
                                : isCalled
                                ? 'bg-cyan-500 text-slate-950'
                                : 'bg-slate-100 text-slate-700 border border-slate-300'
                            }`}>
                              TOKEN #{appt.tokenNumber || '—'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 font-mono font-bold mt-1">
                            Chair {totalChairs === 1 ? 1 : (appt.chairNumber || 1)} • {appt.patientUhid}
                          </div>
                          <div className="text-xs text-slate-700 font-medium mt-1 line-clamp-1">
                            {appt.reason || 'General Dental Consultation'}
                          </div>
                          <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                            <span className={`font-extrabold ${
                              isInChair ? 'text-teal-700 font-black' : isCheckedIn ? 'text-amber-800' : 'text-slate-600'
                            }`}>
                              {isInChair ? '🟢 IN CHAIR' : isCheckedIn ? '🟡 IN LOBBY' : appt.status}
                            </span>
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
          );
        })()}


        {/* Right Side: Operatory Clinical Workspace */}
        <div className="lg:col-span-8">
          {selectedAppt ? (
            <div className="space-y-4">
              {/* Un-Arrived Scheduled Patient Warning */}
              {['SCHEDULED', 'CONFIRMED'].includes(selectedAppt.status) && (
                <div className="p-4 bg-amber-50 border-2 border-amber-400 rounded-2xl flex items-start gap-3 text-amber-950 font-semibold text-xs shadow-xs animate-fadeIn">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-black text-amber-900 text-sm">PATIENT HAS NOT ARRIVED AT CLINIC YET</h4>
                    <p className="mt-0.5 text-amber-800">
                      This patient has an advance booking scheduled for {new Date(selectedAppt.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, but has <strong>not checked in</strong> at the Front Desk.
                    </p>
                    <p className="mt-1 text-[11px] text-amber-700 font-bold">
                      Clinical procedures and checkout billing are locked until the patient physically arrives at reception.
                    </p>
                  </div>
                </div>
              )}

              {/* Patient Banner */}
              <div className="clinic-card p-5 bg-white border border-slate-200 shadow-xs text-slate-900">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {/* Big Token Number Pill */}
                    <div className="px-3 py-1.5 rounded-xl font-mono text-center border shadow-xs bg-linear-to-r from-amber-400 to-amber-500 text-slate-950 border-amber-500">
                      <div className="text-[9px] uppercase tracking-wider font-extrabold opacity-80">Token</div>
                      <div className="text-base font-black leading-tight">#{selectedAppt.tokenNumber || '—'}</div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2.5">
                        <h3 className="font-black text-lg text-slate-900">{selectedAppt.patientName}</h3>
                        <span className="font-mono text-xs font-black text-teal-900 bg-teal-100 border border-teal-300 px-2.5 py-0.5 rounded-md">
                          {selectedAppt.patientUhid}
                        </span>
                        {selectedAppt.status === 'IN_CHAIR' && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-teal-100 text-teal-900 border border-teal-300 animate-pulse">
                            🟢 In Chair #{totalChairs === 1 ? 1 : (selectedAppt.chairNumber || 1)}
                          </span>
                        )}
                        {selectedAppt.status === 'CHECKED_IN' && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                            🟡 Waiting in Lobby
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 font-semibold mt-1">
                        Phone: <a href={`tel:${selectedAppt.patientPhone}`} className="font-mono text-teal-700 hover:underline font-bold">{selectedAppt.patientPhone}</a> • Operatory Chair #{totalChairs === 1 ? 1 : (selectedAppt.chairNumber || 1)} • Time: {new Date(selectedAppt.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {selectedAppt.status === 'CHECKED_IN' && (
                      <button
                        type="button"
                        onClick={() => handleCallNextPatient(selectedAppt)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs sm:text-sm rounded-xl shadow-md cursor-pointer transition-all active:scale-95"
                      >
                        <Armchair className="w-4 h-4" />
                        <span>💺 Seat in Chair Now</span>
                      </button>
                    )}

                    {['SCHEDULED', 'CONFIRMED'].includes(selectedAppt.status) && (
                      <span className="text-xs font-bold text-amber-900 bg-amber-100 border border-amber-300 px-3 py-1.5 rounded-xl">
                        ⏳ Awaiting Reception Check-In
                      </span>
                    )}

                    {selectedAppt.status === 'IN_CHAIR' && (
                      <button
                        type="button"
                        disabled={submittingCheckout || submittingSendToReception}
                        onClick={handleDoctorCompleteVisit}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-xs sm:text-sm rounded-xl shadow-md cursor-pointer transition-all active:scale-95"
                        title="Complete consultation, record procedure/fee, free operatory chair, and send patient to Reception Billing"
                      >
                        <Send className="w-4 h-4" />
                        <span>{submittingCheckout ? 'Processing...' : '📤 Complete & Send to Billing Desk'}</span>
                      </button>
                    )}

                    {selectedAppt.status === 'COMPLETED' && (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                          <span>Consultation Completed & Sent to Billing</span>
                        </span>
                        <button
                          type="button"
                          onClick={clearChairScreen}
                          className="px-3 py-1.5 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 text-white transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                          title="Free screen for next patient"
                        >
                          <Armchair className="w-3.5 h-3.5" />
                          <span>Clear Chair Screen</span>
                        </button>
                      </div>
                    )}

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

              {/* Completed & Sent to Billing Hero Banner */}
              {selectedAppt.status === 'COMPLETED' && (
                <div className="clinic-card p-5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border-2 border-emerald-400 rounded-3xl text-emerald-950 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm animate-in fade-in duration-200">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0 shadow-md">
                      <CheckCircle2 className="w-7 h-7" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-wider bg-emerald-200 text-emerald-900 px-2.5 py-0.5 rounded-md">
                          Treatment Finalized
                        </span>
                        <span className="text-xs font-bold text-emerald-800">
                          Operatory Chair #{selectedAppt.chairNumber} is Free
                        </span>
                      </div>
                      <h4 className="text-base font-black text-slate-900 mt-0.5">
                        {selectedAppt.patientName} (Token #{selectedAppt.tokenNumber || '—'}) Dispatched to Billing Desk
                      </h4>
                      <p className="text-xs text-slate-600 font-medium">
                        Consultation record finalized. Reception checkout desk has received the invoice and can now collect payment.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {(() => {
                      const nextWaiting = todayPatients.find(a =>
                        ['CHECKED_IN', 'CALLED'].includes(a.status) && a.id !== selectedAppt.id
                      );
                      if (nextWaiting) {
                        return (
                          <button
                            type="button"
                            onClick={() => handleCallNextPatient(nextWaiting)}
                            className="px-4 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white transition flex items-center gap-2 shadow-md cursor-pointer active:scale-95"
                          >
                            <Armchair className="w-4 h-4" />
                            <span>📢 Call Next: Token #{nextWaiting.tokenNumber || '—'} ({nextWaiting.patientName})</span>
                          </button>
                        );
                      }
                      return null;
                    })()}

                    <button
                      type="button"
                      onClick={clearChairScreen}
                      className="px-4 py-2.5 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 text-white transition flex items-center gap-2 shadow-sm cursor-pointer"
                    >
                      <Armchair className="w-4 h-4" />
                      <span>Ready Chair for Next Patient</span>
                    </button>
                  </div>
                </div>
              )}

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

              {/* Operatory Sub-Tabs - Fully Responsive (Never Cut Off) */}
              <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 rounded-2xl border border-slate-200 mb-4">
                <button
                  type="button"
                  onClick={() => setOperatoryTab('examination')}
                  className={`flex items-center gap-1.5 py-2 px-3 sm:px-3.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    operatoryTab === 'examination'
                      ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-bold'
                  }`}
                >
                  <Activity className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>Clinical Notes</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOperatoryTab('chart')}
                  className={`flex items-center gap-1.5 py-2 px-3 sm:px-3.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    operatoryTab === 'chart'
                      ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-bold'
                  }`}
                >
                  <Smile className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>Dental Chart (FDI)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOperatoryTab('treatmentPlans')}
                  className={`flex items-center gap-1.5 py-2 px-3 sm:px-3.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    operatoryTab === 'treatmentPlans'
                      ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-bold'
                  }`}
                >
                  <ClipboardList className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>Treatment Plans</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOperatoryTab('procedures')}
                  className={`flex items-center gap-1.5 py-2 px-3 sm:px-3.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    operatoryTab === 'procedures'
                      ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-bold'
                  }`}
                >
                  <Stethoscope className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>Procedures</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOperatoryTab('prescriptions')}
                  className={`flex items-center gap-1.5 py-2 px-3 sm:px-3.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    operatoryTab === 'prescriptions'
                      ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-bold'
                  }`}
                >
                  <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>Prescriptions (℞)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOperatoryTab('imaging')}
                  className={`flex items-center gap-1.5 py-2 px-3 sm:px-3.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    operatoryTab === 'imaging'
                      ? 'bg-white text-teal-800 shadow-xs border border-slate-200/80'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-bold'
                  }`}
                >
                  <Activity className="w-4 h-4 text-teal-600 shrink-0" />
                  <span>X-rays & Documents</span>
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
                      <SpeechToTextDictation
                        value={clinicalNotes}
                        onChange={setClinicalNotes}
                        label="Treatment Notes & Plan (Voice Dictation to Text)"
                        placeholder="e.g. Advised Root Canal Treatment and Crown. Speak or type here..."
                        helperText="Converts your voice speech directly to text in real time. No audio files are saved."
                        minRows={3}
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

                    {selectedAppt.status !== 'COMPLETED' ? (
                      <button
                        type="button"
                        disabled={submittingCheckout || saving}
                        onClick={handleDoctorCompleteVisit}
                        className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-black text-xs py-2 px-4 rounded-xl shadow-sm transition-all cursor-pointer active:scale-95"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{submittingCheckout ? 'Processing...' : '📤 Complete & Send to Billing Desk'}</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Sent to Billing Desk
                        </span>
                        <button
                          type="button"
                          onClick={clearChairScreen}
                          className="px-3.5 py-2 rounded-xl text-xs font-black bg-slate-900 hover:bg-slate-800 text-white transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Armchair className="w-3.5 h-3.5" />
                          <span>Close & Ready Chair</span>
                        </button>
                      </div>
                    )}
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
            <div className="clinic-card p-8 sm:p-12 text-center text-slate-500 bg-white border border-slate-200 shadow-xs rounded-3xl space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-200 text-teal-600 mx-auto flex items-center justify-center shadow-inner">
                <Armchair className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-xl font-black text-slate-900">Operatory Room & Chair Ready</h3>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  {selectedChair !== 'ALL' ? `Operatory Chair #${selectedChair}` : 'All Operatories'} • Cleaned, sanitized, and ready for treatment.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto pt-2">
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-center">
                  <span className="text-[10px] font-black uppercase text-amber-800 block">In Waiting Lobby</span>
                  <span className="text-2xl font-black text-amber-950">
                    {todayPatients.filter(a => ['CHECKED_IN', 'CALLED'].includes(a.status)).length}
                  </span>
                </div>
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                  <span className="text-[10px] font-black uppercase text-slate-600 block">Upcoming Bookings</span>
                  <span className="text-2xl font-black text-slate-900">
                    {todayPatients.filter(a => ['SCHEDULED', 'CONFIRMED'].includes(a.status)).length}
                  </span>
                </div>
              </div>

              {(() => {
                const nextWaiting = todayPatients.find(a =>
                  ['CHECKED_IN', 'CALLED'].includes(a.status) &&
                  (selectedChair !== 'ALL' ? a.chairNumber === selectedChair : true)
                );
                if (nextWaiting) {
                  return (
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => handleCallNextPatient(nextWaiting)}
                        className="px-6 py-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-black text-sm rounded-2xl shadow-md transition cursor-pointer active:scale-95 flex items-center gap-2 mx-auto"
                      >
                        <Armchair className="w-4 h-4" />
                        <span>📢 Call Token #{nextWaiting.tokenNumber || '—'} ({nextWaiting.patientName}) to Chair</span>
                      </button>
                    </div>
                  );
                }
                return (
                  <p className="text-xs text-slate-400 font-medium pt-2">
                    No patients currently waiting in the lounge. Patients checked in at Reception will appear here automatically.
                  </p>
                );
              })()}
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

      {/* Quick Serial # Re-Consultation Modal */}
      <QuickReconsultModal
        isOpen={reconsultModalOpen}
        onClose={() => setReconsultModalOpen(false)}
        initialSerialNo={reconsultInitialSerial}
        onPatientSelected={(appt, patient) => {
          fetchDoctorQueue(true);
          selectPatient(appt);
        }}
        onOpenNewPatientWithSerial={(serialNo) => {
          setDigitizeInitialSerial(serialNo);
          setDigitizeModalOpen(true);
        }}
      />

      {/* Digitize Old Card Modal */}
      <NewPatientModal
        isOpen={digitizeModalOpen}
        onClose={() => setDigitizeModalOpen(false)}
        initialMode="LEGACY_ARCHIVE"
        initialSerialNo={digitizeInitialSerial}
        onPatientCreated={() => {
          fetchDoctorQueue(true);
        }}
      />
    </div>
  );
};