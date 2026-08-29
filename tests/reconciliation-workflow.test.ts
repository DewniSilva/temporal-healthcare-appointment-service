import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Worker } from '@temporalio/worker';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { reconciliationWorkflow } from '../src/worker/workflows/reconciliation.workflow';

describe('reconciliation workflow', () => {
  let env: TestWorkflowEnvironment;

  beforeAll(async () => { env = await TestWorkflowEnvironment.createTimeSkipping(); }, 120_000);
  afterAll(async () => { await env?.teardown(); });

  it('releases stale reservations, cancels orphaned reminders, retries eligible failed reminders, and reports (without mutating) stuck appointments (tests 38, 39, 40)', async () => {
    const calls: string[] = [];
    const activities = {
      findStaleReservations: async () => ['apt-no-response-1', 'apt-cancelled-1'],
      findOrphanedScheduledReminders: async () => [{ appointmentId: 'apt-cancelled-1', type: 'UPCOMING_REMINDER' as const }],
      findRetryableFailedReminders: async () => [{ appointmentId: 'apt-failed-1', type: 'CONFIRMATION_REMINDER' as const }],
      findStuckBookedAppointments: async () => [{ appointmentId: 'apt-stuck-1', appointmentTime: new Date(Date.now() - 7_200_000).toISOString() }],
      findStuckConfirmedAppointments: async () => [{ appointmentId: 'apt-stuck-confirmed-1', appointmentTime: new Date(Date.now() - 7_200_000).toISOString() }],
      releaseSlot: async ({ appointmentId }: { appointmentId: string }) => { calls.push(`released:${appointmentId}`); return { released: true }; },
      cancelReminder: async ({ appointmentId, type }: { appointmentId: string; type: string }) => { calls.push(`cancelled:${appointmentId}:${type}`); return { cancelled: true }; },
      sendReminder: async ({ appointmentId, type }: { appointmentId: string; type: string }) => { calls.push(`retried:${appointmentId}:${type}`); return { sent: true }; }
    };
    const worker = await Worker.create({
      connection: env.nativeConnection, taskQueue: 'reconciliation-test',
      workflowsPath: require.resolve('../src/worker/workflows/index.ts'), activities
    });
    await worker.runUntil(async () => {
      const result = await env.client.workflow.execute(reconciliationWorkflow, {
        workflowId: 'reconciliation-test-run', taskQueue: 'reconciliation-test',
        args: [{ graceMinutes: 60, batchSize: 100 }]
      });
      expect(result).toEqual({
        staleReservationsReleased: 2,
        orphanedRemindersCancelled: 1,
        failedRemindersRetried: 1,
        stuckBookedAppointments: 1,
        stuckConfirmedAppointments: 1
      });
    });
    // Stuck appointments are detected/reported only — no Activity is called for them.
    expect(calls).toEqual([
      'released:apt-no-response-1',
      'released:apt-cancelled-1',
      'cancelled:apt-cancelled-1:UPCOMING_REMINDER',
      'retried:apt-failed-1:CONFIRMATION_REMINDER'
    ]);
  });

  it('does not let one failing release stop the rest of the sweep (idempotent release, test 37)', async () => {
    const activities = {
      findStaleReservations: async () => ['apt-a', 'apt-b'],
      findOrphanedScheduledReminders: async () => [],
      findRetryableFailedReminders: async () => [],
      findStuckBookedAppointments: async () => [],
      findStuckConfirmedAppointments: async () => [],
      releaseSlot: async ({ appointmentId }: { appointmentId: string }) => {
        if (appointmentId === 'apt-a') throw new Error('boom');
        return { released: true };
      },
      cancelReminder: async () => ({ cancelled: true }),
      sendReminder: async () => ({ sent: true })
    };
    const worker = await Worker.create({
      connection: env.nativeConnection, taskQueue: 'reconciliation-partial-failure-test',
      workflowsPath: require.resolve('../src/worker/workflows/index.ts'), activities
    });
    await worker.runUntil(async () => {
      const result = await env.client.workflow.execute(reconciliationWorkflow, {
        workflowId: 'reconciliation-partial-failure-run', taskQueue: 'reconciliation-partial-failure-test',
        args: [{ graceMinutes: 60, batchSize: 100 }]
      });
      expect(result.staleReservationsReleased).toBe(1);
    });
  });
});
