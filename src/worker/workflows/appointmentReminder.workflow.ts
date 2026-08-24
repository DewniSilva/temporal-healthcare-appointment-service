import { condition, proxyActivities, setHandler, sleep } from '@temporalio/workflow';
import type { AppointmentActivities } from '../../shared/temporal/contracts';
import type { AppointmentReminderInput, AppointmentWorkflowState } from '../../shared/temporal/contracts';
import { confirmAppointment, cancelAppointment } from '../../shared/temporal/signals';
import { appointmentStateQuery } from '../../shared/temporal/queries';

const { sendAppointmentReminder, updateAppointmentStatus, releaseAppointmentSlot } = proxyActivities<AppointmentActivities>({
  startToCloseTimeout: '10 seconds',
  scheduleToCloseTimeout: '1 minute',
  retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumInterval: '10 seconds', maximumAttempts: 5,
    nonRetryableErrorTypes: ['INVALID_STATUS_TRANSITION'] }
});

export async function appointmentReminderWorkflow(input: AppointmentReminderInput): Promise<AppointmentWorkflowState> {
  const state: AppointmentWorkflowState = { status: 'SCHEDULED', reminderSent: false, confirmed: false, cancelled: false };

  setHandler(appointmentStateQuery, () => ({ ...state }));
  setHandler(confirmAppointment, () => { if (!state.cancelled) state.confirmed = true; });
  setHandler(cancelAppointment, () => { if (!state.confirmed) state.cancelled = true; });

  const reminderAt = new Date(input.appointmentTime).getTime() - input.reminderLeadTimeSeconds * 1_000;
  const delayMs = Math.max(0, reminderAt - Date.now());
  if (delayMs > 0) {
    // Race the durable timer with human action so an early cancellation is not
    // forced to wait for the reminder date. Temporal records/cancels the timer.
    await Promise.race([sleep(delayMs), condition(() => state.confirmed || state.cancelled)]);
  }

  // An action arriving before the reminder avoids an unnecessary notification.
  if (!state.cancelled && !state.confirmed) {
    await sendAppointmentReminder({ appointmentId: input.appointmentId });
    state.reminderSent = true;
    state.status = 'WAITING_FOR_CONFIRMATION';
  }

  await condition(() => state.confirmed || state.cancelled);
  if (state.cancelled) {
    await updateAppointmentStatus({ appointmentId: input.appointmentId, status: 'CANCELLED' });
    await releaseAppointmentSlot({ appointmentId: input.appointmentId });
    state.status = 'CANCELLED';
  } else {
    await updateAppointmentStatus({ appointmentId: input.appointmentId, status: 'CONFIRMED' });
    state.status = 'CONFIRMED';
  }
  return state;
}
