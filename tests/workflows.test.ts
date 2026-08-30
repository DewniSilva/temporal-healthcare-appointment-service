import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApplicationFailure } from '@temporalio/activity';
import { Worker } from '@temporalio/worker';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import type { AppointmentActivities, ReminderActivities, ReservationActivities } from '../src/shared/temporal/contracts';
import { appointmentWorkflow } from '../src/worker/workflows/appointment.workflow';
import { appointmentStateQuery } from '../src/shared/temporal/queries';
import { cancelAppointment, confirmAppointment, markAppointmentCompleted, markAppointmentNoShow } from '../src/shared/temporal/signals';

type FakeActivities = AppointmentActivities & ReservationActivities & ReminderActivities;

const CONFIG = { confirmationReminderHoursBefore: 24, confirmationDeadlineHoursBefore: 6, upcomingReminderHoursBefore: 2 };

describe('appointment workflow', () => {
  let env: TestWorkflowEnvironment;
  let taskQueueCounter = 0;

  beforeAll(async () => { env = await TestWorkflowEnvironment.createTimeSkipping(); }, 120_000);
  afterAll(async () => { await env?.teardown(); });

  function baseActivities(calls: string[]): FakeActivities {
    return {
      validateBooking: async () => ({ valid: true }),
      createRequestedAppointment: async () => { calls.push('createRequestedAppointment'); },
      transitionAppointment: async ({ to }) => { calls.push(`appointment:${to}`); },
      reserveSlot: async () => { calls.push('reserveSlot'); },
      releaseSlot: async () => { calls.push('releaseSlot'); return { released: true }; },
      scheduleReminders: async () => { calls.push('scheduleReminders'); },
      cancelReminder: async ({ type }) => { calls.push(`cancelReminder:${type}`); return { cancelled: true }; },
      sendReminder: async ({ type }) => { calls.push(`sendReminder:${type}`); return { sent: true }; }
    };
  }

  /**
   * appointmentTimeOffsetMs is relative to the *test server's* current
   * simulated clock (env.currentTimeMs()), not the real Node process clock —
   * this environment's clock keeps advancing across every test in this
   * file (env.sleep in one test permanently moves it forward), so anchoring
   * to real Date.now() would silently put "the future" in the past for
   * every test after the first few multi-hour sleeps.
   */
  async function startWorkflow(activities: FakeActivities, appointmentTimeOffsetMs: number) {
    const taskQueue = `appointment-workflow-test-${taskQueueCounter++}`;
    const worker = await Worker.create({
      connection: env.nativeConnection,
      taskQueue,
      workflowsPath: require.resolve('../src/worker/workflows/index.ts'),
      activities
    });
    const now = await env.currentTimeMs();
    const handle = await env.client.workflow.start(appointmentWorkflow, {
      workflowId: `wf-${taskQueueCounter}`,
      taskQueue,
      args: [{
        appointmentId: `apt-${taskQueueCounter}`,
        patientId: 'patient-001',
        doctorId: 'doctor-001',
        appointmentTime: new Date(now + appointmentTimeOffsetMs).toISOString(),
        appointmentTzOffsetMinutes: 0,
        ...CONFIG
      }]
    });
    return { worker, handle };
  }

  it('books successfully, leaving the slot RESERVED (tests 1, 5)', async () => {
    const calls: string[] = [];
    const { worker, handle } = await startWorkflow(baseActivities(calls), 30 * 3_600_000);
    await worker.runUntil(async () => {
      await env.sleep('1 second');
      const state = await handle.query(appointmentStateQuery);
      expect(state.appointmentStatus).toBe('BOOKED');
      expect(state.reservationStatus).toBe('RESERVED');
      // Every test shares one TestWorkflowEnvironment (and its one simulated
      // clock): a Workflow left open past its own Worker's shutdown can
      // starve *later* tests' time-skipping, since the environment still has
      // to account for its pending timer with nothing left to service it.
      // Every test must drive its Workflow to completion before finishing.
      await handle.signal(cancelAppointment);
      await handle.result();
    });
    expect(calls).toEqual([
      'createRequestedAppointment', 'appointment:RESERVING', 'reserveSlot', 'appointment:BOOKED', 'scheduleReminders',
      'appointment:CANCELLED', 'releaseSlot', 'cancelReminder:UPCOMING_REMINDER', 'cancelReminder:CONFIRMATION_REMINDER'
    ]);
  });

  it('rejects an invalid booking request (test 2)', async () => {
    const calls: string[] = [];
    const activities = baseActivities(calls);
    activities.validateBooking = async () => ({ valid: false, reason: 'Doctor does not exist.' });
    const { worker, handle } = await startWorkflow(activities, 30 * 3_600_000);
    await worker.runUntil(async () => {
      const result = await handle.result();
      expect(result.appointmentStatus).toBe('REJECTED');
    });
    expect(calls).toEqual(['createRequestedAppointment', 'appointment:REJECTED']);
  });

  it('marks BOOKING_FAILED on a slot conflict, distinguishing it from an infrastructure failure (test 3)', async () => {
    const calls: string[] = [];
    const activities = baseActivities(calls);
    activities.reserveSlot = async () => {
      calls.push('reserveSlot');
      throw ApplicationFailure.nonRetryable('slot conflict', 'DOCTOR_UNAVAILABLE');
    };
    const { worker, handle } = await startWorkflow(activities, 30 * 3_600_000);
    await worker.runUntil(async () => {
      const result = await handle.result();
      expect(result.appointmentStatus).toBe('BOOKING_FAILED');
      expect(result.reservationStatus).toBe('CONFLICTED');
    });
    expect(calls).toEqual(['createRequestedAppointment', 'appointment:RESERVING', 'reserveSlot', 'releaseSlot', 'appointment:BOOKING_FAILED']);
  });

  it('an infrastructure failure reserving the slot is not mistaken for a conflict', async () => {
    const calls: string[] = [];
    const activities = baseActivities(calls);
    activities.reserveSlot = async () => { calls.push('reserveSlot'); throw new Error('database unavailable'); };
    const { worker, handle } = await startWorkflow(activities, 30 * 3_600_000);
    await worker.runUntil(async () => {
      const result = await handle.result();
      expect(result.appointmentStatus).toBe('BOOKING_FAILED');
      expect(result.reservationStatus).toBe('RELEASED');
    });
  });

  it('confirming before the 24h reminder skips it, keeps the slot reserved, then still sends the 2h reminder without re-asking, and completion releases the slot (tests 10-12, 20-22, 33, 35)', async () => {
    const calls: string[] = [];
    const activities = baseActivities(calls);
    const { worker, handle } = await startWorkflow(activities, 30 * 3_600_000);
    await worker.runUntil(async () => {
      await env.sleep('1 second');
      await handle.signal(confirmAppointment);
      await env.sleep('1 second');

      const state = await handle.query(appointmentStateQuery);
      expect(state.appointmentStatus).toBe('CONFIRMED');
      expect(state.reservationStatus).toBe('RESERVED');
      expect(calls).not.toContain('sendReminder:CONFIRMATION_REMINDER');
      expect(calls).toContain('cancelReminder:CONFIRMATION_REMINDER');

      // Skip forward to the 2-hour mark: the upcoming reminder must fire
      // (the appointment is CONFIRMED), without asking to confirm again.
      await env.sleep('29 hours');
      expect(calls).toContain('sendReminder:UPCOMING_REMINDER');
      expect(calls).not.toContain('sendReminder:CONFIRMATION_REMINDER');

      // The appointment time itself (30h) hasn't arrived yet at the 29h
      // mark, so completion must not be actionable until then.
      await handle.signal(markAppointmentCompleted);
      await env.sleep('1 second');
      expect((await handle.query(appointmentStateQuery)).appointmentStatus).toBe('CONFIRMED');

      await env.sleep('2 hours'); // past the actual appointment time
      const result = await handle.result();
      expect(result.appointmentStatus).toBe('COMPLETED');
      expect(result.reservationStatus).toBe('RELEASED');
    });
    expect(calls[calls.length - 1]).toBe('releaseSlot');
  });

  it('a doctor/admin can mark a confirmed appointment NO_SHOW once the appointment time has passed, which also releases the slot (test 34, 36)', async () => {
    const calls: string[] = [];
    const activities = baseActivities(calls);
    const { worker, handle } = await startWorkflow(activities, 30 * 3_600_000);
    await worker.runUntil(async () => {
      await env.sleep('1 second');
      await handle.signal(confirmAppointment);
      await env.sleep('31 hours'); // past the appointment time
      await handle.signal(markAppointmentNoShow);
      const result = await handle.result();
      expect(result.appointmentStatus).toBe('NO_SHOW');
      expect(result.reservationStatus).toBe('RELEASED');
    });
  });

  it('cancelling while BOOKED releases the slot and cancels both reminders (tests 13, 15, 16)', async () => {
    const calls: string[] = [];
    const activities = baseActivities(calls);
    const { worker, handle } = await startWorkflow(activities, 30 * 3_600_000);
    await worker.runUntil(async () => {
      await env.sleep('1 second');
      await handle.signal(cancelAppointment);
      const result = await handle.result();
      expect(result.appointmentStatus).toBe('CANCELLED');
      expect(result.reservationStatus).toBe('RELEASED');
    });
    expect(calls).toContain('cancelReminder:CONFIRMATION_REMINDER');
    expect(calls).toContain('cancelReminder:UPCOMING_REMINDER');
    expect(calls).toContain('releaseSlot');
  });

  it('cancelling while CONFIRMED releases the slot and cancels the upcoming reminder (test 14)', async () => {
    const calls: string[] = [];
    const activities = baseActivities(calls);
    const { worker, handle } = await startWorkflow(activities, 30 * 3_600_000);
    await worker.runUntil(async () => {
      await env.sleep('1 second');
      await handle.signal(confirmAppointment);
      await env.sleep('1 second');
      await handle.signal(cancelAppointment);
      const result = await handle.result();
      expect(result.appointmentStatus).toBe('CANCELLED');
      expect(result.reservationStatus).toBe('RELEASED');
    });
    expect(calls).toContain('cancelReminder:UPCOMING_REMINDER');
  });

  it('no response by the confirmation deadline becomes NO_RESPONSE, releases the slot, and never sends the 2h reminder (tests 17-19)', async () => {
    const calls: string[] = [];
    const activities = baseActivities(calls);
    const { worker, handle } = await startWorkflow(activities, 30 * 3_600_000);
    await worker.runUntil(async () => {
      await env.sleep('7 hours'); // past the 6h confirmation reminder mark
      expect(calls).toContain('sendReminder:CONFIRMATION_REMINDER');
      await env.sleep('19 hours'); // now past the 24h deadline, still no response
      const result = await handle.result();
      expect(result.appointmentStatus).toBe('NO_RESPONSE');
      expect(result.reservationStatus).toBe('RELEASED');
    });
    expect(calls).not.toContain('sendReminder:UPCOMING_REMINDER');
  });

  it('a booking made after its own confirmation deadline is auto-confirmed (test 23, late-booking policy)', async () => {
    const calls: string[] = [];
    const activities = baseActivities(calls);
    // Appointment only 3 hours out: the 6-hour deadline has already passed at booking time.
    const { worker, handle } = await startWorkflow(activities, 3 * 3_600_000);
    await worker.runUntil(async () => {
      await env.sleep('1 second');
      const state = await handle.query(appointmentStateQuery);
      expect(state.appointmentStatus).toBe('CONFIRMED');
      // See the note in the first test: every Workflow must reach
      // completion before the test ends, or it starves later tests' time-skipping.
      await handle.signal(cancelAppointment);
      await handle.result();
    });
    expect(calls).toContain('appointment:CONFIRMED');
    expect(calls).not.toContain('appointment:NO_RESPONSE');
    expect(calls).toContain('cancelReminder:CONFIRMATION_REMINDER');
  });

  it('does not act on a completion signal before the appointment time actually arrives', async () => {
    const calls: string[] = [];
    const activities = baseActivities(calls);
    const { worker, handle } = await startWorkflow(activities, 30 * 3_600_000);
    await worker.runUntil(async () => {
      await env.sleep('1 second');
      await handle.signal(confirmAppointment);
      await env.sleep('1 second');
      // Signalled hours before the appointment time (still well before the
      // 2h upcoming-reminder mark) — must not be acted on yet.
      await handle.signal(markAppointmentCompleted);
      await env.sleep('1 second');
      const state = await handle.query(appointmentStateQuery);
      expect(state.appointmentStatus).toBe('CONFIRMED');
      // See the note in the first test: drive this Workflow to completion
      // rather than leaving it open for the rest of the suite.
      await handle.signal(cancelAppointment);
      await handle.result();
    });
    expect(calls).not.toContain('appointment:COMPLETED');
  });

  it('a cancel racing a confirm at the same instant wins (signal precedence)', async () => {
    const calls: string[] = [];
    const activities = baseActivities(calls);
    const { worker, handle } = await startWorkflow(activities, 30 * 3_600_000);
    await worker.runUntil(async () => {
      await env.sleep('1 second');
      await handle.signal(confirmAppointment);
      await handle.signal(cancelAppointment);
      const result = await handle.result();
      expect(result.appointmentStatus).toBe('CANCELLED');
    });
  });

  it('an exhausted reminder-send failure does not change the appointment status or crash the workflow (test 25)', async () => {
    const calls: string[] = [];
    const activities = baseActivities(calls);
    activities.sendReminder = async ({ type }) => {
      calls.push(`sendReminder:${type}`);
      throw new Error('provider permanently down');
    };
    const { worker, handle } = await startWorkflow(activities, 30 * 3_600_000);
    await worker.runUntil(async () => {
      await env.sleep('7 hours');
      const state = await handle.query(appointmentStateQuery);
      // The send failed, but the appointment must remain BOOKED, not error out.
      expect(state.appointmentStatus).toBe('BOOKED');
      // See the note in the first test: drive this Workflow to completion
      // rather than leaving it open for the rest of the suite.
      await handle.signal(cancelAppointment);
      await handle.result();
    });
    expect(calls).toContain('sendReminder:CONFIRMATION_REMINDER');
  });
});
