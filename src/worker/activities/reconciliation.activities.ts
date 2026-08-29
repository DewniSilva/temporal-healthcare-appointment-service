import { prisma } from '../../shared/database/prisma';
import { logger } from '../../shared/logging/logger';
import { getEnv } from '../../shared/config/env';
import { APPOINTMENT_SLOT_MINUTES } from '../../shared/appointmentSlots';
import { isReminderRetryEligible } from '../../shared/reminder/reminder.policy';
import type {
  OrphanedReminder,
  ReconciliationActivities,
  ReconciliationInput,
  RetryableReminder,
  StuckAppointment
} from '../../shared/temporal/contracts';

/** An appointment's own slot has definitely elapsed once this much time has passed since it started. */
function staleCutoff(graceMinutes: number): Date {
  return new Date(Date.now() - (APPOINTMENT_SLOT_MINUTES + graceMinutes) * 60_000);
}

function reminderConfig() {
  const env = getEnv();
  return {
    confirmationReminderHoursBefore: env.CONFIRMATION_REMINDER_HOURS_BEFORE,
    confirmationDeadlineHoursBefore: env.CONFIRMATION_DEADLINE_HOURS_BEFORE,
    upcomingReminderHoursBefore: env.UPCOMING_REMINDER_HOURS_BEFORE
  };
}

export const reconciliationActivities: ReconciliationActivities = {
  // Reuses the exact sendReminder Activity/idempotency path via the
  // reconciliation Workflow — this only decides *which* reminders are still
  // eligible to retry. A reminder past its own meaningful window (deadline
  // for a confirmation reminder, appointment time for an upcoming reminder)
  // is never retried, matching spec §22 exactly.
  async findRetryableFailedReminders(input: ReconciliationInput): Promise<RetryableReminder[]> {
    const rows = await prisma.reminder.findMany({
      where: {
        status: 'FAILED',
        OR: [
          { type: 'CONFIRMATION_REMINDER', appointment: { status: 'BOOKED' } },
          { type: 'UPCOMING_REMINDER', appointment: { status: 'CONFIRMED' } }
        ]
      },
      select: { appointmentId: true, type: true, appointment: { select: { status: true, appointmentTime: true } } },
      // Filtered further by isReminderRetryEligible below, so this batch
      // may shrink after the take — fine, the next sweep picks up the rest.
      take: input.batchSize
    });
    const now = Date.now();
    const config = reminderConfig();
    const eligible = rows.filter((row) =>
      isReminderRetryEligible(row.type, row.appointment.status, row.appointment.appointmentTime.toISOString(), now, config)
    );
    if (eligible.length > 0) {
      logger.warn({ event: 'reconciliation_retrying_failed_reminders', count: eligible.length, appointmentIds: eligible.map((r) => r.appointmentId) });
    }
    return eligible.map((row) => ({ appointmentId: row.appointmentId, type: row.type }));
  },

  // Safe to auto-heal: a terminal appointment status is proof its owning
  // Workflow already made the final decision (Temporal persists Workflow
  // history across worker restarts, so a mere crashed-and-restarted worker
  // is never the cause here) — a still-RESERVED slot means the release step
  // itself failed outside its own retry budget, or the Workflow was
  // explicitly terminated before it could run, or a manual/external change.
  async findStaleReservations(input: ReconciliationInput): Promise<string[]> {
    const rows = await prisma.slotReservation.findMany({
      where: { status: 'RESERVED', appointment: { status: { in: ['NO_RESPONSE', 'CANCELLED', 'COMPLETED', 'NO_SHOW'] } } },
      select: { appointmentId: true },
      take: input.batchSize
    });
    if (rows.length > 0) {
      logger.warn({ event: 'reconciliation_stale_reservations_found', count: rows.length, appointmentIds: rows.map((r) => r.appointmentId) });
    }
    return rows.map((row) => row.appointmentId);
  },

  async findOrphanedScheduledReminders(input: ReconciliationInput): Promise<OrphanedReminder[]> {
    const rows = await prisma.reminder.findMany({
      where: { status: { in: ['SCHEDULED', 'PENDING'] }, appointment: { status: 'CANCELLED' } },
      select: { appointmentId: true, type: true },
      take: input.batchSize
    });
    if (rows.length > 0) {
      logger.warn({ event: 'reconciliation_orphaned_reminders_found', count: rows.length, appointmentIds: rows.map((r) => r.appointmentId) });
    }
    return rows.map((row) => ({ appointmentId: row.appointmentId, type: row.type }));
  },

  // Not auto-healed: a BOOKED appointment stuck past its own confirmation
  // deadline means its Workflow died before it could ever decide
  // CONFIRMED/NO_RESPONSE — deciding the outcome is a business call, not
  // something to guess. Surfaced as a structured log for on-call to pick up.
  async findStuckBookedAppointments({ graceMinutes, batchSize }: ReconciliationInput): Promise<StuckAppointment[]> {
    const rows = await prisma.appointment.findMany({
      where: { status: 'BOOKED', appointmentTime: { lt: staleCutoff(graceMinutes) } },
      select: { id: true, appointmentTime: true },
      take: batchSize
    });
    if (rows.length > 0) {
      logger.error({ event: 'reconciliation_stuck_booked_appointments', count: rows.length, appointmentIds: rows.map((row) => row.id) });
    }
    return rows.map((row) => ({ appointmentId: row.id, appointmentTime: row.appointmentTime.toISOString() }));
  },

  // Not auto-healed, same reasoning as findStuckBookedAppointments: a
  // CONFIRMED appointment well past its own time with no COMPLETED/NO_SHOW
  // means nobody (or no Workflow) ever recorded the actual outcome. Whether
  // that's a missed doctor action or a dead Workflow, guessing the outcome
  // is a business call — surfaced for on-call instead.
  async findStuckConfirmedAppointments({ graceMinutes, batchSize }: ReconciliationInput): Promise<StuckAppointment[]> {
    const rows = await prisma.appointment.findMany({
      where: { status: 'CONFIRMED', appointmentTime: { lt: staleCutoff(graceMinutes) } },
      select: { id: true, appointmentTime: true },
      take: batchSize
    });
    if (rows.length > 0) {
      logger.error({ event: 'reconciliation_stuck_confirmed_appointments', count: rows.length, appointmentIds: rows.map((row) => row.id) });
    }
    return rows.map((row) => ({ appointmentId: row.id, appointmentTime: row.appointmentTime.toISOString() }));
  }
};
