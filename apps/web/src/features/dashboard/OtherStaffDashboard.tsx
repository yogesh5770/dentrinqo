import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useClinicSync } from '../../lib/sync';
import {
  Calendar,
  Clock,
  UserCheck,
  CheckCircle2,
  Users,
  Receipt,
  PlusCircle,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

interface OtherStaffDashboardProps {
  onOpenNewPatient: () => void;
  onOpenBooking: () => void;
}

export const OtherStaffDashboard: React.FC<OtherStaffDashboardProps> = ({
  onOpenNewPatient,
  onOpenBooking,
}) => {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTodayAppointments = (silent = false) => {
    if (hasPermission('appointments.view')) {
      if (!silent) setLoading(true);
      const todayStr = new Date().toISOString().split('T')[0];
      apiRequest<any[]>(`/appointments?date=${todayStr}`)
        .then(data => setAppointments(data || []))
        .catch(() => setAppointments([]))
        .finally(() => {
          if (!silent) setLoading(false);
        });
    } else {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchTodayAppointments();
  }, [user]);

  useClinicSync(() => fetchTodayAppointments(true));

  const canViewAppointments = hasPermission('appointments.view');
  const canRegisterPatients = hasPermission('patients.register');
  const canViewPatients = hasPermission('patients.view');
  const canViewBilling = hasPermission('billing.invoices.view');

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="clinic-card bg-linear-to-r from-slate-900 via-slate-800 to-teal-950 p-5 sm:p-6 rounded-2xl text-white shadow-md border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-teal-500/20 text-teal-300 border border-teal-500/30">
              Staff Workspace
            </span>
            <span className="text-xs text-slate-400 font-medium">{user?.designation || 'Clinic Staff'}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Welcome, {user?.fullName}
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 font-medium mt-0.5">
            Your workspace is customized with permissions assigned by the Clinic Administrator.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canRegisterPatients && (
            <button
              onClick={onOpenNewPatient}
              className="px-3.5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ Patient</span>
            </button>
          )}
          {hasPermission('appointments.create') && (
            <button
              onClick={onOpenBooking}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 border border-slate-700 cursor-pointer"
            >
              <Calendar className="w-4 h-4 text-teal-300" />
              <span>+ Book Visit</span>
            </button>
          )}
        </div>
      </div>

      {/* Permissions Summary Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
        <h3 className="text-sm font-extrabold text-slate-900 mb-2 uppercase tracking-wider">
          Active Authorizations
        </h3>
        <div className="flex flex-wrap gap-2">
          {(user?.permissions || []).map((perm: string) => (
            <span
              key={perm}
              className="px-2.5 py-1 rounded-lg text-xs font-bold font-mono bg-teal-50 text-teal-800 border border-teal-200"
            >
              {perm}
            </span>
          ))}
          {(!user?.permissions || user.permissions.length === 0) && (
            <p className="text-xs text-slate-500">No individual permissions assigned yet. Please contact Clinic Admin.</p>
          )}
        </div>
      </div>

      {/* Appointments View if permitted */}
      {canViewAppointments && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-teal-600" />
              Today's Appointments
            </h2>
            <span className="text-xs font-bold text-slate-500">{appointments.length} scheduled</span>
          </div>

          {appointments.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No appointments scheduled today</p>
          ) : (
            <div className="divide-y divide-slate-100 mt-2">
              {appointments.slice(0, 8).map(appt => (
                <div key={appt.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-extrabold text-sm text-slate-900">{appt.patientName}</div>
                    <div className="text-xs text-slate-500">
                      Chair {appt.chairNumber} • {appt.reason || 'Checkup'}
                    </div>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {appt.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
