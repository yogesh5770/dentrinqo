import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import {
  Users,
  Search,
  PlusCircle,
  ArrowRight,
  ShieldAlert,
  Calendar,
  Stethoscope,
  Phone,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useClinicSync } from '../../lib/sync';

interface Patient {
  id: string;
  uhid: string;
  fullName: string;
  phone: string;
  age?: number | null;
  gender: string;
  allergies: string[];
  medicalConditions: string[];
  appointmentCount: number;
  consultationCount: number;
  createdAt: string;
}

interface PatientListProps {
  onOpenNewPatient: () => void;
}

export const PatientList: React.FC<PatientListProps> = ({ onOpenNewPatient }) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const navigate = useNavigate();

  const fetchPatients = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const q = searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : '';
      const res = await apiRequest<{ data: Patient[]; total: number; totalPages: number }>(
        `/patients?page=${page}&limit=15${q}`
      );
      setPatients(res.data);
      setTotalPages(res.totalPages || 1);
      setTotalRecords(res.total);
    } catch (err) {
      console.error('Failed to load patients', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients(false);
  }, [page, searchTerm]);

  useClinicSync(() => fetchPatients(true));

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900">Patient Directory</h2>
          <p className="text-xs text-slate-600 font-medium mt-0.5">
            Registered patients and clinical records ({totalRecords} total)
          </p>
        </div>

        <button
          onClick={onOpenNewPatient}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-black text-xs py-2.5 px-4 rounded-xl shadow-sm transition-all cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          + New Patient
        </button>
      </div>

      {/* Search Bar */}
      <div className="clinic-card p-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
            placeholder="Search by Patient Name, Phone Number, or UHID (e.g. AKS-2026-0001)..."
            className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-xs font-medium text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-teal-600 focus:bg-white"
          />
        </div>
      </div>

      {/* Table */}
      <div className="clinic-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-700 text-xs font-bold">Loading patients...</div>
        ) : patients.length === 0 ? (
          <div className="p-12 text-center bg-white">
            <Users className="w-12 h-12 mx-auto text-slate-300 mb-2" />
            <p className="font-extrabold text-slate-900 text-base">No patients found</p>
            <p className="text-xs text-slate-600 mt-1">Try a different search or register a new patient.</p>
            <button
              onClick={onOpenNewPatient}
              className="mt-4 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer"
            >
              + New Patient
            </button>
          </div>
        ) : (
          <div className="bg-white">
            {/* MOBILE VIEW: Touch-Friendly Patient Cards (< md) */}
            <div className="md:hidden divide-y divide-slate-100">
              {patients.map(p => {
                const allergies = Array.isArray(p.allergies) ? p.allergies : (p.allergies ? [p.allergies] : []);
                const conditions = Array.isArray(p.medicalConditions) ? p.medicalConditions : (p.medicalConditions ? [p.medicalConditions] : []);

                return (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/patients/${p.id}`)}
                    className="p-4 space-y-2.5 active:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold text-teal-800 text-xs bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">
                            {p.uhid}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">
                            {p.age ? `${p.age} yrs` : 'Age N/A'} • {p.gender}
                          </span>
                        </div>
                        <h4 className="font-black text-slate-900 text-base mt-1">
                          {p.fullName}
                        </h4>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-xs font-bold text-slate-800 flex items-center gap-1 justify-end">
                          <Phone className="w-3.5 h-3.5 text-teal-600" />
                          {p.phone}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                          {p.appointmentCount} visit(s)
                        </span>
                      </div>
                    </div>

                    {/* Alerts Banner if any */}
                    {(allergies.length > 0 || conditions.length > 0) && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {allergies.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-900 border border-rose-300">
                            <ShieldAlert className="w-3 h-3 text-rose-600" />
                            {allergies[0]}
                            {allergies.length > 1 && ` +${allergies.length - 1}`}
                          </span>
                        )}
                        {conditions.length > 0 && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            {conditions[0]}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-teal-700 font-extrabold">
                      <span>Open Clinical Record</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* DESKTOP VIEW: Full Data Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[700px]">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-800 font-extrabold uppercase tracking-wider text-xs">
                  <tr>
                    <th className="py-3.5 px-4">UHID</th>
                    <th className="py-3.5 px-4">Patient Name</th>
                    <th className="py-3.5 px-4">Phone Number</th>
                    <th className="py-3.5 px-4">Age / Gender</th>
                    <th className="py-3.5 px-4">Clinical Alerts</th>
                    <th className="py-3.5 px-4 text-center">Visits</th>
                    <th className="py-3.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {patients.map(p => (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/patients/${p.id}`)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="py-4 px-4 font-mono font-extrabold text-teal-800 text-xs">
                        {p.uhid}
                      </td>
                      <td className="py-4 px-4">
                        <div className="font-extrabold text-slate-900 text-sm">{p.fullName}</div>
                        <div className="text-xs text-slate-500 font-medium mt-0.5">
                          Joined {new Date(p.createdAt).toLocaleDateString('en-IN')}
                        </div>
                      </td>
                      <td className="py-4 px-4 font-mono font-bold text-slate-800">
                        {p.phone}
                      </td>
                      <td className="py-4 px-4 text-slate-800 font-semibold">
                        {p.age ? `${p.age} yrs` : '—'} • {p.gender}
                      </td>
                      <td className="py-4 px-4">
                        {(() => {
                          const allergies = Array.isArray(p.allergies) ? p.allergies : (p.allergies ? [p.allergies] : []);
                          const conditions = Array.isArray(p.medicalConditions) ? p.medicalConditions : (p.medicalConditions ? [p.medicalConditions] : []);
                          return (
                            <div className="flex flex-wrap gap-1">
                              {allergies.length > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300">
                                  <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                                  {allergies[0]}
                                  {allergies.length > 1 && ` +${allergies.length - 1}`}
                                </span>
                              )}
                              {conditions.length > 0 && (
                                <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                  {conditions[0]}
                                </span>
                              )}
                              {allergies.length === 0 && conditions.length === 0 && (
                                <span className="text-xs text-slate-500 font-medium">None</span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className="font-extrabold text-slate-900 text-xs">{p.appointmentCount}</span>
                        <span className="text-[10px] text-slate-500 font-medium block">Visits</span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-extrabold text-xs transition-colors">
                          <span>View Chart</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-3.5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="p-1 rounded border border-slate-200 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="p-1 rounded border border-slate-200 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};