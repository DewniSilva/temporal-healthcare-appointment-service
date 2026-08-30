import { ActivityFailure, ApplicationFailure, condition, proxyActivities, setHandler, sleep } from '@temporalio/workflow';
import type {
  AppointmentActivities,
  AppointmentWorkflowInput,
  AppointmentWorkflowState,
  ReminderActivities,
  ReservationActivities
} from '../../shared/temporal/contracts';
import { appointmentStateQuery } from '../../shared/temporal/queries';
import {
  cancelAppointment,
  confirmAppointment,
  markAppointmentCompleted,
  markAppointmentNoShow
} from '../../shared/temporal/signals';
import { computeReminderSchedule, isLateBooking, isUpcomingReminderElapsed } from '../../shared/reminder/reminder.policy';

// scheduleToCloseTimeout must comfortably exceed the worst case of
// (maximumAttempts × startToCloseTimeout) + sum of all backoff intervals —
// otherwise Temporal can time out the activity before the configured retry
// count is ever reached.
const appointment = proxyActivities<AppointmentActivities>({
  startToCloseTimeout: '10 seconds',
  scheduleToCloseTimeout: '90 seconds', // worst case: 4×10s + (1+2+4)s backoff = 47s
  retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumInterval: '8 seconds', maximumAttempts: 4,
    nonRetryableErrorTypes: ['PATIENT_NOT_FOUND', 'DOCTOR_NOT_FOUND', 'CREATE_APPOINTMENT_REJECTED'] }
});

const reservation = proxyActivities<ReservationActivities>({
  startToCloseTimeout: '10 seconds',
  scheduleToCloseTimeout: '90 seconds', // worst case: 4×10s + (1+2+4)s backoff = 47s
  retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumInterval: '8 seconds', maximumAttempts: 4,
    nonRetryableErrorTypes: ['DOCTOR_UNAVAILABLE'] }
});

const reminder = proxyActivities<ReminderActivities>({
  startToCloseTimeout: '10 seconds',
  scheduleToCloseTimeout: '3 minutes', // worst case: 5×10s + (5+10+20+40)s backoff = 125s
  retry: { initialInterval: '5 seconds', backoffCoefficient: 2, maximumInterval: '40 seconds', maximumAttempts: 5 }
});

/**
 * Reminder sends are best-effort: spec §17 requires that an exhausted-retry
 * email failure never changes Appointment.status or aborts the lifecycle.
 * The Activity itself durably records FAILED on the Reminder row (and
 * reconciliation can retry it later) — the Workflow just needs to not crash.
 * Returns whether the send actually succeeded, so the query-facing state
 * never claims a reminder was sent when it wasn't.
 */
async function sendReminderBestEffort(
  send: ReminderActivities['sendReminder'],
  input: Parameters<ReminderActivities['sendReminder']>[0]
): Promise<boolean> {
  try {
    await send(input);
    return true;
  } catch {
    return false;
  }
}

/** True only for a genuine slot conflict (DOCTOR_UNAVAILABLE), as opposed to an exhausted infrastructure failure. */
function isSlotConflict(error: unknown): boolean {
  return error instanceof ActivityFailure
    && error.cause instanceof ApplicationFailure
    && error.cause.type === 'DOCTOR_UNAVAILABLE';
}

export async function appointmentWorkflow(input: AppointmentWorkflowInput): Promise<AppointmentWorkflowState> {
  let confirmed = false;
  let cancelled = false;
  let completed = false;
  let noShow = false;

  const schedule = computeReminderSchedule(input.appointmentTime, {
    confirmationReminderHoursBefore: input.confirmationReminderHoursBefore,
    confirmationDeadlineHoursBefore: input.confirmationDeadlineHoursBefore,
    upcomingReminderHoursBefore: input.upcomingReminderHoursBefore
  });
  const state: AppointmentWorkflowState = {
    appointmentStatus: 'REQUESTED',
    reservationStatus: null,
    confirmationReminderAt: schedule.confirmationReminderAt,
    confirmationDeadlineAt: schedule.confirmationDeadlineAt,
    upcomingReminderAt: schedule.upcomingReminderAt,
    confirmationReminderSent: false,
    upcomingReminderSent: false,
    confirmedAt: null
  };

  setHandler(appointmentStateQuery, () => ({ ...state }));
  // A confirm Signal that arrives before the appointment reaches BOOKED
  // (the sliver of time spent validating/reserving) is deliberately dropped
  // rather than queued: no legitimate client can hold an appointmentId to
  // signal with until the synchronous booking HTTP call has already
  // returned it, by which point the Workflow either already reached BOOKED
  // or is failing outright (REJECTED/BOOKING_FAILED, where confirming makes
  // no sense). Queuing "early" signals would add real complexity for a
  // window nothing can actually race into.
  setHandler(confirmAppointment, () => { if (state.appointmentStatus === 'BOOKED') confirmed = true; });
  // Signal precedence is deliberate, not incidental: a cancel racing a
  // confirm always wins (checked first below), and likewise cancel beats
  // completed/no-show post-appointment — see the precedence tests in
  // workflows.test.ts.
  setHandler(cancelAppointment, () => { if (state.appointmentStatus === 'BOOKED' || state.appointmentStatus === 'CONFIRMED') cancelled = true; });
  setHandler(markAppointmentCompleted, () => { if (state.appointmentStatus === 'CONFIRMED') completed = true; });
  setHandler(markAppointmentNoShow, () => { if (state.appointmentStatus === 'CONFIRMED') noShow = true; });

  const activityInput = { appointmentId: input.appointmentId, patientId: input.patientId, doctorId: input.doctorId, appointmentTime: input.appointmentTime };
  const actor = { actorId: null, actorRole: 'SYSTEM' as const };

  await appointment.createRequestedAppointment({ ...activityInput, appointmentTzOffsetMinutes: input.appointmentTzOffsetMinutes });

  const validation = await appointment.validateBooking(activityInput);
  if (!validation.valid) {
    await appointment.transitionAppointment({ appointmentId: input.appointmentId, to: 'REJECTED', actor, reason: validation.reason });
    state.appointmentStatus = 'REJECTED';
    return state;
  }

  await appointment.transitionAppointment({ appointmentId: input.appointmentId, to: 'RESERVING', actor });
  state.appointmentStatus = 'RESERVING';
  state.reservationStatus = 'RESERVING';

  try {
    await reservation.reserveSlot(activityInput);
  } catch (error) {
    // A genuine conflict lands the row on CONFLICTED already (see
    // reservation.repository.ts); an exhausted infrastructure failure can
    // still leave a stray RESERVING row behind, so release unconditionally
    // to clean it up either way — release is a safe no-op against an
    // already-CONFLICTED row.
    await reservation.releaseSlot({ appointmentId: input.appointmentId });
    await appointment.transitionAppointment({ appointmentId: input.appointmentId, to: 'BOOKING_FAILED', actor });
    state.appointmentStatus = 'BOOKING_FAILED';
    state.reservationStatus = isSlotConflict(error) ? 'CONFLICTED' : 'RELEASED';
    return state;
  }
  state.reservationStatus = 'RESERVED';

  try {
    await appointment.transitionAppointment({ appointmentId: input.appointmentId, to: 'BOOKED', actor });
  } catch {
    // Saga compensation: undo the reservation if the appointment itself
    // could not be finalized (e.g. an injected/permanent persistence failure).
    await reservation.releaseSlot({ appointmentId: input.appointmentId });
    state.reservationStatus = 'RELEASED';
    await appointment.transitionAppointment({ appointmentId: input.appointmentId, to: 'BOOKING_FAILED', actor });
    state.appointmentStatus = 'BOOKING_FAILED';
    return state;
  }
  state.appointmentStatus = 'BOOKED';

  await reminder.scheduleReminders({
    appointmentId: input.appointmentId,
    confirmationReminderAt: schedule.confirmationReminderAt,
    upcomingReminderAt: schedule.upcomingReminderAt
  });

  // ── Confirmation phase ──────────────────────────────────────────────────
  if (isLateBooking(Date.now(), schedule.confirmationDeadlineAt)) {
    // Spec §9: the normal confirmation window has already elapsed at booking
    // time (a same-day/late booking) — treat it as immediately confirmed
    // rather than racing it straight to NO_RESPONSE.
    await reminder.cancelReminder({ appointmentId: input.appointmentId, type: 'CONFIRMATION_REMINDER' });
    await appointment.transitionAppointment({ appointmentId: input.appointmentId, to: 'CONFIRMED', actor, reason: 'late booking: confirmation deadline already passed' });
    state.appointmentStatus = 'CONFIRMED';
    state.confirmedAt = new Date().toISOString();
  } else {
    const untilReminder = Math.max(0, new Date(schedule.confirmationReminderAt).getTime() - Date.now());
    if (untilReminder > 0) {
      await Promise.race([sleep(untilReminder), condition(() => confirmed || cancelled)]);
    }

    if (cancelled) {
      return finalizeFromBooked(input.appointmentId, 'CANCELLED', state);
    }
    if (confirmed) {
      await reminder.cancelReminder({ appointmentId: input.appointmentId, type: 'CONFIRMATION_REMINDER' });
      await appointment.transitionAppointment({ appointmentId: input.appointmentId, to: 'CONFIRMED', actor });
      state.appointmentStatus = 'CONFIRMED';
      state.confirmedAt = new Date().toISOString();
    } else {
      state.confirmationReminderSent = await sendReminderBestEffort(reminder.sendReminder, { appointmentId: input.appointmentId, type: 'CONFIRMATION_REMINDER' });

      const untilDeadline = Math.max(0, new Date(schedule.confirmationDeadlineAt).getTime() - Date.now());
      if (untilDeadline > 0) {
        await Promise.race([sleep(untilDeadline), condition(() => confirmed || cancelled)]);
      }

      // Cancel checked first: a cancel racing a confirm at the deadline wins.
      if (cancelled) {
        return finalizeFromBooked(input.appointmentId, 'CANCELLED', state);
      } else if (confirmed) {
        await appointment.transitionAppointment({ appointmentId: input.appointmentId, to: 'CONFIRMED', actor });
        state.appointmentStatus = 'CONFIRMED';
        state.confirmedAt = new Date().toISOString();
      } else {
        // Deadline reached with neither a confirm nor a cancel Signal.
        return finalizeFromBooked(input.appointmentId, 'NO_RESPONSE', state);
      }
    }
  }

  // ── Confirmed: upcoming-reminder phase ──────────────────────────────────
  if (isUpcomingReminderElapsed(Date.now(), schedule.upcomingReminderAt)) {
    await reminder.cancelReminder({ appointmentId: input.appointmentId, type: 'UPCOMING_REMINDER' });
  } else {
    const untilUpcoming = Math.max(0, new Date(schedule.upcomingReminderAt).getTime() - Date.now());
    if (untilUpcoming > 0) {
      await Promise.race([sleep(untilUpcoming), condition(() => cancelled)]);
    }
    if (cancelled) {
      return finalizeConfirmedCancellation(input.appointmentId, state, 'UPCOMING_REMINDER');
    }
    state.upcomingReminderSent = await sendReminderBestEffort(reminder.sendReminder, { appointmentId: input.appointmentId, type: 'UPCOMING_REMINDER' });
  }

  // ── Wait for the appointment itself to actually happen ──────────────────
  // A doctor/admin should only be able to record COMPLETED/NO_SHOW once the
  // appointment time has arrived — the signal handlers alone don't enforce
  // that, so the Workflow blocks here first (still racing a late cancellation).
  const untilAppointment = Math.max(0, new Date(input.appointmentTime).getTime() - Date.now());
  if (untilAppointment > 0) {
    await Promise.race([sleep(untilAppointment), condition(() => cancelled)]);
  }
  if (cancelled) {
    return finalizeConfirmedCancellation(input.appointmentId, state, null);
  }

  // ── Post-appointment: wait for a doctor/admin/patient decision ──────────
  // No timeout: this can wait indefinitely if nobody ever records an
  // outcome. The reconciliation Workflow's findStuckConfirmedAppointments
  // surfaces that case for on-call rather than guessing an outcome.
  await condition(() => completed || noShow || cancelled);
  if (cancelled) {
    await appointment.transitionAppointment({ appointmentId: input.appointmentId, to: 'CANCELLED', actor });
    state.appointmentStatus = 'CANCELLED';
  } else if (completed) {
    await appointment.transitionAppointment({ appointmentId: input.appointmentId, to: 'COMPLETED', actor });
    state.appointmentStatus = 'COMPLETED';
  } else {
    await appointment.transitionAppointment({ appointmentId: input.appointmentId, to: 'NO_SHOW', actor });
    state.appointmentStatus = 'NO_SHOW';
  }
  await reservation.releaseSlot({ appointmentId: input.appointmentId });
  state.reservationStatus = 'RELEASED';
  return state;

  async function finalizeFromBooked(
    appointmentId: string,
    to: 'CANCELLED' | 'NO_RESPONSE',
    workflowState: AppointmentWorkflowState
  ): Promise<AppointmentWorkflowState> {
    await appointment.transitionAppointment({ appointmentId, to, actor });
    workflowState.appointmentStatus = to;
    await reservation.releaseSlot({ appointmentId });
    workflowState.reservationStatus = 'RELEASED';
    await reminder.cancelReminder({ appointmentId, type: 'UPCOMING_REMINDER' });
    if (to === 'CANCELLED') {
      await reminder.cancelReminder({ appointmentId, type: 'CONFIRMATION_REMINDER' });
    }
    return workflowState;
  }

  async function finalizeConfirmedCancellation(
    appointmentId: string,
    workflowState: AppointmentWorkflowState,
    unsentReminderType: 'UPCOMING_REMINDER' | null
  ): Promise<AppointmentWorkflowState> {
    await appointment.transitionAppointment({ appointmentId, to: 'CANCELLED', actor });
    workflowState.appointmentStatus = 'CANCELLED';
    await reservation.releaseSlot({ appointmentId });
    workflowState.reservationStatus = 'RELEASED';
    if (unsentReminderType) {
      await reminder.cancelReminder({ appointmentId, type: unsentReminderType });
    }
    return workflowState;
  }
}
