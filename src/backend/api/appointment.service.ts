import { WorkflowExecutionAlreadyStartedError } from '@temporalio/client';
import { WorkflowIdConflictPolicy, WorkflowIdReusePolicy } from '@temporalio/common';
import { prisma } from '../../shared/database/prisma';
import { getEnv } from '../../shared/config/env';
import { temporalClient } from '../temporal/client';
import { appointmentStateQuery } from '../../shared/temporal/queries';
import {
  cancelAppointment,
  confirmAppointment,
  markAppointmentCompleted,
  markAppointmentNoShow
} from '../../shared/temporal/signals';
import { appointmentWorkflowId, type AppointmentWorkflow } from '../../shared/temporal/contracts';
import { AppError } from './errors';
import type { AuthenticatedUser } from '../auth/auth.service';
import { assertCanAct, assertCanCreate, assertCanManage, assertCanRead } from '../auth/authorization';
import { logger } from '../../shared/logging/logger';
import { appointmentIdForIdempotencyKey } from './idempotency';
import { appointmentOverlapWindow, extractTzOffsetMinutes } from '../../shared/appointmentSlots';
import { trace } from '@opentelemetry/api';

export interface CreateAppointmentRequest { patientId: string; doctorId: string; appointmentTime: string; }

export type SignalAction = 'confirm' | 'cancel' | 'complete' | 'no-show';

const SIGNAL_BY_ACTION = {
  confirm: confirmAppointment,
  cancel: cancelAppointment,
  complete: markAppointmentCompleted,
  'no-show': markAppointmentNoShow
} as const;

export async function startAppointment(input: CreateAppointmentRequest, user: AuthenticatedUser, requestId: string, idempotencyKey: string) {
  trace.getActiveSpan()?.setAttributes({
    'operation': 'appointment.start',
    'appointment.state': 'REQUESTED',
    'temporal.workflow_type': 'appointmentWorkflow',
    'user.role': user.role
  });
  assertCanCreate(user, input.patientId);
  const appointmentId = appointmentIdForIdempotencyKey(user.userId, idempotencyKey);
  const workflowId = appointmentWorkflowId(appointmentId);
  const overlapWindow = appointmentOverlapWindow(input.appointmentTime);
  const occupied = await prisma.slotReservation.findFirst({
    where: {
      doctorId: input.doctorId,
      appointmentId: { not: appointmentId },
      status: 'RESERVED',
      appointmentTime: { gt: overlapWindow.after, lt: overlapWindow.before }
    },
    select: { appointmentId: true }
  });
  if (occupied) throw new AppError(409, 'DOCTOR_UNAVAILABLE', 'The requested 20-minute appointment slot is unavailable.');

  const env = getEnv();
  try {
    const handle = await temporalClient().workflow.start<AppointmentWorkflow>('appointmentWorkflow', {
      taskQueue: env.TEMPORAL_TASK_QUEUE,
      workflowId,
      // Reject this business operation whether the earlier execution is open
      // or closed; a client retry must never create a new Workflow run.
      workflowIdConflictPolicy: WorkflowIdConflictPolicy.FAIL,
      workflowIdReusePolicy: WorkflowIdReusePolicy.REJECT_DUPLICATE,
      args: [{
        ...input,
        appointmentId,
        appointmentTzOffsetMinutes: extractTzOffsetMinutes(input.appointmentTime),
        confirmationReminderHoursBefore: env.CONFIRMATION_REMINDER_HOURS_BEFORE,
        confirmationDeadlineHoursBefore: env.CONFIRMATION_DEADLINE_HOURS_BEFORE,
        upcomingReminderHoursBefore: env.UPCOMING_REMINDER_HOURS_BEFORE
      }]
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
    return await temporalClient().workflow.getHandle(appointmentWorkflowId(id)).query(appointmentStateQuery);
  } catch {
    throw new AppError(503, 'WORKFLOW_NOT_READY', 'The appointment workflow is not ready for queries yet.');
  }
}

const PRECONDITION_BY_ACTION: Record<SignalAction, ReadonlySet<string>> = {
  confirm: new Set(['BOOKED']),
  cancel: new Set(['BOOKED', 'CONFIRMED']),
  complete: new Set(['CONFIRMED']),
  'no-show': new Set(['CONFIRMED'])
};

export async function signalAppointment(id: string, action: SignalAction, user: AuthenticatedUser, requestId: string): Promise<void> {
  const appointment = await getAuthorizedAppointment(id, user);
  if (action === 'complete' || action === 'no-show') {
    assertCanManage(user, appointment);
  } else {
    assertCanAct(user, appointment);
  }
  if (!PRECONDITION_BY_ACTION[action].has(appointment.status)) {
    throw new AppError(409, 'INVALID_STATUS_TRANSITION', `Cannot ${action} an appointment that is currently ${appointment.status}.`);
  }
  try {
    const handle = temporalClient().workflow.getHandle(appointmentWorkflowId(id));
    await handle.signal(SIGNAL_BY_ACTION[action]);
    logger.info({ event: `appointment_${action}_signalled`, requestId, appointmentId: id, workflowId: appointmentWorkflowId(id), actorUserId: user.userId });
  } catch {
    throw new AppError(503, 'WORKFLOW_NOT_READY', 'The appointment workflow is not ready for signals yet.');
  }
}
