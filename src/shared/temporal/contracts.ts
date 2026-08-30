import type { AppointmentStatus, TransitionActor } from '../appointment/appointment.types';
import type { ReservationStatus } from '../reservation/reservation.types';
import type { ReminderType } from '../reminder/reminder.types';

export const TASK_QUEUE = 'healthcare-appointments';

export interface AppointmentWorkflowInput {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  appointmentTime: string;
  /** Wall-clock UTC offset (minutes) captured from the original booking request. */
  appointmentTzOffsetMinutes: number;
  // The confirmation/reminder policy is resolved once from config by the
  // backend (getEnv()) and passed in, rather than read from process.env
  // inside the deterministic Workflow.
  confirmationReminderHoursBefore: number;
  confirmationDeadlineHoursBefore: number;
  upcomingReminderHoursBefore: number;
}

export interface AppointmentWorkflowState {
  appointmentStatus: AppointmentStatus;
  reservationStatus: ReservationStatus | null;
  confirmationReminderAt: string;
  confirmationDeadlineAt: string;
  upcomingReminderAt: string;
  /** Whether the Workflow has attempted this send. The Reminder DB row (SENT/FAILED/...) is authoritative on delivery outcome. */
  confirmationReminderSent: boolean;
  upcomingReminderSent: boolean;
  confirmedAt: string | null;
}

// Lets the backend start the registered Workflow by name without importing
// worker implementation code across the service boundary.
export type AppointmentWorkflow = (input: AppointmentWorkflowInput) => Promise<AppointmentWorkflowState>;

export interface BookingActivityInput {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  appointmentTime: string;
}

export interface CreateRequestedAppointmentInput extends BookingActivityInput {
  appointmentTzOffsetMinutes: number;
}

export type BookingValidationResult = { valid: true } | { valid: false; reason: string };

export interface TransitionAppointmentInput {
  appointmentId: string;
  to: AppointmentStatus;
  actor: TransitionActor;
  reason?: string;
  correlationId?: string;
}

export interface AppointmentActivities {
  validateBooking(input: BookingActivityInput): Promise<BookingValidationResult>;
  createRequestedAppointment(input: CreateRequestedAppointmentInput): Promise<void>;
  transitionAppointment(input: TransitionAppointmentInput): Promise<void>;
}

export interface ReserveSlotInput {
  appointmentId: string;
  doctorId: string;
  appointmentTime: string;
}

export interface ReservationActivities {
  reserveSlot(input: ReserveSlotInput): Promise<void>;
  /** `released: false` means the reservation was already RELEASED/CONFLICTED — a safe no-op, not an error. */
  releaseSlot(input: { appointmentId: string }): Promise<{ released: boolean }>;
}

export interface ScheduleRemindersInput {
  appointmentId: string;
  confirmationReminderAt: string;
  upcomingReminderAt: string;
}

export interface ReminderActivityInput {
  appointmentId: string;
  type: ReminderType;
}

export interface ReminderActivities {
  scheduleReminders(input: ScheduleRemindersInput): Promise<void>;
  /** `cancelled: false` means the reminder was already SENT/terminal — preserved as historical data, not an error. */
  cancelReminder(input: ReminderActivityInput): Promise<{ cancelled: boolean }>;
  /**
   * Re-validates current appointment state immediately before sending (spec
   * §19). `sent: false` means the precondition failed or it was already
   * sent — a graceful no-op, distinct from a thrown (retryable) failure.
   */
  sendReminder(input: ReminderActivityInput): Promise<{ sent: boolean }>;
}

export const appointmentWorkflowId = (appointmentId: string): string => `appointment-${appointmentId}`;
export const reconciliationScheduleId = 'appointment-reconciliation';
export const reconciliationWorkflowId = 'appointment-reconciliation-workflow';

export interface ReconciliationInput {
  /** How long past an appointment's own end time before its state counts as stale rather than mid-cleanup. */
  graceMinutes: number;
  /** Caps rows returned per query per sweep, so one pass can't balloon Workflow history; the next scheduled run picks up the rest. */
  batchSize: number;
}

export interface RetryableReminder {
  appointmentId: string;
  type: ReminderType;
}

export interface OrphanedReminder {
  appointmentId: string;
  type: ReminderType;
}

export interface StuckAppointment {
  appointmentId: string;
  appointmentTime: string;
}

export interface ReconciliationActivities {
  /** BOOKED+CONFIRMATION_REMINDER FAILED before its deadline, or CONFIRMED+UPCOMING_REMINDER FAILED before appointment time. */
  findRetryableFailedReminders(input: ReconciliationInput): Promise<RetryableReminder[]>;
  /** Appointment in a terminal status while its slot reservation is still RESERVED. */
  findStaleReservations(input: ReconciliationInput): Promise<string[]>;
  /** Appointment CANCELLED while a reminder is still SCHEDULED/PENDING. */
  findOrphanedScheduledReminders(input: ReconciliationInput): Promise<OrphanedReminder[]>;
  /** Detection-only: a BOOKED appointment stuck past its own deadline (its Workflow likely died). */
  findStuckBookedAppointments(input: ReconciliationInput): Promise<StuckAppointment[]>;
  /** Detection-only: a CONFIRMED appointment well past its own time with nobody ever recording COMPLETED/NO_SHOW. */
  findStuckConfirmedAppointments(input: ReconciliationInput): Promise<StuckAppointment[]>;
}

export interface ReconciliationResult {
  staleReservationsReleased: number;
  orphanedRemindersCancelled: number;
  failedRemindersRetried: number;
  stuckBookedAppointments: number;
  stuckConfirmedAppointments: number;
}
