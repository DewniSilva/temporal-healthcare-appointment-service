import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('healthcare-appointments');
const counter = (name: string, description: string) => meter.createCounter(name, { description });
const httpRequests = counter('http_requests', 'HTTP requests received');
const httpErrors = counter('http_errors', 'HTTP 5xx responses');
const httpDuration = meter.createHistogram('http_request_duration_seconds', { description: 'HTTP response latency', unit: 's' });
const appointmentCounters: Record<string, ReturnType<typeof counter>> = {
  REQUESTED: counter('appointments_requested', 'Appointments successfully requested'),
  BOOKED: counter('appointments_booked', 'Appointments successfully booked'),
  CONFIRMED: counter('appointments_confirmed', 'Appointments successfully confirmed'),
  CANCELLED: counter('appointments_cancelled', 'Appointments successfully cancelled'),
  NO_RESPONSE: counter('appointments_no_response', 'Appointments closed after no response'),
  COMPLETED: counter('appointments_completed', 'Appointments completed'),
  NO_SHOW: counter('appointments_no_show', 'Appointments marked no-show'),
  BOOKING_FAILED: counter('appointments_booking_failed', 'Appointments whose slot booking failed'),
  REJECTED: counter('appointments_rejected', 'Appointments rejected during validation')
};
const reminderCounters: Record<string, ReturnType<typeof counter>> = {
  scheduled: counter('reminders_scheduled', 'Reminders scheduled'),
  sent: counter('reminders_sent', 'Reminders accepted by the provider'),
  delivered: counter('reminders_delivered', 'Reminders delivered by the provider'),
  failed: counter('reminders_failed', 'Reminder send failures'),
  bounced: counter('reminders_bounced', 'Reminders bounced by the provider'),
  cancelled: counter('reminders_cancelled', 'Reminders cancelled before send')
};
const reconciliations = counter('reconciliation_runs', 'Reconciliation sweeps');
const reconciliationRepairs = counter('reconciliation_repairs', 'Reconciliation repairs or detected stuck state');
const reconciliationFailures = counter('reconciliation_failures', 'Failed reconciliation operations');
const rateLimitRequests = counter('rate_limit_requests', 'Requests evaluated by a rate-limit policy');
const rateLimitBlocked = counter('rate_limit_blocked', 'Requests blocked by a rate-limit policy');
const rateLimitRedisErrors = counter('rate_limit_redis_errors', 'Redis failures observed by rate limiting');

export function recordHttp(method: string, route: string, status: number, elapsedMs: number): void {
  const attributes = { method, route, status_class: `${Math.floor(status / 100)}xx` };
  httpRequests.add(1, attributes);
  httpDuration.record(elapsedMs / 1000, attributes);
  if (status >= 500) httpErrors.add(1, attributes);
}

export const recordAppointmentTransition = (state: string): void => appointmentCounters[state]?.add(1);
export const recordReminderTransition = (state: string, reminderType: string): void => reminderCounters[state]?.add(1, { reminder_type: reminderType });
export const recordReconciliationRun = (): void => reconciliations.add(1);
export const recordReconciliationRepair = (repairType: string, count = 1): void => reconciliationRepairs.add(count, { repair_type: repairType });
export const recordReconciliationFailure = (operation: string): void => reconciliationFailures.add(1, { operation });
export const recordRateLimitRequest = (policy: string): void => rateLimitRequests.add(1, { policy });
export const recordRateLimitBlocked = (policy: string): void => rateLimitBlocked.add(1, { policy });
export const recordRateLimitRedisError = (policy: string): void => rateLimitRedisErrors.add(1, { policy });
