import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { LoginPage } from '../features/auth/LoginPage';
import { ProtectedRoute } from './ProtectedRoute';
import { RoleRoute } from './RoleRoute';
import { DashboardRedirect } from '../features/dashboard/DashboardRedirect';
import { PatientDashboard } from '../features/dashboard/PatientDashboard';
import { DoctorDashboard } from '../features/dashboard/DoctorDashboard';
import { AdminDashboard } from '../features/dashboard/AdminDashboard';
import { BookingPage } from '../features/appointments/BookingPage';
import { AppointmentDetailPage } from '../features/appointments/AppointmentDetailPage';
import { AppointmentLookupPage } from '../features/appointments/AppointmentLookupPage';
import { ProfilePage } from './ProfilePage';
import { UnauthorizedPage } from './UnauthorizedPage';
import { NotFoundPage } from './NotFoundPage';
import { SchedulePage } from '../features/schedule/SchedulePage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardRedirect />} />

          <Route element={<RoleRoute allow={['PATIENT']} />}>
            <Route path="/dashboard/patient" element={<PatientDashboard />} />
          </Route>
          <Route element={<RoleRoute allow={['DOCTOR']} />}>
            <Route path="/dashboard/doctor" element={<DoctorDashboard />} />
          </Route>
          <Route element={<RoleRoute allow={['ADMIN']} />}>
            <Route path="/dashboard/admin" element={<AdminDashboard />} />
          </Route>

          <Route element={<RoleRoute allow={['PATIENT', 'ADMIN']} />}>
            <Route path="/appointments/new" element={<BookingPage />} />
          </Route>
          <Route element={<RoleRoute allow={['DOCTOR', 'ADMIN']} />}>
            <Route path="/schedule" element={<SchedulePage />} />
          </Route>
          <Route path="/appointments/lookup" element={<AppointmentLookupPage />} />
          <Route path="/appointments/:id" element={<AppointmentDetailPage />} />

          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
