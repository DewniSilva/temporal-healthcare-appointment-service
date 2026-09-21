import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/queryKeys';
import { getAppointments } from '../api';
import type { AppointmentListQuery } from '../../../types/api';

/** Server-backed worklist. Query keys include every filter, so dashboards
 * never accidentally display a previous role/view's cached appointments. */
export function useAppointmentList(query: AppointmentListQuery) {
  return useQuery({
    queryKey: queryKeys.appointmentList(query),
    queryFn: ({ signal }) => getAppointments(query, signal),
    staleTime: 15_000
  });
}
