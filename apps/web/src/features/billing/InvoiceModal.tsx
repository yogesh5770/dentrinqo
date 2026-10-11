import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { triggerClinicSync } from '../../lib/sync';
import {
  FileText,
  Plus,
  Trash2,
  Sparkles,
  Receipt,
  Download,
  AlertCircle,
  IndianRupee,
} from 'lucide-react';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  preSelectedPatient?: any;
  appointmentId?: string;
  consultationId?: string;
  initialProcedures?: any[];
  initialItems?: { completedProcedureId?: string; description: string; toothNumber?: number; quantity: number; unitPriceRupees: number }[];
  onInvoiceCreated: (invoice: any) => void;
  onCollectExistingPayment?: (invoice: any) => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({
  isOpen,
  onClose,
  preSelectedPatient,
  appointmentId,
  consultationId,
  initialProcedures = [],
  initialItems = [],
  onInvoiceCreated,
  onCollectExistingPayment,
}) => {
  if (!isOpen) return null;

  const [patients, setPatients] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(preSelectedPatient?.id || '');
  const [unbilledProcedures, setUnbilledProcedures] = useState<any[]>([]);
  const [patientPlans, setPatientPlans] = useState<any[]>([]);
  const [existingUnpaidInvoice, setExistingUnpaidInvoice] = useState<any | null>(null);
  const [loadingUnbilled, setLoadingUnbilled] = useState(false);

  // Line items
  const [items, setItems] = useState<
    { completedProcedureId?: string; description: string; toothNumber?: number; quantity: number; unitPriceRupees: number }[]
  >(initialItems && initialItems.length > 0 ? initialItems : []);

  const [discountRupees, setDiscountRupees] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<any[]>([]);

  // Load treatment catalog
  useEffect(() => {
    apiRequest<any[]>('/procedures/catalogue')
      .then(data => setCatalogue(data || []))
      .catch(console.error);
  }, []);

  // Load patient list if not preselected
  useEffect(() => {
    if (!preSelectedPatient) {
      apiRequest<any>('/patients').then(res => {
        const list = res.data || res || [];
        setPatients(list);
        if (list.length > 0 && !selectedPatientId) {
          setSelectedPatientId(list[0].id);
        }
      }).catch(console.error);
    }
  }, [preSelectedPatient]);

  // Helper to extract procedure price from treatment plan or catalogue
  const getPrice = (p: any) => {
    if (p.feePaise !== undefined && p.feePaise !== null && p.feePaise > 0) {
      return Math.round(p.feePaise / 100);
    }
    if (p.treatmentPlanItem?.estimatedCostPaise !== undefined && p.treatmentPlanItem?.estimatedCostPaise !== null) {
      return Math.round(p.treatmentPlanItem.estimatedCostPaise / 100);
    }
    const match = catalogue.find(
      c => (p.procedureCode && c.code === p.procedureCode) ||
           c.name.toLowerCase() === (p.procedureName || '').toLowerCase() ||
           (p.procedureName || '').toLowerCase().includes(c.name.toLowerCase())
    );
    if (match && match.standardFeePaise) {
      return Math.round(match.standardFeePaise / 100);
    }
    return 500;
  };

  // Load unbilled procedures & active treatment plans when patient changes
  useEffect(() => {
    const pid = preSelectedPatient?.id || selectedPatientId;
    if (pid) {
      setLoadingUnbilled(true);

      // Fetch unbilled procedures, active treatment plans, and patient ledger in parallel
      Promise.all([
        apiRequest<any[]>(`/procedures/patient/${pid}?unbilledOnly=true`).catch(() => []),
        apiRequest<any[]>(`/treatment-plans/patient/${pid}`).catch(() => []),
        apiRequest<any>(`/billing/patient/${pid}`).catch(() => null),
      ]).then(([proceduresData, plansData, billingData]) => {
        setUnbilledProcedures(proceduresData || []);
        setPatientPlans(plansData || []);

        // Find existing unpaid invoice to prevent duplicates
        const unpaid = (billingData?.invoices || []).find((inv: any) => inv.balancePaise > 0);
        setExistingUnpaidInvoice(unpaid || null);

        if (initialItems && initialItems.length > 0) {
          setItems(initialItems);
        } else if (initialProcedures.length > 0) {
          setItems(
            initialProcedures.map(p => ({
              completedProcedureId: p.id,
              description: `${p.procedureName}${p.toothNumber ? ` - Tooth #${p.toothNumber}` : ''}`,
              toothNumber: p.toothNumber,
              quantity: 1,
              unitPriceRupees: getPrice(p),
            })),
          );
        } else if (proceduresData && proceduresData.length > 0) {
          setItems(
            proceduresData.map(p => ({
              completedProcedureId: p.id,
              description: `${p.procedureName}${p.toothNumber ? ` - Tooth #${p.toothNumber}` : ''}`,
              toothNumber: p.toothNumber,
              quantity: 1,
              unitPriceRupees: getPrice(p),
            })),
          );
        } else if (plansData && plansData.length > 0) {
          // AUTO-IMPORT TREATMENT PLANS IMMEDIATELY!
          const allPlanItems: any[] = [];
          plansData.forEach((p: any) => {
            if (p.items && Array.isArray(p.items)) {
              p.items.forEach((it: any) => {
                allPlanItems.push({
                  description: `${it.procedureName}${it.toothNumber ? ` - Tooth #${it.toothNumber}` : ''}`,
                  toothNumber: it.toothNumber,
                  quantity: 1,
                  unitPriceRupees: Math.round((it.estimatedCostPaise || 0) / 100),
                });
              });
            }
          });
          if (allPlanItems.length > 0) {
            setItems(allPlanItems);
          } else {
            setItems([{ description: '', quantity: 1, unitPriceRupees: 0 }]);
          }
        } else {
          setItems([{ description: '', quantity: 1, unitPriceRupees: 0 }]);
        }
      }).catch(console.error).finally(() => setLoadingUnbilled(false));
    }
  }, [selectedPatientId, preSelectedPatient, catalogue, initialItems]);

  const handleImportUnbilled = () => {
    if (unbilledProcedures.length === 0) return;
    const imported = unbilledProcedures.map(p => ({
      completedProcedureId: p.id,
      description: `${p.procedureName}${p.toothNumber ? ` - Tooth #${p.toothNumber}` : ''}`,
      toothNumber: p.toothNumber,
      quantity: 1,
      unitPriceRupees: getPrice(p),
    }));
    setItems(prev => [...prev.filter(i => i.description.trim() !== ''), ...imported]);
  };

  const handleAddItem = () => {
    setItems([
      ...items,
      { description: '', quantity: 1, unitPriceRupees: 0 },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const subtotalRupees = items.reduce(
    (sum, it) => sum + (Number(it.unitPriceRupees) || 0) * (Number(it.quantity) || 1),
    0,
  );
  const totalRupees = Math.max(0, subtotalRupees - discountRupees);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    const pid = preSelectedPatient?.id || selectedPatientId;
    if (!pid) {
      setError('Please select a patient');
      return;
    }
    if (items.length === 0) {
      setError('Please add at least one line item to the invoice');
      return;
    }

    setSubmitting(true);
    try {
      const invoice = await apiRequest<any>('/billing/invoices', {
        method: 'POST',
        body: JSON.stringify({
          patientId: pid,
          notes: notes.trim() || undefined,
          discountPaise: Math.round(discountRupees * 100),
          taxPaise: 0,
          items: items.map(item => ({
            completedProcedureId: item.completedProcedureId || undefined,
            description: item.description.trim(),
            toothNumber: item.toothNumber ? Number(item.toothNumber) : undefined,
            quantity: Number(item.quantity) || 1,
            unitPricePaise: Math.round(Number(item.unitPriceRupees) * 100),
          })),
        }),
      });

      triggerClinicSync('invoice_created');
      onInvoiceCreated(invoice);

      if (appointmentId) {
        try {
          await apiRequest(`/appointments/${appointmentId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'COMPLETED' }),
          });
          triggerClinicSync('appointment_completed');
        } catch (e) {
          console.warn('Could not auto-complete appointment', e);
        }
      }

      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to generate invoice');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
      <div className="bg-white rounded-2xl sm:rounded-3xl max-w-2xl w-full p-3.5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-teal-600" />
            <h3 className="font-bold text-slate-900 text-base">Generate Invoice</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {existingUnpaidInvoice && (
          <div className="mb-4 p-3.5 bg-amber-50 border-2 border-amber-300 rounded-xl text-amber-950 text-xs font-medium space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-amber-900 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                Unpaid Bill Found: #{existingUnpaidInvoice.invoiceNumber}
              </span>
              <span className="font-mono font-black text-rose-700 text-xs bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                Balance Due: ₹{(existingUnpaidInvoice.balancePaise / 100).toLocaleString('en-IN')}
              </span>
            </div>
            <p className="text-[11px] text-amber-800">
              This patient already has an open invoice with pending balance. To prevent duplicate billing, collect payment directly on #{existingUnpaidInvoice.invoiceNumber}.
            </p>
            {onCollectExistingPayment && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onCollectExistingPayment(existingUnpaidInvoice);
                }}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-black text-xs cursor-pointer shadow-xs transition-all inline-block"
              >
                ⚡ Collect Payment on #{existingUnpaidInvoice.invoiceNumber}
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Patient Selector */}
          {!preSelectedPatient && (
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Select Patient *</label>
              <select
                value={selectedPatientId}
                onChange={e => setSelectedPatientId(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 bg-white"
              >
                {patients.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} ({p.uhid}) — {p.phone}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Unbilled banner */}
          {unbilledProcedures.length > 0 && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between text-xs">
              <span className="text-purple-900 font-semibold">
                Found {unbilledProcedures.length} unbilled completed procedure(s).
              </span>
              <button
                type="button"
                onClick={handleImportUnbilled}
                className="text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                Import Procedures
              </button>
            </div>
          )}

          {/* Active Treatment Plans Banner */}
          {patientPlans.length > 0 && (
            <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-extrabold text-teal-950 block">Treatment Plans Available ({patientPlans.length})</span>
                  <span className="text-[11px] text-teal-700">Import doctor's custom-priced plan stages directly into this bill</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {patientPlans.map(plan => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => {
                      const importedStages = plan.items.map((it: any) => ({
                        description: `${it.procedureName}${it.toothNumber ? ` - Tooth #${it.toothNumber}` : ''}`,
                        toothNumber: it.toothNumber,
                        quantity: 1,
                        unitPriceRupees: Math.round(it.estimatedCostPaise / 100),
                      }));
                      setItems(prev => [...prev.filter(i => i.description.trim() !== ''), ...importedStages]);
                    }}
                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg cursor-pointer text-xs shadow-2xs transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Import "{plan.title}" (₹{(plan.totalEstimatedPaise / 100).toLocaleString('en-IN')})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Invoice Items ({items.length})
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Item
              </button>
            </div>

            {items.map((item, idx) => {
              const categories = Array.from(new Set(catalogue.map(c => c.category || 'General')));
              const itemTotal = (Number(item.quantity) || 1) * (Number(item.unitPriceRupees) || 0);

              return (
              <div key={idx} className="p-3 sm:p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700">Item #{idx + 1}</span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="text-rose-500 hover:text-rose-700 p-1 cursor-pointer"
                      title="Remove Item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Treatment Catalog Selector */}
                {catalogue.length > 0 ? (
                  <div className="bg-teal-50/70 border border-teal-200 rounded-lg p-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-extrabold text-teal-900 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-teal-600" />
                        Select Treatment from Catalog (Auto-fills Rate)
                      </label>
                      <span className="text-[10px] font-bold text-teal-700 font-mono">
                        Standard Fee
                      </span>
                    </div>
                    <select
                      onChange={e => {
                        const sel = catalogue.find(c => c.code === e.target.value);
                        if (sel) {
                          const newItems = [...items];
                          newItems[idx].description = sel.name;
                          newItems[idx].unitPriceRupees = Math.round((sel.standardFeePaise || 0) / 100);
                          setItems(newItems);
                        }
                      }}
                      defaultValue=""
                      className="w-full border border-teal-300 rounded-lg px-2.5 py-1.5 text-xs bg-white text-slate-900 font-bold focus:ring-2 focus:ring-teal-500 cursor-pointer"
                    >
                      <option value="" disabled>
                        -- Choose treatment to auto-fill name & price --
                      </option>
                      {categories.map(cat => (
                        <optgroup key={cat} label={`── ${cat} ──`}>
                          {catalogue
                            .filter(c => (c.category || 'General') === cat)
                            .map(c => (
                              <option key={c.code} value={c.code}>
                                {c.name} — ₹{((c.standardFeePaise || 0) / 100).toLocaleString('en-IN')}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="bg-slate-100/70 border border-dashed border-slate-200 rounded-lg p-2 text-slate-500 text-[11px] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Catalog is empty. Enter treatment details and fee manually below.</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-6">
                    <label className="text-[10px] text-slate-500 font-bold block mb-0.5">Description *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Molar Rotary Root Canal Treatment"
                      value={item.description}
                      onChange={e => {
                        const newItems = [...items];
                        newItems[idx].description = e.target.value;
                        setItems(newItems);
                      }}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white font-semibold"
                    />
                  </div>

                  <div className="sm:col-span-6 grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 font-bold block mb-0.5">Tooth #</label>
                      <input
                        type="number"
                        placeholder="e.g. 46"
                        value={item.toothNumber || ''}
                        onChange={e => {
                          const newItems = [...items];
                          newItems[idx].toothNumber = e.target.value ? Number(e.target.value) : undefined;
                          setItems(newItems);
                        }}
                        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 font-bold block mb-0.5">Qty</label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => {
                          const newItems = [...items];
                          newItems[idx].quantity = Number(e.target.value);
                          setItems(newItems);
                        }}
                        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 font-bold block mb-0.5">Rate (₹)</label>
                      <input
                        type="number"
                        min="0"
                        value={item.unitPriceRupees}
                        onChange={e => {
                          const newItems = [...items];
                          newItems[idx].unitPriceRupees = Number(e.target.value);
                          setItems(newItems);
                        }}
                        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px] text-slate-500">
                  <span>Item Total:</span>
                  <span className="font-mono font-bold text-slate-900">
                    ₹{itemTotal.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            );
            })}
          </div>

          {/* Discount & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Courtesy Discount (₹)
              </label>
              <input
                type="number"
                min="0"
                value={discountRupees}
                onChange={e => setDiscountRupees(Number(e.target.value))}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Invoice Notes</label>
              <input
                type="text"
                placeholder="e.g. Single-sitting RCT completed"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Summary Calculation Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-1.5">
            <div className="flex items-center justify-between text-slate-600">
              <span>Gross Subtotal:</span>
              <span className="font-mono font-bold">₹{subtotalRupees.toLocaleString('en-IN')}</span>
            </div>
            {discountRupees > 0 && (
              <div className="flex items-center justify-between text-rose-600">
                <span>Discount Applied:</span>
                <span className="font-mono font-bold">-₹{discountRupees.toLocaleString('en-IN')}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-sm font-bold text-slate-900">
              <span>Net Invoice Amount:</span>
              <span className="font-mono text-base font-extrabold text-teal-800">
                ₹{totalRupees.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-600 text-xs font-semibold rounded-xl hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4" />
              {submitting ? 'Generating...' : `Issue Invoice for ₹${totalRupees.toLocaleString('en-IN')}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
