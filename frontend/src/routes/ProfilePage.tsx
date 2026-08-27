import { useMemo } from 'react';
import { UserCircle } from 'lucide-react';
import { useAuth } from '../features/auth/useAuth';
import { authStorage } from '../lib/authStorage';
import { decodeJwt } from '../features/auth/jwt';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { formatDateTime } from '../lib/dateTime';

const roleLabel = { PATIENT: 'Patient', DOCTOR: 'Doctor', ADMIN: 'Admin' } as const;

export function ProfilePage() {
  const { user } = useAuth();

  const sessionExpiresAt = useMemo(() => {
    const token = authStorage.getToken();
    const claims = token ? decodeJwt(token) : null;
    return claims ? new Date(claims.exp * 1000).toISOString() : null;
  }, []);

  if (!user) return null;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <UserCircle className="h-5 w-5 text-slate-400" aria-hidden="true" />
            Profile
          </span>
        }
      />
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">User ID</dt>
          <dd className="mt-1 font-mono text-sm text-slate-800">{user.userId}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Role</dt>
          <dd className="mt-1">
            <Badge>{roleLabel[user.role]}</Badge>
          </dd>
        </div>
        {user.patientId && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Patient ID</dt>
            <dd className="mt-1 font-mono text-sm text-slate-800">{user.patientId}</dd>
          </div>
        )}
        {user.doctorId && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Doctor ID</dt>
            <dd className="mt-1 font-mono text-sm text-slate-800">{user.doctorId}</dd>
          </div>
        )}
        {sessionExpiresAt && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Session expires</dt>
            <dd className="mt-1 text-sm text-slate-800">{formatDateTime(sessionExpiresAt)}</dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
