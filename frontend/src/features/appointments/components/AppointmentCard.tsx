import { Link } from 'react-router-dom';
import { AlertTriangle, Calendar, ChevronRight } from 'lucide-react';
import { useAppointmentQuery } from '../hooks/useAppointmentQuery';
import { DbStatusBadge } from './StatusBadge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { formatDateTime } from '../../../lib/dateTime';
import { describeError } from '../../../lib/apiError';

export function AppointmentCard({ appointmentId }: { appointmentId: string }) {
  const { data, isLoading, isError, error } = useAppointmentQuery(appointmentId);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 p-4">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-2 h-3 w-1/3" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 p-4 text-sm text-slate-500">
        <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
        <span>
          {appointmentId}: {describeError(error)}
        </span>
      </div>
    );
  }

  return (
    <Link
      to={`/appointments/${data.id}`}
      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-4 transition-colors hover:border-primary-300 hover:bg-primary-50/40"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{data.id}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
          {formatDateTime(data.appointmentTime)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <DbStatusBadge status={data.status} />
        <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
      </div>
    </Link>
  );
}
