import React, { useState, useEffect } from 'react';
import {
  PhoneCall,
  Calendar,
  MessageCircle,
  CheckCircle2,
  Clock,
  User,
  PlusCircle,
  Filter,
  Search,
  AlertCircle,
  PhoneForwarded,
  X,
  Sparkles,
  TrendingUp,
  IndianRupee,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { openWhatsApp, generateFollowUpWhatsAppText } from '../../lib/whatsapp';
import { useClinicSync, triggerClinicSync } from '../../lib/sync';

interface FollowUpItem {
  id: string;
  patientId: string;
  patient: {
    id: string;
    fullName: string;
    uhid: string;
    phone: string;
  };
  scheduledDate: string;
  type: 'POST_OP' | 'RECALL' | 'PROSTHESIS' | 'ORTHO' | 'GENERAL' | string;
  status: 'PENDING' | 'CONTACTED' | 'RESCHEDULED' | 'COMPLETED' | string;
  notes?: string;
  reminderSent?: boolean;
}

interface RecallCampaignData {
  dropouts: {
    id: string;
    patientId: string;
    patientName: string;
    uhid: string;
    phone: string;
    type: string;
    title: string;
    pendingProcedures: string;
    potentialRevenuePaise: number;
    whatsappText: string;
  }[];
  hygieneRecalls: {
    id: string;
    patientId: string;
    patientName: string;
    uhid: string;
    phone: string;
    type: string;
    title: string;
    notes?: string;
    whatsappText: string;
  }[];
  totalDropoutRevenuePaise: number;
}

export const FollowUpsView: React.FC<{ onOpenBooking?: () => void }> = ({ onOpenBooking }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'reminders' | 'campaigns'>('campaigns');

  // Reminders state
  const [items, setItems] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  // Smart Recalls & Dropout Campaign state
  const [campaignData, setCampaignData] = useState<RecallCampaignData | null>(null);
  const [campaignFilter, setCampaignFilter] = useState<'ALL' | 'DROPOUTS' | 'HYGIENE'>('ALL');
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  // Manual follow-up modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [patients, setPatients] = useState<any[]>([]);
  const [modalPatientId, setModalPatientId] = useState('');
  const [modalType, setModalType] = useState('RECALL');
  const [modalDate, setModalDate] = useState(
    new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
  );
  const [modalNotes, setModalNotes] = useState('');
  const [submittingModal, setSubmittingModal] = useState(false);

  const fetchFollowUps = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await apiRequest<FollowUpItem[]>('/api/follow-ups');
      setItems(data || []);
    } catch (err) {
      console.error('Failed to load follow-ups:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchCampaigns = async (silent = false) => {
    try {
      if (!silent) setLoadingCampaigns(true);
      const data = await apiRequest<RecallCampaignData>('/api/follow-ups/recalls');
      setCampaignData(data);
    } catch (err) {
      console.error('Failed to load recall campaigns:', err);
    } finally {
      if (!silent) setLoadingCampaigns(false);
    }
  };

  useEffect(() => {
    fetchFollowUps(false);
    fetchCampaigns(false);

    apiRequest<any>('/api/patients')
      .then((res) => {
        const list = res.data || res || [];
        setPatients(list);
        if (list.length > 0 && !modalPatientId) {
          setModalPatientId(list[0].id);
        }
      })
      .catch(console.error);
  }, []);

  useClinicSync(() => {
    fetchFollowUps(true);
    fetchCampaigns(true);
  });

  const markStatus = async (id: string, newStatus: string) => {
    try {
      await apiRequest(`/api/follow-ups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, reminderSent: true }),
      });
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: newStatus, reminderSent: true } : item)),
      );
      triggerClinicSync('followup_updated');
    } catch (err) {
      console.error('Failed to update follow-up status:', err);
    }
  };

  const handleCreateFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalPatientId) return;

    setSubmittingModal(true);
    try {
      await apiRequest('/api/follow-ups', {
        method: 'POST',
        body: JSON.stringify({
          patientId: modalPatientId,
          type: modalType,
          scheduledDate: new Date(modalDate).toISOString(),
          notes: modalNotes.trim() || undefined,
        }),
      });

      setIsModalOpen(false);
      setModalNotes('');
      triggerClinicSync('followup_created');
      await fetchFollowUps(true);
    } catch (err: any) {
      alert(err.message || 'Failed to create follow-up reminder');
    } finally {
      setSubmittingModal(false);
    }
  };

  const sendWhatsApp = (item: FollowUpItem) => {
    const text = generateFollowUpWhatsAppText({
      patientName: item.patient.fullName,
      clinicName: user?.clinic?.name || 'Dental Clinic',
      procedure: item.notes || item.type,
      type: item.type,
      clinicPhone: user?.clinic?.phone || '',
    });
    openWhatsApp(item.patient.phone, text);
    markStatus(item.id, 'CONTACTED');
  };

  const sendDirectWhatsApp = (phone: string, text: string) => {
    openWhatsApp(phone, text);
  };

  const filtered = items.filter((item) => {
    const matchesType = filterType === 'ALL' || item.type === filterType;
    const matchesStatus = filterStatus === 'ALL' || item.status === filterStatus;
    const matchesSearch =
      !search ||
      item.patient.fullName.toLowerCase().includes(search.toLowerCase()) ||
      item.patient.uhid.toLowerCase().includes(search.toLowerCase()) ||
      (item.notes && item.notes.toLowerCase().includes(search.toLowerCase()));
    return matchesType && matchesStatus && matchesSearch;
  });

  const formatDue = (dateStr: string) => {
    const target = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);

    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 3600 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays < -1) return `${Math.abs(diffDays)} days overdue`;
    if (diffDays <= 7) return `In ${diffDays} days`;
    return target.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="clinic-card bg-white border border-slate-200 p-5 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <PhoneCall className="w-6 h-6 text-teal-600" />
            Patient Recalls & Revenue Recovery Engine
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
            Automated treatment dropout recovery, 6-month preventive hygiene recalls, and post-op care calls.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <PlusCircle className="w-4 h-4 text-teal-400" />
            <span>Schedule Reminder</span>
          </button>
          {onOpenBooking && (
            <button
              onClick={onOpenBooking}
              className="px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Calendar className="w-4 h-4" />
              <span>Book Appointment</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Mode Toggle: Dropout Recovery vs Daily Reminders */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
            activeTab === 'campaigns'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Smart Recall & Dropout Recovery</span>
          {campaignData && (
            <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px]">
              ₹{((campaignData.totalDropoutRevenuePaise || 0) / 100).toLocaleString('en-IN')}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('reminders')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
            activeTab === 'reminders'
              ? 'bg-teal-600 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <PhoneCall className="w-4 h-4" />
          <span>Daily Follow-Up Tasks ({items.length})</span>
        </button>
      </div>

      {/* TAB 1: SMART RECALL & DROPOUT RECOVERY ENGINE */}
      {activeTab === 'campaigns' && (
        <div className="space-y-6">
          {/* Revenue Recovery Telemetry Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-teal-600 to-teal-800 text-white p-5 rounded-2xl shadow-sm space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-teal-200">
                Potential Recoverable Revenue
              </span>
              <p className="text-3xl font-black">
                ₹{(((campaignData?.totalDropoutRevenuePaise || 0) / 100)).toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-teal-100 font-medium">
                Uncompleted planned procedures awaiting patient re-engagement
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Incomplete Treatment Dropouts
              </span>
              <p className="text-3xl font-black text-slate-900">
                {campaignData?.dropouts?.length || 0}
              </p>
              <p className="text-xs text-amber-600 font-semibold">
                High-priority treatment plan dropouts
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                6-Month Hygiene Recalls Due
              </span>
              <p className="text-3xl font-black text-slate-900">
                {campaignData?.hygieneRecalls?.length || 0}
              </p>
              <p className="text-xs text-teal-600 font-semibold">
                Routine preventive scaling & check-up due
              </p>
            </div>
          </div>

          {/* Sub-filters */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCampaignFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                campaignFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              All Campaigns
            </button>
            <button
              onClick={() => setCampaignFilter('DROPOUTS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                campaignFilter === 'DROPOUTS'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Incomplete Plans ({campaignData?.dropouts?.length || 0})
            </button>
            <button
              onClick={() => setCampaignFilter('HYGIENE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                campaignFilter === 'HYGIENE'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              Hygiene Recalls ({campaignData?.hygieneRecalls?.length || 0})
            </button>
          </div>

          {/* Campaign List */}
          {loadingCampaigns ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs font-bold text-slate-500">
              Analyzing patient records for recall opportunities...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Dropouts */}
              {(campaignFilter === 'ALL' || campaignFilter === 'DROPOUTS') &&
                campaignData?.dropouts?.map((d) => (
                  <div
                    key={`d-${d.id}`}
                    className="bg-white rounded-2xl border border-amber-200/90 p-5 shadow-xs hover:shadow-sm transition flex flex-col justify-between space-y-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                          Treatment Dropout Recovery
                        </span>
                        <span className="text-xs font-black text-amber-700">
                          ₹{(d.potentialRevenuePaise / 100).toLocaleString('en-IN')} Unbilled
                        </span>
                      </div>

                      <h4 className="text-base font-bold text-slate-900 mt-2">{d.patientName}</h4>
                      <p className="text-xs text-slate-500 font-mono">
                        UHID: <span className="font-semibold text-slate-700">{d.uhid}</span> • {d.phone}
                      </p>

                      <div className="mt-3 p-3 bg-amber-50/50 rounded-xl border border-amber-100 text-xs space-y-1">
                        <p className="font-bold text-slate-800">{d.title}</p>
                        <p className="text-slate-600 font-medium">
                          Pending: <span className="text-amber-800">{d.pendingProcedures}</span>
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() => sendDirectWhatsApp(d.phone, d.whatsappText)}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        1-Click WhatsApp
                      </button>

                      {onOpenBooking && (
                        <button
                          onClick={onOpenBooking}
                          className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1 transition"
                        >
                          <Calendar className="w-3.5 h-3.5 text-teal-600" />
                          Book
                        </button>
                      )}
                    </div>
                  </div>
                ))}

              {/* Hygiene Recalls */}
              {(campaignFilter === 'ALL' || campaignFilter === 'HYGIENE') &&
                campaignData?.hygieneRecalls?.map((h) => (
                  <div
                    key={`h-${h.id}`}
                    className="bg-white rounded-2xl border border-teal-200/90 p-5 shadow-xs hover:shadow-sm transition flex flex-col justify-between space-y-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200">
                          6-Month Hygiene Recall Due
                        </span>
                        <span className="text-xs font-bold text-teal-700">Scaling & Check</span>
                      </div>

                      <h4 className="text-base font-bold text-slate-900 mt-2">{h.patientName}</h4>
                      <p className="text-xs text-slate-500 font-mono">
                        UHID: <span className="font-semibold text-slate-700">{h.uhid}</span> • {h.phone}
                      </p>

                      <div className="mt-3 p-3 bg-teal-50/50 rounded-xl border border-teal-100 text-xs text-slate-600">
                        {h.notes || 'Routine cleaning and clinical check-up due'}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() => sendDirectWhatsApp(h.phone, h.whatsappText)}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        Send Hygiene Recall WhatsApp
                      </button>

                      {onOpenBooking && (
                        <button
                          onClick={onOpenBooking}
                          className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center gap-1 transition"
                        >
                          <Calendar className="w-3.5 h-3.5 text-teal-600" />
                          Book
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: STANDARD REMINDERS */}
      {activeTab === 'reminders' && (
        <div className="space-y-4">
          {/* Filter and Search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto text-xs font-bold pb-1">
              {['ALL', 'POST_OP', 'RECALL', 'PROSTHESIS', 'ORTHO', 'GENERAL'].map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                    filterType === type
                      ? 'bg-slate-900 text-white font-extrabold shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {type.replace('_', ' ')}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="p-2 px-3 text-xs bg-white border border-slate-300 rounded-xl font-bold text-slate-700 focus:outline-hidden focus:border-teal-600 cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending Action</option>
                <option value="CONTACTED">Contacted</option>
                <option value="COMPLETED">Completed</option>
              </select>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search patient, UHID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl font-medium focus:outline-hidden focus:border-teal-600"
                />
              </div>
            </div>
          </div>

          {/* List of Follow-Ups */}
          {loading ? (
            <div className="p-12 text-center text-xs font-bold text-slate-500">Loading follow-ups...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
              <PhoneCall className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-700">No scheduled reminders found</p>
              <p className="text-xs text-slate-400 mt-1">
                Reminders are generated after surgical procedures or patient checkout.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs hover:shadow-sm transition flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {item.type.replace('_', ' ')}
                      </span>
                      <span className="text-xs font-bold text-amber-700 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDue(item.scheduledDate)}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{item.patient.fullName}</h4>
                      <p className="text-xs text-slate-500 font-mono">
                        UHID: {item.patient.uhid} • {item.patient.phone}
                      </p>
                    </div>

                    {item.notes && (
                      <p className="text-xs text-slate-600 italic bg-slate-50 p-2 rounded-lg">
                        "{item.notes}"
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => sendWhatsApp(item)}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      WhatsApp
                    </button>

                    {item.status === 'PENDING' ? (
                      <button
                        onClick={() => markStatus(item.id, 'COMPLETED')}
                        className="py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition"
                      >
                        Done
                      </button>
                    ) : (
                      <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {item.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Manual Follow-up Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Schedule Patient Follow-Up</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFollowUp} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Patient *
                </label>
                <select
                  required
                  value={modalPatientId}
                  onChange={(e) => setModalPatientId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.uhid})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Type of Reminder *
                </label>
                <select
                  value={modalType}
                  onChange={(e) => setModalType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="POST_OP">Post-Operative Care Check</option>
                  <option value="RECALL">Routine 6-Month Preventive Hygiene</option>
                  <option value="PROSTHESIS">Prosthesis Trial / Delivery</option>
                  <option value="ORTHO">Orthodontic Tightening Recall</option>
                  <option value="GENERAL">General Communication</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Scheduled Follow-up Date *
                </label>
                <input
                  type="date"
                  required
                  value={modalDate}
                  onChange={(e) => setModalDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                </input>
              </div>

              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Clinical Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Suture removal check post tooth extraction..."
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingModal}
                  className="px-5 py-2 font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-xl shadow-xs disabled:opacity-50"
                >
                  {submittingModal ? 'Scheduling...' : 'Save Follow-Up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
export default FollowUpsView;
