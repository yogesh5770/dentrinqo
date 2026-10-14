import React, { Suspense, lazy } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const AdminDashboard = lazy(() => import('./AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const ReceptionDashboard = lazy(() => import('./ReceptionDashboard').then(m => ({ default: m.ReceptionDashboard })));
const DentistDashboard = lazy(() => import('./DentistDashboard').then(m => ({ default: m.DentistDashboard })));
const AccountantDashboard = lazy(() => import('./AccountantDashboard').then(m => ({ default: m.AccountantDashboard })));
const OtherStaffDashboard = lazy(() => import('./OtherStaffDashboard').then(m => ({ default: m.OtherStaffDashboard })));

const DashboardLoadingFallback: React.FC = () => (
  <div className="min-h-[380px] flex flex-col items-center justify-center p-8 text-teal-600">
    <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mb-3" />
    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Loading Dashboard...</span>
  </div>
);

interface DashboardRouterProps {
  onOpenNewPatient: () => void;
  onOpenBooking: () => void;
}

export const DashboardRouter: React.FC<DashboardRouterProps> = ({
  onOpenNewPatient,
  onOpenBooking,
}) => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return null;

  const params = new URLSearchParams(location.search);
  const viewParam = params.get('view');
  const renderDashboard = () => {
    if (viewParam === 'reception' || viewParam === 'queue' || user.role === 'RECEPTIONIST') {
      return (
        <ReceptionDashboard
          onOpenNewPatient={onOpenNewPatient}
          onOpenBooking={onOpenBooking}
        />
      );
    }

    switch (user.role) {
      case 'CLINIC_ADMIN':
        return (
          <AdminDashboard
            onOpenNewPatient={onOpenNewPatient}
            onOpenBooking={onOpenBooking}
          />
        );
      case 'DENTIST':
        return <DentistDashboard />;
      case 'ACCOUNTANT':
        return <AccountantDashboard />;
      case 'OTHER_STAFF':
        return (
          <OtherStaffDashboard
            onOpenNewPatient={onOpenNewPatient}
            onOpenBooking={onOpenBooking}
          />
        );
      default:
        return (
          <ReceptionDashboard
            onOpenNewPatient={onOpenNewPatient}
            onOpenBooking={onOpenBooking}
          />
        );
    }
  };

  return (
    <Suspense fallback={<DashboardLoadingFallback />}>
      {renderDashboard()}
    </Suspense>
  );
};

