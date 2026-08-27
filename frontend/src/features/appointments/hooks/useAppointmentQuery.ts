import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/queryKeys';
import { getAppointment, getWorkflowState } from '../api';
import type { Appointment, AppointmentWorkflowState } from '../../../types/api';

export function useAppointmentQuery(id: string): UseQueryResult<Appointment> {
  return useQuery({
    queryKey: queryKeys.appointment(id),
    queryFn: ({ signal }) => getAppointment(id, signal)
  });
}

export function useWorkflowQuery(id: string): UseQueryResult<AppointmentWorkflowState> {
  return useQuery({
    queryKey: queryKeys.appointmentWorkflow(id),
    queryFn: ({ signal }) => getWorkflowState(id, signal)
  });
}
