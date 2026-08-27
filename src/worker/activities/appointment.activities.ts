import { ApplicationFailure } from '@temporalio/activity';
import { AppointmentStatus, NotificationStatus, NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma';
import { getEnv } from '../../shared/config/env';
import { logger } from '../../shared/logging/logger';
import type { AppointmentActivities, AppointmentActivityInput, NotificationInput, StatusUpdateInput } from '../../shared/temporal/contracts';
import { sendReminderEmail } from '../notifications/resend.notification';
import { appointmentOverlapWindow, isAlignedAppointmentSlot, isWithinWorkingHours } from '../../shared/appointmentSlots';

const nonRetryable = (message: string, type: string): never => {
  throw ApplicationFailure.nonRetryable(message, type);
};

let injectedNotificationFailure = false;

export const activities: AppointmentActivities = {
  async validateAppointmentRequest(input: AppointmentActivityInput): Promise<void> {
    if (new Date(input.appointmentTime).getTime() <= Date.now()) nonRetryable('Appointment must be in the future.', 'INVALID_APPOINTMENT_TIME');
    if (!isAlignedAppointmentSlot(input.appointmentTime)) nonRetryable('Appointment must start on a 20-minute boundary.', 'INVALID_APPOINTMENT_TIME');
    if (!isWithinWorkingHours(input.appointmentTime)) nonRetryable('Appointment must be within working hours (7 AM–12 PM or 1 PM–5 PM).', 'INVALID_APPOINTMENT_TIME');
    const [patient, doctor] = await Promise.all([
      prisma.patient.findUnique({ where: { id: input.patientId }, select: { id: true } }),
      prisma.doctor.findUnique({ where: { id: input.doctorId }, select: { id: true } })
    ]);
    if (!patient) nonRetryable('Patient does not exist.', 'PATIENT_NOT_FOUND');
    if (!doctor) nonRetryable('Doctor does not exist.', 'DOCTOR_NOT_FOUND');
  },

  async checkDoctorAvailability(input: AppointmentActivityInput): Promise<void> {
    const overlapWindow = appointmentOverlapWindow(input.appointmentTime);
    const existing = await prisma.slotReservation.findFirst({
      where: {
        doctorId: input.doctorId,
        appointmentId: { not: input.appointmentId },
        appointmentTime: { gt: overlapWindow.after, lt: overlapWindow.before }
      },
      select: { appointmentId: true }
    });
    if (existing) nonRetryable('The requested 20-minute appointment slot is unavailable.', 'DOCTOR_UNAVAILABLE');
  },

  async reserveAppointmentSlot(input: AppointmentActivityInput): Promise<void> {
    try {
      // appointmentId makes retry-after-success return the existing reservation.
      await prisma.slotReservation.upsert({
        where: { appointmentId: input.appointmentId },
        update: {},
        create: {
          appointmentId: input.appointmentId,
          doctorId: input.doctorId,
          appointmentTime: new Date(input.appointmentTime)
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2004')) {
        nonRetryable('The requested 20-minute appointment slot is unavailable.', 'DOCTOR_UNAVAILABLE');
      }
      throw error;
    }
  },

  async releaseAppointmentSlot({ appointmentId }: { appointmentId: string }): Promise<void> {
    // deleteMany makes compensation and repeated cancellation safe.
    await prisma.slotReservation.deleteMany({ where: { appointmentId } });
  },

  async createAppointment(input: AppointmentActivityInput): Promise<void> {
    if (getEnv().DEMO_FAILURE_MODE === 'create-permanent') nonRetryable('Injected permanent creation failure.', 'CREATE_APPOINTMENT_REJECTED');
    // A stable primary key prevents duplicate rows if this Activity is retried.
    await prisma.appointment.upsert({
      where: { id: input.appointmentId },
      update: {},
      create: {
        id: input.appointmentId,
        patientId: input.patientId,
        doctorId: input.doctorId,
        appointmentTime: new Date(input.appointmentTime),
        status: AppointmentStatus.BOOKED
      }
    });
  },

  async sendBookingConfirmation({ appointmentId }: NotificationInput): Promise<void> {
    await sendNotification(appointmentId, NotificationType.BOOKING_CONFIRMATION);
  },

  async sendAppointmentReminder({ appointmentId }: NotificationInput): Promise<void> {
    if (getEnv().DEMO_FAILURE_MODE === 'notification-once' && !injectedNotificationFailure) {
      injectedNotificationFailure = true;
      throw new Error('Injected transient notification provider failure');
    }
    await sendAppointmentReminderNotification(appointmentId);
  },

  async updateAppointmentStatus({ appointmentId, status }: StatusUpdateInput): Promise<void> {
    const desired = AppointmentStatus[status];
    const allowedFrom = status === 'CONFIRMED' ? AppointmentStatus.BOOKED : AppointmentStatus.BOOKED;
    const result = await prisma.appointment.updateMany({
      where: { id: appointmentId, status: allowedFrom },
      data: { status: desired }
    });
    if (result.count === 1) return;
    const current = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { status: true } });
    if (current?.status === desired) return; // idempotent retry
    nonRetryable(`Cannot transition appointment to ${status}.`, 'INVALID_STATUS_TRANSITION');
  }
};

async function sendNotification(appointmentId: string, type: NotificationType): Promise<void> {
  const existing = await prisma.notification.findUnique({
    where: { appointmentId_type: { appointmentId, type } },
    select: { status: true }
  });
  if (existing?.status === NotificationStatus.SENT) return;
  // This demo provider is a structured log. A real provider must receive the same
  // appointmentId+type idempotency key to close the send/record failure window.
  logger.info({ event: 'notification_sent', appointmentId, notificationType: type });
  await prisma.notification.upsert({
    where: { appointmentId_type: { appointmentId, type } },
    update: { status: NotificationStatus.SENT, sentAt: new Date() },
    create: { appointmentId, type, status: NotificationStatus.SENT, sentAt: new Date() }
  });
}

async function sendAppointmentReminderNotification(appointmentId: string): Promise<void> {
  const type = NotificationType.APPOINTMENT_REMINDER;
  const existing = await prisma.notification.findUnique({
    where: { appointmentId_type: { appointmentId, type } },
    select: { status: true }
  });
  if (existing?.status === NotificationStatus.SENT) return;

  const env = getEnv();
  try {
    if (!env.RESEND_API_KEY || !env.REMINDER_EMAIL_TO) {
      logger.error({ event: 'notification_provider_not_configured', appointmentId, notificationType: type });
      // No provider is configured to actually deliver this reminder, so it
      // must not be recorded as SENT. Retryable: an operator fixing the
      // RESEND_API_KEY/REMINDER_EMAIL_TO config and recreating the worker
      // lets a still-retrying Activity attempt succeed without manual replay.
      throw new Error('Reminder notification provider is not configured (RESEND_API_KEY/REMINDER_EMAIL_TO missing).');
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { appointmentTime: true, doctor: { select: { displayName: true } } }
    });
    if (!appointment) throw ApplicationFailure.nonRetryable('Appointment does not exist.', 'APPOINTMENT_NOT_FOUND');

    const providerMessageId = await sendReminderEmail({
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM_EMAIL,
      to: env.REMINDER_EMAIL_TO,
      appointmentId,
      appointmentTime: appointment.appointmentTime.toISOString(),
      doctorName: appointment.doctor.displayName
    });
    logger.info({ event: 'notification_sent', appointmentId, notificationType: type, provider: 'resend', providerMessageId });

    await prisma.notification.upsert({
      where: { appointmentId_type: { appointmentId, type } },
      update: { status: NotificationStatus.SENT, sentAt: new Date() },
      create: { appointmentId, type, status: NotificationStatus.SENT, sentAt: new Date() }
    });
  } catch (error) {
    await prisma.notification.upsert({
      where: { appointmentId_type: { appointmentId, type } },
      update: { status: NotificationStatus.FAILED, sentAt: null },
      create: { appointmentId, type, status: NotificationStatus.FAILED }
    });
    throw error;
  }
}
