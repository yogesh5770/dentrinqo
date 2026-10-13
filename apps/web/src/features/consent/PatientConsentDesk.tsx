import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../../lib/api';
import { useClinicSync, triggerClinicSync } from '../../lib/sync';
import {
  FileCheck,
  PlusCircle,
  Printer,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  User,
  X,
  FileText,
  AlertCircle,
  Eye,
  Eraser,
  PenTool,
} from 'lucide-react';

export interface PatientConsentRecord {
  id: string;
  clinicId: string;
  patientId: string;
  consentType: string;
  title: string;
  termsText: string;
  signerName: string;
  signerRelationship: string;
  signerPhone?: string | null;
  signatureBase64: string;
  signedAt: string;
  doctorName?: string | null;
  ipAddress?: string | null;
  version: string;
}

export interface ConsentTemplate {
  type: string;
  title: string;
  category: string;
  summary: string;
  terms: string;
}

interface PatientConsentDeskProps {
  patientId: string;
  patientName: string;
  patientUhid: string;
  patientPhone: string;
  clinicName?: string;
}

export const PatientConsentDesk: React.FC<PatientConsentDeskProps> = ({
  patientId,
  patientName,
  patientUhid,
  patientPhone,
  clinicName = 'Dental Clinic',
}) => {
  const [consents, setConsents] = useState<PatientConsentRecord[]>([]);
  const [templates, setTemplates] = useState<ConsentTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Signing Modal State
  const [showSignModal, setShowSignModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ConsentTemplate | null>(null);
  const [customTerms, setCustomTerms] = useState('');
  const [signerName, setSignerName] = useState(patientName);
  const [signerRelationship, setSignerRelationship] = useState('SELF');
  const [signerPhone, setSignerPhone] = useState(patientPhone);
  const [doctorName, setDoctorName] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);

  // View / Print Modal
  const [activeConsentForView, setActiveConsentForView] = useState<PatientConsentRecord | null>(null);

  // Canvas ref for signature
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const fetchConsents = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [consentsData, templatesData] = await Promise.all([
        apiRequest(`/api/consent/patient/${patientId}`),
        templates.length === 0 ? apiRequest('/api/consent/templates') : Promise.resolve(templates),
      ]);
      setConsents(Array.isArray(consentsData) ? consentsData : []);
      if (Array.isArray(templatesData)) setTemplates(templatesData);
    } catch (err) {
      console.error('Failed to load patient consents', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchConsents();
  }, [patientId]);

  useClinicSync(() => {
    fetchConsents(true);
  });

  // Initialize canvas
  useEffect(() => {
    if (showSignModal && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    }
  }, [showSignModal]);

  // Canvas drawing handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasSignature(false);
    }
  };

  const handleOpenSignModal = (tpl: ConsentTemplate) => {
    setSelectedTemplate(tpl);
    setCustomTerms(tpl.terms);
    setSignerName(patientName);
    setSignerRelationship('SELF');
    setSignerPhone(patientPhone);
    setAcknowledged(false);
    setHasSignature(false);
    setShowSignModal(true);
  };

  const handleSaveConsent = async () => {
    if (!canvasRef.current || !hasSignature || !acknowledged || !selectedTemplate) {
      alert('Please complete the signature and check the confirmation box.');
      return;
    }

    setSaving(true);
    try {
      const signatureBase64 = canvasRef.current.toDataURL('image/png');
      await apiRequest('/api/consent', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          consentType: selectedTemplate.type,
          title: selectedTemplate.title,
          termsText: customTerms,
          signerName: signerName.trim(),
          signerRelationship,
          signerPhone: signerPhone.trim() || undefined,
          signatureBase64,
          doctorName: doctorName.trim() || undefined,
        }),
      });

      triggerClinicSync('consent_signed');
      setShowSignModal(false);
      fetchConsents();
    } catch (err: any) {
      alert(err.message || 'Failed to submit consent form');
    } finally {
      setSaving(false);
    }
  };

  const printConsentForm = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100 mb-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            DPDP ACT 2023/2026 COMPLIANT PAPERLESS CONSENT
          </div>
          <h3 className="text-lg font-bold text-slate-900">Digital Patient Consent Forms</h3>
          <p className="text-xs text-slate-500">
            Legally valid informed consents with touch/stylus electronic signature, forensic timestamps, and PDF printing.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {templates.slice(0, 3).map((tpl) => (
            <button
              key={tpl.type}
              onClick={() => handleOpenSignModal(tpl)}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 flex items-center gap-1.5 transition"
            >
              <PenTool className="w-3.5 h-3.5 text-teal-600" />
              Sign {tpl.category}
            </button>
          ))}
          <button
            onClick={() => {
              if (templates.length > 0) handleOpenSignModal(templates[0]);
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm flex items-center gap-1.5 transition"
          >
            <PlusCircle className="w-4 h-4" />
            New Consent Pad
          </button>
        </div>
      </div>

      {/* Available Consent Templates Quick Launch */}
      <div className="bg-slate-50/70 rounded-2xl border border-slate-200/80 p-4">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
          Clinical Consent Templates Library
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.map((tpl) => (
            <div
              key={tpl.type}
              className="bg-white p-3.5 rounded-xl border border-slate-200/90 hover:border-teal-400 hover:shadow-xs transition flex flex-col justify-between"
            >
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                  {tpl.category}
                </span>
                <h5 className="text-xs font-bold text-slate-900 mt-2 line-clamp-1">{tpl.title}</h5>
                <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{tpl.summary}</p>
              </div>
              <button
                onClick={() => handleOpenSignModal(tpl)}
                className="mt-3 w-full py-1.5 px-3 rounded-lg bg-slate-50 hover:bg-teal-50 text-slate-700 hover:text-teal-800 font-semibold text-xs border border-slate-200 flex items-center justify-center gap-1.5 transition"
              >
                <PenTool className="w-3.5 h-3.5 text-teal-600" />
                Open Signature Pad
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Signed Consent Records List */}
      <div>
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
          Signed Consent History ({consents.length})
        </h4>

        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
            Loading signed records...
          </div>
        ) : consents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
            <FileCheck className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-700">No signed consent forms recorded yet</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Select any clinical template above to collect patient signature.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {consents.map((c) => (
              <div
                key={c.id}
                className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs hover:shadow-sm transition flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Legally Signed
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {new Date(c.signedAt).toLocaleString('en-IN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>

                  <h5 className="text-sm font-bold text-slate-900 mt-2">{c.title}</h5>

                  <div className="mt-2 text-xs text-slate-600 space-y-1">
                    <p>
                      <span className="text-slate-400 font-medium">Signer:</span>{' '}
                      <span className="font-semibold text-slate-800">{c.signerName}</span> ({c.signerRelationship})
                    </p>
                    {c.doctorName && (
                      <p>
                        <span className="text-slate-400 font-medium">Attending Dentist:</span>{' '}
                        <span className="font-semibold text-slate-800">{c.doctorName}</span>
                      </p>
                    )}
                  </div>

                  {/* Signature preview badge */}
                  <div className="mt-3 p-2 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Digital Signature
                    </span>
                    <img
                      src={c.signatureBase64}
                      alt="Signature"
                      className="h-9 max-w-[140px] object-contain border-b border-slate-300"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    onClick={() => setActiveConsentForView(c)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center gap-1 transition"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                    View & Print Form
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Signature Pad Interactive Modal */}
      {showSignModal && selectedTemplate && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[95vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                  {selectedTemplate.category}
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">{selectedTemplate.title}</h3>
                <p className="text-xs text-slate-500">Patient: {patientName} • UHID: {patientUhid}</p>
              </div>
              <button
                onClick={() => setShowSignModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Template selector change */}
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Consent Template
                </label>
                <select
                  value={selectedTemplate.type}
                  onChange={(e) => {
                    const match = templates.find((t) => t.type === e.target.value);
                    if (match) {
                      setSelectedTemplate(match);
                      setCustomTerms(match.terms);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                >
                  {templates.map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Informed Terms Preview */}
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Informed Clinical Disclosures & Legal Terms
                </label>
                <textarea
                  rows={6}
                  value={customTerms}
                  onChange={(e) => setCustomTerms(e.target.value)}
                  className="w-full p-3 font-mono text-[11px] leading-relaxed rounded-xl border border-slate-200 bg-slate-50/60 focus:outline-none focus:bg-white"
                />
              </div>

              {/* Signer Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Signer Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Signer Relationship *
                  </label>
                  <select
                    value={signerRelationship}
                    onChange={(e) => setSignerRelationship(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="SELF">Self (Patient)</option>
                    <option value="PARENT">Parent / Legal Guardian</option>
                    <option value="SPOUSE">Spouse</option>
                    <option value="GUARDIAN">Attendant / Relative</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Signer Mobile Phone
                  </label>
                  <input
                    type="tel"
                    value={signerPhone}
                    onChange={(e) => setSignerPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              {/* Signature Canvas Pad */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <PenTool className="w-3.5 h-3.5 text-teal-600" />
                    Touch / Mouse Signature Pad *
                  </label>
                  <button
                    type="button"
                    onClick={clearSignature}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1"
                  >
                    <Eraser className="w-3 h-3" />
                    Clear Signature
                  </button>
                </div>

                <div className="border-2 border-dashed border-slate-300 rounded-2xl bg-white p-1 relative overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    width={560}
                    height={160}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    className="w-full h-40 bg-white cursor-crosshair touch-none rounded-xl"
                  />
                  {!hasSignature && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-300 font-medium">
                      ✍️ Sign with finger, stylus, or mouse here
                    </div>
                  )}
                </div>
              </div>

              {/* Confirmation Acknowledgement */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5 rounded text-teal-600 focus:ring-teal-500 w-4 h-4"
                />
                <span className="text-[11px] text-slate-700 leading-normal">
                  I solemnly declare that the proposed dental treatment, clinical alternatives, anticipated risks, and estimated expenses have been fully explained to me in a language I understand. I grant my free informed consent.
                </span>
              </label>

              {/* Action Buttons */}
              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowSignModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveConsent}
                  disabled={!hasSignature || !acknowledged || saving}
                  className="px-6 py-2 font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-sm disabled:opacity-40 transition flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {saving ? 'Recording Consent...' : 'Sign & Record Consent'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View & Print Single Signed Consent Modal */}
      {activeConsentForView && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[95vh] overflow-y-auto">
            {/* Action Bar (hidden on print) */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between print:hidden">
              <span className="text-xs font-bold text-slate-600">Print Preview</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={printConsentForm}
                  className="px-4 py-2 rounded-xl bg-teal-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm hover:bg-teal-700 transition"
                >
                  <Printer className="w-4 h-4" />
                  Print Document
                </button>
                <button
                  onClick={() => setActiveConsentForView(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Letterhead Document */}
            <div className="p-8 space-y-6 text-slate-900 font-sans print:p-0">
              {/* Header Letterhead */}
              <div className="border-b-2 border-slate-900 pb-4 text-center">
                <h2 className="text-xl font-extrabold uppercase tracking-tight">{clinicName}</h2>
                <p className="text-xs text-slate-500 mt-0.5">Comprehensive Dental Health & Implant Centre</p>
                <h3 className="text-base font-bold mt-4 uppercase underline tracking-wide">
                  {activeConsentForView.title}
                </h3>
              </div>

              {/* Patient Metadata Box */}
              <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200 print:bg-transparent print:border-slate-300">
                <div>
                  <p><span className="font-semibold text-slate-500">Patient Name:</span> {patientName}</p>
                  <p className="mt-1"><span className="font-semibold text-slate-500">UHID:</span> {patientUhid}</p>
                </div>
                <div>
                  <p><span className="font-semibold text-slate-500">Signer Name:</span> {activeConsentForView.signerName} ({activeConsentForView.signerRelationship})</p>
                  <p className="mt-1"><span className="font-semibold text-slate-500">Date & Time:</span> {new Date(activeConsentForView.signedAt).toLocaleString('en-IN')}</p>
                </div>
              </div>

              {/* Terms Content */}
              <div className="space-y-2 text-xs leading-relaxed whitespace-pre-line text-slate-800">
                {activeConsentForView.termsText}
              </div>

              {/* Signatures Row */}
              <div className="pt-8 grid grid-cols-2 gap-8 items-end border-t border-slate-200">
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Patient / Guardian Signature:</p>
                  <div className="h-16 flex items-end">
                    <img
                      src={activeConsentForView.signatureBase64}
                      alt="Signer Signature"
                      className="max-h-14 max-w-[200px] object-contain border-b-2 border-slate-900"
                    />
                  </div>
                  <p className="text-xs font-semibold text-slate-800">{activeConsentForView.signerName}</p>
                </div>

                <div className="space-y-2 text-right">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Attending Dentist Seal:</p>
                  <div className="h-16 flex items-end justify-end">
                    <div className="border-b-2 border-slate-900 w-44 pb-1 font-serif italic text-sm text-slate-700">
                      {activeConsentForView.doctorName || 'Authorized Dentist'}
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">Digital Verification Hash #{activeConsentForView.id.slice(0, 8)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default PatientConsentDesk;
