import { ApplicationFailure } from '@temporalio/activity';
import type { ReservationActivities, ReserveSlotInput } from '../../shared/temporal/contracts';
import { reservationRepository, SlotConflictError } from '../reservation/reservation.repository';

export const reservationActivities: ReservationActivities = {
  async reserveSlot(input: ReserveSlotInput): Promise<void> {
    try {
      await reservationRepository.reserve(input);
    } catch (error) {
      if (error instanceof SlotConflictError) {
        throw ApplicationFailure.nonRetryable(error.message, 'DOCTOR_UNAVAILABLE');
      }
      throw error;
    }
  },

  async releaseSlot({ appointmentId }: { appointmentId: string }): Promise<{ released: boolean }> {
    return reservationRepository.release(appointmentId);
  }
};
