import { prisma } from '../../shared/database/prisma';
import { assertValidAppointmentTransition } from '../../shared/appointment/appointment.state-machine';
import type { AppointmentStatus, TransitionActor } from '../../shared/appointment/appointment.types';
import { auditRepository } from '../audit/audit.repository';

export interface CreateRequestedInput {
  appointmentId: string;
  patientId: string;
  doctorId: string;
  appointmentTime: string;
  appointmentTzOffsetMinutes: number;
}

export interface TransitionInput {
  appointmentId: string;
  to: AppointmentStatus;
  actor: TransitionActor;
  reason?: string;
  correlationId?: string;
}

export const appointmentRepository = {
  async patientExists(patientId: string): Promise<boolean> {
    return (await prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } })) !== null;
  },

  async doctorExists(doctorId: string): Promise<boolean> {
    return (await prisma.doctor.findUnique({ where: { id: doctorId }, select: { id: true } })) !== null;
  },

  // A stable primary key makes this Activity retry-safe.
  async createRequested(input: CreateRequestedInput): Promise<void> {
    await prisma.appointment.upsert({
      where: { id: input.appointmentId },
      update: {},
      create: {
        id: input.appointmentId,
        patientId: input.patientId,
        doctorId: input.doctorId,
        appointmentTime: new Date(input.appointmentTime),
        appointmentTzOffsetMinutes: input.appointmentTzOffsetMinutes,
        status: 'REQUESTED'
      }
    });
  },

  async getForReminder(appointmentId: string) {
    return prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        status: true,
        appointmentTime: true,
        appointmentTzOffsetMinutes: true,
        doctor: { select: { displayName: true } },
        patient: { select: { displayName: true, user: { select: { email: true } } } }
      }
    });
  },

  /**
   * The single place appointment transitions are performed. Validates the
   * transition against the shared state machine, applies it with an
   * optimistic-concurrency guard (`WHERE status = <expected-from>`), records
   * an audit row, and is a no-op success if the row is already at `to` — so a
   * retried Temporal Activity call is always safe.
   */
  async transition(input: TransitionInput): Promise<void> {
    const current = await prisma.appointment.findUnique({ where: { id: input.appointmentId }, select: { status: true } });
    if (!current) throw new Error(`Appointment ${input.appointmentId} does not exist.`);
    if (current.status === input.to) return;

    assertValidAppointmentTransition(current.status, input.to);

    const result = await prisma.appointment.updateMany({
      where: { id: input.appointmentId, status: current.status },
      data: {
        status: input.to,
        ...(input.to === 'CONFIRMED' ? { confirmedAt: new Date() } : {})
      }
    });

    if (result.count === 0) {
      const after = await prisma.appointment.findUnique({ where: { id: input.appointmentId }, select: { status: true } });
      if (after?.status === input.to) return;
      throw new Error(`Concurrent write conflict transitioning appointment ${input.appointmentId} to ${input.to}.`);
    }

    await auditRepository.record({
      appointmentId: input.appointmentId,
      actorId: input.actor.actorId,
      actorRole: input.actor.actorRole,
      action: 'APPOINTMENT_TRANSITION',
      previousState: current.status,
      newState: input.to,
      correlationId: input.correlationId
    });
  }
};
