import { useQueries } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/queryKeys';
import { getAppointment } from '../api';
import type { RecentAppointmentEntry } from '../recentAppointments';
import type { Appointment } from '../../../types/api';

/**
 * Fetches every recently-seen appointment ID in parallel so the dashboard can
 * show device-local status counts. Shares the query cache with
 * AppointmentCard, so this does not duplicate network requests for IDs the
 * card list is already rendering.
 */
export function useRecentAppointmentsData(entries: RecentAppointmentEntry[]) {
  const results = useQueries({
    queries: entries.map((entry) => ({
      queryKey: queryKeys.appointment(entry.id),
      queryFn: ({ signal }: { signal: AbortSignal }) => getAppointment(entry.id, signal),
      staleTime: 10_000
    }))
  });

  const loaded: Appointment[] = results
    .filter((result) => result.status === 'success' && result.data)
    .map((result) => result.data as Appointment);

  const isLoading = results.some((result) => result.status === 'pending');

  return { appointments: loaded, isLoading };
}
