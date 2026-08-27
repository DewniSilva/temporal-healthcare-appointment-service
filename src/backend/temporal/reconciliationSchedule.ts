import { ScheduleAlreadyRunning, ScheduleOverlapPolicy } from '@temporalio/client';
import { temporalClient } from './client';
import { getEnv } from '../../shared/config/env';
import { logger } from '../../shared/logging/logger';
import { reconciliationScheduleId, reconciliationWorkflowId, type ReconciliationInput } from '../../shared/temporal/contracts';

/**
 * Idempotently ensures the reconciliation sweep is scheduled. Safe to call on
 * every backend startup: Temporal rejects a second `create` for the same
 * Schedule id, which is treated as "already set up" rather than an error.
 */
export async function ensureReconciliationSchedule(): Promise<void> {
  const env = getEnv();
  const input: ReconciliationInput = { graceMinutes: env.ORPHANED_RESERVATION_GRACE_MINUTES };
  try {
    await temporalClient().schedule.create({
      scheduleId: reconciliationScheduleId,
      spec: { intervals: [{ every: `${env.RECONCILIATION_INTERVAL_MINUTES}m` }] },
      action: {
        type: 'startWorkflow',
        workflowType: 'reconciliationWorkflow',
        workflowId: reconciliationWorkflowId,
        taskQueue: env.TEMPORAL_TASK_QUEUE,
        args: [input]
      },
      // A sweep overlapping its predecessor would double-count/double-retry
      // the same rows; skipping one run when the previous is still going is
      // harmless since the next interval picks up whatever is still stale.
      policies: { overlap: ScheduleOverlapPolicy.SKIP }
    });
    logger.info({ event: 'reconciliation_schedule_created', intervalMinutes: env.RECONCILIATION_INTERVAL_MINUTES });
  } catch (error) {
    if (error instanceof ScheduleAlreadyRunning) return;
    throw error;
  }
}
