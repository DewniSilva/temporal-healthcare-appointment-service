import type { AppointmentStatus, AppointmentWorkflowState } from '../../types/api';

export type StepState = 'complete' | 'current' | 'upcoming' | 'error';

export interface TimelineStep {
  key: string;
  label: string;
  state: StepState;
}

const SCHEDULED_OR_LATER = new Set([
  'SCHEDULED',
  'WAITING_FOR_CONFIRMATION',
  'CONFIRMED',
  'CANCELLED'
]);

/**
 * The Workflow state is the primary source for this timeline, but it can be
 * briefly unavailable (503 right after booking, or a query error). When that
 * happens, fall back to the DB status, which is related but not atomically
 * updated with the Workflow (see SYSTEM_REPORT.md section 7.4).
 */
export function buildTimelineSteps(
  dbStatus: AppointmentStatus,
  workflow: AppointmentWorkflowState | null
): TimelineStep[] {
  const status = workflow?.status ?? null;
  const slotLikelyReserved = status ? status !== 'BOOKING' : dbStatus !== 'PENDING';

  const bookingAccepted: TimelineStep = {
    key: 'booking-accepted',
    label: 'Booking accepted',
    state: 'complete'
  };

  const slotReserved: TimelineStep = {
    key: 'slot-reserved',
    label: 'Slot reserved',
    state: slotLikelyReserved ? 'complete' : status === 'BOOKING' ? 'current' : 'upcoming'
  };

  const reminderState: StepState = status
    ? SCHEDULED_OR_LATER.has(status)
      ? workflow?.reminderSent
        ? 'complete'
        : status === 'SCHEDULED'
          ? 'current'
          : 'complete'
      : 'upcoming'
    : dbStatus === 'CONFIRMED' || dbStatus === 'CANCELLED'
      ? 'complete'
      : 'upcoming';

  const reminder: TimelineStep = {
    key: 'reminder',
    label: workflow?.reminderSent ? 'Reminder sent' : 'Reminder scheduled',
    state: reminderState
  };

  const effectiveDecision = status ?? (dbStatus === 'CONFIRMED' || dbStatus === 'CANCELLED' ? dbStatus : null);

  let decisionLabel = 'Confirmed or cancelled';
  let decisionState: StepState = 'upcoming';
  if (effectiveDecision === 'CONFIRMED') {
    decisionLabel = 'Confirmed';
    decisionState = 'complete';
  } else if (effectiveDecision === 'CANCELLED') {
    decisionLabel = 'Cancelled';
    decisionState = 'complete';
  } else if (status === 'FAILED') {
    decisionLabel = 'Booking failed';
    decisionState = 'error';
  } else if (status === 'WAITING_FOR_CONFIRMATION') {
    decisionState = 'current';
  }

  const decision: TimelineStep = { key: 'decision', label: decisionLabel, state: decisionState };

  return [bookingAccepted, slotReserved, reminder, decision];
}
