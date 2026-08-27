import { useMemo } from 'react';
import { ApiError } from '../../../lib/apiError';
import { getAppointment, getWorkflowState } from '../api';
import { isTerminalWorkflowStatus } from '../polling';
import { usePolling } from './usePolling';
import type { Appointment, AppointmentWorkflowState } from '../../../types/api';

export type BookingPhase = 'locating' | 'orchestrating' | 'complete' | 'stalled';

export interface BookingProgress {
  phase: BookingPhase;
  appointment: Appointment | null;
  workflow: AppointmentWorkflowState | null;
  retry: () => void;
}

/**
 * Drives the post-booking processing screen: first waits for the appointment
 * row to exist (a brief 404 window is expected while the Workflow runs), then
 * polls the reminder Workflow's state until it reaches a terminal status.
 */
export function useBookingProgress(appointmentId: string): BookingProgress {
  const locate = usePolling<Appointment>({
    enabled: true,
    fetcher: (signal) => getAppointment(appointmentId, signal),
    isTerminal: () => true,
    isExpectedNotReady: (error) => error instanceof ApiError && error.isNotFound
  });

  const appointmentFound = locate.status === 'done';

  const orchestrate = usePolling<AppointmentWorkflowState>({
    enabled: appointmentFound,
    fetcher: (signal) => getWorkflowState(appointmentId, signal),
    isTerminal: (state) => isTerminalWorkflowStatus(state.status),
    isExpectedNotReady: (error) => error instanceof ApiError && error.isServiceUnavailable
  });

  return useMemo<BookingProgress>(() => {
    if (!appointmentFound) {
      return {
        phase: locate.status === 'exhausted' ? 'stalled' : 'locating',
        appointment: locate.data,
        workflow: null,
        retry: locate.retry
      };
    }
    if (orchestrate.status === 'done') {
      return { phase: 'complete', appointment: locate.data, workflow: orchestrate.data, retry: orchestrate.retry };
    }
    if (orchestrate.status === 'exhausted') {
      return { phase: 'stalled', appointment: locate.data, workflow: orchestrate.data, retry: orchestrate.retry };
    }
    return { phase: 'orchestrating', appointment: locate.data, workflow: orchestrate.data, retry: orchestrate.retry };
  }, [appointmentFound, locate.status, locate.data, locate.retry, orchestrate.status, orchestrate.data, orchestrate.retry]);
}
