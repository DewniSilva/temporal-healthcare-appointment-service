import { proxyActivities } from '@temporalio/workflow';
import type { AppointmentActivities, ReconciliationActivities, ReconciliationInput, ReconciliationResult } from '../../shared/temporal/contracts';

const queries = proxyActivities<ReconciliationActivities>({
  startToCloseTimeout: '30 seconds',
  scheduleToCloseTimeout: '2 minutes',
  retry: { initialInterval: '2 seconds', backoffCoefficient: 2, maximumInterval: '10 seconds', maximumAttempts: 3 }
});

const { releaseAppointmentSlot, sendAppointmentReminder } = proxyActivities<AppointmentActivities>({
  startToCloseTimeout: '10 seconds',
  scheduleToCloseTimeout: '1 minute',
  retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumInterval: '10 seconds', maximumAttempts: 3 }
});

/**
 * Runs on a Temporal Schedule (see backend/temporal/reconciliationSchedule.ts)
 * to sweep for state that a live appointment Workflow should have cleaned up
 * itself but didn't — a crashed worker, a terminated Workflow, or activity
 * retries that exhausted. Only mutates state where doing so is provably safe
 * (see the comments in reconciliation.activities.ts); everything else is
 * detected and logged for a human to act on rather than guessed at.
 */
export async function reconciliationWorkflow(input: ReconciliationInput): Promise<ReconciliationResult> {
  const orphaned = await queries.findOrphanedReservations(input);
  let orphanedReservationsReleased = 0;
  for (const reservation of orphaned) {
    try {
      await releaseAppointmentSlot({ appointmentId: reservation.appointmentId });
      orphanedReservationsReleased += 1;
    } catch {
      // Logged by the Activity's own retry failures; one bad row must not stop the sweep.
    }
  }

  const stuck = await queries.findStuckBookedAppointments(input);

  const failedReminders = await queries.findFailedReminderNotifications(input);
  let failedRemindersRetried = 0;
  for (const appointmentId of failedReminders) {
    try {
      await sendAppointmentReminder({ appointmentId });
      failedRemindersRetried += 1;
    } catch {
      // Left FAILED for the next reconciliation pass; Temporal already retried per its own policy.
    }
  }

  return {
    orphanedReservationsReleased,
    stuckBookedAppointments: stuck.length,
    failedRemindersRetried
  };
}
