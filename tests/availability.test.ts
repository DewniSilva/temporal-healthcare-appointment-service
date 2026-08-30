import { afterEach, describe, expect, it, vi } from 'vitest';
import { appointmentConflictsWithException, computeAvailableSlots, computeDaySlots, isSlotAvailable } from '../src/shared/scheduling/availability';
import { calendarDateDayOfWeek, zonedWallClockToUtc } from '../src/shared/scheduling/timezone';
import type { AvailabilityInput } from '../src/shared/scheduling/availability.types';

const TZ = 'Asia/Colombo'; // fixed UTC+05:30, no DST
const MONDAY = '2026-09-14';

function base(overrides: Partial<AvailabilityInput> = {}): AvailabilityInput {
  return {
    date: MONDAY,
    timeZone: TZ,
    durationMinutes: 30,
    recurringWindows: [{ startTime: '08:00', endTime: '12:00' }],
    exception: null,
    clinicClosed: false,
    blockingIntervals: [],
    ...overrides
  };
}

describe('computeAvailableSlots', () => {
  it('generates 30-minute candidates across a normal working-hours window (test 1)', () => {
    const slots = computeAvailableSlots(base());
    expect(slots.map((s) => s.startAt)).toEqual([
      '2026-09-14T02:30:00.000Z', '2026-09-14T03:00:00.000Z', '2026-09-14T03:30:00.000Z', '2026-09-14T04:00:00.000Z',
      '2026-09-14T04:30:00.000Z', '2026-09-14T05:00:00.000Z', '2026-09-14T05:30:00.000Z', '2026-09-14T06:00:00.000Z'
    ]); // 08:00, 08:30, ... 11:30 Colombo time
  });

  it('handles multiple windows on one day, e.g. a lunch split (test 2)', () => {
    const slots = computeAvailableSlots(base({ recurringWindows: [{ startTime: '08:00', endTime: '12:00' }, { startTime: '13:00', endTime: '17:00' }] }));
    expect(slots).toHaveLength(8 + 8);
  });

  it('produces no slots on a day the doctor is fully UNAVAILABLE (test 3)', () => {
    const slots = computeAvailableSlots(base({ exception: { type: 'UNAVAILABLE', startTime: null, endTime: null } }));
    expect(slots).toEqual([]);
  });

  it('replaces the recurring schedule with CUSTOM_HOURS for that date (test 4)', () => {
    const slots = computeAvailableSlots(base({ exception: { type: 'CUSTOM_HOURS', startTime: '10:00', endTime: '11:00' } }));
    expect(slots.map((s) => s.startAt)).toEqual(['2026-09-14T04:30:00.000Z', '2026-09-14T05:00:00.000Z']); // 10:00, 10:30 Colombo
  });

  it('blocks all availability on a clinic holiday regardless of doctor schedule (test 5)', () => {
    const slots = computeAvailableSlots(base({ clinicClosed: true }));
    expect(slots).toEqual([]);
  });

  it('removes slots overlapped by an existing appointment/reservation (test 6)', () => {
    const nineThirty = zonedWallClockToUtc(MONDAY, '09:30', TZ).toISOString();
    const ten = zonedWallClockToUtc(MONDAY, '10:00', TZ).toISOString();
    const slots = computeAvailableSlots(base({ blockingIntervals: [{ startAt: nineThirty, endAt: ten }] }));
    expect(slots.some((s) => s.startAt === nineThirty)).toBe(false);
    expect(slots).toHaveLength(7);
  });

  it('reproduces the spec worked example exactly: recurring 08:00-12:00, a booked 09:30-10:00, and a partial-day UNAVAILABLE 10:30-11:30', () => {
    const at = (time: string) => zonedWallClockToUtc(MONDAY, time, TZ).toISOString();
    const slots = computeAvailableSlots(base({
      blockingIntervals: [{ startAt: at('09:30'), endAt: at('10:00') }],
      exception: { type: 'UNAVAILABLE', startTime: '10:30', endTime: '11:30' }
    }));
    expect(slots.map((s) => s.startAt)).toEqual([at('08:00'), at('08:30'), at('09:00'), at('10:00'), at('11:30')]);
  });

  it('never returns a slot whose full duration does not fit inside the window', () => {
    const slots = computeAvailableSlots(base({ recurringWindows: [{ startTime: '08:00', endTime: '08:45' }], durationMinutes: 30 }));
    expect(slots).toHaveLength(1); // only 08:00-08:30; 08:30-09:00 would spill past 08:45
  });

  it('isSlotAvailable matches a candidate slot and rejects an occupied one', () => {
    const nineThirty = zonedWallClockToUtc(MONDAY, '09:30', TZ).toISOString();
    const ten = zonedWallClockToUtc(MONDAY, '10:00', TZ).toISOString();
    const input = base({ blockingIntervals: [{ startAt: nineThirty, endAt: ten }] });
    expect(isSlotAvailable(zonedWallClockToUtc(MONDAY, '08:00', TZ).toISOString(), input)).toBe(true);
    expect(isSlotAvailable(nineThirty, input)).toBe(false);
  });
});

describe('computeDaySlots (full-day view: booked/past slots stay visible but non-bookable)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps a reservation-overlapped candidate visible, tagged RESERVED, rather than dropping it', () => {
    const nineThirty = zonedWallClockToUtc(MONDAY, '09:30', TZ).toISOString();
    const ten = zonedWallClockToUtc(MONDAY, '10:00', TZ).toISOString();
    const slots = computeDaySlots(base({ blockingIntervals: [{ startAt: nineThirty, endAt: ten }] }));
    expect(slots).toHaveLength(8); // all 8 candidates still present
    expect(slots.find((s) => s.startAt === nineThirty)?.status).toBe('RESERVED');
  });

  it('omits a slot blocked by a partial-day UNAVAILABLE exception entirely — it was never "scheduled" that day', () => {
    const slots = computeDaySlots(base({ exception: { type: 'UNAVAILABLE', startTime: '10:30', endTime: '11:30' } }));
    expect(slots).toHaveLength(6); // 8 candidates minus the two the exception blocks (10:30, 11:00)
    expect(slots.some((s) => s.startAt === zonedWallClockToUtc(MONDAY, '10:30', TZ).toISOString())).toBe(false);
  });

  it('yields no candidates at all on a whole-day exception or a clinic closure, same as computeAvailableSlots', () => {
    expect(computeDaySlots(base({ exception: { type: 'UNAVAILABLE', startTime: null, endTime: null } }))).toEqual([]);
    expect(computeDaySlots(base({ clinicClosed: true }))).toEqual([]);
  });

  it('tags a candidate whose start time has already passed as PAST, and leaves later ones AVAILABLE', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-14T05:00:00.000Z')); // 10:30 Colombo
    const slots = computeDaySlots(base());
    const eight = slots.find((s) => s.startAt === zonedWallClockToUtc(MONDAY, '08:00', TZ).toISOString());
    const eleven = slots.find((s) => s.startAt === zonedWallClockToUtc(MONDAY, '11:00', TZ).toISOString());
    expect(eight?.status).toBe('PAST');
    expect(eleven?.status).toBe('AVAILABLE');
  });

  it('computeAvailableSlots keeps returning only the AVAILABLE subset — unchanged by adding computeDaySlots', () => {
    const nineThirty = zonedWallClockToUtc(MONDAY, '09:30', TZ).toISOString();
    const ten = zonedWallClockToUtc(MONDAY, '10:00', TZ).toISOString();
    const slots = computeAvailableSlots(base({ blockingIntervals: [{ startAt: nineThirty, endAt: ten }] }));
    expect(slots).toHaveLength(7);
    expect(slots.some((s) => s.startAt === nineThirty)).toBe(false);
  });
});

describe('appointmentConflictsWithException (test 10: schedule changes must not silently affect existing appointments)', () => {
  const nine = zonedWallClockToUtc(MONDAY, '09:00', TZ);
  const three = zonedWallClockToUtc(MONDAY, '15:00', TZ);

  it('flags every appointment on a whole-day UNAVAILABLE exception', () => {
    const exception = { type: 'UNAVAILABLE' as const, startTime: null, endTime: null };
    expect(appointmentConflictsWithException(nine, exception, MONDAY, TZ)).toBe(true);
    expect(appointmentConflictsWithException(three, exception, MONDAY, TZ)).toBe(true);
  });

  it('flags only appointments inside a partial-day UNAVAILABLE window, leaving the rest of the day\'s bookings untouched', () => {
    const exception = { type: 'UNAVAILABLE' as const, startTime: '10:00', endTime: '12:00' };
    const inside = zonedWallClockToUtc(MONDAY, '10:30', TZ);
    expect(appointmentConflictsWithException(inside, exception, MONDAY, TZ)).toBe(true);
    expect(appointmentConflictsWithException(nine, exception, MONDAY, TZ)).toBe(false);
  });

  it('flags an existing appointment that now falls outside newly-set CUSTOM_HOURS', () => {
    const exception = { type: 'CUSTOM_HOURS' as const, startTime: '13:00', endTime: '17:00' };
    // A patient's existing 9am booking is not inside the doctor's new 1-5pm hours.
    expect(appointmentConflictsWithException(nine, exception, MONDAY, TZ)).toBe(true);
    expect(appointmentConflictsWithException(three, exception, MONDAY, TZ)).toBe(false);
  });
});

describe('zonedWallClockToUtc / calendarDateDayOfWeek (timezone boundary sanity, test 11)', () => {
  it('converts a Colombo (UTC+05:30) wall-clock time to the correct UTC instant', () => {
    expect(zonedWallClockToUtc(MONDAY, '08:00', TZ).toISOString()).toBe('2026-09-14T02:30:00.000Z');
    // Just after local midnight: still the same calendar date locally, but the previous UTC calendar day.
    expect(zonedWallClockToUtc(MONDAY, '00:15', TZ).toISOString()).toBe('2026-09-13T18:45:00.000Z');
  });

  it('derives the correct weekday from a plain calendar date regardless of timezone', () => {
    expect(calendarDateDayOfWeek(MONDAY)).toBe(1); // Monday
  });
});
