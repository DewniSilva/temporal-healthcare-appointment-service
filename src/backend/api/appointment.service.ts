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
import { Prisma } from '@prisma/client';
import type { AppointmentListQuery } from './appointment.schema';
import { nextCalendarDate, utcInstantToZonedDate, zonedWallClockToUtc } from '../../shared/scheduling/timezone';

export interface CreateAppointmentRequest { patientId: string; doctorId: string; appointmentTime: string; }

export type SignalAction = 'confirm' | 'cancel' | 'complete' | 'no-show';

interface AppointmentCursor { id: string; }

function decodeCursor(value: string): AppointmentCursor {
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    if (!decoded || typeof decoded !== 'object' || typeof (decoded as { id?: unknown }).id !== 'string') throw new Error('invalid');
    return decoded as AppointmentCursor;
  } catch {
    throw new AppError(400, 'INVALID_CURSOR', 'The appointment list cursor is invalid.');
  }
}

function encodeCursor(id: string): string {
  return Buffer.from(JSON.stringify({ id }), 'utf8').toString('base64url');
}

export interface AppointmentListItem {
  id: string;
  appointmentTime: Date;
  status: string;
  confirmedAt: Date | null;
  updatedAt: Date;
  patient: { id: string; displayName: string };
  doctor: { id: string; displayName: string };
  actionRequired: boolean;
}

export interface AppointmentListResponse {
  items: AppointmentListItem[];
  nextCursor: string | null;
  total: number;
}

const APPOINTMENT_STATUSES = ['REQUESTED', 'RESERVING', 'BOOKED', 'CONFIRMED', 'NO_RESPONSE', 'CANCELLED', 'COMPLETED', 'NO_SHOW', 'REJECTED', 'BOOKING_FAILED'] as const;

export interface AppointmentSummary {
  total: number;
  byStatus: Record<(typeof APPOINTMENT_STATUSES)[number], number>;
  actionRequired: number;
}

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

/**
 * Returns an appointment worklist with ownership enforced in the database
 * query itself. This is deliberately separate from getAuthorizedAppointment:
 * list endpoints must never fetch a broad result set and filter it in memory.
 */
export async function listAppointments(query: AppointmentListQuery, user: AuthenticatedUser): Promise<AppointmentListResponse> {
  if (user.role !== 'ADMIN' && (query.doctorId || query.patientId)) {
    throw new AppError(403, 'FORBIDDEN', 'Only an admin can filter appointments by doctor or patient.');
  }

  const predicates: Prisma.AppointmentWhereInput[] = [];
  if (user.role === 'PATIENT') predicates.push({ patientId: user.patientId });
  if (user.role === 'DOCTOR') predicates.push({ doctorId: user.doctorId });
  if (query.doctorId) predicates.push({ doctorId: query.doctorId });
  if (query.patientId) predicates.push({ patientId: query.patientId });
  if (query.status) predicates.push({ status: { in: query.status } });

  const appointmentTime: Prisma.DateTimeFilter = {};
  if (query.from) appointmentTime.gte = new Date(query.from);
  if (query.to) appointmentTime.lte = new Date(query.to);

  const now = new Date();
  const confirmationCutoff = new Date(now.getTime() + getEnv().CONFIRMATION_DEADLINE_HOURS_BEFORE * 60 * 60 * 1_000);
  if (query.view === 'today') {
    const timeZone = getEnv().CLINIC_TIMEZONE;
    const today = utcInstantToZonedDate(now, timeZone);
    appointmentTime.gte = zonedWallClockToUtc(today, '00:00', timeZone);
    appointmentTime.lt = zonedWallClockToUtc(nextCalendarDate(today), '00:00', timeZone);
  } else if (query.view === 'upcoming') {
    appointmentTime.gte = now;
  } else if (query.view === 'past') {
    appointmentTime.lt = now;
  }
  if (Object.keys(appointmentTime).length > 0) predicates.push({ appointmentTime });

  if (query.view === 'action-required') {
    predicates.push({ OR: [
      { status: 'CONFIRMED', appointmentTime: { lt: now } },
      { status: 'BOOKED', appointmentTime: { lte: confirmationCutoff } },
      { reminders: { some: { status: 'FAILED' } } }
    ] });
  }

  const where: Prisma.AppointmentWhereInput = predicates.length === 0 ? {} : { AND: predicates };
  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;
  const order = query.sort === 'appointmentTime:desc' ? 'desc' : 'asc';
  const records = await prisma.appointment.findMany({
    where,
    ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
    take: query.limit + 1,
    orderBy: [{ appointmentTime: order }, { id: order }],
    select: {
      id: true, appointmentTime: true, status: true, confirmedAt: true, updatedAt: true,
      patient: { select: { id: true, displayName: true } },
      doctor: { select: { id: true, displayName: true } },
      reminders: { where: { status: 'FAILED' }, select: { id: true }, take: 1 }
    }
  });
  const hasNextPage = records.length > query.limit;
  const page = records.slice(0, query.limit);
  const total = await prisma.appointment.count({ where });

  return {
    items: page.map(({ reminders, ...appointment }) => ({
      ...appointment,
      actionRequired: (appointment.status === 'CONFIRMED' && appointment.appointmentTime < now) ||
        (appointment.status === 'BOOKED' && appointment.appointmentTime <= confirmationCutoff) || reminders.length > 0
    })),
    nextCursor: hasNextPage && page.length > 0 ? encodeCursor(page[page.length - 1].id) : null,
    total
  };
}

/** Global operational counts are deliberately admin-only: totals can reveal
 * clinic activity even when individual appointment records are hidden. */
export async function getAppointmentSummary(user: AuthenticatedUser): Promise<AppointmentSummary> {
  if (user.role !== 'ADMIN') throw new AppError(403, 'FORBIDDEN', 'Only an admin can view appointment summaries.');
  const now = new Date();
  const confirmationCutoff = new Date(now.getTime() + getEnv().CONFIRMATION_DEADLINE_HOURS_BEFORE * 60 * 60 * 1_000);
  const [groups, actionRequired] = await Promise.all([
    prisma.appointment.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.appointment.count({
      where: {
        OR: [
          { status: 'CONFIRMED', appointmentTime: { lt: now } },
          { status: 'BOOKED', appointmentTime: { lte: confirmationCutoff } },
          { reminders: { some: { status: 'FAILED' } } }
        ]
      }
    })
  ]);
  const byStatus = Object.fromEntries(APPOINTMENT_STATUSES.map((status) => [status, 0])) as AppointmentSummary['byStatus'];
  for (const group of groups) byStatus[group.status] = group._count._all;
  return { total: groups.reduce((sum, group) => sum + group._count._all, 0), byStatus, actionRequired };
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
