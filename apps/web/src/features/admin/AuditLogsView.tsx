import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { useClinicSync } from '../../lib/sync';
import { History, RefreshCw, ChevronLeft, ChevronRight, ShieldCheck, Clock, User } from 'lucide-react';

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLogs = async (p = 1, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await apiRequest<{ data: any[]; totalPages: number }>(`/audit-logs?page=${p}&limit=20`);
      setLogs(res?.data || []);
      setTotalPages(res?.totalPages || 1);
      setPage(p);
    } catch (err) {
      console.error('Failed to load audit logs', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(page);
  }, []);

  useClinicSync(() => fetchLogs(page, true));

  return (
    <div className="space-y-6">
      <div className="clinic-card bg-white border border-slate-200 p-5 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <History className="w-6 h-6 text-teal-600" />
            Clinic Audit Trail & Security Logs
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
            Tamper-evident record of all user authentications, patient modifications, clinical notes and financial entries.
          </p>
        </div>

        <button
          onClick={() => fetchLogs(page)}
          className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-teal-600' : ''}`} />
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 font-extrabold uppercase border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Date & Time (IST)</th>
                <th className="py-3 px-4">Staff Member</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Entity</th>
                <th className="py-3 px-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No audit records logged yet
                  </td>
                </tr>
              ) : (
                logs.map((log: any) => {
                  const logTime = new Date(log.createdAt).toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  });

                  return (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-medium text-slate-600">{logTime}</td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900 block">{log.actor?.fullName || 'System'}</span>
                        <span className="text-[11px] text-slate-500">{log.actorRole || log.actor?.role}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold font-mono bg-teal-50 text-teal-800 border border-teal-200">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{log.entityType || '—'}</td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                        {log.details ? JSON.stringify(log.details) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => fetchLogs(page - 1)}
              disabled={page <= 1}
              className="p-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => fetchLogs(page + 1)}
              disabled={page >= totalPages}
              className="p-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
