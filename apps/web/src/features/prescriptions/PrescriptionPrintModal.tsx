import React from 'react';
import { Printer, X, ShieldAlert, MessageCircle } from 'lucide-react';
import { openWhatsApp, generatePrescriptionWhatsAppText } from '../../lib/whatsapp';
import { useAuth } from '../../hooks/useAuth';
import { useTenant } from '../../hooks/useTenant';

interface PrescriptionPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  prescription: any;
}

export const PrescriptionPrintModal: React.FC<PrescriptionPrintModalProps> = ({
  isOpen,
  onClose,
  prescription,
}) => {
  const { user } = useAuth();
  const { clinic: tenantClinic } = useTenant();

  if (!isOpen || !prescription) return null;

  const handlePrint = () => {
    if (!clinic?.name || clinic.name === 'Dental Clinic') {
      alert('Cannot print prescription: Clinic details are missing from the profile. Please configure clinic profile in settings before printing.');
      return;
    }
    window.print();
  };

  const clinic = prescription.clinic || tenantClinic || user?.clinic || {
    name: "Dental Clinic",
    tagline: "Multispeciality Dental Clinic & Implant Centre",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    postalCode: "",
    gstin: "",
  };

  const doctor = prescription.dentist || {
    fullName: user?.role === 'DENTIST' ? user.fullName : "Dental Surgeon",
    specialization: user?.specialization || "Dental Specialist",
    licenseNumber: user?.licenseNumber || "",
  };

  const patient = prescription.patient || {};

  const handleShareWhatsApp = () => {
    const rawItems = prescription.items || [];
    const meds = rawItems.map((item: any) => ({
      name: item.medicationName || item.name,
      dosage: item.dosage,
      frequency: item.frequency,
      duration: item.duration,
      instructions: item.instructions,
    }));

    const text = generatePrescriptionWhatsAppText({
      clinicName: clinic.name || 'Dental Clinic',
      patientName: patient.fullName || 'Patient',
      uhid: patient.uhid || 'PATIENT',
      prescriptionNumber: prescription.prescriptionNumber || 'RX-001',
      doctorName: doctor.fullName || 'Doctor',
      date: new Date(prescription.createdAt || Date.now()).toLocaleDateString('en-IN'),
      medications: meds,
      generalInstructions: prescription.notes || prescription.instructions,
      clinicPhone: clinic.phone,
    });

    openWhatsApp(patient.phone, text);
  };

  const isDoctorVerified = Boolean(clinic.isDoctorVerified ?? tenantClinic?.isDoctorVerified ?? user?.clinic?.isDoctorVerified ?? false);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden my-8 print:m-0 print:p-0 print:shadow-none print:w-full print:max-w-none">
        {/* Controls - Hidden during print */}
        <div className="flex items-center justify-between p-4 bg-slate-900 text-white print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">Doctor Official Prescription Letterhead</span>
            <span className="text-xs font-mono text-teal-400">({prescription.prescriptionNumber})</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShareWhatsApp}
              disabled={!isDoctorVerified}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs py-1.5 px-3 rounded-lg cursor-pointer transition-all shadow-sm"
              title={isDoctorVerified ? "Send digital prescription text to patient via WhatsApp" : "Prescription sharing locked until doctor details are verified by admin"}
            >
              <MessageCircle className="w-4 h-4" />
              Share on WhatsApp
            </button>
            <button
              onClick={handlePrint}
              disabled={!isDoctorVerified}
              className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs py-1.5 px-3 rounded-lg cursor-pointer transition-all"
              title={isDoctorVerified ? "Print official prescription" : "Prescription printing locked until doctor details are verified by admin"}
            >
              <Printer className="w-4 h-4" />
              Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Lock Banner if Unverified */}
        {!isDoctorVerified && (
          <div className="p-3.5 bg-rose-50 border-b border-rose-200 text-rose-950 text-xs flex items-center gap-3 print:hidden">
            <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <strong className="font-black block">🔒 Official Prescription Printing & Sharing Locked</strong>
              <span className="font-medium text-rose-900">
                Doctor credentials (name, state dental council registration number) and clinic details have not been verified by CLINIC_ADMIN yet. Complete verification in Clinic Settings before issuing prescriptions.
              </span>
            </div>
          </div>
        )}

        {/* PRINTABLE LETTERHEAD CONTENT */}
        <div className="p-8 sm:p-10 font-sans text-slate-800 print:p-6" id="printable-rx">
          {/* Clinic Header */}
          <div className="border-b-2 border-teal-600 pb-4 mb-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <img
                src="/logo.png"
                alt={clinic?.name || "Dental Clinic"}
                className="w-16 h-16 object-contain shrink-0"
              />
              <div>
                <span className="text-2xl font-extrabold tracking-tight text-teal-900 block">
                  {clinic?.name ? clinic.name.toUpperCase() : 'DENTAL CLINIC'}
                </span>
                <p className="text-xs font-semibold text-teal-700 tracking-wide uppercase mt-0.5">
                  {clinic.tagline}
                </p>
                <p className="text-xs text-slate-600 mt-1 max-w-md leading-relaxed">
                  {clinic.address}, {clinic.city}, {clinic.state} - {clinic.postalCode}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  Contact: <strong className="text-slate-800">{clinic.phone}</strong> | Email: {clinic.email}
                </p>
              </div>
            </div>

            <div className="sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
              <h4 className="font-extrabold text-slate-900 text-base">{doctor.fullName}</h4>
              <p className="text-xs text-teal-800 font-semibold">{doctor.specialization}</p>
              <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                Reg No: <strong>{doctor.licenseNumber}</strong>
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Dental Council of Tamil Nadu
              </p>
            </div>
          </div>

          {/* Patient Details Bar */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mb-6 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <span className="text-slate-400 block text-[10px] font-bold uppercase">Patient Name</span>
              <strong className="text-slate-900 text-sm">{patient.fullName}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-bold uppercase">UHID No</span>
              <span className="font-mono font-bold text-teal-800">{patient.uhid}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-bold uppercase">Age / Gender</span>
              <span className="font-semibold text-slate-800">
                {patient.age ? `${patient.age} Yrs` : 'N/A'} / {patient.gender}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] font-bold uppercase">Date of Issue</span>
              <span className="font-mono font-semibold text-slate-800">
                {new Date(prescription.createdAt).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>
          </div>

          {/* Allergy Alert if present */}
          {patient.allergies && patient.allergies.length > 0 && (
            <div className="mb-5 p-2.5 bg-rose-50 border border-rose-300 rounded-lg text-rose-800 text-xs font-semibold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>Known Drug Allergies: <strong>{Array.isArray(patient.allergies) ? patient.allergies.join(', ') : patient.allergies}</strong></span>
            </div>
          )}

          {/* Rx Sign & Table */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-3xl font-serif font-black text-teal-800 italic">℞</span>
              <span className="text-xs uppercase tracking-widest font-bold text-slate-400">Prescription Orders</span>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 w-8">#</th>
                    <th className="py-2.5 px-3">Medicine Name & Formulation</th>
                    <th className="py-2.5 px-3">Dosage</th>
                    <th className="py-2.5 px-3">Frequency</th>
                    <th className="py-2.5 px-3">Duration</th>
                    <th className="py-2.5 px-3">Timing & Instructions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {prescription.items?.map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3 font-bold text-slate-400">{idx + 1}</td>
                      <td className="py-3 px-3">
                        <strong className="text-slate-900 text-sm block">{item.medicineName}</strong>
                        <span className="text-[11px] text-slate-500 font-medium">{item.form}</span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800">{item.dosage}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-800 font-bold text-[11px]">
                          {item.frequency}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800">
                        {item.durationDays} Day{item.durationDays > 1 ? 's' : ''}
                      </td>
                      <td className="py-3 px-3 text-slate-700">
                        <strong className="block text-slate-900">{item.timing}</strong>
                        {item.instructions && (
                          <span className="text-[11px] text-slate-500 italic block mt-0.5">
                            {item.instructions}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Advice & Instructions */}
          {(prescription.instructions || prescription.dietAdvice) && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-8 text-xs space-y-2">
              {prescription.instructions && (
                <div>
                  <strong className="text-slate-800 font-bold uppercase text-[10px] block">Post-Operative Instructions:</strong>
                  <p className="text-slate-700 mt-0.5 leading-relaxed">{prescription.instructions}</p>
                </div>
              )}
              {prescription.dietAdvice && (
                <div className="pt-2 border-t border-slate-200">
                  <strong className="text-slate-800 font-bold uppercase text-[10px] block">Dietary Recommendations:</strong>
                  <p className="text-slate-700 mt-0.5 leading-relaxed">{prescription.dietAdvice}</p>
                </div>
              )}
            </div>
          )}

          {/* Footer & Signature Block */}
          <div className="pt-10 mt-8 border-t border-slate-200 flex items-end justify-between text-xs">
            <div className="text-[11px] text-slate-500 space-y-1">
              <p>• Emergency Helpline: {clinic.phone}</p>
              <p>• Please bring this prescription along for your next follow-up appointment.</p>
              <p>• In case of severe swelling, rash, or drug reaction, discontinue immediately and contact clinic.</p>
            </div>

            <div className="text-center min-w-[200px]">
              <div className="h-14 border-b border-dashed border-slate-400 mb-1 flex items-end justify-center pb-1 text-teal-800 font-serif italic font-bold">
                Dr. A. K. Saravanan
              </div>
              <p className="font-bold text-slate-900 text-xs">{doctor.fullName}</p>
              <p className="text-[10px] text-slate-500">Authorized Signature & Seal</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
