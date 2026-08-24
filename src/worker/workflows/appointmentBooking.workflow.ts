import { executeChild, proxyActivities } from '@temporalio/workflow';
import type { AppointmentActivities, AppointmentBookingInput, AppointmentWorkflowState } from '../../shared/temporal/contracts';
import { reminderWorkflowId } from '../../shared/temporal/contracts';
import { appointmentReminderWorkflow } from './appointmentReminder.workflow';

const validation = proxyActivities<AppointmentActivities>({
  startToCloseTimeout: '5 seconds', scheduleToCloseTimeout: '15 seconds',
  retry: { initialInterval: '1 second', maximumInterval: '3 seconds', maximumAttempts: 3,
    nonRetryableErrorTypes: ['INVALID_APPOINTMENT_TIME', 'PATIENT_NOT_FOUND', 'DOCTOR_NOT_FOUND', 'DOCTOR_UNAVAILABLE'] }
});
const persistence = proxyActivities<AppointmentActivities>({
  startToCloseTimeout: '10 seconds', scheduleToCloseTimeout: '45 seconds',
  retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumInterval: '8 seconds', maximumAttempts: 4,
    nonRetryableErrorTypes: ['DOCTOR_UNAVAILABLE', 'CREATE_APPOINTMENT_REJECTED'] }
});
const notification = proxyActivities<AppointmentActivities>({
  startToCloseTimeout: '10 seconds', scheduleToCloseTimeout: '1 minute',
  retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumInterval: '10 seconds', maximumAttempts: 5 }
});

export async function appointmentBookingWorkflow(input: AppointmentBookingInput): Promise<AppointmentWorkflowState> {
  const activityInput = {
    appointmentId: input.appointmentId,
    patientId: input.patientId,
    doctorId: input.doctorId,
    appointmentTime: input.appointmentTime
  };
  await validation.validateAppointmentRequest(activityInput);
  await validation.checkDoctorAvailability(activityInput);
  await persistence.reserveAppointmentSlot(activityInput);
  try {
    await persistence.createAppointment(activityInput);
  } catch (error) {
    // Explicit Saga compensation runs only after retries are exhausted or a permanent failure occurs.
    await persistence.releaseAppointmentSlot({ appointmentId: input.appointmentId });
    throw error;
  }
  await notification.sendBookingConfirmation({ appointmentId: input.appointmentId });
  return executeChild(appointmentReminderWorkflow, {
    workflowId: reminderWorkflowId(input.appointmentId),
    args: [{ appointmentId: input.appointmentId, appointmentTime: input.appointmentTime, reminderLeadTimeSeconds: input.reminderLeadTimeSeconds }]
  });
}
