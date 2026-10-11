import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../../lib/api';
import { useClinicSync, triggerClinicSync } from '../../lib/sync';
import {
  Camera,
  Image as ImageIcon,
  FileText,
  Upload,
  HardDrive,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Sun,
  Sliders,
  Download,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Layers,
  Eye,
  PlusCircle,
  FileCheck,
  MapPin,
  Columns,
  MessageSquare,
  SplitSquareVertical,
} from 'lucide-react';

export interface MedicalFileItem {
  id: string;
  patientId: string;
  category: 'XRAY_IOPA' | 'XRAY_OPG' | 'CLINICAL_PHOTO' | 'LAB_REPORT' | 'SCAN_CBCT' | 'OTHER' | string;
  fileName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256Hash: string;
  uploadedAt: string;
}

export interface FileAnnotation {
  id: string;
  medicalFileId: string;
  pinNumber: number;
  xPercent: number;
  yPercent: number;
  noteText: string;
  authorName?: string | null;
  createdAt: string;
}

interface MedicalFilesGalleryProps {
  patientId: string;
  patientName: string;
  patientUhid: string;
  clinicName?: string;
}

const CATEGORY_MAP: Record<string, { label: string; badge: string; color: string; icon: string }> = {
  XRAY_IOPA: { label: 'IOPA / RVG X-Ray', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', color: '#6366f1', icon: '🦷' },
  XRAY_OPG: { label: 'OPG Panoramic', badge: 'bg-purple-50 text-purple-700 border-purple-200', color: '#a855f7', icon: '🌐' },
  CLINICAL_PHOTO: { label: 'Clinical Photo', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', color: '#10b981', icon: '📸' },
  LAB_REPORT: { label: 'Lab Report / PDF', badge: 'bg-sky-50 text-sky-700 border-sky-200', color: '#0284c7', icon: '📑' },
  SCAN_CBCT: { label: 'CBCT / 3D Scan', badge: 'bg-amber-50 text-amber-700 border-amber-200', color: '#f59e0b', icon: '🔬' },
  OTHER: { label: 'General Document', badge: 'bg-slate-100 text-slate-700 border-slate-200', color: '#64748b', icon: '📄' },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export const MedicalFilesGallery: React.FC<MedicalFilesGalleryProps> = ({
  patientId,
  patientName,
  patientUhid,
  clinicName = 'Dental Clinic',
}) => {
  const [files, setFiles] = useState<MedicalFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<string>('XRAY_IOPA');
  const [toothNumber, setToothNumber] = useState<string>('');
  const [clinicalNotes, setClinicalNotes] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgressMsg, setUploadProgressMsg] = useState<string | null>(null);
  const [uploadSuccessBanner, setUploadSuccessBanner] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lightbox Operatory Viewer state
  const [viewerFile, setViewerFile] = useState<MedicalFileItem | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isInverted, setIsInverted] = useState<boolean>(false);
  const [isHighContrast, setIsHighContrast] = useState<boolean>(false);
  const [rotation, setRotation] = useState<number>(0);

  // Pin Annotator state
  const [isPinMode, setIsPinMode] = useState<boolean>(false);
  const [annotations, setAnnotations] = useState<FileAnnotation[]>([]);
  const [showAnnotationsDrawer, setShowAnnotationsDrawer] = useState<boolean>(false);
  const [newPinCoords, setNewPinCoords] = useState<{ xPercent: number; yPercent: number } | null>(null);
  const [newPinNote, setNewPinNote] = useState<string>('');
  const [savingPin, setSavingPin] = useState<boolean>(false);
  const [hoveredPin, setHoveredPin] = useState<FileAnnotation | null>(null);
  const imageContainerRef = useRef<HTMLDivElement | null>(null);

  // Before/After Comparison Tool state
  const [compareModalOpen, setCompareModalOpen] = useState<boolean>(false);
  const [leftCompareId, setLeftCompareId] = useState<string>('');
  const [rightCompareId, setRightCompareId] = useState<string>('');
  const [splitSliderPos, setSplitSliderPos] = useState<number>(50);

  const fetchFiles = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await apiRequest<MedicalFileItem[]>(`/api/medical-files/patient/${patientId}`);
      setFiles(data || []);
    } catch (err) {
      console.error('Failed to load patient medical files', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (patientId) {
      fetchFiles();
    }
  }, [patientId]);

  useClinicSync(() => {
    if (patientId) fetchFiles(true);
  });

  // Fetch annotations when viewer opens
  const fetchAnnotations = async (fileId: string) => {
    try {
      const data = await apiRequest<FileAnnotation[]>(`/api/medical-files/${fileId}/annotations`);
      setAnnotations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load annotations', err);
    }
  };

  useEffect(() => {
    if (viewerFile) {
      fetchAnnotations(viewerFile.id);
      setIsPinMode(false);
      setNewPinCoords(null);
    } else {
      setAnnotations([]);
    }
  }, [viewerFile]);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgressMsg('Processing diagnostic radiograph & archiving...');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('patientId', patientId);
      formData.append('category', uploadCategory);
      if (toothNumber) formData.append('toothNumber', toothNumber);
      if (clinicalNotes) formData.append('notes', clinicalNotes);

      const res = await apiRequest<any>('/api/medical-files/upload', {
        method: 'POST',
        body: formData,
      });

      setShowUploadModal(false);
      setSelectedFile(null);
      setToothNumber('');
      setClinicalNotes('');
      if (fileInputRef.current) fileInputRef.current.value = '';

      const savingsMsg = res.savedPercent
        ? ` (Calibrated from ${formatBytes(res.originalSize)} to ${formatBytes(res.compressedSize)} • Preserved full diagnostic resolution)`
        : '';
      setUploadSuccessBanner(`Successfully archived ${res.fileName}${savingsMsg}`);
      setTimeout(() => setUploadSuccessBanner(null), 6000);

      triggerClinicSync('file_uploaded');
      await fetchFiles(true);
    } catch (err: any) {
      alert(err.message || 'Failed to upload medical file');
    } finally {
      setUploading(false);
      setUploadProgressMsg(null);
    }
  };

  const handleDelete = async (id: string, fileName: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${fileName}"? This cannot be undone.`)) {
      return;
    }

    try {
      await apiRequest(`/api/medical-files/${id}`, { method: 'DELETE' });
      if (viewerFile?.id === id) setViewerFile(null);
      triggerClinicSync('file_deleted');
      await fetchFiles(true);
    } catch (err: any) {
      alert(err.message || 'Failed to delete file');
    }
  };

  // Image Pin click handler
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!isPinMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const xPercent = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    const yPercent = Math.max(0, Math.min(100, (clickY / rect.height) * 100));

    setNewPinCoords({ xPercent, yPercent });
    setNewPinNote('');
  };

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewerFile || !newPinCoords || !newPinNote.trim()) return;

    setSavingPin(true);
    try {
      const nextPinNumber = annotations.length + 1;
      await apiRequest(`/api/medical-files/${viewerFile.id}/annotations`, {
        method: 'POST',
        body: JSON.stringify({
          pinNumber: nextPinNumber,
          xPercent: newPinCoords.xPercent,
          yPercent: newPinCoords.yPercent,
          noteText: newPinNote.trim(),
        }),
      });

      setNewPinCoords(null);
      setNewPinNote('');
      fetchAnnotations(viewerFile.id);
      triggerClinicSync('annotation_added');
    } catch (err: any) {
      alert(err.message || 'Failed to save radiograph annotation');
    } finally {
      setSavingPin(false);
    }
  };

  const handleDeleteAnnotation = async (annotationId: string) => {
    if (!viewerFile) return;
    try {
      await apiRequest(`/api/medical-files/${viewerFile.id}/annotations/${annotationId}`, {
        method: 'DELETE',
      });
      fetchAnnotations(viewerFile.id);
      triggerClinicSync('annotation_deleted');
    } catch (err: any) {
      alert(err.message || 'Failed to delete annotation');
    }
  };

  // Filtered list
  const filteredFiles = files.filter((f) => {
    if (selectedCategory === 'ALL') return true;
    return f.category === selectedCategory;
  });

  const totalBytes = files.reduce((acc, f) => acc + f.sizeBytes, 0);

  const leftFile = files.find((f) => f.id === leftCompareId);
  const rightFile = files.find((f) => f.id === rightCompareId);

  return (
    <div className="space-y-5">
      {/* Top Banner with Storage & Actions */}
      <div className="clinic-card bg-white border border-slate-200 rounded-2xl p-5 text-slate-900 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
              <Camera className="w-5 h-5 text-teal-600" />
              Digital Dental Imaging & Radiology
            </h3>
            <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
              Diagnostic RVG / OPG
            </span>
          </div>
          <p className="text-xs text-slate-600 font-medium mt-1">
            Diagnostic radiographs, interactive numbered pin annotations, and split Before/After comparison.
          </p>
          <div className="mt-2 flex items-center gap-4 text-xs font-bold text-slate-700">
            <span>
              Total Records: <strong className="text-teal-700">{files.length}</strong>
            </span>
            <span>•</span>
            <span>
              Archive Volume: <strong className="text-slate-900">{formatBytes(totalBytes)}</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {files.length >= 2 && (
            <button
              onClick={() => {
                setLeftCompareId(files[0].id);
                setRightCompareId(files[1].id);
                setCompareModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-xs transition"
            >
              <Columns className="w-4 h-4 text-teal-600" />
              Compare Before / After
            </button>
          )}

          <button
            onClick={() => setShowUploadModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black text-xs shadow-xs transition"
          >
            <PlusCircle className="w-4 h-4" />
            Upload Radiograph
          </button>
        </div>
      </div>

      {/* Success banner */}
      {uploadSuccessBanner && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {uploadSuccessBanner}
          </span>
          <button onClick={() => setUploadSuccessBanner(null)} className="text-emerald-700 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setSelectedCategory('ALL')}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
            selectedCategory === 'ALL'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          All Scans ({files.length})
        </button>
        {Object.entries(CATEGORY_MAP).map(([key, item]) => {
          const count = files.filter((f) => f.category === key).length;
          return (
            <button
              key={key}
              onClick={() => setSelectedCategory(key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
                selectedCategory === key
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
              <span className="opacity-70 font-normal">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Image Gallery Grid */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500 font-bold text-xs">
          Loading radiograph archive...
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
          <Camera className="w-12 h-12 mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-bold text-slate-700">No medical radiographs archived yet</p>
          <p className="text-xs text-slate-400 mt-1">Upload digital X-rays to enable interactive pin annotations.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredFiles.map((file) => {
            const cat = CATEGORY_MAP[file.category] || CATEGORY_MAP.OTHER;
            const isImg = file.mimeType.startsWith('image/');
            return (
              <div
                key={file.id}
                className="group bg-white rounded-2xl border border-slate-200/90 overflow-hidden hover:shadow-md transition flex flex-col justify-between"
              >
                <div
                  onClick={() => setViewerFile(file)}
                  className="aspect-square bg-slate-950 flex items-center justify-center relative cursor-pointer overflow-hidden"
                >
                  {isImg ? (
                    <img
                      src={`/api/medical-files/${file.id}/view`}
                      alt={file.fileName}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-200 select-none"
                    />
                  ) : (
                    <FileText className="w-10 h-10 text-slate-500" />
                  )}

                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                    <span className="px-3 py-1.5 rounded-lg bg-teal-600 text-white font-bold text-xs flex items-center gap-1 shadow-sm">
                      <Eye className="w-3.5 h-3.5" />
                      View Radiograph
                    </span>
                  </div>
                </div>

                <div className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${cat.badge}`}>
                      {cat.label}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">{formatBytes(file.sizeBytes)}</span>
                  </div>
                  <p className="text-xs font-bold text-slate-800 truncate" title={file.fileName}>
                    {file.fileName}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {new Date(file.uploadedAt).toLocaleDateString('en-IN')}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: UPLOAD RADIOGRAPH */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-5 h-5 text-teal-600" />
                Upload Radiograph / Clinical Document
              </h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  1. Imaging Category *
                </label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  {Object.entries(CATEGORY_MAP).map(([key, item]) => (
                    <option key={key} value={key}>
                      {item.icon} {item.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  2. FDI Tooth Number (optional)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 11, 26, 46"
                  value={toothNumber}
                  onChange={(e) => setToothNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  3. Select File (JPG, PNG, WebP, PDF) *
                </label>
                <input
                  type="file"
                  ref={fileInputRef}
                  required
                  accept="image/*,application/pdf"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-xs file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100 cursor-pointer"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  4. Diagnostic Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Pre-operative periapical radiolucency, root apex intact..."
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !selectedFile}
                  className="px-5 py-2 font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-xs disabled:opacity-50"
                >
                  {uploading ? (uploadProgressMsg || 'Uploading...') : 'Save to Archive'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CLINICAL LIGHTBOX OPERATORY VIEWER WITH PIN ANNOTATIONS */}
      {viewerFile && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col justify-between text-white animate-fadeIn">
          {/* Top Control Bar */}
          <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-teal-400">{patientName}</span>
                <span className="text-xs font-mono text-slate-400">({patientUhid})</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-bold">
                  {viewerFile.fileName}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Uploaded {new Date(viewerFile.uploadedAt).toLocaleString('en-IN')} • {formatBytes(viewerFile.sizeBytes)} • {annotations.length} Pins
              </p>
            </div>

            {/* Diagnostic Image Tools & Pin Annotator */}
            <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700 text-xs">
              <button
                onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                title="Zoom Out"
                className="p-2 hover:bg-slate-700 rounded-lg text-slate-200 cursor-pointer"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="px-2 font-mono font-bold text-xs text-teal-300">{Math.round(zoomLevel * 100)}%</span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(3.5, z + 0.25))}
                title="Zoom In"
                className="p-2 hover:bg-slate-700 rounded-lg text-slate-200 cursor-pointer"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <div className="w-px h-5 bg-slate-700 mx-1" />

              {/* Pin Mode Toggle */}
              <button
                onClick={() => setIsPinMode((p) => !p)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                  isPinMode ? 'bg-amber-500 text-slate-950 shadow-md ring-2 ring-amber-400/40 animate-pulse' : 'text-slate-300 hover:bg-slate-700'
                }`}
                title="Click on image to place numbered diagnostic marker"
              >
                <MapPin className="w-3.5 h-3.5" />
                {isPinMode ? 'Click on X-Ray to Drop Pin' : 'Add Pin Note'}
              </button>

              <button
                onClick={() => setShowAnnotationsDrawer((d) => !d)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                  showAnnotationsDrawer ? 'bg-teal-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                }`}
                title="View all notes"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Notes ({annotations.length})
              </button>

              <div className="w-px h-5 bg-slate-700 mx-1" />

              {/* Invert Negative */}
              <button
                onClick={() => setIsInverted((v) => !v)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                  isInverted ? 'bg-teal-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-700'
                }`}
                title="Negative Radiograph view"
              >
                <Sliders className="w-3.5 h-3.5" />
                Negative
              </button>

              {/* High Contrast */}
              <button
                onClick={() => setIsHighContrast((c) => !c)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                  isHighContrast ? 'bg-teal-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-700'
                }`}
                title="High Contrast edge analysis"
              >
                <Sun className="w-3.5 h-3.5" />
                Contrast
              </button>

              <button
                onClick={() => setRotation((r) => (r + 90) % 360)}
                title="Rotate 90°"
                className="p-2 hover:bg-slate-700 rounded-lg text-slate-200 cursor-pointer"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setZoomLevel(1);
                  setIsInverted(false);
                  setIsHighContrast(false);
                  setRotation(0);
                }}
                className="px-2 py-1 text-[11px] text-slate-400 hover:text-white cursor-pointer font-bold"
              >
                Reset
              </button>
            </div>

            {/* Actions: Download, Delete, Close */}
            <div className="flex items-center gap-2">
              <a
                href={`/api/medical-files/${viewerFile.id}/download`}
                download={viewerFile.fileName}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
                title="Download Original"
              >
                <Download className="w-4 h-4" />
              </a>

              <button
                onClick={() => handleDelete(viewerFile.id, viewerFile.fileName)}
                className="p-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 cursor-pointer"
                title="Delete File"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                onClick={() => setViewerFile(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold cursor-pointer"
                title="Close Viewer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Canvas Viewing Area with Pins */}
          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative">
            {viewerFile.mimeType.startsWith('image/') ? (
              <div
                ref={imageContainerRef}
                className="relative inline-block transition-transform duration-150 ease-out"
                style={{
                  transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
                }}
              >
                <img
                  src={`/api/medical-files/${viewerFile.id}/view`}
                  alt={viewerFile.fileName}
                  onClick={handleImageClick}
                  style={{
                    filter: `${isInverted ? 'invert(100%)' : ''} ${isHighContrast ? 'contrast(165%) brightness(110%)' : ''}`,
                  }}
                  className={`max-h-[80vh] max-w-[85vw] object-contain rounded-lg shadow-2xl select-none ${
                    isPinMode ? 'cursor-crosshair' : 'cursor-default'
                  }`}
                />

                {/* Render Interactive Pin Markers */}
                {annotations.map((ann) => (
                  <div
                    key={ann.id}
                    style={{
                      left: `${ann.xPercent}%`,
                      top: `${ann.yPercent}%`,
                    }}
                    onMouseEnter={() => setHoveredPin(ann)}
                    onMouseLeave={() => setHoveredPin(null)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 group"
                  >
                    <div className="w-7 h-7 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center shadow-lg border-2 border-white ring-2 ring-amber-500/40 animate-pulse">
                      {ann.pinNumber}
                    </div>

                    {/* Hover tooltip */}
                    <div className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 hidden group-hover:block w-56 p-2.5 rounded-xl bg-slate-900/95 border border-slate-700 text-white text-xs shadow-xl pointer-events-none z-30">
                      <div className="flex items-center justify-between font-bold text-amber-400 border-b border-slate-800 pb-1 mb-1">
                        <span>Pin #{ann.pinNumber}</span>
                        <span className="text-[10px] text-slate-400 font-normal">{ann.authorName || 'Dentist'}</span>
                      </div>
                      <p className="text-slate-200 leading-normal">{ann.noteText}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center">
                <iframe
                  src={`/api/medical-files/${viewerFile.id}/view`}
                  title={viewerFile.fileName}
                  className="w-full max-w-4xl h-[78vh] rounded-xl border border-slate-800 bg-white"
                />
              </div>
            )}

            {/* Sidebar list of pin notes */}
            {showAnnotationsDrawer && (
              <div className="absolute right-4 top-4 bottom-4 w-72 bg-slate-900/95 border border-slate-800 rounded-2xl p-4 overflow-y-auto shadow-2xl z-40 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="font-bold text-xs text-white uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-amber-500" />
                    Clinical Findings ({annotations.length})
                  </h4>
                  <button onClick={() => setShowAnnotationsDrawer(false)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {annotations.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">No pins added yet. Turn on "Add Pin Note" and click on the radiograph.</p>
                ) : (
                  <div className="space-y-2">
                    {annotations.map((ann) => (
                      <div key={ann.id} className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-bold text-[11px] flex items-center justify-center">
                            {ann.pinNumber}
                          </span>
                          <button
                            onClick={() => handleDeleteAnnotation(ann.id)}
                            className="text-slate-400 hover:text-rose-400 p-1"
                            title="Delete note"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-200 font-medium">{ann.noteText}</p>
                        <p className="text-[10px] text-slate-400 font-mono">By {ann.authorName || 'Dentist'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* New Pin Modal Popover */}
          {newPinCoords && (
            <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 text-white rounded-2xl p-5 w-full max-w-sm shadow-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-amber-400 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4" />
                    Add Pin Finding #{annotations.length + 1}
                  </h4>
                  <button onClick={() => setNewPinCoords(null)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <form onSubmit={handleSavePin} className="space-y-3">
                  <textarea
                    rows={3}
                    autoFocus
                    required
                    placeholder="e.g. Periapical radiolucency at apex, deep distal marginal caries, bone resorption..."
                    value={newPinNote}
                    onChange={(e) => setNewPinNote(e.target.value)}
                    className="w-full p-2.5 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setNewPinCoords(null)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingPin || !newPinNote.trim()}
                      className="px-4 py-1.5 rounded-lg text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white shadow-sm disabled:opacity-50"
                    >
                      {savingPin ? 'Saving...' : 'Drop Pin Marker'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Bottom Watermark Strip */}
          <div className="p-2.5 bg-slate-900/80 border-t border-slate-800 text-center text-xs text-slate-400 font-mono">
            {clinicName} • Secure Patient Radiograph Record (ID: {viewerFile.id.slice(0, 8)})
          </div>
        </div>
      )}

      {/* MODAL 3: BEFORE / AFTER COMPARISON TOOL */}
      {compareModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col justify-between text-white animate-fadeIn">
          {/* Header */}
          <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-base text-teal-400 flex items-center gap-2">
                <Columns className="w-5 h-5" />
                Before & After Radiograph Comparison
              </h3>
              <p className="text-xs text-slate-400">Side-by-side clinical pre-op and post-op outcome verification</p>
            </div>
            <button
              onClick={() => setCompareModalOpen(false)}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Selectors Bar */}
          <div className="p-3 bg-slate-900/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-amber-400 uppercase tracking-wider">Before (Pre-Op):</span>
              <select
                value={leftCompareId}
                onChange={(e) => setLeftCompareId(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
              >
                {files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.fileName} ({new Date(f.uploadedAt).toLocaleDateString('en-IN')})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-bold text-emerald-400 uppercase tracking-wider">After (Post-Op):</span>
              <select
                value={rightCompareId}
                onChange={(e) => setRightCompareId(e.target.value)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-white"
              >
                {files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.fileName} ({new Date(f.uploadedAt).toLocaleDateString('en-IN')})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Comparison Viewing Columns */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 overflow-hidden items-center justify-center">
            {/* Left Box (Before) */}
            <div className="h-full bg-slate-900/60 rounded-2xl border border-slate-800 p-4 flex flex-col items-center justify-center relative overflow-hidden">
              <span className="absolute top-4 left-4 px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold z-10">
                PRE-OPERATIVE SCAN
              </span>
              {leftFile ? (
                <img
                  src={`/api/medical-files/${leftFile.id}/view`}
                  alt={leftFile.fileName}
                  className="max-h-[70vh] max-w-full object-contain rounded-xl shadow-lg"
                />
              ) : (
                <p className="text-slate-500 text-xs">No scan selected</p>
              )}
            </div>

            {/* Right Box (After) */}
            <div className="h-full bg-slate-900/60 rounded-2xl border border-slate-800 p-4 flex flex-col items-center justify-center relative overflow-hidden">
              <span className="absolute top-4 left-4 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold z-10">
                POST-OPERATIVE OUTCOME
              </span>
              {rightFile ? (
                <img
                  src={`/api/medical-files/${rightFile.id}/view`}
                  alt={rightFile.fileName}
                  className="max-h-[70vh] max-w-full object-contain rounded-xl shadow-lg"
                />
              ) : (
                <p className="text-slate-500 text-xs">No scan selected</p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-3 bg-slate-900/80 border-t border-slate-800 text-center text-xs text-slate-400">
            Patient: <strong className="text-white">{patientName}</strong> ({patientUhid}) • Clinical Evaluation Tool
          </div>
        </div>
      )}
    </div>
  );
};
export default MedicalFilesGallery;
