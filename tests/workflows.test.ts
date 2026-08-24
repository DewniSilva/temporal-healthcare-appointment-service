import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApplicationFailure } from '@temporalio/activity';
import { Worker } from '@temporalio/worker';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import type { AppointmentActivities } from '../src/shared/temporal/contracts';
import { appointmentBookingWorkflow } from '../src/worker/workflows/appointmentBooking.workflow';
import { appointmentReminderWorkflow } from '../src/worker/workflows/appointmentReminder.workflow';
import { appointmentStateQuery } from '../src/shared/temporal/queries';
import { cancelAppointment, confirmAppointment } from '../src/shared/temporal/signals';

describe('Temporal appointment workflows', () => {
  let env: TestWorkflowEnvironment;

  beforeAll(async () => { env = await TestWorkflowEnvironment.createTimeSkipping(); }, 120_000);
  afterAll(async () => { await env?.teardown(); });

  const baseActivities = (): AppointmentActivities => ({
    validateAppointmentRequest: async () => undefined,
    checkDoctorAvailability: async () => undefined,
    reserveAppointmentSlot: async () => undefined,
    releaseAppointmentSlot: async () => undefined,
    createAppointment: async () => undefined,
    sendBookingConfirmation: async () => undefined,
    sendAppointmentReminder: async () => undefined,
    updateAppointmentStatus: async () => undefined
  });

  it('skips the durable reminder timer, exposes query state, and confirms by Signal', async () => {
    const calls: string[] = [];
    const activities = baseActivities();
    activities.sendAppointmentReminder = async () => { calls.push('reminder'); };
    activities.updateAppointmentStatus = async ({ status }) => { calls.push(status); };
    const worker = await Worker.create({
      connection: env.nativeConnection, taskQueue: 'reminder-test',
      workflowsPath: require.resolve('../src/worker/workflows/index.ts'), activities
    });
    await worker.runUntil(async () => {
      const handle = await env.client.workflow.start(appointmentReminderWorkflow, {
        workflowId: 'reminder-confirm-test', taskQueue: 'reminder-test',
        args: [{ appointmentId: 'apt-confirm', appointmentTime: new Date(Date.now() + 3_600_000).toISOString(), reminderLeadTimeSeconds: 1800 }]
      });
      await env.sleep('31 minutes');
      expect(await handle.query(appointmentStateQuery)).toEqual({ status: 'WAITING_FOR_CONFIRMATION', reminderSent: true, confirmed: false, cancelled: false });
      await handle.signal(confirmAppointment);
      expect((await handle.result()).status).toBe('CONFIRMED');
    });
    expect(calls).toEqual(['reminder', 'CONFIRMED']);
  });

  it('cancels by Signal and releases the slot idempotently', async () => {
    const calls: string[] = [];
    const activities = baseActivities();
    activities.updateAppointmentStatus = async ({ status }) => { calls.push(status); };
    activities.releaseAppointmentSlot = async () => { calls.push('released'); };
    const worker = await Worker.create({ connection: env.nativeConnection, taskQueue: 'cancel-test', workflowsPath: require.resolve('../src/worker/workflows/index.ts'), activities });
    await worker.runUntil(async () => {
      const handle = await env.client.workflow.start(appointmentReminderWorkflow, {
        workflowId: 'reminder-cancel-test', taskQueue: 'cancel-test',
        args: [{ appointmentId: 'apt-cancel', appointmentTime: new Date(Date.now() + 86_400_000).toISOString(), reminderLeadTimeSeconds: 30 }]
      });
      await handle.signal(cancelAppointment);
      expect((await handle.result()).status).toBe('CANCELLED');
    });
    expect(calls).toEqual(['CANCELLED', 'released']);
  });

  it('compensates a reservation after a permanent appointment creation failure', async () => {
    const calls: string[] = [];
    const activities = baseActivities();
    activities.reserveAppointmentSlot = async () => { calls.push('reserved'); };
    activities.createAppointment = async () => { throw ApplicationFailure.nonRetryable('rejected', 'CREATE_APPOINTMENT_REJECTED'); };
    activities.releaseAppointmentSlot = async () => { calls.push('released'); };
    const worker = await Worker.create({ connection: env.nativeConnection, taskQueue: 'compensation-test', workflowsPath: require.resolve('../src/worker/workflows/index.ts'), activities });
    await worker.runUntil(async () => {
      const handle = await env.client.workflow.start(appointmentBookingWorkflow, {
        workflowId: 'booking-compensation-test', taskQueue: 'compensation-test',
        args: [{ appointmentId: 'apt-fail', patientId: 'patient-001', doctorId: 'doctor-001', appointmentTime: new Date(Date.now() + 60_000).toISOString(), reminderLeadTimeSeconds: 30 }]
      });
      await expect(handle.result()).rejects.toThrow();
    });
    expect(calls).toEqual(['reserved', 'released']);
  });

  it('retries a transient notification failure and succeeds', async () => {
    let attempts = 0;
    const activities = baseActivities();
    activities.sendAppointmentReminder = async () => { attempts += 1; if (attempts === 1) throw new Error('temporary 503'); };
    const worker = await Worker.create({ connection: env.nativeConnection, taskQueue: 'retry-test', workflowsPath: require.resolve('../src/worker/workflows/index.ts'), activities });
    await worker.runUntil(async () => {
      const handle = await env.client.workflow.start(appointmentReminderWorkflow, {
        workflowId: 'reminder-retry-test', taskQueue: 'retry-test',
        args: [{ appointmentId: 'apt-retry', appointmentTime: new Date(Date.now() + 1_000).toISOString(), reminderLeadTimeSeconds: 30 }]
      });
      await env.sleep('2 seconds');
      await handle.signal(confirmAppointment);
      await handle.result();
    });
    expect(attempts).toBe(2);
  });
});
