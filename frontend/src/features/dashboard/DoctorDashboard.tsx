import { Info, TriangleAlert } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { Card, CardHeader } from '../../components/ui/Card';
import { listRecentAppointments } from '../appointments/recentAppointments';
import { RecentAppointmentsList } from '../appointments/components/RecentAppointmentsList';
import { QuickLookupForm } from '../appointments/components/QuickLookupForm';
import { AppointmentWorklist } from '../appointments/components/AppointmentWorklist';
import { useAppointmentList } from '../appointments/hooks/useAppointmentList';

export function DoctorDashboard() {
  const { user } = useAuth();
  const entries = listRecentAppointments();
  const today = useAppointmentList({ view: 'today', limit: 20, sort: 'appointmentTime:asc' });
  const upcoming = useAppointmentList({ view: 'upcoming', limit: 20, sort: 'appointmentTime:asc' });
  const attention = useAppointmentList({ view: 'action-required', limit: 20, sort: 'appointmentTime:asc' });

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold text-slate-900">Welcome back</h2>
        <p className="mt-1 text-sm text-slate-500">
          Doctor ID: <span className="font-mono">{user?.doctorId}</span>. This
          view is read-only — confirming or cancelling an appointment is a
          patient or admin action.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Today's appointments" />
          <AppointmentWorklist appointments={today.data?.items ?? []} isLoading={today.isLoading} isError={today.isError} counterpart="patient" emptyTitle="No appointments today" emptyDescription="Your assigned appointments for today will appear here." />
        </Card>
        <Card>
          <CardHeader title="Upcoming appointments" />
          <AppointmentWorklist appointments={upcoming.data?.items ?? []} isLoading={upcoming.isLoading} isError={upcoming.isError} counterpart="patient" emptyTitle="No upcoming appointments" emptyDescription="Your next assigned appointments will appear here." />
        </Card>
      </div>

      <Card>
        <CardHeader title="Requires attention" description="Overdue confirmed appointments or appointments with a failed reminder." action={<TriangleAlert className="h-5 w-5 text-amber-500" aria-hidden="true" />} />
        <AppointmentWorklist appointments={attention.data?.items ?? []} isLoading={attention.isLoading} isError={attention.isError} counterpart="patient" emptyTitle="Nothing requires attention" emptyDescription="This worklist is clear." />
      </Card>

      <Card>
        <CardHeader title="Find an appointment" description="Look up any assigned appointment by its ID." />
        <QuickLookupForm />
      </Card>

      <Card>
        <CardHeader
          title="Recent appointments on this device"
          description="Appointments you have opened in this browser."
        />
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span>
            This is not the full list of your assigned appointments — only
            ones you have looked up here.
          </span>
        </div>
        <RecentAppointmentsList
          entries={entries}
          emptyDescription="Appointments you open by ID will show up here for quick access."
        />
      </Card>
    </div>
  );
}
