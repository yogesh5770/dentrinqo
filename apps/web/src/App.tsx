import React, { useState, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { TenantProvider } from './hooks/useTenant';
import { AppShell } from './layouts/AppShell';
import { LoginScreen } from './features/auth/LoginScreen';
import { DashboardRouter } from './features/dashboard/DashboardRouter';
import { ErrorBoundary } from './components/ErrorBoundary';

// Public Views (Eagerly available for immediate patient arrival response)
import { PublicBookingView } from './features/public/PublicBookingView';
import { PublicCheckInView } from './features/public/PublicCheckInView';
import { PublicTrackView } from './features/public/PublicTrackView';
import { NewPatientModal } from './features/patients/NewPatientModal';
import { BookingDrawer } from './features/appointments/BookingDrawer';
import { triggerClinicSync } from './lib/sync';
import { PatientAuthProvider, usePatientAuth } from './hooks/usePatientAuth';
import { ClinicLogo, TenantDocumentBranding } from './components/ClinicLogo';

// Asynchronous Route-Level Code Splitting (Reduces initial mobile bundle by ~85%)
const PatientList = lazy(() => import('./features/patients/PatientList').then(m => ({ default: m.PatientList })));
const PatientDetail = lazy(() => import('./features/patients/PatientDetail').then(m => ({ default: m.PatientDetail })));
const AppointmentCalendar = lazy(() => import('./features/appointments/AppointmentCalendar').then(m => ({ default: m.AppointmentCalendar })));
const DoctorDesk = lazy(() => import('./features/consultations/DoctorDesk').then(m => ({ default: m.DoctorDesk })));
const BillingDesk = lazy(() => import('./features/billing/BillingDesk').then(m => ({ default: m.BillingDesk })));
const AdminDesk = lazy(() => import('./features/admin/AdminDesk').then(m => ({ default: m.AdminDesk })));
const ReportsView = lazy(() => import('./features/reports/ReportsView').then(m => ({ default: m.ReportsView })));
const FollowUpsView = lazy(() => import('./features/follow-ups/FollowUpsView').then(m => ({ default: m.FollowUpsView })));
const ClinicSettingsView = lazy(() => import('./features/settings/ClinicSettingsView').then(m => ({ default: m.ClinicSettingsView })));
const AuditLogsView = lazy(() => import('./features/admin/AuditLogsView').then(m => ({ default: m.AuditLogsView })));
const LabOrdersManager = lazy(() => import('./features/lab-orders/LabOrdersManager').then(m => ({ default: m.LabOrdersManager })));
const PossibleDuplicatesView = lazy(() => import('./features/patients/PossibleDuplicatesView').then(m => ({ default: m.PossibleDuplicatesView })));
const WaitingRoomTvView = lazy(() => import('./features/public/WaitingRoomTvView').then(m => ({ default: m.WaitingRoomTvView })));
const PatientSignupView = lazy(() => import('./features/patient-portal/PatientSignupView').then(m => ({ default: m.PatientSignupView })));
const PatientLoginView = lazy(() => import('./features/patient-portal/PatientLoginView').then(m => ({ default: m.PatientLoginView })));
const MyVisitsView = lazy(() => import('./features/patient-portal/MyVisitsView').then(m => ({ default: m.MyVisitsView })));
const MyFamilyView = lazy(() => import('./features/patient-portal/MyFamilyView').then(m => ({ default: m.MyFamilyView })));

const ViewLoadingFallback: React.FC = () => (
  <div className="min-h-[380px] flex flex-col items-center justify-center p-8 text-teal-600">
    <div className="w-10 h-10 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mb-3" />
    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Loading View...</span>
  </div>
);
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
      <ErrorBoundary fallbackTitle="Workspace Desk Error">
        <Suspense fallback={<ViewLoadingFallback />}>
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
      </Suspense>
      </ErrorBoundary>

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
            <Suspense fallback={<ViewLoadingFallback />}>
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
            </Suspense>
          </PatientAuthProvider>
        </TenantProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;