import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { AdminDashboard } from './AdminDashboard';
import { ReceptionDashboard } from './ReceptionDashboard';
import { DentistDashboard } from './DentistDashboard';
import { AccountantDashboard } from './AccountantDashboard';
import { OtherStaffDashboard } from './OtherStaffDashboard';

interface DashboardRouterProps {
  onOpenNewPatient: () => void;
  onOpenBooking: () => void;
}

export const DashboardRouter: React.FC<DashboardRouterProps> = ({
  onOpenNewPatient,
  onOpenBooking,
}) => {
  const { user } = useAuth();

  if (!user) return null;

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
    case 'RECEPTIONIST':
    default:
      return (
        <ReceptionDashboard
          onOpenNewPatient={onOpenNewPatient}
          onOpenBooking={onOpenBooking}
        />
      );
  }
};
