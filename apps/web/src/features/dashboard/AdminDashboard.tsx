import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useClinicSync, triggerClinicSync } from '../../lib/sync';
import {
  Calendar,
  Clock,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  IndianRupee,
  Activity,
  ArrowRight,
  Armchair,
  Stethoscope,
  Receipt,
  Users,
  ShieldCheck,
  TrendingUp,
  RefreshCw,
  PhoneCall,
  History,
} from 'lucide-react';

interface AdminDashboardProps {
  onOpenNewPatient: () => void;
  onOpenBooking: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onOpenNewPatient,
  onOpenBooking,
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [billingSummary, setBillingSummary] = useState<any | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [filterChair, setFilterChair] = useState<number | ''>('');
  const { user } = useAuth();
  const totalChairs = user?.clinic?.chairCount || 3;

  const fetchDashboardData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const [apptsData, summaryData, logsData, followUpsData] = await Promise.all([
        apiRequest<any[]>(`/appointments?date=${todayStr}`).catch(() => []),
        apiRequest<any>('/billing/summary').catch(() => null),
        apiRequest<{ data: any[] }>('/audit-logs?page=1&limit=6').catch(() => ({ data: [] })),
        apiRequest<any[]>('/follow-ups').catch(() => []),
      ]);

      setAppointments(apptsData || []);
      setBillingSummary(summaryData);
      setAuditLogs(logsData?.data || []);
      setFollowUps(followUpsData || []);
    } catch (err) {
      console.error('Failed to load admin dashboard data', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData(false);
  }, []);

  useClinicSync(() => fetchDashboardData(true));

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      await apiRequest(`/appointments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      fetchDashboardData(true);
      triggerClinicSync(`appt_${newStatus}`);
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  // KPIs
  const totalToday = appointments.length;
  const waitingCount = appointments.filter(a => a.status === 'CHECKED_IN').length;
  const inChairCount = appointments.filter(a => a.status === 'IN_CHAIR').length;
  const completedCount = appointments.filter(a => a.status === 'COMPLETED').length;
  const upcomingCount = appointments.filter(a => ['SCHEDULED', 'CONFIRMED'].includes(a.status)).length;

  const todayCollectionRs = Math.round((billingSummary?.todayCollectionPaise || 0) / 100);
  const totalOutstandingRs = Math.round((billingSummary?.totalOutstandingPaise || 0) / 100);

  const filteredAppts = appointments.filter(a => {
    if (filterChair && a.chairNumber !== filterChair) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome */}
      <div className="clinic-card bg-linear-to-r from-slate-900 via-slate-800 to-teal-950 p-5 sm:p-6 rounded-2xl text-white shadow-md border border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-teal-500/20 text-teal-300 border border-teal-500/30">
              Admin & Medical Director Desk
            </span>
            <span className="text-xs text-slate-400 font-medium">• Live Clinic Feed</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            AKS Elite Dental Clinic — Executive Overview
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 font-medium mt-0.5">
            Real-time multi-operatory queue, patient treatment telemetry, and financial collections.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => fetchDashboardData()}
            title="Refresh Live Data"
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-400' : ''}`} />
          </button>
          <button
            onClick={onOpenNewPatient}
            className="px-3.5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ Patient</span>
          </button>
          <button
            onClick={onOpenBooking}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 border border-slate-700 cursor-pointer transition-all"
          >
            <Calendar className="w-4 h-4 text-teal-300" />
            <span>+ Appointment</span>
          </button>
        </div>
      </div>

      {/* 6 Key Operational & Financial Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Metric 1: Appointments Today */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Today's Total</span>
            <Calendar className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{totalToday}</div>
          <div className="text-[11px] text-slate-500 font-semibold mt-1">
            {upcomingCount} upcoming scheduled
          </div>
        </div>

        {/* Metric 2: Waiting Queue */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Patients Waiting</span>
            <UserCheck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-600">{waitingCount}</div>
          <div className="text-[11px] text-slate-500 font-semibold mt-1">In reception lounge</div>
        </div>

        {/* Metric 3: In Operatory Chair */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>In Chair</span>
            <Armchair className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-black text-teal-600">{inChairCount}</div>
          <div className="text-[11px] text-slate-500 font-semibold mt-1">Active consultations</div>
        </div>

        {/* Metric 4: Completed Consultations */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600">{completedCount}</div>
          <div className="text-[11px] text-slate-500 font-semibold mt-1">Consultations done</div>
        </div>

        {/* Metric 5: Today's Collection */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Collections</span>
            <IndianRupee className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">₹{todayCollectionRs.toLocaleString('en-IN')}</div>
          <div className="text-[11px] text-emerald-700 font-semibold mt-1">Received today</div>
        </div>

        {/* Metric 6: Outstanding Balances */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Receivables</span>
            <Receipt className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-600">₹{totalOutstandingRs.toLocaleString('en-IN')}</div>
          <div className="text-[11px] text-slate-500 font-semibold mt-1">Total clinic balance</div>
        </div>
      </div>

      {/* Main Grid: Live Queue & Operations on Left, Insights & Actions on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 cols): Today's Appointments & Chair Operations */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-teal-600" />
                  Today's Patient Schedule & Queue
                </h2>
                <p className="text-xs text-slate-500 font-medium">Real-time status tracking across chairs</p>
              </div>

              {/* Filter by Chair */}
              <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
                <button
                  onClick={() => setFilterChair('')}
                  className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all ${
                    filterChair === '' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All Chairs
                </button>
                {Array.from({ length: totalChairs }, (_, i) => i + 1).map(chair => (
                  <button
                    key={chair}
                    onClick={() => setFilterChair(chair)}
                    className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all ${
                      filterChair === chair ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Chair {chair}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            {filteredAppts.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Armchair className="w-10 h-10 mx-auto text-slate-300 mb-2 stroke-[1.5]" />
                <p className="text-sm font-bold text-slate-600">No appointments scheduled for this selection</p>
                <p className="text-xs text-slate-400 mt-1">Click "+ Appointment" above to book a new visit</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 mt-2">
                {filteredAppts.map(appt => {
                  const startTime = new Date(appt.scheduledStart).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  });

                  return (
                    <div
                      key={appt.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 px-2 rounded-xl transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 flex flex-col items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-teal-800 uppercase">Chair</span>
                          <span className="text-sm font-black text-teal-900 leading-none">{appt.chairNumber}</span>
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-900">{appt.patientName}</span>
                            <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                              {appt.patientUhid}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                            <span className="flex items-center gap-1 font-semibold text-slate-700">
                              <Clock className="w-3.5 h-3.5 text-teal-600" />
                              {startTime}
                            </span>
                            <span>•</span>
                            <span className="text-slate-600 font-medium">{appt.reason || 'General Checkup'}</span>
                            <span>•</span>
                            <span className="text-teal-700 font-semibold">{appt.dentistName || 'Dr. Admin'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        {/* Status label */}
                        <span
                          className={`text-xs font-black px-2.5 py-1 rounded-full ${
                            appt.status === 'IN_CHAIR'
                              ? 'bg-teal-100 text-teal-900 border border-teal-300 animate-pulse'
                              : appt.status === 'CHECKED_IN'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : appt.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {appt.status.replace('_', ' ')}
                        </span>

                        {/* Status update actions */}
                        {appt.status === 'CHECKED_IN' && (
                          <button
                            onClick={() => handleUpdateStatus(appt.id, 'IN_CHAIR')}
                            className="text-xs font-extrabold px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg cursor-pointer"
                          >
                            Seat in Chair
                          </button>
                        )}
                        {appt.status === 'IN_CHAIR' && (
                          <button
                            onClick={() => handleUpdateStatus(appt.id, 'COMPLETED')}
                            className="text-xs font-extrabold px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer"
                          >
                            Complete
                          </button>
                        )}
                        {['IN_CHAIR', 'COMPLETED'].includes(appt.status) && (
                          <button
                            onClick={() => navigate(`/billing?tab=ready_to_bill&patientId=${appt.patientId}&appointmentId=${appt.id}`)}
                            className="text-xs font-extrabold px-2.5 py-1 bg-teal-700 hover:bg-teal-800 text-white rounded-lg cursor-pointer flex items-center gap-1 shadow-2xs"
                            title="Bill patient & collect payment"
                          >
                            <Receipt className="w-3 h-3" />
                            Bill
                          </button>
                        )}
                        {['SCHEDULED', 'CONFIRMED'].includes(appt.status) && (
                          <button
                            onClick={() => handleUpdateStatus(appt.id, 'CHECKED_IN')}
                            className="text-xs font-extrabold px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg cursor-pointer"
                          >
                            Check In
                          </button>
                        )}

                        <button
                          onClick={() => navigate(`/patients/${appt.patientId}`)}
                          className="p-1.5 text-slate-400 hover:text-teal-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                          title="Open Patient Profile"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Financial Snapshot, Recalls & Audit Activity */}
        <div className="space-y-4">
          {/* Quick Operations Navigation */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <h3 className="text-sm font-extrabold text-slate-900 mb-3 uppercase tracking-wider">
              Clinic Command Shortlinks
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs font-bold">
              <button
                onClick={() => navigate('/doctor')}
                className="p-3 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-900 border border-teal-200 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center"
              >
                <Stethoscope className="w-5 h-5 text-teal-700" />
                <span>Doctor Desk</span>
              </button>
              <button
                onClick={() => navigate('/billing')}
                className="p-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center"
              >
                <Receipt className="w-5 h-5 text-emerald-700" />
                <span>Billing & Ledger</span>
              </button>
              <button
                onClick={() => navigate('/reports')}
                className="p-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center"
              >
                <TrendingUp className="w-5 h-5 text-indigo-700" />
                <span>Reports & Analytics</span>
              </button>
              <button
                onClick={() => navigate('/admin')}
                className="p-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center"
              >
                <ShieldCheck className="w-5 h-5 text-slate-700" />
                <span>Staff & Catalog</span>
              </button>
            </div>
          </div>

          {/* Follow-ups Due Widget */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-teal-600" />
                <h3 className="text-sm font-extrabold text-slate-900">Follow-ups & Recalls Due</h3>
              </div>
              <button
                onClick={() => navigate('/follow-ups')}
                className="text-xs font-bold text-teal-700 hover:underline cursor-pointer"
              >
                View All
              </button>
            </div>
            {followUps.length === 0 ? (
              <div className="py-6 text-center text-slate-400">
                <p className="text-xs font-bold text-slate-600">No pending follow-ups or recalls</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Recalls will automatically trigger here as treatments are completed</p>
              </div>
            ) : (
              <div className="mt-3 space-y-2.5 text-xs">
                {followUps.slice(0, 3).map((fu: any) => (
                  <div key={fu.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-extrabold text-slate-900 block truncate">
                        {fu.patient?.fullName || 'Patient'} • {fu.type?.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[11px] text-slate-500 block truncate">
                        {fu.notes || 'Routine follow-up'}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0 ${
                      fu.status === 'PENDING' ? 'bg-amber-100 text-amber-900' : 'bg-teal-100 text-teal-900'
                    }`}>
                      {fu.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Clinic Activity / Audit Logs */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-slate-700" />
                <h3 className="text-sm font-extrabold text-slate-900">Recent Clinic Activity</h3>
              </div>
              <button
                onClick={() => navigate('/audit-logs')}
                className="text-xs font-bold text-teal-700 hover:underline cursor-pointer"
              >
                Audit Log
              </button>
            </div>
            {auditLogs.length === 0 ? (
              <div className="py-6 text-center text-slate-400">
                <p className="text-xs font-bold text-slate-600">No recent clinic activity logged</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Live clinical and billing events will appear here in real-time</p>
              </div>
            ) : (
              <div className="mt-3 space-y-2 text-xs">
                {auditLogs.map((log: any, idx: number) => {
                  const logTime = new Date(log.createdAt).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  });
                  return (
                    <div key={log.id || idx} className="py-1.5 border-b border-slate-100 last:border-b-0 flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-800 block truncate max-w-[190px]">
                          {log.action?.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[11px] text-slate-500">{log.entityType || 'Clinic System'}</span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400 shrink-0 font-semibold">{logTime}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
