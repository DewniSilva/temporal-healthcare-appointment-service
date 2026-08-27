import { condition, proxyActivities, setHandler, sleep } from '@temporalio/workflow';
import type { AppointmentActivities } from '../../shared/temporal/contracts';
import type { AppointmentReminderInput, AppointmentWorkflowState } from '../../shared/temporal/contracts';
import { confirmAppointment, cancelAppointment } from '../../shared/temporal/signals';
import { appointmentStateQuery } from '../../shared/temporal/queries';
import { APPOINTMENT_SLOT_MINUTES } from '../../shared/appointmentSlots';

const { sendAppointmentReminder, updateAppointmentStatus, releaseAppointmentSlot } = proxyActivities<AppointmentActivities>({
  startToCloseTimeout: '10 seconds',
  scheduleToCloseTimeout: '1 minute',
  retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumInterval: '10 seconds', maximumAttempts: 5,
    nonRetryableErrorTypes: ['INVALID_STATUS_TRANSITION'] }
});

export async function appointmentReminderWorkflow(input: AppointmentReminderInput): Promise<AppointmentWorkflowState> {
  const reminderAtMs = new Date(input.appointmentTime).getTime() - input.reminderLeadTimeSeconds * 1_000;
  const state: AppointmentWorkflowState = {
    status: 'SCHEDULED',
    reminderSent: false,
    confirmed: false,
    cancelled: false,
    reminderAt: new Date(reminderAtMs).toISOString()
  };

  setHandler(appointmentStateQuery, () => ({ ...state }));
  setHandler(confirmAppointment, () => { if (!state.cancelled) state.confirmed = true; });
  setHandler(cancelAppointment, () => { if (!state.confirmed) state.cancelled = true; });

  const delayMs = Math.max(0, reminderAtMs - Date.now());
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

    // The reservation stays in place while the appointment is still upcoming, so a
    // second patient cannot book the same slot out from under a confirmed one. Once
    // the slot's own time has elapsed it can never be booked again (only future
    // times are accepted), so the reservation is now dead weight — release it
    // instead of leaving it in the table forever.
    const appointmentEndMs = new Date(input.appointmentTime).getTime() + APPOINTMENT_SLOT_MINUTES * 60_000;
    const releaseDelayMs = Math.max(0, appointmentEndMs - Date.now());
    if (releaseDelayMs > 0) await sleep(releaseDelayMs);
    await releaseAppointmentSlot({ appointmentId: input.appointmentId });
  }
  return state;
}
