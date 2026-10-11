import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { triggerClinicSync } from '../../lib/sync';
import {
  Stethoscope,
  Plus,
  CheckCircle2,
  Clock,
  Receipt,
  FileCheck,
  AlertCircle,
  IndianRupee,
} from 'lucide-react';

interface CompletedProcedure {
  id: string;
  toothNumber?: number;
  procedureCode: string;
  procedureName: string;
  notes?: string;
  performedAt: string;
  isBilled: boolean;
  dentist: { fullName: string };
  invoiceItem?: {
    invoice: { invoiceNumber: string; status: string };
  };
}

interface ProcedureLoggerProps {
  patientId: string;
  consultationId?: string;
  readOnly?: boolean;
  onProcedureAdded?: () => void;
  onOpenBillingWithProcedures?: (procedures: CompletedProcedure[]) => void;
}

export const ProcedureLogger: React.FC<ProcedureLoggerProps> = ({
  patientId,
  consultationId,
  readOnly = false,
  onProcedureAdded,
  onOpenBillingWithProcedures,
}) => {
  const [procedures, setProcedures] = useState<CompletedProcedure[]>([]);
  const [catalogue, setCatalogue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form
  const [selectedCode, setSelectedCode] = useState('SCALING_POLISH');
  const [toothNumber, setToothNumber] = useState('');
  const [procedureNotes, setProcedureNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchProcedures = async () => {
    try {
      setLoading(true);
      const data = await apiRequest<CompletedProcedure[]>(`/procedures/patient/${patientId}`);
      setProcedures(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCatalogue = async () => {
    try {
      const data = await apiRequest<any[]>('/procedures/catalogue');
      setCatalogue(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (patientId) {
      fetchProcedures();
      fetchCatalogue();
    }
  }, [patientId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleRecordProcedure = async (e: React.FormEvent) => {
    e.preventDefault();
    const item = catalogue.find(c => c.code === selectedCode);
    if (!item) return;
    setSubmitting(true);

    try {
      await apiRequest('/procedures', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          consultationId,
          procedureCode: item.code,
          procedureName: item.name,
          toothNumber: toothNumber ? Number(toothNumber) : undefined,
          notes: procedureNotes.trim() || undefined,
        }),
      });

      setShowAddModal(false);
      setToothNumber('');
      setProcedureNotes('');
      await fetchProcedures();
      triggerClinicSync('procedure_recorded');
      showToast(`Completed procedure "${item.name}" recorded!`);
      if (onProcedureAdded) onProcedureAdded();
    } catch (err) {
      console.error(err);
      showToast('Error recording procedure');
    } finally {
      setSubmitting(false);
    }
  };

  const unbilledProcedures = procedures.filter(p => !p.isBilled);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-teal-600" />
            Completed Procedures
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            Procedures performed for this patient
          </p>
        </div>

        <div className="flex items-center gap-2">
          {unbilledProcedures.length > 0 && onOpenBillingWithProcedures && (
            <button
              onClick={() => onOpenBillingWithProcedures(unbilledProcedures)}
              className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs py-2 px-3.5 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Receipt className="w-3.5 h-3.5" />
              Generate Invoice ({unbilledProcedures.length})
            </button>
          )}

          {!readOnly && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs py-2 px-3.5 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              + Record Procedure
            </button>
          )}
        </div>
      </div>

      {toastMessage && (
        <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-teal-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600" />
          {toastMessage}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500">Loading procedures log...</div>
      ) : procedures.length === 0 ? (
        <div className="clinic-card p-10 text-center text-slate-500">
          <Stethoscope className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No procedures logged yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Log procedures completed during today's visit to automatically populate the bill.
          </p>
        </div>
      ) : (
        <div className="clinic-card overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-600 font-semibold text-[11px]">
              <tr>
                <th className="py-2.5 px-4">Date & Time</th>
                <th className="py-2.5 px-4">Tooth</th>
                <th className="py-2.5 px-4">Procedure Performed</th>
                <th className="py-2.5 px-4">Treating Doctor</th>
                <th className="py-2.5 px-4">Billing Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {procedures.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono text-slate-600">
                    {new Date(p.performedAt).toLocaleString('en-IN')}
                  </td>
                  <td className="py-3 px-4">
                    {p.toothNumber ? (
                      <span className="font-mono font-bold text-teal-800 bg-teal-100 px-2 py-0.5 rounded text-[11px]">
                        #{p.toothNumber}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">General</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-bold text-slate-900">{p.procedureName}</span>
                    {p.notes && <p className="text-[11px] text-slate-500 mt-0.5">{p.notes}</p>}
                  </td>
                  <td className="py-3 px-4 text-slate-700">{p.dentist.fullName}</td>
                  <td className="py-3 px-4">
                    {p.isBilled ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                        <FileCheck className="w-3 h-3 text-emerald-600" />
                        Billed ({p.invoiceItem?.invoice?.invoiceNumber || 'Invoice'})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-800 bg-purple-100 px-2.5 py-0.5 rounded-full">
                        <Clock className="w-3 h-3 text-purple-600" />
                        Unbilled (Ready to Invoice)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* RECORD PROCEDURE MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-teal-600" />
                Log Chairside Clinical Procedure
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordProcedure} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Procedure Catalogue *
                </label>
                <select
                  value={selectedCode}
                  onChange={e => setSelectedCode(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 bg-white"
                >
                  {catalogue.map(cat => (
                    <option key={cat.code} value={cat.code}>
                      {cat.name} — Standard Fee: ₹{(cat.standardFeePaise / 100).toLocaleString('en-IN')}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Tooth Number (Optional, for tooth-specific treatments)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 46"
                  value={toothNumber}
                  onChange={e => setToothNumber(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Clinical Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Completed procedure smoothly, post-op instructions provided."
                  value={procedureNotes}
                  onChange={e => setProcedureNotes(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-600 text-xs font-semibold rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md"
                >
                  {submitting ? 'Saving...' : 'Save Procedure'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
