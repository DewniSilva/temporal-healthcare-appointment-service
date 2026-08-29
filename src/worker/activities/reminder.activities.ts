import { getEnv } from '../../shared/config/env';
import { logger } from '../../shared/logging/logger';
import { canSendReminder, computeReminderSchedule } from '../../shared/reminder/reminder.policy';
import { buildConfirmationReminderEmail, buildUpcomingReminderEmail } from '../../shared/reminder/reminder.templates';
import { REMINDER_STATUSES_SKIPPING_SEND } from '../../shared/reminder/reminder.types';
import type { ReminderType } from '../../shared/reminder/reminder.types';
import type {
  ReminderActivities,
  ReminderActivityInput,
  ScheduleRemindersInput
} from '../../shared/temporal/contracts';
import { appointmentRepository } from '../appointment/appointment.repository';
import { reminderRepository, reminderIdempotencyKey } from '../reminder/reminder.repository';
import { sendEmail } from '../notifications/resend.notification';

let injectedNotificationFailure = false;

/** Moves SCHEDULED/FAILED -> PENDING -> SENDING, tolerating a retry that already got partway there. */
async function ensureSending(appointmentId: string, type: ReminderType): Promise<string> {
  let reminder = await reminderRepository.get(appointmentId, type);
  if (!reminder) throw new Error(`Reminder ${type} for appointment ${appointmentId} does not exist.`);

  if (reminder.status === 'SCHEDULED' || reminder.status === 'FAILED') {
    await reminderRepository.markPending(appointmentId, type);
    reminder = await reminderRepository.get(appointmentId, type);
  }
  if (reminder?.status === 'PENDING') {
    await reminderRepository.markSending(appointmentId, type);
    reminder = await reminderRepository.get(appointmentId, type);
  }
  return reminder!.status;
}

export const reminderActivities: ReminderActivities = {
  async scheduleReminders(input: ScheduleRemindersInput): Promise<void> {
    await Promise.all([
      reminderRepository.schedule(input.appointmentId, 'CONFIRMATION_REMINDER', input.confirmationReminderAt),
      reminderRepository.schedule(input.appointmentId, 'UPCOMING_REMINDER', input.upcomingReminderAt)
    ]);
  },

  async cancelReminder({ appointmentId, type }: ReminderActivityInput): Promise<{ cancelled: boolean }> {
    const cancelled = await reminderRepository.cancelIfPending(appointmentId, type);
    return { cancelled };
  },

  async sendReminder({ appointmentId, type }: ReminderActivityInput): Promise<{ sent: boolean }> {
    const reminder = await reminderRepository.get(appointmentId, type);
    if (!reminder) throw new Error(`Reminder ${type} for appointment ${appointmentId} does not exist.`);
    // Already sent (or otherwise terminal) — a retried/duplicated call must not send twice.
    if (REMINDER_STATUSES_SKIPPING_SEND.has(reminder.status)) return { sent: false };

    const appointment = await appointmentRepository.getForReminder(appointmentId);
    if (!appointment) throw new Error(`Appointment ${appointmentId} does not exist.`);

    if (!canSendReminder(type, appointment.status, appointment.appointmentTime.getTime(), Date.now())) {
      logger.info({ event: 'reminder_precondition_failed', appointmentId, type, appointmentStatus: appointment.status });
      await reminderRepository.cancelIfPending(appointmentId, type);
      return { sent: false };
    }

    await ensureSending(appointmentId, type);

    const env = getEnv();
    try {
      if (env.DEMO_FAILURE_MODE === 'notification-once' && !injectedNotificationFailure) {
        injectedNotificationFailure = true;
        throw new Error('Injected transient notification provider failure');
      }
      if (!env.RESEND_API_KEY) {
        // Retryable: an operator fixing RESEND_API_KEY and recreating the
        // worker lets a still-retrying Activity attempt succeed without
        // manual replay.
        throw new Error('Reminder notification provider is not configured (RESEND_API_KEY missing).');
      }

      const recipient = env.REMINDER_EMAIL_TO ?? appointment.patient.user.email;
      const facts = {
        patientName: appointment.patient.displayName,
        doctorName: appointment.doctor.displayName,
        appointmentTime: appointment.appointmentTime.toISOString(),
        appointmentTzOffsetMinutes: appointment.appointmentTzOffsetMinutes
      };
      const message = type === 'CONFIRMATION_REMINDER'
        ? buildConfirmationReminderEmail({
            ...facts,
            confirmationDeadlineAt: computeReminderSchedule(facts.appointmentTime, {
              confirmationReminderHoursBefore: env.CONFIRMATION_REMINDER_HOURS_BEFORE,
              confirmationDeadlineHoursBefore: env.CONFIRMATION_DEADLINE_HOURS_BEFORE,
              upcomingReminderHoursBefore: env.UPCOMING_REMINDER_HOURS_BEFORE
            }).confirmationDeadlineAt
          })
        : buildUpcomingReminderEmail(facts);

      const providerMessageId = await sendEmail({
        apiKey: env.RESEND_API_KEY,
        from: env.RESEND_FROM_EMAIL,
        to: recipient,
        idempotencyKey: reminderIdempotencyKey(appointmentId, type),
        message
      });
      logger.info({ event: 'reminder_sent', appointmentId, type, provider: 'resend', providerMessageId });
      await reminderRepository.markSent(appointmentId, type, providerMessageId);
      return { sent: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await reminderRepository.markFailed(appointmentId, type, message);
      throw error;
    }
  }
};
