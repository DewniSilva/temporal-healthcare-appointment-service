import type { Appointment, AppointmentStatus } from '../../../types/api';
import { dbStatusPresentation } from '../statusPresentation';

const SUMMARY_STATUSES: AppointmentStatus[] = ['BOOKED', 'CONFIRMED', 'CANCELLED', 'COMPLETED'];

/** Only worth showing once there is a meaningful amount of local data to summarize. */
export const STATUS_SUMMARY_MIN_ENTRIES = 3;

export function StatusSummaryCards({ appointments }: { appointments: Appointment[] }) {
  const counts = new Map<AppointmentStatus, number>();
  for (const appointment of appointments) {
    counts.set(appointment.status, (counts.get(appointment.status) ?? 0) + 1);
  }

  return (
    <div>
      <p className="text-xs text-slate-400">
        Counts reflect only the {appointments.length} appointment
        {appointments.length === 1 ? '' : 's'} loaded on this device, not a global total.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SUMMARY_STATUSES.map((status) => {
          const { label } = dbStatusPresentation[status];
          return (
            <div key={status} className="rounded-lg border border-slate-200 p-3 text-center">
              <p className="text-2xl font-semibold text-slate-900">{counts.get(status) ?? 0}</p>
              <p className="mt-1 text-xs text-slate-500">{label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
