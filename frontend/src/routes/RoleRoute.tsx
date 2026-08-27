import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../features/auth/useAuth';
import type { UserRole } from '../types/api';

/**
 * Frontend role gating is a UX convenience only; the backend re-checks every
 * object action and remains the authority (see assertCan* in the API).
 */
export function RoleRoute({ allow }: { allow: UserRole[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!allow.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  return <Outlet />;
}
