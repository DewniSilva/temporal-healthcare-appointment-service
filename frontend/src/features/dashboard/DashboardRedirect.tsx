import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

const dashboardByRole = {
  PATIENT: '/dashboard/patient',
  DOCTOR: '/dashboard/doctor',
  ADMIN: '/dashboard/admin'
} as const;

/** Sends an authenticated user from the generic /dashboard entry to their role's dashboard. */
export function DashboardRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={dashboardByRole[user.role]} replace />;
}
