import { ApplicationFailure } from '@temporalio/activity';
import { AppointmentStatus, NotificationStatus, NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma';
import { getEnv } from '../../shared/config/env';
import { logger } from '../../shared/logging/logger';
import type { AppointmentActivities, AppointmentActivityInput, NotificationInput, StatusUpdateInput } from '../../shared/temporal/contracts';

const nonRetryable = (message: string, type: string): never => {
  throw ApplicationFailure.nonRetryable(message, type);
};

let injectedNotificationFailure = false;

export const activities: AppointmentActivities = {
  async validateAppointmentRequest(input: AppointmentActivityInput): Promise<void> {
    if (new Date(input.appointmentTime).getTime() <= Date.now()) nonRetryable('Appointment must be in the future.', 'INVALID_APPOINTMENT_TIME');
    const [patient, doctor] = await Promise.all([
      prisma.patient.findUnique({ where: { id: input.patientId }, select: { id: true } }),
      prisma.doctor.findUnique({ where: { id: input.doctorId }, select: { id: true } })
    ]);
    if (!patient) nonRetryable('Patient does not exist.', 'PATIENT_NOT_FOUND');
    if (!doctor) nonRetryable('Doctor does not exist.', 'DOCTOR_NOT_FOUND');
  },

  async checkDoctorAvailability(input: AppointmentActivityInput): Promise<void> {
    const existing = await prisma.slotReservation.findUnique({
      where: { doctorId_appointmentTime: { doctorId: input.doctorId, appointmentTime: new Date(input.appointmentTime) } },
      select: { appointmentId: true }
    });
    if (existing && existing.appointmentId !== input.appointmentId) nonRetryable('The requested appointment slot is unavailable.', 'DOCTOR_UNAVAILABLE');
  },

  async reserveAppointmentSlot(input: AppointmentActivityInput): Promise<void> {
    try {
      // appointmentId makes retry-after-success return the existing reservation.
      await prisma.slotReservation.upsert({
        where: { appointmentId: input.appointmentId },
        update: {},
        create: { appointmentId: input.appointmentId, doctorId: input.doctorId, appointmentTime: new Date(input.appointmentTime) }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        nonRetryable('The requested appointment slot is unavailable.', 'DOCTOR_UNAVAILABLE');
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
    await sendNotification(appointmentId, NotificationType.APPOINTMENT_REMINDER);
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
