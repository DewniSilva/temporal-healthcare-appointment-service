import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Worker } from '@temporalio/worker';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { reconciliationWorkflow } from '../src/worker/workflows/reconciliation.workflow';

describe('reconciliation workflow', () => {
  let env: TestWorkflowEnvironment;

  beforeAll(async () => { env = await TestWorkflowEnvironment.createTimeSkipping(); }, 120_000);
  afterAll(async () => { await env?.teardown(); });

  it('releases orphaned reservations, retries failed reminders, and reports (without mutating) stuck appointments', async () => {
    const calls: string[] = [];
    const activities = {
      findOrphanedReservations: async () => [
        { appointmentId: 'apt-orphan-1', doctorId: 'doctor-001', appointmentTime: new Date(Date.now() - 3_600_000).toISOString() }
      ],
      findStuckBookedAppointments: async () => [
        { appointmentId: 'apt-stuck-1', appointmentTime: new Date(Date.now() - 7_200_000).toISOString() }
      ],
      findFailedReminderNotifications: async () => ['apt-failed-1'],
      releaseAppointmentSlot: async ({ appointmentId }: { appointmentId: string }) => { calls.push(`released:${appointmentId}`); },
      sendAppointmentReminder: async ({ appointmentId }: { appointmentId: string }) => { calls.push(`retried:${appointmentId}`); }
    };
    const worker = await Worker.create({
      connection: env.nativeConnection, taskQueue: 'reconciliation-test',
      workflowsPath: require.resolve('../src/worker/workflows/index.ts'), activities
    });
    await worker.runUntil(async () => {
      const result = await env.client.workflow.execute(reconciliationWorkflow, {
        workflowId: 'reconciliation-test-run', taskQueue: 'reconciliation-test',
        args: [{ graceMinutes: 60 }]
      });
      expect(result).toEqual({ orphanedReservationsReleased: 1, stuckBookedAppointments: 1, failedRemindersRetried: 1 });
    });
    // Stuck appointments are detected/reported only — no Activity is called for them.
    expect(calls).toEqual(['released:apt-orphan-1', 'retried:apt-failed-1']);
  });

  it('does not let one failing release stop the rest of the sweep', async () => {
    const activities = {
      findOrphanedReservations: async () => [
        { appointmentId: 'apt-a', doctorId: 'doctor-001', appointmentTime: new Date(Date.now() - 3_600_000).toISOString() },
        { appointmentId: 'apt-b', doctorId: 'doctor-001', appointmentTime: new Date(Date.now() - 3_600_000).toISOString() }
      ],
      findStuckBookedAppointments: async () => [],
      findFailedReminderNotifications: async () => [],
      releaseAppointmentSlot: async ({ appointmentId }: { appointmentId: string }) => {
        if (appointmentId === 'apt-a') throw new Error('boom');
      },
      sendAppointmentReminder: async () => undefined
    };
    const worker = await Worker.create({
      connection: env.nativeConnection, taskQueue: 'reconciliation-partial-failure-test',
      workflowsPath: require.resolve('../src/worker/workflows/index.ts'), activities
    });
    await worker.runUntil(async () => {
      const result = await env.client.workflow.execute(reconciliationWorkflow, {
        workflowId: 'reconciliation-partial-failure-run', taskQueue: 'reconciliation-partial-failure-test',
        args: [{ graceMinutes: 60 }]
      });
      expect(result.orphanedReservationsReleased).toBe(1);
    });
  });
});
