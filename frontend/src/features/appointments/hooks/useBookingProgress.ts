import { useMemo } from 'react';
import { ApiError } from '../../../lib/apiError';
import { getAppointment, getWorkflowState } from '../api';
import { defaultBackoff, type BackoffOptions } from '../polling';
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
 * waits for the reminder Workflow to become queryable at all.
 *
 * A freshly booked appointment can be up to a week away, and its Workflow
 * durably waits that whole time in `SCHEDULED` before doing anything else.
 * So unlike `useSignalPolling` (which waits for a confirm/cancel signal to
 * resolve to a terminal status), this screen must not keep polling for a
 * terminal status — the very first successful read of the Workflow's state
 * is already the result worth showing ("booked, reminder scheduled").
 *
 * `backoff` defaults to the production bounded-backoff schedule; tests pass a
 * much faster one so they do not need to fight real or fake 1s+ timers.
 */
export function useBookingProgress(appointmentId: string, backoff: BackoffOptions = defaultBackoff): BookingProgress {
  const locate = usePolling<Appointment>({
    enabled: true,
    fetcher: (signal) => getAppointment(appointmentId, signal),
    isTerminal: () => true,
    isExpectedNotReady: (error) => error instanceof ApiError && error.isNotFound,
    backoff
  });

  const appointmentFound = locate.status === 'done';

  const orchestrate = usePolling<AppointmentWorkflowState>({
    enabled: appointmentFound,
    fetcher: (signal) => getWorkflowState(appointmentId, signal),
    isTerminal: () => true,
    isExpectedNotReady: (error) => error instanceof ApiError && error.isServiceUnavailable,
    backoff
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
