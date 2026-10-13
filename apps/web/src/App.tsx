import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { TenantProvider } from './hooks/useTenant';
import { AppShell } from './layouts/AppShell';
import { LoginScreen } from './features/auth/LoginScreen';
import { DashboardRouter } from './features/dashboard/DashboardRouter';
import { PatientList } from './features/patients/PatientList';
import { PatientDetail } from './features/patients/PatientDetail';
import { AppointmentCalendar } from './features/appointments/AppointmentCalendar';
import { DoctorDesk } from './features/consultations/DoctorDesk';
import { BillingDesk } from './features/billing/BillingDesk';
import { AdminDesk } from './features/admin/AdminDesk';
import { ReportsView } from './features/reports/ReportsView';
import { FollowUpsView } from './features/follow-ups/FollowUpsView';
import { ClinicSettingsView } from './features/settings/ClinicSettingsView';
import { AuditLogsView } from './features/admin/AuditLogsView';
import { LabOrdersManager } from './features/lab-orders/LabOrdersManager';
import { PublicBookingView } from './features/public/PublicBookingView';
import { PublicCheckInView } from './features/public/PublicCheckInView';
import { PublicTrackView } from './features/public/PublicTrackView';
import { WaitingRoomTvView } from './features/public/WaitingRoomTvView';
import { NewPatientModal } from './features/patients/NewPatientModal';
import { BookingDrawer } from './features/appointments/BookingDrawer';
import { triggerClinicSync } from './lib/sync';
import { PatientAuthProvider, usePatientAuth } from './hooks/usePatientAuth';
import { PatientSignupView } from './features/patient-portal/PatientSignupView';
import { PatientLoginView } from './features/patient-portal/PatientLoginView';
import { MyVisitsView } from './features/patient-portal/MyVisitsView';
import { MyFamilyView } from './features/patient-portal/MyFamilyView';
import { PossibleDuplicatesView } from './features/patients/PossibleDuplicatesView';

import { ClinicLogo, TenantDocumentBranding } from './components/ClinicLogo';
const ProtectedRoutes: React.FC = () => {
  const { user, isLoading, hasPermission } = useAuth();
  const { account, isLoading: isPatientLoading } = usePatientAuth();
  const [newPatientOpen, setNewPatientOpen] = useState(false);
  const [newPatientInitialMode, setNewPatientInitialMode] = useState<'STANDARD' | 'LEGACY_ARCHIVE'>('STANDARD');
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingPatient, setBookingPatient] = useState<any | null>(null);

  const handleOpenNewPatient = (mode: 'STANDARD' | 'LEGACY_ARCHIVE' = 'STANDARD') => {
    setNewPatientInitialMode(mode);
    setNewPatientOpen(true);
  };

  if (isLoading || isPatientLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-teal-600">
        <div className="w-16 h-16 p-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center justify-center mb-4">
          <ClinicLogo className="w-full h-full object-contain animate-pulse" />
        </div>
        <p className="text-sm font-bold text-slate-700">Loading Clinic Portal...</p>
      </div>
    );
  }

  // If patient is logged in, automatically take them to Patient Portal!
  if (!user && account) {
    return <Navigate to="/my/visits" replace />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const handleOpenBookingWithPatient = (patient: any) => {
    setBookingPatient(patient);
    setBookingOpen(true);
  };

  const canAccessClinical = user.role === 'CLINIC_ADMIN' || user.role === 'DENTIST' || hasPermission('clinical.consultations.view');
  const canAccessAppointments = user.role === 'CLINIC_ADMIN' || user.role === 'RECEPTIONIST' || user.role === 'DENTIST' || hasPermission('appointments.view');
  const canAccessPatients = user.role === 'CLINIC_ADMIN' || user.role === 'RECEPTIONIST' || user.role === 'DENTIST' || hasPermission('patients.view');
  const canAccessBilling = user.role === 'CLINIC_ADMIN' || user.role === 'ACCOUNTANT' || user.role === 'RECEPTIONIST' || hasPermission('billing.invoices.view');
  const canAccessReports = user.role === 'CLINIC_ADMIN' || user.role === 'ACCOUNTANT' || hasPermission('reports.financial.view');
  const canAccessFollowUps = user.role === 'CLINIC_ADMIN' || user.role === 'RECEPTIONIST' || user.role === 'DENTIST' || hasPermission('followups.view');
  const canAccessLab = user.role === 'CLINIC_ADMIN' || user.role === 'DENTIST' || user.role === 'RECEPTIONIST' || hasPermission('lab.orders.view');
  const canAccessAdmin = user.role === 'CLINIC_ADMIN' || hasPermission('staff.manage');

  return (
    <AppShell
      onOpenNewPatient={() => handleOpenNewPatient('STANDARD')}
      onOpenBooking={() => {
        setBookingPatient(null);
        setBookingOpen(true);
      }}
    >
      <Routes>
        {/* Dynamic Role-Based Dashboard */}
        <Route
          path="/"
          element={
            <DashboardRouter
              onOpenNewPatient={() => handleOpenNewPatient('STANDARD')}
              onOpenBooking={() => {
                setBookingPatient(null);
                setBookingOpen(true);
              }}
            />
          }
        />

        {/* Patients Management */}
        <Route
          path="/patients"
          element={canAccessPatients ? <PatientList onOpenNewPatient={handleOpenNewPatient} /> : <Navigate to="/" replace />}
        />
        <Route
          path="/patients/:id"
          element={canAccessPatients ? <PatientDetail onOpenBookingForPatient={handleOpenBookingWithPatient} /> : <Navigate to="/" replace />}
        />

        {/* Appointments Calendar */}
        <Route
          path="/appointments"
          element={
            canAccessAppointments ? (
              <AppointmentCalendar
                onOpenBooking={() => {
                  setBookingPatient(null);
                  setBookingOpen(true);
                }}
              />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />

        {/* Clinical Workspace Routes */}
        <Route
          path="/doctor"
          element={canAccessClinical ? <DoctorDesk /> : <Navigate to="/" replace />}
        />
        <Route
          path="/consultations"
          element={canAccessClinical ? <DoctorDesk defaultTab="examination" /> : <Navigate to="/" replace />}
        />
        <Route
          path="/dental-chart"
          element={<Navigate to="/doctor" replace />}
        />
        <Route
          path="/treatment-plans"
          element={canAccessClinical ? <DoctorDesk defaultTab="treatmentPlans" /> : <Navigate to="/" replace />}
        />
        <Route
          path="/prescriptions"
          element={canAccessClinical ? <DoctorDesk defaultTab="prescriptions" /> : <Navigate to="/" replace />}
        />
        <Route
          path="/xrays"
          element={canAccessClinical ? <DoctorDesk defaultTab="imaging" /> : <Navigate to="/" replace />}
        />

        {/* Billing & Accounting */}
        <Route
          path="/billing"
          element={canAccessBilling ? <BillingDesk /> : <Navigate to="/" replace />}
        />

        {/* Financial & Analytics Reports */}
        <Route
          path="/reports"
          element={canAccessReports ? <ReportsView /> : <Navigate to="/" replace />}
        />

        {/* Patient Recalls & Follow-ups */}
        <Route
          path="/follow-ups"
          element={
            canAccessFollowUps ? (
              <FollowUpsView
                onOpenBooking={() => {
                  setBookingPatient(null);
                  setBookingOpen(true);
                }}
              />
            ) : (
              <Navigate to="/" replace />
            )
          }
        />


        {/* Dental Lab Work Orders Pipeline */}
        <Route
          path="/lab-orders"
          element={canAccessLab ? <LabOrdersManager onOpenBookingForPatient={handleOpenBookingWithPatient} /> : <Navigate to="/" replace />}
        />

        {/* Hospital Configuration & Settings */}
        <Route
          path="/settings"
          element={canAccessAdmin ? <ClinicSettingsView /> : <Navigate to="/" replace />}
        />

        {/* Security & Activity Audit Trail */}
        <Route
          path="/audit-logs"
          element={canAccessAdmin ? <AuditLogsView /> : <Navigate to="/" replace />}
        />

        {/* Staff Administration & Catalog */}
        <Route
          path="/admin"
          element={canAccessAdmin ? <AdminDesk /> : <Navigate to="/" replace />}
        />

        {/* Duplicate Patient Review & Merge Engine */}
        <Route
          path="/admin/duplicates"
          element={canAccessPatients ? <PossibleDuplicatesView /> : <Navigate to="/" replace />}
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Global Modals accessible from any screen */}
      <NewPatientModal
        isOpen={newPatientOpen}
        initialMode={newPatientInitialMode}
        onClose={() => setNewPatientOpen(false)}
        onPatientCreated={() => {
          triggerClinicSync('patient_created');
        }}
        onOpenBookingForPatient={(patient) => {
          handleOpenBookingWithPatient(patient);
        }}
      />

      <BookingDrawer
        isOpen={bookingOpen}
        onClose={() => setBookingOpen(false)}
        preSelectedPatient={bookingPatient}
        onBookingSuccess={() => {
          triggerClinicSync('appointment_booked');
        }}
      />
    </AppShell>
  );
};

const LoginGate: React.FC = () => {
  const { user } = useAuth();
  const { account } = usePatientAuth();

  if (user) {
    return <Navigate to="/" replace />;
  }
  if (account) {
    return <Navigate to="/my/visits" replace />;
  }
  return <LoginScreen />;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <TenantProvider>
          <TenantDocumentBranding />
          <PatientAuthProvider>
            <Routes>
              <Route path="/book" element={<PublicBookingView />} />
              <Route path="/checkin" element={<PublicCheckInView />} />
              <Route path="/check-in" element={<PublicCheckInView />} />
              <Route path="/walkin" element={<PublicCheckInView defaultWalkIn={true} />} />
              <Route path="/walk-in" element={<PublicCheckInView defaultWalkIn={true} />} />
              <Route path="/track/:code" element={<PublicTrackView />} />
              <Route path="/tv" element={<WaitingRoomTvView />} />
              <Route path="/queue-tv" element={<WaitingRoomTvView />} />
              <Route path="/signup" element={<PatientSignupView />} />
              <Route path="/patient-login" element={<PatientLoginView />} />
              <Route path="/my/visits" element={<MyVisitsView />} />
              <Route path="/my/family" element={<MyFamilyView />} />
              <Route path="/login" element={<LoginGate />} />
              <Route path="/*" element={<ProtectedRoutes />} />
            </Routes>
          </PatientAuthProvider>
        </TenantProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;