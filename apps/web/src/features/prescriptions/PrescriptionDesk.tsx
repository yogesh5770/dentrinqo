import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import {
  FileText,
  Plus,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Pill,
  Trash2,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import { PrescriptionPrintModal } from './PrescriptionPrintModal';
import { useClinicSync, triggerClinicSync } from '../../lib/sync';

interface PrescriptionDeskProps {
  patientId: string;
  consultationId?: string;
  patientAllergies?: string[];
  readOnly?: boolean;
}

export const PrescriptionDesk: React.FC<PrescriptionDeskProps> = ({
  patientId,
  consultationId,
  patientAllergies = [],
  readOnly = false,
}) => {
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [printPrescription, setPrintPrescription] = useState<any | null>(null);

  // Form State
  const [instructions, setInstructions] = useState(
    'Maintain strict oral hygiene; warm saline rinses 4 times daily starting 24h post-treatment.',
  );
  const [dietAdvice, setDietAdvice] = useState(
    'Soft diet; avoid hot, spicy, or crunchy foods. Do not chew on treated side for 48 hours.',
  );
  const [items, setItems] = useState<any[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  const openCreateModal = () => {
    const newKey = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : `idem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setIdempotencyKey(newKey);
    setShowCreateModal(true);
  };

  const fetchPrescriptions = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await apiRequest<any[]>(`/prescriptions/patient/${patientId}`);
      setPrescriptions(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const data = await apiRequest<any[]>('/prescriptions/templates');
      setTemplates(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (patientId) {
      fetchPrescriptions();
      fetchTemplates();
    }
  }, [patientId]);

  useClinicSync(() => {
    if (patientId) fetchPrescriptions(true);
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleApplyTemplate = (template: any) => {
    setItems(template.items.map((it: any) => ({ ...it })));
    showToast(`Loaded "${template.category}" template`);
  };

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        medicineName: '',
        dosage: '500 mg',
        form: 'Tablet',
        frequency: '1-0-1 (Twice daily)',
        durationDays: 5,
        timing: 'After food',
        instructions: '',
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const checkDrugAllergyConflict = (medName: string, allergies: string[]) => {
    if (!medName || !allergies || allergies.length === 0) return null;
    const lower = medName.toLowerCase();
    for (const a of allergies) {
      const al = a.toLowerCase();
      if (al.includes('penicillin') || al.includes('amoxicillin')) {
        if (lower.includes('amox') || lower.includes('augmentin') || lower.includes('penicillin') || lower.includes('ampicillin') || lower.includes('clav')) {
          return `Penicillin / Beta-Lactam allergy: "${a}"`;
        }
      }
      if (al.includes('sulfa') || al.includes('sulfonamide')) {
        if (lower.includes('sulfa') || lower.includes('bactrim') || lower.includes('septra')) {
          return `Sulfa allergy: "${a}"`;
        }
      }
      if (al.includes('nsaid') || al.includes('aspirin') || al.includes('ibuprofen')) {
        if (lower.includes('ibuprofen') || lower.includes('aspirin') || lower.includes('diclofenac') || lower.includes('zerodol') || lower.includes('ketorol') || lower.includes('aceclofenac') || lower.includes('naproxen')) {
          return `NSAID / Analgesic allergy: "${a}"`;
        }
      }
      if (lower.includes(al) || al.includes(lower)) {
        return `Documented allergy: "${a}"`;
      }
    }
    return null;
  };

  const handleCreatePrescription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) return;

    // Check allergy contraindications
    const conflicts = items.map(it => checkDrugAllergyConflict(it.medicineName, patientAllergies)).filter(Boolean);
    if (conflicts.length > 0) {
      if (!window.confirm(`⚠️ DRUG ALLERGY WARNING:\n\n${conflicts.join('\n')}\n\nThe patient has documented allergies matching these prescribed medicines. Are you sure you wish to proceed?`)) {
        return;
      }
    }

    setSubmitting(true);
    const activeIdemKey = idempotencyKey || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `idem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    if (!idempotencyKey) {
      setIdempotencyKey(activeIdemKey);
    }

    try {
      const created = await apiRequest<any>('/prescriptions', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          consultationId,
          idempotencyKey: activeIdemKey,
          instructions: instructions.trim() || undefined,
          dietAdvice: dietAdvice.trim() || undefined,
          items: items.map(item => ({
            ...item,
            durationDays: Number(item.durationDays) || 5,
          })),
        }),
      });

      setShowCreateModal(false);
      setIdempotencyKey('');
      await fetchPrescriptions();
      triggerClinicSync('prescription_created');
      showToast('Prescription generated successfully!');
      // Open print view immediately
      handleOpenPrint(created.id);
    } catch (err) {
      console.error(err);
      showToast('Error issuing prescription');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenPrint = async (prescriptionId: string) => {
    try {
      const fullRx = await apiRequest<any>(`/prescriptions/${prescriptionId}`);
      setPrintPrescription(fullRx);
    } catch (err) {
      console.error(err);
      showToast('Failed to load prescription print view');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-teal-600" />
            Prescriptions (℞)
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            Doctor prescriptions and medication plans
          </p>
        </div>

        {!readOnly && (
          <button
            onClick={openCreateModal}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs py-2 px-4 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Write Prescription
          </button>
        )}
      </div>

      {toastMessage && (
        <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-teal-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600" />
          {toastMessage}
        </div>
      )}

      {/* Allergies Warning */}
      {patientAllergies.length > 0 && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>
            Patient has documented drug allergies: <strong>{patientAllergies.join(', ')}</strong>. Verify all drug formulations before prescribing.
          </span>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500">Loading prescription history...</div>
      ) : prescriptions.length === 0 ? (
        <div className="clinic-card p-10 text-center text-slate-500">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No prescriptions issued yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Write a prescription for medications and instructions.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {prescriptions.map(rx => (
            <div key={rx.id} className="clinic-card p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 font-serif font-black text-lg flex items-center justify-center">
                    ℞
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 text-sm">{rx.prescriptionNumber}</span>
                      <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                        Finalized & Issued
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Issued on {new Date(rx.createdAt).toLocaleDateString('en-IN')} by {rx.dentist?.fullName}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleOpenPrint(rx.id)}
                  className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-2 px-3.5 rounded-xl transition-all cursor-pointer shadow-sm"
                >
                  <Printer className="w-3.5 h-3.5 text-teal-400" />
                  Print Prescription
                </button>
              </div>

              {/* Medicine Table */}
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold text-[11px]">
                    <tr>
                      <th className="py-2 px-3">Medicine</th>
                      <th className="py-2 px-3">Dosage / Form</th>
                      <th className="py-2 px-3">Frequency</th>
                      <th className="py-2 px-3">Duration</th>
                      <th className="py-2 px-3">Timing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rx.items?.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-bold text-slate-800">{item.medicineName}</td>
                        <td className="py-2.5 px-3 text-slate-600">{item.dosage} ({item.form})</td>
                        <td className="py-2.5 px-3">
                          <span className="bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded text-[11px] font-bold">
                            {item.frequency}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{item.durationDays} Days</td>
                        <td className="py-2.5 px-3 text-slate-700">{item.timing}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {rx.instructions && (
                <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <strong>Advice:</strong> {rx.instructions}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* CREATE PRESCRIPTION MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-serif font-black text-teal-800">℞</span>
                <h3 className="font-black text-slate-900 text-base">New Prescription</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            {/* Documented Allergies Clinical Safety Banner */}
            {patientAllergies.length > 0 ? (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs font-semibold flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-rose-950 font-black">DOCUMENTED DRUG ALLERGIES: {patientAllergies.join(', ')}</strong>
                  <span className="text-[11px] text-rose-800">
                    Cross-reference all medications, active salts, and excipients. This automated warning is an assistive clinical advisory and does not substitute for qualified clinical evaluation.
                  </span>
                </div>
              </div>
            ) : (
              <div className="mb-4 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 text-[11px] flex items-center gap-2">
                <span className="font-semibold text-slate-700">Allergy Status:</span>
                <span>No documented drug allergies on record. Always confirm with the patient verbally before prescribing.</span>
              </div>
            )}

            {/* Template Quick Loader */}
            {templates.length > 0 && (
              <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                  Prescription Templates
                </span>
                <div className="flex flex-wrap gap-2">
                  {templates.map((tpl, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleApplyTemplate(tpl)}
                      className="px-2.5 py-1.5 bg-white hover:bg-teal-50 border border-slate-300 hover:border-teal-400 text-slate-800 hover:text-teal-900 text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-2xs"
                    >
                      {tpl.category}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleCreatePrescription} className="space-y-4">
              {/* Medicine Items List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Prescribed Medicines ({items.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Medicine
                  </button>
                </div>

                {items.map((item, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-600">Medicine #{idx + 1}</span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-rose-500 hover:text-rose-700 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-4">
                        <label className="text-[10px] text-slate-500 block mb-0.5">Medicine Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Augmentin 625mg"
                          value={item.medicineName}
                          onChange={e => {
                            const newItems = [...items];
                            newItems[idx].medicineName = e.target.value;
                            setItems(newItems);
                          }}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white font-bold"
                        />
                        {(() => {
                          const conflict = checkDrugAllergyConflict(item.medicineName, patientAllergies);
                          if (!conflict) return null;
                          return (
                            <div className="mt-1 flex items-center gap-1 text-[10px] font-black text-rose-700 bg-rose-50 border border-rose-300 rounded px-1.5 py-0.5 animate-pulse">
                              <ShieldAlert className="w-3 h-3 text-rose-600 shrink-0" />
                              <span>⚠️ CONTRAINDICATION: {conflict}</span>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-[10px] text-slate-500 block mb-0.5">Dosage</label>
                        <input
                          type="text"
                          placeholder="e.g. 625 mg"
                          value={item.dosage}
                          onChange={e => {
                            const newItems = [...items];
                            newItems[idx].dosage = e.target.value;
                            setItems(newItems);
                          }}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-[10px] text-slate-500 block mb-0.5">Form</label>
                        <select
                          value={item.form}
                          onChange={e => {
                            const newItems = [...items];
                            newItems[idx].form = e.target.value;
                            setItems(newItems);
                          }}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white"
                        >
                          {['Tablet', 'Capsule', 'Mouthwash', 'Oral Gel', 'Syrup', 'Dispersible Tablet'].map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-[10px] text-slate-500 block mb-0.5">Frequency</label>
                        <select
                          value={item.frequency}
                          onChange={e => {
                            const newItems = [...items];
                            newItems[idx].frequency = e.target.value;
                            setItems(newItems);
                          }}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white"
                        >
                          {['1-0-1 (Twice daily)', '1-1-1 (Thrice daily)', '1-0-0 (Morning)', '0-0-1 (Bedtime)', 'SOS (As needed)'].map(fr => (
                            <option key={fr} value={fr}>{fr}</option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="text-[10px] text-slate-500 block mb-0.5">Days</label>
                        <input
                          type="number"
                          value={item.durationDays}
                          onChange={e => {
                            const newItems = [...items];
                            newItems[idx].durationDays = Number(e.target.value);
                            setItems(newItems);
                          }}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Timing</label>
                        <input
                          type="text"
                          placeholder="e.g. After food"
                          value={item.timing}
                          onChange={e => {
                            const newItems = [...items];
                            newItems[idx].timing = e.target.value;
                            setItems(newItems);
                          }}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Special Instructions</label>
                        <input
                          type="text"
                          placeholder="e.g. Complete full course without stopping"
                          value={item.instructions || ''}
                          onChange={e => {
                            const newItems = [...items];
                            newItems[idx].instructions = e.target.value;
                            setItems(newItems);
                          }}
                          className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Instructions and Diet */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Instructions & Advice
                  </label>
                  <textarea
                    rows={2}
                    value={instructions}
                    onChange={e => setInstructions(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Dietary Advice
                  </label>
                  <textarea
                    rows={2}
                    value={dietAdvice}
                    onChange={e => setDietAdvice(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setIdempotencyKey('');
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-600 text-xs font-semibold rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-xs"
                >
                  {submitting ? 'Saving...' : 'Save & Print Prescription'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Letterhead Modal */}
      <PrescriptionPrintModal
        isOpen={Boolean(printPrescription)}
        onClose={() => setPrintPrescription(null)}
        prescription={printPrescription}
      />
    </div>
  );
};
