import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { triggerClinicSync } from '../../lib/sync';
import { GitMerge, AlertCircle, CheckCircle, ArrowRight, UserCheck, RefreshCw, X, ShieldAlert } from 'lucide-react';

interface DuplicatePatient {
  id: string;
  uhid: string;
  fullName: string;
  phone: string;
  gender: string;
  age?: number | null;
  createdAt: string;
  notes?: string;
}

export const PossibleDuplicatesView: React.FC = () => {
  const [duplicates, setDuplicates] = useState<DuplicatePatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDuplicate, setSelectedDuplicate] = useState<DuplicatePatient | null>(null);

  // Merge modal state
  const [survivorId, setSurvivorId] = useState('');
  const [survivorSearch, setSurvivorSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [reason, setReason] = useState('');
  const [merging, setMerging] = useState(false);
  const [mergeSuccess, setMergeSuccess] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);

  useEffect(() => {
    fetchDuplicates();
  }, []);

  const fetchDuplicates = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/patients/possible-duplicates');
      setDuplicates(res.data);
    } catch {
      // error handling
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSurvivors = async (term: string) => {
    setSurvivorSearch(term);
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await api.get(`/api/patients?search=${encodeURIComponent(term)}&limit=5`);
      setSearchResults(res.data.patients || []);
    } catch {}
  };

  const handleExecuteMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDuplicate || !survivorId) return;
    if (survivorId === selectedDuplicate.id) {
      setMergeError('Cannot merge patient into themselves. Please choose a different surviving profile.');
      return;
    }
    if (!reason || reason.trim().length < 5) {
      setMergeError('Please provide a reason of at least 5 characters for this merge operation.');
      return;
    }

    setMerging(true);
    setMergeError(null);
    try {
      const res = await api.post('/api/patients/merge', {
        survivorId,
        duplicateId: selectedDuplicate.id,
        reason: reason.trim(),
      });

      setMergeSuccess(res.data.message);
      triggerClinicSync('patient_merged');
      fetchDuplicates();
      setTimeout(() => {
        setSelectedDuplicate(null);
        setMergeSuccess(null);
        setSurvivorId('');
        setReason('');
      }, 2000);
    } catch (err: any) {
      setMergeError(err.response?.data?.message || 'Merge failed. Please verify records.');
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-200">
              <GitMerge className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-slate-900">
              Duplicate Patient Resolution Desk
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Review patients flagged with shared phone numbers or similar names. Safely merge records with zero data loss.
          </p>
        </div>

        <button
          onClick={fetchDuplicates}
          className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-xs transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh List</span>
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-500">
          Scanning patient directory for duplicate files...
        </div>
      ) : duplicates.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-12 h-12 mx-auto mb-3 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
            <UserCheck className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-black text-slate-800">Clean Patient Directory</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            No unresolved duplicate patient files currently detected. All incoming online bookings and reception registrations are clean.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Flagged Patient</th>
                  <th className="py-3 px-4">UHID</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Demographics</th>
                  <th className="py-3 px-4">Flagged Reason / Notes</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {duplicates.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4 font-bold text-slate-900">{p.fullName}</td>
                    <td className="py-3.5 px-4 font-mono text-teal-700 font-bold">{p.uhid}</td>
                    <td className="py-3.5 px-4 text-slate-700">{p.phone}</td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {p.gender} • {p.age ? `${p.age} yrs` : 'N/A'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate">
                      {p.notes || 'Shared phone number flagged for merge review'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedDuplicate(p);
                          setSurvivorSearch(p.fullName);
                          handleSearchSurvivors(p.fullName);
                        }}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] shadow-xs inline-flex items-center gap-1 transition"
                      >
                        <GitMerge className="w-3.5 h-3.5" />
                        <span>Resolve & Merge</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Merge Modal */}
      {selectedDuplicate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 p-6 relative">
            <button
              onClick={() => setSelectedDuplicate(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-base font-black text-slate-900 mb-1 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              <span>Merge Duplicate Patient File</span>
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              All appointments, clinical notes, prescriptions, and invoices will be permanently migrated to the surviving patient record.
            </p>

            {mergeError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{mergeError}</span>
              </div>
            )}

            {mergeSuccess && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-medium flex items-center gap-2">
                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{mergeSuccess}</span>
              </div>
            )}

            <form onSubmit={handleExecuteMerge} className="space-y-4">
              {/* Duplicate Card */}
              <div className="p-3.5 bg-red-50/60 border border-red-200 rounded-xl">
                <span className="text-[10px] font-black uppercase text-red-700 tracking-wider">
                  Duplicate to be Archived:
                </span>
                <p className="text-sm font-black text-slate-900 mt-0.5">
                  {selectedDuplicate.fullName}{' '}
                  <span className="font-mono text-xs font-normal text-slate-600">({selectedDuplicate.uhid})</span>
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Phone: {selectedDuplicate.phone}</p>
              </div>

              {/* Survivor Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1.5">
                  Select Surviving (Primary) Patient *
                </label>
                <input
                  type="text"
                  placeholder="Search surviving patient by name or UHID..."
                  value={survivorSearch}
                  onChange={(e) => handleSearchSurvivors(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />

                {searchResults.length > 0 && (
                  <div className="mt-2 border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-40 overflow-y-auto bg-white shadow-xs">
                    {searchResults
                      .filter((s) => s.id !== selectedDuplicate.id)
                      .map((s) => (
                        <div
                          key={s.id}
                          onClick={() => setSurvivorId(s.id)}
                          className={`p-2.5 text-xs flex items-center justify-between cursor-pointer transition ${
                            survivorId === s.id ? 'bg-teal-50 font-bold text-teal-800' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div>
                            <span>{s.fullName}</span>
                            <span className="text-slate-400 font-mono ml-2">({s.uhid})</span>
                          </div>
                          {survivorId === s.id && <CheckCircle className="w-4 h-4 text-teal-600" />}
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Mandatory Reason */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Reason for Merge (Audited) *
                </label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Duplicate account created by patient during online booking with partial name"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedDuplicate(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={merging || !survivorId}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 text-white font-bold text-xs rounded-xl shadow-xs transition"
                >
                  {merging ? 'Merging Records...' : 'Confirm & Execute Merge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
