import type { AppointmentStatus, AppointmentWorkflowState } from '../../types/api';

export type StepState = 'complete' | 'current' | 'upcoming' | 'error';

export interface TimelineStep {
  key: string;
  label: string;
  state: StepState;
}

const SCHEDULED_OR_LATER = new Set(['SCHEDULED', 'WAITING_FOR_CONFIRMATION', 'CONFIRMED', 'CANCELLED']);

export function buildTimelineSteps(
  dbStatus: AppointmentStatus,
  workflow: AppointmentWorkflowState | null
): TimelineStep[] {
  const status = workflow?.status ?? null;

  const bookingAccepted: TimelineStep = {
    key: 'booking-accepted',
    label: 'Booking accepted',
    state: 'complete'
  };

  const slotReserved: TimelineStep = {
    key: 'slot-reserved',
    label: 'Slot reserved',
    state: status && status !== 'BOOKING' ? 'complete' : status === 'BOOKING' ? 'current' : 'upcoming'
  };

  const reminderState: StepState = status
    ? SCHEDULED_OR_LATER.has(status)
      ? workflow?.reminderSent
        ? 'complete'
        : status === 'SCHEDULED'
          ? 'current'
          : 'complete'
      : 'upcoming'
    : 'upcoming';

  const reminder: TimelineStep = {
    key: 'reminder',
    label: workflow?.reminderSent ? 'Reminder sent' : 'Reminder scheduled',
    state: reminderState
  };

  let decisionLabel = 'Confirmed or cancelled';
  let decisionState: StepState = 'upcoming';
  if (status === 'CONFIRMED') {
    decisionLabel = 'Confirmed';
    decisionState = 'complete';
  } else if (status === 'CANCELLED') {
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
