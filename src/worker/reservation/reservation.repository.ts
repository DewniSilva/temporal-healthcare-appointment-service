import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/database/prisma';

export class SlotConflictError extends Error {
  constructor(message = 'The requested 20-minute appointment slot is unavailable.') {
    super(message);
    this.name = 'SlotConflictError';
  }
}

export interface ReserveInput {
  appointmentId: string;
  doctorId: string;
  appointmentTime: string;
}

function isConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2004');
}

export const reservationRepository = {
  /**
   * RESERVING -> RESERVED, guarded by the DB exclusion constraint (scoped to
   * status = RESERVED in the migration), not just an application-level check.
   * Retry-safe: re-running after a crash between the two steps below either
   * finds the row already RESERVED (no-op) or still RESERVING (resumes at
   * step 2).
   */
  async reserve(input: ReserveInput): Promise<void> {
    const appointmentTime = new Date(input.appointmentTime);
    const existing = await prisma.slotReservation.findUnique({
      where: { appointmentId: input.appointmentId },
      select: { status: true }
    });
    if (existing?.status === 'RESERVED') return;
    if (existing?.status === 'CONFLICTED') throw new SlotConflictError();

    if (!existing) {
      await prisma.slotReservation.create({
        data: { appointmentId: input.appointmentId, doctorId: input.doctorId, appointmentTime, status: 'RESERVING' }
      });
    }

    try {
      await prisma.slotReservation.update({
        where: { appointmentId: input.appointmentId },
        data: { status: 'RESERVED' }
      });
    } catch (error) {
      if (!isConstraintViolation(error)) throw error;
      await prisma.slotReservation.update({
        where: { appointmentId: input.appointmentId },
        data: { status: 'CONFLICTED' }
      });
      throw new SlotConflictError();
    }
  },

  // Idempotent: RESERVED|RESERVING -> RELEASED; a no-op if already RELEASED
  // or CONFLICTED, so a repeated Activity retry is always safe. Returns
  // whether this call actually changed anything, so callers (reconciliation)
  // can distinguish "I fixed something" from "already fine".
  async release(appointmentId: string): Promise<{ released: boolean }> {
    const result = await prisma.slotReservation.updateMany({
      where: { appointmentId, status: { in: ['RESERVING', 'RESERVED'] } },
      data: { status: 'RELEASED' }
    });
    return { released: result.count > 0 };
  }
};
