import { ApplicationFailure } from '@temporalio/activity';
import { getEnv } from '../../shared/config/env';
import { isAlignedAppointmentSlot, isWithinWorkingHours } from '../../shared/appointmentSlots';
import type {
  AppointmentActivities,
  BookingActivityInput,
  BookingValidationResult,
  CreateRequestedAppointmentInput,
  TransitionAppointmentInput
} from '../../shared/temporal/contracts';
import { appointmentRepository } from '../appointment/appointment.repository';

export const appointmentActivities: AppointmentActivities = {
  async validateBooking(input: BookingActivityInput): Promise<BookingValidationResult> {
    if (new Date(input.appointmentTime).getTime() <= Date.now()) {
      return { valid: false, reason: 'Appointment must be in the future.' };
    }
    if (!isAlignedAppointmentSlot(input.appointmentTime)) {
      return { valid: false, reason: 'Appointment must start on a 20-minute boundary.' };
    }
    if (!isWithinWorkingHours(input.appointmentTime)) {
      return { valid: false, reason: 'Appointment must be within working hours (7 AM–12 PM or 1 PM–5 PM).' };
    }
    const [patientExists, doctorExists] = await Promise.all([
      appointmentRepository.patientExists(input.patientId),
      appointmentRepository.doctorExists(input.doctorId)
    ]);
    if (!patientExists) return { valid: false, reason: 'Patient does not exist.' };
    if (!doctorExists) return { valid: false, reason: 'Doctor does not exist.' };
    return { valid: true };
  },

  async createRequestedAppointment(input: CreateRequestedAppointmentInput): Promise<void> {
    await appointmentRepository.createRequested(input);
  },

  async transitionAppointment(input: TransitionAppointmentInput): Promise<void> {
    if (input.to === 'BOOKED' && getEnv().DEMO_FAILURE_MODE === 'create-permanent') {
      throw ApplicationFailure.nonRetryable('Injected permanent creation failure.', 'CREATE_APPOINTMENT_REJECTED');
    }
    await appointmentRepository.transition(input);
  }
};
