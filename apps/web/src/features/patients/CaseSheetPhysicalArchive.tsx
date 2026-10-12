import React, { useState } from 'react';
import { apiRequest } from '../../lib/api';
import { triggerClinicSync } from '../../lib/sync';
import {
  FileText,
  Edit3,
  Check,
  X,
  Armchair,
  Stethoscope,
  Calendar,
  Clock,
  Upload,
  Camera,
  Archive,
  FolderOpen,
  MapPin,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Mic,
  Volume2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SpeechToTextDictation } from '../../components/SpeechToTextDictation';

interface CaseSheetPhysicalArchiveProps {
  patient: any;
  onRefreshPatient: () => void;
  clinicDoctors?: any[];
}

export const CaseSheetPhysicalArchive: React.FC<CaseSheetPhysicalArchiveProps> = ({
  patient,
  onRefreshPatient,
  clinicDoctors = [],
}) => {
  const navigate = useNavigate();

  // Edit Archive Info state
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [legacySlNo, setLegacySlNo] = useState(patient.legacySlNo || '');
  const [physicalLocation, setPhysicalLocation] = useState(patient.physicalLocation || '');
  const [legacyNotes, setLegacyNotes] = useState(patient.legacyNotes || '');
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Reappearance Modal State
  const [reappearModalOpen, setReappearModalOpen] = useState(false);
  const [selectedChair, setSelectedChair] = useState<number>(1);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [visitReason, setVisitReason] = useState<string>('Follow-up / Review Consultation');
  const [isSubmittingReappear, setIsSubmittingReappear] = useState(false);

  // Upload Scan State
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [scanNotes, setScanNotes] = useState('');
  const [isUploadingScan, setIsUploadingScan] = useState(false);
  const [scans, setScans] = useState<any[]>(patient.medicalFiles?.filter((f: any) => f.category === 'CASE_SHEET_SCAN' || f.category === 'OTHER') || []);

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingInfo(true);
    setInfoMessage(null);
    try {
      await apiRequest(`/patients/${patient.id}/archive-info`, {
        method: 'PATCH',
        body: JSON.stringify({
          legacySlNo: legacySlNo.trim() || null,
          physicalLocation: physicalLocation.trim() || null,
          legacyNotes: legacyNotes.trim() || null,
        }),
      });
      setInfoMessage('Archive information saved successfully.');
      setIsEditingInfo(false);
      onRefreshPatient();
      triggerClinicSync('archive_info_updated', { patientId: patient.id });
    } catch (err: any) {
      setInfoMessage(err?.message || 'Failed to update archive info.');
    } finally {
      setIsSavingInfo(false);
    }
  };

  const handleReappearCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingReappear(true);
    try {
      const res: any = await apiRequest(`/patients/${patient.id}/reappear`, {
        method: 'POST',
        body: JSON.stringify({
          chairNumber: selectedChair,
          dentistId: selectedDoctorId || undefined,
          reason: visitReason.trim() || 'Follow-up Consultation',
        }),
      });

      triggerClinicSync('patient_checked_in', {
        patientId: patient.id,
        appointmentId: res.appointment?.id,
        chairNumber: selectedChair,
        isReappearance: true,
        legacySlNo: patient.legacySlNo,
      });

      setReappearModalOpen(false);
      onRefreshPatient();
      navigate('/doctor');
    } catch (err: any) {
      alert(err?.message || 'Failed to check in reappearance visit.');
    } finally {
      setIsSubmittingReappear(false);
    }
  };

  const handleUploadScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanFile) return;
    setIsUploadingScan(true);
    try {
      const formData = new FormData();
      formData.append('file', scanFile);
      formData.append('patientId', patient.id);
      formData.append('category', 'CASE_SHEET_SCAN');
      if (scanNotes) formData.append('notes', scanNotes);

      const res: any = await apiRequest('/api/medical-files/upload', {
        method: 'POST',
        body: formData,
      });

      setScans(prev => [res, ...prev]);
      setUploadModalOpen(false);
      setScanFile(null);
      setScanNotes('');
      onRefreshPatient();
      triggerClinicSync('case_sheet_uploaded', { patientId: patient.id });
    } catch (err: any) {
      alert(err?.message || 'Failed to upload case sheet scan.');
    } finally {
      setIsUploadingScan(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Card: Physical Case Sheet & Reappearance */}
      <div className="clinic-card p-6 bg-gradient-to-br from-amber-50/80 via-white to-amber-50/40 border-2 border-amber-300 shadow-xs relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-200 text-amber-950 font-black text-xs border border-amber-300">
                <Archive className="w-3.5 h-3.5 text-amber-800" />
                Physical Case Sheet Archive
              </span>
              {patient.legacySlNo ? (
                <span className="font-mono text-base font-black px-3 py-1 rounded-lg bg-amber-500 text-white shadow-2xs">
                  Card #{patient.legacySlNo}
                </span>
              ) : (
                <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-md">
                  No Card # Assigned
                </span>
              )}
              {patient.reappearanceCount > 0 && (
                <span className="text-xs font-black px-2.5 py-1 rounded-md bg-purple-100 text-purple-900 border border-purple-200">
                  {patient.reappearanceCount} Reappearance Visit{patient.reappearanceCount > 1 ? 's' : ''}
                </span>
              )}
            </div>

            <h3 className="text-xl font-black text-slate-900">
              {patient.fullName} — Paper Case Record
            </h3>

            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-700">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-amber-600" />
                Physical Filing Location:
                <strong className="text-slate-900 font-mono">
                  {patient.physicalLocation || 'Cabinet / Drawer Not Set'}
                </strong>
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-500" />
                Last Reappeared:
                <strong className="text-slate-900">
                  {patient.lastReappearanceAt
                    ? new Date(patient.lastReappearanceAt).toLocaleDateString([], {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })
                    : 'First Registration'}
                </strong>
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setReappearModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-teal-700 to-emerald-600 hover:from-teal-800 hover:to-emerald-700 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <Stethoscope className="w-4 h-4" />
              <span>🏥 Check-in (Reappearance Visit)</span>
            </button>

            <button
              onClick={() => setIsEditingInfo(!isEditingInfo)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-xl border border-slate-300 shadow-2xs transition-all cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-slate-600" />
              <span>{isEditingInfo ? 'Cancel' : 'Edit Archive Info'}</span>
            </button>

            <button
              onClick={() => setUploadModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-xs rounded-xl border border-amber-300 shadow-2xs transition-all cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-amber-800" />
              <span>+ Add Case Sheet Photo</span>
            </button>
          </div>
        </div>

        {infoMessage && (
          <div className="mt-4 p-3 bg-emerald-100 border border-emerald-300 rounded-xl text-emerald-950 font-bold text-xs flex items-center justify-between">
            <span>{infoMessage}</span>
            <button onClick={() => setInfoMessage(null)} className="cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Inline Edit Form */}
        {isEditingInfo && (
          <form onSubmit={handleSaveInfo} className="mt-6 pt-6 border-t border-amber-200 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-black text-slate-900 mb-1">
                Physical Case Sheet / Card Serial # (Legacy Sl. No)
              </label>
              <input
                type="text"
                value={legacySlNo}
                onChange={e => setLegacySlNo(e.target.value)}
                placeholder="e.g. 3041 or CS-2019-88"
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-600"
              />
              <p className="text-[10px] text-slate-500 mt-1">Found on the patient's physical yellow/blue card.</p>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-900 mb-1">
                Cabinet / Drawer Location
              </label>
              <input
                type="text"
                value={physicalLocation}
                onChange={e => setPhysicalLocation(e.target.value)}
                placeholder="e.g. Rack B, Section 4"
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-600"
              />
              <p className="text-[10px] text-slate-500 mt-1">Helps assistant retrieve paper card in seconds.</p>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-900 mb-1">
                Legacy Notes & Past Paper Summary
              </label>
              <input
                type="text"
                value={legacyNotes}
                onChange={e => setLegacyNotes(e.target.value)}
                placeholder="e.g. Bridge on 14-16 in 2017, allergic to penicillin"
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-amber-600"
              />
            </div>

            <div className="md:col-span-3 flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditingInfo(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingInfo}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-lg cursor-pointer shadow-xs"
              >
                {isSavingInfo ? 'Saving...' : 'Save Archive Changes'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Grid: Legacy Paper Notes & Physical Card Scans */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Historical Notes from Paper Records */}
        <div className="lg:col-span-6 space-y-4">
          <div className="clinic-card p-5 bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-black text-sm text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-600" />
                Physical Case Sheet Summary Notes
              </h4>
              <button
                onClick={() => setIsEditingInfo(true)}
                className="text-xs font-bold text-teal-700 hover:underline cursor-pointer"
              >
                Edit
              </button>
            </div>

            {patient.legacyNotes ? (
              <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-xl text-xs font-medium text-slate-800 leading-relaxed whitespace-pre-wrap font-sans">
                {patient.legacyNotes}
              </div>
            ) : (
              <div className="p-6 text-center border-2 border-dashed border-slate-200 rounded-xl">
                <FolderOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">No Historical Notes Transcribed Yet</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Click 'Edit' above to transcribe key historical findings, previous root canals, or prosthetics from the paper card.
                </p>
              </div>
            )}
          </div>

          {/* Speech-to-Text Clinical Dictation (No audio files stored) */}
          <div className="clinic-card p-5 bg-white border border-slate-200 shadow-xs space-y-3">
            <SpeechToTextDictation
              value={patient.legacyNotes || ''}
              onChange={async (newText) => {
                await apiRequest(`/patients/${patient.id}/archive-info`, {
                  method: 'PATCH',
                  body: JSON.stringify({ legacyNotes: newText }),
                });
                onRefreshPatient();
              }}
              label="Speech-to-Text Clinical Dictation"
              placeholder="Click 'Start Dictation' to convert your voice into text, or type notes here..."
              helperText="Converts your voice speech directly to text. No audio files are recorded or stored."
              minRows={4}
            />
          </div>

          {/* Reappearance History Log */}
          <div className="clinic-card p-5 bg-white border border-slate-200 shadow-xs">
            <h4 className="font-black text-sm text-slate-900 flex items-center gap-2 mb-3">
              <Clock className="w-4 h-4 text-teal-600" />
              Reappearance Activity
            </h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="font-bold text-slate-900">Total Recorded Reappearances</span>
                  <p className="text-[11px] text-slate-500">Walk-in return visits since digitization</p>
                </div>
                <span className="font-mono text-base font-black text-teal-800 bg-teal-100 px-3 py-1 rounded-lg">
                  {patient.reappearanceCount || 0}
                </span>
              </div>

              {patient.lastReappearanceAt && (
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <div>
                    <span className="font-bold text-slate-900">Most Recent Return Visit</span>
                    <p className="text-[11px] text-slate-500">Last seen in operatory chair</p>
                  </div>
                  <span className="font-mono text-xs font-black text-slate-800">
                    {new Date(patient.lastReappearanceAt).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Physical Case Sheet Photos & Scans */}
        <div className="lg:col-span-6 space-y-4">
          <div className="clinic-card p-5 bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="font-black text-sm text-slate-900 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-teal-600" />
                  Physical Case Sheet Photos & Scans
                </h4>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  Photographs of paper card, handwritten treatment records & old radiographs
                </p>
              </div>

              <button
                onClick={() => setUploadModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Scan</span>
              </button>
            </div>

            {scans.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl">
                <Camera className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-800">No Physical Record Photos Uploaded</p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                  Snap a photo of the patient's paper case sheet or card using a phone camera and upload it here for 100% digital preservation.
                </p>
                <button
                  onClick={() => setUploadModalOpen(true)}
                  className="mt-4 px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs rounded-xl cursor-pointer"
                >
                  + Add First Photo
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 max-h-[420px] overflow-y-auto p-1">
                {scans.map((scan: any) => (
                  <div
                    key={scan.id}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2 group hover:border-teal-500 transition-colors"
                  >
                    <div className="aspect-4/3 bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center relative">
                      <img
                        src={`/api/medical-files/${scan.id}/view`}
                        alt={scan.fileName}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        onError={(e: any) => {
                          e.target.style.display = 'none';
                        }}
                      />
                      <a
                        href={`/api/medical-files/${scan.id}/view`}
                        target="_blank"
                        rel="noreferrer"
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity font-bold gap-1 text-[11px]"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        View High-Res
                      </a>
                    </div>
                    <div>
                      <span className="font-bold text-slate-900 block truncate" title={scan.fileName}>
                        {scan.fileName}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono block">
                        {new Date(scan.uploadedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Check In Reappearance Visit */}
      {reappearModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">Check-In Reappearance Patient</h3>
                  <p className="text-xs text-slate-500">Send patient directly to Doctor Consultation Queue</p>
                </div>
              </div>
              <button
                onClick={() => setReappearModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1">
              <div className="flex items-center justify-between font-black text-slate-900">
                <span>{patient.fullName}</span>
                <span className="font-mono bg-amber-200 text-amber-950 px-2 py-0.5 rounded">
                  Card #{patient.legacySlNo || 'None'}
                </span>
              </div>
              <div className="text-slate-600 text-[11px]">
                UHID: {patient.uhid} • Phone: {patient.phone}
              </div>
            </div>

            <form onSubmit={handleReappearCheckIn} className="space-y-4 text-xs">
              <div>
                <label className="block font-black text-slate-900 mb-1.5">
                  Operatory Chair Selection
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map(chairNum => (
                    <button
                      type="button"
                      key={chairNum}
                      onClick={() => setSelectedChair(chairNum)}
                      className={`py-2 px-3 rounded-xl border text-center font-black transition cursor-pointer ${
                        selectedChair === chairNum
                          ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                          : 'bg-slate-50 text-slate-800 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <Armchair className="w-4 h-4 mx-auto mb-1" />
                      <span>Chair #{chairNum}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-black text-slate-900 mb-1.5">
                  Reason for Today's Visit
                </label>
                <input
                  type="text"
                  value={visitReason}
                  onChange={e => setVisitReason(e.target.value)}
                  placeholder="e.g. Follow-up consultation, Toothache, Crown check"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 font-bold text-slate-900 focus:outline-none focus:border-teal-600 focus:bg-white"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReappearModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReappear}
                  className="px-5 py-2 bg-gradient-to-r from-teal-700 to-emerald-600 hover:from-teal-800 hover:to-emerald-700 text-white font-black rounded-xl shadow-xs cursor-pointer"
                >
                  {isSubmittingReappear ? 'Checking In...' : 'Confirm & Seat in Queue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Upload Case Sheet Scan */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <Camera className="w-5 h-5 text-amber-600" />
                Upload Paper Record Photo
              </h3>
              <button
                onClick={() => setUploadModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUploadScan} className="space-y-4 text-xs">
              <div>
                <label className="block font-black text-slate-900 mb-1">
                  Select Photo / Document File
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={e => setScanFile(e.target.files?.[0] || null)}
                  className="w-full text-xs font-semibold file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-teal-50 file:text-teal-800 hover:file:bg-teal-100 cursor-pointer"
                  required
                />
              </div>

              <div>
                <label className="block font-black text-slate-900 mb-1">
                  Optional Notes / Remarks
                </label>
                <input
                  type="text"
                  value={scanNotes}
                  onChange={e => setScanNotes(e.target.value)}
                  placeholder="e.g. Case sheet page 1 - Front side"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-teal-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUploadingScan || !scanFile}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-black rounded-xl shadow-xs cursor-pointer"
                >
                  {isUploadingScan ? 'Uploading...' : 'Save Document Photo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
