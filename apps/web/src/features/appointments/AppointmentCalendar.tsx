import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import {
  Calendar as CalendarIcon,
  Clock,
  Armchair,
  CheckCircle2,
  AlertCircle,
  PlusCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useClinicSync } from '../../lib/sync';

interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  patientUhid: string;
  dentistName: string;
  chairNumber: number;
  scheduledStart: string;
  scheduledEnd: string;
  durationMinutes: number;
  reason: string;
  status: string;
}

export const AppointmentCalendar: React.FC<{ onOpenBooking: () => void }> = ({ onOpenBooking }) => {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterChair, setFilterChair] = useState<number | ''>('');
  const navigate = useNavigate();
  const { user } = useAuth();
  const totalChairs = user?.clinic?.chairCount || 3;

  const fetchAppointments = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const q = filterChair ? `&chairNumber=${filterChair}` : '';
      const data = await apiRequest<Appointment[]>(`/appointments?date=${selectedDate}${q}`);
      setAppointments(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments(false);
  }, [selectedDate, filterChair]);

  useClinicSync(() => fetchAppointments(true));

  const changeDateBy = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="clinic-card p-5 bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <CalendarIcon className="w-6 h-6 text-teal-600" />
            Appointments & Chair Schedules
          </h2>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">
            Chair schedules and daily patient appointments
          </p>
        </div>

        <button
          onClick={onOpenBooking}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs py-2.5 px-4 rounded-xl shadow-xs transition-all cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          Schedule Appointment
        </button>
      </div>

      {/* Date Navigator Bar */}
      <div className="clinic-card p-4 bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => changeDateBy(-1)}
            className="p-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer font-bold"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="text-xs font-black font-mono text-slate-900 bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:border-teal-600 focus:bg-white"
          />
          <button
            onClick={() => changeDateBy(1)}
            className="p-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer font-bold"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            className="text-xs font-black px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 cursor-pointer"
          >
            Today
          </button>
        </div>

        {/* Chair Filter */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold text-slate-700 hidden sm:inline">Chair:</span>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-scroll whitespace-nowrap">
            <button
              onClick={() => setFilterChair('')}
              className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all ${
                filterChair === '' ? 'bg-teal-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              All Chairs
            </button>
            {Array.from({ length: totalChairs }, (_, i) => i + 1).map(c => (
              <button
                key={c}
                onClick={() => setFilterChair(c)}
                className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all ${
                  filterChair === c ? 'bg-teal-600 text-white shadow-xs' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                C{c} (Operatory #{c})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid of Chairs for Selected Date */}
      <div className={`grid gap-5 ${filterChair ? 'grid-cols-1 max-w-xl mx-auto' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
        {(filterChair ? [Number(filterChair)] : Array.from({ length: totalChairs }, (_, i) => i + 1)).map(chairNum => {
          const chairAppts = appointments.filter(a => a.chairNumber === chairNum);
          return (
            <div key={chairNum} className="clinic-card bg-white border border-slate-200 rounded-2xl flex flex-col h-full overflow-hidden shadow-xs">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center font-black text-xs shadow-xs">
                    C{chairNum}
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-slate-900">Operatory Chair {chairNum}</h4>
                    <span className="text-xs text-slate-500 font-semibold">
                      Operatory Suite #{chairNum}
                    </span>
                  </div>
                </div>
                <span className="text-xs font-black text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                  {chairAppts.length} slots
                </span>
              </div>

              <div className="p-4 flex-1 space-y-3 overflow-y-auto min-h-[320px]">
                {chairAppts.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                    <Armchair className="w-10 h-10 text-slate-300 mb-2" />
                    <p className="text-xs font-black text-slate-700">Chair Available</p>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">No bookings scheduled on this date.</p>
                  </div>
                ) : (
                  chairAppts.map(a => {
                    const timeStr = new Date(a.scheduledStart).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <div
                        key={a.id}
                        onClick={() => navigate(`/patients/${a.patientId}`)}
                        className="p-3.5 rounded-xl bg-white hover:bg-teal-50/60 border border-slate-200 hover:border-teal-400 cursor-pointer transition-all text-xs space-y-1.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between font-mono font-bold text-slate-800">
                          <span className="text-teal-800 font-black text-xs">{timeStr}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 font-black border border-slate-200">
                            {a.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-slate-900 text-sm truncate">{a.patientName}</span>
                          {a.patientUhid && (
                            <span className="text-[10px] font-mono font-bold bg-teal-50 text-teal-800 border border-teal-200 px-1.5 py-0.5 rounded shrink-0">
                              {a.patientUhid}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-600 font-medium line-clamp-1">{a.reason}</div>
                        
                        {a.patientPhone && (
                          <div className="pt-1">
                            <a
                              href={`tel:${a.patientPhone}`}
                              onClick={e => e.stopPropagation()}
                              className="inline-flex items-center gap-1 font-mono text-teal-700 hover:underline font-bold text-[11px]"
                            >
                              📞 {a.patientPhone}
                            </a>
                          </div>
                        )}

                        <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between font-semibold">
                          <span className="truncate">{a.dentistName}</span>
                          <span className="font-mono shrink-0">{a.durationMinutes} mins</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};