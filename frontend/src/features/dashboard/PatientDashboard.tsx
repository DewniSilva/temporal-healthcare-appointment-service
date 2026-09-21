import { Link } from 'react-router-dom';
import { CalendarPlus } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { Card, CardHeader } from '../../components/ui/Card';
import { QuickLookupForm } from '../appointments/components/QuickLookupForm';
import { useAppointmentList } from '../appointments/hooks/useAppointmentList';
import { AppointmentWorklist } from '../appointments/components/AppointmentWorklist';

const bookLinkClasses = [
  'inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5',
  'text-sm font-semibold text-white hover:bg-primary-700',
  'focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-primary-500 focus-visible:ring-offset-2'
].join(' ');

export function PatientDashboard() {
  const { user } = useAuth();
  const upcoming = useAppointmentList({ view: 'upcoming', limit: 20, sort: 'appointmentTime:asc' });
  const history = useAppointmentList({ view: 'past', limit: 20, sort: 'appointmentTime:desc' });

  return (
    <div className="space-y-6">
      <Card className="bg-primary-700 text-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Welcome back</h2>
            <p className="mt-1 text-sm text-primary-50">
              Patient ID: <span className="font-mono">{user?.patientId}</span>
            </p>
          </div>
          <Link to="/appointments/new" className={bookLinkClasses}>
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            Book an appointment
          </Link>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Upcoming appointments" />
          <AppointmentWorklist appointments={upcoming.data?.items ?? []} isLoading={upcoming.isLoading} isError={upcoming.isError} counterpart="doctor" emptyTitle="No upcoming appointments" emptyDescription="Appointments you book will appear here." />
        </Card>
        <Card>
          <CardHeader title="Appointment history" />
          <AppointmentWorklist appointments={history.data?.items ?? []} isLoading={history.isLoading} isError={history.isError} counterpart="doctor" emptyTitle="No appointment history" emptyDescription="Past appointments will appear here." />
        </Card>
      </div>

      <Card>
        <CardHeader title="Find an appointment" description="Look up any appointment by its ID." />
        <QuickLookupForm />
      </Card>

    </div>
  );
}
