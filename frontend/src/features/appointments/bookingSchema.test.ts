import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bookingFormSchema } from './bookingSchema';

function futureDateParts(hoursFromNow: number): { date: string; time: string } {
  const future = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}`,
    time: `${pad(future.getHours())}:${pad(future.getMinutes())}`
  };
}

describe('bookingFormSchema', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-27T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('accepts valid IDs and a future date/time', () => {
    const result = bookingFormSchema.safeParse({
      patientId: 'patient-001',
      doctorId: 'doctor-001',
      ...futureDateParts(48)
    });
    expect(result.success).toBe(true);
  });

  it('rejects a past date/time', () => {
    const result = bookingFormSchema.safeParse({
      patientId: 'patient-001',
      doctorId: 'doctor-001',
      date: '2020-01-01',
      time: '09:00'
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('time'))).toBe(true);
    }
  });

  it('rejects patient/doctor IDs with unsupported characters', () => {
    const result = bookingFormSchema.safeParse({
      patientId: 'patient 001!',
      doctorId: 'doctor-001',
      ...futureDateParts(24)
    });
    expect(result.success).toBe(false);
  });

  it('rejects IDs that are too short', () => {
    const result = bookingFormSchema.safeParse({
      patientId: 'ab',
      doctorId: 'doctor-001',
      ...futureDateParts(24)
    });
    expect(result.success).toBe(false);
  });
});
