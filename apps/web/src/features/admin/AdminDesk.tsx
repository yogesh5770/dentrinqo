import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { useClinicSync, triggerClinicSync } from '../../lib/sync';
import {
  ShieldCheck,
  UserCheck,
  UserX,
  PlusCircle,
  FileText,
  Clock,
  Filter,
  CheckCircle2,
  Lock,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Copy,
  Check,
  KeyRound,
  ExternalLink,
  Search,
  Eye,
  EyeOff,
  AlertTriangle,
  Building2,
  Users,
  Stethoscope,
  Briefcase,
  UserPlus,
  Shield,
  Phone,
  Mail,
  BadgeAlert,
  IndianRupee,
} from 'lucide-react';
import { TreatmentCatalogManager } from './TreatmentCatalogManager';
import { PERMISSION_GROUPS, DEFAULT_ROLE_PERMISSIONS } from '@aks/shared-types';

import { ClinicLogo } from '../../components/ClinicLogo';
interface StaffMember {
  id: string;
  email: string;
  username?: string | null;
  fullName: string;
  role: string;
  permissions?: string[] | string;
  phone?: string | null;
  designation?: string | null;
  department?: string | null;
  employeeId?: string | null;
  licenseNumber?: string | null;
  specialization?: string | null;
  mustChangePassword?: boolean;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
}

export const AdminDesk: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'staff' | 'treatments' | 'audit'>('staff');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditPage, setAuditPage] = useState(1);
  const [totalAuditPages, setTotalAuditPages] = useState(1);

  // Search & Filter for Staff
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Add Staff Modal State
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('RECEPTIONIST');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(
    DEFAULT_ROLE_PERMISSIONS['RECEPTIONIST'] || []
  );
  const [showPermissionsCustomizer, setShowPermissionsCustomizer] = useState(false);
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState('');
  const [submittingStaff, setSubmittingStaff] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // WhatsApp Credential Share Modal State
  const [showShareModal, setShowShareModal] = useState(false);
  const [createdStaffInfo, setCreatedStaffInfo] = useState<{
    fullName: string;
    email: string;
    temporaryPassword: string;
    whatsappUrl: string;
    whatsappText: string;
    cleanPhone?: string;
    phone?: string;
    employeeId?: string;
    role: string;
  } | null>(null);
  const [copiedPass, setCopiedPass] = useState(false);
  const [copiedFullMessage, setCopiedFullMessage] = useState(false);
  const [showTempPass, setShowTempPass] = useState(true);

  // Password Reset Modal State
  const [resettingStaffId, setResettingStaffId] = useState<string | null>(null);

  const fetchStaff = async (silent?: boolean | unknown) => {
    const isSilent = silent === true;
    if (!isSilent) setLoading(true);
    try {
      let query = '';
      const params = new URLSearchParams();
      if (roleFilter) params.append('role', roleFilter);
      if (searchQuery) params.append('search', searchQuery);
      if (statusFilter) params.append('isActive', statusFilter);
      if (params.toString()) query = `?${params.toString()}`;

      const users = await apiRequest<StaffMember[]>(`/users${query}`);
      setStaffList(users || []);
    } catch (err) {
      console.error('Failed to fetch staff members:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ data: any[]; totalPages: number }>(`/audit-logs?page=${auditPage}&limit=20`);
      setAuditLogs(res?.data || []);
      setTotalAuditPages(res?.totalPages || 1);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'staff') {
      fetchStaff();
    } else {
      fetchAuditLogs();
    }
  }, [activeTab, roleFilter, statusFilter, auditPage]);

  useClinicSync(() => {
    if (activeTab === 'staff') {
      fetchStaff(true);
    } else {
      fetchAuditLogs();
    }
  });

  // Debounced search for staff
  useEffect(() => {
    const handler = setTimeout(() => {
      if (activeTab === 'staff') {
        fetchStaff();
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!fullName.trim() || !phone.trim() || !email.trim()) {
      setFormError('Please enter Full Name, WhatsApp Mobile Number, and Login Email.');
      return;
    }

    setSubmittingStaff(true);
    try {
      const res = await apiRequest<{
        message: string;
        staff: StaffMember;
        temporaryPassword: string;
        whatsappText: string;
        whatsappUrl: string;
        cleanPhone: string;
      }>('/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          role,
          permissions: selectedPermissions,
          designation: designation.trim() || undefined,
          department: department.trim() || undefined,
        }),
      });

      // Close create modal and open WhatsApp share modal
      setShowAddStaffModal(false);
      setCreatedStaffInfo({
        fullName: res.staff.fullName,
        email: res.staff.email,
        temporaryPassword: res.temporaryPassword,
        whatsappUrl: res.whatsappUrl,
        whatsappText: res.whatsappText,
        cleanPhone: res.cleanPhone,
        phone: res.staff.phone || undefined,
        employeeId: res.staff.employeeId || undefined,
        role: res.staff.role,
      });
      setShowShareModal(true);

      // Reset Form fields
      setFullName('');
      setPhone('');
      setEmail('');
      setRole('RECEPTIONIST');
      setDesignation('');
      setDepartment('');

      // Refresh staff list
      triggerClinicSync('staff_updated');
      fetchStaff(true);
    } catch (err: any) {
      setFormError(err.message || 'Failed to create staff account');
    } finally {
      setSubmittingStaff(false);
    }
  };

  const handleResetPassword = async (member: StaffMember) => {
    if (!window.confirm(`Generate a new temporary password for ${member.fullName} (${member.email}) and prepare WhatsApp share?`)) {
      return;
    }

    setResettingStaffId(member.id);
    try {
      const res = await apiRequest<{
        message: string;
        staff: any;
        temporaryPassword: string;
        whatsappText: string;
        whatsappUrl: string;
      }>(`/users/${member.id}/reset-password`, {
        method: 'POST',
      });

      setCreatedStaffInfo({
        fullName: member.fullName,
        email: member.email,
        temporaryPassword: res.temporaryPassword,
        whatsappUrl: res.whatsappUrl,
        whatsappText: res.whatsappText,
        phone: member.phone || '',
        role: member.role,
      });
      setShowShareModal(true);
      triggerClinicSync('staff_updated');
      fetchStaff(true);
    } catch (err: any) {
      alert(err.message || 'Failed to reset staff password');
    } finally {
      setResettingStaffId(null);
    }
  };

  const toggleStaffStatus = async (id: string, currentStatus: boolean, memberRole: string) => {
    if (memberRole === 'CLINIC_ADMIN') {
      alert('The primary Clinic Administrator account cannot be deactivated.');
      return;
    }
    try {
      await apiRequest(`/users/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      triggerClinicSync('staff_updated');
      fetchStaff(true);
    } catch (err: any) {
      alert(err.message || `Failed to ${!currentStatus ? 'activate' : 'deactivate'} staff member`);
    }
  };

  const copyToClipboard = (text: string, isFull: boolean = false) => {
    navigator.clipboard.writeText(text);
    if (isFull) {
      setCopiedFullMessage(true);
      setTimeout(() => setCopiedFullMessage(false), 2500);
    } else {
      setCopiedPass(true);
      setTimeout(() => setCopiedPass(false), 2500);
    }
  };

  const getRoleBadge = (roleStr: string) => {
    switch (roleStr) {
      case 'CLINIC_ADMIN':
        return <span className="bg-purple-100 text-purple-900 border border-purple-300 px-2.5 py-0.5 rounded-md text-xs font-black">Admin</span>;
      case 'DENTIST':
        return <span className="bg-teal-100 text-teal-900 border border-teal-300 px-2.5 py-0.5 rounded-md text-xs font-black">Dentist</span>;
      case 'RECEPTIONIST':
        return <span className="bg-blue-100 text-blue-900 border border-blue-300 px-2.5 py-0.5 rounded-md text-xs font-black">Receptionist</span>;
      case 'ACCOUNTANT':
        return <span className="bg-amber-100 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-md text-xs font-black">Accountant</span>;
      case 'OTHER_STAFF':
        return <span className="bg-slate-100 text-slate-800 border border-slate-300 px-2.5 py-0.5 rounded-md text-xs font-black">Other Staff</span>;
      default:
        return <span className="bg-slate-100 text-slate-800 border border-slate-300 px-2.5 py-0.5 rounded-md text-xs font-black">{roleStr}</span>;
    }
  };

  // Staff Metrics
  const totalStaff = staffList.length;
  const activeStaff = staffList.filter(s => s.isActive).length;
  const dentistsCount = staffList.filter(s => s.role === 'DENTIST' || s.role === 'CLINIC_ADMIN').length;
  const frontDeskCount = staffList.filter(s => s.role === 'RECEPTIONIST' || s.role === 'ACCOUNTANT').length;

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="clinic-card p-5 bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-teal-50 text-teal-700 rounded-xl border border-teal-200">
            {activeTab === 'treatments' ? (
              <IndianRupee className="w-6 h-6 text-teal-600" />
            ) : (
              <ShieldCheck className="w-6 h-6" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              {activeTab === 'treatments'
                ? 'Treatment & Price Catalog'
                : activeTab === 'audit'
                ? 'Clinic Activity Log'
                : 'Staff Management'}
            </h1>
            <p className="text-xs font-medium text-slate-600 mt-0.5">
              {activeTab === 'treatments'
                ? 'Manage dental procedures, tariffs, and standard INR fees'
                : activeTab === 'audit'
                ? 'Compliance trail of clinical and billing events'
                : 'Manage staff accounts, doctors, and user access'}
            </p>
          </div>
        </div>

        {/* Tab Switcher & Add Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <div className="bg-slate-100 p-1 rounded-xl border border-slate-200 flex items-center gap-1 overflow-x-auto no-scrollbar w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('staff')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeTab === 'staff'
                  ? 'bg-white text-teal-800 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-teal-600" />
              <span>Staff ({totalStaff})</span>
            </button>
            <button
              onClick={() => setActiveTab('treatments')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeTab === 'treatments'
                  ? 'bg-white text-teal-800 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <IndianRupee className="w-3.5 h-3.5 text-teal-600" />
              <span>Treatment & Price Catalog</span>
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 ${
                activeTab === 'audit'
                  ? 'bg-white text-teal-800 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-teal-600" />
              <span>Activity Log</span>
            </button>
          </div>

          {activeTab === 'staff' && (
            <button
              onClick={() => setShowAddStaffModal(true)}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold rounded-xl shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Add Staff</span>
            </button>
          )}
        </div>
      </div>

      {/* Staff View */}
      {activeTab === 'staff' && (
        <div className="space-y-4">
          {/* Key Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="clinic-card p-4 bg-teal-50/50 border border-teal-200 rounded-xl flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-teal-600 text-white">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Total Staff</p>
                <p className="text-xl font-black text-slate-900">{totalStaff}</p>
              </div>
            </div>

            <div className="clinic-card p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-600 text-white">
                <UserCheck className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Active Staff</p>
                <p className="text-xl font-black text-emerald-800">{activeStaff}</p>
              </div>
            </div>

            <div className="clinic-card p-4 bg-purple-50/50 border border-purple-200 rounded-xl flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-purple-600 text-white">
                <Stethoscope className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Doctors</p>
                <p className="text-xl font-black text-purple-900">{dentistsCount}</p>
              </div>
            </div>

            <div className="clinic-card p-4 bg-blue-50/50 border border-blue-200 rounded-xl flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-600 text-white">
                <Briefcase className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Front Desk</p>
                <p className="text-xl font-black text-blue-900">{frontDeskCount}</p>
              </div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="clinic-card p-3.5 bg-white border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex-1 min-w-[240px] relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search staff by name, email, phone, role..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-semibold placeholder-slate-400 focus:outline-hidden focus:border-teal-600 focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 text-slate-800 font-bold rounded-lg px-3 py-2 text-xs focus:outline-hidden"
              >
                <option value="">All Roles</option>
                <option value="CLINIC_ADMIN">Hospital Admin</option>
                <option value="DENTIST">Dentist</option>
                <option value="RECEPTIONIST">Receptionist</option>
                <option value="ACCOUNTANT">Accountant</option>
                <option value="OTHER_STAFF">Other Staff</option>
              </select>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 text-slate-800 font-bold rounded-lg px-3 py-2 text-xs focus:outline-hidden"
              >
                <option value="">All Statuses</option>
                <option value="true">Active Only</option>
                <option value="false">Deactivated Only</option>
              </select>

              <button
                onClick={() => fetchStaff()}
                title="Refresh staff list"
                className="p-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-slate-700 cursor-pointer font-bold"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Staff Members List & Table */}
          <div className="clinic-card bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            {/* MOBILE VIEW: Staff Cards (< md) */}
            <div className="md:hidden divide-y divide-slate-100">
              {staffList.length === 0 ? (
                <div className="p-8 text-center text-slate-500 font-semibold text-xs">
                  {loading ? 'Loading staff...' : 'No staff members match the selected filters.'}
                </div>
              ) : (
                staffList.map(member => {
                  const cleanPhone = (member.phone || '').replace(/[^0-9]/g, '');
                  const directWhatsAppUrl = cleanPhone
                    ? `https://api.whatsapp.com/send?phone=${cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone}`
                    : null;

                  return (
                    <div key={member.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-teal-600 border border-teal-700 flex items-center justify-center font-black text-white text-xs shadow-xs shrink-0">
                            {member.fullName.charAt(0)}
                          </div>
                          <div>
                            <div className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5 flex-wrap">
                              <span>{member.fullName}</span>
                              {member.employeeId && (
                                <span className="font-mono text-[10px] font-black text-teal-800 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded">
                                  {member.employeeId}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 font-medium truncate max-w-[200px]">{member.email}</div>
                          </div>
                        </div>

                        <div>{getRoleBadge(member.role)}</div>
                      </div>

                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
                        <div>
                          <span className="text-slate-500 text-[10px] uppercase font-bold block">Designation</span>
                          <span className="font-bold text-slate-800">
                            {member.designation || member.role.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-500 text-[10px] uppercase font-bold block">Status</span>
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              member.isActive
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : 'bg-rose-100 text-rose-900 border border-rose-300'
                            }`}
                          >
                            {member.isActive ? 'Active' : 'Deactivated'}
                          </span>
                        </div>
                      </div>

                      {/* Contact & WhatsApp */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-bold text-slate-800 flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-teal-600" />
                          {member.phone || 'No phone'}
                        </span>
                        {directWhatsAppUrl && (
                          <a
                            href={directWhatsAppUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        )}
                      </div>

                      {/* Mobile Actions */}
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                        <button
                          onClick={() => handleResetPassword(member)}
                          disabled={resettingStaffId === member.id}
                          className="flex-1 py-2 px-3 rounded-xl bg-white hover:bg-slate-50 text-teal-700 border border-teal-300 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-2xs"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>Reset Password</span>
                        </button>

                        {member.role !== 'CLINIC_ADMIN' && (
                          <button
                            onClick={() => toggleStaffStatus(member.id, member.isActive, member.role)}
                            className={`text-xs font-bold px-3 py-2 rounded-xl border transition-colors cursor-pointer ${
                              member.isActive
                                ? 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'
                                : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            }`}
                          >
                            {member.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* DESKTOP VIEW: Staff Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[700px]">
                <thead className="bg-slate-100 text-slate-800 font-black uppercase tracking-wider text-xs border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Department / Designation</th>
                    <th className="py-3 px-4">Contact & WhatsApp</th>
                    <th className="py-3 px-4">Account Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500 font-semibold">
                        {loading ? 'Loading staff...' : 'No staff members match the selected filters.'}
                      </td>
                    </tr>
                  ) : (
                    staffList.map(member => {
                      const cleanPhone = (member.phone || '').replace(/[^0-9]/g, '');
                      const directWhatsAppUrl = cleanPhone
                        ? `https://api.whatsapp.com/send?phone=${cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone}`
                        : null;

                      return (
                        <tr key={member.id} className="hover:bg-slate-50 transition-colors">
                          {/* Staff Name & ID */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-teal-600 border border-teal-700 flex items-center justify-center font-black text-white text-xs shadow-xs">
                                {member.fullName.charAt(0)}
                              </div>
                              <div>
                                <div className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                                  <span>{member.fullName}</span>
                                  {member.employeeId && (
                                    <span className="font-mono text-[11px] font-black text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">
                                      {member.employeeId}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-600 font-medium">{member.email}</div>
                              </div>
                            </div>
                          </td>

                          {/* Role Badge */}
                          <td className="py-3.5 px-4">
                            {getRoleBadge(member.role)}
                          </td>

                          {/* Department & Designation */}
                          <td className="py-3.5 px-4">
                            <div className="text-slate-900 font-bold">
                              {member.designation || member.role.replace('_', ' ')}
                            </div>
                            <div className="text-xs text-slate-500 font-medium">
                              {member.department || 'General Clinic'}
                            </div>
                          </td>

                          {/* Contact & WhatsApp */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-slate-800 font-bold">{member.phone || '—'}</span>
                              {directWhatsAppUrl && (
                                <a
                                  href={directWhatsAppUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open WhatsApp Chat"
                                  className="p-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </td>

                          {/* Account Status */}
                          <td className="py-3.5 px-4">
                            <div className="flex flex-col gap-1 items-start">
                              <span
                                className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-full ${
                                  member.isActive
                                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                    : 'bg-rose-100 text-rose-900 border border-rose-300'
                                }`}
                              >
                                {member.isActive ? 'Active' : 'Deactivated'}
                              </span>
                              {member.mustChangePassword && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded">
                                  <KeyRound className="w-3 h-3 text-amber-700" /> Temp Password
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Reset Password Button */}
                              <button
                                onClick={() => handleResetPassword(member)}
                                disabled={resettingStaffId === member.id}
                                title="Reset Password & Share on WhatsApp"
                                className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-teal-700 border border-teal-300 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                                <span>Reset Password</span>
                              </button>

                              {/* Toggle Status Button (Protected for Super Admin) */}
                              {member.role !== 'CLINIC_ADMIN' && (
                                <button
                                  onClick={() => toggleStaffStatus(member.id, member.isActive, member.role)}
                                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors cursor-pointer ${
                                    member.isActive
                                      ? 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'
                                      : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                  }`}
                                >
                                  {member.isActive ? 'Deactivate' : 'Activate'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Treatment & Price Catalog Tab */}
      {activeTab === 'treatments' && (
        <TreatmentCatalogManager />
      )}

      {/* Audit Logs Tab */}
      {activeTab === 'audit' && (
        <div className="clinic-card bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="font-black text-base text-slate-900">Clinic Activity Log</h3>
              <p className="text-xs text-slate-500 font-medium">Recorded clinical and operational events</p>
            </div>
            <button
              onClick={() => fetchAuditLogs()}
              className="p-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg text-slate-700 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-800 text-xs uppercase font-black">
                <tr>
                  <th className="py-2.5 px-3">Date & Time (IST)</th>
                  <th className="py-2.5 px-3">Staff Member</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Record Type</th>
                  <th className="py-2.5 px-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 text-xs">
                {auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 text-slate-600 font-medium font-mono">
                      {new Date(log.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                    </td>
                    <td className="py-2.5 px-3 text-slate-900 font-extrabold">{log.actor}</td>
                    <td className="py-2.5 px-3">
                      <span className="bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded font-bold">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 font-semibold">{log.entityType}</td>
                    <td className="py-2.5 px-3 text-slate-700 truncate max-w-xs text-xs font-mono">
                      {log.details ? JSON.stringify(log.details) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Audit Pagination */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200 text-xs text-slate-600 font-bold">
            <span>Page {auditPage} of {totalAuditPages}</span>
            <div className="flex items-center gap-2">
              <button
                disabled={auditPage <= 1}
                onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg bg-slate-100 border border-slate-300 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={auditPage >= totalAuditPages}
                onClick={() => setAuditPage(p => Math.min(totalAuditPages, p + 1))}
                className="p-1.5 rounded-lg bg-slate-100 border border-slate-300 disabled:opacity-40 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD STAFF MEMBER */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 text-slate-900 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-800 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Add Clinic Staff Member</h3>
                  <p className="text-xs text-slate-600 font-medium">Generates login access and temporary password</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddStaffModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateStaff} className="mt-4 space-y-3.5 text-xs">
              {/* Full Name */}
              <div>
                <label className="block font-bold text-slate-800 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="e.g. Priya R. / Dr. A. Rahman"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold placeholder-slate-400 focus:outline-hidden focus:border-teal-600 focus:bg-white"
                />
              </div>

              {/* Mobile Number & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">WhatsApp Mobile *</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+91 98401 23456"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold placeholder-slate-400 font-mono focus:outline-hidden focus:border-teal-600 focus:bg-white"
                  />
                  <span className="text-[11px] text-teal-700 font-semibold block mt-0.5">Used for WhatsApp invitation</span>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">Login Email *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="staff@clinic.com"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold placeholder-slate-400 font-mono focus:outline-hidden focus:border-teal-600 focus:bg-white"
                  />
                </div>
              </div>

              {/* Role & Designation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Staff Role *</label>
                  <select
                    value={role}
                    onChange={e => {
                      const newRole = e.target.value;
                      setRole(newRole);
                      const defaults = (DEFAULT_ROLE_PERMISSIONS as any)[newRole] || [];
                      setSelectedPermissions([...defaults]);
                      if (newRole === 'OTHER_STAFF') {
                        setShowPermissionsCustomizer(true);
                      }
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold focus:outline-hidden focus:border-teal-600 focus:bg-white"
                  >
                    <option value="RECEPTIONIST">Receptionist (Front Desk & Queue)</option>
                    <option value="DENTIST">Dentist (Clinical Care & Consultations)</option>
                    <option value="ACCOUNTANT">Accountant (Billing & Financial Ledger)</option>
                    <option value="OTHER_STAFF">Other Staff (Individually Controlled Permissions)</option>
                    <option value="CLINIC_ADMIN">Clinic Admin (Full Hospital Access)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">Designation</label>
                  <input
                    type="text"
                    value={designation}
                    onChange={e => setDesignation(e.target.value)}
                    placeholder="e.g. Front Office Executive / Dental Surgeon"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold placeholder-slate-400 focus:outline-hidden focus:border-teal-600 focus:bg-white"
                  />
                </div>
              </div>

              {/* Interactive Controlled Permissions Assignment */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50">
                <div
                  onClick={() => setShowPermissionsCustomizer(!showPermissionsCustomizer)}
                  className="p-3 bg-slate-100 flex items-center justify-between cursor-pointer hover:bg-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-teal-600" />
                    <span className="font-extrabold text-slate-900 text-xs">
                      Assigned Permissions ({selectedPermissions.length} active)
                    </span>
                    {role === 'OTHER_STAFF' && (
                      <span className="text-[10px] font-black bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300">
                        Custom Role Selection
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-bold text-teal-700">
                    {showPermissionsCustomizer ? '▲ Collapse' : '▼ Customize Permissions'}
                  </span>
                </div>

                {showPermissionsCustomizer && (
                  <div className="p-3 space-y-3.5 max-h-60 overflow-y-auto divide-y divide-slate-200">
                    {PERMISSION_GROUPS.map(group => (
                      <div key={group.name} className="pt-2 first:pt-0">
                        <div className="font-extrabold text-slate-800 text-[11px] uppercase tracking-wider mb-1.5 flex items-center justify-between">
                          <span>{group.name}</span>
                          <span className="text-[10px] font-mono text-slate-500 font-bold">
                            {group.permissions.filter(p => selectedPermissions.includes(p.key)).length} / {group.permissions.length}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-1.5">
                          {group.permissions.map(perm => {
                            const isChecked = selectedPermissions.includes(perm.key);
                            return (
                              <label
                                key={perm.key}
                                className={`flex items-start gap-2 p-2 rounded-xl border transition-all cursor-pointer ${
                                  isChecked
                                    ? 'bg-teal-50 border-teal-300 text-slate-900'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (isChecked) {
                                      setSelectedPermissions(selectedPermissions.filter(k => k !== perm.key));
                                    } else {
                                      setSelectedPermissions([...selectedPermissions, perm.key]);
                                    }
                                  }}
                                  className="mt-0.5 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                                />
                                <div className="flex-1 min-w-0">
                                  <span className="font-extrabold text-xs block">{perm.label}</span>
                                  <span className="text-[10px] text-slate-500 block leading-tight">{perm.description}</span>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Department & Employee ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">Department</label>
                  <input
                    type="text"
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    placeholder="e.g. Front Office / Orthodontics"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold placeholder-slate-400 focus:outline-hidden focus:border-teal-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-800 mb-1">Employee ID</label>
                  <div className="w-full p-2.5 bg-slate-100 border border-slate-300 rounded-xl text-slate-800 font-bold font-mono text-xs flex items-center justify-between">
                    <span className="text-slate-600 font-semibold">Auto-Generated by Clinic DB</span>
                    <span className="text-[11px] font-black text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                      Sequential System ID
                    </span>
                  </div>
                  <span className="text-[11px] text-teal-700 font-semibold block mt-0.5">Assigned automatically upon creation</span>
                </div>
              </div>

              <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-teal-900 text-xs font-semibold leading-relaxed">
                🔒 <strong>Account Setup:</strong> A temporary password will be generated automatically and can be sent to staff via WhatsApp.
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingStaff}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  {submittingStaff ? 'Creating Account...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: WHATSAPP SHARE & CREDENTIALS MODAL */}
      {showShareModal && createdStaffInfo && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 text-slate-900 shadow-2xl relative space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 p-1 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shrink-0">
                  <ClinicLogo className="w-full h-full object-contain" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Staff Account Created</h3>
                  <p className="text-xs text-emerald-700 font-bold">Login details can be sent to staff via WhatsApp</p>
                </div>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Credential Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-600 font-semibold">Staff Member:</span>
                <span className="font-black text-slate-900 text-sm">{createdStaffInfo.fullName}</span>
              </div>

              {createdStaffInfo.employeeId && (
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <span className="text-slate-600 font-semibold">Employee ID:</span>
                  <span className="font-mono text-teal-900 font-black bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md text-xs">
                    {createdStaffInfo.employeeId}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-600 font-semibold">Assigned Role:</span>
                <span>{getRoleBadge(createdStaffInfo.role)}</span>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-600 font-semibold">Login Email:</span>
                <span className="font-mono text-teal-800 font-black">{createdStaffInfo.email}</span>
              </div>

              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-slate-600 font-semibold">Mobile (WhatsApp):</span>
                <span className="font-mono text-slate-900 font-bold">{createdStaffInfo.phone || '—'}</span>
              </div>

              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-700 font-black flex items-center gap-1 text-xs">
                    <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                    Temporary Password:
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTempPass(!showTempPass)}
                    className="text-xs text-slate-600 hover:text-slate-900 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {showTempPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showTempPass ? 'Hide' : 'Reveal'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-amber-50 border border-amber-300 rounded-xl p-2.5 font-mono text-sm font-black text-amber-950 tracking-wider">
                    {showTempPass ? createdStaffInfo.temporaryPassword : '••••••••••••'}
                  </div>
                  <button
                    onClick={() => copyToClipboard(createdStaffInfo.temporaryPassword)}
                    className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 flex items-center gap-1 cursor-pointer transition-colors font-bold"
                    title="Copy Password"
                  >
                    {copiedPass ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Prominent WhatsApp Share Button */}
            <div className="space-y-2 pt-2">
              <a
                href={createdStaffInfo.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3.5 px-4 rounded-2xl bg-[#25D366] hover:bg-[#20ba59] text-white font-black text-sm flex items-center justify-center gap-2.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <MessageCircle className="w-5 h-5 fill-white" />
                <span>Share Credentials on WhatsApp</span>
                <ExternalLink className="w-4 h-4" />
              </a>

              <p className="text-xs text-center text-slate-500 font-medium">
                WhatsApp opens in a new tab with the credentials pre-filled for <strong>{createdStaffInfo.phone}</strong>.
              </p>
            </div>

            {/* Clipboard Fallback Button */}
            <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-200">
              <button
                onClick={() => copyToClipboard(createdStaffInfo.whatsappText, true)}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                {copiedFullMessage ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Copied Welcome Message!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Full Welcome Message</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setShowShareModal(false)}
                className="py-2 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};