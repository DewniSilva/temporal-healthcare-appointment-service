import { proxyActivities } from '@temporalio/workflow';
import type { ReconciliationActivities, ReconciliationInput, ReconciliationResult, ReminderActivities, ReservationActivities } from '../../shared/temporal/contracts';

const reconciliation = proxyActivities<ReconciliationActivities>({
  startToCloseTimeout: '30 seconds',
  scheduleToCloseTimeout: '2 minutes',
  retry: { initialInterval: '2 seconds', backoffCoefficient: 2, maximumInterval: '10 seconds', maximumAttempts: 3 }
});

const { releaseSlot } = proxyActivities<ReservationActivities>({
  startToCloseTimeout: '10 seconds',
  scheduleToCloseTimeout: '1 minute',
  retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumInterval: '10 seconds', maximumAttempts: 3 }
});

const { sendReminder, cancelReminder } = proxyActivities<ReminderActivities>({
  startToCloseTimeout: '10 seconds',
  scheduleToCloseTimeout: '1 minute',
  retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumInterval: '10 seconds', maximumAttempts: 3 }
});

/**
 * Runs on a Temporal Schedule (see backend/temporal/reconciliationSchedule.ts)
 * to reconcile state that the normal appointment lifecycle could not
 * complete itself — a terminated Workflow, an Activity that exhausted its
 * own retry budget, an orphaned record, or a manual/external change. (A
 * merely crashed worker is not a cause on its own: Temporal persists
 * Workflow history and a restarted worker resumes it normally.) State is
 * mutated only where the corresponding Activity can prove the operation is
 * currently safe (see the comments in reconciliation.activities.ts);
 * anything ambiguous is detected and logged for a human to act on instead.
 */
export async function reconciliationWorkflow(input: ReconciliationInput): Promise<ReconciliationResult> {
  const staleReservations = await reconciliation.findStaleReservations(input);
  let staleReservationsReleased = 0;
  for (const appointmentId of staleReservations) {
    try {
      const result = await releaseSlot({ appointmentId });
      if (result.released) staleReservationsReleased += 1;
    } catch {
      // Logged by the Activity's own retry failures; one bad row must not stop the sweep.
    }
  }

  const orphanedReminders = await reconciliation.findOrphanedScheduledReminders(input);
  let orphanedRemindersCancelled = 0;
  for (const reminder of orphanedReminders) {
    try {
      const result = await cancelReminder(reminder);
      if (result.cancelled) orphanedRemindersCancelled += 1;
    } catch {
      // Same as above — left for the next sweep.
    }
  }

  const retryableReminders = await reconciliation.findRetryableFailedReminders(input);
  let failedRemindersRetried = 0;
  for (const reminder of retryableReminders) {
    try {
      const result = await sendReminder(reminder);
      if (result.sent) failedRemindersRetried += 1;
    } catch {
      // Left FAILED for the next reconciliation pass; Temporal already retried per its own policy.
    }
  }

  const stuckBooked = await reconciliation.findStuckBookedAppointments(input);
  const stuckConfirmed = await reconciliation.findStuckConfirmedAppointments(input);

  return {
    staleReservationsReleased,
    orphanedRemindersCancelled,
    failedRemindersRetried,
    stuckBookedAppointments: stuckBooked.length,
    stuckConfirmedAppointments: stuckConfirmed.length
  };
}
