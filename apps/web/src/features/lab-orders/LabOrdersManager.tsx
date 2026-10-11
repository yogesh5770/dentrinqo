import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { useClinicSync, triggerClinicSync } from '../../lib/sync';
import {
  Package,
  PlusCircle,
  Search,
  Filter,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  MessageCircle,
  IndianRupee,
  CalendarDays,
  Trash2,
  Edit2,
  X,
  Phone,
  Layers,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

export interface LabOrder {
  id: string;
  clinicId: string;
  patientId: string;
  patient: {
    id: string;
    fullName: string;
    uhid: string;
    phone: string;
  };
  dentistId?: string;
  labName: string;
  itemType: string;
  toothNumber?: number | null;
  shade?: string | null;
  status: 'SENT' | 'IN_LAB' | 'RECEIVED' | 'TRIAL_DONE' | 'FITTED' | 'CANCELLED';
  sentDate: string;
  expectedDueDate?: string | null;
  patientApptDate?: string | null;
  costPaise: number;
  notes?: string | null;
  technicianPhone?: string | null;
  createdAt: string;
  updatedAt: string;
}

const ITEM_TYPES = [
  { id: 'ZIRCONIA_CROWN', label: 'Zirconia Crown (Monolithic / Multilayer)' },
  { id: 'PFM_BRIDGE', label: 'PFM Porcelain-Fused-to-Metal Bridge' },
  { id: 'EMAX_VENEER', label: 'E.max Lithium Disilicate Veneer' },
  { id: 'COMPLETE_DENTURE', label: 'Complete Denture (BPS / High Impact)' },
  { id: 'CAST_PARTIAL_RPD', label: 'Cast Partial Denture (Co-Cr)' },
  { id: 'CLEAR_ALIGNER', label: 'Clear Aligner Orthodontic Set' },
  { id: 'IMPLANT_ABUTMENT', label: 'Custom Titanium Implant Abutment + Crown' },
  { id: 'NIGHT_GUARD', label: 'Dual-Laminate Occlusal Splint / Night Guard' },
  { id: 'ORTHO_RETAINER', label: 'Hawley / Essix Retainer' },
  { id: 'OTHER_PROSTHESIS', label: 'Custom Lab Prosthesis' },
];

const SHADE_GUIDE = [
  'A1', 'A2', 'A3', 'A3.5', 'A4',
  'B1', 'B2', 'B3', 'B4',
  'C1', 'C2', 'C3', 'C4',
  'D2', 'D3', 'D4',
  'BL1', 'BL2', 'BL3', 'BL4',
];

const STATUS_CONFIG: Record<string, { label: string; badge: string; color: string; desc: string }> = {
  SENT: {
    label: 'Sent to Lab',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    color: '#d97706',
    desc: 'Dispatched from clinic',
  },
  IN_LAB: {
    label: 'In Fabrication',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    color: '#2563eb',
    desc: 'Work in progress at lab',
  },
  RECEIVED: {
    label: 'Ready in Clinic',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-500/20 animate-pulse',
    color: '#059669',
    desc: 'Prosthesis delivered, ready for fit',
  },
  FITTED: {
    label: 'Completed / Fitted',
    badge: 'bg-slate-100 text-slate-700 border-slate-200',
    color: '#475569',
    desc: 'Delivered to patient',
  },
  CANCELLED: {
    label: 'Remake / Cancelled',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    color: '#e11d48',
    desc: 'Order discarded or cancelled',
  },
};

interface LabOrdersManagerProps {
  onOpenBookingForPatient?: (patient: any) => void;
}

export const LabOrdersManager: React.FC<LabOrdersManagerProps> = ({ onOpenBookingForPatient }) => {
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // New Order Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);

  const [formLabName, setFormLabName] = useState('Modern Dental Lab');
  const [formItemType, setFormItemType] = useState('ZIRCONIA_CROWN');
  const [formToothNumber, setFormToothNumber] = useState<string>('');
  const [formShade, setFormShade] = useState('A2');
  const [formDueDate, setFormDueDate] = useState('');
  const [formCostRupees, setFormCostRupees] = useState('');
  const [formTechPhone, setFormTechPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchOrders = async (silent?: boolean | unknown) => {
    if (silent !== true) setLoading(true);
    try {
      const query = statusFilter !== 'ALL' ? `?status=${statusFilter}` : '';
      const data = await apiRequest(`/api/lab-orders${query}`);
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch lab orders', err);
    } finally {
      if (silent !== true) setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [statusFilter]);

  // Real-time zero-refresh reactivity
  useClinicSync(() => {
    fetchOrders(true);
  });

  // Search patients for modal
  useEffect(() => {
    if (!patientSearch.trim() || patientSearch.length < 2) {
      setPatientResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res: any = await apiRequest(`/api/patients?search=${encodeURIComponent(patientSearch)}`);
        const list = Array.isArray(res) ? res : res?.patients || [];
        setPatientResults(list.slice(0, 5));
      } catch (err) {
        console.error(err);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [patientSearch]);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    setSubmitting(true);
    try {
      const payload = {
        patientId: selectedPatient.id,
        labName: formLabName.trim(),
        itemType: formItemType,
        toothNumber: formToothNumber ? parseInt(formToothNumber, 10) : undefined,
        shade: formShade,
        expectedDueDate: formDueDate ? new Date(formDueDate).toISOString() : undefined,
        costPaise: formCostRupees ? Math.round(parseFloat(formCostRupees) * 100) : 0,
        technicianPhone: formTechPhone.trim() || undefined,
        notes: formNotes.trim() || undefined,
      };

      await apiRequest('/api/lab-orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      triggerClinicSync('lab_order_created');
      setShowCreateModal(false);
      resetForm();
      fetchOrders();
    } catch (err: any) {
      alert(err.message || 'Failed to create dental lab order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (orderId: string, nextStatus: string) => {
    try {
      await apiRequest(`/api/lab-orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      triggerClinicSync('lab_order_updated');
      fetchOrders(true);
    } catch (err: any) {
      alert(err.message || 'Failed to update lab order status');
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm('Are you sure you want to delete this lab work order record?')) return;
    try {
      await apiRequest(`/api/lab-orders/${orderId}`, {
        method: 'DELETE',
      });
      triggerClinicSync('lab_order_deleted');
      fetchOrders(true);
    } catch (err: any) {
      alert(err.message || 'Failed to delete order');
    }
  };

  const resetForm = () => {
    setSelectedPatient(null);
    setPatientSearch('');
    setFormToothNumber('');
    setFormCostRupees('');
    setFormDueDate('');
    setFormNotes('');
    setFormTechPhone('');
  };

  // WhatsApp generator to lab technician
  const getWhatsAppLabLink = (order: LabOrder) => {
    const text = encodeURIComponent(
      `Hello ${order.labName}, this is regarding dental lab order for Patient ${order.patient.fullName} (${order.patient.uhid}). Item: ${order.itemType}, Tooth #${order.toothNumber || 'General'}, Shade: ${order.shade || 'Standard'}. Expected Delivery: ${order.expectedDueDate ? new Date(order.expectedDueDate).toLocaleDateString('en-IN') : 'ASAP'}. Please provide tracking status.`,
    );
    const phone = (order.technicianPhone || '').replace(/\D/g, '');
    return phone ? `https://wa.me/91${phone}?text=${text}` : `https://wa.me/?text=${text}`;
  };

  // WhatsApp generator to patient when prosthesis arrives
  const getWhatsAppPatientLink = (order: LabOrder) => {
    const cleanPhone = order.patient.phone.replace(/\D/g, '');
    const text = encodeURIComponent(
      `Dear ${order.patient.fullName}, good news! Your custom dental prosthesis (${order.itemType.replace(/_/g, ' ')}) has arrived at our clinic from the dental laboratory. We are ready to proceed with your trial/fitting. Please call or reply to confirm your appointment timing.`,
    );
    return `https://wa.me/91${cleanPhone}?text=${text}`;
  };

  // Telemetry Metrics
  const activeCount = orders.filter((o) => o.status === 'SENT' || o.status === 'IN_LAB').length;
  const readyCount = orders.filter((o) => o.status === 'RECEIVED').length;
  const fittedCount = orders.filter((o) => o.status === 'FITTED').length;
  const totalLabExpenses = orders.reduce((acc, o) => acc + (o.costPaise || 0), 0);

  // Filtered orders
  const filteredOrders = orders.filter((o) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.patient.fullName.toLowerCase().includes(q) ||
      o.patient.uhid.toLowerCase().includes(q) ||
      o.labName.toLowerCase().includes(q) ||
      o.itemType.toLowerCase().includes(q) ||
      (o.shade && o.shade.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 sm:p-6 lg:p-8">
      {/* Header & Art Direction */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold tracking-wide mb-2 border border-teal-100">
              <Package className="w-3.5 h-3.5" />
              PROSTHODONTIC PIPELINE & VENDOR TRACKER
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Dental Lab Work Orders
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Real-time prosthesis fabrication tracking, Vita shade precision, due-date countdowns, and automated WhatsApp delivery notices.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm shadow-sm transition duration-150"
            >
              <PlusCircle className="w-4 h-4" />
              Dispatch New Lab Order
            </button>
          </div>
        </div>

        {/* Telemetry Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">In Fabrication</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">{activeCount}</p>
              <p className="text-xs text-amber-600 mt-0.5 font-medium">Under fabrication</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-emerald-200/90 shadow-sm flex items-center gap-4 relative overflow-hidden bg-gradient-to-br from-white to-emerald-50/30">
            <div className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-emerald-500/20">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Ready in Clinic</p>
              <p className="text-2xl font-bold text-emerald-900 mt-0.5">{readyCount}</p>
              <p className="text-xs text-emerald-700 mt-0.5 font-semibold">Needs fitting visit</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center shrink-0">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Completed / Fitted</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">{fittedCount}</p>
              <p className="text-xs text-slate-500 mt-0.5">Delivered to patients</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center shrink-0">
              <IndianRupee className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Lab Cost</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">₹{(totalLabExpenses / 100).toLocaleString('en-IN')}</p>
              <p className="text-xs text-teal-600 mt-0.5">Vendor expenses</p>
            </div>
          </div>
        </div>

        {/* Filter Pipeline Tabs & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {['ALL', 'SENT', 'IN_LAB', 'RECEIVED', 'FITTED', 'CANCELLED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 ${
                  statusFilter === st
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {st === 'ALL' ? 'All Orders' : STATUS_CONFIG[st]?.label || st}
                <span className="ml-1.5 opacity-75 font-normal">
                  ({st === 'ALL' ? orders.length : orders.filter((o) => o.status === st).length})
                </span>
              </button>
            ))}
          </div>

          <div className="relative min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by patient, UHID, lab or shade..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>
        </div>

        {/* Order Cards Grid */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
            <Package className="w-8 h-8 mx-auto animate-bounce text-teal-600 mb-2" />
            <p className="text-sm font-semibold">Loading lab work orders...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
            <Package className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <h3 className="text-base font-bold text-slate-800">No dental lab orders found</h3>
            <p className="text-xs text-slate-400 mt-1">
              {statusFilter !== 'ALL'
                ? `No orders matching status "${statusFilter}".`
                : 'Click "Dispatch New Lab Order" to register your first lab fabrication.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredOrders.map((order) => {
              const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.SENT;
              const isOverdue =
                order.expectedDueDate &&
                new Date(order.expectedDueDate) < new Date() &&
                order.status !== 'RECEIVED' &&
                order.status !== 'FITTED' &&
                order.status !== 'CANCELLED';

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-2xl border p-5 transition-all duration-200 hover:shadow-md flex flex-col justify-between ${
                    order.status === 'RECEIVED'
                      ? 'border-emerald-300 ring-1 ring-emerald-400/20'
                      : isOverdue
                      ? 'border-rose-300 ring-1 ring-rose-400/20'
                      : 'border-slate-200/90'
                  }`}
                >
                  <div className="space-y-4">
                    {/* Header with status */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.badge}`}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                          {cfg.label}
                        </span>
                        {isOverdue && (
                          <span className="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[11px] font-bold border border-rose-200">
                            Overdue
                          </span>
                        )}
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-700">₹{(order.costPaise / 100).toLocaleString('en-IN')}</span>
                        <p className="text-[10px] text-slate-400">Lab Cost</p>
                      </div>
                    </div>

                    {/* Patient & Prosthesis Info */}
                    <div>
                      <h4 className="text-base font-bold text-slate-900 hover:text-teal-600 transition">
                        {order.patient.fullName}
                      </h4>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        UHID: <span className="font-semibold text-slate-700">{order.patient.uhid}</span> • {order.patient.phone}
                      </p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-100 space-y-1.5 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-medium">Prosthesis:</span>
                        <span className="font-bold text-slate-800 text-right">{order.itemType.replace(/_/g, ' ')}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-medium">Tooth (FDI):</span>
                        <span className="font-bold text-teal-700">{order.toothNumber ? `#${order.toothNumber}` : 'Full Arch / Multi'}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-medium">Vita Shade:</span>
                        <span className="font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-900">
                          {order.shade || 'Natural'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500 font-medium">Lab Vendor:</span>
                        <span className="font-semibold text-slate-700">{order.labName}</span>
                      </div>
                    </div>

                    {/* Due Date & Timelines */}
                    <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                      <span className="inline-flex items-center gap-1 text-slate-600">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        Due: {order.expectedDueDate ? new Date(order.expectedDueDate).toLocaleDateString('en-IN') : 'No target date'}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Sent {new Date(order.sentDate).toLocaleDateString('en-IN')}
                      </span>
                    </div>

                    {order.notes && (
                      <p className="text-xs text-slate-600 italic bg-amber-50/50 p-2 rounded-lg border border-amber-100/50">
                        "{order.notes}"
                      </p>
                    )}
                  </div>

                  {/* Actions & WhatsApp buttons */}
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                    <div className="flex items-center gap-2">
                      {order.status === 'SENT' && (
                        <button
                          onClick={() => handleUpdateStatus(order.id, 'IN_LAB')}
                          className="flex-1 py-1.5 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs border border-blue-200 transition"
                        >
                          Mark In Lab
                        </button>
                      )}
                      {order.status === 'IN_LAB' && (
                        <button
                          onClick={() => handleUpdateStatus(order.id, 'RECEIVED')}
                          className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition"
                        >
                          Mark Received in Clinic
                        </button>
                      )}
                      {order.status === 'RECEIVED' && (
                        <button
                          onClick={() => handleUpdateStatus(order.id, 'FITTED')}
                          className="flex-1 py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs shadow-sm transition"
                        >
                          Mark Fitted / Delivered
                        </button>
                      )}

                      {/* WhatsApp Trigger */}
                      {order.status === 'RECEIVED' ? (
                        <a
                          href={getWhatsAppPatientLink(order)}
                          target="_blank"
                          rel="noreferrer"
                          className="py-1.5 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold text-xs border border-emerald-200 inline-flex items-center gap-1 transition"
                          title="Notify patient on WhatsApp that crown has arrived"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                          Notify Patient
                        </a>
                      ) : (
                        <a
                          href={getWhatsAppLabLink(order)}
                          target="_blank"
                          rel="noreferrer"
                          className="py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs inline-flex items-center gap-1 transition"
                          title="WhatsApp Lab Technician"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-slate-500" />
                          Lab WA
                        </a>
                      )}

                      <button
                        onClick={() => handleDeleteOrder(order.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                        title="Delete lab order"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {order.status === 'RECEIVED' && onOpenBookingForPatient && (
                      <button
                        onClick={() => onOpenBookingForPatient(order.patient)}
                        className="w-full py-1.5 px-3 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 font-semibold text-xs border border-teal-200 flex items-center justify-center gap-1 transition"
                      >
                        <CalendarDays className="w-3.5 h-3.5 text-teal-600" />
                        Schedule Fitting Appointment
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* New Lab Work Order Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Dispatch New Dental Lab Order</h3>
                <p className="text-xs text-slate-500">Track prosthesis fabrication with shade guide and technician due dates</p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="p-6 space-y-4">
              {/* Patient Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  1. Select Patient *
                </label>
                {selectedPatient ? (
                  <div className="p-3 rounded-xl bg-teal-50/60 border border-teal-200 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{selectedPatient.fullName}</p>
                      <p className="text-xs text-slate-500 font-mono">
                        UHID: {selectedPatient.uhid} • Phone: {selectedPatient.phone}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPatient(null)}
                      className="text-xs font-semibold text-teal-700 hover:underline"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Type patient name or UHID to search..."
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                    />
                    {patientResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden divide-y divide-slate-100">
                        {patientResults.map((p) => (
                          <div
                            key={p.id}
                            onClick={() => {
                              setSelectedPatient(p);
                              setPatientResults([]);
                            }}
                            className="p-3 text-xs hover:bg-slate-50 cursor-pointer flex justify-between items-center"
                          >
                            <div>
                              <p className="font-bold text-slate-900">{p.fullName}</p>
                              <p className="text-slate-500">{p.phone}</p>
                            </div>
                            <span className="font-mono text-slate-400 text-[11px]">{p.uhid}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Lab Name & Item Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    2. Dental Lab Vendor *
                  </label>
                  <input
                    type="text"
                    required
                    value={formLabName}
                    onChange={(e) => setFormLabName(e.target.value)}
                    placeholder="e.g. DentCare, Modern Lab, Illusion"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    3. Prosthesis Category *
                  </label>
                  <select
                    value={formItemType}
                    onChange={(e) => setFormItemType(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                  >
                    {ITEM_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tooth Number & Shade Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    4. FDI Tooth Number (optional)
                  </label>
                  <input
                    type="number"
                    value={formToothNumber}
                    onChange={(e) => setFormToothNumber(e.target.value)}
                    placeholder="e.g. 11, 26, 46"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    5. Vita Shade Guide
                  </label>
                  <select
                    value={formShade}
                    onChange={(e) => setFormShade(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                  >
                    {SHADE_GUIDE.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Due Date & Cost */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    6. Expected Due Date
                  </label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    7. Lab Cost (₹ Rupees)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formCostRupees}
                    onChange={(e) => setFormCostRupees(e.target.value)}
                    placeholder="e.g. 1500"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
              </div>

              {/* Technician Phone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  8. Lab Contact Phone / WhatsApp
                </label>
                <input
                  type="tel"
                  value={formTechPhone}
                  onChange={(e) => setFormTechPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              {/* Instructions */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  9. Lab Instructions / Occlusion Details
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="e.g. High contact point on mesial, keep subgingival margin 0.5mm..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedPatient || submitting}
                  className="px-5 py-2 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-sm disabled:opacity-50 transition"
                >
                  {submitting ? 'Creating...' : 'Dispatch Lab Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default LabOrdersManager;
