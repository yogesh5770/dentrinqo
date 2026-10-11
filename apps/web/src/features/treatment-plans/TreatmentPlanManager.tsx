import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import {
  ClipboardList,
  Plus,
  CheckCircle2,
  Clock,
  CheckCircle,
  XCircle,
  IndianRupee,
  ChevronRight,
  Layers,
  ArrowRight,
  Trash2,
  Receipt,
  Edit2,
  Zap,
  X,
  Stethoscope,
} from 'lucide-react';
import { InvoiceModal } from '../billing/InvoiceModal';
import { PaymentModal } from '../billing/PaymentModal';
import { InvoicePrintModal } from '../billing/InvoicePrintModal';
import { useClinicSync, triggerClinicSync } from '../../lib/sync';

interface TreatmentPlanItem {
  id: string;
  toothNumber?: number;
  procedureCode: string;
  procedureName: string;
  estimatedCostPaise: number;
  status: string;
  sequenceOrder: number;
  notes?: string;
  completedProcedure?: any;
}

interface TreatmentPlan {
  id: string;
  title: string;
  status: string;
  totalEstimatedPaise: number;
  dentistNotes?: string;
  createdAt: string;
  items: TreatmentPlanItem[];
}

interface TreatmentPlanManagerProps {
  patientId: string;
  consultationId?: string;
  readOnly?: boolean;
  onProcedureCompleted?: () => void;
  patientName?: string;
}

export const TreatmentPlanManager: React.FC<TreatmentPlanManagerProps> = ({
  patientId,
  consultationId,
  readOnly = false,
  onProcedureCompleted,
  patientName: propPatientName,
}) => {
  const [plans, setPlans] = useState<TreatmentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [patientInfo, setPatientInfo] = useState<any | null>(null);

  // Catalogue
  const [catalogue, setCatalogue] = useState<any[]>([]);

  // Create Form State
  const [planTitle, setPlanTitle] = useState('');
  const [dentistNotes, setDentistNotes] = useState('');
  const [planItems, setPlanItems] = useState<
    { toothNumber?: number; procedureCode: string; procedureName: string; estimatedCostRupees: number; notes?: string }[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Inline Fee Editing State
  const [editingFeeItem, setEditingFeeItem] = useState<{ id: string; feeRupees: number } | null>(null);
  const [savingFee, setSavingFee] = useState(false);

  // Add Item to Existing Plan State
  const [addingItemPlan, setAddingItemPlan] = useState<TreatmentPlan | null>(null);
  const [newItemTooth, setNewItemTooth] = useState<number | undefined>(undefined);
  const [newItemCode, setNewItemCode] = useState('CUSTOM');
  const [newItemName, setNewItemName] = useState('');
  const [newItemFeeRupees, setNewItemFeeRupees] = useState<number>(1000);
  const [newItemNotes, setNewItemNotes] = useState('');
  const [savingNewItem, setSavingNewItem] = useState(false);

  // Chairside Complete Item Modal State
  const [completeChairModal, setCompleteChairModal] = useState<{
    plan: TreatmentPlan;
    item: TreatmentPlanItem;
    toothNumber?: number;
    feeRupees: number;
    notes: string;
  } | null>(null);
  const [completingInChair, setCompletingInChair] = useState(false);

  // Billing & Payment States
  const [invoiceModalPlan, setInvoiceModalPlan] = useState<TreatmentPlan | null>(null);
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<any | null>(null);
  const [printModalInvoice, setPrintModalInvoice] = useState<any | null>(null);

  const fetchPlans = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await apiRequest<TreatmentPlan[]>(`/treatment-plans/patient/${patientId}`);
      setPlans(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useClinicSync(() => fetchPlans(true));

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
      fetchPlans();
      fetchCatalogue();
      apiRequest<any>(`/patients/${patientId}`).then(setPatientInfo).catch(() => {});
    }
  }, [patientId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleOpenCreateModal = () => {
    setPlanTitle('');
    setDentistNotes('');
    if (catalogue && catalogue.length > 0) {
      const first = catalogue[0];
      setPlanItems([
        {
          toothNumber: undefined,
          procedureCode: first.code,
          procedureName: first.name,
          estimatedCostRupees: Math.round((first.standardFeePaise || 0) / 100),
          notes: '',
        },
      ]);
    } else {
      setPlanItems([
        {
          toothNumber: undefined,
          procedureCode: 'CUSTOM',
          procedureName: '',
          estimatedCostRupees: 0,
          notes: '',
        },
      ]);
    }
    setShowCreateModal(true);
  };

  const handleAddItem = () => {
    if (catalogue && catalogue.length > 0) {
      const first = catalogue[0];
      setPlanItems([
        ...planItems,
        {
          toothNumber: undefined,
          procedureCode: first.code,
          procedureName: first.name,
          estimatedCostRupees: Math.round((first.standardFeePaise || 0) / 100),
          notes: '',
        },
      ]);
    } else {
      setPlanItems([
        ...planItems,
        {
          toothNumber: undefined,
          procedureCode: 'CUSTOM',
          procedureName: '',
          estimatedCostRupees: 0,
          notes: '',
        },
      ]);
    }
  };

  const handleRemoveItem = (index: number) => {
    setPlanItems(planItems.filter((_, i) => i !== index));
  };

  const handleSelectProcedureFromCatalogue = (index: number, code: string) => {
    const newItems = [...planItems];
    if (code === 'CUSTOM' || !code) {
      newItems[index] = {
        ...newItems[index],
        procedureCode: 'CUSTOM',
      };
    } else {
      const item = catalogue.find(c => c.code === code);
      if (item) {
        newItems[index] = {
          ...newItems[index],
          procedureCode: item.code,
          procedureName: item.name,
          estimatedCostRupees: Math.round((item.standardFeePaise || 0) / 100),
        };
      }
    }
    setPlanItems(newItems);
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planTitle.trim()) return;
    setSubmitting(true);

    try {
      await apiRequest('/treatment-plans', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          consultationId,
          title: planTitle.trim(),
          dentistNotes: dentistNotes.trim() || undefined,
          items: planItems.map((item, idx) => ({
            toothNumber: item.toothNumber ? Number(item.toothNumber) : undefined,
            procedureCode: item.procedureCode,
            procedureName: item.procedureName,
            estimatedCostPaise: Math.round(item.estimatedCostRupees * 100),
            sequenceOrder: idx + 1,
            notes: item.notes?.trim() || undefined,
          })),
        }),
      });

      setShowCreateModal(false);
      setPlanTitle('');
      setDentistNotes('');
      await fetchPlans(true);
      triggerClinicSync('plan_created');
      showToast('New treatment plan generated successfully!');
    } catch (err) {
      console.error(err);
      showToast('Failed to create treatment plan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (planId: string, status: string) => {
    try {
      await apiRequest(`/treatment-plans/${planId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await fetchPlans(true);
      triggerClinicSync('plan_status_changed');
      showToast(`Treatment plan status changed to ${status}`);
    } catch (err) {
      console.error(err);
    }
  };

  // Save Inline Edited Fee on Treatment Plan Item
  const handleSaveEditedFee = async (itemId: string, newFeeRupees: number) => {
    setSavingFee(true);
    try {
      await apiRequest(`/treatment-plans/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          estimatedCostPaise: Math.round(Number(newFeeRupees) * 100),
        }),
      });
      setEditingFeeItem(null);
      await fetchPlans(true);
      triggerClinicSync('plan_item_updated');
      showToast(`Fee updated to ₹${Number(newFeeRupees).toLocaleString('en-IN')}`);
    } catch (err) {
      console.error(err);
      showToast('Failed to update item fee');
    } finally {
      setSavingFee(false);
    }
  };

  // Open Add Item to Existing Plan
  const openAddItemModal = (plan: TreatmentPlan) => {
    setAddingItemPlan(plan);
    setNewItemTooth(undefined);
    if (catalogue && catalogue.length > 0) {
      const first = catalogue[0];
      setNewItemCode(first.code);
      setNewItemName(first.name);
      setNewItemFeeRupees(Math.round((first.standardFeePaise || 0) / 100));
    } else {
      setNewItemCode('CUSTOM');
      setNewItemName('');
      setNewItemFeeRupees(1000);
    }
    setNewItemNotes('');
  };

  const handleSelectNewItemCatalogue = (code: string) => {
    setNewItemCode(code);
    if (code !== 'CUSTOM') {
      const match = catalogue.find(c => c.code === code);
      if (match) {
        setNewItemName(match.name);
        setNewItemFeeRupees(Math.round((match.standardFeePaise || 0) / 100));
      }
    }
  };

  const handleSaveNewPlanItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingItemPlan || !newItemName.trim()) return;
    setSavingNewItem(true);
    try {
      await apiRequest(`/treatment-plans/${addingItemPlan.id}/items`, {
        method: 'POST',
        body: JSON.stringify({
          toothNumber: newItemTooth ? Number(newItemTooth) : undefined,
          procedureCode: newItemCode,
          procedureName: newItemName.trim(),
          estimatedCostPaise: Math.round(Number(newItemFeeRupees) * 100),
          notes: newItemNotes.trim() || undefined,
        }),
      });
      setAddingItemPlan(null);
      await fetchPlans(true);
      triggerClinicSync('plan_item_added');
      showToast(`Added "${newItemName}" (₹${newItemFeeRupees}) to treatment plan!`);
    } catch (err) {
      console.error(err);
      showToast('Failed to add item to plan');
    } finally {
      setSavingNewItem(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!window.confirm('Are you sure you want to remove this item from the treatment plan?')) {
      return;
    }
    try {
      await apiRequest(`/treatment-plans/items/${itemId}`, { method: 'DELETE' });
      await fetchPlans(true);
      triggerClinicSync('plan_item_deleted');
      showToast('Treatment item removed');
    } catch (err) {
      console.error(err);
      showToast('Failed to delete item');
    }
  };

  // Open Complete in Chair Confirmation Dialog
  const openCompleteChairModal = (plan: TreatmentPlan, item: TreatmentPlanItem) => {
    setCompleteChairModal({
      plan,
      item,
      toothNumber: item.toothNumber,
      feeRupees: Math.round((item.estimatedCostPaise || 0) / 100),
      notes: item.notes || `Completed under plan: ${plan.title}`,
    });
  };

  // Confirm Complete in Chair -> logs procedure with fee & notifies reception billing desk
  const handleConfirmCompleteInChair = async () => {
    if (!completeChairModal) return;
    const { plan, item, feeRupees, toothNumber, notes } = completeChairModal;
    setCompletingInChair(true);

    try {
      // 1. If doctor adjusted fee, update treatment plan item first
      const originalFeeRupees = Math.round((item.estimatedCostPaise || 0) / 100);
      if (feeRupees !== originalFeeRupees) {
        await apiRequest(`/treatment-plans/items/${item.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            estimatedCostPaise: Math.round(Number(feeRupees) * 100),
          }),
        }).catch(console.error);
      }

      // 2. Record Completed Procedure
      await apiRequest('/procedures', {
        method: 'POST',
        body: JSON.stringify({
          patientId,
          toothNumber: toothNumber ? Number(toothNumber) : undefined,
          procedureCode: item.procedureCode,
          procedureName: item.procedureName,
          treatmentPlanItemId: item.id,
          consultationId,
          notes: notes?.trim() || undefined,
        }),
      });

      // 3. Trigger Clinic Sync with Payload to alert Reception Billing Desk
      const resolvedPatientName = propPatientName || patientInfo?.fullName || 'Patient';
      triggerClinicSync('treatment_completed_in_chair', {
        patientName: resolvedPatientName,
        patientId,
        patientUhid: patientInfo?.uhid,
        doctorName: 'Dr. Khalidh Khan',
        procedureName: item.procedureName,
        toothNumber,
        feeRupees: Number(feeRupees),
      });

      setCompleteChairModal(null);
      await fetchPlans(true);
      showToast(`✅ "${item.procedureName}" (₹${Number(feeRupees).toLocaleString('en-IN')}) marked COMPLETED! Billing Desk notified.`);
      if (onProcedureCompleted) onProcedureCompleted();
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Failed to complete procedure in chair');
    } finally {
      setCompletingInChair(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-teal-600" />
            Treatment Plans & Fees
          </h3>
          <p className="text-xs text-slate-500 font-medium">
            Doctor-defined treatment stages, custom procedure fees, and chairside completion
          </p>
        </div>

        {!readOnly && (
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs py-2 px-4 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            + New Treatment Plan
          </button>
        )}
      </div>

      {toastMessage && (
        <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-teal-900 text-xs font-bold flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500">Loading treatment plans...</div>
      ) : plans.length === 0 ? (
        <div className="clinic-card p-10 text-center text-slate-500">
          <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700">No active treatment plans created yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Build a proposed clinical plan with custom procedure fees and complete in chair.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map(plan => {
            const completedCount = plan.items.filter(i => i.status === 'COMPLETED').length;
            const progressPercent = Math.round((completedCount / (plan.items.length || 1)) * 100);

            return (
              <div key={plan.id} className="clinic-card p-5 space-y-4 border border-slate-200 shadow-xs">
                {/* Plan Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h4 className="font-bold text-slate-900 text-sm sm:text-base">{plan.title}</h4>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          plan.status === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : plan.status === 'ACCEPTED' || plan.status === 'IN_PROGRESS'
                            ? 'bg-teal-100 text-teal-800 border border-teal-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}
                      >
                        {plan.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-500">
                      <span>Created: {new Date(plan.createdAt).toLocaleDateString('en-IN')}</span>
                      <span>•</span>
                      <span>
                        Total Treatment Fee: <strong className="text-slate-900 font-mono font-black">₹{(plan.totalEstimatedPaise / 100).toLocaleString('en-IN')}</strong>
                      </span>
                      <span>•</span>
                      <span>Progress: {completedCount}/{plan.items.length} ({progressPercent}%)</span>
                    </div>
                  </div>

                  {/* Status buttons & Billing Action */}
                  {!readOnly && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setInvoiceModalPlan(plan)}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                        title="Create official bill for this treatment plan"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>Generate Bill</span>
                      </button>

                      {plan.status === 'PROPOSED' && (
                        <button
                          onClick={() => handleUpdateStatus(plan.id, 'ACCEPTED')}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 transition-colors cursor-pointer"
                        >
                          Mark Accepted
                        </button>
                      )}
                      {plan.status === 'ACCEPTED' && (
                        <button
                          onClick={() => handleUpdateStatus(plan.id, 'IN_PROGRESS')}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 transition-colors cursor-pointer"
                        >
                          Start Treatment
                        </button>
                      )}
                      {plan.status !== 'COMPLETED' && (
                        <button
                          onClick={() => handleUpdateStatus(plan.id, 'COMPLETED')}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
                        >
                          Mark Plan Done
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Dentist Notes if present */}
                {plan.dentistNotes && (
                  <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 font-medium">
                    <strong>Clinical Rationale:</strong> {plan.dentistNotes}
                  </p>
                )}

                {/* Staged Procedure Items */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                      Planned Procedures ({plan.items.length})
                    </span>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => openAddItemModal(plan)}
                        className="text-[11px] font-black text-teal-700 hover:text-teal-900 flex items-center gap-1 cursor-pointer bg-teal-50 hover:bg-teal-100 px-2.5 py-1 rounded-lg border border-teal-200 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5 text-teal-600" />
                        <span>+ Add Procedure to this Plan</span>
                      </button>
                    )}
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {plan.items.map(item => {
                      const isItemDone = item.status === 'COMPLETED';

                      return (
                        <div
                          key={item.id}
                          className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors ${
                            isItemDone ? 'bg-emerald-50/50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-[10px] mt-0.5">
                              {item.sequenceOrder}
                            </span>
                            <div>
                              <div className="flex items-center gap-2">
                                {item.toothNumber && (
                                  <span className="font-mono font-black text-teal-800 bg-teal-100 border border-teal-200 px-1.5 py-0.5 rounded text-[11px]">
                                    Tooth #{item.toothNumber}
                                  </span>
                                )}
                                <span className={`font-black ${isItemDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                  {item.procedureName}
                                </span>
                              </div>
                              {item.notes && <p className="text-[11px] text-slate-500 mt-0.5">{item.notes}</p>}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 justify-between sm:justify-end">
                            {/* Inline Fee Display / Edit */}
                            {editingFeeItem?.id === item.id ? (
                              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-teal-400">
                                <span className="text-slate-500 font-bold text-xs">₹</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={editingFeeItem.feeRupees}
                                  onChange={e => setEditingFeeItem({ ...editingFeeItem, feeRupees: Number(e.target.value) })}
                                  className="w-20 px-2 py-0.5 border border-slate-300 rounded font-mono font-bold text-xs bg-white text-slate-900 focus:outline-none"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  disabled={savingFee}
                                  onClick={() => handleSaveEditedFee(item.id, editingFeeItem.feeRupees)}
                                  className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-black cursor-pointer"
                                >
                                  {savingFee ? '...' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingFeeItem(null)}
                                  className="px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[10px] cursor-pointer"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono font-black text-slate-900 text-xs">
                                  ₹{(item.estimatedCostPaise / 100).toLocaleString('en-IN')}
                                </span>
                                {!isItemDone && !readOnly && (
                                  <button
                                    type="button"
                                    onClick={() => setEditingFeeItem({ id: item.id, feeRupees: Math.round(item.estimatedCostPaise / 100) })}
                                    className="text-slate-400 hover:text-teal-700 p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                                    title="Edit Planned Fee"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            )}

                            {isItemDone ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-300">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                Completed in Chair
                              </span>
                            ) : (
                              !readOnly && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => openCompleteChairModal(plan, item)}
                                    className="inline-flex items-center gap-1 text-[11px] font-black bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg shadow-xs transition-all cursor-pointer"
                                    title="Mark completed in chair & send fee directly to reception billing desk"
                                  >
                                    <Zap className="w-3 h-3 text-amber-300 fill-amber-300" />
                                    <span>Complete in Chair</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                                    title="Remove planned item"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: CHAIRSIDE COMPLETE ITEM CONFIRMATION */}
      {completeChairModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-teal-600 fill-teal-600" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm sm:text-base">Complete Treatment in Chair</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Verify fee & procedure before notifying Billing Desk</p>
                </div>
              </div>
              <button
                onClick={() => setCompleteChairModal(null)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-xl text-xs space-y-1.5">
              <div className="text-teal-950 font-black text-sm">
                {completeChairModal.item.procedureName}
              </div>
              <div className="text-teal-800 font-semibold flex items-center gap-2">
                {completeChairModal.toothNumber && (
                  <span className="font-mono bg-teal-200/80 px-2 py-0.5 rounded font-black">
                    Tooth #{completeChairModal.toothNumber}
                  </span>
                )}
                <span>Plan: {completeChairModal.plan.title}</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-xs font-black text-slate-800 block mb-1">
                  Procedure Fee to Send to Reception Desk (₹) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-sm">₹</span>
                  <input
                    type="number"
                    min="0"
                    required
                    value={completeChairModal.feeRupees}
                    onChange={e =>
                      setCompleteChairModal({ ...completeChairModal, feeRupees: Number(e.target.value) })
                    }
                    className="w-full border border-slate-300 rounded-xl pl-8 pr-3 py-2 text-sm font-mono font-black text-teal-950 focus:ring-2 focus:ring-teal-500 bg-white"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Reception will see this exact fee on their checkout screen for instant settlement.
                </p>
              </div>

              <div>
                <label className="text-xs font-black text-slate-800 block mb-1">
                  Tooth Number (optional)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 16, 46"
                  value={completeChairModal.toothNumber || ''}
                  onChange={e =>
                    setCompleteChairModal({
                      ...completeChairModal,
                      toothNumber: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-black text-slate-800 block mb-1">
                  Clinical Notes / Materials Used
                </label>
                <textarea
                  rows={2}
                  value={completeChairModal.notes}
                  onChange={e =>
                    setCompleteChairModal({ ...completeChairModal, notes: e.target.value })
                  }
                  placeholder="e.g. Completed single-visit RCT; canal obturated with bioceramic sealer..."
                  className="w-full border border-slate-300 rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-teal-500 font-medium"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCompleteChairModal(null)}
                className="px-4 py-2 border border-slate-300 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={completingInChair}
                onClick={handleConfirmCompleteInChair}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-md flex items-center gap-1.5"
              >
                <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                <span>
                  {completingInChair
                    ? 'Sending to Billing...'
                    : `⚡ Complete & Send to Billing (₹${completeChairModal.feeRupees.toLocaleString('en-IN')})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD PROCEDURE ITEM TO EXISTING PLAN */}
      {addingItemPlan && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-teal-600" />
                <h3 className="font-black text-slate-900 text-base">
                  Add Procedure to "{addingItemPlan.title}"
                </h3>
              </div>
              <button
                onClick={() => setAddingItemPlan(null)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNewPlanItem} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-4">
                  <label className="text-xs font-bold text-slate-700 block mb-1">Tooth # (FDI)</label>
                  <input
                    type="number"
                    placeholder="e.g. 46"
                    value={newItemTooth || ''}
                    onChange={e => setNewItemTooth(e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold"
                  />
                </div>

                <div className="sm:col-span-8">
                  <label className="text-xs font-bold text-slate-700 block mb-1">Select from Catalog</label>
                  <select
                    value={newItemCode}
                    onChange={e => handleSelectNewItemCatalogue(e.target.value)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white font-medium"
                  >
                    <option value="CUSTOM">✏️ Custom Procedure (Type Name & Fee)</option>
                    {catalogue.map(cat => (
                      <option key={cat.code} value={cat.code}>
                        {cat.name} (₹{cat.standardFeePaise / 100})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Procedure Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Zirconia Crown, Composite Restoration"
                  value={newItemName}
                  onChange={e => setNewItemName(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Estimated Fee (₹) *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-sm">₹</span>
                  <input
                    type="number"
                    min="0"
                    required
                    value={newItemFeeRupees}
                    onChange={e => setNewItemFeeRupees(Number(e.target.value))}
                    className="w-full border border-slate-300 rounded-xl pl-8 pr-3 py-2 text-xs font-mono font-bold text-teal-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Clinical Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Shade A2, subgingival margin"
                  value={newItemNotes}
                  onChange={e => setNewItemNotes(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAddingItemPlan(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingNewItem}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-xs"
                >
                  {savingNewItem ? 'Adding...' : `+ Add to Plan (₹${newItemFeeRupees.toLocaleString('en-IN')})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE TREATMENT PLAN MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Plus className="w-5 h-5 text-teal-600" />
                Build Staged Dental Treatment Plan
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Plan Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tooth 46 RCT & Crown"
                  value={planTitle}
                  onChange={e => setPlanTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Clinical Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Root canal treatment explained and approved by patient."
                  value={dentistNotes}
                  onChange={e => setDentistNotes(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Items List */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Planned Procedures ({planItems.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Procedure
                  </button>
                </div>

                {planItems.map((item, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-700">Stage {idx + 1}</span>
                        {item.toothNumber && (
                          <span className="text-[10px] font-mono font-bold bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded">
                            Tooth #{item.toothNumber}
                          </span>
                        )}
                      </div>
                      {planItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-rose-500 hover:text-rose-700 cursor-pointer p-1 rounded hover:bg-rose-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                      {/* Tooth Number */}
                      <div className="sm:col-span-2">
                        <label className="text-[10px] font-bold text-slate-600 block mb-1">Tooth #</label>
                        <input
                          type="number"
                          placeholder="e.g. 46"
                          value={item.toothNumber || ''}
                          onChange={e => {
                            const newItems = [...planItems];
                            newItems[idx].toothNumber = e.target.value ? Number(e.target.value) : undefined;
                            setPlanItems(newItems);
                          }}
                          className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:ring-1 focus:ring-teal-500"
                        />
                      </div>

                      {/* Procedure Catalogue Selector */}
                      <div className="sm:col-span-6">
                        <label className="text-[10px] font-bold text-slate-600 block mb-1">Pick from Catalogue</label>
                        <select
                          value={item.procedureCode}
                          onChange={e => handleSelectProcedureFromCatalogue(idx, e.target.value)}
                          className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:ring-1 focus:ring-teal-500 font-medium"
                        >
                          <option value="CUSTOM">✏️ Custom Procedure (Type Name & Fee)</option>
                          {catalogue.map(cat => (
                            <option key={cat.code} value={cat.code}>
                              {cat.name} (₹{cat.standardFeePaise / 100})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Estimated Fee */}
                      <div className="sm:col-span-4">
                        <label className="text-[10px] font-bold text-slate-600 block mb-1">Estimated Fee (₹) *</label>
                        <input
                          type="number"
                          min="0"
                          required
                          value={item.estimatedCostRupees ?? ''}
                          onChange={e => {
                            const newItems = [...planItems];
                            newItems[idx].estimatedCostRupees = Number(e.target.value);
                            setPlanItems(newItems);
                          }}
                          className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white font-mono font-bold text-teal-900 focus:ring-1 focus:ring-teal-500"
                        />
                      </div>

                      {/* Editable Procedure Title */}
                      <div className="sm:col-span-7">
                        <label className="text-[10px] font-bold text-slate-600 block mb-1">Procedure Title / Custom Description *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Root Canal Treatment, Zirconia Crown"
                          value={item.procedureName}
                          onChange={e => {
                            const newItems = [...planItems];
                            newItems[idx].procedureName = e.target.value;
                            setPlanItems(newItems);
                          }}
                          className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white font-semibold text-slate-900 focus:ring-1 focus:ring-teal-500"
                        />
                      </div>

                      {/* Notes */}
                      <div className="sm:col-span-5">
                        <label className="text-[10px] font-bold text-slate-600 block mb-1">Clinical Notes</label>
                        <input
                          type="text"
                          placeholder="e.g. Access cavity, obturation"
                          value={item.notes || ''}
                          onChange={e => {
                            const newItems = [...planItems];
                            newItems[idx].notes = e.target.value;
                            setPlanItems(newItems);
                          }}
                          className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:ring-1 focus:ring-teal-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary Bar */}
              <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-xl flex items-center justify-between text-xs">
                <span className="font-semibold text-teal-900">Total Estimated Plan Value:</span>
                <span className="font-mono font-black text-teal-950 text-sm">
                  ₹{planItems.reduce((acc, it) => acc + (Number(it.estimatedCostRupees) || 0), 0).toLocaleString('en-IN')}
                </span>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-600 text-xs font-semibold rounded-xl hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  <ClipboardList className="w-4 h-4" />
                  {submitting ? 'Generating Plan...' : 'Generate Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INVOICE & BILLING MODAL */}
      {invoiceModalPlan && (
        <InvoiceModal
          isOpen={Boolean(invoiceModalPlan)}
          preSelectedPatient={{ id: patientId }}
          consultationId={consultationId}
          initialProcedures={invoiceModalPlan.items
            .filter(i => i.status === 'COMPLETED' && i.completedProcedure)
            .map(i => ({
              ...i.completedProcedure,
              procedureName: i.procedureName,
              toothNumber: i.toothNumber,
              feePaise: i.estimatedCostPaise,
            }))}
          onClose={() => setInvoiceModalPlan(null)}
          onInvoiceCreated={created => {
            setInvoiceModalPlan(null);
            setPaymentModalInvoice(created);
          }}
          onCollectExistingPayment={inv => {
            setInvoiceModalPlan(null);
            setPaymentModalInvoice(inv);
          }}
        />
      )}

      {paymentModalInvoice && (
        <PaymentModal
          isOpen={Boolean(paymentModalInvoice)}
          onClose={() => setPaymentModalInvoice(null)}
          invoice={paymentModalInvoice}
          onPaymentSuccess={() => {
            const inv = paymentModalInvoice;
            setPaymentModalInvoice(null);
            setPrintModalInvoice(inv);
            showToast('Payment collected successfully!');
            fetchPlans(true);
            triggerClinicSync('payment_collected');
          }}
        />
      )}

      {printModalInvoice && (
        <InvoicePrintModal
          isOpen={Boolean(printModalInvoice)}
          onClose={() => setPrintModalInvoice(null)}
          invoice={printModalInvoice}
        />
      )}
    </div>
  );
};
