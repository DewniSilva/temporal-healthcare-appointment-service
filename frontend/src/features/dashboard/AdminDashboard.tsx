import { Link } from 'react-router-dom';
import { CalendarPlus, ExternalLink, Info } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/Card';
import { HealthCard } from '../health/HealthCard';
import { listRecentAppointments } from '../appointments/recentAppointments';
import { useRecentAppointmentsData } from '../appointments/hooks/useRecentAppointmentsData';
import { RecentAppointmentsList } from '../appointments/components/RecentAppointmentsList';
import { StatusSummaryCards } from '../appointments/components/StatusSummaryCards';
import { QuickLookupForm } from '../appointments/components/QuickLookupForm';
import { env } from '../../lib/env';

export function AdminDashboard() {
  const entries = listRecentAppointments();
  const { appointments } = useRecentAppointmentsData(entries);

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Admin overview</h2>
            <p className="mt-1 text-sm text-slate-500">
              Broad demo access across patients, doctors, and appointments.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/appointments/new"
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
            >
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              Book an appointment
            </Link>
            {env.VITE_TEMPORAL_UI_URL && (
              <a
                href={env.VITE_TEMPORAL_UI_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Open Temporal UI
              </a>
            )}
          </div>
        </div>
      </Card>

      <HealthCard />

      <Card>
        <CardHeader
          title="Local appointment status counts"
          description="Not a global total — see note below."
        />
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span>
            The backend has no summary/list endpoint yet, so these counts only
            cover appointments this browser has booked or looked up — not
            every appointment in the system.
          </span>
        </div>
        <StatusSummaryCards appointments={appointments} />
      </Card>

      <Card>
        <CardHeader title="Find an appointment" description="Look up any appointment by its ID." />
        <QuickLookupForm />
      </Card>

      <Card>
        <CardHeader
          title="Recent appointments on this device"
          description="Appointments booked or opened in this browser."
        />
        <RecentAppointmentsList
          entries={entries}
          emptyDescription="Appointments you book or open will show up here for quick access."
        />
      </Card>
    </div>
  );
}
