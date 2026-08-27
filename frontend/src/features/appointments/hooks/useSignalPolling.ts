import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../lib/apiError';
import { queryKeys } from '../../../lib/queryKeys';
import { getWorkflowState } from '../api';
import { isTerminalWorkflowStatus } from '../polling';
import { usePolling } from './usePolling';
import type { AppointmentWorkflowState } from '../../../types/api';

/**
 * After a confirm/cancel signal is accepted, polls the Workflow until it
 * reports a terminal status, then refreshes the appointment's DB record so
 * the displayed status catches up with the Workflow outcome.
 */
export function useSignalPolling(appointmentId: string, enabled: boolean) {
  const queryClient = useQueryClient();

  const poll = usePolling<AppointmentWorkflowState>({
    enabled,
    fetcher: (signal) => getWorkflowState(appointmentId, signal),
    isTerminal: (state) => isTerminalWorkflowStatus(state.status),
    isExpectedNotReady: (error) => error instanceof ApiError && error.isServiceUnavailable
  });

  useEffect(() => {
    if (poll.status !== 'done' && poll.status !== 'exhausted') return;
    queryClient.setQueryData(queryKeys.appointmentWorkflow(appointmentId), poll.data);
    void queryClient.invalidateQueries({ queryKey: queryKeys.appointment(appointmentId) });
  }, [poll.status, poll.data, appointmentId, queryClient]);

  return poll;
}
