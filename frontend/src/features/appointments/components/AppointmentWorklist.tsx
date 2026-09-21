import { AlertTriangle, CalendarDays, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { formatDateTime } from '../../../lib/dateTime';
import type { AppointmentListItem } from '../../../types/api';
import { DbStatusBadge } from './StatusBadge';

interface AppointmentWorklistProps {
  appointments: AppointmentListItem[];
  isLoading?: boolean;
  isError?: boolean;
  counterpart: 'patient' | 'doctor';
  emptyTitle: string;
  emptyDescription: string;
  actions?: (appointment: AppointmentListItem) => ReactNode;
}

export function AppointmentWorklist({
  appointments, isLoading, isError, counterpart, emptyTitle, emptyDescription, actions
}: AppointmentWorklistProps) {
  if (isLoading) {
    return <div className="space-y-3">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-16 w-full" />)}</div>;
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        Appointments could not be loaded. Please try again.
      </div>
    );
  }

  if (appointments.length === 0) {
    return <EmptyState icon={CalendarDays} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {appointments.map((appointment) => {
        const person = counterpart === 'patient' ? appointment.patient : appointment.doctor;
        return (
          <li key={appointment.id}>
            <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <Link to={`/appointments/${appointment.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{formatDateTime(appointment.appointmentTime)}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {counterpart === 'patient' ? 'Patient' : 'Doctor'}: {person.displayName}
                  </p>
                  {appointment.actionRequired && <p className="mt-1 text-xs font-medium text-amber-700">Action required</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <DbStatusBadge status={appointment.status} />
                  <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                </div>
              </Link>
              {actions?.(appointment)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
