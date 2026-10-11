import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { useNavigate } from 'react-router-dom';
import { useClinicSync, triggerClinicSync } from '../../lib/sync';
import {
  Stethoscope,
  Clock,
  UserCheck,
  CheckCircle2,
  Calendar,
  ClipboardList,
  FileText,
  Armchair,
  ArrowRight,
  RefreshCw,
  Camera,
  Activity,
  PlusCircle,
  PhoneCall,
  Pencil,
} from 'lucide-react';

export const DentistDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClinicalData = async (silent?: boolean | unknown) => {
    const isSilent = silent === true;
    if (!isSilent) setLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const [data, followUpsData] = await Promise.all([
        apiRequest<any[]>(`/appointments?date=${todayStr}`).catch(() => []),
        apiRequest<any[]>('/follow-ups').catch(() => []),
      ]);
      setAppointments(data || []);
      setFollowUps(followUpsData || []);
    } catch (err) {
      console.error('Failed to load clinical schedule', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchClinicalData();
  }, []);

  useClinicSync(() => fetchClinicalData(true));

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      await apiRequest(`/appointments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      triggerClinicSync(`appt_${newStatus}`);
      fetchClinicalData(true);
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  };

  const waitingPatients = appointments.filter(a => a.status === 'CHECKED_IN');
  const currentInChair = appointments.filter(a => a.status === 'IN_CHAIR');
  const completedToday = appointments.filter(a => a.status === 'COMPLETED');
  const upcomingToday = appointments.filter(a => ['SCHEDULED', 'CONFIRMED'].includes(a.status));

  return (
    <div className="space-y-6">
      {/* Top Clinical Header */}
      <div className="clinic-card bg-linear-to-r from-teal-900 via-slate-900 to-slate-950 p-5 sm:p-6 rounded-2xl text-white shadow-md border border-teal-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-teal-500/20 text-teal-300 border border-teal-500/30">
              Doctor Clinical Care Workspace
            </span>
            <span className="text-xs text-slate-400 font-medium">• Consultations & Operatory</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Dentist Operatory Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 font-medium mt-0.5">
            Real-time consultation queue, clinical consultations, treatment plans & electronic prescriptions.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => fetchClinicalData()}
            title="Refresh"
            className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-400' : ''}`} />
          </button>
          <button
            onClick={() => navigate('/doctor')}
            className="px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
          >
            <Stethoscope className="w-4 h-4" />
            <span>Open Doctor Desk</span>
          </button>
        </div>
      </div>

      {/* 4 Clinical Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Waiting for Consultation</span>
            <UserCheck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-600">{waitingPatients.length}</div>
          <div className="text-[11px] text-slate-500 font-semibold mt-1">Ready in reception</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>In Chair Right Now</span>
            <Armchair className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-black text-teal-600">{currentInChair.length}</div>
          <div className="text-[11px] text-slate-500 font-semibold mt-1">Active examination / treatment</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Completed Today</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-600">{completedToday.length}</div>
          <div className="text-[11px] text-slate-500 font-semibold mt-1">Procedures finalized</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            <span>Upcoming Today</span>
            <Calendar className="w-4 h-4 text-slate-700" />
          </div>
          <div className="text-2xl font-black text-slate-900">{upcomingToday.length}</div>
          <div className="text-[11px] text-slate-500 font-semibold mt-1">Scheduled remaining visits</div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Waiting & Active Patients */}
        <div className="lg:col-span-2 space-y-4">
          {/* Patients Waiting for Consultation */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-amber-600" />
                Patients Waiting for Consultation
              </h2>
              <span className="text-xs font-bold text-slate-500">{waitingPatients.length} waiting</span>
            </div>

            {waitingPatients.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <p className="text-sm font-bold text-slate-600">No patients currently waiting</p>
                <p className="text-xs text-slate-400 mt-1">Checked-in patients from front desk will appear here automatically</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 mt-2">
                {waitingPatients.map(appt => (
                  <div key={appt.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-amber-800 uppercase">Chair</span>
                        <span className="text-sm font-black text-amber-900">{appt.chairNumber}</span>
                      </div>
                      <div>
                        <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                          <span>{appt.patientName}</span>
                          <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                            {appt.patientUhid}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                          <span className="font-semibold text-slate-700">{appt.reason || 'Consultation'}</span>
                          <span>•</span>
                          <span>Phone: {appt.patientPhone}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          handleUpdateStatus(appt.id, 'IN_CHAIR');
                          navigate('/doctor');
                        }}
                        className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs rounded-xl cursor-pointer shadow-xs flex items-center gap-1.5"
                      >
                        <Armchair className="w-3.5 h-3.5" />
                        <span>Seat in Chair & Start</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Current In-Chair Consultations */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Armchair className="w-5 h-5 text-teal-600" />
                Active Patients in Operatory
              </h2>
              <span className="text-xs font-bold text-teal-700">{currentInChair.length} in progress</span>
            </div>

            {currentInChair.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                <p className="text-sm font-bold text-slate-600">No active patient currently seated</p>
                <p className="text-xs text-slate-400 mt-1">Select a waiting patient above to begin operatory care</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 mt-2">
                {currentInChair.map(appt => (
                  <div key={appt.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                        <span>{appt.patientName}</span>
                        <span className="text-[10px] font-mono font-bold bg-teal-50 text-teal-800 px-2 py-0.5 rounded border border-teal-200">
                          Chair {appt.chairNumber}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Chief Complaint: {appt.reason || 'General Consultation'}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate('/doctor')}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl cursor-pointer"
                      >
                        Doctor Desk
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(appt.id, 'COMPLETED')}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl cursor-pointer"
                      >
                        Complete Visit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Clinical Shortcuts & Planned Treatments */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <h3 className="text-sm font-extrabold text-slate-900 mb-3 uppercase tracking-wider">
              Clinical Care Quick Access
            </h3>
            <div className="space-y-2 text-xs font-bold">
              <button
                onClick={() => navigate('/doctor')}
                className="w-full p-3 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-950 border border-teal-200 flex items-center gap-3 cursor-pointer text-left transition-colors"
              >
                <Stethoscope className="w-5 h-5 text-teal-700 shrink-0" />
                <div>
                  <div className="font-extrabold">Clinical Examination</div>
                  <div className="text-[11px] text-teal-700 font-medium">Record diagnosis & clinical notes</div>
                </div>
              </button>

              <button
                onClick={() => navigate('/doctor')}
                className="w-full p-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-900 border border-slate-200 flex items-center gap-3 cursor-pointer text-left transition-colors"
              >
                <ClipboardList className="w-5 h-5 text-indigo-600 shrink-0" />
                <div>
                  <div className="font-extrabold">Treatment Plans</div>
                  <div className="text-[11px] text-slate-500 font-medium">Create multi-stage dental plans</div>
                </div>
              </button>

              <button
                onClick={() => navigate('/doctor')}
                className="w-full p-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-900 border border-slate-200 flex items-center gap-3 cursor-pointer text-left transition-colors"
              >
                <FileText className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-extrabold">Prescription Desk</div>
                  <div className="text-[11px] text-slate-500 font-medium">Draft & finalize digital Rx</div>
                </div>
              </button>

              <button
                onClick={() => navigate('/doctor')}
                className="w-full p-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-900 border border-slate-200 flex items-center gap-3 cursor-pointer text-left transition-colors"
              >
                <Camera className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <div className="font-extrabold">X-rays & Imaging</div>
                  <div className="text-[11px] text-slate-500 font-medium">Upload IOPA, OPG, scans</div>
                </div>
              </button>
            </div>
          </div>

          {/* Planned Treatments Requiring Follow-Up */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-teal-600" />
                <h3 className="text-sm font-extrabold text-slate-900">Treatment Follow-ups</h3>
              </div>
              <button
                onClick={() => navigate('/follow-ups')}
                className="text-xs font-bold text-teal-700 hover:underline cursor-pointer"
              >
                View
              </button>
            </div>
            {followUps.length === 0 ? (
              <div className="py-6 text-center text-slate-400">
                <p className="text-xs font-bold text-slate-600">No pending treatment follow-ups</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Post-op care calls & prosthesis deliveries will appear here</p>
              </div>
            ) : (
              <div className="mt-3 space-y-2.5 text-xs">
                {followUps.slice(0, 3).map((fu: any) => (
                  <div key={fu.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="font-extrabold text-slate-900 block truncate">
                      {fu.patient?.fullName || 'Patient'} — {fu.type?.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5 truncate">
                      {fu.notes || 'Scheduled follow-up'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
