import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/queryKeys';
import { getAppointmentSummary } from '../api';

export function useAppointmentSummary() {
  return useQuery({
    queryKey: queryKeys.appointmentSummary(),
    queryFn: ({ signal }) => getAppointmentSummary(signal),
    staleTime: 15_000
  });
}
