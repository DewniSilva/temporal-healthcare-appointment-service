import { prisma } from '../../shared/database/prisma';
import { assertValidReminderTransition } from '../../shared/reminder/reminder.state-machine';
import type { ReminderStatus, ReminderType } from '../../shared/reminder/reminder.types';
import { auditRepository } from '../audit/audit.repository';

export function reminderIdempotencyKey(appointmentId: string, type: ReminderType): string {
  const suffix = type === 'CONFIRMATION_REMINDER' ? 'confirmation-reminder' : 'upcoming-reminder';
  return `appointment-${appointmentId}-${suffix}`;
}

async function transition(
  appointmentId: string,
  type: ReminderType,
  to: ReminderStatus,
  extra: Record<string, unknown> = {}
): Promise<boolean> {
  const current = await prisma.reminder.findUnique({
    where: { appointmentId_type: { appointmentId, type } },
    select: { status: true }
  });
  if (!current) throw new Error(`Reminder ${type} for appointment ${appointmentId} does not exist.`);
  if (current.status === to) return false;

  assertValidReminderTransition(current.status, to);

  const result = await prisma.reminder.updateMany({
    where: { appointmentId, type, status: current.status },
    data: { status: to, ...extra }
  });
  if (result.count === 0) {
    const after = await prisma.reminder.findUnique({ where: { appointmentId_type: { appointmentId, type } }, select: { status: true } });
    if (after?.status === to) return false;
    throw new Error(`Concurrent write conflict transitioning reminder ${type} for ${appointmentId} to ${to}.`);
  }

  await auditRepository.record({
    appointmentId,
    actorId: null,
    actorRole: 'SYSTEM',
    action: 'REMINDER_TRANSITION',
    previousState: `${type}:${current.status}`,
    newState: `${type}:${to}`
  });
  return true;
}

export const reminderRepository = {
  // Idempotent: called once when the appointment becomes BOOKED. A retry
  // finds the row already created and does nothing.
  async schedule(appointmentId: string, type: ReminderType, scheduledAt: string): Promise<void> {
    await prisma.reminder.upsert({
      where: { appointmentId_type: { appointmentId, type } },
      update: {},
      create: {
        appointmentId,
        type,
        status: 'SCHEDULED',
        idempotencyKey: reminderIdempotencyKey(appointmentId, type),
        scheduledAt: new Date(scheduledAt)
      }
    });
  },

  async get(appointmentId: string, type: ReminderType) {
    return prisma.reminder.findUnique({ where: { appointmentId_type: { appointmentId, type } } });
  },

  // SCHEDULED|PENDING -> CANCELLED. A reminder already SENT/DELIVERED/etc. is
  // left alone (preserved as historical record, per spec §13). Returns
  // whether this call actually cancelled something.
  async cancelIfPending(appointmentId: string, type: ReminderType): Promise<boolean> {
    const current = await prisma.reminder.findUnique({ where: { appointmentId_type: { appointmentId, type } }, select: { status: true } });
    if (!current || (current.status !== 'SCHEDULED' && current.status !== 'PENDING')) return false;
    return transition(appointmentId, type, 'CANCELLED');
  },

  async markPending(appointmentId: string, type: ReminderType): Promise<void> {
    await transition(appointmentId, type, 'PENDING');
  },

  async markSending(appointmentId: string, type: ReminderType): Promise<void> {
    await transition(appointmentId, type, 'SENDING', { attemptCount: { increment: 1 } });
  },

  async markSent(appointmentId: string, type: ReminderType, providerMessageId: string): Promise<void> {
    await transition(appointmentId, type, 'SENT', { sentAt: new Date(), providerMessageId });
  },

  async markFailed(appointmentId: string, type: ReminderType, lastError: string): Promise<void> {
    await transition(appointmentId, type, 'FAILED', { failedAt: new Date(), lastError });
  },

  async markCancelled(appointmentId: string, type: ReminderType): Promise<void> {
    await transition(appointmentId, type, 'CANCELLED');
  }
};
