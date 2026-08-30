import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { RotateCw } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/Card';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { useAppointmentQuery, useWorkflowQuery } from './hooks/useAppointmentQuery';
import { DbStatusBadge, WorkflowStatusBadge } from './components/StatusBadge';
import { Timeline } from './components/Timeline';
import { CopyableId } from './components/CopyableId';
import { AppointmentActions } from './components/AppointmentActions';
import { rememberAppointment } from './recentAppointments';
import { formatDateTime } from '../../lib/dateTime';
import { ApiError, describeError } from '../../lib/apiError';

export function AppointmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const appointmentId = id ?? '';

  const appointmentQuery = useAppointmentQuery(appointmentId);
  const workflowQuery = useWorkflowQuery(appointmentId);

  useEffect(() => {
    if (appointmentQuery.data) rememberAppointment(appointmentQuery.data.id);
  }, [appointmentQuery.data]);

  if (appointmentQuery.isLoading) return <SkeletonCard />;

  if (appointmentQuery.isError) {
    const error = appointmentQuery.error;
    const isNotFound = error instanceof ApiError && error.isNotFound;
    return (
      <Alert variant={isNotFound ? 'warning' : 'error'} title={isNotFound ? 'Appointment not found' : 'Could not load appointment'}>
        {describeError(error)}
      </Alert>
    );
  }

  const appointment = appointmentQuery.data;
  if (!appointment) return null;

  return (
    <div className="space-y-6">
      {(workflowQuery.data?.confirmationReminderSent || workflowQuery.data?.upcomingReminderSent) && (
        <Alert variant="success" title="Reminder sent">
          A reminder notification for this appointment has been delivered.
        </Alert>
      )}

      <Card>
        <CardHeader
          title={<CopyableId value={appointment.id} label="Appointment ID" />}
          action={<DbStatusBadge status={appointment.status} />}
        />

        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Patient ID</dt>
            <dd className="mt-1 font-mono text-sm text-slate-800">{appointment.patientId}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Doctor ID</dt>
            <dd className="mt-1 font-mono text-sm text-slate-800">{appointment.doctorId}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Appointment time</dt>
            <dd className="mt-1 text-sm text-slate-800">{formatDateTime(appointment.appointmentTime)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Workflow status</dt>
            <dd className="mt-1">
              {workflowQuery.data ? (
                <WorkflowStatusBadge status={workflowQuery.data.appointmentStatus} />
              ) : workflowQuery.isError ? (
                <span className="text-sm text-slate-500">{describeError(workflowQuery.error)}</span>
              ) : (
                <span className="text-sm text-slate-400">Loading…</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Reminders</dt>
            <dd className="mt-1 text-sm text-slate-800">
              {workflowQuery.data
                ? `Confirmation: ${workflowQuery.data.confirmationReminderSent ? 'Sent' : 'Not sent yet'} · Upcoming: ${workflowQuery.data.upcomingReminderSent ? 'Sent' : 'Not sent yet'}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Created</dt>
            <dd className="mt-1 text-sm text-slate-800">{formatDateTime(appointment.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Last updated</dt>
            <dd className="mt-1 text-sm text-slate-800">{formatDateTime(appointment.updatedAt)}</dd>
          </div>
        </dl>

        {workflowQuery.isError && (
          <div className="mt-4">
            <Button variant="secondary" size="sm" onClick={() => workflowQuery.refetch()}>
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              Refresh workflow status
            </Button>
          </div>
        )}

        <AppointmentActions appointment={appointment} />
      </Card>

      <Card>
        <CardHeader title="Timeline" />
        <Timeline dbStatus={appointment.status} workflow={workflowQuery.data ?? null} />
      </Card>
    </div>
  );
}
