import type { AppointmentStatus, AppointmentWorkflowState } from '../../types/api';

export type StepState = 'complete' | 'current' | 'upcoming' | 'error';

export interface TimelineStep {
  key: string;
  label: string;
  state: StepState;
}

const BOOKING_FAILURE_STATUSES = new Set<AppointmentStatus>(['REJECTED', 'BOOKING_FAILED']);
const PAST_BOOKED_STATUSES = new Set<AppointmentStatus>(['BOOKED', 'CONFIRMED', 'NO_RESPONSE', 'CANCELLED', 'COMPLETED', 'NO_SHOW']);
const OUTCOME_LABELS: Partial<Record<AppointmentStatus, string>> = {
  COMPLETED: 'Completed',
  NO_SHOW: 'No-show',
  CANCELLED: 'Cancelled',
  NO_RESPONSE: 'No response — slot released',
  REJECTED: 'Booking rejected',
  BOOKING_FAILED: 'Booking failed'
};

/**
 * The Workflow query is the primary source for this timeline (it reports the
 * exact same AppointmentStatus enum as the DB record), but it can be briefly
 * unavailable (503 right after booking, or a query error). When that
 * happens, fall back to the DB status.
 */
export function buildTimelineSteps(
  dbStatus: AppointmentStatus,
  workflow: AppointmentWorkflowState | null
): TimelineStep[] {
  const status = workflow?.appointmentStatus ?? dbStatus;
  const confirmed = Boolean(workflow?.confirmedAt) || status === 'CONFIRMED' || status === 'COMPLETED' || status === 'NO_SHOW';

  const bookingAccepted: TimelineStep = {
    key: 'booking-accepted',
    label: 'Booking accepted',
    state: 'complete'
  };

  const slotReserved: TimelineStep = {
    key: 'slot-reserved',
    label: 'Slot reserved',
    state: BOOKING_FAILURE_STATUSES.has(status) ? 'error' : PAST_BOOKED_STATUSES.has(status) ? 'complete' : 'current'
  };

  const confirmationState: StepState = BOOKING_FAILURE_STATUSES.has(status)
    ? 'upcoming'
    : status === 'NO_RESPONSE'
      ? 'error'
      : confirmed
        ? 'complete'
        : status === 'BOOKED'
          ? 'current'
          : 'upcoming';

  const confirmation: TimelineStep = {
    key: 'confirmation',
    label: status === 'NO_RESPONSE' ? 'No response by the deadline' : 'Confirmed',
    state: confirmationState
  };

  let outcomeLabel = 'Appointment outcome';
  let outcomeState: StepState = 'upcoming';
  const explicitOutcome = OUTCOME_LABELS[status];
  if (explicitOutcome) {
    outcomeLabel = explicitOutcome;
    outcomeState = status === 'COMPLETED' ? 'complete' : 'error';
  } else if (status === 'CONFIRMED') {
    outcomeState = 'current';
  }

  const outcome: TimelineStep = { key: 'outcome', label: outcomeLabel, state: outcomeState };

  return [bookingAccepted, slotReserved, confirmation, outcome];
}
