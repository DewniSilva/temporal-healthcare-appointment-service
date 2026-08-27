import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from '@temporalio/common';
import { prisma } from '../../shared/database/prisma';
import { getEnv } from '../../shared/config/env';
import { temporalClient } from '../temporal/client';
import { appointmentStateQuery } from '../../shared/temporal/queries';
import { cancelAppointment, confirmAppointment } from '../../shared/temporal/signals';
import { bookingWorkflowId, reminderWorkflowId, type AppointmentBookingWorkflow } from '../../shared/temporal/contracts';
import { AppError } from './errors';
import type { AuthenticatedUser } from '../auth/auth.service';
import { assertCanAct, assertCanCreate, assertCanRead } from '../auth/authorization';
import { logger } from '../../shared/logging/logger';
import { appointmentIdForIdempotencyKey } from './idempotency';
import { appointmentOverlapWindow } from '../../shared/appointmentSlots';

export interface CreateAppointmentRequest { patientId: string; doctorId: string; appointmentTime: string; }

export async function startAppointment(input: CreateAppointmentRequest, user: AuthenticatedUser, requestId: string, idempotencyKey: string) {
  assertCanCreate(user, input.patientId);
  const appointmentId = appointmentIdForIdempotencyKey(user.userId, idempotencyKey);
  const workflowId = bookingWorkflowId(appointmentId);
  const overlapWindow = appointmentOverlapWindow(input.appointmentTime);
  const occupied = await prisma.slotReservation.findFirst({
    where: {
      doctorId: input.doctorId,
      appointmentId: { not: appointmentId },
      appointmentTime: { gt: overlapWindow.after, lt: overlapWindow.before }
    },
    select: { appointmentId: true }
  });
  if (occupied) throw new AppError(409, 'DOCTOR_UNAVAILABLE', 'The requested 20-minute appointment slot is unavailable.');
  try {
    const handle = await temporalClient().workflow.start<AppointmentBookingWorkflow>('appointmentBookingWorkflow', {
      taskQueue: getEnv().TEMPORAL_TASK_QUEUE,
      workflowId,
      // Reject this business operation whether the earlier execution is open
      // or closed; a client retry must never create a new Workflow run.
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.FAIL,
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
      args: [{ ...input, appointmentId, reminderLeadTimeSeconds: getEnv().REMINDER_LEAD_TIME_SECONDS }]
    });
    logger.info({ event: 'appointment_booking_started', requestId, appointmentId, workflowId, runId: handle.firstExecutionRunId });
    return { appointmentId, workflowId, status: 'STARTED' as const };
  } catch (error) {
    if (error instanceof WorkflowExecutionAlreadyStartedError) return { appointmentId, workflowId, status: 'ALREADY_STARTED' as const };
    throw new AppError(503, 'TEMPORAL_UNAVAILABLE', 'The booking service is temporarily unavailable.');
  }
}

export async function getAuthorizedAppointment(id: string, user: AuthenticatedUser) {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    select: { id: true, patientId: true, doctorId: true, appointmentTime: true, status: true, createdAt: true, updatedAt: true }
  });
  if (!appointment) throw new AppError(404, 'APPOINTMENT_NOT_FOUND', 'Appointment not found.');
  assertCanRead(user, appointment);
  return appointment;
}

export async function getWorkflowState(id: string, user: AuthenticatedUser) {
  await getAuthorizedAppointment(id, user);
  try {
    return await temporalClient().workflow.getHandle(reminderWorkflowId(id)).query(appointmentStateQuery);
  } catch {
    throw new AppError(503, 'WORKFLOW_NOT_READY', 'The appointment workflow is not ready for queries yet.');
  }
}

export async function signalAppointment(id: string, action: 'confirm' | 'cancel', user: AuthenticatedUser, requestId: string): Promise<void> {
  const appointment = await getAuthorizedAppointment(id, user);
  assertCanAct(user, appointment);
  if (appointment.status === 'CANCELLED' && action === 'confirm') throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'A cancelled appointment cannot be confirmed.');
  try {
    const handle = temporalClient().workflow.getHandle(reminderWorkflowId(id));
    await handle.signal(action === 'confirm' ? confirmAppointment : cancelAppointment);
    logger.info({ event: `appointment_${action}_signalled`, requestId, appointmentId: id, workflowId: reminderWorkflowId(id), actorUserId: user.userId });
  } catch {
    throw new AppError(503, 'WORKFLOW_NOT_READY', 'The appointment workflow is not ready for signals yet.');
  }
}
