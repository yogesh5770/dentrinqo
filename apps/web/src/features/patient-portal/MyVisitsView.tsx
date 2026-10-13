import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { usePatientAuth } from '../../hooks/usePatientAuth';
import { useTenant } from '../../hooks/useTenant';
import {
  Calendar,
  Clock,
  User,
  Users,
  Plus,
  LogOut,
  ChevronRight,
  ShieldCheck,
  Building,
  Activity,
  CheckCircle,
} from 'lucide-react';

interface VisitItem {
  id: string;
  patientName: string;
  patientUhid: string;
  relation: string;
  dentistName: string;
  chairNumber: number;
  scheduledStart: string;
  scheduledEnd: string;
  reason: string;
  status: string;
  notes?: string;
}

export const MyVisitsView: React.FC = () => {
  const navigate = useNavigate();
  const { account, familyMembers, token, isLoading, logout } = usePatientAuth();
  const { clinic } = useTenant();

  const [visits, setVisits] = useState<VisitItem[]>([]);
  const [selectedMember, setSelectedMember] = useState<string>('ALL');
  const [loadingVisits, setLoadingVisits] = useState(true);

  useEffect(() => {
    if (!isLoading && !account) {
      navigate('/patient-login');
      return;
    }

    if (token) {
      fetchVisits();
    }
  }, [account, isLoading, token, navigate]);

  const fetchVisits = async () => {
    setLoadingVisits(true);
    try {
      const currentToken = token || localStorage.getItem('dental_patient_token') || localStorage.getItem('aks_patient_token');
      const res = await fetch('/api/patient-auth/visits', {
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setVisits(data);
      }
    } catch {
      // offline fallback
    } finally {
      setLoadingVisits(false);
    }
  };

  const filteredVisits = selectedMember === 'ALL'
    ? visits
    : visits.filter((v) => v.patientName.toLowerCase() === selectedMember.toLowerCase());

  const upcomingVisits = filteredVisits.filter(
    (v) => new Date(v.scheduledStart).getTime() >= Date.now() - 4 * 60 * 60 * 1000 && v.status !== 'CANCELLED',
  );
  const pastVisits = filteredVisits.filter(
    (v) => new Date(v.scheduledStart).getTime() < Date.now() - 4 * 60 * 60 * 1000 || v.status === 'COMPLETED' || v.status === 'CANCELLED',
  );

  if (isLoading || (!account && loadingVisits)) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-teal-600 font-sans">
        <div className="w-12 h-12 p-2 bg-white rounded-xl shadow-sm border border-slate-200 mb-3 animate-pulse">
          <img src="/logo.png" alt="Clinic Logo" className="w-full h-full object-contain" />
        </div>
        <p className="text-xs font-bold text-slate-600">Loading your dental health portal...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-16">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 p-1.5 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-center">
              <img src="/logo.png" alt="Clinic Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-900 leading-tight">
                {clinic?.name || 'Dental Clinic'}
              </h1>
              <p className="text-[11px] font-medium text-teal-700">
                Patient & Family Passbook • {account?.phone}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/my/family"
              className="text-xs font-bold text-slate-700 hover:text-teal-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5 transition"
            >
              <Users className="w-3.5 h-3.5 text-teal-600" />
              <span className="hidden sm:inline">Family Members ({familyMembers.length})</span>
            </Link>
            <button
              onClick={() => {
                logout();
                navigate('/patient-login');
              }}
              className="text-xs font-bold text-slate-500 hover:text-red-600 p-2 rounded-lg hover:bg-slate-100 transition"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6">
        {/* Banner with Quick Action */}
        <div className="bg-gradient-to-r from-teal-700 via-teal-800 to-slate-900 rounded-2xl p-6 text-white shadow-lg mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-teal-500/30 text-teal-200 text-[11px] font-bold tracking-wide uppercase mb-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              Verified Health Account
            </span>
            <h2 className="text-xl font-black">Family Dental Health Dashboard</h2>
            <p className="text-xs text-teal-100/80 mt-1 max-w-xl">
              All appointments, token numbers, and dental records for yourself and registered family members are synchronized under this single account.
            </p>
          </div>

          <Link
            to="/book"
            className="shrink-0 px-4 py-2.5 bg-white hover:bg-teal-50 text-teal-900 font-bold text-xs rounded-xl shadow-md flex items-center gap-2 transition"
          >
            <Plus className="w-4 h-4 text-teal-700" />
            <span>Book New Appointment</span>
          </Link>
        </div>

        {/* Family Member Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none">
          <button
            onClick={() => setSelectedMember('ALL')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${
              selectedMember === 'ALL'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            All Family Visits ({visits.length})
          </button>
          {familyMembers.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedMember(m.fullName)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
                selectedMember.toLowerCase() === m.fullName.toLowerCase()
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>{m.fullName}</span>
              <span className="text-[10px] opacity-75 font-normal">({m.relationToAccount})</span>
            </button>
          ))}
          <Link
            to="/my/family"
            className="px-3 py-1.5 rounded-xl text-xs font-bold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 whitespace-nowrap flex items-center gap-1 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Member</span>
          </Link>
        </div>

        {/* Upcoming Appointments Section */}
        <section className="mb-8">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-teal-600" />
            <span>Upcoming Visits & Active Queue Passes</span>
          </h3>

          {upcomingVisits.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <div className="w-12 h-12 mx-auto mb-3 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center">
                <Calendar className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800">No Upcoming Appointments Scheduled</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                Need a routine dental checkup, scaling, or toothache consultation? Book your slot in 30 seconds.
              </p>
              <Link
                to="/book"
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white font-bold text-xs rounded-xl shadow-sm hover:bg-teal-700 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Book Slot Now</span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {upcomingVisits.map((v, idx) => (
                <div
                  key={v.id}
                  className="bg-white rounded-2xl border-2 border-teal-500/30 shadow-md p-5 relative overflow-hidden flex flex-col justify-between"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-teal-50 rounded-bl-full -z-0 opacity-50" />

                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-3">
                      <span className="px-2.5 py-1 bg-teal-600 text-white font-black text-xs rounded-lg tracking-wider">
                        TOKEN #{idx + 1}
                      </span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                        {v.status}
                      </span>
                    </div>

                    <div className="mb-2">
                      <h4 className="text-base font-black text-slate-900">{v.patientName}</h4>
                      <p className="text-xs text-slate-500 font-medium">
                        UHID: <span className="font-mono text-slate-700">{v.patientUhid}</span> • {v.relation}
                      </p>
                    </div>

                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1.5 my-3 text-xs">
                      <div className="flex items-center gap-2 text-slate-700">
                        <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        <span className="font-bold">
                          {new Date(v.scheduledStart).toLocaleDateString('en-IN', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700">
                        <Clock className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        <span className="font-bold">
                          {new Date(v.scheduledStart).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700">
                        <Building className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        <span>
                          Operatory {v.chairNumber} ({v.chairNumber === 1 ? 'Chief Doctor' : 'Associate Doctor'})
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-slate-600 font-medium">
                      Reason: <span className="text-slate-900 font-bold">{v.reason}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-teal-700 font-bold">
                    <span>Show Token at Reception Desk</span>
                    <CheckCircle className="w-4 h-4 text-teal-600" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Past Visit History */}
        <section>
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <span>Past Dental Health History</span>
          </h3>

          {pastVisits.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-xs text-slate-500">
              No previous visit history recorded yet.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 shadow-xs">
              {pastVisits.map((v) => (
                <div key={v.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{v.patientName}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold uppercase">
                        {v.relation}
                      </span>
                    </div>
                    <p className="text-slate-500 mt-0.5">
                      {v.reason} • Dr. {v.dentistName}
                    </p>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="font-bold text-slate-700">
                      {new Date(v.scheduledStart).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase">{v.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
