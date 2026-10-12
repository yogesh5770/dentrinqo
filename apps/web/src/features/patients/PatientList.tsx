import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import {
  Users,
  Search,
  PlusCircle,
  ArrowRight,
  ShieldAlert,
  Calendar,
  Stethoscope,
  Phone,
  ChevronLeft,
  ChevronRight,
  Archive,
  FileText,
  Volume2,
  Camera,
  MapPin,
  Clock,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useClinicSync } from '../../lib/sync';
import { QuickReconsultModal } from '../../components/QuickReconsultModal';

interface Patient {
  id: string;
  uhid: string;
  fullName: string;
  phone: string;
  age?: number | null;
  gender: string;
  allergies: string[];
  medicalConditions: string[];
  legacySlNo?: string | null;
  guardianName?: string | null;
  physicalLocation?: string | null;
  voiceNoteUrl?: string | null;
  cardPhotoUrl?: string | null;
  legacyNotes?: string | null;
  notes?: string | null;
  isReappearance?: boolean;
  appointmentCount: number;
  consultationCount: number;
  createdAt: string;
}

interface PatientListProps {
  onOpenNewPatient: (mode?: 'STANDARD' | 'LEGACY_ARCHIVE') => void;
}

export const PatientList: React.FC<PatientListProps> = ({ onOpenNewPatient }) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'LEGACY_ONLY'>('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [reconsultModalOpen, setReconsultModalOpen] = useState(false);
  const [selectedReconsultPatient, setSelectedReconsultPatient] = useState<any | null>(null);
  const navigate = useNavigate();

  const fetchPatients = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const q = searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : '';
      const res = await apiRequest<{ data: Patient[]; total: number; totalPages: number }>(
        `/patients?page=${page}&limit=15${q}`
      );
      setPatients(res.data);
      setTotalPages(res.totalPages || 1);
      setTotalRecords(res.total);
    } catch (err) {
      console.error('Failed to load patients', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients(false);
  }, [page, searchTerm]);

  useClinicSync(() => fetchPatients(true));

  const displayedPatients = filterMode === 'LEGACY_ONLY'
    ? patients.filter(p => Boolean(p.legacySlNo))
    : patients;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900">Patient Directory</h2>
          <p className="text-xs text-slate-600 font-medium mt-0.5">
            Registered patients, clinical records, and physical archives ({totalRecords} total)
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setSelectedReconsultPatient(null);
              setReconsultModalOpen(true);
            }}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs py-2.5 px-3.5 rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
            title="Card Serial Number Lookup & Re-Consultation"
          >
            <Stethoscope className="w-4 h-4 text-amber-400" />
            <span>Re-Consult by Card #</span>
          </button>

          <button
            onClick={() => onOpenNewPatient('LEGACY_ARCHIVE')}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-black text-xs py-2.5 px-3.5 rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
          >
            <Archive className="w-4 h-4" />
            + Digitize Physical Card
          </button>

          <button
            onClick={() => onOpenNewPatient('STANDARD')}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs py-2.5 px-4 rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
          >
            <PlusCircle className="w-4 h-4" />
            + New Patient
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="clinic-card p-3 space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-2.5">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Search by Name, Phone, UHID, or Card # (e.g. Card 1042)..."
              className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-xs font-medium text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-teal-600 focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <button
              onClick={() => setFilterMode('ALL')}
              className={`flex-1 sm:flex-none px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                filterMode === 'ALL'
                  ? 'bg-slate-900 text-white shadow-2xs font-black'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Records
            </button>
            <button
              onClick={() => setFilterMode('LEGACY_ONLY')}
              className={`flex-1 sm:flex-none px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                filterMode === 'LEGACY_ONLY'
                  ? 'bg-amber-500 text-white shadow-2xs font-black'
                  : 'bg-amber-100/70 text-amber-900 hover:bg-amber-200'
              }`}
            >
              <Archive className="w-3.5 h-3.5" />
              <span>📁 Card Records Only</span>
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="clinic-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-700 text-xs font-bold">Loading patients...</div>
        ) : displayedPatients.length === 0 ? (
          <div className="p-12 text-center bg-white">
            <Users className="w-12 h-12 mx-auto text-slate-300 mb-2" />
            <p className="font-extrabold text-slate-900 text-base">No patients found</p>
            <p className="text-xs text-slate-600 mt-1">Try a different search term or register an old paper card.</p>
            <div className="mt-4 flex items-center justify-center gap-2">
              <button
                onClick={() => onOpenNewPatient('LEGACY_ARCHIVE')}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer"
              >
                + Add Old Card Record
              </button>
              <button
                onClick={() => onOpenNewPatient('STANDARD')}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer"
              >
                + New Patient
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white">
            {/* MOBILE VIEW: Touch-Friendly Patient Cards (< md) */}
            <div className="md:hidden divide-y divide-slate-100">
              {displayedPatients.map(p => {
                const allergies = Array.isArray(p.allergies) ? p.allergies : (p.allergies ? [p.allergies] : []);
                const conditions = Array.isArray(p.medicalConditions) ? p.medicalConditions : (p.medicalConditions ? [p.medicalConditions] : []);

                return (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/patients/${p.id}`)}
                    className="p-4 space-y-2.5 active:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-extrabold text-teal-800 text-xs bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">
                            {p.uhid}
                          </span>
                          {p.legacySlNo && (
                            <span className="font-mono font-black text-amber-950 text-xs bg-amber-300 border border-amber-400 px-2 py-0.5 rounded-md flex items-center gap-1">
                              <Archive className="w-3 h-3 text-amber-800" />
                              Card #{p.legacySlNo}
                            </span>
                          )}
                          {(p.legacyNotes || p.notes) && (
                            <span className="p-0.5 rounded bg-amber-100 text-amber-900" title="Clinical Notes Available">
                              <FileText className="w-3.5 h-3.5 text-amber-700" />
                            </span>
                          )}
                          <span className="text-xs text-slate-500 font-medium">
                            {p.age ? `${p.age} yrs` : 'Age N/A'} • {p.gender}
                          </span>
                        </div>
                        <h4 className="font-black text-slate-900 text-base mt-1">
                          {p.fullName}
                        </h4>
                        {p.guardianName && (
                          <p className="text-[11px] text-slate-500 font-medium">Guardian: {p.guardianName}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-xs font-bold text-slate-800 flex items-center gap-1 justify-end">
                          <Phone className="w-3.5 h-3.5 text-teal-600" />
                          {p.phone}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                          {p.appointmentCount} visit(s)
                        </span>
                      </div>
                    </div>

                    {/* Alerts Banner if any */}
                    {(allergies.length > 0 || conditions.length > 0) && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {allergies.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-900 border border-rose-300">
                            <ShieldAlert className="w-3 h-3 text-rose-600" />
                            {allergies[0]}
                            {allergies.length > 1 && ` +${allergies.length - 1}`}
                          </span>
                        )}
                        {conditions.length > 0 && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            {conditions[0]}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedReconsultPatient(p);
                          setReconsultModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 font-black text-xs cursor-pointer active:scale-95"
                      >
                        <Stethoscope className="w-3.5 h-3.5 text-amber-700" />
                        <span>Re-Consult</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/patients/${p.id}`)}
                        className="inline-flex items-center gap-1 text-teal-700 font-extrabold cursor-pointer"
                      >
                        <span>Open Record</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP VIEW: Full Data Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-800 font-extrabold uppercase tracking-wider text-xs">
                  <tr>
                    <th className="py-3.5 px-4">Identifier / Card #</th>
                    <th className="py-3.5 px-4">Patient Name</th>
                    <th className="py-3.5 px-4">Phone Number</th>
                    <th className="py-3.5 px-4">Age / Gender</th>
                    <th className="py-3.5 px-4">Clinical Alerts & Notes</th>
                    <th className="py-3.5 px-4 text-center">Visits</th>
                    <th className="py-3.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedPatients.map(p => (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/patients/${p.id}`)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold text-teal-800 text-xs">
                            {p.uhid}
                          </span>
                          {p.legacySlNo && (
                            <span className="font-mono text-xs font-black bg-amber-300 text-amber-950 border border-amber-400 px-2 py-0.5 rounded-md flex items-center gap-1 shadow-2xs">
                              <Archive className="w-3 h-3 text-amber-800" />
                              Card #{p.legacySlNo}
                            </span>
                          )}
                          {(p.legacyNotes || p.notes) && (
                            <span className="p-1 rounded-md bg-amber-100 text-amber-900" title="Clinical Notes Available">
                              <FileText className="w-3.5 h-3.5 text-amber-700" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="font-extrabold text-slate-900 text-sm">{p.fullName}</div>
                        <div className="text-xs text-slate-500 font-medium mt-0.5">
                          {p.guardianName ? `Guardian: ${p.guardianName}` : `Joined ${new Date(p.createdAt).toLocaleDateString('en-IN')}`}
                        </div>
                      </td>
                      <td className="py-4 px-4 font-mono font-bold text-slate-800">
                        {p.phone}
                      </td>
                      <td className="py-4 px-4 text-slate-800 font-semibold">
                        {p.age ? `${p.age} yrs` : '—'} • {p.gender}
                      </td>
                      <td className="py-4 px-4">
                        {(() => {
                          const allergies = Array.isArray(p.allergies) ? p.allergies : (p.allergies ? [p.allergies] : []);
                          const conditions = Array.isArray(p.medicalConditions) ? p.medicalConditions : (p.medicalConditions ? [p.medicalConditions] : []);
                          return (
                            <div className="flex flex-wrap items-center gap-1">
                              {allergies.length > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300">
                                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                                  {allergies[0]}
                                  {allergies.length > 1 && ` +${allergies.length - 1}`}
                                </span>
                              )}
                              {conditions.length > 0 && (
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                  {conditions[0]}
                                </span>
                              )}
                              {allergies.length === 0 && conditions.length === 0 && (
                                <span className="text-xs text-slate-400 font-medium">None</span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className="font-extrabold text-slate-900 text-xs">{p.appointmentCount}</span>
                        <span className="text-[10px] text-slate-500 font-medium block">Visits</span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedReconsultPatient(p);
                              setReconsultModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 font-black text-xs transition-colors cursor-pointer active:scale-95"
                            title="Re-Consultation Check-In"
                          >
                            <Stethoscope className="w-3.5 h-3.5 text-amber-700" />
                            <span>Re-Consult</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => navigate(`/patients/${p.id}`)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-extrabold text-xs transition-colors cursor-pointer"
                          >
                            <span>View Chart</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-bold">
                  Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="p-2 rounded-lg border border-slate-300 disabled:opacity-40 hover:bg-slate-100 font-bold cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    className="p-2 rounded-lg border border-slate-300 disabled:opacity-40 hover:bg-slate-100 font-bold cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick Serial # Re-Consultation Modal */}
      <QuickReconsultModal
        isOpen={reconsultModalOpen}
        onClose={() => {
          setReconsultModalOpen(false);
          setSelectedReconsultPatient(null);
        }}
        preloadedPatient={selectedReconsultPatient}
        onPatientSelected={() => {
          fetchPatients(true);
        }}
        onOpenNewPatientWithSerial={(serialNo) => {
          onOpenNewPatient('LEGACY_ARCHIVE');
        }}
      />
    </div>
  );
};