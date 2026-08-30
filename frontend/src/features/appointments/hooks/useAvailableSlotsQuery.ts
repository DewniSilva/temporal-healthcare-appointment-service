import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/queryKeys';
import { getAvailableSlots } from '../api';
import type { AvailableSlotsResponse } from '../../../types/api';

/**
 * Backs the booking form's time-slot picker with the doctor's real,
 * per-doctor availability (recurring schedule + exceptions + clinic
 * closures + existing reservations) instead of a hardcoded global list.
 * Disabled until both a doctor and a date are chosen; a very short/partial
 * doctor ID is treated as "not chosen yet" rather than firing a request
 * that can only 404.
 */
export function useAvailableSlotsQuery(doctorId: string, date: string): UseQueryResult<AvailableSlotsResponse> {
  return useQuery({
    queryKey: queryKeys.availableSlots(doctorId, date),
    queryFn: ({ signal }) => getAvailableSlots(doctorId, date, signal),
    enabled: doctorId.trim().length >= 3 && date.trim().length > 0,
    staleTime: 30_000
  });
}
