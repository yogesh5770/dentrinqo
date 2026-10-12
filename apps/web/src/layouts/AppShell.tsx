import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { apiRequest } from '../lib/api';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Stethoscope,
  ClipboardList,
  ShieldCheck,
  LogOut,
  Clock,
  Sparkles,
  Search,
  Bell,
  Menu,
  X,
  PlusCircle,
  Crown,
  Package,
  Building2,
  Armchair,
  Receipt,
  KeyRound,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Camera,
  Activity,
  FileText,
  CreditCard,
  IndianRupee,
  PhoneCall,
  History,
  Tag,
  TrendingUp,
  User,
  Shield,
  HelpCircle,
  GitMerge,
} from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
  onOpenNewPatient?: () => void;
  onOpenBooking?: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({ children, onOpenNewPatient, onOpenBooking }) => {
  const { user, logout, refreshProfile, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  const clinicName = user?.clinic?.name || (user?.clinic?.code === 'JDC' ? 'Jacobs Dental Clinic' : "AK's Elite Dental Clinic");
  const clinicCity = user?.clinic?.city ? `${user?.clinic?.city}` : (user?.clinic?.code === 'JDC' ? 'Vellore' : 'K.Pudur, Madurai');
  const clinicAddress = user?.clinic?.address || (user?.clinic?.code === 'JDC' ? '14th East Cross Main Road, Gandhi Nagar East, Vellore' : 'Plot No. 162/2A, Alagar Complex, K.Pudur, Madurai');
  const clinicSubTitle = user?.clinic?.code === 'JDC' ? 'Dental Surgery & Implant Centre' : 'Multi-Speciality Hospital';

  // Profile Modal State
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Change Password Modal State
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [changingPass, setChangingPass] = useState(false);
  const [changePassError, setChangePassError] = useState<string | null>(null);
  const [changePassSuccess, setChangePassSuccess] = useState<string | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-IN', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePassError(null);
    setChangePassSuccess(null);

    if (newPassword !== confirmPassword) {
      setChangePassError('New password and confirm password do not match');
      return;
    }

    if (newPassword.length < 6) {
      setChangePassError('New password must be at least 6 characters long');
      return;
    }

    if (currentPassword === newPassword) {
      setChangePassError('New password must be different from your current password');
      return;
    }

    setChangingPass(true);
    try {
      const res = await apiRequest<{ message: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      setChangePassSuccess(res.message || 'Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      await refreshProfile();

      setTimeout(() => {
        setShowChangePasswordModal(false);
        setChangePassSuccess(null);
      }, 2000);
    } catch (err: any) {
      setChangePassError(err.message || 'Failed to change password');
    } finally {
      setChangingPass(false);
    }
  };

  interface NavItem {
    label: string;
    path: string;
    icon: any;
    isModal?: string;
  }

  interface NavSection {
    title?: string;
    items: NavItem[];
  }

  // Generate clean, organized role-based navigation sections
  const getNavSectionsForRole = (): NavSection[] => {
    const role = user?.role;
    const permissions = user?.permissions || [];

    if (role === 'CLINIC_ADMIN') {
      return [
        {
          title: 'Clinical Workspace',
          items: [
            { label: 'Front Desk (Reception)', path: '/', icon: Armchair },
            { label: 'Doctor Chair (Clinical)', path: '/doctor', icon: Stethoscope },
            { label: 'Patient Directory & Cards', path: '/patients', icon: Users },
            { label: 'Appointment Calendar', path: '/appointments', icon: CalendarDays },
          ],
        },
        {
          title: 'Finance & Labs',
          items: [
            { label: 'Billing & Invoices', path: '/billing', icon: Receipt },
            { label: 'Dental Lab Orders', path: '/lab-orders', icon: Package },
          ],
        },
        {
          title: 'Clinic Administration',
          items: [
            { label: 'Reports & Analytics', path: '/reports', icon: TrendingUp },
            { label: 'Clinic Settings', path: '/settings', icon: Building2 },
            { label: 'Staff Accounts', path: '/admin', icon: ShieldCheck },
            { label: 'Audit Logs', path: '/audit-logs', icon: History },
          ],
        },
      ];
    }

    if (role === 'RECEPTIONIST') {
      return [
        {
          title: 'Front Desk Operations',
          items: [
            { label: 'Reception & Queue', path: '/', icon: Armchair },
            { label: '+ Register Patient', path: '#register', icon: PlusCircle, isModal: 'newPatient' },
            { label: 'Patient Records & Search', path: '/patients', icon: Users },
            { label: 'Appointment Schedule', path: '/appointments', icon: CalendarDays },
          ],
        },
        {
          title: 'Billing & Desk',
          items: [
            { label: 'Billing & Payments', path: '/billing', icon: Receipt },
            { label: 'Dental Lab Orders', path: '/lab-orders', icon: Package },
            { label: 'Follow-ups & Recalls', path: '/follow-ups', icon: PhoneCall },
          ],
        },
      ];
    }

    if (role === 'DENTIST') {
      return [
        {
          title: 'Clinical Desk',
          items: [
            { label: 'Doctor Chair (Clinical)', path: '/doctor', icon: Stethoscope },
            { label: "Today's Patient Queue", path: '/', icon: LayoutDashboard },
            { label: 'Patient History & Cards', path: '/patients', icon: Users },
            { label: 'Appointment Calendar', path: '/appointments', icon: CalendarDays },
          ],
        },
        {
          title: 'Clinical Operations',
          items: [
            { label: 'Dental Lab Orders', path: '/lab-orders', icon: Package },
            { label: 'Follow-ups & Recalls', path: '/follow-ups', icon: PhoneCall },
          ],
        },
      ];
    }

    if (role === 'ACCOUNTANT') {
      return [
        {
          title: 'Finance & Accounts',
          items: [
            { label: 'Financial Overview', path: '/', icon: LayoutDashboard },
            { label: 'Invoices', path: '/billing?tab=invoices', icon: Receipt },
            { label: 'Payments Collected', path: '/billing?tab=payments', icon: CreditCard },
            { label: 'Outstanding Balances', path: '/billing?tab=outstanding', icon: IndianRupee },
            { label: 'Financial Reports', path: '/reports', icon: TrendingUp },
          ],
        },
      ];
    }

    // OTHER_STAFF: Filter strictly based on permissions
    const otherItems: NavItem[] = [{ label: 'Dashboard', path: '/', icon: LayoutDashboard }];
    if (permissions.includes('appointments.view')) {
      otherItems.push({ label: 'Appointments', path: '/appointments', icon: CalendarDays });
    }
    if (permissions.includes('patients.view')) {
      otherItems.push({ label: 'Patients', path: '/patients', icon: Users });
    }
    if (permissions.includes('clinical.consultations.view')) {
      otherItems.push({ label: 'Doctor Desk', path: '/doctor', icon: Stethoscope });
    }
    if (permissions.includes('billing.invoices.view')) {
      otherItems.push({ label: 'Billing & Payments', path: '/billing', icon: Receipt });
    }
    if (permissions.includes('reports.financial.view')) {
      otherItems.push({ label: 'Reports', path: '/reports', icon: TrendingUp });
    }
    if (permissions.includes('followups.view')) {
      otherItems.push({ label: 'Follow-ups', path: '/follow-ups', icon: PhoneCall });
    }
    return [{ items: otherItems }];
  };

  const getMobileBottomTabs = () => {
    const role = user?.role;
    if (role === 'CLINIC_ADMIN') {
      return [
        { label: 'Front Desk', path: '/', icon: Armchair },
        { label: 'Doctor Chair', path: '/doctor', icon: Stethoscope },
        { label: 'Patients', path: '/patients', icon: Users },
        { label: 'Visits', path: '/appointments', icon: CalendarDays },
        { label: 'Menu', path: '#menu', icon: Menu, isDrawerTrigger: true },
      ];
    }
    if (role === 'RECEPTIONIST') {
      return [
        { label: 'Front Desk', path: '/', icon: Armchair },
        { label: 'Patients', path: '/patients', icon: Users },
        { label: 'Visits', path: '/appointments', icon: CalendarDays },
        { label: 'Billing', path: '/billing', icon: Receipt },
        { label: 'Menu', path: '#menu', icon: Menu, isDrawerTrigger: true },
      ];
    }
    if (role === 'DENTIST') {
      return [
        { label: 'Doctor Chair', path: '/doctor', icon: Stethoscope },
        { label: 'Queue', path: '/', icon: LayoutDashboard },
        { label: 'Patients', path: '/patients', icon: Users },
        { label: 'Visits', path: '/appointments', icon: CalendarDays },
        { label: 'Menu', path: '#menu', icon: Menu, isDrawerTrigger: true },
      ];
    }
    if (role === 'ACCOUNTANT') {
      return [
        { label: 'Dashboard', path: '/', icon: LayoutDashboard },
        { label: 'Invoices', path: '/billing?tab=invoices', icon: Receipt },
        { label: 'Payments', path: '/billing?tab=payments', icon: CreditCard },
        { label: 'Reports', path: '/reports', icon: TrendingUp },
        { label: 'Menu', path: '#menu', icon: Menu, isDrawerTrigger: true },
      ];
    }
    return [
      { label: 'Dashboard', path: '/', icon: LayoutDashboard },
      { label: 'Menu', path: '#menu', icon: Menu, isDrawerTrigger: true },
    ];
  };

  const navSections = getNavSectionsForRole();
  const allowedNav = navSections.flatMap(sec => sec.items);
  const mobileBottomTabs = getMobileBottomTabs();
  const isOwner = user?.role === 'CLINIC_ADMIN';
  const isAccountant = user?.role === 'ACCOUNTANT';
  const canRegisterPatient = Boolean(hasPermission('patients.register') || user?.role === 'CLINIC_ADMIN' || user?.role === 'RECEPTIONIST');
  const canBookVisit = Boolean(hasPermission('appointments.create') || user?.role === 'CLINIC_ADMIN' || user?.role === 'RECEPTIONIST');


  const roleBadge = isOwner ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-amber-400 text-slate-950">
      <Crown className="w-3 h-3 text-slate-950" />
      Admin (Owner)
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-teal-800 text-teal-100 font-mono">
      {user?.role?.replace('_', ' ')}
    </span>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row font-sans selection:bg-teal-500 selection:text-white">
      {/* Sidebar Navigation (Desktop) */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 hidden lg:flex text-white">
        {/* Clinic Brand Header */}
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 p-1 rounded-xl bg-white border border-slate-700 flex items-center justify-center shrink-0 shadow-sm">
              <img src="/logo.png" alt={`${clinicName} Logo`} className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white tracking-tight leading-tight">
                {clinicName}
              </h2>
              <p className="text-[11px] text-teal-300 font-bold uppercase tracking-wider">
                {clinicSubTitle}
              </p>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-300 font-medium">
            <span>{clinicCity}</span>
            <span className="text-teal-300 flex items-center gap-1 font-mono font-bold">
              <Clock className="w-3.5 h-3.5" />
              {currentTime || 'Live'}
            </span>
          </div>
        </div>

        {/* Quick Action Buttons - STRICTLY ROLE RELEVANT */}
        {isAccountant ? (
          <div className="p-3.5 grid grid-cols-2 gap-2 border-b border-slate-800">
            <Link
              to="/billing?tab=invoices"
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-extrabold transition-all cursor-pointer shadow-xs"
            >
              <Receipt className="w-3.5 h-3.5" />
              <span>+ Invoice</span>
            </Link>
            <Link
              to="/billing?tab=outstanding"
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-xs font-bold transition-all cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5 text-teal-300" />
              <span>+ Payment</span>
            </Link>
          </div>
        ) : (canRegisterPatient || canBookVisit) ? (
          <div className="p-3.5 grid grid-cols-2 gap-2 border-b border-slate-800">
            {canRegisterPatient ? (
              <button
                onClick={onOpenNewPatient}
                className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-extrabold transition-all cursor-pointer shadow-xs"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Patient</span>
              </button>
            ) : <div />}
            {canBookVisit && (
              <button
                onClick={onOpenBooking}
                className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                <CalendarDays className="w-3.5 h-3.5 text-teal-300" />
                <span>+ Book Visit</span>
              </button>
            )}
          </div>
        ) : null}


        {/* Nav Links Grouped into Clean Sections */}
        <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
          {navSections.map((sec, sIdx) => (
            <div key={sIdx} className="space-y-1">
              {sec.title && (
                <div className="px-3.5 pt-1 pb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  {sec.title}
                </div>
              )}
              {sec.items.map(item => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path ||
                  (item.path === '/doctor' && location.pathname.startsWith('/doctor'));
                if (item.isModal === 'newPatient') {
                  return (
                    <button
                      key={item.label}
                      onClick={onOpenNewPatient}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 cursor-pointer text-left transition-all"
                    >
                      <Icon className="w-4 h-4 text-teal-400" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                }
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
                      isActive
                        ? 'bg-teal-600 text-white font-extrabold shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/80 font-medium'
                    }`}
                  >
                    <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'}`} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Active User Section */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowProfileModal(true)}
              className="w-9 h-9 rounded-xl bg-teal-900 hover:bg-teal-800 border border-teal-500/50 flex items-center justify-center text-teal-200 font-extrabold text-sm shrink-0 cursor-pointer transition-colors"
              title="View My Profile & Permissions"
            >
              {user?.fullName.charAt(0)}
            </button>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setShowProfileModal(true)}>
              <p className="text-xs font-bold text-white truncate hover:text-teal-300">{user?.fullName}</p>
              <div className="mt-0.5">{roleBadge}</div>
            </div>
            <button
              onClick={() => setShowProfileModal(true)}
              title="My Profile & Permissions"
              className="p-1.5 text-slate-300 hover:text-teal-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <User className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowChangePasswordModal(true)}
              title="Change Password"
              className="p-1.5 text-slate-300 hover:text-amber-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
            </button>
            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 text-slate-300 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-x-hidden">
        {/* Temporary Password Mandatory Notification Banner */}
        {user?.mustChangePassword && (
          <div className="bg-amber-400 text-slate-950 px-4 py-2.5 text-xs font-bold flex items-center justify-between border-b border-amber-500 sticky top-0 z-40 shadow-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-slate-950 shrink-0" />
              <span>
                <strong>Security Alert:</strong> You are using a temporary password. Please change your password to secure your account.
              </span>
            </div>
            <button
              onClick={() => setShowChangePasswordModal(true)}
              className="px-3 py-1 bg-slate-950 hover:bg-slate-800 text-white font-extrabold rounded-lg text-xs transition-all cursor-pointer shadow-xs"
            >
              Change Password Now
            </button>
          </div>
        )}

        {/* Top Header */}
        <header className="h-14 sm:h-16 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open Navigation Menu"
              className="lg:hidden p-2 text-slate-700 hover:text-slate-900 rounded-xl hover:bg-slate-100 cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <img src="/logo.png" alt={`${clinicName} Logo`} className="w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0" />
              <div className="min-w-0">
                <span className="font-extrabold text-slate-900 text-xs sm:text-base block truncate">
                  {clinicName}
                </span>
                <span className="text-[10px] sm:hidden text-teal-700 font-bold block">
                  {clinicCity}
                </span>
              </div>
              <span className="hidden sm:inline text-slate-400">•</span>
              <span className="hidden sm:inline text-slate-600 font-medium text-xs">{clinicCity}</span>
            </div>
          </div>

          {/* 1-Click Workspace Switcher: Front Desk <--> Doctor Chair */}
          {(user?.role === 'CLINIC_ADMIN' || user?.role === 'DENTIST' || user?.role === 'RECEPTIONIST') && (
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1 shadow-inner mx-1 sm:mx-3">
              <Link
                to="/"
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  location.pathname === '/' || location.pathname === '/appointments' || location.pathname.startsWith('/patients')
                    ? 'bg-white text-teal-800 shadow-xs border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
                title="Switch to Front Desk (Reception & Queue)"
              >
                <Armchair className="w-3.5 h-3.5 text-teal-600" />
                <span className="hidden sm:inline">Front Desk</span>
                <span className="sm:hidden">Desk</span>
              </Link>
              <Link
                to="/doctor"
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  location.pathname.startsWith('/doctor') || location.pathname.startsWith('/consultations') || location.pathname.startsWith('/prescriptions') || location.pathname.startsWith('/treatment-plans') || location.pathname.startsWith('/xrays')
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
                title="Switch to Doctor Chair (Consultation & Dental Desk)"
              >
                <Stethoscope className={`w-3.5 h-3.5 ${location.pathname.startsWith('/doctor') ? 'text-white' : 'text-teal-600'}`} />
                <span className="hidden sm:inline">Doctor Chair</span>
                <span className="sm:hidden">Doctor</span>
              </Link>
            </div>
          )}

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* Quick Add Patient Button in Header on Mobile (Only for roles with patient registration permissions) */}
            {onOpenNewPatient && canRegisterPatient && (
              <button
                onClick={onOpenNewPatient}
                className="lg:hidden flex items-center gap-1 bg-teal-600 text-white font-extrabold text-[11px] py-1.5 px-2.5 rounded-xl shadow-xs cursor-pointer"
                title="Register New Patient"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Patient</span>
              </button>
            )}

            {/* Operatory Chairs badge for clinical/reception, Accounts badge for Accountant */}
            {(user?.role === 'CLINIC_ADMIN' || user?.role === 'DENTIST' || user?.role === 'RECEPTIONIST') ? (
              <div className="hidden md:flex items-center gap-2 text-xs bg-slate-100 text-slate-700 font-semibold px-3 py-1.5 rounded-xl border border-slate-200">
                <Armchair className="w-3.5 h-3.5 text-teal-600" />
                <span>{user?.clinic?.chairCount || 3} Operatory {(user?.clinic?.chairCount || 3) === 1 ? 'Chair' : 'Chairs'}</span>
              </div>
            ) : user?.role === 'ACCOUNTANT' ? (
              <div className="hidden md:flex items-center gap-2 text-xs bg-emerald-50 text-emerald-800 font-bold px-3 py-1.5 rounded-xl border border-emerald-200">
                <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                <span>Accounts & Ledger</span>
              </div>
            ) : null}

            <button
              onClick={() => setShowChangePasswordModal(true)}
              className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-teal-700 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors cursor-pointer"
              title="Change Password"
            >
              <KeyRound className="w-3.5 h-3.5 text-amber-600" />
              <span>Password</span>
            </button>

            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-xs font-bold text-rose-700 hover:text-rose-800 p-2 sm:px-3 sm:py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Mobile Navigation Slide-Out Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            {/* Dark Backdrop Overlay */}
            <div
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
            />

            {/* Slide-out Drawer Menu */}
            <div className="relative w-72 max-w-[85vw] bg-slate-900 text-white flex flex-col h-full shadow-2xl z-10 border-r border-slate-800 animate-in slide-in-from-left duration-200">
              {/* Drawer Header */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 p-1 rounded-xl bg-white border border-slate-700 flex items-center justify-center shrink-0 shadow-sm">
                    <img src="/logo.png" alt={`${clinicName} Logo`} className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <h2 className="text-xs font-extrabold text-white leading-tight">{clinicName}</h2>
                    <p className="text-[10px] text-teal-300 font-bold uppercase tracking-wider">{clinicSubTitle}</p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Quick Actions in Mobile Drawer - ROLE RELEVANT */}
              {isAccountant ? (
                <div className="p-3 grid grid-cols-2 gap-2 border-b border-slate-800">
                  <Link
                    to="/billing?tab=invoices"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-extrabold cursor-pointer shadow-xs"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>+ Invoice</span>
                  </Link>
                  <Link
                    to="/billing?tab=outstanding"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-xs font-bold cursor-pointer"
                  >
                    <CreditCard className="w-3.5 h-3.5 text-teal-300" />
                    <span>+ Payment</span>
                  </Link>
                </div>
              ) : (canRegisterPatient || canBookVisit) ? (
                <div className="p-3 grid grid-cols-2 gap-2 border-b border-slate-800">
                  {canRegisterPatient ? (
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenNewPatient?.();
                      }}
                      className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-extrabold cursor-pointer shadow-xs"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>+ Patient</span>
                    </button>
                  ) : <div />}
                  {canBookVisit && (
                    <button
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenBooking?.();
                      }}
                      className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-xs font-bold cursor-pointer"
                    >
                      <CalendarDays className="w-3.5 h-3.5 text-teal-300" />
                      <span>+ Book Visit</span>
                    </button>
                  )}
                </div>
              ) : null}


              {/* Nav Links Grouped into Clean Sections */}
              <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
                {navSections.map((sec, sIdx) => (
                  <div key={sIdx} className="space-y-1">
                    {sec.title && (
                      <div className="px-3.5 pt-1 pb-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                        {sec.title}
                      </div>
                    )}
                    {sec.items.map(item => {
                      const Icon = item.icon;
                      const isActive = location.pathname === item.path ||
                        (item.path === '/doctor' && location.pathname.startsWith('/doctor'));
                      if (item.isModal === 'newPatient') {
                        return (
                          <button
                            key={item.label}
                            onClick={() => {
                              setMobileMenuOpen(false);
                              onOpenNewPatient?.();
                            }}
                            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 cursor-pointer text-left transition-all"
                          >
                            <Icon className="w-4 h-4 text-teal-400" />
                            <span>{item.label}</span>
                          </button>
                        );
                      }
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                            isActive
                              ? 'bg-teal-600 text-white font-extrabold shadow-sm'
                              : 'text-slate-300 hover:text-white hover:bg-slate-800/80 font-medium'
                          }`}
                        >
                          <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </nav>

              {/* User Profile in Mobile Drawer */}
              <div className="p-4 border-t border-slate-800 bg-slate-950/90">
                <div className="flex items-center gap-2.5">
                  <div
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setShowProfileModal(true);
                    }}
                    className="w-8 h-8 rounded-xl bg-teal-900 border border-teal-500/50 flex items-center justify-center text-teal-200 font-extrabold text-xs cursor-pointer"
                  >
                    {user?.fullName.charAt(0)}
                  </div>
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setShowProfileModal(true);
                    }}
                  >
                    <p className="text-xs font-bold text-white truncate">{user?.fullName}</p>
                    <div className="mt-0.5">{roleBadge}</div>
                  </div>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setShowProfileModal(true);
                    }}
                    title="My Profile"
                    className="p-1.5 text-slate-300 hover:text-teal-300 hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <User className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setShowChangePasswordModal(true);
                    }}
                    title="Change Password"
                    className="p-1.5 text-slate-300 hover:text-amber-300 hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4" />
                  </button>
                  <button
                    onClick={logout}
                    title="Sign Out"
                    className="p-1.5 text-slate-300 hover:text-rose-400 hover:bg-slate-800 rounded-lg cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Child Pages Container (Mobile-first padding with bottom spacing for mobile bar) */}
        <main className="flex-1 p-3 sm:p-5 lg:p-8 max-w-7xl mx-auto w-full min-w-0 pb-24 lg:pb-8 touch-scroll">{children}</main>

        {/* Ergonomic Mobile Bottom Navigation Bar (< lg) */}
        <nav
          aria-label="Mobile Bottom Navigation"
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-1 py-1 flex items-center justify-around shadow-lg pb-safe"
        >
          {mobileBottomTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = tab.path.includes('?')
              ? location.pathname + location.search === tab.path
              : location.pathname === tab.path;

            if (tab.isDrawerTrigger) {
              return (
                <button
                  key="more-menu-btn"
                  onClick={() => setMobileMenuOpen(true)}
                  className="flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-slate-500 hover:text-slate-900 transition-colors cursor-pointer min-w-[54px] active:scale-95"
                >
                  <Menu className="w-5 h-5 text-slate-600" />
                  <span className="text-[10px] font-bold mt-0.5 text-slate-600">Menu</span>
                </button>
              );
            }

            return (
              <Link
                key={tab.path}
                to={tab.path}
                className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer min-w-[54px] active:scale-95 ${
                  isActive ? 'text-teal-700 font-extrabold' : 'text-slate-500 hover:text-slate-900 font-semibold'
                }`}
              >
                <div className={`p-1 rounded-xl transition-colors ${isActive ? 'bg-teal-50 text-teal-600' : ''}`}>
                  <Icon className={`w-5 h-5 ${isActive ? 'text-teal-600' : 'text-slate-500'}`} />
                </div>
                <span className={`text-[10px] leading-tight mt-0.5 ${isActive ? 'font-extrabold text-teal-950' : 'font-semibold text-slate-600'}`}>
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>


      {/* MY PROFILE MODAL */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 text-slate-900 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-teal-600 text-white flex items-center justify-center font-black text-base shadow-xs">
                  {user?.fullName?.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">{user?.fullName}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    {roleBadge}
                    {user?.employeeId && (
                      <span className="text-[11px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                        {user.employeeId}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowProfileModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              {/* Account Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                <div>
                  <span className="text-slate-500 font-bold block uppercase text-[10px] tracking-wider">Email Address</span>
                  <span className="font-bold text-slate-900 font-mono text-xs">{user?.email}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block uppercase text-[10px] tracking-wider">Phone Number</span>
                  <span className="font-bold text-slate-900 font-mono text-xs">{user?.phone || 'Not recorded'}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block uppercase text-[10px] tracking-wider">Designation</span>
                  <span className="font-bold text-slate-900 text-xs">{user?.designation || user?.role?.replace('_', ' ')}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block uppercase text-[10px] tracking-wider">Department</span>
                  <span className="font-bold text-slate-900 text-xs">{user?.department || 'General Clinic'}</span>
                </div>
              </div>

              {/* Clinic Branch */}
              <div className="p-3 bg-teal-50/60 border border-teal-200 rounded-2xl">
                <div className="flex items-center gap-2 text-teal-900 font-extrabold text-xs">
                  <Building2 className="w-4 h-4 text-teal-700" />
                  <span>{clinicName} — {clinicCity}</span>
                </div>
                <p className="text-[11px] text-teal-800 mt-0.5">{clinicAddress} • {user?.clinic?.chairCount || 3} Operatory Surgical Units</p>
              </div>

              {/* Assigned Permissions */}
              <div>
                <span className="text-slate-700 font-extrabold block uppercase text-[11px] tracking-wider mb-2">
                  Active Permissions & Access Grants ({user?.role === 'CLINIC_ADMIN' ? 'All System Access' : `${user?.permissions?.length || 0} permissions`})
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  {user?.role === 'CLINIC_ADMIN' ? (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
                      ★ Full Super-Admin & Doctor Access
                    </span>
                  ) : (
                    (user?.permissions || []).map((perm: string) => (
                      <span
                        key={perm}
                        className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-white text-teal-900 border border-slate-300"
                      >
                        {perm}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileModal(false);
                    setShowChangePasswordModal(true);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl flex items-center gap-1.5 cursor-pointer border border-slate-300 transition-colors"
                >
                  <KeyRound className="w-4 h-4 text-amber-600" />
                  <span>Change Password</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white font-extrabold rounded-xl cursor-pointer shadow-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CHANGE PASSWORD MODAL (Solid Crisp White Modal) */}
      {showChangePasswordModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 text-slate-900 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Change Account Password</h3>
                  <p className="text-xs text-slate-500 font-medium">Update with your current old password</p>
                </div>
              </div>
              <button
                onClick={() => setShowChangePasswordModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-100 cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            {changePassError && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{changePassError}</span>
              </div>
            )}

            {changePassSuccess && (
              <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{changePassSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword} className="mt-4 space-y-3.5 text-xs">
              {/* Current Password */}
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Current Password (Old Password) *
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Enter your current password"
                    className="w-full p-2.5 pr-10 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 font-mono font-medium focus:outline-hidden focus:border-teal-600 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  New Password (Min 6 Characters) *
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Enter strong new password"
                    className="w-full p-2.5 pr-10 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 font-mono font-medium focus:outline-hidden focus:border-teal-600 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Confirm New Password *
                </label>
                <input
                  type={showNewPass ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 font-mono font-medium focus:outline-hidden focus:border-teal-600 focus:bg-white"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowChangePasswordModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changingPass}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold cursor-pointer disabled:opacity-50 shadow-md"
                >
                  {changingPass ? 'Updating Password...' : 'Save New Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};