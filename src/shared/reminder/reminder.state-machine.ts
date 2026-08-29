import type { ReminderStatus } from './reminder.types';

export const REMINDER_TRANSITIONS: Readonly<Record<ReminderStatus, readonly ReminderStatus[]>> = {
  SCHEDULED: ['PENDING', 'CANCELLED'],
  PENDING: ['SENDING', 'CANCELLED'],
  SENDING: ['SENT', 'FAILED'],
  SENT: ['DELIVERED', 'BOUNCED'],
  DELIVERED: [],
  BOUNCED: [],
  // Not in the base diagram, but required by spec §22: reconciliation safely
  // retries a FAILED reminder (same idempotency key) while it's still eligible.
  FAILED: ['PENDING'],
  CANCELLED: []
};

export class InvalidReminderTransitionError extends Error {
  constructor(public readonly from: ReminderStatus, public readonly to: ReminderStatus) {
    super(`Cannot transition reminder from ${from} to ${to}.`);
    this.name = 'InvalidReminderTransitionError';
  }
}

export function isValidReminderTransition(from: ReminderStatus, to: ReminderStatus): boolean {
  return REMINDER_TRANSITIONS[from].includes(to);
}

export function assertValidReminderTransition(from: ReminderStatus, to: ReminderStatus): void {
  if (!isValidReminderTransition(from, to)) throw new InvalidReminderTransitionError(from, to);
}
