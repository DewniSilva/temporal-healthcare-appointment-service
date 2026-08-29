export type ReminderType = 'CONFIRMATION_REMINDER' | 'UPCOMING_REMINDER';

export type ReminderStatus =
  | 'SCHEDULED'
  | 'PENDING'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'BOUNCED'
  | 'CANCELLED';

// SENT is a resting state, not strictly terminal (a delivery/bounce webhook
// can still move it forward), but this system has no webhook receiver, so in
// practice it never advances further than SENT.
export const TERMINAL_REMINDER_STATUSES: ReadonlySet<ReminderStatus> = new Set([
  'DELIVERED',
  'BOUNCED',
  'FAILED',
  'CANCELLED'
]);

// A retried/duplicated sendReminder call must not send twice — these are the
// statuses the send Activity treats as "already handled, do nothing" (spec §18).
export const REMINDER_STATUSES_SKIPPING_SEND: ReadonlySet<ReminderStatus> = new Set([
  'SENT',
  'DELIVERED',
  'BOUNCED',
  'CANCELLED'
]);
