import type { AppointmentStatus } from '../../types/api';

export interface BackoffOptions {
  initialDelayMs: number;
  maxDelayMs: number;
  factor: number;
  maxAttempts: number;
}

export const defaultBackoff: BackoffOptions = {
  initialDelayMs: 1000,
  maxDelayMs: 8000,
  factor: 1.6,
  maxAttempts: 10
};

/** Exponential backoff, capped at maxDelayMs. Exported standalone for unit testing. */
export function delayForAttempt(
  attempt: number,
  options: BackoffOptions = defaultBackoff
): number {
  const raw = options.initialDelayMs * options.factor ** attempt;
  return Math.min(Math.round(raw), options.maxDelayMs);
}

// Every status except the three the appointment durably lives in while a
// Signal's effect is still pending (REQUESTED, RESERVING, BOOKED) — polling
// after a confirm/cancel/complete/no-show Signal stops as soon as the
// Workflow reports having left BOOKED, whichever resting status it reaches.
export const TERMINAL_WORKFLOW_STATUSES: AppointmentStatus[] = [
  'CONFIRMED',
  'NO_RESPONSE',
  'CANCELLED',
  'COMPLETED',
  'NO_SHOW',
  'REJECTED',
  'BOOKING_FAILED'
];

export function isTerminalWorkflowStatus(status: AppointmentStatus): boolean {
  return TERMINAL_WORKFLOW_STATUSES.includes(status);
}
