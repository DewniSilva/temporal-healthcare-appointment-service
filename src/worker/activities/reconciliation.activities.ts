import { AppointmentStatus, NotificationStatus, NotificationType } from '@prisma/client';
import { prisma } from '../../shared/database/prisma';
import { logger } from '../../shared/logging/logger';
import { APPOINTMENT_SLOT_MINUTES } from '../../shared/appointmentSlots';
import type { OrphanedReservation, ReconciliationActivities, ReconciliationInput, StuckAppointment } from '../../shared/temporal/contracts';

/** An appointment's own slot has definitely elapsed once this much time has passed since it started. */
function staleCutoff(graceMinutes: number): Date {
  return new Date(Date.now() - (APPOINTMENT_SLOT_MINUTES + graceMinutes) * 60_000);
}

export const reconciliationActivities: ReconciliationActivities = {
  // Safe to auto-heal: once an appointment's slot is in the past, that exact
  // time can never be requested again (only future times are accepted), so a
  // reservation still sitting here is dead weight from a crashed worker or a
  // Workflow that was terminated before its own release step ran.
  async findOrphanedReservations({ graceMinutes }: ReconciliationInput): Promise<OrphanedReservation[]> {
    const rows = await prisma.slotReservation.findMany({
      where: { appointmentTime: { lt: staleCutoff(graceMinutes) } },
      select: { appointmentId: true, doctorId: true, appointmentTime: true }
    });
    if (rows.length > 0) {
      logger.warn({
        event: 'reconciliation_orphaned_reservations_found',
        count: rows.length,
        appointmentIds: rows.map((row) => row.appointmentId)
      });
    }
    return rows.map((row) => ({
      appointmentId: row.appointmentId,
      doctorId: row.doctorId,
      appointmentTime: row.appointmentTime.toISOString()
    }));
  },

  // Not auto-healed: an appointment stuck at BOOKED past its own time means its
  // Workflow died (activity retries exhausted, worker crash outliving
  // Workflow history, etc.) before it could ever reach CONFIRMED/CANCELLED —
  // deciding what that appointment's outcome should have been is a business
  // call, not something to guess automatically. Surfaced as a structured log
  // for alerting/on-call to pick up.
  async findStuckBookedAppointments({ graceMinutes }: ReconciliationInput): Promise<StuckAppointment[]> {
    const rows = await prisma.appointment.findMany({
      where: { status: AppointmentStatus.BOOKED, appointmentTime: { lt: staleCutoff(graceMinutes) } },
      select: { id: true, appointmentTime: true }
    });
    if (rows.length > 0) {
      logger.error({
        event: 'reconciliation_stuck_booked_appointments',
        count: rows.length,
        appointmentIds: rows.map((row) => row.id)
      });
    }
    return rows.map((row) => ({ appointmentId: row.id, appointmentTime: row.appointmentTime.toISOString() }));
  },

  // Safe to auto-heal: Resend was given a stable idempotency key derived from
  // the appointmentId (see resend.notification.ts), so re-attempting the send
  // cannot duplicate a delivery that already went out — it either sends for
  // the first time or gets back the same cached result. Only retried while a
  // "reminder" would still mean something: the appointment hasn't happened
  // yet. (Deliberately *not* the orphaned-reservation grace window — sending
  // a reminder for a slot that's already in the past is never correct, no
  // matter how recently it passed.)
  async findFailedReminderNotifications(_input: ReconciliationInput): Promise<string[]> {
    const rows = await prisma.notification.findMany({
      where: {
        type: NotificationType.APPOINTMENT_REMINDER,
        status: NotificationStatus.FAILED,
        appointment: {
          status: { not: AppointmentStatus.CANCELLED },
          appointmentTime: { gt: new Date() }
        }
      },
      select: { appointmentId: true }
    });
    if (rows.length > 0) {
      logger.warn({
        event: 'reconciliation_retrying_failed_reminders',
        count: rows.length,
        appointmentIds: rows.map((row) => row.appointmentId)
      });
    }
    return rows.map((row) => row.appointmentId);
  }
};
