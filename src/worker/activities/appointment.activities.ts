import { ApplicationFailure } from '@temporalio/activity';
import { getEnv } from '../../shared/config/env';
import { APPOINTMENT_SLOT_MINUTES, isAlignedAppointmentSlot } from '../../shared/appointmentSlots';
import { isSlotAvailable } from '../../shared/scheduling/availability';
import { utcInstantToZonedDate } from '../../shared/scheduling/timezone';
import type {
  AppointmentActivities,
  BookingActivityInput,
  BookingValidationResult,
  CreateRequestedAppointmentInput,
  TransitionAppointmentInput
} from '../../shared/temporal/contracts';
import { appointmentRepository } from '../appointment/appointment.repository';
import { schedulingRepository } from '../scheduling/scheduling.repository';
import { trace } from '@opentelemetry/api';

export const appointmentActivities: AppointmentActivities = {
  async validateBooking(input: BookingActivityInput): Promise<BookingValidationResult> {
    if (new Date(input.appointmentTime).getTime() <= Date.now()) {
      return { valid: false, reason: 'Appointment must be in the future.' };
    }
    if (!isAlignedAppointmentSlot(input.appointmentTime)) {
      return { valid: false, reason: 'Appointment must start on a 20-minute boundary.' };
    }
    const [patientExists, doctorExists] = await Promise.all([
      appointmentRepository.patientExists(input.patientId),
      appointmentRepository.doctorExists(input.doctorId)
    ]);
    if (!patientExists) return { valid: false, reason: 'Patient does not exist.' };
    if (!doctorExists) return { valid: false, reason: 'Doctor does not exist.' };

    // Authoritative per-doctor schedule check — never trusts that the
    // frontend previously saw this time as available (spec §6).
    const timeZone = getEnv().CLINIC_TIMEZONE;
    const date = utcInstantToZonedDate(input.appointmentTime, timeZone);
    const context = await schedulingRepository.getAvailabilityContext(input.doctorId, date, timeZone);
    if (context.clinicClosed) return { valid: false, reason: 'The clinic is closed on the requested date.' };
    if (context.exception?.type === 'UNAVAILABLE' && !context.exception.startTime) {
      return { valid: false, reason: 'The doctor is unavailable on the requested date.' };
    }
    if (!isSlotAvailable(input.appointmentTime, { ...context, durationMinutes: APPOINTMENT_SLOT_MINUTES })) {
      return { valid: false, reason: "Requested time is outside the doctor's available hours." };
    }
    return { valid: true };
  },

  async createRequestedAppointment(input: CreateRequestedAppointmentInput): Promise<void> {
    await appointmentRepository.createRequested(input);
  },

  async transitionAppointment(input: TransitionAppointmentInput): Promise<void> {
    trace.getActiveSpan()?.setAttribute('appointment.state', input.to);
    if (input.to === 'BOOKED' && getEnv().DEMO_FAILURE_MODE === 'create-permanent') {
      throw ApplicationFailure.nonRetryable('Injected permanent creation failure.', 'CREATE_APPOINTMENT_REJECTED');
    }
    await appointmentRepository.transition(input);
  }
};
