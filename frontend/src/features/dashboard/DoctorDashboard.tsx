import { CalendarClock, CalendarDays, Info } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { Card, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { listRecentAppointments } from '../appointments/recentAppointments';
import { RecentAppointmentsList } from '../appointments/components/RecentAppointmentsList';
import { QuickLookupForm } from '../appointments/components/QuickLookupForm';

export function DoctorDashboard() {
  const { user } = useAuth();
  const entries = listRecentAppointments();

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
          <EmptyState
            icon={CalendarDays}
            title="Not available yet"
            description="Listing today's assigned appointments requires a backend endpoint that does not exist yet (e.g. GET /appointments?doctorId=...). Use lookup by ID below in the meantime."
          />
        </Card>
        <Card>
          <CardHeader title="Upcoming appointments" />
          <EmptyState
            icon={CalendarClock}
            title="Not available yet"
            description="This panel is ready to display upcoming assigned appointments once a list endpoint is added to the backend."
          />
        </Card>
      </div>

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
