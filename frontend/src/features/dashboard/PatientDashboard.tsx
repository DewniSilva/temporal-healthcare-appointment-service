import { Link } from 'react-router-dom';
import { CalendarPlus } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { Card, CardHeader } from '../../components/ui/Card';
import { listRecentAppointments } from '../appointments/recentAppointments';
import { useRecentAppointmentsData } from '../appointments/hooks/useRecentAppointmentsData';
import { RecentAppointmentsList } from '../appointments/components/RecentAppointmentsList';
import { StatusSummaryCards, STATUS_SUMMARY_MIN_ENTRIES } from '../appointments/components/StatusSummaryCards';
import { QuickLookupForm } from '../appointments/components/QuickLookupForm';

const bookLinkClasses = [
  'inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5',
  'text-sm font-semibold text-white hover:bg-primary-700',
  'focus-visible:outline-none focus-visible:ring-2',
  'focus-visible:ring-primary-500 focus-visible:ring-offset-2'
].join(' ');

export function PatientDashboard() {
  const { user } = useAuth();
  const entries = listRecentAppointments();
  const { appointments } = useRecentAppointmentsData(entries);

  return (
    <div className="space-y-6">
      <Card className="bg-primary-600 text-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Welcome back</h2>
            <p className="mt-1 text-sm text-primary-100">
              Patient ID: <span className="font-mono">{user?.patientId}</span>
            </p>
          </div>
          <Link to="/appointments/new" className={bookLinkClasses}>
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />
            Book an appointment
          </Link>
        </div>
      </Card>

      {appointments.length >= STATUS_SUMMARY_MIN_ENTRIES && (
        <Card>
          <CardHeader title="Your appointment status summary" />
          <StatusSummaryCards appointments={appointments} />
        </Card>
      )}

      <Card>
        <CardHeader title="Find an appointment" description="Look up any appointment by its ID." />
        <QuickLookupForm />
      </Card>

      <Card>
        <CardHeader
          title="Recent appointments on this device"
          description="Appointments you have booked or viewed in this browser."
        />
        <RecentAppointmentsList
          entries={entries}
          emptyDescription="Appointments you book or open will show up here for quick access."
        />
      </Card>
    </div>
  );
}
