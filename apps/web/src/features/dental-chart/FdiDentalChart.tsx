import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { triggerClinicSync } from '../../lib/sync';
import {
  Sparkles,
  Info,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Baby,
  Smile,
  Shield,
  Layers,
} from 'lucide-react';

export interface DentalChartEntry {
  id: string;
  toothNumber: number;
  surface: string;
  condition: string;
  notes?: string;
}

interface FdiDentalChartProps {
  patientId: string;
  consultationId?: string;
  readOnly?: boolean;
  onConditionUpdated?: () => void;
}

// Dental tooth names
const TOOTH_NAMES: Record<number, string> = {
  18: 'Upper Right 3rd Molar (Wisdom)',
  17: 'Upper Right 2nd Molar',
  16: 'Upper Right 1st Molar',
  15: 'Upper Right 2nd Premolar',
  14: 'Upper Right 1st Premolar',
  13: 'Upper Right Canine',
  12: 'Upper Right Lateral Incisor',
  11: 'Upper Right Central Incisor',
  21: 'Upper Left Central Incisor',
  22: 'Upper Left Lateral Incisor',
  23: 'Upper Left Canine',
  24: 'Upper Left 1st Premolar',
  25: 'Upper Left 2nd Premolar',
  26: 'Upper Left 1st Molar',
  27: 'Upper Left 2nd Molar',
  28: 'Upper Left 3rd Molar (Wisdom)',
  48: 'Lower Right 3rd Molar (Wisdom)',
  47: 'Lower Right 2nd Molar',
  46: 'Lower Right 1st Molar',
  45: 'Lower Right 2nd Premolar',
  44: 'Lower Right 1st Premolar',
  43: 'Lower Right Canine',
  42: 'Lower Right Lateral Incisor',
  41: 'Lower Right Central Incisor',
  31: 'Lower Left Central Incisor',
  32: 'Lower Left Lateral Incisor',
  33: 'Lower Left Canine',
  34: 'Lower Left 1st Premolar',
  35: 'Lower Left 2nd Premolar',
  36: 'Lower Left 1st Molar',
  37: 'Lower Left 2nd Molar',
  38: 'Lower Left 3rd Molar (Wisdom)',
  // Primary
  55: 'Primary Upper Right 2nd Molar',
  54: 'Primary Upper Right 1st Molar',
  53: 'Primary Upper Right Canine',
  52: 'Primary Upper Right Lateral Incisor',
  51: 'Primary Upper Right Central Incisor',
  61: 'Primary Upper Left Central Incisor',
  62: 'Primary Upper Left Lateral Incisor',
  63: 'Primary Upper Left Canine',
  64: 'Primary Upper Left 1st Molar',
  65: 'Primary Upper Left 2nd Molar',
  85: 'Primary Lower Right 2nd Molar',
  84: 'Primary Lower Right 1st Molar',
  83: 'Primary Lower Right Canine',
  82: 'Primary Lower Right Lateral Incisor',
  81: 'Primary Lower Right Central Incisor',
  71: 'Primary Lower Left Central Incisor',
  72: 'Primary Lower Left Lateral Incisor',
  73: 'Primary Lower Left Canine',
  74: 'Primary Lower Left 1st Molar',
  75: 'Primary Lower Left 2nd Molar',
};

const CONDITIONS: { code: string; label: string; color: string; bg: string; border: string; text: string }[] = [
  { code: 'CARIES', label: 'Caries / Cavity', color: '#dc2626', bg: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-900' },
  { code: 'FILLED_AMALGAM', label: 'Amalgam Filling', color: '#475569', bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-800' },
  { code: 'FILLED_COMPOSITE', label: 'Composite Filling', color: '#0284c7', bg: 'bg-sky-50', border: 'border-sky-300', text: 'text-sky-900' },
  { code: 'ROOT_CANAL', label: 'Root Canal (RCT)', color: '#9333ea', bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-900' },
  { code: 'CROWN', label: 'Crown / Cap', color: '#d97706', bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-900' },
  { code: 'MISSING', label: 'Missing / Extracted', color: '#4b5563', bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-800' },
  { code: 'IMPLANT', label: 'Titanium Implant', color: '#0d9488', bg: 'bg-teal-50', border: 'border-teal-300', text: 'text-teal-900' },
  { code: 'FRACTURED', label: 'Fractured / Chipped', color: '#ea580c', bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-900' },
  { code: 'HEALTHY', label: 'Healthy (Clear)', color: '#16a34a', bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-900' },
];

export const FdiDentalChart: React.FC<FdiDentalChartProps> = ({
  patientId,
  consultationId,
  readOnly = false,
  onConditionUpdated,
}) => {
  const [entries, setEntries] = useState<DentalChartEntry[]>([]);
  const [isPediatric, setIsPediatric] = useState(false);
  const [selectedQuadrant, setSelectedQuadrant] = useState<'ALL' | 'Q1' | 'Q2' | 'Q3' | 'Q4'>('ALL');
  const [selectedTooth, setSelectedTooth] = useState<number | null>(46);
  const [selectedSurface, setSelectedSurface] = useState<string>('OCCLUSAL');
  const [selectedCondition, setSelectedCondition] = useState<string>('CARIES');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchChart = async () => {
    try {
      setLoading(true);
      const data = await apiRequest<DentalChartEntry[]>(`/dental-chart/patient/${patientId}`);
      setEntries(data || []);
    } catch (err) {
      console.error('Failed to load dental chart:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (patientId) {
      fetchChart();
    }
  }, [patientId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleApplyCondition = async (conditionToApply?: string) => {
    if (!selectedTooth) return;
    const cond = conditionToApply || selectedCondition;
    setSaving(true);

    try {
      await apiRequest('/dental-chart', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          toothNumber: selectedTooth,
          surface: selectedSurface,
          condition: cond,
          notes: notes.trim() || undefined,
          consultationId,
        }),
      });

      await fetchChart();
      triggerClinicSync('dental_chart_updated');
      showToast(`Tooth #${selectedTooth} (${selectedSurface}) marked as ${cond}`);
      if (onConditionUpdated) onConditionUpdated();
    } catch (err) {
      console.error(err);
      showToast('Error saving tooth condition');
    } finally {
      setSaving(false);
    }
  };

  // Helper to get surface color
  const getSurfaceColor = (toothNumber: number, surface: string) => {
    // Check surface-specific finding first
    const entry = entries.find(e => e.toothNumber === toothNumber && e.surface === surface);
    if (entry) {
      const match = CONDITIONS.find(c => c.code === entry.condition);
      return match ? match.color : '#dc2626';
    }
    // Check whole tooth finding
    const wholeEntry = entries.find(e => e.toothNumber === toothNumber && e.surface === 'WHOLE_TOOTH');
    if (wholeEntry) {
      const match = CONDITIONS.find(c => c.code === wholeEntry.condition);
      return match ? match.color : '#9333ea';
    }
    return '#f8fafc'; // Default clean off-white ivory surface
  };

  const getToothStatus = (toothNumber: number) => {
    const toothEntries = entries.filter(e => e.toothNumber === toothNumber);
    if (toothEntries.length === 0) return null;
    return toothEntries;
  };

  // FDI Quadrants definition
  const adultUpperRight = [18, 17, 16, 15, 14, 13, 12, 11];
  const adultUpperLeft = [21, 22, 23, 24, 25, 26, 27, 28];
  const adultLowerRight = [48, 47, 46, 45, 44, 43, 42, 41];
  const adultLowerLeft = [31, 32, 33, 34, 35, 36, 37, 38];

  const pedUpperRight = [55, 54, 53, 52, 51];
  const pedUpperLeft = [61, 62, 63, 64, 65];
  const pedLowerRight = [85, 84, 83, 82, 81];
  const pedLowerLeft = [71, 72, 73, 74, 75];

  const upperRight = isPediatric ? pedUpperRight : adultUpperRight;
  const upperLeft = isPediatric ? pedUpperLeft : adultUpperLeft;
  const lowerRight = isPediatric ? pedLowerRight : adultLowerRight;
  const lowerLeft = isPediatric ? pedLowerLeft : adultLowerLeft;

  // Render individual SVG tooth
  const renderTooth = (toothNumber: number, isUpper: boolean) => {
    const isSelected = selectedTooth === toothNumber;
    const toothFindings = getToothStatus(toothNumber);
    const hasFindings = Boolean(toothFindings && toothFindings.length > 0);

    const wholeCondition = toothFindings?.find(e => e.surface === 'WHOLE_TOOTH')?.condition;
    const isMissing = wholeCondition === 'MISSING';
    const isCrown = wholeCondition === 'CROWN';
    const isImplant = wholeCondition === 'IMPLANT';
    const isRct = toothFindings?.some(e => e.condition === 'ROOT_CANAL');

    return (
      <div
        key={toothNumber}
        onClick={() => {
          setSelectedTooth(toothNumber);
        }}
        className={`flex flex-col items-center p-1.5 rounded-xl transition-all cursor-pointer select-none ${
          isSelected
            ? 'bg-teal-50 border-2 border-teal-600 ring-4 ring-teal-500/20 scale-105 z-10 shadow-md'
            : hasFindings
            ? 'bg-amber-50/70 border border-amber-300 hover:border-teal-500'
            : 'bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300'
        }`}
      >
        {/* Upper tooth number header */}
        {isUpper && (
          <span className={`text-xs font-mono font-black mb-1 ${isSelected ? 'text-teal-800' : hasFindings ? 'text-amber-800' : 'text-slate-800'}`}>
            {toothNumber}
          </span>
        )}

        {/* 5-Surface Anatomical SVG Diagram */}
        <div className="relative w-10 h-10 sm:w-11 sm:h-11">
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-xs">
            {/* Background Base */}
            <circle cx="50" cy="50" r="48" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />

            {/* Top Surface (Buccal / Facial) */}
            <path
              d="M 20 20 L 80 20 L 68 35 L 32 35 Z"
              fill={getSurfaceColor(toothNumber, 'BUCCAL')}
              stroke="#64748b"
              strokeWidth="1.5"
              className="transition-colors hover:brightness-95 cursor-pointer"
              onClick={e => {
                e.stopPropagation();
                setSelectedTooth(toothNumber);
                setSelectedSurface('BUCCAL');
                if (!readOnly) handleApplyCondition();
              }}
            />

            {/* Bottom Surface (Lingual / Palatal) */}
            <path
              d="M 20 80 L 80 80 L 68 65 L 32 65 Z"
              fill={getSurfaceColor(toothNumber, isUpper ? 'PALATAL' : 'LINGUAL')}
              stroke="#64748b"
              strokeWidth="1.5"
              className="transition-colors hover:brightness-95 cursor-pointer"
              onClick={e => {
                e.stopPropagation();
                setSelectedTooth(toothNumber);
                setSelectedSurface(isUpper ? 'PALATAL' : 'LINGUAL');
                if (!readOnly) handleApplyCondition();
              }}
            />

            {/* Left Surface (Mesial or Distal depending on quadrant) */}
            <path
              d="M 20 20 L 32 35 L 32 65 L 20 80 Z"
              fill={getSurfaceColor(toothNumber, 'MESIAL')}
              stroke="#64748b"
              strokeWidth="1.5"
              className="transition-colors hover:brightness-95 cursor-pointer"
              onClick={e => {
                e.stopPropagation();
                setSelectedTooth(toothNumber);
                setSelectedSurface('MESIAL');
                if (!readOnly) handleApplyCondition();
              }}
            />

            {/* Right Surface (Distal or Mesial) */}
            <path
              d="M 80 20 L 68 35 L 68 65 L 80 80 Z"
              fill={getSurfaceColor(toothNumber, 'DISTAL')}
              stroke="#64748b"
              strokeWidth="1.5"
              className="transition-colors hover:brightness-95 cursor-pointer"
              onClick={e => {
                e.stopPropagation();
                setSelectedTooth(toothNumber);
                setSelectedSurface('DISTAL');
                if (!readOnly) handleApplyCondition();
              }}
            />

            {/* Center Surface (Occlusal or Incisal) */}
            <rect
              x="32"
              y="35"
              width="36"
              height="30"
              rx="4"
              fill={getSurfaceColor(toothNumber, 'OCCLUSAL')}
              stroke="#64748b"
              strokeWidth="1.5"
              className="transition-colors hover:brightness-95 cursor-pointer"
              onClick={e => {
                e.stopPropagation();
                setSelectedTooth(toothNumber);
                setSelectedSurface('OCCLUSAL');
                if (!readOnly) handleApplyCondition();
              }}
            />

            {/* Overlays for special conditions */}
            {isMissing && (
              <g stroke="#dc2626" strokeWidth="4" strokeLinecap="round">
                <line x1="15" y1="15" x2="85" y2="85" />
                <line x1="85" y1="15" x2="15" y2="85" />
              </g>
            )}

            {isCrown && (
              <circle cx="50" cy="50" r="44" fill="none" stroke="#d97706" strokeWidth="4" strokeDasharray="6 3" />
            )}

            {isImplant && (
              <g stroke="#0d9488" strokeWidth="3">
                <line x1="50" y1="20" x2="50" y2="80" />
                <line x1="38" y1="35" x2="62" y2="35" />
                <line x1="42" y1="50" x2="58" y2="50" />
                <line x1="44" y1="65" x2="56" y2="65" />
              </g>
            )}

            {isRct && !isMissing && (
              <circle cx="50" cy="50" r="6" fill="#9333ea" />
            )}
          </svg>
        </div>

        {/* Lower tooth number header */}
        {!isUpper && (
          <span className={`text-xs font-mono font-black mt-1 ${isSelected ? 'text-teal-800' : hasFindings ? 'text-amber-800' : 'text-slate-800'}`}>
            {toothNumber}
          </span>
        )}
      </div>
    );
  };

  const activeToothName = selectedTooth ? TOOTH_NAMES[selectedTooth] || `Tooth #${selectedTooth}` : 'None';
  const activeToothEntries = selectedTooth ? entries.filter(e => e.toothNumber === selectedTooth) : [];

  return (
    <div className="clinic-card bg-white border border-slate-200 rounded-2xl p-5 text-slate-900 shadow-xs">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4 mb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
              <Smile className="w-5 h-5 text-teal-600" />
              FDI Two-Digit Dental Chart
            </h3>
            <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">
              Interactive Odontogram
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Surface-level anatomical tracking • Upper Maxilla & Lower Mandible
          </p>
        </div>

        {/* Pediatric toggle and refresh */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              onClick={() => setIsPediatric(false)}
              className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all cursor-pointer ${
                !isPediatric ? 'bg-white text-teal-800 shadow-xs border border-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Permanent (11–48)
            </button>
            <button
              onClick={() => setIsPediatric(true)}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-black rounded-lg transition-all cursor-pointer ${
                isPediatric ? 'bg-white text-teal-800 shadow-xs border border-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Baby className="w-3.5 h-3.5" />
              Primary (51–85)
            </button>
          </div>

          <button
            onClick={fetchChart}
            title="Reload Chart"
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl border border-slate-300 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {toastMessage && (
        <div className="mb-4 p-3 bg-teal-50 border border-teal-200 rounded-xl text-teal-900 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* QUADRANT FOCUS SELECTOR (Crucial for mobile and tablet touch ergonomics) */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-scroll whitespace-nowrap pb-1 mb-4">
        <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider mr-1 shrink-0">View Arch:</span>
        {[
          { id: 'ALL', label: 'All 32 Teeth' },
          { id: 'Q1', label: 'Q1: Upper Right' },
          { id: 'Q2', label: 'Q2: Upper Left' },
          { id: 'Q4', label: 'Q4: Lower Right' },
          { id: 'Q3', label: 'Q3: Lower Left' },
        ].map(q => (
          <button
            key={q.id}
            type="button"
            onClick={() => setSelectedQuadrant(q.id as any)}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
              selectedQuadrant === q.id
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
            }`}
          >
            {q.label}
          </button>
        ))}
      </div>

      {selectedQuadrant === 'ALL' && (
        <div className="text-[11px] text-slate-400 font-medium text-center md:hidden mb-1">
          ← Swipe horizontally to view full arch or tap a Quadrant tab above →
        </div>
      )}

      {/* ADAPTIVE ARCH VIEW */}
      <div className="space-y-5 overflow-x-auto touch-scroll pb-2">
        {/* If ALL, render standard dual arch */}
        {selectedQuadrant === 'ALL' && (
          <>
            {/* Maxillary (Upper Arch) */}
            <div>
              <div className="flex items-center justify-between text-xs font-black text-slate-700 uppercase tracking-wider px-2 mb-2">
                <span>Quadrant 1: Upper Right</span>
                <span className="text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">MAXILLARY ARCH (UPPER JAW)</span>
                <span>Quadrant 2: Upper Left</span>
              </div>

              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex items-center justify-center gap-1 sm:gap-2 min-w-max sm:min-w-0">
                {/* Upper Right (18 to 11) */}
                <div className="flex items-center gap-1 sm:gap-1.5">
                  {upperRight.map(t => renderTooth(t, true))}
                </div>

                {/* Midline Divider */}
                <div className="w-1 h-14 bg-teal-500 mx-1 sm:mx-2 rounded-full" title="Dental Midline" />

                {/* Upper Left (21 to 28) */}
                <div className="flex items-center gap-1 sm:gap-1.5">
                  {upperLeft.map(t => renderTooth(t, true))}
                </div>
              </div>
            </div>

            {/* Mandibular (Lower Arch) */}
            <div>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 flex items-center justify-center gap-1 sm:gap-2 min-w-max sm:min-w-0">
                {/* Lower Right (48 to 41) */}
                <div className="flex items-center gap-1 sm:gap-1.5">
                  {lowerRight.map(t => renderTooth(t, false))}
                </div>

                {/* Midline Divider */}
                <div className="w-1 h-14 bg-teal-500 mx-1 sm:mx-2 rounded-full" title="Dental Midline" />

                {/* Lower Left (31 to 38) */}
                <div className="flex items-center gap-1 sm:gap-1.5">
                  {lowerLeft.map(t => renderTooth(t, false))}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-black text-slate-700 uppercase tracking-wider px-2 mt-2">
                <span>Quadrant 4: Lower Right</span>
                <span className="text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">MANDIBULAR ARCH (LOWER JAW)</span>
                <span>Quadrant 3: Lower Left</span>
              </div>
            </div>
          </>
        )}

        {/* Focused Single Quadrant Views (Optimized for Single-Hand Touch) */}
        {selectedQuadrant === 'Q1' && (
          <div className="bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-200 space-y-3">
            <div className="text-center font-black text-xs text-teal-800 uppercase tracking-wider">
              Quadrant 1 — Upper Right Maxillary (Teeth 18 to 11)
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {upperRight.map(t => renderTooth(t, true))}
            </div>
          </div>
        )}

        {selectedQuadrant === 'Q2' && (
          <div className="bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-200 space-y-3">
            <div className="text-center font-black text-xs text-teal-800 uppercase tracking-wider">
              Quadrant 2 — Upper Left Maxillary (Teeth 21 to 28)
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {upperLeft.map(t => renderTooth(t, true))}
            </div>
          </div>
        )}

        {selectedQuadrant === 'Q4' && (
          <div className="bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-200 space-y-3">
            <div className="text-center font-black text-xs text-teal-800 uppercase tracking-wider">
              Quadrant 4 — Lower Right Mandibular (Teeth 48 to 41)
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {lowerRight.map(t => renderTooth(t, false))}
            </div>
          </div>
        )}

        {selectedQuadrant === 'Q3' && (
          <div className="bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-200 space-y-3">
            <div className="text-center font-black text-xs text-teal-800 uppercase tracking-wider">
              Quadrant 3 — Lower Left Mandibular (Teeth 31 to 38)
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {lowerLeft.map(t => renderTooth(t, false))}
            </div>
          </div>
        )}
      </div>

      {/* INSPECTOR & CONDITION PALETTE (Operatory Dock) */}
      {!readOnly && (
        <div className="mt-6 pt-5 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Active Tooth Details */}
          <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-3">
              <div>
                <span className="text-[11px] font-black text-teal-800 uppercase tracking-wider block">Selected Tooth</span>
                <h4 className="text-base font-black text-slate-900 flex items-center gap-2 mt-0.5">
                  <span className="px-2 py-0.5 rounded bg-teal-600 text-white font-mono text-sm font-black">
                    #{selectedTooth || 'None'}
                  </span>
                  {activeToothName}
                </h4>
              </div>
            </div>

            {/* Surface Selector */}
            <div className="mb-4">
              <label className="text-xs font-black text-slate-800 block mb-1.5">
                Target Surface:
              </label>
              <div className="grid grid-cols-3 gap-1.5 text-xs">
                {['WHOLE_TOOTH', 'OCCLUSAL', 'MESIAL', 'DISTAL', 'BUCCAL', selectedTooth && selectedTooth < 30 ? 'PALATAL' : 'LINGUAL'].map(surf => (
                  <button
                    key={surf}
                    type="button"
                    onClick={() => setSelectedSurface(surf)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-black border transition-all cursor-pointer ${
                      selectedSurface === surf
                        ? 'bg-teal-600 text-white border-teal-700 shadow-xs'
                        : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    {surf}
                  </button>
                ))}
              </div>
            </div>

            {/* Currently Documented Findings for this tooth */}
            <div>
              <span className="text-xs font-black text-slate-800 block mb-1">
                Charted Findings ({activeToothEntries.length}):
              </span>
              {activeToothEntries.length === 0 ? (
                <p className="text-xs text-slate-500 font-medium py-1">No pathology recorded on this tooth.</p>
              ) : (
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {activeToothEntries.map(e => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-xs"
                    >
                      <span className="text-teal-800 font-bold font-mono text-xs">{e.surface}</span>
                      <span className="px-2 py-0.5 rounded text-xs font-black bg-slate-100 text-slate-800 border border-slate-200">
                        {e.condition}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Condition Selector & Quick Apply Buttons */}
          <div className="lg:col-span-7 bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-black text-teal-800 uppercase tracking-wider block mb-1">Clinical Finding Palette</span>
              <p className="text-xs text-slate-600 font-medium mb-3">Click to apply finding to Tooth #{selectedTooth} ({selectedSurface}):</p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CONDITIONS.map(cond => (
                  <button
                    key={cond.code}
                    type="button"
                    onClick={() => {
                      setSelectedCondition(cond.code);
                      handleApplyCondition(cond.code);
                    }}
                    disabled={saving}
                    className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      cond.bg
                    } ${cond.border} ${cond.text} hover:shadow-xs`}
                  >
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cond.color }} />
                    <span className="truncate">{cond.label}</span>
                  </button>
                ))}
              </div>

              {/* Notes Input */}
              <div className="mt-4">
                <input
                  type="text"
                  placeholder="Optional clinical note (e.g. tender to percussion, deep mesial pit)"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-600"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-200 text-xs">
              <span className="text-slate-600 font-semibold">
                Instant autosave to chart
              </span>
              <button
                type="button"
                onClick={() => handleApplyCondition()}
                disabled={saving}
                className="bg-teal-600 hover:bg-teal-700 text-white font-extrabold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              >
                {saving ? 'Saving...' : 'Apply Finding to Chart'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Condition Legend */}
      <div className="mt-5 pt-4 border-t border-slate-200 flex flex-wrap items-center gap-3 text-xs text-slate-700 font-bold">
        <span className="font-black text-slate-900">Legend:</span>
        {CONDITIONS.map(cond => (
          <div key={cond.code} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cond.color }} />
            <span>{cond.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
