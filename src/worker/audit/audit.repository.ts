import { prisma } from '../../shared/database/prisma';
import type { ActorRole } from '../../shared/appointment/appointment.types';

export interface AuditRecordInput {
  appointmentId: string;
  actorId: string | null;
  actorRole: ActorRole;
  action: string;
  previousState: string | null;
  newState: string;
  correlationId?: string;
}

export const auditRepository = {
  async record(input: AuditRecordInput): Promise<void> {
    await prisma.auditLog.create({
      data: {
        appointmentId: input.appointmentId,
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: input.action,
        previousState: input.previousState,
        newState: input.newState,
        correlationId: input.correlationId
      }
    });
  }
};
