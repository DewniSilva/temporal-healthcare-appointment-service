import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, ExternalLink, TriangleAlert } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { HealthCard } from '../health/HealthCard';
import { QuickLookupForm } from '../appointments/components/QuickLookupForm';
import { AppointmentWorklist } from '../appointments/components/AppointmentWorklist';
import { useAppointmentList } from '../appointments/hooks/useAppointmentList';
import { useAppointmentSummary } from '../appointments/hooks/useAppointmentSummary';
import { env } from '../../lib/env';
import type { AppointmentListItem, AppointmentListQuery, AppointmentStatus } from '../../types/api';

const statusOptions: Array<{ value: AppointmentStatus; label: string }> = [
  { value: 'REQUESTED', label: 'Requested' }, { value: 'RESERVING', label: 'Reserving' },
  { value: 'BOOKED', label: 'Booked' }, { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'NO_RESPONSE', label: 'No response' }, { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'COMPLETED', label: 'Completed' }, { value: 'NO_SHOW', label: 'No show' },
  { value: 'REJECTED', label: 'Rejected' }, { value: 'BOOKING_FAILED', label: 'Booking failed' }
];

function dateBoundary(value: string, endOfDay = false): string | undefined {
  if (!value) return undefined;
  return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`).toISOString();
}

export function AdminDashboard() {
  const [filters, setFilters] = useState({ status: '', doctorId: '', patientId: '', from: '', to: '' });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [cursor, setCursor] = useState<string | undefined>();
  const [displayedAppointments, setDisplayedAppointments] = useState<AppointmentListItem[]>([]);
  const query: AppointmentListQuery = {
    limit: 25,
    sort: 'appointmentTime:desc',
    cursor,
    ...(appliedFilters.status ? { status: [appliedFilters.status as AppointmentStatus] } : {}),
    ...(appliedFilters.doctorId.trim() ? { doctorId: appliedFilters.doctorId.trim() } : {}),
    ...(appliedFilters.patientId.trim() ? { patientId: appliedFilters.patientId.trim() } : {}),
    ...(dateBoundary(appliedFilters.from) ? { from: dateBoundary(appliedFilters.from) } : {}),
    ...(dateBoundary(appliedFilters.to, true) ? { to: dateBoundary(appliedFilters.to, true) } : {})
  };
  const appointments = useAppointmentList(query);
  const attention = useAppointmentList({ view: 'action-required', limit: 10, sort: 'appointmentTime:asc' });
  const summary = useAppointmentSummary();

  useEffect(() => {
    if (!appointments.data) return;
    setDisplayedAppointments((previous) => cursor
      ? [...previous, ...appointments.data.items.filter((item) => !previous.some((existing) => existing.id === item.id))]
      : appointments.data.items
    );
  }, [appointments.data, cursor]);

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCursor(undefined);
    setDisplayedAppointments([]);
    setAppliedFilters(filters);
  };

  const clearFilters = () => {
    const empty = { status: '', doctorId: '', patientId: '', from: '', to: '' };
    setFilters(empty);
    setAppliedFilters(empty);
    setCursor(undefined);
    setDisplayedAppointments([]);
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Admin overview</h2>
            <p className="mt-1 text-sm text-slate-500">System-wide appointment operations.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/appointments/new" className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700">
              <CalendarPlus className="h-4 w-4" aria-hidden="true" /> Book an appointment
            </Link>
            {env.VITE_TEMPORAL_UI_URL && <a href={env.VITE_TEMPORAL_UI_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ExternalLink className="h-4 w-4" aria-hidden="true" /> Open Temporal UI</a>}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Total appointments" value={summary.data?.total} />
        <Metric label="Booked" value={summary.data?.byStatus.BOOKED} />
        <Metric label="Confirmed" value={summary.data?.byStatus.CONFIRMED} />
        <Metric label="Needs attention" value={summary.data?.actionRequired} alert />
      </div>

      <Card>
        <CardHeader title="Requires attention" description="Overdue confirmed appointments or failed reminder deliveries." action={<TriangleAlert className="h-5 w-5 text-amber-500" aria-hidden="true" />} />
        <AppointmentWorklist appointments={attention.data?.items ?? []} isLoading={attention.isLoading} isError={attention.isError} counterpart="patient" emptyTitle="Nothing requires attention" emptyDescription="There are no overdue outcomes or failed reminder deliveries." />
      </Card>

      <HealthCard />

      <Card>
        <CardHeader title="All appointments" description={`Server-backed appointment history${appointments.data ? ` · ${appointments.data.total} matching` : ''}`} />
        <form onSubmit={applyFilters} className="mb-5 grid grid-cols-1 gap-3 border-b border-slate-100 pb-5 sm:grid-cols-2 lg:grid-cols-5">
          <select aria-label="Appointment status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">All statuses</option>
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <input aria-label="Doctor ID" placeholder="Doctor ID" value={filters.doctorId} onChange={(event) => setFilters({ ...filters, doctorId: event.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input aria-label="Patient ID" placeholder="Patient ID" value={filters.patientId} onChange={(event) => setFilters({ ...filters, patientId: event.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input aria-label="From date" type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input aria-label="To date" type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <div className="flex gap-2 lg:col-span-5">
            <Button type="submit" size="sm">Apply filters</Button>
            <Button type="button" size="sm" variant="secondary" onClick={clearFilters}>Clear</Button>
          </div>
        </form>
        <AppointmentWorklist appointments={displayedAppointments} isLoading={appointments.isLoading && displayedAppointments.length === 0} isError={appointments.isError} counterpart="patient" emptyTitle="No matching appointments" emptyDescription="Try changing or clearing the filters." />
        {appointments.data?.nextCursor && (
          <div className="mt-5 flex justify-center">
            <Button variant="secondary" onClick={() => setCursor(appointments.data?.nextCursor ?? undefined)}>Load next 25 appointments</Button>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Find an appointment" description="Look up any appointment by its ID." />
        <QuickLookupForm />
      </Card>
    </div>
  );
}

function Metric({ label, value, alert = false }: { label: string; value: number | undefined; alert?: boolean }) {
  return <Card className={alert ? 'border-amber-200 bg-amber-50' : ''}><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-2 text-2xl font-semibold ${alert ? 'text-amber-800' : 'text-slate-900'}`}>{value ?? '—'}</p></Card>;
}
